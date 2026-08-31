import type {
  AgentCoordinationToolSuccessDataMap,
  AgentRegistryExecutionContext,
  AnswerHumanInputInput,
  AutoRunnerAuthorization,
  CancelAgentTaskInput,
  CatchUpData,
  CatchUpInput,
  ClaimAgentTaskInput,
  CoordinationResult,
  CreateAgentTaskInput,
  GetThreadInput,
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
  ToolResult,
  UpdateStandingInstructionsInput,
  WebMCPMutationRequest,
  WorkspaceView,
} from "@/contracts";

export const RATIFLOW_SUPABASE_URL_ENV = "RATIFLOW_SUPABASE_URL";
export const RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV = "RATIFLOW_SUPABASE_PUBLISHABLE_KEY";

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;

export type SupabaseRatiflowServiceOptions = {
  url: string;
  publishableKey: string;
  fetch?: FetchLike;
  noticePollIntervalMs?: number;
};

export type SupabaseDemoLaunch = {
  workspace: WorkspaceView;
  mayaSessionToken: string;
  jordanSessionToken: string;
  agentSessionToken: string;
  expiresAt: string;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): value is JsonObject {
  return isObject(value) && required.every((key) => key in value)
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isActor(value: unknown): boolean {
  return hasExactKeys(value, ["id", "name", "role"])
    && typeof value.id === "string" && typeof value.name === "string" && typeof value.role === "string";
}

function isSelection(value: unknown): boolean {
  return hasExactKeys(value, ["kind", "id"])
    && ["DECISION", "OPTION", "FOLLOWUP"].includes(String(value.kind))
    && typeof value.id === "string";
}

function isTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isMetrics(value: unknown): boolean {
  if (!hasExactKeys(value, [], ["engineerDays", "annualValueUsd", "date"])) return false;
  return (value.engineerDays === undefined || Number.isInteger(value.engineerDays) && Number(value.engineerDays) >= 0 && Number(value.engineerDays) <= 90)
    && (value.annualValueUsd === undefined || Number.isInteger(value.annualValueUsd) && Number(value.annualValueUsd) >= 0 && Number(value.annualValueUsd) <= 10_000_000)
    && (value.date === undefined || isDate(value.date));
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCapabilities(value: unknown): boolean {
  return hasExactKeys(value, ["state", "workspaceRevision", "contextEpoch", "selection", "availableTools", "unavailableActions"])
    && typeof value.state === "string" && Number.isInteger(value.workspaceRevision) && Number.isInteger(value.contextEpoch)
    && isSelection(value.selection) && Array.isArray(value.availableTools) && Array.isArray(value.unavailableActions);
}

function isParticipant(value: unknown): boolean {
  return hasExactKeys(value, ["actor", "state", "lastSeenAt", "activeVia"])
    && isActor(value.actor)
    && ["LIVE", "LIVE_AUTO", "IDLE", "AWAY"].includes(String(value.state))
    && (value.lastSeenAt === null || isTimestamp(value.lastSeenAt))
    && (value.activeVia === null || ["BROWSER_AGENT", "AUTO_PICKUP"].includes(String(value.activeVia)));
}

function isStandingInstructions(value: unknown): value is StandingInstructionsView {
  return hasExactKeys(value, ["autoPickup", "scopes", "maxActionsPerHour"])
    && typeof value.autoPickup === "boolean"
    && Array.isArray(value.scopes) && value.scopes.length >= 1
    && value.scopes.every((scope) => ["MENTIONS", "TASKS"].includes(String(scope)))
    && Number.isInteger(value.maxActionsPerHour)
    && Number(value.maxActionsPerHour) >= 1 && Number(value.maxActionsPerHour) <= 20;
}

function isTask(value: unknown): boolean {
  if (!hasExactKeys(
    value,
    ["id", "kind", "body", "target", "status", "createdBy", "assignedAgent", "claim", "createdAt", "updatedAt"],
    ["resultSummary", "resultLink"],
  )) return false;
  const claimValid = value.claim === null || (
    hasExactKeys(value.claim, ["via", "expiresAt", "ownedByCurrentSession"], ["claimId"])
    && ["BROWSER_AGENT", "AUTO_PICKUP"].includes(String(value.claim.via))
    && isTimestamp(value.claim.expiresAt)
    && typeof value.claim.ownedByCurrentSession === "boolean"
    && (value.claim.claimId === undefined || typeof value.claim.claimId === "string")
  );
  return typeof value.id === "string"
    && ["MENTION", "TASK"].includes(String(value.kind)) && typeof value.body === "string"
    && isSelection(value.target)
    && ["OPEN", "CLAIMED", "WAITING_HUMAN", "DONE", "CANCELLED"].includes(String(value.status))
    && isActor(value.createdBy) && isActor(value.assignedAgent) && claimValid
    && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt)
    && (value.resultSummary === undefined || typeof value.resultSummary === "string")
    && (value.resultLink === undefined || typeof value.resultLink === "string");
}

function isComment(value: unknown): boolean {
  return hasExactKeys(value, ["id", "target", "body", "actor", "via", "createdAt"], ["replyTo", "taskId"])
    && typeof value.id === "string" && isSelection(value.target) && typeof value.body === "string"
    && isActor(value.actor) && ["BROWSER_AGENT", "AUTO_PICKUP"].includes(String(value.via))
    && isTimestamp(value.createdAt)
    && (value.replyTo === undefined || typeof value.replyTo === "string")
    && (value.taskId === undefined || typeof value.taskId === "string");
}

function isQuestion(value: unknown): boolean {
  return hasExactKeys(
    value,
    ["id", "target", "question", "status", "askedBy", "askedVia", "askedAt"],
    ["taskId", "answer", "answeredBy", "answeredAt"],
  )
    && typeof value.id === "string" && isSelection(value.target) && typeof value.question === "string"
    && ["OPEN", "ANSWERED"].includes(String(value.status)) && isActor(value.askedBy)
    && ["BROWSER_AGENT", "AUTO_PICKUP"].includes(String(value.askedVia)) && isTimestamp(value.askedAt)
    && (value.taskId === undefined || typeof value.taskId === "string")
    && (value.answer === undefined || typeof value.answer === "string")
    && (value.answeredBy === undefined || isActor(value.answeredBy))
    && (value.answeredAt === undefined || isTimestamp(value.answeredAt));
}

function isActivity(value: unknown): boolean {
  return hasExactKeys(
    value,
    ["id", "cursor", "createdAt", "actor", "actorType", "via", "type", "target", "summary", "workspaceRevision"],
    ["taskId", "questionId"],
  )
    && typeof value.id === "string" && typeof value.cursor === "string" && isTimestamp(value.createdAt)
    && isActor(value.actor) && ["HUMAN", "AGENT", "SYSTEM"].includes(String(value.actorType))
    && ["ORDINARY_UI", "BROWSER_AGENT", "AUTO_PICKUP", "SYSTEM"].includes(String(value.via))
    && typeof value.type === "string" && isSelection(value.target) && typeof value.summary === "string"
    && (value.workspaceRevision === null || Number.isInteger(value.workspaceRevision))
    && (value.taskId === undefined || typeof value.taskId === "string")
    && (value.questionId === undefined || typeof value.questionId === "string");
}

function isCollaboration(value: unknown): boolean {
  return hasExactKeys(value, ["cursor", "agent", "standingInstructions", "inbox", "comments", "questions", "recentActivity"])
    && typeof value.cursor === "string" && isParticipant(value.agent)
    && isStandingInstructions(value.standingInstructions)
    && Array.isArray(value.inbox) && value.inbox.every(isTask)
    && Array.isArray(value.comments) && value.comments.every(isComment)
    && Array.isArray(value.questions) && value.questions.every(isQuestion)
    && Array.isArray(value.recentActivity) && value.recentActivity.every(isActivity);
}

function isWorkspaceView(value: unknown): value is WorkspaceView {
  if (!hasExactKeys(value, ["id", "name", "revision", "decision", "customer", "options", "evidence", "challenges", "preparedDecision", "followup", "provenance", "readiness", "collaboration"])
    || typeof value.id !== "string" || typeof value.name !== "string" || !Number.isInteger(value.revision)) return false;
  if (!hasExactKeys(value.decision, ["id", "question", "state", "selectedOptionId", "launchDate", "launchCapacityEngineerDays", "coreReliabilityEngineerDays"])
    || !hasExactKeys(value.customer, ["id", "name", "annualRenewalUsd", "usableExportDueDate"])
    || !hasExactKeys(value.followup, ["id", "slug", "status", "ownerId", "dueDate", "inheritedContext"])
    || !hasExactKeys(value.readiness, ["activeOptionCount", "hasCurrentCapacityEvidence", "hasNorthstarDeadlineEvidence", "selectedOptionId", "selectedOptionEngineerDays", "launchCapacityEngineerDays", "unresolvedBlockingChallengeCount"])
    || !Array.isArray(value.options) || !Array.isArray(value.evidence) || !Array.isArray(value.challenges) || !Array.isArray(value.provenance)
    || !isCollaboration(value.collaboration)) return false;
  if (typeof value.decision.id !== "string" || typeof value.decision.question !== "string" || !["OPTIONS", "CONTESTED", "READY", "REVIEW", "COMMITTED"].includes(String(value.decision.state)) || typeof value.decision.selectedOptionId !== "string" || !isDate(value.decision.launchDate) || !Number.isInteger(value.decision.launchCapacityEngineerDays) || !Number.isInteger(value.decision.coreReliabilityEngineerDays)
    || typeof value.customer.id !== "string" || typeof value.customer.name !== "string" || !Number.isInteger(value.customer.annualRenewalUsd) || !isDate(value.customer.usableExportDueDate)
    || typeof value.followup.id !== "string" || value.followup.slug !== "customer-launch-brief" || !["BLOCKED", "READY"].includes(String(value.followup.status)) || typeof value.followup.ownerId !== "string" || !isDate(value.followup.dueDate) || !isStringArray(value.followup.inheritedContext)
    || !Number.isInteger(value.readiness.activeOptionCount) || typeof value.readiness.hasCurrentCapacityEvidence !== "boolean" || typeof value.readiness.hasNorthstarDeadlineEvidence !== "boolean" || !(typeof value.readiness.selectedOptionId === "string" || value.readiness.selectedOptionId === null) || !(Number.isInteger(value.readiness.selectedOptionEngineerDays) || value.readiness.selectedOptionEngineerDays === null) || !Number.isInteger(value.readiness.launchCapacityEngineerDays) || !Number.isInteger(value.readiness.unresolvedBlockingChallengeCount)) return false;
  return value.options.every((option) => hasExactKeys(option, ["id", "title", "summary", "launchDate", "exportEngineerDays", "totalEngineerDays", "postLaunchEngineerDays"]) && typeof option.id === "string" && typeof option.title === "string" && typeof option.summary === "string" && isDate(option.launchDate) && Number.isInteger(option.exportEngineerDays) && Number.isInteger(option.totalEngineerDays) && Number.isInteger(option.postLaunchEngineerDays))
    && value.evidence.every((evidence) => hasExactKeys(evidence, ["id", "optionId", "kind", "stance", "title", "detail", "sourceLabel", "actor", "createdAt"], ["metrics"]) && typeof evidence.id === "string" && (typeof evidence.optionId === "string" || evidence.optionId === null) && ["CUSTOMER_DEADLINE", "ENGINEERING_ESTIMATE", "DELIVERY_RISK"].includes(String(evidence.kind)) && ["SUPPORTS", "CHALLENGES", "CONTEXT"].includes(String(evidence.stance)) && typeof evidence.title === "string" && typeof evidence.detail === "string" && typeof evidence.sourceLabel === "string" && isActor(evidence.actor) && isTimestamp(evidence.createdAt) && (!("metrics" in evidence) || isMetrics(evidence.metrics)))
    && value.challenges.every((challenge) => hasExactKeys(challenge, ["id", "optionId", "summary", "severity", "resolved"]) && typeof challenge.id === "string" && typeof challenge.optionId === "string" && typeof challenge.summary === "string" && ["BLOCKING", "ADVISORY"].includes(String(challenge.severity)) && typeof challenge.resolved === "boolean")
    && value.provenance.every((event) => hasExactKeys(event, ["id", "actor", "actorType", "origin", "baseRevision", "resultingRevision", "rationale", "reviewStatus", "changedEntities", "createdAt"], ["toolName"]) && typeof event.id === "string" && isActor(event.actor) && ["HUMAN", "AGENT", "SYSTEM"].includes(String(event.actorType)) && ["ORDINARY_UI", "WEBMCP", "AUTO_PICKUP", "SYNTHETIC_DEMO", "SYSTEM"].includes(String(event.origin)) && Number.isInteger(event.baseRevision) && Number.isInteger(event.resultingRevision) && typeof event.rationale === "string" && ["NOT_APPLICABLE", "PROPOSED", "EDITED", "RATIFIED", "REJECTED"].includes(String(event.reviewStatus)) && isStringArray(event.changedEntities) && isTimestamp(event.createdAt) && (!("toolName" in event) || typeof event.toolName === "string"))
    && (value.preparedDecision === null || (hasExactKeys(value.preparedDecision, ["id", "optionId", "recommendation", "risks", "customerMessageDraft", "reviewStatus", "preparedBy"], ["ratifiedBy"]) && typeof value.preparedDecision.id === "string" && typeof value.preparedDecision.optionId === "string" && typeof value.preparedDecision.recommendation === "string" && isStringArray(value.preparedDecision.risks) && typeof value.preparedDecision.customerMessageDraft === "string" && ["NOT_APPLICABLE", "PROPOSED", "EDITED", "RATIFIED", "REJECTED"].includes(String(value.preparedDecision.reviewStatus)) && isActor(value.preparedDecision.preparedBy) && (!("ratifiedBy" in value.preparedDecision) || isActor(value.preparedDecision.ratifiedBy))));
}

export function normalizeWorkspaceView(value: unknown): WorkspaceView {
  if (!isWorkspaceView(value)) throw new Error("Supabase RPC returned an invalid WorkspaceView.");
  return value;
}

export function normalizeToolResult(value: unknown): ToolResult<MutationReceipt> {
  if (!isObject(value) || typeof value.ok !== "boolean" || !Number.isInteger(value.currentWorkspaceRevision)
    || !Number.isInteger(value.contextEpoch) || !isCapabilities(value.currentCapabilities)) {
    throw new Error("Supabase RPC returned an invalid ToolResult.");
  }
  if (value.ok) {
    if (!hasExactKeys(value, ["ok", "data", "currentWorkspaceRevision", "contextEpoch", "currentCapabilities"])
      || !hasExactKeys(value.data, ["eventId", "resultingRevision", "changedEntityIds", "workspace"]) || typeof value.data.eventId !== "string" || !Number.isInteger(value.data.resultingRevision)
      || !Array.isArray(value.data.changedEntityIds) || !isWorkspaceView(value.data.workspace)) {
      throw new Error("Supabase RPC returned an invalid mutation receipt.");
    }
  } else if (!hasExactKeys(value, ["ok", "code", "message", "retryable", "currentWorkspaceRevision", "contextEpoch", "currentCapabilities"], ["expectedWorkspaceRevision", "actualWorkspaceRevision", "expectedContextEpoch", "actualContextEpoch", "changes", "nextAction"])
    || typeof value.code !== "string" || typeof value.message !== "string" || typeof value.retryable !== "boolean") {
    throw new Error("Supabase RPC returned an invalid error result.");
  }
  return value as unknown as ToolResult<MutationReceipt>;
}

export function normalizeCoordinationResult<TData>(value: unknown): CoordinationResult<TData> {
  if (!isObject(value) || typeof value.ok !== "boolean") {
    throw new Error("Supabase RPC returned an invalid CoordinationResult.");
  }
  if (value.ok) {
    if (!hasExactKeys(value, ["ok", "data", "cursor"]) || !isObject(value.data) || typeof value.cursor !== "string") {
      throw new Error("Supabase RPC returned an invalid coordination success result.");
    }
  } else if (value.code === "CURSOR_EXPIRED") {
    if (!hasExactKeys(value, ["ok", "code", "message", "retryable", "resetCursor", "nextAction"])
      || value.retryable !== true || typeof value.message !== "string"
      || typeof value.resetCursor !== "string" || typeof value.nextAction !== "string") {
      throw new Error("Supabase RPC returned an invalid cursor-expired result.");
    }
  } else if (!hasExactKeys(value, ["ok", "code", "message", "retryable"], ["cursor", "nextAction"])
    || typeof value.code !== "string" || typeof value.message !== "string" || typeof value.retryable !== "boolean"
    || (value.cursor !== undefined && typeof value.cursor !== "string")
    || (value.nextAction !== undefined && typeof value.nextAction !== "string")) {
    throw new Error("Supabase RPC returned an invalid coordination error result.");
  }
  return value as unknown as CoordinationResult<TData>;
}

export class SupabaseRatiflowService implements RatiflowServicePort {
  private readonly endpoint: string;
  private readonly publishableKey: string;
  private readonly request: FetchLike;
  private readonly noticePollIntervalMs: number;

  constructor({ url, publishableKey, fetch: fetchOverride, noticePollIntervalMs = 500 }: SupabaseRatiflowServiceOptions) {
    if (!/^https:\/\//.test(url) || !publishableKey) throw new Error("A HTTPS Supabase URL and publishable key are required.");
    this.endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc`;
    this.publishableKey = publishableKey;
    this.request = fetchOverride ?? fetch;
    this.noticePollIntervalMs = Math.min(750, Math.max(250, noticePollIntervalMs));
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): SupabaseRatiflowService | undefined {
    const url = environment[RATIFLOW_SUPABASE_URL_ENV];
    const publishableKey = environment[RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV];
    return url && publishableKey ? new SupabaseRatiflowService({ url, publishableKey }) : undefined;
  }

  async launchDemo(signal?: AbortSignal): Promise<SupabaseDemoLaunch> {
    const value = await this.rpc("ratiflow_launch_demo", { p_ttl_seconds: 28_800 }, signal);
    if (!isObject(value) || !isWorkspaceView(value.workspace) || typeof value.mayaSessionToken !== "string"
      || typeof value.jordanSessionToken !== "string" || typeof value.agentSessionToken !== "string" || !isTimestamp(value.expiresAt)) {
      throw new Error("Supabase RPC returned an invalid demo launch.");
    }
    return value as SupabaseDemoLaunch;
  }

  async inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView> {
    const value = await this.rpc("ratiflow_inspect", { p_handle: sessionToken }, signal);
    if (!isObject(value) || value.ok !== true) throw new Error("Unauthorized session");
    return normalizeWorkspaceView(value.workspace);
  }

  async mutateFromWebMCP<TTool extends MutationToolName>(request: WebMCPMutationRequest<TTool>): Promise<ToolResult<MutationReceipt>> {
    const { executionContext } = request;
    return normalizeToolResult(await this.rpc("ratiflow_agent_mutate", {
      p_handle: executionContext.agentSessionToken,
      p_page_session_id: executionContext.pageSessionId,
      p_caller: executionContext.caller,
      p_claim_id: executionContext.claimId ?? null,
      p_tool_name: request.toolName,
      p_envelope: request.envelope,
      p_captured_selection: request.capturedSelection,
      p_captured_context_epoch: request.capturedContextEpoch,
    }, executionContext.signal));
  }

  async joinAgentSession(context: AgentRegistryExecutionContext, capturedSelection: PageSelection): Promise<CoordinationResult<JoinSessionData>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_join", {
      p_handle: context.agentSessionToken, p_page_session_id: context.pageSessionId, p_selection: capturedSelection,
    }, context.signal));
  }

  async catchUpAgentSession(context: AgentRegistryExecutionContext, input: CatchUpInput): Promise<CoordinationResult<CatchUpData>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_catch_up", {
      p_handle: context.agentSessionToken, p_page_session_id: context.pageSessionId,
      p_caller: context.caller, p_since_cursor: input.sinceCursor ?? null,
    }, context.signal));
  }

  async leaveAgentSession(context: AgentRegistryExecutionContext): Promise<CoordinationResult<LeaveSessionData>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_leave", {
      p_handle: context.agentSessionToken, p_page_session_id: context.pageSessionId,
    }, context.signal));
  }

  async getAgentStateBrief(context: AgentRegistryExecutionContext, capturedSelection: PageSelection): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["get_state_brief"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_state_brief", {
      p_handle: context.agentSessionToken, p_page_session_id: context.pageSessionId,
      p_caller: context.caller, p_selection: capturedSelection,
    }, context.signal));
  }

  async getAgentThread(context: AgentRegistryExecutionContext, input: GetThreadInput, capturedSelection: PageSelection): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["get_thread"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_thread", {
      p_handle: context.agentSessionToken, p_page_session_id: context.pageSessionId,
      p_caller: context.caller, p_target: input.target ?? capturedSelection,
    }, context.signal));
  }

  async getAgentInbox(context: AgentRegistryExecutionContext): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["get_inbox"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_inbox", {
      p_handle: context.agentSessionToken, p_page_session_id: context.pageSessionId,
      p_caller: context.caller,
    }, context.signal));
  }

  async claimAgentTask(context: AgentRegistryExecutionContext, input: ClaimAgentTaskInput): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["claim_agent_task"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_claim_task", {
      ...this.agentWriteContext(context), p_input: input,
    }, context.signal));
  }

  async resolveAgentTask(context: AgentRegistryExecutionContext, input: ResolveAgentTaskInput): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["resolve_task"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_resolve_task", {
      ...this.agentWriteContext(context), p_input: input,
    }, context.signal));
  }

  async postAgentComment(context: AgentRegistryExecutionContext, input: PostAgentCommentInput): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["post_comment"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_post_comment", {
      ...this.agentWriteContext(context), p_input: input,
    }, context.signal));
  }

  async requestHumanInput(context: AgentRegistryExecutionContext, input: RequestHumanInputInput): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["request_human_input"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_request_human_input", {
      ...this.agentWriteContext(context), p_input: input,
    }, context.signal));
  }

  async createAgentTaskFromHumanUi(sessionToken: string, input: CreateAgentTaskInput, signal?: AbortSignal): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["claim_agent_task"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_human_create_agent_task", { p_handle: sessionToken, p_input: input }, signal));
  }

  async answerHumanInputFromHumanUi(sessionToken: string, input: AnswerHumanInputInput, signal?: AbortSignal): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["request_human_input"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_human_answer_agent_question", { p_handle: sessionToken, p_input: input }, signal));
  }

  async cancelAgentTaskFromHumanUi(sessionToken: string, input: CancelAgentTaskInput, signal?: AbortSignal): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["resolve_task"]>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_human_cancel_agent_task", { p_handle: sessionToken, p_input: input }, signal));
  }

  async updateStandingInstructionsFromHumanUi(sessionToken: string, input: UpdateStandingInstructionsInput, signal?: AbortSignal): Promise<CoordinationResult<{ standingInstructions: StandingInstructionsView }>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_human_update_standing", { p_handle: sessionToken, p_input: input }, signal));
  }

  async authorizeAutoRunner(context: AgentRegistryExecutionContext, taskId: string): Promise<CoordinationResult<AutoRunnerAuthorization>> {
    return normalizeCoordinationResult(await this.rpc("ratiflow_agent_authorize_auto", {
      p_handle: context.agentSessionToken, p_page_session_id: context.pageSessionId, p_task_id: taskId,
    }, context.signal));
  }

  async setLaunchCapacityFromCollaboratorUi(sessionToken: string, input: SetLaunchCapacityInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    return normalizeToolResult(await this.rpc("ratiflow_set_launch_capacity", { p_handle: sessionToken, p_input: input }, signal));
  }

  async ratifyFromHumanUi(sessionToken: string, input: HumanRatificationInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    return normalizeToolResult(await this.rpc("ratiflow_ratify_human", { p_handle: sessionToken, p_input: input }, signal));
  }

  subscribe(sessionToken: string, onNotice: (notice: RealtimeWorkspaceNotice) => void): () => void {
    let active = true;
    let lastCursor: string | undefined;
    const poll = async () => {
      while (active) {
        try {
          const value = await this.rpc("ratiflow_workspace_notice", { p_handle: sessionToken });
          const notice = Array.isArray(value) ? value[0] : value;
          if (isObject(notice) && typeof notice.activity_cursor === "string"
            && typeof notice.event_id === "string"
            && (notice.workspace_revision === null || Number.isInteger(notice.workspace_revision))
            && notice.activity_cursor !== lastCursor) {
            lastCursor = notice.activity_cursor;
            onNotice({
              activityCursor: notice.activity_cursor,
              workspaceRevision: notice.workspace_revision === null ? null : Number(notice.workspace_revision),
              eventId: notice.event_id,
            });
          }
        } catch {
          // Expired/revoked membership stops notices. Authoritative state fetches own
          // surfacing authorization failures to the UI.
        }
        await new Promise<void>((resolve) => setTimeout(resolve, this.noticePollIntervalMs));
      }
    };
    void poll();
    return () => { active = false; };
  }

  private agentWriteContext(context: AgentRegistryExecutionContext): JsonObject {
    return {
      p_handle: context.agentSessionToken,
      p_page_session_id: context.pageSessionId,
      p_caller: context.caller,
      p_claim_id: context.claimId ?? null,
    };
  }

  private async rpc(name: string, body: JsonObject, signal?: AbortSignal): Promise<unknown> {
    const response = await this.request(`${this.endpoint}/${name}`, {
      method: "POST",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${this.publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(`Supabase RPC ${name} failed (${response.status}).`);
    return value;
  }
}
