import { randomBytes, randomUUID } from "node:crypto";

import {
  DOCUMENT_ACTION_PRESETS,
  DOCUMENT_BODY_MAX_LENGTH,
  DOCUMENT_CHANGE_SUMMARY_MAX_LENGTH,
  DOCUMENT_CUSTOM_INSTRUCTION_MAX_LENGTH,
  DOCUMENT_MEMBER_PENDING_ANNOTATION_LIMIT,
  DOCUMENT_PENDING_ANNOTATION_LIMIT,
  DOCUMENT_RESOLVED_ANNOTATION_HISTORY_LIMIT,
  DOCUMENT_STAGE_PREPARATIONS,
  DOCUMENT_STAGES,
  DOCUMENT_TITLE_MAX_LENGTH,
  type ApplyAgentAnnotationInput,
  type ApplyAgentAnnotationOutcome,
  type CancelDocumentAnnotationInput,
  type CompletedDocumentAnnotation,
  type CreateDocumentAnnotationInput,
  type DocumentAnnotation,
  type DocumentFailure,
  type DocumentPresence,
  type DocumentResult,
  type DocumentServicePort,
  type DocumentSessionBundle,
  type DocumentStage,
  type DocumentSurface,
  type JoinDocumentInput,
  type LaunchDocumentInput,
  type PendingDocumentAnnotation,
  type SaveDocumentInput,
  type SetDocumentStageInput,
  type SharedDocument,
  type TouchDocumentPresenceInput,
  type UndoAgentEditInput,
} from "@/document/contracts";

type SessionActor = "HUMAN" | "AGENT";

type StoredMember = {
  memberId: string;
  displayName: string;
  color: string;
};

type StoredSession = {
  documentId: string;
  member: StoredMember;
  actorType: SessionActor;
  expiresAt: number;
};

type StoredPresence = {
  value: DocumentPresence;
  lastSeenMs: number;
};

type MutationLedgerEntry = {
  fingerprint: string;
  result: DocumentResult<unknown>;
};

type StoredDocument = {
  shareToken: string;
  document: SharedDocument;
  expiresAt: number;
  nextGuestNumber: number;
  members: Map<string, StoredMember>;
  presence: Map<string, StoredPresence>;
  annotations: DocumentAnnotation[];
  undoAgentEdit: DocumentSurface["undoAgentEdit"];
  requestLedger: Map<string, MutationLedgerEntry>;
};

type ResolvedSession = {
  storedDocument: StoredDocument;
  session: StoredSession;
};

type Splice = {
  start: number;
  end: number;
  replacementLength: number;
};

export type LocalDocumentServiceOptions = {
  sessionTtlMs?: number;
  presenceTtlMs?: number;
  now?: () => number;
};

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const DOCUMENT_PRESENCE_TTL_MS = 15_000;
const DISPLAY_NAME_MAX_LENGTH = 80;
const MEMBER_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#0f766e", "#c2410c", "#4f46e5"] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof DOMException && signal.reason.name === "AbortError") throw signal.reason;
  throw new DOMException(typeof signal.reason === "string" ? signal.reason : "Operation cancelled", "AbortError");
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

function codePoints(value: string): string[] {
  return Array.from(value);
}

function boundedText(value: unknown, maxLength: number, allowEmpty = true): value is string {
  return typeof value === "string"
    && codePoints(value).length <= maxLength
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

function compareCreated(left: DocumentAnnotation, right: DocumentAnnotation): number {
  return left.createdAt.localeCompare(right.createdAt)
    || left.annotationId.localeCompare(right.annotationId);
}

function invalidInput(message: string): DocumentFailure {
  return { ok: false, code: "INVALID_INPUT", message, retryable: false };
}

function unauthorized(message: string): DocumentFailure {
  return { ok: false, code: "UNAUTHORIZED", message, retryable: false };
}

function notFound(): DocumentFailure {
  return {
    ok: false,
    code: "NOT_FOUND",
    message: "This note is no longer available.",
    retryable: false,
    nextAction: "Create a new note.",
  };
}

function isStage(value: unknown): value is DocumentStage {
  return typeof value === "string" && (DOCUMENT_STAGES as readonly string[]).includes(value);
}

function deriveSplice(previous: string, next: string): Splice | null {
  if (previous === next) return null;
  const before = codePoints(previous);
  const after = codePoints(next);
  let prefixLength = 0;
  while (
    prefixLength < before.length
    && prefixLength < after.length
    && before[prefixLength] === after[prefixLength]
  ) {
    prefixLength += 1;
  }
  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength
    && suffixLength < after.length - prefixLength
    && before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }
  return {
    start: prefixLength,
    end: before.length - suffixLength,
    replacementLength: after.length - prefixLength - suffixLength,
  };
}

