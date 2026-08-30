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
export type EventOrigin = "ORDINARY_UI" | "WEBMCP" | "SYNTHETIC_DEMO" | "SYSTEM";
export type ReviewStatus = "NOT_APPLICABLE" | "PROPOSED" | "EDITED" | "RATIFIED" | "REJECTED";

export type PageSelection =
  | { kind: "DECISION"; id: string }
  | { kind: "OPTION"; id: string }
  | { kind: "FOLLOWUP"; id: string };

export interface ReadinessFacts {
  activeOptionCount: number;
  hasCurrentCapacityEvidence: boolean;
  hasNorthstarDeadlineEvidence: boolean;
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
  sessionToken: string;
  toolName: TTool;
  envelope: MutationEnvelope<MutationPayloadMap[TTool]>;
  capturedSelection: PageSelection;
  capturedContextEpoch: number;
  signal?: AbortSignal;
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

export interface RealtimeRevisionNotice {
  workspaceRevision: number;
  eventId: string;
}

export interface RatiflowServicePort {
  inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView>;
  mutateFromWebMCP<TTool extends MutationToolName>(
    request: WebMCPMutationRequest<TTool>,
  ): Promise<ToolResult<MutationReceipt>>;
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
    onRevision: (notice: RealtimeRevisionNotice) => void,
  ): () => void;
}
