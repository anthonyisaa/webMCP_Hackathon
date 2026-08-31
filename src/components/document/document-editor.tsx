"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  DOCUMENT_AGENT_REQUEST,
  DOCUMENT_BODY_MAX_LENGTH,
  DOCUMENT_SESSION_STORAGE_PREFIX,
  DOCUMENT_STAGE_LABELS,
  DOCUMENT_STAGES,
  DOCUMENT_TITLE_MAX_LENGTH,
  type DocumentAnnotation,
  type CreateDocumentAnnotationInput,
  type DocumentField,
  type DocumentFailure,
  type DocumentSessionBundle,
  type DocumentStage,
  type DocumentSurface,
  type StaleDocumentFailure,
} from "@/document/contracts";
import { reconcileDocumentSurface } from "@/document/surface-reconciliation";
import {
  documentTargetLabel,
  getDocumentAgentCommands,
  type DocumentAgentCommand,
} from "@/document/commands";
import {
  resolveDocumentActionTarget,
  utf16IndexToCodePointOffset,
  type DocumentSelectionSnapshot,
} from "@/document/range";
import { AnnotationRail, type AnnotationTargetPreview } from "./annotation-rail";
import { documentHttpService } from "./document-http-service";
import { DocumentWebMCPBridge } from "./DocumentWebMCPBridge";
import styles from "./document-editor.module.css";

type LoadState = "LOADING" | "READY" | "UNAVAILABLE" | "ERROR";
type SaveState = "SAVED" | "UNSAVED" | "SAVING" | "CONFLICT" | "ERROR";
type AnnotationSource = "ANNOTATION_RAIL" | "KEYBOARD";

interface DocumentEditorProps {
  launchOnMount?: boolean;
  shareToken?: string;
}

interface DraftValue {
  title: string;
  body: string;
}

interface PresenceDraft {
  state: "VIEWING" | "EDITING" | "IDLE";
  field: DocumentField | null;
  isTyping: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
}

type InitializationOutcome =
  | {
      kind: "READY";
      bundle: DocumentSessionBundle;
      replaceRoute: boolean;
      warning?: string;
    }
  | { kind: "UNAVAILABLE" | "ERROR"; message: string };

type EditorControl = HTMLInputElement | HTMLTextAreaElement;
type StoredSessionCredentials = Pick<
  DocumentSessionBundle,
  | "shareToken"
  | "humanSessionToken"
  | "agentSessionToken"
  | "sessionInstanceId"
  | "selfMemberId"
  | "expiresAt"
>;

const LEGACY_DOCUMENT_SESSION_STORAGE_PREFIX = "ratiflow.document.session.v1:";

function sessionStorageKey(shareToken: string): string {
  return `${DOCUMENT_SESSION_STORAGE_PREFIX}${shareToken}`;
}

function legacySessionStorageKey(shareToken: string): string {
  return `${LEGACY_DOCUMENT_SESSION_STORAGE_PREFIX}${shareToken}`;
}

function sessionCredentials(value: unknown, shareToken: string): StoredSessionCredentials | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredSessionCredentials>;
  if (
    candidate.shareToken !== shareToken ||
    typeof candidate.humanSessionToken !== "string" ||
    candidate.humanSessionToken.length === 0 ||
    typeof candidate.agentSessionToken !== "string" ||
    candidate.agentSessionToken.length === 0 ||
    typeof candidate.sessionInstanceId !== "string" ||
    candidate.sessionInstanceId.length === 0 ||
    typeof candidate.selfMemberId !== "string" ||
    candidate.selfMemberId.length === 0 ||
    typeof candidate.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.expiresAt)) ||
    Date.parse(candidate.expiresAt) <= Date.now()
  ) {
    return null;
  }
  return {
    shareToken: candidate.shareToken,
    humanSessionToken: candidate.humanSessionToken,
    agentSessionToken: candidate.agentSessionToken,
    sessionInstanceId: candidate.sessionInstanceId,
    selfMemberId: candidate.selfMemberId,
    expiresAt: candidate.expiresAt,
  };
}

function hasSurfaceShape(value: unknown): value is DocumentSurface {
  if (!value || typeof value !== "object") return false;
  const surface = value as Partial<DocumentSurface> & { pendingAction?: unknown };
  return (
    Boolean(surface.document) &&
    Array.isArray(surface.presence) &&
    Array.isArray(surface.annotations) &&
    !("pendingAction" in surface)
  );
}

function hasSessionShape(value: unknown): value is DocumentSessionBundle {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<DocumentSessionBundle>;
  return (
    typeof bundle.shareToken === "string" &&
    typeof bundle.humanSessionToken === "string" &&
    typeof bundle.agentSessionToken === "string" &&
    typeof bundle.sessionInstanceId === "string" &&
    typeof bundle.selfMemberId === "string" &&
    typeof bundle.expiresAt === "string" &&
    hasSurfaceShape(bundle.surface)
  );
}

function readStoredSession(shareToken: string): DocumentSessionBundle | null {
  const key = sessionStorageKey(shareToken);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!hasSessionShape(parsed) || parsed.shareToken !== shareToken) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (!Number.isFinite(Date.parse(parsed.expiresAt)) || Date.parse(parsed.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
    return null;
  }
}

