"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import {
  ISSUE_AGENT_NAME_MAX_LENGTH,
  ISSUE_BODY_MAX_LENGTH,
  ISSUE_COMMENT_MAX_LENGTH,
  ISSUE_TITLE_MAX_LENGTH,
  REPOSITORY_TOOL_NAMES,
  type IssueActorSnapshot,
  type IssueAgentProfile,
  type IssueAnchor,
  type IssueDocumentKind,
  type IssueRevision,
  type IssueRevisionProvenance,
  type IssueRevisionSummary,
  type IssueSelectionAnchor,
  type IssueSessionBundle,
  type IssueTask,
  type IssueThread,
  type IssueWorkspaceSurface,
  type RepositoryBrowserClientPort,
  type RepositoryFailure,
} from "@/repository/contracts";
import { reconcileIssueSurface } from "@/repository/surface-reconciliation";
import type { RepositoryWebMCPBridgeStatus } from "@/webmcp/repository-types";

import { MarkdownDocument, type MarkdownSelectionEvent } from "./MarkdownDocument";
import { repositorySelectionFromDom, type RepositorySourceSelection } from "./markdown-source-map";
import { RepositoryWebMCPBridge } from "./RepositoryWebMCPBridge";
import styles from "./repository-workspace.module.css";

type RailTab = "COMMENTS" | "HISTORY";
type AgentExecutionTool = "wait_for_my_tasks" | "comment_on_task" | "submit_task_result" | null;

interface DocumentDraft {
  title: string;
  body: string;
}

interface SelectionDraft extends RepositorySourceSelection {
  expectedRevision: number;
  rect: { left: number; top: number; bottom: number; width: number; height: number };
}

export interface RepositoryWorkspaceProps {
  session: IssueSessionBundle;
  service: RepositoryBrowserClientPort;
  shareUrl?: string;
  onNewDocument?: () => void;
  onSessionUnavailable?: (message: string) => void;
  onSurfaceChange?: (surface: IssueWorkspaceSurface) => void;
}

export function repositorySessionIdentity(
  session: Pick<IssueSessionBundle, "sessionInstanceId" | "surface">,
): string {
  return `${session.sessionInstanceId}:${session.surface.document.id}`;
}

export function repositoryCanReceiveSessionResult(
  activeIdentity: string | null,
  expectedIdentity: string,
  currentSession: Pick<IssueSessionBundle, "sessionInstanceId" | "surface"> | null,
  incomingDocumentId?: string,
): boolean {
  return activeIdentity === expectedIdentity
    && currentSession !== null
    && repositorySessionIdentity(currentSession) === expectedIdentity
    && (incomingDocumentId === undefined || currentSession.surface.document.id === incomingDocumentId);
}

export function repositoryKindLabel(kind: IssueDocumentKind): string {
  return kind === "POSTMORTEM" ? "Postmortem" : "Product document";
}

export function repositoryAuthorityLabel(authority: IssueRevisionProvenance["authority"]): string {
  if (authority === "DIRECT") return "Agent change";
  if (authority === "REVIEW") return "Reviewed agent change";
  if (authority === "RESTORE") return "Restore";
  return "Human edit";
}

function agentIdentity(actor: Extract<IssueActorSnapshot, { actorType: "AGENT" }>): string {
  return `${actor.agentLabel} · ${actor.member.displayName}`;
}

export function repositoryProvenanceSummary(provenance: IssueRevisionProvenance): string {
  if (provenance.authority === "DIRECT") return `${agentIdentity(provenance.author)} changed the document`;
  if (provenance.authority === "REVIEW") return `${agentIdentity(provenance.author)} authored · ${provenance.approvedBy.displayName} applied`;
  if (provenance.authority === "RESTORE") return `${provenance.author.displayName} restored r${provenance.restoredRevision}`;
  return `${provenance.author.displayName} edited the document`;
}

export function repositoryRevisionLineageLabel(input: Pick<IssueRevisionSummary, "parentRevision" | "provenance">): string {
  const { provenance } = input;
  const author = provenance.author.actorType === "AGENT" ? provenance.author.agentLabel : provenance.author.displayName;
  if (provenance.authority === "DIRECT") {
    return input.parentRevision === provenance.sourceRevision
      ? `${author} · Direct from r${provenance.sourceRevision}`
      : `${author} · Direct from r${provenance.sourceRevision}, safely rebased`;
  }
  if (provenance.authority === "REVIEW") return `${author} · Reviewed by ${provenance.approvedBy.displayName}`;
  if (provenance.authority === "RESTORE") return `${author} · Restored r${provenance.restoredRevision}`;
  return `${author} · Human edit`;
}

export function repositoryClampCodePoints(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

export function repositoryDraftMatchesDocument(draft: DocumentDraft, document: DocumentDraft): boolean {
  return draft.title === document.title && draft.body === document.body;
}

export function repositoryShouldAdoptRevisionMutation(
  currentDraft: DocumentDraft,
  submittedDraft: DocumentDraft,
  baselineDraft: DocumentDraft,
  dirty: boolean,
): boolean {
  return !dirty || repositoryDraftMatchesDocument(currentDraft, submittedDraft)
    || repositoryDraftMatchesDocument(currentDraft, baselineDraft);
}

export function repositoryCanApplyRevisionSnapshot(
  requestedRevision: number,
  selectedRevision: number,
  snapshot: Pick<IssueRevision, "revision">,
): boolean {
  return requestedRevision === selectedRevision && snapshot.revision === requestedRevision;
}

export function repositoryNextHistoryHasMore(
  olderHistoryCount: number,
  current: boolean,
  incoming: boolean,
): boolean {
  return olderHistoryCount > 0 ? current : incoming;
}

export function repositoryCommentStartsWithAgent(comment: string, agentName: string): boolean {
  const prefix = `@${agentName}`;
  if (!comment.startsWith(prefix)) return false;
  const separator = comment.at(prefix.length);
  return separator !== undefined && " \t\r\n".includes(separator);
}

function compactExcerpt(value: string, maximum = 170): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  return Array.from(compact).length > maximum
    ? `${Array.from(compact).slice(0, maximum - 1).join("")}…`
    : compact;
}

