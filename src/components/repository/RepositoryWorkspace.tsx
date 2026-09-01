"use client";

import Link from "next/link";
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
  ISSUE_AGENT_LABEL_MAX_LENGTH,
  ISSUE_BODY_MAX_LENGTH,
  ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
  ISSUE_COMMENT_MAX_LENGTH,
  ISSUE_TASK_CATEGORIES,
  ISSUE_TASK_INSTRUCTION_MAX_LENGTH,
  ISSUE_TASK_TITLE_MAX_LENGTH,
  ISSUE_TITLE_MAX_LENGTH,
  REPOSITORY_TOOL_NAMES,
  type IssueActorSnapshot,
  type IssueAnchor,
  type IssueComment,
  type IssueDocumentField,
  type IssueDocumentKind,
  type IssueMemberSnapshot,
  type IssueRevision,
  type IssueRevisionProvenance,
  type IssueRevisionSummary,
  type IssueSessionBundle,
  type IssueTask,
  type IssueTaskCategory,
  type IssueTaskMode,
  type IssueThread,
  type IssueWorkspaceSurface,
  type RepositoryBrowserClientPort,
  type RepositoryFailure,
} from "@/repository/contracts";
import { issueSlice } from "@/repository/range";
import { reconcileIssueSurface } from "@/repository/surface-reconciliation";

import {
  RepositoryWebMCPBridge,
  type RepositoryWebMCPBridgeStatus,
} from "./RepositoryWebMCPBridge";
import styles from "./repository-workspace.module.css";

type EditorControl = HTMLInputElement | HTMLTextAreaElement;
type RailTab = "THREADS" | "HISTORY";
type SaveState = "SAVED" | "UNSAVED" | "SAVING" | "CONFLICT" | "ERROR";
type ActiveAgentTool =
  | "wait_for_my_tasks"
  | "comment_on_task"
  | "submit_task_result"
  | null;

interface SelectionTarget {
  scope: "SELECTION";
  field: IssueDocumentField;
  startUtf16: number;
  endUtf16: number;
  rangeStart: number;
  rangeEnd: number;
  selectedText: string;
  expectedRevision: number;
}

interface DocumentTarget {
  scope: "DOCUMENT";
  expectedRevision: number;
}

type TaskTarget = SelectionTarget | DocumentTarget;

interface TaskComposerState {
  kind: "TASK";
  target: TaskTarget;
  title: string;
  category: IssueTaskCategory;
  instruction: string;
  agentLabel: string;
  mode: IssueTaskMode;
  assignedToMemberId: string;
}

interface CommentComposerState {
  kind: "COMMENT";
  target: SelectionTarget;
  body: string;
}

type ComposerState = TaskComposerState | CommentComposerState;

interface ContextMenuState {
  x: number;
  y: number;
  target: SelectionTarget;
}

interface PointerContextRecord {
  pointerId: number;
  target: EditorControl;
  field: IssueDocumentField;
  selection: Omit<SelectionTarget, "expectedRevision">;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  timeStamp: number;
}

interface PresenceDraft {
  state: "VIEWING" | "EDITING" | "IDLE";
  field: IssueDocumentField | null;
  isTyping: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
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
    && (
      incomingDocumentId === undefined
      || currentSession.surface.document.id === incomingDocumentId
    );
}

const POLL_INTERVAL_MS = 3_000;
const PRESENCE_INTERVAL_MS = 5_000;
const PRESENCE_TTL_MS = 15_000;
const POINTER_CONTEXT_WINDOW_MS = 1_000;

const TASK_CATEGORY_LABELS: Record<IssueTaskCategory, string> = {
  DATA: "Data",
  LOGS: "Logs",
  CODEBASE: "Codebase",
  RESEARCH: "Research",
  WRITING: "Writing",
  GENERAL: "General",
};

const TASK_MODE_LABELS: Record<IssueTaskMode, string> = {
  COMMENT: "Comment only",
  REVIEW: "Review required",
  DIRECT: "Can edit directly",
};

const TASK_MODE_DESCRIPTIONS: Record<IssueTaskMode, string> = {
  COMMENT: "The agent can post findings and evidence, but cannot change the document.",
  REVIEW: "The agent can propose a scoped change. A person must apply or reject it.",
  DIRECT: "The agent can commit one scoped change under this task’s recorded grant.",
};

const TASK_STATUS_LABELS: Record<IssueTask["status"], string> = {
  OPEN: "Open",
  PROPOSED: "Review ready",
  COMPLETED: "Done",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  STALE: "Stale",
};

export function repositoryKindLabel(kind: IssueDocumentKind): string {
  return kind === "POSTMORTEM" ? "Postmortem" : "Product document";
}

export function repositoryAuthorityLabel(
  authority: IssueRevisionProvenance["authority"],
): string {
  if (authority === "DIRECT") return "Direct agent commit";
  if (authority === "REVIEW") return "Reviewed agent change";
  if (authority === "RESTORE") return "Restored revision";
  return "Human edit";
}

export function repositoryProvenanceSummary(
  provenance: IssueRevisionProvenance,
): string {
  if (provenance.authority === "DIRECT") {
    return `${provenance.author.displayName} committed directly · granted by ${provenance.grantedBy.displayName}`;
  }
  if (provenance.authority === "REVIEW") {
    return `${provenance.author.displayName} authored · applied by ${provenance.approvedBy.displayName}`;
  }
  if (provenance.authority === "RESTORE") {
    return `${provenance.author.displayName} restored r${provenance.restoredRevision}`;
  }
  return `${provenance.author.displayName} edited in Ratiflow`;
}

export function repositoryRevisionLineageLabel(
  revision: Pick<IssueRevisionSummary, "parentRevision" | "provenance">,
): string {
  const provenance = revision.provenance;
  if (provenance.authority === "DIRECT") {
    const rebased = revision.parentRevision !== null
      && provenance.sourceRevision < revision.parentRevision;
    return rebased
      ? `${provenance.author.displayName} · Direct from r${provenance.sourceRevision}, safely rebased`
      : `${provenance.author.displayName} · Direct`;
  }
  if (provenance.authority === "REVIEW") {
    return `${provenance.author.displayName} · Reviewed by ${provenance.approvedBy.displayName}`;
  }
  if (provenance.authority === "RESTORE") {
    return `${provenance.author.displayName} · Restored r${provenance.restoredRevision}`;
  }
  return revision.parentRevision === null
    ? `${provenance.author.displayName} · Started`
    : `${provenance.author.displayName} · Edited`;
}

