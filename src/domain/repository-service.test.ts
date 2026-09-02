import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "vitest";

// @ts-expect-error The CLI exports its runtime validator from an ESM script.
import { validateResetResult } from "../../scripts/reset-repository-hero-v4.mjs";

import productGolden from "../../evals/goldens/repo-document-v4/product-document.json";
import type {
  CreateIssueTaskServiceInput,
  IssueSessionBundle,
  IssueWorkspaceSurface,
  RepositoryResult,
} from "@/repository/contracts";
import { ISSUE_WORKSPACE_TTL_MS } from "@/repository/contracts";
import {
  deriveIssueSplice,
  issueSlice,
  makeIssueDiff,
  rebaseIssueAnchor,
  replaceIssueRange,
} from "@/repository/range";
import { reconcileIssueSurface } from "@/repository/surface-reconciliation";
import { LocalRepositoryService } from "./repository-service";

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function assertFailureCode(result: RepositoryResult<unknown>, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

function assertNoStoredMemberColor(surface: IssueWorkspaceSurface): void {
  const checkedSnapshots = {
    document: surface.document,
    members: surface.members,
    tasks: surface.tasks,
    threads: surface.threads,
    history: surface.history,
  };
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      assert.notEqual(key, "color", `stored member color leaked at ${path}.${key}`);
      visit(entry, `${path}.${key}`);
    }
  };
  visit(checkedSnapshots, "surface");
}

async function workspace(body = "Alpha 😀 beta gamma") {
  const service = new LocalRepositoryService({ waitSecondMs: 10 });
  const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Priya Shah" }));
  const nadia = success(await service.join({ shareToken: owner.shareToken, displayName: "Nadia Chen" }));
  const leo = success(await service.join({ shareToken: owner.shareToken, displayName: "Leo Park" }));
  const saved = success(await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Incident",
    body,
  }));
  assert.equal(saved.document.revision, 2);
  success(await service.connectAgent(nadia.agentSessionToken, {
    requestId: randomUUID(), name: "Test agent",
  }, nadia.sessionInstanceId));
  success(await service.connectAgent(leo.agentSessionToken, {
    requestId: randomUUID(), name: "Test agent",
  }, leo.sessionInstanceId));
  return { service, owner, nadia, leo };
}

function taskInput(
  assignee: IssueSessionBundle,
  rangeStart: number,
  rangeEnd: number,
  overrides: Partial<CreateIssueTaskServiceInput> = {},
): CreateIssueTaskServiceInput {
  return {
    requestId: randomUUID(),
    expectedRevision: 2,
    title: "Investigate selected text",
    category: "GENERAL",
    instruction: "Replace only this exact target and preserve surrounding facts.",
    agentLabel: "Test agent",
    mode: "DIRECT",
    assignedToMemberId: assignee.selfMemberId,
    anchor: { scope: "SELECTION", field: "BODY", rangeStart, rangeEnd },
    ...overrides,
  };
}

