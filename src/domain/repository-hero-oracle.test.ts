import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";

import postmortemGolden from "../../evals/goldens/repo-document-v4/postmortem.json";
import type {
  IssueActorSnapshot,
  IssueAnchor,
  IssueComment,
  IssueMemberSnapshot,
  IssueRevision,
  IssueSessionBundle,
  IssueTask,
  IssueWorkspaceSurface,
  RepositoryResult,
} from "@/repository/contracts";
import {
  ISSUE_WORKSPACE_TTL_MS,
  REPOSITORY_PROTOCOL_VERSION,
} from "@/repository/contracts";
import { LocalRepositoryService } from "./repository-service";

type GoldenTask = (typeof postmortemGolden.tasks)[number];
type GoldenRevision = (typeof postmortemGolden.revisions)[number];
type GoldenComment = (typeof postmortemGolden.comments)[number];
type GoldenActorKey = keyof typeof postmortemGolden.actors;
type GoldenSubmission = NonNullable<GoldenTask["submission"]>;
type GoldenProposal = NonNullable<GoldenTask["proposal"]>;
type GoldenDecision = NonNullable<GoldenTask["decision"]>;
type GoldenAnchorRebases = NonNullable<GoldenTask["anchorRebases"]>;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function assertFailureCode(result: RepositoryResult<unknown>, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

function assertExactKeys(
  value: object,
  expected: readonly string[],
  context: string,
): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${context} keys`);
}

function assertUtc(value: string, context: string): void {
  assert.match(value, ISO_UTC, `${context} must be a millisecond UTC timestamp`);
  assert.ok(Number.isFinite(Date.parse(value)), `${context} must be parseable`);
}

function normalizeTimestamp(actual: string, expected: string, context: string): string {
  assertUtc(actual, context);
  assertUtc(expected, `${context} golden`);
  return expected;
}

function pointLength(value: string): number {
  return Array.from(value).length;
}

function pointIndexOf(haystack: string, needle: string, context: string): number {
  const codeUnitIndex = haystack.indexOf(needle);
  assert.notEqual(codeUnitIndex, -1, `${context} must occur in the final golden body`);
  assert.equal(
    haystack.lastIndexOf(needle),
    codeUnitIndex,
    `${context} must identify one unambiguous final target`,
  );
  return pointLength(haystack.slice(0, codeUnitIndex));
}

function secretDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hasSubmission(task: GoldenTask): task is GoldenTask & { submission: GoldenSubmission } {
  return task.submission !== undefined;
}

function hasProposal(task: GoldenTask): task is GoldenTask & {
  proposal: GoldenProposal;
  decision: GoldenDecision;
  anchorRebases: GoldenAnchorRebases;
} {
  return task.proposal !== undefined
    && task.decision !== undefined
    && task.anchorRebases !== undefined;
}

function goldenMemberById(memberId: string): IssueMemberSnapshot {
  const found = Object.values(postmortemGolden.members).find(
    (member) => member.memberId === memberId,
  );
  assert.ok(found, `golden member ${memberId} must exist`);
  return found;
}

function goldenActor(actorKey: string): IssueActorSnapshot {
  assert.ok(Object.hasOwn(postmortemGolden.actors, actorKey), `golden actor ${actorKey} must exist`);
  return postmortemGolden.actors[actorKey as GoldenActorKey] as IssueActorSnapshot;
}

function memberIdNormalizer(surface: IssueWorkspaceSurface): Map<string, string> {
  const expectedByName = new Map(
    Object.values(postmortemGolden.members).map((member) => [member.displayName, member]),
  );
  assert.equal(surface.members.length, expectedByName.size, "the example must have no extra members");
  assert.equal(new Set(surface.members.map((member) => member.memberId)).size, surface.members.length);
  const result = new Map<string, string>();
  for (const member of surface.members) {
    assert.match(member.memberId, UUID);
    const expected = expectedByName.get(member.displayName);
    assert.ok(expected, `unexpected example member ${member.displayName}`);
    result.set(member.memberId, expected.memberId);
  }
  assert.equal(result.size, expectedByName.size);
  return result;
}

function normalizeMember(
  member: IssueMemberSnapshot,
  memberIds: ReadonlyMap<string, string>,
): IssueMemberSnapshot {
  assertExactKeys(member, ["memberId", "displayName"], "member");
  const memberId = memberIds.get(member.memberId);
  assert.ok(memberId, `member ${member.displayName} must belong to the normalized graph`);
  return { memberId, displayName: member.displayName };
}

function normalizeActor(
  actor: IssueActorSnapshot,
  memberIds: ReadonlyMap<string, string>,
): IssueActorSnapshot {
  assertExactKeys(actor, ["actorType", "displayName", "member", "agentLabel"], "actor");
  if (actor.actorType === "SYSTEM") {
    return { ...actor };
  }
  return { ...actor, member: normalizeMember(actor.member, memberIds) };
}

function actorKey(
  actor: IssueActorSnapshot,
  memberIds: ReadonlyMap<string, string>,
): GoldenActorKey {
  const normalized = normalizeActor(actor, memberIds);
  const found = Object.entries(postmortemGolden.actors).find(([, expected]) =>
    expected.actorType === normalized.actorType
      && expected.displayName === normalized.displayName
      && expected.agentLabel === normalized.agentLabel
      && expected.member?.memberId === normalized.member?.memberId);
  assert.ok(found, `actor ${actor.displayName} must be one of the four golden actors`);
  assert.deepEqual(normalized, found[1]);
  return found[0] as GoldenActorKey;
}

function finalAnchorFor(goldenTask: GoldenTask): IssueAnchor {
  const replacementText = hasSubmission(goldenTask)
    ? goldenTask.submission.replacementText
    : (() => {
        assert.ok(hasProposal(goldenTask));
        return goldenTask.proposal.replacementText;
      })();
  const finalBody = postmortemGolden.revisions.at(-1)!.body;
  const rangeStart = pointIndexOf(finalBody, replacementText, goldenTask.taskKey);
  return {
    ...goldenTask.creationAnchor,
    rangeStart,
    rangeEnd: rangeStart + pointLength(replacementText),
    selectedText: replacementText,
    anchorRevision: postmortemGolden.document.finalRevision,
  } as IssueAnchor;
}

function fullLiveAnchor(
  goldenTask: GoldenTask,
  liveAnchor: {
    rangeStart: number;
    rangeEnd: number;
    anchorRevision: number;
    anchorState: string;
    selectedText?: string;
  },
): IssueAnchor {
  assert.equal(liveAnchor.anchorState, "ACTIVE");
  if (liveAnchor.selectedText !== undefined) {
    assert.equal(liveAnchor.selectedText, goldenTask.creationAnchor.selectedText);
  }
  return {
    ...goldenTask.creationAnchor,
    rangeStart: liveAnchor.rangeStart,
    rangeEnd: liveAnchor.rangeEnd,
    anchorRevision: liveAnchor.anchorRevision,
    anchorState: liveAnchor.anchorState,
  } as IssueAnchor;
}

function normalizedTask(
  task: IssueTask,
  expected: GoldenTask,
  memberIds: ReadonlyMap<string, string>,
  taskIds: ReadonlyMap<string, string>,
  threadIds: ReadonlyMap<string, string>,
): Record<string, unknown> {
  assertExactKeys(task, [
    "taskId", "taskKey", "title", "category", "instruction", "agentLabel", "mode",
    "status", "creationAnchor", "anchor", "creator", "assignee", "threadId", "proposal",
    "result", "decision", "createdAt", "updatedAt", "resolvedAt",
  ], `task ${expected.taskKey}`);
  const terminalAt = hasSubmission(expected)
    ? expected.submission.submittedAt
    : (() => {
        assert.ok(hasProposal(expected));
        return expected.decision.decidedAt;
      })();
  const proposal = task.proposal === null ? null : (() => {
    assertExactKeys(task.proposal, [
      "replacementText", "resultSummary", "evidenceRefs", "sourceRevision", "liveAnchor",
      "proposedBy", "proposedAt",
    ], `${expected.taskKey} proposal`);
    return {
      ...task.proposal,
      proposedBy: normalizeActor(task.proposal.proposedBy, memberIds),
      proposedAt: normalizeTimestamp(
        task.proposal.proposedAt,
        hasProposal(expected) ? expected.proposal.proposedAt : terminalAt,
        `${expected.taskKey} proposal time`,
      ),
    };
  })();
  const result = task.result === null ? null : (() => {
    assertExactKeys(task.result, [
      "outcome", "resultSummary", "evidenceRefs", "sourceRevision", "resultRevision",
      "liveAnchor", "replacementText", "submittedBy", "submittedAt",
    ], `${expected.taskKey} result`);
    return {
      ...task.result,
      submittedBy: normalizeActor(task.result.submittedBy, memberIds),
      submittedAt: normalizeTimestamp(task.result.submittedAt, terminalAt, `${expected.taskKey} result time`),
    };
  })();
  const decision = task.decision === null ? null : (() => {
    assertExactKeys(task.decision, [
      "kind", "note", "decidedBy", "decidedAt", "decisionRevision", "resultRevision",
    ], `${expected.taskKey} decision`);
    return {
      ...task.decision,
      decidedBy: normalizeMember(task.decision.decidedBy, memberIds),
      decidedAt: normalizeTimestamp(task.decision.decidedAt, terminalAt, `${expected.taskKey} decision time`),
    };
  })();
  const normalizedTaskId = taskIds.get(task.taskId);
  const normalizedThreadId = threadIds.get(task.threadId);
  assert.ok(normalizedTaskId);
  assert.ok(normalizedThreadId);
  return {
    ...task,
    taskId: normalizedTaskId,
    threadId: normalizedThreadId,
    creator: normalizeMember(task.creator, memberIds),
    assignee: normalizeMember(task.assignee, memberIds),
    proposal,
    result,
    decision,
    createdAt: normalizeTimestamp(task.createdAt, expected.createdAt, `${expected.taskKey} creation time`),
    updatedAt: normalizeTimestamp(task.updatedAt, terminalAt, `${expected.taskKey} update time`),
    resolvedAt: task.resolvedAt === null
      ? null
      : normalizeTimestamp(task.resolvedAt, terminalAt, `${expected.taskKey} resolution time`),
  };
}

function expectedCompletedTask(task: GoldenTask): Record<string, unknown> {
  const agent = task.taskKey === "DATA-17"
    ? postmortemGolden.actors.dataAgent
    : task.taskKey === "LOG-22"
      ? postmortemGolden.actors.loggingAgent
      : postmortemGolden.actors.builderAgent;
  const result = hasSubmission(task) ? {
    outcome: task.submission.outcome,
    resultSummary: task.submission.resultSummary,
    evidenceRefs: task.submission.evidenceRefs,
    sourceRevision: task.submission.basedOnRevision,
    resultRevision: task.submission.resultRevision,
    liveAnchor: fullLiveAnchor(task, task.submission.liveAnchor),
    replacementText: task.submission.replacementText,
    submittedBy: agent,
    submittedAt: task.submission.submittedAt,
  } : null;
  const proposal = hasProposal(task) ? {
    replacementText: task.proposal.replacementText,
    resultSummary: task.proposal.resultSummary,
    evidenceRefs: task.proposal.evidenceRefs,
    sourceRevision: task.proposal.basedOnRevision,
    liveAnchor: fullLiveAnchor(task, task.anchorRebases.at(-1)!),
    proposedBy: agent,
    proposedAt: task.proposal.proposedAt,
  } : null;
  const decision = hasProposal(task) ? {
    kind: task.decision.kind,
    note: task.decision.note,
    decidedBy: goldenMemberById(task.decision.decidedByMemberId),
    decidedAt: task.decision.decidedAt,
    decisionRevision: task.decision.decisionRevision,
    resultRevision: task.decision.resultRevision,
  } : null;
  const terminalAt = hasSubmission(task)
    ? task.submission.submittedAt
    : (() => {
        assert.ok(hasProposal(task));
        return task.decision.decidedAt;
      })();
  return {
    taskId: task.taskId,
    taskKey: task.taskKey,
    title: task.title,
    category: task.category,
    instruction: task.instruction,
    agentLabel: task.agentLabel,
    mode: task.mode,
    status: task.finalStatus,
    creationAnchor: task.creationAnchor,
    anchor: finalAnchorFor(task),
    creator: goldenMemberById(task.creatorMemberId),
    assignee: goldenMemberById(task.assigneeMemberId),
    threadId: task.threadId,
    proposal,
    result,
    decision,
    createdAt: task.createdAt,
    updatedAt: terminalAt,
    resolvedAt: terminalAt,
  };
}

function normalizedComment(
  comment: IssueComment,
  expected: GoldenComment,
  memberIds: ReadonlyMap<string, string>,
  threadIds: ReadonlyMap<string, string>,
  commentIds: ReadonlyMap<string, string>,
): Record<string, unknown> {
  assertExactKeys(comment, [
    "commentId", "threadId", "replyToCommentId", "author", "origin", "body",
    "evidenceRefs", "createdAt",
  ], "comment");
  const commentId = commentIds.get(comment.commentId);
  const threadId = threadIds.get(comment.threadId);
  assert.ok(commentId);
  assert.ok(threadId);
  const replyToCommentId = comment.replyToCommentId === null
    ? null
    : commentIds.get(comment.replyToCommentId);
  assert.notEqual(replyToCommentId, undefined);
  return {
    ...comment,
    commentId,
    threadId,
    replyToCommentId,
    author: normalizeActor(comment.author, memberIds),
    createdAt: normalizeTimestamp(comment.createdAt, expected.createdAt, "comment time"),
  };
}

function expectedComment(comment: GoldenComment): Record<string, unknown> {
  return {
    commentId: comment.commentId,
    threadId: comment.threadId,
    replyToCommentId: comment.replyToCommentId,
    author: goldenActor(comment.authorActor),
    origin: comment.origin,
    body: comment.body,
    evidenceRefs: comment.evidenceRefs,
    createdAt: comment.createdAt,
  };
}

function expectedRevision(revision: GoldenRevision): Record<string, unknown> {
  const provenance = revision.provenance;
  return {
    revisionId: revision.revisionId,
    revision: revision.revision,
    parentRevision: revision.parentRevision,
    title: revision.title,
    body: revision.body,
    contentDigest: revision.contentDigest,
    diffs: revision.diffs,
    provenance: {
      authority: provenance.authority,
      origin: provenance.origin,
      authorOrigin: provenance.authorOrigin,
      taskId: provenance.taskId,
      sourceRevision: provenance.sourceRevision,
      author: goldenActor(provenance.authorActor),
      committer: goldenActor(provenance.committerActor),
      grantedBy: provenance.grantedByMemberId === null
        ? null
        : goldenMemberById(provenance.grantedByMemberId),
      approvedBy: provenance.approvedByMemberId === null
        ? null
        : goldenMemberById(provenance.approvedByMemberId),
      restoredRevision: provenance.restoredRevision,
    },
    changeSummary: revision.changeSummary,
    evidenceRefs: revision.evidenceRefs,
    createdAt: revision.createdAt,
  };
}

function revisionSummary(revision: IssueRevision): Omit<IssueRevision, "title" | "body"> {
  return {
    revisionId: revision.revisionId,
    revision: revision.revision,
    parentRevision: revision.parentRevision,
    contentDigest: revision.contentDigest,
    diffs: revision.diffs,
    provenance: revision.provenance,
    changeSummary: revision.changeSummary,
    evidenceRefs: revision.evidenceRefs,
    createdAt: revision.createdAt,
  };
}

function normalizedRevision(
  revision: IssueRevision,
  expected: GoldenRevision,
  memberIds: ReadonlyMap<string, string>,
  taskIds: ReadonlyMap<string, string>,
  revisionIds: ReadonlyMap<string, string>,
): Record<string, unknown> {
  assertExactKeys(revision, [
    "revisionId", "revision", "parentRevision", "title", "body", "contentDigest", "diffs",
    "provenance", "changeSummary", "evidenceRefs", "createdAt",
  ], `revision ${revision.revision}`);
  assertExactKeys(revision.provenance, [
    "authority", "origin", "authorOrigin", "taskId", "sourceRevision", "author", "committer",
    "grantedBy", "approvedBy", "restoredRevision",
  ], `revision ${revision.revision} provenance`);
  const revisionId = revisionIds.get(revision.revisionId);
  assert.ok(revisionId);
  const taskId = revision.provenance.taskId === null
    ? null
    : taskIds.get(revision.provenance.taskId);
  assert.notEqual(taskId, undefined);
  return {
    ...revision,
    revisionId,
    provenance: {
      ...revision.provenance,
      taskId,
      author: normalizeActor(revision.provenance.author, memberIds),
      committer: normalizeActor(revision.provenance.committer, memberIds),
      grantedBy: revision.provenance.grantedBy === null
        ? null
        : normalizeMember(revision.provenance.grantedBy, memberIds),
      approvedBy: revision.provenance.approvedBy === null
        ? null
        : normalizeMember(revision.provenance.approvedBy, memberIds),
    },
    createdAt: normalizeTimestamp(revision.createdAt, expected.createdAt, `revision ${revision.revision} time`),
  };
}

function assertStrictEventOrder(events: readonly { event: string; timestamp: string }[]): void {
  for (let index = 0; index < events.length; index += 1) {
    assertUtc(events[index]!.timestamp, events[index]!.event);
    if (index > 0) {
      assert.ok(
        Date.parse(events[index]!.timestamp) > Date.parse(events[index - 1]!.timestamp),
        `${events[index]!.event} must occur after ${events[index - 1]!.event}`,
      );
    }
  }
}

function assertNoCredentialFields(value: unknown, context: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCredentialFields(entry, `${context}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const forbidden = new Set([
    "shareToken", "humanSessionToken", "agentSessionToken", "sessionInstanceId",
    "bootstrapPath", "priyaBootstrapPath", "nadiaBootstrapPath", "leoBootstrapPath",
    "samBootstrapPath",
  ]);
  for (const [key, entry] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, `${context}.${key} must not expose a credential or bootstrap path`);
    assertNoCredentialFields(entry, `${context}.${key}`);
  }
}