function readLegacySessionCredentials(shareToken: string): StoredSessionCredentials | null {
  const key = legacySessionStorageKey(shareToken);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const credentials = sessionCredentials(JSON.parse(raw) as unknown, shareToken);
    if (!credentials) sessionStorage.removeItem(key);
    return credentials;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
    return null;
  }
}

function writeStoredSession(bundle: DocumentSessionBundle): boolean {
  try {
    sessionStorage.setItem(sessionStorageKey(bundle.shareToken), JSON.stringify(bundle));
    return true;
  } catch {
    // A blocked sessionStorage should not make the ordinary editor unusable.
    return false;
  }
}

function removeStoredSession(shareToken: string): void {
  try {
    sessionStorage.removeItem(sessionStorageKey(shareToken));
  } catch {
    // Best-effort cleanup only.
  }
}

function removeLegacySession(shareToken: string): void {
  try {
    sessionStorage.removeItem(legacySessionStorageKey(shareToken));
  } catch {
    // Best-effort cleanup only.
  }
}

function failureMessage(failure: DocumentFailure | StaleDocumentFailure): string {
  return failure.message || "The note could not be updated. Please try again.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function editorSelection(field: DocumentField, control: EditorControl | null): DocumentSelectionSnapshot {
  const fallback = control?.value.length ?? 0;
  return {
    field,
    startUtf16: control?.selectionStart ?? fallback,
    endUtf16: control?.selectionEnd ?? fallback,
  };
}

function presenceWithinSurface(presence: PresenceDraft, surface: DocumentSurface): PresenceDraft {
  if (presence.field === null) return presence;
  const value = presence.field === "TITLE" ? surface.document.title : surface.document.body;
  const maximum = Array.from(value).length;
  const start = Math.min(presence.selectionStart ?? 0, maximum);
  const end = Math.max(start, Math.min(presence.selectionEnd ?? start, maximum));
  return { ...presence, selectionStart: start, selectionEnd: end };
}

function presenceDescription(surface: DocumentSurface, selfMemberId: string): string | null {
  const active = surface.presence.find(
    (person) => person.memberId !== selfMemberId && person.state === "EDITING",
  );
  if (!active) return null;
  const field = active.field === "TITLE" ? "title" : active.field === "BODY" ? "body" : "note";
  return `${active.displayName} is editing the ${field}`;
}

function previewExcerpt(value: string, fallback: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  const points = Array.from(compact);
  return points.length > 132 ? `${points.slice(0, 129).join("")}…` : compact;
}

function clampCodePoints(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const points = Array.from(value);
  return points.length > maximum ? points.slice(0, maximum).join("") : value;
}

function findAddedStagePreparation(
  previous: DocumentSurface,
  next: DocumentSurface,
): DocumentAnnotation | null {
  const existing = new Set(previous.annotations.map((annotation) => annotation.annotationId));
  return (
    next.annotations.find(
      (annotation) =>
        annotation.kind === "STAGE_PREPARATION" && !existing.has(annotation.annotationId),
    ) ?? null
  );
}

