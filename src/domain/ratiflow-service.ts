import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { compileCapabilities, summarizeCapabilities } from "@/capabilities";
import {
  type ActorRef,
  type ActorType,
  type AddEvidencePayload,
  type CapabilitySummary,
  type ChallengeOptionPayload,
  type ChallengeView,
  type CollaboratorChange,
  type CompiledCapabilities,
  type DecisionState,
  type EvidenceView,
  type ErrorCode,
  type EventOrigin,
  type FollowupView,
  type HumanRatificationInput,
  type MemberRole,
  type MutationEnvelope,
  type MutationPayloadMap,
  type MutationReceipt,
  type MutationToolName,
  type PageSelection,
  type PreparedDecisionView,
  type ProvenanceEvent,
  type RatiflowServicePort,
  type ReadinessFacts,
  type RealtimeRevisionNotice,
  type SetLaunchCapacityInput,
  type ToolResult,
  type WebMCPMutationRequest,
  type WorkspaceView,
} from "@/contracts";

type MemberId = "usr_maya_chen" | "usr_jordan_lee" | "agent_ratiflow_demo";
type SessionMember = {
  id: MemberId;
  actor: ActorRef;
  actorType: ActorType;
  role: MemberRole;
};

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
  actor: { id: "agent_ratiflow_demo", name: "Ratiflow demo agent", role: "Agent" },
  actorType: "AGENT",
  role: "PRODUCT_LEAD",
};
const SEED_ACTOR: ActorRef = { id: "system_seed", name: "Seed fixture", role: "System" };

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
  requestLedger: Map<string, { fingerprint: string; result: ToolResult<MutationReceipt> }>;
};

type StoredSession = { runId: string; member: SessionMember; expiresAt: number };
type Subscriber = (notice: RealtimeRevisionNotice) => void;
type DemoRun = {
  id: string;
  workspace: StoredWorkspace;
  subscribers: Set<Subscriber>;
  expiresAt: number;
};
type ResolvedSession = { run: DemoRun; member: SessionMember };

export type LocalRatiflowServiceOptions = {
  /** Sessions and their isolated fixture clone have one shared, bounded lifetime. */
  sessionTtlMs?: number;
};

const WORKSPACE_ID = "ws_northstar_csv_launch";
const DECISION_ID = "dec_csv_oct15";
const ISO_NOW = "2026-08-30T10:00:00.000Z";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")} ]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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

