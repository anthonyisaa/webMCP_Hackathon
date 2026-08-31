import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { compileCapabilities, summarizeCapabilities } from "@/capabilities";
import {
  type ActivityEvent,
  type ActivityVia,
  type ActorRef,
  type ActorType,
  type AddEvidencePayload,
  type AgentCaller,
  type AgentCommentView,
  type AgentCoordinationToolSuccessDataMap,
  type AgentParticipantView,
  type AgentRegistryExecutionContext,
  type AgentTaskClaimView,
  type AgentTaskView,
  type AnswerHumanInputInput,
  type AutoRunnerAuthorization,
  type CapabilitySummary,
  type CatchUpData,
  type CatchUpInput,
  type ChallengeOptionPayload,
  type ChallengeView,
  type ClaimAgentTaskInput,
  type CollaboratorChange,
  type CompiledCapabilities,
  type CoordinationErrorCode,
  type CoordinationResult,
  type CreateAgentTaskInput,
  type DecisionState,
  type EvidenceView,
  type ErrorCode,
  type EventOrigin,
  type FollowupView,
  type GetThreadInput,
  type HumanInputRequestView,
  type HumanRatificationInput,
  type JoinSessionData,
  type LeaveSessionData,
  type MemberRole,
  type MutationEnvelope,
  type MutationPayloadMap,
  type MutationReceipt,
  type MutationToolName,
  type PageSelection,
  type PostAgentCommentInput,
  type PreparedDecisionView,
  type ProvenanceEvent,
  type RatiflowServicePort,
  type ReadinessFacts,
  type RealtimeWorkspaceNotice,
  type RequestHumanInputInput,
  type ResolveAgentTaskInput,
  type SetLaunchCapacityInput,
  type StandingInstructionsView,
  type StateBriefView,
  type ToolResult,
  type UpdateStandingInstructionsInput,
  type WebMCPMutationRequest,
  type WorkspaceView,
  type CancelAgentTaskInput,
} from "@/contracts";

type MemberId = "usr_maya_chen" | "usr_jordan_lee" | "agent_ratiflow_demo";
type SessionMember = { id: MemberId; actor: ActorRef; actorType: ActorType; role: MemberRole };

const MAYA: SessionMember = {
  id: "usr_maya_chen",
  actor: { id: "usr_maya_chen", name: "Maya Chen", role: "Product Lead" },
  actorType: "HUMAN",
  role: "PRODUCT_LEAD",
};
const JORDAN: SessionMember = {
  id: "usr_jordan_lee",
  actor: { id: "usr_jordan_lee", name: "Jordan Lee", role: "Engineering Lead" },
  actorType: "HUMAN",
  role: "ENGINEERING_LEAD",
};
const DEMO_AGENT: SessionMember = {
  id: "agent_ratiflow_demo",
  actor: { id: "agent_ratiflow_demo", name: "Ratiflow Agent", role: "Decision analyst" },
  actorType: "AGENT",
  role: "PRODUCT_LEAD",
};
const SEED_ACTOR: ActorRef = { id: "system_seed", name: "Seed fixture", role: "System" };

const WORKSPACE_ID = "ws_northstar_csv_launch";
const DECISION_ID = "dec_csv_oct15";
const ISO_NOW = "2026-08-30T10:00:00.000Z";
const BROWSER_LIVE_LEASE_MS = 45_000;
const INVOKED_LEASE_MS = 120_000;
const TASK_CLAIM_LEASE_MS = 90_000;
const ACTION_WINDOW_MS = 60 * 60 * 1_000;

type StoredEvidence = EvidenceView & { createdRevision: number };
type StoredChallenge = ChallengeView & { requiredEvidenceKind?: AddEvidencePayload["kind"] };
type StoredPrepared = PreparedDecisionView & { createdRevision: number };
type StoredEvent = ProvenanceEvent & { changes: CollaboratorChange["changes"] };
type StoredWorkspace = {
  id: string;
  name: string;
  revision: number;
  decision: WorkspaceView["decision"];
  customer: WorkspaceView["customer"];
  options: WorkspaceView["options"];
  evidence: StoredEvidence[];
  challenges: StoredChallenge[];
  preparedDecision: StoredPrepared | null;
  followup: FollowupView;
  events: StoredEvent[];
  requestLedger: Map<string, { fingerprint: string; result: unknown }>;
};
type StoredSession = { runId: string; member: SessionMember; expiresAt: number };
type StoredPageSession = {
  caller: AgentCaller;
  pageSessionId: string;
  invokedUntil: number;
  liveUntil: number | null;
  lastSeenAt: number;
  revoked: boolean;
};
type StoredTaskClaim = { id: string; caller: AgentCaller; pageSessionId: string; expiresAt: number };
type StoredTask = Omit<AgentTaskView, "claim"> & { claim: StoredTaskClaim | null };
type StoredActivity = { sequence: number; event: ActivityEvent };
type Subscriber = (notice: RealtimeWorkspaceNotice) => void;
type DemoRun = {
  id: string;
  workspace: StoredWorkspace;
  pageSessions: Map<string, StoredPageSession>;
  tasks: StoredTask[];
  comments: AgentCommentView[];
  questions: HumanInputRequestView[];
  standingInstructions: StandingInstructionsView;
  actionTimestamps: number[];
  activity: StoredActivity[];
  nextActivitySequence: number;
  subscribers: Set<Subscriber>;
  lastAgentActivityAt: number | null;
  explicitAgentLeave: boolean;
  expiresAt: number;
};
type ResolvedSession = { run: DemoRun; member: SessionMember };
type ResolvedAgentContext = ResolvedSession & { pageSession: StoredPageSession; context: AgentRegistryExecutionContext };

export type LocalRatiflowServiceOptions = { sessionTtlMs?: number };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 80;
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof DOMException && signal.reason.name === "AbortError") throw signal.reason;
  throw new DOMException(typeof signal.reason === "string" ? signal.reason : "Operation cancelled", "AbortError");
}

function omitStoredFields<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function pageSessionKey(caller: AgentCaller, pageSessionId: string): string {
  return `${caller}:${pageSessionId}`;
}

function callerVia(caller: AgentCaller): ActivityVia {
  return caller === "BROWSER_AGENT" ? "BROWSER_AGENT" : "AUTO_PICKUP";
}

function callerOrigin(caller: AgentCaller): EventOrigin {
  return caller === "BROWSER_AGENT" ? "WEBMCP" : "AUTO_PICKUP";
}