test("launches both exact templates with immutable full r1 snapshots", async () => {
  const service = new LocalRepositoryService();
  const postmortem = success(await service.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  assert.equal(postmortem.surface.document.revision, 1);
  assert.equal(postmortem.surface.document.activityVersion, 1);
  const postR1 = success(await service.readRevision(postmortem.humanSessionToken, 1));
  assert.equal(postR1.title, "Untitled incident postmortem");
  assert.equal(postR1.diffs.length, 2);
  assert.equal(postR1.provenance.authority, "HUMAN");
  assert.equal(postR1.provenance.origin, "ORDINARY_UI");

  const product = success(await service.launch({ kind: "PRODUCT_DOCUMENT", displayName: "Priya" }));
  const productR1 = success(await service.readRevision(product.humanSessionToken, 1));
  assert.equal(productR1.title, productGolden.document.title);
  assert.equal(productR1.body, productGolden.document.body);
  assert.equal(productR1.contentDigest, productGolden.revision.contentDigest);
});

test("Unicode splices replay exactly and disjoint anchors rebase while overlaps stale", async () => {
  assert.equal(issueSlice("Alpha 😀 beta", 6, 7), "😀");
  const unicodeAfter = replaceIssueRange("Alpha 😀 beta gamma", 8, 12, "delta");
  assert.equal(unicodeAfter, "Alpha 😀 delta gamma");
  assert.deepEqual(makeIssueDiff("BODY", "Alpha 😀 beta gamma", unicodeAfter), {
    field: "BODY",
    rangeStart: 8,
    rangeEnd: 10,
    before: "be",
    after: "del",
  });
  const rebased = rebaseIssueAnchor({
    scope: "SELECTION", field: "BODY", rangeStart: 6, rangeEnd: 10,
    selectedText: "beta", createdRevision: 1, anchorRevision: 1, anchorState: "ACTIVE",
  }, "BODY", deriveIssueSplice("Alpha beta", "Long Alpha beta"), 2);
  assert.deepEqual([rebased.rangeStart, rebased.rangeEnd, rebased.anchorState], [11, 15, "ACTIVE"]);

  const { service, owner, nadia, leo } = await workspace("Alpha beta gamma");
  success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 0, 5)));
  success(await service.createTask(owner.humanSessionToken, taskInput(leo, 11, 16)));
  const nadiaTasks = success(await service.listMyTasks(nadia.agentSessionToken, {}, nadia.sessionInstanceId));
  const leoTasks = success(await service.listMyTasks(leo.agentSessionToken, {}, leo.sessionInstanceId));
  const first = success(await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: nadiaTasks.tasks[0]!.task.taskId,
    basedOnRevision: 2, resultSummary: "Expanded first target.", replacementText: "First-long",
  }, nadia.sessionInstanceId));
  assert.equal(first.outcome, "COMMITTED");
  if (first.outcome === "COMMITTED") {
    assert.equal(first.task.result?.submittedAt, first.revision.createdAt);
    assert.deepEqual(first.task.creationAnchor, nadiaTasks.tasks[0]!.task.creationAnchor);
    assert.equal(first.task.creationAnchor.scope, "SELECTION");
    assert.equal(first.task.creationAnchor.scope === "SELECTION" ? first.task.creationAnchor.selectedText : null, "Alpha");
    assert.equal(first.task.result?.outcome === "COMMITTED" ? first.task.result.liveAnchor.selectedText : null, "Alpha");
    assert.equal(first.task.result?.outcome === "COMMITTED" ? first.task.result.replacementText : null, "First-long");
  }
  const second = success(await service.submitTaskResult(leo.agentSessionToken, {
    requestId: randomUUID(), taskId: leoTasks.tasks[0]!.task.taskId,
    basedOnRevision: 2, resultSummary: "Changed disjoint second target.", replacementText: "third",
  }, leo.sessionInstanceId));
  assert.equal(second.outcome, "COMMITTED");
  if (second.outcome === "COMMITTED") {
    assert.equal(second.revision.parentRevision, 3);
    assert.equal(second.revision.provenance.sourceRevision, 2);
    assert.equal(second.revision.body, "First-long beta third");
  }

  const overlapWorkspace = await workspace("Alpha beta gamma");
  success(await overlapWorkspace.service.createTask(overlapWorkspace.owner.humanSessionToken, taskInput(overlapWorkspace.nadia, 6, 10)));
  success(await overlapWorkspace.service.createTask(overlapWorkspace.owner.humanSessionToken, taskInput(overlapWorkspace.leo, 6, 10)));
  const ownedNadia = success(await overlapWorkspace.service.listMyTasks(overlapWorkspace.nadia.agentSessionToken, {}, overlapWorkspace.nadia.sessionInstanceId)).tasks[0]!.task;
  const ownedLeo = success(await overlapWorkspace.service.listMyTasks(overlapWorkspace.leo.agentSessionToken, {}, overlapWorkspace.leo.sessionInstanceId)).tasks[0]!.task;
  success(await overlapWorkspace.service.submitTaskResult(overlapWorkspace.nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: ownedNadia.taskId, basedOnRevision: 2,
    resultSummary: "Replace overlap.", replacementText: "delta",
  }, overlapWorkspace.nadia.sessionInstanceId));
  const stale = await overlapWorkspace.service.submitTaskResult(overlapWorkspace.leo.agentSessionToken, {
    requestId: randomUUID(), taskId: ownedLeo.taskId, basedOnRevision: 2,
    resultSummary: "Try stale overlap.", replacementText: "omega",
  }, overlapWorkspace.leo.sessionInstanceId);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "STALE_TASK_CONTEXT");
});

