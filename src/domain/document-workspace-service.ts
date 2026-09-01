import { randomBytes, randomUUID } from "node:crypto";

import {
  DOCUMENT_BODY_MAX_LENGTH,
  DOCUMENT_CHANGE_SUMMARY_MAX_LENGTH,
  DOCUMENT_HUMAN_RATIONALE_MAX_LENGTH,
  DOCUMENT_MEMORY_DEFAULT_LIMIT,
  DOCUMENT_MEMORY_EXCERPT_MAX_LENGTH,
  DOCUMENT_MEMORY_MAX_LIMIT,
  DOCUMENT_MEMBER_ACTIVE_WORK_LIMIT,
  DOCUMENT_TITLE_MAX_LENGTH,
  DOCUMENT_WAIT_DEFAULT_SECONDS,
  DOCUMENT_WAIT_MAX_SECONDS,
  DOCUMENT_WORK_INSTRUCTION_MAX_LENGTH,
  DOCUMENT_WORK_REPLACEMENT_MAX_LENGTH,
  DOCUMENT_WORKSPACE_ACTIVE_WORK_LIMIT,
  DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
  DOCUMENT_WORKSPACE_TERMINAL_HISTORY_LIMIT,
  type CancelDocumentWorkOrderInput,
  type CreateDocumentWorkOrderInput,
  type DecideWorkProposalInput,
  type DocumentDiff,
  type DocumentField,
  type DocumentMemoryEvent,
  type DocumentPresence,
  type DocumentSessionBundleV3,
  type DocumentSurfaceV3,
  type DocumentV3Failure,
  type DocumentV3Result,
  type DocumentV3ServicePort,
  type DocumentWorkOrder,
  type JoinDocumentV3Input,
  type LaunchDocumentV3Input,
  type ListMyWorkOutcome,
  type PendingDocumentWorkOrder,
  type ProposedDocumentWorkOrder,
  type ReadDocumentMemoryInput,
  type ReadDocumentMemoryOutcome,
  type ResetDocumentHeroOutcome,
  type SaveDocumentInput,
  type SharedDocumentV3,
  type StaleDocumentV3Failure,
  type SubmitWorkProposalOutcome,
  type SubmitWorkProposalServiceInput,
  type TouchDocumentPresenceInput,
  type WaitForMyWorkInput,
  type WaitForMyWorkOutcome,
} from "@/document/contracts";

type SessionActor = "HUMAN" | "AGENT";

type StoredMember = {
  memberId: string;
  displayName: string;
  color: string;
  expiresAt: number;
};

type StoredSession = {
  documentId: string;
  memberId: string;
  actorType: SessionActor;
  expiresAt: number;
  protocolVersion: 3;
};

type StoredPresence = {
  value: DocumentPresence;
  lastSeenMs: number;
};

type LedgerEntry = {
  operation: string;
  fingerprint: string;
  result: DocumentV3Result<unknown>;
};

type StoredWorkspace = {
  shareToken: string;
  expiresAt: number;
  nextGuestNumber: number;
  document: SharedDocumentV3;
  members: Map<string, StoredMember>;
  presence: Map<string, StoredPresence>;
  workOrders: DocumentWorkOrder[];
  events: DocumentMemoryEvent[];
  ledger: Map<string, LedgerEntry>;
};

type ResolvedSession = {
  workspace: StoredWorkspace;
  session: StoredSession;
  member: StoredMember;
};

type Splice = { start: number; end: number; replacementLength: number };

export type LocalDocumentWorkspaceServiceOptions = {
  sessionTtlMs?: number;
  presenceTtlMs?: number;
  now?: () => number;
};

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const DOCUMENT_WORKSPACE_PRESENCE_TTL_MS = 15_000;
const DISPLAY_NAME_MAX_LENGTH = 80;
const MEMBER_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#0f766e", "#c2410c", "#4f46e5"] as const;
const HERO_DOCUMENT_ID = "00000000-0000-4000-8000-000000000301";
const HERO_MAYA_ID = "00000000-0000-4000-8000-000000000311";
const HERO_JORDAN_ID = "00000000-0000-4000-8000-000000000312";
const HERO_WORK_ORDER_ID = "00000000-0000-4000-8000-000000000321";
const HERO_SEED_EVENT_ID = "00000000-0000-4000-8000-000000000331";
const HERO_WORK_EVENT_ID = "00000000-0000-4000-8000-000000000332";
const HERO_PROPOSAL_EVENT_ID = "00000000-0000-4000-8000-000000000333";
const HERO_ACCEPTANCE_EVENT_ID = "00000000-0000-4000-8000-000000000334";
const HERO_TITLE = "Northstar CSV launch memo";
const HERO_BODY = "Recommendation\n\nLaunch CSV export as generally available on October 15.\n\nContext\n\nNorthstar Health's $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.\n\nOpen question\n\nCan a single-tenant beta meet Northstar's need while general availability moves to November 1?";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function pointLength(value: string): number {
  return codePoints(value).length;
}

function truncate(value: string): string {
  const points = codePoints(value);
  if (points.length <= DOCUMENT_MEMORY_EXCERPT_MAX_LENGTH) return value;
  return `${points.slice(0, DOCUMENT_MEMORY_EXCERPT_MAX_LENGTH - 1).join("")}…`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof DOMException && signal.reason.name === "AbortError") {
    throw signal.reason;
  }
  throw new DOMException(
    typeof signal.reason === "string" ? signal.reason : "Operation cancelled",
    "AbortError",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
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

function boundedText(value: unknown, max: number, allowEmpty = true): value is string {
  return typeof value === "string"
    && pointLength(value) <= max
    && (allowEmpty || value.trim().length > 0);
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
  code: DocumentV3Failure["code"],
  message: string,
  retryable = false,
  details: Partial<DocumentV3Failure> = {},
): DocumentV3Failure {
  return { ok: false, code, message, retryable, ...details };
}

function deriveSplice(previous: string, next: string): Splice | null {
  if (previous === next) return null;
  const before = codePoints(previous);
  const after = codePoints(next);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix += 1;
  }
  return {
    start: prefix,
    end: before.length - suffix,
    replacementLength: after.length - prefix - suffix,
  };
}

function makeDiff(field: DocumentField, previous: string, next: string): DocumentDiff | null {
  const splice = deriveSplice(previous, next);
  if (!splice) return null;
  return {
    field,
    rangeStart: splice.start,
    rangeEnd: splice.end,
    beforeExcerpt: truncate(codePoints(previous).slice(splice.start, splice.end).join("")),
    afterExcerpt: truncate(
      codePoints(next).slice(splice.start, splice.start + splice.replacementLength).join(""),
    ),
  };
}