function assertSecretsAbsent(value: unknown, secrets: readonly string[], context: string): void {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) {
    assert.equal(serialized.includes(secret), false, `${context} must not contain an issued secret`);
  }
}

function decodeBootstrapPath(path: string, expectedShareToken: string, label: string): IssueSessionBundle {
  const marker = "#ratiflow-bootstrap=";
  const markerIndex = path.indexOf(marker);
  assert.ok(markerIndex > 0, `${label} bootstrap path must have one fragment`);
  assert.equal(path.indexOf(marker, markerIndex + marker.length), -1, `${label} bootstrap path must have one bootstrap payload`);
  const pathname = path.slice(0, markerIndex);
  assert.equal(pathname === `/issue/${expectedShareToken}`, true, `${label} bootstrap path must use the reset share token`);
  const payload = path.slice(markerIndex + marker.length);
  assert.equal(BASE64URL.test(payload), true, `${label} bootstrap payload must be base64url`);
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    assert.fail(`${label} bootstrap payload must decode to JSON`);
  }
  assert.ok(decoded !== null && typeof decoded === "object" && !Array.isArray(decoded));
  assertExactKeys(decoded, [
    "shareToken", "humanSessionToken", "agentSessionToken", "sessionInstanceId",
    "selfMemberId", "expiresAt", "protocolVersion", "surface",
  ], `${label} bootstrap bundle`);
  return decoded as IssueSessionBundle;
}

