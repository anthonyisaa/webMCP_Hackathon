import type {
  ApplyAgentAnnotationInput,
  ApplyAgentAnnotationOutcome,
  CancelDocumentAnnotationInput,
  CreateDocumentAnnotationInput,
  DocumentResult,
  DocumentServicePort,
  DocumentSessionBundle,
  DocumentSurface,
  JoinDocumentInput,
  LaunchDocumentInput,
  PendingDocumentAnnotation,
  SaveDocumentInput,
  SetDocumentStageInput,
  TouchDocumentPresenceInput,
  UndoAgentEditInput,
} from "@/document/contracts";

function authorizationHeaders(sessionToken: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${sessionToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function readDocumentResult<T>(response: Response): Promise<DocumentResult<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`The document service returned status ${response.status}.`);
  }
  return (await response.json()) as DocumentResult<T>;
}

async function publicPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<DocumentResult<T>> {
  return readDocumentResult<T>(
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    }),
  );
}

async function authenticatedRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  sessionToken: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<DocumentResult<T>> {
  return readDocumentResult<T>(
    await fetch(path, {
      method,
      headers: authorizationHeaders(sessionToken, body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal,
    }),
  );
}

export class DocumentHttpService implements DocumentServicePort {
  launch(
    input: LaunchDocumentInput = {},
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>> {
    return publicPost("/api/documents", input, signal);
  }

  join(
    input: JoinDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>> {
    return publicPost("/api/documents/join", input, signal);
  }

  inspect(sessionToken: string, signal?: AbortSignal): Promise<DocumentResult<DocumentSurface>> {
    return authenticatedRequest("/api/document", "GET", sessionToken, undefined, signal);
  }

  listAgentAnnotations(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentResult<PendingDocumentAnnotation[]>> {
    return authenticatedRequest("/api/document/action", "GET", sessionToken, undefined, signal);
  }

  saveHuman(
    sessionToken: string,
    input: SaveDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return authenticatedRequest("/api/document", "PUT", sessionToken, input, signal);
  }

  setStage(
    sessionToken: string,
    input: SetDocumentStageInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return authenticatedRequest("/api/document/stage", "POST", sessionToken, input, signal);
  }

  createAnnotation(
    sessionToken: string,
    input: CreateDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return authenticatedRequest("/api/document/action", "POST", sessionToken, input, signal);
  }

  cancelAnnotation(
    sessionToken: string,
    input: CancelDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return authenticatedRequest("/api/document/action", "DELETE", sessionToken, input, signal);
  }

  applyAgentAnnotation(
    sessionToken: string,
    input: ApplyAgentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<ApplyAgentAnnotationOutcome>> {
    return authenticatedRequest("/api/document/apply", "POST", sessionToken, input, signal);
  }

  undoAgentEdit(
    sessionToken: string,
    input: UndoAgentEditInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return authenticatedRequest("/api/document/undo", "POST", sessionToken, input, signal);
  }

  touchPresence(
    sessionToken: string,
    input: TouchDocumentPresenceInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return authenticatedRequest("/api/document/presence", "POST", sessionToken, input, signal);
  }
}

export const documentHttpService = new DocumentHttpService();