export class LocalDocumentService implements DocumentServicePort {
  private readonly documents = new Map<string, StoredDocument>();
  private readonly documentIdsByShareToken = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly sessionTtlMs: number;
  private readonly presenceTtlMs: number;
  private readonly now: () => number;

  constructor({
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    presenceTtlMs = DOCUMENT_PRESENCE_TTL_MS,
    now = Date.now,
  }: LocalDocumentServiceOptions = {}) {
    this.sessionTtlMs = Math.max(1, sessionTtlMs);
    this.presenceTtlMs = Math.max(1, presenceTtlMs);
    this.now = now;
  }

  async launch(
    input: LaunchDocumentInput = {},
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>> {
    throwIfAborted(signal);
    this.cleanupExpired();
    if (!hasExactKeys(input, [], ["displayName"])) {
      return invalidInput("The launch request is malformed.");
    }
    const displayNameValidation = this.validateDisplayName(input.displayName);
    if (displayNameValidation) return displayNameValidation;

    const now = this.now();
    const id = randomUUID();
    const shareToken = randomBytes(32).toString("base64url");
    const storedDocument: StoredDocument = {
      shareToken,
      document: {
        id,
        title: "",
        body: "",
        stage: "BRAINSTORMING",
        revision: 0,
        updatedAt: new Date(now).toISOString(),
        lastEditor: null,
      },
      expiresAt: now + this.sessionTtlMs,
      nextGuestNumber: 1,
      members: new Map(),
      presence: new Map(),
      annotations: [],
      undoAgentEdit: null,
      requestLedger: new Map(),
    };
    this.documents.set(id, storedDocument);
    this.documentIdsByShareToken.set(shareToken, id);
    throwIfAborted(signal);
    return {
      ok: true,
      data: this.issueSessionBundle(storedDocument, input.displayName as string | undefined),
    };
  }

  async join(
    input: JoinDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>> {
    throwIfAborted(signal);
    this.cleanupExpired();
    if (!hasExactKeys(input, ["shareToken"], ["displayName"])
      || typeof input.shareToken !== "string"
      || !/^[A-Za-z0-9_-]{32,128}$/.test(input.shareToken)) {
      return invalidInput("A valid share token is required.");
    }
    const displayNameValidation = this.validateDisplayName(input.displayName);
    if (displayNameValidation) return displayNameValidation;
    const documentId = this.documentIdsByShareToken.get(input.shareToken);
    const storedDocument = documentId ? this.documents.get(documentId) : undefined;
    if (!storedDocument) return notFound();
    throwIfAborted(signal);
    return { ok: true, data: this.issueSessionBundle(storedDocument, input.displayName) };
  }

  async inspect(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    throwIfAborted(signal);
    const resolved = this.resolveSession(sessionToken);
    if (!resolved) return unauthorized("A valid document session is required.");
    return { ok: true, data: this.surface(resolved.storedDocument) };
  }

  async listAgentAnnotations(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentResult<PendingDocumentAnnotation[]>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "AGENT");
    if (!resolved) return unauthorized("A valid paired agent session is required.");
    const memberId = resolved.session.member.memberId;
    const annotations = resolved.storedDocument.annotations
      .filter((annotation): annotation is PendingDocumentAnnotation => (
        annotation.status === "PENDING" && annotation.createdBy.memberId === memberId
      ))
      .sort(compareCreated);
    return { ok: true, data: clone(annotations) };
  }

  async saveHuman(
    sessionToken: string,
    input: SaveDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return unauthorized("A valid human document session is required.");
    if (!hasExactKeys(input, ["expectedRevision", "requestId", "title", "body"])
      || !this.validRevision(input.expectedRevision)
      || !isUuid(input.requestId)
      || !boundedText(input.title, DOCUMENT_TITLE_MAX_LENGTH)
      || !boundedText(input.body, DOCUMENT_BODY_MAX_LENGTH)) {
      return invalidInput("Document saves require a valid revision, request ID, title, and body.");
    }

    return this.withReplay(resolved, "SAVE_DOCUMENT", input.requestId, input, () => {
      const storedDocument = resolved.storedDocument;
      const stale = this.staleIfNeeded(storedDocument, input.expectedRevision);
      if (stale) return stale;
      if (storedDocument.document.title === input.title
        && storedDocument.document.body === input.body) {
        return { ok: true, data: this.surface(storedDocument) };
      }
      throwIfAborted(signal);
      const previousTitle = storedDocument.document.title;
      const previousBody = storedDocument.document.body;
      storedDocument.document.title = input.title;
      storedDocument.document.body = input.body;
      storedDocument.undoAgentEdit = null;
      this.commitDocument(resolved, "HUMAN", "ORDINARY_UI");
      this.rebasePendingAfterContentChange(storedDocument, previousTitle, previousBody);
      return { ok: true, data: this.surface(storedDocument) };
    });
  }

  async setStage(
    sessionToken: string,
    input: SetDocumentStageInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return unauthorized("Only a human document session may change stage.");
    if (!hasExactKeys(input, ["expectedRevision", "requestId", "stage"])
      || !this.validRevision(input.expectedRevision)
      || !isUuid(input.requestId)
      || !isStage(input.stage)) {
      return invalidInput("Stage changes require a valid revision, request ID, and document stage.");
    }

    return this.withReplay(resolved, "SET_STAGE", input.requestId, input, () => {
      const storedDocument = resolved.storedDocument;
      const stale = this.staleIfNeeded(storedDocument, input.expectedRevision);
      if (stale) return stale;
      const fromStage = storedDocument.document.stage;
      if (fromStage === input.stage) {
        return { ok: true, data: this.surface(storedDocument) };
      }
      const movingForward = DOCUMENT_STAGES.indexOf(input.stage) > DOCUMENT_STAGES.indexOf(fromStage);
      if (movingForward) {
        const capacity = this.pendingCapacityFailure(storedDocument, resolved.session.member.memberId);
        if (capacity) return capacity;
      }

      throwIfAborted(signal);
      storedDocument.document.stage = input.stage;
      storedDocument.undoAgentEdit = null;
      this.commitDocument(resolved, "HUMAN", "ORDINARY_UI");
      this.reanchorAllPending(storedDocument);
      if (movingForward && input.stage !== "BRAINSTORMING") {
        this.appendStagePreparation(storedDocument, resolved.session.member, fromStage, input.stage);
      }
      return { ok: true, data: this.surface(storedDocument) };
    });
  }

  async createAnnotation(
    sessionToken: string,
    input: CreateDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return unauthorized("Only a human document session may create an annotation.");
    const shapeFailure = this.validateCreateAnnotationShape(input);
    if (shapeFailure) return shapeFailure;

    return this.withReplay(resolved, "CREATE_ANNOTATION", input.requestId, input, () => {
      const storedDocument = resolved.storedDocument;
      const stale = this.staleIfNeeded(storedDocument, input.expectedRevision);
      if (stale) return stale;
      const details = this.annotationDetails(storedDocument, input);
      if (!details) {
        return invalidInput("The annotation preset or target does not match the authoritative document.");
      }
      const capacity = this.pendingCapacityFailure(storedDocument, resolved.session.member.memberId);
      if (capacity) return capacity;
      throwIfAborted(signal);
      const now = new Date(this.now()).toISOString();
      storedDocument.annotations.push({
        annotationId: randomUUID(),
        kind: "HUMAN_REQUEST",
        presetId: input.presetId,
        label: details.label,
        instruction: details.instruction,
        stageAtCreation: storedDocument.document.stage,
        source: input.source,
        targetField: input.targetField,
        targetKind: input.targetKind,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        selectedText: details.selectedText,
        createdRevision: storedDocument.document.revision,
        anchorRevision: storedDocument.document.revision,
        createdBy: {
          memberId: resolved.session.member.memberId,
          displayName: resolved.session.member.displayName,
        },
        createdAt: now,
        status: "PENDING",
        transition: null,
      });
      return { ok: true, data: this.surface(storedDocument) };
    });
  }

  async cancelAnnotation(
    sessionToken: string,
    input: CancelDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return unauthorized("Only a human document session may cancel an annotation.");
    if (!hasExactKeys(input, ["annotationId", "requestId"])
      || !isUuid(input.annotationId)
      || !isUuid(input.requestId)) {
      return invalidInput("Cancellation requires a valid annotation ID and request ID.");
    }

    return this.withReplay(resolved, "CANCEL_ANNOTATION", input.requestId, input, () => {
      const storedDocument = resolved.storedDocument;
      const annotation = storedDocument.annotations.find(
        (candidate) => candidate.annotationId === input.annotationId,
      );
      if (!annotation) {
        return this.staleAnnotation(storedDocument, "That annotation is no longer available.");
      }
      if (annotation.createdBy.memberId !== resolved.session.member.memberId) {
        return unauthorized("Only the annotation creator may cancel it.");
      }
      if (annotation.status !== "PENDING") {
        return this.staleAnnotation(storedDocument, "That annotation is no longer pending.");
      }
      throwIfAborted(signal);
      this.resolveAnnotation(storedDocument, annotation.annotationId, "CANCELLED");
      return { ok: true, data: this.surface(storedDocument) };
    });
  }

  async applyAgentAnnotation(
    sessionToken: string,
    input: ApplyAgentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<ApplyAgentAnnotationOutcome>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "AGENT");
    if (!resolved) return unauthorized("Only a paired agent session may apply an annotation.");
    if (!hasExactKeys(
      input,
      ["annotationId", "expectedRevision", "requestId", "replacementText", "changeSummary"],
    )
      || !isUuid(input.annotationId)
      || !this.validRevision(input.expectedRevision)
      || !isUuid(input.requestId)
      || !boundedText(input.replacementText, DOCUMENT_BODY_MAX_LENGTH)
      || !boundedText(input.changeSummary, DOCUMENT_CHANGE_SUMMARY_MAX_LENGTH, false)) {
      return invalidInput("Agent edits require a valid annotation, revision, request ID, replacement, and summary.");
    }

    return this.withReplay(resolved, "APPLY_AGENT_ANNOTATION", input.requestId, input, () => {
      const storedDocument = resolved.storedDocument;
      const annotation = storedDocument.annotations.find(
        (candidate) => candidate.annotationId === input.annotationId,
      );
      if (!annotation) {
        return this.staleAnnotation(storedDocument, "That annotation is no longer available.");
      }
      if (annotation.createdBy.memberId !== resolved.session.member.memberId) {
        return unauthorized("This paired agent may apply only its human's annotations.");
      }
      if (annotation.status !== "PENDING") {
        return this.staleAnnotation(storedDocument, "That annotation is no longer pending.");
      }
      const stale = this.staleIfNeeded<ApplyAgentAnnotationOutcome>(storedDocument, input.expectedRevision);
      if (stale) return stale;
      if (annotation.anchorRevision !== input.expectedRevision) {
        this.resolveAnnotation(storedDocument, annotation.annotationId, "STALE");
        return this.staleAnnotation(storedDocument, "The annotation is no longer anchored to this revision.");
      }

      const currentValue = annotation.targetField === "TITLE"
        ? storedDocument.document.title
        : storedDocument.document.body;
      const currentPoints = codePoints(currentValue);
      if (annotation.rangeStart < 0
        || annotation.rangeEnd < annotation.rangeStart
        || annotation.rangeEnd > currentPoints.length
        || currentPoints.slice(annotation.rangeStart, annotation.rangeEnd).join("") !== annotation.selectedText) {
        this.resolveAnnotation(storedDocument, annotation.annotationId, "STALE");
        return this.staleAnnotation(storedDocument, "The annotation target no longer matches the document.");
      }

      const nextValue = [
        ...currentPoints.slice(0, annotation.rangeStart),
        ...codePoints(input.replacementText),
        ...currentPoints.slice(annotation.rangeEnd),
      ].join("");
      const maximum = annotation.targetField === "TITLE"
        ? DOCUMENT_TITLE_MAX_LENGTH
        : DOCUMENT_BODY_MAX_LENGTH;
      if (codePoints(nextValue).length > maximum) {
        return invalidInput(`The resulting ${annotation.targetField.toLowerCase()} is too long.`);
      }

      const fromRevision = storedDocument.document.revision;
      throwIfAborted(signal);
      if (nextValue === currentValue) {
        const completed = this.resolveAnnotation(
          storedDocument,
          annotation.annotationId,
          "COMPLETED",
        ) as CompletedDocumentAnnotation;
        return {
          ok: true,
          data: {
            surface: this.surface(storedDocument),
            annotation: clone(completed),
            change: {
              summary: input.changeSummary,
              fromRevision,
              toRevision: fromRevision,
              annotationId: annotation.annotationId,
            },
            undoAvailable: false,
          },
        };
      }

      const previousTitle = storedDocument.document.title;
      const previousBody = storedDocument.document.body;
      if (annotation.targetField === "TITLE") storedDocument.document.title = nextValue;
      else storedDocument.document.body = nextValue;
      this.commitDocument(resolved, "AGENT", "WEBMCP");
      const completed = this.resolveAnnotation(
        storedDocument,
        annotation.annotationId,
        "COMPLETED",
      ) as CompletedDocumentAnnotation;
      this.rebasePendingAfterContentChange(
        storedDocument,
        previousTitle,
        previousBody,
        annotation.annotationId,
      );
      storedDocument.undoAgentEdit = {
        agentRevision: storedDocument.document.revision,
        previousTitle,
        previousBody,
      };
      return {
        ok: true,
        data: {
          surface: this.surface(storedDocument),
          annotation: clone(completed),
          change: {
            summary: input.changeSummary,
            fromRevision,
            toRevision: storedDocument.document.revision,
            annotationId: annotation.annotationId,
          },
          undoAvailable: true,
        },
      };
    });
  }

