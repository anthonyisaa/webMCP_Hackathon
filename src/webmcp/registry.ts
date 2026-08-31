import { summarizeCapabilities } from "../capabilities/compiler";
import {
  AGENT_COORDINATION_TOOL_NAMES,
  TOOL_NAMES,
  type AgentCoordinationToolName,
  type AgentEngagementMode,
  type AgentRegistryExecutionContext,
  type AgentRegistryProjection,
  type AgentToolDefinition,
  type AgentToolRegistryPort,
  type CatchUpData,
  type CoordinationResult,
  type JsonObjectSchema,
  type RegisteredToolName,
  type ToolName,
} from "../contracts/index";
import { ActivitySignalHub } from "./activity-signal-hub";
import { getWebMCPToolDefinition } from "./catalog";
import {
  AGENT_COORDINATION_TOOL_CATALOG,
  getAgentCoordinationToolDefinition,
} from "./coordination-catalog";
import { captureCallbackContext, createToolCallback } from "./executor";
import type { WebMCPRuntimeDependencies } from "./types";
import { validateToolInput } from "./validation";

export interface BrowserEngagementUpdate {
  mode: AgentEngagementMode;
  renew: boolean;
  rotatePageSession: boolean;
}

export interface AgentToolRegistryDependencies extends WebMCPRuntimeDependencies {
  activityHub: ActivitySignalHub;
  onBrowserEngagementUpdate?: (update: BrowserEngagementUpdate) => void;
  now?: () => number;
}

const FRESH_COORDINATION_NAMES = ["join_session", "catch_up"] as const;
const INVOKED_COORDINATION_NAMES = [
  "join_session",
  "catch_up",
  "get_state_brief",
  "get_thread",
  "get_inbox",
  "claim_agent_task",
  "resolve_task",
  "post_comment",
  "request_human_input",
] as const;
const AUTO_COORDINATION_NAMES = [
  "get_state_brief",
  "get_thread",
  "get_inbox",
  "claim_agent_task",
  "resolve_task",
  "post_comment",
  "request_human_input",
] as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

const DECISION_DEFINITIONS = new Map<ToolName, AgentToolDefinition>(
  TOOL_NAMES.map((name) => {
    const definition = getWebMCPToolDefinition(name);
    return [
      name,
      Object.freeze({
        name,
        description: definition.description,
        inputSchema: deepFreeze(
          JSON.parse(JSON.stringify(definition.inputSchema)) as JsonObjectSchema,
        ),
        annotations: Object.freeze({
          readOnlyHint: definition.annotations?.readOnlyHint === true,
          untrustedContentHint:
            definition.annotations?.untrustedContentHint === true,
        }),
      }) as unknown as AgentToolDefinition,
    ];
  }),
);

function isCoordinationTool(
  name: RegisteredToolName,
): name is AgentCoordinationToolName {
  return (AGENT_COORDINATION_TOOL_NAMES as readonly string[]).includes(name);
}

function trimStrings(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(trimStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        trimStrings(child),
      ]),
    );
  }
  return value;
}

function isSuccess(value: unknown): value is { ok: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === true
  );
}

function errorCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function coordinationInvalidInput(message: string): CoordinationResult<never> {
  return { ok: false, code: "INVALID_INPUT", message, retryable: false };
}

function coordinationUnavailable(name: string): CoordinationResult<never> {
  return {
    ok: false,
    code: "SESSION_CLOSED",
    message: `${name} is not available in the current agent engagement mode.`,
    retryable: true,
    nextAction: "Call catch_up for an invoked session or join_session for a live session.",
  };
}

function nativeDecisionUnavailable(
  name: ToolName,
  dependencies: AgentToolRegistryDependencies,
) {
  const compiled = dependencies.latest.current.compiled;
  return {
    ok: false as const,
    code: "NOT_AVAILABLE_IN_STATE" as const,
    message: `${name} is not available in the current agent engagement mode or decision state.`,
    retryable: true,
    currentWorkspaceRevision: compiled.workspaceRevision,
    contextEpoch: compiled.contextEpoch,
    currentCapabilities: summarizeCapabilities(compiled),
    nextAction: "Refresh the current agent tools and inspect the decision state.",
  };
}

function taskIdFromInput(input: Record<string, unknown>): string | undefined {
  return typeof input.taskId === "string" ? input.taskId : undefined;
}

function claimStoreKey(context: AgentRegistryExecutionContext): string {
  return `${context.caller}:${context.pageSessionId}`;
}

function stripPrivateClaimIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrivateClaimIds);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "claimId")
      .map(([key, child]) => [key, stripPrivateClaimIds(child)]),
  );
}

/**
 * The only decision-room tool registry. Both native WebMCP and the optional page
 * runner project and execute this same immutable catalog and handler set.
 */
export class AgentToolRegistry implements AgentToolRegistryPort {
  readonly #dependencies: AgentToolRegistryDependencies;
  readonly #claims = new Map<string, Map<string, string>>();

  constructor(dependencies: AgentToolRegistryDependencies) {
    this.#dependencies = dependencies;
  }

  availableDefinitions(
    projection: AgentRegistryProjection,
  ): readonly AgentToolDefinition[] {
    const coordinationNames =
      projection.caller === "AUTO_RUNNER"
        ? AUTO_COORDINATION_NAMES
        : projection.engagementMode === "FRESH"
          ? FRESH_COORDINATION_NAMES
          : projection.engagementMode === "INVOKED"
            ? INVOKED_COORDINATION_NAMES
            : AGENT_COORDINATION_TOOL_NAMES;

    const coordination = coordinationNames.map((name) =>
      getAgentCoordinationToolDefinition(name),
    );
    if (
      projection.caller === "BROWSER_AGENT" &&
      projection.engagementMode === "FRESH"
    ) {
      return coordination;
    }

    return [
      ...coordination,
      ...projection.decisionCapabilities.availableTools.map((name) => {
        const definition = DECISION_DEFINITIONS.get(name);
        if (!definition) throw new Error(`Missing immutable definition for ${name}.`);
        return definition;
      }),
    ];
  }

  async execute(
    name: RegisteredToolName,
    input: unknown,
    context: AgentRegistryExecutionContext,
    projection: AgentRegistryProjection,
  ): Promise<unknown> {
    if (context.caller !== projection.caller) {
      throw new Error("Registry caller and projection caller must match.");
    }
    if (context.signal?.aborted) {
      throw context.signal.reason instanceof DOMException &&
        context.signal.reason.name === "AbortError"
        ? context.signal.reason
        : new DOMException("Tool execution cancelled", "AbortError");
    }

    const available = this.availableDefinitions(projection).some(
      (definition) => definition.name === name,
    );
    if (!available) {
      return isCoordinationTool(name)
        ? coordinationUnavailable(name)
        : nativeDecisionUnavailable(name, this.#dependencies);
    }

    const definition = isCoordinationTool(name)
      ? getAgentCoordinationToolDefinition(name)
      : DECISION_DEFINITIONS.get(name);
    if (!definition) throw new Error(`Unknown registry tool ${name}.`);

    const normalizedInput = trimStrings(input);
    const validated = validateToolInput(
      definition.inputSchema as unknown as Record<string, unknown>,
      normalizedInput,
    );
    if (!validated.ok) {
      return isCoordinationTool(name)
        ? coordinationInvalidInput(validated.message)
        : this.#executeDecisionInvalid(name, validated.message);
    }

    const result = isCoordinationTool(name)
      ? await this.#executeCoordination(
          name,
          validated.value,
          this.#contextWithRetainedClaim(context, validated.value),
          projection,
        )
      : await this.#executeDecision(
          name,
          validated.value,
          context,
          projection,
        );

