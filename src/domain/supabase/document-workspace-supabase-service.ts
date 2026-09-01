import {
  DOCUMENT_V3_ERROR_CODES,
  type CancelDocumentWorkOrderInput,
  type CreateDocumentWorkOrderInput,
  type DecideWorkProposalInput,
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
  type ReadDocumentMemoryInput,
  type ReadDocumentMemoryOutcome,
  type ResetDocumentHeroOutcome,
  type SaveDocumentInput,
  type SharedDocumentV3,
  type SubmitWorkProposalOutcome,
  type SubmitWorkProposalServiceInput,
  type TouchDocumentPresenceInput,
  type WaitForMyWorkInput,
  type WaitForMyWorkOutcome,
} from "@/document/contracts";

import {
  RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV,
  RATIFLOW_SUPABASE_URL_ENV,
} from "./ratiflow-supabase-service";

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;
type Guard<T> = (value: unknown) => value is T;

export const RATIFLOW_SUPABASE_SERVICE_ROLE_KEY_ENV = "RATIFLOW_SUPABASE_SERVICE_ROLE_KEY";

export type SupabaseDocumentWorkspaceServiceOptions = {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string;
  fetch?: FetchLike;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^(?:[0-9a-f]{64}|[A-Za-z0-9_-]{32,128})$/;
const ERROR_CODES = new Set<string>(DOCUMENT_V3_ERROR_CODES);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is JsonObject {
  return isObject(value)
    && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function counter(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function bounded(value: unknown, max: number, nonblank = false): value is string {
  return typeof value === "string"
    && Array.from(value).length <= max
    && (!nonblank || value.trim().length > 0);
}

function isDocument(value: unknown): value is SharedDocumentV3 {
  return exact(value, [
    "id", "protocolVersion", "title", "body", "revision", "activityVersion",
    "updatedAt", "lastEditor",
  ])
    && uuid(value.id)
    && value.protocolVersion === 3
    && bounded(value.title, 160)
    && bounded(value.body, 50_000)
    && counter(value.revision)
    && counter(value.activityVersion)
    && timestamp(value.updatedAt)
    && (value.lastEditor === null || (
      exact(value.lastEditor, ["displayName", "actorType", "origin"])
      && bounded(value.lastEditor.displayName, 120, true)
      && ["HUMAN", "AGENT"].includes(String(value.lastEditor.actorType))
      && ["ORDINARY_UI", "WEBMCP"].includes(String(value.lastEditor.origin))
    ));
}

function isPresence(value: unknown): value is DocumentPresence {
  if (!exact(value, [
    "memberId", "displayName", "color", "state", "field", "isTyping",
    "selectionStart", "selectionEnd", "observedRevision", "lastSeenAt",
  ])) return false;
  const selection = value.selectionStart === null && value.selectionEnd === null
    || counter(value.selectionStart) && counter(value.selectionEnd)
      && value.selectionStart <= value.selectionEnd;
  return uuid(value.memberId)
    && bounded(value.displayName, 80, true)
    && /^#[0-9A-F]{6}$/i.test(String(value.color))
    && ["VIEWING", "EDITING", "IDLE"].includes(String(value.state))
    && (value.field === null || ["TITLE", "BODY"].includes(String(value.field)))
    && typeof value.isTyping === "boolean"
    && selection
    && counter(value.observedRevision)
    && timestamp(value.lastSeenAt);
}

function isProposal(value: unknown): boolean {
  return exact(value, [
    "replacementText", "changeSummary", "basedOnRevision", "proposedBy", "proposedAt",
  ])
    && bounded(value.replacementText, 50_000)
    && bounded(value.changeSummary, 240, true)
    && counter(value.basedOnRevision)
    && exact(value.proposedBy, ["displayName", "actorType"])
    && bounded(value.proposedBy.displayName, 120, true)
    && value.proposedBy.actorType === "AGENT"
    && timestamp(value.proposedAt);
}

function isDecision(value: unknown, kind: "ACCEPTED" | "REJECTED"): boolean {
  return exact(value, [
    "kind", "rationale", "decidedBy", "decidedAt", "decisionRevision", "resultRevision",
  ])
    && value.kind === kind
    && bounded(value.rationale, 500, true)
    && exact(value.decidedBy, ["memberId", "displayName"])
    && uuid(value.decidedBy.memberId)
    && bounded(value.decidedBy.displayName, 80, true)
    && timestamp(value.decidedAt)
    && counter(value.decisionRevision)
    && counter(value.resultRevision)
    && (kind === "ACCEPTED"
      ? value.resultRevision === value.decisionRevision + 1
      : value.resultRevision === value.decisionRevision);
}

function isWorkOrder(value: unknown): value is DocumentWorkOrder {
  if (!exact(value, [
    "workOrderId", "intent", "source", "instruction", "anchor",
    "creatorMemberId", "creatorDisplayName", "assignedToMemberId",
    "assignedToDisplayName", "createdAt", "updatedAt", "status", "proposal",
    "decision", "resolvedAt",
  ])) return false;
  if (!uuid(value.workOrderId)
    || !["REWRITE", "RESEARCH", "CUSTOM"].includes(String(value.intent))
    || !["SELECTION_AFFORDANCE", "CONTEXT_MENU", "KEYBOARD"].includes(String(value.source))
    || !bounded(value.instruction, 500, true)
    || !exact(value.anchor, [
      "field", "rangeStart", "rangeEnd", "selectedText", "createdRevision", "anchorRevision",
    ])
    || !["TITLE", "BODY"].includes(String(value.anchor.field))
    || !counter(value.anchor.rangeStart) || !counter(value.anchor.rangeEnd)
    || value.anchor.rangeStart >= value.anchor.rangeEnd
    || typeof value.anchor.selectedText !== "string"
    || Array.from(value.anchor.selectedText).length !== value.anchor.rangeEnd - value.anchor.rangeStart
    || !counter(value.anchor.createdRevision) || !counter(value.anchor.anchorRevision)
    || value.anchor.createdRevision > value.anchor.anchorRevision
    || !uuid(value.creatorMemberId) || !bounded(value.creatorDisplayName, 80, true)
    || !uuid(value.assignedToMemberId) || !bounded(value.assignedToDisplayName, 80, true)
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return false;
  if (value.status === "PENDING") {
    return value.proposal === null && value.decision === null && value.resolvedAt === null;
  }
  if (value.status === "PROPOSED") {
    return isProposal(value.proposal) && value.decision === null && value.resolvedAt === null;
  }
  if (value.status === "COMPLETED") {
    return isProposal(value.proposal) && isDecision(value.decision, "ACCEPTED")
      && timestamp(value.resolvedAt);
  }
  if (value.status === "REJECTED") {
    return isProposal(value.proposal) && isDecision(value.decision, "REJECTED")
      && timestamp(value.resolvedAt);
  }
  if (value.status === "CANCELLED") {
    return value.proposal === null && value.decision === null && timestamp(value.resolvedAt);
  }
  return value.status === "STALE"
    && (value.proposal === null || isProposal(value.proposal))
    && value.decision === null && timestamp(value.resolvedAt);
}

function isDiff(value: unknown): boolean {
  return exact(value, ["field", "rangeStart", "rangeEnd", "beforeExcerpt", "afterExcerpt"])
    && ["TITLE", "BODY"].includes(String(value.field))
    && counter(value.rangeStart) && counter(value.rangeEnd)
    && value.rangeStart <= value.rangeEnd
    && bounded(value.beforeExcerpt, 320) && bounded(value.afterExcerpt, 320);
}

function isEvent(value: unknown): value is DocumentMemoryEvent {
  return exact(value, [
    "eventId", "activityVersion", "kind", "actor", "origin", "baseRevision",
    "resultRevision", "workOrderId", "linkedWorkOrderIds", "changedFields",
    "targetExcerpt", "instructionExcerpt", "proposalExcerpt", "changeSummary",
    "diffs", "rationale", "createdAt",
  ])
    && uuid(value.eventId) && counter(value.activityVersion) && value.activityVersion >= 1
    && [
      "DOCUMENT_EDITED", "WORK_CREATED", "PROPOSAL_SUBMITTED", "PROPOSAL_ACCEPTED",
      "PROPOSAL_REJECTED", "WORK_CANCELLED", "WORK_STALE",
    ].includes(String(value.kind))
    && exact(value.actor, ["displayName", "actorType"])
    && bounded(value.actor.displayName, 120, true)
    && ["HUMAN", "AGENT", "SYSTEM"].includes(String(value.actor.actorType))
    && ["ORDINARY_UI", "WEBMCP", "SYSTEM"].includes(String(value.origin))
    && counter(value.baseRevision) && counter(value.resultRevision)
    && (value.workOrderId === null || uuid(value.workOrderId))
    && Array.isArray(value.linkedWorkOrderIds) && value.linkedWorkOrderIds.every(uuid)
    && Array.isArray(value.changedFields)
    && value.changedFields.every((field) => field === "TITLE" || field === "BODY")
    && (value.targetExcerpt === null || bounded(value.targetExcerpt, 320))
    && (value.instructionExcerpt === null || bounded(value.instructionExcerpt, 320))
    && (value.proposalExcerpt === null || bounded(value.proposalExcerpt, 320))
    && (value.changeSummary === null || bounded(value.changeSummary, 240, true))
    && Array.isArray(value.diffs) && value.diffs.every(isDiff)
    && (value.rationale === null || bounded(value.rationale, 500, true))
    && timestamp(value.createdAt);
}

export function isDocumentWorkspaceSurface(value: unknown): value is DocumentSurfaceV3 {
  return exact(value, ["document", "presence", "workOrders", "memory"])
    && isDocument(value.document)
    && Array.isArray(value.presence) && value.presence.every(isPresence)
    && Array.isArray(value.workOrders) && value.workOrders.every(isWorkOrder)
    && Array.isArray(value.memory) && value.memory.every(isEvent);
}

function isFailure(value: unknown): value is DocumentV3Failure {
  if (!isObject(value) || value.ok !== false || !ERROR_CODES.has(String(value.code))) return false;
  const common = typeof value.message === "string" && typeof value.retryable === "boolean";
  if (!common) return false;
  if (value.code === "STALE_WORK_STATE") {
    return exact(value, [
      "ok", "code", "message", "retryable", "expectedRevision", "currentRevision",
      "currentActivityVersion", "currentDocument", "nextAction",
    ])
      && value.retryable === true && counter(value.expectedRevision)
      && counter(value.currentRevision) && counter(value.currentActivityVersion)
      && isDocument(value.currentDocument)
      && value.nextAction === "Re-inspect the document and work, then retry against the current revision.";
  }
  return exact(value, ["ok", "code", "message", "retryable"], [
    "currentRevision", "currentActivityVersion", "currentWorkOrder", "nextAction",
  ])
    && (!Object.hasOwn(value, "currentRevision") || counter(value.currentRevision))
    && (!Object.hasOwn(value, "currentActivityVersion") || counter(value.currentActivityVersion))
    && (!Object.hasOwn(value, "currentWorkOrder") || isWorkOrder(value.currentWorkOrder))
    && (!Object.hasOwn(value, "nextAction") || typeof value.nextAction === "string");
}

export function normalizeDocumentV3Result<T>(
  value: unknown,
  guard: Guard<T>,
): DocumentV3Result<T> {
  if (isFailure(value)) return value;
  if (!exact(value, ["ok", "data"]) || value.ok !== true || !guard(value.data)) {
    throw new Error("Supabase RPC returned an invalid protocol-v3 document result.");
  }
  return value as unknown as DocumentV3Result<T>;
}

function isSession(value: unknown): value is DocumentSessionBundleV3 {
  return exact(value, [
    "shareToken", "humanSessionToken", "agentSessionToken", "sessionInstanceId",
    "selfMemberId", "expiresAt", "protocolVersion", "surface",
  ])
    && typeof value.shareToken === "string" && TOKEN.test(value.shareToken)
    && typeof value.humanSessionToken === "string" && TOKEN.test(value.humanSessionToken)
    && typeof value.agentSessionToken === "string" && TOKEN.test(value.agentSessionToken)
    && uuid(value.sessionInstanceId) && uuid(value.selfMemberId)
    && timestamp(value.expiresAt) && value.protocolVersion === 3
    && isDocumentWorkspaceSurface(value.surface);
}

function isList(value: unknown): value is ListMyWorkOutcome {
  return exact(value, ["workOrders", "revision", "activityVersion"])
    && Array.isArray(value.workOrders)
    && value.workOrders.every((order) => isWorkOrder(order) && order.status === "PENDING")
    && counter(value.revision) && counter(value.activityVersion);
}

function isMemory(value: unknown): value is ReadDocumentMemoryOutcome {
  return exact(value, [
    "events", "hasMoreOlder", "nextBeforeActivityVersion", "latestActivityVersion", "revision",
  ])
    && Array.isArray(value.events) && value.events.every(isEvent)
    && typeof value.hasMoreOlder === "boolean"
    && (value.nextBeforeActivityVersion === null || counter(value.nextBeforeActivityVersion))
    && counter(value.latestActivityVersion) && counter(value.revision);
}

function isProposalOutcome(value: unknown): value is SubmitWorkProposalOutcome {
  return exact(value, ["workOrder", "document", "event"])
    && isWorkOrder(value.workOrder) && value.workOrder.status === "PROPOSED"
    && isDocument(value.document) && isEvent(value.event)
    && value.event.kind === "PROPOSAL_SUBMITTED";
}

function isReset(value: unknown): value is ResetDocumentHeroOutcome {
  return exact(value, [
    "shareToken", "mayaBootstrapPath", "jordanBootstrapPath", "expiresAt",
    "revision", "activityVersion",
  ])
    && typeof value.shareToken === "string" && TOKEN.test(value.shareToken)
    && typeof value.mayaBootstrapPath === "string"
    && typeof value.jordanBootstrapPath === "string"
    && value.mayaBootstrapPath.startsWith(`/document/${value.shareToken}#ratiflow-bootstrap=`)
    && value.jordanBootstrapPath.startsWith(`/document/${value.shareToken}#ratiflow-bootstrap=`)
    && timestamp(value.expiresAt) && value.revision === 1 && value.activityVersion === 1;
}

export class SupabaseDocumentWorkspaceService implements DocumentV3ServicePort {
  private readonly endpoint: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey?: string;
  private readonly request: FetchLike;

  constructor({
    url,
    publishableKey,
    serviceRoleKey,
    fetch: fetchOverride,
  }: SupabaseDocumentWorkspaceServiceOptions) {
    if (!/^https:\/\//.test(url) || !publishableKey) {
      throw new Error("A HTTPS Supabase URL and publishable key are required.");
    }
    this.endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc`;
    this.publishableKey = publishableKey;
    this.serviceRoleKey = serviceRoleKey;
    this.request = fetchOverride ?? fetch;
  }

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): SupabaseDocumentWorkspaceService | undefined {
    const url = environment[RATIFLOW_SUPABASE_URL_ENV];
    const publishableKey = environment[RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV];
    if (!url || !publishableKey) return undefined;
    return new SupabaseDocumentWorkspaceService({
      url,
      publishableKey,
      serviceRoleKey: environment[RATIFLOW_SUPABASE_SERVICE_ROLE_KEY_ENV],
    });
  }

  async resetHeroForEvaluation(signal?: AbortSignal): Promise<DocumentV3Result<ResetDocumentHeroOutcome>> {
    if (!this.serviceRoleKey) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        message: "The service-role reset credential is not configured.",
        retryable: false,
      };
    }
    return normalizeDocumentV3Result(
      await this.rpc("ratiflow_reset_document_hero_v3", {}, signal, this.serviceRoleKey),
      isReset,
    );
  }

  async launchV3(input: LaunchDocumentV3Input = {}, signal?: AbortSignal) {
    return normalizeDocumentV3Result(
      await this.rpc("ratiflow_launch_document_v3", { p_input: input }, signal), isSession,
    );
  }

  async joinV3(input: JoinDocumentV3Input, signal?: AbortSignal) {
    const { shareToken, ...joinInput } = input as JoinDocumentV3Input & JsonObject;
    return normalizeDocumentV3Result(await this.rpc(
      "ratiflow_join_document_v3",
      { p_share_token: shareToken, p_input: joinInput },
      signal,
    ), isSession);
  }

  async inspect(sessionToken: string, signal?: AbortSignal) {
    return normalizeDocumentV3Result(await this.rpc(
      "ratiflow_inspect_document_v3", { p_handle: sessionToken }, signal,
    ), isDocumentWorkspaceSurface);
  }

  async saveHuman(sessionToken: string, input: SaveDocumentInput, signal?: AbortSignal) {
    return this.surfaceMutation("ratiflow_save_document_v3", sessionToken, input, signal);
  }

  async createWorkOrder(sessionToken: string, input: CreateDocumentWorkOrderInput, signal?: AbortSignal) {
    return this.surfaceMutation("ratiflow_create_document_work_v3", sessionToken, input, signal);
  }

  async cancelWorkOrder(sessionToken: string, input: CancelDocumentWorkOrderInput, signal?: AbortSignal) {
    return this.surfaceMutation("ratiflow_cancel_document_work_v3", sessionToken, input, signal);
  }

  async acceptWorkProposal(sessionToken: string, input: DecideWorkProposalInput, signal?: AbortSignal) {
    return this.surfaceMutation("ratiflow_accept_document_proposal_v3", sessionToken, input, signal);
  }

  async rejectWorkProposal(sessionToken: string, input: DecideWorkProposalInput, signal?: AbortSignal) {
    return this.surfaceMutation("ratiflow_reject_document_proposal_v3", sessionToken, input, signal);
  }

  async listMyWork(agentSessionToken: string, pageSessionId: string, signal?: AbortSignal) {
    if (!uuid(pageSessionId)) return this.invalidPage<ListMyWorkOutcome>();
    return normalizeDocumentV3Result(await this.rpc(
      "ratiflow_list_agent_work_v3", { p_handle: agentSessionToken }, signal,
    ), isList);
  }

  async readMemory(sessionToken: string, input: ReadDocumentMemoryInput, signal?: AbortSignal) {
    return normalizeDocumentV3Result(await this.rpc(
      "ratiflow_read_document_memory_v3", { p_handle: sessionToken, p_input: input }, signal,
    ), isMemory);
  }

  async waitForMyWork(
    _agentSessionToken: string,
    _input: WaitForMyWorkInput,
    pageSessionId: string,
    _signal?: AbortSignal,
  ): Promise<DocumentV3Result<WaitForMyWorkOutcome>> {
    if (_signal?.aborted) {
      throw _signal.reason instanceof DOMException && _signal.reason.name === "AbortError"
        ? _signal.reason
        : new DOMException("Operation cancelled", "AbortError");
    }
    if (!uuid(pageSessionId)) return this.invalidPage<WaitForMyWorkOutcome>();
    return {
      ok: false,
      code: "PROTOCOL_MISMATCH",
      message: "wait_for_my_work is page-local and must use the browser activity hub.",
      retryable: false,
      nextAction: "Use the WebMCP page executor for bounded waits.",
    };
  }

  async submitWorkProposal(
    agentSessionToken: string,
    input: SubmitWorkProposalServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ) {
    if (!uuid(pageSessionId)) return this.invalidPage<SubmitWorkProposalOutcome>();
    return normalizeDocumentV3Result(await this.rpc(
      "ratiflow_submit_document_proposal_v3",
      { p_handle: agentSessionToken, p_input: input },
      signal,
    ), isProposalOutcome);
  }

  async touchPresence(sessionToken: string, input: TouchDocumentPresenceInput, signal?: AbortSignal) {
    return this.surfaceMutation("ratiflow_touch_document_presence_v3", sessionToken, input, signal);
  }

  private invalidPage<T>(): DocumentV3Result<T> {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "A valid page-session UUID is required.",
      retryable: false,
    };
  }

  private async surfaceMutation(
    name: string,
    sessionToken: string,
    input: object,
    signal?: AbortSignal,
  ): Promise<DocumentV3Result<DocumentSurfaceV3>> {
    return normalizeDocumentV3Result(await this.rpc(
      name, { p_handle: sessionToken, p_input: input }, signal,
    ), isDocumentWorkspaceSurface);
  }

  private async rpc(
    name: string,
    body: JsonObject,
    signal?: AbortSignal,
    credential = this.publishableKey,
  ): Promise<unknown> {
    const response = await this.request(`${this.endpoint}/${name}`, {
      method: "POST",
      headers: {
        apikey: credential,
        Authorization: `Bearer ${credential}`,
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
