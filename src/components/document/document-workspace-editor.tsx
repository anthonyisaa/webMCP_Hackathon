"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  DOCUMENT_BODY_MAX_LENGTH,
  DOCUMENT_HUMAN_RATIONALE_MAX_LENGTH,
  DOCUMENT_TITLE_MAX_LENGTH,
  DOCUMENT_WORK_INSTRUCTION_MAX_LENGTH,
  DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
  DOCUMENT_WORKSPACE_SESSION_STORAGE_PREFIX,
  type DocumentField,
  type DocumentMemoryEvent,
  type DocumentPresence,
  type DocumentSessionBundleV3,
  type DocumentSurfaceV3,
  type DocumentV3Failure,
  type DocumentWorkIntent,
  type DocumentWorkOrder,
  type DocumentWorkSource,
} from "@/document/contracts";
import {
  codePointOffsetToUtf16Index,
  utf16IndexToCodePointOffset,
} from "@/document/range";
import { reconcileDocumentWorkspaceSurface } from "@/document/workspace-surface-reconciliation";
import {
  DocumentWorkspaceWebMCPBridge,
  type DocumentWorkspaceWebMCPBridgeStatus,
} from "./DocumentWorkspaceWebMCPBridge";
import { documentWorkspaceHttpService } from "./document-workspace-http-service";
import styles from "./document-workspace-editor.module.css";

type LoadState = "LOADING" | "READY" | "UNAVAILABLE" | "ERROR";
type SaveState = "SAVED" | "UNSAVED" | "SAVING" | "CONFLICT" | "ERROR";
type RailTab = "WORK" | "MEMORY";
type EditorControl = HTMLInputElement | HTMLTextAreaElement;

