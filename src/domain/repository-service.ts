import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  ISSUE_ACTIVE_TASK_LIMIT,
  ISSUE_AGENT_LABEL_MAX_LENGTH,
  ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT,
  ISSUE_BODY_MAX_LENGTH,
  ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
  ISSUE_COMMENT_MAX_LENGTH,
  ISSUE_DOCUMENT_KINDS,
  ISSUE_EVIDENCE_REF_LIMIT,
  ISSUE_EVIDENCE_REF_MAX_LENGTH,
  ISSUE_HISTORY_DEFAULT_LIMIT,
  ISSUE_HISTORY_MAX_LIMIT,
  ISSUE_STANDALONE_THREAD_LIMIT,
  ISSUE_TASK_CATEGORIES,
  ISSUE_TASK_INSTRUCTION_MAX_LENGTH,
  ISSUE_TASK_MODES,
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
  REPOSITORY_PROTOCOL_VERSION,
  type AddHumanIssueCommentServiceInput,
  type CancelIssueTaskServiceInput,
  type CommentOnIssueTaskServiceInput,
  type CreateIssueTaskServiceInput,
  type CreateIssueThreadServiceInput,
  type DecideIssueTaskServiceInput,
  type IssueAgentActorSnapshot,
  type IssueAnchor,
  type IssueAnchorInput,
  type IssueComment,
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
  type ReadIssueHistoryInput,
  type ReadIssueHistoryOutcome,
  type RepositoryEvaluationPort,
  type RepositoryFailure,
  type RepositoryResult,
  type RepositoryServicePort,
  type ResetPostmortemHeroOutcome,
  type ResolveIssueThreadServiceInput,
  type RestoreIssueRevisionServiceInput,
  type SaveIssueRevisionServiceInput,
  type SubmitIssueTaskResultOutcome,
  type SubmitIssueTaskResultServiceInput,
  type TouchIssuePresenceServiceInput,
  type WaitForMyIssueTasksInput,
  type WaitForMyIssueTasksOutcome,
} from "@/repository/contracts";
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
};

type LedgerEntry = {
  fingerprint: string;
  result: RepositoryResult<unknown>;
};

type CredentialIssuanceOperation = "launch" | "example" | "join" | "reset";

type CredentialRateBucket = {
  windowStartedAt: number;
  count: number;
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
  ledger: Map<string, LedgerEntry>;
};

type ResolvedSession = {
  workspace: StoredWorkspace;
  session: StoredSession;
  member: StoredMember;
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
  timestamp?: string;
};

export type LocalRepositoryServiceOptions = {
  sessionTtlMs?: number;
  presenceTtlMs?: number;
  waitSecondMs?: number;
  credentialRateLimitWindowMs?: number;
  credentialRateLimits?: Partial<Record<CredentialIssuanceOperation, number>>;
  now?: () => number;
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

const EXAMPLE_TITLE = "INC-482 · Checkout outage postmortem";
const EXAMPLE_R1_BODY = `## Summary

Checkout requests failed for 38 minutes after a payment-provider throttling event. Service recovered after the team rolled back the retry middleware.

## Impact

Investigation in progress.

## Timeline

Investigation in progress.

## Root cause

Investigation in progress.

## Detection and response

The on-call engineer responded to the checkout error-rate alert and coordinated rollback.

## Contributing factors

The retry path had not been load-tested against provider throttling.

## Corrective actions

- [ ] Honor provider backoff headers — Payments Platform — September 5
- [ ] Add throttling load tests — Checkout — September 7
- [ ] Alert on retry amplification — Reliability — September 6

## Learnings

Separate external triggers from internal amplifiers when assigning root cause.`;
const EXAMPLE_IMPACT = "Between 09:43 and 10:21 UTC, 28,417 checkout attempts produced 6,742 failures across 311 merchants. No duplicate charges occurred.";
const EXAMPLE_TIMELINE = `- 09:43 — Provider 429 responses began.
- 09:47 — Retry traffic reached 5.8× baseline; the checkout queue grew from 420 to 18,240.
- 10:17 — The team rolled back retry middleware commit 7d3c9e1.
- 10:21 — Checkout success rate recovered.`;
const EXAMPLE_ROOT_CAUSE = "Provider throttling triggered the incident. Retry middleware introduced in 7d3c9e1 ignored Retry-After and made up to five immediate retries, amplifying provider 429 responses into queue exhaustion. The retry regression—not provider latency alone—was the root cause of the sustained checkout failure.";

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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof DOMException && signal.reason.name === "AbortError") throw signal.reason;
  throw new DOMException(typeof signal.reason === "string" ? signal.reason : "Operation cancelled", "AbortError");
}

