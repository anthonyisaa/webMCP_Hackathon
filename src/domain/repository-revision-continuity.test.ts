import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "vitest";

import type {
  IssueRevision,
  IssueRevisionSummary,
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

  const saveSummary = "Edited the document title and body.";
  const savedSurface = success(await service.saveHumanRevision(
    owner.humanSessionToken,
    {
      requestId: randomUUID(),
      expectedRevision: 1,
      title: "X",
      body: "Y",
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
  const connected = success(await service.connectAgent(worker.agentSessionToken, {
    requestId: randomUUID(), name: "Data agent",
  }, worker.sessionInstanceId));
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
      agentProfileId: connected.profile.profileId,
      agentLabel: "Data agent",
    },
    submittedAt: "2026-09-02T03:00:00.004Z",
  });
  assert.equal(submitted.task.updatedAt, "2026-09-02T03:00:00.004Z");
  assert.equal(submitted.task.resolvedAt, "2026-09-02T03:00:00.004Z");

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
  assert.equal(thread.resolvedAt, "2026-09-02T03:00:00.004Z");
  assert.equal(thread.comments.length, 2);
  assert.deepEqual(thread.comments.map((comment) => comment.body), [
    "Please state the evidence boundary explicitly.",
    finding,
  ]);
  assert.deepEqual(thread.comments[0], question);
  exactKeys(thread.comments[1]!, [
    "commentId", "threadId", "replyToCommentId", "author", "origin", "body",
    "createdRevision", "evidenceRefs", "createdAt",
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
      agentProfileId: connected.profile.profileId,
      agentLabel: "Data agent",
    },
    origin: "WEBMCP",
    createdRevision: 1,
    body: finding,
    evidenceRefs: ["impact.csv"],
    createdAt: "2026-09-02T03:00:00.004Z",
  });
});
