import {
  ISSUE_AGENT_LABEL_MAX_LENGTH,
  ISSUE_BODY_MAX_LENGTH,
  ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
  ISSUE_COMMENT_MAX_LENGTH,
  ISSUE_EVIDENCE_REF_LIMIT,
  ISSUE_EVIDENCE_REF_MAX_LENGTH,
  ISSUE_TASK_INSTRUCTION_MAX_LENGTH,
  ISSUE_TASK_TITLE_MAX_LENGTH,
  ISSUE_TITLE_MAX_LENGTH,
  ISSUE_WAIT_DEFAULT_SECONDS,
  ISSUE_WAIT_MAX_SECONDS,
  REPOSITORY_ERROR_CODES,
  type AddHumanIssueCommentServiceInput,
  type CancelIssueTaskServiceInput,
  type CommentOnIssueTaskServiceInput,
  type CreateIssueTaskServiceInput,
  type CreateIssueThreadServiceInput,
  type DecideIssueTaskServiceInput,
  type IssueActorSnapshot,
  type IssueAnchor,
  type IssueComment,
  type IssueDocument,
  type IssueMemberSnapshot,
  type IssuePresence,
  type IssueRevision,
  type IssueRevisionProvenance,
  type IssueRevisionSummary,
  type IssueSessionBundle,
  type IssueTask,
  type IssueTaskDecision,
  type IssueTaskProposal,
  type IssueTaskResult,
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
  RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV,
  RATIFLOW_SUPABASE_URL_ENV,
} from "./ratiflow-supabase-service";

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;
type Guard<T> = (value: unknown) => value is T;

export const RATIFLOW_REPOSITORY_SUPABASE_SERVICE_ROLE_KEY_ENV =
  "RATIFLOW_SUPABASE_SERVICE_ROLE_KEY";