interface DocumentWorkspaceEditorProps {
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

interface SelectionSnapshot {
  field: DocumentField;
  startUtf16: number;
  endUtf16: number;
  rangeStart: number;
  rangeEnd: number;
  selectedText: string;
}

interface ComposerTarget extends SelectionSnapshot {
  expectedRevision: number;
}

interface ComposerState {
  target: ComposerTarget;
  source: DocumentWorkSource;
  intent: DocumentWorkIntent;
  instruction: string;
  assignedToMemberId: string;
}

interface PointerContextRecord {
  pointerId: number;
  target: EditorControl;
  field: DocumentField;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  selection: SelectionSnapshot;
  timeStamp: number;
}

interface AppMenuState {
  x: number;
  y: number;
  selection: SelectionSnapshot;
}

type InitializationOutcome =
  | {
      kind: "READY";
      bundle: DocumentSessionBundleV3;
      replaceRoute: boolean;
      warning?: string;
    }
  | { kind: "UNAVAILABLE" | "ERROR"; message: string };

const BOOTSTRAP_FRAGMENT_PREFIX = "#ratiflow-bootstrap=";
const CONTEXT_POINTER_WINDOW_MS = 1_000;
const PRESENCE_TTL_MS = 15_000;
const PRESENCE_HEARTBEAT_MS = 5_000;
const POLL_INTERVAL_MS = 2_500;
const AUTOSAVE_DELAY_MS = 700;

const WORK_INTENT_LABELS: Record<DocumentWorkIntent, string> = {
  REWRITE: "Rewrite",
  RESEARCH: "Research",
  CUSTOM: "Custom",
};

const WORK_STATUS_LABELS: Record<DocumentWorkOrder["status"], string> = {
  PENDING: "Assigned",
  PROPOSED: "Proposal ready",
  COMPLETED: "Accepted",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  STALE: "Needs a new selection",
};

const EVENT_LABELS: Record<DocumentMemoryEvent["kind"], string> = {
  DOCUMENT_EDITED: "Document edited",
  WORK_CREATED: "Work assigned",
  PROPOSAL_SUBMITTED: "Proposal submitted",
  PROPOSAL_ACCEPTED: "Proposal accepted",
  PROPOSAL_REJECTED: "Proposal rejected",
  WORK_CANCELLED: "Work cancelled",
  WORK_STALE: "Work became stale",
};

const REWRITE_INSTRUCTION =
  "Rewrite the selected text for clarity while preserving its meaning and factual qualifications.";
const RESEARCH_INSTRUCTION =
  "Research the selected claim. Replace it only with a concise, evidence-aware version, make uncertainty explicit, and do not invent citations.";

function sessionStorageKey(shareToken: string): string {
  return `${DOCUMENT_WORKSPACE_SESSION_STORAGE_PREFIX}${shareToken}`;
}

function clearBootstrapFragment(): void {
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

function hasSurfaceShape(value: unknown): value is DocumentSurfaceV3 {
  if (!value || typeof value !== "object") return false;
  const surface = value as Partial<DocumentSurfaceV3>;
  return (
    Boolean(surface.document) &&
    surface.document?.protocolVersion === DOCUMENT_WORKSPACE_PROTOCOL_VERSION &&
    typeof surface.document.id === "string" &&
    typeof surface.document.title === "string" &&
    typeof surface.document.body === "string" &&
    Number.isSafeInteger(surface.document.revision) &&
    Number.isSafeInteger(surface.document.activityVersion) &&
    Array.isArray(surface.presence) &&
    Array.isArray(surface.workOrders) &&
    Array.isArray(surface.memory)
  );
}

function hasSessionShape(
  value: unknown,
  expectedShareToken?: string,
): value is DocumentSessionBundleV3 {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<DocumentSessionBundleV3>;
  return (
    bundle.protocolVersion === DOCUMENT_WORKSPACE_PROTOCOL_VERSION &&
    typeof bundle.shareToken === "string" &&
    bundle.shareToken.length > 0 &&
    (!expectedShareToken || bundle.shareToken === expectedShareToken) &&
    typeof bundle.humanSessionToken === "string" &&
    bundle.humanSessionToken.length > 0 &&
    typeof bundle.agentSessionToken === "string" &&
    bundle.agentSessionToken.length > 0 &&
    bundle.agentSessionToken !== bundle.humanSessionToken &&
    typeof bundle.sessionInstanceId === "string" &&
    bundle.sessionInstanceId.length > 0 &&
    typeof bundle.selfMemberId === "string" &&
    bundle.selfMemberId.length > 0 &&
    typeof bundle.expiresAt === "string" &&
    Number.isFinite(Date.parse(bundle.expiresAt)) &&
    Date.parse(bundle.expiresAt) > Date.now() &&
    hasSurfaceShape(bundle.surface)
  );
}

function decodeBootstrapBundle(
  hash: string,
  expectedShareToken?: string,
): DocumentSessionBundleV3 | null {
  if (!hash.startsWith(BOOTSTRAP_FRAGMENT_PREFIX)) return null;
  const encoded = hash.slice(BOOTSTRAP_FRAGMENT_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return hasSessionShape(parsed, expectedShareToken) ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredSession(shareToken: string): DocumentSessionBundleV3 | null {
  const key = sessionStorageKey(shareToken);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!hasSessionShape(parsed, shareToken)) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Best-effort bearer cleanup only.
    }
    return null;
  }
}

function writeStoredSession(bundle: DocumentSessionBundleV3): boolean {
  try {
    window.sessionStorage.setItem(
      sessionStorageKey(bundle.shareToken),
      JSON.stringify(bundle),
    );
    return true;
  } catch {
    return false;
  }
}

function removeStoredSession(shareToken?: string): void {
  if (!shareToken) return;
  try {
    window.sessionStorage.removeItem(sessionStorageKey(shareToken));
  } catch {
    // Best-effort bearer cleanup only.
  }
}

function failureMessage(failure: DocumentV3Failure): string {
  return failure.message || "The shared note could not be updated. Please try again.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function clampCodePoints(value: string, maximum: number): string {
  const points = Array.from(value);
  return points.length > maximum ? points.slice(0, maximum).join("") : value;
}

function compactExcerpt(value: string, maximum = 150): string {
  const compact = value.replace(/\s+/g, " ").trim();
  const points = Array.from(compact);
  return points.length > maximum
    ? `${points.slice(0, maximum - 1).join("")}…`
    : compact;
}

function selectionFromControl(
  field: DocumentField,
  control: EditorControl,
): SelectionSnapshot {
  const startUtf16 = Math.min(
    control.selectionStart ?? control.value.length,
    control.selectionEnd ?? control.value.length,
  );
  const endUtf16 = Math.max(
    control.selectionStart ?? control.value.length,
    control.selectionEnd ?? control.value.length,
  );
  return {
    field,
    startUtf16,
    endUtf16,
    rangeStart: utf16IndexToCodePointOffset(control.value, startUtf16),
    rangeEnd: utf16IndexToCodePointOffset(control.value, endUtf16),
    selectedText: control.value.slice(startUtf16, endUtf16),
  };
}

function sameSelection(
  left: SelectionSnapshot,
  right: SelectionSnapshot,
): boolean {
  return (
    left.field === right.field &&
    left.rangeStart === right.rangeStart &&
    left.rangeEnd === right.rangeEnd &&
    left.selectedText === right.selectedText
  );
}

function defaultInstruction(intent: DocumentWorkIntent): string {
  if (intent === "REWRITE") return REWRITE_INSTRUCTION;
  if (intent === "RESEARCH") return RESEARCH_INSTRUCTION;
  return "";
}

function activeMembers(surface: DocumentSurfaceV3 | null): DocumentPresence[] {
  if (!surface) return [];
  const now = Date.now();
  return surface.presence.filter((person) => {
    const seen = Date.parse(person.lastSeenAt);
    return Number.isFinite(seen) && now - seen <= PRESENCE_TTL_MS;
  });
}

function memberInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? words.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

function formatEventTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function workOrderRank(order: DocumentWorkOrder): number {
  if (order.status === "PROPOSED") return 0;
  if (order.status === "PENDING") return 1;
  return 2;
}

function orderedWorkOrders(orders: DocumentWorkOrder[]): DocumentWorkOrder[] {
  return [...orders].sort(
    (left, right) =>
      workOrderRank(left) - workOrderRank(right) ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.workOrderId.localeCompare(right.workOrderId),
  );
}

function MemoryEventCard({ event }: { event: DocumentMemoryEvent }) {
  return (
    <li className={styles.memoryEvent} data-event-kind={event.kind}>
      <span className={styles.timelineDot} aria-hidden="true" />
      <div className={styles.eventHeading}>
        <strong>{EVENT_LABELS[event.kind]}</strong>
        <time dateTime={event.createdAt}>{formatEventTime(event.createdAt)}</time>
      </div>
      <p className={styles.eventMeta}>
        {event.actor.displayName} · r{event.resultRevision} · activity {event.activityVersion}
      </p>
      {event.instructionExcerpt ? (
        <p className={styles.eventCopy}>{event.instructionExcerpt}</p>
      ) : null}
      {event.changeSummary ? (
        <p className={styles.untrustedSummary}>
          <span>Agent summary · untrusted</span>
          {event.changeSummary}
        </p>
      ) : null}
      {event.diffs.map((diff) => (
        <div className={styles.miniDiff} key={`${event.eventId}-${diff.field}`}>
          <span>{diff.field === "TITLE" ? "Title" : "Body"}</span>
          <del>{diff.beforeExcerpt || "Empty"}</del>
          <ins>{diff.afterExcerpt || "Removed"}</ins>
        </div>
      ))}
      {event.rationale ? (
        <blockquote className={styles.rationaleMemory}>
          <span>Human rationale</span>
          {event.rationale}
        </blockquote>
      ) : null}
    </li>
  );
}

export function DocumentWorkspaceEditor({
  launchOnMount = false,
  shareToken,
}: DocumentWorkspaceEditorProps) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("LOADING");
  const [loadMessage, setLoadMessage] = useState("Opening your note…");
  const [bundle, setBundle] = useState<DocumentSessionBundleV3 | null>(null);
  const [surface, setSurface] = useState<DocumentSurfaceV3 | null>(null);
  const [draft, setDraft] = useState<DraftValue>({ title: "", body: "" });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("SAVED");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [conflictSurface, setConflictSurface] = useState<DocumentSurfaceV3 | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionSnapshot | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [appMenu, setAppMenu] = useState<AppMenuState | null>(null);
  const [railTab, setRailTab] = useState<RailTab>("WORK");
  const [railOpen, setRailOpen] = useState(false);
  const [railFocusRequested, setRailFocusRequested] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [workBusyId, setWorkBusyId] = useState<string | null>(null);
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [webMCPStatus, setWebMCPStatus] =
    useState<DocumentWorkspaceWebMCPBridgeStatus | null>(null);

  const bundleRef = useRef<DocumentSessionBundleV3 | null>(null);
  const surfaceRef = useRef<DocumentSurfaceV3 | null>(null);
  const draftRef = useRef<DraftValue>(draft);
  const dirtyRef = useRef(false);
  const conflictRef = useRef<DocumentSurfaceV3 | null>(null);
  const savePromiseRef = useRef<Promise<DocumentSurfaceV3 | null> | null>(null);
  const initializationRef = useRef<{
    key: string;
    promise: Promise<InitializationOutcome>;
  } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const composerInstructionRef = useRef<HTMLTextAreaElement>(null);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const railHeadingRef = useRef<HTMLHeadingElement>(null);
  const pointerContextRef = useRef<PointerContextRecord | null>(null);
  const presenceRef = useRef<PresenceDraft>({
    state: "VIEWING",
    field: null,
    isTyping: false,
    selectionStart: null,
    selectionEnd: null,
  });
  const typingTimerRef = useRef<number | null>(null);
  const humanSessionToken = bundle?.humanSessionToken ?? null;
  const activeShareToken = bundle?.shareToken ?? null;

  const updateStoredSurface = useCallback((nextSurface: DocumentSurfaceV3) => {
    const currentBundle = bundleRef.current;
    if (!currentBundle) return;
    const nextBundle = { ...currentBundle, surface: nextSurface };
    bundleRef.current = nextBundle;
    setBundle(nextBundle);
    writeStoredSession(nextBundle);
  }, []);