function compareWork(left: DocumentWorkOrder, right: DocumentWorkOrder): number {
  return left.createdAt.localeCompare(right.createdAt)
    || left.workOrderId.localeCompare(right.workOrderId);
}

function compareTerminalNewest(left: DocumentWorkOrder, right: DocumentWorkOrder): number {
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.workOrderId.localeCompare(left.workOrderId);
}

function selectedText(document: SharedDocumentV3, field: DocumentField, start: number, end: number): string {
  return codePoints(field === "TITLE" ? document.title : document.body).slice(start, end).join("");
}

/** In-memory v3 reference service used by tests and local/demo fallback. */
export class LocalDocumentWorkspaceService implements DocumentV3ServicePort {
  private readonly workspaces = new Map<string, StoredWorkspace>();
  private readonly documentIdsByShareToken = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly activeWaits = new Set<string>();
  private readonly sessionTtlMs: number;
  private readonly presenceTtlMs: number;
  private readonly now: () => number;

  constructor({
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    presenceTtlMs = DOCUMENT_WORKSPACE_PRESENCE_TTL_MS,
    now = Date.now,
  }: LocalDocumentWorkspaceServiceOptions = {}) {
    this.sessionTtlMs = Math.max(1, sessionTtlMs);
    this.presenceTtlMs = Math.max(1, presenceTtlMs);
    this.now = now;
  }