  async undoAgentEdit(
    sessionToken: string,
    input: UndoAgentEditInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return unauthorized("Only a human document session may undo an agent edit.");
    if (!hasExactKeys(input, ["expectedRevision", "requestId", "agentRevision"])
      || !this.validRevision(input.expectedRevision)
      || !this.validRevision(input.agentRevision)
      || !isUuid(input.requestId)) {
      return invalidInput("Undo requires a valid current revision, agent revision, and request ID.");
    }

    return this.withReplay(resolved, "UNDO_AGENT_EDIT", input.requestId, input, () => {
      const storedDocument = resolved.storedDocument;
      const stale = this.staleIfNeeded(storedDocument, input.expectedRevision);
      if (stale) return stale;
      const undo = storedDocument.undoAgentEdit;
      if (!undo
        || undo.agentRevision !== input.agentRevision
        || storedDocument.document.revision !== undo.agentRevision) {
        return this.staleAnnotation(storedDocument, "That agent edit can no longer be undone safely.");
      }
      throwIfAborted(signal);
      const previousTitle = storedDocument.document.title;
      const previousBody = storedDocument.document.body;
      storedDocument.document.title = undo.previousTitle;
      storedDocument.document.body = undo.previousBody;
      storedDocument.undoAgentEdit = null;
      this.commitDocument(resolved, "HUMAN", "ORDINARY_UI");
      this.rebasePendingAfterContentChange(storedDocument, previousTitle, previousBody);
      return { ok: true, data: this.surface(storedDocument) };
    });
  }