  const setReadyBundle = useCallback((nextBundle: DocumentSessionBundleV3) => {
    bundleRef.current = nextBundle;
    surfaceRef.current = nextBundle.surface;
    const nextDraft = {
      title: nextBundle.surface.document.title,
      body: nextBundle.surface.document.body,
    };
    draftRef.current = nextDraft;
    dirtyRef.current = false;
    conflictRef.current = null;
    setBundle(nextBundle);
    setSurface(nextBundle.surface);
    setDraft(nextDraft);
    setDirty(false);
    setConflictSurface(null);
    setSaveState("SAVED");
    setLoadState("READY");
    setLoadMessage("");
    setStatusMessage(null);
    setWebMCPStatus(null);
    setComposer(null);
    setAppMenu(null);
    writeStoredSession(nextBundle);
  }, []);

  const adoptCleanSurface = useCallback(
    (incoming: DocumentSurfaceV3) => {
      const reconciled = surfaceRef.current
        ? reconcileDocumentWorkspaceSurface(surfaceRef.current, incoming)
        : incoming;
      const nextDraft = {
        title: reconciled.document.title,
        body: reconciled.document.body,
      };
      surfaceRef.current = reconciled;
      draftRef.current = nextDraft;
      dirtyRef.current = false;
      conflictRef.current = null;
      setSurface(reconciled);
      setDraft(nextDraft);
      setDirty(false);
      setConflictSurface(null);
      setSaveState("SAVED");
      updateStoredSurface(reconciled);
    },
    [updateStoredSurface],
  );

  const adoptSurfaceMetadata = useCallback(
    (incoming: DocumentSurfaceV3) => {
      const reconciled = surfaceRef.current
        ? reconcileDocumentWorkspaceSurface(surfaceRef.current, incoming)
        : incoming;
      surfaceRef.current = reconciled;
      setSurface(reconciled);
      updateStoredSurface(reconciled);
    },
    [updateStoredSurface],
  );

  const reconcileRemoteSurface = useCallback(
    (incoming: DocumentSurfaceV3) => {
      const current = surfaceRef.current;
      if (!current) {
        adoptCleanSurface(incoming);
        return;
      }
      const reconciled = reconcileDocumentWorkspaceSurface(current, incoming);
      if (reconciled.document.revision > current.document.revision) {
        if (dirtyRef.current) {
          surfaceRef.current = reconciled;
          conflictRef.current = reconciled;
          setSurface(reconciled);
          setConflictSurface(reconciled);
          setSaveState("CONFLICT");
          setStatusMessage("A newer version arrived while you were writing.");
          updateStoredSurface(reconciled);
        } else {
          adoptCleanSurface(reconciled);
        }
        return;
      }
      adoptSurfaceMetadata(reconciled);
    },
    [adoptCleanSurface, adoptSurfaceMetadata, updateStoredSurface],
  );

