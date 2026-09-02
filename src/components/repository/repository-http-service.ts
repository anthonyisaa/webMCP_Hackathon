import type {
  AddHumanIssueCommentHttpInput,
  CancelIssueTaskHttpInput,
  CommentOnIssueTaskToolInput,
  ConnectIssueAgentOutcome,
  ConnectIssueAgentToolInput,
  CreateMentionTaskHttpInput,
  CreateIssueTaskHttpInput,
  CreateIssueThreadHttpInput,
  DecideIssueTaskHttpInput,
  IssueComment,
  IssueRevision,
  IssueSessionBundle,
  IssueTask,
  IssueWorkspaceSurface,
  JoinIssueHttpInput,
  LaunchIssueExampleHttpInput,
  LaunchIssueHttpInput,
  ListMyIssueTasksInput,
  ListMyIssueTasksOutcome,
  ReadCollaborationContextInput,
  ReadCollaborationContextOutcome,
  ReadIssueHistoryInput,
  ReadIssueHistoryOutcome,
  RepositoryBrowserClientPort,
  RepositoryResult,
  ResolveIssueThreadHttpInput,
  RestoreIssueRevisionHttpInput,
  SaveIssueRevisionHttpInput,
  SubmitIssueTaskResultOutcome,
  SubmitIssueTaskResultToolInput,
  TouchIssuePresenceHttpInput,
  WaitForMyIssueTasksInput,
  WaitForMyIssueTasksOutcome,
} from "@/repository/contracts";

const PAGE_SESSION_HEADER = "X-Ratiflow-Page-Session";
const IDEMPOTENCY_HEADER = "Idempotency-Key";

export type RepositoryRequestIdFactory = () => string;

function defaultRequestId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("A cryptographic request ID is required for repository mutations.");
  }
  return globalThis.crypto.randomUUID();
}

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

async function readResult<T>(response: Response): Promise<RepositoryResult<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`The repository workspace returned status ${response.status}.`);
  }
  return (await response.json()) as RepositoryResult<T>;
}

function publicPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<RepositoryResult<T>> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  }).then(readResult<T>);
}

function authenticated<T>(input: {
  path: string;
  method: "GET" | "POST";
  sessionToken: string;
  body?: unknown;
  signal?: AbortSignal;
  extraHeaders?: Record<string, string>;
}): Promise<RepositoryResult<T>> {
  return fetch(input.path, {
    method: input.method,
    headers: authorizationHeaders(
      input.sessionToken,
      input.body !== undefined,
      input.extraHeaders,
    ),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    cache: "no-store",
    signal: input.signal,
  }).then(readResult<T>);
}

export class RepositoryHttpService implements RepositoryBrowserClientPort {
  readonly #createRequestId: RepositoryRequestIdFactory;

  constructor(createRequestId: RepositoryRequestIdFactory = defaultRequestId) {
    this.#createRequestId = createRequestId;
  }