export function DocumentEditor({ launchOnMount = false, shareToken }: DocumentEditorProps) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("LOADING");
  const [loadMessage, setLoadMessage] = useState("Opening a blank note…");
  const [bundle, setBundle] = useState<DocumentSessionBundle | null>(null);
  const [surface, setSurface] = useState<DocumentSurface | null>(null);
  const [draft, setDraft] = useState<DraftValue>({ title: "", body: "" });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("SAVED");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [conflictSurface, setConflictSurface] = useState<DocumentSurface | null>(null);
  const [stageBusy, setStageBusy] = useState(false);
  const [targetSelection, setTargetSelection] = useState<DocumentSelectionSnapshot>({
    field: "BODY",
    startUtf16: 0,
    endUtf16: 0,
  });
  const [annotationSource, setAnnotationSource] = useState<AnnotationSource>("ANNOTATION_RAIL");
  const [customInstruction, setCustomInstruction] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const [cancellingAnnotationId, setCancellingAnnotationId] = useState<string | null>(null);
  const [highlightedAnnotationId, setHighlightedAnnotationId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [railFocusRequest, setRailFocusRequest] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const [requestCopied, setRequestCopied] = useState(false);
  const [agentApplying, setAgentApplying] = useState(false);
  const [webMcpSupported, setWebMcpSupported] = useState<boolean | null>(null);

  const bundleRef = useRef<DocumentSessionBundle | null>(null);
  const surfaceRef = useRef<DocumentSurface | null>(null);
  const draftRef = useRef<DraftValue>(draft);
  const dirtyRef = useRef(false);
  const conflictRef = useRef<DocumentSurface | null>(null);
  const savePromiseRef = useRef<Promise<DocumentSurface | null> | null>(null);
  const initializationRef = useRef<{ key: string; promise: Promise<InitializationOutcome> } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const railHeadingRef = useRef<HTMLHeadingElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeFieldRef = useRef<DocumentField>("BODY");
  const railFocusTargetRef = useRef<"HEADING" | "COMPOSER">("HEADING");
  const presenceRef = useRef<PresenceDraft>({
    state: "VIEWING",
    field: null,
    isTyping: false,
    selectionStart: null,
    selectionEnd: null,
  });
  const typingTimerRef = useRef<number | null>(null);

  const updateStoredSurface = useCallback((nextSurface: DocumentSurface) => {
    const currentBundle = bundleRef.current;
    if (!currentBundle) return;
    const nextBundle = { ...currentBundle, surface: nextSurface };
    bundleRef.current = nextBundle;
    setBundle(nextBundle);
    writeStoredSession(nextBundle);
  }, []);

  const setReadyBundle = useCallback((nextBundle: DocumentSessionBundle) => {
    bundleRef.current = nextBundle;
    surfaceRef.current = nextBundle.surface;
    draftRef.current = {
      title: nextBundle.surface.document.title,
      body: nextBundle.surface.document.body,
    };
    dirtyRef.current = false;
    conflictRef.current = null;
    setBundle(nextBundle);
    setSurface(nextBundle.surface);
    setDraft(draftRef.current);
    setDirty(false);
    setConflictSurface(null);
    setSaveState("SAVED");
    setLoadState("READY");
    setLoadMessage("");
    setStatusMessage(null);
    setTargetSelection({ field: "BODY", startUtf16: 0, endUtf16: 0 });
    setCustomInstruction("");
    setRequestCopied(false);
    setHighlightedAnnotationId(null);
    writeStoredSession(nextBundle);
  }, []);

  const adoptCleanSurface = useCallback(
    (nextSurface: DocumentSurface) => {
      const reconciled = surfaceRef.current
        ? reconcileDocumentSurface(surfaceRef.current, nextSurface)
        : nextSurface;
      surfaceRef.current = reconciled;
      draftRef.current = {
        title: reconciled.document.title,
        body: reconciled.document.body,
      };
      dirtyRef.current = false;
      conflictRef.current = null;
      setSurface(reconciled);
      setDraft(draftRef.current);
      setDirty(false);
      setConflictSurface(null);
      setSaveState("SAVED");
      updateStoredSurface(reconciled);
    },
    [updateStoredSurface],
  );

  const adoptSurfaceMetadata = useCallback(
    (nextSurface: DocumentSurface) => {
      const reconciled = surfaceRef.current
        ? reconcileDocumentSurface(surfaceRef.current, nextSurface)
        : nextSurface;
      surfaceRef.current = reconciled;
      setSurface(reconciled);
      updateStoredSurface(reconciled);
    },
    [updateStoredSurface],
  );

  const reconcileRemoteSurface = useCallback(
    (nextSurface: DocumentSurface) => {
      const current = surfaceRef.current;
      if (!current) {
        adoptCleanSurface(nextSurface);
        return;
      }
      const reconciled = reconcileDocumentSurface(current, nextSurface);
      if (nextSurface.document.revision > current.document.revision && dirtyRef.current) {
        surfaceRef.current = reconciled;
        conflictRef.current = reconciled;
        setSurface(reconciled);
        setConflictSurface(reconciled);
        setSaveState("CONFLICT");
        setStatusMessage("A newer version arrived while you were writing.");
        updateStoredSurface(reconciled);
        return;
      }
      if (nextSurface.document.revision >= current.document.revision && !dirtyRef.current) {
        adoptCleanSurface(reconciled);
        return;
      }
      if (nextSurface.document.revision === current.document.revision) {
        adoptSurfaceMetadata(reconciled);
      }
    },
    [adoptCleanSurface, adoptSurfaceMetadata, updateStoredSurface],
  );

  useEffect(() => {
    let active = true;
    const initializationKey = launchOnMount ? "launch" : `join:${shareToken ?? "missing"}`;
    if (initializationRef.current?.key !== initializationKey) {
      const promise = (async (): Promise<InitializationOutcome> => {
        if (launchOnMount) {
          const result = await documentHttpService.launch({});
          return result.ok
            ? { kind: "READY", bundle: result.data, replaceRoute: true }
            : { kind: "ERROR", message: failureMessage(result) };
        }
        if (!shareToken) {
          return {
            kind: "UNAVAILABLE",
            message: "The link is missing. Start a new note to keep writing.",
          };
        }

        const stored = readStoredSession(shareToken);
        if (stored) {
          const inspected = await documentHttpService.inspect(stored.humanSessionToken);
          if (inspected.ok) {
            return {
              kind: "READY",
              bundle: { ...stored, surface: inspected.data },
              replaceRoute: false,
            };
          }
          if (inspected.code !== "UNAUTHORIZED" && inspected.code !== "NOT_FOUND") {
            return {
              kind: "READY",
              bundle: stored,
              replaceRoute: false,
              warning: failureMessage(inspected),
            };
          }
          removeStoredSession(shareToken);
        }

        const legacyCredentials = readLegacySessionCredentials(shareToken);
        if (legacyCredentials) {
          const inspected = await documentHttpService.inspect(
            legacyCredentials.humanSessionToken,
          );
          if (inspected.ok) {
            const migratedBundle: DocumentSessionBundle = {
              ...legacyCredentials,
              surface: inspected.data,
            };
            if (writeStoredSession(migratedBundle)) removeLegacySession(shareToken);
            return {
              kind: "READY",
              bundle: migratedBundle,
              replaceRoute: false,
            };
          }
          if (inspected.code === "UNAUTHORIZED" || inspected.code === "NOT_FOUND") {
            removeLegacySession(shareToken);
          } else {
            return {
              kind: "ERROR",
              message: failureMessage(inspected),
            };
          }
        }

        const joined = await documentHttpService.join({ shareToken });
        if (joined.ok) return { kind: "READY", bundle: joined.data, replaceRoute: false };
        const unavailable = joined.code === "NOT_FOUND" || joined.code === "INVALID_INPUT";
        return {
          kind: unavailable ? "UNAVAILABLE" : "ERROR",
          message: unavailable
            ? "The link may be invalid or expired. Start a new note to keep writing."
            : failureMessage(joined),
        };
      })();
      initializationRef.current = { key: initializationKey, promise };
    }

    void initializationRef.current.promise.then(
      (outcome) => {
        if (!active) return;
        if (outcome.kind !== "READY") {
          setLoadState(outcome.kind);
          setLoadMessage(outcome.message);
          return;
        }
        setReadyBundle(outcome.bundle);
        if (outcome.warning) setStatusMessage(outcome.warning);
        if (outcome.replaceRoute) {
          router.replace(`/document/${encodeURIComponent(outcome.bundle.shareToken)}`);
        }
      },
      (error: unknown) => {
        if (!active) return;
        setLoadState("ERROR");
        setLoadMessage(error instanceof Error ? error.message : "This note could not be opened.");
      },
    );
    return () => {
      active = false;
    };
  }, [launchOnMount, router, setReadyBundle, shareToken]);

  const saveDraft = useCallback(
    async (allowConflict = false): Promise<DocumentSurface | null> => {
      if (savePromiseRef.current) {
        await savePromiseRef.current;
        if (!dirtyRef.current) return surfaceRef.current;
        if (conflictRef.current && !allowConflict) return null;
      }
      const currentBundle = bundleRef.current;
      const currentSurface = surfaceRef.current;
      if (!currentBundle || !currentSurface) return null;
      if (!dirtyRef.current) return currentSurface;
      if (conflictRef.current && !allowConflict) return null;

      const submitted = { ...draftRef.current };
      const expectedRevision = currentSurface.document.revision;
      setSaveState("SAVING");
      setStatusMessage(null);

      const operation = (async () => {
        try {
          const result = await documentHttpService.saveHuman(currentBundle.humanSessionToken, {
            expectedRevision,
            requestId: crypto.randomUUID(),
            title: submitted.title,
            body: submitted.body,
          });
          if (!result.ok) {
            if (result.code === "STALE_WORK_STATE") {
              const reconciled = reconcileDocumentSurface(
                surfaceRef.current ?? result.currentSurface,
                result.currentSurface,
              );
              surfaceRef.current = reconciled;
              conflictRef.current = reconciled;
              setSurface(reconciled);
              setConflictSurface(reconciled);
              setSaveState("CONFLICT");
              setStatusMessage("A newer version arrived while you were writing.");
              updateStoredSurface(reconciled);
            } else {
              setSaveState("ERROR");
              setStatusMessage(failureMessage(result));
            }
            return null;
          }

          const reconciled = reconcileDocumentSurface(
            surfaceRef.current ?? result.data,
            result.data,
          );
          surfaceRef.current = reconciled;
          conflictRef.current = null;
          setSurface(reconciled);
          setConflictSurface(null);
          updateStoredSurface(reconciled);
          const unchangedDuringSave =
            draftRef.current.title === submitted.title && draftRef.current.body === submitted.body;
          if (unchangedDuringSave) {
            draftRef.current = {
              title: reconciled.document.title,
              body: reconciled.document.body,
            };
            dirtyRef.current = false;
            setDraft(draftRef.current);
            setDirty(false);
            setSaveState("SAVED");
          } else {
            setSaveState("UNSAVED");
          }
          return reconciled;
        } catch (error) {
          if (!isAbortError(error)) {
            setSaveState("ERROR");
            setStatusMessage(error instanceof Error ? error.message : "The note could not be saved.");
          }
          return null;
        }
      })();

      savePromiseRef.current = operation;
      try {
        return await operation;
      } finally {
        if (savePromiseRef.current === operation) savePromiseRef.current = null;
      }
    },
    [updateStoredSurface],
  );

  useEffect(() => {
    if (!dirty || conflictSurface || loadState !== "READY") return;
    const timeout = window.setTimeout(() => void saveDraft(), 700);
    return () => window.clearTimeout(timeout);
  }, [conflictSurface, dirty, draft, loadState, saveDraft]);

  useEffect(() => {
    const currentBundle = bundleRef.current;
    if (!currentBundle || loadState !== "READY") return;
    let active = true;
    let working = false;

    const heartbeat = async () => {
      if (working || !active) return;
      working = true;
      try {
        const currentSurface = surfaceRef.current;
        if (!currentSurface) return;
        const currentPresence = presenceWithinSurface(presenceRef.current, currentSurface);
        presenceRef.current = currentPresence;
        let result = await documentHttpService.touchPresence(currentBundle.humanSessionToken, {
          state: document.visibilityState === "hidden" ? "IDLE" : currentPresence.state,
          field: currentPresence.field,
          isTyping: currentPresence.isTyping,
          selectionStart: currentPresence.selectionStart,
          selectionEnd: currentPresence.selectionEnd,
          observedRevision: currentSurface.document.revision,
        });
        if (!result.ok && result.code === "INVALID_INPUT") {
          result = await documentHttpService.touchPresence(currentBundle.humanSessionToken, {
            state: document.visibilityState === "hidden" ? "IDLE" : "VIEWING",
            field: null,
            isTyping: false,
            selectionStart: null,
            selectionEnd: null,
            observedRevision: currentSurface.document.revision,
          });
        }
        if (active && result.ok) reconcileRemoteSurface(result.data);
      } catch {
        // Presence is advisory; autosave errors remain surfaced separately.
      } finally {
        working = false;
      }
    };

    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), 2_500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [bundle?.sessionInstanceId, loadState, reconcileRemoteSurface]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    };
  }, []);

  const markPresence = useCallback(
    (field: DocumentField, control: EditorControl | null, isTyping: boolean) => {
      const value = field === "TITLE" ? draftRef.current.title : draftRef.current.body;
      const selection = editorSelection(field, control);
      presenceRef.current = {
        state: "EDITING",
        field,
        isTyping,
        selectionStart: utf16IndexToCodePointOffset(value, selection.startUtf16),
        selectionEnd: utf16IndexToCodePointOffset(value, selection.endUtf16),
      };
      activeFieldRef.current = field;
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
      if (isTyping) {
        typingTimerRef.current = window.setTimeout(() => {
          presenceRef.current = { ...presenceRef.current, isTyping: false };
        }, 900);
      }
    },
    [],
  );

  const captureSelection = useCallback(
    (field: DocumentField, control: EditorControl | null, isTyping = false) => {
      setTargetSelection(editorSelection(field, control));
      setAnnotationSource("ANNOTATION_RAIL");
      markPresence(field, control, isTyping);
    },
    [markPresence],
  );

  useEffect(() => {
    const title = titleRef.current;
    const body = bodyRef.current;
    if (!title || !body) return;
    const captureTitle = () => captureSelection("TITLE", title);
    const captureBody = () => captureSelection("BODY", body);
    title.addEventListener("select", captureTitle);
    body.addEventListener("select", captureBody);
    return () => {
      title.removeEventListener("select", captureTitle);
      body.removeEventListener("select", captureBody);
    };
  }, [captureSelection, loadState]);

  const updateDraft = useCallback(
    (field: DocumentField, value: string, control: EditorControl | null) => {
      const clampedValue = clampCodePoints(
        value,
        field === "TITLE" ? DOCUMENT_TITLE_MAX_LENGTH : DOCUMENT_BODY_MAX_LENGTH,
      );
      const next = {
        ...draftRef.current,
        [field === "TITLE" ? "title" : "body"]: clampedValue,
      };
      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);
      setDirty(true);
      setSaveState(conflictRef.current ? "CONFLICT" : "UNSAVED");
      setStatusMessage(conflictRef.current ? "A newer version is waiting for your choice." : null);
      setTargetSelection(editorSelection(field, control));
      markPresence(field, control, true);
    },
    [markPresence],
  );

  const restoreEditorFocus = useCallback((selection: DocumentSelectionSnapshot) => {
    const control = selection.field === "TITLE" ? titleRef.current : bodyRef.current;
    window.requestAnimationFrame(() => {
      control?.focus();
      control?.setSelectionRange(selection.startUtf16, selection.endUtf16);
    });
  }, []);

  const requestRailFocus = useCallback((target: "HEADING" | "COMPOSER") => {
    railFocusTargetRef.current = target;
    setRailOpen(true);
    setRailFocusRequest((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!railOpen || railFocusRequest === 0) return;
    const frame = window.requestAnimationFrame(() => {
      if (railFocusTargetRef.current === "COMPOSER") composerRef.current?.focus();
      else railHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [railFocusRequest, railOpen]);

  const closeRail = useCallback(() => {
    setRailOpen(false);
    window.requestAnimationFrame(() => railToggleRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      const field = activeFieldRef.current;
      const control = field === "TITLE" ? titleRef.current : bodyRef.current;
      setTargetSelection(editorSelection(field, control));
      setAnnotationSource("KEYBOARD");
      setStatusMessage(null);
      requestRailFocus("COMPOSER");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestRailFocus]);

  const currentStage = surface?.document.stage ?? "BRAINSTORMING";
  const commands = useMemo(() => getDocumentAgentCommands(currentStage), [currentStage]);
  const genericTarget = useMemo(() => {
    const text = targetSelection.field === "TITLE" ? draft.title : draft.body;
    return resolveDocumentActionTarget({
      field: targetSelection.field,
      text,
      presetId: "custom",
      startUtf16: targetSelection.startUtf16,
      endUtf16: targetSelection.endUtf16,
    });
  }, [draft.body, draft.title, targetSelection]);
  const targetPreview: AnnotationTargetPreview = useMemo(
    () => ({
      fieldLabel: targetSelection.field === "TITLE" ? "Title" : "Body",
      targetLabel: documentTargetLabel(genericTarget.targetKind),
      excerpt: previewExcerpt(
        genericTarget.selectedText,
        genericTarget.targetKind === "CARET"
          ? "Insert at the caret"
          : `Whole ${targetSelection.field === "TITLE" ? "title" : "body"}`,
      ),
    }),
    [genericTarget, targetSelection.field],
  );

  const createAnnotation = useCallback(
    async (command: DocumentAgentCommand) => {
      const currentBundle = bundleRef.current;
      if (!currentBundle || !surfaceRef.current || composerBusy) return;
      const trimmedCustom = customInstruction.trim();
      if (command.presetId === "custom" && trimmedCustom.length === 0) {
        setStatusMessage("Write a short instruction for your agent.");
        composerRef.current?.focus();
        return;
      }

      setComposerBusy(true);
      setStatusMessage(null);
      const selection = targetSelection;
      try {
        const savedSurface = await saveDraft();
        if (!savedSurface || conflictRef.current) return;
        const text =
          selection.field === "TITLE" ? savedSurface.document.title : savedSurface.document.body;
        const target = resolveDocumentActionTarget({
          field: selection.field,
          text,
          presetId: command.presetId,
          startUtf16: selection.startUtf16,
          endUtf16: selection.endUtf16,
        });
        const annotationBase = {
          expectedRevision: savedSurface.document.revision,
          requestId: crypto.randomUUID(),
          source: annotationSource,
          targetField: target.targetField,
          targetKind: target.targetKind,
          rangeStart: target.rangeStart,
          rangeEnd: target.rangeEnd,
        };
        const annotationInput: CreateDocumentAnnotationInput =
          command.presetId === "custom"
            ? { ...annotationBase, presetId: "custom", customInstruction: trimmedCustom }
            : { ...annotationBase, presetId: command.presetId };
        const result = await documentHttpService.createAnnotation(
          currentBundle.humanSessionToken,
          annotationInput,
        );
        if (!result.ok) {
          if (result.code === "STALE_WORK_STATE") reconcileRemoteSurface(result.currentSurface);
          setStatusMessage(failureMessage(result));
          return;
        }
        adoptSurfaceMetadata(result.data);
        const added = result.data.annotations.find(
          (annotation) =>
            annotation.createdBy.memberId === currentBundle.selfMemberId &&
            !savedSurface.annotations.some(
              (existing) => existing.annotationId === annotation.annotationId,
            ),
        );
        if (added) setHighlightedAnnotationId(added.annotationId);
        setCustomInstruction("");
        setAnnotationSource("ANNOTATION_RAIL");
        setRequestCopied(false);
        setStatusMessage(`${command.label} added to the queue.`);
        restoreEditorFocus(selection);
      } catch (error) {
        if (!isAbortError(error)) {
          setStatusMessage(error instanceof Error ? error.message : "The annotation could not be added.");
        }
      } finally {
        setComposerBusy(false);
      }
    },
    [
      adoptSurfaceMetadata,
      annotationSource,
      composerBusy,
      customInstruction,
      reconcileRemoteSurface,
      restoreEditorFocus,
      saveDraft,
      targetSelection,
    ],
  );

  const submitCustomAnnotation = useCallback(() => {
    const command = commands.find((candidate) => candidate.presetId === "custom");
    if (command) void createAnnotation(command);
  }, [commands, createAnnotation]);

  const clearComposer = useCallback(() => {
    setCustomInstruction("");
    setAnnotationSource("ANNOTATION_RAIL");
    setStatusMessage(null);
    restoreEditorFocus(targetSelection);
  }, [restoreEditorFocus, targetSelection]);

  const cancelAnnotation = useCallback(
    async (annotationId: string) => {
      const currentBundle = bundleRef.current;
      const annotation = surfaceRef.current?.annotations.find(
        (candidate) => candidate.annotationId === annotationId,
      );
      if (
        !currentBundle ||
        !annotation ||
        annotation.status !== "PENDING" ||
        annotation.createdBy.memberId !== currentBundle.selfMemberId ||
        cancellingAnnotationId
      ) return;

      setCancellingAnnotationId(annotationId);
      setStatusMessage(null);
      try {
        const result = await documentHttpService.cancelAnnotation(currentBundle.humanSessionToken, {
          annotationId,
          requestId: crypto.randomUUID(),
        });
        if (!result.ok) {
          if (result.code === "STALE_WORK_STATE") reconcileRemoteSurface(result.currentSurface);
          setStatusMessage(failureMessage(result));
          return;
        }
        adoptSurfaceMetadata(result.data);
        setHighlightedAnnotationId(null);
        setStatusMessage("Annotation cancelled.");
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "The annotation could not be cancelled.");
      } finally {
        setCancellingAnnotationId(null);
      }
    },
    [adoptSurfaceMetadata, cancellingAnnotationId, reconcileRemoteSurface],
  );

  const changeStage = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const stage = event.target.value as DocumentStage;
      const currentBundle = bundleRef.current;
      if (!currentBundle || !surfaceRef.current) return;
      setStageBusy(true);
      setStatusMessage(null);
      try {
        const savedSurface = await saveDraft();
        if (!savedSurface || conflictRef.current) return;
        const result = await documentHttpService.setStage(currentBundle.humanSessionToken, {
          expectedRevision: savedSurface.document.revision,
          requestId: crypto.randomUUID(),
          stage,
        });
        if (!result.ok) {
          if (result.code === "STALE_WORK_STATE") reconcileRemoteSurface(result.currentSurface);
          setStatusMessage(failureMessage(result));
          return;
        }
        if (dirtyRef.current) reconcileRemoteSurface(result.data);
        else adoptCleanSurface(result.data);

        const preparation = findAddedStagePreparation(savedSurface, result.data);
        if (preparation) {
          setHighlightedAnnotationId(preparation.annotationId);
          setRailOpen(true);
          setRequestCopied(false);
          setStatusMessage(
            `Stage moved to ${DOCUMENT_STAGE_LABELS[stage]}. ${preparation.label} was added to the queue.`,
          );
          window.requestAnimationFrame(() => {
            document.getElementById(`annotation-${preparation.annotationId}`)?.scrollIntoView({
              block: "nearest",
            });
          });
        } else {
          setStatusMessage(`Stage set to ${DOCUMENT_STAGE_LABELS[stage]}.`);
        }
      } catch (error) {
        if (!isAbortError(error)) {
          setStatusMessage(error instanceof Error ? error.message : "The stage could not be changed.");
        }
      } finally {
        setStageBusy(false);
      }
    },
    [adoptCleanSurface, reconcileRemoteSurface, saveDraft],
  );

  const useLatest = useCallback(() => {
    if (!conflictRef.current) return;
    adoptCleanSurface(conflictRef.current);
    setStatusMessage("Using the latest shared version.");
  }, [adoptCleanSurface]);

  const keepMine = useCallback(async () => {
    if (!conflictRef.current) return;
    const result = await saveDraft(true);
    if (result) setStatusMessage("Your version is now shared.");
  }, [saveDraft]);

  const copyShareLink = useCallback(async () => {
    if (!bundleRef.current) return;
    const link = `${window.location.origin}/document/${encodeURIComponent(bundleRef.current.shareToken)}`;
    try {
      await navigator.clipboard.writeText(link);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1_600);
    } catch {
      setStatusMessage("Copy the address from your browser to share this note.");
    }
  }, []);

  const copyAgentRequest = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DOCUMENT_AGENT_REQUEST);
      setRequestCopied(true);
    } catch {
      setStatusMessage(`Copy this request: ${DOCUMENT_AGENT_REQUEST}`);
    }
  }, []);

  const createNewNote = useCallback(async () => {
    const wasDirty = dirtyRef.current;
    if (wasDirty && !window.confirm("Save this note and start a new one?")) return;
    setStatusMessage(null);
    if (wasDirty) {
      const saved = await saveDraft();
      if (!saved || dirtyRef.current) return;
    }
    try {
      const result = await documentHttpService.launch({});
      if (!result.ok) {
        setStatusMessage(failureMessage(result));
        return;
      }
      setReadyBundle(result.data);
      router.replace(`/document/${encodeURIComponent(result.data.shareToken)}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "A new note could not be opened.");
    }
  }, [router, saveDraft, setReadyBundle]);

  const undoAgentEdit = useCallback(async () => {
    const currentBundle = bundleRef.current;
    const currentSurface = surfaceRef.current;
    const undo = currentSurface?.undoAgentEdit;
    if (!currentBundle || !currentSurface || !undo) return;
    if (dirtyRef.current) {
      setStatusMessage("Undo the agent edit before making new changes.");
      return;
    }
    try {
      const result = await documentHttpService.undoAgentEdit(currentBundle.humanSessionToken, {
        expectedRevision: currentSurface.document.revision,
        requestId: crypto.randomUUID(),
        agentRevision: undo.agentRevision,
      });
      if (!result.ok) {
        if (result.code === "STALE_WORK_STATE") reconcileRemoteSurface(result.currentSurface);
        setStatusMessage(failureMessage(result));
        return;
      }
      if (dirtyRef.current) reconcileRemoteSurface(result.data);
      else adoptCleanSurface(result.data);
      setStatusMessage("Agent edit undone.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "The agent edit could not be undone.");
    }
  }, [adoptCleanSurface, reconcileRemoteSurface]);

  const onRailKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || !window.matchMedia("(max-width: 739px)").matches) return;
      event.preventDefault();
      event.stopPropagation();
      closeRail();
    },
    [closeRail],
  );

  const annotations = surface?.annotations ?? [];
  const pendingCount = annotations.filter((annotation) => annotation.status === "PENDING").length;
  const otherPeople = useMemo(
    () => surface?.presence.filter((person) => person.memberId !== bundle?.selfMemberId) ?? [],
    [bundle?.selfMemberId, surface?.presence],
  );
  const collaborationMessage =
    surface && bundle ? presenceDescription(surface, bundle.selfMemberId) : null;
  const saveLabel =
    saveState === "SAVING"
      ? "Saving…"
      : saveState === "UNSAVED"
        ? "Unsaved"
        : saveState === "CONFLICT"
          ? "Needs your choice"
          : saveState === "ERROR"
            ? "Not saved"
            : "Saved";

  return (
    <div
      className={styles.shell}
      data-testid="document-editor"
      data-rail-open={railOpen ? "true" : "false"}
    >
      <header className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.wordmark}>Ratiflow</span>
          <button className={styles.quietButton} type="button" onClick={() => void createNewNote()}>
            New note
          </button>
        </div>

        <div className={styles.stageControl} title="Only people can change the document stage">
          <label htmlFor="document-stage">Human stage</label>
          <select
            id="document-stage"
            aria-label="Document stage"
            value={surface?.document.stage ?? "BRAINSTORMING"}
            onChange={(event) => void changeStage(event)}
            disabled={!surface || stageBusy || loadState !== "READY"}
          >
            {DOCUMENT_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {DOCUMENT_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.toolbarGroup} ${styles.toolbarEnd}`}>
          <div className={styles.people} aria-label={`${otherPeople.length} other people here`}>
            {otherPeople.slice(0, 3).map((person) => (
              <span
                className={styles.avatar}
                key={person.memberId}
                style={{ backgroundColor: person.color }}
                title={`${person.displayName} · ${person.state.toLowerCase()}`}
              >
                {person.displayName.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {otherPeople.length > 3 ? (
              <span className={styles.avatarMore}>+{otherPeople.length - 3}</span>
            ) : null}
          </div>
          <button
            className={styles.quietButton}
            type="button"
            onClick={() => void copyShareLink()}
            disabled={!bundle}
          >
            {shareCopied ? "Link copied" : "Share"}
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <main className={styles.editorWrap}>
          {loadState === "UNAVAILABLE" || loadState === "ERROR" ? (
            <section className={styles.emptyState} aria-live="polite">
              <h1>
                {loadState === "UNAVAILABLE"
                  ? "This note is no longer available"
                  : "Couldn’t open this note"}
              </h1>
              <p>{loadMessage}</p>
              <button className={styles.primaryButton} type="button" onClick={() => void createNewNote()}>
                New note
              </button>
            </section>
          ) : (
            <section
              className={styles.writingSurface}
              aria-busy={loadState === "LOADING"}
              data-testid="writing-surface"
            >
              <label className={styles.srOnly} htmlFor="document-title">Note title</label>
              <input
                ref={titleRef}
                id="document-title"
                className={styles.titleInput}
                value={draft.title}
                placeholder={loadState === "LOADING" ? "Opening note…" : "Title"}
                disabled={loadState !== "READY"}
                onFocus={(event) => captureSelection("TITLE", event.currentTarget)}
                onSelect={(event) => captureSelection("TITLE", event.currentTarget)}
                onChange={(event) => updateDraft("TITLE", event.target.value, event.currentTarget)}
                autoComplete="off"
              />
              <label className={styles.srOnly} htmlFor="document-body">Note body</label>
              <textarea
                ref={bodyRef}
                id="document-body"
                className={styles.bodyInput}
                value={draft.body}
                placeholder={loadState === "READY" ? "Start writing…" : ""}
                disabled={loadState !== "READY"}
                onFocus={(event) => captureSelection("BODY", event.currentTarget)}
                onSelect={(event) => captureSelection("BODY", event.currentTarget)}
                onChange={(event) => updateDraft("BODY", event.target.value, event.currentTarget)}
                spellCheck
              />

              <footer className={styles.documentStatus} aria-live="polite">
                <span className={styles.saveState} data-state={saveState.toLowerCase()}>
                  {loadState === "LOADING" ? loadMessage : saveLabel}
                </span>
                {collaborationMessage ? <span>{collaborationMessage}</span> : null}
                {!collaborationMessage && surface?.document.lastEditor ? (
                  <span>Last edited by {surface.document.lastEditor.displayName}</span>
                ) : null}
                <span className={styles.shortcutHint}>
                  Annotate in the rail or <kbd>⌘K</kbd> · Right-click stays native
                </span>
              </footer>
            </section>
          )}
        </main>

        {loadState === "READY" ? (
          <AnnotationRail
            open={railOpen}
            headingRef={railHeadingRef}
            composerRef={composerRef}
            stage={currentStage}
            target={targetPreview}
            commands={commands}
            customInstruction={customInstruction}
            composerBusy={composerBusy}
            cancellingAnnotationId={cancellingAnnotationId}
            annotations={annotations}
            selfMemberId={bundle?.selfMemberId ?? null}
            highlightedAnnotationId={highlightedAnnotationId}
            webMcpSupported={webMcpSupported}
            agentApplying={agentApplying}
            requestCopied={requestCopied}
            onCustomInstructionChange={setCustomInstruction}
            onPreset={(command) => void createAnnotation(command)}
            onSubmitCustom={submitCustomAnnotation}
            onClear={clearComposer}
            onCancelAnnotation={(annotationId) => void cancelAnnotation(annotationId)}
            onCopyAgentRequest={() => void copyAgentRequest()}
            onClose={closeRail}
            onKeyDown={onRailKeyDown}
          />
        ) : null}
      </div>

      {loadState === "READY" ? (
        <button
          ref={railToggleRef}
          className={styles.railToggle}
          type="button"
          aria-controls="annotation-rail"
          aria-expanded={railOpen}
          onClick={() => {
            if (railOpen) closeRail();
            else requestRailFocus("HEADING");
          }}
        >
          <span>Annotations</span>
          <span>{pendingCount}</span>
        </button>
      ) : null}

      {conflictSurface ? (
        <aside className={styles.conflictBanner} aria-live="assertive">
          <div>
            <strong>A newer version is available</strong>
            <span>Your writing is still here. Choose which version to keep.</span>
          </div>
          <div className={styles.bannerActions}>
            <button type="button" onClick={useLatest}>Use latest</button>
            <button type="button" onClick={() => void keepMine()}>Keep mine</button>
          </div>
        </aside>
      ) : null}

      {surface?.undoAgentEdit ? (
        <aside className={styles.undoToast} aria-live="polite">
          <span>Agent edit applied</span>
          <button type="button" onClick={() => void undoAgentEdit()}>Undo</button>
        </aside>
      ) : null}

      {statusMessage && !conflictSurface ? (
        <div className={styles.statusToast} role="status">{statusMessage}</div>
      ) : null}

      {surface && bundle ? (
        <DocumentWebMCPBridge
          surface={surface}
          sessionInstanceId={bundle.sessionInstanceId}
          agentSessionToken={bundle.agentSessionToken}
          selfMemberId={bundle.selfMemberId}
          service={documentHttpService}
          onStatusChange={(status) => {
            setWebMcpSupported(status.supported);
            if (status.error) setStatusMessage(status.error);
          }}
          onAuthoritativeSurface={reconcileRemoteSurface}
          onToolExecutionChange={(tool) => setAgentApplying(tool !== null)}
        />
      ) : null}
    </div>
  );
}
