import type {
  CommentOnIssueTaskToolInput,
  CommentOnIssueTaskToolResult,
  InspectIssueToolInput,
  InspectIssueToolResult,
  IssueWorkspaceSurface,
  ListMyIssueTasksInput,
  ListMyIssueTasksToolResult,
  ReadIssueHistoryInput,
  ReadIssueHistoryToolResult,
  RepositoryFailure,
  RepositoryToolName,
  SubmitIssueTaskResultToolInput,
  SubmitIssueTaskResultToolResult,
  WaitForMyIssueTasksInput,
  WaitForMyIssueTasksToolResult,
} from "../repository/contracts";
import { reconcileIssueSurface } from "../repository/surface-reconciliation";
import { repositoryAbortError } from "./repository-activity-signal";
import { getRepositoryWebMCPToolDefinition } from "./repository-catalog";
import type {
  MutableRepositoryWebMCPRuntimeRef,
  RepositoryWebMCPRuntimeDependencies,
} from "./repository-types";
import type { WebMCPExecutionOptionsLike } from "./types";
import { validateToolInput } from "./validation";

export interface CapturedRepositoryCallbackContext {
  documentId: string;
  protocolVersion: 4;
  sessionInstanceId: string;
  pageSessionId: string;
  agentSessionToken: string;
  selfMemberId: string;
}

export function captureRepositoryCallbackContext(
  latest: MutableRepositoryWebMCPRuntimeRef,
): CapturedRepositoryCallbackContext {
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
    throw new Error("Repository tools must return JSON-serializable results.");
  }
  return JSON.parse(serialized) as T;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw repositoryAbortError(signal);
}

function invalidInput(message: string): RepositoryFailure {
  return {
    ok: false,
    code: "INVALID_INPUT",
    message,
    retryable: false,
    nextAction: "Correct the tool input and retry.",
  };
}

function stalePageContext(): RepositoryFailure {
  return {
    ok: false,
    code: "STALE_PAGE_CONTEXT",
    message:
      "The page moved to a different issue or browser session. Refresh WebMCP tools before retrying.",
    retryable: false,
    nextAction: "Refresh WebMCP tools in the current issue.",
  };
}

function duplicateWait(): RepositoryFailure {
  return {
    ok: false,
    code: "WAIT_ALREADY_ACTIVE",
    message: "This page and delegated agent already have an active task wait.",
    retryable: true,
    nextAction: "Await or abort the active wait before starting another.",
  };
}

function pageContextChanged(
  captured: CapturedRepositoryCallbackContext,
  latest: MutableRepositoryWebMCPRuntimeRef,
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
  incoming: IssueWorkspaceSurface,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
): IssueWorkspaceSurface | null {
  if (
    incoming.document.id !== captured.documentId ||
    incoming.document.protocolVersion !== captured.protocolVersion
  ) {
    return null;
  }
  const reconciled = reconcileIssueSurface(
    dependencies.latest.current.surface,
    incoming,
  );
  dependencies.latest.current = {
    ...dependencies.latest.current,
    surface: reconciled,
  };
  dependencies.activitySignal.observe(reconciled.document.activityVersion);
  dependencies.onAuthoritativeSurface?.(reconciled);
  return reconciled;
}

async function inspectSurface(
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
) {
  const result = await dependencies.service.inspect(
    captured.agentSessionToken,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!result.ok) return result;
  const surface = acceptAuthoritativeSurface(result.data, captured, dependencies);
  return surface ? { ok: true as const, data: surface } : stalePageContext();
}