test("stored mode derives Comment, Review, and Direct outcomes with exact authority", async () => {
  const { service, owner, nadia, leo } = await workspace("Alpha beta gamma");
  const commentSurface = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 0, 5, {
    mode: "COMMENT",
    anchor: { scope: "DOCUMENT" },
    title: "Add a finding",
  })));
  const commentTask = commentSurface.tasks.find((task) => task.mode === "COMMENT")!;
  const commented = success(await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: commentTask.taskId, basedOnRevision: 2,
    resultSummary: "No content change is needed.", evidenceRefs: ["analysis.txt"],
  }, nadia.sessionInstanceId));
  assert.equal(commented.outcome, "COMMENTED");
  assert.equal(commented.revision, 2);

  const reviewSurface = success(await service.createTask(owner.humanSessionToken, taskInput(leo, 6, 10, {
    mode: "REVIEW", title: "Review beta",
  })));
  const reviewTask = reviewSurface.tasks.find((task) => task.mode === "REVIEW")!;
  const proposed = success(await service.submitTaskResult(leo.agentSessionToken, {
    requestId: randomUUID(), taskId: reviewTask.taskId, basedOnRevision: 2,
    resultSummary: "Replace beta after review.", replacementText: "delta",
  }, leo.sessionInstanceId));
  assert.equal(proposed.outcome, "PROPOSED");
  assert.equal(proposed.revision, 2);
  const denied = await service.acceptTaskProposal(nadia.humanSessionToken, {
    requestId: randomUUID(), taskId: reviewTask.taskId, expectedRevision: 2, note: null,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "UNAUTHORIZED");
  const accepted = success(await service.acceptTaskProposal(owner.humanSessionToken, {
    requestId: randomUUID(), taskId: reviewTask.taskId, expectedRevision: 2, note: "Accept.",
  }));
  assert.equal(accepted.document.body, "Alpha delta gamma");
  const reviewRevision = success(await service.readRevision(owner.humanSessionToken, 3));
  assert.equal(reviewRevision.provenance.authority, "REVIEW");
  assert.equal(reviewRevision.provenance.origin, "ORDINARY_UI");
  assert.equal(reviewRevision.provenance.authorOrigin, "WEBMCP");
  assert.equal(reviewRevision.provenance.author.actorType, "AGENT");
  assert.equal(reviewRevision.provenance.committer.actorType, "HUMAN");
  const completedReview = accepted.tasks.find((task) => task.taskId === reviewTask.taskId)!;
  assert.equal(completedReview.decision?.decidedAt, reviewRevision.createdAt);
  assert.equal(completedReview.resolvedAt, reviewRevision.createdAt);
  assert.equal(completedReview.proposal?.liveAnchor.selectedText, "beta");
  assertNoStoredMemberColor(accepted);
});

test("threaded discussion is complete, ownership is closed-world, and replay survives terminal state", async () => {
  const { service, owner, nadia, leo } = await workspace();
  const created = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 8, 12, { mode: "REVIEW" })));
  const task = created.tasks[0]!;
  const human = success(await service.addHumanComment(owner.humanSessionToken, {
    requestId: randomUUID(), threadId: task.threadId, body: "Why this wording?",
  }));
  const parent = human.threads.find((thread) => thread.threadId === task.threadId)!.comments[0]!;
  success(await service.commentOnTask(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: task.taskId, replyToCommentId: parent.commentId,
    body: "It preserves the incident fact.", evidenceRefs: ["note.txt"],
  }, nadia.sessionInstanceId));
  const crossTask = await service.commentOnTask(leo.agentSessionToken, {
    requestId: randomUUID(), taskId: task.taskId, body: "I do not own this.",
  }, leo.sessionInstanceId);
  assert.equal(crossTask.ok, false);
  if (!crossTask.ok) assert.equal(crossTask.code, "UNAUTHORIZED");
  const listed = success(await service.listMyTasks(nadia.agentSessionToken, {}, nadia.sessionInstanceId));
  assert.deepEqual(listed.tasks[0]!.thread.comments.map((comment) => comment.body), [
    "Why this wording?",
    "It preserves the incident fact.",
  ]);

  const secondOwned = success(await service.createTask(
    owner.humanSessionToken,
    taskInput(leo, 13, 17, { title: "Second owned task" }),
  )).tasks.find((candidate) => candidate.title === "Second owned task")!;

  const requestId = randomUUID();
  const cancelInput = { requestId, taskId: task.taskId };
  const cancelled = success(await service.cancelTask(owner.humanSessionToken, cancelInput));
  const activity = cancelled.document.activityVersion;
  const replay = success(await service.cancelTask(owner.humanSessionToken, cancelInput));
  assert.equal(replay.document.activityVersion, activity);
  const mismatch = await service.cancelTask(owner.humanSessionToken, { requestId, taskId: secondOwned.taskId });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "REQUEST_REPLAY_MISMATCH");
});

