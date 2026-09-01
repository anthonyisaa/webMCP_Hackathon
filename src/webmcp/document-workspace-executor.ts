import type {
  DocumentSurfaceV3,
  DocumentV3Failure,
  InspectDocumentV3ToolResult,
  ListMyWorkOutcome,
  ListMyWorkToolResult,
  ReadDocumentMemoryInput,
  ReadDocumentMemoryToolResult,
  SubmitWorkProposalOutcome,
  SubmitWorkProposalServiceInput,
  SubmitWorkProposalToolInput,
  SubmitWorkProposalToolResult,
  WaitForMyWorkInput,
  WaitForMyWorkToolResult,
} from "../document/contracts";
import { reconcileDocumentWorkspaceSurface } from "../document/workspace-surface-reconciliation";
import { documentWorkspaceAbortError } from "./document-workspace-activity-signal";
import { getDocumentWorkspaceWebMCPToolDefinition } from "./document-workspace-catalog";
import type {
  DocumentWorkspaceToolName,
  DocumentWorkspaceWebMCPRuntimeDependencies,
  MutableDocumentWorkspaceWebMCPRuntimeRef,
} from "./document-workspace-types";
import type { WebMCPExecutionOptionsLike } from "./types";
import { validateToolInput } from "./validation";

export interface CapturedDocumentWorkspaceCallbackContext {
  documentId: string;
  protocolVersion: 3;
  sessionInstanceId: string;
  pageSessionId: string;
  agentSessionToken: string;
  selfMemberId: string;
}

export function captureDocumentWorkspaceCallbackContext(
  latest: MutableDocumentWorkspaceWebMCPRuntimeRef,
): CapturedDocumentWorkspaceCallbackContext {
  const current = latest.current;
  return {
    documentId: current.surface.document.id,
    protocolVersion: current.surface.document.protocolVersion,
    sessionInstanceId: current.sessionInstanceId,
    pageSessionId: current.pageSessionId,
    agentSessionToken: current.agentSessionToken,
    selfMemberId: current.selfMemberId,
  };
}

function normalizeJson<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Document workspace tools must return JSON-serializable results.");
  }
  return JSON.parse(serialized) as T;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw documentWorkspaceAbortError(signal);
}

function invalidInput(message: string): DocumentV3Failure {
  return {
    ok: false,
    code: "INVALID_INPUT",
    message,
    retryable: false,
    nextAction: "Correct the tool input and retry.",
  };
}

function stalePageContext(): DocumentV3Failure {
  return {
    ok: false,
    code: "STALE_PAGE_CONTEXT",
    message:
      "The page moved to a different document or browser session. Refresh WebMCP tools before retrying.",
    retryable: false,
    nextAction: "Refresh WebMCP tools in the current document.",
  };
}

function duplicateWait(): DocumentV3Failure {
  return {
    ok: false,
    code: "WAIT_ALREADY_ACTIVE",
    message: "This page and paired agent already have an active work wait.",
    retryable: true,
    nextAction: "Await or abort the active wait before starting another.",
  };
}

function pageContextChanged(
  captured: CapturedDocumentWorkspaceCallbackContext,
  latest: MutableDocumentWorkspaceWebMCPRuntimeRef,
): boolean {
  const current = latest.current;
  return (
    current.surface.document.id !== captured.documentId ||
    current.surface.document.protocolVersion !== captured.protocolVersion ||
    current.sessionInstanceId !== captured.sessionInstanceId ||
    current.pageSessionId !== captured.pageSessionId ||
    current.agentSessionToken !== captured.agentSessionToken ||
    current.selfMemberId !== captured.selfMemberId
  );
}

function acceptAuthoritativeSurface(
  surface: DocumentSurfaceV3,
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
): DocumentSurfaceV3 | null {
  if (
    surface.document.id !== captured.documentId ||
    surface.document.protocolVersion !== captured.protocolVersion
  ) {
    return null;
  }
  const reconciled = reconcileDocumentWorkspaceSurface(
    dependencies.latest.current.surface,
    surface,
  );
  dependencies.latest.current = {
    ...dependencies.latest.current,
    surface: reconciled,
  };
  dependencies.activitySignal.observe(reconciled.document.activityVersion);
  dependencies.onAuthoritativeSurface?.(reconciled);
  return reconciled;
}

async function inspectAuthoritativeSurface(
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
) {
  const result = await dependencies.service.inspect(
    captured.agentSessionToken,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!result.ok) return result;
  const reconciled = acceptAuthoritativeSurface(
    result.data,
    captured,
    dependencies,
  );
  return reconciled ? { ok: true as const, data: reconciled } : stalePageContext();
}

