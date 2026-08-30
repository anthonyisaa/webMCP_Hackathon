import { compileCapabilities, summarizeCapabilities } from "../capabilities/compiler";
import type {
  CompareOptionsInput,
  ErrorResult,
  MutationToolName,
  PageSelection,
  SuccessResult,
  ToolName,
  WebMCPToolInputMap,
  WebMCPToolSuccessDataMap,
  WorkspaceView,
} from "../contracts/index";
import { getWebMCPToolDefinition } from "./catalog";
import type {
  MutableWebMCPRuntimeRef,
  WebMCPExecutionOptionsLike,
  WebMCPRuntimeDependencies,
} from "./types";
import { validateToolInput } from "./validation";

interface CapturedCallbackContext {
  contextEpoch: number;
  selection: PageSelection;
  memberSessionInstanceId: string;
  sessionToken: string;
  workspaceId: string;
  decisionId: string;
}

function selectionsEqual(left: PageSelection, right: PageSelection): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function currentError(
  latest: MutableWebMCPRuntimeRef,
  code: ErrorResult["code"],
  message: string,
  retryable: boolean,
  details: Partial<ErrorResult> = {},
): ErrorResult {
  const compiled = latest.current.compiled;
  return {
    ok: false,
    code,
    message,
    retryable,
    currentWorkspaceRevision: compiled.workspaceRevision,
    contextEpoch: compiled.contextEpoch,
    currentCapabilities: summarizeCapabilities(compiled),
    ...details,
  };
}

function success<T>(
  latest: MutableWebMCPRuntimeRef,
  data: T,
): SuccessResult<T> {
  const compiled = latest.current.compiled;
  return {
    ok: true,
    data,
    currentWorkspaceRevision: compiled.workspaceRevision,
    contextEpoch: compiled.contextEpoch,
    currentCapabilities: summarizeCapabilities(compiled),
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof DOMException && signal.reason.name === "AbortError") {
    throw signal.reason;
  }
  const message =
    typeof signal.reason === "string" ? signal.reason : "Tool execution cancelled";
  throw new DOMException(message, "AbortError");
}

function pageContextError(
  captured: CapturedCallbackContext,
  latest: MutableWebMCPRuntimeRef,
): ErrorResult | null {
  const current = latest.current;
  const pageContextChanged =
    captured.contextEpoch !== current.compiled.contextEpoch ||
    captured.memberSessionInstanceId !== current.memberSessionInstanceId ||
    captured.workspaceId !== current.workspace.id ||
    captured.decisionId !== current.workspace.decision.id ||
    !selectionsEqual(captured.selection, current.compiled.selection);

  if (!pageContextChanged) return null;
  return currentError(
    latest,
    "STALE_PAGE_CONTEXT",
    "The page member or selected target changed. Refresh WebMCP tools before retrying.",
    true,
    {
      expectedContextEpoch: captured.contextEpoch,
      actualContextEpoch: current.compiled.contextEpoch,
      nextAction: "Refresh WebMCP tools and retry in the current page context.",
    },
  );
}

function normalizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function acceptAuthoritativeWorkspace(
  workspace: WorkspaceView,
  dependencies: WebMCPRuntimeDependencies,
): void {
  const current = dependencies.latest.current;
  const compiled = compileCapabilities({
    state: workspace.decision.state,
    selection: current.compiled.selection,
    memberRole: current.memberRole,
    workspaceRevision: workspace.revision,
    contextEpoch: current.compiled.contextEpoch,
    readiness: workspace.readiness,
  });
  dependencies.latest.current = { ...current, workspace, compiled };
  dependencies.onAuthoritativeSnapshot?.(workspace, compiled);
}

