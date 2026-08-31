import type {
  ApplyAgentAnnotationInput,
  ApplyAgentAnnotationToolResult,
  DocumentFailure,
  DocumentResult,
  DocumentSurface,
  InspectDocumentToolResult,
  ListAgentAnnotationsToolResult,
} from "../document/contracts";
import { reconcileDocumentSurface } from "../document/surface-reconciliation";
import { getDocumentWebMCPToolDefinition } from "./document-catalog";
import type {
  DocumentWebMCPRuntimeDependencies,
  DocumentWebMCPToolName,
  MutableDocumentWebMCPRuntimeRef,
} from "./document-types";
import type { WebMCPExecutionOptionsLike } from "./types";
import { validateToolInput } from "./validation";

export interface CapturedDocumentCallbackContext {
  documentId: string;
  sessionInstanceId: string;
  agentSessionToken: string;
  selfMemberId: string;
}

export function captureDocumentCallbackContext(
  latest: MutableDocumentWebMCPRuntimeRef,
): CapturedDocumentCallbackContext {
  const current = latest.current;
  return {
    documentId: current.surface.document.id,
    sessionInstanceId: current.sessionInstanceId,
    agentSessionToken: current.agentSessionToken,
    selfMemberId: current.selfMemberId,
  };
}

function normalizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function stalePageContext(): DocumentFailure & { code: "STALE_PAGE_CONTEXT" } {
  return {
    ok: false,
    code: "STALE_PAGE_CONTEXT",
    message:
      "The page moved to a different document or browser session. Refresh WebMCP tools before retrying.",
    retryable: true,
    nextAction: "Refresh WebMCP tools in the current document and retry.",
  };
}

function invalidInput(message: string): DocumentFailure {
  return {
    ok: false,
    code: "INVALID_INPUT",
    message,
    retryable: false,
    nextAction: "Correct the tool input and retry.",
  };
}

function sanitizeAgentFacingFailure<
  T extends { ok: false; currentSurface?: DocumentSurface },
>(result: T, captured: CapturedDocumentCallbackContext): T {
  if (!result.currentSurface) return result;
  return {
    ...result,
    currentSurface: {
      ...result.currentSurface,
      annotations: result.currentSurface.annotations.filter(
        (annotation) => annotation.createdBy.memberId === captured.selfMemberId,
      ),
    },
  };
}

function pageContextChanged(
  captured: CapturedDocumentCallbackContext,
  latest: MutableDocumentWebMCPRuntimeRef,
): boolean {
  const current = latest.current;
  return (
    captured.documentId !== current.surface.document.id ||
    captured.sessionInstanceId !== current.sessionInstanceId ||
    captured.agentSessionToken !== current.agentSessionToken ||
    captured.selfMemberId !== current.selfMemberId
  );
}

function acceptAuthoritativeSurface(
  surface: DocumentSurface,
  captured: CapturedDocumentCallbackContext,
  dependencies: DocumentWebMCPRuntimeDependencies,
): DocumentSurface | null {
  if (surface.document.id !== captured.documentId) return null;
  const reconciled = reconcileDocumentSurface(
    dependencies.latest.current.surface,
    surface,
  );
  dependencies.latest.current = {
    ...dependencies.latest.current,
    surface: reconciled,
  };
  dependencies.onAuthoritativeSurface?.(reconciled);
  return reconciled;
}

function acceptFailureSurface(
  result: { currentSurface?: DocumentSurface },
  captured: CapturedDocumentCallbackContext,
  dependencies: DocumentWebMCPRuntimeDependencies,
): void {
  if (result.currentSurface) {
    acceptAuthoritativeSurface(result.currentSurface, captured, dependencies);
  }
}

async function inspectAuthoritativeSurface(
  captured: CapturedDocumentCallbackContext,
  dependencies: DocumentWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<DocumentResult<DocumentSurface> | DocumentFailure> {
  const result = await dependencies.service.inspect(captured.agentSessionToken, signal);
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!result.ok) {
    acceptFailureSurface(result, captured, dependencies);
    return result;
  }
  const reconciled = acceptAuthoritativeSurface(
    result.data,
    captured,
    dependencies,
  );
  if (!reconciled) {
    return stalePageContext();
  }
  return { ok: true, data: reconciled };
}

