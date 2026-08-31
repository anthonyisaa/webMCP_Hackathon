export const DOCUMENT_STAGES = [
  "BRAINSTORMING",
  "RESEARCHING",
  "REFINE",
  "READY_TO_SHIP",
] as const;

export type DocumentStage = (typeof DOCUMENT_STAGES)[number];

export const DOCUMENT_STAGE_LABELS: Record<DocumentStage, string> = {
  BRAINSTORMING: "Brainstorming",
  RESEARCHING: "Researching",
  REFINE: "Refine",
  READY_TO_SHIP: "Ready to ship",
};

export const DOCUMENT_ACTION_PRESETS = {
  BRAINSTORMING: [
    {
      presetId: "continue_thought",
      label: "Continue the thought",
      instruction:
        "Continue naturally from the target, matching the document voice and adding no unsupported factual claims.",
    },
    {
      presetId: "turn_into_outline",
      label: "Turn into an outline",
      instruction: "Turn the target into a clear concise outline while preserving its meaning.",
    },
  ],
  RESEARCHING: [
    {
      presetId: "identify_research_gaps",
      label: "Identify research gaps",
      instruction:
        "Identify claims, assumptions, or missing evidence; do not invent citations or claim research was performed.",
    },
    {
      presetId: "turn_gaps_into_questions",
      label: "Turn gaps into questions",
      instruction:
        "Turn research gaps in the target into focused questions; do not invent citations.",
    },
  ],
  REFINE: [
    {
      presetId: "rewrite_for_clarity",
      label: "Rewrite for clarity",
      instruction:
        "Rewrite the target for clarity while preserving meaning and factual claims.",
    },
    {
      presetId: "shorten",
      label: "Shorten",
      instruction:
        "Shorten the target without losing essential meaning or factual qualifications.",
    },
  ],
  READY_TO_SHIP: [
    {
      presetId: "proofread",
      label: "Proofread",
      instruction: "Correct grammar, spelling, and punctuation without changing meaning.",
    },
    {
      presetId: "final_polish",
      label: "Final polish",
      instruction:
        "Polish the target for publication, improving flow and consistency without adding unsupported claims.",
    },
  ],
} as const satisfies Record<
  DocumentStage,
  readonly { presetId: string; label: string; instruction: string }[]
>;

export const DOCUMENT_STAGE_PREPARATIONS = {
  RESEARCHING: {
    presetId: "prepare_for_researching",
    label: "Prepare for research",
    instruction:
      "Organize the document into a clear research brief. Preserve ideas, group related points, and surface questions, assumptions, and evidence gaps. Do not invent research or citations.",
  },
  REFINE: {
    presetId: "prepare_for_refine",
    label: "Prepare to refine",
    instruction:
      "Shape the document into a coherent draft using only its existing content. Preserve factual qualifications and make unresolved gaps explicit. Do not invent evidence or citations.",
  },
  READY_TO_SHIP: {
    presetId: "prepare_for_ready_to_ship",
    label: "Prepare to ship",
    instruction:
      "Polish the document for publication by improving clarity, flow, consistency, grammar, and formatting without adding unsupported claims.",
  },
} as const;

export type DocumentActionPresetId =
  (typeof DOCUMENT_ACTION_PRESETS)[DocumentStage][number]["presetId"];
export type DocumentStagePreparationPresetId =
  (typeof DOCUMENT_STAGE_PREPARATIONS)[keyof typeof DOCUMENT_STAGE_PREPARATIONS]["presetId"];
export type HumanAnnotationPresetId = DocumentActionPresetId | "custom";
export type DocumentPresetId = HumanAnnotationPresetId | DocumentStagePreparationPresetId;

export type DocumentActorType = "HUMAN" | "AGENT";
export type DocumentOrigin = "ORDINARY_UI" | "WEBMCP";
export type DocumentField = "TITLE" | "BODY";
export type DocumentTargetKind = "SELECTION" | "CARET" | "DOCUMENT";
export type DocumentAnnotationSource = "ANNOTATION_RAIL" | "KEYBOARD" | "STAGE_TRANSITION";
export type DocumentAnnotationStatus = "PENDING" | "COMPLETED" | "CANCELLED" | "STALE";
export type DocumentAnnotationKind = "HUMAN_REQUEST" | "STAGE_PREPARATION";