  async resetHeroForEvaluation(
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<ResetDocumentHeroOutcome>> {
    throwIfAborted(signal);
    this.removeWorkspace(HERO_DOCUMENT_ID);
    const now = this.now();
    const shareToken = randomBytes(32).toString("base64url");
    const expiresAt = now + this.sessionTtlMs;
    const workspace: StoredWorkspace = {
      shareToken,
      expiresAt,
      nextGuestNumber: 1,
      document: {
        id: HERO_DOCUMENT_ID,
        protocolVersion: DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
        title: HERO_TITLE,
        body: HERO_BODY,
        revision: 1,
        activityVersion: 1,
        updatedAt: new Date(now).toISOString(),
        lastEditor: null,
      },
      members: new Map(),
      presence: new Map(),
      workOrders: [],
      events: [],
      ledger: new Map(),
    };
    this.workspaces.set(HERO_DOCUMENT_ID, workspace);
    this.documentIdsByShareToken.set(shareToken, HERO_DOCUMENT_ID);
    workspace.events.push(this.event(workspace, {
      eventId: HERO_SEED_EVENT_ID,
      kind: "DOCUMENT_EDITED",
      actor: { displayName: "Demo reset", actorType: "SYSTEM" },
      origin: "SYSTEM",
      baseRevision: 0,
      resultRevision: 1,
      changedFields: ["TITLE", "BODY"],
      diffs: [
        {
          field: "TITLE",
          rangeStart: 0,
          rangeEnd: 0,
          beforeExcerpt: "",
          afterExcerpt: truncate(HERO_TITLE),
        },
        {
          field: "BODY",
          rangeStart: 0,
          rangeEnd: 0,
          beforeExcerpt: "",
          afterExcerpt: truncate(HERO_BODY),
        },
      ],
    }));
    const maya = this.issueBundle(workspace, "Maya Chen", HERO_MAYA_ID);
    const jordan = this.issueBundle(workspace, "Jordan Lee", HERO_JORDAN_ID);
    throwIfAborted(signal);
    return {
      ok: true,
      data: {
        shareToken,
        mayaBootstrapPath: this.bootstrapPath(maya),
        jordanBootstrapPath: this.bootstrapPath(jordan),
        expiresAt: new Date(expiresAt).toISOString(),
        revision: 1,
        activityVersion: 1,
      },
    };
  }

  async launchV3(
    input: LaunchDocumentV3Input = {},
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSessionBundleV3>> {
    throwIfAborted(signal);
    this.cleanupExpired();
    if (!hasExactKeys(input, [], ["displayName"])) {
      return failure("INVALID_INPUT", "The launch request is malformed.");
    }
    const invalidName = this.validateDisplayName(
      typeof input.displayName === "string" ? input.displayName : undefined,
    );
    if (invalidName) return invalidName;
    const now = this.now();
    const documentId = randomUUID();
    const shareToken = randomBytes(32).toString("base64url");
    const workspace: StoredWorkspace = {
      shareToken,
      expiresAt: now + this.sessionTtlMs,
      nextGuestNumber: 1,
      document: {
        id: documentId,
        protocolVersion: DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
        title: "",
        body: "",
        revision: 0,
        activityVersion: 0,
        updatedAt: new Date(now).toISOString(),
        lastEditor: null,
      },
      members: new Map(),
      presence: new Map(),
      workOrders: [],
      events: [],
      ledger: new Map(),
    };
    this.workspaces.set(documentId, workspace);
    this.documentIdsByShareToken.set(shareToken, documentId);
    return {
      ok: true,
      data: this.issueBundle(
        workspace,
        typeof input.displayName === "string" ? input.displayName : undefined,
      ),
    };
  }

  async joinV3(
    input: JoinDocumentV3Input,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSessionBundleV3>> {
    throwIfAborted(signal);
    this.cleanupExpired();
    if (!hasExactKeys(input, ["shareToken"], ["displayName"])
      || typeof input.shareToken !== "string"
      || !/^[A-Za-z0-9_-]{32,128}$/.test(input.shareToken)) {
      return failure("INVALID_INPUT", "A valid share token is required.");
    }
    const invalidName = this.validateDisplayName(input.displayName);
    if (invalidName) return invalidName;
    const documentId = this.documentIdsByShareToken.get(input.shareToken);
    const workspace = documentId ? this.workspaces.get(documentId) : undefined;
    if (!workspace) return this.notFound();
    return {
      ok: true,
      data: this.issueBundle(
        workspace,
        typeof input.displayName === "string" ? input.displayName : undefined,
      ),
    };
  }

  async inspect(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    throwIfAborted(signal);
    const resolved = this.resolveSession(sessionToken);
    if (!resolved) return failure("UNAUTHORIZED", "A valid v3 document session is required.");
    return { ok: true, data: this.surface(resolved.workspace) };
  }

  async saveHuman(
    sessionToken: string,
    input: SaveDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human v3 session is required.");
    if (!hasExactKeys(input, ["expectedRevision", "requestId", "title", "body"])
      || !isCounter(input.expectedRevision)
      || !isUuid(input.requestId)
      || !boundedText(input.title, DOCUMENT_TITLE_MAX_LENGTH)
      || !boundedText(input.body, DOCUMENT_BODY_MAX_LENGTH)) {
      return failure("INVALID_INPUT", "The document save is malformed or exceeds its limits.");
    }
    const replay = this.replay<DocumentSurfaceV3>(resolved.workspace, "save", input.requestId, input);
    if (replay) return replay;
    const stale = this.expectedRevision(resolved.workspace, input.expectedRevision);
    if (stale) return stale;
    const { workspace, member } = resolved;
    const previousTitle = workspace.document.title;
    const previousBody = workspace.document.body;
    if (previousTitle === input.title && previousBody === input.body) {
      const result = { ok: true, data: this.surface(workspace) } as const;
      this.recordReplay(workspace, "save", input.requestId, input, result);
      return result;
    }

    const baseRevision = workspace.document.revision;
    const nextRevision = baseRevision + 1;
    const diffs = [
      makeDiff("TITLE", previousTitle, input.title),
      makeDiff("BODY", previousBody, input.body),
    ].filter((entry): entry is DocumentDiff => entry !== null);
    workspace.document.title = input.title;
    workspace.document.body = input.body;
    workspace.document.revision = nextRevision;
    workspace.document.updatedAt = new Date(this.now()).toISOString();
    workspace.document.lastEditor = {
      displayName: member.displayName,
      actorType: "HUMAN",
      origin: "ORDINARY_UI",
    };
    const staled = this.rebaseActiveOrders(workspace, {
      TITLE: deriveSplice(previousTitle, input.title),
      BODY: deriveSplice(previousBody, input.body),
    }, nextRevision);
    workspace.document.activityVersion += 1;
    workspace.events.push(this.event(workspace, {
      kind: "DOCUMENT_EDITED",
      actor: { displayName: member.displayName, actorType: "HUMAN" },
      origin: "ORDINARY_UI",
      baseRevision,
      resultRevision: nextRevision,
      linkedWorkOrderIds: staled,
      changedFields: diffs.map((entry) => entry.field),
      diffs,
    }));
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.recordReplay(workspace, "save", input.requestId, input, result);
    this.notify(workspace.document.id);
    throwIfAborted(signal);
    return clone(result);
  }

  async createWorkOrder(
    sessionToken: string,
    input: CreateDocumentWorkOrderInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human v3 session is required.");
    if (!this.validCreateInput(input)) {
      return failure("INVALID_INPUT", "The work order is malformed.");
    }
    const replay = this.replay<DocumentSurfaceV3>(resolved.workspace, "create", input.requestId, input);
    if (replay) return replay;
    const stale = this.expectedRevision(resolved.workspace, input.expectedRevision);
    if (stale) return stale;
    const { workspace, member } = resolved;
    const assignee = workspace.members.get(input.assignedToMemberId);
    const assigneePresence = workspace.presence.get(input.assignedToMemberId);
    const now = this.now();
    if (!assignee
      || assignee.expiresAt <= now
      || !assigneePresence
      || now - assigneePresence.lastSeenMs > this.presenceTtlMs) {
      return failure("ASSIGNEE_UNAVAILABLE", "The selected collaborator is not currently assignable.");
    }
    const active = workspace.workOrders.filter((order) => this.isActive(order));
    if (active.length >= DOCUMENT_WORKSPACE_ACTIVE_WORK_LIMIT
      || active.filter((order) => order.assignedToMemberId === assignee.memberId).length
        >= DOCUMENT_MEMBER_ACTIVE_WORK_LIMIT) {
      return failure("RATE_LIMITED", "The active work-order limit has been reached.");
    }
    const fieldText = input.targetField === "TITLE" ? workspace.document.title : workspace.document.body;
    const fieldLength = pointLength(fieldText);
    if (input.rangeStart >= input.rangeEnd || input.rangeEnd > fieldLength) {
      return failure("INVALID_INPUT", "The selected range is empty or outside the document.");
    }
    const captured = codePoints(fieldText).slice(input.rangeStart, input.rangeEnd).join("");
    if (!captured) return failure("INVALID_INPUT", "A non-empty selection is required.");

    const createdAt = new Date(now).toISOString();
    const workOrder: PendingDocumentWorkOrder = {
      workOrderId: workspace.document.id === HERO_DOCUMENT_ID
        && workspace.document.activityVersion === 1
        && workspace.workOrders.length === 0
        ? HERO_WORK_ORDER_ID
        : randomUUID(),
      intent: input.intent,
      source: input.source,
      instruction: input.instruction,
      anchor: {
        field: input.targetField,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        selectedText: captured,
        createdRevision: workspace.document.revision,
        anchorRevision: workspace.document.revision,
      },
      creatorMemberId: member.memberId,
      creatorDisplayName: member.displayName,
      assignedToMemberId: assignee.memberId,
      assignedToDisplayName: assignee.displayName,
      createdAt,
      updatedAt: createdAt,
      status: "PENDING",
      proposal: null,
      decision: null,
      resolvedAt: null,
    };
    workspace.workOrders.push(workOrder);
    workspace.document.activityVersion += 1;
    workspace.events.push(this.event(workspace, {
      eventId: workOrder.workOrderId === HERO_WORK_ORDER_ID ? HERO_WORK_EVENT_ID : undefined,
      kind: "WORK_CREATED",
      actor: { displayName: member.displayName, actorType: "HUMAN" },
      origin: "ORDINARY_UI",
      baseRevision: workspace.document.revision,
      resultRevision: workspace.document.revision,
      workOrderId: workOrder.workOrderId,
      linkedWorkOrderIds: [workOrder.workOrderId],
      targetExcerpt: truncate(captured),
      instructionExcerpt: truncate(input.instruction),
    }));
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.recordReplay(workspace, "create", input.requestId, input, result);
    this.notify(workspace.document.id);
    throwIfAborted(signal);
    return clone(result);
  }

  async cancelWorkOrder(
    sessionToken: string,
    input: CancelDocumentWorkOrderInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human v3 session is required.");
    if (!hasExactKeys(input, ["workOrderId", "requestId"])
      || !isUuid(input.workOrderId) || !isUuid(input.requestId)) {
      return failure("INVALID_INPUT", "The cancellation request is malformed.");
    }
    const index = resolved.workspace.workOrders.findIndex((order) => order.workOrderId === input.workOrderId);
    const existing = resolved.workspace.workOrders[index];
    if (!existing || existing.creatorMemberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "Only the work creator may cancel this order.");
    }
    const replay = this.replay<DocumentSurfaceV3>(resolved.workspace, "cancel", input.requestId, input);
    if (replay) return replay;
    if (existing.status !== "PENDING") {
      return failure("STALE_WORK_CONTEXT", "Only pending work may be cancelled.", false, {
        currentRevision: resolved.workspace.document.revision,
        currentActivityVersion: resolved.workspace.document.activityVersion,
        currentWorkOrder: clone(existing),
      });
    }
    const updatedAt = new Date(this.now()).toISOString();
    const cancelled: DocumentWorkOrder = {
      ...existing,
      status: "CANCELLED",
      updatedAt,
      resolvedAt: updatedAt,
      proposal: null,
      decision: null,
    };
    resolved.workspace.workOrders[index] = cancelled;
    resolved.workspace.document.activityVersion += 1;
    resolved.workspace.events.push(this.event(resolved.workspace, {
      kind: "WORK_CANCELLED",
      actor: { displayName: resolved.member.displayName, actorType: "HUMAN" },
      origin: "ORDINARY_UI",
      baseRevision: resolved.workspace.document.revision,
      resultRevision: resolved.workspace.document.revision,
      workOrderId: existing.workOrderId,
      linkedWorkOrderIds: [existing.workOrderId],
      targetExcerpt: truncate(existing.anchor.selectedText),
      instructionExcerpt: truncate(existing.instruction),
    }));
    const result = { ok: true, data: this.surface(resolved.workspace) } as const;
    this.recordReplay(resolved.workspace, "cancel", input.requestId, input, result);
    this.notify(resolved.workspace.document.id);
    throwIfAborted(signal);
    return clone(result);
  }

  async acceptWorkProposal(
    sessionToken: string,
    input: DecideWorkProposalInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return this.decideWorkProposal("ACCEPTED", sessionToken, input, signal);
  }

  async rejectWorkProposal(
    sessionToken: string,
    input: DecideWorkProposalInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return this.decideWorkProposal("REJECTED", sessionToken, input, signal);
  }

  async listMyWork(
    agentSessionToken: string,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<ListMyWorkOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid paired-agent v3 session is required.");
    if (!isUuid(pageSessionId)) {
      return failure("INVALID_INPUT", "A valid page-session UUID is required.");
    }
    return { ok: true, data: this.myWork(resolved) };
  }

  async readMemory(
    sessionToken: string,
    input: ReadDocumentMemoryInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<ReadDocumentMemoryOutcome>> {
    throwIfAborted(signal);
    const resolved = this.resolveSession(sessionToken);
    if (!resolved) return failure("UNAUTHORIZED", "A valid v3 document session is required.");
    if (!hasExactKeys(input, [], ["beforeActivityVersion", "limit"])) {
      return failure("INVALID_INPUT", "The memory window is malformed.");
    }
    const beforeActivityVersion = input.beforeActivityVersion;
    const requestedLimit = input.limit;
    if ((beforeActivityVersion !== undefined
        && (!Number.isSafeInteger(beforeActivityVersion) || Number(beforeActivityVersion) < 1))
      || (requestedLimit !== undefined
        && (!Number.isInteger(requestedLimit)
          || Number(requestedLimit) < 1
          || Number(requestedLimit) > DOCUMENT_MEMORY_MAX_LIMIT))) {
      return failure("INVALID_INPUT", "The memory window is malformed.");
    }
    const limit = requestedLimit === undefined
      ? DOCUMENT_MEMORY_DEFAULT_LIMIT
      : Number(requestedLimit);
    const eligible = resolved.workspace.events.filter((event) =>
      beforeActivityVersion === undefined
        || event.activityVersion < Number(beforeActivityVersion),
    );
    const selected = eligible.slice(-limit);
    const hasMoreOlder = eligible.length > selected.length;
    return {
      ok: true,
      data: {
        events: clone(selected),
        hasMoreOlder,
        nextBeforeActivityVersion: hasMoreOlder
          ? selected[0]?.activityVersion ?? null
          : null,
        latestActivityVersion: resolved.workspace.document.activityVersion,
        revision: resolved.workspace.document.revision,
      },
    };
  }

  async waitForMyWork(
    agentSessionToken: string,
    input: WaitForMyWorkInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<WaitForMyWorkOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid paired-agent v3 session is required.");
    if (!hasExactKeys(input, ["afterActivityVersion", "afterRevision"], ["timeoutSeconds"])
      || !isCounter(input.afterActivityVersion)
      || !isCounter(input.afterRevision)
      || (input.timeoutSeconds !== undefined
        && (!Number.isInteger(input.timeoutSeconds)
          || input.timeoutSeconds < 1
          || input.timeoutSeconds > DOCUMENT_WAIT_MAX_SECONDS))
      || !isUuid(pageSessionId)) {
      return failure("INVALID_INPUT", "The wait request is malformed.");
    }
    const initial = this.myWork(resolved);
    if (input.afterActivityVersion > initial.activityVersion || input.afterRevision > initial.revision) {
      return failure("INVALID_INPUT", "Wait cursors cannot be ahead of the authoritative counters.", false, {
        currentRevision: initial.revision,
        currentActivityVersion: initial.activityVersion,
      });
    }
    const waitKey = `${pageSessionId}:${resolved.member.memberId}`;
    if (this.activeWaits.has(waitKey)) {
      return failure("WAIT_ALREADY_ACTIVE", "This page already has an active wait for this agent.", true, {
        currentRevision: initial.revision,
        currentActivityVersion: initial.activityVersion,
      });
    }
    if (initial.workOrders.length > 0) {
      return { ok: true, data: { outcome: "WORK_AVAILABLE", ...initial } };
    }
    if (initial.revision > input.afterRevision) {
      return {
        ok: true,
        data: {
          outcome: "DOCUMENT_CHANGED",
          workOrders: [],
          revision: initial.revision,
          activityVersion: initial.activityVersion,
        },
      };
    }

    this.activeWaits.add(waitKey);
    const deadline = this.now() + (input.timeoutSeconds ?? DOCUMENT_WAIT_DEFAULT_SECONDS) * 1_000;
    let cursor = input.afterActivityVersion;
    try {
      // Fetch → subscribe → authoritative refetch closes the lost-wake gap. Each
      // irrelevant wake advances only the internal cursor; the deadline is fixed.
      while (true) {
        throwIfAborted(signal);
        const refetched = this.myWork(resolved);
        if (refetched.workOrders.length > 0) {
          return { ok: true, data: { outcome: "WORK_AVAILABLE", ...refetched } };
        }
        if (refetched.revision > input.afterRevision) {
          return {
            ok: true,
            data: {
              outcome: "DOCUMENT_CHANGED",
              workOrders: [],
              revision: refetched.revision,
              activityVersion: refetched.activityVersion,
            },
          };
        }
        cursor = Math.max(cursor, refetched.activityVersion);
        const remaining = deadline - this.now();
        if (remaining <= 0) {
          return {
            ok: true,
            data: {
              outcome: "TIMEOUT",
              workOrders: [],
              revision: refetched.revision,
              activityVersion: refetched.activityVersion,
            },
          };
        }
        await this.waitForNotification(resolved.workspace.document.id, cursor, remaining, signal);
      }
    } finally {
      this.activeWaits.delete(waitKey);
    }
  }

  async submitWorkProposal(
    agentSessionToken: string,
    input: SubmitWorkProposalServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<SubmitWorkProposalOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(agentSessionToken, "AGENT");
    if (!resolved) return failure("UNAUTHORIZED", "A valid paired-agent v3 session is required.");
    if (!hasExactKeys(input, [
      "workOrderId",
      "expectedRevision",
      "replacementText",
      "changeSummary",
      "requestId",
    ])
      || !isUuid(input.workOrderId)
      || !isCounter(input.expectedRevision)
      || !isUuid(input.requestId)
      || !boundedText(input.replacementText, DOCUMENT_WORK_REPLACEMENT_MAX_LENGTH)
      || !boundedText(input.changeSummary, DOCUMENT_CHANGE_SUMMARY_MAX_LENGTH, false)
      || !isUuid(pageSessionId)) {
      return failure("INVALID_INPUT", "The proposal is malformed or exceeds its limits.");
    }
    const index = resolved.workspace.workOrders.findIndex((order) => order.workOrderId === input.workOrderId);
    const existing = resolved.workspace.workOrders[index];
    if (!existing || existing.assignedToMemberId !== resolved.member.memberId) {
      return failure("UNAUTHORIZED", "This work is not assigned to the paired agent.");
    }
    const replay = this.replay<SubmitWorkProposalOutcome>(
      resolved.workspace,
      "propose",
      input.requestId,
      input,
    );
    if (replay) return replay;
    if (existing.status !== "PENDING") {
      return failure("STALE_WORK_CONTEXT", "Only pending work accepts a proposal.", false, {
        currentRevision: resolved.workspace.document.revision,
        currentActivityVersion: resolved.workspace.document.activityVersion,
        currentWorkOrder: clone(existing),
      });
    }
    const stale = this.expectedRevision(resolved.workspace, input.expectedRevision);
    if (stale) return stale;
    if (existing.anchor.anchorRevision !== resolved.workspace.document.revision
      || selectedText(
        resolved.workspace.document,
        existing.anchor.field,
        existing.anchor.rangeStart,
        existing.anchor.rangeEnd,
      ) !== existing.anchor.selectedText) {
      return failure("STALE_WORK_CONTEXT", "The selected text is no longer safely anchored.", false, {
        currentRevision: resolved.workspace.document.revision,
        currentActivityVersion: resolved.workspace.document.activityVersion,
        currentWorkOrder: clone(existing),
      });
    }
    if (input.replacementText === existing.anchor.selectedText) {
      return failure("INVALID_INPUT", "A proposal must change the selected text.");
    }
    const currentField = existing.anchor.field === "TITLE"
      ? resolved.workspace.document.title
      : resolved.workspace.document.body;
    const resultingLength = pointLength(currentField)
      - pointLength(existing.anchor.selectedText)
      + pointLength(input.replacementText);
    const limit = existing.anchor.field === "TITLE" ? DOCUMENT_TITLE_MAX_LENGTH : DOCUMENT_BODY_MAX_LENGTH;
    if (resultingLength > limit) {
      return failure("INVALID_INPUT", "The proposed replacement would exceed the field limit.");
    }
    const proposedAt = new Date(this.now()).toISOString();
    const proposed: ProposedDocumentWorkOrder = {
      ...existing,
      status: "PROPOSED",
      proposal: {
        replacementText: input.replacementText,
        changeSummary: input.changeSummary,
        basedOnRevision: resolved.workspace.document.revision,
        proposedBy: {
          displayName: `${resolved.member.displayName}'s paired agent`,
          actorType: "AGENT",
        },
        proposedAt,
      },
      decision: null,
      resolvedAt: null,
      updatedAt: proposedAt,
    };
    resolved.workspace.workOrders[index] = proposed;
    resolved.workspace.document.activityVersion += 1;
    const proposalEvent = this.event(resolved.workspace, {
      eventId: proposed.workOrderId === HERO_WORK_ORDER_ID ? HERO_PROPOSAL_EVENT_ID : undefined,
      kind: "PROPOSAL_SUBMITTED",
      actor: { displayName: proposed.proposal.proposedBy.displayName, actorType: "AGENT" },
      origin: "WEBMCP",
      baseRevision: resolved.workspace.document.revision,
      resultRevision: resolved.workspace.document.revision,
      workOrderId: proposed.workOrderId,
      linkedWorkOrderIds: [proposed.workOrderId],
      targetExcerpt: truncate(proposed.anchor.selectedText),
      instructionExcerpt: truncate(proposed.instruction),
      proposalExcerpt: truncate(proposed.proposal.replacementText),
      changeSummary: proposed.proposal.changeSummary,
    }) as DocumentMemoryEvent & { kind: "PROPOSAL_SUBMITTED" };
    resolved.workspace.events.push(proposalEvent);
    const result = {
      ok: true,
      data: {
        workOrder: clone(proposed),
        document: clone(resolved.workspace.document),
        event: clone(proposalEvent),
      },
    } as const;
    this.recordReplay(resolved.workspace, "propose", input.requestId, input, result);
    this.notify(resolved.workspace.document.id);
    throwIfAborted(signal);
    return clone(result);
  }

  async touchPresence(
    sessionToken: string,
    input: TouchDocumentPresenceInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human v3 session is required.");
    if (!this.validPresence(input, resolved.workspace.document)) {
      return failure("INVALID_INPUT", "The presence update is malformed.");
    }
    const now = this.now();
    resolved.workspace.presence.set(resolved.member.memberId, {
      lastSeenMs: now,
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
        lastSeenAt: new Date(now).toISOString(),
      },
    });
    return { ok: true, data: this.surface(resolved.workspace) };
  }

  private async decideWorkProposal(
    decisionKind: "ACCEPTED" | "REJECTED",
    sessionToken: string,
    input: DecideWorkProposalInput,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return failure("UNAUTHORIZED", "A valid human v3 session is required.");
    if (!hasExactKeys(input, ["workOrderId", "expectedRevision", "requestId", "rationale"])
      || !isUuid(input.workOrderId)
      || !isCounter(input.expectedRevision)
      || !isUuid(input.requestId)
      || (input.rationale !== null
        && !boundedText(input.rationale, DOCUMENT_HUMAN_RATIONALE_MAX_LENGTH, false))) {
      return failure("INVALID_INPUT", "The proposal decision is malformed.");
    }
    const { workspace, member } = resolved;
    const index = workspace.workOrders.findIndex((order) => order.workOrderId === input.workOrderId);
    const existing = workspace.workOrders[index];
    if (!existing || existing.creatorMemberId !== member.memberId) {
      return failure("UNAUTHORIZED", "Only the work creator may decide this proposal.");
    }
    const operation = decisionKind === "ACCEPTED" ? "accept" : "reject";
    const replay = this.replay<DocumentSurfaceV3>(workspace, operation, input.requestId, input);
    if (replay) return replay;
    if (existing.status !== "PROPOSED") {
      return failure("STALE_WORK_CONTEXT", "Only a proposed work order may be decided.", false, {
        currentRevision: workspace.document.revision,
        currentActivityVersion: workspace.document.activityVersion,
        currentWorkOrder: clone(existing),
      });
    }
    const stale = this.expectedRevision(workspace, input.expectedRevision);
    if (stale) return stale;
    if (existing.anchor.anchorRevision !== workspace.document.revision
      || selectedText(
        workspace.document,
        existing.anchor.field,
        existing.anchor.rangeStart,
        existing.anchor.rangeEnd,
      ) !== existing.anchor.selectedText) {
      return failure("STALE_WORK_CONTEXT", "The selected text is no longer safely anchored.", false, {
        currentRevision: workspace.document.revision,
        currentActivityVersion: workspace.document.activityVersion,
        currentWorkOrder: clone(existing),
      });
    }

    const nowIso = new Date(this.now()).toISOString();
    const decisionRevision = workspace.document.revision;
    if (decisionKind === "REJECTED") {
      const rejected: DocumentWorkOrder = {
        ...existing,
        status: "REJECTED",
        updatedAt: nowIso,
        resolvedAt: nowIso,
        decision: {
          kind: "REJECTED",
          rationale: input.rationale,
          decidedBy: { memberId: member.memberId, displayName: member.displayName },
          decidedAt: nowIso,
          decisionRevision,
          resultRevision: decisionRevision,
        },
      };
      workspace.workOrders[index] = rejected;
      workspace.document.activityVersion += 1;
      workspace.events.push(this.event(workspace, {
        kind: "PROPOSAL_REJECTED",
        actor: { displayName: member.displayName, actorType: "HUMAN" },
        origin: "ORDINARY_UI",
        baseRevision: decisionRevision,
        resultRevision: decisionRevision,
        workOrderId: existing.workOrderId,
        linkedWorkOrderIds: [existing.workOrderId],
        targetExcerpt: truncate(existing.anchor.selectedText),
        instructionExcerpt: truncate(existing.instruction),
        proposalExcerpt: truncate(existing.proposal.replacementText),
        changeSummary: existing.proposal.changeSummary,
        rationale: input.rationale,
      }));
      const result = { ok: true, data: this.surface(workspace) } as const;
      this.recordReplay(workspace, operation, input.requestId, input, result);
      this.notify(workspace.document.id);
      throwIfAborted(signal);
      return clone(result);
    }

    const field = existing.anchor.field;
    const previousText = field === "TITLE" ? workspace.document.title : workspace.document.body;
    const points = codePoints(previousText);
    const nextText = [
      ...points.slice(0, existing.anchor.rangeStart),
      ...codePoints(existing.proposal.replacementText),
      ...points.slice(existing.anchor.rangeEnd),
    ].join("");
    if ((field === "TITLE" && pointLength(nextText) > DOCUMENT_TITLE_MAX_LENGTH)
      || (field === "BODY" && pointLength(nextText) > DOCUMENT_BODY_MAX_LENGTH)) {
      return failure("STALE_WORK_CONTEXT", "The stored proposal no longer fits the document field.", false, {
        currentRevision: workspace.document.revision,
        currentActivityVersion: workspace.document.activityVersion,
        currentWorkOrder: clone(existing),
      });
    }
    if (field === "TITLE") workspace.document.title = nextText;
    else workspace.document.body = nextText;
    const resultRevision = decisionRevision + 1;
    workspace.document.revision = resultRevision;
    workspace.document.updatedAt = nowIso;
    workspace.document.lastEditor = {
      displayName: member.displayName,
      actorType: "HUMAN",
      origin: "ORDINARY_UI",
    };
    const completed: DocumentWorkOrder = {
      ...existing,
      status: "COMPLETED",
      updatedAt: nowIso,
      resolvedAt: nowIso,
      decision: {
        kind: "ACCEPTED",
        rationale: input.rationale,
        decidedBy: { memberId: member.memberId, displayName: member.displayName },
        decidedAt: nowIso,
        decisionRevision,
        resultRevision,
      },
    };
    workspace.workOrders[index] = completed;
    const splices: Record<DocumentField, Splice | null> = {
      TITLE: field === "TITLE" ? deriveSplice(previousText, nextText) : null,
      BODY: field === "BODY" ? deriveSplice(previousText, nextText) : null,
    };
    const staled = this.rebaseActiveOrders(workspace, splices, resultRevision, existing.workOrderId);
    workspace.document.activityVersion += 1;
    const linked = [existing.workOrderId, ...staled].sort();
    workspace.events.push(this.event(workspace, {
      eventId: existing.workOrderId === HERO_WORK_ORDER_ID ? HERO_ACCEPTANCE_EVENT_ID : undefined,
      kind: "PROPOSAL_ACCEPTED",
      actor: { displayName: member.displayName, actorType: "HUMAN" },
      origin: "ORDINARY_UI",
      baseRevision: decisionRevision,
      resultRevision,
      workOrderId: existing.workOrderId,
      linkedWorkOrderIds: linked,
      changedFields: [field],
      targetExcerpt: truncate(existing.anchor.selectedText),
      instructionExcerpt: truncate(existing.instruction),
      proposalExcerpt: truncate(existing.proposal.replacementText),
      changeSummary: existing.proposal.changeSummary,
      diffs: [{
        field,
        rangeStart: existing.anchor.rangeStart,
        rangeEnd: existing.anchor.rangeEnd,
        beforeExcerpt: truncate(existing.anchor.selectedText),
        afterExcerpt: truncate(existing.proposal.replacementText),
      }],
      rationale: input.rationale,
    }));
    const result = { ok: true, data: this.surface(workspace) } as const;
    this.recordReplay(workspace, operation, input.requestId, input, result);
    this.notify(workspace.document.id);
    throwIfAborted(signal);
    return clone(result);
  }

  private issueBundle(
    workspace: StoredWorkspace,
    requestedDisplayName?: string,
    fixedMemberId?: string,
  ): DocumentSessionBundleV3 {
    const memberId = fixedMemberId ?? randomUUID();
    const displayName = requestedDisplayName?.trim()
      || `Guest ${workspace.nextGuestNumber++}`;
    const member: StoredMember = {
      memberId,
      displayName,
      color: MEMBER_COLORS[workspace.members.size % MEMBER_COLORS.length] ?? MEMBER_COLORS[0],
      expiresAt: workspace.expiresAt,
    };
    workspace.members.set(memberId, member);
    const humanSessionToken = randomBytes(32).toString("base64url");
    const agentSessionToken = randomBytes(32).toString("base64url");
    const baseSession = {
      documentId: workspace.document.id,
      memberId,
      expiresAt: workspace.expiresAt,
      protocolVersion: DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
    } as const;
    this.sessions.set(humanSessionToken, { ...baseSession, actorType: "HUMAN" });
    this.sessions.set(agentSessionToken, { ...baseSession, actorType: "AGENT" });
    const now = this.now();
    workspace.presence.set(memberId, {
      lastSeenMs: now,
      value: {
        memberId,
        displayName,
        color: member.color,
        state: "VIEWING",
        field: null,
        isTyping: false,
        selectionStart: null,
        selectionEnd: null,
        observedRevision: workspace.document.revision,
        lastSeenAt: new Date(now).toISOString(),
      },
    });
    return {
      shareToken: workspace.shareToken,
      humanSessionToken,
      agentSessionToken,
      sessionInstanceId: randomUUID(),
      selfMemberId: memberId,
      expiresAt: new Date(workspace.expiresAt).toISOString(),
      protocolVersion: DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
      surface: this.surface(workspace),
    };
  }

  private bootstrapPath(bundle: DocumentSessionBundleV3): string {
    const encoded = Buffer.from(JSON.stringify(bundle), "utf8").toString("base64url");
    return `/document/${bundle.shareToken}#ratiflow-bootstrap=${encoded}`;
  }

  private resolveSession(token: string): ResolvedSession | null {
    this.cleanupExpired();
    if (typeof token !== "string" || token.length < 32) return null;
    const session = this.sessions.get(token);
    if (!session || session.protocolVersion !== DOCUMENT_WORKSPACE_PROTOCOL_VERSION) return null;
    const workspace = this.workspaces.get(session.documentId);
    const member = workspace?.members.get(session.memberId);
    if (!workspace || !member || session.expiresAt <= this.now()) {
      this.sessions.delete(token);
      return null;
    }
    return { workspace, session, member };
  }

  private authorize(token: string, actor: SessionActor): ResolvedSession | null {
    const resolved = this.resolveSession(token);
    return resolved?.session.actorType === actor ? resolved : null;
  }

  private cleanupExpired(): void {
    const now = this.now();
    for (const [documentId, workspace] of this.workspaces) {
      if (workspace.expiresAt <= now) this.removeWorkspace(documentId);
    }
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }

  private removeWorkspace(documentId: string): void {
    const workspace = this.workspaces.get(documentId);
    if (workspace) this.documentIdsByShareToken.delete(workspace.shareToken);
    this.workspaces.delete(documentId);
    this.listeners.delete(documentId);
    for (const [token, session] of this.sessions) {
      if (session.documentId === documentId) this.sessions.delete(token);
    }
  }

  private notFound(): DocumentV3Failure {
    return failure("NOT_FOUND", "This note is no longer available.", false, {
      nextAction: "Create a new note.",
    });
  }

  private validateDisplayName(value: unknown): DocumentV3Failure | null {
    if (value === undefined) return null;
    if (!boundedText(value, DISPLAY_NAME_MAX_LENGTH, false)) {
      return failure("INVALID_INPUT", "Display name must be 1–80 characters.");
    }
    return null;
  }

  private validCreateInput(input: unknown): input is CreateDocumentWorkOrderInput {
    if (!hasExactKeys(input, [
      "expectedRevision",
      "requestId",
      "source",
      "intent",
      "instruction",
      "assignedToMemberId",
      "targetField",
      "rangeStart",
      "rangeEnd",
    ])) return false;
    return isCounter(input.expectedRevision)
      && isUuid(input.requestId)
      && ["SELECTION_AFFORDANCE", "CONTEXT_MENU", "KEYBOARD"].includes(String(input.source))
      && ["REWRITE", "RESEARCH", "CUSTOM"].includes(String(input.intent))
      && boundedText(input.instruction, DOCUMENT_WORK_INSTRUCTION_MAX_LENGTH, false)
      && isUuid(input.assignedToMemberId)
      && (input.targetField === "TITLE" || input.targetField === "BODY")
      && isCounter(input.rangeStart)
      && isCounter(input.rangeEnd);
  }

  private validPresence(input: unknown, document: SharedDocumentV3): input is TouchDocumentPresenceInput {
    if (!hasExactKeys(input, [
      "state",
      "field",
      "isTyping",
      "selectionStart",
      "selectionEnd",
      "observedRevision",
    ])) return false;
    if (!["VIEWING", "EDITING", "IDLE"].includes(String(input.state))
      || !(input.field === null || input.field === "TITLE" || input.field === "BODY")
      || typeof input.isTyping !== "boolean"
      || !isCounter(input.observedRevision)
      || input.observedRevision > document.revision) return false;
    if (input.field === null) {
      return input.selectionStart === null && input.selectionEnd === null && !input.isTyping;
    }
    if (!isCounter(input.selectionStart) || !isCounter(input.selectionEnd)
      || input.selectionStart > input.selectionEnd) return false;
    const fieldLength = pointLength(input.field === "TITLE" ? document.title : document.body);
    return input.selectionEnd <= fieldLength;
  }

  private isActive(order: DocumentWorkOrder): boolean {
    return order.status === "PENDING" || order.status === "PROPOSED";
  }

  private surface(workspace: StoredWorkspace): DocumentSurfaceV3 {
    const active = workspace.workOrders.filter((order) => this.isActive(order));
    const terminal = workspace.workOrders
      .filter((order) => !this.isActive(order))
      .sort(compareTerminalNewest)
      .slice(0, DOCUMENT_WORKSPACE_TERMINAL_HISTORY_LIMIT);
    return clone({
      document: workspace.document,
      presence: this.currentPresence(workspace),
      workOrders: [...active, ...terminal].sort(compareWork),
      memory: workspace.events.slice(-DOCUMENT_MEMORY_DEFAULT_LIMIT),
    });
  }

  private currentPresence(workspace: StoredWorkspace): DocumentPresence[] {
    const now = this.now();
    for (const [memberId, stored] of workspace.presence) {
      if (now - stored.lastSeenMs > this.presenceTtlMs) workspace.presence.delete(memberId);
    }
    return [...workspace.presence.values()]
      .map((stored) => stored.value)
      .sort((left, right) => left.displayName.localeCompare(right.displayName)
        || left.memberId.localeCompare(right.memberId));
  }

  private myWork(resolved: ResolvedSession): ListMyWorkOutcome {
    return {
      workOrders: clone(resolved.workspace.workOrders
        .filter((order): order is PendingDocumentWorkOrder =>
          order.status === "PENDING" && order.assignedToMemberId === resolved.member.memberId)
        .sort(compareWork)
        .slice(0, DOCUMENT_MEMBER_ACTIVE_WORK_LIMIT)),
      revision: resolved.workspace.document.revision,
      activityVersion: resolved.workspace.document.activityVersion,
    };
  }

  private expectedRevision(
    workspace: StoredWorkspace,
    expectedRevision: number,
  ): StaleDocumentV3Failure | null {
    if (expectedRevision === workspace.document.revision) return null;
    return {
      ok: false,
      code: "STALE_WORK_STATE",
      message: "The document changed after this operation was prepared.",
      retryable: true,
      expectedRevision,
      currentRevision: workspace.document.revision,
      currentActivityVersion: workspace.document.activityVersion,
      currentDocument: clone(workspace.document),
      nextAction: "Re-inspect the document and work, then retry against the current revision.",
    };
  }

  private replay<T>(
    workspace: StoredWorkspace,
    operation: string,
    requestId: string,
    input: unknown,
  ): DocumentV3Result<T> | null {
    const existing = workspace.ledger.get(requestId);
    if (!existing) return null;
    if (existing.operation !== operation || existing.fingerprint !== canonical(input)) {
      return failure("REQUEST_REPLAY_MISMATCH", "This request ID was already used with different input.");
    }
    return clone(existing.result) as DocumentV3Result<T>;
  }

  private recordReplay<T>(
    workspace: StoredWorkspace,
    operation: string,
    requestId: string,
    input: unknown,
    result: DocumentV3Result<T>,
  ): void {
    workspace.ledger.set(requestId, {
      operation,
      fingerprint: canonical(input),
      result: clone(result) as DocumentV3Result<unknown>,
    });
  }

  private rebaseActiveOrders(
    workspace: StoredWorkspace,
    splices: Record<DocumentField, Splice | null>,
    nextRevision: number,
    excludedWorkOrderId?: string,
  ): string[] {
    const staled: string[] = [];
    const resolvedAt = new Date(this.now()).toISOString();
    workspace.workOrders = workspace.workOrders.map((order): DocumentWorkOrder => {
      if (!this.isActive(order) || order.workOrderId === excludedWorkOrderId) return order;
      const splice = splices[order.anchor.field];
      let rangeStart = order.anchor.rangeStart;
      let rangeEnd = order.anchor.rangeEnd;
      if (splice) {
        if (rangeEnd <= splice.start) {
          // Before the splice, including an endpoint exactly at an insertion.
        } else if (rangeStart >= splice.end) {
          const delta = splice.replacementLength - (splice.end - splice.start);
          rangeStart += delta;
          rangeEnd += delta;
        } else {
          staled.push(order.workOrderId);
          return {
            ...order,
            status: "STALE",
            updatedAt: resolvedAt,
            resolvedAt,
            decision: null,
          };
        }
      }
      return {
        ...order,
        anchor: {
          ...order.anchor,
          rangeStart,
          rangeEnd,
          anchorRevision: nextRevision,
          selectedText: selectedText(workspace.document, order.anchor.field, rangeStart, rangeEnd),
        },
        updatedAt: resolvedAt,
      };
    });
    return staled.sort();
  }

  private event(
    workspace: StoredWorkspace,
    values: Pick<DocumentMemoryEvent,
      "kind" | "actor" | "origin" | "baseRevision" | "resultRevision">
      & Partial<Omit<DocumentMemoryEvent,
        "kind" | "actor" | "origin" | "baseRevision" | "resultRevision" | "activityVersion">>,
  ): DocumentMemoryEvent {
    return {
      eventId: values.eventId ?? randomUUID(),
      activityVersion: workspace.document.activityVersion,
      kind: values.kind,
      actor: values.actor,
      origin: values.origin,
      baseRevision: values.baseRevision,
      resultRevision: values.resultRevision,
      workOrderId: values.workOrderId ?? null,
      linkedWorkOrderIds: [...(values.linkedWorkOrderIds ?? [])].sort(),
      changedFields: values.changedFields ?? [],
      targetExcerpt: values.targetExcerpt ?? null,
      instructionExcerpt: values.instructionExcerpt ?? null,
      proposalExcerpt: values.proposalExcerpt ?? null,
      changeSummary: values.changeSummary ?? null,
      diffs: values.diffs ?? [],
      rationale: values.rationale ?? null,
      createdAt: values.createdAt ?? new Date(this.now()).toISOString(),
    };
  }

  private notify(documentId: string): void {
    for (const listener of this.listeners.get(documentId) ?? []) listener();
  }

  private waitForNotification(
    documentId: string,
    _afterActivityVersion: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(documentId) ?? new Set<() => void>();
      this.listeners.set(documentId, listeners);
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        listeners.delete(onChange);
        if (listeners.size === 0) this.listeners.delete(documentId);
        signal?.removeEventListener("abort", onAbort);
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onChange = () => settle(resolve);
      const onAbort = () => settle(() => reject(
        signal?.reason instanceof DOMException && signal.reason.name === "AbortError"
          ? signal.reason
          : new DOMException(
            typeof signal?.reason === "string" ? signal.reason : "Operation cancelled",
            "AbortError",
          ),
      ));
      const timer = setTimeout(() => settle(resolve), Math.max(0, timeoutMs));
      listeners.add(onChange);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