test("public INC-482 example is normalized-exact to the independent completed golden", async () => {
  const startedAt = Date.parse("2026-09-02T00:00:00.000Z");
  const service = new LocalRepositoryService({ now: () => startedAt });
  const bundle = success(await service.launchExample({}));
  const surface = bundle.surface;

  assertExactKeys(bundle, [
    "shareToken", "humanSessionToken", "agentSessionToken", "sessionInstanceId",
    "selfMemberId", "expiresAt", "protocolVersion", "surface",
  ], "example session bundle");
  assert.equal(OPAQUE_TOKEN.test(bundle.shareToken), true);
  assert.equal(OPAQUE_TOKEN.test(bundle.humanSessionToken), true);
  assert.equal(OPAQUE_TOKEN.test(bundle.agentSessionToken), true);
  assert.match(bundle.sessionInstanceId, UUID);
  assert.equal(new Set([
    bundle.shareToken,
    bundle.humanSessionToken,
    bundle.agentSessionToken,
  ]).size, 3);
  assert.equal(bundle.protocolVersion, REPOSITORY_PROTOCOL_VERSION);
  assert.equal(Date.parse(bundle.expiresAt) - startedAt, ISSUE_WORKSPACE_TTL_MS);

  assertExactKeys(surface, [
    "document", "presence", "members", "tasks", "threads", "history", "hasMoreHistory",
  ], "completed example surface");
  assert.deepEqual(surface.presence, []);
  assert.equal(surface.hasMoreHistory, false);
  assert.deepEqual(surface.tasks.map((task) => task.taskKey), ["CODE-9", "LOG-22", "DATA-17"]);
  assert.deepEqual(surface.threads.map((thread) => thread.taskId && surface.tasks.find((task) => task.taskId === thread.taskId)?.taskKey), [
    "CODE-9", "LOG-22", "DATA-17",
  ]);

  const memberIds = memberIdNormalizer(surface);
  assert.equal(memberIds.get(bundle.selfMemberId), postmortemGolden.members.priya.memberId);
  assert.deepEqual(
    surface.members.map((member) => normalizeMember(member, memberIds))
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    Object.values(postmortemGolden.members)
      .slice()
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
  );

  const actualTasksByKey = new Map(surface.tasks.map((task) => [task.taskKey, task]));
  const taskIds = new Map<string, string>();
  const threadIds = new Map<string, string>();
  for (const expected of postmortemGolden.tasks) {
    const task = actualTasksByKey.get(expected.taskKey);
    assert.ok(task, `${expected.taskKey} must exist`);
    assert.match(task.taskId, UUID);
    assert.match(task.threadId, UUID);
    taskIds.set(task.taskId, expected.taskId);
    threadIds.set(task.threadId, expected.threadId);
  }
  assert.equal(taskIds.size, postmortemGolden.tasks.length);
  assert.equal(threadIds.size, postmortemGolden.tasks.length);
  assert.equal(new Set(surface.tasks.map((task) => task.taskId)).size, surface.tasks.length);
  assert.equal(new Set(surface.tasks.map((task) => task.threadId)).size, surface.tasks.length);

  for (const expected of postmortemGolden.tasks) {
    const task = actualTasksByKey.get(expected.taskKey)!;
    assert.deepEqual(
      normalizedTask(task, expected, memberIds, taskIds, threadIds),
      expectedCompletedTask(expected),
      `${expected.taskKey} must equal its completed golden task`,
    );
  }

  const actualComments = surface.threads.flatMap((thread) => thread.comments);
  assert.equal(actualComments.length, postmortemGolden.comments.length, "the example must have no extra comments");
  const commentsByBody = new Map(actualComments.map((comment) => [comment.body, comment]));
  const commentIds = new Map<string, string>();
  for (const expected of postmortemGolden.comments) {
    const comment = commentsByBody.get(expected.body);
    assert.ok(comment, "each golden comment must exist exactly once");
    assert.match(comment.commentId, UUID);
    commentIds.set(comment.commentId, expected.commentId);
  }
  assert.equal(commentIds.size, postmortemGolden.comments.length);

  const threadsByTaskKey = new Map(surface.threads.map((thread) => {
    const task = surface.tasks.find((candidate) => candidate.taskId === thread.taskId);
    assert.ok(task, "every completed example thread must be task-linked");
    return [task.taskKey, thread] as const;
  }));
  assert.equal(threadsByTaskKey.size, postmortemGolden.tasks.length);
  for (const expectedTask of postmortemGolden.tasks) {
    const thread = threadsByTaskKey.get(expectedTask.taskKey)!;
    assertExactKeys(thread, [
      "threadId", "taskId", "creationAnchor", "anchor", "status", "createdBy", "createdAt",
      "resolvedBy", "resolvedAt", "comments",
    ], `${expectedTask.taskKey} thread`);
    const expectedComments = postmortemGolden.comments.filter(
      (comment) => comment.threadId === expectedTask.threadId,
    );
    const normalizedComments = thread.comments.map((comment, index) =>
      normalizedComment(comment, expectedComments[index]!, memberIds, threadIds, commentIds));
    const terminalAt = hasSubmission(expectedTask)
      ? expectedTask.submission.submittedAt
      : (() => {
          assert.ok(hasProposal(expectedTask));
          return expectedTask.decision.decidedAt;
        })();
    const expectedResolver = expectedTask.mode === "DIRECT"
      ? goldenMemberById(expectedTask.assigneeMemberId)
      : goldenMemberById(expectedTask.creatorMemberId);
    assert.deepEqual({
      ...thread,
      threadId: threadIds.get(thread.threadId),
      taskId: thread.taskId === null ? null : taskIds.get(thread.taskId),
      createdBy: normalizeMember(thread.createdBy, memberIds),
      resolvedBy: thread.resolvedBy === null ? null : normalizeMember(thread.resolvedBy, memberIds),
      createdAt: normalizeTimestamp(thread.createdAt, expectedTask.createdAt, `${expectedTask.taskKey} thread creation`),
      resolvedAt: thread.resolvedAt === null
        ? null
        : normalizeTimestamp(thread.resolvedAt, terminalAt, `${expectedTask.taskKey} thread resolution`),
      comments: normalizedComments,
    }, {
      threadId: expectedTask.threadId,
      taskId: expectedTask.taskId,
      creationAnchor: expectedTask.creationAnchor,
      anchor: finalAnchorFor(expectedTask),
      status: "RESOLVED",
      createdBy: goldenMemberById(expectedTask.creatorMemberId),
      createdAt: expectedTask.createdAt,
      resolvedBy: expectedResolver,
      resolvedAt: terminalAt,
      comments: expectedComments.map(expectedComment),
    });
  }

  const revisions = await Promise.all(postmortemGolden.revisions.map((revision) =>
    service.readRevision(bundle.humanSessionToken, revision.revision).then(success)));
  const revisionIds = new Map(revisions.map((revision, index) => {
    assert.match(revision.revisionId, UUID);
    return [revision.revisionId, postmortemGolden.revisions[index]!.revisionId] as const;
  }));
  assert.equal(revisionIds.size, postmortemGolden.revisions.length);
  for (let index = 0; index < revisions.length; index += 1) {
    assert.deepEqual(
      normalizedRevision(revisions[index]!, postmortemGolden.revisions[index]!, memberIds, taskIds, revisionIds),
      expectedRevision(postmortemGolden.revisions[index]!),
    );
  }

  assert.equal(surface.history.length, postmortemGolden.revisions.length);
  for (let index = 0; index < surface.history.length; index += 1) {
    const expected = postmortemGolden.revisions.toReversed()[index]!;
    const full = revisions.find((revision) => revision.revision === expected.revision)!;
    assert.deepEqual(surface.history[index], revisionSummary(full));
  }

  const finalRevision = postmortemGolden.revisions.at(-1)!;
  assertExactKeys(surface.document, [
    "id", "protocolVersion", "kind", "title", "body", "revision", "activityVersion",
    "updatedAt", "lastRevision",
  ], "completed example document");
  assertExactKeys(surface.document.lastRevision, ["revisionId", "author", "authority", "summary"], "last revision marker");
  assert.deepEqual({
    ...surface.document,
    id: postmortemGolden.document.id,
    updatedAt: normalizeTimestamp(surface.document.updatedAt, finalRevision.createdAt, "document update time"),
    lastRevision: {
      ...surface.document.lastRevision,
      revisionId: revisionIds.get(surface.document.lastRevision.revisionId),
      author: normalizeActor(surface.document.lastRevision.author, memberIds),
    },
  }, {
    id: postmortemGolden.document.id,
    protocolVersion: postmortemGolden.protocolVersion,
    kind: postmortemGolden.document.kind,
    title: postmortemGolden.document.title,
    body: finalRevision.body,
    revision: postmortemGolden.document.finalRevision,
    activityVersion: postmortemGolden.document.finalActivityVersion,
    updatedAt: finalRevision.createdAt,
    lastRevision: {
      revisionId: finalRevision.revisionId,
      author: postmortemGolden.actors.builderAgent,
      authority: finalRevision.provenance.authority,
      summary: finalRevision.changeSummary,
    },
  });

  const dataTask = actualTasksByKey.get("DATA-17")!;
  const logTask = actualTasksByKey.get("LOG-22")!;
  const codeTask = actualTasksByKey.get("CODE-9")!;
  assert.ok(dataTask.result && dataTask.result.outcome === "COMMITTED");
  assert.ok(logTask.result && logTask.result.outcome === "COMMITTED");
  assert.ok(codeTask.proposal && codeTask.decision);
  const codeComments = threadsByTaskKey.get("CODE-9")!.comments;
  const events = [
    { event: "launch", timestamp: revisions[0]!.createdAt, revision: 1, activityVersion: 1 },
    { event: "create DATA-17", timestamp: dataTask.createdAt, revision: 1, activityVersion: 2 },
    { event: "create LOG-22", timestamp: logTask.createdAt, revision: 1, activityVersion: 3 },
    { event: "create CODE-9", timestamp: codeTask.createdAt, revision: 1, activityVersion: 4 },
    { event: "DATA-17 direct result", timestamp: dataTask.result.submittedAt, revision: 2, activityVersion: 5 },
    { event: "LOG-22 direct result rebased from r1", timestamp: logTask.result.submittedAt, revision: 3, activityVersion: 6 },
    { event: "CODE-9 review proposal based on r1", timestamp: codeTask.proposal.proposedAt, revision: 3, activityVersion: 7 },
    { event: "Priya comments on CODE-9", timestamp: codeComments[0]!.createdAt, revision: 3, activityVersion: 8 },
    { event: "Builder agent replies on CODE-9", timestamp: codeComments[1]!.createdAt, revision: 3, activityVersion: 9 },
    { event: "Priya accepts CODE-9", timestamp: codeTask.decision.decidedAt, revision: 4, activityVersion: 10 },
  ];
  assertStrictEventOrder(events);
  assert.deepEqual(
    events.map(({ event, revision, activityVersion }) => ({ event, revision, activityVersion })),
    postmortemGolden.counterLedger,
  );
  assert.equal(surface.document.activityVersion, events.length);
  assert.equal(dataTask.result.submittedAt, revisions[1]!.createdAt);
  assert.equal(logTask.result.submittedAt, revisions[2]!.createdAt);
  assert.equal(codeTask.decision.decidedAt, revisions[3]!.createdAt);
  assert.equal(dataTask.updatedAt, dataTask.resolvedAt);
  assert.equal(logTask.updatedAt, logTask.resolvedAt);
  assert.equal(codeTask.updatedAt, codeTask.resolvedAt);
  assert.equal(surface.document.updatedAt, revisions[3]!.createdAt);
  assert.equal(actorKey(revisions[3]!.provenance.author, memberIds), "builderAgent");
  assert.equal(actorKey(revisions[3]!.provenance.committer, memberIds), "priya");

  assertNoCredentialFields(surface, "example surface");
  assertSecretsAbsent(surface, [
    bundle.shareToken,
    bundle.humanSessionToken,
    bundle.agentSessionToken,
    bundle.sessionInstanceId,
  ], "example surface");
});