export interface SharedDocument {
  id: string;
  title: string;
  body: string;
  stage: DocumentStage;
  revision: number;
  updatedAt: string;
  lastEditor: {
    memberId: string;
    displayName: string;
    actorType: DocumentActorType;
    origin: DocumentOrigin;
  } | null;
}

export interface DocumentPresence {
  memberId: string;
  displayName: string;
  color: string;
  state: "VIEWING" | "EDITING" | "IDLE";
  field: DocumentField | null;
  isTyping: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  observedRevision: number;
  lastSeenAt: string;
}

interface DocumentAnnotationBase {
  annotationId: string;
  label: string;
  instruction: string;
  stageAtCreation: DocumentStage;
  targetField: DocumentField;
  targetKind: DocumentTargetKind;
  rangeStart: number;
  rangeEnd: number;
  selectedText: string;
  createdRevision: number;
  anchorRevision: number;
  createdBy: {
    memberId: string;
    displayName: string;
  };
  createdAt: string;
}

type DocumentAnnotationLifecycle =
  | {
      status: "PENDING";
      resolvedAt?: never;
      resolvedRevision?: never;
    }
  | {
      status: Exclude<DocumentAnnotationStatus, "PENDING">;
      resolvedAt: string;
      resolvedRevision: number;
    };

export type DocumentAnnotation = DocumentAnnotationBase & DocumentAnnotationLifecycle & (
  | {
      kind: "HUMAN_REQUEST";
      presetId: HumanAnnotationPresetId;
      source: Exclude<DocumentAnnotationSource, "STAGE_TRANSITION">;
      transition: null;
    }
  | {
      kind: "STAGE_PREPARATION";
      presetId: DocumentStagePreparationPresetId;
      source: "STAGE_TRANSITION";
      transition: {
        fromStage: DocumentStage;
        toStage: Exclude<DocumentStage, "BRAINSTORMING">;
      };
    }
);

export type PendingDocumentAnnotation = DocumentAnnotation & { status: "PENDING" };
export type CompletedDocumentAnnotation = DocumentAnnotation & { status: "COMPLETED" };

export interface UndoAgentEdit {
  agentRevision: number;
  previousTitle: string;
  previousBody: string;
}

export interface DocumentSurface {
  document: SharedDocument;
  presence: DocumentPresence[];
  annotations: DocumentAnnotation[];
  undoAgentEdit: UndoAgentEdit | null;
}

export interface DocumentSessionBundle {
  shareToken: string;
  humanSessionToken: string;
  agentSessionToken: string;
  sessionInstanceId: string;
  selfMemberId: string;
  expiresAt: string;
  surface: DocumentSurface;
}

export const DOCUMENT_ERROR_CODES = [
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "STALE_WORK_STATE",
  "STALE_ANNOTATION_CONTEXT",
  "REQUEST_REPLAY_MISMATCH",
  "STALE_PAGE_CONTEXT",
  "RATE_LIMITED",
] as const;

export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];

export interface DocumentFailure {
  ok: false;
  code: Exclude<DocumentErrorCode, "STALE_WORK_STATE">;
  message: string;
  retryable: boolean;
  currentSurface?: DocumentSurface;
  nextAction?: string;
}

export interface StaleDocumentFailure {
  ok: false;
  code: "STALE_WORK_STATE";
  message: string;
  retryable: true;
  currentSurface: DocumentSurface;
  expectedRevision: number;
  actualRevision: number;
  nextAction: string;
}

export interface DocumentSuccess<T> {
  ok: true;
  data: T;
}

export type DocumentResult<T> = DocumentSuccess<T> | DocumentFailure | StaleDocumentFailure;

export type InspectDocumentToolResult =
  | {
      ok: true;
      document: SharedDocument;
      presence: DocumentPresence[];
    }
  | DocumentFailure
  | StaleDocumentFailure;

export type ListAgentAnnotationsToolResult =
  | { ok: true; annotations: PendingDocumentAnnotation[] }
  | (DocumentFailure & { code: "UNAUTHORIZED" | "STALE_PAGE_CONTEXT" });