  #mutationHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { [IDEMPOTENCY_HEADER]: this.#createRequestId(), ...extra };
  }

  launch(
    input: LaunchIssueHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueSessionBundle>> {
    return publicPost("/api/repository-v4/launch", input, signal);
  }

  launchExample(
    input: LaunchIssueExampleHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueSessionBundle>> {
    return publicPost("/api/repository-v4/example", input, signal);
  }

  join(
    input: JoinIssueHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueSessionBundle>> {
    return publicPost("/api/repository-v4/join", input, signal);
  }

  inspect(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/surface",
      method: "GET",
      sessionToken,
      signal,
    });
  }

  inspectAsAgent(
    agentSessionToken: string,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/surface",
      method: "GET",
      sessionToken: agentSessionToken,
      signal,
      extraHeaders: { [PAGE_SESSION_HEADER]: pageSessionId },
    });
  }

  saveHumanRevision(
    sessionToken: string,
    input: SaveIssueRevisionHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/revision/save",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  createTask(
    sessionToken: string,
    input: CreateIssueTaskHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/task/create",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  createMentionTask(
    sessionToken: string,
    input: CreateMentionTaskHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/task/mention",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  createThread(
    sessionToken: string,
    input: CreateIssueThreadHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/thread/create",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  addHumanComment(
    sessionToken: string,
    input: AddHumanIssueCommentHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/thread/comment",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  resolveThread(
    sessionToken: string,
    input: ResolveIssueThreadHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/thread/resolve",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  cancelTask(
    sessionToken: string,
    input: CancelIssueTaskHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/task/cancel",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  acceptTaskProposal(
    sessionToken: string,
    input: DecideIssueTaskHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/task/accept",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  rejectTaskProposal(
    sessionToken: string,
    input: DecideIssueTaskHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/task/reject",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  restoreRevision(
    sessionToken: string,
    input: RestoreIssueRevisionHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/revision/restore",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }

  readHistory(
    sessionToken: string,
    input: ReadIssueHistoryInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ReadIssueHistoryOutcome>> {
    return authenticated({
      path: "/api/repository-v4/revision/history",
      method: "POST",
      sessionToken,
      body: input,
      signal,
    });
  }

  readRevision(
    sessionToken: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueRevision>> {
    return authenticated({
      path: "/api/repository-v4/revision/read",
      method: "POST",
      sessionToken,
      body: { revision },
      signal,
    });
  }

  readHistoryAsAgent(
    agentSessionToken: string,
    input: ReadIssueHistoryInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ReadIssueHistoryOutcome>> {
    return authenticated({
      path: "/api/repository-v4/revision/history",
      method: "POST",
      sessionToken: agentSessionToken,
      body: input,
      signal,
      extraHeaders: { [PAGE_SESSION_HEADER]: pageSessionId },
    });
  }

  readRevisionAsAgent(
    agentSessionToken: string,
    revision: number,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueRevision>> {
    return authenticated({
      path: "/api/repository-v4/revision/read",
      method: "POST",
      sessionToken: agentSessionToken,
      body: { revision },
      signal,
      extraHeaders: { [PAGE_SESSION_HEADER]: pageSessionId },
    });
  }

  connectAgent(
    agentSessionToken: string,
    input: ConnectIssueAgentToolInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ConnectIssueAgentOutcome>> {
    return authenticated({
      path: "/api/repository-v4/agent/connect",
      method: "POST",
      sessionToken: agentSessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders({
        [PAGE_SESSION_HEADER]: pageSessionId,
      }),
    });
  }

  readCollaborationContext(
    agentSessionToken: string,
    input: ReadCollaborationContextInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ReadCollaborationContextOutcome>> {
    return authenticated({
      path: "/api/repository-v4/agent/context",
      method: "POST",
      sessionToken: agentSessionToken,
      body: input,
      signal,
      extraHeaders: { [PAGE_SESSION_HEADER]: pageSessionId },
    });
  }

  listMyTasks(
    agentSessionToken: string,
    input: ListMyIssueTasksInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ListMyIssueTasksOutcome>> {
    return authenticated({
      path: "/api/repository-v4/agent/tasks",
      method: "POST",
      sessionToken: agentSessionToken,
      body: input,
      signal,
      extraHeaders: { [PAGE_SESSION_HEADER]: pageSessionId },
    });
  }

  waitForMyTasks(
    agentSessionToken: string,
    input: WaitForMyIssueTasksInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<WaitForMyIssueTasksOutcome>> {
    return authenticated({
      path: "/api/repository-v4/agent/tasks/wait",
      method: "POST",
      sessionToken: agentSessionToken,
      body: input,
      signal,
      extraHeaders: { [PAGE_SESSION_HEADER]: pageSessionId },
    });
  }

  commentOnTask(
    agentSessionToken: string,
    input: CommentOnIssueTaskToolInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<
    RepositoryResult<{
      task: IssueTask;
      comment: IssueComment;
      activityVersion: number;
    }>
  > {
    return authenticated({
      path: "/api/repository-v4/agent/comment",
      method: "POST",
      sessionToken: agentSessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders({
        [PAGE_SESSION_HEADER]: pageSessionId,
      }),
    });
  }

  submitTaskResult(
    agentSessionToken: string,
    input: SubmitIssueTaskResultToolInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<SubmitIssueTaskResultOutcome>> {
    return authenticated({
      path: "/api/repository-v4/agent/result",
      method: "POST",
      sessionToken: agentSessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders({
        [PAGE_SESSION_HEADER]: pageSessionId,
      }),
    });
  }

  touchPresence(
    sessionToken: string,
    input: TouchIssuePresenceHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return authenticated({
      path: "/api/repository-v4/presence",
      method: "POST",
      sessionToken,
      body: input,
      signal,
      extraHeaders: this.#mutationHeaders(),
    });
  }
}

export const repositoryHttpService = new RepositoryHttpService();