function daysBetween(earlier: string, later: string): number {
  const milliseconds = Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`);
  return Number.isFinite(milliseconds) ? Math.round(milliseconds / 86_400_000) : 0;
}

function compareOptions(workspace: WorkspaceView, input: CompareOptionsInput) {
  const optionIds = input.optionIds ?? workspace.options.map((option) => option.id);
  const options = optionIds.map((id) => workspace.options.find((option) => option.id === id));
  if (options.some((option) => option === undefined)) return null;

  return {
    comparisons: options.map((option) => {
      if (!option) throw new Error("Option existence was checked before comparison.");
      const fits = option.totalEngineerDays <= workspace.decision.launchCapacityEngineerDays;
      const meetsDeadline = option.launchDate <= workspace.customer.usableExportDueDate;
      return {
        optionId: option.id,
        launchEngineerDays: option.totalEngineerDays,
        postLaunchEngineerDays: option.postLaunchEngineerDays,
        fitsCurrentLaunchCapacity: fits,
        meetsNorthstarDeadline: meetsDeadline,
        scheduleBufferDays: daysBetween(option.launchDate, workspace.customer.usableExportDueDate),
        tradeoffs: [
          fits
            ? "Fits the current launch capacity."
            : `Exceeds current launch capacity by ${option.totalEngineerDays - workspace.decision.launchCapacityEngineerDays} engineer-days.`,
          meetsDeadline
            ? "Meets Northstar's usable-export deadline."
            : "Misses Northstar's usable-export deadline.",
          option.summary,
        ],
      };
    }),
    currentRecommendationOptionId: workspace.decision.selectedOptionId,
  };
}

function mutationName(name: ToolName): name is MutationToolName {
  return (
    name === "recommend_option" ||
    name === "add_evidence" ||
    name === "challenge_option" ||
    name === "prepare_decision"
  );
}

async function executeRead(
  name: Exclude<ToolName, MutationToolName>,
  input: Record<string, unknown>,
  captured: CapturedCallbackContext,
  dependencies: WebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<unknown> {
  const { latest, service } = dependencies;

  const workspace = await service.inspect(captured.sessionToken, signal);
  throwIfAborted(signal);
  const changed = pageContextError(captured, latest);
  if (changed) return changed;
  acceptAuthoritativeWorkspace(workspace, dependencies);
  if (!latest.current.compiled.availableTools.includes(name)) {
    return currentError(
      latest,
      "NOT_AVAILABLE_IN_STATE",
      `${name} is not available in the authoritative decision state.`,
      true,
      { nextAction: "Refresh WebMCP tools and inspect the current decision." },
    );
  }

  switch (name) {
    case "why_not": {
      const action = input.action as "prepare_decision" | "ratify_decision";
      const unavailable = latest.current.compiled.unavailableActions.find(
        (candidate) => candidate.action === action,
      );
      return success(latest, {
        action,
        available: unavailable === undefined,
        unmetPredicates: unavailable ? [...unavailable.unmetPredicates] : [],
      });
    }
    case "inspect_decision":
      return success(latest, { workspace });
    case "inspect_selected_option": {
      if (captured.selection.kind !== "OPTION") {
        return currentError(latest, "STALE_PAGE_CONTEXT", "No option is selected.", true);
      }
      const option = workspace.options.find((candidate) => candidate.id === captured.selection.id);
      if (!option) {
        return currentError(latest, "NOT_FOUND", "The selected option no longer exists.", false);
      }
      return success(latest, {
        option,
        evidence: workspace.evidence.filter((item) => item.optionId === option.id),
        challenges: workspace.challenges.filter((item) => item.optionId === option.id),
      });
    }
    case "compare_options": {
      const comparison = compareOptions(workspace, input as CompareOptionsInput);
      return comparison
        ? success(latest, comparison)
        : currentError(latest, "NOT_FOUND", "One or more requested options do not exist.", false);
    }
    case "trace_decision":
      return success(latest, {
        events: workspace.provenance,
        preparedDecision: workspace.preparedDecision,
      });
    case "inspect_followup": {
      if (
        captured.selection.kind !== "FOLLOWUP" ||
        captured.selection.id !== workspace.followup.id
      ) {
        return currentError(latest, "STALE_PAGE_CONTEXT", "The selected follow-up changed.", true);
      }
      return success(latest, { followup: workspace.followup });
    }
  }
}

export function captureCallbackContext(latest: MutableWebMCPRuntimeRef): CapturedCallbackContext {
  const current = latest.current;
  return {
    contextEpoch: current.compiled.contextEpoch,
    selection: { ...current.compiled.selection },
    memberSessionInstanceId: current.memberSessionInstanceId,
    sessionToken: current.sessionToken,
    workspaceId: current.workspace.id,
    decisionId: current.workspace.decision.id,
  };
}

export function createToolCallback(
  name: ToolName,
  captured: CapturedCallbackContext,
  dependencies: WebMCPRuntimeDependencies,
): (input: unknown, options?: WebMCPExecutionOptionsLike) => Promise<unknown> {
  return async (input, options) => {
    const signal = options?.signal;
    throwIfAborted(signal);

    const contextError = pageContextError(captured, dependencies.latest);
    if (contextError) return normalizeJson(contextError);

    if (!dependencies.latest.current.compiled.availableTools.includes(name)) {
      return normalizeJson(
        currentError(
          dependencies.latest,
          "NOT_AVAILABLE_IN_STATE",
          `${name} is not available in the current decision state.`,
          true,
          { nextAction: "Refresh WebMCP tools and inspect the current decision." },
        ),
      );
    }

    const definition = getWebMCPToolDefinition(name);
    const validated = validateToolInput(definition.inputSchema ?? {}, input);
    if (!validated.ok) {
      return normalizeJson(
        currentError(dependencies.latest, "INVALID_INPUT", validated.message, false),
      );
    }

    if (mutationName(name)) {
      const envelope = validated.value as unknown as WebMCPToolInputMap[typeof name];
      if (envelope.contextEpoch !== dependencies.latest.current.compiled.contextEpoch) {
        return normalizeJson(
          currentError(
            dependencies.latest,
            "STALE_PAGE_CONTEXT",
            "The mutation contextEpoch does not match the current page context.",
            true,
            {
              expectedContextEpoch: envelope.contextEpoch,
              actualContextEpoch: dependencies.latest.current.compiled.contextEpoch,
              nextAction: "Refresh WebMCP tools and retry in the current page context.",
            },
          ),
        );
      }

      const result = await dependencies.service.mutateFromWebMCP({
        sessionToken: captured.sessionToken,
        toolName: name,
        envelope,
        capturedSelection: captured.selection,
        capturedContextEpoch: captured.contextEpoch,
        signal,
      });
      throwIfAborted(signal);
      return normalizeJson(result);
    }

    const result = await executeRead(
      name,
      validated.value,
      captured,
      dependencies,
      signal,
    );
    return normalizeJson(result);
  };
}

export type WebMCPReadSuccessData<T extends Exclude<ToolName, MutationToolName>> =
  WebMCPToolSuccessDataMap[T];