async function executeInspectDocument(
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<InspectDocumentV3ToolResult> {
  const result = await inspectAuthoritativeSurface(captured, dependencies, signal);
  if (!result.ok) return result;
  return {
    ok: true,
    document: result.data.document,
    collaborators: result.data.presence,
  };
}

async function executeReadDocumentMemory(
  input: ReadDocumentMemoryInput,
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ReadDocumentMemoryToolResult> {
  const result = await dependencies.service.readMemory(
    captured.agentSessionToken,
    input,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!result.ok) return result;
  dependencies.activitySignal.observe(result.data.latestActivityVersion);
  return { ok: true, ...result.data };
}

async function listMyWork(
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
) {
  const result = await dependencies.service.listMyWork(
    captured.agentSessionToken,
    captured.pageSessionId,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (result.ok) dependencies.activitySignal.observe(result.data.activityVersion);
  return result;
}

async function executeListMyWork(
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ListMyWorkToolResult> {
  const result = await listMyWork(captured, dependencies, signal);
  return result.ok ? { ok: true, ...result.data } : result;
}

function readyWaitResult(
  snapshot: ListMyWorkOutcome,
  afterRevision: number,
): WaitForMyWorkToolResult | null {
  if (snapshot.workOrders.length > 0) {
    return {
      ok: true,
      outcome: "WORK_AVAILABLE",
      workOrders: snapshot.workOrders,
      revision: snapshot.revision,
      activityVersion: snapshot.activityVersion,
    };
  }
  if (snapshot.revision > afterRevision) {
    return {
      ok: true,
      outcome: "DOCUMENT_CHANGED",
      workOrders: [],
      revision: snapshot.revision,
      activityVersion: snapshot.activityVersion,
    };
  }
  return null;
}

function waitKey(captured: CapturedDocumentWorkspaceCallbackContext): string {
  return JSON.stringify([captured.pageSessionId, captured.selfMemberId]);
}

function linkedIterationController(parent?: AbortSignal): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  if (!parent) return { controller, cleanup: () => undefined };
  if (parent.aborted) {
    controller.abort(documentWorkspaceAbortError(parent));
    return { controller, cleanup: () => undefined };
  }
  const onAbort = () => controller.abort(documentWorkspaceAbortError(parent));
  parent.addEventListener("abort", onAbort, { once: true });
  return {
    controller,
    cleanup: () => parent.removeEventListener("abort", onAbort),
  };
}

async function cancelIterationWait(
  controller: AbortController,
  pending: Promise<number | null>,
): Promise<void> {
  if (!controller.signal.aborted) {
    controller.abort(new DOMException("Wait iteration complete", "AbortError"));
  }
  try {
    await pending;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "AbortError") throw error;
  }
}

async function finalWaitResult(
  input: WaitForMyWorkInput,
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<WaitForMyWorkToolResult> {
  const finalSnapshot = await listMyWork(captured, dependencies, signal);
  if (!finalSnapshot.ok) return finalSnapshot;
  const ready = readyWaitResult(finalSnapshot.data, input.afterRevision);
  return ready ?? {
    ok: true,
    outcome: "TIMEOUT",
    workOrders: [],
    revision: finalSnapshot.data.revision,
    activityVersion: finalSnapshot.data.activityVersion,
  };
}

async function executeWaitForMyWork(
  input: WaitForMyWorkInput,
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<WaitForMyWorkToolResult> {
  const key = waitKey(captured);
  if (dependencies.activeWaitKeys.has(key)) return duplicateWait();
  dependencies.activeWaitKeys.add(key);
  dependencies.onToolExecutionChange?.("wait_for_my_work");

  const now = dependencies.now ?? Date.now;
  const timeoutSeconds = input.timeoutSeconds ?? 20;
  const deadline = now() + timeoutSeconds * 1_000;

  try {
    const initial = await listMyWork(captured, dependencies, signal);
    if (!initial.ok) return initial;
    if (
      input.afterRevision > initial.data.revision ||
      input.afterActivityVersion > initial.data.activityVersion
    ) {
      return invalidInput(
        "afterRevision and afterActivityVersion cannot be ahead of authoritative counters.",
      );
    }

    const immediate = readyWaitResult(initial.data, input.afterRevision);
    if (immediate) return immediate;
    let activityCursor = Math.max(
      input.afterActivityVersion,
      initial.data.activityVersion,
    );

    for (;;) {
      throwIfAborted(signal);
      const remaining = deadline - now();
      if (remaining <= 0) {
        return await finalWaitResult(input, captured, dependencies, signal);
      }

      const linked = linkedIterationController(signal);
      const pendingChange = dependencies.activitySignal.waitForChange(
        activityCursor,
        remaining,
        linked.controller.signal,
      );
      let listenerSettled = false;
      try {
        const refetched = await listMyWork(captured, dependencies, signal);
        if (!refetched.ok) {
          await cancelIterationWait(linked.controller, pendingChange);
          listenerSettled = true;
          return refetched;
        }
        activityCursor = Math.max(activityCursor, refetched.data.activityVersion);
        const ready = readyWaitResult(refetched.data, input.afterRevision);
        if (ready) {
          await cancelIterationWait(linked.controller, pendingChange);
          listenerSettled = true;
          return ready;
        }

        const changed = await pendingChange;
        listenerSettled = true;
        if (changed === null) {
          return await finalWaitResult(input, captured, dependencies, signal);
        }
        activityCursor = Math.max(activityCursor, changed);
      } finally {
        if (!listenerSettled) {
          await cancelIterationWait(linked.controller, pendingChange);
        }
        linked.cleanup();
      }
    }
  } finally {
    dependencies.activeWaitKeys.delete(key);
    dependencies.onToolExecutionChange?.(null);
  }
}

function projectProposalOutcome(
  outcome: SubmitWorkProposalOutcome,
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
): DocumentSurfaceV3 | null {
  const current = dependencies.latest.current.surface;
  if (outcome.document.id !== captured.documentId) return null;
  const workOrders = current.workOrders.some(
    (order) => order.workOrderId === outcome.workOrder.workOrderId,
  )
    ? current.workOrders.map((order) =>
        order.workOrderId === outcome.workOrder.workOrderId
          ? outcome.workOrder
          : order,
      )
    : [...current.workOrders, outcome.workOrder];
  const memory = current.memory.some(
    (event) => event.eventId === outcome.event.eventId,
  )
    ? current.memory
    : [...current.memory, outcome.event]
        .toSorted(
          (left, right) =>
            left.activityVersion - right.activityVersion ||
            left.eventId.localeCompare(right.eventId),
        )
        .slice(-20);
  return acceptAuthoritativeSurface(
    {
      ...current,
      document: outcome.document,
      workOrders,
      memory,
    },
    captured,
    dependencies,
  );
}

async function executeSubmitWorkProposal(
  input: SubmitWorkProposalToolInput,
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<SubmitWorkProposalToolResult> {
  dependencies.onToolExecutionChange?.("submit_work_proposal");
  try {
    const createRequestId =
      dependencies.createRequestId ?? (() => globalThis.crypto.randomUUID());
    const serviceInput: SubmitWorkProposalServiceInput = {
      ...input,
      requestId: createRequestId(),
    };
    const result = await dependencies.service.submitWorkProposal(
      captured.agentSessionToken,
      serviceInput,
      captured.pageSessionId,
      signal,
    );
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
    if (!result.ok) return result;
    if (!projectProposalOutcome(result.data, captured, dependencies)) {
      return stalePageContext();
    }
    // No abort check follows the projection: a late page teardown after the server
    // commits must not rewrite the authoritative outcome in this callback.
    return { ok: true, ...result.data };
  } finally {
    dependencies.onToolExecutionChange?.(null);
  }
}

export function createDocumentWorkspaceToolCallback(
  name: DocumentWorkspaceToolName,
  captured: CapturedDocumentWorkspaceCallbackContext,
  dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
): (input: unknown, options?: WebMCPExecutionOptionsLike) => Promise<unknown> {
  return async (input, options) => {
    const signal = options?.signal;
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) {
      return normalizeJson(stalePageContext());
    }

    const definition = getDocumentWorkspaceWebMCPToolDefinition(name);
    const validated = validateToolInput(definition.inputSchema ?? {}, input);
    if (!validated.ok) return normalizeJson(invalidInput(validated.message));

    let result:
      | InspectDocumentV3ToolResult
      | ReadDocumentMemoryToolResult
      | ListMyWorkToolResult
      | WaitForMyWorkToolResult
      | SubmitWorkProposalToolResult;
    switch (name) {
      case "inspect_document":
        result = await executeInspectDocument(captured, dependencies, signal);
        break;
      case "read_document_memory":
        result = await executeReadDocumentMemory(
          validated.value as ReadDocumentMemoryInput,
          captured,
          dependencies,
          signal,
        );
        break;
      case "list_my_work":
        result = await executeListMyWork(captured, dependencies, signal);
        break;
      case "wait_for_my_work":
        result = await executeWaitForMyWork(
          validated.value as unknown as WaitForMyWorkInput,
          captured,
          dependencies,
          signal,
        );
        break;
      case "submit_work_proposal":
        result = await executeSubmitWorkProposal(
          validated.value as unknown as SubmitWorkProposalToolInput,
          captured,
          dependencies,
          signal,
        );
        break;
    }
    return normalizeJson(result);
  };
}
