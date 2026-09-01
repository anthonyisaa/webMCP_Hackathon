import type {
  CancelDocumentWorkOrderInput,
  CreateDocumentWorkOrderInput,
  DecideWorkProposalInput,
  DocumentSessionBundleV3,
  DocumentSurfaceV3,
  DocumentV3Result,
  DocumentV3ServicePort,
  JoinDocumentV3Input,
  LaunchDocumentV3Input,
  ListMyWorkOutcome,
  ReadDocumentMemoryInput,
  ReadDocumentMemoryOutcome,
  ResetDocumentHeroOutcome,
  SaveDocumentInput,
  SubmitWorkProposalOutcome,
  SubmitWorkProposalServiceInput,
  SubmitWorkProposalToolInput,
  TouchDocumentPresenceInput,
  WaitForMyWorkInput,
  WaitForMyWorkOutcome,
} from "@/document/contracts";

function authorizationHeaders(
  sessionToken: string,
  json = false,
  extra: Record<string, string> = {},
): HeadersInit {
  return {
    Authorization: `Bearer ${sessionToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...extra,
  };
}

async function readResult<T>(response: Response): Promise<DocumentV3Result<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`The document workspace returned status ${response.status}.`);
  }
  return (await response.json()) as DocumentV3Result<T>;
}

function publicPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<DocumentV3Result<T>> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  }).then(readResult<T>);
}

function authenticated<T>(
  path: string,
  method: "GET" | "POST",
  sessionToken: string,
  body: unknown | undefined,
  signal?: AbortSignal,
  extraHeaders: Record<string, string> = {},
): Promise<DocumentV3Result<T>> {
  return fetch(path, {
    method,
    headers: authorizationHeaders(sessionToken, body !== undefined, extraHeaders),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal,
  }).then(readResult<T>);
}

export class DocumentWorkspaceHttpService implements DocumentV3ServicePort {
  resetHeroForEvaluation(): Promise<DocumentV3Result<ResetDocumentHeroOutcome>> {
    return Promise.resolve({
      ok: false,
      code: "UNAUTHORIZED",
      message: "The browser document service cannot reset the release fixture.",
      retryable: false,
    });
  }

  launchV3(
    input: LaunchDocumentV3Input = {},
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSessionBundleV3>> {
    return publicPost("/api/document-v3/launch", input, signal);
  }

  launchExampleV3(
    input: LaunchDocumentV3Input = {},
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSessionBundleV3>> {
    return publicPost("/api/document-v3/example", input, signal);
  }

  joinV3(
    input: JoinDocumentV3Input,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSessionBundleV3>> {
    return publicPost("/api/document-v3/join", input, signal);
  }

  inspect(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return authenticated("/api/document-v3/surface", "GET", sessionToken, undefined, signal);
  }

  saveHuman(
    sessionToken: string,
    input: SaveDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return authenticated("/api/document-v3/save", "POST", sessionToken, input, signal);
  }

  createWorkOrder(
    sessionToken: string,
    input: CreateDocumentWorkOrderInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return authenticated("/api/document-v3/work/create", "POST", sessionToken, input, signal);
  }

  cancelWorkOrder(
    sessionToken: string,
    input: CancelDocumentWorkOrderInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return authenticated("/api/document-v3/work/cancel", "POST", sessionToken, input, signal);
  }

  acceptWorkProposal(
    sessionToken: string,
    input: DecideWorkProposalInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return authenticated("/api/document-v3/work/accept", "POST", sessionToken, input, signal);
  }

  rejectWorkProposal(
    sessionToken: string,
    input: DecideWorkProposalInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return authenticated("/api/document-v3/work/reject", "POST", sessionToken, input, signal);
  }

  listMyWork(
    agentSessionToken: string,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<ListMyWorkOutcome>> {
    return authenticated(
      "/api/document-v3/agent/work",
      "POST",
      agentSessionToken,
      {},
      signal,
      { "X-Ratiflow-Page-Session": pageSessionId },
    );
  }

  readMemory(
    sessionToken: string,
    input: ReadDocumentMemoryInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<ReadDocumentMemoryOutcome>> {
    return authenticated("/api/document-v3/memory", "POST", sessionToken, input, signal);
  }

  waitForMyWork(
    agentSessionToken: string,
    input: WaitForMyWorkInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<WaitForMyWorkOutcome>> {
    void agentSessionToken;
    void input;
    void pageSessionId;
    void signal;
    return Promise.resolve({
      ok: false,
      code: "STALE_PAGE_CONTEXT",
      message: "The mounted WebMCP bridge owns the page-local wait loop.",
      retryable: false,
      nextAction: "Use the registered wait_for_my_work tool on the current page.",
    });
  }

  submitWorkProposal(
    agentSessionToken: string,
    input: SubmitWorkProposalServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<SubmitWorkProposalOutcome>> {
    const body: SubmitWorkProposalToolInput = {
      workOrderId: input.workOrderId,
      expectedRevision: input.expectedRevision,
      replacementText: input.replacementText,
      changeSummary: input.changeSummary,
    };
    return authenticated(
      "/api/document-v3/agent/proposal",
      "POST",
      agentSessionToken,
      body,
      signal,
      {
        "X-Ratiflow-Page-Session": pageSessionId,
        "Idempotency-Key": input.requestId,
      },
    );
  }

  touchPresence(
    sessionToken: string,
    input: TouchDocumentPresenceInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return authenticated("/api/document-v3/presence", "POST", sessionToken, input, signal);
  }
}

export const documentWorkspaceHttpService = new DocumentWorkspaceHttpService();