test("replay is document-scoped, checks target authority first, and stores failures and presence", async () => {
  const { service, owner, nadia, leo } = await workspace("Alpha beta gamma");
  const created = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 0, 5)));
  const task = created.tasks.find((entry) => entry.assignee.memberId === nadia.selfMemberId)!;

  const commentInput = {
    requestId: randomUUID(),
    taskId: task.taskId,
    body: "Owned reasoning.",
  };
  success(await service.commentOnTask(
    nadia.agentSessionToken,
    commentInput,
    nadia.sessionInstanceId,
  ));
  assertFailureCode(await service.commentOnTask(
    leo.agentSessionToken,
    commentInput,
    leo.sessionInstanceId,
  ), "UNAUTHORIZED");
  assertFailureCode(await service.commentOnTask(
    leo.agentSessionToken,
    { ...commentInput, body: "Changed cross-owner input." },
    leo.sessionInstanceId,
  ), "UNAUTHORIZED");

  const unclaimedRequestId = randomUUID();
  const poisonedInput = {
    requestId: unclaimedRequestId,
    taskId: task.taskId,
    body: "The rightful assignee must still be able to claim this request ID.",
  };
  assertFailureCode(await service.commentOnTask(
    leo.agentSessionToken,
    poisonedInput,
    leo.sessionInstanceId,
  ), "UNAUTHORIZED");
  success(await service.commentOnTask(
    nadia.agentSessionToken,
    poisonedInput,
    nadia.sessionInstanceId,
  ));

  const reviewSurface = success(await service.createTask(owner.humanSessionToken, taskInput(leo, 6, 10, {
    mode: "REVIEW",
    title: "Authority ordering review",
  })));
  const reviewTask = reviewSurface.tasks.find((entry) => entry.title === "Authority ordering review")!;
  const resultRequestId = randomUUID();
  assertFailureCode(await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: resultRequestId,
    taskId: reviewTask.taskId,
    basedOnRevision: -1,
    resultSummary: "",
    replacementText: "delta",
    forged: true,
  } as never, nadia.sessionInstanceId), "UNAUTHORIZED");
  const proposed = success(await service.submitTaskResult(leo.agentSessionToken, {
    requestId: resultRequestId,
    taskId: reviewTask.taskId,
    basedOnRevision: 2,
    resultSummary: "Propose an owned replacement.",
    replacementText: "delta",
  }, leo.sessionInstanceId));
  assert.equal(proposed.outcome, "PROPOSED");

  const decisionRequestId = randomUUID();
  assertFailureCode(await service.rejectTaskProposal(nadia.humanSessionToken, {
    requestId: decisionRequestId,
    taskId: reviewTask.taskId,
    expectedRevision: -1,
    note: { forged: true },
  } as never), "UNAUTHORIZED");
  success(await service.rejectTaskProposal(owner.humanSessionToken, {
    requestId: decisionRequestId,
    taskId: reviewTask.taskId,
    expectedRevision: 2,
    note: "Rejected after authority-order regression coverage.",
  }));

  const cancelInput = { requestId: randomUUID(), taskId: task.taskId };
  success(await service.cancelTask(owner.humanSessionToken, cancelInput));
  assertFailureCode(
    await service.cancelTask(nadia.humanSessionToken, cancelInput),
    "UNAUTHORIZED",
  );

  const sharedThreadInput = {
    requestId: randomUUID(),
    expectedRevision: 2,
    body: "One logical discussion.",
    anchor: {
      scope: "SELECTION" as const,
      field: "BODY" as const,
      rangeStart: 6,
      rangeEnd: 10,
    },
  };
  const firstThread = success(await service.createThread(
    owner.humanSessionToken,
    sharedThreadInput,
  ));
  const replayedThread = success(await service.createThread(
    nadia.humanSessionToken,
    sharedThreadInput,
  ));
  assert.deepEqual(replayedThread, firstThread);
  assert.equal(
    replayedThread.threads.filter((thread) => thread.taskId === null).length,
    1,
  );

  const failedSave = {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Incident",
    body: "Stale body",
  };
  assertFailureCode(await service.saveHumanRevision(owner.humanSessionToken, failedSave), "STALE_DOCUMENT");
  assertFailureCode(await service.saveHumanRevision(owner.humanSessionToken, failedSave), "STALE_DOCUMENT");
  assertFailureCode(await service.saveHumanRevision(owner.humanSessionToken, {
    ...failedSave,
    body: "Changed canonical input",
  }), "REQUEST_REPLAY_MISMATCH");

  const presenceInput = {
    requestId: randomUUID(),
    state: "VIEWING" as const,
    field: null,
    isTyping: false,
    selectionStart: null,
    selectionEnd: null,
    observedRevision: 2,
  };
  const firstPresence = success(await service.touchPresence(owner.humanSessionToken, presenceInput));
  const replayedPresence = success(await service.touchPresence(owner.humanSessionToken, presenceInput));
  assert.deepEqual(replayedPresence, firstPresence);
  assertFailureCode(await service.touchPresence(owner.humanSessionToken, {
    ...presenceInput,
    state: "IDLE",
  }), "REQUEST_REPLAY_MISMATCH");
});

