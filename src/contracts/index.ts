export const DECISION_STATES = [
  "OPTIONS",
  "CONTESTED",
  "READY",
  "REVIEW",
  "COMMITTED",
] as const;

export type DecisionState = (typeof DECISION_STATES)[number];

export const TOOL_NAMES = [
  "inspect_decision",
  "inspect_selected_option",
  "recommend_option",
  "challenge_option",
  "add_evidence",
  "compare_options",
  "prepare_decision",
  "trace_decision",
  "inspect_followup",
  "why_not",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const AGENT_COORDINATION_TOOL_NAMES = [
  "join_session",
  "wait_for_activity",
  "catch_up",
  "leave_session",
  "get_state_brief",
  "get_thread",
  "get_inbox",
  "claim_agent_task",
  "resolve_task",
  "post_comment",
  "request_human_input",
] as const;

export type AgentCoordinationToolName = (typeof AGENT_COORDINATION_TOOL_NAMES)[number];
export type RegisteredToolName = AgentCoordinationToolName | ToolName;
export type WhyNotAction = "prepare_decision" | "ratify_decision";
export type CapabilityAction = WhyNotAction;

export const BASE_TOOL_MATRIX = {
  OPTIONS: ["inspect_decision", "recommend_option", "add_evidence", "why_not"],
  CONTESTED: ["inspect_decision", "recommend_option", "add_evidence", "compare_options", "why_not"],
  READY: ["inspect_decision", "recommend_option", "add_evidence", "compare_options", "prepare_decision", "why_not"],
  REVIEW: ["inspect_decision", "trace_decision", "why_not"],
  COMMITTED: ["inspect_decision", "trace_decision", "why_not"],
} as const satisfies Record<DecisionState, readonly ToolName[]>;

export type SelectionKind = "DECISION" | "OPTION" | "FOLLOWUP";
export type MemberRole = "PRODUCT_LEAD" | "ENGINEERING_LEAD";
export type ActorType = "HUMAN" | "AGENT" | "SYSTEM";
export type EventOrigin = "ORDINARY_UI" | "WEBMCP" | "AUTO_PICKUP" | "SYNTHETIC_DEMO" | "SYSTEM";
export type ReviewStatus = "NOT_APPLICABLE" | "PROPOSED" | "EDITED" | "RATIFIED" | "REJECTED";

export type PageSelection =
  | { kind: "DECISION"; id: string }
  | { kind: "OPTION"; id: string }
  | { kind: "FOLLOWUP"; id: string };

export interface ReadinessFacts {
  activeOptionCount: number;
  hasCurrentCapacityEvidence: boolean;
  hasNorthstarDeadlineEvidence: boolean;
  selectedOptionId: string | null;
  selectedOptionEngineerDays: number | null;
  launchCapacityEngineerDays: number;
  unresolvedBlockingChallengeCount: number;
}

export interface UnavailableAction {
  action: CapabilityAction;
  unmetPredicates: string[];
}

export interface CompiledCapabilities {
  state: DecisionState;
  workspaceRevision: number;
  contextEpoch: number;
  selection: PageSelection;
  availableTools: ToolName[];
  unavailableActions: UnavailableAction[];
  signature: string;
}

export type CapabilitySummary = Omit<CompiledCapabilities, "signature">;

export interface CapabilityCompilerInput {
  state: DecisionState;
  selection: PageSelection;
  memberRole: MemberRole;
  workspaceRevision: number;
  contextEpoch: number;
  readiness: ReadinessFacts;
}

export type CompileCapabilities = (input: CapabilityCompilerInput) => CompiledCapabilities;

export type EmptyInput = Record<string, never>;

export interface CompareOptionsInput {
  optionIds?: [string, string] | [string, string, string];
}

export interface WhyNotInput {
  action: WhyNotAction;
}

export interface MutationEnvelope<TPayload> {
  expectedWorkspaceRevision: number;
  contextEpoch: number;
  requestId: string;
  rationale: string;
  payload: TPayload;
}

export type EvidenceKind = "CUSTOMER_DEADLINE" | "ENGINEERING_ESTIMATE" | "DELIVERY_RISK";
export type EvidenceStance = "SUPPORTS" | "CHALLENGES" | "CONTEXT";

export interface EvidenceMetrics {
  engineerDays?: number;
  annualValueUsd?: number;
  date?: string;
}

export interface AddEvidencePayload {
  optionId: string;
  kind: EvidenceKind;
  stance: EvidenceStance;
  title: string;
  detail: string;
  sourceLabel: string;
  metrics?: EvidenceMetrics;
}

export interface ChallengeOptionPayload {
  summary: string;
  severity: "BLOCKING" | "ADVISORY";
  requiredEvidenceKind?: EvidenceKind;
}

export interface PrepareDecisionPayload {
  optionId: string;
  recommendation: string;
  risks: string[];
  customerMessageDraft: string;
}

export interface MutationPayloadMap {
  recommend_option: { optionId: string };
  add_evidence: AddEvidencePayload;
  challenge_option: ChallengeOptionPayload;
  prepare_decision: PrepareDecisionPayload;
}

export type MutationToolName = keyof MutationPayloadMap;

export interface WebMCPToolInputMap {
  inspect_decision: EmptyInput;
  inspect_selected_option: EmptyInput;
  recommend_option: MutationEnvelope<{ optionId: string }>;
  add_evidence: MutationEnvelope<AddEvidencePayload>;
  challenge_option: MutationEnvelope<ChallengeOptionPayload>;
  compare_options: CompareOptionsInput;
  prepare_decision: MutationEnvelope<PrepareDecisionPayload>;
  trace_decision: EmptyInput;
  inspect_followup: EmptyInput;
  why_not: WhyNotInput;
}

export const ERROR_CODES = [
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "NOT_AVAILABLE_IN_STATE",
  "STALE_PAGE_CONTEXT",
  "STALE_WORK_STATE",
  "REQUEST_REPLAY_MISMATCH",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ActorRef {
  id: string;
  name: string;
  role: string;
}

export interface FieldChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface CollaboratorChange {
  eventId: string;
  actor: ActorRef;
  origin: EventOrigin;
  reason: string;
  resultingRevision: number;
  changes: FieldChange[];
}

export interface SuccessResult<TData> {
  ok: true;
  data: TData;
  currentWorkspaceRevision: number;
  contextEpoch: number;
  currentCapabilities: CapabilitySummary;
}

export interface ErrorResult {
  ok: false;
  code: ErrorCode;
  message: string;
  retryable: boolean;
  currentWorkspaceRevision: number;
  contextEpoch: number;
  currentCapabilities: CapabilitySummary;
  expectedWorkspaceRevision?: number;
  actualWorkspaceRevision?: number;
  expectedContextEpoch?: number;
  actualContextEpoch?: number;
  changes?: CollaboratorChange[];
  nextAction?: string;
}

export type ToolResult<TData> = SuccessResult<TData> | ErrorResult;

export interface OptionView {
  id: string;
  title: string;
  summary: string;
  launchDate: string;
  exportEngineerDays: number;
  totalEngineerDays: number;
  postLaunchEngineerDays: number;
}

export interface EvidenceView {
  id: string;
  optionId: string | null;
  kind: EvidenceKind;
  stance: EvidenceStance;
  title: string;
  detail: string;
  sourceLabel: string;
  metrics?: EvidenceMetrics;
  actor: ActorRef;
  createdAt: string;
}

export interface ChallengeView {
  id: string;
  optionId: string;
  summary: string;
  severity: "BLOCKING" | "ADVISORY";
  resolved: boolean;
}

export interface PreparedDecisionView {
  id: string;
  optionId: string;
  recommendation: string;
  risks: string[];
  customerMessageDraft: string;
  reviewStatus: ReviewStatus;
  preparedBy: ActorRef;
  ratifiedBy?: ActorRef;
}

export interface FollowupView {
  id: string;
  slug: "customer-launch-brief";
  status: "BLOCKED" | "READY";
  ownerId: string;
  dueDate: string;
  inheritedContext: string[];
}

export type ActivityCursor = string;
export type AgentCaller = "BROWSER_AGENT" | "AUTO_RUNNER";
export type ActivityVia = "ORDINARY_UI" | "BROWSER_AGENT" | "AUTO_PICKUP" | "SYSTEM";
export type AgentEngagementMode = "FRESH" | "INVOKED" | "LIVE";
export type AgentPresenceState = "LIVE" | "LIVE_AUTO" | "IDLE" | "AWAY";
export type AgentTaskKind = "MENTION" | "TASK";
export type AgentTaskStatus = "OPEN" | "CLAIMED" | "WAITING_HUMAN" | "DONE" | "CANCELLED";
export type StandingInstructionScope = "MENTIONS" | "TASKS";
export type HumanInputStatus = "OPEN" | "ANSWERED";

export const ACTIVITY_EVENT_TYPES = [
  "WORKSPACE_MUTATED",
  "TASK_CREATED",
  "TASK_CLAIMED",
  "TASK_WAITING_HUMAN",
  "TASK_RESOLVED",
  "TASK_CANCELLED",
  "AGENT_JOINED",
  "AGENT_LEFT",
  "AGENT_COMMENTED",
  "HUMAN_INPUT_REQUESTED",
  "HUMAN_INPUT_ANSWERED",
  "STANDING_INSTRUCTIONS_CHANGED",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export interface ActivityEvent {
  id: string;
  cursor: ActivityCursor;
  createdAt: string;
  actor: ActorRef;
  actorType: ActorType;
  via: ActivityVia;
  type: ActivityEventType;
  target: PageSelection;
  summary: string;
  workspaceRevision: number | null;
  taskId?: string;
  questionId?: string;
}

export interface AgentParticipantView {
  actor: ActorRef;
  state: AgentPresenceState;
  lastSeenAt: string | null;
  activeVia: "BROWSER_AGENT" | "AUTO_PICKUP" | null;
}

export interface AgentTaskClaimView {
  claimId?: string;
  via: "BROWSER_AGENT" | "AUTO_PICKUP";
  expiresAt: string;
  ownedByCurrentSession: boolean;
}

export interface AgentTaskView {
  id: string;
  kind: AgentTaskKind;
  body: string;
  target: PageSelection;
  status: AgentTaskStatus;
  createdBy: ActorRef;
  assignedAgent: ActorRef;
  claim: AgentTaskClaimView | null;
  resultSummary?: string;
  resultLink?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCommentView {
  id: string;
  target: PageSelection;
  body: string;
  replyTo?: string;
  actor: ActorRef;
  via: ActivityVia;
  taskId?: string;
  createdAt: string;
}

export interface HumanInputRequestView {
  id: string;
  target: PageSelection;
  question: string;
  status: HumanInputStatus;
  askedBy: ActorRef;
  askedVia: "BROWSER_AGENT" | "AUTO_PICKUP";
  taskId?: string;
  answer?: string;
  answeredBy?: ActorRef;
  askedAt: string;
  answeredAt?: string;
}

export interface StandingInstructionsView {
  autoPickup: boolean;
  scopes: StandingInstructionScope[];
  maxActionsPerHour: number;
}

export interface CollaborationView {
  cursor: ActivityCursor;
  agent: AgentParticipantView;
  standingInstructions: StandingInstructionsView;
  inbox: AgentTaskView[];
  comments: AgentCommentView[];
  questions: HumanInputRequestView[];
  recentActivity: ActivityEvent[];
}

export interface ProvenanceEvent {
  id: string;
  actor: ActorRef;
  actorType: ActorType;
  origin: EventOrigin;
  toolName?: ToolName;
  baseRevision: number;
  resultingRevision: number;
  rationale: string;
  reviewStatus: ReviewStatus;
  changedEntities: string[];
  createdAt: string;
}

export interface WorkspaceView {
  id: string;
  name: string;
  revision: number;
  decision: {
    id: string;
    question: string;
    state: DecisionState;
    selectedOptionId: string;
    launchDate: string;
    launchCapacityEngineerDays: number;
    coreReliabilityEngineerDays: number;
  };
  customer: {
    id: string;
    name: string;
    annualRenewalUsd: number;
    usableExportDueDate: string;
  };
  options: OptionView[];
  evidence: EvidenceView[];
  challenges: ChallengeView[];
  preparedDecision: PreparedDecisionView | null;
  followup: FollowupView;
  provenance: ProvenanceEvent[];
  readiness: ReadinessFacts;
  collaboration: CollaborationView;
}

export interface MutationReceipt {
  eventId: string;
  resultingRevision: number;
  changedEntityIds: string[];
  workspace: WorkspaceView;
}

export interface SelectedOptionData {
  option: OptionView;
  evidence: EvidenceView[];
  challenges: ChallengeView[];
}

export interface OptionComparison {
  optionId: string;
  launchEngineerDays: number;
  postLaunchEngineerDays: number;
  fitsCurrentLaunchCapacity: boolean;
  meetsNorthstarDeadline: boolean;
  scheduleBufferDays: number;
  tradeoffs: string[];
}

export interface WhyNotData {
  action: WhyNotAction;
  available: boolean;
  unmetPredicates: string[];
}

export interface WebMCPToolSuccessDataMap {
  inspect_decision: { workspace: WorkspaceView };
  inspect_selected_option: SelectedOptionData;
  recommend_option: MutationReceipt;
  challenge_option: MutationReceipt;
  add_evidence: MutationReceipt;
  compare_options: {
    comparisons: OptionComparison[];
    currentRecommendationOptionId: string;
  };
  prepare_decision: MutationReceipt;
  trace_decision: {
    events: ProvenanceEvent[];
    preparedDecision: PreparedDecisionView | null;
  };
  inspect_followup: { followup: FollowupView };
  why_not: WhyNotData;
}

export type WebMCPToolResult<TTool extends ToolName> = ToolResult<WebMCPToolSuccessDataMap[TTool]>;

export interface WebMCPMutationRequest<TTool extends MutationToolName = MutationToolName> {
  executionContext: AgentRegistryExecutionContext;
  toolName: TTool;
  envelope: MutationEnvelope<MutationPayloadMap[TTool]>;
  capturedSelection: PageSelection;
  capturedContextEpoch: number;
}

/** Private page-registry context; never accepted as an authoritative JSON request body. */
export interface AgentRegistryExecutionContext {
  caller: AgentCaller;
  pageSessionId: string;
  agentSessionToken: string;
  claimId?: string;
  signal?: AbortSignal;
}

/** Exact untrusted HTTP body for a decision mutation; trust fields travel out of body. */
export type WebMCPMutationHttpBody<TTool extends MutationToolName = MutationToolName> =
  Omit<WebMCPMutationRequest<TTool>, "executionContext">;

export interface JsonObjectSchema {
  type: "object";
  properties?: Readonly<Record<string, unknown>>;
  required?: readonly string[];
  additionalProperties: false;
}

export interface AgentToolDefinition {
  name: RegisteredToolName;
  description: string;
  inputSchema: JsonObjectSchema;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
}

export interface AgentRegistryProjection {
  caller: AgentCaller;
  engagementMode: AgentEngagementMode;
  decisionCapabilities: CompiledCapabilities;
}

export interface AgentToolRegistryPort {
  availableDefinitions(projection: AgentRegistryProjection): readonly AgentToolDefinition[];
  execute(
    name: RegisteredToolName,
    input: unknown,
    context: AgentRegistryExecutionContext,
    projection: AgentRegistryProjection,
  ): Promise<unknown>;
}

export const COORDINATION_ERROR_CODES = [
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "SESSION_CLOSED",
  "LIVE_SESSION_ACTIVE",
  "TASK_ALREADY_CLAIMED",
  "CLAIM_LOST",
  "ACTION_BUDGET_EXCEEDED",
  "CURSOR_EXPIRED",
  "REQUEST_REPLAY_MISMATCH",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type CoordinationErrorCode = (typeof COORDINATION_ERROR_CODES)[number];

export type CoordinationResult<TData> =
  | { ok: true; data: TData; cursor: ActivityCursor }
  | {
      ok: false;
      code: "CURSOR_EXPIRED";
      message: string;
      retryable: true;
      resetCursor: ActivityCursor;
      nextAction: string;
    }
  | {
      ok: false;
      code: Exclude<CoordinationErrorCode, "CURSOR_EXPIRED">;
      message: string;
      retryable: boolean;
      cursor?: ActivityCursor;
      nextAction?: string;
    };

export interface WaitForActivityInput {
  cursor: ActivityCursor;
  timeoutSeconds?: number;
}

export interface CatchUpInput {
  sinceCursor?: ActivityCursor;
}

export interface GetThreadInput {
  target?: PageSelection;
}

export interface ClaimAgentTaskInput {
  taskId: string;
  requestId: string;
}

export interface ResolveAgentTaskInput {
  taskId: string;
  requestId: string;
  outcome: string;
  resultLink?: string;
}

export interface PostAgentCommentInput {
  target: PageSelection;
  body: string;
  replyTo?: string;
  taskId?: string;
  requestId: string;
}

export interface RequestHumanInputInput {
  question: string;
  target: PageSelection;
  taskId?: string;
  requestId: string;
}

export interface StateBriefView {
  decisionId: string;
  question: string;
  state: DecisionState;
  currentRecommendationOptionId: string;
  options: Array<{ id: string; title: string }>;
  blockingChallenges: Array<{ id: string; optionId: string; summary: string }>;
  openQuestions: HumanInputRequestView[];
  participants: AgentParticipantView[];
  selection: PageSelection;
  workspaceRevision: number;
  cursor: ActivityCursor;
}

export interface CatchUpData {
  events: ActivityEvent[];
  inbox: AgentTaskView[];
  questions: HumanInputRequestView[];
  hasMore: boolean;
  observedHighWater: ActivityCursor;
  sessionOpen: boolean;
}

export interface JoinSessionData {
  identity: ActorRef;
  presence: AgentParticipantView;
  stateBrief: StateBriefView;
  inbox: AgentTaskView[];
  sessionOpen: true;
}

export interface LeaveSessionData {
  identity: ActorRef;
  presence: AgentParticipantView;
  sessionOpen: false;
}

export interface AgentCoordinationToolSuccessDataMap {
  join_session: JoinSessionData;
  wait_for_activity: CatchUpData;
  catch_up: CatchUpData;
  leave_session: LeaveSessionData;
  get_state_brief: { brief: StateBriefView };
  get_thread: {
    target: PageSelection;
    comments: AgentCommentView[];
    questions: HumanInputRequestView[];
  };
  get_inbox: { inbox: AgentTaskView[] };
  claim_agent_task: { task: AgentTaskView };
  resolve_task: { task: AgentTaskView };
  post_comment: { comment: AgentCommentView };
  request_human_input: { question: HumanInputRequestView; task?: AgentTaskView };
}

export type AgentCoordinationToolResult<TTool extends AgentCoordinationToolName> =
  CoordinationResult<AgentCoordinationToolSuccessDataMap[TTool]>;

export interface CreateAgentTaskInput {
  kind: AgentTaskKind;
  body: string;
  target: PageSelection;
  requestId: string;
}

export interface AnswerHumanInputInput {
  questionId: string;
  answer: string;
  requestId: string;
}

export interface CancelAgentTaskInput {
  taskId: string;
  requestId: string;
}

export interface UpdateStandingInstructionsInput {
  autoPickup: boolean;
  scopes: StandingInstructionScope[];
  maxActionsPerHour: number;
  requestId: string;
}

export interface AutoRunnerAuthorization {
  authorized: boolean;
  reason?: "DISABLED" | "OUT_OF_SCOPE" | "LIVE_SESSION_ACTIVE" | "ACTION_BUDGET_EXCEEDED";
  remainingActions: number;
  standingInstructions: StandingInstructionsView;
}

export interface HumanRatificationInput {
  expectedWorkspaceRevision: number;
  requestId: string;
  recommendation: string;
  customerMessage: string;
}

export interface SetLaunchCapacityInput {
  expectedWorkspaceRevision: number;
  requestId: string;
  payload: {
    launchCapacityEngineerDays: number;
    reason: string;
  };
}

export interface RealtimeWorkspaceNotice {
  activityCursor: ActivityCursor;
  workspaceRevision: number | null;
  eventId: string;
}

export interface RatiflowServicePort {
  inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView>;
  mutateFromWebMCP<TTool extends MutationToolName>(
    request: WebMCPMutationRequest<TTool>,
  ): Promise<ToolResult<MutationReceipt>>;
  joinAgentSession(
    context: AgentRegistryExecutionContext,
    capturedSelection: PageSelection,
  ): Promise<CoordinationResult<JoinSessionData>>;
  catchUpAgentSession(
    context: AgentRegistryExecutionContext,
    input: CatchUpInput,
  ): Promise<CoordinationResult<CatchUpData>>;
  leaveAgentSession(
    context: AgentRegistryExecutionContext,
  ): Promise<CoordinationResult<LeaveSessionData>>;
  getAgentStateBrief(
    context: AgentRegistryExecutionContext,
    capturedSelection: PageSelection,
  ): Promise<CoordinationResult<{ brief: StateBriefView }>>;
  getAgentThread(
    context: AgentRegistryExecutionContext,
    input: GetThreadInput,
    capturedSelection: PageSelection,
  ): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["get_thread"]>>;
  getAgentInbox(
    context: AgentRegistryExecutionContext,
  ): Promise<CoordinationResult<{ inbox: AgentTaskView[] }>>;
  claimAgentTask(
    context: AgentRegistryExecutionContext,
    input: ClaimAgentTaskInput,
  ): Promise<CoordinationResult<{ task: AgentTaskView }>>;
  resolveAgentTask(
    context: AgentRegistryExecutionContext,
    input: ResolveAgentTaskInput,
  ): Promise<CoordinationResult<{ task: AgentTaskView }>>;
  postAgentComment(
    context: AgentRegistryExecutionContext,
    input: PostAgentCommentInput,
  ): Promise<CoordinationResult<{ comment: AgentCommentView }>>;
  requestHumanInput(
    context: AgentRegistryExecutionContext,
    input: RequestHumanInputInput,
  ): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["request_human_input"]>>;
  createAgentTaskFromHumanUi(
    sessionToken: string,
    input: CreateAgentTaskInput,
    signal?: AbortSignal,
  ): Promise<CoordinationResult<{ task: AgentTaskView }>>;
  answerHumanInputFromHumanUi(
    sessionToken: string,
    input: AnswerHumanInputInput,
    signal?: AbortSignal,
  ): Promise<CoordinationResult<{ question: HumanInputRequestView; task?: AgentTaskView }>>;
  cancelAgentTaskFromHumanUi(
    sessionToken: string,
    input: CancelAgentTaskInput,
    signal?: AbortSignal,
  ): Promise<CoordinationResult<{ task: AgentTaskView }>>;
  updateStandingInstructionsFromHumanUi(
    sessionToken: string,
    input: UpdateStandingInstructionsInput,
    signal?: AbortSignal,
  ): Promise<CoordinationResult<{ standingInstructions: StandingInstructionsView }>>;
  authorizeAutoRunner(
    context: AgentRegistryExecutionContext,
    taskId: string,
  ): Promise<CoordinationResult<AutoRunnerAuthorization>>;
  setLaunchCapacityFromCollaboratorUi(
    sessionToken: string,
    input: SetLaunchCapacityInput,
    signal?: AbortSignal,
  ): Promise<ToolResult<MutationReceipt>>;
  ratifyFromHumanUi(
    sessionToken: string,
    input: HumanRatificationInput,
    signal?: AbortSignal,
  ): Promise<ToolResult<MutationReceipt>>;
  subscribe(
    sessionToken: string,
    onNotice: (notice: RealtimeWorkspaceNotice) => void,
  ): () => void;
}