async function executeInspectDocument(
  captured: CapturedDocumentCallbackContext,
  dependencies: DocumentWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<InspectDocumentToolResult> {
  const result = await inspectAuthoritativeSurface(captured, dependencies, signal);
  if (!result.ok) return result;
  return {
    ok: true,
    document: result.data.document,
    presence: result.data.presence,
  };
}

async function executeListAgentAnnotations(
  captured: CapturedDocumentCallbackContext,
  dependencies: DocumentWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ListAgentAnnotationsToolResult> {
  const result = await dependencies.service.listAgentAnnotations(
    captured.agentSessionToken,
    signal,
  );
  throwIfAborted(signal);
  if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();
  if (!result.ok) {
    if (result.code === "UNAUTHORIZED") return { ...result, code: "UNAUTHORIZED" };
    if (result.code === "STALE_PAGE_CONTEXT") {
      return { ...result, code: "STALE_PAGE_CONTEXT" };
    }
    return {
      ok: false,
      code: "STALE_PAGE_CONTEXT",
      message: result.message,
      retryable: result.retryable,
      nextAction: result.nextAction,
    };
  }
  return { ok: true, annotations: result.data };
}

async function executeApplyAgentAnnotation(
  input: ApplyAgentAnnotationInput,
  captured: CapturedDocumentCallbackContext,
  dependencies: DocumentWebMCPRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ApplyAgentAnnotationToolResult> {
  dependencies.onToolExecutionChange?.("apply_agent_annotation");
  try {
    const result = await dependencies.service.applyAgentAnnotation(
      captured.agentSessionToken,
      input,
      signal,
    );
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();

    // Idempotent replays intentionally return their original ledgered outcome. Always
    // refresh the live page from a separate authoritative read so an old replay surface
    // cannot resurrect annotations that were completed by later same-revision no-ops.
    const refreshed = await inspectAuthoritativeSurface(captured, dependencies, signal);
    if (!refreshed.ok && refreshed.code === "STALE_PAGE_CONTEXT") {
      return refreshed;
    }
    if (pageContextChanged(captured, dependencies.latest)) return stalePageContext();

    if (!result.ok) return result;
    if (result.data.surface.document.id !== captured.documentId) {
      return stalePageContext();
    }
    return {
      ok: true,
      document: result.data.surface.document,
      annotation: result.data.annotation,
      change: result.data.change,
      undoAvailable: result.data.undoAvailable,
    };
  } finally {
    dependencies.onToolExecutionChange?.(null);
  }
}

export function createDocumentToolCallback(
  name: DocumentWebMCPToolName,
  captured: CapturedDocumentCallbackContext,
  dependencies: DocumentWebMCPRuntimeDependencies,
): (input: unknown, options?: WebMCPExecutionOptionsLike) => Promise<unknown> {
  return async (input, options) => {
    const signal = options?.signal;
    throwIfAborted(signal);
    if (pageContextChanged(captured, dependencies.latest)) {
      return normalizeJson(stalePageContext());
    }

    const definition = getDocumentWebMCPToolDefinition(name);
    const validated = validateToolInput(definition.inputSchema ?? {}, input);
    if (!validated.ok) return normalizeJson(invalidInput(validated.message));

    let result:
      | InspectDocumentToolResult
      | ListAgentAnnotationsToolResult
      | ApplyAgentAnnotationToolResult;
    if (name === "inspect_document") {
      result = await executeInspectDocument(captured, dependencies, signal);
    } else if (name === "list_agent_annotations") {
      result = await executeListAgentAnnotations(captured, dependencies, signal);
    } else {
      result = await executeApplyAgentAnnotation(
        validated.value as unknown as ApplyAgentAnnotationInput,
        captured,
        dependencies,
        signal,
      );
    }
    const agentFacingResult = result.ok
      ? result
      : sanitizeAgentFacingFailure(result, captured);
    return normalizeJson(agentFacingResult);
  };
}