export interface SupabaseRepositoryServiceOptions {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string;
  fetch?: FetchLike;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN = /^(?:[0-9a-f]{64}|[A-Za-z0-9_-]{32,128})$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const COLOR = /^#[0-9A-F]{6}$/iu;
const ERROR_CODES = new Set<string>(REPOSITORY_ERROR_CODES);

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

function token(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

function counter(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function bounded(value: unknown, maximum: number, nonblank = false): value is string {
  return typeof value === "string"
    && Array.from(value).length <= maximum
    && (!nonblank || value.trim().length > 0);
}

function nullable<T>(value: unknown, guard: Guard<T>): value is T | null {
  return value === null || guard(value);
}

function evidenceRefs(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= ISSUE_EVIDENCE_REF_LIMIT
    && value.every((entry) => bounded(entry, ISSUE_EVIDENCE_REF_MAX_LENGTH, true));
}

function hasValidOptionalEvidence(input: object): boolean {
  return !Object.hasOwn(input, "evidenceRefs")
    || evidenceRefs((input as JsonObject).evidenceRefs);
}

function isMember(value: unknown): value is IssueMemberSnapshot {
  return exact(value, ["memberId", "displayName"])
    && uuid(value.memberId)
    && bounded(value.displayName, 80, true);
}

function isActor(value: unknown): value is IssueActorSnapshot {
  if (!exact(value, ["actorType", "displayName", "member", "agentLabel"])) return false;
  if (value.actorType === "HUMAN") {
    return bounded(value.displayName, 80, true)
      && isMember(value.member)
      && value.displayName === value.member.displayName
      && value.agentLabel === null;
  }
  if (value.actorType === "AGENT") {
    return bounded(value.displayName, ISSUE_AGENT_LABEL_MAX_LENGTH, true)
      && isMember(value.member)
      && bounded(value.agentLabel, ISSUE_AGENT_LABEL_MAX_LENGTH, true)
      && value.displayName === value.agentLabel;
  }
  return value.actorType === "SYSTEM"
    && bounded(value.displayName, 80, true)
    && value.member === null
    && value.agentLabel === null;
}

function isPresence(value: unknown): value is IssuePresence {
  if (!exact(value, [
    "memberId", "displayName", "color", "state", "field", "isTyping",
    "selectionStart", "selectionEnd", "observedRevision", "lastSeenAt",
  ])) return false;
  const selection = value.field === null
    ? value.selectionStart === null && value.selectionEnd === null && value.isTyping === false
    : counter(value.selectionStart) && counter(value.selectionEnd)
      && value.selectionStart <= value.selectionEnd;
  return uuid(value.memberId)
    && bounded(value.displayName, 80, true)
    && typeof value.color === "string" && COLOR.test(value.color)
    && ["VIEWING", "EDITING", "IDLE"].includes(String(value.state))
    && (value.field === null || value.field === "TITLE" || value.field === "BODY")
    && typeof value.isTyping === "boolean"
    && selection
    && counter(value.observedRevision)
    && timestamp(value.lastSeenAt);
}

function isAnchor(value: unknown): value is IssueAnchor {
  if (!exact(value, [
    "scope", "field", "rangeStart", "rangeEnd", "selectedText",
    "createdRevision", "anchorRevision", "anchorState",
  ])) return false;
  if (!counter(value.createdRevision, 1) || !counter(value.anchorRevision, 1)
    || value.createdRevision > value.anchorRevision) return false;
  if (value.scope === "DOCUMENT") {
    return value.field === null && value.rangeStart === null && value.rangeEnd === null
      && value.selectedText === null && value.anchorState === "ACTIVE";
  }
  return value.scope === "SELECTION"
    && (value.field === "TITLE" || value.field === "BODY")
    && counter(value.rangeStart) && counter(value.rangeEnd)
    && value.rangeStart < value.rangeEnd
    && bounded(
      value.selectedText,
      value.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH,
    )
    && Array.from(value.selectedText).length === value.rangeEnd - value.rangeStart
    && (value.anchorState === "ACTIVE" || value.anchorState === "STALE");
}

function isCreationAnchor(value: unknown): value is IssueAnchor {
  return isAnchor(value)
    && value.anchorState === "ACTIVE"
    && value.createdRevision === value.anchorRevision;
}

function hasSameAnchorLineage(creation: IssueAnchor, live: IssueAnchor): boolean {
  return creation.scope === live.scope
    && creation.createdRevision === live.createdRevision
    && (creation.scope === "DOCUMENT"
      || live.scope === "SELECTION" && creation.field === live.field);
}

function isComment(value: unknown): value is IssueComment {
  if (!exact(value, [
    "commentId", "threadId", "replyToCommentId", "author", "origin", "body",
    "evidenceRefs", "createdAt",
  ])
    || !uuid(value.commentId)
    || !uuid(value.threadId)
    || !nullable(value.replyToCommentId, uuid)
    || !isActor(value.author)
    || !bounded(value.body, ISSUE_COMMENT_MAX_LENGTH, true)
    || !evidenceRefs(value.evidenceRefs)
    || !timestamp(value.createdAt)) return false;
  return (value.author.actorType === "HUMAN" && value.origin === "ORDINARY_UI")
    || (value.author.actorType === "AGENT" && value.origin === "WEBMCP")
    || (value.author.actorType === "SYSTEM" && value.origin === "SYSTEM");
}

function isThread(value: unknown): value is IssueThread {
  if (!exact(value, [
    "threadId", "taskId", "creationAnchor", "anchor", "status", "createdBy", "createdAt",
    "resolvedBy", "resolvedAt", "comments",
  ])
    || !uuid(value.threadId)
    || !nullable(value.taskId, uuid)
    || !isCreationAnchor(value.creationAnchor)
    || !isAnchor(value.anchor)
    || !hasSameAnchorLineage(value.creationAnchor, value.anchor)
    || !isMember(value.createdBy)
    || !timestamp(value.createdAt)
    || !Array.isArray(value.comments)
    || value.comments.length > 100
    || !value.comments.every(isComment)) return false;
  if (value.status === "OPEN") {
    if (value.resolvedBy !== null || value.resolvedAt !== null) return false;
  } else if (value.status === "RESOLVED") {
    if (!isMember(value.resolvedBy) || !timestamp(value.resolvedAt)) return false;
  } else return false;
  const seen = new Set<string>();
  for (let index = 0; index < value.comments.length; index += 1) {
    const comment = value.comments[index]!;
    if (comment.threadId !== value.threadId
      || seen.has(comment.commentId)
      || comment.replyToCommentId !== null && !seen.has(comment.replyToCommentId)) return false;
    if (index > 0) {
      const previous = value.comments[index - 1]!;
      if (previous.createdAt > comment.createdAt
        || previous.createdAt === comment.createdAt
          && previous.commentId.localeCompare(comment.commentId) > 0) return false;
    }
    seen.add(comment.commentId);
  }
  return true;
}

function isProposal(value: unknown): value is IssueTaskProposal {
  if (!exact(value, [
    "replacementText", "resultSummary", "evidenceRefs", "sourceRevision",
    "liveAnchor", "proposedBy", "proposedAt",
  ])
    || !bounded(value.replacementText, ISSUE_BODY_MAX_LENGTH)
    || !bounded(value.resultSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH, true)
    || !evidenceRefs(value.evidenceRefs)
    || !counter(value.sourceRevision, 1)
    || !isAnchor(value.liveAnchor) || value.liveAnchor.scope !== "SELECTION"
    || value.liveAnchor.anchorState !== "ACTIVE"
    || !isActor(value.proposedBy) || value.proposedBy.actorType !== "AGENT"
    || !timestamp(value.proposedAt)) return false;
  return bounded(
    value.replacementText,
    value.liveAnchor.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH,
  );
}

function sameMember(left: IssueMemberSnapshot, right: IssueMemberSnapshot): boolean {
  return left.memberId === right.memberId && left.displayName === right.displayName;
}

function sameActor(left: IssueActorSnapshot, right: IssueActorSnapshot): boolean {
  if (left.actorType !== right.actorType || left.displayName !== right.displayName
    || left.agentLabel !== right.agentLabel) return false;
  if (left.member === null || right.member === null) return left.member === right.member;
  return sameMember(left.member, right.member);
}

function compareTasks(left: IssueTask, right: IssueTask): number {
  const leftActive = left.status === "OPEN" || left.status === "PROPOSED" ? 0 : 1;
  const rightActive = right.status === "OPEN" || right.status === "PROPOSED" ? 0 : 1;
  if (leftActive !== rightActive) return leftActive - rightActive;
  const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updated !== 0) return updated;
  return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
}

function taskOrderIsValid(tasks: readonly IssueTask[]): boolean {
  return tasks.every((task, index) => index === 0
    || compareTasks(tasks[index - 1]!, task) <= 0);
}

function isTaskAgent(actor: IssueActorSnapshot, task: {
  assignee: IssueMemberSnapshot;
  agentLabel: string;
}): boolean {
  return actor.actorType === "AGENT"
    && sameMember(actor.member, task.assignee)
    && actor.agentLabel === task.agentLabel;
}

function isDecision(value: unknown): value is IssueTaskDecision {
  return exact(value, [
    "kind", "note", "decidedBy", "decidedAt", "decisionRevision", "resultRevision",
  ])
    && (value.kind === "ACCEPTED" || value.kind === "REJECTED")
    && (value.note === null || bounded(value.note, ISSUE_CHANGE_SUMMARY_MAX_LENGTH, true))
    && isMember(value.decidedBy)
    && timestamp(value.decidedAt)
    && counter(value.decisionRevision, 1)
    && counter(value.resultRevision, 1)
    && (value.kind === "ACCEPTED"
      ? value.resultRevision === value.decisionRevision + 1
      : value.resultRevision === value.decisionRevision);
}

function isTaskResult(value: unknown): value is IssueTaskResult {
  if (!exact(value, [
    "outcome", "resultSummary", "evidenceRefs", "sourceRevision", "resultRevision",
    "liveAnchor", "replacementText", "submittedBy", "submittedAt",
  ])
    || !bounded(value.resultSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH, true)
    || !evidenceRefs(value.evidenceRefs)
    || !counter(value.sourceRevision, 1) || !counter(value.resultRevision, 1)
    || !isAnchor(value.liveAnchor)
    || !isActor(value.submittedBy) || value.submittedBy.actorType !== "AGENT"
    || !timestamp(value.submittedAt)) return false;
  if (value.outcome === "COMMENTED") {
    return value.liveAnchor.anchorState === "ACTIVE" && value.replacementText === null;
  }
  return value.outcome === "COMMITTED"
    && value.liveAnchor.scope === "SELECTION"
    && value.liveAnchor.anchorState === "ACTIVE"
    && bounded(
      value.replacementText,
      value.liveAnchor.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH,
    );
}

function isTask(value: unknown): value is IssueTask {
  if (!exact(value, [
    "taskId", "taskKey", "title", "category", "instruction", "agentLabel",
    "creator", "assignee", "threadId", "creationAnchor", "createdAt", "updatedAt",
    "mode", "anchor", "status", "proposal", "result", "decision", "resolvedAt",
  ])) return false;
  if (!uuid(value.taskId) || !uuid(value.threadId)
    || !bounded(value.taskKey, 80, true)
    || !bounded(value.title, ISSUE_TASK_TITLE_MAX_LENGTH, true)
    || !["DATA", "LOGS", "CODEBASE", "RESEARCH", "WRITING", "GENERAL"]
      .includes(String(value.category))
    || !bounded(value.instruction, ISSUE_TASK_INSTRUCTION_MAX_LENGTH, true)
    || !bounded(value.agentLabel, ISSUE_AGENT_LABEL_MAX_LENGTH, true)
    || !isMember(value.creator) || !isMember(value.assignee)
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt)
    || !isCreationAnchor(value.creationAnchor)
    || !isAnchor(value.anchor)
    || !hasSameAnchorLineage(value.creationAnchor, value.anchor)) return false;
  if ((value.mode === "REVIEW" || value.mode === "DIRECT")
    && value.anchor.scope !== "SELECTION") return false;
  if (!["COMMENT", "REVIEW", "DIRECT"].includes(String(value.mode))) return false;
  const taskIdentity = { assignee: value.assignee, agentLabel: value.agentLabel };
  if (value.status === "OPEN") {
    return value.proposal === null && value.result === null && value.decision === null
      && value.resolvedAt === null;
  }
  if (value.status === "PROPOSED") {
    return value.mode === "REVIEW" && isProposal(value.proposal)
      && hasSameAnchorLineage(value.creationAnchor, value.proposal.liveAnchor)
      && isTaskAgent(value.proposal.proposedBy, taskIdentity)
      && value.result === null && value.decision === null && value.resolvedAt === null;
  }
  if (value.status === "COMPLETED") {
    if (!timestamp(value.resolvedAt)) return false;
    if (value.mode === "COMMENT") {
      return value.proposal === null && isTaskResult(value.result)
        && value.result.outcome === "COMMENTED"
        && hasSameAnchorLineage(value.creationAnchor, value.result.liveAnchor)
        && isTaskAgent(value.result.submittedBy, taskIdentity) && value.decision === null;
    }
    if (value.mode === "DIRECT") {
      return value.proposal === null && isTaskResult(value.result)
        && value.result.outcome === "COMMITTED"
        && hasSameAnchorLineage(value.creationAnchor, value.result.liveAnchor)
        && isTaskAgent(value.result.submittedBy, taskIdentity) && value.decision === null;
    }
    return value.mode === "REVIEW" && isProposal(value.proposal)
      && hasSameAnchorLineage(value.creationAnchor, value.proposal.liveAnchor)
      && isTaskAgent(value.proposal.proposedBy, taskIdentity)
      && value.result === null && isDecision(value.decision)
      && value.decision.kind === "ACCEPTED"
      && sameMember(value.decision.decidedBy, value.creator);
  }
  if (value.status === "REJECTED") {
    return value.mode === "REVIEW" && isProposal(value.proposal)
      && hasSameAnchorLineage(value.creationAnchor, value.proposal.liveAnchor)
      && isTaskAgent(value.proposal.proposedBy, taskIdentity)
      && value.result === null && isDecision(value.decision)
      && value.decision.kind === "REJECTED"
      && sameMember(value.decision.decidedBy, value.creator)
      && timestamp(value.resolvedAt);
  }
  if (value.status === "CANCELLED") {
    return value.proposal === null && value.result === null && value.decision === null
      && timestamp(value.resolvedAt);
  }
  return value.status === "STALE"
    && value.anchor.scope === "SELECTION"
    && value.anchor.anchorState === "STALE"
    && value.result === null && value.decision === null
    && (value.mode !== "REVIEW" || value.proposal === null
      || isProposal(value.proposal)
        && hasSameAnchorLineage(value.creationAnchor, value.proposal.liveAnchor)
        && isTaskAgent(value.proposal.proposedBy, taskIdentity))
    && timestamp(value.resolvedAt);
}

function isDiff(value: unknown): boolean {
  if (!exact(value, ["field", "rangeStart", "rangeEnd", "before", "after"])) return false;
  if ((value.field !== "TITLE" && value.field !== "BODY")
    || !counter(value.rangeStart) || !counter(value.rangeEnd)
    || value.rangeStart > value.rangeEnd) return false;
  const maximum = value.field === "TITLE" ? ISSUE_TITLE_MAX_LENGTH : ISSUE_BODY_MAX_LENGTH;
  return bounded(value.before, maximum)
    && bounded(value.after, maximum)
    && Array.from(value.before).length === value.rangeEnd - value.rangeStart
    && value.before !== value.after;
}

function isProvenance(value: unknown): value is IssueRevisionProvenance {
  if (!exact(value, [
    "sourceRevision", "authority", "origin", "authorOrigin", "taskId", "author",
    "committer", "grantedBy", "approvedBy", "restoredRevision",
  ]) || !counter(value.sourceRevision)) return false;
  if (value.authority === "HUMAN") {
    return value.origin === "ORDINARY_UI" && value.authorOrigin === "ORDINARY_UI"
      && value.taskId === null && isActor(value.author) && value.author.actorType === "HUMAN"
      && isActor(value.committer) && value.committer.actorType === "HUMAN"
      && sameActor(value.author, value.committer)
      && value.grantedBy === null && value.approvedBy === null && value.restoredRevision === null;
  }
  if (value.authority === "DIRECT") {
    return value.origin === "WEBMCP" && value.authorOrigin === "WEBMCP"
      && uuid(value.taskId) && isActor(value.author) && value.author.actorType === "AGENT"
      && isActor(value.committer) && value.committer.actorType === "AGENT"
      && sameActor(value.author, value.committer)
      && isMember(value.grantedBy) && value.approvedBy === null && value.restoredRevision === null;
  }
  if (value.authority === "REVIEW") {
    return value.origin === "ORDINARY_UI" && value.authorOrigin === "WEBMCP"
      && uuid(value.taskId) && isActor(value.author) && value.author.actorType === "AGENT"
      && isActor(value.committer) && value.committer.actorType === "HUMAN"
      && isMember(value.grantedBy) && isMember(value.approvedBy)
      && sameMember(value.committer.member, value.approvedBy)
      && value.restoredRevision === null;
  }
  return value.authority === "RESTORE"
    && value.origin === "ORDINARY_UI" && value.authorOrigin === "ORDINARY_UI"
    && value.taskId === null && isActor(value.author) && value.author.actorType === "HUMAN"
    && isActor(value.committer) && value.committer.actorType === "HUMAN"
    && sameActor(value.author, value.committer)
    && value.grantedBy === null && value.approvedBy === null
    && counter(value.restoredRevision, 1);
}

function isRevisionSummary(value: unknown): value is IssueRevisionSummary {
  if (!exact(value, [
    "revisionId", "revision", "parentRevision", "contentDigest", "diffs", "provenance",
    "changeSummary", "evidenceRefs", "createdAt",
  ])
    || !uuid(value.revisionId) || !counter(value.revision, 1)
    || !nullable(value.parentRevision, (entry): entry is number => counter(entry, 1))
    || typeof value.contentDigest !== "string" || !DIGEST.test(value.contentDigest)
    || !Array.isArray(value.diffs) || value.diffs.length > 2 || !value.diffs.every(isDiff)
    || !isProvenance(value.provenance)
    || !bounded(value.changeSummary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH, true)
    || !evidenceRefs(value.evidenceRefs)
    || !timestamp(value.createdAt)) return false;
  if (value.revision === 1) {
    return value.parentRevision === null && value.provenance.sourceRevision === 0
      && value.diffs.length === 2
      && value.diffs[0]?.field === "TITLE" && value.diffs[1]?.field === "BODY"
      && value.diffs.every((diff) => diff.rangeStart === 0
        && diff.rangeEnd === 0 && diff.before === "");
  }
  if (value.parentRevision !== value.revision - 1
    || value.provenance.sourceRevision < 1
    || value.provenance.sourceRevision > value.parentRevision
    || value.diffs.length < 1) return false;
  return value.diffs.every((diff, index, all) => index === 0
    || all[index - 1]!.field === "TITLE" && diff.field === "BODY");
}

function isRevision(value: unknown): value is IssueRevision {
  if (!exact(value, [
    "revisionId", "revision", "parentRevision", "contentDigest", "diffs", "provenance",
    "changeSummary", "evidenceRefs", "createdAt", "title", "body",
  ])) return false;
  const { title, body, ...summary } = value;
  return isRevisionSummary(summary)
    && bounded(title, ISSUE_TITLE_MAX_LENGTH, true)
    && bounded(body, ISSUE_BODY_MAX_LENGTH);
}

function isDocument(value: unknown): value is IssueDocument {
  return exact(value, [
    "id", "protocolVersion", "kind", "title", "body", "revision", "activityVersion",
    "updatedAt", "lastRevision",
  ])
    && uuid(value.id) && value.protocolVersion === 4
    && (value.kind === "POSTMORTEM" || value.kind === "PRODUCT_DOCUMENT")
    && bounded(value.title, ISSUE_TITLE_MAX_LENGTH, true)
    && bounded(value.body, ISSUE_BODY_MAX_LENGTH)
    && counter(value.revision, 1) && counter(value.activityVersion, 1)
    && timestamp(value.updatedAt)
    && exact(value.lastRevision, ["revisionId", "author", "authority", "summary"])
    && uuid(value.lastRevision.revisionId)
    && isActor(value.lastRevision.author)
    && ["HUMAN", "DIRECT", "REVIEW", "RESTORE"].includes(String(value.lastRevision.authority))
    && bounded(value.lastRevision.summary, ISSUE_CHANGE_SUMMARY_MAX_LENGTH, true);
}

export function isIssueWorkspaceSurface(value: unknown): value is IssueWorkspaceSurface {
  if (!exact(value, [
    "document", "presence", "members", "tasks", "threads", "history", "hasMoreHistory",
  ])
    || !isDocument(value.document)
    || !Array.isArray(value.presence) || !value.presence.every(isPresence)
    || !Array.isArray(value.members) || !value.members.every(isMember)
    || !Array.isArray(value.tasks) || value.tasks.length > 500 || !value.tasks.every(isTask)
    || !Array.isArray(value.threads) || !value.threads.every(isThread)
    || !Array.isArray(value.history) || value.history.length < 1
    || value.history.length > 20 || !value.history.every(isRevisionSummary)
    || typeof value.hasMoreHistory !== "boolean") return false;
  const members = new Map(value.members.map((member) => [member.memberId, member]));
  if (members.size !== value.members.length
    || value.presence.some((presence) => !members.has(presence.memberId))
    || new Set(value.presence.map((presence) => presence.memberId)).size !== value.presence.length) {
    return false;
  }
  const taskIds = new Set(value.tasks.map((task) => task.taskId));
  const threadIds = new Set(value.threads.map((thread) => thread.threadId));
  if (taskIds.size !== value.tasks.length || threadIds.size !== value.threads.length
    || !taskOrderIsValid(value.tasks)
    || value.threads.filter((thread) => thread.taskId === null).length > 500
    || value.tasks.filter((task) => task.status === "OPEN" || task.status === "PROPOSED").length > 100) {
    return false;
  }
  const activePerAssignee = new Map<string, number>();
  for (const task of value.tasks) {
    const creator = members.get(task.creator.memberId);
    const assignee = members.get(task.assignee.memberId);
    const thread = value.threads.find((entry) => entry.threadId === task.threadId);
    if (!creator || !assignee || !sameMember(creator, task.creator)
      || !sameMember(assignee, task.assignee)
      || !thread || thread.taskId !== task.taskId
      || JSON.stringify(thread.creationAnchor) !== JSON.stringify(task.creationAnchor)
      || JSON.stringify(thread.anchor) !== JSON.stringify(task.anchor)) return false;
    if (task.status === "OPEN" || task.status === "PROPOSED") {
      const count = (activePerAssignee.get(task.assignee.memberId) ?? 0) + 1;
      if (count > 50) return false;
      activePerAssignee.set(task.assignee.memberId, count);
    }
  }
  const orderedTaskIds = value.tasks.map((task) => task.taskId);
  const taskThreads = value.threads.slice(0, value.tasks.length);
  const standaloneThreads = value.threads.slice(value.tasks.length);
  if (taskThreads.some((thread, index) => thread.taskId !== orderedTaskIds[index])
    || standaloneThreads.some((thread) => thread.taskId !== null)
    || standaloneThreads.some((thread, index, all) => index > 0 && (
      Date.parse(all[index - 1]!.createdAt) < Date.parse(thread.createdAt)
      || Date.parse(all[index - 1]!.createdAt) === Date.parse(thread.createdAt)
        && all[index - 1]!.threadId > thread.threadId
    ))) return false;
  if (value.history[0]!.revision !== value.document.revision
    || value.history.length !== Math.min(value.document.revision, 20)
    || value.history[0]!.revisionId !== value.document.lastRevision.revisionId
    || value.history[0]!.provenance.authority !== value.document.lastRevision.authority
    || !sameActor(value.history[0]!.provenance.author, value.document.lastRevision.author)
    || value.history[0]!.changeSummary !== value.document.lastRevision.summary
    || value.history.some((revision, index, all) => index > 0
      && all[index - 1]!.revision !== revision.revision + 1)
    || value.hasMoreHistory !== (value.document.revision > value.history.length)) return false;
  return true;
}

function isTaskView(value: unknown): value is IssueTaskView {
  return exact(value, ["task", "thread"])
    && isTask(value.task) && isThread(value.thread)
    && value.task.threadId === value.thread.threadId
    && value.thread.taskId === value.task.taskId
    && JSON.stringify(value.thread.creationAnchor) === JSON.stringify(value.task.creationAnchor)
    && JSON.stringify(value.thread.anchor) === JSON.stringify(value.task.anchor);
}

function isFailure(value: unknown): value is RepositoryFailure {
  return exact(value, ["ok", "code", "message", "retryable"], [
    "currentRevision", "currentActivityVersion", "currentTask", "nextAction",
  ])
    && value.ok === false && ERROR_CODES.has(String(value.code))
    && typeof value.message === "string" && typeof value.retryable === "boolean"
    && (!Object.hasOwn(value, "currentRevision") || counter(value.currentRevision))
    && (!Object.hasOwn(value, "currentActivityVersion") || counter(value.currentActivityVersion))
    && (!Object.hasOwn(value, "currentTask") || isTask(value.currentTask))
    && (!Object.hasOwn(value, "nextAction") || typeof value.nextAction === "string");
}

export function normalizeRepositoryResult<T>(
  value: unknown,
  guard: Guard<T>,
): RepositoryResult<T> {
  if (isFailure(value)) return value;
  if (!exact(value, ["ok", "data"]) || value.ok !== true || !guard(value.data)) {
    throw new Error("Supabase RPC returned an invalid repository-v4 result.");
  }
  return value as unknown as RepositoryResult<T>;
}

function isSession(value: unknown): value is IssueSessionBundle {
  if (!exact(value, [
    "shareToken", "humanSessionToken", "agentSessionToken", "sessionInstanceId",
    "selfMemberId", "expiresAt", "protocolVersion", "surface",
  ])
    || !token(value.shareToken) || !token(value.humanSessionToken) || !token(value.agentSessionToken)
    || new Set([value.shareToken, value.humanSessionToken, value.agentSessionToken]).size !== 3
    || !uuid(value.sessionInstanceId) || !uuid(value.selfMemberId)
    || !timestamp(value.expiresAt) || value.protocolVersion !== 4
    || !isIssueWorkspaceSurface(value.surface)) return false;
  return value.surface.members.filter((member) => member.memberId === value.selfMemberId).length === 1;
}

function isHistory(
  value: unknown,
  input: ReadIssueHistoryInput,
): value is ReadIssueHistoryOutcome {
  if (!exact(value, [
    "revisions", "hasMoreOlder", "nextBeforeRevision", "currentRevision",
    "currentActivityVersion",
  ])
    || !Array.isArray(value.revisions) || value.revisions.length > 50
    || !value.revisions.every(isRevisionSummary)
    || value.revisions.some((revision, index, all) => index > 0
      && all[index - 1]!.revision !== revision.revision + 1)
    || typeof value.hasMoreOlder !== "boolean"
    || !nullable(value.nextBeforeRevision, (entry): entry is number => counter(entry, 1))
    || !counter(value.currentRevision, 1) || !counter(value.currentActivityVersion, 1)) return false;
  const currentRevision = value.currentRevision;
  if (value.revisions.some((revision) => revision.revision > currentRevision)) return false;
  const newestExpected = input.beforeRevision === undefined
    ? currentRevision
    : Math.min(currentRevision, input.beforeRevision - 1);
  const expectedLength = Math.min(input.limit ?? 20, Math.max(0, newestExpected));
  if (value.revisions.length !== expectedLength
    || expectedLength > 0 && value.revisions[0]!.revision !== newestExpected) return false;
  const oldest = value.revisions.at(-1)?.revision ?? null;
  return value.hasMoreOlder
    ? oldest !== null && oldest > 1 && value.nextBeforeRevision === oldest
    : value.nextBeforeRevision === null;
}

function isList(value: unknown, includeResolved = true): value is ListMyIssueTasksOutcome {
  return exact(value, ["tasks", "revision", "activityVersion"])
    && Array.isArray(value.tasks) && value.tasks.length <= 500 && value.tasks.every(isTaskView)
    && new Set(value.tasks.map((entry) => entry.task.taskId)).size === value.tasks.length
    && taskOrderIsValid(value.tasks.map((entry) => entry.task))
    && (includeResolved || value.tasks.every(({ task }) => task.status === "OPEN" || task.status === "PROPOSED"))
    && counter(value.revision, 1) && counter(value.activityVersion, 1);
}

function isAgentCommentOutcome(value: unknown): value is {
  task: IssueTask;
  comment: IssueComment;
  activityVersion: number;
} {
  return exact(value, ["task", "comment", "activityVersion"])
    && isTask(value.task) && isComment(value.comment)
    && value.task.threadId === value.comment.threadId
    && isTaskAgent(value.comment.author, value.task)
    && counter(value.activityVersion, 1);
}

function isSubmitOutcome(value: unknown): value is SubmitIssueTaskResultOutcome {
  if (!exact(value, ["outcome", "task", "revision", "activityVersion"])) return false;
  if (!isTask(value.task) || !counter(value.activityVersion, 1)) return false;
  if (value.outcome === "COMMITTED") {
    return value.task.status === "COMPLETED" && value.task.mode === "DIRECT"
      && value.task.result?.outcome === "COMMITTED"
      && isRevision(value.revision)
      && value.revision.revision === value.task.result.resultRevision
      && value.revision.provenance.authority === "DIRECT"
      && value.revision.provenance.taskId === value.task.taskId;
  }
  return (value.outcome === "COMMENTED" && value.task.status === "COMPLETED"
        && value.task.mode === "COMMENT" && value.task.result?.outcome === "COMMENTED"
      || value.outcome === "PROPOSED" && value.task.status === "PROPOSED"
        && value.task.mode === "REVIEW")
    && counter(value.revision, 1);
}

function isReset(value: unknown): value is ResetPostmortemHeroOutcome {
  if (!exact(value, [
    "fixtureVersion", "shareToken", "priyaBootstrapPath", "nadiaBootstrapPath",
    "leoBootstrapPath", "samBootstrapPath", "expiresAt", "revision", "activityVersion",
  ]) || value.fixtureVersion !== "repo-document-v4.postmortem.v1"
    || !token(value.shareToken) || !timestamp(value.expiresAt)
    || value.revision !== 1 || value.activityVersion !== 4) return false;
  const prefix = `/issue/${value.shareToken}#ratiflow-bootstrap=`;
  const paths = [
    value.priyaBootstrapPath, value.nadiaBootstrapPath,
    value.leoBootstrapPath, value.samBootstrapPath,
  ];
  return paths.every((path) => typeof path === "string" && path.startsWith(prefix)
      && /^[A-Za-z0-9_-]{32,16384}$/u.test(path.slice(prefix.length)))
    && new Set(paths).size === paths.length;
}

function abortError(signal?: AbortSignal): DOMException {
  return signal?.reason instanceof DOMException && signal.reason.name === "AbortError"
    ? signal.reason
    : new DOMException("Operation cancelled", "AbortError");
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError(signal);
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class SupabaseRepositoryService
implements RepositoryServicePort, RepositoryEvaluationPort {
  private readonly endpoint: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey?: string;
  private readonly request: FetchLike;
  private readonly activeWaits = new Set<string>();

  constructor({
    url,
    publishableKey,
    serviceRoleKey,
    fetch: fetchOverride,
  }: SupabaseRepositoryServiceOptions) {
    if (!/^https:\/\//u.test(url) || !publishableKey) {
      throw new Error("A HTTPS Supabase URL and publishable key are required.");
    }
    this.endpoint = `${url.replace(/\/$/u, "")}/rest/v1/rpc`;
    this.publishableKey = publishableKey;
    this.serviceRoleKey = serviceRoleKey;
    this.request = fetchOverride ?? fetch;
  }

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): SupabaseRepositoryService | undefined {
    const url = environment[RATIFLOW_SUPABASE_URL_ENV];
    const publishableKey = environment[RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV];
    if (!url || !publishableKey) return undefined;
    return new SupabaseRepositoryService({
      url,
      publishableKey,
      serviceRoleKey: environment[RATIFLOW_REPOSITORY_SUPABASE_SERVICE_ROLE_KEY_ENV],
    });
  }

  async launch(input: LaunchIssueHttpInput, signal?: AbortSignal) {
    return normalizeRepositoryResult(
      await this.rpc("ratiflow_launch_issue_v4", { p_input: input }, signal),
      isSession,
    );
  }

  async launchExample(input: LaunchIssueExampleHttpInput, signal?: AbortSignal) {
    if (!exact(input, [])) {
      return this.invalidInput<IssueSessionBundle>("The example request must be empty.");
    }
    return normalizeRepositoryResult(
      await this.rpc("ratiflow_launch_issue_v4", { p_input: {}, p_example: true }, signal),
      isSession,
    );
  }

  async join(input: JoinIssueHttpInput, signal?: AbortSignal) {
    const { shareToken, ...joinInput } = input;
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_join_issue_v4",
      { p_share_token: shareToken, p_input: joinInput },
      signal,
    ), isSession);
  }

  async inspect(sessionToken: string, signal?: AbortSignal) {
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_inspect_issue_v4", { p_handle: sessionToken }, signal,
    ), isIssueWorkspaceSurface);
  }

  async saveHumanRevision(
    sessionToken: string,
    input: SaveIssueRevisionServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_save_issue_revision_v4", sessionToken, input, signal);
  }

  async createTask(
    sessionToken: string,
    input: CreateIssueTaskServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_create_issue_task_v4", sessionToken, input, signal);
  }

  async createThread(
    sessionToken: string,
    input: CreateIssueThreadServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_create_issue_thread_v4", sessionToken, input, signal);
  }

  async addHumanComment(
    sessionToken: string,
    input: AddHumanIssueCommentServiceInput,
    signal?: AbortSignal,
  ) {
    if (!hasValidOptionalEvidence(input)) {
      return this.invalidInput<IssueWorkspaceSurface>("Evidence references must be an array.");
    }
    return this.surfaceMutation("ratiflow_add_issue_comment_v4", sessionToken, input, signal);
  }

  async resolveThread(
    sessionToken: string,
    input: ResolveIssueThreadServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_resolve_issue_thread_v4", sessionToken, input, signal);
  }

  async cancelTask(
    sessionToken: string,
    input: CancelIssueTaskServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_cancel_issue_task_v4", sessionToken, input, signal);
  }

  async acceptTaskProposal(
    sessionToken: string,
    input: DecideIssueTaskServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_accept_issue_task_v4", sessionToken, input, signal);
  }

  async rejectTaskProposal(
    sessionToken: string,
    input: DecideIssueTaskServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_reject_issue_task_v4", sessionToken, input, signal);
  }

  async restoreRevision(
    sessionToken: string,
    input: RestoreIssueRevisionServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_restore_issue_revision_v4", sessionToken, input, signal);
  }

  async readHistory(
    sessionToken: string,
    input: ReadIssueHistoryInput,
    signal?: AbortSignal,
  ) {
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_read_issue_history_v4", { p_handle: sessionToken, p_input: input }, signal,
    ), (value): value is ReadIssueHistoryOutcome => isHistory(value, input));
  }

  async readRevision(sessionToken: string, revision: number, signal?: AbortSignal) {
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_read_issue_revision_v4",
      { p_handle: sessionToken, p_input: { revision } },
      signal,
    ), isRevision);
  }

  async listMyTasks(
    agentSessionToken: string,
    input: ListMyIssueTasksInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ) {
    if (!uuid(pageSessionId)) return this.invalidPage<ListMyIssueTasksOutcome>();
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_list_my_issue_tasks_v4",
      { p_handle: agentSessionToken, p_page_session_id: pageSessionId, p_input: input },
      signal,
    ), (value): value is ListMyIssueTasksOutcome => isList(value, input.includeResolved === true));
  }

  async waitForMyTasks(
    agentSessionToken: string,
    input: WaitForMyIssueTasksInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<WaitForMyIssueTasksOutcome>> {
    if (!uuid(pageSessionId)) return this.invalidPage<WaitForMyIssueTasksOutcome>();
    if (!counter(input.afterActivityVersion) || !counter(input.afterRevision)
      || input.timeoutSeconds !== undefined
        && (!counter(input.timeoutSeconds, 1) || input.timeoutSeconds > ISSUE_WAIT_MAX_SECONDS)) {
      return this.invalidInput<WaitForMyIssueTasksOutcome>("The wait cursors are invalid.");
    }
    const deadline = Date.now()
      + (input.timeoutSeconds ?? ISSUE_WAIT_DEFAULT_SECONDS) * 1_000;
    let listed = await this.listMyTasks(agentSessionToken, {}, pageSessionId, signal);
    if (!listed.ok) return listed;
    if (input.afterRevision > listed.data.revision
      || input.afterActivityVersion > listed.data.activityVersion) {
      return this.invalidInput<WaitForMyIssueTasksOutcome>("A wait cursor cannot be in the future.");
    }
    const immediate = listed.data.tasks.filter(({ task }) => task.status === "OPEN");
    if (immediate.length > 0) {
      return { ok: true, data: {
        outcome: "TASKS_AVAILABLE", tasks: immediate,
        revision: listed.data.revision, activityVersion: listed.data.activityVersion,
      } };
    }
    if (listed.data.revision > input.afterRevision) {
      return { ok: true, data: {
        outcome: "DOCUMENT_CHANGED", tasks: [],
        revision: listed.data.revision, activityVersion: listed.data.activityVersion,
      } };
    }
    const key = `${agentSessionToken}:${pageSessionId}`;
    if (this.activeWaits.has(key)) {
      return {
        ok: false,
        code: "WAIT_ALREADY_ACTIVE",
        message: "Only one task wait may be active for this page.",
        retryable: false,
      };
    }
    this.activeWaits.add(key);
    let observedActivity = Math.max(input.afterActivityVersion, listed.data.activityVersion);
    try {
      while (true) {
        if (signal?.aborted) throw abortError(signal);
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          return { ok: true, data: {
            outcome: "TIMEOUT", tasks: [], revision: listed.data.revision,
            activityVersion: observedActivity,
          } };
        }
        await delay(Math.min(500, remaining), signal);
        if (Date.now() >= deadline) {
          return { ok: true, data: {
            outcome: "TIMEOUT", tasks: [], revision: listed.data.revision,
            activityVersion: observedActivity,
          } };
        }
        listed = await this.listMyTasks(agentSessionToken, {}, pageSessionId, signal);
        if (!listed.ok) return listed;
        const open = listed.data.tasks.filter(({ task }) => task.status === "OPEN");
        if (open.length > 0) {
          return { ok: true, data: {
            outcome: "TASKS_AVAILABLE", tasks: open,
            revision: listed.data.revision, activityVersion: listed.data.activityVersion,
          } };
        }
        if (listed.data.revision > input.afterRevision) {
          return { ok: true, data: {
            outcome: "DOCUMENT_CHANGED", tasks: [],
            revision: listed.data.revision, activityVersion: listed.data.activityVersion,
          } };
        }
        observedActivity = Math.max(observedActivity, listed.data.activityVersion);
      }
    } finally {
      this.activeWaits.delete(key);
    }
  }

  async commentOnTask(
    agentSessionToken: string,
    input: CommentOnIssueTaskServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ) {
    if (!uuid(pageSessionId)) return this.invalidPage<{
      task: IssueTask;
      comment: IssueComment;
      activityVersion: number;
    }>();
    if (!hasValidOptionalEvidence(input)) {
      return this.invalidInput<{
        task: IssueTask;
        comment: IssueComment;
        activityVersion: number;
      }>("Evidence references must be an array.");
    }
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_comment_on_issue_task_v4",
      { p_handle: agentSessionToken, p_page_session_id: pageSessionId, p_input: input },
      signal,
    ), isAgentCommentOutcome);
  }

  async submitTaskResult(
    agentSessionToken: string,
    input: SubmitIssueTaskResultServiceInput,
    pageSessionId: string,
    signal?: AbortSignal,
  ) {
    if (!uuid(pageSessionId)) return this.invalidPage<SubmitIssueTaskResultOutcome>();
    if (!hasValidOptionalEvidence(input)) {
      return this.invalidInput<SubmitIssueTaskResultOutcome>(
        "Evidence references must be an array.",
      );
    }
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_submit_issue_task_result_v4",
      { p_handle: agentSessionToken, p_page_session_id: pageSessionId, p_input: input },
      signal,
    ), isSubmitOutcome);
  }

  async touchPresence(
    sessionToken: string,
    input: TouchIssuePresenceServiceInput,
    signal?: AbortSignal,
  ) {
    return this.surfaceMutation("ratiflow_touch_issue_presence_v4", sessionToken, input, signal);
  }

  async resetPostmortemHero(signal?: AbortSignal) {
    if (!this.serviceRoleKey) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        message: "The service-role reset credential is not configured.",
        retryable: false,
      } as const;
    }
    return normalizeRepositoryResult(await this.rpc(
      "ratiflow_reset_postmortem_hero_v4", {}, signal, this.serviceRoleKey,
    ), isReset);
  }

  private invalidPage<T>(): RepositoryResult<T> {
    return this.invalidInput("A valid page-session UUID is required.");
  }

  private invalidInput<T>(message: string): RepositoryResult<T> {
    return { ok: false, code: "INVALID_INPUT", message, retryable: false };
  }

  private async surfaceMutation(
    name: string,
    sessionToken: string,
    input: object,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<IssueWorkspaceSurface>> {
    return normalizeRepositoryResult(await this.rpc(
      name, { p_handle: sessionToken, p_input: input }, signal,
    ), isIssueWorkspaceSurface);
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
