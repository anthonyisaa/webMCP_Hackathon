import {
  DOCUMENT_ACTION_PRESETS,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_STAGE_PREPARATIONS,
  DOCUMENT_STAGES,
  type ApplyAgentAnnotationInput,
  type ApplyAgentAnnotationOutcome,
  type CancelDocumentAnnotationInput,
  type CompletedDocumentAnnotation,
  type CreateDocumentAnnotationInput,
  type DocumentAnnotation,
  type DocumentResult,
  type DocumentServicePort,
  type DocumentSessionBundle,
  type DocumentSurface,
  type JoinDocumentInput,
  type LaunchDocumentInput,
  type PendingDocumentAnnotation,
  type SaveDocumentInput,
  type SetDocumentStageInput,
  type TouchDocumentPresenceInput,
  type UndoAgentEditInput,
} from "@/document/contracts";

import {
  RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV,
  RATIFLOW_SUPABASE_URL_ENV,
} from "./ratiflow-supabase-service";

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;
type Guard<T> = (value: unknown) => value is T;

export type SupabaseDocumentServiceOptions = {
  url: string;
  publishableKey: string;
  fetch?: FetchLike;
};

const STAGES = new Set<string>(DOCUMENT_STAGES);
const ERROR_CODES = new Set<string>(DOCUMENT_ERROR_CODES);
const HUMAN_PRESET_IDS = new Set<string>([
  ...Object.values(DOCUMENT_ACTION_PRESETS).flatMap((presets) =>
    presets.map(({ presetId }) => presetId)
  ),
  "custom",
]);
const PREPARATION_PRESETS = new Map<string, string>(
  Object.entries(DOCUMENT_STAGE_PREPARATIONS).map(([stage, preset]) => [
    preset.presetId,
    stage,
  ]),
);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is JsonObject {
  return isObject(value)
    && required.every((key) => key in value)
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isLastEditor(value: unknown): boolean {
  return value === null || (
    hasExactKeys(value, ["memberId", "displayName", "actorType", "origin"])
    && isUuid(value.memberId)
    && isNonemptyString(value.displayName)
    && ["HUMAN", "AGENT"].includes(String(value.actorType))
    && ["ORDINARY_UI", "WEBMCP"].includes(String(value.origin))
  );
}

function isSharedDocument(value: unknown): boolean {
  return hasExactKeys(
    value,
    ["id", "title", "body", "stage", "revision", "updatedAt", "lastEditor"],
  )
    && isUuid(value.id)
    && typeof value.title === "string"
    && codePointLength(value.title) <= 160
    && typeof value.body === "string"
    && codePointLength(value.body) <= 50_000
    && STAGES.has(String(value.stage))
    && isNonnegativeInteger(value.revision)
    && isTimestamp(value.updatedAt)
    && isLastEditor(value.lastEditor);
}

function isPresence(value: unknown): boolean {
  if (!hasExactKeys(value, [
    "memberId",
    "displayName",
    "color",
    "state",
    "field",
    "isTyping",
    "selectionStart",
    "selectionEnd",
    "observedRevision",
    "lastSeenAt",
  ])) return false;
  const validSelection = value.selectionStart === null && value.selectionEnd === null
    || isNonnegativeInteger(value.selectionStart)
      && isNonnegativeInteger(value.selectionEnd)
      && value.selectionStart <= value.selectionEnd;
  return isUuid(value.memberId)
    && isNonemptyString(value.displayName)
    && /^#[0-9A-F]{6}$/.test(String(value.color))
    && ["VIEWING", "EDITING", "IDLE"].includes(String(value.state))
    && (value.field === null || ["TITLE", "BODY"].includes(String(value.field)))
    && typeof value.isTyping === "boolean"
    && validSelection
    && isNonnegativeInteger(value.observedRevision)
    && isTimestamp(value.lastSeenAt);
}

function isCreatedBy(value: unknown): boolean {
  return hasExactKeys(value, ["memberId", "displayName"])
    && isUuid(value.memberId)
    && isNonemptyString(value.displayName);
}

function isTransition(value: unknown): boolean {
  return hasExactKeys(value, ["fromStage", "toStage"])
    && STAGES.has(String(value.fromStage))
    && ["RESEARCHING", "REFINE", "READY_TO_SHIP"].includes(String(value.toStage));
}

function isDocumentAnnotation(value: unknown): value is DocumentAnnotation {
  if (!hasExactKeys(value, [
    "annotationId",
    "kind",
    "presetId",
    "label",
    "instruction",
    "stageAtCreation",
    "source",
    "targetField",
    "targetKind",
    "rangeStart",
    "rangeEnd",
    "selectedText",
    "createdRevision",
    "anchorRevision",
    "status",
    "createdBy",
    "createdAt",
    "transition",
  ], ["resolvedAt", "resolvedRevision"])) return false;

  const hasValidLifecycle = value.status === "PENDING"
    ? !("resolvedAt" in value) && !("resolvedRevision" in value)
    : ["COMPLETED", "CANCELLED", "STALE"].includes(String(value.status))
      && isTimestamp(value.resolvedAt)
      && isNonnegativeInteger(value.resolvedRevision);
  const isHumanRequest = value.kind === "HUMAN_REQUEST"
    && HUMAN_PRESET_IDS.has(String(value.presetId))
    && ["ANNOTATION_RAIL", "KEYBOARD"].includes(String(value.source))
    && value.transition === null;
  const preparationStage = PREPARATION_PRESETS.get(String(value.presetId));
  const isStagePreparation = value.kind === "STAGE_PREPARATION"
    && preparationStage !== undefined
    && value.source === "STAGE_TRANSITION"
    && isTransition(value.transition)
    && isObject(value.transition)
    && value.transition.toStage === preparationStage;

  return isUuid(value.annotationId)
    && (isHumanRequest || isStagePreparation)
    && isNonemptyString(value.label)
    && codePointLength(String(value.label)) <= 80
    && isNonemptyString(value.instruction)
    && codePointLength(String(value.instruction)) <= 500
    && STAGES.has(String(value.stageAtCreation))
    && ["TITLE", "BODY"].includes(String(value.targetField))
    && ["SELECTION", "CARET", "DOCUMENT"].includes(String(value.targetKind))
    && isNonnegativeInteger(value.rangeStart)
    && isNonnegativeInteger(value.rangeEnd)
    && value.rangeStart <= value.rangeEnd
    && typeof value.selectedText === "string"
    && codePointLength(value.selectedText) === value.rangeEnd - value.rangeStart
    && isNonnegativeInteger(value.createdRevision)
    && isNonnegativeInteger(value.anchorRevision)
    && value.createdRevision <= value.anchorRevision
    && isCreatedBy(value.createdBy)
    && isTimestamp(value.createdAt)
    && hasValidLifecycle;
}

function isPendingAnnotation(value: unknown): value is PendingDocumentAnnotation {
  return isDocumentAnnotation(value) && value.status === "PENDING";
}

function isCompletedAnnotation(value: unknown): value is CompletedDocumentAnnotation {
  return isDocumentAnnotation(value) && value.status === "COMPLETED";
}

function isUndoAgentEdit(value: unknown): boolean {
  return value === null || (
    hasExactKeys(value, ["agentRevision", "previousTitle", "previousBody"])
    && isNonnegativeInteger(value.agentRevision)
    && typeof value.previousTitle === "string"
    && codePointLength(value.previousTitle) <= 160
    && typeof value.previousBody === "string"
    && codePointLength(value.previousBody) <= 50_000
  );
}

export function isDocumentSurface(value: unknown): value is DocumentSurface {
  return hasExactKeys(value, ["document", "presence", "annotations", "undoAgentEdit"])
    && isSharedDocument(value.document)
    && Array.isArray(value.presence)
    && value.presence.every(isPresence)
    && Array.isArray(value.annotations)
    && value.annotations.every(isDocumentAnnotation)
    && isUndoAgentEdit(value.undoAgentEdit);
}

function isDocumentSessionBundle(value: unknown): value is DocumentSessionBundle {
  return hasExactKeys(value, [
    "shareToken",
    "humanSessionToken",
    "agentSessionToken",
    "sessionInstanceId",
    "selfMemberId",
    "expiresAt",
    "surface",
  ])
    && typeof value.shareToken === "string"
    && /^[0-9a-f]{64}$/.test(value.shareToken)
    && typeof value.humanSessionToken === "string"
    && /^[0-9a-f]{64}$/.test(value.humanSessionToken)
    && typeof value.agentSessionToken === "string"
    && /^[0-9a-f]{64}$/.test(value.agentSessionToken)
    && isUuid(value.sessionInstanceId)
    && isUuid(value.selfMemberId)
    && isTimestamp(value.expiresAt)
    && isDocumentSurface(value.surface);
}

function isFailure(value: unknown): boolean {
  if (!isObject(value) || value.ok !== false || !ERROR_CODES.has(String(value.code))) {
    return false;
  }
  if (value.code === "STALE_WORK_STATE") {
    return hasExactKeys(value, [
      "ok",
      "code",
      "message",
      "retryable",
      "currentSurface",
      "expectedRevision",
      "actualRevision",
      "nextAction",
    ])
      && typeof value.message === "string"
      && value.retryable === true
      && isDocumentSurface(value.currentSurface)
      && isNonnegativeInteger(value.expectedRevision)
      && isNonnegativeInteger(value.actualRevision)
      && typeof value.nextAction === "string";
  }
  return hasExactKeys(
    value,
    ["ok", "code", "message", "retryable"],
    ["currentSurface", "nextAction"],
  )
    && typeof value.message === "string"
    && typeof value.retryable === "boolean"
    && (!("currentSurface" in value) || isDocumentSurface(value.currentSurface))
    && (!("nextAction" in value) || typeof value.nextAction === "string");
}

function isApplyAgentAnnotationOutcome(value: unknown): value is ApplyAgentAnnotationOutcome {
  if (!hasExactKeys(value, ["surface", "annotation", "change", "undoAvailable"])
    || !isDocumentSurface(value.surface)
    || !isCompletedAnnotation(value.annotation)
    || typeof value.undoAvailable !== "boolean"
    || !hasExactKeys(
      value.change,
      ["summary", "fromRevision", "toRevision", "annotationId"],
    )) return false;
  return isNonemptyString(value.change.summary)
    && codePointLength(value.change.summary) <= 240
    && isNonnegativeInteger(value.change.fromRevision)
    && isNonnegativeInteger(value.change.toRevision)
    && value.change.fromRevision <= value.change.toRevision
    && value.change.annotationId === value.annotation.annotationId;
}

export function normalizeDocumentResult<T>(
  value: unknown,
  isData: Guard<T>,
): DocumentResult<T> {
  if (isFailure(value)) return value as unknown as DocumentResult<T>;
  if (!hasExactKeys(value, ["ok", "data"]) || value.ok !== true || !isData(value.data)) {
    throw new Error("Supabase RPC returned an invalid document result.");
  }
  return value as unknown as DocumentResult<T>;
}

export function normalizeDocumentSurfaceResult(
  value: unknown,
): DocumentResult<DocumentSurface> {
  return normalizeDocumentResult(value, isDocumentSurface);
}

export function normalizeDocumentSessionResult(
  value: unknown,
): DocumentResult<DocumentSessionBundle> {
  return normalizeDocumentResult(value, isDocumentSessionBundle);
}

export function normalizeDocumentAnnotationListResult(
  value: unknown,
): DocumentResult<PendingDocumentAnnotation[]> {
  return normalizeDocumentResult(
    value,
    (data): data is PendingDocumentAnnotation[] =>
      Array.isArray(data) && data.every(isPendingAnnotation),
  );
}

export function normalizeApplyAgentAnnotationResult(
  value: unknown,
): DocumentResult<ApplyAgentAnnotationOutcome> {
  return normalizeDocumentResult(value, isApplyAgentAnnotationOutcome);
}

export class SupabaseDocumentService implements DocumentServicePort {
  private readonly endpoint: string;
  private readonly publishableKey: string;
  private readonly request: FetchLike;

  constructor({ url, publishableKey, fetch: fetchOverride }: SupabaseDocumentServiceOptions) {
    if (!/^https:\/\//.test(url) || !publishableKey) {
      throw new Error("A HTTPS Supabase URL and publishable key are required.");
    }
    this.endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc`;
    this.publishableKey = publishableKey;
    this.request = fetchOverride ?? fetch;
  }

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): SupabaseDocumentService | undefined {
    const url = environment[RATIFLOW_SUPABASE_URL_ENV];
    const publishableKey = environment[RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV];
    return url && publishableKey
      ? new SupabaseDocumentService({ url, publishableKey })
      : undefined;
  }

  async launch(
    input: LaunchDocumentInput = {},
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>> {
    return normalizeDocumentSessionResult(await this.rpc(
      "ratiflow_document_launch_v2",
      { p_input: input },
      signal,
    ));
  }

  async join(
    input: JoinDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>> {
    const { shareToken, ...joinInput } = input as JoinDocumentInput & JsonObject;
    return normalizeDocumentSessionResult(await this.rpc(
      "ratiflow_document_join_v2",
      { p_share_token: shareToken, p_input: joinInput },
      signal,
    ));
  }

  async inspect(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return normalizeDocumentSurfaceResult(await this.rpc(
      "ratiflow_document_inspect_v2",
      { p_handle: sessionToken },
      signal,
    ));
  }

  async listAgentAnnotations(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentResult<PendingDocumentAnnotation[]>> {
    return normalizeDocumentAnnotationListResult(await this.rpc(
      "ratiflow_document_list_agent_annotations_v2",
      { p_handle: sessionToken },
      signal,
    ));
  }

  async saveHuman(
    sessionToken: string,
    input: SaveDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return this.mutateSurface(
      "ratiflow_document_save_human_v2", sessionToken, input, signal,
    );
  }

  async setStage(
    sessionToken: string,
    input: SetDocumentStageInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return this.mutateSurface(
      "ratiflow_document_set_stage_v2", sessionToken, input, signal,
    );
  }

  async createAnnotation(
    sessionToken: string,
    input: CreateDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return this.mutateSurface(
      "ratiflow_document_create_annotation_v2", sessionToken, input, signal,
    );
  }

  async cancelAnnotation(
    sessionToken: string,
    input: CancelDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return this.mutateSurface(
      "ratiflow_document_cancel_annotation_v2", sessionToken, input, signal,
    );
  }

  async applyAgentAnnotation(
    sessionToken: string,
    input: ApplyAgentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<ApplyAgentAnnotationOutcome>> {
    return normalizeApplyAgentAnnotationResult(await this.rpc(
      "ratiflow_document_apply_agent_annotation_v2",
      { p_handle: sessionToken, p_input: input },
      signal,
    ));
  }

  async undoAgentEdit(
    sessionToken: string,
    input: UndoAgentEditInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return this.mutateSurface(
      "ratiflow_document_undo_agent_edit_v2", sessionToken, input, signal,
    );
  }

  async touchPresence(
    sessionToken: string,
    input: TouchDocumentPresenceInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return this.mutateSurface(
      "ratiflow_document_touch_presence_v2", sessionToken, input, signal,
    );
  }

  private async mutateSurface(
    rpcName: string,
    sessionToken: string,
    input: object,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    return normalizeDocumentSurfaceResult(await this.rpc(
      rpcName,
      { p_handle: sessionToken, p_input: input },
      signal,
    ));
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
    if (!response.ok) {
      throw new Error(`Supabase RPC ${name} failed (${response.status}).`);
    }
    return value;
  }
}