function initials(value: string): string {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

const REPOSITORY_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  return REPOSITORY_DATE_FORMATTER.format(date).replace(",", " ·") + " UTC";
}

function failureMessage(failure: RepositoryFailure): string {
  return failure.message || "The document could not be updated.";
}

function isSelectionAnchor(anchor: IssueAnchor): anchor is IssueSelectionAnchor {
  return anchor.scope === "SELECTION";
}

function actorLabel(actor: IssueActorSnapshot): string {
  return actor.actorType === "AGENT" ? agentIdentity(actor) : actor.displayName;
}

function statusLabel(task: IssueTask): string {
  if (task.status === "OPEN") return "Assigned";
  if (task.status === "PROPOSED") return "Ready";
  if (task.status === "COMPLETED") return "Completed";
  if (task.status === "STALE") return "Needs context";
  if (task.status === "CANCELLED") return "Cancelled";
  return "Closed";
}

function threadTime(thread: IssueThread): string {
  return thread.comments.at(-1)?.createdAt ?? thread.createdAt;
}

function safeEvidenceHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function Evidence({ refs }: { refs: readonly string[] }) {
  if (!refs.length) return null;
  return (
    <div className={styles.evidence}>
      <span>Evidence</span>
      <ul>{refs.map((ref) => {
        const href = safeEvidenceHref(ref);
        return <li key={ref}>{href ? <a href={href} rel="noreferrer noopener" target="_blank">{ref}</a> : <code>{ref}</code>}</li>;
      })}</ul>
    </div>
  );
}

function ChangeDiff({ before, after }: { before: string; after: string }) {
  return (
    <div className={styles.changeDiff}>
      <div><span>Before</span><del>{before || "Nothing"}</del></div>
      <div><span>After</span><ins>{after || "Nothing"}</ins></div>
    </div>
  );
}

interface CollaborationCardProps {
  thread: IssueThread;
  task: IssueTask | null;
  replyOpen: boolean;
  replyBody: string;
  busy: boolean;
  onReplyOpen: () => void;
  onReplyBody: (body: string) => void;
  onReplySubmit: () => void;
  onClose: () => void;
  onRestoreBeforeTask: () => void;
}

function CollaborationCard({ thread, task, replyOpen, replyBody, busy, onReplyOpen, onReplyBody, onReplySubmit, onClose, onRestoreBeforeTask }: CollaborationCardProps) {
  const root = thread.comments[0];
  const replies = thread.comments.slice(1);
  const anchor = thread.anchor;
  const agentCompleted = task?.status === "COMPLETED" && task.mode === "DIRECT" && task.result?.outcome === "COMMITTED";
  const finding = task?.status === "COMPLETED" && task.result?.outcome === "COMMENTED" ? task.result : null;
  const proposal = task?.proposal ?? null;

  return (
    <article className={styles.commentCard} data-kind={task ? "agent" : "human"} data-status={task?.status.toLowerCase() ?? thread.status.toLowerCase()}>
      <header>
        <span className={styles.actorAvatar} data-agent={root?.author.actorType === "AGENT" ? "true" : "false"}>{initials(root?.author.displayName ?? thread.createdBy.displayName)}</span>
        <div><strong>{root ? actorLabel(root.author) : thread.createdBy.displayName}</strong><small>{formatDateTime(root?.createdAt ?? thread.createdAt)}</small></div>
        <span className={styles.threadState}>{task ? statusLabel(task) : thread.status === "OPEN" ? "Open" : "Closed"}</span>
      </header>

      {anchor.scope === "SELECTION" ? <blockquote data-stale={anchor.anchorState === "STALE" ? "true" : "false"}>{compactExcerpt(anchor.selectedText, 210)}</blockquote> : null}
      {root ? <p className={styles.commentBody}>{root.body}</p> : null}
      {task ? <div className={styles.assignmentMeta}><span>@{task.agentLabel}</span><span>owned by {task.assignee.displayName}</span><span>{task.taskKey}</span></div> : null}

      {replies.length ? (
        <ol className={styles.replyList}>
          {replies.map((comment) => (
            <li key={comment.commentId}><span>{initials(comment.author.displayName)}</span><div><strong>{actorLabel(comment.author)}</strong><p>{comment.body}</p><small>{formatDateTime(comment.createdAt)}</small></div></li>
          ))}
        </ol>
      ) : null}

      {agentCompleted && task?.result ? (
        <section className={styles.completedChange}>
          <div className={styles.changeHeading}><span><i />Change in r{task.result.resultRevision}</span><strong>{task.result.resultSummary}</strong></div>
          <ChangeDiff before={task.creationAnchor.selectedText} after={task.result.replacementText} />
          <Evidence refs={task.result.evidenceRefs} />
          <button className={styles.restoreChange} type="button" disabled={busy || task.result.resultRevision <= 1} onClick={onRestoreBeforeTask}>Restore before this change</button>
        </section>
      ) : null}

      {proposal ? (
        <section className={styles.completedChange}>
          <div className={styles.changeHeading}><span><i />Agent proposal</span><strong>{proposal.resultSummary}</strong></div>
          <ChangeDiff before={task?.creationAnchor.scope === "SELECTION" ? task.creationAnchor.selectedText : ""} after={proposal.replacementText} />
          <Evidence refs={proposal.evidenceRefs} />
        </section>
      ) : null}

      {finding ? <section className={styles.completedChange}><div className={styles.changeHeading}><span><i />Agent finding</span><strong>{finding.resultSummary}</strong></div><Evidence refs={finding.evidenceRefs} /></section> : null}

      <footer>
        <button type="button" onClick={onReplyOpen}>Reply</button>
        {!task && thread.status === "OPEN" ? <button type="button" disabled={busy} onClick={onClose}>Close</button> : null}
        {thread.status === "RESOLVED" && thread.resolvedBy ? <span>Closed by {thread.resolvedBy.displayName}</span> : null}
      </footer>

      {replyOpen ? (
        <form className={styles.replyComposer} onSubmit={(event) => { event.preventDefault(); onReplySubmit(); }}>
          <label htmlFor={`reply-${thread.threadId}`}>Reply</label>
          <textarea id={`reply-${thread.threadId}`} autoFocus maxLength={ISSUE_COMMENT_MAX_LENGTH} placeholder="Add context…" value={replyBody} onChange={(event) => onReplyBody(repositoryClampCodePoints(event.target.value, ISSUE_COMMENT_MAX_LENGTH))} />
          <button type="submit" disabled={busy || !replyBody.trim()}>{busy ? "Posting…" : "Post reply"}</button>
        </form>
      ) : null}
    </article>
  );
}