test("presence is visible strictly inside its TTL boundary", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const service = new LocalRepositoryService({ now: () => now, presenceTtlMs: 15 });
  const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  const touched = success(await service.touchPresence(owner.humanSessionToken, {
    requestId: randomUUID(), state: "VIEWING", field: null, isTyping: false,
    selectionStart: null, selectionEnd: null, observedRevision: 1,
  }));
  assert.equal(touched.presence.length, 1);
  now += 14;
  assert.equal(success(await service.inspect(owner.humanSessionToken)).presence.length, 1);
  now += 1;
  assert.equal(success(await service.inspect(owner.humanSessionToken)).presence.length, 0);
});

test("Comment replacement, missing and cross-thread replies, and stale Review acceptance use exact errors", async () => {
  const fixedNow = Date.parse("2026-09-01T00:00:00.000Z");
  const service = new LocalRepositoryService({ now: () => fixedNow });
  const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  const nadia = success(await service.join({ shareToken: owner.shareToken, displayName: "Nadia" }));
  success(await service.connectAgent(nadia.agentSessionToken, {
    requestId: randomUUID(), name: "Test agent",
  }, nadia.sessionInstanceId));
  success(await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 1, title: "Incident",
    body: "Alpha beta gamma",
  }));
  const commentCreated = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 0, 5, {
    mode: "COMMENT", anchor: { scope: "DOCUMENT" }, title: "Comment only",
  })));
  const commentTask = commentCreated.tasks.find((task) => task.mode === "COMMENT")!;
  const failedAt = commentTask.updatedAt;
  assertFailureCode(await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: commentTask.taskId, basedOnRevision: 2,
    resultSummary: "A finding.", replacementText: "forbidden",
  }, nadia.sessionInstanceId), "INVALID_INPUT");
  const commented = success(await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: commentTask.taskId, basedOnRevision: 2,
    resultSummary: "A finding.",
  }, nadia.sessionInstanceId));
  assert.equal(
    Date.parse(commented.task.updatedAt) - Date.parse(failedAt),
    1,
    "a failing mode branch must not consume a timestamp stamp",
  );

  const first = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 6, 10, {
    mode: "REVIEW", title: "First review",
  })));
  const firstTask = first.tasks.find((task) => task.title === "First review")!;
  const parentSurface = success(await service.addHumanComment(owner.humanSessionToken, {
    requestId: randomUUID(), threadId: firstTask.threadId, body: "First thread comment.",
  }));
  const parent = parentSurface.threads.find((thread) => thread.threadId === firstTask.threadId)!.comments[0]!;
  const second = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 11, 16, {
    mode: "REVIEW", title: "Second review",
  })));
  const secondTask = second.tasks.find((task) => task.title === "Second review")!;
  assertFailureCode(await service.addHumanComment(owner.humanSessionToken, {
    requestId: randomUUID(), taskId: firstTask.taskId, body: "Wrong target discriminator.",
  } as never), "INVALID_INPUT");
  assertFailureCode(await service.commentOnTask(nadia.agentSessionToken, {
    requestId: randomUUID(), threadId: firstTask.threadId, body: "Wrong target discriminator.",
  } as never, nadia.sessionInstanceId), "INVALID_INPUT");
  assertFailureCode(await service.addHumanComment(
    owner.humanSessionToken,
    null as never,
  ), "INVALID_INPUT");
  assertFailureCode(await service.addHumanComment(owner.humanSessionToken, {
    requestId: randomUUID(), threadId: firstTask.threadId,
    body: "Null evidence must not normalize to omission.", evidenceRefs: null,
  } as never), "INVALID_INPUT");
  assertFailureCode(await service.commentOnTask(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: firstTask.taskId,
    body: "Null evidence must not normalize to omission.", evidenceRefs: null,
  } as never, nadia.sessionInstanceId), "INVALID_INPUT");
  assertFailureCode(await service.commentOnTask(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: secondTask.taskId, replyToCommentId: parent.commentId,
    body: "Cross-thread reply.",
  }, nadia.sessionInstanceId), "INVALID_INPUT");
  assertFailureCode(await service.commentOnTask(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: secondTask.taskId, replyToCommentId: randomUUID(),
    body: "Missing reply.",
  }, nadia.sessionInstanceId), "INVALID_INPUT");

  success(await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: firstTask.taskId, basedOnRevision: 2,
    resultSummary: "Propose delta.", replacementText: "delta",
  }, nadia.sessionInstanceId));
  success(await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 2, title: "Incident",
    body: "Alpha omega gamma",
  }));
  assertFailureCode(await service.acceptTaskProposal(owner.humanSessionToken, {
    requestId: randomUUID(), taskId: firstTask.taskId, expectedRevision: 3, note: null,
  }), "STALE_TASK_CONTEXT");
});