  async touchPresence(
    sessionToken: string,
    input: TouchDocumentPresenceInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>> {
    throwIfAborted(signal);
    const resolved = this.authorize(sessionToken, "HUMAN");
    if (!resolved) return unauthorized("Only a human document session may update presence.");
    if (!this.validPresenceInput(resolved.storedDocument, input)) {
      return invalidInput("Presence must identify a valid editor field, selection, and observed revision.");
    }
    throwIfAborted(signal);
    this.writePresence(resolved.storedDocument, resolved.session.member, input);
    return { ok: true, data: this.surface(resolved.storedDocument) };
  }

  private validateDisplayName(displayName: unknown): DocumentFailure | null {
    if (displayName === undefined) return null;
    if (!boundedText(displayName, DISPLAY_NAME_MAX_LENGTH, false)) {
      return invalidInput("Display name must be non-blank and at most 80 characters.");
    }
    return null;
  }

  private validateCreateAnnotationShape(input: CreateDocumentAnnotationInput): DocumentFailure | null {
    if (!hasExactKeys(
      input,
      ["expectedRevision", "requestId", "presetId", "source", "targetField", "targetKind", "rangeStart", "rangeEnd"],
      ["customInstruction"],
    )
      || !this.validRevision(input.expectedRevision)
      || !isUuid(input.requestId)
      || !["ANNOTATION_RAIL", "KEYBOARD"].includes(input.source)
      || !["TITLE", "BODY"].includes(input.targetField)
      || !["SELECTION", "CARET", "DOCUMENT"].includes(input.targetKind)
      || !Number.isInteger(input.rangeStart)
      || !Number.isInteger(input.rangeEnd)
      || input.rangeStart < 0
      || input.rangeEnd < input.rangeStart) {
      return invalidInput("The annotation request is malformed.");
    }
    if (input.presetId === "custom") {
      if (!Object.hasOwn(input, "customInstruction")
        || !boundedText(input.customInstruction, DOCUMENT_CUSTOM_INSTRUCTION_MAX_LENGTH, false)) {
        return invalidInput("A custom annotation requires a non-blank instruction of at most 500 characters.");
      }
      return null;
    }
    if (Object.hasOwn(input, "customInstruction")) {
      return invalidInput("Preset annotations do not accept a custom instruction.");
    }
    const knownPreset = Object.values(DOCUMENT_ACTION_PRESETS)
      .flat()
      .some((candidate) => candidate.presetId === input.presetId);
    return knownPreset ? null : invalidInput("That annotation preset does not exist.");
  }

  private annotationDetails(
    storedDocument: StoredDocument,
    input: CreateDocumentAnnotationInput,
  ): { label: string; instruction: string; selectedText: string } | null {
    const fieldValue = input.targetField === "TITLE"
      ? storedDocument.document.title
      : storedDocument.document.body;
    const points = codePoints(fieldValue);
    if (input.rangeEnd > points.length) return null;
    if (input.targetKind === "SELECTION" && input.rangeStart === input.rangeEnd) return null;
    if (input.targetKind === "CARET" && input.rangeStart !== input.rangeEnd) return null;
    if (input.targetKind === "CARET"
      && (input.presetId !== "continue_thought" || input.targetField !== "BODY")) {
      return null;
    }
    if (input.targetKind === "DOCUMENT" && (input.rangeStart !== 0 || input.rangeEnd !== points.length)) return null;
    const selectedText = points.slice(input.rangeStart, input.rangeEnd).join("");
    if (input.presetId === "custom") {
      const instruction = input.customInstruction.trim();
      return { label: "Ask agent…", instruction, selectedText };
    }
    const preset = DOCUMENT_ACTION_PRESETS[storedDocument.document.stage]
      .find((candidate) => candidate.presetId === input.presetId);
    return preset ? { ...preset, selectedText } : null;
  }

  private pendingCapacityFailure(
    storedDocument: StoredDocument,
    memberId: string,
  ): DocumentFailure | null {
    const pending = storedDocument.annotations.filter((annotation) => annotation.status === "PENDING");
    const memberPending = pending.filter((annotation) => annotation.createdBy.memberId === memberId);
    if (pending.length < DOCUMENT_PENDING_ANNOTATION_LIMIT
      && memberPending.length < DOCUMENT_MEMBER_PENDING_ANNOTATION_LIMIT) {
      return null;
    }
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: memberPending.length >= DOCUMENT_MEMBER_PENDING_ANNOTATION_LIMIT
        ? "This collaborator already has 50 pending annotations."
        : "This document already has 100 pending annotations.",
      retryable: true,
      currentSurface: this.surface(storedDocument),
      nextAction: "Resolve or cancel pending annotations before adding another.",
    };
  }