function RevisionDiff({ revision }: { revision: IssueRevisionSummary }) {
  if (!revision.diffs.length) return <p className={styles.emptyDiff}>No content difference.</p>;
  return <div className={styles.revisionDiffs}>{revision.diffs.map((diff, index) => <div key={`${diff.field}:${diff.rangeStart}:${index}`}><span>{diff.field === "TITLE" ? "Title" : "Document"}</span><ChangeDiff before={diff.before} after={diff.after} /></div>)}</div>;
}

export function RepositoryWorkspace({ session, service, shareUrl, onNewDocument, onSessionUnavailable, onSurfaceChange }: RepositoryWorkspaceProps) {
  const router = useRouter();
  const [surface, setSurface] = useState(session.surface);
  const [draft, setDraft] = useState<DocumentDraft>({ title: session.surface.document.title, body: session.surface.document.body });
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<IssueWorkspaceSurface | null>(null);
  const [selection, setSelection] = useState<SelectionDraft | null>(null);
  const [commentText, setCommentText] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("COMMENTS");
  const [railOpen, setRailOpen] = useState(false);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [threadBusy, setThreadBusy] = useState(false);
  const [olderHistory, setOlderHistory] = useState<IssueRevisionSummary[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(session.surface.hasMoreHistory);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<IssueRevisionSummary | null>(null);
  const [revisionSnapshot, setRevisionSnapshot] = useState<IssueRevision | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [webMCPStatus, setWebMCPStatus] = useState<RepositoryWebMCPBridgeStatus | null>(null);
  const [activeAgentTool, setActiveAgentTool] = useState<AgentExecutionTool>(null);
  const [connectedAgent, setConnectedAgent] = useState<IssueAgentProfile | null>(null);
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const [agentSetupName, setAgentSetupName] = useState("");
  const [agentPromptCopied, setAgentPromptCopied] = useState(false);

  const surfaceRef = useRef(surface);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(dirty);
  const titleReadRef = useRef<HTMLHeadingElement>(null);
  const selectedRevisionRef = useRef<number | null>(null);
  const revisionRequestRef = useRef(0);
  const activeSessionIdentityRef = useRef(repositorySessionIdentity(session));

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const sessionIdentity = repositorySessionIdentity(session);
  const isActiveSession = useCallback(() => activeSessionIdentityRef.current === sessionIdentity, [sessionIdentity]);

  const handleFailure = useCallback((failure: RepositoryFailure) => {
    if (failure.code === "UNAUTHORIZED" || failure.code === "NOT_FOUND") return onSessionUnavailable?.(failureMessage(failure));
    setStatusMessage(failureMessage(failure));
  }, [onSessionUnavailable]);

  const publishSurface = useCallback((incoming: IssueWorkspaceSurface, notifyParent = true) => {
    if (incoming.document.id !== surfaceRef.current.document.id) return;
    const previous = surfaceRef.current;
    const next = reconcileIssueSurface(previous, incoming);
    surfaceRef.current = next;
    setSurface(next);
    setHistoryHasMore((current) => repositoryNextHistoryHasMore(olderHistory.length, current, next.hasMoreHistory));
    if (notifyParent) onSurfaceChange?.(next);
    if (next.document.revision > previous.document.revision) {
      if (dirtyRef.current) setConflict(next);
      else {
        const nextDraft = { title: next.document.title, body: next.document.body };
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }
    }
  }, [olderHistory.length, onSurfaceChange]);

  const adoptSurface = useCallback((incoming: IssueWorkspaceSurface) => {
    publishSurface(incoming);
    const nextDraft = { title: incoming.document.title, body: incoming.document.body };
    draftRef.current = nextDraft;
    dirtyRef.current = false;
    setDraft(nextDraft);
    setDirty(false);
    setConflict(null);
  }, [publishSurface]);

  useEffect(() => {
    if (activeSessionIdentityRef.current === sessionIdentity) {
      publishSurface(session.surface, false);
      return;
    }
    activeSessionIdentityRef.current = sessionIdentity;
    surfaceRef.current = session.surface;
    const nextDraft = { title: session.surface.document.title, body: session.surface.document.body };
    draftRef.current = nextDraft;
    dirtyRef.current = false;
    setSurface(session.surface);
    setDraft(nextDraft);
    setDirty(false);
    setEditMode(false);
    setConflict(null);
    setSelection(null);
    setOlderHistory([]);
    setHistoryHasMore(session.surface.hasMoreHistory);
    setSelectedRevision(null);
    setRevisionSnapshot(null);
    setConnectedAgent(null);
    setAgentPanelOpen(true);
    setAgentSetupName("");
    setAgentPromptCopied(false);
  }, [publishSurface, session.surface, sessionIdentity]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || !isActiveSession()) return;
      inFlight = true;
      try {
        const result = await service.inspect(session.humanSessionToken);
        if (!active || !isActiveSession()) return;
        if (result.ok) publishSurface(result.data);
        else if (result.code === "UNAUTHORIZED" || result.code === "NOT_FOUND") handleFailure(result);
      } catch {
        // Polling is opportunistic; explicit actions surface actionable errors.
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [handleFailure, isActiveSession, publishSurface, service, session.humanSessionToken]);

  useEffect(() => {
    const touch = async () => {
      const current = surfaceRef.current;
      const result = await service.touchPresence(session.humanSessionToken, {
        state: editMode ? "EDITING" : "VIEWING", field: editMode ? "BODY" : null,
        isTyping: editMode && dirtyRef.current, selectionStart: null, selectionEnd: null,
        observedRevision: current.document.revision,
      });
      if (result.ok && isActiveSession()) publishSurface(result.data);
    };
    void touch();
    const timer = window.setInterval(() => void touch(), 5_000);
    return () => window.clearInterval(timer);
  }, [editMode, isActiveSession, publishSurface, service, session.humanSessionToken]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!selection) return;
    const close = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setSelection(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selection]);

  useEffect(() => {
    if (!railOpen) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setRailOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [railOpen]);

  const setDraftField = (field: "title" | "body", value: string) => {
    const maximum = field === "title" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH;
    const next = { ...draftRef.current, [field]: repositoryClampCodePoints(value, maximum) };
    draftRef.current = next;
    dirtyRef.current = !repositoryDraftMatchesDocument(next, surfaceRef.current.document);
    setDraft(next);
    setDirty(dirtyRef.current);
  };

  const saveDraft = useCallback(async (expectedRevision = surfaceRef.current.document.revision) => {
    if (!dirtyRef.current || saving) return;
    const submitted = draftRef.current;
    setSaving(true);
    const result = await service.saveHumanRevision(session.humanSessionToken, { expectedRevision, title: submitted.title, body: submitted.body });
    setSaving(false);
    if (!isActiveSession()) return;
    if (!result.ok) {
      handleFailure(result);
      if (result.code === "STALE_DOCUMENT") setConflict(surfaceRef.current);
      return;
    }
    adoptSurface(result.data);
    setEditMode(false);
    setStatusMessage(`Saved r${result.data.document.revision}`);
  }, [adoptSurface, handleFailure, isActiveSession, saving, service, session.humanSessionToken]);

  const cancelEdit = () => {
    const next = { title: surface.document.title, body: surface.document.body };
    draftRef.current = next;
    dirtyRef.current = false;
    setDraft(next);
    setDirty(false);
    setConflict(null);
    setEditMode(false);
  };

  const openSelection = useCallback((mapped: RepositorySourceSelection & { rect: Pick<DOMRect, "left" | "top" | "bottom" | "width" | "height"> }) => {
    setSelection({ ...mapped, expectedRevision: surfaceRef.current.document.revision, rect: {
      left: mapped.rect.left, top: mapped.rect.top, bottom: mapped.rect.bottom, width: mapped.rect.width, height: mapped.rect.height,
    } });
    setCommentText("");
    setSelectedAgentId(null);
  }, []);

  const captureTitleSelection = (event: MouseEvent<HTMLHeadingElement> | KeyboardEvent<HTMLHeadingElement>) => {
    const root = titleReadRef.current;
    if (!root) return;
    const mapped = repositorySelectionFromDom(surface.document.title, "TITLE", root, window.getSelection());
    const browserSelection = window.getSelection();
    if (!mapped || !browserSelection || browserSelection.rangeCount !== 1) return;
    openSelection({ ...mapped, rect: browserSelection.getRangeAt(0).getBoundingClientRect() });
    event.stopPropagation();
  };

  const selectedAgent = surface.agents.find((agent) => agent.profileId === selectedAgentId) ?? null;
  const mentionMatch = commentText.match(/^@([^\t\r\n ]*)/u);
  const mentionQuery = mentionMatch?.[1]?.toLocaleLowerCase() ?? null;
  const agentSuggestions = mentionQuery === null ? [] : [...surface.agents]
    .filter((agent) => !mentionQuery || agent.name.toLocaleLowerCase().includes(mentionQuery) || agent.member.displayName.toLocaleLowerCase().includes(mentionQuery))
    .sort((left, right) => left.name.localeCompare(right.name) || left.member.displayName.localeCompare(right.member.displayName));

  const chooseAgent = (agent: IssueAgentProfile) => {
    const tokenLength = mentionMatch?.[0].length ?? 0;
    const remainder = commentText.slice(tokenLength);
    setCommentText(repositoryClampCodePoints(`@${agent.name}${remainder || " "}`, ISSUE_COMMENT_MAX_LENGTH));
    setSelectedAgentId(agent.profileId);
  };

  const changeCommentText = (value: string) => {
    const next = repositoryClampCodePoints(value, ISSUE_COMMENT_MAX_LENGTH);
    setCommentText(next);
    if (selectedAgent && !repositoryCommentStartsWithAgent(next, selectedAgent.name)) setSelectedAgentId(null);
  };

  const closeComposer = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setCommentText("");
    setSelectedAgentId(null);
  };

  const submitComment = async () => {
    if (!selection || !commentText.trim() || commentBusy) return;
    setCommentBusy(true);
    const anchor = { scope: "SELECTION" as const, field: selection.field, rangeStart: selection.rangeStart, rangeEnd: selection.rangeEnd };
    const result = selectedAgent && repositoryCommentStartsWithAgent(commentText, selectedAgent.name)
      ? await service.createMentionTask(session.humanSessionToken, {
          expectedRevision: selection.expectedRevision, comment: commentText, mentionedAgentName: selectedAgent.name,
          assignedToMemberId: selectedAgent.member.memberId, anchor,
        })
      : await service.createThread(session.humanSessionToken, { expectedRevision: selection.expectedRevision, body: commentText, anchor });
    setCommentBusy(false);
    if (!isActiveSession()) return;
    if (!result.ok) return handleFailure(result);
    publishSurface(result.data);
    setRailTab("COMMENTS");
    setRailOpen(true);
    setStatusMessage(selectedAgent ? `Assigned to ${selectedAgent.name}` : "Comment added");
    closeComposer();
  };

  const postReply = async () => {
    if (!replyThreadId || !replyBody.trim() || threadBusy) return;
    setThreadBusy(true);
    const result = await service.addHumanComment(session.humanSessionToken, { threadId: replyThreadId, body: replyBody });
    setThreadBusy(false);
    if (!result.ok) return handleFailure(result);
    publishSurface(result.data);
    setReplyBody("");
    setReplyThreadId(null);
  };

  const closeThread = async (threadId: string) => {
    if (threadBusy) return;
    setThreadBusy(true);
    const result = await service.resolveThread(session.humanSessionToken, { threadId });
    setThreadBusy(false);
    if (!result.ok) return handleFailure(result);
    publishSurface(result.data);
    setStatusMessage("Comment closed");
  };

  const restoreRevision = async (revision: number, message: string) => {
    if (historyBusy || revision === surfaceRef.current.document.revision) return;
    setHistoryBusy(true);
    const result = await service.restoreRevision(session.humanSessionToken, {
      expectedRevision: surfaceRef.current.document.revision, revision, changeSummary: repositoryClampCodePoints(message, 240),
    });
    setHistoryBusy(false);
    if (!result.ok) return handleFailure(result);
    adoptSurface(result.data);
    setStatusMessage(`Restored r${revision} as r${result.data.document.revision}`);
  };

  const allHistory = useMemo(() => {
    const revisions = new Map<number, IssueRevisionSummary>();
    for (const revision of [...surface.history, ...olderHistory]) revisions.set(revision.revision, revision);
    return [...revisions.values()].sort((left, right) => right.revision - left.revision);
  }, [olderHistory, surface.history]);

  const loadOlderHistory = async () => {
    if (historyBusy || !historyHasMore) return;
    const oldest = allHistory.at(-1)?.revision;
    setHistoryBusy(true);
    const result = await service.readHistory(session.humanSessionToken, { ...(oldest ? { beforeRevision: oldest } : {}), limit: 20 });
    setHistoryBusy(false);
    if (!result.ok) return handleFailure(result);
    setOlderHistory((current) => {
      const merged = new Map(current.map((revision) => [revision.revision, revision]));
      for (const revision of result.data.revisions) merged.set(revision.revision, revision);
      return [...merged.values()].sort((left, right) => right.revision - left.revision);
    });
    setHistoryHasMore(result.data.hasMoreOlder);
  };

  const inspectRevision = async (revision: IssueRevisionSummary) => {
    setSelectedRevision(revision);
    selectedRevisionRef.current = revision.revision;
    setRevisionSnapshot(null);
    const request = ++revisionRequestRef.current;
    const result = await service.readRevision(session.humanSessionToken, revision.revision);
    if (request !== revisionRequestRef.current || selectedRevisionRef.current !== revision.revision) return;
    if (!result.ok) return handleFailure(result);
    if (repositoryCanApplyRevisionSnapshot(revision.revision, selectedRevisionRef.current, result.data)) setRevisionSnapshot(result.data);
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1_500);
    } catch {
      setStatusMessage("Copy the link from your browser address bar.");
    }
  };

  const copyAgentPrompt = async () => {
    const name = agentSetupName.trim();
    if (!name) return;
    const prompt = `Connect to this Ratiflow document as "${name}". Call connect_agent first, then inspect_document.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setAgentPromptCopied(true);
      window.setTimeout(() => setAgentPromptCopied(false), 1_500);
    } catch {
      setStatusMessage("Copy the connection prompt shown in agent setup.");
    }
  };

  const comments = [...surface.threads].sort((left, right) => threadTime(right).localeCompare(threadTime(left)));
  const taskById = new Map(surface.tasks.map((task) => [task.taskId, task]));
  const openCount = surface.threads.filter((thread) => {
    const task = thread.taskId ? taskById.get(thread.taskId) : null;
    return task ? task.status === "OPEN" || task.status === "PROPOSED" : thread.status === "OPEN";
  }).length;
  const anchors = surface.threads.map((thread) => thread.anchor).filter(isSelectionAnchor);
  const titleCommented = anchors.some((anchor) => anchor.field === "TITLE");
  const agentToolsReady = Boolean(webMCPStatus?.supported && !webMCPStatus.error && REPOSITORY_TOOL_NAMES.every((name) => webMCPStatus.registeredTools.includes(name)));
  const selfMember = surface.members.find((member) => member.memberId === session.selfMemberId) ?? null;
  const selfDisplayName = selfMember?.displayName ?? "this collaborator";
  const agentContextLabel = activeAgentTool
    ? "Agent working"
    : connectedAgent
      ? `${connectedAgent.name} connected`
      : agentToolsReady
        ? "Connect agent"
        : webMCPStatus?.supported === false
          ? "Human mode"
          : webMCPStatus?.error
            ? "Agent tools need a reload"
            : "Checking agent tools";
  const agentContextDetail = connectedAgent
    ? `${connectedAgent.name} is connected on this page and owned by ${selfDisplayName}.`
    : agentToolsReady
      ? `No agent is connected on this page for ${selfDisplayName}.`
      : webMCPStatus?.supported === false
        ? "This browser does not expose WebMCP agent tools."
        : webMCPStatus?.error
          ? webMCPStatus.error
          : "Checking whether this page can expose agent tools.";

  const composerStyle = selection ? {
    "--comment-x": `${Math.max(12, Math.min(selection.rect.left, typeof window === "undefined" ? 700 : window.innerWidth - 350))}px`,
    "--comment-y": `${Math.max(72, Math.min(selection.rect.bottom + 10, typeof window === "undefined" ? 500 : window.innerHeight - 330))}px`,
  } as CSSProperties : undefined;

  const receiveMarkdownSelection = useCallback((mapped: MarkdownSelectionEvent) => openSelection(mapped), [openSelection]);
  const receiveAgentSurface = useCallback((incoming: IssueWorkspaceSurface) => { if (isActiveSession()) publishSurface(incoming); }, [isActiveSession, publishSurface]);
  const changeRailTabFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, current: RailTab) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: RailTab = event.key === "ArrowLeft" || event.key === "Home"
      ? "COMMENTS"
      : event.key === "ArrowRight" || event.key === "End"
        ? "HISTORY"
        : current;
    setRailTab(next);
    const index = next === "COMMENTS" ? 0 : 1;
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };

  return (
    <div className={styles.shell} data-rail-open={railOpen ? "true" : "false"} data-testid="repository-workspace">
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <Link className={styles.brand} href="/" aria-label="Ratiflow home"><span aria-hidden="true">R</span>Ratiflow</Link>
          <span className={styles.documentKind}>{repositoryKindLabel(surface.document.kind)}</span>
        </div>
        <button className={styles.revisionButton} type="button" aria-label={`Open revision history. Revision ${surface.document.revision}`} onClick={() => { setRailTab("HISTORY"); setRailOpen(true); }}><span data-state={dirty ? "unsaved" : "saved"} />r{surface.document.revision}</button>
        <div className={styles.topbarActions}>
          <button
            className={styles.agentState}
            data-connected={connectedAgent ? "true" : "false"}
            data-ready={agentToolsReady ? "true" : "false"}
            type="button"
            aria-controls="repository-agent-setup"
            aria-expanded={agentPanelOpen}
            aria-label={`${agentContextLabel}. Open agent setup.`}
            title={agentContextDetail}
            onClick={() => setAgentPanelOpen((current) => !current)}
          ><i /><span className={styles.agentStateLong}>{agentContextLabel}</span><span className={styles.agentStateShort}>{connectedAgent?.name ?? (webMCPStatus?.supported === false ? "Human" : "Agent")}</span></button>
          {editMode ? <><button className={styles.quietButton} type="button" disabled={saving} onClick={cancelEdit}>Cancel</button><button className={styles.primaryButton} data-testid="save-revision" type="button" disabled={!dirty || saving || Boolean(conflict)} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save"}</button></> : <button className={styles.quietButton} type="button" onClick={() => setEditMode(true)}>Edit</button>}
          <button className={styles.quietButton} type="button" onClick={() => void copyShareLink()}>{shareCopied ? "Copied" : "Share"}</button>
          <button className={styles.commentsButton} type="button" aria-expanded={railOpen} aria-controls="repository-collaboration-rail" onClick={() => { setRailTab("COMMENTS"); setRailOpen((current) => !current); }}>Comments {openCount ? <b>{openCount}</b> : null}</button>
        </div>
      </header>

      <div className={styles.workspace}>
        <main className={styles.documentPane}>
          {agentPanelOpen ? (
            <section
              id="repository-agent-setup"
              className={styles.agentSetup}
              data-state={connectedAgent ? "connected" : agentToolsReady ? "ready" : webMCPStatus?.supported === false ? "unsupported" : webMCPStatus?.error ? "error" : "loading"}
              aria-labelledby="repository-agent-setup-title"
            >
              <header>
                <div>
                  <p>Workspace setup · {selfDisplayName}</p>
                  <h2 id="repository-agent-setup-title">
                    {connectedAgent
                      ? "Your agent is ready to mention."
                      : agentToolsReady
                        ? "Bring your agent into this document."
                        : webMCPStatus?.supported === false
                          ? "Keep working in human mode."
                          : webMCPStatus?.error
                            ? "Agent setup needs a reload."
                            : "Checking agent support…"}
                  </h2>
                </div>
                <button type="button" aria-label="Close agent setup" onClick={() => setAgentPanelOpen(false)}>×</button>
              </header>

              {connectedAgent ? (
                <div className={styles.connectedAgent}>
                  <span aria-hidden="true">{initials(connectedAgent.name)}</span>
                  <div><strong>{connectedAgent.name}</strong><p>Connected for this page · owned by {selfDisplayName}</p></div>
                  <small>Select a passage and type <code>@{connectedAgent.name}</code> to assign it.</small>
                </div>
              ) : agentToolsReady ? (
                <form className={styles.agentSetupForm} onSubmit={(event) => { event.preventDefault(); void copyAgentPrompt(); }}>
                  <p>Name the agent you are bringing, copy the instruction, and send it in this WebMCP-capable client. The agent appears in the <code>@</code> menu only after it connects.</p>
                  <label htmlFor="repository-agent-setup-name">Agent name</label>
                  <div>
                    <input
                      id="repository-agent-setup-name"
                      autoComplete="off"
                      maxLength={ISSUE_AGENT_NAME_MAX_LENGTH}
                      placeholder="e.g. Researchbot"
                      value={agentSetupName}
                      onChange={(event) => setAgentSetupName(repositoryClampCodePoints(event.target.value.replace(/[@\r\n\u2028\u2029]/gu, ""), ISSUE_AGENT_NAME_MAX_LENGTH))}
                    />
                    <button type="submit" disabled={!agentSetupName.trim()}>{agentPromptCopied ? "Copied" : "Copy agent prompt"}</button>
                  </div>
                  <code>Connect to this Ratiflow document as &quot;{agentSetupName.trim() || "Researchbot"}&quot;. Call connect_agent first, then inspect_document.</code>
                  <small>Preparing this prompt does not register a profile; the agent self-declares its name through the page tool.</small>
                </form>
              ) : webMCPStatus?.supported === false ? (
                <div className={styles.agentSetupMessage}>
                  <strong>No agent is connected.</strong>
                  <p>This browser does not expose WebMCP agent tools. You can edit, comment, share, and inspect history normally. To bring an agent, open or join the document from a WebMCP-capable client.</p>
                </div>
              ) : webMCPStatus?.error ? (
                <div className={styles.agentSetupMessage} role="alert"><strong>The page could not register its agent tools.</strong><p>{webMCPStatus.error}</p></div>
              ) : (
                <div className={styles.agentSetupMessage} aria-live="polite"><strong>Checking this client…</strong><p>The document remains available while agent support is detected.</p></div>
              )}

              <footer>
                <p>One current agent identity per collaborator. Teammates connect their own.</p>
                <button type="button" onClick={() => setAgentPanelOpen(false)}>{connectedAgent ? "Done" : "Continue without an agent"}</button>
              </footer>
            </section>
          ) : null}
          <article className={styles.documentPaper} data-testid="writing-surface">
            {editMode ? (
              <div className={styles.sourceEditor}>
                <label htmlFor="repository-document-title">Document title</label>
                <input id="repository-document-title" autoFocus value={draft.title} onChange={(event) => setDraftField("title", event.target.value)} />
                <label htmlFor="repository-document-body">Markdown source</label>
                <textarea id="repository-document-body" value={draft.body} spellCheck onChange={(event) => setDraftField("body", event.target.value)} />
                <p>Tables, task lists, and chart fences render after you save.</p>
              </div>
            ) : (
              <div className={styles.readingView}>
                <p className={styles.documentEyebrow}>{repositoryKindLabel(surface.document.kind)} · r{surface.document.revision}</p>
                <h1 ref={titleReadRef} data-source-start="0" data-source-end={surface.document.title.length} data-commented={titleCommented ? "true" : undefined} tabIndex={0} onMouseUp={captureTitleSelection} onKeyUp={(event) => { if (event.shiftKey || event.key === "Enter") captureTitleSelection(event); }}>{surface.document.title}</h1>
                <MarkdownDocument source={surface.document.body} anchors={anchors} onSelectSource={receiveMarkdownSelection} />
              </div>
            )}
            <footer className={styles.documentFooter}><span>Last changed by {actorLabel(surface.document.lastRevision.author)}</span><span>{repositoryAuthorityLabel(surface.document.lastRevision.authority)}</span></footer>
          </article>
        </main>

        <aside id="repository-collaboration-rail" className={styles.rail} aria-label="Comments and history">
          <header className={styles.railHeader}>
            <div className={styles.railTabs} role="tablist" aria-label="Document context">
              <button type="button" role="tab" aria-selected={railTab === "COMMENTS"} tabIndex={railTab === "COMMENTS" ? 0 : -1} onClick={() => setRailTab("COMMENTS")} onKeyDown={(event) => changeRailTabFromKeyboard(event, "COMMENTS")}>Comments <span>{comments.length}</span></button>
              <button type="button" role="tab" aria-selected={railTab === "HISTORY"} tabIndex={railTab === "HISTORY" ? 0 : -1} onClick={() => setRailTab("HISTORY")} onKeyDown={(event) => changeRailTabFromKeyboard(event, "HISTORY")}>History <span>{surface.document.revision}</span></button>
            </div>
            <button className={styles.railClose} type="button" aria-label="Close comments and history" onClick={() => setRailOpen(false)}>×</button>
          </header>
          <div className={styles.railBody}>
            {railTab === "COMMENTS" ? (
              <section aria-label="Comment stream" className={styles.commentStream}>
                {comments.length ? comments.map((thread) => {
                  const task = thread.taskId ? taskById.get(thread.taskId) ?? null : null;
                  return <CollaborationCard key={thread.threadId} thread={thread} task={task} replyOpen={replyThreadId === thread.threadId} replyBody={replyThreadId === thread.threadId ? replyBody : ""} busy={threadBusy || historyBusy} onReplyOpen={() => { setReplyThreadId(thread.threadId); setReplyBody(""); }} onReplyBody={setReplyBody} onReplySubmit={() => void postReply()} onClose={() => void closeThread(thread.threadId)} onRestoreBeforeTask={() => {
                    if (task?.status === "COMPLETED" && task.result?.outcome === "COMMITTED") void restoreRevision(Math.max(1, task.result.resultRevision - 1), `Reverted ${task.taskKey}: ${task.result.resultSummary}`);
                  }} />;
                }) : <div className={styles.railEmpty}><strong>No comments yet</strong><span>Select a passage to discuss it or type @ to delegate.</span></div>}
              </section>
            ) : selectedRevision ? (
              <section className={styles.revisionDetail}>
                <button className={styles.backButton} type="button" onClick={() => { selectedRevisionRef.current = null; setSelectedRevision(null); setRevisionSnapshot(null); }}>← All history</button>
                <header><span>r{selectedRevision.revision}</span><time>{formatDateTime(selectedRevision.createdAt)}</time></header>
                <h2>{selectedRevision.changeSummary}</h2><p>{repositoryProvenanceSummary(selectedRevision.provenance)}</p>
                <RevisionDiff revision={selectedRevision} /><Evidence refs={selectedRevision.evidenceRefs} />
                {revisionSnapshot ? <p className={styles.snapshotNote}>Immutable snapshot · {revisionSnapshot.title}</p> : <p className={styles.snapshotNote}>Loading immutable snapshot…</p>}
                {selectedRevision.revision !== surface.document.revision ? <button className={styles.restoreRevision} type="button" disabled={historyBusy} onClick={() => void restoreRevision(selectedRevision.revision, `Restored r${selectedRevision.revision}.`)}>Restore r{selectedRevision.revision}</button> : null}
              </section>
            ) : (
              <section aria-label="Revision history" className={styles.historyStream}>
                <div className={styles.historyIntro}><strong>Document history</strong><span>Prompts, context, people, agents, and every change stay connected.</span></div>
                <ol>{allHistory.map((revision) => <li key={revision.revision} data-testid="revision-card" data-revision={revision.revision} data-authority={revision.provenance.authority.toLowerCase()}><button type="button" onClick={() => void inspectRevision(revision)}><i /><span><b>r{revision.revision}</b><strong>{revision.changeSummary}</strong><small>{repositoryRevisionLineageLabel(revision)}</small></span><time>{formatDateTime(revision.createdAt)}</time></button></li>)}</ol>
                {historyHasMore ? <button className={styles.loadOlder} type="button" disabled={historyBusy} onClick={() => void loadOlderHistory()}>{historyBusy ? "Loading…" : "Load older"}</button> : null}
              </section>
            )}
          </div>
          <footer className={styles.railFooter} data-ready={agentToolsReady ? "true" : "false"}><i /><span><strong>{agentContextLabel}</strong><small>History is available to connected agents.</small></span></footer>
        </aside>
      </div>

      {selection && !editMode ? (
        <aside className={styles.selectionComposer} style={composerStyle} data-testid="selection-comment-composer" aria-label="Comment on selection">
          <header><span>Comment on</span><button type="button" aria-label="Close comment" onClick={closeComposer}>×</button></header>
          <blockquote>{compactExcerpt(selection.selectedText, 130)}</blockquote>
          <label htmlFor="repository-selection-comment">Comment or @ an agent</label>
          <textarea id="repository-selection-comment" autoFocus maxLength={ISSUE_COMMENT_MAX_LENGTH} placeholder="@Databot pull the latest numbers…" value={commentText} onChange={(event) => changeCommentText(event.target.value)} onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void submitComment(); }
          }} />
          {mentionQuery !== null && !selectedAgent ? <div className={styles.agentAutocomplete} role="listbox" aria-label="Available agents">{agentSuggestions.length ? agentSuggestions.map((agent) => <button key={agent.profileId} type="button" role="option" aria-selected="false" onClick={() => chooseAgent(agent)}><span>{initials(agent.name)}</span><b>{agent.name}</b><small>{agent.member.displayName}</small></button>) : <p>No matching connected agent. Unselected @ text will stay a human comment.</p>}</div> : null}
          {selectedAgent ? <p className={styles.selectedAgent}>Assigned to <strong>{selectedAgent.name}</strong> · {selectedAgent.member.displayName}</p> : null}
          <footer><small>{selectedAgent ? "The agent can change only this selected passage." : "⌘↵ to post"}</small><button type="button" disabled={commentBusy || !commentText.trim()} onClick={() => void submitComment()}>{commentBusy ? "Posting…" : selectedAgent ? "Assign" : "Comment"}</button></footer>
        </aside>
      ) : null}

      {conflict ? <aside className={styles.conflictBanner} role="alert"><div><strong>A newer revision arrived</strong><span>Your draft is still here.</span></div><button type="button" onClick={() => { adoptSurface(conflict); setEditMode(false); }}>Use latest</button><button type="button" disabled={saving} onClick={() => void saveDraft(conflict.document.revision)}>Save mine as next revision</button></aside> : null}
      {statusMessage && !conflict ? <div className={styles.statusToast} role="status">{statusMessage}</div> : null}
      <div className={styles.mobileScrim} aria-hidden="true" onClick={() => setRailOpen(false)} />
      <button className={styles.newDocumentButton} type="button" onClick={() => { if (onNewDocument) onNewDocument(); else router.push("/new"); }}>New document</button>

      <RepositoryWebMCPBridge surface={surface} sessionInstanceId={session.sessionInstanceId} agentSessionToken={session.agentSessionToken} selfMemberId={session.selfMemberId} service={service} onStatusChange={(next) => { if (isActiveSession()) setWebMCPStatus(next); }} onAuthoritativeSurface={receiveAgentSurface} onAgentConnectionChange={(profile) => { if (!isActiveSession()) return; setConnectedAgent(profile); setAgentPanelOpen(profile === null); }} onToolExecutionChange={(tool) => { if (isActiveSession()) setActiveAgentTool(tool); }} />
    </div>
  );
}