async function executeInspectDocument(
  input: InspectIssueToolInput,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<InspectIssueToolResult> {
  const surfaceResult = await inspectSurface(captured, dependencies, signal);
  if (!surfaceResult.ok) return surfaceResult;
  const surface = surfaceResult.data;
  if (input.revision === undefined || input.revision === surface.document.revision) {
    return {
      ok: true,
      document: surface.document,
      currentRevision: surface.document.revision,
      currentActivityVersion: surface.document.activityVersion,
      collaborators: surface.presence,
      tasks: surface.tasks,
    };
  }
  const revision = await dependencies.service.readRevision(
    captured.agentSessionToken,
    input.revision,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!revision.ok) return revision;
  return {
    ok: true,
    document: revision.data,
    currentRevision: surface.document.revision,
    currentActivityVersion: surface.document.activityVersion,
    collaborators: surface.presence,
    tasks: surface.tasks,
  };
}

async function executeReadHistory(
  input: ReadIssueHistoryInput,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ReadIssueHistoryToolResult> {
  const result = await dependencies.service.readHistory(
    captured.agentSessionToken,
    input,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!result.ok) return result;
  dependencies.activitySignal.observe(result.data.currentActivityVersion);
  return { ok: true, ...result.data };
}

async function executeListMyTasks(
  input: ListMyIssueTasksInput,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ListMyIssueTasksToolResult> {
  const result = await dependencies.service.listMyTasks(
    captured.agentSessionToken,
    input,
    captured.pageSessionId,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!result.ok) return result;
  dependencies.activitySignal.observe(result.data.activityVersion);
  return { ok: true, ...result.data };
}

function waitKey(captured: CapturedRepositoryCallbackContext): string {
  return JSON.stringify([captured.pageSessionId, captured.selfMemberId]);
}

async function executeWaitForMyTasks(
  input: WaitForMyIssueTasksInput,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<WaitForMyIssueTasksToolResult> {
  const key = waitKey(captured);
  if (dependencies.activeWaitKeys.has(key)) return duplicateWait();
  dependencies.activeWaitKeys.add(key);
  dependencies.onToolExecutionChange?.("wait_for_my_tasks");
  try {
    const result = await dependencies.service.waitForMyTasks(
      captured.agentSessionToken,
      input,
      captured.pageSessionId,
      signal,
    );
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
    if (!result.ok) return result;
    dependencies.activitySignal.observe(result.data.activityVersion);
    return { ok: true, ...result.data };
  } finally {
    dependencies.activeWaitKeys.delete(key);
    dependencies.onToolExecutionChange?.(null);
  }
}

async function refreshAfterMutation(
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<void> {
  const refreshed = await dependencies.service.inspect(
    captured.agentSessionToken,
    signal,
  );
  throwIfAborted(signal);
  if (
    refreshed.ok &&
    !pageContextChanged(captured, dependencies.latest)
  ) {
    acceptAuthoritativeSurface(refreshed.data, captured, dependencies);
  }
}

async function executeCommentOnTask(
  input: CommentOnIssueTaskToolInput,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<CommentOnIssueTaskToolResult> {
  dependencies.onToolExecutionChange?.("comment_on_task");
  try {
    const result = await dependencies.service.commentOnTask(
      captured.agentSessionToken,
      input,
      captured.pageSessionId,
      signal,
    );
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
    if (!result.ok) return result;
    dependencies.activitySignal.observe(result.data.activityVersion);
    await refreshAfterMutation(captured, dependencies, signal);
    return { ok: true, ...result.data };
  } finally {
    dependencies.onToolExecutionChange?.(null);
  }
}

async function executeSubmitTaskResult(
  input: SubmitIssueTaskResultToolInput,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<SubmitIssueTaskResultToolResult> {
  dependencies.onToolExecutionChange?.("submit_task_result");
  try {
    const result = await dependencies.service.submitTaskResult(
      captured.agentSessionToken,
      input,
      captured.pageSessionId,
      signal,
    );
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
    if (!result.ok) return result;
    dependencies.activitySignal.observe(result.data.activityVersion);
    await refreshAfterMutation(captured, dependencies, signal);
    return { ok: true, ...result.data };
  } finally {
    dependencies.onToolExecutionChange?.(null);
  }
}

export function createRepositoryToolCallback(
  name: RepositoryToolName,
  captured: CapturedRepositoryCallbackContext,
  dependencies: RepositoryWebMCPRuntimeDependencies,
): (input: unknown, options?: WebMCPExecutionOptionsLike) => Promise<unknown> {
  return async (input, options) => {
    const signal = options?.signal;
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) {
      return normalizeJson(stalePageContext());
    }

    const definition = getRepositoryWebMCPToolDefinition(name);
    const validated = validateToolInput(definition.inputSchema, input);
    if (!validated.ok) return normalizeJson(invalidInput(validated.message));

    let result:
      | InspectIssueToolResult
      | ReadIssueHistoryToolResult
      | ListMyIssueTasksToolResult
      | WaitForMyIssueTasksToolResult
      | CommentOnIssueTaskToolResult
      | SubmitIssueTaskResultToolResult;
    switch (name) {
      case "inspect_document":
        result = await executeInspectDocument(
          validated.value as InspectIssueToolInput,
          captured,
          dependencies,
          signal,
        );
        break;
      case "read_document_history":
        result = await executeReadHistory(
          validated.value as ReadIssueHistoryInput,
          captured,
          dependencies,
          signal,
        );
        break;
      case "list_my_tasks":
        result = await executeListMyTasks(
          validated.value as ListMyIssueTasksInput,
          captured,
          dependencies,
          signal,
        );
        break;
      case "wait_for_my_tasks":
        result = await executeWaitForMyTasks(
          validated.value as unknown as WaitForMyIssueTasksInput,
          captured,
          dependencies,
          signal,
        );
        break;
      case "comment_on_task":
        result = await executeCommentOnTask(
          validated.value as unknown as CommentOnIssueTaskToolInput,
          captured,
          dependencies,
          signal,
        );
        break;
      case "submit_task_result":
        result = await executeSubmitTaskResult(
          validated.value as unknown as SubmitIssueTaskResultToolInput,
          captured,
          dependencies,
          signal,
        );
        break;
    }
    return normalizeJson(result);
  };
}