test("checked selection, evidence, and complete-discussion bounds fail without counter changes", async () => {
  const { service, owner, nadia } = await workspace();
  const before = success(await service.inspect(owner.humanSessionToken)).document.activityVersion;
  const badScope = await service.createTask(owner.humanSessionToken, taskInput(nadia, 8, 12, {
    mode: "DIRECT",
    anchor: { scope: "DOCUMENT" },
  }));
  assert.equal(badScope.ok, false);
  if (!badScope.ok) assert.equal(badScope.code, "INVALID_INPUT");
  assert.equal(success(await service.inspect(owner.humanSessionToken)).document.activityVersion, before);
  assertFailureCode(await service.createTask(owner.humanSessionToken, {
    ...taskInput(nadia, 8, 12),
    expectedRevision: 999,
    assignedToMemberId: randomUUID(),
    anchor: { scope: "SELECTION", field: "BODY", rangeStart: 8, rangeEnd: 12, extra: true } as never,
  }), "INVALID_INPUT");
  assertFailureCode(await service.createThread(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 999,
    body: "Malformed target must win over stale head.",
    anchor: { scope: "DOCUMENT", extra: true } as never,
  }), "INVALID_INPUT");

  const created = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 8, 12, { mode: "REVIEW" })));
  const task = created.tasks[0]!;
  const tooMuchEvidence = await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: task.taskId, basedOnRevision: 2,
    resultSummary: "Too many refs.", replacementText: "delta",
    evidenceRefs: Array.from({ length: 13 }, (_, index) => `evidence-${index}`),
  }, nadia.sessionInstanceId);
  assert.equal(tooMuchEvidence.ok, false);
  if (!tooMuchEvidence.ok) assert.equal(tooMuchEvidence.code, "INVALID_INPUT");
  assertFailureCode(await service.submitTaskResult(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: task.taskId, basedOnRevision: 2,
    resultSummary: "Null evidence is malformed.", replacementText: "delta",
    evidenceRefs: null,
  } as never, nadia.sessionInstanceId), "INVALID_INPUT");

  for (let index = 0; index < 100; index += 1) {
    success(await service.commentOnTask(nadia.agentSessionToken, {
      requestId: randomUUID(), taskId: task.taskId, body: `Bounded comment ${index + 1}.`,
    }, nadia.sessionInstanceId));
  }
  const overflow = await service.commentOnTask(nadia.agentSessionToken, {
    requestId: randomUUID(), taskId: task.taskId, body: "This must not be appended.",
  }, nadia.sessionInstanceId);
  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.equal(overflow.code, "RATE_LIMITED");
  const listed = success(await service.listMyTasks(nadia.agentSessionToken, {}, nadia.sessionInstanceId));
  assert.equal(listed.tasks[0]!.thread.comments.length, 100);
});