function digest(title: string, body: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify({ title, body }), "utf8").digest("hex")}`;
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

function agentActor(task: StoredTask): IssueAgentActorSnapshot {
  return {
    actorType: "AGENT",
    displayName: task.agentLabel,
    member: clone(task.assignee),
    agentLabel: task.agentLabel,
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
  return clone(task) as IssueTask;
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
export class LocalRepositoryService implements RepositoryServicePort, RepositoryEvaluationPort {
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
  private readonly now: () => number;
  private resetInFlight = false;

  constructor({
    sessionTtlMs = ISSUE_WORKSPACE_TTL_MS,
    presenceTtlMs = DEFAULT_PRESENCE_TTL_MS,
    waitSecondMs = 1_000,
    credentialRateLimitWindowMs = DEFAULT_CREDENTIAL_RATE_LIMIT_WINDOW_MS,
    credentialRateLimits = {},
    now = Date.now,
  }: LocalRepositoryServiceOptions = {}) {
    this.sessionTtlMs = Math.min(ISSUE_WORKSPACE_TTL_MS, Math.max(1, sessionTtlMs));
    this.presenceTtlMs = Math.max(1, presenceTtlMs);
    this.waitSecondMs = Math.max(1, waitSecondMs);
    this.credentialRateLimitWindowMs = Math.max(1, credentialRateLimitWindowMs);
    this.credentialRateLimits = {
      ...DEFAULT_CREDENTIAL_RATE_LIMITS,
      ...credentialRateLimits,
    };
    this.now = now;
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
      EXAMPLE_TITLE,
      EXAMPLE_R1_BODY,
      "Priya Shah",
      "Launch INC-482 postmortem.",
      { documentId: HERO_DOCUMENT_ID, revisionId: HERO_REVISION_ID, memberId: HERO_PRIYA_ID },
    );
    const nadia = this.issueBundle(workspace, this.addMember(workspace, "Nadia Chen", HERO_NADIA_ID), priya.shareToken);
    const leo = this.issueBundle(workspace, this.addMember(workspace, "Leo Park", HERO_LEO_ID), priya.shareToken);
    const sam = this.issueBundle(workspace, this.addMember(workspace, "Sam Rivera", HERO_SAM_ID), priya.shareToken);
    this.expectSuccess(await this.createTask(priya.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      title: "Add verified checkout impact and data-integrity figures.",
      category: "DATA",
      instruction: "Use impact.csv to replace only the Impact placeholder with verified checkout attempts, failures, affected merchants, and duplicate-charge status.",
      agentLabel: "Data agent",
      mode: "DIRECT",
      assignedToMemberId: nadia.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 174, rangeEnd: 200 },
    }), "create reset DATA-17");
    this.setHeroTaskIdentity(workspace, workspace.tasks.at(-1)!, {
      taskId: "00000000-0000-4000-8000-000000000421",
      threadId: "00000000-0000-4000-8000-000000000431",
      taskKey: "DATA-17",
    });
    this.expectSuccess(await this.createTask(priya.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      title: "Replace the timeline placeholder with the observed outage sequence.",
      category: "LOGS",
      instruction: "Use checkout.log to replace only the Timeline placeholder with the observed UTC sequence from provider throttling through recovery.",
      agentLabel: "Logging agent",
      mode: "DIRECT",
      assignedToMemberId: leo.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 215, rangeEnd: 241 },
    }), "create reset LOG-22");
    this.setHeroTaskIdentity(workspace, workspace.tasks.at(-1)!, {
      taskId: "00000000-0000-4000-8000-000000000422",
      threadId: "00000000-0000-4000-8000-000000000432",
      taskKey: "LOG-22",
    });
    this.expectSuccess(await this.createTask(priya.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      title: "Explain provider throttling as trigger and retry regression as root cause.",
      category: "CODEBASE",
      instruction: "Use commit 7d3c9e1 and checkout.log to distinguish the external trigger from the internal condition that sustained the outage. Replace only the Root cause placeholder.",
      agentLabel: "Builder agent",
      mode: "REVIEW",
      assignedToMemberId: sam.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 258, rangeEnd: 284 },
    }), "create reset CODE-9");
    this.setHeroTaskIdentity(workspace, workspace.tasks.at(-1)!, {
      taskId: "00000000-0000-4000-8000-000000000423",
      threadId: "00000000-0000-4000-8000-000000000433",
      taskKey: "CODE-9",
    });
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
    if (!hasExactKeys(input, ["kind"], ["displayName"])
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
      input.displayName ?? "Collaborator 1",
      template.summary,
    );
    return { ok: true, data: bundle };
  }

  async launchExample(
    input: LaunchIssueExampleHttpInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueSessionBundle>> {
    throwIfAborted(signal);
    if (!hasExactKeys(input, [])) return failure("INVALID_INPUT", "The example request must be empty.");
    if (!this.consumeCredentialIssuance("example")) {
      return failure("RATE_LIMITED", "The public example rate limit has been reached.");
    }
    const seeded = this.createWorkspace(
      "POSTMORTEM",
      EXAMPLE_TITLE,
      EXAMPLE_R1_BODY,
      "Priya Shah",
      "Launch INC-482 postmortem.",
    );
    const { workspace, bundle: priya } = seeded;
    const nadia = this.issueBundle(workspace, this.addMember(workspace, "Nadia Chen"), priya.shareToken);
    const leo = this.issueBundle(workspace, this.addMember(workspace, "Leo Park"), priya.shareToken);
    const sam = this.issueBundle(workspace, this.addMember(workspace, "Sam Rivera"), priya.shareToken);

    const createdData = await this.createTask(priya.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      title: "Add verified checkout impact and data-integrity figures.",
      category: "DATA",
      instruction: "Use impact.csv to replace only the Impact placeholder with verified checkout attempts, failures, affected merchants, and duplicate-charge status.",
      agentLabel: "Data agent",
      mode: "DIRECT",
      assignedToMemberId: nadia.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 174, rangeEnd: 200 },
    });
    this.expectSuccess(createdData, "create DATA-17");
    workspace.tasks.at(-1)!.taskKey = "DATA-17";
    const createdLog = await this.createTask(priya.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      title: "Replace the timeline placeholder with the observed outage sequence.",
      category: "LOGS",
      instruction: "Use checkout.log to replace only the Timeline placeholder with the observed UTC sequence from provider throttling through recovery.",
      agentLabel: "Logging agent",
      mode: "DIRECT",
      assignedToMemberId: leo.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 215, rangeEnd: 241 },
    });
    this.expectSuccess(createdLog, "create LOG-22");
    workspace.tasks.at(-1)!.taskKey = "LOG-22";
    const createdCode = await this.createTask(priya.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      title: "Explain provider throttling as trigger and retry regression as root cause.",
      category: "CODEBASE",
      instruction: "Use commit 7d3c9e1 and checkout.log to distinguish the external trigger from the internal condition that sustained the outage. Replace only the Root cause placeholder.",
      agentLabel: "Builder agent",
      mode: "REVIEW",
      assignedToMemberId: sam.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 258, rangeEnd: 284 },
    });
    this.expectSuccess(createdCode, "create CODE-9");
    workspace.tasks.at(-1)!.taskKey = "CODE-9";

    const dataTask = workspace.tasks.find((task) => task.taskKey === "DATA-17")!;
    const logTask = workspace.tasks.find((task) => task.taskKey === "LOG-22")!;
    const codeTask = workspace.tasks.find((task) => task.taskKey === "CODE-9")!;
    this.expectSuccess(await this.submitTaskResult(nadia.agentSessionToken, {
      taskId: dataTask.taskId,
      basedOnRevision: 1,
      resultSummary: "Added verified checkout impact and confirmed no duplicate charges.",
      replacementText: EXAMPLE_IMPACT,
      evidenceRefs: ["impact.csv"],
      requestId: randomUUID(),
    }, nadia.sessionInstanceId), "submit DATA-17");
    this.expectSuccess(await this.submitTaskResult(leo.agentSessionToken, {
      taskId: logTask.taskId,
      basedOnRevision: 1,
      resultSummary: "Added the observed outage timeline and recovery sequence.",
      replacementText: EXAMPLE_TIMELINE,
      evidenceRefs: ["checkout.log"],
      requestId: randomUUID(),
    }, leo.sessionInstanceId), "submit LOG-22");
    this.expectSuccess(await this.submitTaskResult(sam.agentSessionToken, {
      taskId: codeTask.taskId,
      basedOnRevision: 1,
      resultSummary: "Separated the provider trigger from the retry regression that sustained the outage.",
      replacementText: EXAMPLE_ROOT_CAUSE,
      evidenceRefs: ["commit:7d3c9e1", "checkout.log"],
      requestId: randomUUID(),
    }, sam.sessionInstanceId), "propose CODE-9");
    const humanComment = await this.addHumanComment(priya.humanSessionToken, {
      requestId: randomUUID(),
      threadId: codeTask.threadId,
      body: "Provider throttling happened first. Are we overclaiming our code as the root cause?",
    });
    this.expectSuccess(humanComment, "comment on CODE-9");
    const replyToCommentId = workspace.threads.find((thread) => thread.threadId === codeTask.threadId)!.comments[0]!.commentId;
    this.expectSuccess(await this.commentOnTask(sam.agentSessionToken, {
      requestId: randomUUID(),
      taskId: codeTask.taskId,
      replyToCommentId,
      body: "The logs show 429s as the trigger, but commit 7d3c9e1 ignored Retry-After and issued up to five zero-delay retries. That raised retry traffic to 5.8× and the queue from 420 to 18,240, so the code regression explains why throttling became a 38-minute outage.",
      evidenceRefs: ["checkout.log", "commit:7d3c9e1"],
    }, sam.sessionInstanceId), "reply on CODE-9");
    this.expectSuccess(await this.acceptTaskProposal(priya.humanSessionToken, {
      requestId: randomUUID(),
      taskId: codeTask.taskId,
      expectedRevision: 3,
      note: "Accepted after separating the external trigger from the internal retry amplifier.",
    }), "accept CODE-9");
    throwIfAborted(signal);
    return { ok: true, data: { ...priya, surface: this.surface(workspace) } };
  }

  async join(input: JoinIssueHttpInput, signal?: AbortSignal): Promise<RepositoryResult<IssueSessionBundle>> {
    throwIfAborted(signal);
    this.cleanupExpired();
    if (!hasExactKeys(input, ["shareToken"], ["displayName"])
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
    const member = this.addMember(workspace, input.displayName ?? `Collaborator ${workspace.nextGuestNumber++}`);
    return { ok: true, data: this.issueBundle(workspace, member, input.shareToken) };
  }

  async inspect(sessionToken: string, signal?: AbortSignal): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    throwIfAborted(signal);
    const resolved = this.resolveSession(sessionToken);
    if (!resolved) return failure("UNAUTHORIZED", "A valid issue session is required.");
    return { ok: true, data: this.surface(resolved.workspace) };
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
    if (!hasExactKeys(input, ["expectedRevision", "requestId", "title", "body", "changeSummary"])
      || !isUuid(input.requestId)
      || !isCounter(input.expectedRevision)
      || !boundedText(input.title, ISSUE_TITLE_MAX_LENGTH)
      || !boundedText(input.body, ISSUE_BODY_MAX_LENGTH, true)
      || !boundedText(input.changeSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH)) {
      return this.recordReplay(resolved, "save", input, failure("INVALID_INPUT", "The revision input is invalid."));
    }
    const stale = this.requireHead(resolved.workspace, input.expectedRevision);
    if (stale) return this.recordReplay(resolved, "save", input, stale);
    if (input.title === resolved.workspace.document.title && input.body === resolved.workspace.document.body) {
      const result = { ok: true, data: this.surface(resolved.workspace) } as const;
      return this.recordReplay(resolved, "save", input, result);
    }
    const actor = humanActor(resolved.member);
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
      changeSummary: input.changeSummary,
      evidenceRefs: [],
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
    this.bumpActivity(workspace, timestamp);
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, "task.create", input, result);
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
        body: input.body,
        evidenceRefs: [],
        createdAt: timestamp,
      }],
    });
    this.bumpActivity(workspace, timestamp);
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
      body: input.body,
      evidenceRefs: clone(input.evidenceRefs ?? []),
      createdAt: timestamp,
    });
    this.bumpActivity(resolved.workspace, timestamp);
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
    this.bumpActivity(resolved.workspace, timestamp);
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
    this.resolveTaskThread(resolved.workspace, task, task.creator, timestamp);
    this.bumpActivity(resolved.workspace, timestamp);
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
    const resolved = this.resolveSession(sessionToken);
    if (!resolved) return failure("UNAUTHORIZED", "A valid issue session is required.");
    if (!hasExactKeys(input, [], ["beforeRevision", "limit"])
      || (input.beforeRevision !== undefined && (!Number.isSafeInteger(input.beforeRevision) || input.beforeRevision < 1))
      || (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > ISSUE_HISTORY_MAX_LIMIT))) {
      return failure("INVALID_INPUT", "The history input is invalid.");
    }
    const limit = input.limit ?? ISSUE_HISTORY_DEFAULT_LIMIT;
    const candidates = resolved.workspace.revisions
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
        currentRevision: resolved.workspace.document.revision,
        currentActivityVersion: resolved.workspace.document.activityVersion,
      },
    };
  }

  async readRevision(
    sessionToken: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueRevision>> {
    throwIfAborted(signal);
    const resolved = this.resolveSession(sessionToken);
    if (!resolved) return failure("UNAUTHORIZED", "A valid issue session is required.");
    if (!Number.isSafeInteger(revision) || revision < 1) return failure("INVALID_INPUT", "A positive revision is required.");
    const found = resolved.workspace.revisions.find((entry) => entry.revision === revision);
    return found ? { ok: true, data: clone(found) } : failure("NOT_FOUND", "The revision was not found.");
  }

  async listMyTasks(
    agentSessionToken: string,
    input: ListMyIssueTasksInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<ListMyIssueTasksOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid agent session is required.");
    if (!this.matchesPage(resolved, pageSessionId)) return failure("STALE_PAGE_CONTEXT", "The agent page session is no longer current.");
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
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid agent session is required.");
    if (!this.matchesPage(resolved, pageSessionId)) return failure("STALE_PAGE_CONTEXT", "The agent page session is no longer current.");
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
    const waitKey = `${workspace.id}:${resolved.member.memberId}:${pageSessionId}`;
    if (this.activeWaits.has(waitKey)) return failure("WAIT_ALREADY_ACTIVE", "A wait is already active for this page.");
    let activityCursor = input.afterActivityVersion;
    const deadline = Date.now() + (input.timeoutSeconds ?? ISSUE_WAIT_DEFAULT_SECONDS) * this.waitSecondMs;
    this.activeWaits.add(waitKey);
    try {
      while (true) {
        throwIfAborted(signal);
        const current = this.authorize(agentSessionToken, "AGENT");
        if (!current
          || current.workspace.id !== workspace.id
          || current.member.memberId !== resolved.member.memberId
          || current.session.sessionInstanceId !== resolved.session.sessionInstanceId) {
          return failure("UNAUTHORIZED", "The agent session expired while waiting.");
        }
        if (!this.matchesPage(current, pageSessionId)) {
          return failure("STALE_PAGE_CONTEXT", "The agent page session is no longer current.");
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
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid agent session is required.");
    if (!this.matchesPage(resolved, pageSessionId)) return failure("STALE_PAGE_CONTEXT", "The agent page session is no longer current.");
    if (!this.validTargetIdentity(input)) return failure("INVALID_INPUT", "The comment input is invalid.");
    const task = resolved.workspace.tasks.find((entry) => entry.taskId === input.taskId);
    if (!task || task.assignee.memberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "This agent does not own the requested task.");
    }
    const replay = this.replay<{ task: IssueTask; comment: IssueComment; activityVersion: number }>(resolved, "agent.comment", input);
    if (replay) return replay;
    if (!this.validCommentInput(input, "taskId")) {
      return this.recordReplay(resolved, "agent.comment", input, failure("INVALID_INPUT", "The comment input is invalid."));
    }
    const thread = resolved.workspace.threads.find((entry) => entry.threadId === task.threadId)!;
    const replyFailure = this.validateReply(thread, input.replyToCommentId);
    if (replyFailure) return this.recordReplay(resolved, "agent.comment", input, replyFailure);
    if (thread.comments.length >= ISSUE_THREAD_COMMENT_LIMIT) return this.recordReplay(resolved, "agent.comment", input, failure("RATE_LIMITED", "The thread is full."));
    const timestamp = this.stamp(resolved.workspace);
    const comment: IssueComment = {
      commentId: randomUUID(),
      threadId: thread.threadId,
      replyToCommentId: input.replyToCommentId ?? null,
      author: agentActor(task),
      origin: "WEBMCP",
      body: input.body,
      evidenceRefs: clone(input.evidenceRefs ?? []),
      createdAt: timestamp,
    };
    thread.comments.push(comment);
    this.bumpActivity(resolved.workspace, timestamp);
    const result = { ok: true, data: { task: publicTask(task), comment: clone(comment), activityVersion: resolved.workspace.document.activityVersion } } as const;
    this.notify(resolved.workspace.id);
    return this.recordReplay(resolved, "agent.comment", input, result);
  }

  async submitTaskResult(
    agentSessionToken: string,
    input: SubmitIssueTaskResultServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<SubmitIssueTaskResultOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid agent session is required.");
    if (!this.matchesPage(resolved, pageSessionId)) return failure("STALE_PAGE_CONTEXT", "The agent page session is no longer current.");
    if (!this.validTargetIdentity(input)) return failure("INVALID_INPUT", "The task result input is invalid.");
    const workspace = resolved.workspace;
    const task = workspace.tasks.find((entry) => entry.taskId === input.taskId);
    if (!task || task.assignee.memberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "This agent does not own the requested task.");
    }
    const replay = this.replay<SubmitIssueTaskResultOutcome>(resolved, "agent.result", input);
    if (replay) return replay;
    if (!this.validResultInput(input)) {
      return this.recordReplay(resolved, "agent.result", input, failure("INVALID_INPUT", "The task result input is invalid."));
    }
    if (task.status === "STALE") {
      return this.recordReplay(resolved, "agent.result", input, failure("STALE_TASK_CONTEXT", "The task target is stale.", false, { currentTask: publicTask(task) }));
    }
    if (task.status !== "OPEN") {
      return this.recordReplay(resolved, "agent.result", input, failure("TASK_MODE_VIOLATION", "Only Open tasks accept a result.", false, { currentTask: publicTask(task) }));
    }
    if (input.basedOnRevision < task.anchor.createdRevision || input.basedOnRevision > workspace.document.revision) {
      return this.recordReplay(resolved, "agent.result", input, failure("INVALID_INPUT", "The source revision is outside this task's valid range."));
    }
    const evidenceRefs = input.evidenceRefs ?? [];
    const actor = agentActor(task);
    if (task.mode === "COMMENT") {
      if (input.replacementText !== undefined) {
        return this.recordReplay(resolved, "agent.result", input, failure("INVALID_INPUT", "Comment tasks cannot replace content."));
      }
      const thread = workspace.threads.find((entry) => entry.threadId === task.threadId)!;
      if (thread.comments.length >= ISSUE_THREAD_COMMENT_LIMIT) {
        return this.recordReplay(resolved, "agent.result", input, failure("RATE_LIMITED", "The task thread is full."));
      }
      const timestamp = this.stamp(workspace);
      thread.comments.push({
        commentId: randomUUID(), threadId: thread.threadId, replyToCommentId: null,
        author: actor, origin: "WEBMCP", body: input.resultSummary,
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
      this.bumpActivity(workspace, timestamp);
      const result = { ok: true, data: { outcome: "COMMENTED", task: publicTask(task) as IssueTask & { status: "COMPLETED" }, revision: workspace.document.revision, activityVersion: workspace.document.activityVersion } } as const;
      this.notify(workspace.id);
      return this.recordReplay(resolved, "agent.result", input, result);
    }
    if (typeof input.replacementText !== "string") {
      return this.recordReplay(resolved, "agent.result", input, failure("TASK_MODE_VIOLATION", "This task requires a replacement."));
    }
    const live = this.liveSelection(workspace, task);
    if (!live) return this.recordReplay(resolved, "agent.result", input, failure("STALE_TASK_CONTEXT", "The task target is stale.", false, { currentTask: publicTask(task) }));
    if (input.replacementText === live.selectedText) return this.recordReplay(resolved, "agent.result", input, failure("INVALID_INPUT", "The replacement must change the target."));
    const max = live.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH;
    const nextField = replaceIssueRange(live.value, live.anchor.rangeStart, live.anchor.rangeEnd, input.replacementText);
    if (issuePointLength(nextField) > max || (live.field === "TITLE" && nextField.trim().length === 0)) {
      return this.recordReplay(resolved, "agent.result", input, failure("INVALID_INPUT", "The replacement exceeds the document bounds."));
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
      this.bumpActivity(workspace, timestamp);
      const result = { ok: true, data: { outcome: "PROPOSED", task: publicTask(task) as IssueTask & { status: "PROPOSED" }, revision: workspace.document.revision, activityVersion: workspace.document.activityVersion } } as const;
      this.notify(workspace.id);
      return this.recordReplay(resolved, "agent.result", input, result);
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
      timestamp,
    });
    this.resolveTaskThread(workspace, task, task.assignee, timestamp);
    const result = { ok: true, data: { outcome: "COMMITTED", task: publicTask(task) as IssueTask & { status: "COMPLETED" }, revision: clone(revision), activityVersion: workspace.document.activityVersion } } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, "agent.result", input, result);
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
      this.bumpActivity(workspace, timestamp);
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
      timestamp,
    });
    this.resolveTaskThread(workspace, task, resolved.member, timestamp);
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.notify(workspace.id);
    return this.recordReplay(resolved, operation, input, result);
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
      ledger: new Map(),
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
      activityVersion: workspace.document.activityVersion + 1,
      updatedAt: timestamp,
      lastRevision: {
        revisionId: revision.revisionId,
        author: clone(input.provenance.author),
        authority: input.provenance.authority,
        summary: input.changeSummary,
      },
    };
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
      tasks: orderedTasks.map(publicTask),
      threads: orderedThreads.map(publicThread),
      history,
      hasMoreHistory: workspace.revisions.length > history.length,
    });
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

  private matchesPage(resolved: ResolvedSession, pageSessionId: string): boolean {
    void resolved;
    return isUuid(pageSessionId);
  }

  private cleanupExpired(): void {
    const now = this.now();
    for (const [id, workspace] of this.workspaces) {
      if (workspace.expiresAt > now) continue;
      this.workspaces.delete(id);
      this.workspaceIdsByShareTokenHash.delete(workspace.shareTokenHash);
      this.listeners.delete(id);
    }
    for (const [token, session] of this.sessions) if (session.expiresAt <= now || !this.workspaces.has(session.documentId)) this.sessions.delete(token);
  }

  private validDisplayName(value: unknown): boolean {
    return value === undefined || boundedText(value, DISPLAY_NAME_MAX_LENGTH);
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

  private memberSnapshot(member: IssueMemberSnapshot): IssueMemberSnapshot {
    return { memberId: member.memberId, displayName: member.displayName };
  }

  private stamp(workspace: StoredWorkspace): string {
    workspace.lastTimestampMs = Math.max(this.now(), workspace.lastTimestampMs + 1);
    return new Date(workspace.lastTimestampMs).toISOString();
  }

  private bumpActivity(workspace: StoredWorkspace, timestamp: string): void {
    workspace.document.activityVersion += 1;
    workspace.document.updatedAt = timestamp;
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
    identity: { taskId: string; threadId: string; taskKey: string },
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
      }
    }
    if (oldTaskId === identity.taskId) return;
  }

  private bootstrapPath(bundle: IssueSessionBundle): string {
    return `/issue/${bundle.shareToken}#ratiflow-bootstrap=${Buffer.from(JSON.stringify(bundle), "utf8").toString("base64url")}`;
  }

  private removeWorkspace(documentId: string): void {
    const workspace = this.workspaces.get(documentId);
    if (!workspace) return;
    this.notify(documentId);
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
