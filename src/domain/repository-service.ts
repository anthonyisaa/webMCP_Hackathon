import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  ISSUE_ACTIVE_TASK_LIMIT,
  ISSUE_AGENT_LABEL_MAX_LENGTH,
  ISSUE_AGENT_NAME_MAX_LENGTH,
  ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT,
  ISSUE_BODY_MAX_LENGTH,
  ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
  ISSUE_COMMENT_MAX_LENGTH,
  ISSUE_DOCUMENT_KINDS,
  ISSUE_EVIDENCE_REF_LIMIT,
  ISSUE_EVIDENCE_REF_MAX_LENGTH,
  ISSUE_HISTORY_DEFAULT_LIMIT,
  ISSUE_HISTORY_MAX_LIMIT,
  ISSUE_CONTEXT_DEFAULT_LIMIT,
  ISSUE_CONTEXT_MAX_LIMIT,
  ISSUE_STANDALONE_THREAD_LIMIT,
  ISSUE_TASK_CATEGORIES,
  ISSUE_TASK_INSTRUCTION_MAX_LENGTH,
  ISSUE_TASK_MODES,
  ISSUE_TASK_CONTEXT_SIDE_MAX_LENGTH,
  ISSUE_TASK_PRIOR_CONTEXT_EXCERPT_MAX_LENGTH,
  ISSUE_TASK_PRIOR_CONTEXT_LIMIT,
  ISSUE_TASK_TITLE_MAX_LENGTH,
  ISSUE_THREAD_COMMENT_LIMIT,
  ISSUE_TITLE_MAX_LENGTH,
  ISSUE_WAIT_DEFAULT_SECONDS,
  ISSUE_WAIT_MAX_SECONDS,
  ISSUE_WORKSPACE_TASK_LIMIT,
  ISSUE_WORKSPACE_TTL_MS,
  POSTMORTEM_TEMPLATE_BODY,
  POSTMORTEM_TEMPLATE_TITLE,
  PRODUCT_DOCUMENT_TEMPLATE_BODY,
  PRODUCT_DOCUMENT_TEMPLATE_TITLE,
  REPOSITORY_TOOL_NAMES,
  REPOSITORY_PROTOCOL_VERSION,
  type AddHumanIssueCommentServiceInput,
  type CancelIssueTaskServiceInput,
  type CommentOnIssueTaskServiceInput,
  type CreateIssueTaskServiceInput,
  type CreateMentionTaskServiceInput,
  type CreateIssueThreadServiceInput,
  type DecideIssueTaskServiceInput,
  type IssueAgentActorSnapshot,
  type IssueAgentProfile,
  type IssueActivityKind,
  type IssueActorSnapshot,
  type IssueAnchor,
  type IssueAnchorInput,
  type IssueComment,
  type IssueCollaborationContextEvent,
  type IssueDocument,
  type IssueDocumentField,
  type IssueDocumentKind,
  type IssueHumanActorSnapshot,
  type IssueMemberSnapshot,
  type IssuePresence,
  type IssueRevision,
  type IssueRevisionProvenance,
  type IssueRevisionSummary,
  type IssueSessionBundle,
  type IssueTask,
  type IssueTaskContextSnapshot,
  type IssueTaskPriorContextEntry,
  type IssueTaskDecision,
  type IssueTaskMode,
  type IssueTaskProposal,
  type IssueTaskResult,
  type IssueTaskStatus,
  type IssueTaskView,
  type IssueThread,
  type IssueWorkspaceSurface,
  type JoinIssueHttpInput,
  type LaunchIssueExampleHttpInput,
  type LaunchIssueHttpInput,
  type ListMyIssueTasksInput,
  type ListMyIssueTasksOutcome,
  type ReadCollaborationContextInput,
  type ReadCollaborationContextOutcome,
  type ReadIssueHistoryInput,
  type ReadIssueHistoryOutcome,
  type RepositoryEvaluationPort,
  type RepositoryFailure,
  type RepositoryResult,
  type RepositoryServicePort,
  type ResetPostmortemHeroOutcome,
  type ConnectIssueAgentOutcome,
  type ConnectIssueAgentServiceInput,
  type ResolveIssueThreadServiceInput,
  type RestoreIssueRevisionServiceInput,
  type SaveIssueRevisionServiceInput,
  type SubmitIssueTaskResultOutcome,
  type SubmitIssueTaskResultServiceInput,
  type TouchIssuePresenceServiceInput,
  type WaitForMyIssueTasksInput,
  type WaitForMyIssueTasksOutcome,
  type CreateDirectoryMentionServiceInput,
} from "@/repository/contracts";
import {
  isManagedAgentHandle,
  MANAGED_AGENT_MODEL,
  MANAGED_AGENT_RUNTIME,
  MANAGED_AGENT_TOOL_DEFINITIONS,
  relayAccessProfileForManagedHandle,
  RELAY_ACCESS_POLICIES,
  RELAY_BROWSER_OBSERVED_CATALOG_TRANSITIONS,
  RELAY_BOUNDS,
  RELAY_EXECUTION_PERMIT_AUDIENCE,
  RELAY_GRANT_AUDIENCE,
  RELAY_PHYSICAL_TOOL_NAME_PATTERN,
  RELAY_TRACE_KINDS,
  type DirectoryMentionReceipt,
  type ManagedAgentDirectoryEntry,
  type ManagedAgentExpertise,
  type ManagedAgentLogicalToolName,
  type RelayCapabilityGrant,
  type RelayAttempt,
  type RelayBrowserTraceInput,
  type RelayClaimOutcome,
  type RelayClaimedAttemptView,
  type RelayBeginStepResult,
  type RelayExecutionPermit,
  type RelayExecutionPermitClaims,
  type RelayFailure,
  type RelayGrant,
  type RelayGrantClaims,
  type RelayNormalizedToolManifest,
  type RelayResult,
  type RelayRun,
  type RelayStepRecordInput,
  type RelayStepReservationInput,
  type RelayStepOutcome,
  type RelayTraceEvent,
  type RelayToolInvocationContext,
  type RelayReadAssignmentResult,
  type RelayReadDocumentContextResult,
  type RelayProgressCommentInput,
  type RelaySubmitRevisionInput,
  type RelayWorkspaceState,
  type SpecialistFixturePort,
} from "@/agent-relay/contracts";
import { compileIssueMention } from "@/capabilities/mention-compiler";
import {
  POSTMORTEM_EXAMPLE,
  PRODUCT_DOCUMENT_EXAMPLE,
} from "@/domain/repository-examples";
import {
  deriveIssueSplice,
  issuePointLength,
  issueSlice,
  makeIssueDiff,
  rebaseIssueAnchor,
  replaceIssueAnchor,
  replaceIssueRange,
  type IssueSplice,
} from "@/repository/range";
import {
  RELAY_PROVIDER_RUN_QUOTA,
  type IssueRelayPermitInput,
  type IssueRelayToolExecutionInput,
  type IssueRelayTraceInput,
  type RepositoryRelayServicePort,
} from "@/domain/repository-relay-service";
import {
  RepositoryRelayTokenCodec,
  relayCanonicalJson,
  relaySecretDigest,
  relaySha256,
  validRelaySigningSecret,
} from "@/domain/repository-relay-security";

type SessionActor = "HUMAN" | "AGENT";

type StoredMember = IssueMemberSnapshot & {
  color: string;
};

type StoredSession = {
  documentId: string;
  memberId: string;
  actorType: SessionActor;
  expiresAt: number;
  sessionInstanceId: string;
};

type StoredPresence = {
  value: IssuePresence;
  observedAt: number;
};

type StoredTask = {
  taskId: string;
  taskKey: string;
  title: string;
  category: IssueTask["category"];
  instruction: string;
  agentLabel: string;
  agentProfileId: string | null;
  context: IssueTaskContextSnapshot | null;
  mode: IssueTaskMode;
  status: IssueTaskStatus;
  creationAnchor: IssueAnchor;
  anchor: IssueAnchor;
  creator: IssueMemberSnapshot;
  assignee: IssueMemberSnapshot;
  threadId: string;
  proposal: IssueTaskProposal | null;
  result: IssueTaskResult | null;
  decision: IssueTaskDecision | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** Private v4.2 identity/context; removed from the exact v4.1 projection. */
  managedAgentProfileId?: string;
  managedContext?: IssueTaskContextSnapshot;
};

type StoredAgentProfile = IssueAgentProfile & {
  /** Private ABA guard; intentionally omitted from every public projection. */
  identityGeneration: number;
};

type StoredAgentPageConnection = {
  profileId: string;
  identityGeneration: number;
};

type StoredActivity = {
  activityId: string;
  activityVersion: number;
  kind: IssueActivityKind;
  documentRevision: number;
  actor: IssueActorSnapshot;
  createdAt: string;
  revisionId: string | null;
  taskId: string | null;
  threadId: string | null;
  commentId: string | null;
  excerpt: string;
};

type LedgerEntry = {
  fingerprint: string;
  result: RelayResult<unknown>;
};

type StoredManagedAgent = {
  entry: ManagedAgentDirectoryEntry;
};

type StoredRelayRun = RelayRun;

type StoredRelayStep = {
  requestId: string;
  inputDigest: `sha256:${string}`;
  expectedStep: number;
  status: "RESERVED" | "TERMINAL";
  providerResponseId: string | null;
  result: RelayResult<RelayStepOutcome> | null;
  createdAt: string;
  completedAt: string | null;
};

type StoredRelayAttempt = RelayAttempt & {
  claimRequestId: string;
  retryRunId: string | null;
  grantClaims: RelayGrantClaims;
  grantDigest: `sha256:${string}`;
  grantRevokedAt: string | null;
  previousProviderResponseId: string | null;
  previousOutcome: RelayStepOutcome | null;
  manifest: RelayNormalizedToolManifest | null;
  steps: Map<string, StoredRelayStep>;
};

type StoredRelayPermit = {
  claims: RelayExecutionPermitClaims;
  tokenDigest: `sha256:${string}`;
  status: "ISSUED" | "EXECUTING" | "COMPLETED" | "FAILED" | "REVOKED";
  documentId: string;
  runId: string;
  taskId: string;
  profileId: string;
  logicalToolName: ManagedAgentLogicalToolName;
  arguments: Readonly<Record<string, unknown>>;
  requestId: string;
  executionIdempotencyKey: string | null;
  resultReceiptId: string | null;
  output: string | null;
  outputDigest: `sha256:${string}` | null;
  failure: RelayFailure | null;
  createdAt: string;
  completedAt: string | null;
};

type CredentialIssuanceOperation = "launch" | "example" | "join" | "reset";

type CredentialRateBucket = {
  windowStartedAt: number;
  count: number;
};

type RelayProviderDispatch = {
  documentId: string;
  attemptId: string;
  reservedAt: number;
  reservationExpiresAt: number;
  dispatchedAt: number | null;
};

type StoredWorkspace = {
  id: string;
  shareTokenHash: string;
  expiresAt: number;
  lastTimestampMs: number;
  nextGuestNumber: number;
  nextTaskNumber: number;
  document: IssueDocument;
  members: Map<string, StoredMember>;
  presence: Map<string, StoredPresence>;
  tasks: StoredTask[];
  threads: IssueThread[];
  revisions: IssueRevision[];
  agentsByMemberId: Map<string, StoredAgentProfile>;
  pageConnections: Map<string, StoredAgentPageConnection>;
  activities: StoredActivity[];
  ledger: Map<string, LedgerEntry>;
  managedAgentsByProfileId: Map<string, StoredManagedAgent>;
  relayRuns: StoredRelayRun[];
  relayAttempts: StoredRelayAttempt[];
  relayPermits: Map<string, StoredRelayPermit>;
  relayEventVersion: number;
  relayTrace: RelayTraceEvent[];
};

type ResolvedSession = {
  workspace: StoredWorkspace;
  session: StoredSession;
  member: StoredMember;
};

type AuthorizedRelay = RelayFailure | {
  ok: true;
  workspace: StoredWorkspace;
  run: StoredRelayRun;
  attempt: StoredRelayAttempt;
  task: StoredTask;
  agent: ManagedAgentDirectoryEntry;
};

type AuthorizedRelayTool = RepositoryFailure | {
  ok: true;
  workspace: StoredWorkspace;
  run: StoredRelayRun;
  attempt: StoredRelayAttempt;
  task: StoredTask;
  agent: ManagedAgentDirectoryEntry;
};

type RevisionInput = {
  title: string;
  body: string;
  provenance: IssueRevisionProvenance;
  changeSummary: string;
  evidenceRefs: string[];
  ownTaskId?: string;
  ownReplacement?: { field: IssueDocumentField; replacement: string };
  restore?: boolean;
  activityKind?: IssueActivityKind;
  timestamp?: string;
};

export type LocalRepositoryServiceOptions = {
  sessionTtlMs?: number;
  presenceTtlMs?: number;
  waitSecondMs?: number;
  credentialRateLimitWindowMs?: number;
  credentialRateLimits?: Partial<Record<CredentialIssuanceOperation, number>>;
  relayProviderQuotaWindowMs?: number;
  relayProviderDeploymentLimit?: number;
  relayProviderDocumentLimit?: number;
  now?: () => number;
  relaySigningSecret?: string;
  specialistFixturePort?: SpecialistFixturePort;
};