function RevisionLineage({
  revisions,
  onSelect,
}: {
  revisions: readonly IssueRevisionSummary[];
  onSelect: (revision: IssueRevisionSummary) => void;
}) {
  if (!revisions.some(({ provenance }) => (
    provenance.authority === "DIRECT" || provenance.authority === "REVIEW"
  ))) return null;
  const visible = [...revisions]
    .sort((left, right) => left.revision - right.revision)
    .slice(-4);

  return (
    <section
      className={styles.revisionLineage}
      aria-label="Revision path"
      data-testid="revision-lineage"
    >
      <span>Revision path</span>
      <ol>
        {visible.map((revision) => (
          <li key={revision.revisionId} data-authority={revision.provenance.authority.toLowerCase()}>
            <button
              type="button"
              aria-label={`Open r${revision.revision} revision details: ${repositoryRevisionLineageLabel(revision)}`}
              onClick={() => onSelect(revision)}
            >
              <b>r{revision.revision}</b>
              <small>{repositoryRevisionLineageLabel(revision)}</small>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function failureMessage(failure: RepositoryFailure): string {
  return failure.message || "The repository document could not be updated.";
}

export function repositoryClampCodePoints(value: string, maximum: number): string {
  const points = Array.from(value);
  return points.length > maximum ? points.slice(0, maximum).join("") : value;
}

export function repositoryDraftMatchesDocument(
  draft: { title: string; body: string },
  document: { title: string; body: string },
): boolean {
  return draft.title === document.title && draft.body === document.body;
}

export function repositoryShouldAdoptRevisionMutation(
  liveDraft: { title: string; body: string },
  baselineDraft: { title: string; body: string },
  currentDocument: { title: string; body: string },
  isDirty: boolean,
): boolean {
  return repositoryDraftMatchesDocument(liveDraft, baselineDraft)
    || (!isDirty && repositoryDraftMatchesDocument(liveDraft, currentDocument));
}

export function repositoryCanApplyRevisionSnapshot(
  selectedRevision: number | null,
  requestedRevision: number,
  snapshot: Pick<IssueRevision, "revision">,
): boolean {
  return selectedRevision === requestedRevision && snapshot.revision === requestedRevision;
}

export function repositoryNextHistoryHasMore(
  loadedOlderCount: number,
  currentHasMore: boolean,
  incomingHasMore: boolean,
): boolean {
  return loadedOlderCount > 0 ? currentHasMore : incomingHasMore;
}

function compactExcerpt(value: string, maximum = 160): string {
  const compact = value.replace(/\s+/g, " ").trim();
  const points = Array.from(compact);
  return points.length > maximum
    ? `${points.slice(0, maximum - 1).join("")}…`
    : compact;
}

function codePointOffset(value: string, utf16Offset: number): number {
  return Array.from(value.slice(0, utf16Offset)).length;
}

function selectionFromControl(
  field: IssueDocumentField,
  control: EditorControl,
  revision: number,
): SelectionTarget {
  const startUtf16 = Math.min(
    control.selectionStart ?? control.value.length,
    control.selectionEnd ?? control.value.length,
  );
  const endUtf16 = Math.max(
    control.selectionStart ?? control.value.length,
    control.selectionEnd ?? control.value.length,
  );
  return {
    scope: "SELECTION",
    field,
    startUtf16,
    endUtf16,
    rangeStart: codePointOffset(control.value, startUtf16),
    rangeEnd: codePointOffset(control.value, endUtf16),
    selectedText: control.value.slice(startUtf16, endUtf16),
    expectedRevision: revision,
  };
}

function sameSelection(
  left: Omit<SelectionTarget, "expectedRevision">,
  right: SelectionTarget,
): boolean {
  return (
    left.field === right.field &&
    left.rangeStart === right.rangeStart &&
    left.rangeEnd === right.rangeEnd &&
    left.selectedText === right.selectedText
  );
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function provenanceOriginLabel(origin: IssueRevisionProvenance["origin"]): string {
  if (origin === "ORDINARY_UI") return "Human UI";
  if (origin === "WEBMCP") return "WebMCP";
  return "System";
}

function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? words.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

function activePresence(surface: IssueWorkspaceSurface) {
  const now = Date.now();
  return surface.presence.filter((person) => {
    const seenAt = Date.parse(person.lastSeenAt);
    return Number.isFinite(seenAt) && now - seenAt <= PRESENCE_TTL_MS;
  });
}

function anchorExcerpt(anchor: IssueAnchor): string {
  if (anchor.scope === "DOCUMENT") return "Whole document";
  return anchor.selectedText || "Selected passage";
}

function humanChangeSummary(
  previous: { title: string; body: string },
  next: { title: string; body: string },
): string {
  const titleChanged = previous.title !== next.title;
  const bodyChanged = previous.body !== next.body;
  if (titleChanged && bodyChanged) return "Updated document title and content";
  if (titleChanged) return "Updated document title";
  return "Updated document content";
}

function isOpenTask(task: IssueTask): boolean {
  return task.status === "OPEN" || task.status === "PROPOSED";
}

function compareTasks(left: IssueTask, right: IssueTask): number {
  if (left.status === "PROPOSED" && right.status !== "PROPOSED") return -1;
  if (right.status === "PROPOSED" && left.status !== "PROPOSED") return 1;
  return right.updatedAt.localeCompare(left.updatedAt) || left.taskKey.localeCompare(right.taskKey);
}

function actorKindLabel(actor: IssueActorSnapshot): string {
  if (actor.actorType === "AGENT") {
    return `Agent · paired with ${actor.member.displayName}`;
  }
  if (actor.actorType === "SYSTEM") return "System";
  return "Human";
}

function ActorMark({ actor }: { actor: IssueActorSnapshot }) {
  return (
    <span className={styles.actorMark} data-actor-type={actor.actorType.toLowerCase()}>
      <b aria-hidden="true">{actor.actorType === "AGENT" ? "✦" : initials(actor.displayName)}</b>
      <span>
        <strong>{actor.displayName}</strong>
        <small>{actorKindLabel(actor)}</small>
      </span>
    </span>
  );
}

function AnchorQuote({
  creationAnchor,
  anchor,
}: {
  creationAnchor: IssueAnchor;
  anchor: IssueAnchor;
}) {
  const targetLabel = creationAnchor.scope === "DOCUMENT"
    ? "Whole document"
    : creationAnchor.field === "TITLE"
      ? "Title selection"
      : "Document selection";
  const targetChanged = creationAnchor.scope === "SELECTION"
    && anchor.scope === "SELECTION"
    && (
      creationAnchor.field !== anchor.field
      || creationAnchor.rangeStart !== anchor.rangeStart
      || creationAnchor.rangeEnd !== anchor.rangeEnd
      || creationAnchor.selectedText !== anchor.selectedText
    );
  return (
    <blockquote className={styles.anchorQuote} data-anchor-state={anchor.anchorState.toLowerCase()}>
      <span>{targetLabel} · created r{creationAnchor.createdRevision}</span>
      “{compactExcerpt(anchorExcerpt(creationAnchor))}”
      <footer className={styles.anchorContext}>
        Current target · r{anchor.anchorRevision} · {anchor.anchorState.toLowerCase()}
        {targetChanged ? (
          <cite>“{compactExcerpt(anchorExcerpt(anchor))}”</cite>
        ) : null}
      </footer>
    </blockquote>
  );
}

function EvidenceLinks({ refs }: { refs: readonly string[] }) {
  if (refs.length === 0) return null;
  return (
    <ul className={styles.evidenceList} aria-label="Evidence references">
      {refs.map((reference) => (
        <li key={reference}>{reference}</li>
      ))}
    </ul>
  );
}

function CommentTimeline({
  comments,
  onReply,
}: {
  comments: readonly IssueComment[];
  onReply: (comment: IssueComment) => void;
}) {
  if (comments.length === 0) {
    return <p className={styles.emptyDiscussion}>No discussion yet.</p>;
  }
  const commentById = new Map(comments.map((comment) => [comment.commentId, comment]));
  return (
    <ol className={styles.commentList} data-testid="comment-thread">
      {comments.map((comment) => (
        <li
          className={styles.comment}
          data-actor-type={comment.author.actorType.toLowerCase()}
          data-reply={comment.replyToCommentId ? "true" : undefined}
          data-testid="thread-message"
          key={comment.commentId}
        >
          <ActorMark actor={comment.author} />
          <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
          {comment.replyToCommentId ? (
            <small className={styles.replyContext}>
              Reply to {commentById.get(comment.replyToCommentId)?.author.displayName ?? "earlier comment"}
            </small>
          ) : null}
          <p>{comment.body}</p>
          <EvidenceLinks refs={comment.evidenceRefs} />
          <button type="button" onClick={() => onReply(comment)}>Reply</button>
        </li>
      ))}
    </ol>
  );
}

interface ThreadDetailProps {
  selfMemberId: string;
  task: IssueTask | null;
  thread: IssueThread;
  commentDraft: string;
  replyTo: IssueComment | null;
  busy: boolean;
  decisionNote: string;
  onBack: () => void;
  onCommentDraftChange: (value: string) => void;
  onReply: (comment: IssueComment | null) => void;
  onSubmitComment: () => void;
  onResolve: () => void;
  onCancelTask: (task: IssueTask) => void;
  onDecisionNoteChange: (value: string) => void;
  onDecide: (task: IssueTask, decision: "ACCEPT" | "REJECT") => void;
}

function ThreadDetail({
  selfMemberId,
  task,
  thread,
  commentDraft,
  replyTo,
  busy,
  decisionNote,
  onBack,
  onCommentDraftChange,
  onReply,
  onSubmitComment,
  onResolve,
  onCancelTask,
  onDecisionNoteChange,
  onDecide,
}: ThreadDetailProps) {
  const canControlTask = task?.creator.memberId === selfMemberId;
  const proposalBefore = task?.proposal?.liveAnchor.selectedText ?? null;
  return (
    <div className={styles.threadDetail} data-testid="thread-detail">
      <button className={styles.backButton} type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> All threads
      </button>

      <div className={styles.detailHeading}>
        <div>
          <span>{task ? `${task.taskKey} · ${TASK_CATEGORY_LABELS[task.category]}` : "Document comment"}</span>
          <h3>{task?.title ?? "Discussion on this passage"}</h3>
        </div>
        <span className={styles.statusBadge} data-status={(task?.status ?? thread.status).toLowerCase()}>
          {task ? TASK_STATUS_LABELS[task.status] : thread.status === "OPEN" ? "Open" : "Resolved"}
        </span>
      </div>

      <AnchorQuote creationAnchor={thread.creationAnchor} anchor={thread.anchor} />

      {task ? (
        <section className={styles.taskBrief} aria-label="Task brief">
          <div className={styles.taskMeta}>
            <span className={styles.modeBadge} data-mode={task.mode.toLowerCase()}>
              {TASK_MODE_LABELS[task.mode]}
            </span>
            <span>Created by {task.creator.displayName}</span>
            <span>Assigned to {task.assignee.displayName}</span>
            <span>Agent label: {task.agentLabel}</span>
          </div>
          <p>{task.instruction}</p>
        </section>
      ) : null}

      {task?.proposal ? (
        <section className={styles.proposal} data-testid="task-proposal">
          <div className={styles.sectionTopline}>
            <strong>Proposed change</strong>
            <span>based on r{task.proposal.sourceRevision}</span>
          </div>
          <div className={styles.proposalActor}>
            <ActorMark actor={task.proposal.proposedBy} />
            <time dateTime={task.proposal.proposedAt}>{formatDateTime(task.proposal.proposedAt)}</time>
          </div>
          <p>{task.proposal.resultSummary}</p>
          {proposalBefore !== null ? (
            <div className={styles.diff} data-testid="revision-diff">
              <div>
                <span>Before</span>
                <del>{proposalBefore || "Empty"}</del>
              </div>
              <div>
                <span>After</span>
                <ins>{task.proposal.replacementText || "Remove selection"}</ins>
              </div>
            </div>
          ) : null}
          <EvidenceLinks refs={task.proposal.evidenceRefs} />
          {task.status === "PROPOSED" && canControlTask ? (
            <div className={styles.reviewComposer}>
              <label htmlFor={`decision-note-${task.taskId}`}>
                Review note <small>Optional</small>
              </label>
              <textarea
                id={`decision-note-${task.taskId}`}
                value={decisionNote}
                placeholder="Add context worth preserving with this decision…"
                onChange={(event) => onDecisionNoteChange(
                  repositoryClampCodePoints(
                    event.target.value,
                    ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
                  ),
                )}
              />
              <div className={styles.reviewActions}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(task, "REJECT")}
                >
                  Reject
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(task, "ACCEPT")}
                >
                  Apply change
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {task?.result ? (
        <section className={styles.finding} data-outcome={task.result.outcome.toLowerCase()}>
          <span>{task.result.outcome === "COMMITTED" ? `Committed r${task.result.resultRevision}` : "Finding"}</span>
          <p>{task.result.resultSummary}</p>
          <ActorMark actor={task.result.submittedBy} />
          <EvidenceLinks refs={task.result.evidenceRefs} />
        </section>
      ) : null}

      {task?.decision ? (
        <blockquote className={styles.decisionNote}>
          <span>{task.decision.kind === "ACCEPTED" ? "Applied" : "Rejected"} by {task.decision.decidedBy.displayName}</span>
          {task.decision.note || "No additional review note."}
        </blockquote>
      ) : null}

      <section className={styles.discussion} aria-labelledby={`discussion-${thread.threadId}`}>
        <div className={styles.sectionTopline}>
          <strong id={`discussion-${thread.threadId}`}>Discussion</strong>
          <span>{thread.comments.length}</span>
        </div>
        <CommentTimeline comments={thread.comments} onReply={onReply} />
        <div className={styles.commentComposer}>
          {replyTo ? (
            <div className={styles.replyingTo}>
              <span>Replying to {replyTo.author.displayName}</span>
              <button type="button" onClick={() => onReply(null)}>Cancel reply</button>
            </div>
          ) : null}
          <label className={styles.srOnly} htmlFor={`thread-comment-${thread.threadId}`}>
            Add a comment
          </label>
          <textarea
            id={`thread-comment-${thread.threadId}`}
            value={commentDraft}
            placeholder="Add evidence, a question, or a decision…"
            onChange={(event) =>
              onCommentDraftChange(
                repositoryClampCodePoints(event.target.value, ISSUE_COMMENT_MAX_LENGTH),
              )
            }
          />
          <button
            className={styles.primaryButton}
            type="button"
            disabled={busy || !commentDraft.trim()}
            onClick={onSubmitComment}
          >
            {busy ? "Adding…" : replyTo ? "Reply" : "Comment"}
          </button>
        </div>
      </section>

      <div className={styles.threadFooterActions}>
        {!task && thread.status === "OPEN" ? (
          <button type="button" disabled={busy} onClick={onResolve}>Resolve discussion</button>
        ) : null}
        {task && task.status === "OPEN" && canControlTask ? (
          <button type="button" disabled={busy} onClick={() => onCancelTask(task)}>Cancel task</button>
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: IssueTask; onOpen: () => void }) {
  return (
    <li className={styles.taskCard} data-authority={task.mode.toLowerCase()} data-status={task.status.toLowerCase()} data-testid="task-card">
      <button type="button" onClick={onOpen}>
        <span className={styles.taskCardTopline}>
          <span>{task.taskKey} · {TASK_CATEGORY_LABELS[task.category]}</span>
          <span className={styles.statusBadge} data-status={task.status.toLowerCase()}>
            {TASK_STATUS_LABELS[task.status]}
          </span>
        </span>
        <strong>{task.title}</strong>
        <span className={styles.cardExcerpt}>“{compactExcerpt(anchorExcerpt(task.creationAnchor), 105)}”</span>
        <span className={styles.cardMeta}>
          <span className={styles.modeBadge} data-mode={task.mode.toLowerCase()}>{TASK_MODE_LABELS[task.mode]}</span>
          <span>{task.assignee.displayName}</span>
        </span>
      </button>
    </li>
  );
}

function DiscussionCard({
  thread,
  onOpen,
}: {
  thread: IssueThread;
  onOpen: () => void;
}) {
  const firstComment = thread.comments[0];
  return (
    <li className={styles.discussionCard} data-status={thread.status.toLowerCase()} data-testid="comment-thread-card">
      <button type="button" onClick={onOpen}>
        <span className={styles.taskCardTopline}>
          <span>Comment</span>
          <span className={styles.statusBadge} data-status={thread.status.toLowerCase()}>{thread.status === "OPEN" ? "Open" : "Resolved"}</span>
        </span>
        <strong>{firstComment ? compactExcerpt(firstComment.body, 110) : "Discussion"}</strong>
        <span className={styles.cardExcerpt}>“{compactExcerpt(anchorExcerpt(thread.creationAnchor), 105)}”</span>
        <span className={styles.cardMeta}>{thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}</span>
      </button>
    </li>
  );
}

interface ThreadsPanelProps extends Omit<ThreadDetailProps, "task" | "thread"> {
  tasks: readonly IssueTask[];
  threads: readonly IssueThread[];
  selectedThreadId: string | null;
  onOpenThread: (threadId: string) => void;
  onCreateDocumentTask: () => void;
  documentTaskButtonRef: React.RefObject<HTMLButtonElement | null>;
  agentFooter: React.ReactNode;
}

function ThreadsPanel({
  tasks,
  threads,
  selectedThreadId,
  onOpenThread,
  onCreateDocumentTask,
  documentTaskButtonRef,
  agentFooter,
  ...detailProps
}: ThreadsPanelProps) {
  const threadById = new Map(threads.map((thread) => [thread.threadId, thread]));
  const taskByThreadId = new Map(tasks.map((task) => [task.threadId, task]));
  const selectedThread = selectedThreadId ? threadById.get(selectedThreadId) ?? null : null;
  const selectedTask = selectedThread ? taskByThreadId.get(selectedThread.threadId) ?? null : null;
  if (selectedThread) {
    return <ThreadDetail {...detailProps} task={selectedTask} thread={selectedThread} />;
  }

  const openTasks = tasks.filter(isOpenTask).sort(compareTasks);
  const doneTasks = tasks.filter((task) => !isOpenTask(task)).sort(compareTasks);
  const standalone = threads.filter((thread) => thread.taskId === null);
  const openDiscussions = standalone.filter((thread) => thread.status === "OPEN");
  const resolvedDiscussions = standalone.filter((thread) => thread.status === "RESOLVED");

  return (
    <div className={styles.threadIndex} data-testid="thread-list">
      <div className={styles.threadIndexActions}>
        <button
          ref={documentTaskButtonRef}
          className={styles.documentTaskButton}
          type="button"
          onClick={onCreateDocumentTask}
        >
          <span aria-hidden="true">↗</span> Create whole-document comment task
        </button>
      </div>
      <section aria-labelledby="open-tasks-heading">
        <div className={styles.listHeading}>
          <h3 id="open-tasks-heading">Open tasks</h3>
          <span>{openTasks.length}</span>
        </div>
        {openTasks.length ? (
          <ul className={styles.cardList}>
            {openTasks.map((task) => (
              <TaskCard task={task} key={task.taskId} onOpen={() => onOpenThread(task.threadId)} />
            ))}
          </ul>
        ) : (
          <p className={styles.emptyList}>Select a passage to create a task for a person or their agent.</p>
        )}
      </section>

      <section aria-labelledby="document-comments-heading">
        <div className={styles.listHeading}>
          <h3 id="document-comments-heading">Document comments</h3>
          <span>{openDiscussions.length}</span>
        </div>
        {openDiscussions.length ? (
          <ul className={styles.cardList}>
            {openDiscussions.map((thread) => (
              <DiscussionCard thread={thread} key={thread.threadId} onOpen={() => onOpenThread(thread.threadId)} />
            ))}
          </ul>
        ) : (
          <p className={styles.emptyList}>Comments on exact passages will collect here.</p>
        )}
      </section>

      {doneTasks.length || resolvedDiscussions.length ? (
        <details className={styles.doneGroup}>
          <summary>Done and resolved <span>{doneTasks.length + resolvedDiscussions.length}</span></summary>
          <ul className={styles.cardList}>
            {doneTasks.map((task) => (
              <TaskCard task={task} key={task.taskId} onOpen={() => onOpenThread(task.threadId)} />
            ))}
            {resolvedDiscussions.map((thread) => (
              <DiscussionCard thread={thread} key={thread.threadId} onOpen={() => onOpenThread(thread.threadId)} />
            ))}
          </ul>
        </details>
      ) : null}

      {agentFooter}
    </div>
  );
}

function RevisionDiff({ revision }: { revision: IssueRevisionSummary }) {
  if (revision.diffs.length === 0) {
    return <p className={styles.emptyDiff}>This revision records no textual change.</p>;
  }
  return (
    <div className={styles.diffStack} data-testid="revision-diff">
      {revision.diffs.map((diff, index) => (
        <div className={styles.diff} key={`${diff.field}-${diff.rangeStart}-${index}`}>
          <span className={styles.diffField}>{diff.field === "TITLE" ? "Title" : "Document"}</span>
          <div>
            <span>Before</span>
            <del>{diff.before || "Empty"}</del>
          </div>
          <div>
            <span>After</span>
            <ins>{diff.after || "Removed"}</ins>
          </div>
        </div>
      ))}
    </div>
  );
}

function RevisionDetail({
  revision,
  snapshot,
  currentRevision,
  busy,
  onBack,
  onRestore,
}: {
  revision: IssueRevisionSummary;
  snapshot: IssueRevision | null;
  currentRevision: number;
  busy: boolean;
  onBack: () => void;
  onRestore: (revision: IssueRevisionSummary) => void;
}) {
  const provenance = revision.provenance;
  return (
    <article
      className={styles.revisionDetail}
      data-actor-type={provenance.author.actorType.toLowerCase()}
      data-authority={provenance.authority.toLowerCase()}
      data-revision={revision.revision}
      data-testid="revision-detail"
    >
      <button className={styles.backButton} type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> All revisions
      </button>
      <div className={styles.revisionDetailHeading}>
        <div>
          <span>Revision {revision.revision}</span>
          <h3>{revision.changeSummary}</h3>
        </div>
        <span className={styles.authorityBadge} data-authority={provenance.authority.toLowerCase()}>
          {repositoryAuthorityLabel(provenance.authority)}
        </span>
      </div>
      <ActorMark actor={provenance.author} />
      <p className={styles.provenanceLine}>{repositoryProvenanceSummary(provenance)}</p>
      <dl className={styles.provenanceGrid} data-testid="revision-provenance">
        <div><dt>Revision ID</dt><dd>{revision.revisionId}</dd></div>
        <div><dt>Content digest</dt><dd>{revision.contentDigest}</dd></div>
        <div><dt>Parent</dt><dd>{revision.parentRevision === null ? "First revision" : `r${revision.parentRevision}`}</dd></div>
        <div><dt>Source</dt><dd>r{provenance.sourceRevision}</dd></div>
        <div><dt>Revision origin</dt><dd>{provenanceOriginLabel(provenance.origin)}</dd></div>
        <div><dt>Author origin</dt><dd>{provenanceOriginLabel(provenance.authorOrigin)}</dd></div>
        <div><dt>Committer</dt><dd>{provenance.committer.displayName}</dd></div>
        <div><dt>Task ID</dt><dd>{provenance.taskId ?? "Not task-linked"}</dd></div>
        <div><dt>Authority granted by</dt><dd>{provenance.grantedBy?.displayName ?? "Not delegated"}</dd></div>
        <div><dt>Approved by</dt><dd>{provenance.approvedBy?.displayName ?? "No separate approval"}</dd></div>
        {provenance.restoredRevision !== null ? (
          <div><dt>Restored snapshot</dt><dd>r{provenance.restoredRevision}</dd></div>
        ) : null}
      </dl>
      <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
      <RevisionDiff revision={revision} />
      <EvidenceLinks refs={revision.evidenceRefs} />
      {snapshot ? (
        <details className={styles.snapshot}>
          <summary>View complete r{snapshot.revision} snapshot</summary>
          <strong>{snapshot.title}</strong>
          <pre>{snapshot.body}</pre>
        </details>
      ) : null}
      {revision.revision < currentRevision ? (
        <button className={styles.restoreButton} type="button" disabled={busy} onClick={() => onRestore(revision)}>
          {busy ? "Restoring…" : `Restore r${revision.revision}`}
        </button>
      ) : null}
    </article>
  );
}

function HistoryPanel({
  revisions,
  selectedRevision,
  snapshot,
  currentRevision,
  hasMore,
  busy,
  onSelect,
  onBack,
  onRestore,
  onLoadOlder,
}: {
  revisions: readonly IssueRevisionSummary[];
  selectedRevision: IssueRevisionSummary | null;
  snapshot: IssueRevision | null;
  currentRevision: number;
  hasMore: boolean;
  busy: boolean;
  onSelect: (revision: IssueRevisionSummary) => void;
  onBack: () => void;
  onRestore: (revision: IssueRevisionSummary) => void;
  onLoadOlder: () => void;
}) {
  if (selectedRevision) {
    return (
      <RevisionDetail
        revision={selectedRevision}
        snapshot={snapshot}
        currentRevision={currentRevision}
        busy={busy}
        onBack={onBack}
        onRestore={onRestore}
      />
    );
  }
  return (
    <div className={styles.historyIndex} data-testid="revision-list">
      {revisions.length ? (
        <ol className={styles.revisionList}>
          {revisions.map((revision) => (
            <li
              className={styles.revisionLine}
              data-actor-type={revision.provenance.author.actorType.toLowerCase()}
              data-authority={revision.provenance.authority.toLowerCase()}
              data-revision={revision.revision}
              data-testid="revision-card"
              key={revision.revisionId}
            >
              <button type="button" onClick={() => onSelect(revision)}>
                <span className={styles.revisionCardHeading}>
                  <b>r{revision.revision}</b>
                  <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
                </span>
                <strong>{revision.changeSummary}</strong>
                <span className={styles.revisionActor}>{repositoryProvenanceSummary(revision.provenance)}</span>
                <span className={styles.authorityBadge} data-authority={revision.provenance.authority.toLowerCase()}>
                  {repositoryAuthorityLabel(revision.provenance.authority)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.railEmpty}>
          <span aria-hidden="true">◷</span>
          <h3>No revisions yet</h3>
          <p>The first saved document version will start this history.</p>
        </div>
      )}
      {hasMore ? (
        <button className={styles.loadOlder} type="button" disabled={busy} onClick={onLoadOlder}>
          {busy ? "Loading…" : "Load older revisions"}
        </button>
      ) : null}
    </div>
  );
}

function TaskComposer({
  state,
  members,
  busy,
  titleRef,
  onChange,
  onClose,
  onSubmit,
}: {
  state: TaskComposerState;
  members: readonly IssueMemberSnapshot[];
  busy: boolean;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onChange: (next: TaskComposerState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isDocumentTarget = state.target.scope === "DOCUMENT";
  return (
    <section
      className={styles.composer}
      role="dialog"
      aria-modal="false"
      aria-labelledby="task-composer-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.composerHeader}>
        <div>
          <span>{isDocumentTarget ? "Create task on whole document" : "Create task on selected text"}</span>
          <h2 id="task-composer-title">Delegate work with explicit authority</h2>
        </div>
        <button type="button" aria-label="Close task composer" onClick={onClose}>×</button>
      </div>
      <blockquote className={styles.composerTarget} data-testid="task-target-preview">
        {state.target.scope === "DOCUMENT" ? (
          <>
            <span>Whole document · r{state.target.expectedRevision}</span>
            The agent may add a finding to the document record without changing text.
          </>
        ) : (
          <>
            <span>{state.target.field === "TITLE" ? "Title selection" : "Document selection"}</span>
            “{compactExcerpt(state.target.selectedText, 220)}”
          </>
        )}
      </blockquote>
      <div className={styles.composerGrid}>
        <label className={styles.wideField}>
          <span>Task title</span>
          <input
            ref={titleRef}
            aria-label="Task title"
            value={state.title}
            placeholder="What outcome should this task produce?"
            onChange={(event) => onChange({
              ...state,
              title: repositoryClampCodePoints(
                event.target.value,
                ISSUE_TASK_TITLE_MAX_LENGTH,
              ),
            })}
          />
        </label>
        <label>
          <span>Category</span>
          <select
            aria-label="Task category"
            value={state.category}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onChange({ ...state, category: event.target.value as IssueTaskCategory })
            }
          >
            {ISSUE_TASK_CATEGORIES.map((category) => (
              <option value={category} key={category}>{TASK_CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Assign to</span>
          <select
            aria-label="Assignee"
            value={state.assignedToMemberId}
            onChange={(event) => {
              const nextAssignee = members.find((member) => member.memberId === event.target.value);
              const previousAssignee = members.find((member) => member.memberId === state.assignedToMemberId);
              const previousDefault = previousAssignee ? `${previousAssignee.displayName}’s agent` : "";
              onChange({
                ...state,
                assignedToMemberId: event.target.value,
                agentLabel:
                  !state.agentLabel || state.agentLabel === previousDefault
                    ? repositoryClampCodePoints(
                      `${nextAssignee?.displayName ?? "Collaborator"}’s agent`,
                      ISSUE_AGENT_LABEL_MAX_LENGTH,
                    )
                    : state.agentLabel,
              });
            }}
          >
            {members.map((member) => (
              <option value={member.memberId} key={member.memberId}>{member.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Agent label</span>
          <input
            aria-label="Agent label"
            value={state.agentLabel}
            placeholder="Data agent"
            onChange={(event) => onChange({
              ...state,
              agentLabel: repositoryClampCodePoints(
                event.target.value,
                ISSUE_AGENT_LABEL_MAX_LENGTH,
              ),
            })}
          />
        </label>
        <label className={styles.wideField}>
          <span>Instruction</span>
          <textarea
            aria-label="Task instruction"
            value={state.instruction}
            placeholder="Describe the evidence or document change this task should produce…"
            onChange={(event) =>
              onChange({
                ...state,
                instruction: repositoryClampCodePoints(
                  event.target.value,
                  ISSUE_TASK_INSTRUCTION_MAX_LENGTH,
                ),
              })
            }
          />
        </label>
      </div>
      <fieldset className={styles.authorityFieldset} data-testid="task-authority">
        <legend>Change access</legend>
        {(["COMMENT", "REVIEW", "DIRECT"] as const).map((mode) => (
          <label data-selected={state.mode === mode ? "true" : undefined} key={mode}>
            <input
              type="radio"
              name="task-change-access"
              value={mode}
              checked={state.mode === mode}
              disabled={isDocumentTarget && mode !== "COMMENT"}
              onChange={() => {
                if (!isDocumentTarget || mode === "COMMENT") onChange({ ...state, mode });
              }}
            />
            <span>
              <strong>{TASK_MODE_LABELS[mode]}</strong>
              <small>{TASK_MODE_DESCRIPTIONS[mode]}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {state.mode === "COMMENT" ? (
        <p className={styles.authorityNote}>
          {isDocumentTarget
            ? "Whole-document tasks are comment only and cannot change document text."
            : "Comment-only tasks stay anchored to this selected passage and cannot change document text."}
        </p>
      ) : null}
      <div className={styles.composerFooter}>
        <span>The server records this authority with every result and revision.</span>
        <div>
          <button className={styles.secondaryButton} type="button" onClick={onClose}>Cancel</button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={
              busy ||
              !state.title.trim() ||
              !state.instruction.trim() ||
              !state.agentLabel.trim() ||
              !state.assignedToMemberId
            }
            onClick={onSubmit}
          >
            {busy ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </section>
  );
}

function CommentComposer({
  state,
  busy,
  textareaRef,
  onChange,
  onClose,
  onSubmit,
}: {
  state: CommentComposerState;
  busy: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (next: CommentComposerState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <section
      className={`${styles.composer} ${styles.commentDialog}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="comment-composer-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.composerHeader}>
        <div>
          <span>Comment on selected text</span>
          <h2 id="comment-composer-title">Start a document discussion</h2>
        </div>
        <button type="button" aria-label="Close comment composer" onClick={onClose}>×</button>
      </div>
      <blockquote className={styles.composerTarget} data-testid="comment-target-preview">
        <span>{state.target.field === "TITLE" ? "Title selection" : "Document selection"}</span>
        “{compactExcerpt(state.target.selectedText, 220)}”
      </blockquote>
      <label className={styles.commentField}>
        <span>Comment</span>
        <textarea
          ref={textareaRef}
          aria-label="Document comment"
          value={state.body}
          placeholder="Ask a question, add context, or challenge this passage…"
          onChange={(event) =>
            onChange({
              ...state,
              body: repositoryClampCodePoints(event.target.value, ISSUE_COMMENT_MAX_LENGTH),
            })
          }
        />
      </label>
      <div className={styles.composerFooter}>
        <span>Creates an anchored thread without changing the document.</span>
        <div>
          <button className={styles.secondaryButton} type="button" onClick={onClose}>Cancel</button>
          <button className={styles.primaryButton} type="button" disabled={busy || !state.body.trim()} onClick={onSubmit}>
            {busy ? "Commenting…" : "Comment"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Document-first v4 issue workspace backed only by the injected browser client port. */
export function RepositoryWorkspace({
  session,
  service,
  shareUrl,
  onNewDocument,
  onSessionUnavailable,
  onSurfaceChange,
}: RepositoryWorkspaceProps) {
  const router = useRouter();
  const [surface, setSurface] = useState(session.surface);
  const [draft, setDraft] = useState(() => ({
    title: session.surface.document.title,
    body: session.surface.document.body,
  }));
  const [dirty, setDirty] = useState(false);
  const [changeSummary, setChangeSummary] = useState("");
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("SAVED");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [conflictSurface, setConflictSurface] = useState<IssueWorkspaceSurface | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("THREADS");
  const [railOpen, setRailOpen] = useState(false);
  const [compactRail, setCompactRail] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyToComment, setReplyToComment] = useState<IssueComment | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [threadBusy, setThreadBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [olderHistory, setOlderHistory] = useState<IssueRevisionSummary[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(surface.hasMoreHistory);
  const [selectedRevision, setSelectedRevision] = useState<IssueRevisionSummary | null>(null);
  const [revisionSnapshot, setRevisionSnapshot] = useState<IssueRevision | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [webMCPStatus, setWebMCPStatus] = useState<RepositoryWebMCPBridgeStatus | null>(null);
  const [activeAgentTool, setActiveAgentTool] = useState<ActiveAgentTool>(null);

  const surfaceRef = useRef(surface);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const changeSummaryRef = useRef("");
  const olderHistoryRef = useRef<IssueRevisionSummary[]>([]);
  const historyPaginationRef = useRef(false);
  const savePromiseRef = useRef<Promise<IssueWorkspaceSurface | null> | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const selectedRevisionRef = useRef<number | null>(null);
  const revisionReadRef = useRef<{
    revision: number;
    controller: AbortController;
  } | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const taskTitleRef = useRef<HTMLInputElement>(null);
  const commentComposerRef = useRef<HTMLTextAreaElement>(null);
  const documentTaskButtonRef = useRef<HTMLButtonElement>(null);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const railHeadingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Record<RailTab, HTMLButtonElement | null>>({ THREADS: null, HISTORY: null });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const pointerContextRef = useRef<PointerContextRecord | null>(null);
  const presenceRef = useRef<PresenceDraft>({
    state: "VIEWING",
    field: null,
    isTyping: false,
    selectionStart: null,
    selectionEnd: null,
  });
  const typingTimerRef = useRef<number | null>(null);

  const publishSurface = useCallback((
    nextSurface: IssueWorkspaceSurface,
    notifyParent = true,
  ) => {
    surfaceRef.current = nextSurface;
    setSurface(nextSurface);
    setHistoryHasMore((current) => repositoryNextHistoryHasMore(
      historyPaginationRef.current ? 1 : 0,
      current,
      nextSurface.hasMoreHistory,
    ));
    if (notifyParent) onSurfaceChange?.(nextSurface);
  }, [onSurfaceChange]);

  const adoptCleanSurface = useCallback((incoming: IssueWorkspaceSurface) => {
    const reconciled = reconcileIssueSurface(surfaceRef.current, incoming);
    const nextDraft = {
      title: reconciled.document.title,
      body: reconciled.document.body,
    };
    publishSurface(reconciled);
    draftRef.current = nextDraft;
    dirtyRef.current = false;
    setDraft(nextDraft);
    setDirty(false);
    changeSummaryRef.current = "";
    setChangeSummary("");
    setConflictSurface(null);
    setSaveState("SAVED");
  }, [publishSurface]);

  const receiveSurface = useCallback((
    incoming: IssueWorkspaceSurface,
    notifyParent = true,
  ) => {
    const current = surfaceRef.current;
    if (incoming === current || incoming.document.id !== current.document.id) return;
    const reconciled = reconcileIssueSurface(current, incoming);
    const contentAdvanced = reconciled.document.revision > current.document.revision;
    publishSurface(reconciled, notifyParent);
    if (!contentAdvanced) return;
    if (dirtyRef.current) {
      setConflictSurface(reconciled);
      setSaveState("CONFLICT");
      setStatusMessage("A newer revision arrived while you were editing.");
      return;
    }
    const nextDraft = {
      title: reconciled.document.title,
      body: reconciled.document.body,
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    changeSummaryRef.current = "";
    setChangeSummary("");
    setSaveState("SAVED");
  }, [publishSurface]);

  const sessionIdentity = repositorySessionIdentity(session);
  const activeSessionIdentityRef = useRef<string | null>(sessionIdentity);
  const isActiveSession = useCallback(
    () => activeSessionIdentityRef.current === sessionIdentity,
    [sessionIdentity],
  );

  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    title.style.height = "0px";
    title.style.height = `${title.scrollHeight}px`;
  }, [draft.title]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 739px)");
    const update = () => setCompactRail(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const nextSurface = session.surface;
    if (activeSessionIdentityRef.current === sessionIdentity) {
      // Parent-owned persistence can send the latest collaboration surface back as a
      // prop. Merge it without echoing the update or replacing an in-progress draft.
      receiveSurface(nextSurface, false);
      return;
    }

    activeSessionIdentityRef.current = sessionIdentity;
    const nextDraft = {
      title: nextSurface.document.title,
      body: nextSurface.document.body,
    };
    surfaceRef.current = nextSurface;
    draftRef.current = nextDraft;
    dirtyRef.current = false;
    changeSummaryRef.current = "";
    olderHistoryRef.current = [];
    historyPaginationRef.current = false;
    selectedRevisionRef.current = null;
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    savePromiseRef.current = null;
    revisionReadRef.current?.controller.abort();
    revisionReadRef.current = null;
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    presenceRef.current = {
      state: "VIEWING",
      field: null,
      isTyping: false,
      selectionStart: null,
      selectionEnd: null,
    };
    setSurface(nextSurface);
    setDraft(nextDraft);
    setDirty(false);
    setChangeSummary("");
    setSaveInFlight(false);
    setSaveState("SAVED");
    setStatusMessage(null);
    setConflictSurface(null);
    setActiveSelection(null);
    setContextMenu(null);
    setComposer(null);
    setComposerBusy(false);
    setRailTab("THREADS");
    setRailOpen(false);
    setSelectedThreadId(null);
    setCommentDraft("");
    setReplyToComment(null);
    setDecisionNote("");
    setThreadBusy(false);
    setHistoryBusy(false);
    setSelectedRevision(null);
    setRevisionSnapshot(null);
    setOlderHistory([]);
    setHistoryHasMore(nextSurface.hasMoreHistory);
    setShareCopied(false);
    setWebMCPStatus(null);
    setActiveAgentTool(null);
  }, [receiveSurface, session.surface, sessionIdentity]);

  const saveDraft = useCallback(async ({
    summary,
    expectedRevision,
  }: {
    summary: string;
    expectedRevision?: number;
  }): Promise<IssueWorkspaceSurface | null> => {
    if (savePromiseRef.current) {
      try {
        return await savePromiseRef.current;
      } catch {
        return null;
      }
    }
    const currentSurface = surfaceRef.current;
    const submitted = { ...draftRef.current };
    if (!dirtyRef.current) return currentSurface;
    const submittedSummary = repositoryClampCodePoints(
      summary,
      ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
    ).trim();
    if (!submittedSummary) {
      setStatusMessage("Add a change summary before saving this revision.");
      return null;
    }
    setSaveState("SAVING");
    setSaveInFlight(true);
    setStatusMessage(null);
    const requestController = new AbortController();
    saveAbortRef.current = requestController;
    const operation = (async () => {
      const result = await service.saveHumanRevision(session.humanSessionToken, {
        expectedRevision: expectedRevision ?? currentSurface.document.revision,
        title: submitted.title,
        body: submitted.body,
        changeSummary: submittedSummary,
      }, requestController.signal);
      if (
        requestController.signal.aborted ||
        activeSessionIdentityRef.current !== sessionIdentity
      ) return null;
      if (!result.ok) {
        setSaveState(result.code === "STALE_DOCUMENT" ? "CONFLICT" : "ERROR");
        setStatusMessage(failureMessage(result));
        if (result.code === "STALE_DOCUMENT") {
          const inspected = await service.inspect(session.humanSessionToken);
          if (isActiveSession() && inspected.ok) receiveSurface(inspected.data);
        }
        return null;
      }

      const reconciled = reconcileIssueSurface(surfaceRef.current, result.data);
      if (repositoryDraftMatchesDocument(draftRef.current, reconciled.document)) {
        adoptCleanSurface(reconciled);
        setStatusMessage(`Revision ${reconciled.document.revision} saved.`);
      } else {
        publishSurface(reconciled);
        dirtyRef.current = true;
        setDirty(true);
        if (reconciled.document.revision > result.data.document.revision) {
          setConflictSurface(reconciled);
          setSaveState("CONFLICT");
          setStatusMessage("The submitted revision saved, but a newer shared revision also arrived. Your later edits remain here.");
        } else {
          setSaveState("UNSAVED");
          setStatusMessage("Revision saved. Edits made while it was saving remain unsaved.");
        }
        if (changeSummaryRef.current === submittedSummary) {
          const nextSummary = humanChangeSummary(reconciled.document, draftRef.current);
          changeSummaryRef.current = nextSummary;
          setChangeSummary(nextSummary);
        }
      }
      return result.data;
    })();
    savePromiseRef.current = operation;
    try {
      return await operation;
    } catch (error) {
      if (
        requestController.signal.aborted ||
        activeSessionIdentityRef.current !== sessionIdentity
      ) return null;
      setSaveState("ERROR");
      setStatusMessage(error instanceof Error ? error.message : "The revision could not be saved.");
      return null;
    } finally {
      if (saveAbortRef.current === requestController) saveAbortRef.current = null;
      if (savePromiseRef.current === operation && isActiveSession()) {
        savePromiseRef.current = null;
        setSaveInFlight(false);
      }
    }
  }, [adoptCleanSurface, isActiveSession, publishSurface, receiveSurface, service, session.humanSessionToken, sessionIdentity]);

  const requireCleanHead = useCallback(async (
    action: string,
  ): Promise<IssueWorkspaceSurface | null> => {
    const requiredSessionIdentity = activeSessionIdentityRef.current;
    const activeSave = savePromiseRef.current;
    if (activeSave) {
      try {
        await activeSave;
      } catch {
        return null;
      }
    }
    if (activeSessionIdentityRef.current !== requiredSessionIdentity) return null;
    if (dirtyRef.current) {
      setStatusMessage(`Save this revision before ${action}.`);
      return null;
    }
    return surfaceRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      try {
        const result = await service.inspect(session.humanSessionToken, controller.signal);
        if (cancelled || !isActiveSession()) return;
        if (result.ok) receiveSurface(result.data);
        else if (result.code === "UNAUTHORIZED" || result.code === "NOT_FOUND") {
          onSessionUnavailable?.(failureMessage(result));
        }
      } catch (error) {
        if (
          !cancelled
          && isActiveSession()
          && !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setStatusMessage("Live collaboration paused. Your draft remains in this browser.");
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
  }, [isActiveSession, onSessionUnavailable, receiveSurface, service, session.humanSessionToken]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let inFlight = false;
    let runAgain = false;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void heartbeat();
      }, delay);
    };

    const heartbeat = async () => {
      if (cancelled) return;
      if (inFlight) {
        runAgain = true;
        return;
      }
      inFlight = true;
      const requestController = new AbortController();
      controller = requestController;
      const presence = presenceRef.current;
      const hidden = document.hidden;
      try {
        const result = await service.touchPresence(
          session.humanSessionToken,
          {
            state: hidden ? "IDLE" : presence.state,
            field: hidden ? null : presence.field,
            isTyping: hidden ? false : presence.isTyping,
            selectionStart: hidden ? null : presence.selectionStart,
            selectionEnd: hidden ? null : presence.selectionEnd,
            observedRevision: surfaceRef.current.document.revision,
          },
          requestController.signal,
        );
        if (!cancelled && isActiveSession() && result.ok) receiveSurface(result.data);
      } catch {
        // Presence is advisory. Editing and task work continue independently.
      } finally {
        if (controller === requestController) controller = null;
        inFlight = false;
        if (!cancelled) {
          const delay = runAgain ? 0 : PRESENCE_INTERVAL_MS;
          runAgain = false;
          schedule(delay);
        }
      }
    };
    const onVisibilityChange = () => {
      if (inFlight) runAgain = true;
      else schedule(0);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(0);
    return () => {
      cancelled = true;
      runAgain = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [isActiveSession, receiveSurface, service, session.humanSessionToken]);

  useEffect(() => () => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    saveAbortRef.current?.abort();
    revisionReadRef.current?.controller.abort();
  }, []);

  useEffect(() => {
    if (!composer) return;
    const frame = window.requestAnimationFrame(() => {
      if (composer.kind === "TASK") taskTitleRef.current?.focus();
      else commentComposerRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [composer]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
        const editor = contextMenu.target.field === "TITLE" ? titleRef.current : bodyRef.current;
        window.requestAnimationFrame(() => editor?.focus());
      }
    };
    const frame = window.requestAnimationFrame(() => {
      contextMenuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
    });
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const clearEditorPresence = useCallback(() => {
    presenceRef.current = {
      state: "VIEWING",
      field: null,
      isTyping: false,
      selectionStart: null,
      selectionEnd: null,
    };
  }, []);

  const updateDraft = useCallback((field: IssueDocumentField, value: string, control: EditorControl) => {
    const bounded = repositoryClampCodePoints(
      value,
      field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH,
    );
    const next = field === "TITLE"
      ? { ...draftRef.current, title: bounded }
      : { ...draftRef.current, body: bounded };
    const wasDirty = dirtyRef.current;
    const isDirty = !repositoryDraftMatchesDocument(next, surfaceRef.current.document);
    draftRef.current = next;
    dirtyRef.current = isDirty;
    setDraft(next);
    setDirty(isDirty);
    if (!isDirty) {
      changeSummaryRef.current = "";
      setChangeSummary("");
      setConflictSurface(null);
      setSaveState("SAVED");
    } else {
      if (!wasDirty && !changeSummaryRef.current) {
        const suggestedSummary = humanChangeSummary(surfaceRef.current.document, next);
        changeSummaryRef.current = suggestedSummary;
        setChangeSummary(suggestedSummary);
      }
      setSaveState(
        conflictSurface
          ? "CONFLICT"
          : savePromiseRef.current
            ? "SAVING"
            : "UNSAVED",
      );
    }
    presenceRef.current = { ...presenceRef.current, state: "EDITING", field, isTyping: true };
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      presenceRef.current = { ...presenceRef.current, isTyping: false };
    }, 900);
    window.requestAnimationFrame(() => {
      if (control.value !== bounded) control.value = bounded;
      const selection = selectionFromControl(field, control, surfaceRef.current.document.revision);
      setActiveSelection(selection.rangeEnd > selection.rangeStart ? selection : null);
      presenceRef.current = {
        ...presenceRef.current,
        selectionStart: selection.rangeStart,
        selectionEnd: selection.rangeEnd,
      };
    });
  }, [conflictSurface]);

  const captureSelection = useCallback((field: IssueDocumentField, control: EditorControl) => {
    const selection = selectionFromControl(field, control, surfaceRef.current.document.revision);
    setActiveSelection(selection.rangeEnd > selection.rangeStart ? selection : null);
    presenceRef.current = {
      ...presenceRef.current,
      state: "EDITING",
      field,
      selectionStart: selection.rangeStart,
      selectionEnd: selection.rangeEnd,
    };
    return selection;
  }, []);

  const restoreSelection = useCallback((target: SelectionTarget) => {
    const control = target.field === "TITLE" ? titleRef.current : bodyRef.current;
    window.requestAnimationFrame(() => {
      if (!control) return;
      control.focus();
      control.setSelectionRange(
        Math.min(target.startUtf16, control.value.length),
        Math.min(target.endUtf16, control.value.length),
      );
      captureSelection(target.field, control);
    });
  }, [captureSelection]);

  const closeComposer = useCallback(() => {
    const target = composer?.target;
    setComposer(null);
    setComposerBusy(false);
    if (target?.scope === "SELECTION") restoreSelection(target);
    else if (target?.scope === "DOCUMENT") {
      window.requestAnimationFrame(() => documentTaskButtonRef.current?.focus());
    }
  }, [composer?.target, restoreSelection]);

  const validateSelection = useCallback(async (selection: SelectionTarget) => {
    const cleanSurface = await requireCleanHead("starting a task or discussion");
    if (!cleanSurface) return null;
    const value = selection.field === "TITLE"
      ? cleanSurface.document.title
      : cleanSurface.document.body;
    const selectedText = issueSlice(value, selection.rangeStart, selection.rangeEnd);
    if (!selectedText || selectedText !== selection.selectedText) {
      setStatusMessage("That passage changed. Select it again before starting a thread.");
      return null;
    }
    return { ...selection, expectedRevision: cleanSurface.document.revision };
  }, [requireCleanHead]);

  const openTaskComposer = useCallback(async (selection: SelectionTarget) => {
    setContextMenu(null);
    const target = await validateSelection(selection);
    if (!target || !isActiveSession()) return;
    const preferred = surfaceRef.current.members.find((member) => member.memberId !== session.selfMemberId)
      ?? surfaceRef.current.members[0];
    const excerpt = compactExcerpt(target.selectedText, 54);
    setComposer({
      kind: "TASK",
      target,
      title: repositoryClampCodePoints(
        excerpt ? `Investigate: ${excerpt}` : "Investigate selected passage",
        ISSUE_TASK_TITLE_MAX_LENGTH,
      ),
      category: "GENERAL",
      instruction: "",
      agentLabel: repositoryClampCodePoints(
        `${preferred?.displayName ?? "Collaborator"}’s agent`,
        ISSUE_AGENT_LABEL_MAX_LENGTH,
      ),
      mode: "REVIEW",
      assignedToMemberId: preferred?.memberId ?? "",
    });
  }, [isActiveSession, session.selfMemberId, validateSelection]);

  const openDocumentTaskComposer = useCallback(async () => {
    const cleanSurface = await requireCleanHead("starting a whole-document task");
    if (!cleanSurface || !isActiveSession()) return;
    const preferred = cleanSurface.members.find(
      (member) => member.memberId !== session.selfMemberId,
    ) ?? cleanSurface.members[0];
    setComposer({
      kind: "TASK",
      target: {
        scope: "DOCUMENT",
        expectedRevision: cleanSurface.document.revision,
      },
      title: "Review the whole document",
      category: "GENERAL",
      instruction: "",
      agentLabel: repositoryClampCodePoints(
        `${preferred?.displayName ?? "Collaborator"}’s agent`,
        ISSUE_AGENT_LABEL_MAX_LENGTH,
      ),
      mode: "COMMENT",
      assignedToMemberId: preferred?.memberId ?? "",
    });
  }, [isActiveSession, requireCleanHead, session.selfMemberId]);

  const openCommentComposer = useCallback(async (selection: SelectionTarget) => {
    setContextMenu(null);
    const target = await validateSelection(selection);
    if (!target || !isActiveSession()) return;
    setComposer({ kind: "COMMENT", target, body: "" });
  }, [isActiveSession, validateSelection]);

  const onEditorKeyDown = useCallback((
    field: IssueDocumentField,
    event: ReactKeyboardEvent<EditorControl>,
  ) => {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      pointerContextRef.current = null;
      return;
    }
    const shortcut = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)
      && !event.altKey && !event.shiftKey;
    if (!shortcut) return;
    const selection = selectionFromControl(field, event.currentTarget, surfaceRef.current.document.revision);
    if (selection.rangeEnd <= selection.rangeStart) return;
    event.preventDefault();
    void openTaskComposer(selection);
  }, [openTaskComposer]);

  const onEditorPointerDown = useCallback((
    field: IssueDocumentField,
    event: ReactPointerEvent<EditorControl>,
  ) => {
    if (event.button !== 2 || event.target !== event.currentTarget) {
      pointerContextRef.current = null;
      return;
    }
    const selection = selectionFromControl(field, event.currentTarget, surfaceRef.current.document.revision);
    const { expectedRevision: _revision, ...selectionWithoutRevision } = selection;
    void _revision;
    pointerContextRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      field,
      selection: selectionWithoutRevision,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      timeStamp: event.timeStamp,
    };
  }, []);

  const onEditorContextMenu = useCallback((
    field: IssueDocumentField,
    event: ReactMouseEvent<EditorControl>,
  ) => {
    const remembered = pointerContextRef.current;
    pointerContextRef.current = null;
    if (!remembered || event.target !== event.currentTarget) return;
    const pointerId = (event.nativeEvent as PointerEvent).pointerId;
    const current = selectionFromControl(field, event.currentTarget, surfaceRef.current.document.revision);
    const modifiersClear = !remembered.shiftKey && !remembered.altKey && !remembered.ctrlKey
      && !remembered.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    const ownsMenu = remembered.target === event.currentTarget
      && remembered.field === field
      && (pointerId === 0 || pointerId === remembered.pointerId)
      && event.timeStamp - remembered.timeStamp >= 0
      && event.timeStamp - remembered.timeStamp <= POINTER_CONTEXT_WINDOW_MS
      && modifiersClear
      && current.rangeEnd > current.rangeStart
      && sameSelection(remembered.selection, current);
    if (!ownsMenu) return;
    event.preventDefault();
    setActiveSelection(current);
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 118)),
      target: current,
    });
  }, []);

  const createTask = useCallback(async () => {
    if (!composer || composer.kind !== "TASK" || composerBusy) return;
    const target = composer.target;
    const anchor = target.scope === "DOCUMENT"
      ? { scope: "DOCUMENT" as const }
      : {
          scope: "SELECTION" as const,
          field: target.field,
          rangeStart: target.rangeStart,
          rangeEnd: target.rangeEnd,
        };
    setComposerBusy(true);
    const existingIds = new Set(surfaceRef.current.tasks.map((task) => task.taskId));
    try {
      const result = await service.createTask(session.humanSessionToken, {
        expectedRevision: composer.target.expectedRevision,
        title: composer.title.trim(),
        category: composer.category,
        instruction: composer.instruction.trim(),
        agentLabel: composer.agentLabel.trim(),
        mode: composer.mode,
        assignedToMemberId: composer.assignedToMemberId,
        anchor,
      });
      if (!isActiveSession()) return;
      if (!result.ok) {
        setStatusMessage(failureMessage(result));
        return;
      }
      receiveSurface(result.data);
      const created = result.data.tasks.find((task) => !existingIds.has(task.taskId));
      setComposer(null);
      if (target.scope === "SELECTION") restoreSelection(target);
      setRailTab("THREADS");
      setRailOpen(true);
      setSelectedThreadId(created?.threadId ?? null);
      setStatusMessage(`${TASK_MODE_LABELS[composer.mode]} task created. Its authority is now fixed.`);
    } catch (error) {
      if (isActiveSession()) {
        setStatusMessage(error instanceof Error ? error.message : "The task could not be created.");
      }
    } finally {
      if (isActiveSession()) setComposerBusy(false);
    }
  }, [composer, composerBusy, isActiveSession, receiveSurface, restoreSelection, service, session.humanSessionToken]);

  const createThread = useCallback(async () => {
    if (!composer || composer.kind !== "COMMENT" || composerBusy) return;
    const target = composer.target;
    setComposerBusy(true);
    const existingIds = new Set(surfaceRef.current.threads.map((thread) => thread.threadId));
    try {
      const result = await service.createThread(session.humanSessionToken, {
        expectedRevision: composer.target.expectedRevision,
        body: composer.body.trim(),
        anchor: {
          scope: "SELECTION",
          field: composer.target.field,
          rangeStart: composer.target.rangeStart,
          rangeEnd: composer.target.rangeEnd,
        },
      });
      if (!isActiveSession()) return;
      if (!result.ok) {
        setStatusMessage(failureMessage(result));
        return;
      }
      receiveSurface(result.data);
      const created = result.data.threads.find((thread) => !existingIds.has(thread.threadId));
      setComposer(null);
      restoreSelection(target);
      setRailTab("THREADS");
      setRailOpen(true);
      setSelectedThreadId(created?.threadId ?? null);
      setStatusMessage("Comment added without changing the document.");
    } catch (error) {
      if (isActiveSession()) {
        setStatusMessage(error instanceof Error ? error.message : "The discussion could not be created.");
      }
    } finally {
      if (isActiveSession()) setComposerBusy(false);
    }
  }, [composer, composerBusy, isActiveSession, receiveSurface, restoreSelection, service, session.humanSessionToken]);

  const addComment = useCallback(async () => {
    if (!selectedThreadId || !commentDraft.trim() || threadBusy) return;
    setThreadBusy(true);
    try {
      const result = await service.addHumanComment(session.humanSessionToken, {
        threadId: selectedThreadId,
        body: commentDraft.trim(),
        ...(replyToComment ? { replyToCommentId: replyToComment.commentId } : {}),
      });
      if (!isActiveSession()) return;
      if (!result.ok) {
        setStatusMessage(failureMessage(result));
        return;
      }
      receiveSurface(result.data);
      setCommentDraft("");
      setReplyToComment(null);
    } catch (error) {
      if (isActiveSession()) {
        setStatusMessage(error instanceof Error ? error.message : "The comment could not be added.");
      }
    } finally {
      if (isActiveSession()) setThreadBusy(false);
    }
  }, [commentDraft, isActiveSession, receiveSurface, replyToComment, selectedThreadId, service, session.humanSessionToken, threadBusy]);

  const resolveThread = useCallback(async () => {
    if (!selectedThreadId || threadBusy) return;
    setThreadBusy(true);
    try {
      const result = await service.resolveThread(session.humanSessionToken, { threadId: selectedThreadId });
      if (!isActiveSession()) return;
      if (!result.ok) setStatusMessage(failureMessage(result));
      else {
        receiveSurface(result.data);
        setSelectedThreadId(null);
        setStatusMessage("Discussion resolved. Its comments remain attached to the document.");
      }
    } finally {
      if (isActiveSession()) setThreadBusy(false);
    }
  }, [isActiveSession, receiveSurface, selectedThreadId, service, session.humanSessionToken, threadBusy]);

  const cancelTask = useCallback(async (task: IssueTask) => {
    if (threadBusy) return;
    setThreadBusy(true);
    try {
      const result = await service.cancelTask(session.humanSessionToken, { taskId: task.taskId });
      if (!isActiveSession()) return;
      if (!result.ok) setStatusMessage(failureMessage(result));
      else {
        receiveSurface(result.data);
        setStatusMessage("Task cancelled. Its discussion remains inspectable.");
      }
    } finally {
      if (isActiveSession()) setThreadBusy(false);
    }
  }, [isActiveSession, receiveSurface, service, session.humanSessionToken, threadBusy]);

  const applyRevisionMutationSurface = useCallback((
    incoming: IssueWorkspaceSurface,
    baselineDraft: { title: string; body: string },
  ): boolean => {
    const currentDocument = surfaceRef.current.document;
    const reconciled = reconcileIssueSurface(surfaceRef.current, incoming);
    if (repositoryShouldAdoptRevisionMutation(
      draftRef.current,
      baselineDraft,
      currentDocument,
      dirtyRef.current,
    )) {
      adoptCleanSurface(reconciled);
      return true;
    }

    publishSurface(reconciled);
    dirtyRef.current = true;
    setDirty(true);
    setConflictSurface(reconciled);
    setSaveState("CONFLICT");
    if (!changeSummaryRef.current) {
      const suggestedSummary = humanChangeSummary(reconciled.document, draftRef.current);
      changeSummaryRef.current = suggestedSummary;
      setChangeSummary(suggestedSummary);
    }
    return false;
  }, [adoptCleanSurface, publishSurface]);

  const decideTask = useCallback(async (task: IssueTask, decision: "ACCEPT" | "REJECT") => {
    if (threadBusy || task.status !== "PROPOSED") return;
    setThreadBusy(true);
    try {
      const head = decision === "ACCEPT"
        ? await requireCleanHead("applying a proposed change")
        : surfaceRef.current;
      if (!head || !isActiveSession()) return;
      const baselineDraft = { ...draftRef.current };
      const input = {
        taskId: task.taskId,
        expectedRevision: head.document.revision,
        note: decisionNote.trim() || null,
      };
      const result = decision === "ACCEPT"
        ? await service.acceptTaskProposal(session.humanSessionToken, input)
        : await service.rejectTaskProposal(session.humanSessionToken, input);
      if (!isActiveSession()) return;
      if (!result.ok) setStatusMessage(failureMessage(result));
      else {
        const adopted = decision === "ACCEPT"
          ? applyRevisionMutationSurface(result.data, baselineDraft)
          : (receiveSurface(result.data), true);
        setDecisionNote("");
        setStatusMessage(
          decision === "REJECT"
            ? "Proposal rejected with its discussion preserved."
            : adopted
              ? "Change applied and revision recorded."
              : "Change applied, but edits made while it was applying remain here for review.",
        );
      }
    } catch (error) {
      if (isActiveSession()) {
        setStatusMessage(error instanceof Error ? error.message : "The proposal could not be decided.");
      }
    } finally {
      if (isActiveSession()) setThreadBusy(false);
    }
  }, [applyRevisionMutationSurface, decisionNote, isActiveSession, receiveSurface, requireCleanHead, service, session.humanSessionToken, threadBusy]);

  const allHistory = useMemo(() => {
    const byRevision = new Map<number, IssueRevisionSummary>();
    for (const revision of [...surface.history, ...olderHistory]) byRevision.set(revision.revision, revision);
    return [...byRevision.values()].sort((left, right) => right.revision - left.revision);
  }, [olderHistory, surface.history]);

  const selectRevision = useCallback(async (revision: IssueRevisionSummary) => {
    revisionReadRef.current?.controller.abort();
    const controller = new AbortController();
    revisionReadRef.current = { revision: revision.revision, controller };
    selectedRevisionRef.current = revision.revision;
    setSelectedRevision(revision);
    setRevisionSnapshot(null);
    try {
      const result = await service.readRevision(
        session.humanSessionToken,
        revision.revision,
        controller.signal,
      );
      if (
        controller.signal.aborted
        || revisionReadRef.current?.controller !== controller
        || !isActiveSession()
      ) return;
      if (result.ok) {
        if (repositoryCanApplyRevisionSnapshot(
          selectedRevisionRef.current,
          revision.revision,
          result.data,
        )) {
          setRevisionSnapshot(result.data);
        }
      } else {
        setStatusMessage(failureMessage(result));
      }
    } catch (error) {
      if (isActiveSession() && !(error instanceof DOMException && error.name === "AbortError")) {
        setStatusMessage("The complete revision snapshot could not be loaded.");
      }
    } finally {
      if (revisionReadRef.current?.controller === controller) revisionReadRef.current = null;
    }
  }, [isActiveSession, service, session.humanSessionToken]);

  const openRevisionFromLineage = useCallback((revision: IssueRevisionSummary) => {
    setRailTab("HISTORY");
    setRailOpen(true);
    void selectRevision(revision);
    if (window.matchMedia("(max-width: 739px)").matches) {
      window.requestAnimationFrame(() => tabRefs.current.HISTORY?.focus());
    }
  }, [selectRevision]);

  const closeRevisionDetail = useCallback(() => {
    revisionReadRef.current?.controller.abort();
    revisionReadRef.current = null;
    selectedRevisionRef.current = null;
    setSelectedRevision(null);
    setRevisionSnapshot(null);
  }, []);

  const loadOlderHistory = useCallback(async () => {
    if (historyBusy || allHistory.length === 0) return;
    setHistoryBusy(true);
    const oldest = allHistory.at(-1);
    try {
      const result = await service.readHistory(session.humanSessionToken, {
        ...(oldest ? { beforeRevision: oldest.revision } : {}),
      });
      if (!isActiveSession()) return;
      if (!result.ok) setStatusMessage(failureMessage(result));
      else {
        setOlderHistory((current) => {
          const next = [...current, ...result.data.revisions];
          olderHistoryRef.current = next;
          return next;
        });
        historyPaginationRef.current = true;
        setHistoryHasMore(result.data.hasMoreOlder);
      }
    } finally {
      if (isActiveSession()) setHistoryBusy(false);
    }
  }, [allHistory, historyBusy, isActiveSession, service, session.humanSessionToken]);

  const restoreRevision = useCallback(async (revision: IssueRevisionSummary) => {
    if (historyBusy || revision.revision >= surfaceRef.current.document.revision) return;
    if (!window.confirm(`Restore revision ${revision.revision}? The current document will remain in history.`)) return;
    setHistoryBusy(true);
    try {
      const head = await requireCleanHead("restoring an older revision");
      if (!head || !isActiveSession()) return;
      const baselineDraft = { ...draftRef.current };
      const result = await service.restoreRevision(session.humanSessionToken, {
        expectedRevision: head.document.revision,
        revision: revision.revision,
        changeSummary: `Restored revision ${revision.revision}`,
      });
      if (!isActiveSession()) return;
      if (!result.ok) setStatusMessage(failureMessage(result));
      else {
        const adopted = applyRevisionMutationSurface(result.data, baselineDraft);
        closeRevisionDetail();
        setStatusMessage(
          adopted
            ? `Restored r${revision.revision}. The prior head remains in history.`
            : `Restored r${revision.revision}, but edits made while it was restoring remain here for review.`,
        );
      }
    } catch (error) {
      if (isActiveSession()) {
        setStatusMessage(error instanceof Error ? error.message : "The revision could not be restored.");
      }
    } finally {
      if (isActiveSession()) setHistoryBusy(false);
    }
  }, [applyRevisionMutationSurface, closeRevisionDetail, historyBusy, isActiveSession, requireCleanHead, service, session.humanSessionToken]);

  const copyShareLink = useCallback(async () => {
    const url = shareUrl ?? `${window.location.origin}${window.location.pathname}${window.location.search}`;
    try {
      await navigator.clipboard.writeText(url);
      if (!isActiveSession()) return;
      setShareCopied(true);
      window.setTimeout(() => {
        if (isActiveSession()) setShareCopied(false);
      }, 1_600);
    } catch {
      if (isActiveSession()) {
        setStatusMessage("Copy the clean address from your browser to share this document.");
      }
    }
  }, [isActiveSession, shareUrl]);

  const useLatest = useCallback(() => {
    if (!conflictSurface) return;
    adoptCleanSurface(conflictSurface);
    setStatusMessage("Using the latest shared revision.");
  }, [adoptCleanSurface, conflictSurface]);

  const keepMine = useCallback(async () => {
    if (!conflictSurface) return;
    const result = await saveDraft({
      summary: changeSummary,
      expectedRevision: conflictSurface.document.revision,
    });
    if (result && !dirtyRef.current) {
      setStatusMessage("Your edit is now the latest revision.");
    }
  }, [changeSummary, conflictSurface, saveDraft]);

  const selectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId);
    setCommentDraft("");
    setReplyToComment(null);
    setDecisionNote("");
  }, []);

  const closeRail = useCallback(() => {
    const focusAtClose = document.activeElement;
    setRailOpen(false);
    window.requestAnimationFrame(() => {
      if (
        document.activeElement === focusAtClose
        || document.activeElement === document.body
      ) {
        railToggleRef.current?.focus();
      }
    });
  }, []);

  const onRailKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!compactRail || !railOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeRail();
      return;
    }
    if (event.key !== "Tab") return;
    const rail = railRef.current;
    if (!rail) return;
    const focusable = Array.from(rail.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((node) => !node.closest("[hidden]") && node.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      railHeadingRef.current?.focus();
      return;
    }
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && rail.contains(active);
    if (event.shiftKey && (!inside || active === first || active === railHeadingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  }, [closeRail, compactRail, railOpen]);

  const onTabKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const tabs: RailTab[] = ["THREADS", "HISTORY"];
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.indexOf(railTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowRight"
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex] ?? "THREADS";
    setRailTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }, [railTab]);

  const visiblePresence = useMemo(() => activePresence(surface), [surface]);
  const openTaskCount = surface.tasks.filter(isOpenTask).length;
  const openCommentCount = surface.threads.filter((thread) => thread.taskId === null && thread.status === "OPEN").length;
  const openThreadCount = openTaskCount + openCommentCount;
  const saveLabel = saveState === "SAVING"
    ? "Saving…"
    : saveState === "UNSAVED"
      ? "Unsaved"
      : saveState === "CONFLICT"
        ? "Choose version"
        : saveState === "ERROR"
          ? "Not saved"
          : "Saved";
  const allAgentToolsReady = Boolean(
    webMCPStatus?.supported &&
    !webMCPStatus.error &&
    REPOSITORY_TOOL_NAMES.every((tool) => webMCPStatus.registeredTools.includes(tool)),
  );
  const agentStatus = activeAgentTool === "wait_for_my_tasks"
    ? "An agent is waiting for assigned tasks"
    : activeAgentTool === "comment_on_task"
      ? "An agent is adding evidence"
      : activeAgentTool === "submit_task_result"
        ? "An agent is submitting a task result"
        : allAgentToolsReady
          ? `Bring-your-own-agent tools ready · ${REPOSITORY_TOOL_NAMES.length} tools`
          : webMCPStatus?.supported === false
            ? "Agent tools unavailable · Human collaboration still works"
            : webMCPStatus?.error
              ? "Agent tools need a reload"
              : "Connecting agent tools";
  const agentState = activeAgentTool
    ? "active"
    : allAgentToolsReady
      ? "ready"
      : webMCPStatus?.supported === false
        ? "unsupported"
        : webMCPStatus?.error
          ? "error"
          : "connecting";

  const receiveAgentSurface = useCallback((incoming: IssueWorkspaceSurface) => {
    if (isActiveSession()) receiveSurface(incoming);
  }, [isActiveSession, receiveSurface]);
  const updateWebMCPStatus = useCallback((nextStatus: RepositoryWebMCPBridgeStatus) => {
    if (isActiveSession()) setWebMCPStatus(nextStatus);
  }, [isActiveSession]);
  const updateActiveAgentTool = useCallback((tool: ActiveAgentTool) => {
    if (isActiveSession()) setActiveAgentTool(tool);
  }, [isActiveSession]);

  const agentFooter = (
    <footer className={styles.agentFooter} data-state={agentState} data-testid="agent-connection-status">
      <span aria-hidden="true" />
      <div>
        <strong>{agentStatus}</strong>
        <small>Authority comes from each task, never from the agent itself.</small>
      </div>
    </footer>
  );

  const modalRailOpen = compactRail && railOpen;

  return (
    <div className={styles.shell} data-rail-open={railOpen ? "true" : "false"} data-testid="repository-workspace">
      <header className={styles.topbar} inert={modalRailOpen ? true : undefined}>
        <div className={styles.brandGroup}>
          <Link className={styles.brand} href="/" aria-label="Ratiflow home">
            <b>Ratiflow</b>
          </Link>
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.kindBadge} data-testid="document-type">{repositoryKindLabel(surface.document.kind)}</span>
          <button
            className={styles.newButton}
            type="button"
            onClick={() => {
              if (onNewDocument) onNewDocument();
              else router.push("/");
            }}
          >
            <span aria-hidden="true">＋</span> New document
          </button>
        </div>

        <div className={styles.revisionControls} data-testid="save-revision-controls">
          <button
            className={styles.revisionPulse}
            type="button"
            aria-label={`Open revision history. Revision ${surface.document.revision}, ${saveLabel}`}
            onClick={() => {
              setRailTab("HISTORY");
              setRailOpen(true);
            }}
          >
            <span data-state={saveState.toLowerCase()} aria-hidden="true" />
            <b>r{surface.document.revision}</b>
            <span>{saveLabel}</span>
          </button>
          <label className={styles.srOnly} htmlFor="repository-change-summary">
            Change summary
          </label>
          <input
            id="repository-change-summary"
            className={styles.summaryInput}
            value={changeSummary}
            disabled={!dirty || saveInFlight}
            required
            aria-invalid={dirty && !changeSummary.trim()}
            placeholder={dirty ? "Describe this revision" : "Edit to create a revision"}
            onChange={(event) => {
              const nextSummary = repositoryClampCodePoints(
                event.target.value,
                ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
              );
              changeSummaryRef.current = nextSummary;
              setChangeSummary(nextSummary);
            }}
          />
          <button
            className={styles.saveRevisionButton}
            data-testid="save-revision"
            type="button"
            disabled={
              !dirty ||
              saveInFlight ||
              Boolean(conflictSurface) ||
              !changeSummary.trim()
            }
            onClick={() => void saveDraft({ summary: changeSummary })}
          >
            {saveInFlight ? "Saving…" : "Save revision"}
          </button>
        </div>

        <div className={styles.collaborationGroup}>
          <div className={styles.people} aria-label={`${Math.max(0, visiblePresence.length - 1)} other people here`}>
            {visiblePresence.slice(0, 4).map((person) => (
              <span
                className={styles.avatar}
                key={person.memberId}
                style={{ "--avatar-color": person.color } as CSSProperties}
                title={`${person.displayName}${person.memberId === session.selfMemberId ? " · you" : ""}`}
              >
                {initials(person.displayName)}
                <i data-state={person.state.toLowerCase()} />
              </span>
            ))}
          </div>
          <button className={styles.shareButton} type="button" onClick={() => void copyShareLink()}>
            {shareCopied ? "Copied" : "Share"}
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <main className={styles.editorPane} data-testid="editor-pane" inert={modalRailOpen ? true : undefined}>
          <section className={styles.writingSurface} data-testid="writing-surface">
            <label className={styles.srOnly} htmlFor="repository-document-title">Document title</label>
            <textarea
              ref={titleRef}
              id="repository-document-title"
              className={styles.titleInput}
              rows={1}
              value={draft.title}
              readOnly={composer !== null}
              spellCheck
              onFocus={(event) => captureSelection("TITLE", event.currentTarget)}
              onSelect={(event) => captureSelection("TITLE", event.currentTarget)}
              onBlur={clearEditorPresence}
              onChange={(event) => updateDraft("TITLE", event.target.value, event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  return;
                }
                onEditorKeyDown("TITLE", event);
              }}
              onPointerDown={(event) => onEditorPointerDown("TITLE", event)}
              onContextMenu={(event) => onEditorContextMenu("TITLE", event)}
            />
            <RevisionLineage revisions={surface.history} onSelect={openRevisionFromLineage} />
            <label className={styles.srOnly} htmlFor="repository-document-body">Document body</label>
            <textarea
              ref={bodyRef}
              id="repository-document-body"
              className={styles.bodyInput}
              value={draft.body}
              readOnly={composer !== null}
              spellCheck
              onFocus={(event) => captureSelection("BODY", event.currentTarget)}
              onSelect={(event) => captureSelection("BODY", event.currentTarget)}
              onBlur={clearEditorPresence}
              onChange={(event) => updateDraft("BODY", event.target.value, event.currentTarget)}
              onKeyDown={(event) => onEditorKeyDown("BODY", event)}
              onPointerDown={(event) => onEditorPointerDown("BODY", event)}
              onContextMenu={(event) => onEditorContextMenu("BODY", event)}
            />

            {activeSelection && !composer ? (
              <div className={styles.selectionActions} data-testid="selection-actions">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void openCommentComposer(activeSelection)}>
                  <span aria-hidden="true">＋</span> Comment
                </button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void openTaskComposer(activeSelection)}>
                  <span aria-hidden="true">↗</span> Create task
                </button>
              </div>
            ) : null}

            <footer className={styles.documentFooter}>
              <span>
                Last revision by {surface.document.lastRevision.author.displayName} · {repositoryAuthorityLabel(surface.document.lastRevision.authority)}
              </span>
              <span>Select text to comment or delegate · <kbd>⌘K</kbd> task</span>
            </footer>
          </section>
        </main>

        <aside ref={railRef} className={styles.rail} aria-label="Threads and history" onKeyDown={onRailKeyDown}>
          <div className={styles.railHeader}>
            <h2 ref={railHeadingRef} tabIndex={-1}>Collaboration</h2>
            <button className={styles.railClose} type="button" aria-label="Close threads and history" onClick={closeRail}>×</button>
          </div>
          <div className={styles.railTabs} role="tablist" aria-label="Repository views">
            <button
              ref={(node) => { tabRefs.current.THREADS = node; }}
              id="repository-tab-threads"
              type="button"
              role="tab"
              aria-controls="repository-panel-threads"
              aria-selected={railTab === "THREADS"}
              tabIndex={railTab === "THREADS" ? 0 : -1}
              onClick={() => setRailTab("THREADS")}
              onKeyDown={onTabKeyDown}
            >
              Threads {openThreadCount ? <span>{openThreadCount}</span> : null}
            </button>
            <button
              ref={(node) => { tabRefs.current.HISTORY = node; }}
              id="repository-tab-history"
              type="button"
              role="tab"
              aria-controls="repository-panel-history"
              aria-selected={railTab === "HISTORY"}
              tabIndex={railTab === "HISTORY" ? 0 : -1}
              onClick={() => setRailTab("HISTORY")}
              onKeyDown={onTabKeyDown}
            >
              History <span>{surface.document.revision}</span>
            </button>
          </div>
          <div className={styles.railContent}>
            <div
              id="repository-panel-threads"
              role="tabpanel"
              aria-labelledby="repository-tab-threads"
              hidden={railTab !== "THREADS"}
            >
              <ThreadsPanel
                tasks={surface.tasks}
                threads={surface.threads}
                selectedThreadId={selectedThreadId}
                selfMemberId={session.selfMemberId}
                commentDraft={commentDraft}
                replyTo={replyToComment}
                busy={threadBusy}
                decisionNote={decisionNote}
                agentFooter={agentFooter}
                onOpenThread={selectThread}
                onCreateDocumentTask={() => void openDocumentTaskComposer()}
                documentTaskButtonRef={documentTaskButtonRef}
                onBack={() => setSelectedThreadId(null)}
                onCommentDraftChange={setCommentDraft}
                onReply={setReplyToComment}
                onSubmitComment={() => void addComment()}
                onResolve={() => void resolveThread()}
                onCancelTask={(task) => void cancelTask(task)}
                onDecisionNoteChange={setDecisionNote}
                onDecide={(task, decision) => void decideTask(task, decision)}
              />
            </div>
            <div
              id="repository-panel-history"
              role="tabpanel"
              aria-labelledby="repository-tab-history"
              hidden={railTab !== "HISTORY"}
            >
              <HistoryPanel
                revisions={allHistory}
                selectedRevision={selectedRevision}
                snapshot={revisionSnapshot}
                currentRevision={surface.document.revision}
                hasMore={historyHasMore}
                busy={historyBusy}
                onSelect={(revision) => void selectRevision(revision)}
                onBack={closeRevisionDetail}
                onRestore={(revision) => void restoreRevision(revision)}
                onLoadOlder={() => void loadOlderHistory()}
              />
            </div>
          </div>
        </aside>
      </div>

      <button
        ref={railToggleRef}
        className={styles.railToggle}
        type="button"
        inert={modalRailOpen ? true : undefined}
        aria-controls={`repository-panel-${railTab.toLowerCase()}`}
        aria-expanded={railOpen}
        aria-label={`Threads and history, ${openThreadCount} open`}
        onClick={() => {
          if (railOpen) closeRail();
          else {
            setRailOpen(true);
            window.requestAnimationFrame(() => railHeadingRef.current?.focus());
          }
        }}
      >
        <span>Threads</span><b>{openThreadCount}</b>
      </button>

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          role="menu"
          aria-label="Selection actions"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
            const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : event.key === "ArrowDown" ? (currentIndex + 1) % items.length
                : (currentIndex - 1 + items.length) % items.length;
            items[nextIndex]?.focus();
          }}
        >
          <button type="button" role="menuitem" onClick={() => void openCommentComposer(contextMenu.target)}>
            <span aria-hidden="true">＋</span><span><b>Comment</b><small>Discuss this passage</small></span>
          </button>
          <button type="button" role="menuitem" onClick={() => void openTaskComposer(contextMenu.target)}>
            <span aria-hidden="true">↗</span><span><b>Create task</b><small>Delegate with authority</small></span>
          </button>
        </div>
      ) : null}

      {composer?.kind === "TASK" ? (
        <TaskComposer
          state={composer}
          members={surface.members}
          busy={composerBusy}
          titleRef={taskTitleRef}
          onChange={setComposer}
          onClose={closeComposer}
          onSubmit={() => void createTask()}
        />
      ) : null}
      {composer?.kind === "COMMENT" ? (
        <CommentComposer
          state={composer}
          busy={composerBusy}
          textareaRef={commentComposerRef}
          onChange={setComposer}
          onClose={closeComposer}
          onSubmit={() => void createThread()}
        />
      ) : null}

      {conflictSurface ? (
        <aside className={styles.conflictBanner} aria-live="assertive">
          <div><strong>A newer revision is available</strong><span>Your draft remains here until you choose.</span></div>
          <div>
            <button type="button" onClick={useLatest}>Use latest</button>
            <button
              type="button"
              disabled={saveInFlight || !changeSummary.trim()}
              onClick={() => void keepMine()}
            >
              Keep mine
            </button>
          </div>
        </aside>
      ) : null}
      {statusMessage && !conflictSurface ? <div className={styles.statusToast} role="status">{statusMessage}</div> : null}

      <RepositoryWebMCPBridge
        surface={surface}
        sessionInstanceId={session.sessionInstanceId}
        agentSessionToken={session.agentSessionToken}
        selfMemberId={session.selfMemberId}
        service={service}
        onStatusChange={updateWebMCPStatus}
        onAuthoritativeSurface={receiveAgentSurface}
        onToolExecutionChange={updateActiveAgentTool}
      />
    </div>
  );
}