// Match the frozen follow-up copy while deriving every value from live decision state.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatFollowupDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function capacityFollowupContext(workspace: StoredWorkspace): string {
  const capacityChange = [...workspace.events].reverse().flatMap((event) => event.changes
    .filter((change) => change.field === "decision.launchCapacityEngineerDays"
      && typeof change.before === "number"
      && typeof change.after === "number"
      && change.after === workspace.decision.launchCapacityEngineerDays)
    .map((change) => ({ event, before: change.before as number, after: change.after as number })))[0];
  if (!capacityChange) return `Launch capacity is ${workspace.decision.launchCapacityEngineerDays} engineer-days`;

  const direction = capacityChange.after < capacityChange.before
    ? "reduced"
    : capacityChange.after > capacityChange.before
      ? "increased"
      : "updated";
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

  constructor({ sessionTtlMs = 8 * 60 * 60 * 1000 }: LocalRatiflowServiceOptions = {}) {
    this.sessionTtlMs = Math.max(1, sessionTtlMs);
  }

  issueDemoSessions(): { mayaSessionToken: string; jordanSessionToken: string; agentSessionToken: string } {
    this.cleanupExpired();
    const run: DemoRun = {
      id: randomBytes(24).toString("base64url"),
      workspace: seedWorkspace(),
      subscribers: new Set<Subscriber>(),
      expiresAt: Date.now() + this.sessionTtlMs,
    };
    this.runs.set(run.id, run);
    return {
      mayaSessionToken: this.issueSession(run, MAYA),
      jordanSessionToken: this.issueSession(run, JORDAN),
      agentSessionToken: this.issueSession(run, DEMO_AGENT),
    };
  }

  private issueSession(run: DemoRun, member: SessionMember): string {
    const raw = randomBytes(32).toString("base64url");
    const signature = createHmac("sha256", this.signingKey).update(raw).digest("base64url");
    const token = `${raw}.${signature}`;
    this.sessions.set(token, { runId: run.id, member, expiresAt: run.expiresAt });
    return token;
  }

  private session(token: string): ResolvedSession | null {
    this.cleanupExpired();
    const [raw, signature, extra] = token.split(".");
    if (!raw || !signature || extra) return null;
    const expected = createHmac("sha256", this.signingKey).update(raw).digest("base64url");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const stored = this.sessions.get(token);
    const run = stored ? this.runs.get(stored.runId) : undefined;
    if (!stored || !run || stored.expiresAt <= Date.now() || run.expiresAt <= Date.now()) return null;
    return { run, member: stored.member };
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
    for (const [runId, run] of this.runs) {
      if (run.expiresAt <= now) this.runs.delete(runId);
    }
  }

  async inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView> {
    throwIfAborted(signal);
    const session = this.session(sessionToken);
    if (!session) throw new Error("Unauthorized session");
    return this.view(session.run.workspace);
  }

  async mutateFromWebMCP<TTool extends MutationToolName>(request: WebMCPMutationRequest<TTool>): Promise<ToolResult<MutationReceipt>> {
    throwIfAborted(request.signal);
    const session = this.session(request.sessionToken);
    const selection = request.capturedSelection;
    const epoch = request.capturedContextEpoch;
    if (!session) return this.failure(seedWorkspace(), "UNAUTHORIZED", "A valid demo membership session is required.", false, selection, epoch);
    const workspace = session.run.workspace;
    if (request.envelope.contextEpoch !== epoch || !this.validSelection(workspace, selection)) {
      return this.failure(workspace, "STALE_PAGE_CONTEXT", "The page selection changed; refresh tools and try again.", true, selection, epoch, { expectedContextEpoch: request.envelope.contextEpoch, actualContextEpoch: epoch });
    }
    const validation = this.validateMutation(workspace, request.toolName, request.envelope, selection);
    if (validation) return this.failure(workspace, "INVALID_INPUT", validation, false, selection, epoch);
    return this.withIdempotency(workspace, request.envelope, request.toolName, "WEBMCP", selection, epoch, () => {
      // Commits below are synchronous: cancellation is honored before this point, never mid-commit.
      throwIfAborted(request.signal);
      if (request.envelope.expectedWorkspaceRevision !== workspace.revision) return this.stale(workspace, request.envelope.expectedWorkspaceRevision, selection, epoch);
      if (!this.webMcpPermits(workspace, request.toolName, selection, session.member.role)) return this.failure(workspace, "NOT_AVAILABLE_IN_STATE", "This tool is not available in the current decision state.", true, selection, epoch);
      switch (request.toolName) {
        case "recommend_option": return this.recommend(session.run, session.member, request.envelope as MutationEnvelope<MutationPayloadMap["recommend_option"]>, selection, epoch);
        case "add_evidence": return this.addEvidence(session.run, session.member, request.envelope as MutationEnvelope<AddEvidencePayload>, selection, epoch);
        case "challenge_option": return this.challenge(session.run, session.member, request.envelope as MutationEnvelope<ChallengeOptionPayload>, selection, epoch);
        case "prepare_decision": return this.prepare(session.run, session.member, request.envelope as MutationEnvelope<MutationPayloadMap["prepare_decision"]>, selection, epoch);
      }
    });
  }

  async setLaunchCapacityFromCollaboratorUi(sessionToken: string, input: SetLaunchCapacityInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    throwIfAborted(signal);
    const session = this.session(sessionToken);
    const selection: PageSelection = { kind: "DECISION", id: DECISION_ID };
    const epoch = 0;
    if (!session || session.member.id !== JORDAN.id) return this.failure(seedWorkspace(), "UNAUTHORIZED", "Only Jordan Lee may update launch capacity in this demo.", false, selection, epoch);
    const workspace = session.run.workspace;
    if (!Number.isInteger(input.payload?.launchCapacityEngineerDays) || input.payload.launchCapacityEngineerDays < 0 || input.payload.launchCapacityEngineerDays > 90 || !validText(input.payload.reason, 240) || !isUuid(input.requestId)) return this.failure(workspace, "INVALID_INPUT", "Capacity updates must use bounded valid input.", false, selection, epoch);
    const envelope: MutationEnvelope<SetLaunchCapacityInput["payload"]> = { expectedWorkspaceRevision: input.expectedWorkspaceRevision, contextEpoch: epoch, requestId: input.requestId, rationale: input.payload.reason, payload: input.payload };
    return this.withIdempotency(workspace, envelope, "SET_LAUNCH_CAPACITY", "ORDINARY_UI", selection, epoch, () => {
      // The mutation itself is synchronous and therefore commits atomically once started.
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
      return this.commit(session.run, session.member, "ORDINARY_UI", undefined, input.payload.reason, "NOT_APPLICABLE", [DECISION_ID], changes, selection, epoch);
    });
  }

  async ratifyFromHumanUi(sessionToken: string, input: HumanRatificationInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    throwIfAborted(signal);
    const session = this.session(sessionToken);
    const selection: PageSelection = { kind: "DECISION", id: DECISION_ID };
    const epoch = 0;
    if (!session) return this.failure(seedWorkspace(), "UNAUTHORIZED", "Only Maya Chen can ratify through the ordinary UI.", false, selection, epoch);
    if (session.member.id !== MAYA.id || session.member.actorType !== "HUMAN") return this.failure(session.run.workspace, "UNAUTHORIZED", "Only Maya Chen can ratify through the ordinary UI.", false, selection, epoch);
    const workspace = session.run.workspace;
    if (!isUuid(input.requestId) || !validText(input.recommendation, 600) || !validText(input.customerMessage, 800)) return this.failure(workspace, "INVALID_INPUT", "Ratification requires bounded recommendation and customer message text.", false, selection, epoch);
    const envelope: MutationEnvelope<HumanRatificationInput> = { expectedWorkspaceRevision: input.expectedWorkspaceRevision, contextEpoch: epoch, requestId: input.requestId, rationale: input.recommendation, payload: input };
    return this.withIdempotency(workspace, envelope, "RATIFY_DECISION", "ORDINARY_UI", selection, epoch, () => {
      // The mutation itself is synchronous and therefore commits atomically once started.
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
      return this.commit(session.run, session.member, "ORDINARY_UI", undefined, input.recommendation, "RATIFIED", [DECISION_ID, workspace.preparedDecision.id, workspace.followup.id], [
        { field: "decision.state", before: "REVIEW", after: "COMMITTED" },
        { field: "preparedDecision.reviewStatus", before: "PROPOSED", after: "RATIFIED" },
        { field: "followup.status", before: "BLOCKED", after: "READY" },
      ], selection, epoch);
    });
  }

  subscribe(sessionToken: string, onRevision: (notice: RealtimeRevisionNotice) => void): () => void {
    const session = this.session(sessionToken);
    if (!session) return () => undefined;
    session.run.subscribers.add(onRevision);
    return () => session.run.subscribers.delete(onRevision);
  }

  private view(workspace: StoredWorkspace): WorkspaceView {
    return clone({
      id: workspace.id,
      name: workspace.name,
      revision: workspace.revision,
      decision: workspace.decision,
      customer: workspace.customer,
      options: workspace.options,
      evidence: workspace.evidence.map((evidence) => omitStoredFields(evidence, ["createdRevision"])),
      challenges: workspace.challenges.map((challenge) => omitStoredFields(challenge, ["requiredEvidenceKind"])),
      preparedDecision: workspace.preparedDecision ? omitStoredFields(workspace.preparedDecision, ["createdRevision"]) : null,
      followup: workspace.followup,
      provenance: workspace.events.map((event) => omitStoredFields(event, ["changes"])),
      readiness: this.readiness(workspace),
    });
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
    return readiness.activeOptionCount >= 2 && readiness.hasCurrentCapacityEvidence && readiness.hasNorthstarDeadlineEvidence && readiness.selectedOptionEngineerDays !== null && readiness.selectedOptionEngineerDays <= readiness.launchCapacityEngineerDays && readiness.unresolvedBlockingChallengeCount === 0 ? "READY" : "CONTESTED";
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

  private withIdempotency(workspace: StoredWorkspace, envelope: MutationEnvelope<unknown>, toolName: string, origin: EventOrigin, selection: PageSelection, epoch: number, operation: () => ToolResult<MutationReceipt>): ToolResult<MutationReceipt> {
    const fingerprint = canonical({ toolName, origin, rationale: envelope.rationale, payload: envelope.payload, expectedWorkspaceRevision: envelope.expectedWorkspaceRevision, contextEpoch: envelope.contextEpoch });
    const existing = workspace.requestLedger.get(envelope.requestId);
    if (existing) return existing.fingerprint === fingerprint ? clone(existing.result) : this.failure(workspace, "REQUEST_REPLAY_MISMATCH", "This request ID was already used with different content.", false, selection, epoch);
    const result = operation();
    workspace.requestLedger.set(envelope.requestId, { fingerprint, result: clone(result) });
    return result;
  }

  private webMcpPermits(workspace: StoredWorkspace, toolName: MutationToolName, selection: PageSelection, role: MemberRole): boolean {
    const tools = this.capabilities(workspace, selection, 0, role).availableTools;
    return tools.includes(toolName);
  }

  private validSelection(workspace: StoredWorkspace, selection: PageSelection): boolean {
    if (selection.kind === "DECISION") return selection.id === DECISION_ID;
    if (selection.kind === "OPTION") return workspace.options.some((option) => option.id === selection.id);
    return selection.id === workspace.followup.id;
  }

  private validateMutation(workspace: StoredWorkspace, tool: MutationToolName, envelope: MutationEnvelope<unknown>, selection: PageSelection): string | null {
    if (!Number.isInteger(envelope.expectedWorkspaceRevision) || envelope.expectedWorkspaceRevision < 0 || !Number.isInteger(envelope.contextEpoch) || envelope.contextEpoch < 0 || !isUuid(envelope.requestId) || !validText(envelope.rationale, 600)) return "Mutation envelope is invalid.";
    const payload = envelope.payload as Record<string, unknown>;
    if (!payload || typeof payload !== "object") return "Mutation payload is invalid.";
    if (tool === "recommend_option") return typeof payload.optionId === "string" && workspace.options.some((option) => option.id === payload.optionId) && Object.keys(payload).length === 1 ? null : "Recommendation must name one active option.";
    if (tool === "add_evidence") {
      const metrics = payload.metrics;
      const validMetrics = metrics === undefined || (typeof metrics === "object" && metrics !== null && Object.keys(metrics as object).every((key) => ["engineerDays", "annualValueUsd", "date"].includes(key)) && (!("engineerDays" in metrics) || (Number.isInteger((metrics as Record<string, unknown>).engineerDays) && (metrics as Record<string, number>).engineerDays >= 0 && (metrics as Record<string, number>).engineerDays <= 90)) && (!("annualValueUsd" in metrics) || (Number.isInteger((metrics as Record<string, unknown>).annualValueUsd) && (metrics as Record<string, number>).annualValueUsd >= 0 && (metrics as Record<string, number>).annualValueUsd <= 10000000)) && (!("date" in metrics) || isCalendarDate((metrics as Record<string, unknown>).date)));
      return typeof payload.optionId === "string" && workspace.options.some((option) => option.id === payload.optionId) && ["CUSTOMER_DEADLINE", "ENGINEERING_ESTIMATE", "DELIVERY_RISK"].includes(String(payload.kind)) && ["SUPPORTS", "CHALLENGES", "CONTEXT"].includes(String(payload.stance)) && validText(payload.title, 120) && validText(payload.detail, 1200) && validText(payload.sourceLabel, 120) && validMetrics && Object.keys(payload).every((key) => ["optionId", "kind", "stance", "title", "detail", "sourceLabel", "metrics"].includes(key)) ? null : "Evidence payload is invalid.";
    }
    if (tool === "challenge_option") return selection.kind === "OPTION" && validText(payload.summary, 600) && ["BLOCKING", "ADVISORY"].includes(String(payload.severity)) && (payload.requiredEvidenceKind === undefined || ["CUSTOMER_DEADLINE", "ENGINEERING_ESTIMATE", "DELIVERY_RISK"].includes(String(payload.requiredEvidenceKind))) && Object.keys(payload).every((key) => ["summary", "severity", "requiredEvidenceKind"].includes(key)) ? null : "Challenge payload is invalid.";
    return typeof payload.optionId === "string" && workspace.options.some((option) => option.id === payload.optionId) && validText(payload.recommendation, 600) && Array.isArray(payload.risks) && payload.risks.length <= 5 && payload.risks.every((risk) => validText(risk, 240)) && validText(payload.customerMessageDraft, 800) && Object.keys(payload).every((key) => ["optionId", "recommendation", "risks", "customerMessageDraft"].includes(key)) ? null : "Prepared decision payload is invalid.";
  }

  private recommend(run: DemoRun, member: SessionMember, envelope: MutationEnvelope<{ optionId: string }>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const before = workspace.decision.selectedOptionId;
    const beforeState = workspace.decision.state;
    workspace.decision.selectedOptionId = envelope.payload.optionId;
    workspace.decision.state = this.derivedState(workspace);
    return this.commit(run, member, "WEBMCP", "recommend_option", envelope.rationale, "NOT_APPLICABLE", [DECISION_ID, envelope.payload.optionId], [{ field: "decision.selectedOptionId", before, after: envelope.payload.optionId }, { field: "decision.state", before: beforeState, after: workspace.decision.state }], selection, epoch);
  }

  private addEvidence(run: DemoRun, member: SessionMember, envelope: MutationEnvelope<AddEvidencePayload>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const id = `ev_${workspace.revision + 1}_${workspace.evidence.length + 1}`;
    workspace.evidence.push({ ...envelope.payload, id, actor: member.actor, createdAt: new Date().toISOString(), createdRevision: workspace.revision + 1 });
    workspace.decision.state = this.derivedState(workspace);
    return this.commit(run, member, "WEBMCP", "add_evidence", envelope.rationale, "NOT_APPLICABLE", [id, envelope.payload.optionId], [{ field: "evidence.count", before: workspace.evidence.length - 1, after: workspace.evidence.length }], selection, epoch);
  }

  private challenge(run: DemoRun, member: SessionMember, envelope: MutationEnvelope<ChallengeOptionPayload>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const id = `ch_${workspace.revision + 1}_${workspace.challenges.length + 1}`;
    workspace.challenges.push({ id, optionId: selection.id, summary: envelope.payload.summary, severity: envelope.payload.severity, resolved: false, requiredEvidenceKind: envelope.payload.requiredEvidenceKind });
    const before = workspace.decision.state;
    workspace.decision.state = this.derivedState(workspace);
    return this.commit(run, member, "WEBMCP", "challenge_option", envelope.rationale, "NOT_APPLICABLE", [id, selection.id], [{ field: "challenge.count", before: workspace.challenges.length - 1, after: workspace.challenges.length }, { field: "decision.state", before, after: workspace.decision.state }], selection, epoch);
  }

  private prepare(run: DemoRun, member: SessionMember, envelope: MutationEnvelope<MutationPayloadMap["prepare_decision"]>, selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    if (envelope.payload.optionId !== workspace.decision.selectedOptionId) return this.failure(workspace, "CONFLICT", "Prepare the current recommended option after refreshing decision state.", true, selection, epoch);
    const id = `pd_${workspace.revision + 1}`;
    workspace.preparedDecision = { id, ...envelope.payload, reviewStatus: "PROPOSED", preparedBy: member.actor, createdRevision: workspace.revision + 1 };
    workspace.decision.state = "REVIEW";
    return this.commit(run, member, "WEBMCP", "prepare_decision", envelope.rationale, "PROPOSED", [id, DECISION_ID, envelope.payload.optionId], [{ field: "decision.state", before: "READY", after: "REVIEW" }, { field: "preparedDecision.reviewStatus", before: "NOT_APPLICABLE", after: "PROPOSED" }], selection, epoch);
  }

  private commit(run: DemoRun, member: SessionMember, origin: EventOrigin, toolName: ProvenanceEvent["toolName"], rationale: string, reviewStatus: ProvenanceEvent["reviewStatus"], changedEntities: string[], changes: CollaboratorChange["changes"], selection: PageSelection, epoch: number): ToolResult<MutationReceipt> {
    const workspace = run.workspace;
    const baseRevision = workspace.revision;
    const resultingRevision = baseRevision + 1;
    workspace.revision = resultingRevision;
    const eventId = origin === "ORDINARY_UI" && member.id === JORDAN.id && resultingRevision === 8
      ? "evt_0008_capacity_reduced"
      : `evt_${String(resultingRevision).padStart(4, "0")}_${toolName ?? "ui".toLowerCase()}`;
    const event: StoredEvent = { id: eventId, actor: member.actor, actorType: member.actorType, origin, toolName, baseRevision, resultingRevision, rationale, reviewStatus, changedEntities, createdAt: new Date().toISOString(), changes };
    workspace.events.push(event);
    const receipt: MutationReceipt = { eventId: event.id, resultingRevision, changedEntityIds: changedEntities, workspace: this.view(workspace) };
    this.publish(run, { workspaceRevision: resultingRevision, eventId: event.id });
    return { ok: true, data: receipt, currentWorkspaceRevision: resultingRevision, contextEpoch: epoch, currentCapabilities: this.capabilities(workspace, selection, epoch, member.role) };
  }

  private publish(run: DemoRun, notice: RealtimeRevisionNotice): void {
    for (const callback of run.subscribers) callback(clone(notice));
  }
}

let localService: LocalRatiflowService | undefined;

export function getRatiflowService(): LocalRatiflowService {
  localService ??= new LocalRatiflowService();
  return localService;
}
