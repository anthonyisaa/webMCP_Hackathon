import type {
  AgentCommentView,
  AgentCoordinationToolSuccessDataMap,
  AgentRegistryExecutionContext,
  AgentTaskView,
  AnswerHumanInputInput,
  AutoRunnerAuthorization,
  CatchUpData,
  CatchUpInput,
  ClaimAgentTaskInput,
  CoordinationResult,
  CreateAgentTaskInput,
  GetThreadInput,
  HumanInputRequestView,
  HumanRatificationInput,
  JoinSessionData,
  LeaveSessionData,
  MutationReceipt,
  MutationToolName,
  PageSelection,
  PostAgentCommentInput,
  RatiflowServicePort,
  RealtimeWorkspaceNotice,
  RequestHumanInputInput,
  ResolveAgentTaskInput,
  SetLaunchCapacityInput,
  StandingInstructionsView,
  StateBriefView,
  ToolResult,
  UpdateStandingInstructionsInput,
  WebMCPMutationRequest,
  WorkspaceView,
  CancelAgentTaskInput,
} from "@/contracts";

type WorkspaceResponse =
  | { ok: true; workspace: WorkspaceView }
  | { ok: false; code?: string; message?: string };

function requestHeaders(sessionToken: string, json = false): HeadersInit {
  return { Authorization: `Bearer ${sessionToken}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

function agentHeaders(context: AgentRegistryExecutionContext, selection?: PageSelection): HeadersInit {
  return {
    ...requestHeaders(context.agentSessionToken, true),
    "X-Ratiflow-Page-Session": context.pageSessionId,
    ...(context.claimId ? { "X-Ratiflow-Claim": context.claimId } : {}),
    ...(selection ? { "X-Ratiflow-Selection-Kind": selection.kind, "X-Ratiflow-Selection-Id": selection.id } : {}),
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { message?: string; code?: string };
  if (!response.ok) throw new Error(value.message ?? value.code ?? `Request failed with status ${response.status}.`);
  return value;
}

async function postJson<T>(path: string, sessionToken: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: requestHeaders(sessionToken, true), body: JSON.stringify(body), signal });
  return responseJson<T>(response);
}

function callerBase(context: AgentRegistryExecutionContext): string {
  return context.caller === "BROWSER_AGENT" ? "/api/workspace/webmcp" : "/api/workspace/auto";
}

async function postAgent<T>(
  context: AgentRegistryExecutionContext,
  action: string,
  body: unknown,
  selection?: PageSelection,
): Promise<CoordinationResult<T>> {
  const response = await fetch(`${callerBase(context)}/coordination/${action}`, {
    method: "POST",
    headers: agentHeaders(context, selection),
    body: JSON.stringify(body),
    signal: context.signal,
  });
  return responseJson<CoordinationResult<T>>(response);
}

function parseSseBlock(block: string): RealtimeWorkspaceNotice | null {
  const lines = block.split(/\r?\n/);
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  if ((event !== "activity" && event !== "revision") || !data) return null;
  try {
    const value = JSON.parse(data) as Partial<RealtimeWorkspaceNotice>;
    return typeof value.activityCursor === "string" && typeof value.eventId === "string"
      && (value.workspaceRevision === null || Number.isInteger(value.workspaceRevision)) ? value as RealtimeWorkspaceNotice : null;
  } catch {
    return null;
  }
}

async function waitForRetry(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1_500);
    signal.addEventListener("abort", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
  });
}

export class HttpRatiflowService implements RatiflowServicePort {
  async inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView> {
    const response = await fetch("/api/workspace", { headers: requestHeaders(sessionToken), cache: "no-store", signal });
    const body = await responseJson<WorkspaceResponse>(response);
    if (!body.ok) throw new Error(body.message ?? body.code ?? "Workspace inspection failed.");
    return body.workspace;
  }

  async mutateFromWebMCP<TTool extends MutationToolName>(request: WebMCPMutationRequest<TTool>): Promise<ToolResult<MutationReceipt>> {
    const response = await fetch(callerBase(request.executionContext), {
      method: "POST",
      headers: agentHeaders(request.executionContext),
      body: JSON.stringify({
        toolName: request.toolName,
        envelope: request.envelope,
        capturedSelection: request.capturedSelection,
        capturedContextEpoch: request.capturedContextEpoch,
      }),
      signal: request.executionContext.signal,
    });
    return responseJson<ToolResult<MutationReceipt>>(response);
  }

  joinAgentSession(context: AgentRegistryExecutionContext, capturedSelection: PageSelection): Promise<CoordinationResult<JoinSessionData>> {
    return postAgent(context, "join", {}, capturedSelection);
  }

  catchUpAgentSession(context: AgentRegistryExecutionContext, input: CatchUpInput): Promise<CoordinationResult<CatchUpData>> {
    return postAgent(context, "catch-up", input);
  }

  leaveAgentSession(context: AgentRegistryExecutionContext): Promise<CoordinationResult<LeaveSessionData>> {
    return postAgent(context, "leave", {});
  }

  getAgentStateBrief(context: AgentRegistryExecutionContext, capturedSelection: PageSelection): Promise<CoordinationResult<{ brief: StateBriefView }>> {
    return postAgent(context, "state", {}, capturedSelection);
  }

  getAgentThread(context: AgentRegistryExecutionContext, input: GetThreadInput, capturedSelection: PageSelection): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["get_thread"]>> {
    return postAgent(context, "thread", input, capturedSelection);
  }

  getAgentInbox(context: AgentRegistryExecutionContext): Promise<CoordinationResult<{ inbox: AgentTaskView[] }>> {
    return postAgent(context, "inbox", {});
  }

  claimAgentTask(context: AgentRegistryExecutionContext, input: ClaimAgentTaskInput): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    return postAgent(context, "claim", input);
  }

  resolveAgentTask(context: AgentRegistryExecutionContext, input: ResolveAgentTaskInput): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    return postAgent(context, "resolve", input);
  }

  postAgentComment(context: AgentRegistryExecutionContext, input: PostAgentCommentInput): Promise<CoordinationResult<{ comment: AgentCommentView }>> {
    return postAgent(context, "comment", input);
  }

  requestHumanInput(context: AgentRegistryExecutionContext, input: RequestHumanInputInput): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["request_human_input"]>> {
    return postAgent(context, "question", input);
  }

  createAgentTaskFromHumanUi(sessionToken: string, input: CreateAgentTaskInput, signal?: AbortSignal): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    return postJson("/api/workspace/tasks", sessionToken, input, signal);
  }

  answerHumanInputFromHumanUi(sessionToken: string, input: AnswerHumanInputInput, signal?: AbortSignal): Promise<CoordinationResult<{ question: HumanInputRequestView; task?: AgentTaskView }>> {
    return postJson("/api/workspace/questions/answer", sessionToken, input, signal);
  }

  cancelAgentTaskFromHumanUi(sessionToken: string, input: CancelAgentTaskInput, signal?: AbortSignal): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    return postJson("/api/workspace/tasks/cancel", sessionToken, input, signal);
  }

  updateStandingInstructionsFromHumanUi(sessionToken: string, input: UpdateStandingInstructionsInput, signal?: AbortSignal): Promise<CoordinationResult<{ standingInstructions: StandingInstructionsView }>> {
    return postJson("/api/workspace/standing", sessionToken, input, signal);
  }

  authorizeAutoRunner(context: AgentRegistryExecutionContext, taskId: string): Promise<CoordinationResult<AutoRunnerAuthorization>> {
    return postAgent(context, "authorize", { taskId });
  }

  setLaunchCapacityFromCollaboratorUi(sessionToken: string, input: SetLaunchCapacityInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    return postJson("/api/workspace/capacity", sessionToken, input, signal);
  }

  ratifyFromHumanUi(sessionToken: string, input: HumanRatificationInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    return postJson("/api/workspace/ratify", sessionToken, input, signal);
  }

  subscribe(sessionToken: string, onNotice: (notice: RealtimeWorkspaceNotice) => void): () => void {
    const controller = new AbortController();
    const connect = async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch("/api/workspace/realtime", { headers: requestHeaders(sessionToken), cache: "no-store", signal: controller.signal });
          if (!response.ok || !response.body) throw new Error(`Realtime connection failed with status ${response.status}.`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? "";
            for (const block of blocks) {
              const notice = parseSseBlock(block);
              if (notice) onNotice(notice);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          if (process.env.NODE_ENV === "development") console.warn("Ratiflow realtime reconnecting after an error.", error);
        }
        if (!controller.signal.aborted) await waitForRetry(controller.signal);
      }
    };
    void connect();
    return () => controller.abort();
  }
}

export const httpRatiflowService = new HttpRatiflowService();