    this.#updateClaimContext(name, validated.value, context, result);
    this.#updateBrowserEngagement(name, definition, projection, result);
    return stripPrivateClaimIds(result);
  }

  #executeDecisionInvalid(name: ToolName, message: string) {
    const compiled = this.#dependencies.latest.current.compiled;
    return {
      ok: false as const,
      code: "INVALID_INPUT" as const,
      message,
      retryable: false,
      currentWorkspaceRevision: compiled.workspaceRevision,
      contextEpoch: compiled.contextEpoch,
      currentCapabilities: summarizeCapabilities(compiled),
    };
  }

  #executeDecision(
    name: ToolName,
    input: Record<string, unknown>,
    context: AgentRegistryExecutionContext,
    projection: AgentRegistryProjection,
  ): Promise<unknown> {
    return this.#executeDecisionWithSessionCheck(
      name,
      input,
      context,
      projection,
    );
  }

  async #executeDecisionWithSessionCheck(
    name: ToolName,
    input: Record<string, unknown>,
    context: AgentRegistryExecutionContext,
    projection: AgentRegistryProjection,
  ): Promise<unknown> {
    const definition = DECISION_DEFINITIONS.get(name);
    if (
      context.caller === "BROWSER_AGENT" &&
      definition?.annotations.readOnlyHint
    ) {
      // Decision reads use the legacy full-workspace inspection seam. First touch
      // the bound page session through the coordination route so server and local
      // lease renewal cannot diverge.
      const session = await this.#dependencies.service.catchUpAgentSession(
        context,
        { sinceCursor: this.#dependencies.latest.current.workspace.collaboration.cursor },
      );
      if (!session.ok || !session.data.sessionOpen) {
        return this.#decisionSessionFailure(
          name,
          session.ok ? "The page agent session is closed." : session.message,
        );
      }
    }

    const captured = captureCallbackContext(
      this.#dependencies.latest,
      projection.decisionCapabilities,
      context.agentSessionToken,
    );
    return createToolCallback(
      name,
      captured,
      this.#dependencies,
      context,
    )(input, { signal: context.signal });
  }

  #decisionSessionFailure(name: ToolName, message: string) {
    const compiled = this.#dependencies.latest.current.compiled;
    return {
      ok: false as const,
      code: "UNAUTHORIZED" as const,
      message: `${name} could not run: ${message}`,
      retryable: true,
      currentWorkspaceRevision: compiled.workspaceRevision,
      contextEpoch: compiled.contextEpoch,
      currentCapabilities: summarizeCapabilities(compiled),
      nextAction: "Call catch_up or join_session before retrying the decision read.",
    };
  }

  #executeCoordination(
    name: AgentCoordinationToolName,
    input: Record<string, unknown>,
    context: AgentRegistryExecutionContext,
    projection: AgentRegistryProjection,
  ): Promise<unknown> {
    const service = this.#dependencies.service;
    const selection = projection.decisionCapabilities.selection;
    switch (name) {
      case "join_session":
        return service.joinAgentSession(context, selection);
      case "wait_for_activity":
        return this.#waitForActivity(
          context,
          input as unknown as { cursor: string; timeoutSeconds?: number },
        );
      case "catch_up":
        return service.catchUpAgentSession(context, input);
      case "leave_session":
        return service.leaveAgentSession(context);
      case "get_state_brief":
        return service.getAgentStateBrief(context, selection);
      case "get_thread":
        return service.getAgentThread(context, input, selection);
      case "get_inbox":
        return service.getAgentInbox(context);
      case "claim_agent_task":
        return service.claimAgentTask(
          context,
          input as unknown as { taskId: string; requestId: string },
        );
      case "resolve_task":
        return service.resolveAgentTask(
          context,
          input as unknown as {
            taskId: string;
            requestId: string;
            outcome: string;
            resultLink?: string;
          },
        );
      case "post_comment":
        return service.postAgentComment(
          context,
          input as unknown as Parameters<typeof service.postAgentComment>[1],
        );
      case "request_human_input":
        return service.requestHumanInput(
          context,
          input as unknown as Parameters<typeof service.requestHumanInput>[1],
        );
    }
  }

  async #waitForActivity(
    context: AgentRegistryExecutionContext,
    input: { cursor: string; timeoutSeconds?: number },
  ): Promise<CoordinationResult<CatchUpData>> {
    const timeoutSeconds = Math.min(
      30,
      Math.max(1, Number.isInteger(input.timeoutSeconds) ? input.timeoutSeconds! : 20),
    );
    const now = this.#dependencies.now ?? Date.now;
    const deadline = now() + timeoutSeconds * 1_000;
    let cursor = input.cursor;
    let last: CoordinationResult<CatchUpData> | null = null;

    for (;;) {
      if (context.signal?.aborted) {
        throw context.signal.reason instanceof DOMException &&
          context.signal.reason.name === "AbortError"
          ? context.signal.reason
          : new DOMException("Activity wait cancelled", "AbortError");
      }

      const caughtUp = await this.#dependencies.service.catchUpAgentSession(
        context,
        { sinceCursor: cursor },
      );
      if (!caughtUp.ok) return caughtUp;
      last = caughtUp;
      this.#dependencies.activityHub.seed(caughtUp.data.observedHighWater);

      if (caughtUp.data.events.length > 0 || !caughtUp.data.sessionOpen) {
        return caughtUp;
      }

      const nextCursor = caughtUp.cursor;
      if (caughtUp.data.hasMore) {
        if (nextCursor === cursor) {
          return {
            ok: false,
            code: "INTERNAL_ERROR",
            message: "Catch-up did not advance its page boundary.",
            retryable: true,
            cursor,
          };
        }
        cursor = nextCursor;
        continue;
      }

      const remaining = deadline - now();
      if (remaining <= 0) {
        return {
          ...caughtUp,
          data: { ...caughtUp.data, events: [], hasMore: false },
        };
      }

      const changed = await this.#dependencies.activityHub.waitForChange(
        caughtUp.data.observedHighWater,
        remaining,
        context.signal,
      );
      if (changed === null) {
        return {
          ...(last ?? caughtUp),
          data: { ...caughtUp.data, events: [], hasMore: false },
        };
      }
      cursor = nextCursor;
    }
  }

  #contextWithRetainedClaim(
    context: AgentRegistryExecutionContext,
    input: Record<string, unknown>,
  ): AgentRegistryExecutionContext {
    if (context.claimId) return context;
    const taskId = taskIdFromInput(input);
    const claimId = taskId
      ? this.#claims.get(claimStoreKey(context))?.get(taskId)
      : undefined;
    return claimId ? { ...context, claimId } : context;
  }

  #updateClaimContext(
    name: RegisteredToolName,
    input: Record<string, unknown>,
    context: AgentRegistryExecutionContext,
    result: unknown,
  ): void {
    const key = claimStoreKey(context);
    const taskId = taskIdFromInput(input);
    if (name === "leave_session" && isSuccess(result)) {
      this.#claims.delete(key);
      return;
    }
    if (!taskId) return;

    if (name === "claim_agent_task" && isSuccess(result)) {
      const task = (result as {
        data?: { task?: { claim?: { claimId?: string; ownedByCurrentSession?: boolean } } };
      }).data?.task;
      const claimId = task?.claim?.ownedByCurrentSession
        ? task.claim.claimId
        : undefined;
      if (claimId) {
        const claims = this.#claims.get(key) ?? new Map<string, string>();
        claims.set(taskId, claimId);
        this.#claims.set(key, claims);
      }
      return;
    }

    if (
      (name === "resolve_task" || name === "request_human_input") &&
      isSuccess(result)
    ) {
      this.#claims.get(key)?.delete(taskId);
    } else if (
      errorCode(result) === "CLAIM_LOST" ||
      errorCode(result) === "SESSION_CLOSED"
    ) {
      this.#claims.get(key)?.delete(taskId);
    }
  }

  #updateBrowserEngagement(
    name: RegisteredToolName,
    definition: AgentToolDefinition,
    projection: AgentRegistryProjection,
    result: unknown,
  ): void {
    if (projection.caller !== "BROWSER_AGENT") return;
    if (errorCode(result) === "SESSION_CLOSED") {
      this.#dependencies.onBrowserEngagementUpdate?.({
        mode: "FRESH",
        renew: false,
        rotatePageSession: true,
      });
      return;
    }
    if (!isSuccess(result)) return;

    const sessionOpen = (result as { data?: { sessionOpen?: unknown } }).data
      ?.sessionOpen;
    if (sessionOpen === false) {
      this.#dependencies.onBrowserEngagementUpdate?.({
        mode: "FRESH",
        renew: false,
        rotatePageSession: true,
      });
      return;
    }

    if (name === "join_session") {
      this.#dependencies.onBrowserEngagementUpdate?.({
        mode: "LIVE",
        renew: true,
        rotatePageSession: false,
      });
    } else if (name === "leave_session") {
      this.#dependencies.onBrowserEngagementUpdate?.({
        mode: "FRESH",
        renew: false,
        rotatePageSession: true,
      });
    } else if (projection.engagementMode === "INVOKED") {
      this.#dependencies.onBrowserEngagementUpdate?.({
        mode: "INVOKED",
        renew: true,
        rotatePageSession: false,
      });
    } else if (
      projection.engagementMode === "FRESH" &&
      name === "catch_up"
    ) {
      this.#dependencies.onBrowserEngagementUpdate?.({
        mode: "INVOKED",
        renew: true,
        rotatePageSession: false,
      });
    } else if (
      projection.engagementMode === "LIVE" &&
      definition.annotations.readOnlyHint
    ) {
      this.#dependencies.onBrowserEngagementUpdate?.({
        mode: "LIVE",
        renew: true,
        rotatePageSession: false,
      });
    }
  }
}

export const IMMUTABLE_AGENT_COORDINATION_DEFINITIONS =
  AGENT_COORDINATION_TOOL_CATALOG;