test("protected reset yields four unique resumable identities and the exact r1/av4 open graph", async () => {
  let now = Date.parse("2026-09-02T01:00:00.000Z");
  const startedAt = now;
  const service = new LocalRepositoryService({ now: () => now });
  const reset = success(await service.resetPostmortemHero());

  assertExactKeys(reset, [
    "fixtureVersion", "shareToken", "priyaBootstrapPath", "nadiaBootstrapPath",
    "leoBootstrapPath", "samBootstrapPath", "expiresAt", "revision", "activityVersion",
  ], "reset outcome");
  assert.equal(reset.fixtureVersion, postmortemGolden.fixtureVersion);
  assert.equal(OPAQUE_TOKEN.test(reset.shareToken), true);
  assert.equal(reset.revision, 1);
  assert.equal(reset.activityVersion, 4);
  assert.equal(Date.parse(reset.expiresAt) - startedAt, ISSUE_WORKSPACE_TTL_MS);

  const paths = {
    priya: reset.priyaBootstrapPath,
    nadia: reset.nadiaBootstrapPath,
    leo: reset.leoBootstrapPath,
    sam: reset.samBootstrapPath,
  } as const;
  assert.equal(new Set(Object.values(paths).map(secretDigest)).size, 4, "all bootstrap paths must be unique");
  const bundles = Object.fromEntries(Object.entries(paths).map(([label, path]) => [
    label,
    decodeBootstrapPath(path, reset.shareToken, label),
  ])) as Record<keyof typeof paths, IssueSessionBundle>;

  const expectedMembers = {
    priya: postmortemGolden.members.priya,
    nadia: postmortemGolden.members.nadia,
    leo: postmortemGolden.members.leo,
    sam: postmortemGolden.members.sam,
  } as const;
  const issuedCredentials: string[] = [reset.shareToken];
  const sessionInstances: string[] = [];
  for (const label of Object.keys(bundles) as (keyof typeof bundles)[]) {
    const bundle = bundles[label];
    assert.equal(bundle.shareToken === reset.shareToken, true, `${label} must resume the reset issue`);
    assert.equal(bundle.selfMemberId, expectedMembers[label].memberId);
    assert.equal(bundle.protocolVersion, postmortemGolden.protocolVersion);
    assert.equal(bundle.expiresAt, reset.expiresAt);
    assert.equal(OPAQUE_TOKEN.test(bundle.humanSessionToken), true);
    assert.equal(OPAQUE_TOKEN.test(bundle.agentSessionToken), true);
    assert.match(bundle.sessionInstanceId, UUID);
    assert.notEqual(secretDigest(bundle.humanSessionToken), secretDigest(bundle.agentSessionToken));
    issuedCredentials.push(bundle.humanSessionToken, bundle.agentSessionToken);
    sessionInstances.push(bundle.sessionInstanceId);
    assert.deepEqual(bundle.surface, bundles.priya.surface, `${label} must resume the same r1/av4 graph`);
  }
  assert.equal(new Set(issuedCredentials.map(secretDigest)).size, issuedCredentials.length, "all issued bearer credentials must be unique");
  assert.equal(new Set(sessionInstances).size, 4, "all resumed browser sessions must be distinct");

  const surface = bundles.priya.surface;
  assert.deepEqual(surface.presence, []);
  assert.equal(surface.hasMoreHistory, false);
  assert.equal(surface.document.id, postmortemGolden.document.id);
  assert.equal(surface.document.protocolVersion, postmortemGolden.protocolVersion);
  assert.equal(surface.document.kind, postmortemGolden.document.kind);
  assert.equal(surface.document.title, postmortemGolden.document.title);
  assert.equal(surface.document.body, postmortemGolden.revisions[0].body);
  assert.equal(surface.document.revision, 1);
  assert.equal(surface.document.activityVersion, 4);
  assert.equal(surface.document.lastRevision.revisionId, postmortemGolden.revisions[0].revisionId);
  assert.deepEqual(surface.document.lastRevision.author, postmortemGolden.actors.priya);
  assert.equal(surface.document.lastRevision.authority, "HUMAN");
  assert.equal(surface.document.lastRevision.summary, postmortemGolden.revisions[0].changeSummary);
  normalizeTimestamp(
    surface.document.updatedAt,
    postmortemGolden.tasks[2].createdAt,
    "reset document activity time",
  );

  const memberIds = memberIdNormalizer(surface);
  assert.deepEqual(
    surface.members.map((member) => normalizeMember(member, memberIds))
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    Object.values(postmortemGolden.members)
      .slice()
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
  );
  assert.deepEqual(surface.tasks.map((task) => task.taskKey), ["CODE-9", "LOG-22", "DATA-17"]);
  assert.equal(surface.tasks.length, postmortemGolden.tasks.length);
  assert.equal(surface.threads.length, postmortemGolden.tasks.length);

  const resetTasks = new Map(surface.tasks.map((task) => [task.taskKey, task]));
  for (const expected of postmortemGolden.tasks) {
    const task = resetTasks.get(expected.taskKey);
    assert.ok(task);
    assertExactKeys(task, [
      "taskId", "taskKey", "title", "category", "instruction", "agentLabel", "mode",
      "status", "creationAnchor", "anchor", "creator", "assignee", "threadId", "proposal",
      "result", "decision", "createdAt", "updatedAt", "resolvedAt",
    ], `reset ${expected.taskKey}`);
    assert.deepEqual({
      ...task,
      createdAt: normalizeTimestamp(task.createdAt, expected.createdAt, `reset ${expected.taskKey} creation`),
      updatedAt: normalizeTimestamp(task.updatedAt, expected.createdAt, `reset ${expected.taskKey} update`),
    }, {
      taskId: expected.taskId,
      taskKey: expected.taskKey,
      title: expected.title,
      category: expected.category,
      instruction: expected.instruction,
      agentLabel: expected.agentLabel,
      mode: expected.mode,
      status: "OPEN",
      creationAnchor: expected.creationAnchor,
      anchor: expected.creationAnchor,
      creator: goldenMemberById(expected.creatorMemberId),
      assignee: goldenMemberById(expected.assigneeMemberId),
      threadId: expected.threadId,
      proposal: null,
      result: null,
      decision: null,
      createdAt: expected.createdAt,
      updatedAt: expected.createdAt,
      resolvedAt: null,
    });
    const thread = surface.threads.find((candidate) => candidate.threadId === expected.threadId);
    assert.ok(thread);
    assert.deepEqual({
      ...thread,
      createdAt: normalizeTimestamp(thread.createdAt, expected.createdAt, `reset ${expected.taskKey} thread creation`),
    }, {
      threadId: expected.threadId,
      taskId: expected.taskId,
      creationAnchor: expected.creationAnchor,
      anchor: expected.creationAnchor,
      status: "OPEN",
      createdBy: goldenMemberById(expected.creatorMemberId),
      createdAt: expected.createdAt,
      resolvedBy: null,
      resolvedAt: null,
      comments: [],
    });
  }

  const resetR1 = success(await service.readRevision(bundles.priya.humanSessionToken, 1));
  const resetRevisionIds = new Map([[resetR1.revisionId, postmortemGolden.revisions[0].revisionId]]);
  const resetTaskIds = new Map(surface.tasks.map((task) => {
    const expected = postmortemGolden.tasks.find((candidate) => candidate.taskKey === task.taskKey)!;
    return [task.taskId, expected.taskId] as const;
  }));
  assert.deepEqual(
    normalizedRevision(resetR1, postmortemGolden.revisions[0], memberIds, resetTaskIds, resetRevisionIds),
    expectedRevision(postmortemGolden.revisions[0]),
  );
  assert.deepEqual(surface.history, [revisionSummary(resetR1)]);

  const ownership = {
    priya: [] as string[],
    nadia: ["DATA-17"],
    leo: ["LOG-22"],
    sam: ["CODE-9"],
  } as const;
  const publicOutputs: unknown[] = [];
  for (const label of Object.keys(bundles) as (keyof typeof bundles)[]) {
    const bundle = bundles[label];
    const inspected = await service.inspect(bundle.humanSessionToken);
    const history = await service.readHistory(bundle.humanSessionToken, { limit: 50 });
    const revision = await service.readRevision(bundle.humanSessionToken, 1);
    const assigned = await service.listMyTasks(
      bundle.agentSessionToken,
      { includeResolved: true },
      bundle.sessionInstanceId,
    );
    publicOutputs.push(inspected, history, revision, assigned);
    assert.deepEqual(success(assigned).tasks.map((view) => view.task.taskKey), ownership[label]);
    assert.deepEqual(success(assigned).tasks.map((view) => view.thread.taskId), success(assigned).tasks.map((view) => view.task.taskId));
    assert.equal(success(inspected).document.revision, 1);
    assert.equal(success(history).currentRevision, 1);
    assert.equal(success(history).currentActivityVersion, 4);
  }
  assertNoCredentialFields(publicOutputs, "reset public API output");
  assertSecretsAbsent(publicOutputs, [
    ...issuedCredentials,
    ...sessionInstances,
    ...Object.values(paths),
  ], "reset public API output");

  const replacementReset = success(await service.resetPostmortemHero());
  assert.notEqual(secretDigest(replacementReset.shareToken), secretDigest(reset.shareToken));
  for (const bundle of Object.values(bundles)) {
    assertFailureCode(await service.inspect(bundle.humanSessionToken), "UNAUTHORIZED");
  }
  const replacementPriya = decodeBootstrapPath(
    replacementReset.priyaBootstrapPath,
    replacementReset.shareToken,
    "replacement Priya",
  );
  assert.equal(success(await service.inspect(replacementPriya.humanSessionToken)).document.activityVersion, 4);

  now += ISSUE_WORKSPACE_TTL_MS;
  assertFailureCode(await service.inspect(replacementPriya.humanSessionToken), "UNAUTHORIZED");
  assertFailureCode(await service.listMyTasks(
    replacementPriya.agentSessionToken,
    { includeResolved: true },
    replacementPriya.sessionInstanceId,
  ), "UNAUTHORIZED");
});
