import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "vitest";

import type {
  IssueRevision,
  IssueRevisionSummary,
  IssueSessionBundle,
  RepositoryResult,
} from "@/repository/contracts";
import {
  PRODUCT_DOCUMENT_TEMPLATE_BODY,
  PRODUCT_DOCUMENT_TEMPLATE_TITLE,
} from "@/repository/contracts";
import { LocalRepositoryService } from "./repository-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function exactKeys(value: object, expected: readonly string[], context: string): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${context} keys`);
}

function pointLength(value: string): number {
  return Array.from(value).length;
}

function contentDigest(title: string, body: string): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ title, body }), "utf8")
    .digest("hex")}`;
}

function revisionSummary(revision: IssueRevision): IssueRevisionSummary {
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

function decodeBootstrap(path: string): IssueSessionBundle {
  const marker = "#ratiflow-bootstrap=";
  const markerIndex = path.indexOf(marker);
  assert.notEqual(markerIndex, -1, "bootstrap path must contain an encoded bundle");
  const encoded = path.slice(markerIndex + marker.length);
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as IssueSessionBundle;
}

test("D02/D03: Human Save and Restore append exact reconstructable revision records", async () => {
  const epoch = Date.parse("2026-09-02T02:00:00.000Z");
  const service = new LocalRepositoryService({ now: () => epoch });
  const owner = success(await service.launch({
    kind: "PRODUCT_DOCUMENT",
    displayName: "Priya Shah",
  }));
  const priya = {
    actorType: "HUMAN" as const,
    displayName: "Priya Shah",
    member: {
      memberId: owner.selfMemberId,
      displayName: "Priya Shah",
    },
    agentLabel: null,
  };

  const initial = success(await service.readRevision(owner.humanSessionToken, 1));
  assert.equal(initial.title, PRODUCT_DOCUMENT_TEMPLATE_TITLE);
  assert.equal(initial.body, PRODUCT_DOCUMENT_TEMPLATE_BODY);

  const saveSummary = "Replace the template with the reviewed short form.";
  const savedSurface = success(await service.saveHumanRevision(
    owner.humanSessionToken,
    {
      requestId: randomUUID(),
      expectedRevision: 1,
      title: "X",
      body: "Y",
      changeSummary: saveSummary,
    },
  ));
  const saved = success(await service.readRevision(owner.humanSessionToken, 2));
  exactKeys(saved, [
    "revisionId", "revision", "parentRevision", "title", "body", "contentDigest",
    "diffs", "provenance", "changeSummary", "evidenceRefs", "createdAt",
  ], "saved revision");
  assert.match(saved.revisionId, UUID);
  assert.deepEqual(saved, {
    revisionId: saved.revisionId,
    revision: 2,
    parentRevision: 1,
    title: "X",
    body: "Y",
    contentDigest: contentDigest("X", "Y"),
    diffs: [
      {
        field: "TITLE",
        rangeStart: 0,
        rangeEnd: pointLength(PRODUCT_DOCUMENT_TEMPLATE_TITLE),
        before: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
        after: "X",
      },
      {
        field: "BODY",
        rangeStart: 0,
        rangeEnd: pointLength(PRODUCT_DOCUMENT_TEMPLATE_BODY),
        before: PRODUCT_DOCUMENT_TEMPLATE_BODY,
        after: "Y",
      },
    ],
    provenance: {
      authority: "HUMAN",
      origin: "ORDINARY_UI",
      authorOrigin: "ORDINARY_UI",
      taskId: null,
      sourceRevision: 1,
      author: priya,
      committer: priya,
      grantedBy: null,
      approvedBy: null,
      restoredRevision: null,
    },
    changeSummary: saveSummary,
    evidenceRefs: [],
    createdAt: "2026-09-02T02:00:00.001Z",
  });
  assert.deepEqual(savedSurface.document.lastRevision, {
    revisionId: saved.revisionId,
    author: priya,
    authority: "HUMAN",
    summary: saveSummary,
  });
  assert.equal(savedSurface.document.updatedAt, saved.createdAt);

  const restoreSummary = "Restore the complete launch snapshot.";
  const restoredSurface = success(await service.restoreRevision(
    owner.humanSessionToken,
    {
      requestId: randomUUID(),
      expectedRevision: 2,
      revision: 1,
      changeSummary: restoreSummary,
    },
  ));
  const restored = success(await service.readRevision(owner.humanSessionToken, 3));
  exactKeys(restored, [
    "revisionId", "revision", "parentRevision", "title", "body", "contentDigest",
    "diffs", "provenance", "changeSummary", "evidenceRefs", "createdAt",
  ], "restore revision");
  assert.match(restored.revisionId, UUID);
  assert.notEqual(restored.revisionId, initial.revisionId);
  assert.notEqual(restored.revisionId, saved.revisionId);
  assert.deepEqual(restored, {
    revisionId: restored.revisionId,
    revision: 3,
    parentRevision: 2,
    title: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
    body: PRODUCT_DOCUMENT_TEMPLATE_BODY,
    contentDigest: contentDigest(
      PRODUCT_DOCUMENT_TEMPLATE_TITLE,
      PRODUCT_DOCUMENT_TEMPLATE_BODY,
    ),
    diffs: [
      {
        field: "TITLE",
        rangeStart: 0,
        rangeEnd: 1,
        before: "X",
        after: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
      },
      {
        field: "BODY",
        rangeStart: 0,
        rangeEnd: 1,
        before: "Y",
        after: PRODUCT_DOCUMENT_TEMPLATE_BODY,
      },
    ],
    provenance: {
      authority: "RESTORE",
      origin: "ORDINARY_UI",
      authorOrigin: "ORDINARY_UI",
      taskId: null,
      sourceRevision: 1,
      author: priya,
      committer: priya,
      grantedBy: null,
      approvedBy: null,
      restoredRevision: 1,
    },
    changeSummary: restoreSummary,
    evidenceRefs: [],
    createdAt: "2026-09-02T02:00:00.002Z",
  });

  const history = success(await service.readHistory(
    owner.humanSessionToken,
    { limit: 50 },
  ));
  assert.deepEqual(history, {
    revisions: [revisionSummary(restored), revisionSummary(saved), revisionSummary(initial)],
    hasMoreOlder: false,
    nextBeforeRevision: null,
    currentRevision: 3,
    currentActivityVersion: 3,
  });
  assert.deepEqual(
    [
      success(await service.readRevision(owner.humanSessionToken, 1)),
      success(await service.readRevision(owner.humanSessionToken, 2)),
      success(await service.readRevision(owner.humanSessionToken, 3)),
    ].map(({ revision, parentRevision, title, body, contentDigest: digest }) => ({
      revision,
      parentRevision,
      title,
      body,
      digest,
    })),
    [
      {
        revision: 1,
        parentRevision: null,
        title: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
        body: PRODUCT_DOCUMENT_TEMPLATE_BODY,
        digest: contentDigest(PRODUCT_DOCUMENT_TEMPLATE_TITLE, PRODUCT_DOCUMENT_TEMPLATE_BODY),
      },
      { revision: 2, parentRevision: 1, title: "X", body: "Y", digest: contentDigest("X", "Y") },
      {
        revision: 3,
        parentRevision: 2,
        title: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
        body: PRODUCT_DOCUMENT_TEMPLATE_BODY,
        digest: contentDigest(PRODUCT_DOCUMENT_TEMPLATE_TITLE, PRODUCT_DOCUMENT_TEMPLATE_BODY),
      },
    ],
  );
  assert.equal(restoredSurface.document.revision, 3);
  assert.equal(restoredSurface.document.title, PRODUCT_DOCUMENT_TEMPLATE_TITLE);
  assert.equal(restoredSurface.document.body, PRODUCT_DOCUMENT_TEMPLATE_BODY);
  assert.deepEqual(restoredSurface.document.lastRevision, {
    revisionId: restored.revisionId,
    author: priya,
    authority: "RESTORE",
    summary: restoreSummary,
  });
  assert.equal(restoredSurface.document.updatedAt, restored.createdAt);
});

test("D11: Comment mode appends its finding in oldest-first order and never creates a document revision", async () => {
  const epoch = Date.parse("2026-09-02T03:00:00.000Z");
  const service = new LocalRepositoryService({ now: () => epoch });
  const owner = success(await service.launch({
    kind: "POSTMORTEM",
    displayName: "Priya Shah",
  }));
  const worker = success(await service.join({
    shareToken: owner.shareToken,
    displayName: "Nadia Chen",
  }));
  const original = success(await service.readRevision(owner.humanSessionToken, 1));
  const created = success(await service.createTask(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Check charge integrity",
    category: "DATA",
    instruction: "Report whether the source contains evidence of duplicate charges.",
    agentLabel: "Data agent",
    mode: "COMMENT",
    assignedToMemberId: worker.selfMemberId,
    anchor: { scope: "DOCUMENT" },
  }));
  const task = created.tasks.find((candidate) => candidate.title === "Check charge integrity");
  assert.ok(task);
  const withQuestion = success(await service.addHumanComment(owner.humanSessionToken, {
    requestId: randomUUID(),
    threadId: task.threadId,
    body: "Please state the evidence boundary explicitly.",
    evidenceRefs: ["analysis-brief.md"],
  }));
  const question = withQuestion.threads
    .find((thread) => thread.threadId === task.threadId)?.comments[0];
  assert.ok(question);

  const finding = "No duplicate charges were observed in the supplied impact extract.";
  const submitted = success(await service.submitTaskResult(
    worker.agentSessionToken,
    {
      requestId: randomUUID(),
      taskId: task.taskId,
      basedOnRevision: 1,
      resultSummary: finding,
      evidenceRefs: ["impact.csv"],
    },
    worker.sessionInstanceId,
  ));
  assert.equal(submitted.outcome, "COMMENTED");
  assert.equal(submitted.revision, 1);
  assert.equal(submitted.activityVersion, 4);
  assert.equal(submitted.task.status, "COMPLETED");
  assert.equal(submitted.task.mode, "COMMENT");
  assert.deepEqual(submitted.task.result, {
    outcome: "COMMENTED",
    resultSummary: finding,
    evidenceRefs: ["impact.csv"],
    sourceRevision: 1,
    resultRevision: 1,
    liveAnchor: {
      scope: "DOCUMENT",
      field: null,
      rangeStart: null,
      rangeEnd: null,
      selectedText: null,
      createdRevision: 1,
      anchorRevision: 1,
      anchorState: "ACTIVE",
    },
    replacementText: null,
    submittedBy: {
      actorType: "AGENT",
      displayName: "Data agent",
      member: { memberId: worker.selfMemberId, displayName: "Nadia Chen" },
      agentLabel: "Data agent",
    },
    submittedAt: "2026-09-02T03:00:00.003Z",
  });
  assert.equal(submitted.task.updatedAt, "2026-09-02T03:00:00.003Z");
  assert.equal(submitted.task.resolvedAt, "2026-09-02T03:00:00.003Z");

  const after = success(await service.inspect(owner.humanSessionToken));
  assert.equal(after.document.revision, 1);
  assert.equal(after.document.title, original.title);
  assert.equal(after.document.body, original.body);
  assert.deepEqual(after.document.lastRevision, owner.surface.document.lastRevision);
  assert.deepEqual(
    success(await service.readRevision(owner.humanSessionToken, 1)),
    original,
  );
  const history = success(await service.readHistory(owner.humanSessionToken, { limit: 50 }));
  assert.equal(history.currentRevision, 1);
  assert.deepEqual(history.revisions, [revisionSummary(original)]);

  const thread = after.threads.find((candidate) => candidate.threadId === task.threadId);
  assert.ok(thread);
  assert.equal(thread.status, "RESOLVED");
  assert.deepEqual(thread.resolvedBy, {
    memberId: worker.selfMemberId,
    displayName: "Nadia Chen",
  });
  assert.equal(thread.resolvedAt, "2026-09-02T03:00:00.003Z");
  assert.equal(thread.comments.length, 2);
  assert.deepEqual(thread.comments.map((comment) => comment.body), [
    "Please state the evidence boundary explicitly.",
    finding,
  ]);
  assert.deepEqual(thread.comments[0], question);
  exactKeys(thread.comments[1]!, [
    "commentId", "threadId", "replyToCommentId", "author", "origin", "body",
    "evidenceRefs", "createdAt",
  ], "Comment task finding");
  assert.match(thread.comments[1]!.commentId, UUID);
  assert.deepEqual(thread.comments[1], {
    commentId: thread.comments[1]!.commentId,
    threadId: task.threadId,
    replyToCommentId: null,
    author: {
      actorType: "AGENT",
      displayName: "Data agent",
      member: { memberId: worker.selfMemberId, displayName: "Nadia Chen" },
      agentLabel: "Data agent",
    },
    origin: "WEBMCP",
    body: finding,
    evidenceRefs: ["impact.csv"],
    createdAt: "2026-09-02T03:00:00.003Z",
  });
});

test("D17: completed CODE-9 and its complete discussion remain visible only to Sam's paired agent", async () => {
  const epoch = Date.parse("2026-09-02T04:00:00.000Z");
  const service = new LocalRepositoryService({ now: () => epoch });
  const reset = success(await service.resetPostmortemHero());
  const priya = decodeBootstrap(reset.priyaBootstrapPath);
  const nadia = decodeBootstrap(reset.nadiaBootstrapPath);
  const leo = decodeBootstrap(reset.leoBootstrapPath);
  const sam = decodeBootstrap(reset.samBootstrapPath);
  const codeTask = priya.surface.tasks.find((task) => task.taskKey === "CODE-9");
  assert.ok(codeTask);

  const resultSummary = "Separated the provider trigger from the retry regression that sustained the outage.";
  const replacementText = "Provider throttling triggered the incident. Retry middleware introduced in 7d3c9e1 ignored Retry-After and made up to five immediate retries, amplifying provider 429 responses into queue exhaustion. The retry regression—not provider latency alone—was the root cause of the sustained checkout failure.";
  const proposal = success(await service.submitTaskResult(
    sam.agentSessionToken,
    {
      requestId: randomUUID(),
      taskId: codeTask.taskId,
      basedOnRevision: 1,
      resultSummary,
      replacementText,
      evidenceRefs: ["commit:7d3c9e1", "checkout.log"],
    },
    sam.sessionInstanceId,
  ));
  assert.equal(proposal.outcome, "PROPOSED");

  const questionBody = "Provider throttling happened first. Are we overclaiming our code as the root cause?";
  const questioned = success(await service.addHumanComment(priya.humanSessionToken, {
    requestId: randomUUID(),
    threadId: codeTask.threadId,
    body: questionBody,
  }));
  const question = questioned.threads
    .find((thread) => thread.threadId === codeTask.threadId)?.comments[0];
  assert.ok(question);

  const replyBody = "The logs show 429s as the trigger, but commit 7d3c9e1 ignored Retry-After and issued up to five zero-delay retries. That raised retry traffic to 5.8× and the queue from 420 to 18,240, so the code regression explains why throttling became a 38-minute outage.";
  const reply = success(await service.commentOnTask(
    sam.agentSessionToken,
    {
      requestId: randomUUID(),
      taskId: codeTask.taskId,
      replyToCommentId: question.commentId,
      body: replyBody,
      evidenceRefs: ["checkout.log", "commit:7d3c9e1"],
    },
    sam.sessionInstanceId,
  ));

  const accepted = success(await service.acceptTaskProposal(priya.humanSessionToken, {
    requestId: randomUUID(),
    taskId: codeTask.taskId,
    expectedRevision: 1,
    note: "Accepted after separating the external trigger from the internal retry amplifier.",
  }));
  assert.equal(accepted.document.revision, 2);

  const defaultSamList = success(await service.listMyTasks(
    sam.agentSessionToken,
    {},
    sam.sessionInstanceId,
  ));
  assert.deepEqual(defaultSamList.tasks, []);
  const samList = success(await service.listMyTasks(
    sam.agentSessionToken,
    { includeResolved: true },
    sam.sessionInstanceId,
  ));
  assert.equal(samList.revision, 2);
  assert.equal(samList.activityVersion, 8);
  assert.equal(samList.tasks.length, 1);
  const returned = samList.tasks[0]!;
  assert.equal(returned.task.taskKey, "CODE-9");
  assert.equal(returned.task.taskId, codeTask.taskId);
  assert.equal(returned.task.assignee.memberId, sam.selfMemberId);
  assert.equal(returned.task.status, "COMPLETED");
  assert.equal(returned.task.mode, "REVIEW");
  assert.equal(returned.task.result, null);
  assert.deepEqual(returned.task.proposal, {
    replacementText,
    resultSummary,
    evidenceRefs: ["commit:7d3c9e1", "checkout.log"],
    sourceRevision: 1,
    liveAnchor: codeTask.anchor,
    proposedBy: {
      actorType: "AGENT",
      displayName: "Builder agent",
      member: { memberId: sam.selfMemberId, displayName: "Sam Rivera" },
      agentLabel: "Builder agent",
    },
    proposedAt: "2026-09-02T04:00:00.004Z",
  });
  assert.deepEqual(returned.task.decision, {
    kind: "ACCEPTED",
    note: "Accepted after separating the external trigger from the internal retry amplifier.",
    decidedBy: { memberId: priya.selfMemberId, displayName: "Priya Shah" },
    decidedAt: "2026-09-02T04:00:00.007Z",
    decisionRevision: 1,
    resultRevision: 2,
  });
  assert.equal(returned.task.resolvedAt, "2026-09-02T04:00:00.007Z");

  exactKeys(returned.thread, [
    "threadId", "taskId", "creationAnchor", "anchor", "status", "createdBy",
    "createdAt", "resolvedBy", "resolvedAt", "comments",
  ], "CODE-9 thread");
  assert.equal(returned.thread.threadId, codeTask.threadId);
  assert.equal(returned.thread.taskId, codeTask.taskId);
  assert.equal(returned.thread.status, "RESOLVED");
  assert.deepEqual(returned.thread.resolvedBy, {
    memberId: priya.selfMemberId,
    displayName: "Priya Shah",
  });
  assert.equal(returned.thread.resolvedAt, "2026-09-02T04:00:00.007Z");
  assert.equal(returned.thread.comments.length, 2);
  exactKeys(returned.thread.comments[0]!, [
    "commentId", "threadId", "replyToCommentId", "author", "origin", "body",
    "evidenceRefs", "createdAt",
  ], "Priya CODE-9 question");
  exactKeys(returned.thread.comments[1]!, [
    "commentId", "threadId", "replyToCommentId", "author", "origin", "body",
    "evidenceRefs", "createdAt",
  ], "Builder CODE-9 reply");
  assert.match(returned.thread.comments[0]!.commentId, UUID);
  assert.match(returned.thread.comments[1]!.commentId, UUID);
  assert.deepEqual(returned.thread.comments[0], {
    commentId: question.commentId,
    threadId: codeTask.threadId,
    replyToCommentId: null,
    author: {
      actorType: "HUMAN",
      displayName: "Priya Shah",
      member: { memberId: priya.selfMemberId, displayName: "Priya Shah" },
      agentLabel: null,
    },
    origin: "ORDINARY_UI",
    body: questionBody,
    evidenceRefs: [],
    createdAt: "2026-09-02T04:00:00.005Z",
  });
  assert.deepEqual(returned.thread.comments[1], {
    commentId: reply.comment.commentId,
    threadId: codeTask.threadId,
    replyToCommentId: question.commentId,
    author: {
      actorType: "AGENT",
      displayName: "Builder agent",
      member: { memberId: sam.selfMemberId, displayName: "Sam Rivera" },
      agentLabel: "Builder agent",
    },
    origin: "WEBMCP",
    body: replyBody,
    evidenceRefs: ["checkout.log", "commit:7d3c9e1"],
    createdAt: "2026-09-02T04:00:00.006Z",
  });
  assert.deepEqual(returned.thread.comments.map((comment) => comment.body), [
    questionBody,
    replyBody,
  ]);

  const otherLists = await Promise.all([
    ["Priya", priya, []] as const,
    ["Nadia", nadia, ["DATA-17"]] as const,
    ["Leo", leo, ["LOG-22"]] as const,
  ].map(async ([label, bundle, expectedKeys]) => {
    const listed = success(await service.listMyTasks(
      bundle.agentSessionToken,
      { includeResolved: true },
      bundle.sessionInstanceId,
    ));
    const keys = listed.tasks.map((view) => view.task.taskKey);
    assert.deepEqual(keys, expectedKeys, `${label} must see only paired work`);
    assert.equal(keys.includes("CODE-9"), false, `${label} must not receive Sam's task`);
    return listed;
  }));
  assert.equal(otherLists.flatMap((listed) => listed.tasks)
    .some((view) => view.thread.threadId === codeTask.threadId), false);
});