test("history is newest-first, restores append instead of rewrite, and stale saves preserve head", async () => {
  const { service, owner } = await workspace("Alpha beta gamma");
  success(await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 2, title: "Incident", body: "Delta beta gamma",
  }));
  const stale = await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 2, title: "Incident", body: "Lost update",
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.code, "STALE_DOCUMENT");
    assert.equal(stale.currentRevision, 3);
  }
  const history = success(await service.readHistory(owner.humanSessionToken, { limit: 2 }));
  assert.deepEqual(history.revisions.map((revision) => revision.revision), [3, 2]);
  assert.equal(history.hasMoreOlder, true);
  assert.equal(history.nextBeforeRevision, 2);
  const restored = success(await service.restoreRevision(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 3, revision: 2, changeSummary: "Restore deterministic body.",
  }));
  assert.equal(restored.document.revision, 4);
  assert.equal(restored.document.body, "Alpha beta gamma");
  const restoreRevision = success(await service.readRevision(owner.humanSessionToken, 4));
  assert.equal(restoreRevision.parentRevision, 3);
  assert.equal(restoreRevision.provenance.authority, "RESTORE");
  if (restoreRevision.provenance.authority === "RESTORE") assert.equal(restoreRevision.provenance.restoredRevision, 2);
});

test("wait uses explicit cursors, rejects duplicate page waits, and distinguishes document change", async () => {
  const { service, owner, nadia } = await workspace();
  const cursor = success(await service.inspect(owner.humanSessionToken)).document;
  const pageSessionId = randomUUID();
  success(await service.connectAgent(nadia.agentSessionToken, {
    requestId: randomUUID(), name: "Test agent",
  }, pageSessionId));
  const invalidPage = await service.listMyTasks(
    nadia.agentSessionToken,
    {},
    "not-a-page-uuid",
  );
  assert.equal(invalidPage.ok, false);
  if (!invalidPage.ok) assert.equal(invalidPage.code, "STALE_PAGE_CONTEXT");
  assert.equal(
    success(await service.listMyTasks(nadia.agentSessionToken, {}, pageSessionId)).tasks.length,
    0,
  );
  const controller = new AbortController();
  const firstWait = service.waitForMyTasks(nadia.agentSessionToken, {
    afterActivityVersion: cursor.activityVersion,
    afterRevision: cursor.revision,
    timeoutSeconds: 1,
  }, pageSessionId, controller.signal);
  const duplicate = await service.waitForMyTasks(nadia.agentSessionToken, {
    afterActivityVersion: cursor.activityVersion,
    afterRevision: cursor.revision,
    timeoutSeconds: 1,
  }, pageSessionId);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "WAIT_ALREADY_ACTIVE");
  controller.abort(new DOMException("cancel", "AbortError"));
  await assert.rejects(firstWait, { name: "AbortError" });

  const secondWait = service.waitForMyTasks(nadia.agentSessionToken, {
    afterActivityVersion: cursor.activityVersion,
    afterRevision: cursor.revision,
    timeoutSeconds: 1,
  }, pageSessionId);
  success(await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: cursor.revision,
    title: "Incident", body: "Changed while waiting",
  }));
  const changed = success(await secondWait);
  assert.equal(changed.outcome, "DOCUMENT_CHANGED");
});

test("wait rechecks expiry and configured session TTL never exceeds workspace TTL", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const clamped = new LocalRepositoryService({
    now: () => now,
    sessionTtlMs: ISSUE_WORKSPACE_TTL_MS * 2,
  });
  const clampedBundle = success(await clamped.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  assert.equal(Date.parse(clampedBundle.expiresAt) - now, ISSUE_WORKSPACE_TTL_MS);

  const service = new LocalRepositoryService({ now: () => now, sessionTtlMs: 5, waitSecondMs: 50 });
  const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  const nadia = success(await service.join({ shareToken: owner.shareToken, displayName: "Nadia" }));
  const pageSessionId = randomUUID();
  success(await service.connectAgent(nadia.agentSessionToken, {
    requestId: randomUUID(), name: "Wait agent",
  }, pageSessionId));
  const wait = service.waitForMyTasks(nadia.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId);
  now += 6;
  assertFailureCode(await wait, "UNAUTHORIZED");
});