const DISPLAY_NAME_MAX_LENGTH = 80;
const DEFAULT_PRESENCE_TTL_MS = 15_000;
const DEFAULT_CREDENTIAL_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_CREDENTIAL_RATE_LIMITS: Record<CredentialIssuanceOperation, number> = {
  launch: 100,
  example: 20,
  join: 200,
  reset: 20,
};
const MEMBER_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#0f766e", "#c2410c", "#4f46e5"] as const;
const HERO_DOCUMENT_ID = "00000000-0000-4000-8000-000000000401";
const HERO_PRIYA_ID = "00000000-0000-4000-8000-000000000411";
const HERO_NADIA_ID = "00000000-0000-4000-8000-000000000412";
const HERO_LEO_ID = "00000000-0000-4000-8000-000000000413";
const HERO_SAM_ID = "00000000-0000-4000-8000-000000000414";
const HERO_REVISION_ID = "00000000-0000-4000-8000-000000000451";
const HERO_PROFILE_IDS = {
  nadia: "00000000-0000-4000-8000-000000005121",
  leo: "00000000-0000-4000-8000-000000005122",
  sam: "00000000-0000-4000-8000-000000005123",
} as const;
const RELAY_RECENT_REVISION_LIMIT = 10;
const MANAGED_AGENT_DIRECTORY_SEEDS = [
  {
    handle: "data",
    displayName: "Data",
    principalName: "Data · managed agent",
    visibility: "COMPANY",
    expertise: "DATA",
  },
  {
    handle: "code",
    displayName: "Code",
    principalName: "Code · managed agent",
    visibility: "TEAM",
    expertise: "CODE",
  },
  {
    handle: "general",
    displayName: "General",
    principalName: "General · managed agent",
    visibility: "PERSONAL",
    expertise: "GENERAL",
  },
] as const satisfies ReadonlyArray<{
  handle: "data" | "code" | "general";
  displayName: string;
  principalName: string;
  visibility: "COMPANY" | "TEAM" | "PERSONAL";
  expertise: ManagedAgentExpertise;
}>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): boolean {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function boundedText(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string"
    && issuePointLength(value) <= max
    && (allowEmpty || value.trim().length > 0);
}

function boundedOpaqueId(value: unknown, max: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && Buffer.byteLength(value, "utf8") <= max
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function matchesRelayToolInput(
  logicalName: ManagedAgentLogicalToolName,
  value: Readonly<Record<string, unknown>>,
): boolean {
  switch (logicalName) {
    case "read_assignment":
    case "read_document_context":
    case "read_company_style_guide":
      return hasExactKeys(value, []);
    case "read_collaboration_context":
      return hasExactKeys(value, ["limit"])
        && Number.isSafeInteger(value.limit) && Number(value.limit) >= 1 && Number(value.limit) <= 20;
    case "comment_on_assignment":
      return hasExactKeys(value, ["body", "evidenceRefs"])
        && boundedText(value.body, ISSUE_COMMENT_MAX_LENGTH)
        && validEvidence(value.evidenceRefs);
    case "submit_scoped_revision":
      return hasExactKeys(value, ["basedOnRevision", "resultSummary", "replacementText", "evidenceRefs"])
        && Number.isSafeInteger(value.basedOnRevision) && Number(value.basedOnRevision) >= 1
        && boundedText(value.resultSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH)
        && boundedText(value.replacementText, ISSUE_BODY_MAX_LENGTH)
        && validEvidence(value.evidenceRefs);
    case "query_demo_metrics":
      return hasExactKeys(value, ["dataset", "question"])
        && ["northstar_launch_capacity", "inc_482_checkout_impact"].includes(String(value.dataset))
        && boundedText(value.question, 500);
    case "search_demo_code":
      return hasExactKeys(value, ["query"]) && boundedText(value.query, 300);
    case "read_demo_file":
      return hasExactKeys(value, ["path"])
        && ["src/checkout/retry-middleware.ts", "checkout.log"].includes(String(value.path));
    case "check_document_consistency":
      return hasExactKeys(value, ["section"]) && boundedText(value.section, 8_000);
  }
}

function validEvidence(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= ISSUE_EVIDENCE_REF_LIMIT
    && value.every((entry) => boundedText(entry, ISSUE_EVIDENCE_REF_MAX_LENGTH));
}

function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function failure(
  code: RepositoryFailure["code"],
  message: string,
  retryable = false,
  details: Partial<RepositoryFailure> = {},
): RepositoryFailure {
  return { ok: false, code, message, retryable, ...details };
}

function relayFailure(
  code: RelayFailure["code"],
  message: string,
  retryable = false,
  details: Partial<RelayFailure> = {},
): RelayFailure {
  return { ok: false, code, message, retryable, ...details };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof DOMException && signal.reason.name === "AbortError") throw signal.reason;
  throw new DOMException(typeof signal.reason === "string" ? signal.reason : "Operation cancelled", "AbortError");
}

function digest(title: string, body: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify({ title, body }), "utf8").digest("hex")}`;
}

function anchorForOccurrence(
  value: string,
  selectedText: string,
  occurrence: number,
): Extract<IssueAnchorInput, { scope: "SELECTION" }> {
  let codeUnitStart = -1;
  let cursor = 0;
  for (let index = 0; index < occurrence; index += 1) {
    codeUnitStart = value.indexOf(selectedText, cursor);
    if (codeUnitStart < 0) throw new Error(`Example selection not found: ${selectedText}`);
    cursor = codeUnitStart + selectedText.length;
  }
  const rangeStart = issuePointLength(value.slice(0, codeUnitStart));
  return {
    scope: "SELECTION",
    field: "BODY",
    rangeStart,
    rangeEnd: rangeStart + issuePointLength(selectedText),
  };
}

function secretDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function humanActor(member: IssueMemberSnapshot): IssueHumanActorSnapshot {
  return {
    actorType: "HUMAN",
    displayName: member.displayName,
    member: { memberId: member.memberId, displayName: member.displayName },
    agentLabel: null,
  };
}

function agentActor(task: StoredTask, profile?: StoredAgentProfile): IssueAgentActorSnapshot {
  const currentName = profile?.name ?? task.agentLabel;
  return {
    actorType: "AGENT",
    displayName: currentName,
    member: clone(task.assignee),
    agentProfileId: profile?.profileId ?? task.agentProfileId,
    agentLabel: currentName,
  };
}

function managedAgentActor(
  task: StoredTask,
  agent: ManagedAgentDirectoryEntry,
): IssueAgentActorSnapshot {
  return {
    actorType: "AGENT",
    displayName: agent.displayName,
    member: clone(task.assignee),
    // The exact v4.1 projection uses its legal null-profile compatibility identity.
    agentProfileId: null,
    agentLabel: agent.displayName,
  };
}

function revisionSummary(revision: IssueRevision): IssueRevisionSummary {
  return clone({
    revisionId: revision.revisionId,
    revision: revision.revision,
    parentRevision: revision.parentRevision,
    contentDigest: revision.contentDigest,
    diffs: revision.diffs,
    provenance: revision.provenance,
    changeSummary: revision.changeSummary,
    evidenceRefs: revision.evidenceRefs,
    createdAt: revision.createdAt,
  });
}

function publicTask(task: StoredTask): IssueTask {
  const result = clone(task) as StoredTask;
  delete result.managedAgentProfileId;
  delete result.managedContext;
  return result as IssueTask;
}

function claimedAttemptView(attempt: StoredRelayAttempt): RelayClaimedAttemptView {
  const {
    claimRequestId: _claimRequestId,
    retryRunId: _retryRunId,
    grantClaims: _grantClaims,
    grantDigest: _grantDigest,
    grantRevokedAt: _grantRevokedAt,
    previousProviderResponseId: _previousProviderResponseId,
    previousOutcome: _previousOutcome,
    manifest: _manifest,
    steps: _steps,
    pageSessionId: _pageSessionId,
    ...view
  } = clone(attempt);
  void [_claimRequestId, _retryRunId, _grantClaims, _grantDigest, _grantRevokedAt,
    _previousProviderResponseId, _previousOutcome, _manifest, _steps, _pageSessionId];
  return view;
}

function stateAttemptView(attempt: StoredRelayAttempt): RelayWorkspaceState["activeAttempt"] {
  const { leaseId: _leaseId, ...view } = claimedAttemptView(attempt);
  void _leaseId;
  return view;
}

function taskIsActive(task: StoredTask): boolean {
  return task.status === "OPEN" || task.status === "PROPOSED";
}

function compareTasks(left: StoredTask, right: StoredTask): number {
  const activeOrder = Number(taskIsActive(right)) - Number(taskIsActive(left));
  return activeOrder
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.taskId.localeCompare(right.taskId);
}

function publicThread(thread: IssueThread): IssueThread {
  const result = clone(thread);
  result.comments.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
    || left.commentId.localeCompare(right.commentId));
  return result;
}

/** In-memory protocol-v4 semantic reference and local/demo fallback. */
export class LocalRepositoryService
implements RepositoryServicePort, RepositoryEvaluationPort {
  private readonly workspaces = new Map<string, StoredWorkspace>();
  private readonly workspaceIdsByShareTokenHash = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly activeWaits = new Set<string>();
  private readonly sessionTtlMs: number;
  private readonly presenceTtlMs: number;
  private readonly waitSecondMs: number;
  private readonly credentialRateLimitWindowMs: number;
  private readonly credentialRateLimits: Record<CredentialIssuanceOperation, number>;
  private readonly credentialRateBuckets = new Map<string, CredentialRateBucket>();
  private readonly relayProviderQuotaWindowMs: number;
  private readonly relayProviderDeploymentLimit: number;
  private readonly relayProviderDocumentLimit: number;
  private relayProviderDispatches: RelayProviderDispatch[] = [];
  private readonly now: () => number;
  private readonly relayTokenCodec: RepositoryRelayTokenCodec | null;
  private readonly specialistFixturePort?: SpecialistFixturePort;
  private resetInFlight = false;

  constructor({
    sessionTtlMs = ISSUE_WORKSPACE_TTL_MS,
    presenceTtlMs = DEFAULT_PRESENCE_TTL_MS,
    waitSecondMs = 1_000,
    credentialRateLimitWindowMs = DEFAULT_CREDENTIAL_RATE_LIMIT_WINDOW_MS,
    credentialRateLimits = {},
    relayProviderQuotaWindowMs = RELAY_PROVIDER_RUN_QUOTA.windowMs,
    relayProviderDeploymentLimit = RELAY_PROVIDER_RUN_QUOTA.deploymentLimit,
    relayProviderDocumentLimit = RELAY_PROVIDER_RUN_QUOTA.documentLimit,
    now = Date.now,
    relaySigningSecret,
    specialistFixturePort,
  }: LocalRepositoryServiceOptions = {}) {
    this.sessionTtlMs = Math.min(ISSUE_WORKSPACE_TTL_MS, Math.max(1, sessionTtlMs));
    this.presenceTtlMs = Math.max(1, presenceTtlMs);
    this.waitSecondMs = Math.max(1, waitSecondMs);
    this.credentialRateLimitWindowMs = Math.max(1, credentialRateLimitWindowMs);
    this.credentialRateLimits = {
      ...DEFAULT_CREDENTIAL_RATE_LIMITS,
      ...credentialRateLimits,
    };
    this.relayProviderQuotaWindowMs = Math.max(1, relayProviderQuotaWindowMs);
    this.relayProviderDeploymentLimit = Math.max(0, relayProviderDeploymentLimit);
    this.relayProviderDocumentLimit = Math.max(0, relayProviderDocumentLimit);
    this.now = now;
    this.relayTokenCodec = validRelaySigningSecret(relaySigningSecret)
      ? new RepositoryRelayTokenCodec(relaySigningSecret)
      : null;
    this.specialistFixturePort = specialistFixturePort;
  }

  /** Returns the protocol-4 sidecar without merging its colliding tool methods into v4.1. */
  getRelayService(): RepositoryRelayServicePort {
    return {
      createDirectoryMention: this.createDirectoryMention.bind(this),
      readRelayState: this.readRelayState.bind(this),
      claimRelay: this.claimRelay.bind(this),
      renewRelayLease: this.renewRelayLease.bind(this),
      releaseRelayLease: this.releaseRelayLease.bind(this),
      issueExecutionPermit: this.issueExecutionPermit.bind(this),
      executeRelayTool: this.executeRelayTool.bind(this),
      recordRelayManifest: this.recordRelayManifest.bind(this),
      recordRelayTrace: this.recordRelayTrace.bind(this),
      beginStep: this.beginStep.bind(this),
      recordStepResult: this.recordStepResult.bind(this),
      loadVerifiedToolResult: this.loadVerifiedToolResult.bind(this),
      readAssignment: this.readAssignment.bind(this),
      readDocumentContext: this.readDocumentContext.bind(this),
      readCollaborationContext: this.readManagedCollaborationContext.bind(this),
      commentOnAssignment: this.commentOnAssignment.bind(this),
      submitScopedRevision: this.submitScopedRevision.bind(this),
    };
  }

  async createDirectoryMention(
    sessionToken: string,
    input: CreateDirectoryMentionServiceInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<DirectoryMentionReceipt>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return relayFailure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.relayReplay<DirectoryMentionReceipt>(resolved, "directory.mention", input);
    if (replay) return replay;
    if (!isRecord(input)
      || !isUuid(input.requestId)
      || !isCounter(input.expectedRevision)
      || !boundedText(input.comment, ISSUE_COMMENT_MAX_LENGTH)
      || !isRecord(input.target)
      || !this.validAnchorInputShape(input.anchor)) {
      return this.recordRelayReplay(resolved, "directory.mention", input,
        relayFailure("INVALID_INPUT", "The directory mention input is invalid."));
    }
    const workspace = resolved.workspace;
    const stale = this.requireHead(workspace, input.expectedRevision);
    if (stale) return this.recordRelayReplay(resolved, "directory.mention", input, stale);

    if (input.target.kind === "HUMAN"
      && hasExactKeys(input, ["expectedRevision", "requestId", "comment", "target", "anchor"])
      && hasExactKeys(input.target, ["kind", "memberId"])
      && isUuid(input.target.memberId)) {
      const managedMemberIds = new Set([...workspace.managedAgentsByProfileId.values()]
        .map(({ entry }) => entry.principal.memberId));
      const target = workspace.members.get(input.target.memberId);
      if (!target || managedMemberIds.has(target.memberId)
        || !this.validDirectoryComment(input.comment, target.displayName)) {
        return this.recordRelayReplay(resolved, "directory.mention", input,
          relayFailure("STALE_MENTION_TARGET", "The selected human changed. Choose them again."));
      }
      if (workspace.threads.filter((thread) => thread.taskId === null).length
        >= ISSUE_STANDALONE_THREAD_LIMIT) {
        return this.recordRelayReplay(resolved, "directory.mention", input,
          relayFailure("RATE_LIMITED", "The standalone thread limit has been reached."));
      }
      const anchor = this.makeAnchor(workspace, input.anchor);
      if (!anchor) {
        return this.recordRelayReplay(resolved, "directory.mention", input,
          relayFailure("INVALID_INPUT", "The discussion target is invalid."));
      }
      const timestamp = this.stamp(workspace);
      const threadId = randomUUID();
      const commentId = randomUUID();
      const comment: IssueComment = {
        commentId,
        threadId,
        replyToCommentId: null,
        author: humanActor(resolved.member),
        origin: "ORDINARY_UI",
        createdRevision: workspace.document.revision,
        body: input.comment,
        evidenceRefs: [],
        createdAt: timestamp,
      };
      workspace.threads.push({
        threadId,
        taskId: null,
        creationAnchor: clone(anchor),
        anchor,
        status: "OPEN",
        createdBy: this.memberSnapshot(resolved.member),
        createdAt: timestamp,
        resolvedBy: null,
        resolvedAt: null,
        comments: [comment],
      });
      this.appendActivity(workspace, {
        kind: "THREAD_CREATED",
        actor: comment.author,
        threadId,
        commentId,
        excerpt: input.comment,
        timestamp,
      });
      const receipt: DirectoryMentionReceipt = {
        outcome: "DISCUSSION_CREATED",
        target: clone(input.target),
        threadId,
        commentId,
        taskId: null,
        runId: null,
      };
      this.notify(workspace.id);
      return this.recordRelayReplay(resolved, "directory.mention", input,
        { ok: true, data: receipt });
    }

    if (!hasExactKeys(input, [
      "expectedRevision", "requestId", "comment", "target", "anchor",
    ])
      || input.target.kind !== "AGENT"
      || !hasExactKeys(input.target, ["kind", "profileId"])
      || !isUuid(input.target.profileId)
      || input.anchor.scope !== "SELECTION") {
      return this.recordRelayReplay(resolved, "directory.mention", input,
        relayFailure("INVALID_INPUT", "The canonical directory target is invalid."));
    }
    const managed = workspace.managedAgentsByProfileId.get(input.target.profileId)?.entry;
    if (!managed || !isManagedAgentHandle(managed.handle) || managed.readiness !== "READY"
      || !this.validDirectoryComment(input.comment, managed.displayName)) {
      return this.recordRelayReplay(resolved, "directory.mention", input,
        relayFailure(managed?.readiness === "DISABLED" ? "RELAY_UNAVAILABLE" : "STALE_MENTION_TARGET",
          managed?.readiness === "DISABLED"
            ? "Managed Relay is not configured on this server."
            : "The selected managed agent changed. Choose it again."));
    }
    const compiled = compileIssueMention(input.comment, managed.displayName);
    if (!compiled.ok) {
      return this.recordRelayReplay(resolved, "directory.mention", input,
        relayFailure("INVALID_INPUT", "The managed mention instruction is invalid."));
    }
    if (workspace.tasks.length >= ISSUE_WORKSPACE_TASK_LIMIT
      || this.activeTasks(workspace).length >= ISSUE_ACTIVE_TASK_LIMIT
      || this.activeTasks(workspace).filter((task) => task.assignee.memberId === managed.principal.memberId).length
        >= ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT) {
      return this.recordRelayReplay(resolved, "directory.mention", input,
        relayFailure("RATE_LIMITED", "The active task limit has been reached."));
    }
    const anchor = this.makeAnchor(workspace, input.anchor);
    if (!anchor || anchor.scope !== "SELECTION"
      || issuePointLength(anchor.selectedText) > RELAY_BOUNDS.maxSelectionCodePoints) {
      return this.recordRelayReplay(resolved, "directory.mention", input,
        relayFailure("INVALID_INPUT", "Managed work requires a valid bounded selection."));
    }
    const timestamp = this.stamp(workspace);
    const accessProfile = relayAccessProfileForManagedHandle(managed.handle);
    const accessPolicy = RELAY_ACCESS_POLICIES[accessProfile];
    const taskId = randomUUID();
    const threadId = randomUUID();
    const commentId = randomUUID();
    const runId = randomUUID();
    const sourceValue = anchor.field === "TITLE" ? workspace.document.title : workspace.document.body;
    const context: IssueTaskContextSnapshot = {
      sourceRevision: workspace.document.revision,
      sourceDigest: digest(workspace.document.title, workspace.document.body),
      documentTitle: workspace.document.title,
      field: anchor.field,
      rangeStart: anchor.rangeStart,
      rangeEnd: anchor.rangeEnd,
      targetText: anchor.selectedText,
      beforeText: issueSlice(sourceValue,
        Math.max(0, anchor.rangeStart - ISSUE_TASK_CONTEXT_SIDE_MAX_LENGTH), anchor.rangeStart),
      afterText: issueSlice(sourceValue, anchor.rangeEnd,
        anchor.rangeEnd + ISSUE_TASK_CONTEXT_SIDE_MAX_LENGTH),
      priorContext: this.snapshotPriorContext(workspace),
    };
    const creator = this.memberSnapshot(resolved.member);
    if (!workspace.members.has(managed.principal.memberId)) {
      workspace.members.set(managed.principal.memberId, {
        ...clone(managed.principal),
        color: MEMBER_COLORS[workspace.members.size % MEMBER_COLORS.length]!,
      });
    }
    const task: StoredTask = {
      taskId,
      taskKey: `TASK-${workspace.nextTaskNumber++}`,
      title: compiled.value.title,
      category: accessPolicy.taskCategory,
      instruction: compiled.value.instruction,
      agentLabel: managed.displayName,
      agentProfileId: null,
      context: null,
      managedAgentProfileId: managed.profileId,
      managedContext: context,
      mode: "DIRECT",
      status: "OPEN",
      creationAnchor: clone(anchor),
      anchor: clone(anchor),
      creator,
      assignee: clone(managed.principal),
      threadId,
      proposal: null,
      result: null,
      decision: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    };
    const comment: IssueComment = {
      commentId,
      threadId,
      replyToCommentId: null,
      author: humanActor(resolved.member),
      origin: "ORDINARY_UI",
      createdRevision: workspace.document.revision,
      body: input.comment,
      evidenceRefs: [],
      createdAt: timestamp,
    };
    const run: RelayRun = {
      runId,
      taskId,
      profileId: managed.profileId,
      agentExpertise: managed.expertise,
      accessProfile,
      runtime: MANAGED_AGENT_RUNTIME,
      model: MANAGED_AGENT_MODEL,
      status: "QUEUED",
      attemptCount: 0,
      maxAttempts: RELAY_BOUNDS.maxAttemptsPerRun,
      terminalReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    workspace.tasks.push(task);
    workspace.threads.push({
      threadId,
      taskId,
      creationAnchor: clone(anchor),
      anchor: clone(anchor),
      status: "OPEN",
      createdBy: creator,
      createdAt: timestamp,
      resolvedBy: null,
      resolvedAt: null,
      comments: [comment],
    });
    workspace.relayRuns.push(run);
    this.appendActivity(workspace, {
      kind: "TASK_CREATED",
      actor: comment.author,
      taskId,
      threadId,
      commentId,
      excerpt: input.comment,
      timestamp,
    });
    this.appendRelayTrace(workspace, run, null, { kind: "RUN_QUEUED" }, timestamp);
    const receipt: DirectoryMentionReceipt = {
      outcome: "MANAGED_TASK_QUEUED",
      target: clone(input.target),
      threadId,
      commentId,
      taskId,
      runId,
    };
    this.notify(workspace.id);
    return this.recordRelayReplay(resolved, "directory.mention", input,
      { ok: true, data: receipt });
  }

  async readRelayState(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayWorkspaceState>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return relayFailure("UNAUTHORIZED", "A valid human session is required.");
    this.reconcileExpiredRelay(resolved.workspace);
    const managedMemberIds = new Set([...resolved.workspace.managedAgentsByProfileId.values()]
      .map(({ entry }) => entry.principal.memberId));
    const managed = [...resolved.workspace.managedAgentsByProfileId.values()]
      .map(({ entry }) => clone(entry))
      .sort((left, right) => MANAGED_AGENT_DIRECTORY_SEEDS.findIndex((seed) => seed.handle === left.handle)
        - MANAGED_AGENT_DIRECTORY_SEEDS.findIndex((seed) => seed.handle === right.handle));
    const usedHandles = this.reservedDirectoryHandles();
    for (const agent of managed) usedHandles.add(agent.handle.toLowerCase());
    const humans = [...resolved.workspace.members.values()]
      .filter((member) => !managedMemberIds.has(member.memberId))
      .sort((left, right) => left.displayName.localeCompare(right.displayName)
        || left.memberId.localeCompare(right.memberId))
      .map((member) => ({
        kind: "HUMAN" as const,
        member: this.memberSnapshot(member),
        handle: this.uniqueDirectoryHandle(
          member.displayName, member.memberId, "h", usedHandles,
        ),
        displayName: member.displayName,
      }));
    const selfDeclared = [...resolved.workspace.agentsByMemberId.values()]
      .sort((left, right) => left.name.localeCompare(right.name)
        || left.profileId.localeCompare(right.profileId))
      .map((profile) => ({
        kind: "AGENT" as const,
        profileId: profile.profileId,
        principal: clone(profile.member),
        handle: this.uniqueDirectoryHandle(
          profile.name, profile.profileId, "a", usedHandles,
        ),
        displayName: profile.name,
        visibility: "PERSONAL" as const,
        readiness: "READY" as const,
        identitySource: "SELF_DECLARED" as const,
        expertise: "GENERAL" as const,
        runtime: "BRING_YOUR_OWN_AGENT" as const,
        logicalToolNames: [...REPOSITORY_TOOL_NAMES],
        syntheticSourceLabels: [] as [],
      }));
    const activeAttempt = resolved.workspace.relayAttempts.find((attempt) =>
      !["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status)) ?? null;
    return {
      ok: true,
      data: {
        directory: [...humans, ...managed, ...selfDeclared],
        runs: resolved.workspace.relayRuns.slice().sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId)).map(clone),
        activeAttempt: activeAttempt ? stateAttemptView(activeAttempt) : null,
        trace: resolved.workspace.relayTrace.slice(-RELAY_BOUNDS.maxTraceEventsPerStateRead).map(clone),
        currentRelayEventVersion: resolved.workspace.relayEventVersion,
        webMcpRequired: true,
        recoveryHeartbeatMs: RELAY_BOUNDS.recoveryHeartbeatMs,
      },
    };
  }

  async claimRelay(
    sessionToken: string,
    pageSessionId: string,
    requestId: string,
    retryRunId?: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return relayFailure("UNAUTHORIZED", "A valid human session is required.");
    if (!isUuid(pageSessionId) || !isUuid(requestId)
      || (retryRunId !== undefined && !isUuid(retryRunId))) {
      return relayFailure("INVALID_INPUT", "A page session and idempotency key are required.");
    }
    if (!this.relayTokenCodec) {
      return relayFailure("RELAY_UNAVAILABLE", "Managed Relay is not configured on this server.");
    }
    const workspace = resolved.workspace;
    const credentialDigest = relaySecretDigest(sessionToken);
    const pageDigest = relaySecretDigest(pageSessionId);
    const prior = workspace.relayAttempts.find((attempt) => attempt.claimRequestId === requestId);
    if (prior) {
      const exact = prior.grantClaims.claimantMemberId === resolved.member.memberId
        && prior.grantClaims.credentialSessionDigest === credentialDigest
        && prior.grantClaims.pageSessionDigest === pageDigest
        && prior.retryRunId === (retryRunId ?? null);
      if (!exact) return relayFailure("REQUEST_REPLAY_MISMATCH", "This request ID was already used with different input.");
      const run = workspace.relayRuns.find((entry) => entry.runId === prior.runId);
      const agent = run && workspace.managedAgentsByProfileId.get(run.profileId)?.entry;
      if (!run || !agent) return relayFailure("RELAY_STATE_CONFLICT", "The prior Relay claim is no longer coherent.");
      return {
        ok: true,
        data: {
          outcome: "CLAIMED",
          run: clone(run),
          attempt: claimedAttemptView(prior),
          agent: clone(agent),
          capabilityGrant: this.capabilityGrant(run),
          grant: this.relayTokenCodec.signGrant(prior.grantClaims),
        },
      };
    }
    this.reconcileExpiredRelay(workspace);
    const activeRun = workspace.relayRuns.find((run) => run.status === "ACTIVE");
    if (activeRun) {
      const activeAttempt = workspace.relayAttempts.find((attempt) => attempt.runId === activeRun.runId
        && !["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status));
      const retryAfterMs = activeAttempt
        ? Math.max(1, Math.min(RELAY_BOUNDS.recoveryHeartbeatMs,
          Date.parse(activeAttempt.leaseExpiresAt) - this.now()))
        : RELAY_BOUNDS.recoveryHeartbeatMs;
      return { ok: true, data: { outcome: "BUSY", retryAfterMs, activeRunId: activeRun.runId } };
    }
    const run = workspace.relayRuns
      .filter((entry) => entry.status === "QUEUED" || entry.status === "WAITING_RETRY")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.runId.localeCompare(right.runId))[0];
    if (!run) {
      if (retryRunId !== undefined) {
        return relayFailure("RELAY_STATE_CONFLICT", "The requested Relay retry is no longer available.");
      }
      return { ok: true, data: { outcome: "NO_WORK", retryAfterMs: RELAY_BOUNDS.recoveryHeartbeatMs } };
    }
    if (run.status === "WAITING_RETRY" && retryRunId === undefined) {
      return { ok: true, data: { outcome: "NO_WORK", retryAfterMs: RELAY_BOUNDS.recoveryHeartbeatMs } };
    }
    if ((run.status === "WAITING_RETRY" && retryRunId !== run.runId)
      || (run.status === "QUEUED" && retryRunId !== undefined)) {
      return relayFailure("RELAY_STATE_CONFLICT", "The explicit Relay retry does not match the queue head.");
    }
    const task = workspace.tasks.find((entry) => entry.taskId === run.taskId);
    const agent = workspace.managedAgentsByProfileId.get(run.profileId)?.entry;
    if (!task || task.status !== "OPEN" || task.managedAgentProfileId !== run.profileId || !agent) {
      this.cancelRelayLineage(workspace, run.taskId, "TASK_STALE");
      return relayFailure("RELAY_STATE_CONFLICT", "The queued managed task is no longer eligible.");
    }
    const now = this.stamp(workspace);
    const nowMs = Date.parse(now);
    const attemptId = randomUUID();
    const leaseId = randomUUID();
    const attemptNumber = run.attemptCount + 1;
    const deadlineAt = new Date(nowMs + RELAY_BOUNDS.attemptDeadlineMs).toISOString();
    const claims: RelayGrantClaims = {
      v: 1,
      aud: RELAY_GRANT_AUDIENCE,
      documentId: workspace.id,
      profileId: run.profileId,
      taskId: run.taskId,
      runId: run.runId,
      attemptId,
      claimantMemberId: resolved.member.memberId,
      credentialSessionDigest: credentialDigest,
      pageSessionDigest: pageDigest,
      leaseId,
      registrationGeneration: attemptNumber,
      nonce: randomBytes(18).toString("base64url"),
      issuedAt: now,
      expiresAt: new Date(Math.min(nowMs + RELAY_BOUNDS.grantTtlMs, workspace.expiresAt)).toISOString(),
    };
    const grant = this.relayTokenCodec.signGrant(claims);
    const attempt: StoredRelayAttempt = {
      attemptId,
      runId: run.runId,
      attemptNumber,
      status: "CLAIMED",
      claimedBy: this.memberSnapshot(resolved.member),
      pageSessionId,
      registrationGeneration: attemptNumber,
      registrationScope: randomBytes(8).toString("hex"),
      leaseId,
      leaseExpiresAt: new Date(nowMs + RELAY_BOUNDS.leaseTtlMs).toISOString(),
      providerDispatched: false,
      providerCallCount: 0,
      toolCallCount: 0,
      currentStep: 0,
      startedAt: now,
      deadlineAt,
      updatedAt: now,
      completedAt: null,
      claimRequestId: requestId,
      retryRunId: retryRunId ?? null,
      grantClaims: claims,
      grantDigest: relaySecretDigest(grant),
      grantRevokedAt: null,
      previousProviderResponseId: null,
      previousOutcome: null,
      manifest: null,
      steps: new Map(),
    };
    if (!this.reserveRelayProviderDispatch(workspace.id, attemptId, Date.parse(deadlineAt))) {
      return relayFailure(
        "RATE_LIMITED",
        "The managed Relay provider-run quota is reached for this rolling window.",
        true,
      );
    }
    workspace.relayAttempts.push(attempt);
    run.status = "ACTIVE";
    run.attemptCount = attemptNumber;
    run.updatedAt = now;
    this.appendRelayTrace(workspace, run, attempt, { kind: "RUN_CLAIMED" }, now);
    return {
      ok: true,
      data: {
        outcome: "CLAIMED",
        run: clone(run),
        attempt: claimedAttemptView(attempt),
        agent: clone(agent),
        capabilityGrant: this.capabilityGrant(run),
        grant,
      },
    };
  }

  async renewRelayLease(
    grant: RelayGrant,
    expectedLeaseId: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimedAttemptView>> {
    throwIfAborted(signal);
    if (!isUuid(expectedLeaseId)) return relayFailure("INVALID_INPUT", "A valid expected lease is required.");
    const authorized = this.authorizeRelayGrant(grant);
    if (!authorized.ok) return authorized;
    const { workspace, attempt, run } = authorized;
    if (attempt.leaseId !== expectedLeaseId || Date.parse(attempt.leaseExpiresAt) <= this.now()
      || Date.parse(attempt.deadlineAt) <= this.now()) {
      return relayFailure("RELAY_LEASE_LOST", "The managed Relay lease was lost.");
    }
    const timestamp = this.stamp(workspace);
    attempt.leaseExpiresAt = new Date(Math.min(
      this.now() + RELAY_BOUNDS.leaseTtlMs,
      Date.parse(attempt.deadlineAt),
    )).toISOString();
    attempt.updatedAt = timestamp;
    this.appendRelayTrace(workspace, run, attempt, { kind: "LEASE_RENEWED" }, timestamp);
    return { ok: true, data: claimedAttemptView(attempt) };
  }

  async releaseRelayLease(
    grant: RelayGrant,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayRun>> {
    throwIfAborted(signal);
    const authorized = this.authorizeRelayGrant(grant, true, true);
    if (!authorized.ok) return authorized;
    const { workspace, attempt, run } = authorized;
    if (!attempt.providerDispatched) this.releaseRelayProviderReservation(attempt.attemptId);
    if (attempt.grantRevokedAt !== null) return { ok: true, data: clone(run) };
    const timestamp = this.stamp(workspace);
    if (run.status === "COMPLETED" && attempt.status === "SUCCEEDED") {
      if (!workspace.relayTrace.some((event) => event.runId === run.runId
        && event.kind === "RUN_COMPLETED")
        && workspace.relayTrace.some((event) => event.runId === run.runId
          && event.kind === "IDLE_CATALOG_RESTORED")) {
        this.appendRelayTrace(workspace, run, attempt, { kind: "RUN_COMPLETED" }, timestamp);
      }
      attempt.grantRevokedAt = timestamp;
      attempt.updatedAt = timestamp;
      this.revokeAttemptPermits(workspace, attempt.attemptId, timestamp);
      return { ok: true, data: clone(run) };
    }
    attempt.grantRevokedAt = timestamp;
    attempt.updatedAt = timestamp;
    this.revokeAttemptPermits(workspace, attempt.attemptId, timestamp);
    if (!attempt.providerDispatched) {
      attempt.status = "EXPIRED";
      attempt.completedAt = timestamp;
      run.status = run.attemptCount >= run.maxAttempts ? "EXHAUSTED" : "QUEUED";
      run.terminalReason = run.status === "EXHAUSTED" ? "ATTEMPTS_EXHAUSTED" : null;
      run.completedAt = run.status === "EXHAUSTED" ? timestamp : null;
      run.updatedAt = timestamp;
      if (run.status === "EXHAUSTED") {
        this.appendRelayTrace(workspace, run, attempt, {
          kind: "ATTEMPT_FAILED",
          detail: { reason: "RELEASED_BEFORE_DISPATCH" },
        }, timestamp);
        this.appendRelayTrace(workspace, run, attempt, { kind: "RUN_EXHAUSTED" }, timestamp);
      }
    } else if (run.status === "ACTIVE" && Date.parse(attempt.deadlineAt) <= this.now()) {
      this.failExecutingAttemptPermits(workspace, attempt.attemptId, timestamp);
      attempt.status = "FAILED";
      run.status = run.attemptCount >= run.maxAttempts ? "EXHAUSTED" : "WAITING_RETRY";
      run.terminalReason = run.status === "EXHAUSTED" ? "ATTEMPTS_EXHAUSTED" : null;
      run.completedAt = run.status === "EXHAUSTED" ? timestamp : null;
      run.updatedAt = timestamp;
      this.appendRelayTrace(workspace, run, attempt, {
        kind: "ATTEMPT_FAILED",
        detail: { reason: "ATTEMPT_DEADLINE_EXPIRED" },
      }, timestamp);
      this.appendRelayTrace(workspace, run, attempt, {
        kind: run.status === "EXHAUSTED" ? "RUN_EXHAUSTED" : "RUN_WAITING_RETRY",
      }, timestamp);
    } else if (run.status === "ACTIVE"
      && (!["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status)
        || [...attempt.steps.values()].some((step) =>
          step.status === "TERMINAL" && step.result?.ok === false
          && step.result.code === "RELAY_PROVIDER_OUTCOME_UNKNOWN"))) {
      attempt.status = "RECONCILING";
      attempt.completedAt = null;
      run.updatedAt = timestamp;
      if (!workspace.relayTrace.some((event) => event.attemptId === attempt.attemptId
        && event.kind === "ATTEMPT_RECONCILING")) {
        this.appendRelayTrace(workspace, run, attempt, { kind: "ATTEMPT_RECONCILING" }, timestamp);
      }
    }
    return { ok: true, data: clone(run) };
  }

  async issueExecutionPermit(
    grant: RelayGrant,
    input: IssueRelayPermitInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayExecutionPermit>> {
    throwIfAborted(signal);
    if (!hasExactKeys(input, ["attemptId", "functionCallId", "physicalToolName", "arguments"])
      || !isUuid(input.attemptId)
      || !boundedOpaqueId(input.functionCallId, 512)
      || typeof input.physicalToolName !== "string"
      || !RELAY_PHYSICAL_TOOL_NAME_PATTERN.test(input.physicalToolName)
      || !isRecord(input.arguments)) {
      return relayFailure("INVALID_INPUT", "The execution-permit request is invalid.");
    }
    if (Buffer.byteLength(relayCanonicalJson(input.arguments), "utf8")
      > RELAY_BOUNDS.maxFunctionArgumentsBytes) {
      return relayFailure("RELAY_RESULT_INVALID", "The managed tool arguments exceed their bound.");
    }
    const authorized = this.authorizeRelayGrant(grant);
    if (!authorized.ok) return authorized;
    const { workspace, attempt, run } = authorized;
    if (attempt.attemptId !== input.attemptId) {
      return relayFailure("RELAY_STATE_CONFLICT", "The execution permit targets another attempt.");
    }
    const logicalToolName = this.logicalToolForPhysicalName(run, attempt, input.physicalToolName);
    if (!logicalToolName) {
      return relayFailure("RELAY_MANIFEST_MISMATCH", "The physical tool is not in the active managed catalog.");
    }
    const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalToolName];
    if (!matchesRelayToolInput(logicalToolName, input.arguments)) {
      return relayFailure("RELAY_RESULT_INVALID", "The managed tool arguments are invalid.");
    }
    void definition;
    const argumentsDigest = relaySha256(input.arguments);
    const permitKey = `${attempt.attemptId}:${input.functionCallId}`;
    const existing = workspace.relayPermits.get(permitKey);
    if (existing) {
      if (existing.claims.physicalToolName !== input.physicalToolName
        || existing.claims.argumentsDigest !== argumentsDigest
        || relayCanonicalJson(existing.arguments) !== relayCanonicalJson(input.arguments)) {
        return relayFailure("REQUEST_REPLAY_MISMATCH", "This function call was already bound to different input.");
      }
      const token = this.relayTokenCodec!.signPermit(existing.claims);
      return { ok: true, data: this.executionPermit(existing.claims, token) };
    }
    if (attempt.toolCallCount >= RELAY_BOUNDS.maxToolCallsPerAttempt) {
      return relayFailure("RATE_LIMITED", "The managed tool-call budget is exhausted.");
    }
    const timestamp = this.stamp(workspace);
    const expiresAt = new Date(Math.min(
      this.now() + RELAY_BOUNDS.executionPermitTtlMs,
      Date.parse(attempt.leaseExpiresAt),
      Date.parse(attempt.deadlineAt),
    )).toISOString();
    const claims: RelayExecutionPermitClaims = {
      v: 1,
      aud: RELAY_EXECUTION_PERMIT_AUDIENCE,
      attemptId: attempt.attemptId,
      functionCallId: input.functionCallId,
      physicalToolName: input.physicalToolName,
      argumentsDigest,
      registrationGeneration: attempt.registrationGeneration,
      leaseId: attempt.leaseId,
      nonce: randomBytes(18).toString("base64url"),
      issuedAt: timestamp,
      expiresAt,
    };
    const token = this.relayTokenCodec!.signPermit(claims);
    workspace.relayPermits.set(permitKey, {
      claims,
      tokenDigest: relaySecretDigest(token),
      status: "ISSUED",
      documentId: workspace.id,
      runId: run.runId,
      taskId: run.taskId,
      profileId: run.profileId,
      logicalToolName,
      arguments: clone(input.arguments),
      requestId: randomUUID(),
      executionIdempotencyKey: null,
      resultReceiptId: null,
      output: null,
      outputDigest: null,
      failure: null,
      createdAt: timestamp,
      completedAt: null,
    });
    return { ok: true, data: this.executionPermit(claims, token) };
  }

  async executeRelayTool(
    grant: RelayGrant,
    input: IssueRelayToolExecutionInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ resultReceiptId: string; output: string }>> {
    throwIfAborted(signal);
    if (!hasExactKeys(input, ["requestId", "permit", "physicalToolName", "input"])
      || !isUuid(input.requestId)
      || typeof input.permit !== "string"
      || typeof input.physicalToolName !== "string"
      || !isRecord(input.input)) {
      return relayFailure("INVALID_INPUT", "The managed tool request is invalid.");
    }
    const authorized = this.authorizeRelayGrant(grant, true);
    if (!authorized.ok) return authorized;
    const { workspace, attempt, run, task, agent } = authorized;
    const permitClaims = this.relayTokenCodec?.verifyPermit(input.permit);
    if (!permitClaims || permitClaims.attemptId !== attempt.attemptId
      || permitClaims.physicalToolName !== input.physicalToolName
      || permitClaims.registrationGeneration !== attempt.registrationGeneration
      || permitClaims.leaseId !== attempt.leaseId
      || permitClaims.argumentsDigest !== relaySha256(input.input)) {
      return relayFailure("RELAY_EXECUTION_NOT_ARMED", "The managed tool execution permit is invalid.");
    }
    const permit = workspace.relayPermits.get(`${attempt.attemptId}:${permitClaims.functionCallId}`);
    if (!permit || permit.tokenDigest !== relaySecretDigest(input.permit)
      || permit.logicalToolName !== this.logicalToolForPhysicalName(run, attempt, input.physicalToolName)
      || relayCanonicalJson(permit.arguments) !== relayCanonicalJson(input.input)) {
      return relayFailure("RELAY_EXECUTION_NOT_ARMED", "The managed tool execution permit does not match this call.");
    }
    if (permit.executionIdempotencyKey !== null
      && permit.executionIdempotencyKey !== input.requestId) {
      return relayFailure("REQUEST_REPLAY_MISMATCH", "This tool permit was already consumed by another request.");
    }
    if (permit.status === "COMPLETED" && permit.resultReceiptId && permit.output) {
      return { ok: true, data: { resultReceiptId: permit.resultReceiptId, output: permit.output } };
    }
    if (permit.status === "FAILED" && permit.failure) return clone(permit.failure);
    if (permit.status !== "ISSUED") {
      return relayFailure("RELAY_EXECUTION_NOT_ARMED", "The one-shot tool permit is already in use.");
    }
    if (run.status !== "ACTIVE"
      || ["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status)
      || Date.parse(attempt.leaseExpiresAt) <= this.now()
      || Date.parse(attempt.deadlineAt) <= this.now()
      || Date.parse(permitClaims.expiresAt) <= this.now()) {
      return relayFailure("RELAY_EXECUTION_NOT_ARMED", "The managed tool execution permit is expired or inactive.");
    }
    permit.status = "EXECUTING";
    permit.executionIdempotencyKey = input.requestId;
    attempt.status = "EXECUTING_TOOL";
    attempt.updatedAt = this.stamp(workspace);
    this.appendRelayTrace(workspace, run, attempt, {
      kind: "WEBMCP_EXECUTE_STARTED",
      logicalToolName: permit.logicalToolName,
      physicalToolName: input.physicalToolName,
      argumentsDigest: permitClaims.argumentsDigest,
    }, attempt.updatedAt);
    const context: RelayToolInvocationContext = {
      documentId: workspace.id,
      runId: run.runId,
      attemptId: attempt.attemptId,
      taskId: task.taskId,
      profileId: agent.profileId,
      registrationGeneration: attempt.registrationGeneration,
      physicalToolName: input.physicalToolName,
      logicalToolName: permit.logicalToolName,
      requestId: permit.requestId,
    };
    let toolResult: RepositoryResult<Readonly<Record<string, unknown>>>;
    try {
      toolResult = await this.invokeManagedTool(context, input.input, signal);
    } catch (error) {
      const failed = relayFailure(
        "RELAY_RESULT_INVALID",
        error instanceof DOMException && error.name === "AbortError"
          ? "The managed tool execution was cancelled."
          : "The managed tool execution failed.",
        false,
      );
      permit.status = "FAILED";
      permit.failure = failed;
      permit.completedAt = this.stamp(workspace);
      return failed;
    }
    const outputEnvelope = toolResult.ok
      ? { ok: true as const, data: clone(toolResult.data) }
      : { ok: false as const, code: toolResult.code, message: toolResult.message, retryable: toolResult.retryable };
    const output = relayCanonicalJson(outputEnvelope);
    if (Buffer.byteLength(output, "utf8") > RELAY_BOUNDS.maxVerifiedToolResultBytes) {
      const failed = relayFailure("RELAY_RESULT_INVALID", "The managed tool result exceeds its bound.");
      permit.status = "FAILED";
      permit.failure = failed;
      permit.completedAt = this.stamp(workspace);
      return failed;
    }
    const completedAt = this.stamp(workspace);
    permit.status = "COMPLETED";
    permit.resultReceiptId = randomUUID();
    permit.output = output;
    permit.outputDigest = relaySha256(outputEnvelope);
    permit.completedAt = completedAt;
    attempt.status = (run.status as RelayRun["status"]) === "COMPLETED"
      ? "SUCCEEDED"
      : "AWAITING_MODEL";
    attempt.updatedAt = completedAt;
    this.appendRelayTrace(workspace, run, attempt, {
      kind: "WEBMCP_EXECUTE_COMPLETED",
      logicalToolName: permit.logicalToolName,
      physicalToolName: input.physicalToolName,
      argumentsDigest: permitClaims.argumentsDigest,
      resultDigest: permit.outputDigest,
    }, completedAt);
    return { ok: true, data: { resultReceiptId: permit.resultReceiptId, output } };
  }

  async recordRelayManifest(
    grant: RelayGrant,
    manifest: RelayNormalizedToolManifest,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ digest: `sha256:${string}` }>> {
    throwIfAborted(signal);
    const authorized = this.authorizeRelayGrant(grant);
    if (!authorized.ok) return authorized;
    const { attempt, run } = authorized;
    if (!this.validRelayManifest(manifest, run, attempt)) {
      return relayFailure("RELAY_MANIFEST_MISMATCH", "The page tool manifest does not match the managed catalog.");
    }
    if (attempt.manifest && relayCanonicalJson(attempt.manifest) !== relayCanonicalJson(manifest)) {
      return relayFailure("RELAY_MANIFEST_MISMATCH", "The managed catalog changed within this attempt.");
    }
    if (attempt.manifest) return { ok: true, data: { digest: attempt.manifest.digest } };
    attempt.manifest = clone(manifest);
    const timestamp = this.stamp(authorized.workspace);
    this.appendRelayTrace(authorized.workspace, authorized.run, attempt, {
      kind: "WEBMCP_GET_TOOLS_COMPLETED",
      manifestDigest: manifest.digest,
      detail: { toolCount: manifest.entries.length },
    }, timestamp);
    return { ok: true, data: { digest: manifest.digest } };
  }

  async recordRelayTrace(
    grant: RelayGrant,
    input: RelayBrowserTraceInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayTraceEvent>> {
    throwIfAborted(signal);
    const authorized = this.authorizeRelayGrant(grant, true);
    if (!authorized.ok) return authorized;
    if (!this.validBrowserRelayTraceInput(input)) {
      return relayFailure("INVALID_INPUT", "The Relay trace event is invalid.");
    }
    const attemptEvents = authorized.workspace.relayTrace.filter((event) =>
      event.attemptId === authorized.attempt.attemptId).length;
    if (attemptEvents >= RELAY_BOUNDS.maxTraceEventsPerAttempt) {
      return relayFailure("RATE_LIMITED", "The Relay trace event limit is reached.");
    }
    const event = this.appendRelayTrace(
      authorized.workspace,
      authorized.run,
      authorized.attempt,
      input,
      this.stamp(authorized.workspace),
    );
    return { ok: true, data: clone(event) };
  }

  async beginStep(
    grant: RelayGrant,
    reservation: RelayStepReservationInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayBeginStepResult>> {
    throwIfAborted(signal);
    if (!hasExactKeys(reservation, ["requestId", "inputDigest", "attemptId", "expectedStep"])
      || !isUuid(reservation.requestId)
      || !isUuid(reservation.attemptId)
      || !/^sha256:[0-9a-f]{64}$/u.test(reservation.inputDigest)
      || !isCounter(reservation.expectedStep)) {
      return relayFailure("INVALID_INPUT", "The Relay step reservation is invalid.");
    }
    const authorized = this.authorizeRelayGrant(grant, true);
    if (!authorized.ok) return authorized;
    const { workspace, attempt, run, agent } = authorized;
    if (attempt.attemptId !== reservation.attemptId) {
      return relayFailure("RELAY_STATE_CONFLICT", "The Relay step targets another attempt.");
    }
    const existing = attempt.steps.get(reservation.requestId);
    if (existing) {
      if (existing.inputDigest !== reservation.inputDigest
        || existing.expectedStep !== reservation.expectedStep) {
        return relayFailure("REQUEST_REPLAY_MISMATCH", "This step request ID was already used with different input.");
      }
      if (existing.status === "TERMINAL" && existing.result) {
        return { ok: true, data: { disposition: "RECORDED", result: clone(existing.result) } };
      }
      return { ok: true, data: { disposition: "IN_PROGRESS", retryAfterMs: RELAY_BOUNDS.recoveryHeartbeatMs } };
    }
    const finalReceiptContinuation = run.status === "COMPLETED"
      && run.terminalReason === "TASK_COMPLETED"
      && attempt.status === "SUCCEEDED"
      && attempt.previousOutcome?.outcome === "EXECUTE_TOOL";
    if (!finalReceiptContinuation && (run.status !== "ACTIVE"
      || ["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status)
      || Date.parse(attempt.leaseExpiresAt) <= this.now()
      || Date.parse(attempt.deadlineAt) <= this.now())) {
      return relayFailure("RELAY_LEASE_LOST", "The managed Relay lease was lost.");
    }
    if (reservation.expectedStep !== attempt.currentStep
      || attempt.steps.size >= RELAY_BOUNDS.maxResponsesCallsPerAttempt
      || [...attempt.steps.values()].some((step) => step.status === "RESERVED")) {
      return relayFailure("RELAY_STATE_CONFLICT", "The Relay step cursor is not available.");
    }
    if (!finalReceiptContinuation && !attempt.providerDispatched
      && !this.consumeRelayProviderDispatch(workspace.id, attempt.attemptId)) {
      return relayFailure(
        "RELAY_STATE_CONFLICT",
        "The managed Relay provider authorization reservation is missing.",
      );
    }
    const timestamp = this.stamp(workspace);
    attempt.steps.set(reservation.requestId, {
      ...reservation,
      status: "RESERVED",
      providerResponseId: null,
      result: null,
      createdAt: timestamp,
      completedAt: null,
    });
    attempt.providerDispatched = true;
    if (!finalReceiptContinuation) attempt.status = "AWAITING_MODEL";
    attempt.updatedAt = timestamp;
    return {
      ok: true,
      data: {
        disposition: "AUTHORIZED",
        context: {
          run: clone(run),
          attempt: this.privateRelayAttempt(attempt),
          agent: clone(agent),
          previousProviderResponseId: attempt.previousProviderResponseId,
          previousOutcome: clone(attempt.previousOutcome),
        },
      },
    };
  }

  async recordStepResult(
    grant: RelayGrant,
    record: RelayStepRecordInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ attempt: RelayAttempt; result: RelayResult<RelayStepOutcome> }>> {
    throwIfAborted(signal);
    const authorized = this.authorizeRelayGrant(grant, true);
    if (!authorized.ok) return authorized;
    const { workspace, attempt, run, task } = authorized;
    const stored = attempt.steps.get(record.requestId);
    if (!stored || attempt.attemptId !== record.attemptId
      || stored.inputDigest !== record.inputDigest
      || stored.expectedStep !== record.expectedStep) {
      return relayFailure("RELAY_STATE_CONFLICT", "The Relay step reservation does not match.");
    }
    if (stored.status === "TERMINAL" && stored.result) {
      if (relayCanonicalJson(stored.result) !== relayCanonicalJson(record.result)
        || stored.providerResponseId !== record.providerResponseId) {
        return relayFailure("REQUEST_REPLAY_MISMATCH", "The Relay step result changed on replay.");
      }
      return { ok: true, data: { attempt: this.privateRelayAttempt(attempt), result: clone(stored.result) } };
    }
    if (stored.status !== "RESERVED") {
      return relayFailure("RELAY_STATE_CONFLICT", "The Relay step is not reserved.");
    }
    const timestamp = this.stamp(workspace);
    stored.status = "TERMINAL";
    stored.providerResponseId = record.providerResponseId;
    stored.result = clone(record.result);
    stored.completedAt = timestamp;
    const providerOutcomeUnknown = !record.result.ok
      && record.result.code === "RELAY_PROVIDER_OUTCOME_UNKNOWN";
    if (record.providerResponseId !== null || providerOutcomeUnknown) {
      attempt.providerCallCount += 1;
    }
    if (!record.result.ok) {
      const committedLineage = run.status === "COMPLETED"
        && run.terminalReason === "TASK_COMPLETED"
        && task.status === "COMPLETED";
      if (providerOutcomeUnknown && !committedLineage) {
        attempt.status = "RECONCILING";
        attempt.completedAt = null;
        if (!workspace.relayTrace.some((event) => event.attemptId === attempt.attemptId
          && event.kind === "ATTEMPT_RECONCILING")) {
          this.appendRelayTrace(workspace, run, attempt, {
            kind: "ATTEMPT_RECONCILING",
            detail: { reason: "PROVIDER_OUTCOME_UNKNOWN" },
          }, timestamp);
        }
      } else if (!committedLineage && !providerOutcomeUnknown) {
        attempt.status = "FAILED";
        attempt.completedAt = timestamp;
        run.status = run.attemptCount >= run.maxAttempts ? "EXHAUSTED" : "WAITING_RETRY";
        run.terminalReason = run.status === "EXHAUSTED" ? "ATTEMPTS_EXHAUSTED" : null;
        run.completedAt = run.status === "EXHAUSTED" ? timestamp : null;
        this.appendRelayTrace(workspace, run, attempt, { kind: "ATTEMPT_FAILED" }, timestamp);
        this.appendRelayTrace(workspace, run, attempt, {
          kind: run.status === "EXHAUSTED" ? "RUN_EXHAUSTED" : "RUN_WAITING_RETRY",
        }, timestamp);
      }
    } else {
      const outcome = record.result.data;
      const previousOutcome = attempt.previousOutcome;
      attempt.currentStep = outcome.nextStep;
      attempt.previousProviderResponseId = record.providerResponseId;
      attempt.previousOutcome = clone(outcome);
      if (outcome.outcome === "DISCOVER_TOOLS") {
        attempt.status = "DISCOVERING";
        if (previousOutcome === null) {
          this.appendRelayTrace(workspace, run, attempt, { kind: "MODEL_TOOL_SEARCH_REQUESTED" }, timestamp);
        }
      }
      if (outcome.outcome === "EXECUTE_TOOL") {
        attempt.status = "EXECUTING_TOOL";
        attempt.toolCallCount += 1;
        this.appendRelayTrace(workspace, run, attempt, {
          kind: "MODEL_TOOL_SELECTED",
          physicalToolName: outcome.physicalToolName,
          argumentsDigest: outcome.permit.argumentsDigest,
        }, timestamp);
      }
      if (outcome.outcome === "COMPLETED") {
        attempt.status = "SUCCEEDED";
        attempt.completedAt = timestamp;
        run.status = "COMPLETED";
        run.terminalReason = "TASK_COMPLETED";
        run.completedAt ??= timestamp;
      }
      if (outcome.outcome === "RETRY_REQUIRED") {
        if (run.status !== "COMPLETED" || run.terminalReason !== "TASK_COMPLETED"
          || task.status !== "COMPLETED") {
          attempt.status = "FAILED";
          attempt.completedAt = timestamp;
          run.status = outcome.run.status;
          run.terminalReason = outcome.run.terminalReason;
          run.completedAt = outcome.run.completedAt;
        }
      }
    }
    attempt.updatedAt = timestamp;
    run.updatedAt = timestamp;
    return { ok: true, data: { attempt: this.privateRelayAttempt(attempt), result: clone(record.result) } };
  }

  async loadVerifiedToolResult(
    grant: RelayGrant,
    resultReceiptId: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ functionCallId: string; output: string }>> {
    throwIfAborted(signal);
    if (!isUuid(resultReceiptId)) return relayFailure("RELAY_RESULT_INVALID", "The tool result receipt is invalid.");
    const authorized = this.authorizeRelayGrant(grant, true);
    if (!authorized.ok) return authorized;
    const permit = [...authorized.workspace.relayPermits.values()].find((entry) =>
      entry.claims.attemptId === authorized.attempt.attemptId
      && entry.resultReceiptId === resultReceiptId);
    if (!permit || permit.status !== "COMPLETED" || !permit.output) {
      return relayFailure("RELAY_RESULT_INVALID", "The verified tool result was not found.");
    }
    return { ok: true, data: { functionCallId: permit.claims.functionCallId, output: permit.output } };
  }

  async readAssignment(
    context: RelayToolInvocationContext,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<RelayReadAssignmentResult>> {
    throwIfAborted(signal);
    const authorized = this.authorizeToolContext(context);
    if (!authorized.ok) return authorized;
    const thread = authorized.workspace.threads.find((entry) =>
      entry.threadId === authorized.task.threadId);
    if (!thread) return failure("NOT_FOUND", "The managed assignment thread was not found.");
    return {
      ok: true,
      data: {
        task: { task: this.managedTaskProjection(authorized.task), thread: publicThread(thread) },
        agent: clone(authorized.agent),
        capabilityGrant: this.capabilityGrant(authorized.run),
      },
    };
  }

  async readDocumentContext(
    context: RelayToolInvocationContext,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<RelayReadDocumentContextResult>> {
    throwIfAborted(signal);
    const authorized = this.authorizeToolContext(context);
    if (!authorized.ok) return authorized;
    return {
      ok: true,
      data: {
        document: clone(authorized.workspace.document),
        anchor: clone(authorized.task.anchor),
        recentRevisions: authorized.workspace.revisions
          .slice(-RELAY_RECENT_REVISION_LIMIT)
          .reverse()
          .map(clone),
      },
    };
  }

  async readManagedCollaborationContext(
    context: RelayToolInvocationContext,
    limit: number,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<{ tasks: IssueTask[]; comments: IssueComment[] }>> {
    throwIfAborted(signal);
    const authorized = this.authorizeToolContext(context);
    if (!authorized.ok) return authorized;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
      return failure("INVALID_INPUT", "The collaboration-context limit is invalid.");
    }
    const tasks = authorized.workspace.tasks
      .filter((task) => task.taskId !== authorized.task.taskId)
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)
        || left.taskId.localeCompare(right.taskId))
      .slice(0, limit)
      .map((task) => task.managedAgentProfileId
        ? this.managedTaskProjection(task)
        : publicTask(task));
    const comments = authorized.workspace.threads
      .flatMap((thread) => thread.comments)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)
        || left.commentId.localeCompare(right.commentId))
      .slice(0, limit)
      .map(clone);
    return { ok: true, data: { tasks, comments } };
  }

  async commentOnAssignment(
    context: RelayToolInvocationContext,
    input: RelayProgressCommentInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<{ comment: IssueComment }>> {
    throwIfAborted(signal);
    const authorized = this.authorizeToolContext(context);
    if (!authorized.ok) return authorized;
    const replay = this.toolReplay<{ comment: IssueComment }>(authorized.workspace, context, input);
    if (replay) return replay;
    if (!hasExactKeys(input, ["body", "evidenceRefs"])
      || !boundedText(input.body, ISSUE_COMMENT_MAX_LENGTH)
      || !validEvidence(input.evidenceRefs)) {
      return this.recordToolReplay(authorized.workspace, context, input,
        failure("INVALID_INPUT", "The assignment comment is invalid."));
    }
    const thread = authorized.workspace.threads.find((entry) =>
      entry.threadId === authorized.task.threadId);
    if (!thread) return failure("NOT_FOUND", "The managed assignment thread was not found.");
    if (thread.comments.length >= ISSUE_THREAD_COMMENT_LIMIT) {
      return failure("RATE_LIMITED", "The task thread is full.");
    }
    const timestamp = this.stamp(authorized.workspace);
    const comment: IssueComment = {
      commentId: randomUUID(),
      threadId: thread.threadId,
      replyToCommentId: null,
      author: managedAgentActor(authorized.task, authorized.agent),
      origin: "WEBMCP",
      createdRevision: authorized.workspace.document.revision,
      body: input.body,
      evidenceRefs: clone(input.evidenceRefs),
      createdAt: timestamp,
    };
    thread.comments.push(comment);
    this.appendActivity(authorized.workspace, {
      kind: "COMMENT_ADDED",
      actor: comment.author,
      taskId: authorized.task.taskId,
      threadId: thread.threadId,
      commentId: comment.commentId,
      excerpt: comment.body,
      timestamp,
    });
    const result = { ok: true, data: { comment: clone(comment) } } as const;
    this.notify(authorized.workspace.id);
    return this.recordToolReplay(authorized.workspace, context, input, result);
  }

  async submitScopedRevision(
    context: RelayToolInvocationContext,
    input: RelaySubmitRevisionInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<{ revision: IssueRevision; task: IssueTask }>> {
    throwIfAborted(signal);
    const authorized = this.authorizeToolContext(context);
    if (!authorized.ok) return authorized;
    const replay = this.toolReplay<{ revision: IssueRevision; task: IssueTask }>(
      authorized.workspace, context, input,
    );
    if (replay) return replay;
    if (!hasExactKeys(input, ["basedOnRevision", "resultSummary", "replacementText", "evidenceRefs"])
      || !Number.isSafeInteger(input.basedOnRevision) || input.basedOnRevision < 1
      || !boundedText(input.resultSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH)
      || !boundedText(input.replacementText, ISSUE_BODY_MAX_LENGTH)
      || !validEvidence(input.evidenceRefs)) {
      return this.recordToolReplay(authorized.workspace, context, input,
        failure("INVALID_INPUT", "The scoped revision input is invalid."));
    }
    const { workspace, task, agent, attempt, run } = authorized;
    if (task.status === "STALE") {
      return this.recordToolReplay(workspace, context, input,
        failure("STALE_TASK_CONTEXT", "The managed task target is stale.", false,
          { currentTask: publicTask(task) }));
    }
    if (task.status !== "OPEN" || task.mode !== "DIRECT") {
      return this.recordToolReplay(workspace, context, input,
        failure("TASK_MODE_VIOLATION", "Only an Open Direct task accepts this revision."));
    }
    if (input.basedOnRevision < task.anchor.createdRevision
      || input.basedOnRevision > workspace.document.revision) {
      return this.recordToolReplay(workspace, context, input,
        failure("INVALID_INPUT", "The source revision is outside this task's valid range."));
    }
    const live = this.liveSelection(workspace, task);
    if (!live) {
      this.cancelRelayLineage(workspace, task.taskId, "TASK_STALE");
      return this.recordToolReplay(workspace, context, input,
        failure("STALE_TASK_CONTEXT", "The managed task target is stale."));
    }
    if (input.replacementText === live.selectedText) {
      return this.recordToolReplay(workspace, context, input,
        failure("INVALID_INPUT", "The replacement must change the selected passage."));
    }
    const max = live.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH;
    const nextField = replaceIssueRange(live.value, live.anchor.rangeStart,
      live.anchor.rangeEnd, input.replacementText);
    if (issuePointLength(nextField) > max
      || (live.field === "TITLE" && nextField.trim().length === 0)) {
      return this.recordToolReplay(workspace, context, input,
        failure("INVALID_INPUT", "The replacement exceeds the document bounds."));
    }
    const timestamp = this.stamp(workspace);
    const actor = managedAgentActor(task, agent);
    task.status = "COMPLETED";
    task.result = {
      outcome: "COMMITTED",
      resultSummary: input.resultSummary,
      evidenceRefs: clone(input.evidenceRefs),
      sourceRevision: input.basedOnRevision,
      resultRevision: workspace.document.revision + 1,
      liveAnchor: clone(live.anchor),
      replacementText: input.replacementText,
      submittedBy: actor,
      submittedAt: timestamp,
    };
    task.updatedAt = timestamp;
    task.resolvedAt = timestamp;
    const revision = this.appendRevision(workspace, {
      title: live.field === "TITLE" ? nextField : workspace.document.title,
      body: live.field === "BODY" ? nextField : workspace.document.body,
      provenance: {
        authority: "DIRECT",
        origin: "WEBMCP",
        authorOrigin: "WEBMCP",
        taskId: task.taskId,
        sourceRevision: input.basedOnRevision,
        author: actor,
        committer: actor,
        grantedBy: clone(task.creator),
        approvedBy: null,
        restoredRevision: null,
      },
      changeSummary: input.resultSummary,
      evidenceRefs: clone(input.evidenceRefs),
      ownTaskId: task.taskId,
      ownReplacement: { field: live.field, replacement: input.replacementText },
      activityKind: "TASK_COMPLETED",
      timestamp,
    });
    this.resolveTaskThread(workspace, task, task.assignee, timestamp);
    run.status = "COMPLETED";
    run.terminalReason = "TASK_COMPLETED";
    run.updatedAt = timestamp;
    run.completedAt = timestamp;
    attempt.status = "SUCCEEDED";
    attempt.updatedAt = timestamp;
    attempt.completedAt = timestamp;
    this.appendRelayTrace(workspace, run, attempt, {
      kind: "REVISION_COMMITTED",
      detail: { revision: revision.revision },
    }, timestamp);
    const result = {
      ok: true,
      data: { revision: clone(revision), task: this.managedTaskProjection(task) },
    } as const;
    this.notify(workspace.id);
    return this.recordToolReplay(workspace, context, input, result);
  }

  async resetPostmortemHero(
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ResetPostmortemHeroOutcome>> {
    throwIfAborted(signal);
    if (this.resetInFlight) {
      return failure("RATE_LIMITED", "A fixture reset is already in progress.");
    }
    if (!this.consumeCredentialIssuance("reset")) {
      return failure("RATE_LIMITED", "The fixture reset rate limit has been reached.");
    }
    this.resetInFlight = true;
    try {
      this.removeWorkspace(HERO_DOCUMENT_ID);
      const { workspace, bundle: priya } = this.createWorkspace(
        "POSTMORTEM",
        POSTMORTEM_EXAMPLE.title,
        POSTMORTEM_EXAMPLE.body,
        "Priya Shah",
        POSTMORTEM_EXAMPLE.launchSummary,
        { documentId: HERO_DOCUMENT_ID, revisionId: HERO_REVISION_ID, memberId: HERO_PRIYA_ID },
      );
      const nadiaMember = this.addMember(workspace, "Nadia Chen", HERO_NADIA_ID);
      const leoMember = this.addMember(workspace, "Leo Park", HERO_LEO_ID);
      const samMember = this.addMember(workspace, "Sam Rivera", HERO_SAM_ID);
      const nadia = this.issueBundle(workspace, nadiaMember, priya.shareToken);
      const leo = this.issueBundle(workspace, leoMember, priya.shareToken);
      const sam = this.issueBundle(workspace, samMember, priya.shareToken);
      this.seedAgentProfile(workspace, nadiaMember, "Databot", 0, HERO_PROFILE_IDS.nadia);
      this.seedAgentProfile(workspace, leoMember, "Logbot", 0, HERO_PROFILE_IDS.leo);
      this.seedAgentProfile(workspace, samMember, "Builder", 0, HERO_PROFILE_IDS.sam);

      const placeholder = "Investigation in progress.";
      const mentions = [
        {
          spec: POSTMORTEM_EXAMPLE.tasks.impact,
          memberId: nadia.selfMemberId,
          occurrence: 1,
          identity: {
            taskId: "00000000-0000-4000-8000-000000005131",
            threadId: "00000000-0000-4000-8000-000000005141",
            commentId: "00000000-0000-4000-8000-000000005151",
          },
        },
        {
          spec: POSTMORTEM_EXAMPLE.tasks.timeline,
          memberId: leo.selfMemberId,
          occurrence: 2,
          identity: {
            taskId: "00000000-0000-4000-8000-000000005132",
            threadId: "00000000-0000-4000-8000-000000005142",
            commentId: "00000000-0000-4000-8000-000000005152",
          },
        },
        {
          spec: POSTMORTEM_EXAMPLE.tasks.cause,
          memberId: sam.selfMemberId,
          occurrence: 3,
          identity: {
            taskId: "00000000-0000-4000-8000-000000005133",
            threadId: "00000000-0000-4000-8000-000000005143",
            commentId: "00000000-0000-4000-8000-000000005153",
          },
        },
      ] as const;
      for (const mention of mentions) {
        this.expectSuccess(await this.createMentionTask(priya.humanSessionToken, {
          requestId: randomUUID(), expectedRevision: 1,
          comment: mention.spec.prompt,
          mentionedAgentName: mention.spec.agentName,
          assignedToMemberId: mention.memberId,
          anchor: anchorForOccurrence(POSTMORTEM_EXAMPLE.body, placeholder, mention.occurrence),
        }), `create reset ${mention.spec.agentName} mention`);
        this.setHeroTaskIdentity(workspace, workspace.tasks.at(-1)!, {
          ...mention.identity,
          taskKey: workspace.tasks.at(-1)!.taskKey,
        });
      }
      this.setExampleContextSides(workspace.tasks[0]!, "## Impact\n\n", "\n\n## Timeline\n\nInvestigation in progress.");
      this.setExampleContextSides(workspace.tasks[1]!, "## Timeline\n\n", "\n\n## Root cause\n\nInvestigation in progress.");
      this.setExampleContextSides(workspace.tasks[2]!, "## Root cause\n\n", "\n\n## Detection and response");
      const current = (bundle: IssueSessionBundle): IssueSessionBundle => ({ ...bundle, surface: this.surface(workspace) });
      throwIfAborted(signal);
      return {
        ok: true,
        data: {
          fixtureVersion: "repo-document-v4.postmortem.v1",
          shareToken: priya.shareToken,
          priyaBootstrapPath: this.bootstrapPath(current(priya)),
          nadiaBootstrapPath: this.bootstrapPath(current(nadia)),
          leoBootstrapPath: this.bootstrapPath(current(leo)),
          samBootstrapPath: this.bootstrapPath(current(sam)),
          expiresAt: new Date(workspace.expiresAt).toISOString(),
          revision: 1,
          activityVersion: 4,
        },
      };
    } finally {
      this.resetInFlight = false;
    }
  }

  async launch(
    input: LaunchIssueHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueSessionBundle>> {
    throwIfAborted(signal);
    this.cleanupExpired();
    if (!hasExactKeys(input, ["kind", "displayName"])
      || !ISSUE_DOCUMENT_KINDS.includes(input.kind)
      || !this.validDisplayName(input.displayName)) {
      return failure("INVALID_INPUT", "A valid issue kind and display name are required.");
    }
    if (!this.consumeCredentialIssuance("launch")) {
      return failure("RATE_LIMITED", "The issue launch rate limit has been reached.");
    }
    const template = input.kind === "POSTMORTEM"
      ? { title: POSTMORTEM_TEMPLATE_TITLE, body: POSTMORTEM_TEMPLATE_BODY, summary: "Launch incident postmortem." }
      : { title: PRODUCT_DOCUMENT_TEMPLATE_TITLE, body: PRODUCT_DOCUMENT_TEMPLATE_BODY, summary: "Launch product document." };
    const { bundle } = this.createWorkspace(
      input.kind,
      template.title,
      template.body,
      input.displayName,
      template.summary,
    );
    return { ok: true, data: bundle };
  }

  async launchExample(
    input: LaunchIssueExampleHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueSessionBundle>> {
    throwIfAborted(signal);
    if (!hasExactKeys(input, ["kind", "displayName"])
      || !ISSUE_DOCUMENT_KINDS.includes(input.kind)
      || !this.validDisplayName(input.displayName)) {
      return failure("INVALID_INPUT", "A valid example kind and display name are required.");
    }
    if (!this.consumeCredentialIssuance("example")) {
      return failure("RATE_LIMITED", "The public example rate limit has been reached.");
    }
    const bundle = input.kind === "POSTMORTEM"
      ? await this.buildPostmortemExample(input.displayName)
      : await this.buildProductDocumentExample(input.displayName);
    throwIfAborted(signal);
    return { ok: true, data: bundle };
  }

  async join(input: JoinIssueHttpInput, signal?: AbortSignal): Promise<RepositoryResult<IssueSessionBundle>> {
    throwIfAborted(signal);
    this.cleanupExpired();
    if (!hasExactKeys(input, ["shareToken", "displayName"])
      || typeof input.shareToken !== "string"
      || !/^[A-Za-z0-9_-]{32,128}$/.test(input.shareToken)
      || !this.validDisplayName(input.displayName)) {
      return failure("INVALID_INPUT", "A valid share token and display name are required.");
    }
    if (!this.consumeCredentialIssuance("join", secretDigest(input.shareToken))) {
      return failure("RATE_LIMITED", "The issue join rate limit has been reached.");
    }
    const workspaceId = this.workspaceIdsByShareTokenHash.get(secretDigest(input.shareToken));
    const workspace = workspaceId ? this.workspaces.get(workspaceId) : undefined;
    if (!workspace) return failure("NOT_FOUND", "The issue was not found.");
    const member = this.addMember(workspace, input.displayName);
    return { ok: true, data: this.issueBundle(workspace, member, input.shareToken) };
  }

  async inspect(sessionToken: string, signal?: AbortSignal): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    return { ok: true, data: this.surface(resolved.workspace) };
  }

  async inspectAsAgent(
    agentSessionToken: string,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    return { ok: true, data: this.surface(connected.resolved.workspace) };
  }

  async saveHumanRevision(
    sessionToken: string,
    input: SaveIssueRevisionServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "save", input);
    if (replay) return replay;
    if (!hasExactKeys(input, ["expectedRevision", "requestId", "title", "body"])
      || !isUuid(input.requestId)
      || !isCounter(input.expectedRevision)
      || !boundedText(input.title, ISSUE_TITLE_MAX_LENGTH)
      || !boundedText(input.body, ISSUE_BODY_MAX_LENGTH, true)) {
      return this.recordReplay(resolved, "save", input, failure("INVALID_INPUT", "The revision input is invalid."));
    }
    const stale = this.requireHead(resolved.workspace, input.expectedRevision);
    if (stale) return this.recordReplay(resolved, "save", input, stale);
    if (input.title === resolved.workspace.document.title && input.body === resolved.workspace.document.body) {
      const result = { ok: true, data: this.surface(resolved.workspace) } as const;
      return this.recordReplay(resolved, "save", input, result);
    }
    const actor = humanActor(resolved.member);
    const titleChanged = input.title !== resolved.workspace.document.title;
    const bodyChanged = input.body !== resolved.workspace.document.body;
    const changeSummary = titleChanged && bodyChanged
      ? "Edited the document title and body."
      : titleChanged
        ? "Edited the document title."
        : "Edited the document.";
    this.appendRevision(resolved.workspace, {
      title: input.title,
      body: input.body,
      provenance: {
        authority: "HUMAN",
        origin: "ORDINARY_UI",
        authorOrigin: "ORDINARY_UI",
        taskId: null,
        sourceRevision: input.expectedRevision,
        author: actor,
        committer: actor,
        grantedBy: null,
        approvedBy: null,
        restoredRevision: null,
      },
      changeSummary,
      evidenceRefs: [],
      activityKind: "REVISION_SAVED",
    });
    const result = { ok: true, data: this.surface(resolved.workspace) } as const;
    this.notify(resolved.workspace.id);
    return this.recordReplay(resolved, "save", input, result);
  }

  async createTask(
    sessionToken: string,
    input: CreateIssueTaskServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "task.create", input);
    if (replay) return replay;
    if (!this.validCreateTaskInput(input)) {
      return this.recordReplay(resolved, "task.create", input, failure("INVALID_INPUT", "The task input is invalid."));
    }
    const workspace = resolved.workspace;
    const stale = this.requireHead(workspace, input.expectedRevision);
    if (stale) return this.recordReplay(resolved, "task.create", input, stale);
    const managedAssignee = [...workspace.managedAgentsByProfileId.values()].some(
      ({ entry }) => entry.principal.memberId === input.assignedToMemberId,
    );
    if (managedAssignee) {
      return this.recordReplay(resolved, "task.create", input, failure(
        "STALE_AGENT_PROFILE",
        "Managed directory agents require the directory mention flow.",
      ));
    }
    const assignee = workspace.members.get(input.assignedToMemberId);
    if (!assignee) {
      return this.recordReplay(resolved, "task.create", input, failure("NOT_FOUND", "The assignee is not a member of this issue."));
    }
    if (workspace.tasks.length >= ISSUE_WORKSPACE_TASK_LIMIT
      || this.activeTasks(workspace).length >= ISSUE_ACTIVE_TASK_LIMIT
      || this.activeTasks(workspace).filter((task) => task.assignee.memberId === assignee.memberId).length >= ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT) {
      return this.recordReplay(resolved, "task.create", input, failure("RATE_LIMITED", "The active task limit has been reached."));
    }
    const anchor = this.makeAnchor(workspace, input.anchor);
    if (!anchor || ((input.mode === "REVIEW" || input.mode === "DIRECT") && anchor.scope !== "SELECTION")) {
      return this.recordReplay(resolved, "task.create", input, failure("INVALID_INPUT", "This task mode requires a valid target selection."));
    }
    const timestamp = this.stamp(workspace);
    const taskId = randomUUID();
    const threadId = randomUUID();
    const task: StoredTask = {
      taskId,
      taskKey: `${this.taskPrefix(input.category)}-${workspace.nextTaskNumber++}`,
      title: input.title,
      category: input.category,
      instruction: input.instruction,
      agentLabel: input.agentLabel,
      agentProfileId: null,
      context: null,
      mode: input.mode,
      status: "OPEN",
      creationAnchor: clone(anchor),
      anchor,
      creator: this.memberSnapshot(resolved.member),
      assignee: this.memberSnapshot(assignee),
      threadId,
      proposal: null,
      result: null,
      decision: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    };
    workspace.tasks.push(task);
    workspace.threads.push({
      threadId,
      taskId,
      creationAnchor: clone(anchor),
      anchor: clone(anchor),
      status: "OPEN",
      createdBy: clone(task.creator),
      createdAt: timestamp,
      resolvedBy: null,
      resolvedAt: null,
      comments: [],
    });
    this.appendActivity(workspace, {
      kind: "TASK_CREATED",
      actor: humanActor(resolved.member),
      taskId,
      threadId,
      excerpt: input.instruction,
      timestamp,
    });
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, "task.create", input, result);
  }

  async createMentionTask(
    sessionToken: string,
    input: CreateMentionTaskServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "mention.create", input);
    if (replay) return replay;
    if (!hasExactKeys(input, [
      "expectedRevision", "requestId", "comment", "mentionedAgentName",
      "assignedToMemberId", "anchor",
    ])
      || !isUuid(input.requestId)
      || !isCounter(input.expectedRevision)
      || !isUuid(input.assignedToMemberId)
      || !this.validAnchorInputShape(input.anchor)) {
      return this.recordReplay(resolved, "mention.create", input, failure("INVALID_INPUT", "The mention input is invalid."));
    }
    const workspace = resolved.workspace;
    const stale = this.requireHead(workspace, input.expectedRevision);
    if (stale) return this.recordReplay(resolved, "mention.create", input, stale);
    const managedAssignee = [...workspace.managedAgentsByProfileId.values()].some(
      ({ entry }) => entry.principal.memberId === input.assignedToMemberId,
    );
    if (managedAssignee) {
      return this.recordReplay(resolved, "mention.create", input, failure(
        "STALE_AGENT_PROFILE",
        "Managed directory agents require the directory mention flow.",
      ));
    }
    const assignee = workspace.members.get(input.assignedToMemberId);
    const profile = workspace.agentsByMemberId.get(input.assignedToMemberId);
    if (!assignee || !profile || profile.name !== input.mentionedAgentName) {
      return this.recordReplay(resolved, "mention.create", input, failure(
        "STALE_AGENT_PROFILE",
        "The selected agent profile changed. Choose the agent again.",
      ));
    }
    const compiled = compileIssueMention(input.comment, input.mentionedAgentName);
    if (!compiled.ok) {
      return this.recordReplay(resolved, "mention.create", input, failure("INVALID_INPUT", "The selected mention is not a valid agent prompt."));
    }
    if (workspace.tasks.length >= ISSUE_WORKSPACE_TASK_LIMIT
      || this.activeTasks(workspace).length >= ISSUE_ACTIVE_TASK_LIMIT
      || this.activeTasks(workspace).filter((task) => task.assignee.memberId === assignee.memberId).length >= ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT) {
      return this.recordReplay(resolved, "mention.create", input, failure("RATE_LIMITED", "The active task limit has been reached."));
    }
    const anchor = this.makeAnchor(workspace, input.anchor);
    if (!anchor || anchor.scope !== "SELECTION") {
      return this.recordReplay(resolved, "mention.create", input, failure("INVALID_INPUT", "Agent work requires a valid target selection."));
    }
    const timestamp = this.stamp(workspace);
    const taskId = randomUUID();
    const threadId = randomUUID();
    const commentId = randomUUID();
    const sourceValue = anchor.field === "TITLE" ? workspace.document.title : workspace.document.body;
    const context: IssueTaskContextSnapshot = {
      sourceRevision: workspace.document.revision,
      sourceDigest: digest(workspace.document.title, workspace.document.body),
      documentTitle: workspace.document.title,
      field: anchor.field,
      rangeStart: anchor.rangeStart,
      rangeEnd: anchor.rangeEnd,
      targetText: anchor.selectedText,
      beforeText: issueSlice(
        sourceValue,
        Math.max(0, anchor.rangeStart - ISSUE_TASK_CONTEXT_SIDE_MAX_LENGTH),
        anchor.rangeStart,
      ),
      afterText: issueSlice(
        sourceValue,
        anchor.rangeEnd,
        anchor.rangeEnd + ISSUE_TASK_CONTEXT_SIDE_MAX_LENGTH,
      ),
      priorContext: this.snapshotPriorContext(workspace),
    };
    const creator = this.memberSnapshot(resolved.member);
    const task: StoredTask = {
      taskId,
      taskKey: `TASK-${workspace.nextTaskNumber++}`,
      title: compiled.value.title,
      category: "GENERAL",
      instruction: compiled.value.instruction,
      agentLabel: profile.name,
      agentProfileId: profile.profileId,
      context,
      mode: "DIRECT",
      status: "OPEN",
      creationAnchor: clone(anchor),
      anchor: clone(anchor),
      creator,
      assignee: this.memberSnapshot(assignee),
      threadId,
      proposal: null,
      result: null,
      decision: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    };
    const comment: IssueComment = {
      commentId,
      threadId,
      replyToCommentId: null,
      author: humanActor(resolved.member),
      origin: "ORDINARY_UI",
      createdRevision: workspace.document.revision,
      body: input.comment,
      evidenceRefs: [],
      createdAt: timestamp,
    };
    workspace.tasks.push(task);
    workspace.threads.push({
      threadId,
      taskId,
      creationAnchor: clone(anchor),
      anchor: clone(anchor),
      status: "OPEN",
      createdBy: creator,
      createdAt: timestamp,
      resolvedBy: null,
      resolvedAt: null,
      comments: [comment],
    });
    this.appendActivity(workspace, {
      kind: "TASK_CREATED",
      actor: humanActor(resolved.member),
      taskId,
      threadId,
      commentId,
      excerpt: input.comment,
      timestamp,
    });
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, "mention.create", input, result);
  }

  async createThread(
    sessionToken: string,
    input: CreateIssueThreadServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "thread.create", input);
    if (replay) return replay;
    if (!hasExactKeys(input, ["expectedRevision", "requestId", "body", "anchor"])
      || !isUuid(input.requestId) || !isCounter(input.expectedRevision)
      || !boundedText(input.body, ISSUE_COMMENT_MAX_LENGTH)
      || !this.validAnchorInputShape(input.anchor)) {
      return this.recordReplay(resolved, "thread.create", input, failure("INVALID_INPUT", "The thread input is invalid."));
    }
    const workspace = resolved.workspace;
    const stale = this.requireHead(workspace, input.expectedRevision);
    if (stale) return this.recordReplay(resolved, "thread.create", input, stale);
    if (workspace.threads.filter((thread) => thread.taskId === null).length >= ISSUE_STANDALONE_THREAD_LIMIT) {
      return this.recordReplay(resolved, "thread.create", input, failure("RATE_LIMITED", "The standalone thread limit has been reached."));
    }
    const anchor = this.makeAnchor(workspace, input.anchor);
    if (!anchor) return this.recordReplay(resolved, "thread.create", input, failure("INVALID_INPUT", "The thread target is invalid."));
    const timestamp = this.stamp(workspace);
    const threadId = randomUUID();
    const author = humanActor(resolved.member);
    workspace.threads.push({
      threadId,
      taskId: null,
      creationAnchor: clone(anchor),
      anchor,
      status: "OPEN",
      createdBy: this.memberSnapshot(resolved.member),
      createdAt: timestamp,
      resolvedBy: null,
      resolvedAt: null,
      comments: [{
        commentId: randomUUID(),
        threadId,
        replyToCommentId: null,
        author,
        origin: "ORDINARY_UI",
        createdRevision: workspace.document.revision,
        body: input.body,
        evidenceRefs: [],
        createdAt: timestamp,
      }],
    });
    const comment = workspace.threads.at(-1)!.comments[0]!;
    this.appendActivity(workspace, {
      kind: "THREAD_CREATED",
      actor: author,
      threadId,
      commentId: comment.commentId,
      excerpt: comment.body,
      timestamp,
    });
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, "thread.create", input, result);
  }

  async addHumanComment(
    sessionToken: string,
    input: AddHumanIssueCommentServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "thread.comment", input);
    if (replay) return replay;
    if (!this.validCommentInput(input, "threadId")) return this.recordReplay(resolved, "thread.comment", input, failure("INVALID_INPUT", "The comment input is invalid."));
    const thread = resolved.workspace.threads.find((entry) => entry.threadId === input.threadId);
    if (!thread) return this.recordReplay(resolved, "thread.comment", input, failure("NOT_FOUND", "The thread was not found."));
    const replyFailure = this.validateReply(thread, input.replyToCommentId);
    if (replyFailure) return this.recordReplay(resolved, "thread.comment", input, replyFailure);
    if (thread.comments.length >= ISSUE_THREAD_COMMENT_LIMIT) return this.recordReplay(resolved, "thread.comment", input, failure("RATE_LIMITED", "The thread is full."));
    const timestamp = this.stamp(resolved.workspace);
    thread.comments.push({
      commentId: randomUUID(),
      threadId: thread.threadId,
      replyToCommentId: input.replyToCommentId ?? null,
      author: humanActor(resolved.member),
      origin: "ORDINARY_UI",
      createdRevision: resolved.workspace.document.revision,
      body: input.body,
      evidenceRefs: clone(input.evidenceRefs ?? []),
      createdAt: timestamp,
    });
    const comment = thread.comments.at(-1)!;
    this.appendActivity(resolved.workspace, {
      kind: "COMMENT_ADDED",
      actor: comment.author,
      taskId: thread.taskId,
      threadId: thread.threadId,
      commentId: comment.commentId,
      excerpt: comment.body,
      timestamp,
    });
    const result = { ok: true, data: this.surface(resolved.workspace) } as const;
    this.notify(resolved.workspace.id);
    return this.recordReplay(resolved, "thread.comment", input, result);
  }

  async resolveThread(
    sessionToken: string,
    input: ResolveIssueThreadServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "thread.resolve", input);
    if (replay) return replay;
    if (!hasExactKeys(input, ["requestId", "threadId"]) || !isUuid(input.requestId) || !isUuid(input.threadId)) {
      return this.recordReplay(resolved, "thread.resolve", input, failure("INVALID_INPUT", "The resolve input is invalid."));
    }
    const thread = resolved.workspace.threads.find((entry) => entry.threadId === input.threadId);
    if (!thread || thread.taskId !== null) {
      return this.recordReplay(resolved, "thread.resolve", input, failure("NOT_FOUND", "The standalone thread was not found."));
    }
    if (thread.status === "RESOLVED") {
      const noOp = { ok: true, data: this.surface(resolved.workspace) } as const;
      return this.recordReplay(resolved, "thread.resolve", input, noOp);
    }
    const timestamp = this.stamp(resolved.workspace);
    thread.status = "RESOLVED";
    thread.resolvedBy = this.memberSnapshot(resolved.member);
    thread.resolvedAt = timestamp;
    this.appendActivity(resolved.workspace, {
      kind: "THREAD_RESOLVED",
      actor: humanActor(resolved.member),
      threadId: thread.threadId,
      excerpt: thread.comments[0]?.body ?? resolved.workspace.document.title,
      timestamp,
    });
    const result = { ok: true, data: this.surface(resolved.workspace) } as const;
    this.notify(resolved.workspace.id);
    return this.recordReplay(resolved, "thread.resolve", input, result);
  }

  async cancelTask(
    sessionToken: string,
    input: CancelIssueTaskServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    if (!this.validTargetIdentity(input)) return failure("INVALID_INPUT", "The cancel input is invalid.");
    const task = resolved.workspace.tasks.find((entry) => entry.taskId === input.taskId);
    if (!task || task.creator.memberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "Only the task creator may cancel this task.");
    }
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "task.cancel", input);
    if (replay) return replay;
    if (!hasExactKeys(input, ["requestId", "taskId"])) {
      return this.recordReplay(resolved, "task.cancel", input, failure("INVALID_INPUT", "The cancel input is invalid."));
    }
    if (task.status !== "OPEN") return this.recordReplay(resolved, "task.cancel", input, failure("TASK_MODE_VIOLATION", "Only Open tasks may be cancelled.", false, { currentTask: publicTask(task) }));
    const timestamp = this.stamp(resolved.workspace);
    task.status = "CANCELLED";
    task.updatedAt = timestamp;
    task.resolvedAt = timestamp;
    if (task.managedAgentProfileId) {
      this.cancelRelayLineage(resolved.workspace, task.taskId, "TASK_CANCELLED");
    }
    this.resolveTaskThread(resolved.workspace, task, task.creator, timestamp);
    this.appendActivity(resolved.workspace, {
      kind: "TASK_CANCELLED",
      actor: humanActor(resolved.member),
      taskId: task.taskId,
      threadId: task.threadId,
      excerpt: task.instruction,
      timestamp,
    });
    const result = { ok: true, data: this.surface(resolved.workspace) } as const;
    this.notify(resolved.workspace.id);
    return this.recordReplay(resolved, "task.cancel", input, result);
  }

  async acceptTaskProposal(
    sessionToken: string,
    input: DecideIssueTaskServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return this.decideTask(sessionToken, input, "ACCEPTED", signal);
  }

  async rejectTaskProposal(
    sessionToken: string,
    input: DecideIssueTaskServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return this.decideTask(sessionToken, input, "REJECTED", signal);
  }

  async restoreRevision(
    sessionToken: string,
    input: RestoreIssueRevisionServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "revision.restore", input);
    if (replay) return replay;
    if (!hasExactKeys(input, ["requestId", "expectedRevision", "revision", "changeSummary"])
      || !isUuid(input.requestId) || !isCounter(input.expectedRevision)
      || !Number.isSafeInteger(input.revision) || input.revision < 1
      || !boundedText(input.changeSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH)) {
      return this.recordReplay(resolved, "revision.restore", input, failure("INVALID_INPUT", "The restore input is invalid."));
    }
    const stale = this.requireHead(resolved.workspace, input.expectedRevision);
    if (stale) return this.recordReplay(resolved, "revision.restore", input, stale);
    const target = resolved.workspace.revisions.find((revision) => revision.revision === input.revision);
    if (!target) return this.recordReplay(resolved, "revision.restore", input, failure("NOT_FOUND", "The requested revision was not found."));
    if (target.title === resolved.workspace.document.title && target.body === resolved.workspace.document.body) {
      return this.recordReplay(resolved, "revision.restore", input, failure("INVALID_INPUT", "The requested revision already matches the current document."));
    }
    const actor = humanActor(resolved.member);
    this.appendRevision(resolved.workspace, {
      title: target.title,
      body: target.body,
      provenance: {
        authority: "RESTORE",
        origin: "ORDINARY_UI",
        authorOrigin: "ORDINARY_UI",
        taskId: null,
        sourceRevision: target.revision,
        author: actor,
        committer: actor,
        grantedBy: null,
        approvedBy: null,
        restoredRevision: target.revision,
      },
      changeSummary: input.changeSummary,
      evidenceRefs: [],
      restore: true,
      activityKind: "REVISION_RESTORED",
    });
    const result = { ok: true, data: this.surface(resolved.workspace) } as const;
    this.notify(resolved.workspace.id);
    return this.recordReplay(resolved, "revision.restore", input, result);
  }

  async readHistory(
    sessionToken: string,
    input: ReadIssueHistoryInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ReadIssueHistoryOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    return this.readHistoryForWorkspace(resolved.workspace, input);
  }

  async readRevision(
    sessionToken: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueRevision>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    if (!Number.isSafeInteger(revision) || revision < 1) return failure("INVALID_INPUT", "A positive revision is required.");
    const found = resolved.workspace.revisions.find((entry) => entry.revision === revision);
    return found ? { ok: true, data: clone(found) } : failure("NOT_FOUND", "The revision was not found.");
  }

  async readHistoryAsAgent(
    agentSessionToken: string,
    input: ReadIssueHistoryInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ReadIssueHistoryOutcome>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    return this.readHistoryForWorkspace(connected.resolved.workspace, input);
  }

  async readRevisionAsAgent(
    agentSessionToken: string,
    revision: number,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueRevision>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    if (!Number.isSafeInteger(revision) || revision < 1) {
      return failure("INVALID_INPUT", "A positive revision is required.");
    }
    const found = connected.resolved.workspace.revisions.find((entry) => entry.revision === revision);
    return found ? { ok: true, data: clone(found) } : failure("NOT_FOUND", "The revision was not found.");
  }

  async connectAgent(
    agentSessionToken: string,
    input: ConnectIssueAgentServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ConnectIssueAgentOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid agent session is required.");
    if (!isUuid(pageSessionId)) return failure("STALE_PAGE_CONTEXT", "The page session is invalid.");
    if (!hasExactKeys(input, ["requestId", "name"])
      || !isUuid(input.requestId)
      || !this.validAgentName(input.name)) {
      return failure("INVALID_INPUT", "A valid self-declared agent name is required.");
    }
    const operation = this.agentOperation(resolved, pageSessionId, "agent.connect");
    const replay = this.replay<ConnectIssueAgentOutcome>(resolved, operation, input);
    if (replay) return replay;
    const workspace = resolved.workspace;
    const timestamp = this.stamp(workspace);
    let profile = workspace.agentsByMemberId.get(resolved.member.memberId);
    if (!profile) {
      profile = {
        profileId: randomUUID(),
        member: this.memberSnapshot(resolved.member),
        name: input.name,
        identitySource: "SELF_DECLARED",
        firstSeenAt: timestamp,
        lastAccessedAt: timestamp,
        accessCount: 0,
        identityGeneration: 1,
      };
      workspace.agentsByMemberId.set(resolved.member.memberId, profile);
    } else if (profile.name !== input.name) {
      profile.name = input.name;
      profile.identityGeneration += 1;
    }
    workspace.pageConnections.set(this.pageConnectionKey(resolved, pageSessionId), {
      profileId: profile.profileId,
      identityGeneration: profile.identityGeneration,
    });
    this.touchAgentProfile(profile, timestamp);
    const result = {
      ok: true,
      data: {
        profile: this.publicAgentProfile(profile),
        revision: workspace.document.revision,
        activityVersion: workspace.document.activityVersion,
      },
    } as const;
    return this.recordReplay(resolved, operation, input, result);
  }

  async readCollaborationContext(
    agentSessionToken: string,
    input: ReadCollaborationContextInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ReadCollaborationContextOutcome>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    if (!hasExactKeys(input, [], ["beforeActivityVersion", "limit"])
      || (input.beforeActivityVersion !== undefined
        && (!Number.isSafeInteger(input.beforeActivityVersion) || input.beforeActivityVersion < 1))
      || (input.limit !== undefined
        && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > ISSUE_CONTEXT_MAX_LIMIT))) {
      return failure("INVALID_INPUT", "The collaboration-context input is invalid.");
    }
    const workspace = connected.resolved.workspace;
    const limit = input.limit ?? ISSUE_CONTEXT_DEFAULT_LIMIT;
    const candidates = workspace.activities
      .filter((activity) => input.beforeActivityVersion === undefined
        || activity.activityVersion < input.beforeActivityVersion)
      .slice()
      .reverse();
    const selected = candidates.slice(0, limit);
    const hasMoreOlder = candidates.length > selected.length;
    return {
      ok: true,
      data: {
        agents: this.publicAgentProfiles(workspace),
        events: selected.map((activity) => this.contextEvent(workspace, activity)),
        hasMoreOlder,
        nextBeforeActivityVersion: hasMoreOlder
          ? selected.at(-1)?.activityVersion ?? null
          : null,
        currentRevision: workspace.document.revision,
        currentActivityVersion: workspace.document.activityVersion,
      },
    };
  }

  async listMyTasks(
    agentSessionToken: string,
    input: ListMyIssueTasksInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ListMyIssueTasksOutcome>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    const { resolved } = connected;
    if (!hasExactKeys(input, [], ["includeResolved"]) || (input.includeResolved !== undefined && typeof input.includeResolved !== "boolean")) {
      return failure("INVALID_INPUT", "The task-list input is invalid.");
    }
    return { ok: true, data: this.myTasks(resolved, input.includeResolved ?? false) };
  }

  async waitForMyTasks(
    agentSessionToken: string,
    input: WaitForMyIssueTasksInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<WaitForMyIssueTasksOutcome>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    const { resolved } = connected;
    if (!hasExactKeys(input, ["afterActivityVersion", "afterRevision"], ["timeoutSeconds"])
      || !isCounter(input.afterActivityVersion) || !isCounter(input.afterRevision)
      || (input.timeoutSeconds !== undefined && (!Number.isSafeInteger(input.timeoutSeconds)
        || input.timeoutSeconds < 1 || input.timeoutSeconds > ISSUE_WAIT_MAX_SECONDS))) {
      return failure("INVALID_INPUT", "The wait cursor is invalid.");
    }
    const workspace = resolved.workspace;
    if (input.afterActivityVersion > workspace.document.activityVersion || input.afterRevision > workspace.document.revision) {
      return failure("INVALID_INPUT", "Wait cursors cannot be ahead of the issue.");
    }
    const waitKey = `${workspace.id}:${resolved.member.memberId}:${resolved.session.sessionInstanceId}:${pageSessionId}`;
    if (this.activeWaits.has(waitKey)) return failure("WAIT_ALREADY_ACTIVE", "A wait is already active for this page.");
    let activityCursor = input.afterActivityVersion;
    const deadline = Date.now() + (input.timeoutSeconds ?? ISSUE_WAIT_DEFAULT_SECONDS) * this.waitSecondMs;
    this.activeWaits.add(waitKey);
    try {
      while (true) {
        throwIfAborted(signal);
        const currentConnection = this.connectedAgent(agentSessionToken, pageSessionId);
        if (!currentConnection.ok) {
          if (currentConnection.code === "AGENT_IDENTITY_REQUIRED"
            || currentConnection.code === "STALE_AGENT_PROFILE"
            || currentConnection.code === "STALE_PAGE_CONTEXT") return currentConnection;
          return failure("UNAUTHORIZED", "The agent session expired while waiting.");
        }
        const current = currentConnection.resolved;
        if (current.workspace.id !== workspace.id
          || current.member.memberId !== resolved.member.memberId
          || current.session.sessionInstanceId !== resolved.session.sessionInstanceId) {
          return failure("UNAUTHORIZED", "The agent session expired while waiting.");
        }
        const tasks = this.myTasks(current, false).tasks.filter(({ task }) => task.status === "OPEN");
        if (tasks.length > 0) {
          return { ok: true, data: { outcome: "TASKS_AVAILABLE", tasks, revision: current.workspace.document.revision, activityVersion: current.workspace.document.activityVersion } };
        }
        if (current.workspace.document.revision > input.afterRevision) {
          return { ok: true, data: { outcome: "DOCUMENT_CHANGED", tasks: [], revision: current.workspace.document.revision, activityVersion: current.workspace.document.activityVersion } };
        }
        if (current.workspace.document.activityVersion > activityCursor) activityCursor = current.workspace.document.activityVersion;
        const deadlineRemaining = deadline - Date.now();
        const sessionRemaining = current.session.expiresAt - this.now();
        if (sessionRemaining <= 0) {
          return failure("UNAUTHORIZED", "The agent session expired while waiting.");
        }
        if (deadlineRemaining <= 0) {
          return { ok: true, data: { outcome: "TIMEOUT", tasks: [], revision: current.workspace.document.revision, activityVersion: current.workspace.document.activityVersion } };
        }
        await this.waitForNotification(workspace.id, Math.min(deadlineRemaining, sessionRemaining), signal);
      }
    } finally {
      this.activeWaits.delete(waitKey);
    }
  }

  async commentOnTask(
    agentSessionToken: string,
    input: CommentOnIssueTaskServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<{ task: IssueTask; comment: IssueComment; activityVersion: number }>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    const { resolved, profile } = connected;
    if (!this.validTargetIdentity(input)) return failure("INVALID_INPUT", "The comment input is invalid.");
    const task = resolved.workspace.tasks.find((entry) => entry.taskId === input.taskId);
    if (!task || task.assignee.memberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "This agent does not own the requested task.");
    }
    const operation = this.agentOperation(resolved, pageSessionId, "agent.comment");
    const replay = this.replay<{ task: IssueTask; comment: IssueComment; activityVersion: number }>(resolved, operation, input);
    if (replay) return replay;
    if (!this.validCommentInput(input, "taskId")) {
      return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "The comment input is invalid."));
    }
    const thread = resolved.workspace.threads.find((entry) => entry.threadId === task.threadId)!;
    const replyFailure = this.validateReply(thread, input.replyToCommentId);
    if (replyFailure) return this.recordReplay(resolved, operation, input, replyFailure);
    if (thread.comments.length >= ISSUE_THREAD_COMMENT_LIMIT) return this.recordReplay(resolved, operation, input, failure("RATE_LIMITED", "The thread is full."));
    const timestamp = this.stamp(resolved.workspace);
    const comment: IssueComment = {
      commentId: randomUUID(),
      threadId: thread.threadId,
      replyToCommentId: input.replyToCommentId ?? null,
      author: agentActor(task, profile),
      origin: "WEBMCP",
      createdRevision: resolved.workspace.document.revision,
      body: input.body,
      evidenceRefs: clone(input.evidenceRefs ?? []),
      createdAt: timestamp,
    };
    thread.comments.push(comment);
    this.appendActivity(resolved.workspace, {
      kind: "COMMENT_ADDED",
      actor: comment.author,
      taskId: task.taskId,
      threadId: thread.threadId,
      commentId: comment.commentId,
      excerpt: comment.body,
      timestamp,
    });
    this.touchAgentProfile(profile, timestamp);
    const result = { ok: true, data: { task: publicTask(task), comment: clone(comment), activityVersion: resolved.workspace.document.activityVersion } } as const;
    this.notify(resolved.workspace.id);
    return this.recordReplay(resolved, operation, input, result);
  }

  async submitTaskResult(
    agentSessionToken: string,
    input: SubmitIssueTaskResultServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<SubmitIssueTaskResultOutcome>> {
    throwIfAborted(signal);
    const connected = this.connectedAgent(agentSessionToken, pageSessionId);
    if (!connected.ok) return connected;
    const { resolved, profile } = connected;
    if (!this.validTargetIdentity(input)) return failure("INVALID_INPUT", "The task result input is invalid.");
    const workspace = resolved.workspace;
    const task = workspace.tasks.find((entry) => entry.taskId === input.taskId);
    if (!task || task.assignee.memberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "This agent does not own the requested task.");
    }
    const operation = this.agentOperation(resolved, pageSessionId, "agent.result");
    const replay = this.replay<SubmitIssueTaskResultOutcome>(resolved, operation, input);
    if (replay) return replay;
    if (!this.validResultInput(input)) {
      return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "The task result input is invalid."));
    }
    if (task.status === "STALE") {
      return this.recordReplay(resolved, operation, input, failure("STALE_TASK_CONTEXT", "The task target is stale.", false, { currentTask: publicTask(task) }));
    }
    if (task.status !== "OPEN") {
      return this.recordReplay(resolved, operation, input, failure("TASK_MODE_VIOLATION", "Only Open tasks accept a result.", false, { currentTask: publicTask(task) }));
    }
    if (input.basedOnRevision < task.anchor.createdRevision || input.basedOnRevision > workspace.document.revision) {
      return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "The source revision is outside this task's valid range."));
    }
    const evidenceRefs = input.evidenceRefs ?? [];
    const actor = agentActor(task, profile);
    if (task.mode === "COMMENT") {
      if (input.replacementText !== undefined) {
        return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "Comment tasks cannot replace content."));
      }
      const thread = workspace.threads.find((entry) => entry.threadId === task.threadId)!;
      if (thread.comments.length >= ISSUE_THREAD_COMMENT_LIMIT) {
        return this.recordReplay(resolved, operation, input, failure("RATE_LIMITED", "The task thread is full."));
      }
      const timestamp = this.stamp(workspace);
      thread.comments.push({
        commentId: randomUUID(), threadId: thread.threadId, replyToCommentId: null,
        author: actor, origin: "WEBMCP", body: input.resultSummary,
        createdRevision: workspace.document.revision,
        evidenceRefs: clone(evidenceRefs), createdAt: timestamp,
      });
      task.status = "COMPLETED";
      task.result = {
        outcome: "COMMENTED",
        resultSummary: input.resultSummary,
        evidenceRefs: clone(evidenceRefs),
        sourceRevision: input.basedOnRevision,
        resultRevision: workspace.document.revision,
        liveAnchor: clone(task.anchor),
        replacementText: null,
        submittedBy: actor,
        submittedAt: timestamp,
      };
      task.updatedAt = timestamp;
      task.resolvedAt = timestamp;
      this.resolveTaskThread(workspace, task, task.assignee, timestamp);
      const resultComment = thread.comments.at(-1)!;
      this.appendActivity(workspace, {
        kind: "TASK_COMPLETED",
        actor,
        taskId: task.taskId,
        threadId: task.threadId,
        commentId: resultComment.commentId,
        excerpt: input.resultSummary,
        timestamp,
      });
      this.touchAgentProfile(profile, timestamp);
      const result = { ok: true, data: { outcome: "COMMENTED", task: publicTask(task) as IssueTask & { status: "COMPLETED" }, revision: workspace.document.revision, activityVersion: workspace.document.activityVersion } } as const;
      this.notify(workspace.id);
      return this.recordReplay(resolved, operation, input, result);
    }
    if (typeof input.replacementText !== "string") {
      return this.recordReplay(resolved, operation, input, failure("TASK_MODE_VIOLATION", "This task requires a replacement."));
    }
    const live = this.liveSelection(workspace, task);
    if (!live) return this.recordReplay(resolved, operation, input, failure("STALE_TASK_CONTEXT", "The task target is stale.", false, { currentTask: publicTask(task) }));
    if (input.replacementText === live.selectedText) return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "The replacement must change the target."));
    const max = live.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH;
    const nextField = replaceIssueRange(live.value, live.anchor.rangeStart, live.anchor.rangeEnd, input.replacementText);
    if (issuePointLength(nextField) > max || (live.field === "TITLE" && nextField.trim().length === 0)) {
      return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "The replacement exceeds the document bounds."));
    }
    const timestamp = this.stamp(workspace);
    if (task.mode === "REVIEW") {
      task.status = "PROPOSED";
      task.proposal = {
        replacementText: input.replacementText,
        resultSummary: input.resultSummary,
        evidenceRefs: clone(evidenceRefs),
        sourceRevision: input.basedOnRevision,
        liveAnchor: clone(live.anchor),
        proposedBy: actor,
        proposedAt: timestamp,
      };
      task.updatedAt = timestamp;
      this.appendActivity(workspace, {
        kind: "TASK_PROPOSED",
        actor,
        taskId: task.taskId,
        threadId: task.threadId,
        excerpt: input.resultSummary,
        timestamp,
      });
      this.touchAgentProfile(profile, timestamp);
      const result = { ok: true, data: { outcome: "PROPOSED", task: publicTask(task) as IssueTask & { status: "PROPOSED" }, revision: workspace.document.revision, activityVersion: workspace.document.activityVersion } } as const;
      this.notify(workspace.id);
      return this.recordReplay(resolved, operation, input, result);
    }
    task.status = "COMPLETED";
    task.result = {
      outcome: "COMMITTED",
      resultSummary: input.resultSummary,
      evidenceRefs: clone(evidenceRefs),
      sourceRevision: input.basedOnRevision,
      resultRevision: workspace.document.revision + 1,
      liveAnchor: clone(live.anchor),
      replacementText: input.replacementText,
      submittedBy: actor,
      submittedAt: timestamp,
    };
    task.updatedAt = timestamp;
    task.resolvedAt = timestamp;
    const nextTitle = live.field === "TITLE" ? nextField : workspace.document.title;
    const nextBody = live.field === "BODY" ? nextField : workspace.document.body;
    const revision = this.appendRevision(workspace, {
      title: nextTitle,
      body: nextBody,
      provenance: {
        authority: "DIRECT", origin: "WEBMCP", authorOrigin: "WEBMCP",
        taskId: task.taskId, sourceRevision: input.basedOnRevision,
        author: actor, committer: actor, grantedBy: clone(task.creator), approvedBy: null, restoredRevision: null,
      },
      changeSummary: input.resultSummary,
      evidenceRefs: clone(evidenceRefs),
      ownTaskId: task.taskId,
      ownReplacement: { field: live.field, replacement: input.replacementText },
      activityKind: "TASK_COMPLETED",
      timestamp,
    });
    this.resolveTaskThread(workspace, task, task.assignee, timestamp);
    this.touchAgentProfile(profile, timestamp);
    const result = { ok: true, data: { outcome: "COMMITTED", task: publicTask(task) as IssueTask & { status: "COMPLETED" }, revision: clone(revision), activityVersion: workspace.document.activityVersion } } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, operation, input, result);
  }

  async touchPresence(
    sessionToken: string,
    input: TouchIssuePresenceServiceInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const replay = this.replay<IssueWorkspaceSurface>(resolved, "presence.touch", input);
    if (replay) return replay;
    if (!this.validPresenceInput(input, resolved.workspace)) {
      return this.recordReplay(resolved, "presence.touch", input, failure("INVALID_INPUT", "The presence input is invalid."));
    }
    const observedAt = this.now();
    resolved.workspace.presence.set(resolved.member.memberId, {
      observedAt,
      value: {
        memberId: resolved.member.memberId,
        displayName: resolved.member.displayName,
        color: resolved.member.color,
        state: input.state,
        field: input.field,
        isTyping: input.isTyping,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        observedRevision: input.observedRevision,
        lastSeenAt: new Date(observedAt).toISOString(),
      },
    });
    const result = { ok: true, data: this.surface(resolved.workspace) } as const;
    return this.recordReplay(resolved, "presence.touch", input, result);
  }

  private async decideTask(
    sessionToken: string,
    input: DecideIssueTaskServiceInput,
    kind: "ACCEPTED" | "REJECTED",
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human session is required.");
    const operation = kind === "ACCEPTED" ? "task.accept" : "task.reject";
    if (!this.validTargetIdentity(input)) return failure("INVALID_INPUT", "The decision input is invalid.");
    const workspace = resolved.workspace;
    const task = workspace.tasks.find((entry) => entry.taskId === input.taskId);
    if (!task || task.creator.memberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "Only the task creator may decide this proposal.");
    }
    const replay = this.replay<IssueWorkspaceSurface>(resolved, operation, input);
    if (replay) return replay;
    if (!hasExactKeys(input, ["requestId", "taskId", "expectedRevision", "note"])
      || !isCounter(input.expectedRevision)
      || (input.note !== null && !boundedText(input.note, ISSUE_CHANGE_SUMMARY_MAX_LENGTH))) {
      return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "The decision input is invalid."));
    }
    const stale = this.requireHead(workspace, input.expectedRevision);
    if (stale) return this.recordReplay(resolved, operation, input, stale);
    if (task.status === "STALE") {
      return this.recordReplay(resolved, operation, input, failure("STALE_TASK_CONTEXT", "The proposal target is stale.", false, { currentTask: publicTask(task) }));
    }
    if (task.mode !== "REVIEW" || task.status !== "PROPOSED" || !task.proposal) {
      return this.recordReplay(resolved, operation, input, failure("TASK_MODE_VIOLATION", "Only a proposed Review task can be decided.", false, { currentTask: publicTask(task) }));
    }
    if (kind === "REJECTED") {
      const timestamp = this.stamp(workspace);
      task.status = "REJECTED";
      task.decision = { kind, note: input.note, decidedBy: this.memberSnapshot(resolved.member), decidedAt: timestamp, decisionRevision: workspace.document.revision, resultRevision: workspace.document.revision };
      task.updatedAt = timestamp;
      task.resolvedAt = timestamp;
      this.resolveTaskThread(workspace, task, resolved.member, timestamp);
      this.appendActivity(workspace, {
        kind: "TASK_REJECTED",
        actor: humanActor(resolved.member),
        taskId: task.taskId,
        threadId: task.threadId,
        excerpt: input.note ?? task.proposal.resultSummary,
        timestamp,
      });
      const result = { ok: true, data: this.surface(workspace) } as const;
      this.notify(workspace.id);
      return this.recordReplay(resolved, operation, input, result);
    }
    const live = this.liveSelection(workspace, task);
    if (!live) return this.recordReplay(resolved, operation, input, failure("STALE_TASK_CONTEXT", "The proposal target is stale.", false, { currentTask: publicTask(task) }));
    const nextField = replaceIssueRange(live.value, live.anchor.rangeStart, live.anchor.rangeEnd, task.proposal.replacementText);
    const max = live.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH;
    if (issuePointLength(nextField) > max || (live.field === "TITLE" && nextField.trim().length === 0)) {
      return this.recordReplay(resolved, operation, input, failure("INVALID_INPUT", "The accepted replacement exceeds document bounds."));
    }
    const timestamp = this.stamp(workspace);
    const author = task.proposal.proposedBy;
    task.status = "COMPLETED";
    task.decision = { kind, note: input.note, decidedBy: this.memberSnapshot(resolved.member), decidedAt: timestamp, decisionRevision: workspace.document.revision, resultRevision: workspace.document.revision + 1 };
    task.updatedAt = timestamp;
    task.resolvedAt = timestamp;
    this.appendRevision(workspace, {
      title: live.field === "TITLE" ? nextField : workspace.document.title,
      body: live.field === "BODY" ? nextField : workspace.document.body,
      provenance: {
        authority: "REVIEW", origin: "ORDINARY_UI", authorOrigin: "WEBMCP",
        taskId: task.taskId, sourceRevision: task.proposal.sourceRevision,
        author, committer: humanActor(resolved.member), grantedBy: clone(task.creator),
        approvedBy: this.memberSnapshot(resolved.member), restoredRevision: null,
      },
      changeSummary: task.proposal.resultSummary,
      evidenceRefs: clone(task.proposal.evidenceRefs),
      ownTaskId: task.taskId,
      ownReplacement: { field: live.field, replacement: task.proposal.replacementText },
      activityKind: "TASK_COMPLETED",
      timestamp,
    });
    this.resolveTaskThread(workspace, task, resolved.member, timestamp);
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, operation, input, result);
  }

  private async buildPostmortemExample(displayName: string): Promise<IssueSessionBundle> {
    const { workspace, bundle: priya } = this.createWorkspace(
      "POSTMORTEM",
      POSTMORTEM_EXAMPLE.title,
      POSTMORTEM_EXAMPLE.body,
      "Priya Shah",
      POSTMORTEM_EXAMPLE.launchSummary,
    );
    const nadia = this.issueBundle(workspace, this.addMember(workspace, "Nadia Chen"), priya.shareToken);
    const leo = this.issueBundle(workspace, this.addMember(workspace, "Leo Park"), priya.shareToken);
    const sam = this.issueBundle(workspace, this.addMember(workspace, "Sam Rivera"), priya.shareToken);
    const nadiaPage = randomUUID();
    const leoPage = randomUUID();
    const samPage = randomUUID();
    this.expectSuccess(await this.connectAgent(nadia.agentSessionToken, {
      requestId: randomUUID(), name: "Databot",
    }, nadiaPage), "connect Databot");
    this.expectSuccess(await this.connectAgent(leo.agentSessionToken, {
      requestId: randomUUID(), name: "Logbot",
    }, leoPage), "connect Logbot");
    this.expectSuccess(await this.connectAgent(sam.agentSessionToken, {
      requestId: randomUUID(), name: "Builder",
    }, samPage), "connect Builder");

    const placeholder = "Investigation in progress.";
    const mentions = [
      { spec: POSTMORTEM_EXAMPLE.tasks.impact, memberId: nadia.selfMemberId, occurrence: 1 },
      { spec: POSTMORTEM_EXAMPLE.tasks.timeline, memberId: leo.selfMemberId, occurrence: 2 },
      { spec: POSTMORTEM_EXAMPLE.tasks.cause, memberId: sam.selfMemberId, occurrence: 3 },
    ] as const;
    for (const mention of mentions) {
      this.expectSuccess(await this.createMentionTask(priya.humanSessionToken, {
        requestId: randomUUID(),
        expectedRevision: 1,
        comment: mention.spec.prompt,
        mentionedAgentName: mention.spec.agentName,
        assignedToMemberId: mention.memberId,
        anchor: anchorForOccurrence(POSTMORTEM_EXAMPLE.body, placeholder, mention.occurrence),
      }), `create ${mention.spec.agentName} mention`);
    }
    const [impactTask, timelineTask, causeTask] = workspace.tasks;
    this.setExampleContextSides(impactTask!, "## Impact\n\n", "\n\n## Timeline\n\nInvestigation in progress.");
    this.setExampleContextSides(timelineTask!, "## Timeline\n\n", "\n\n## Root cause\n\nInvestigation in progress.");
    this.setExampleContextSides(causeTask!, "## Root cause\n\n", "\n\n## Detection and response");
    this.expectSuccess(await this.submitTaskResult(nadia.agentSessionToken, {
      requestId: randomUUID(), taskId: impactTask!.taskId, basedOnRevision: 1,
      resultSummary: POSTMORTEM_EXAMPLE.tasks.impact.summary,
      replacementText: POSTMORTEM_EXAMPLE.tasks.impact.replacement,
      evidenceRefs: [...POSTMORTEM_EXAMPLE.tasks.impact.evidence],
    }, nadiaPage), "complete postmortem impact");
    this.expectSuccess(await this.submitTaskResult(leo.agentSessionToken, {
      requestId: randomUUID(), taskId: timelineTask!.taskId, basedOnRevision: 1,
      resultSummary: POSTMORTEM_EXAMPLE.tasks.timeline.summary,
      replacementText: POSTMORTEM_EXAMPLE.tasks.timeline.replacement,
      evidenceRefs: [...POSTMORTEM_EXAMPLE.tasks.timeline.evidence],
    }, leoPage), "complete postmortem timeline");
    this.expectSuccess(await this.submitTaskResult(sam.agentSessionToken, {
      requestId: randomUUID(), taskId: causeTask!.taskId, basedOnRevision: 1,
      resultSummary: POSTMORTEM_EXAMPLE.tasks.cause.summary,
      replacementText: POSTMORTEM_EXAMPLE.tasks.cause.replacement,
      evidenceRefs: [...POSTMORTEM_EXAMPLE.tasks.cause.evidence],
    }, samPage), "complete postmortem root cause");

    const discussionAnchor = anchorForOccurrence(
      workspace.document.body,
      POSTMORTEM_EXAMPLE.tasks.cause.replacement,
      1,
    );
    this.expectSuccess(await this.createThread(priya.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 4,
      body: POSTMORTEM_EXAMPLE.discussion,
      anchor: discussionAnchor,
    }), "create postmortem human discussion");
    const standaloneThread = workspace.threads.at(-1)!;
    this.expectSuccess(await this.createMentionTask(priya.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 4,
      comment: POSTMORTEM_EXAMPLE.tasks.clarification.prompt,
      mentionedAgentName: POSTMORTEM_EXAMPLE.tasks.clarification.agentName,
      assignedToMemberId: sam.selfMemberId,
      anchor: discussionAnchor,
    }), "create postmortem clarification mention");
    const clarificationTask = workspace.tasks.at(-1)!;
    this.setExampleContextSides(clarificationTask, "## Root cause\n\n", "\n\n## Detection and response");
    this.expectSuccess(await this.submitTaskResult(sam.agentSessionToken, {
      requestId: randomUUID(), taskId: clarificationTask.taskId, basedOnRevision: 4,
      resultSummary: POSTMORTEM_EXAMPLE.tasks.clarification.summary,
      replacementText: POSTMORTEM_EXAMPLE.tasks.clarification.replacement,
      evidenceRefs: [...POSTMORTEM_EXAMPLE.tasks.clarification.evidence],
    }, samPage), "complete postmortem clarification");
    this.expectSuccess(await this.resolveThread(priya.humanSessionToken, {
      requestId: randomUUID(), threadId: standaloneThread.threadId,
    }), "close postmortem human discussion");

    const viewer = this.issueBundle(
      workspace,
      this.addMember(workspace, displayName),
      priya.shareToken,
    );
    return { ...viewer, surface: this.surface(workspace) };
  }

  private async buildProductDocumentExample(displayName: string): Promise<IssueSessionBundle> {
    const { workspace, bundle: jordan } = this.createWorkspace(
      "PRODUCT_DOCUMENT",
      PRODUCT_DOCUMENT_EXAMPLE.title,
      PRODUCT_DOCUMENT_EXAMPLE.body,
      "Jordan Lee",
      PRODUCT_DOCUMENT_EXAMPLE.launchSummary,
    );
    const morgan = this.issueBundle(workspace, this.addMember(workspace, "Morgan Chen"), jordan.shareToken);
    const avery = this.issueBundle(workspace, this.addMember(workspace, "Avery Singh"), jordan.shareToken);
    const elena = this.issueBundle(workspace, this.addMember(workspace, "Elena Ruiz"), jordan.shareToken);
    const databotPage = randomUUID();
    const chatgptPage = randomUUID();
    this.expectSuccess(await this.connectAgent(morgan.agentSessionToken, {
      requestId: randomUUID(), name: "Databot",
    }, databotPage), "connect product Databot");
    this.expectSuccess(await this.connectAgent(avery.agentSessionToken, {
      requestId: randomUUID(), name: "ChatGPT",
    }, chatgptPage), "connect product ChatGPT");

    const correctedBody = workspace.document.body.replace(
      PRODUCT_DOCUMENT_EXAMPLE.capacityBefore,
      PRODUCT_DOCUMENT_EXAMPLE.capacityAfter,
    );
    this.expectSuccess(await this.saveHumanRevision(jordan.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 1,
      title: workspace.document.title, body: correctedBody,
    }), "save capacity correction");
    this.expectSuccess(await this.createMentionTask(jordan.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 2,
      comment: PRODUCT_DOCUMENT_EXAMPLE.dataTask.prompt,
      mentionedAgentName: "Databot",
      assignedToMemberId: morgan.selfMemberId,
      anchor: anchorForOccurrence(workspace.document.body, "Analysis in progress.", 1),
    }), "create product data mention");
    const dataTask = workspace.tasks.at(-1)!;
    this.setExampleContextSides(dataTask, "## Options and trade-offs\n\n", "\n\n## Milestones");
    this.expectSuccess(await this.submitTaskResult(morgan.agentSessionToken, {
      requestId: randomUUID(), taskId: dataTask.taskId, basedOnRevision: 2,
      resultSummary: PRODUCT_DOCUMENT_EXAMPLE.dataTask.summary,
      replacementText: PRODUCT_DOCUMENT_EXAMPLE.dataTask.replacement,
      evidenceRefs: [...PRODUCT_DOCUMENT_EXAMPLE.dataTask.evidence],
    }, databotPage), "complete product data analysis");
    this.expectSuccess(await this.createMentionTask(jordan.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 3,
      comment: PRODUCT_DOCUMENT_EXAMPLE.synthesisTask.prompt,
      mentionedAgentName: "ChatGPT",
      assignedToMemberId: avery.selfMemberId,
      anchor: anchorForOccurrence(workspace.document.body, "Synthesis pending.", 1),
    }), "create product synthesis mention");
    const synthesisTask = workspace.tasks.at(-1)!;
    this.setExampleContextSides(synthesisTask, "## Decision summary\n\n", "\n\n## Customer and business context");
    this.expectSuccess(await this.submitTaskResult(avery.agentSessionToken, {
      requestId: randomUUID(), taskId: synthesisTask.taskId, basedOnRevision: 3,
      resultSummary: PRODUCT_DOCUMENT_EXAMPLE.synthesisTask.summary,
      replacementText: PRODUCT_DOCUMENT_EXAMPLE.synthesisTask.replacement,
      evidenceRefs: [...PRODUCT_DOCUMENT_EXAMPLE.synthesisTask.evidence],
    }, chatgptPage), "complete product synthesis");

    const discussionAnchor = anchorForOccurrence(
      workspace.document.body,
      PRODUCT_DOCUMENT_EXAMPLE.synthesisTask.replacement,
      1,
    );
    this.expectSuccess(await this.createThread(elena.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 4,
      body: PRODUCT_DOCUMENT_EXAMPLE.discussionQuestion,
      anchor: discussionAnchor,
    }), "create product human discussion");
    const discussionThread = workspace.threads.at(-1)!;
    const questionComment = discussionThread.comments[0]!;
    this.expectSuccess(await this.addHumanComment(jordan.humanSessionToken, {
      requestId: randomUUID(), threadId: discussionThread.threadId,
      replyToCommentId: questionComment.commentId,
      body: PRODUCT_DOCUMENT_EXAMPLE.discussionReply,
      evidenceRefs: ["revision:r4"],
    }), "reply to product discussion");
    this.expectSuccess(await this.resolveThread(elena.humanSessionToken, {
      requestId: randomUUID(), threadId: discussionThread.threadId,
    }), "close product discussion");

    const alternativeBody = workspace.document.body.replace(
      PRODUCT_DOCUMENT_EXAMPLE.synthesisTask.replacement,
      PRODUCT_DOCUMENT_EXAMPLE.alternative,
    );
    this.expectSuccess(await this.saveHumanRevision(elena.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 4,
      title: workspace.document.title, body: alternativeBody,
    }), "save all-customer alternative");
    this.expectSuccess(await this.restoreRevision(jordan.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 5, revision: 4,
      changeSummary: PRODUCT_DOCUMENT_EXAMPLE.restoreSummary,
    }), "restore staged product decision");

    const viewer = this.issueBundle(
      workspace,
      this.addMember(workspace, displayName),
      jordan.shareToken,
    );
    return { ...viewer, surface: this.surface(workspace) };
  }

  private createWorkspace(
    kind: IssueDocumentKind,
    title: string,
    body: string,
    displayName: string,
    summary: string,
    identifiers: { documentId?: string; revisionId?: string; memberId?: string } = {},
  ): { workspace: StoredWorkspace; bundle: IssueSessionBundle } {
    const now = this.now();
    const id = identifiers.documentId ?? randomUUID();
    const shareToken = randomBytes(32).toString("base64url");
    const workspace = {
      id,
      shareTokenHash: secretDigest(shareToken),
      expiresAt: now + this.sessionTtlMs,
      lastTimestampMs: now - 1,
      nextGuestNumber: 2,
      nextTaskNumber: 1,
      members: new Map(),
      presence: new Map(),
      tasks: [],
      threads: [],
      revisions: [],
      agentsByMemberId: new Map(),
      pageConnections: new Map(),
      activities: [],
      ledger: new Map(),
      managedAgentsByProfileId: new Map(),
      relayRuns: [],
      relayAttempts: [],
      relayPermits: new Map(),
      relayEventVersion: 0,
      relayTrace: [],
    } as unknown as StoredWorkspace;
    const member = this.addMember(workspace, displayName, identifiers.memberId);
    const timestamp = this.stamp(workspace);
    const author = humanActor(member);
    const revision: IssueRevision = {
      revisionId: identifiers.revisionId ?? randomUUID(), revision: 1, parentRevision: null, title, body,
      contentDigest: digest(title, body),
      diffs: [
        { field: "TITLE", rangeStart: 0, rangeEnd: 0, before: "", after: title },
        { field: "BODY", rangeStart: 0, rangeEnd: 0, before: "", after: body },
      ],
      provenance: {
        authority: "HUMAN", origin: "ORDINARY_UI", authorOrigin: "ORDINARY_UI",
        taskId: null, sourceRevision: 0, author, committer: author,
        grantedBy: null, approvedBy: null, restoredRevision: null,
      },
      changeSummary: summary, evidenceRefs: [], createdAt: timestamp,
    };
    workspace.revisions = [revision];
    workspace.document = {
      id, protocolVersion: REPOSITORY_PROTOCOL_VERSION, kind, title, body,
      revision: 1, activityVersion: 1, updatedAt: timestamp,
      lastRevision: { revisionId: revision.revisionId, author, authority: "HUMAN", summary },
    };
    workspace.activities.push({
      activityId: randomUUID(),
      activityVersion: 1,
      kind: "ISSUE_LAUNCHED",
      documentRevision: 1,
      actor: author,
      createdAt: timestamp,
      revisionId: revision.revisionId,
      taskId: null,
      threadId: null,
      commentId: null,
      excerpt: summary,
    });
    this.seedManagedDirectory(workspace);
    this.workspaces.set(id, workspace);
    this.workspaceIdsByShareTokenHash.set(workspace.shareTokenHash, id);
    return { workspace, bundle: this.issueBundle(workspace, member, shareToken) };
  }

  private appendRevision(workspace: StoredWorkspace, input: RevisionInput): IssueRevision {
    const previousTitle = workspace.document.title;
    const previousBody = workspace.document.body;
    const titleSplice = deriveIssueSplice(previousTitle, input.title);
    const bodySplice = deriveIssueSplice(previousBody, input.body);
    const revisionNumber = workspace.document.revision + 1;
    const taskAnchor = input.ownTaskId
      ? workspace.tasks.find((task) => task.taskId === input.ownTaskId)?.anchor
      : undefined;
    const exactTaskDiff = taskAnchor?.scope === "SELECTION" && input.ownReplacement
      ? {
          field: input.ownReplacement.field,
          rangeStart: taskAnchor.rangeStart,
          rangeEnd: taskAnchor.rangeEnd,
          before: taskAnchor.selectedText,
          after: input.ownReplacement.replacement,
        }
      : null;
    const timestamp = input.timestamp ?? this.stamp(workspace);
    if (input.restore) {
      this.restoreAnchors(workspace, input.title, input.body, revisionNumber, timestamp);
    } else {
      this.rebaseAnchors(workspace, titleSplice, bodySplice, revisionNumber, timestamp, input.ownTaskId, input.ownReplacement);
    }
    const diffs = exactTaskDiff ? [exactTaskDiff] : [
      makeIssueDiff("TITLE", previousTitle, input.title),
      makeIssueDiff("BODY", previousBody, input.body),
    ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const revision: IssueRevision = {
      revisionId: randomUUID(), revision: revisionNumber,
      parentRevision: workspace.document.revision,
      title: input.title, body: input.body,
      contentDigest: digest(input.title, input.body), diffs,
      provenance: clone(input.provenance), changeSummary: input.changeSummary,
      evidenceRefs: clone(input.evidenceRefs), createdAt: timestamp,
    };
    workspace.revisions.push(revision);
    workspace.document = {
      ...workspace.document,
      title: input.title,
      body: input.body,
      revision: revisionNumber,
      activityVersion: workspace.document.activityVersion,
      updatedAt: timestamp,
      lastRevision: {
        revisionId: revision.revisionId,
        author: clone(input.provenance.author),
        authority: input.provenance.authority,
        summary: input.changeSummary,
      },
    };
    this.appendActivity(workspace, {
      kind: input.activityKind ?? "REVISION_SAVED",
      actor: input.provenance.author,
      revisionId: revision.revisionId,
      taskId: input.provenance.taskId,
      excerpt: input.changeSummary,
      timestamp,
    });
    return revision;
  }

  private rebaseAnchors(
    workspace: StoredWorkspace,
    titleSplice: IssueSplice | null,
    bodySplice: IssueSplice | null,
    nextRevision: number,
    timestamp: string,
    ownTaskId?: string,
    ownReplacement?: { field: IssueDocumentField; replacement: string },
  ): void {
    for (const task of workspace.tasks) {
      const beforeState = task.anchor.anchorState;
      if (task.taskId === ownTaskId && ownReplacement && task.anchor.scope === "SELECTION") {
        task.anchor = replaceIssueAnchor(task.anchor, ownReplacement.replacement, nextRevision);
      } else {
        task.anchor = rebaseIssueAnchor(task.anchor, "TITLE", titleSplice, nextRevision);
        task.anchor = rebaseIssueAnchor(task.anchor, "BODY", bodySplice, nextRevision);
      }
      if (beforeState === "ACTIVE" && task.anchor.anchorState === "STALE"
        && (task.status === "OPEN" || task.status === "PROPOSED")) {
        task.status = "STALE";
        task.updatedAt = timestamp;
        task.resolvedAt = timestamp;
        if (task.managedAgentProfileId) {
          this.cancelRelayLineage(workspace, task.taskId, "TASK_STALE");
        }
        this.resolveTaskThread(workspace, task, task.creator, timestamp);
      }
      const thread = workspace.threads.find((entry) => entry.threadId === task.threadId);
      if (thread) thread.anchor = clone(task.anchor);
    }
    for (const thread of workspace.threads.filter((entry) => entry.taskId === null)) {
      thread.anchor = rebaseIssueAnchor(thread.anchor, "TITLE", titleSplice, nextRevision);
      thread.anchor = rebaseIssueAnchor(thread.anchor, "BODY", bodySplice, nextRevision);
    }
  }

  private restoreAnchors(
    workspace: StoredWorkspace,
    title: string,
    body: string,
    nextRevision: number,
    timestamp: string,
  ): void {
    const restore = (anchor: IssueAnchor): IssueAnchor => {
      if (anchor.scope === "DOCUMENT" || anchor.anchorState === "STALE") return anchor.scope === "DOCUMENT" ? { ...anchor, anchorRevision: nextRevision } : anchor;
      const value = anchor.field === "TITLE" ? title : body;
      return issueSlice(value, anchor.rangeStart, anchor.rangeEnd) === anchor.selectedText
        ? { ...anchor, anchorRevision: nextRevision }
        : { ...anchor, anchorState: "STALE" };
    };
    for (const task of workspace.tasks) {
      task.anchor = restore(task.anchor);
      if (task.anchor.anchorState === "STALE" && (task.status === "OPEN" || task.status === "PROPOSED")) {
        task.status = "STALE";
        task.updatedAt = timestamp;
        task.resolvedAt = timestamp;
        if (task.managedAgentProfileId) {
          this.cancelRelayLineage(workspace, task.taskId, "TASK_STALE");
        }
        this.resolveTaskThread(workspace, task, task.creator, timestamp);
      }
      const thread = workspace.threads.find((entry) => entry.threadId === task.threadId);
      if (thread) thread.anchor = clone(task.anchor);
    }
    for (const thread of workspace.threads.filter((entry) => entry.taskId === null)) thread.anchor = restore(thread.anchor);
  }

  private makeAnchor(workspace: StoredWorkspace, input: IssueAnchorInput): IssueAnchor | null {
    if (!isRecord(input) || typeof input.scope !== "string") return null;
    if (input.scope === "DOCUMENT" && hasExactKeys(input, ["scope"])) {
      return { scope: "DOCUMENT", field: null, rangeStart: null, rangeEnd: null, selectedText: null, createdRevision: workspace.document.revision, anchorRevision: workspace.document.revision, anchorState: "ACTIVE" };
    }
    if (input.scope !== "SELECTION" || !hasExactKeys(input, ["scope", "field", "rangeStart", "rangeEnd"])
      || (input.field !== "TITLE" && input.field !== "BODY")
      || !isCounter(input.rangeStart) || !isCounter(input.rangeEnd) || input.rangeStart >= input.rangeEnd) return null;
    const value = input.field === "TITLE" ? workspace.document.title : workspace.document.body;
    if (input.rangeEnd > issuePointLength(value)) return null;
    const selectedText = issueSlice(value, input.rangeStart, input.rangeEnd);
    if (selectedText.length === 0) return null;
    return { scope: "SELECTION", field: input.field, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd, selectedText, createdRevision: workspace.document.revision, anchorRevision: workspace.document.revision, anchorState: "ACTIVE" };
  }

  private liveSelection(workspace: StoredWorkspace, task: StoredTask): {
    anchor: Extract<IssueAnchor, { scope: "SELECTION" }>;
    field: IssueDocumentField;
    value: string;
    selectedText: string;
  } | null {
    if (task.anchor.scope !== "SELECTION" || task.anchor.anchorState !== "ACTIVE") return null;
    const value = task.anchor.field === "TITLE" ? workspace.document.title : workspace.document.body;
    const selectedText = issueSlice(value, task.anchor.rangeStart, task.anchor.rangeEnd);
    if (selectedText !== task.anchor.selectedText) return null;
    return { anchor: task.anchor, field: task.anchor.field, value, selectedText };
  }

  private issueBundle(
    workspace: StoredWorkspace,
    member: StoredMember,
    shareToken: string,
  ): IssueSessionBundle {
    const humanSessionToken = randomBytes(32).toString("base64url");
    const agentSessionToken = randomBytes(32).toString("base64url");
    const sessionInstanceId = randomUUID();
    const base = { documentId: workspace.id, memberId: member.memberId, expiresAt: workspace.expiresAt, sessionInstanceId };
    this.sessions.set(secretDigest(humanSessionToken), { ...base, actorType: "HUMAN" });
    this.sessions.set(secretDigest(agentSessionToken), { ...base, actorType: "AGENT" });
    return {
      shareToken,
      humanSessionToken,
      agentSessionToken,
      sessionInstanceId,
      selfMemberId: member.memberId,
      expiresAt: new Date(workspace.expiresAt).toISOString(),
      protocolVersion: REPOSITORY_PROTOCOL_VERSION,
      surface: this.surface(workspace),
    };
  }

  private addMember(workspace: StoredWorkspace, displayName: string, memberId: string = randomUUID()): StoredMember {
    const member: StoredMember = {
      memberId,
      displayName,
      color: MEMBER_COLORS[workspace.members.size % MEMBER_COLORS.length]!,
    };
    workspace.members.set(member.memberId, member);
    return member;
  }

  private seedAgentProfile(
    workspace: StoredWorkspace,
    member: StoredMember,
    name: string,
    accessCount: number,
    profileId: string = randomUUID(),
  ): StoredAgentProfile {
    const timestamp = this.stamp(workspace);
    const profile: StoredAgentProfile = {
      profileId,
      member: this.memberSnapshot(member),
      name,
      identitySource: "SELF_DECLARED",
      firstSeenAt: timestamp,
      lastAccessedAt: timestamp,
      accessCount,
      identityGeneration: 1,
    };
    workspace.agentsByMemberId.set(member.memberId, profile);
    return profile;
  }

  private seedManagedDirectory(workspace: StoredWorkspace): void {
    for (const seed of MANAGED_AGENT_DIRECTORY_SEEDS) {
      const profileId = randomUUID();
      const principal: IssueMemberSnapshot = {
        memberId: randomUUID(),
        displayName: seed.principalName,
      };
      workspace.managedAgentsByProfileId.set(profileId, {
        entry: {
          kind: "AGENT",
          profileId,
          principal,
          handle: seed.handle,
          displayName: seed.displayName,
          visibility: seed.visibility,
          identitySource: "DEMO_DIRECTORY",
          expertise: seed.expertise,
          runtime: MANAGED_AGENT_RUNTIME,
          readiness: this.relayTokenCodec ? "READY" : "DISABLED",
        },
      });
    }
  }

  private setExampleContextSides(
    task: StoredTask,
    beforeText: string,
    afterText: string,
  ): void {
    if (!task.context) throw new Error("Example mention is missing its context snapshot.");
    task.context.beforeText = beforeText;
    task.context.afterText = afterText;
  }

  private surface(workspace: StoredWorkspace): IssueWorkspaceSurface {
    const history = workspace.revisions.slice().reverse().slice(0, ISSUE_HISTORY_DEFAULT_LIMIT).map(revisionSummary);
    const orderedTasks = workspace.tasks.slice().sort(compareTasks);
    const taskOrder = new Map(orderedTasks.map((task, index) => [task.taskId, index]));
    const orderedThreads = workspace.threads
      .filter((thread) => thread.taskId !== null)
      .sort((left, right) =>
        (taskOrder.get(left.taskId!) ?? Number.MAX_SAFE_INTEGER)
        - (taskOrder.get(right.taskId!) ?? Number.MAX_SAFE_INTEGER)
        || left.threadId.localeCompare(right.threadId))
      .concat(workspace.threads
        .filter((thread) => thread.taskId === null)
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
          || left.threadId.localeCompare(right.threadId)));
    return clone({
      document: workspace.document,
      presence: this.currentPresence(workspace),
      members: [...workspace.members.values()].map((member) => this.memberSnapshot(member)).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.memberId.localeCompare(b.memberId)),
      agents: this.publicAgentProfiles(workspace),
      tasks: orderedTasks.map(publicTask),
      threads: orderedThreads.map(publicThread),
      history,
      hasMoreHistory: workspace.revisions.length > history.length,
    });
  }

  private publicAgentProfile(profile: StoredAgentProfile): IssueAgentProfile {
    return clone({
      profileId: profile.profileId,
      member: profile.member,
      name: profile.name,
      identitySource: profile.identitySource,
      firstSeenAt: profile.firstSeenAt,
      lastAccessedAt: profile.lastAccessedAt,
      accessCount: profile.accessCount,
    });
  }

  private publicAgentProfiles(workspace: StoredWorkspace): IssueAgentProfile[] {
    return [...workspace.agentsByMemberId.values()]
      .map((profile) => this.publicAgentProfile(profile))
      .sort((left, right) => left.name.localeCompare(right.name)
        || left.member.displayName.localeCompare(right.member.displayName)
        || left.profileId.localeCompare(right.profileId));
  }

  private contextEvent(
    workspace: StoredWorkspace,
    activity: StoredActivity,
  ): IssueCollaborationContextEvent {
    const task = activity.taskId
      ? workspace.tasks.find((entry) => entry.taskId === activity.taskId) ?? null
      : null;
    const threadId = activity.threadId ?? task?.threadId ?? null;
    const thread = threadId
      ? workspace.threads.find((entry) => entry.threadId === threadId) ?? null
      : null;
    const comment = activity.commentId
      ? workspace.threads
        .flatMap((entry) => entry.comments)
        .find((entry) => entry.commentId === activity.commentId) ?? null
      : null;
    const revision = activity.revisionId
      ? workspace.revisions.find((entry) => entry.revisionId === activity.revisionId) ?? null
      : null;
    return clone({
      activityId: activity.activityId,
      activityVersion: activity.activityVersion,
      kind: activity.kind,
      documentRevision: activity.documentRevision,
      actor: activity.actor,
      createdAt: activity.createdAt,
      revision: revision ? revisionSummary(revision) : null,
      task: task ? publicTask(task) : null,
      thread: thread ? publicThread(thread) : null,
      comment,
    });
  }

  private snapshotPriorContext(workspace: StoredWorkspace): IssueTaskPriorContextEntry[] {
    return workspace.activities
      .slice(-ISSUE_TASK_PRIOR_CONTEXT_LIMIT)
      .reverse()
      .map((activity): IssueTaskPriorContextEntry => ({
        activityVersion: activity.activityVersion,
        kind: activity.kind,
        documentRevision: activity.documentRevision,
        revisionId: activity.revisionId,
        taskId: activity.taskId,
        threadId: activity.threadId,
        commentId: activity.commentId,
        actor: clone(activity.actor),
        excerpt: this.snapshotActivityExcerpt(workspace, activity),
      }));
  }

  private snapshotActivityExcerpt(workspace: StoredWorkspace, activity: StoredActivity): string {
    const task = activity.taskId
      ? workspace.tasks.find((entry) => entry.taskId === activity.taskId)
      : undefined;
    const comment = activity.commentId
      ? workspace.threads
        .flatMap((entry) => entry.comments)
        .find((entry) => entry.commentId === activity.commentId)
      : undefined;
    const revision = activity.revisionId
      ? workspace.revisions.find((entry) => entry.revisionId === activity.revisionId)
      : undefined;
    const threadId = activity.threadId ?? task?.threadId;
    const thread = threadId
      ? workspace.threads.find((entry) => entry.threadId === threadId)
      : undefined;
    const threadRoot = thread?.comments.find((entry) => entry.replyToCommentId === null);
    const excerpt = comment?.body
      ?? revision?.changeSummary
      ?? task?.instruction
      ?? threadRoot?.body
      ?? workspace.document.title;
    return issueSlice(excerpt, 0, ISSUE_TASK_PRIOR_CONTEXT_EXCERPT_MAX_LENGTH);
  }

  private readHistoryForWorkspace(
    workspace: StoredWorkspace,
    input: ReadIssueHistoryInput,
  ): RepositoryResult<ReadIssueHistoryOutcome> {
    if (!hasExactKeys(input, [], ["beforeRevision", "limit"])
      || (input.beforeRevision !== undefined && (!Number.isSafeInteger(input.beforeRevision) || input.beforeRevision < 1))
      || (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > ISSUE_HISTORY_MAX_LIMIT))) {
      return failure("INVALID_INPUT", "The history input is invalid.");
    }
    const limit = input.limit ?? ISSUE_HISTORY_DEFAULT_LIMIT;
    const candidates = workspace.revisions
      .filter((revision) => input.beforeRevision === undefined || revision.revision < input.beforeRevision)
      .slice()
      .reverse();
    const selected = candidates.slice(0, limit);
    const hasMoreOlder = candidates.length > selected.length;
    return {
      ok: true,
      data: {
        revisions: selected.map(revisionSummary),
        hasMoreOlder,
        nextBeforeRevision: hasMoreOlder ? selected.at(-1)?.revision ?? null : null,
        currentRevision: workspace.document.revision,
        currentActivityVersion: workspace.document.activityVersion,
      },
    };
  }

  private myTasks(resolved: ResolvedSession, includeResolved: boolean): ListMyIssueTasksOutcome {
    const tasks = resolved.workspace.tasks
      .filter((task) => task.assignee.memberId === resolved.member.memberId)
      .filter((task) => includeResolved || task.status === "OPEN" || task.status === "PROPOSED")
      .sort(compareTasks)
      .map((task): IssueTaskView => ({
        task: publicTask(task),
        thread: publicThread(resolved.workspace.threads.find((thread) => thread.threadId === task.threadId)!),
      }));
    return { tasks, revision: resolved.workspace.document.revision, activityVersion: resolved.workspace.document.activityVersion };
  }

  private resolveSession(token: string): ResolvedSession | null {
    this.cleanupExpired();
    const session = this.sessions.get(secretDigest(token));
    if (!session || session.expiresAt <= this.now()) return null;
    const workspace = this.workspaces.get(session.documentId);
    const member = workspace?.members.get(session.memberId);
    return workspace && member ? { workspace, session, member } : null;
  }

  private authorize(token: string, actorType: SessionActor): ResolvedSession | null {
    const resolved = this.resolveSession(token);
    return resolved?.session.actorType === actorType ? resolved : null;
  }

  private connectedAgent(
    token: string,
    pageSessionId: string,
  ): ({ ok: true; resolved: ResolvedSession; profile: StoredAgentProfile } | RepositoryFailure) {
    const resolved = this.authorize(token, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid agent session is required.");
    if (!isUuid(pageSessionId)) return failure("STALE_PAGE_CONTEXT", "The page session is invalid.");
    const profile = resolved.workspace.agentsByMemberId.get(resolved.member.memberId);
    const connection = resolved.workspace.pageConnections.get(this.pageConnectionKey(resolved, pageSessionId));
    if (!connection) {
      return failure("AGENT_IDENTITY_REQUIRED", "Call connect_agent for this page before using another tool.");
    }
    if (!profile
      || connection.profileId !== profile.profileId
      || connection.identityGeneration !== profile.identityGeneration) {
      return failure("STALE_AGENT_PROFILE", "The connected agent profile changed. Connect again on this page.");
    }
    return { ok: true, resolved, profile };
  }

  private pageConnectionKey(resolved: ResolvedSession, pageSessionId: string): string {
    return `${resolved.member.memberId}:${resolved.session.sessionInstanceId}:${pageSessionId}`;
  }

  private agentOperation(
    resolved: ResolvedSession,
    pageSessionId: string,
    operation: string,
  ): string {
    return `v4.1:${operation}:${resolved.session.sessionInstanceId}:${pageSessionId}:AGENT`;
  }

  private touchAgentProfile(profile: StoredAgentProfile, timestamp: string): void {
    profile.lastAccessedAt = timestamp;
    profile.accessCount += 1;
  }

  private cleanupExpired(): void {
    const now = this.now();
    for (const [id, workspace] of this.workspaces) {
      if (workspace.expiresAt > now) continue;
      this.releaseRelayProviderReservationsForDocument(id);
      this.workspaces.delete(id);
      this.workspaceIdsByShareTokenHash.delete(workspace.shareTokenHash);
      this.listeners.delete(id);
    }
    for (const [token, session] of this.sessions) if (session.expiresAt <= now || !this.workspaces.has(session.documentId)) this.sessions.delete(token);
  }

  private validDisplayName(value: unknown): boolean {
    return boundedText(value, DISPLAY_NAME_MAX_LENGTH);
  }

  private validAgentName(value: unknown): value is string {
    return typeof value === "string"
      && value === value.trim()
      && boundedText(value, ISSUE_AGENT_NAME_MAX_LENGTH)
      && !/[@\r\n]/u.test(value);
  }

  private validCreateTaskInput(input: CreateIssueTaskServiceInput): boolean {
    return hasExactKeys(input, ["expectedRevision", "requestId", "title", "category", "instruction", "agentLabel", "mode", "assignedToMemberId", "anchor"])
      && isCounter(input.expectedRevision) && isUuid(input.requestId)
      && boundedText(input.title, ISSUE_TASK_TITLE_MAX_LENGTH)
      && ISSUE_TASK_CATEGORIES.includes(input.category)
      && boundedText(input.instruction, ISSUE_TASK_INSTRUCTION_MAX_LENGTH)
      && boundedText(input.agentLabel, ISSUE_AGENT_LABEL_MAX_LENGTH)
      && ISSUE_TASK_MODES.includes(input.mode)
      && isUuid(input.assignedToMemberId)
      && this.validAnchorInputShape(input.anchor);
  }

  private validTargetIdentity(input: unknown): input is { requestId: string; taskId: string } {
    return isRecord(input) && isUuid(input.requestId) && isUuid(input.taskId);
  }

  private validAnchorInputShape(input: unknown): input is IssueAnchorInput {
    if (!isRecord(input)) return false;
    if (input.scope === "DOCUMENT") return hasExactKeys(input, ["scope"]);
    return input.scope === "SELECTION"
      && hasExactKeys(input, ["scope", "field", "rangeStart", "rangeEnd"])
      && (input.field === "TITLE" || input.field === "BODY")
      && isCounter(input.rangeStart)
      && isCounter(input.rangeEnd)
      && input.rangeStart < input.rangeEnd;
  }

  private validCommentInput(
    input: { requestId: string; taskId?: string; threadId?: string; replyToCommentId?: string; body: string; evidenceRefs?: string[] },
    target: "taskId" | "threadId",
  ): boolean {
    return hasExactKeys(input, ["requestId", target, "body"], ["replyToCommentId", "evidenceRefs"])
      && isUuid(input.requestId) && isUuid(input[target])
      && (input.replyToCommentId === undefined || isUuid(input.replyToCommentId))
      && boundedText(input.body, ISSUE_COMMENT_MAX_LENGTH)
      && (input.evidenceRefs === undefined || validEvidence(input.evidenceRefs));
  }

  private validResultInput(input: SubmitIssueTaskResultServiceInput): boolean {
    return hasExactKeys(input, ["requestId", "taskId", "basedOnRevision", "resultSummary"], ["replacementText", "evidenceRefs"])
      && isUuid(input.requestId) && isUuid(input.taskId)
      && Number.isSafeInteger(input.basedOnRevision) && input.basedOnRevision >= 1
      && boundedText(input.resultSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH)
      && (input.replacementText === undefined || boundedText(input.replacementText, ISSUE_BODY_MAX_LENGTH, true))
      && (input.evidenceRefs === undefined || validEvidence(input.evidenceRefs));
  }

  private validPresenceInput(input: TouchIssuePresenceServiceInput, workspace: StoredWorkspace): boolean {
    if (!hasExactKeys(input, ["requestId", "state", "field", "isTyping", "selectionStart", "selectionEnd", "observedRevision"])
      || !isUuid(input.requestId) || !["VIEWING", "EDITING", "IDLE"].includes(input.state)
      || (input.field !== null && input.field !== "TITLE" && input.field !== "BODY")
      || typeof input.isTyping !== "boolean" || !isCounter(input.observedRevision)
      || input.observedRevision > workspace.document.revision) return false;
    if (input.field === null) return input.selectionStart === null && input.selectionEnd === null;
    if (!isCounter(input.selectionStart) || !isCounter(input.selectionEnd) || input.selectionStart > input.selectionEnd) return false;
    const value = input.field === "TITLE" ? workspace.document.title : workspace.document.body;
    return input.selectionEnd <= issuePointLength(value);
  }

  private relayReplay<T>(
    resolved: ResolvedSession,
    operation: string,
    input: unknown,
  ): RelayResult<T> | null {
    const requestId = isRecord(input) ? input.requestId : undefined;
    if (!isUuid(requestId)) return null;
    const existing = resolved.workspace.ledger.get(requestId);
    if (!existing) return null;
    const fingerprint = `${operation}:${canonical(input)}`;
    return existing.fingerprint === fingerprint
      ? clone(existing.result) as RelayResult<T>
      : relayFailure("REQUEST_REPLAY_MISMATCH", "This request ID was already used with different input.");
  }

  private recordRelayReplay<T>(
    resolved: ResolvedSession,
    operation: string,
    input: unknown,
    result: RelayResult<T>,
  ): RelayResult<T> {
    const requestId = isRecord(input) ? input.requestId : undefined;
    if (!isUuid(requestId)) return result;
    const fingerprint = `${operation}:${canonical(input)}`;
    const existing = resolved.workspace.ledger.get(requestId);
    if (existing) {
      return existing.fingerprint === fingerprint
        ? clone(existing.result) as RelayResult<T>
        : relayFailure("REQUEST_REPLAY_MISMATCH", "This request ID was already used with different input.");
    }
    resolved.workspace.ledger.set(requestId, {
      fingerprint,
      result: clone(result) as RelayResult<unknown>,
    });
    return result;
  }

  private toolReplay<T>(
    workspace: StoredWorkspace,
    context: RelayToolInvocationContext,
    input: unknown,
  ): RepositoryResult<T> | null {
    const existing = workspace.ledger.get(context.requestId);
    if (!existing) return null;
    const fingerprint = `managed.${context.logicalToolName}:${canonical(input)}`;
    return existing.fingerprint === fingerprint
      ? clone(existing.result) as RepositoryResult<T>
      : failure("REQUEST_REPLAY_MISMATCH", "This managed tool request changed on replay.");
  }

  private recordToolReplay<T>(
    workspace: StoredWorkspace,
    context: RelayToolInvocationContext,
    input: unknown,
    result: RepositoryResult<T>,
  ): RepositoryResult<T> {
    const fingerprint = `managed.${context.logicalToolName}:${canonical(input)}`;
    const existing = workspace.ledger.get(context.requestId);
    if (existing) {
      return existing.fingerprint === fingerprint
        ? clone(existing.result) as RepositoryResult<T>
        : failure("REQUEST_REPLAY_MISMATCH", "This managed tool request changed on replay.");
    }
    workspace.ledger.set(context.requestId, {
      fingerprint,
      result: clone(result) as RepositoryResult<unknown>,
    });
    return result;
  }

  private validDirectoryComment(comment: string, displayName: string): boolean {
    const prefix = `@${displayName}`;
    if (!comment.startsWith(prefix)) return false;
    const suffix = comment.slice(prefix.length);
    return /^[ \t\r\n]+[^\s]/u.test(suffix.replace(/[ \t\r\n]+$/u, ""));
  }

  private directoryHandle(displayName: string, stableId: string): string {
    const normalized = displayName.normalize("NFKD").toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
    return normalized || `member-${stableId.slice(0, 8)}`;
  }

  private reservedDirectoryHandles(): Set<string> {
    const reserved = [
      "data", "code", "general", "system", "user", "assistant", "tool",
      "webmcp", "ratiflow", ...Object.keys(MANAGED_AGENT_TOOL_DEFINITIONS),
      ...REPOSITORY_TOOL_NAMES,
    ];
    return new Set(reserved.flatMap((value) => [
      value.toLowerCase(), value.toLowerCase().replace(/_/gu, "-"),
    ]));
  }

  private uniqueDirectoryHandle(
    displayName: string,
    stableId: string,
    kind: "h" | "a",
    usedHandles: Set<string>,
  ): string {
    const base = this.directoryHandle(displayName, stableId);
    if (!usedHandles.has(base.toLowerCase())) {
      usedHandles.add(base.toLowerCase());
      return base;
    }
    const candidate = `${base}-${kind}-${stableId.replace(/-/gu, "").toLowerCase()}`;
    usedHandles.add(candidate);
    return candidate;
  }

  private privateRelayAttempt(attempt: StoredRelayAttempt): RelayAttempt {
    const {
      claimRequestId: _claimRequestId,
      retryRunId: _retryRunId,
      grantClaims: _grantClaims,
      grantDigest: _grantDigest,
      grantRevokedAt: _grantRevokedAt,
      previousProviderResponseId: _previousProviderResponseId,
      previousOutcome: _previousOutcome,
      manifest: _manifest,
      steps: _steps,
      ...publicAttempt
    } = clone(attempt);
    void [_claimRequestId, _retryRunId, _grantClaims, _grantDigest, _grantRevokedAt,
      _previousProviderResponseId, _previousOutcome, _manifest, _steps];
    return publicAttempt;
  }

  private executionPermit(
    claims: RelayExecutionPermitClaims,
    token: RelayExecutionPermit["token"],
  ): RelayExecutionPermit {
    return {
      token,
      attemptId: claims.attemptId,
      functionCallId: claims.functionCallId,
      physicalToolName: claims.physicalToolName,
      argumentsDigest: claims.argumentsDigest,
      registrationGeneration: claims.registrationGeneration,
      leaseId: claims.leaseId,
      expiresAt: claims.expiresAt,
    };
  }

  private managedTaskProjection(task: StoredTask): IssueTask {
    const result = publicTask(task) as StoredTask;
    result.agentProfileId = task.managedAgentProfileId ?? null;
    result.context = task.managedContext ? clone(task.managedContext) : null;
    return result as IssueTask;
  }

  private logicalToolForPhysicalName(
    run: StoredRelayRun,
    attempt: StoredRelayAttempt,
    physicalToolName: string,
  ): ManagedAgentLogicalToolName | null {
    const policy = RELAY_ACCESS_POLICIES[run.accessProfile];
    for (const logicalName of policy.logicalToolNames) {
      const expected = [
        "rf",
        policy.physicalDiscriminator,
        attempt.registrationScope,
        `g${attempt.registrationGeneration}`,
        MANAGED_AGENT_TOOL_DEFINITIONS[logicalName].providerKey,
      ].join("_");
      if (expected === physicalToolName) return logicalName;
    }
    return null;
  }

  private validRelayManifest(
    manifest: RelayNormalizedToolManifest,
    run: StoredRelayRun,
    attempt: StoredRelayAttempt,
  ): boolean {
    const policy = RELAY_ACCESS_POLICIES[run.accessProfile];
    if (!isRecord(manifest)
      || !hasExactKeys(manifest, ["entries", "digest"])
      || !Array.isArray(manifest.entries)
      || manifest.digest !== relaySha256({ entries: manifest.entries })
      || manifest.entries.length !== policy.logicalToolNames.length) return false;
    let origin: string | null = null;
    const physicalNames = new Set<string>();
    for (const [index, logicalName] of policy.logicalToolNames.entries()) {
      const entry = manifest.entries[index];
      const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
      if (!entry || !isRecord(entry)
        || !hasExactKeys(entry, [
          "origin", "physicalName", "logicalName", "registrationGeneration",
          "description", "inputSchema", "annotations",
        ])
        || typeof entry.origin !== "string"
        || typeof entry.physicalName !== "string"
        || physicalNames.has(entry.physicalName)) return false;
      try {
        const url = new URL(entry.origin);
        if (url.origin !== entry.origin || !["http:", "https:"].includes(url.protocol)) return false;
      } catch {
        return false;
      }
      origin ??= entry.origin;
      if (entry.origin !== origin
        || entry.logicalName !== logicalName
        || entry.registrationGeneration !== attempt.registrationGeneration
        || entry.physicalName !== ["rf", policy.physicalDiscriminator, attempt.registrationScope,
          `g${attempt.registrationGeneration}`, definition.providerKey].join("_")
        || entry.description !== definition.description
        || relayCanonicalJson(entry.inputSchema) !== relayCanonicalJson(definition.inputSchema)
        || relayCanonicalJson(entry.annotations) !== relayCanonicalJson(definition.annotations)) return false;
      physicalNames.add(entry.physicalName);
    }
    return true;
  }

  private capabilityGrant(run: StoredRelayRun): RelayCapabilityGrant {
    const policy = RELAY_ACCESS_POLICIES[run.accessProfile];
    return {
      accessProfile: run.accessProfile,
      documentAuthority: policy.documentAuthority,
      logicalToolNames: [...policy.logicalToolNames],
      syntheticSourceLabels: [...policy.syntheticSourceLabels],
    };
  }

  private validBrowserRelayTraceInput(input: RelayBrowserTraceInput): boolean {
    if (!isRecord(input) || !hasExactKeys(input, ["kind", "detail"])
      || typeof input.kind !== "string" || !isRecord(input.detail)
      || !hasExactKeys(input.detail, ["transition"])
      || typeof input.detail.transition !== "string"
      || !RELAY_BROWSER_OBSERVED_CATALOG_TRANSITIONS.includes(
        input.detail.transition as (typeof RELAY_BROWSER_OBSERVED_CATALOG_TRANSITIONS)[number],
      )) return false;
    return input.kind === "WEBMCP_TOOLCHANGE_OBSERVED"
      || input.kind === input.detail.transition;
  }

  private validRelayTraceInput(input: IssueRelayTraceInput): boolean {
    if (!isRecord(input)
      || typeof input.kind !== "string"
      || !RELAY_TRACE_KINDS.includes(input.kind as (typeof RELAY_TRACE_KINDS)[number])) return false;
    const digest = /^sha256:[0-9a-f]{64}$/u;
    for (const value of [input.manifestDigest, input.argumentsDigest, input.resultDigest]) {
      if (value !== undefined && value !== null && !digest.test(value)) return false;
    }
    if (input.logicalToolName !== undefined && input.logicalToolName !== null
      && !Object.hasOwn(MANAGED_AGENT_TOOL_DEFINITIONS, input.logicalToolName)) return false;
    if (input.physicalToolName !== undefined && input.physicalToolName !== null
      && !RELAY_PHYSICAL_TOOL_NAME_PATTERN.test(input.physicalToolName)) return false;
    const detail = input.detail ?? {};
    return isRecord(detail)
      && Object.values(detail).every((value) => value === null
        || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      && Buffer.byteLength(relayCanonicalJson(detail), "utf8") <= RELAY_BOUNDS.maxTracePayloadBytes;
  }

  private appendRelayTrace(
    workspace: StoredWorkspace,
    run: RelayRun,
    attempt: StoredRelayAttempt | null,
    input: IssueRelayTraceInput,
    timestamp: string,
  ): RelayTraceEvent {
    const event: RelayTraceEvent = {
      relayEventId: randomUUID(),
      relayEventVersion: ++workspace.relayEventVersion,
      documentId: workspace.id,
      runId: run.runId,
      attemptId: attempt?.attemptId ?? null,
      kind: input.kind,
      logicalToolName: input.logicalToolName ?? null,
      physicalToolName: input.physicalToolName ?? null,
      manifestDigest: input.manifestDigest ?? null,
      argumentsDigest: input.argumentsDigest ?? null,
      resultDigest: input.resultDigest ?? null,
      detail: clone(input.detail ?? {}),
      createdAt: timestamp,
    };
    workspace.relayTrace.push(event);
    return event;
  }

  private authorizeRelayGrant(
    grant: RelayGrant,
    allowTerminal = false,
    allowRevoked = false,
  ): AuthorizedRelay {
    if (!this.relayTokenCodec || typeof grant !== "string") {
      return relayFailure("RELAY_UNAVAILABLE", "Managed Relay is not configured.");
    }
    const claims = this.relayTokenCodec.verifyGrant(grant);
    if (!claims || Date.parse(claims.expiresAt) <= this.now()) {
      return relayFailure("UNAUTHORIZED", "The Relay grant is invalid or expired.");
    }
    const workspace = this.workspaces.get(claims.documentId);
    const attempt = workspace?.relayAttempts.find((entry) => entry.attemptId === claims.attemptId);
    const run = workspace?.relayRuns.find((entry) => entry.runId === claims.runId);
    const task = workspace?.tasks.find((entry) => entry.taskId === claims.taskId);
    const agent = workspace?.managedAgentsByProfileId.get(claims.profileId)?.entry;
    if (!workspace || !attempt || !run || !task || !agent
      || (!allowRevoked && attempt.grantRevokedAt !== null)
      || attempt.grantDigest !== relaySecretDigest(grant)
      || relayCanonicalJson(attempt.grantClaims) !== relayCanonicalJson(claims)
      || attempt.runId !== run.runId
      || run.taskId !== task.taskId
      || run.profileId !== agent.profileId
      || task.managedAgentProfileId !== agent.profileId
      || attempt.leaseId !== claims.leaseId
      || attempt.registrationGeneration !== claims.registrationGeneration) {
      return relayFailure("UNAUTHORIZED", "The Relay grant is not authorized for this lineage.");
    }
    if (!allowTerminal && (run.status !== "ACTIVE"
      || ["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status)
      || Date.parse(attempt.leaseExpiresAt) <= this.now()
      || Date.parse(attempt.deadlineAt) <= this.now())) {
      return relayFailure("RELAY_LEASE_LOST", "The managed Relay lease was lost.");
    }
    return { ok: true, workspace, attempt, run, task, agent };
  }

  private authorizeToolContext(context: RelayToolInvocationContext): AuthorizedRelayTool {
    if (!isRecord(context) || !isUuid(context.documentId) || !isUuid(context.runId)
      || !isUuid(context.attemptId) || !isUuid(context.taskId) || !isUuid(context.profileId)
      || !isUuid(context.requestId) || !Number.isSafeInteger(context.registrationGeneration)
      || context.registrationGeneration < 1
      || !RELAY_PHYSICAL_TOOL_NAME_PATTERN.test(context.physicalToolName)) {
      return failure("INVALID_INPUT", "The managed tool context is invalid.");
    }
    const workspace = this.workspaces.get(context.documentId);
    const run = workspace?.relayRuns.find((entry) => entry.runId === context.runId);
    const attempt = workspace?.relayAttempts.find((entry) => entry.attemptId === context.attemptId);
    const task = workspace?.tasks.find((entry) => entry.taskId === context.taskId);
    const agent = workspace?.managedAgentsByProfileId.get(context.profileId)?.entry;
    if (!workspace || !run || !attempt || !task || !agent
      || attempt.runId !== run.runId || run.taskId !== task.taskId || run.profileId !== agent.profileId
      || attempt.registrationGeneration !== context.registrationGeneration
      || task.managedAgentProfileId !== agent.profileId
      || this.logicalToolForPhysicalName(run, attempt, context.physicalToolName) !== context.logicalToolName
      || !["ACTIVE", "COMPLETED"].includes(run.status)
      || !["EXECUTING_TOOL", "SUCCEEDED"].includes(attempt.status)) {
      return failure("UNAUTHORIZED", "The managed tool context is not authorized.");
    }
    return { ok: true, workspace, run, attempt, task, agent };
  }

  private revokeAttemptPermits(
    workspace: StoredWorkspace,
    attemptId: string,
    timestamp: string,
  ): void {
    for (const permit of workspace.relayPermits.values()) {
      if (permit.claims.attemptId === attemptId && permit.status === "ISSUED") {
        permit.status = "REVOKED";
        permit.completedAt = timestamp;
      }
    }
  }

  private failExecutingAttemptPermits(
    workspace: StoredWorkspace,
    attemptId: string,
    timestamp: string,
  ): void {
    const failed = relayFailure(
      "RELAY_EXECUTION_NOT_ARMED",
      "The managed tool execution could not be reconciled before its deadline.",
      false,
    );
    for (const permit of workspace.relayPermits.values()) {
      if (permit.claims.attemptId === attemptId && permit.status === "EXECUTING") {
        permit.status = "FAILED";
        permit.failure = failed;
        permit.completedAt = timestamp;
      }
    }
  }

  private reconcileExpiredRelay(workspace: StoredWorkspace): void {
    const now = this.now();
    for (const run of workspace.relayRuns) {
      if (run.status !== "COMPLETED" || run.terminalReason !== "TASK_COMPLETED"
        || workspace.relayTrace.some((event) => event.runId === run.runId
          && event.kind === "RUN_COMPLETED")
        || !workspace.relayTrace.some((event) => event.runId === run.runId
          && event.kind === "IDLE_CATALOG_RESTORED")) continue;
      const latestAttempt = workspace.relayAttempts
        .filter((attempt) => attempt.runId === run.runId)
        .sort((left, right) => right.attemptNumber - left.attemptNumber)[0] ?? null;
      this.appendRelayTrace(
        workspace,
        run,
        latestAttempt,
        { kind: "RUN_COMPLETED" },
        this.stamp(workspace),
      );
    }
    for (const run of workspace.relayRuns) {
      if ((run.status !== "QUEUED" && run.status !== "WAITING_RETRY")
        || run.attemptCount < run.maxAttempts) continue;
      const timestamp = this.stamp(workspace);
      run.status = "EXHAUSTED";
      run.terminalReason = "ATTEMPTS_EXHAUSTED";
      run.updatedAt = timestamp;
      run.completedAt = timestamp;
      const latestAttempt = workspace.relayAttempts
        .filter((attempt) => attempt.runId === run.runId)
        .sort((left, right) => right.attemptNumber - left.attemptNumber)[0] ?? null;
      if (!workspace.relayTrace.some((event) => event.runId === run.runId
        && event.kind === "RUN_EXHAUSTED")) {
        this.appendRelayTrace(workspace, run, latestAttempt, { kind: "RUN_EXHAUSTED" }, timestamp);
      }
    }
    for (const attempt of workspace.relayAttempts) {
      if (["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status)) continue;
      if (Date.parse(attempt.leaseExpiresAt) > now && Date.parse(attempt.deadlineAt) > now) continue;
      const run = workspace.relayRuns.find((entry) => entry.runId === attempt.runId);
      if (!run) continue;
      const timestamp = this.stamp(workspace);
      attempt.grantRevokedAt = timestamp;
      attempt.updatedAt = timestamp;
      this.revokeAttemptPermits(workspace, attempt.attemptId, timestamp);
      if (attempt.providerDispatched && Date.parse(attempt.deadlineAt) > now) {
        attempt.status = "RECONCILING";
        if (!workspace.relayTrace.some((event) => event.attemptId === attempt.attemptId
          && event.kind === "ATTEMPT_RECONCILING")) {
          this.appendRelayTrace(workspace, run, attempt, { kind: "ATTEMPT_RECONCILING" }, timestamp);
        }
      } else if (attempt.providerDispatched) {
        this.failExecutingAttemptPermits(workspace, attempt.attemptId, timestamp);
        attempt.status = "FAILED";
        attempt.completedAt = timestamp;
        run.status = run.attemptCount >= run.maxAttempts ? "EXHAUSTED" : "WAITING_RETRY";
        run.terminalReason = run.status === "EXHAUSTED" ? "ATTEMPTS_EXHAUSTED" : null;
        run.completedAt = run.status === "EXHAUSTED" ? timestamp : null;
        run.updatedAt = timestamp;
        this.appendRelayTrace(workspace, run, attempt, { kind: "ATTEMPT_FAILED" }, timestamp);
        this.appendRelayTrace(workspace, run, attempt, {
          kind: run.status === "EXHAUSTED" ? "RUN_EXHAUSTED" : "RUN_WAITING_RETRY",
        }, timestamp);
      } else {
        this.releaseRelayProviderReservation(attempt.attemptId);
        attempt.status = "EXPIRED";
        attempt.completedAt = timestamp;
        this.failExecutingAttemptPermits(workspace, attempt.attemptId, timestamp);
        run.status = run.attemptCount >= run.maxAttempts ? "EXHAUSTED" : "QUEUED";
        run.terminalReason = run.status === "EXHAUSTED" ? "ATTEMPTS_EXHAUSTED" : null;
        run.completedAt = run.status === "EXHAUSTED" ? timestamp : null;
        run.updatedAt = timestamp;
        this.appendRelayTrace(workspace, run, attempt, {
          kind: "ATTEMPT_FAILED",
          detail: { reason: "LEASE_EXPIRED_BEFORE_DISPATCH" },
        }, timestamp);
        if (run.status === "EXHAUSTED") {
          this.appendRelayTrace(workspace, run, attempt, { kind: "RUN_EXHAUSTED" }, timestamp);
        }
      }
    }
  }

  private cancelRelayLineage(
    workspace: StoredWorkspace,
    taskId: string,
    reason: "TASK_CANCELLED" | "TASK_STALE",
  ): void {
    const run = workspace.relayRuns.find((entry) => entry.taskId === taskId);
    if (!run || ["COMPLETED", "EXHAUSTED", "CANCELLED"].includes(run.status)) return;
    const timestamp = this.stamp(workspace);
    run.status = "CANCELLED";
    run.terminalReason = reason;
    run.updatedAt = timestamp;
    run.completedAt = timestamp;
    for (const attempt of workspace.relayAttempts.filter((entry) => entry.runId === run.runId)) {
      if (!["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(attempt.status)) {
        if (!attempt.providerDispatched) this.releaseRelayProviderReservation(attempt.attemptId);
        attempt.status = "CANCELLED";
        attempt.grantRevokedAt = timestamp;
        attempt.updatedAt = timestamp;
        attempt.completedAt = timestamp;
        this.revokeAttemptPermits(workspace, attempt.attemptId, timestamp);
        this.failExecutingAttemptPermits(workspace, attempt.attemptId, timestamp);
      }
    }
    const activeAttempt = workspace.relayAttempts.find((entry) => entry.runId === run.runId) ?? null;
    this.appendRelayTrace(workspace, run, activeAttempt, {
      kind: "RUN_CANCELLED",
      detail: { terminalReason: reason },
    }, timestamp);
  }

  private async invokeManagedTool(
    context: RelayToolInvocationContext,
    input: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<Readonly<Record<string, unknown>>>> {
    switch (context.logicalToolName) {
      case "read_assignment":
        return this.readAssignment(context, signal) as Promise<RepositoryResult<Readonly<Record<string, unknown>>>>;
      case "read_document_context":
        return this.readDocumentContext(context, signal) as Promise<RepositoryResult<Readonly<Record<string, unknown>>>>;
      case "read_collaboration_context":
        return await this.readManagedCollaborationContext(context, Number(input.limit), signal) as unknown as RepositoryResult<Readonly<Record<string, unknown>>>;
      case "comment_on_assignment":
        return await this.commentOnAssignment(context, input as unknown as RelayProgressCommentInput, signal) as unknown as RepositoryResult<Readonly<Record<string, unknown>>>;
      case "submit_scoped_revision":
        return await this.submitScopedRevision(context, input as unknown as RelaySubmitRevisionInput, signal) as unknown as RepositoryResult<Readonly<Record<string, unknown>>>;
      case "query_demo_metrics":
        return this.invokeFixture(() => this.specialistFixturePort?.queryDemoMetrics(
          input as never, signal,
        ));
      case "search_demo_code":
        return this.invokeFixture(() => this.specialistFixturePort?.searchDemoCode(
          input as never, signal,
        ));
      case "read_demo_file":
        return this.invokeFixture(() => this.specialistFixturePort?.readDemoFile(
          input as never, signal,
        ));
      case "read_company_style_guide":
        return this.invokeFixture(() => this.specialistFixturePort?.readCompanyStyleGuide(signal));
      case "check_document_consistency":
        return this.invokeFixture(() => this.specialistFixturePort?.checkDocumentConsistency(
          input as never, signal,
        ));
    }
  }

  private async invokeFixture(
    invoke: () => Promise<Readonly<Record<string, unknown>>> | undefined,
  ): Promise<RepositoryResult<Readonly<Record<string, unknown>>>> {
    const promise = invoke();
    if (!promise) return failure("PROTOCOL_MISMATCH", "The synthetic specialist fixture is unavailable.");
    return { ok: true, data: await promise };
  }

  private validateReply(thread: IssueThread, replyToCommentId?: string): RepositoryFailure | null {
    if (replyToCommentId === undefined) return null;
    return thread.comments.some((comment) => comment.commentId === replyToCommentId)
      ? null
      : failure("INVALID_INPUT", "The reply target must be a comment in this thread.");
  }

  private requireHead(workspace: StoredWorkspace, expectedRevision: number): RepositoryFailure | null {
    return expectedRevision === workspace.document.revision ? null : failure(
      "STALE_DOCUMENT",
      "The issue changed before this operation.",
      true,
      { currentRevision: workspace.document.revision, currentActivityVersion: workspace.document.activityVersion, nextAction: "Inspect the latest revision and merge or retry." },
    );
  }

  private activeTasks(workspace: StoredWorkspace): StoredTask[] {
    return workspace.tasks.filter(taskIsActive);
  }

  private replay<T>(resolved: ResolvedSession, operation: string, input: unknown): RepositoryResult<T> | null {
    const requestId = isRecord(input) ? input.requestId : undefined;
    if (!isUuid(requestId)) return null;
    const existing = resolved.workspace.ledger.get(this.replayKey(resolved, requestId));
    if (!existing) return null;
    const fingerprint = `${operation}:${canonical(input)}`;
    return existing.fingerprint === fingerprint
      ? clone(existing.result) as RepositoryResult<T>
      : failure("REQUEST_REPLAY_MISMATCH", "This request ID was already used with different input.");
  }

  private recordReplay<T>(resolved: ResolvedSession, operation: string, input: unknown, result: RepositoryResult<T>): RepositoryResult<T> {
    const requestId = isRecord(input) ? input.requestId : undefined;
    if (!isUuid(requestId)) return result;
    const key = this.replayKey(resolved, requestId);
    const fingerprint = `${operation}:${canonical(input)}`;
    const existing = resolved.workspace.ledger.get(key);
    if (existing) {
      return existing.fingerprint === fingerprint
        ? clone(existing.result) as RepositoryResult<T>
        : failure("REQUEST_REPLAY_MISMATCH", "This request ID was already used with different input.");
    }
    resolved.workspace.ledger.set(key, {
      fingerprint,
      result: clone(result) as RepositoryResult<unknown>,
    });
    return result;
  }

  private replayKey(resolved: ResolvedSession, requestId: string): string {
    void resolved;
    return requestId;
  }

  private consumeCredentialIssuance(operation: CredentialIssuanceOperation, scope = "global"): boolean {
    const key = `${operation}:${scope}`;
    const now = this.now();
    const existing = this.credentialRateBuckets.get(key);
    const bucket = !existing || now - existing.windowStartedAt >= this.credentialRateLimitWindowMs
      ? { windowStartedAt: now, count: 0 }
      : existing;
    const limit = Math.max(0, this.credentialRateLimits[operation]);
    if (bucket.count >= limit) {
      this.credentialRateBuckets.set(key, bucket);
      return false;
    }
    bucket.count += 1;
    this.credentialRateBuckets.set(key, bucket);
    return true;
  }

  private pruneRelayProviderDispatches(now = this.now()): void {
    const cutoff = now - this.relayProviderQuotaWindowMs;
    this.relayProviderDispatches = this.relayProviderDispatches.filter((dispatch) =>
      dispatch.dispatchedAt !== null
        ? dispatch.dispatchedAt > cutoff
        : dispatch.reservationExpiresAt > now);
  }

  private reserveRelayProviderDispatch(
    documentId: string,
    attemptId: string,
    reservationExpiresAt: number,
  ): boolean {
    const now = this.now();
    this.pruneRelayProviderDispatches(now);
    if (this.relayProviderDispatches.some((dispatch) => dispatch.attemptId === attemptId)) {
      return true;
    }
    if (this.relayProviderDispatches.length >= this.relayProviderDeploymentLimit
      || this.relayProviderDispatches.filter((dispatch) =>
        dispatch.documentId === documentId).length >= this.relayProviderDocumentLimit) {
      return false;
    }
    this.relayProviderDispatches.push({
      documentId,
      attemptId,
      reservedAt: now,
      reservationExpiresAt,
      dispatchedAt: null,
    });
    return true;
  }

  private consumeRelayProviderDispatch(documentId: string, attemptId: string): boolean {
    const now = this.now();
    this.pruneRelayProviderDispatches(now);
    const reservation = this.relayProviderDispatches.find((dispatch) =>
      dispatch.documentId === documentId && dispatch.attemptId === attemptId);
    if (!reservation) return false;
    reservation.dispatchedAt ??= now;
    return true;
  }

  private releaseRelayProviderReservation(attemptId: string): void {
    this.relayProviderDispatches = this.relayProviderDispatches.filter((dispatch) =>
      dispatch.attemptId !== attemptId || dispatch.dispatchedAt !== null);
  }

  private releaseRelayProviderReservationsForDocument(documentId: string): void {
    this.relayProviderDispatches = this.relayProviderDispatches.filter((dispatch) =>
      dispatch.documentId !== documentId || dispatch.dispatchedAt !== null);
  }

  private memberSnapshot(member: IssueMemberSnapshot): IssueMemberSnapshot {
    return { memberId: member.memberId, displayName: member.displayName };
  }

  private stamp(workspace: StoredWorkspace): string {
    workspace.lastTimestampMs = Math.max(this.now(), workspace.lastTimestampMs + 1);
    return new Date(workspace.lastTimestampMs).toISOString();
  }

  private appendActivity(
    workspace: StoredWorkspace,
    input: {
      kind: IssueActivityKind;
      actor: IssueActorSnapshot;
      revisionId?: string | null;
      taskId?: string | null;
      threadId?: string | null;
      commentId?: string | null;
      excerpt: string;
      timestamp: string;
    },
  ): StoredActivity {
    const activity: StoredActivity = {
      activityId: randomUUID(),
      activityVersion: workspace.document.activityVersion + 1,
      kind: input.kind,
      documentRevision: workspace.document.revision,
      actor: clone(input.actor),
      createdAt: input.timestamp,
      revisionId: input.revisionId ?? null,
      taskId: input.taskId ?? null,
      threadId: input.threadId ?? null,
      commentId: input.commentId ?? null,
      excerpt: issueSlice(input.excerpt, 0, ISSUE_TASK_PRIOR_CONTEXT_EXCERPT_MAX_LENGTH),
    };
    workspace.activities.push(activity);
    workspace.document.activityVersion = activity.activityVersion;
    workspace.document.updatedAt = input.timestamp;
    return activity;
  }

  private resolveTaskThread(workspace: StoredWorkspace, task: StoredTask, resolver: IssueMemberSnapshot, timestamp: string): void {
    const thread = workspace.threads.find((entry) => entry.threadId === task.threadId);
    if (!thread) return;
    thread.status = "RESOLVED";
    thread.resolvedBy = this.memberSnapshot(resolver);
    thread.resolvedAt = timestamp;
  }

  private currentPresence(workspace: StoredWorkspace): IssuePresence[] {
    const cutoff = this.now() - this.presenceTtlMs;
    for (const [memberId, presence] of workspace.presence) if (presence.observedAt <= cutoff) workspace.presence.delete(memberId);
    return [...workspace.presence.values()].map(({ value }) => clone(value)).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.memberId.localeCompare(b.memberId));
  }

  private taskPrefix(category: IssueTask["category"]): string {
    return ({ DATA: "DATA", LOGS: "LOG", CODEBASE: "CODE", RESEARCH: "RES", WRITING: "WRITE", GENERAL: "TASK" } as const)[category];
  }

  private setHeroTaskIdentity(
    workspace: StoredWorkspace,
    task: StoredTask,
    identity: { taskId: string; threadId: string; commentId?: string; taskKey: string },
  ): void {
    const oldTaskId = task.taskId;
    const oldThreadId = task.threadId;
    const thread = workspace.threads.find((entry) => entry.threadId === oldThreadId);
    task.taskId = identity.taskId;
    task.threadId = identity.threadId;
    task.taskKey = identity.taskKey;
    if (thread) {
      thread.threadId = identity.threadId;
      thread.taskId = identity.taskId;
      for (const comment of thread.comments) {
        comment.threadId = identity.threadId;
        if (identity.commentId && comment.replyToCommentId === null) {
          comment.commentId = identity.commentId;
        }
      }
    }
    for (const activity of workspace.activities) {
      if (activity.taskId === oldTaskId) activity.taskId = identity.taskId;
      if (activity.threadId === oldThreadId) activity.threadId = identity.threadId;
      if (identity.commentId && activity.taskId === identity.taskId
        && activity.kind === "TASK_CREATED") activity.commentId = identity.commentId;
    }
  }

  private bootstrapPath(bundle: IssueSessionBundle): string {
    return `/issue/${bundle.shareToken}#ratiflow-bootstrap=${Buffer.from(JSON.stringify(bundle), "utf8").toString("base64url")}`;
  }

  private removeWorkspace(documentId: string): void {
    const workspace = this.workspaces.get(documentId);
    if (!workspace) return;
    this.notify(documentId);
    this.releaseRelayProviderReservationsForDocument(documentId);
    this.workspaces.delete(documentId);
    this.workspaceIdsByShareTokenHash.delete(workspace.shareTokenHash);
    this.listeners.delete(documentId);
    for (const [token, session] of this.sessions) {
      if (session.documentId === documentId) this.sessions.delete(token);
    }
  }

  private expectSuccess<T>(result: RepositoryResult<T>, operation: string): asserts result is { ok: true; data: T } {
    if (!result.ok) throw new Error(`Example ${operation} failed: ${result.code} ${result.message}`);
  }

  private notify(documentId: string): void {
    for (const listener of this.listeners.get(documentId) ?? []) listener();
  }

  private waitForNotification(documentId: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(documentId) ?? new Set<() => void>();
      this.listeners.set(documentId, listeners);
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        listeners.delete(onNotify);
        signal?.removeEventListener("abort", onAbort);
        if (error) reject(error); else resolve();
      };
      const onNotify = () => finish();
      const onAbort = () => finish(signal?.reason instanceof Error ? signal.reason : new DOMException("Operation cancelled", "AbortError"));
      const timer = setTimeout(() => finish(), timeoutMs);
      listeners.add(onNotify);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