  private appendStagePreparation(
    storedDocument: StoredDocument,
    member: StoredMember,
    fromStage: DocumentStage,
    toStage: Exclude<DocumentStage, "BRAINSTORMING">,
  ): void {
    const preparation = DOCUMENT_STAGE_PREPARATIONS[toStage];
    const now = new Date(this.now()).toISOString();
    storedDocument.annotations.push({
      annotationId: randomUUID(),
      kind: "STAGE_PREPARATION",
      presetId: preparation.presetId,
      label: preparation.label,
      instruction: preparation.instruction,
      stageAtCreation: toStage,
      source: "STAGE_TRANSITION",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: codePoints(storedDocument.document.body).length,
      selectedText: storedDocument.document.body,
      createdRevision: storedDocument.document.revision,
      anchorRevision: storedDocument.document.revision,
      createdBy: { memberId: member.memberId, displayName: member.displayName },
      createdAt: now,
      status: "PENDING",
      transition: { fromStage, toStage },
    });
  }

  private validPresenceInput(storedDocument: StoredDocument, input: TouchDocumentPresenceInput): boolean {
    if (!hasExactKeys(input, ["state", "field", "isTyping", "selectionStart", "selectionEnd", "observedRevision"])
      || !["VIEWING", "EDITING", "IDLE"].includes(input.state)
      || (input.field !== null && !["TITLE", "BODY"].includes(input.field))
      || typeof input.isTyping !== "boolean"
      || !this.validRevision(input.observedRevision)
      || input.observedRevision > storedDocument.document.revision) {
      return false;
    }
    if (input.field === null) {
      return input.selectionStart === null && input.selectionEnd === null && input.isTyping === false;
    }
    if (!Number.isInteger(input.selectionStart) || !Number.isInteger(input.selectionEnd)) return false;
    const start = input.selectionStart as number;
    const end = input.selectionEnd as number;
    const value = input.field === "TITLE" ? storedDocument.document.title : storedDocument.document.body;
    const length = codePoints(value).length;
    return start >= 0 && end >= start && end <= length;
  }