  useEffect(() => {
    let active = true;
    const initializationKey = launchOnMount
      ? "launch-v3"
      : `join-v3:${shareToken ?? "missing"}:${window.location.hash ? "fragment" : "plain"}`;

    if (initializationRef.current?.key !== initializationKey) {
      const promise = (async (): Promise<InitializationOutcome> => {
        const hasBootstrapFragment = window.location.hash.startsWith(
          BOOTSTRAP_FRAGMENT_PREFIX,
        );
        if (hasBootstrapFragment) {
          const bootstrapBundle = decodeBootstrapBundle(window.location.hash, shareToken);
          if (!bootstrapBundle) {
            removeStoredSession(shareToken);
            clearBootstrapFragment();
            return {
              kind: "UNAVAILABLE",
              message: "This access link is invalid or has expired. Start a new note to continue.",
            };
          }
          const inspected = await documentWorkspaceHttpService.inspect(
            bootstrapBundle.humanSessionToken,
          );
          if (
            !inspected.ok ||
            inspected.data.document.id !== bootstrapBundle.surface.document.id ||
            inspected.data.document.protocolVersion !== DOCUMENT_WORKSPACE_PROTOCOL_VERSION
          ) {
            removeStoredSession(bootstrapBundle.shareToken);
            clearBootstrapFragment();
            return {
              kind: "UNAVAILABLE",
              message: "This access link is invalid or has expired. Start a new note to continue.",
            };
          }
          const validatedBundle = { ...bootstrapBundle, surface: inspected.data };
          if (!writeStoredSession(validatedBundle)) {
            clearBootstrapFragment();
            return {
              kind: "ERROR",
              message: "This browser blocked session storage, so the secure document session could not start.",
            };
          }
          clearBootstrapFragment();
          return { kind: "READY", bundle: validatedBundle, replaceRoute: false };
        }

        if (window.location.hash) clearBootstrapFragment();

        if (launchOnMount) {
          const launched = await documentWorkspaceHttpService.launchV3({});
          return launched.ok
            ? { kind: "READY", bundle: launched.data, replaceRoute: true }
            : { kind: "ERROR", message: failureMessage(launched) };
        }

        if (!shareToken) {
          return {
            kind: "UNAVAILABLE",
            message: "The note link is incomplete. Start a new note to continue.",
          };
        }

        const stored = readStoredSession(shareToken);
        if (stored) {
          const inspected = await documentWorkspaceHttpService.inspect(
            stored.humanSessionToken,
          );
          if (inspected.ok) {
            return {
              kind: "READY",
              bundle: { ...stored, surface: inspected.data },
              replaceRoute: false,
            };
          }
          removeStoredSession(shareToken);
          if (inspected.code !== "UNAUTHORIZED" && inspected.code !== "NOT_FOUND") {
            return { kind: "ERROR", message: failureMessage(inspected) };
          }
        }

        const joined = await documentWorkspaceHttpService.joinV3({ shareToken });
        if (joined.ok) {
          return { kind: "READY", bundle: joined.data, replaceRoute: false };
        }
        const unavailable = joined.code === "NOT_FOUND" || joined.code === "INVALID_INPUT";
        return {
          kind: unavailable ? "UNAVAILABLE" : "ERROR",
          message: unavailable
            ? "This note link is invalid or has expired. Start a new note to continue."
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
        setLoadMessage(
          error instanceof Error ? error.message : "This note could not be opened.",
        );
      },
    );

    return () => {
      active = false;
    };
  }, [launchOnMount, router, setReadyBundle, shareToken]);

  const refreshAfterStale = useCallback(async () => {
    const currentBundle = bundleRef.current;
    if (!currentBundle) return;
    const inspected = await documentWorkspaceHttpService.inspect(
      currentBundle.humanSessionToken,
    );
    if (inspected.ok) reconcileRemoteSurface(inspected.data);
  }, [reconcileRemoteSurface]);

  const saveDraft = useCallback(
    async (allowConflict = false): Promise<DocumentSurfaceV3 | null> => {
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

      const operation = (async (): Promise<DocumentSurfaceV3 | null> => {
        try {
          const result = await documentWorkspaceHttpService.saveHuman(
            currentBundle.humanSessionToken,
            {
              expectedRevision,
              requestId: crypto.randomUUID(),
              title: submitted.title,
              body: submitted.body,
            },
          );
          if (!result.ok) {
            if (result.code === "STALE_WORK_STATE") await refreshAfterStale();
            setSaveState(result.code === "STALE_WORK_STATE" ? "CONFLICT" : "ERROR");
            setStatusMessage(failureMessage(result));
            return null;
          }

          const current = surfaceRef.current ?? result.data;
          const reconciled = reconcileDocumentWorkspaceSurface(current, result.data);
          const submittedStillCurrent =
            draftRef.current.title === submitted.title &&
            draftRef.current.body === submitted.body;
          const authoritativeMatches =
            reconciled.document.title === submitted.title &&
            reconciled.document.body === submitted.body;

          if (submittedStillCurrent && authoritativeMatches) {
            adoptCleanSurface(reconciled);
          } else {
            surfaceRef.current = reconciled;
            setSurface(reconciled);
            updateStoredSurface(reconciled);
            dirtyRef.current = true;
            setDirty(true);
            if (!authoritativeMatches) {
              conflictRef.current = reconciled;
              setConflictSurface(reconciled);
              setSaveState("CONFLICT");
              setStatusMessage("A newer version arrived while you were writing.");
            } else {
              setSaveState("UNSAVED");
            }
          }
          return reconciled;
        } catch (error) {
          if (!isAbortError(error)) {
            setSaveState("ERROR");
            setStatusMessage(
              error instanceof Error ? error.message : "The note could not be saved.",
            );
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
    [adoptCleanSurface, refreshAfterStale, updateStoredSurface],
  );

  useEffect(() => {
    if (loadState !== "READY" || !dirty || conflictSurface) return;
    const timer = window.setTimeout(() => void saveDraft(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [conflictSurface, dirty, draft, loadState, saveDraft]);

  useEffect(() => {
    if (loadState !== "READY" || !humanSessionToken) return;
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller = new AbortController();
      try {
        const result = await documentWorkspaceHttpService.inspect(
          humanSessionToken,
          controller.signal,
        );
        if (!cancelled) {
          if (result.ok) reconcileRemoteSurface(result.data);
          else if (result.code === "NOT_FOUND" || result.code === "UNAUTHORIZED") {
            removeStoredSession(activeShareToken ?? undefined);
            setLoadState("UNAVAILABLE");
            setLoadMessage("This note session has expired. Start a new note to continue.");
          }
        }
      } catch (error) {
        if (!cancelled && !isAbortError(error)) {
          setStatusMessage("Live updates paused. Your draft is still here.");
        }
      } finally {
        controller = null;
        if (!cancelled) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [activeShareToken, humanSessionToken, loadState, reconcileRemoteSurface]);

  useEffect(() => {
    if (loadState !== "READY" || !humanSessionToken) return;
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let inFlight = false;

    const heartbeat = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      controller = new AbortController();
      const currentSurface = surfaceRef.current;
      if (!currentSurface) {
        inFlight = false;
        return;
      }
      const draftPresence = presenceRef.current;
      try {
        const result = await documentWorkspaceHttpService.touchPresence(
          humanSessionToken,
          {
            state: document.hidden ? "IDLE" : draftPresence.state,
            field: draftPresence.field,
            isTyping: draftPresence.isTyping,
            selectionStart: draftPresence.selectionStart,
            selectionEnd: draftPresence.selectionEnd,
            observedRevision: currentSurface.document.revision,
          },
          controller.signal,
        );
        if (!cancelled && result.ok) reconcileRemoteSurface(result.data);
      } catch (error) {
        if (!isAbortError(error)) {
          // Presence is advisory; editing and autosave continue independently.
        }
      } finally {
        controller = null;
        inFlight = false;
        if (!cancelled) timer = window.setTimeout(heartbeat, PRESENCE_HEARTBEAT_MS);
      }
    };

    const onVisibilityChange = () => void heartbeat();
    document.addEventListener("visibilitychange", onVisibilityChange);
    void heartbeat();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [humanSessionToken, loadState, reconcileRemoteSurface]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!appMenu) return;
    const dismiss = () => setAppMenu(null);
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [appMenu]);

  useEffect(() => {
    if (!composer) return;
    window.requestAnimationFrame(() => composerInstructionRef.current?.focus());
  }, [composer]);

  useEffect(() => {
    if (!railOpen || !railFocusRequested) return;
    const timer = window.setTimeout(() => {
      railHeadingRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [railFocusRequested, railOpen]);

  const updateDraft = useCallback(
    (field: DocumentField, value: string, control: EditorControl) => {
      const maximum = field === "TITLE" ? DOCUMENT_TITLE_MAX_LENGTH : DOCUMENT_BODY_MAX_LENGTH;
      const bounded = clampCodePoints(value, maximum);
      const next =
        field === "TITLE"
          ? { ...draftRef.current, title: bounded }
          : { ...draftRef.current, body: bounded };
      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);
      setDirty(true);
      setSaveState(conflictRef.current ? "CONFLICT" : "UNSAVED");
      presenceRef.current = {
        ...presenceRef.current,
        state: "EDITING",
        field,
        isTyping: true,
      };
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => {
        presenceRef.current = { ...presenceRef.current, isTyping: false };
      }, 900);
      window.requestAnimationFrame(() => {
        if (control.value !== bounded) control.value = bounded;
        const selection = selectionFromControl(field, control);
        setActiveSelection(selection.rangeEnd > selection.rangeStart ? selection : null);
        presenceRef.current = {
          ...presenceRef.current,
          selectionStart: selection.rangeStart,
          selectionEnd: selection.rangeEnd,
        };
      });
    },
    [],
  );

  const captureSelection = useCallback(
    (field: DocumentField, control: EditorControl) => {
      const selection = selectionFromControl(field, control);
      setActiveSelection(selection.rangeEnd > selection.rangeStart ? selection : null);
      presenceRef.current = {
        ...presenceRef.current,
        state: "EDITING",
        field,
        selectionStart: selection.rangeStart,
        selectionEnd: selection.rangeEnd,
      };
      return selection;
    },
    [],
  );

  const restoreEditorFocus = useCallback((selection: SelectionSnapshot) => {
    const control = selection.field === "TITLE" ? titleRef.current : bodyRef.current;
    window.requestAnimationFrame(() => {
      if (!control) return;
      control.focus();
      const start = Math.min(selection.startUtf16, control.value.length);
      const end = Math.min(Math.max(start, selection.endUtf16), control.value.length);
      control.setSelectionRange(start, end);
      setActiveSelection(selectionFromControl(selection.field, control));
    });
  }, []);

  const closeComposer = useCallback(() => {
    const target = composer?.target;
    setComposer(null);
    setComposerBusy(false);
    if (target) restoreEditorFocus(target);
  }, [composer?.target, restoreEditorFocus]);

  const assignableMembers = useMemo(() => activeMembers(surface), [surface]);

  const openComposer = useCallback(
    async (
      selection: SelectionSnapshot,
      intent: DocumentWorkIntent,
      source: DocumentWorkSource,
    ) => {
      setAppMenu(null);
      if (selection.rangeEnd <= selection.rangeStart || !selection.selectedText) return;
      const savedSurface = await saveDraft();
      if (!savedSurface || conflictRef.current) return;
      const fieldValue =
        selection.field === "TITLE"
          ? savedSurface.document.title
          : savedSurface.document.body;
      const startUtf16 = codePointOffsetToUtf16Index(fieldValue, selection.rangeStart);
      const endUtf16 = codePointOffsetToUtf16Index(fieldValue, selection.rangeEnd);
      const selectedText = fieldValue.slice(startUtf16, endUtf16);
      if (!selectedText || selectedText !== selection.selectedText) {
        setStatusMessage("That selection changed. Select the text again before assigning work.");
        return;
      }
      const members = activeMembers(savedSurface);
      const preferred =
        members.find((person) => person.memberId !== bundleRef.current?.selfMemberId) ??
        members[0];
      setComposer({
        target: {
          ...selection,
          startUtf16,
          endUtf16,
          selectedText,
          expectedRevision: savedSurface.document.revision,
        },
        source,
        intent,
        instruction: defaultInstruction(intent),
        assignedToMemberId: preferred?.memberId ?? "",
      });
      setStatusMessage(null);
    },
    [saveDraft],
  );

  const onEditorKeyDown = useCallback(
    (
      field: DocumentField,
      event: ReactKeyboardEvent<EditorControl>,
    ) => {
      if (
        event.key === "ContextMenu" ||
        (event.key === "F10" && event.shiftKey)
      ) {
        pointerContextRef.current = null;
        return;
      }
      const isShortcut =
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      if (!isShortcut) return;
      const selection = selectionFromControl(field, event.currentTarget);
      if (selection.rangeEnd <= selection.rangeStart) return;
      event.preventDefault();
      void openComposer(selection, "CUSTOM", "KEYBOARD");
    },
    [openComposer],
  );

  const onEditorPointerDown = useCallback(
    (field: DocumentField, event: ReactPointerEvent<EditorControl>) => {
      if (event.button !== 2 || event.target !== event.currentTarget) {
        pointerContextRef.current = null;
        return;
      }
      pointerContextRef.current = {
        pointerId: event.pointerId,
        target: event.currentTarget,
        field,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        selection: selectionFromControl(field, event.currentTarget),
        timeStamp: event.timeStamp,
      };
    },
    [],
  );

  const onEditorContextMenu = useCallback(
    (field: DocumentField, event: ReactMouseEvent<EditorControl>) => {
      const remembered = pointerContextRef.current;
      pointerContextRef.current = null;
      if (!remembered || event.target !== event.currentTarget) return;
      const nativePointerId = (event.nativeEvent as globalThis.PointerEvent).pointerId;
      const pointerMatches =
        typeof nativePointerId !== "number" ||
        nativePointerId === 0 ||
        nativePointerId === remembered.pointerId;
      const elapsed = event.timeStamp - remembered.timeStamp;
      const currentSelection = selectionFromControl(field, event.currentTarget);
      const allModifiersClear =
        !remembered.shiftKey &&
        !remembered.altKey &&
        !remembered.ctrlKey &&
        !remembered.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey;
      const appOwned =
        remembered.target === event.currentTarget &&
        remembered.field === field &&
        pointerMatches &&
        elapsed >= 0 &&
        elapsed <= CONTEXT_POINTER_WINDOW_MS &&
        allModifiersClear &&
        currentSelection.rangeEnd > currentSelection.rangeStart &&
        sameSelection(remembered.selection, currentSelection);
      if (!appOwned) return;
      event.preventDefault();
      const width = 188;
      const height = 142;
      setAppMenu({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
        selection: currentSelection,
      });
      setActiveSelection(currentSelection);
    },
    [],
  );

  const createWorkOrder = useCallback(async () => {
    const currentBundle = bundleRef.current;
    if (!currentBundle || !composer || composerBusy) return;
    if (!composer.instruction.trim()) {
      setStatusMessage("Add a clear instruction before assigning this work.");
      composerInstructionRef.current?.focus();
      return;
    }
    if (!composer.assignedToMemberId) {
      setStatusMessage("Choose a collaborator for this work.");
      return;
    }

    setComposerBusy(true);
    setStatusMessage(null);
    try {
      const savedSurface = await saveDraft();
      if (!savedSurface || conflictRef.current) return;
      const result = await documentWorkspaceHttpService.createWorkOrder(
        currentBundle.humanSessionToken,
        {
          expectedRevision: composer.target.expectedRevision,
          requestId: crypto.randomUUID(),
          source: composer.source,
          intent: composer.intent,
          instruction: composer.instruction,
          assignedToMemberId: composer.assignedToMemberId,
          targetField: composer.target.field,
          rangeStart: composer.target.rangeStart,
          rangeEnd: composer.target.rangeEnd,
        },
      );
      if (!result.ok) {
        if (result.code === "STALE_WORK_STATE") await refreshAfterStale();
        setStatusMessage(failureMessage(result));
        return;
      }
      adoptSurfaceMetadata(result.data);
      const target = composer.target;
      setComposer(null);
      setRailTab("WORK");
      setRailOpen(true);
      setStatusMessage("Work assigned. The document is unchanged until a proposal is accepted.");
      restoreEditorFocus(target);
    } catch (error) {
      if (!isAbortError(error)) {
        setStatusMessage(
          error instanceof Error ? error.message : "The work could not be assigned.",
        );
      }
    } finally {
      setComposerBusy(false);
    }
  }, [adoptSurfaceMetadata, composer, composerBusy, refreshAfterStale, restoreEditorFocus, saveDraft]);

  const cancelWorkOrder = useCallback(
    async (order: DocumentWorkOrder) => {
      const currentBundle = bundleRef.current;
      if (
        !currentBundle ||
        order.status !== "PENDING" ||
        order.creatorMemberId !== currentBundle.selfMemberId ||
        workBusyId
      ) {
        return;
      }
      setWorkBusyId(order.workOrderId);
      setStatusMessage(null);
      try {
        const result = await documentWorkspaceHttpService.cancelWorkOrder(
          currentBundle.humanSessionToken,
          { workOrderId: order.workOrderId, requestId: crypto.randomUUID() },
        );
        if (!result.ok) {
          if (result.code === "STALE_WORK_STATE") await refreshAfterStale();
          setStatusMessage(failureMessage(result));
          return;
        }
        adoptSurfaceMetadata(result.data);
        setStatusMessage("Work cancelled.");
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "The work could not be cancelled.",
        );
      } finally {
        setWorkBusyId(null);
      }
    },
    [adoptSurfaceMetadata, refreshAfterStale, workBusyId],
  );

  const decideWorkOrder = useCallback(
    async (order: DocumentWorkOrder, decision: "ACCEPT" | "REJECT") => {
      const currentBundle = bundleRef.current;
      const rationale = rationales[order.workOrderId] ?? "";
      if (
        !currentBundle ||
        order.status !== "PROPOSED" ||
        order.creatorMemberId !== currentBundle.selfMemberId ||
        workBusyId
      ) {
        return;
      }
      if (!rationale.trim()) {
        setStatusMessage("Add your rationale before accepting or rejecting this proposal.");
        return;
      }
      setWorkBusyId(order.workOrderId);
      setStatusMessage(null);
      try {
        const savedSurface = await saveDraft();
        if (!savedSurface || conflictRef.current) return;
        const input = {
          workOrderId: order.workOrderId,
          expectedRevision: savedSurface.document.revision,
          requestId: crypto.randomUUID(),
          rationale,
        };
        const result =
          decision === "ACCEPT"
            ? await documentWorkspaceHttpService.acceptWorkProposal(
                currentBundle.humanSessionToken,
                input,
              )
            : await documentWorkspaceHttpService.rejectWorkProposal(
                currentBundle.humanSessionToken,
                input,
              );
        if (!result.ok) {
          if (result.code === "STALE_WORK_STATE") await refreshAfterStale();
          setStatusMessage(failureMessage(result));
          return;
        }
        if (dirtyRef.current) reconcileRemoteSurface(result.data);
        else adoptCleanSurface(result.data);
        setRationales((current) => {
          const next = { ...current };
          delete next[order.workOrderId];
          return next;
        });
        setRailTab("MEMORY");
        setStatusMessage(
          decision === "ACCEPT"
            ? "Proposal accepted. The document and decision memory updated together."
            : "Proposal rejected. Your rationale is now part of decision memory.",
        );
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "The proposal decision could not be saved.",
        );
      } finally {
        setWorkBusyId(null);
      }
    },
    [adoptCleanSurface, rationales, reconcileRemoteSurface, refreshAfterStale, saveDraft, workBusyId],
  );

  const copyShareLink = useCallback(async () => {
    const currentBundle = bundleRef.current;
    if (!currentBundle) return;
    const cleanUrl = `${window.location.origin}/document/${encodeURIComponent(currentBundle.shareToken)}`;
    try {
      await navigator.clipboard.writeText(cleanUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1_600);
    } catch {
      setStatusMessage("Copy the clean address from your browser to share this note.");
    }
  }, []);

  const createNewNote = useCallback(async () => {
    if (dirtyRef.current && !window.confirm("Save this note and start a new one?")) return;
    if (dirtyRef.current) {
      const saved = await saveDraft();
      if (!saved || dirtyRef.current) return;
    }
    try {
      const launched = await documentWorkspaceHttpService.launchV3({});
      if (!launched.ok) {
        setStatusMessage(failureMessage(launched));
        return;
      }
      setReadyBundle(launched.data);
      router.replace(`/document/${encodeURIComponent(launched.data.shareToken)}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "A new note could not be opened.",
      );
    }
  }, [router, saveDraft, setReadyBundle]);

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

  const closeRail = useCallback(() => {
    setRailFocusRequested(false);
    setRailOpen(false);
    window.requestAnimationFrame(() => railToggleRef.current?.focus());
  }, []);

  const onRailKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (
        event.key !== "Escape" ||
        !window.matchMedia("(max-width: 739px)").matches
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeRail();
    },
    [closeRail],
  );

  const orderedWork = useMemo(
    () => orderedWorkOrders(surface?.workOrders ?? []),
    [surface?.workOrders],
  );
  const activeWorkCount = orderedWork.filter(
    (order) => order.status === "PENDING" || order.status === "PROPOSED",
  ).length;
  const visiblePresence = useMemo(() => activeMembers(surface), [surface]);
  const selfPresence = visiblePresence.find(
    (person) => person.memberId === bundle?.selfMemberId,
  );
  const otherPeople = visiblePresence.filter(
    (person) => person.memberId !== bundle?.selfMemberId,
  );
  const editingPerson = otherPeople.find((person) => person.state === "EDITING");
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
      data-testid="document-workspace-editor"
      data-rail-open={railOpen ? "true" : "false"}
    >
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <span className={styles.mark} aria-hidden="true">R</span>
          <span className={styles.wordmark}>Ratiflow</span>
          <span className={styles.topbarDivider} aria-hidden="true" />
          <button className={styles.topbarButton} type="button" onClick={() => void createNewNote()}>
            New note
          </button>
        </div>

        <div className={styles.documentPulse} aria-live="polite">
          {loadState === "READY" ? (
            <>
              <span className={styles.saveDot} data-state={saveState.toLowerCase()} />
              <span>{saveLabel}</span>
            </>
          ) : (
            <span>{loadState === "LOADING" ? "Opening…" : "Unavailable"}</span>
          )}
        </div>

        <div className={styles.collaborationGroup}>
          <div
            className={styles.people}
            aria-label={`${otherPeople.length} other ${otherPeople.length === 1 ? "person" : "people"} here`}
          >
            {visiblePresence.slice(0, 4).map((person) => (
              <span
                className={styles.avatar}
                key={person.memberId}
                style={{ "--avatar-color": person.color } as CSSProperties}
                title={`${person.displayName}${person.memberId === bundle?.selfMemberId ? " · you" : ""}`}
              >
                {memberInitials(person.displayName)}
                <span data-state={person.state.toLowerCase()} />
              </span>
            ))}
            {visiblePresence.length > 4 ? (
              <span className={styles.avatarMore}>+{visiblePresence.length - 4}</span>
            ) : null}
          </div>
          <button
            className={styles.shareButton}
            type="button"
            onClick={() => void copyShareLink()}
            disabled={!bundle}
          >
            {shareCopied ? "Copied" : "Share"}
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <main className={styles.editorPane}>
          {loadState === "UNAVAILABLE" || loadState === "ERROR" ? (
            <section className={styles.emptyState} aria-live="polite">
              <span className={styles.emptyMark} aria-hidden="true">R</span>
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
              <label className={styles.srOnly} htmlFor="workspace-document-title">
                Note title
              </label>
              <input
                ref={titleRef}
                id="workspace-document-title"
                className={styles.titleInput}
                value={draft.title}
                placeholder={loadState === "LOADING" ? "Opening note…" : "Untitled"}
                disabled={loadState !== "READY"}
                readOnly={composer !== null}
                onFocus={(event) => captureSelection("TITLE", event.currentTarget)}
                onBlur={() => {
                  presenceRef.current = {
                    ...presenceRef.current,
                    state: "VIEWING",
                    field: null,
                    isTyping: false,
                    selectionStart: null,
                    selectionEnd: null,
                  };
                }}
                onSelect={(event) => captureSelection("TITLE", event.currentTarget)}
                onChange={(event) => updateDraft("TITLE", event.target.value, event.currentTarget)}
                onKeyDown={(event) => onEditorKeyDown("TITLE", event)}
                onPointerDown={(event) => onEditorPointerDown("TITLE", event)}
                onContextMenu={(event) => onEditorContextMenu("TITLE", event)}
                autoComplete="off"
                spellCheck
              />

              <label className={styles.srOnly} htmlFor="workspace-document-body">
                Note body
              </label>
              <textarea
                ref={bodyRef}
                id="workspace-document-body"
                className={styles.bodyInput}
                value={draft.body}
                placeholder={loadState === "READY" ? "Start writing…" : ""}
                disabled={loadState !== "READY"}
                readOnly={composer !== null}
                onFocus={(event) => captureSelection("BODY", event.currentTarget)}
                onBlur={() => {
                  presenceRef.current = {
                    ...presenceRef.current,
                    state: "VIEWING",
                    field: null,
                    isTyping: false,
                    selectionStart: null,
                    selectionEnd: null,
                  };
                }}
                onSelect={(event) => captureSelection("BODY", event.currentTarget)}
                onChange={(event) => updateDraft("BODY", event.target.value, event.currentTarget)}
                onKeyDown={(event) => onEditorKeyDown("BODY", event)}
                onPointerDown={(event) => onEditorPointerDown("BODY", event)}
                onContextMenu={(event) => onEditorContextMenu("BODY", event)}
                spellCheck
              />

              {activeSelection && !composer && loadState === "READY" ? (
                <button
                  className={styles.selectionAction}
                  type="button"
                  data-testid="ask-agent-selection"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    void openComposer(activeSelection, "CUSTOM", "SELECTION_AFFORDANCE")
                  }
                >
                  <span aria-hidden="true">✦</span>
                  Ask agent
                </button>
              ) : null}

              <footer className={styles.documentFooter}>
                <div aria-live="polite">
                  {editingPerson ? (
                    <span className={styles.editingMessage}>
                      <i style={{ backgroundColor: editingPerson.color }} />
                      {editingPerson.displayName} is editing
                    </span>
                  ) : surface?.document.lastEditor ? (
                    <span>Last edited by {surface.document.lastEditor.displayName}</span>
                  ) : (
                    <span>{selfPresence ? `Writing as ${selfPresence.displayName}` : "Shared note"}</span>
                  )}
                </div>
                <span className={styles.spellingHint}>
                  Hold Shift for spelling menu · <kbd>⌘K</kbd> to assign
                </span>
              </footer>
            </section>
          )}
        </main>

        {loadState === "READY" ? (
          <aside
            id="document-workspace-rail"
            className={styles.rail}
            aria-label="Work and memory"
            onKeyDown={onRailKeyDown}
          >
            <div className={styles.railHeader}>
              <h2 ref={railHeadingRef} tabIndex={-1}>Collaboration</h2>
              <button
                className={styles.railClose}
                type="button"
                aria-label="Close work and memory"
                onClick={closeRail}
              >
                ×
              </button>
            </div>
            <div className={styles.railTabs} role="tablist" aria-label="Collaboration views">
              <button
                type="button"
                role="tab"
                aria-selected={railTab === "WORK"}
                onClick={() => setRailTab("WORK")}
              >
                Work
                {activeWorkCount > 0 ? <span>{activeWorkCount}</span> : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={railTab === "MEMORY"}
                onClick={() => setRailTab("MEMORY")}
              >
                Memory
              </button>
            </div>

            <div className={styles.railContent}>
              {railTab === "WORK" ? (
                <div role="tabpanel" aria-label="Work" data-testid="work-order-list">
                  {webMCPStatus?.supported &&
                  webMCPStatus.registeredTools.length > 0 ? (
                    <p
                      className={styles.capabilityState}
                      data-proposal={webMCPStatus.registeredTools.includes(
                        "submit_work_proposal",
                      )}
                      data-testid="page-capability-state"
                      aria-live="polite"
                    >
                      <span>Page capability ·</span>
                      {webMCPStatus.registeredTools.includes("submit_work_proposal")
                        ? `Proposal tool available for ${selfPresence?.displayName ?? "this member"}’s paired agent`
                        : "Read-only tools"}
                    </p>
                  ) : null}
                  {orderedWork.length === 0 ? (
                    <div className={styles.railEmpty}>
                      <span aria-hidden="true">✦</span>
                      <h3>No assigned work yet</h3>
                      <p>Select a useful passage, then ask a collaborator’s agent for help.</p>
                    </div>
                  ) : (
                    <ul className={styles.workList}>
                      {orderedWork.map((order) => {
                        const isCreator = order.creatorMemberId === bundle?.selfMemberId;
                        const isBusy = workBusyId === order.workOrderId;
                        const rationale = rationales[order.workOrderId] ?? "";
                        return (
                          <li
                            className={styles.workCard}
                            data-status={order.status.toLowerCase()}
                            data-testid="work-order-card"
                            key={order.workOrderId}
                          >
                            <div className={styles.workCardHeading}>
                              <span className={styles.intentBadge}>
                                {WORK_INTENT_LABELS[order.intent]}
                              </span>
                              <span className={styles.statusBadge}>
                                {WORK_STATUS_LABELS[order.status]}
                              </span>
                            </div>
                            <blockquote className={styles.targetExcerpt}>
                              <span>{order.anchor.field === "TITLE" ? "Title" : "Selected text"}</span>
                              “{compactExcerpt(order.anchor.selectedText)}”
                            </blockquote>
                            <p className={styles.workInstruction}>{order.instruction}</p>
                            <p className={styles.workAttribution}>
                              <span>{order.creatorDisplayName}</span>
                              <b aria-hidden="true">→</b>
                              <span>{order.assignedToDisplayName}</span>
                            </p>

                            {order.proposal ? (
                              <div className={styles.proposal}>
                                <div className={styles.proposalHeader}>
                                  <span>Proposed change</span>
                                  <small>Document unchanged</small>
                                </div>
                                <div className={styles.proposalDiff}>
                                  <div>
                                    <span>Before</span>
                                    <del>{order.anchor.selectedText || "Empty"}</del>
                                  </div>
                                  <div>
                                    <span>After</span>
                                    <ins>{order.proposal.replacementText || "Remove selection"}</ins>
                                  </div>
                                </div>
                                <p className={styles.untrustedSummary}>
                                  <span>Agent summary · untrusted</span>
                                  {order.proposal.changeSummary}
                                </p>
                              </div>
                            ) : null}

                            {order.decision ? (
                              <blockquote className={styles.decisionRationale}>
                                <span>Human rationale · {order.decision.decidedBy.displayName}</span>
                                {order.decision.rationale}
                              </blockquote>
                            ) : null}

                            {isCreator && order.status === "PENDING" ? (
                              <button
                                className={styles.textButton}
                                type="button"
                                disabled={Boolean(workBusyId)}
                                onClick={() => void cancelWorkOrder(order)}
                              >
                                {isBusy ? "Cancelling…" : "Cancel work"}
                              </button>
                            ) : null}

                            {isCreator && order.status === "PROPOSED" ? (
                              <div className={styles.decisionComposer}>
                                <label htmlFor={`work-rationale-${order.workOrderId}`}>
                                  Your rationale
                                </label>
                                <textarea
                                  id={`work-rationale-${order.workOrderId}`}
                                  value={rationale}
                                  placeholder="Record why this proposal should or should not shape the document…"
                                  onChange={(event) => {
                                    const value = clampCodePoints(
                                      event.target.value,
                                      DOCUMENT_HUMAN_RATIONALE_MAX_LENGTH,
                                    );
                                    setRationales((current) => ({
                                      ...current,
                                      [order.workOrderId]: value,
                                    }));
                                  }}
                                />
                                <div className={styles.decisionActions}>
                                  <button
                                    className={styles.secondaryButton}
                                    type="button"
                                    disabled={Boolean(workBusyId) || !rationale.trim()}
                                    onClick={() => void decideWorkOrder(order, "REJECT")}
                                  >
                                    {isBusy ? "Saving…" : "Reject"}
                                  </button>
                                  <button
                                    className={styles.primaryButton}
                                    type="button"
                                    disabled={Boolean(workBusyId) || !rationale.trim()}
                                    onClick={() => void decideWorkOrder(order, "ACCEPT")}
                                  >
                                    {isBusy ? "Saving…" : "Accept"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : (
                <div role="tabpanel" aria-label="Memory">
                  {surface?.memory.length ? (
                    <ol className={styles.memoryList} data-testid="memory-list">
                      {surface.memory.map((event) => (
                        <MemoryEventCard event={event} key={event.eventId} />
                      ))}
                    </ol>
                  ) : (
                    <div className={styles.railEmpty}>
                      <span aria-hidden="true">◷</span>
                      <h3>Decisions will collect here</h3>
                      <p>Edits, proposals, and human rationale form a shared memory over time.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {loadState === "READY" ? (
        <button
          ref={railToggleRef}
          className={styles.railToggle}
          type="button"
          aria-controls="document-workspace-rail"
          aria-expanded={railOpen}
          aria-label={`Work and memory, ${activeWorkCount} active`}
          onClick={() => {
            if (railOpen) closeRail();
            else {
              setRailFocusRequested(true);
              setRailOpen(true);
            }
          }}
        >
          <span>Work</span>
          <b>{activeWorkCount}</b>
        </button>
      ) : null}

      {appMenu ? (
        <div
          className={styles.contextMenu}
          role="menu"
          aria-label="Agent actions"
          style={{ left: appMenu.x, top: appMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void openComposer(appMenu.selection, "REWRITE", "CONTEXT_MENU")}
          >
            <span aria-hidden="true">✎</span>
            <span><b>Rewrite</b><small>Clarify this selection</small></span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void openComposer(appMenu.selection, "RESEARCH", "CONTEXT_MENU")}
          >
            <span aria-hidden="true">⌕</span>
            <span><b>Research</b><small>Check and strengthen the claim</small></span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void openComposer(appMenu.selection, "CUSTOM", "CONTEXT_MENU")}
          >
            <span aria-hidden="true">↗</span>
            <span><b>Assign…</b><small>Give a custom instruction</small></span>
          </button>
        </div>
      ) : null}

      {composer ? (
        <section
          className={styles.composer}
          role="dialog"
          aria-modal="false"
          aria-labelledby="work-composer-heading"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeComposer();
            }
          }}
        >
          <div className={styles.composerHeader}>
            <div>
              <span>Assign selected text</span>
              <h2 id="work-composer-heading">Ask a collaborator’s agent</h2>
            </div>
            <button type="button" aria-label="Close assignment composer" onClick={closeComposer}>
              ×
            </button>
          </div>
          <blockquote className={styles.composerTarget} data-testid="work-target-preview">
            <span>{composer.target.field === "TITLE" ? "Title selection" : "Body selection"}</span>
            “{compactExcerpt(composer.target.selectedText, 220)}”
          </blockquote>
          <div className={styles.composerGrid}>
            <label>
              <span>Intent</span>
              <select
                aria-label="Work intent"
                value={composer.intent}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const nextIntent = event.target.value as DocumentWorkIntent;
                  setComposer((current) => {
                    if (!current) return current;
                    const shouldReplaceInstruction =
                      !current.instruction ||
                      current.instruction === defaultInstruction(current.intent);
                    return {
                      ...current,
                      intent: nextIntent,
                      instruction: shouldReplaceInstruction
                        ? defaultInstruction(nextIntent)
                        : current.instruction,
                    };
                  });
                }}
              >
                <option value="REWRITE">Rewrite</option>
                <option value="RESEARCH">Research</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </label>
            <label>
              <span>Assign to</span>
              <select
                aria-label="Assignee"
                value={composer.assignedToMemberId}
                onChange={(event) =>
                  setComposer((current) =>
                    current
                      ? { ...current, assignedToMemberId: event.target.value }
                      : current,
                  )
                }
                disabled={assignableMembers.length === 0}
              >
                {assignableMembers.length === 0 ? (
                  <option value="">No active collaborators</option>
                ) : null}
                {assignableMembers.map((person) => (
                  <option value={person.memberId} key={person.memberId}>
                    {person.displayName}
                    {person.memberId === bundle?.selfMemberId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.instructionField}>
            <span>Instruction</span>
            <textarea
              ref={composerInstructionRef}
              aria-label="Work instruction"
              value={composer.instruction}
              placeholder="Describe what a useful proposal should accomplish…"
              onChange={(event) => {
                const instruction = clampCodePoints(
                  event.target.value,
                  DOCUMENT_WORK_INSTRUCTION_MAX_LENGTH,
                );
                setComposer((current) =>
                  current ? { ...current, instruction } : current,
                );
              }}
            />
          </label>
          <div className={styles.composerFooter}>
            <span>Creates a proposal request. Your document will not change.</span>
            <div>
              <button className={styles.secondaryButton} type="button" onClick={closeComposer}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={
                  composerBusy ||
                  !composer.instruction.trim() ||
                  !composer.assignedToMemberId
                }
                onClick={() => void createWorkOrder()}
              >
                {composerBusy ? "Assigning…" : "Assign work"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {conflictSurface ? (
        <aside className={styles.conflictBanner} aria-live="assertive">
          <div>
            <strong>A newer version is available</strong>
            <span>Your draft is still here. Choose which version to keep.</span>
          </div>
          <div>
            <button type="button" onClick={useLatest}>Use latest</button>
            <button type="button" onClick={() => void keepMine()}>Keep mine</button>
          </div>
        </aside>
      ) : null}

      {statusMessage && !conflictSurface ? (
        <div className={styles.statusToast} role="status">{statusMessage}</div>
      ) : null}

      {surface && bundle ? (
        <DocumentWorkspaceWebMCPBridge
          surface={surface}
          sessionInstanceId={bundle.sessionInstanceId}
          agentSessionToken={bundle.agentSessionToken}
          selfMemberId={bundle.selfMemberId}
          service={documentWorkspaceHttpService}
          onStatusChange={(status) => {
            setWebMCPStatus(status);
            if (status.error) setStatusMessage(status.error);
          }}
          onAuthoritativeSurface={reconcileRemoteSurface}
        />
      ) : null}
    </div>
  );
}

// Kept exported for route-level prop typing without widening the client boundary.
export type { DocumentWorkspaceEditorProps };