function claimVia(caller: AgentCaller): AgentTaskClaimView["via"] {
  return caller === "BROWSER_AGENT" ? "BROWSER_AGENT" : "AUTO_PICKUP";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatFollowupDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function capacityFollowupContext(workspace: StoredWorkspace): string {
  const capacityChange = [...workspace.events].reverse().flatMap((event) => event.changes
    .filter((change) => change.field === "decision.launchCapacityEngineerDays"
      && typeof change.before === "number" && typeof change.after === "number"
      && change.after === workspace.decision.launchCapacityEngineerDays)
    .map((change) => ({ event, before: change.before as number, after: change.after as number })))[0];
  if (!capacityChange) return `Launch capacity is ${workspace.decision.launchCapacityEngineerDays} engineer-days`;
  const direction = capacityChange.after < capacityChange.before ? "reduced" : capacityChange.after > capacityChange.before ? "increased" : "updated";
  const reason = `${capacityChange.event.rationale.charAt(0).toLowerCase()}${capacityChange.event.rationale.slice(1)}`;
  const article = /^(a|an|the)\s/i.test(reason) ? "" : /^[aeiou]/i.test(reason) ? "an " : "a ";
  return `Capacity ${direction} to ${workspace.decision.launchCapacityEngineerDays} engineer-days after ${article}${reason}`;
}

function followupContext(workspace: StoredWorkspace): string[] {
  const optionId = workspace.preparedDecision?.optionId ?? workspace.decision.selectedOptionId;
  const option = workspace.options.find((candidate) => candidate.id === optionId);
  if (!option) return [`Launch capacity is ${workspace.decision.launchCapacityEngineerDays} engineer-days`];
  const customerDeadline = formatFollowupDate(workspace.customer.usableExportDueDate);
  return [
    `${option.title} ${formatFollowupDate(option.launchDate)}`,
    option.postLaunchEngineerDays > 0 ? `GA ${customerDeadline}` : `Usable CSV export by ${customerDeadline}`,
    capacityFollowupContext(workspace),
  ];
}

function seedWorkspace(): StoredWorkspace {
  const options: WorkspaceView["options"] = [
    { id: "opt_csv_ga_oct15", title: "Full CSV export", summary: "Full CSV export, GA Oct 15, 2026", launchDate: "2026-10-15", exportEngineerDays: 8, totalEngineerDays: 18, postLaunchEngineerDays: 0 },
    { id: "opt_csv_beta_oct15", title: "Northstar beta", summary: "Invite-only, single-tenant Northstar beta Oct 15, 2026; GA Nov 1, 2026", launchDate: "2026-10-15", exportEngineerDays: 4, totalEngineerDays: 14, postLaunchEngineerDays: 4 },
    { id: "opt_csv_defer_nov1", title: "Defer export", summary: "Defer all export to GA Nov 1, 2026", launchDate: "2026-11-01", exportEngineerDays: 0, totalEngineerDays: 10, postLaunchEngineerDays: 8 },
  ];
  const evidence = [
    ["ev_capacity_r7", null, "ENGINEERING_ESTIMATE", "CONTEXT", "Launch capacity", "18 engineer-days are available for the Oct 15 launch.", "Jordan planning note", { engineerDays: 18 }],
    ["ev_core_reliability", null, "ENGINEERING_ESTIMATE", "CONTEXT", "Core reliability", "Launch reliability work requires 10 engineer-days.", "Engineering plan", { engineerDays: 10 }],
    ["ev_o1_ga_effort", "opt_csv_ga_oct15", "ENGINEERING_ESTIMATE", "SUPPORTS", "Full GA export effort", "Full GA export requires 8 launch engineer-days.", "Export estimate", { engineerDays: 8 }],
    ["ev_o2_beta_effort", "opt_csv_beta_oct15", "ENGINEERING_ESTIMATE", "SUPPORTS", "Northstar beta effort", "A single-tenant beta requires 4 launch engineer-days; the remaining 4 complete GA after launch.", "Export estimate", { engineerDays: 4 }],
    ["ev_o3_deferred_effort", "opt_csv_defer_nov1", "DELIVERY_RISK", "CONTEXT", "Deferred export effort", "O3 uses 0 export days before Oct 15 and all 8 after launch, leaving no buffer before Nov 1.", "Export estimate", { engineerDays: 0 }],
    ["ev_northstar_deadline", null, "CUSTOMER_DEADLINE", "CONTEXT", "Northstar renewal requirement", "The $180,000 renewal needs usable CSV export by Nov 1, not general availability on Oct 15.", "Renewal brief", { annualValueUsd: 180000, date: "2026-11-01" }],
  ] as const;
  return {
    id: WORKSPACE_ID,
    name: "Northstar CSV launch scope",
    revision: 7,
    decision: { id: DECISION_ID, question: "Should CSV export belong in the Oct 15, 2026 launch?", state: "READY", selectedOptionId: "opt_csv_ga_oct15", launchDate: "2026-10-15", launchCapacityEngineerDays: 18, coreReliabilityEngineerDays: 10 },
    customer: { id: "cust_northstar_health", name: "Northstar Health", annualRenewalUsd: 180000, usableExportDueDate: "2026-11-01" },
    options,
    evidence: evidence.map(([id, optionId, kind, stance, title, detail, sourceLabel, metrics]) => ({ id, optionId, kind, stance, title, detail, sourceLabel, metrics, actor: SEED_ACTOR, createdAt: ISO_NOW, createdRevision: 7 })),
    challenges: [],
    preparedDecision: null,
    followup: { id: "fu_customer_launch_brief", slug: "customer-launch-brief", status: "BLOCKED", ownerId: MAYA.id, dueDate: "2026-10-16", inheritedContext: [] },
    events: [],
    requestLedger: new Map(),
  };
}

export class LocalRatiflowService implements RatiflowServicePort {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly runs = new Map<string, DemoRun>();
  private readonly signingKey = randomBytes(32).toString("base64url");
  private readonly sessionTtlMs: number;

  constructor({ sessionTtlMs = 8 * 60 * 60 * 1_000 }: LocalRatiflowServiceOptions = {}) {
    this.sessionTtlMs = Math.max(1, sessionTtlMs);
  }

  issueDemoSessions(): { mayaSessionToken: string; jordanSessionToken: string; agentSessionToken: string } {
    this.cleanupExpired();
    const run: DemoRun = {
      id: randomBytes(24).toString("base64url"), workspace: seedWorkspace(), pageSessions: new Map(), tasks: [], comments: [], questions: [],
      standingInstructions: { autoPickup: false, scopes: ["MENTIONS", "TASKS"], maxActionsPerHour: 6 }, actionTimestamps: [], activity: [], nextActivitySequence: 1,
      subscribers: new Set(), lastAgentActivityAt: null, explicitAgentLeave: false, expiresAt: Date.now() + this.sessionTtlMs,
    };
    this.runs.set(run.id, run);
    this.appendActivity(run, {
      actor: SEED_ACTOR, actorType: "SYSTEM", via: "SYSTEM", type: "WORKSPACE_MUTATED", target: { kind: "DECISION", id: DECISION_ID },
      summary: "Northstar decision workspace launched.", workspaceRevision: run.workspace.revision, createdAt: ISO_NOW,
    }, false);
    return {
      mayaSessionToken: this.issueSession(run, MAYA),
      jordanSessionToken: this.issueSession(run, JORDAN),
      agentSessionToken: this.issueSession(run, DEMO_AGENT),
    };
  }

  async inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView> {
    throwIfAborted(signal);
    const session = this.session(sessionToken);
    if (!session) throw new Error("Unauthorized session");
    this.cleanupRun(session.run);
    return this.view(session.run);
  }

  async mutateFromWebMCP<TTool extends MutationToolName>(request: WebMCPMutationRequest<TTool>): Promise<ToolResult<MutationReceipt>> {
    const context = request.executionContext;
    throwIfAborted(context.signal);
    const selection = request.capturedSelection;
    const epoch = request.capturedContextEpoch;
    const resolved = this.resolveAgentContext(context, false);
    if (!resolved) return this.failure(seedWorkspace(), "UNAUTHORIZED", "A valid open agent page session is required.", false, selection, epoch);
    const { run, member } = resolved;
    const workspace = run.workspace;
    if (request.envelope.contextEpoch !== epoch || !this.validSelection(workspace, selection)) {
      return this.failure(workspace, "STALE_PAGE_CONTEXT", "The page selection changed; refresh tools and try again.", true, selection, epoch, { expectedContextEpoch: request.envelope.contextEpoch, actualContextEpoch: epoch });
    }
    const validation = this.validateMutation(workspace, request.toolName, request.envelope, selection);
    if (validation) return this.failure(workspace, "INVALID_INPUT", validation, false, selection, epoch);
    const origin = callerOrigin(context.caller);
    return this.withDecisionIdempotency(run, request.envelope, request.toolName, origin, selection, epoch, () => {
      throwIfAborted(context.signal);
      if (request.envelope.expectedWorkspaceRevision !== workspace.revision) return this.stale(workspace, request.envelope.expectedWorkspaceRevision, selection, epoch);
      if (!this.webMcpPermits(workspace, request.toolName, selection, member.role)) return this.failure(workspace, "NOT_AVAILABLE_IN_STATE", "This tool is not available in the current decision state.", true, selection, epoch);
      const guard = this.guardAgentWrite(resolved, context.caller === "AUTO_RUNNER");
      if (guard) return this.failure(workspace, "CONFLICT", guard.message, guard.retryable, selection, epoch, { nextAction: guard.nextAction });
      if (context.caller === "AUTO_RUNNER" && !this.reserveAutoAction(run)) return this.failure(workspace, "CONFLICT", "The hourly auto-runner action budget is exhausted.", false, selection, epoch);
      switch (request.toolName) {
        case "recommend_option": return this.recommend(run, member, origin, request.envelope as MutationEnvelope<MutationPayloadMap["recommend_option"]>, selection, epoch);
        case "add_evidence": return this.addEvidence(run, member, origin, request.envelope as MutationEnvelope<AddEvidencePayload>, selection, epoch);
        case "challenge_option": return this.challenge(run, member, origin, request.envelope as MutationEnvelope<ChallengeOptionPayload>, selection, epoch);
        case "prepare_decision": return this.prepare(run, member, origin, request.envelope as MutationEnvelope<MutationPayloadMap["prepare_decision"]>, selection, epoch);
      }
    });
  }

  async joinAgentSession(context: AgentRegistryExecutionContext, capturedSelection: PageSelection): Promise<CoordinationResult<JoinSessionData>> {
    throwIfAborted(context.signal);
    const session = this.agentMembership(context);
    if (!session) return this.coordinationFailure("UNAUTHORIZED", "A valid agent membership is required.", false);
    if (context.caller !== "BROWSER_AGENT" || !this.validSelection(session.run.workspace, capturedSelection)) return this.coordinationFailure("INVALID_INPUT", "join_session requires a browser caller and current selection.", false, session.run);
    const run = session.run;
    this.cleanupRun(run);
    const existingPageSession = run.pageSessions.get(pageSessionKey(context.caller, context.pageSessionId));
    if (existingPageSession?.revoked) return this.coordinationFailure("SESSION_CLOSED", "This page session was revoked; rotate the page session before joining again.", false, run);
    for (const pageSession of run.pageSessions.values()) {
      if (pageSession.caller === "BROWSER_AGENT" && pageSession.pageSessionId !== context.pageSessionId) pageSession.revoked = true;
    }
    for (const task of run.tasks) {
      if (task.claim?.caller === "AUTO_RUNNER" || (task.claim?.caller === "BROWSER_AGENT" && task.claim.pageSessionId !== context.pageSessionId)) {
        task.claim = null;
        if (task.status === "CLAIMED") task.status = "OPEN";
        task.updatedAt = new Date().toISOString();
      }
    }
    const now = Date.now();
    const pageSession: StoredPageSession = { caller: "BROWSER_AGENT", pageSessionId: context.pageSessionId, invokedUntil: now + INVOKED_LEASE_MS, liveUntil: now + BROWSER_LIVE_LEASE_MS, lastSeenAt: now, revoked: false };
    run.pageSessions.set(pageSessionKey(context.caller, context.pageSessionId), pageSession);
    this.noteAgentActivity(run, now);
    const event = this.appendActivity(run, {
      actor: session.member.actor, actorType: "AGENT", via: "BROWSER_AGENT", type: "AGENT_JOINED", target: capturedSelection,
      summary: `${session.member.actor.name} joined the live decision room.`, workspaceRevision: null,
    });
    return {
      ok: true, cursor: event.cursor,
      data: { identity: session.member.actor, presence: this.agentPresence(run), stateBrief: this.stateBrief(run, capturedSelection), inbox: this.inboxView(run, context), sessionOpen: true },
    };
  }

  async catchUpAgentSession(context: AgentRegistryExecutionContext, input: CatchUpInput): Promise<CoordinationResult<CatchUpData>> {
    throwIfAborted(context.signal);
    const membership = this.agentMembership(context);
    if (!membership) return this.coordinationFailure("UNAUTHORIZED", "A valid agent membership and page session are required.", false);
    const priorPageSession = membership.run.pageSessions.get(pageSessionKey(context.caller, context.pageSessionId));
    if (priorPageSession?.revoked) return this.coordinationFailure("SESSION_CLOSED", "This page session was revoked; rotate it before invoking again.", false, membership.run);
    const resolved = this.resolveAgentContext(context, true);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "This page session is closed.", false, membership.run);
    const { run } = resolved;
    if (input.sinceCursor !== undefined && !isUuid(input.sinceCursor)) return this.coordinationFailure("INVALID_INPUT", "sinceCursor must be an opaque UUID cursor.", false, run);
    if (input.sinceCursor === undefined) {
      return this.coordinationSuccess(run, { events: run.activity.slice(-20).map(({ event }) => event), inbox: this.inboxView(run, context), questions: this.questionsView(run), hasMore: false, observedHighWater: this.currentCursor(run), sessionOpen: true });
    }
    const index = run.activity.findIndex(({ event }) => event.cursor === input.sinceCursor);
    if (index < 0) return { ok: false, code: "CURSOR_EXPIRED", message: "The activity cursor is not available in this workspace.", retryable: true, resetCursor: this.currentCursor(run), nextAction: "Call catch_up without sinceCursor to establish a fresh activity position." };
    const scanned = run.activity.slice(index + 1, index + 51);
    const cursor = scanned.at(-1)?.event.cursor ?? input.sinceCursor;
    const observedHighWater = this.currentCursor(run);
    return { ok: true, cursor, data: { events: scanned.map(({ event }) => clone(event)), inbox: this.inboxView(run, context), questions: this.questionsView(run), hasMore: cursor !== observedHighWater, observedHighWater, sessionOpen: true } };
  }

  async leaveAgentSession(context: AgentRegistryExecutionContext): Promise<CoordinationResult<LeaveSessionData>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, false, false);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "This page session is already closed.", false);
    const { run, pageSession, member } = resolved;
    pageSession.revoked = true;
    for (const task of run.tasks) {
      if (task.claim?.pageSessionId === context.pageSessionId && task.claim.caller === context.caller) {
        task.claim = null;
        if (task.status === "CLAIMED") task.status = "OPEN";
        task.updatedAt = new Date().toISOString();
      }
    }
    run.explicitAgentLeave = true;
    const event = this.appendActivity(run, {
      actor: member.actor, actorType: "AGENT", via: callerVia(context.caller), type: "AGENT_LEFT",
      target: { kind: "DECISION", id: DECISION_ID }, summary: `${member.actor.name} left the decision room.`, workspaceRevision: null,
    });
    return { ok: true, cursor: event.cursor, data: { identity: member.actor, presence: this.agentPresence(run), sessionOpen: false } };
  }

  async getAgentStateBrief(context: AgentRegistryExecutionContext, capturedSelection: PageSelection): Promise<CoordinationResult<{ brief: StateBriefView }>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, false);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "Open or invoke an agent session first.", true);
    if (!this.validSelection(resolved.run.workspace, capturedSelection)) return this.coordinationFailure("INVALID_INPUT", "The captured selection is no longer valid.", false, resolved.run);
    return this.coordinationSuccess(resolved.run, { brief: this.stateBrief(resolved.run, capturedSelection) });
  }

  async getAgentThread(context: AgentRegistryExecutionContext, input: GetThreadInput, capturedSelection: PageSelection): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["get_thread"]>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, false);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "Open or invoke an agent session first.", true);
    const target = input.target ?? capturedSelection;
    if (!this.validSelection(resolved.run.workspace, target)) return this.coordinationFailure("INVALID_INPUT", "The requested target is not in this workspace.", false, resolved.run);
    return this.coordinationSuccess(resolved.run, {
      target,
      comments: resolved.run.comments.filter((comment) => this.sameTarget(comment.target, target)).slice(-100),
      questions: resolved.run.questions.filter((question) => this.sameTarget(question.target, target)).slice(-50),
    });
  }

  async getAgentInbox(context: AgentRegistryExecutionContext): Promise<CoordinationResult<{ inbox: AgentTaskView[] }>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, false);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "Open or invoke an agent session first.", true);
    return this.coordinationSuccess(resolved.run, { inbox: this.inboxView(resolved.run, context) });
  }

  async claimAgentTask(context: AgentRegistryExecutionContext, input: ClaimAgentTaskInput): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, context.caller === "AUTO_RUNNER");
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "Open or authorize this page session first.", true);
    const { run } = resolved;
    if (!validId(input.taskId) || !isUuid(input.requestId)) return this.coordinationFailure("INVALID_INPUT", "taskId and requestId are invalid.", false, run);
    return this.withCoordinationIdempotency(run, input.requestId, "claim_agent_task", input, context, () => {
      const task = run.tasks.find((candidate) => candidate.id === input.taskId);
      if (!task) return this.coordinationFailure("NOT_FOUND", "The task does not exist.", false, run);
      this.expireTaskClaim(task);
      if (task.status === "WAITING_HUMAN" || task.status === "DONE" || task.status === "CANCELLED") return this.coordinationFailure("CONFLICT", `A ${task.status.toLowerCase()} task cannot be claimed.`, false, run);
      if (task.claim) {
        const sameOwner = task.claim.caller === context.caller && task.claim.pageSessionId === context.pageSessionId;
        if (sameOwner && context.claimId === task.claim.id) {
          task.claim.expiresAt = Date.now() + TASK_CLAIM_LEASE_MS;
          task.updatedAt = new Date().toISOString();
          this.noteAgentActivity(run);
          return this.coordinationSuccess(run, { task: this.taskView(task, context) });
        }
        return this.coordinationFailure("TASK_ALREADY_CLAIMED", "Another agent session owns this task claim.", true, run, "Wait for the claim lease or choose another open task.");
      }
      if (context.caller === "AUTO_RUNNER") {
        const authorization = this.autoAuthorization(run, task);
        if (!authorization.authorized) return this.autoAuthorizationFailure(run, authorization);
        if (!this.reserveAutoAction(run)) return this.coordinationFailure("ACTION_BUDGET_EXCEEDED", "The hourly auto-runner action budget is exhausted.", false, run);
      }
      task.claim = { id: randomUUID(), caller: context.caller, pageSessionId: context.pageSessionId, expiresAt: Date.now() + TASK_CLAIM_LEASE_MS };
      task.status = "CLAIMED";
      task.updatedAt = new Date().toISOString();
      this.noteAgentActivity(run);
      const event = this.appendActivity(run, {
        actor: DEMO_AGENT.actor, actorType: "AGENT", via: callerVia(context.caller), type: "TASK_CLAIMED", target: task.target,
        summary: `${DEMO_AGENT.actor.name} claimed: ${task.body}`, workspaceRevision: null, taskId: task.id,
      });
      return { ok: true, cursor: event.cursor, data: { task: this.taskView(task, context) } };
    });
  }

  async resolveAgentTask(context: AgentRegistryExecutionContext, input: ResolveAgentTaskInput): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, false);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "Open or authorize this page session first.", true);
    const { run } = resolved;
    if (!validId(input.taskId) || !isUuid(input.requestId) || !validText(input.outcome, 600)
      || (input.resultLink !== undefined && (!validText(input.resultLink, 240) || !input.resultLink.startsWith("/") || input.resultLink.startsWith("//")))) {
      return this.coordinationFailure("INVALID_INPUT", "Task resolution input is invalid.", false, run);
    }
    return this.withCoordinationIdempotency(run, input.requestId, "resolve_task", input, context, () => {
      const task = run.tasks.find((candidate) => candidate.id === input.taskId);
      if (!task) return this.coordinationFailure("NOT_FOUND", "The task does not exist.", false, run);
      const claimFailure = this.validateClaim(run, task, context);
      if (claimFailure) return claimFailure;
      const guard = this.guardAgentWrite(resolved, context.caller === "AUTO_RUNNER");
      if (guard) return this.coordinationFailure(guard.code, guard.message, guard.retryable, run, guard.nextAction);
      if (context.caller === "AUTO_RUNNER" && !this.reserveAutoAction(run)) return this.coordinationFailure("ACTION_BUDGET_EXCEEDED", "The hourly auto-runner action budget is exhausted.", false, run);
      task.status = "DONE";
      task.resultSummary = input.outcome.trim();
      if (input.resultLink !== undefined) task.resultLink = input.resultLink.trim();
      task.claim = null;
      task.updatedAt = new Date().toISOString();
      this.noteAgentActivity(run);
      const event = this.appendActivity(run, {
        actor: DEMO_AGENT.actor, actorType: "AGENT", via: callerVia(context.caller), type: "TASK_RESOLVED", target: task.target,
        summary: task.resultSummary, workspaceRevision: null, taskId: task.id,
      });
      return { ok: true, cursor: event.cursor, data: { task: this.taskView(task, context) } };
    });
  }

  async postAgentComment(context: AgentRegistryExecutionContext, input: PostAgentCommentInput): Promise<CoordinationResult<{ comment: AgentCommentView }>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, false);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "Open or authorize this page session first.", true);
    const { run } = resolved;
    if (!this.validSelection(run.workspace, input.target) || !validText(input.body, 1_200) || !isUuid(input.requestId)
      || (input.replyTo !== undefined && !validId(input.replyTo)) || (input.taskId !== undefined && !validId(input.taskId))) return this.coordinationFailure("INVALID_INPUT", "Comment input is invalid.", false, run);
    return this.withCoordinationIdempotency(run, input.requestId, "post_comment", input, context, () => {
      if (input.replyTo && !run.comments.some((comment) => comment.id === input.replyTo)) return this.coordinationFailure("NOT_FOUND", "The reply target does not exist.", false, run);
      const task = input.taskId ? run.tasks.find((candidate) => candidate.id === input.taskId) : undefined;
      if (input.taskId && !task) return this.coordinationFailure("NOT_FOUND", "The task does not exist.", false, run);
      if (task) {
        const claimFailure = this.validateClaim(run, task, context);
        if (claimFailure) return claimFailure;
      } else if (context.caller === "AUTO_RUNNER" && !this.findContextClaim(run, context)) return this.coordinationFailure("CLAIM_LOST", "Auto-runner writes require a current task claim.", true, run);
      const guard = this.guardAgentWrite(resolved, context.caller === "AUTO_RUNNER");
      if (guard) return this.coordinationFailure(guard.code, guard.message, guard.retryable, run, guard.nextAction);
      if (context.caller === "AUTO_RUNNER" && !this.reserveAutoAction(run)) return this.coordinationFailure("ACTION_BUDGET_EXCEEDED", "The hourly auto-runner action budget is exhausted.", false, run);
      const comment: AgentCommentView = {
        id: randomUUID(), target: clone(input.target), body: input.body.trim(), actor: DEMO_AGENT.actor, via: callerVia(context.caller), createdAt: new Date().toISOString(),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}), ...(input.taskId ? { taskId: input.taskId } : {}),
      };
      run.comments.push(comment);
      this.noteAgentActivity(run);
      const event = this.appendActivity(run, {
        actor: DEMO_AGENT.actor, actorType: "AGENT", via: callerVia(context.caller), type: "AGENT_COMMENTED", target: comment.target,
        summary: comment.body, workspaceRevision: null, ...(comment.taskId ? { taskId: comment.taskId } : {}),
      });
      return { ok: true, cursor: event.cursor, data: { comment: clone(comment) } };
    });
  }

  async requestHumanInput(context: AgentRegistryExecutionContext, input: RequestHumanInputInput): Promise<CoordinationResult<AgentCoordinationToolSuccessDataMap["request_human_input"]>> {
    throwIfAborted(context.signal);
    const resolved = this.resolveAgentContext(context, false);
    if (!resolved) return this.coordinationFailure("SESSION_CLOSED", "Open or authorize this page session first.", true);
    const { run } = resolved;
    if (!this.validSelection(run.workspace, input.target) || !validText(input.question, 600) || !isUuid(input.requestId)
      || (input.taskId !== undefined && !validId(input.taskId))) return this.coordinationFailure("INVALID_INPUT", "Human-input request is invalid.", false, run);
    return this.withCoordinationIdempotency(run, input.requestId, "request_human_input", input, context, () => {
      const task = input.taskId ? run.tasks.find((candidate) => candidate.id === input.taskId) : undefined;
      if (input.taskId && !task) return this.coordinationFailure("NOT_FOUND", "The task does not exist.", false, run);
      if (task) {
        const claimFailure = this.validateClaim(run, task, context);
        if (claimFailure) return claimFailure;
      } else if (context.caller === "AUTO_RUNNER" && !this.findContextClaim(run, context)) return this.coordinationFailure("CLAIM_LOST", "Auto-runner writes require a current task claim.", true, run);
      const guard = this.guardAgentWrite(resolved, context.caller === "AUTO_RUNNER");
      if (guard) return this.coordinationFailure(guard.code, guard.message, guard.retryable, run, guard.nextAction);
      if (context.caller === "AUTO_RUNNER" && !this.reserveAutoAction(run)) return this.coordinationFailure("ACTION_BUDGET_EXCEEDED", "The hourly auto-runner action budget is exhausted.", false, run);
      const question: HumanInputRequestView = {
        id: randomUUID(), target: clone(input.target), question: input.question.trim(), status: "OPEN", askedBy: DEMO_AGENT.actor,
        askedVia: claimVia(context.caller), askedAt: new Date().toISOString(), ...(input.taskId ? { taskId: input.taskId } : {}),
      };
      run.questions.push(question);
      if (task) {
        task.status = "WAITING_HUMAN";
        task.claim = null;
        task.updatedAt = new Date().toISOString();
      }
      this.noteAgentActivity(run);
      const event = this.appendActivity(run, {
        actor: DEMO_AGENT.actor, actorType: "AGENT", via: callerVia(context.caller), type: "HUMAN_INPUT_REQUESTED",
        target: question.target, summary: question.question, workspaceRevision: null, questionId: question.id, ...(task ? { taskId: task.id } : {}),
      });
      return { ok: true, cursor: event.cursor, data: { question: clone(question), ...(task ? { task: this.taskView(task, context) } : {}) } };
    });
  }

  async createAgentTaskFromHumanUi(sessionToken: string, input: CreateAgentTaskInput, signal?: AbortSignal): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    throwIfAborted(signal);
    const session = this.humanMembership(sessionToken);
    if (!session) return this.coordinationFailure("UNAUTHORIZED", "A valid human membership is required.", false);
    const { run, member } = session;
    if (!(["MENTION", "TASK"] as string[]).includes(input.kind) || !validText(input.body, 1_200) || !this.validSelection(run.workspace, input.target) || !isUuid(input.requestId)) return this.coordinationFailure("INVALID_INPUT", "Task input is invalid.", false, run);
    return this.withCoordinationIdempotency(run, input.requestId, "create_agent_task", input, member.id, () => {
      const now = new Date().toISOString();
      const task: StoredTask = {
        id: randomUUID(), kind: input.kind, body: input.body.trim(), target: clone(input.target), status: "OPEN", createdBy: member.actor,
        assignedAgent: DEMO_AGENT.actor, claim: null, createdAt: now, updatedAt: now,
      };
      run.tasks.push(task);
      const event = this.appendActivity(run, {
        actor: member.actor, actorType: "HUMAN", via: "ORDINARY_UI", type: "TASK_CREATED", target: task.target,
        summary: task.body, workspaceRevision: null, taskId: task.id,
      });
      return { ok: true, cursor: event.cursor, data: { task: this.taskView(task) } };
    });
  }

  async answerHumanInputFromHumanUi(sessionToken: string, input: AnswerHumanInputInput, signal?: AbortSignal): Promise<CoordinationResult<{ question: HumanInputRequestView; task?: AgentTaskView }>> {
    throwIfAborted(signal);
    const session = this.humanMembership(sessionToken);
    if (!session) return this.coordinationFailure("UNAUTHORIZED", "A valid human membership is required.", false);
    const { run, member } = session;
    if (!validId(input.questionId) || !validText(input.answer, 1_200) || !isUuid(input.requestId)) return this.coordinationFailure("INVALID_INPUT", "Answer input is invalid.", false, run);
    return this.withCoordinationIdempotency(run, input.requestId, "answer_human_input", input, member.id, () => {
      const question = run.questions.find((candidate) => candidate.id === input.questionId);
      if (!question) return this.coordinationFailure("NOT_FOUND", "The question does not exist.", false, run);
      if (question.status !== "OPEN") return this.coordinationFailure("CONFLICT", "The question has already been answered.", false, run);
      const now = new Date().toISOString();
      question.status = "ANSWERED";
      question.answer = input.answer.trim();
      question.answeredBy = member.actor;
      question.answeredAt = now;
      const task = question.taskId ? run.tasks.find((candidate) => candidate.id === question.taskId) : undefined;
      if (task?.status === "WAITING_HUMAN") {
        task.status = "OPEN";
        task.claim = null;
        task.updatedAt = now;
      }
      const event = this.appendActivity(run, {
        actor: member.actor, actorType: "HUMAN", via: "ORDINARY_UI", type: "HUMAN_INPUT_ANSWERED", target: question.target,
        summary: question.answer, workspaceRevision: null, questionId: question.id, ...(task ? { taskId: task.id } : {}),
      });
      return { ok: true, cursor: event.cursor, data: { question: clone(question), ...(task ? { task: this.taskView(task) } : {}) } };
    });
  }

  async cancelAgentTaskFromHumanUi(sessionToken: string, input: CancelAgentTaskInput, signal?: AbortSignal): Promise<CoordinationResult<{ task: AgentTaskView }>> {
    throwIfAborted(signal);
    const session = this.humanMembership(sessionToken);
    if (!session) return this.coordinationFailure("UNAUTHORIZED", "A valid human membership is required.", false);
    const { run, member } = session;
    if (!validId(input.taskId) || !isUuid(input.requestId)) return this.coordinationFailure("INVALID_INPUT", "Task cancellation input is invalid.", false, run);
    return this.withCoordinationIdempotency(run, input.requestId, "cancel_agent_task", input, member.id, () => {
      const task = run.tasks.find((candidate) => candidate.id === input.taskId);
      if (!task) return this.coordinationFailure("NOT_FOUND", "The task does not exist.", false, run);
      if (task.status === "DONE" || task.status === "CANCELLED") return this.coordinationFailure("CONFLICT", "Only unresolved tasks can be cancelled.", false, run);
      task.status = "CANCELLED";
      task.claim = null;
      task.updatedAt = new Date().toISOString();
      const event = this.appendActivity(run, {
        actor: member.actor, actorType: "HUMAN", via: "ORDINARY_UI", type: "TASK_CANCELLED", target: task.target,
        summary: `Cancelled: ${task.body}`, workspaceRevision: null, taskId: task.id,
      });
      return { ok: true, cursor: event.cursor, data: { task: this.taskView(task) } };
    });
  }

  async updateStandingInstructionsFromHumanUi(sessionToken: string, input: UpdateStandingInstructionsInput, signal?: AbortSignal): Promise<CoordinationResult<{ standingInstructions: StandingInstructionsView }>> {
    throwIfAborted(signal);
    const session = this.humanMembership(sessionToken);
    if (!session) return this.coordinationFailure("UNAUTHORIZED", "A valid human membership is required.", false);
    const { run, member } = session;
    const uniqueScopes = new Set(input.scopes);
    if (typeof input.autoPickup !== "boolean" || !Array.isArray(input.scopes) || input.scopes.length !== uniqueScopes.size
      || !input.scopes.every((scope) => scope === "MENTIONS" || scope === "TASKS") || !Number.isInteger(input.maxActionsPerHour)
      || input.maxActionsPerHour < 1 || input.maxActionsPerHour > 20 || !isUuid(input.requestId)) return this.coordinationFailure("INVALID_INPUT", "Standing instructions are invalid.", false, run);
    return this.withCoordinationIdempotency(run, input.requestId, "update_standing_instructions", input, member.id, () => {
      run.standingInstructions = { autoPickup: input.autoPickup, scopes: [...input.scopes], maxActionsPerHour: input.maxActionsPerHour };
      if (!input.autoPickup) {
        for (const task of run.tasks) {
          if (task.claim?.caller === "AUTO_RUNNER") {
            task.claim = null;
            if (task.status === "CLAIMED") task.status = "OPEN";
            task.updatedAt = new Date().toISOString();
          }
        }
      }
      const event = this.appendActivity(run, {
        actor: member.actor, actorType: "HUMAN", via: "ORDINARY_UI", type: "STANDING_INSTRUCTIONS_CHANGED", target: { kind: "DECISION", id: DECISION_ID },
        summary: input.autoPickup ? "Auto pickup enabled." : "Auto pickup disabled.", workspaceRevision: null,
      });
      return { ok: true, cursor: event.cursor, data: { standingInstructions: clone(run.standingInstructions) } };
    });
  }

  async authorizeAutoRunner(context: AgentRegistryExecutionContext, taskId: string): Promise<CoordinationResult<AutoRunnerAuthorization>> {
    throwIfAborted(context.signal);
    if (context.caller !== "AUTO_RUNNER") return this.coordinationFailure("UNAUTHORIZED", "Only the fixed auto-runner route can request authorization.", false);
    const resolved = this.resolveAgentContext(context, true);
    if (!resolved) return this.coordinationFailure("UNAUTHORIZED", "A valid agent membership is required.", false);
    if (!validId(taskId)) return this.coordinationFailure("INVALID_INPUT", "taskId is invalid.", false, resolved.run);
    const task = resolved.run.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return this.coordinationFailure("NOT_FOUND", "The task does not exist.", false, resolved.run);
    return this.coordinationSuccess(resolved.run, this.autoAuthorization(resolved.run, task));
  }

  async setLaunchCapacityFromCollaboratorUi(sessionToken: string, input: SetLaunchCapacityInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    throwIfAborted(signal);
    const session = this.session(sessionToken);
    const selection: PageSelection = { kind: "DECISION", id: DECISION_ID };
    const epoch = 0;
    if (!session || session.member.id !== JORDAN.id) return this.failure(seedWorkspace(), "UNAUTHORIZED", "Only Jordan Lee may update launch capacity in this demo.", false, selection, epoch);
    const { run } = session;
    const workspace = run.workspace;
    if (!Number.isInteger(input.payload?.launchCapacityEngineerDays) || input.payload.launchCapacityEngineerDays < 0 || input.payload.launchCapacityEngineerDays > 90 || !validText(input.payload.reason, 240) || !isUuid(input.requestId)) return this.failure(workspace, "INVALID_INPUT", "Capacity updates must use bounded valid input.", false, selection, epoch);
    const envelope: MutationEnvelope<SetLaunchCapacityInput["payload"]> = { expectedWorkspaceRevision: input.expectedWorkspaceRevision, contextEpoch: epoch, requestId: input.requestId, rationale: input.payload.reason, payload: input.payload };
    return this.withDecisionIdempotency(run, envelope, "SET_LAUNCH_CAPACITY", "ORDINARY_UI", selection, epoch, () => {
      throwIfAborted(signal);
      if (input.expectedWorkspaceRevision !== workspace.revision) return this.stale(workspace, input.expectedWorkspaceRevision, selection, epoch);
      if (workspace.decision.state === "COMMITTED") return this.failure(workspace, "NOT_AVAILABLE_IN_STATE", "The committed decision cannot be changed.", false, selection, epoch);
      const before = workspace.decision.launchCapacityEngineerDays;
      const beforeState = workspace.decision.state;
      workspace.decision.launchCapacityEngineerDays = input.payload.launchCapacityEngineerDays;
      workspace.decision.state = this.derivedState(workspace);
      const changes: CollaboratorChange["changes"] = [
        { field: "decision.launchCapacityEngineerDays", before, after: input.payload.launchCapacityEngineerDays },
        { field: "decision.state", before: beforeState, after: workspace.decision.state },
      ];
      if (beforeState === "READY" && workspace.decision.state !== "READY") changes.push({ field: "capabilities.prepare_decision", before: true, after: false });
      return this.commit(run, session.member, "ORDINARY_UI", undefined, input.payload.reason, "NOT_APPLICABLE", [DECISION_ID], changes, selection, epoch);
    });
  }

  async ratifyFromHumanUi(sessionToken: string, input: HumanRatificationInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    throwIfAborted(signal);
    const session = this.session(sessionToken);
    const selection: PageSelection = { kind: "DECISION", id: DECISION_ID };
    const epoch = 0;
    if (!session) return this.failure(seedWorkspace(), "UNAUTHORIZED", "Only Maya Chen can ratify through the ordinary UI.", false, selection, epoch);
    if (session.member.id !== MAYA.id || session.member.actorType !== "HUMAN") return this.failure(session.run.workspace, "UNAUTHORIZED", "Only Maya Chen can ratify through the ordinary UI.", false, selection, epoch);
    const { run } = session;
    const workspace = run.workspace;
    if (!isUuid(input.requestId) || !validText(input.recommendation, 600) || !validText(input.customerMessage, 800)) return this.failure(workspace, "INVALID_INPUT", "Ratification requires bounded recommendation and customer message text.", false, selection, epoch);
    const envelope: MutationEnvelope<HumanRatificationInput> = { expectedWorkspaceRevision: input.expectedWorkspaceRevision, contextEpoch: epoch, requestId: input.requestId, rationale: input.recommendation, payload: input };
    return this.withDecisionIdempotency(run, envelope, "RATIFY_DECISION", "ORDINARY_UI", selection, epoch, () => {
      throwIfAborted(signal);
      if (input.expectedWorkspaceRevision !== workspace.revision) return this.stale(workspace, input.expectedWorkspaceRevision, selection, epoch);
      if (workspace.decision.state !== "REVIEW" || !workspace.preparedDecision) return this.failure(workspace, "NOT_AVAILABLE_IN_STATE", "Ratification requires a prepared decision in REVIEW.", false, selection, epoch);
      workspace.preparedDecision.recommendation = input.recommendation;
      workspace.preparedDecision.customerMessageDraft = input.customerMessage;
      workspace.preparedDecision.reviewStatus = "RATIFIED";
      workspace.preparedDecision.ratifiedBy = MAYA.actor;
      workspace.decision.state = "COMMITTED";
      workspace.followup.status = "READY";
      workspace.followup.inheritedContext = followupContext(workspace);
      return this.commit(run, session.member, "ORDINARY_UI", undefined, input.recommendation, "RATIFIED", [DECISION_ID, workspace.preparedDecision.id, workspace.followup.id], [
        { field: "decision.state", before: "REVIEW", after: "COMMITTED" },
        { field: "preparedDecision.reviewStatus", before: "PROPOSED", after: "RATIFIED" },
        { field: "followup.status", before: "BLOCKED", after: "READY" },
      ], selection, epoch);
    });
  }

  subscribe(sessionToken: string, onNotice: (notice: RealtimeWorkspaceNotice) => void): () => void {
    const session = this.session(sessionToken);
    if (!session) return () => undefined;
    session.run.subscribers.add(onNotice);
    return () => session.run.subscribers.delete(onNotice);
  }

  private issueSession(run: DemoRun, member: SessionMember): string {
    const raw = randomBytes(32).toString("base64url");
    const signature = createHmac("sha256", this.signingKey).update(raw).digest("base64url");
    const token = `${raw}.${signature}`;
    this.sessions.set(this.sessionStorageKey(token), { runId: run.id, member, expiresAt: run.expiresAt });
    return token;
  }

  private sessionStorageKey(token: string): string {
    return createHmac("sha256", this.signingKey).update(`session:${token}`).digest("base64url");
  }

  private session(token: string): ResolvedSession | null {
    this.cleanupExpired();
    const [raw, signature, extra] = token.split(".");
    if (!raw || !signature || extra) return null;
    const expected = createHmac("sha256", this.signingKey).update(raw).digest("base64url");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const stored = this.sessions.get(this.sessionStorageKey(token));
    const run = stored ? this.runs.get(stored.runId) : undefined;
    if (!stored || !run || stored.expiresAt <= Date.now() || run.expiresAt <= Date.now()) return null;
    return { run, member: stored.member };
  }

  private humanMembership(token: string): ResolvedSession | null {
    const session = this.session(token);
    return session?.member.actorType === "HUMAN" ? session : null;
  }

  private agentMembership(context: AgentRegistryExecutionContext): ResolvedSession | null {
    if (!isUuid(context.pageSessionId) || (context.caller !== "BROWSER_AGENT" && context.caller !== "AUTO_RUNNER")) return null;
    const session = this.session(context.agentSessionToken);
    return session?.member.id === DEMO_AGENT.id && session.member.actorType === "AGENT" ? session : null;
  }

  private resolveAgentContext(context: AgentRegistryExecutionContext, establishInvoked: boolean, renew = true): ResolvedAgentContext | null {
    const session = this.agentMembership(context);
    if (!session) return null;
    const { run } = session;
    this.cleanupRun(run);
    const key = pageSessionKey(context.caller, context.pageSessionId);
    let pageSession = run.pageSessions.get(key);
    const now = Date.now();
    if (pageSession?.revoked) return null;
    if ((!pageSession || pageSession.invokedUntil <= now) && establishInvoked) {
      pageSession = { caller: context.caller, pageSessionId: context.pageSessionId, invokedUntil: now + INVOKED_LEASE_MS, liveUntil: null, lastSeenAt: now, revoked: false };
      run.pageSessions.set(key, pageSession);
    }
    if (!pageSession || pageSession.revoked || pageSession.invokedUntil <= now) return null;
    if (renew) {
      pageSession.invokedUntil = now + INVOKED_LEASE_MS;
      if (pageSession.liveUntil !== null && pageSession.liveUntil > now) pageSession.liveUntil = now + BROWSER_LIVE_LEASE_MS;
      pageSession.lastSeenAt = now;
      this.noteAgentActivity(run, now);
    }
    return { ...session, pageSession, context };
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(token);
    for (const [runId, run] of this.runs) if (run.expiresAt <= now) this.runs.delete(runId);
  }

  private cleanupRun(run: DemoRun): void {
    for (const task of run.tasks) this.expireTaskClaim(task);
    const cutoff = Date.now() - ACTION_WINDOW_MS;
    run.actionTimestamps = run.actionTimestamps.filter((timestamp) => timestamp > cutoff);
  }

  private expireTaskClaim(task: StoredTask): void {
    if (!task.claim || task.claim.expiresAt > Date.now()) return;
    task.claim = null;
    if (task.status === "CLAIMED") task.status = "OPEN";
    task.updatedAt = new Date().toISOString();
  }

  private noteAgentActivity(run: DemoRun, now = Date.now()): void {
    run.lastAgentActivityAt = now;
    run.explicitAgentLeave = false;
  }

  private currentCursor(run: DemoRun): string {
    const cursor = run.activity.at(-1)?.event.cursor;
    if (!cursor) throw new Error("A demo run must always have a bootstrap activity cursor.");
    return cursor;
  }

  private appendActivity(run: DemoRun, input: Omit<ActivityEvent, "id" | "cursor" | "createdAt"> & { createdAt?: string }, publish = true): ActivityEvent {
    const event: ActivityEvent = {
      id: randomUUID(), cursor: randomUUID(), createdAt: input.createdAt ?? new Date().toISOString(), actor: clone(input.actor), actorType: input.actorType,
      via: input.via, type: input.type, target: clone(input.target), summary: input.summary.trim().slice(0, 600), workspaceRevision: input.workspaceRevision,
      ...(input.taskId ? { taskId: input.taskId } : {}), ...(input.questionId ? { questionId: input.questionId } : {}),
    };
    run.activity.push({ sequence: run.nextActivitySequence++, event });
    if (publish) this.publish(run, { activityCursor: event.cursor, workspaceRevision: event.workspaceRevision, eventId: event.id });
    return event;
  }

  private agentPresence(run: DemoRun): AgentParticipantView {
    this.cleanupRun(run);
    const now = Date.now();
    const liveBrowser = [...run.pageSessions.values()].find((session) => session.caller === "BROWSER_AGENT" && !session.revoked && session.liveUntil !== null && session.liveUntil > now);
    const liveAuto = run.tasks.find((task) => task.claim?.caller === "AUTO_RUNNER" && task.claim.expiresAt > now);
    const lastSeenAt = run.lastAgentActivityAt === null ? null : new Date(run.lastAgentActivityAt).toISOString();
    if (liveBrowser) return { actor: DEMO_AGENT.actor, state: "LIVE", lastSeenAt, activeVia: "BROWSER_AGENT" };
    if (liveAuto) return { actor: DEMO_AGENT.actor, state: "LIVE_AUTO", lastSeenAt, activeVia: "AUTO_PICKUP" };
    if (!run.explicitAgentLeave && run.lastAgentActivityAt !== null && now - run.lastAgentActivityAt < INVOKED_LEASE_MS) return { actor: DEMO_AGENT.actor, state: "IDLE", lastSeenAt, activeVia: null };
    return { actor: DEMO_AGENT.actor, state: "AWAY", lastSeenAt, activeVia: null };
  }

  private liveBrowserActive(run: DemoRun): boolean {
    const now = Date.now();
    return [...run.pageSessions.values()].some((session) => session.caller === "BROWSER_AGENT" && !session.revoked && session.liveUntil !== null && session.liveUntil > now);
  }

  private taskView(task: StoredTask, context?: AgentRegistryExecutionContext): AgentTaskView {
    this.expireTaskClaim(task);
    const claim = task.claim;
    const owned = !!claim && !!context && claim.caller === context.caller && claim.pageSessionId === context.pageSessionId;
    return clone({
      ...omitStoredFields(task, ["claim"]),
      claim: claim ? { ...(owned ? { claimId: claim.id } : {}), via: claimVia(claim.caller), expiresAt: new Date(claim.expiresAt).toISOString(), ownedByCurrentSession: owned } : null,
    });
  }

  private inboxView(run: DemoRun, context?: AgentRegistryExecutionContext): AgentTaskView[] {
    const priority: Record<AgentTaskView["status"], number> = { OPEN: 0, CLAIMED: 1, WAITING_HUMAN: 2, DONE: 3, CANCELLED: 4 };
    return [...run.tasks]
      .sort((a, b) => priority[a.status] - priority[b.status] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, 50).map((task) => this.taskView(task, context));
  }

  private questionsView(run: DemoRun): HumanInputRequestView[] {
    return run.questions.slice(-50).map(clone);
  }

  private view(run: DemoRun, context?: AgentRegistryExecutionContext): WorkspaceView {
    const workspace = run.workspace;
    return clone({
      id: workspace.id, name: workspace.name, revision: workspace.revision, decision: workspace.decision, customer: workspace.customer, options: workspace.options,
      evidence: workspace.evidence.map((evidence) => omitStoredFields(evidence, ["createdRevision"])),
      challenges: workspace.challenges.map((challenge) => omitStoredFields(challenge, ["requiredEvidenceKind"])),
      preparedDecision: workspace.preparedDecision ? omitStoredFields(workspace.preparedDecision, ["createdRevision"]) : null,
      followup: workspace.followup, provenance: workspace.events.map((event) => omitStoredFields(event, ["changes"])), readiness: this.readiness(workspace),
      collaboration: {
        cursor: this.currentCursor(run), agent: this.agentPresence(run), standingInstructions: run.standingInstructions, inbox: this.inboxView(run, context),
        comments: run.comments.slice(-100), questions: this.questionsView(run), recentActivity: run.activity.slice(-50).map(({ event }) => event),
      },
    });
  }

  private stateBrief(run: DemoRun, selection: PageSelection): StateBriefView {
    return clone({
      decisionId: run.workspace.decision.id, question: run.workspace.decision.question, state: run.workspace.decision.state,
      currentRecommendationOptionId: run.workspace.decision.selectedOptionId, options: run.workspace.options.map(({ id, title }) => ({ id, title })),
      blockingChallenges: run.workspace.challenges.filter((challenge) => challenge.severity === "BLOCKING" && !challenge.resolved).map(({ id, optionId, summary }) => ({ id, optionId, summary })),
      openQuestions: run.questions.filter((question) => question.status === "OPEN").slice(-50), participants: [this.agentPresence(run)], selection,
      workspaceRevision: run.workspace.revision, cursor: this.currentCursor(run),
    });
  }

  private coordinationSuccess<T>(run: DemoRun, data: T): CoordinationResult<T> {
    return { ok: true, data: clone(data), cursor: this.currentCursor(run) };
  }

  private coordinationFailure(code: Exclude<CoordinationErrorCode, "CURSOR_EXPIRED">, message: string, retryable: boolean, run?: DemoRun, nextAction?: string): CoordinationResult<never> {
    return { ok: false, code, message, retryable, ...(run ? { cursor: this.currentCursor(run) } : {}), ...(nextAction ? { nextAction } : {}) };
  }

  private withCoordinationIdempotency<T>(run: DemoRun, requestId: string, operationName: string, input: unknown, principal: AgentRegistryExecutionContext | string, operation: () => CoordinationResult<T>): CoordinationResult<T> {
    const principalKey = typeof principal === "string" ? principal : { caller: principal.caller, pageSessionId: principal.pageSessionId };
    const fingerprint = canonical({ operationName, input, principal: principalKey });
    const existing = run.workspace.requestLedger.get(requestId);
    if (existing) return existing.fingerprint === fingerprint ? clone(existing.result) as CoordinationResult<T> : this.coordinationFailure("REQUEST_REPLAY_MISMATCH", "This request ID was already used with different content.", false, run);
    const result = operation();
    run.workspace.requestLedger.set(requestId, { fingerprint, result: clone(result) });
    return result;
  }

  private autoAuthorization(run: DemoRun, task: StoredTask): AutoRunnerAuthorization {
    this.cleanupRun(run);
    const remainingActions = Math.max(0, run.standingInstructions.maxActionsPerHour - run.actionTimestamps.length);
    if (!run.standingInstructions.autoPickup) return { authorized: false, reason: "DISABLED", remainingActions, standingInstructions: clone(run.standingInstructions) };
    const requiredScope = task.kind === "MENTION" ? "MENTIONS" : "TASKS";
    if (!run.standingInstructions.scopes.includes(requiredScope)) return { authorized: false, reason: "OUT_OF_SCOPE", remainingActions, standingInstructions: clone(run.standingInstructions) };
    if (this.liveBrowserActive(run)) return { authorized: false, reason: "LIVE_SESSION_ACTIVE", remainingActions, standingInstructions: clone(run.standingInstructions) };
    if (remainingActions <= 0) return { authorized: false, reason: "ACTION_BUDGET_EXCEEDED", remainingActions: 0, standingInstructions: clone(run.standingInstructions) };
    return { authorized: true, remainingActions, standingInstructions: clone(run.standingInstructions) };
  }

  private autoAuthorizationFailure(run: DemoRun, authorization: AutoRunnerAuthorization): CoordinationResult<never> {
    switch (authorization.reason) {
      case "LIVE_SESSION_ACTIVE": return this.coordinationFailure("LIVE_SESSION_ACTIVE", "A live browser agent owns this decision room.", true, run);
      case "ACTION_BUDGET_EXCEEDED": return this.coordinationFailure("ACTION_BUDGET_EXCEEDED", "The hourly auto-runner action budget is exhausted.", false, run);
      case "OUT_OF_SCOPE": return this.coordinationFailure("CONFLICT", "This task kind is outside the enabled auto-pickup scopes.", false, run);
      default: return this.coordinationFailure("CONFLICT", "Auto pickup is disabled by standing instructions.", false, run);
    }
  }

  private reserveAutoAction(run: DemoRun): boolean {
    this.cleanupRun(run);
    if (run.actionTimestamps.length >= run.standingInstructions.maxActionsPerHour) return false;
    run.actionTimestamps.push(Date.now());
    return true;
  }

  private findContextClaim(run: DemoRun, context: AgentRegistryExecutionContext): StoredTask | undefined {
    if (!context.claimId) return undefined;
    return run.tasks.find((task) => {
      const claim = task.claim;
      if (!claim) return false;
      return claim.id === context.claimId && claim.caller === context.caller
        && claim.pageSessionId === context.pageSessionId && claim.expiresAt > Date.now();
    });
  }

  private validateClaim(run: DemoRun, task: StoredTask, context: AgentRegistryExecutionContext): CoordinationResult<never> | null {
    this.expireTaskClaim(task);
    if (!task.claim || !context.claimId || task.claim.id !== context.claimId || task.claim.caller !== context.caller
      || task.claim.pageSessionId !== context.pageSessionId || task.claim.expiresAt <= Date.now()) return this.coordinationFailure("CLAIM_LOST", "The task claim expired or was superseded.", true, run, "Refresh the inbox and win a fresh claim before writing.");
    return null;
  }

  private guardAgentWrite(resolved: ResolvedAgentContext, requireClaim: boolean): { code: "LIVE_SESSION_ACTIVE" | "CLAIM_LOST" | "CONFLICT"; message: string; retryable: boolean; nextAction?: string } | null {
    const { run, context } = resolved;
    if (context.caller === "AUTO_RUNNER" && this.liveBrowserActive(run)) return { code: "LIVE_SESSION_ACTIVE", message: "A live browser agent owns this decision room.", retryable: true };
    if (requireClaim && !this.findContextClaim(run, context)) return { code: "CLAIM_LOST", message: "Auto-runner writes require a current task claim.", retryable: true, nextAction: "Refresh the inbox and win a fresh claim before writing." };
    if (context.claimId && !this.findContextClaim(run, context)) return { code: "CLAIM_LOST", message: "The task claim expired or was superseded.", retryable: true };
    if (context.caller === "AUTO_RUNNER" && !run.standingInstructions.autoPickup) return { code: "CONFLICT", message: "Auto pickup is disabled by standing instructions.", retryable: false };
    return null;
  }

  private readiness(workspace: StoredWorkspace): ReadinessFacts {
    const selected = workspace.options.find((option) => option.id === workspace.decision.selectedOptionId);
    return {
      activeOptionCount: workspace.options.length,
      selectedOptionId: selected?.id ?? null,
      hasCurrentCapacityEvidence: workspace.evidence.some((evidence) => evidence.optionId === null && evidence.kind === "ENGINEERING_ESTIMATE" && evidence.title === "Launch capacity"),
      hasNorthstarDeadlineEvidence: workspace.evidence.some((evidence) => evidence.optionId === null && evidence.kind === "CUSTOMER_DEADLINE" && evidence.title === "Northstar renewal requirement"),
      selectedOptionEngineerDays: selected?.totalEngineerDays ?? null,
      launchCapacityEngineerDays: workspace.decision.launchCapacityEngineerDays,
      unresolvedBlockingChallengeCount: workspace.challenges.filter((challenge) => challenge.optionId === workspace.decision.selectedOptionId && challenge.severity === "BLOCKING" && !challenge.resolved).length,
    };
  }

  private derivedState(workspace: StoredWorkspace): DecisionState {
    if (workspace.decision.state === "COMMITTED") return "COMMITTED";
    if (workspace.preparedDecision) return "REVIEW";
    const readiness = this.readiness(workspace);
    return readiness.activeOptionCount >= 2 && readiness.hasCurrentCapacityEvidence && readiness.hasNorthstarDeadlineEvidence
      && readiness.selectedOptionEngineerDays !== null && readiness.selectedOptionEngineerDays <= readiness.launchCapacityEngineerDays
      && readiness.unresolvedBlockingChallengeCount === 0 ? "READY" : "CONTESTED";
  }

  private capabilities(workspace: StoredWorkspace, selection: PageSelection, epoch: number, role: MemberRole): CapabilitySummary {
    const compiled: CompiledCapabilities = compileCapabilities({ state: workspace.decision.state, selection, memberRole: role, workspaceRevision: workspace.revision, contextEpoch: epoch, readiness: this.readiness(workspace) });
    return summarizeCapabilities(compiled);
  }

  private failure(workspace: StoredWorkspace, code: ErrorCode, message: string, retryable: boolean, selection: PageSelection, epoch: number, extra: Record<string, unknown> = {}): ToolResult<MutationReceipt> {
    return { ok: false, code, message, retryable, currentWorkspaceRevision: workspace.revision, contextEpoch: epoch, currentCapabilities: this.capabilities(workspace, selection, epoch, MAYA.role), ...extra } as ToolResult<MutationReceipt>;
  }

  private stale(workspace: StoredWorkspace, expected: number, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const changes = workspace.events.filter((event) => event.resultingRevision > expected).map((event) => ({ eventId: event.id, actor: event.actor, origin: event.origin, reason: event.rationale, resultingRevision: event.resultingRevision, changes: event.changes }));
    return this.failure(workspace, "STALE_WORK_STATE", `Workspace advanced from revision ${expected} to ${workspace.revision}.`, true, selection, epoch, { expectedWorkspaceRevision: expected, actualWorkspaceRevision: workspace.revision, changes, nextAction: `Call inspect_decision, refresh WebMCP tools, then retry against workspace revision ${workspace.revision}.` });
  }

  private withDecisionIdempotency(run: DemoRun, envelope: MutationEnvelope<unknown>, toolName: string, origin: EventOrigin, selection: PageSelection, epoch: number, operation: () => ToolResult<MutationReceipt>): ToolResult<MutationReceipt> {
    const fingerprint = canonical({ toolName, origin, rationale: envelope.rationale, payload: envelope.payload, expectedWorkspaceRevision: envelope.expectedWorkspaceRevision, contextEpoch: envelope.contextEpoch });
    const existing = run.workspace.requestLedger.get(envelope.requestId);
    if (existing) return existing.fingerprint === fingerprint ? clone(existing.result) as ToolResult<MutationReceipt> : this.failure(run.workspace, "REQUEST_REPLAY_MISMATCH", "This request ID was already used with different content.", false, selection, epoch);
    const result = operation();
    run.workspace.requestLedger.set(envelope.requestId, { fingerprint, result: clone(result) });
    return result;
  }

  private webMcpPermits(workspace: StoredWorkspace, toolName: MutationToolName, selection: PageSelection, role: MemberRole): boolean {
    return this.capabilities(workspace, selection, 0, role).availableTools.includes(toolName);
  }

  private validSelection(workspace: StoredWorkspace, selection: PageSelection): boolean {
    if (!selection || typeof selection !== "object") return false;
    if (selection.kind === "DECISION") return selection.id === DECISION_ID;
    if (selection.kind === "OPTION") return workspace.options.some((option) => option.id === selection.id);
    return selection.kind === "FOLLOWUP" && selection.id === workspace.followup.id;
  }

  private sameTarget(left: PageSelection, right: PageSelection): boolean {
    return left.kind === right.kind && left.id === right.id;
  }

  private validateMutation(workspace: StoredWorkspace, tool: MutationToolName, envelope: MutationEnvelope<unknown>, selection: PageSelection): string | null {
    if (!Number.isInteger(envelope.expectedWorkspaceRevision) || envelope.expectedWorkspaceRevision < 0 || !Number.isInteger(envelope.contextEpoch) || envelope.contextEpoch < 0 || !isUuid(envelope.requestId) || !validText(envelope.rationale, 600)) return "Mutation envelope is invalid.";
    const payload = envelope.payload as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Mutation payload is invalid.";
    if (tool === "recommend_option") return typeof payload.optionId === "string" && workspace.options.some((option) => option.id === payload.optionId) && Object.keys(payload).length === 1 ? null : "Recommendation must name one active option.";
    if (tool === "add_evidence") {
      const metrics = payload.metrics;
      const validMetrics = metrics === undefined || (typeof metrics === "object" && metrics !== null && !Array.isArray(metrics) && Object.keys(metrics as object).every((key) => ["engineerDays", "annualValueUsd", "date"].includes(key))
        && (!("engineerDays" in metrics) || (Number.isInteger((metrics as Record<string, unknown>).engineerDays) && (metrics as Record<string, number>).engineerDays >= 0 && (metrics as Record<string, number>).engineerDays <= 90))
        && (!("annualValueUsd" in metrics) || (Number.isInteger((metrics as Record<string, unknown>).annualValueUsd) && (metrics as Record<string, number>).annualValueUsd >= 0 && (metrics as Record<string, number>).annualValueUsd <= 10_000_000))
        && (!("date" in metrics) || isCalendarDate((metrics as Record<string, unknown>).date)));
      return typeof payload.optionId === "string" && workspace.options.some((option) => option.id === payload.optionId) && ["CUSTOMER_DEADLINE", "ENGINEERING_ESTIMATE", "DELIVERY_RISK"].includes(String(payload.kind)) && ["SUPPORTS", "CHALLENGES", "CONTEXT"].includes(String(payload.stance)) && validText(payload.title, 120) && validText(payload.detail, 1_200) && validText(payload.sourceLabel, 120) && validMetrics && Object.keys(payload).every((key) => ["optionId", "kind", "stance", "title", "detail", "sourceLabel", "metrics"].includes(key)) ? null : "Evidence payload is invalid.";
    }
    if (tool === "challenge_option") return selection.kind === "OPTION" && validText(payload.summary, 600) && ["BLOCKING", "ADVISORY"].includes(String(payload.severity)) && (payload.requiredEvidenceKind === undefined || ["CUSTOMER_DEADLINE", "ENGINEERING_ESTIMATE", "DELIVERY_RISK"].includes(String(payload.requiredEvidenceKind))) && Object.keys(payload).every((key) => ["summary", "severity", "requiredEvidenceKind"].includes(key)) ? null : "Challenge payload is invalid.";
    return typeof payload.optionId === "string" && workspace.options.some((option) => option.id === payload.optionId) && validText(payload.recommendation, 600) && Array.isArray(payload.risks) && payload.risks.length <= 5 && payload.risks.every((risk) => validText(risk, 240)) && validText(payload.customerMessageDraft, 800) && Object.keys(payload).every((key) => ["optionId", "recommendation", "risks", "customerMessageDraft"].includes(key)) ? null : "Prepared decision payload is invalid.";
  }

  private recommend(run: DemoRun, member: SessionMember, origin: EventOrigin, envelope: MutationEnvelope<{ optionId: string }>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const before = workspace.decision.selectedOptionId;
    const beforeState = workspace.decision.state;
    workspace.decision.selectedOptionId = envelope.payload.optionId;
    workspace.decision.state = this.derivedState(workspace);
    return this.commit(run, member, origin, "recommend_option", envelope.rationale, "NOT_APPLICABLE", [DECISION_ID, envelope.payload.optionId], [{ field: "decision.selectedOptionId", before, after: envelope.payload.optionId }, { field: "decision.state", before: beforeState, after: workspace.decision.state }], selection, epoch);
  }

  private addEvidence(run: DemoRun, member: SessionMember, origin: EventOrigin, envelope: MutationEnvelope<AddEvidencePayload>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const id = `ev_${workspace.revision + 1}_${workspace.evidence.length + 1}`;
    workspace.evidence.push({ ...envelope.payload, id, actor: member.actor, createdAt: new Date().toISOString(), createdRevision: workspace.revision + 1 });
    workspace.decision.state = this.derivedState(workspace);
    return this.commit(run, member, origin, "add_evidence", envelope.rationale, "NOT_APPLICABLE", [id, envelope.payload.optionId], [{ field: "evidence.count", before: workspace.evidence.length - 1, after: workspace.evidence.length }], selection, epoch);
  }

  private challenge(run: DemoRun, member: SessionMember, origin: EventOrigin, envelope: MutationEnvelope<ChallengeOptionPayload>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const id = `ch_${workspace.revision + 1}_${workspace.challenges.length + 1}`;
    workspace.challenges.push({ id, optionId: selection.id, summary: envelope.payload.summary, severity: envelope.payload.severity, resolved: false, requiredEvidenceKind: envelope.payload.requiredEvidenceKind });
    const before = workspace.decision.state;
    workspace.decision.state = this.derivedState(workspace);
    return this.commit(run, member, origin, "challenge_option", envelope.rationale, "NOT_APPLICABLE", [id, selection.id], [{ field: "challenge.count", before: workspace.challenges.length - 1, after: workspace.challenges.length }, { field: "decision.state", before, after: workspace.decision.state }], selection, epoch);
  }

  private prepare(run: DemoRun, member: SessionMember, origin: EventOrigin, envelope: MutationEnvelope<MutationPayloadMap["prepare_decision"]>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    if (envelope.payload.optionId !== workspace.decision.selectedOptionId) return this.failure(workspace, "CONFLICT", "Prepare the current recommended option after refreshing decision state.", true, selection, epoch);
    const id = `pd_${workspace.revision + 1}`;
    workspace.preparedDecision = { id, ...envelope.payload, reviewStatus: "PROPOSED", preparedBy: member.actor, createdRevision: workspace.revision + 1 };
    workspace.decision.state = "REVIEW";
    return this.commit(run, member, origin, "prepare_decision", envelope.rationale, "PROPOSED", [id, DECISION_ID, envelope.payload.optionId], [{ field: "decision.state", before: "READY", after: "REVIEW" }, { field: "preparedDecision.reviewStatus", before: "NOT_APPLICABLE", after: "PROPOSED" }], selection, epoch);
  }

  private commit(run: DemoRun, member: SessionMember, origin: EventOrigin, toolName: ProvenanceEvent["toolName"], rationale: string, reviewStatus: ProvenanceEvent["reviewStatus"], changedEntities: string[], changes: CollaboratorChange["changes"], selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const baseRevision = workspace.revision;
    const resultingRevision = baseRevision + 1;
    workspace.revision = resultingRevision;
    const eventId = origin === "ORDINARY_UI" && member.id === JORDAN.id && resultingRevision === 8 ? "evt_0008_capacity_reduced" : `evt_${String(resultingRevision).padStart(4, "0")}_${toolName ?? "ui".toLowerCase()}`;
    const event: StoredEvent = { id: eventId, actor: member.actor, actorType: member.actorType, origin, toolName, baseRevision, resultingRevision, rationale, reviewStatus, changedEntities, createdAt: new Date().toISOString(), changes };
    workspace.events.push(event);
    if (member.actorType === "AGENT") this.noteAgentActivity(run);
    this.appendActivity(run, {
      actor: member.actor, actorType: member.actorType, via: origin === "WEBMCP" ? "BROWSER_AGENT" : origin === "AUTO_PICKUP" ? "AUTO_PICKUP" : "ORDINARY_UI",
      type: "WORKSPACE_MUTATED", target: selection, summary: rationale, workspaceRevision: resultingRevision,
    });
    const receipt: MutationReceipt = { eventId: event.id, resultingRevision, changedEntityIds: changedEntities, workspace: this.view(run) };
    return { ok: true, data: receipt, currentWorkspaceRevision: resultingRevision, contextEpoch: epoch, currentCapabilities: this.capabilities(workspace, selection, epoch, member.role) };
  }

  private publish(run: DemoRun, notice: RealtimeWorkspaceNotice): void {
    for (const callback of run.subscribers) callback(clone(notice));
  }
}

let localService: LocalRatiflowService | undefined;

export function getRatiflowService(): LocalRatiflowService {
  localService ??= new LocalRatiflowService();
  return localService;
}