  private validRevision(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0;
  }

  private issueSessionBundle(storedDocument: StoredDocument, requestedDisplayName?: string): DocumentSessionBundle {
    const guestNumber = storedDocument.nextGuestNumber++;
    const displayName = requestedDisplayName?.trim() || `Guest ${guestNumber}`;
    const member: StoredMember = {
      memberId: randomUUID(),
      displayName,
      color: MEMBER_COLORS[(guestNumber - 1) % MEMBER_COLORS.length],
    };
    storedDocument.members.set(member.memberId, member);
    const humanSessionToken = this.issueSession(storedDocument, member, "HUMAN");
    const agentSessionToken = this.issueSession(storedDocument, member, "AGENT");
    const sessionInstanceId = randomUUID();
    this.writePresence(storedDocument, member, {
      state: "VIEWING",
      field: null,
      isTyping: false,
      selectionStart: null,
      selectionEnd: null,
      observedRevision: storedDocument.document.revision,
    });
    return {
      shareToken: storedDocument.shareToken,
      humanSessionToken,
      agentSessionToken,
      sessionInstanceId,
      selfMemberId: member.memberId,
      expiresAt: new Date(storedDocument.expiresAt).toISOString(),
      surface: this.surface(storedDocument),
    };
  }

  private issueSession(storedDocument: StoredDocument, member: StoredMember, actorType: SessionActor): string {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, {
      documentId: storedDocument.document.id,
      member,
      actorType,
      expiresAt: storedDocument.expiresAt,
    });
    return token;
  }

  private resolveSession(sessionToken: string): ResolvedSession | null {
    this.cleanupExpired();
    if (typeof sessionToken !== "string" || sessionToken.length === 0) return null;
    const session = this.sessions.get(sessionToken);
    const storedDocument = session ? this.documents.get(session.documentId) : undefined;
    if (!session || !storedDocument || session.expiresAt <= this.now()) return null;
    return { storedDocument, session };
  }

  private authorize(sessionToken: string, actorType: SessionActor): ResolvedSession | null {
    const resolved = this.resolveSession(sessionToken);
    return resolved?.session.actorType === actorType ? resolved : null;
  }

  private writePresence(
    storedDocument: StoredDocument,
    member: StoredMember,
    input: TouchDocumentPresenceInput,
  ): void {
    const now = this.now();
    storedDocument.presence.set(member.memberId, {
      lastSeenMs: now,
      value: {
        memberId: member.memberId,
        displayName: member.displayName,
        color: member.color,
        state: input.state,
        field: input.field,
        isTyping: input.isTyping,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        observedRevision: input.observedRevision,
        lastSeenAt: new Date(now).toISOString(),
      },
    });
  }

  private surface(storedDocument: StoredDocument): DocumentSurface {
    this.cleanupPresence(storedDocument);
    const pending = storedDocument.annotations.filter((annotation) => annotation.status === "PENDING");
    const resolved = storedDocument.annotations
      .filter((annotation) => annotation.status !== "PENDING")
      .sort((left, right) => (
        right.resolvedAt.localeCompare(left.resolvedAt)
        || right.annotationId.localeCompare(left.annotationId)
      ))
      .slice(0, DOCUMENT_RESOLVED_ANNOTATION_HISTORY_LIMIT);
    return clone({
      document: storedDocument.document,
      presence: [...storedDocument.presence.values()]
        .sort((left, right) => left.value.displayName.localeCompare(right.value.displayName))
        .map((presence) => presence.value),
      annotations: [...pending, ...resolved].sort(compareCreated),
      undoAgentEdit: storedDocument.undoAgentEdit,
    });
  }

  private commitDocument(
    resolved: ResolvedSession,
    actorType: SessionActor,
    origin: "ORDINARY_UI" | "WEBMCP",
  ): void {
    const { document } = resolved.storedDocument;
    document.revision += 1;
    document.updatedAt = new Date(this.now()).toISOString();
    document.lastEditor = {
      memberId: resolved.session.member.memberId,
      displayName: actorType === "AGENT"
        ? `${resolved.session.member.displayName}’s agent`
        : resolved.session.member.displayName,
      actorType,
      origin,
    };
  }

  private reanchorAllPending(storedDocument: StoredDocument): void {
    storedDocument.annotations = storedDocument.annotations.map((annotation) => (
      annotation.status === "PENDING"
        ? { ...annotation, anchorRevision: storedDocument.document.revision }
        : annotation
    ));
  }

  private rebasePendingAfterContentChange(
    storedDocument: StoredDocument,
    previousTitle: string,
    previousBody: string,
    excludedAnnotationId?: string,
  ): void {
    const titleSplice = deriveSplice(previousTitle, storedDocument.document.title);
    const bodySplice = deriveSplice(previousBody, storedDocument.document.body);
    const nextAnnotations: DocumentAnnotation[] = [];
    for (const annotation of storedDocument.annotations) {
      if (annotation.status !== "PENDING" || annotation.annotationId === excludedAnnotationId) {
        nextAnnotations.push(annotation);
        continue;
      }
      const nextValue = annotation.targetField === "TITLE"
        ? storedDocument.document.title
        : storedDocument.document.body;
      const splice = annotation.targetField === "TITLE" ? titleSplice : bodySplice;
      let rangeStart = annotation.rangeStart;
      let rangeEnd = annotation.rangeEnd;

      if (splice && annotation.targetKind === "DOCUMENT") {
        rangeStart = 0;
        rangeEnd = codePoints(nextValue).length;
      } else if (splice && annotation.rangeEnd <= splice.start) {
        // The target is before the splice. A caret exactly at an insertion point stays before it.
      } else if (splice && annotation.rangeStart >= splice.end) {
        const delta = splice.replacementLength - (splice.end - splice.start);
        rangeStart += delta;
        rangeEnd += delta;
      } else if (splice) {
        nextAnnotations.push(this.asResolved(annotation, "STALE", storedDocument.document.revision));
        continue;
      }

      const points = codePoints(nextValue);
      nextAnnotations.push({
        ...annotation,
        rangeStart,
        rangeEnd,
        selectedText: points.slice(rangeStart, rangeEnd).join(""),
        anchorRevision: storedDocument.document.revision,
      });
    }
    storedDocument.annotations = nextAnnotations;
  }

  private resolveAnnotation(
    storedDocument: StoredDocument,
    annotationId: string,
    status: "COMPLETED" | "CANCELLED" | "STALE",
  ): DocumentAnnotation {
    const index = storedDocument.annotations.findIndex(
      (annotation) => annotation.annotationId === annotationId,
    );
    const current = storedDocument.annotations[index];
    if (!current || current.status !== "PENDING") return current;
    const resolved = this.asResolved(current, status, storedDocument.document.revision);
    storedDocument.annotations[index] = resolved;
    return resolved;
  }

  private asResolved(
    annotation: PendingDocumentAnnotation,
    status: "COMPLETED" | "CANCELLED" | "STALE",
    resolvedRevision: number,
  ): DocumentAnnotation {
    return {
      ...annotation,
      status,
      resolvedAt: new Date(this.now()).toISOString(),
      resolvedRevision,
    } as DocumentAnnotation;
  }

  private staleIfNeeded<T = DocumentSurface>(
    storedDocument: StoredDocument,
    expectedRevision: number,
  ): DocumentResult<T> | null {
    const actualRevision = storedDocument.document.revision;
    if (expectedRevision === actualRevision) return null;
    return {
      ok: false,
      code: "STALE_WORK_STATE",
      message: `Document advanced from revision ${expectedRevision} to ${actualRevision}.`,
      retryable: true,
      currentSurface: this.surface(storedDocument),
      expectedRevision,
      actualRevision,
      nextAction: `Inspect the document and retry against revision ${actualRevision}.`,
    };
  }

  private staleAnnotation(storedDocument: StoredDocument, message: string): DocumentFailure {
    return {
      ok: false,
      code: "STALE_ANNOTATION_CONTEXT",
      message,
      retryable: true,
      currentSurface: this.surface(storedDocument),
      nextAction: "Inspect the annotation queue and choose a pending annotation.",
    };
  }

  private withReplay<T>(
    resolved: ResolvedSession,
    operation: string,
    requestId: string,
    input: unknown,
    execute: () => DocumentResult<T>,
  ): DocumentResult<T> {
    const fingerprint = canonical({
      operation,
      memberId: resolved.session.member.memberId,
      actorType: resolved.session.actorType,
      input,
    });
    const previous = resolved.storedDocument.requestLedger.get(requestId);
    if (previous) {
      if (previous.fingerprint === fingerprint) return clone(previous.result) as DocumentResult<T>;
      return {
        ok: false,
        code: "REQUEST_REPLAY_MISMATCH",
        message: "That request ID was already used with different input.",
        retryable: false,
        currentSurface: this.surface(resolved.storedDocument),
        nextAction: "Create a new request ID for the changed operation.",
      };
    }
    const result = execute();
    resolved.storedDocument.requestLedger.set(requestId, {
      fingerprint,
      result: clone(result) as DocumentResult<unknown>,
    });
    return result;
  }

  private cleanupPresence(storedDocument: StoredDocument): void {
    const cutoff = this.now() - this.presenceTtlMs;
    for (const [memberId, presence] of storedDocument.presence) {
      if (presence.lastSeenMs <= cutoff) storedDocument.presence.delete(memberId);
    }
  }

  private cleanupExpired(): void {
    const now = this.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
    for (const [documentId, storedDocument] of this.documents) {
      if (storedDocument.expiresAt > now) continue;
      this.documents.delete(documentId);
      this.documentIdsByShareToken.delete(storedDocument.shareToken);
    }
  }
}

let localDocumentService: LocalDocumentService | undefined;

export function getLocalDocumentService(): LocalDocumentService {
  localDocumentService ??= new LocalDocumentService();
  return localDocumentService;
}