export type ApplyAgentAnnotationToolResult =
  | {
      ok: true;
      document: SharedDocument;
      annotation: DocumentAnnotation;
      change: {
        summary: string;
        fromRevision: number;
        toRevision: number;
        annotationId: string;
      };
      undoAvailable: boolean;
    }
  | DocumentFailure
  | StaleDocumentFailure;

export interface LaunchDocumentInput {
  displayName?: string;
}

export interface JoinDocumentInput {
  shareToken: string;
  displayName?: string;
}

export interface SaveDocumentInput {
  expectedRevision: number;
  requestId: string;
  title: string;
  body: string;
}

export interface SetDocumentStageInput {
  expectedRevision: number;
  requestId: string;
  stage: DocumentStage;
}

interface CreateDocumentAnnotationBaseInput {
  expectedRevision: number;
  requestId: string;
  source: Exclude<DocumentAnnotationSource, "STAGE_TRANSITION">;
  targetField: DocumentField;
  targetKind: DocumentTargetKind;
  rangeStart: number;
  rangeEnd: number;
}

export type CreateDocumentAnnotationInput = CreateDocumentAnnotationBaseInput & (
  | {
      presetId: "custom";
      customInstruction: string;
    }
  | {
      presetId: DocumentActionPresetId;
      customInstruction?: never;
    }
);

export interface CancelDocumentAnnotationInput {
  annotationId: string;
  requestId: string;
}

export interface ApplyAgentAnnotationInput {
  annotationId: string;
  expectedRevision: number;
  requestId: string;
  replacementText: string;
  changeSummary: string;
}

export interface ApplyAgentAnnotationOutcome {
  surface: DocumentSurface;
  annotation: CompletedDocumentAnnotation;
  change: {
    summary: string;
    fromRevision: number;
    toRevision: number;
    annotationId: string;
  };
  undoAvailable: boolean;
}

export interface UndoAgentEditInput {
  expectedRevision: number;
  requestId: string;
  agentRevision: number;
}

export interface TouchDocumentPresenceInput {
  state: "VIEWING" | "EDITING" | "IDLE";
  field: DocumentField | null;
  isTyping: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  observedRevision: number;
}

export interface DocumentServicePort {
  launch(
    input?: LaunchDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>>;
  join(
    input: JoinDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSessionBundle>>;
  inspect(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>>;
  listAgentAnnotations(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<DocumentResult<PendingDocumentAnnotation[]>>;
  saveHuman(
    sessionToken: string,
    input: SaveDocumentInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>>;
  setStage(
    sessionToken: string,
    input: SetDocumentStageInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>>;
  createAnnotation(
    sessionToken: string,
    input: CreateDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>>;
  cancelAnnotation(
    sessionToken: string,
    input: CancelDocumentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>>;
  applyAgentAnnotation(
    sessionToken: string,
    input: ApplyAgentAnnotationInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<ApplyAgentAnnotationOutcome>>;
  undoAgentEdit(
    sessionToken: string,
    input: UndoAgentEditInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>>;
  touchPresence(
    sessionToken: string,
    input: TouchDocumentPresenceInput,
    signal?: AbortSignal,
  ): Promise<DocumentResult<DocumentSurface>>;
}

export const DOCUMENT_SESSION_STORAGE_PREFIX = "ratiflow.document.session.v2:";
export const DOCUMENT_AGENT_REQUEST =
  "Use this page's WebMCP tools to inspect the document and process my queued annotations oldest first. Re-inspect after every edit. Do not change the document stage.";
export const DOCUMENT_TITLE_MAX_LENGTH = 160;
export const DOCUMENT_BODY_MAX_LENGTH = 50_000;
export const DOCUMENT_CUSTOM_INSTRUCTION_MAX_LENGTH = 500;
export const DOCUMENT_CHANGE_SUMMARY_MAX_LENGTH = 240;
export const DOCUMENT_PENDING_ANNOTATION_LIMIT = 100;
export const DOCUMENT_MEMBER_PENDING_ANNOTATION_LIMIT = 50;
export const DOCUMENT_RESOLVED_ANNOTATION_HISTORY_LIMIT = 20;