test("credential issuance has deterministic configurable caps and reset rejects overlap atomically", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const service = new LocalRepositoryService({
    now: () => now,
    credentialRateLimitWindowMs: 100,
    credentialRateLimits: { launch: 1, example: 1, join: 1, reset: 1 },
  });
  assertFailureCode(await service.launch({ kind: "bad" as "POSTMORTEM", displayName: "Priya" }), "INVALID_INPUT");
  const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  assertFailureCode(await service.launch({ kind: "PRODUCT_DOCUMENT", displayName: "Priya" }), "RATE_LIMITED");
  success(await service.launchExample({ kind: "POSTMORTEM", displayName: "Quinn" }));
  assertFailureCode(await service.launchExample({ kind: "POSTMORTEM", displayName: "Quinn" }), "RATE_LIMITED");
  success(await service.join({ shareToken: owner.shareToken, displayName: "Nadia" }));
  assertFailureCode(await service.join({ shareToken: owner.shareToken, displayName: "Leo" }), "RATE_LIMITED");
  success(await service.resetPostmortemHero());
  assertFailureCode(await service.resetPostmortemHero(), "RATE_LIMITED");
  now += 101;
  success(await service.launch({ kind: "PRODUCT_DOCUMENT", displayName: "Jordan" }));

  const concurrent = new LocalRepositoryService();
  const firstReset = concurrent.resetPostmortemHero();
  const overlappingReset = await concurrent.resetPostmortemHero();
  assertFailureCode(overlappingReset, "RATE_LIMITED");
  const firstOutcome = success(await firstReset);
  assert.equal(validateResetResult({ ok: true, data: firstOutcome }), true);
  const encoded = firstOutcome.priyaBootstrapPath.split("#ratiflow-bootstrap=")[1]!;
  const priya = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as IssueSessionBundle;
  assert.equal(success(await concurrent.inspect(priya.humanSessionToken)).document.activityVersion, 4);
});

test("surface task and thread ordering is active-first, newest-updated, and task-linked", async () => {
  const { service, owner, nadia, leo } = await workspace("Alpha beta gamma");
  const one = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 0, 5, { title: "One" })));
  const oneTask = one.tasks.find((task) => task.title === "One")!;
  success(await service.createTask(owner.humanSessionToken, taskInput(leo, 6, 10, { title: "Two" })));
  success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 11, 16, { title: "Three" })));
  success(await service.cancelTask(owner.humanSessionToken, { requestId: randomUUID(), taskId: oneTask.taskId }));
  const firstThread = success(await service.createThread(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 2, body: "Older standalone.", anchor: { scope: "DOCUMENT" },
  }));
  const olderStandalone = firstThread.threads.find((thread) => thread.taskId === null)!;
  const ordered = success(await service.createThread(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 2, body: "Newer standalone.", anchor: { scope: "DOCUMENT" },
  }));
  assert.deepEqual(ordered.tasks.map((task) => [task.title, task.status]), [
    ["Three", "OPEN"],
    ["Two", "OPEN"],
    ["One", "CANCELLED"],
  ]);
  assert.deepEqual(
    ordered.threads.slice(0, 3).map((thread) => thread.taskId),
    ordered.tasks.map((task) => task.taskId),
  );
  assert.equal(ordered.threads[3]!.taskId, null);
  assert.notEqual(ordered.threads[3]!.threadId, olderStandalone.threadId);
  assert.equal(ordered.threads[4]!.threadId, olderStandalone.threadId);
});

test("surface reconciliation never lets delayed data hide content or same-revision activity", async () => {
  const { service, owner, nadia } = await workspace();
  const oldSurface = success(await service.inspect(owner.humanSessionToken));
  const newer = success(await service.createTask(owner.humanSessionToken, taskInput(nadia, 8, 12)));
  const merged = reconcileIssueSurface(newer, oldSurface);
  assert.equal(merged.document.activityVersion, newer.document.activityVersion);
  assert.equal(merged.tasks.length, 1);
  assert.equal(reconcileIssueSurface(oldSurface, newer).tasks.length, 1);
});
