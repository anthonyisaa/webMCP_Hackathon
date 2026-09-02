import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CreateIssueTaskServiceInput,
  IssueSessionBundle,
  IssueTaskMode,
  IssueWorkspaceSurface,
  RepositoryResult,
} from "@/repository/contracts";
import { LocalRepositoryService } from "./repository-service";

type Counters = {
  revision: number;
  activityVersion: number;
};

type LedgerEntry = Counters & {
  operation: string;
};

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function fixedRequestIds(start = 1): () => string {
  let next = start;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
}

function counters(surface: IssueWorkspaceSurface): Counters {
  return {
    revision: surface.document.revision,
    activityVersion: surface.document.activityVersion,
  };
}

function durableState(surface: IssueWorkspaceSurface): unknown {
  return {
    document: surface.document,
    members: surface.members,
    tasks: surface.tasks,
    threads: surface.threads,
    history: surface.history,
    hasMoreHistory: surface.hasMoreHistory,
  };
}

async function inspect(
  service: LocalRepositoryService,
  sessionToken: string,
): Promise<IssueWorkspaceSurface> {
  return success(await service.inspect(sessionToken));
}

async function assertHeadIsAtomic(
  service: LocalRepositoryService,
  sessionToken: string,
  surface: IssueWorkspaceSurface,
): Promise<void> {
  const history = success(await service.readHistory(sessionToken, { limit: 50 }));
  assert.deepEqual(
    [history.currentRevision, history.currentActivityVersion],
    [surface.document.revision, surface.document.activityVersion],
    "history cursors must match the authoritative head",
  );
  assert.equal(history.revisions.length, surface.document.revision);
  assert.deepEqual(
    history.revisions.map((revision) => revision.revision),
    Array.from({ length: surface.document.revision }, (_, index) => surface.document.revision - index),
    "content revisions must be gap-free and newest-first",
  );
  const head = success(await service.readRevision(sessionToken, surface.document.revision));
  assert.deepEqual(
    [head.revisionId, head.title, head.body, head.contentDigest],
    [surface.document.lastRevision.revisionId, surface.document.title, surface.document.body, history.revisions[0]!.contentDigest],
    "the head, latest immutable snapshot, and history projection must commit together",
  );
}

async function expectStep<T>(
  service: LocalRepositoryService,
  sessionToken: string,
  ledger: LedgerEntry[],
  operation: string,
  expectedDelta: readonly [revision: number, activityVersion: number],
  action: () => Promise<RepositoryResult<T>>,
): Promise<{ data: T; surface: IssueWorkspaceSurface }> {
  const before = await inspect(service, sessionToken);
  const data = success(await action());
  const surface = await inspect(service, sessionToken);
  assert.deepEqual(
    [
      surface.document.revision - before.document.revision,
      surface.document.activityVersion - before.document.activityVersion,
    ],
    expectedDelta,
    `${operation} counter delta`,
  );
  ledger.push({ operation, ...counters(surface) });
  await assertHeadIsAtomic(service, sessionToken, surface);
  return { data, surface };
}

async function expectNoDurableChange<T>(
  service: LocalRepositoryService,
  sessionToken: string,
  operation: string,
  action: () => Promise<RepositoryResult<T>>,
): Promise<RepositoryResult<T>> {
  const before = await inspect(service, sessionToken);
  const result = await action();
  const after = await inspect(service, sessionToken);
  assert.deepEqual(counters(after), counters(before), `${operation} must not advance counters`);
  assert.deepEqual(durableState(after), durableState(before), `${operation} must not partially mutate durable state`);
  await assertHeadIsAtomic(service, sessionToken, after);
  return result;
}

function taskInput(
  requestId: string,
  assignee: IssueSessionBundle,
  title: string,
  mode: IssueTaskMode,
  expectedRevision: number,
  rangeStart?: number,
  rangeEnd?: number,
): CreateIssueTaskServiceInput {
  return {
    requestId,
    expectedRevision,
    title,
    category: "GENERAL",
    instruction: "Perform only the bounded counter-oracle operation.",
    agentLabel: "Counter agent",
    mode,
    assignedToMemberId: assignee.selfMemberId,
    anchor: mode === "COMMENT"
      ? { scope: "DOCUMENT" }
      : { scope: "SELECTION", field: "BODY", rangeStart: rangeStart!, rangeEnd: rangeEnd! },
  };
}

test("D04 successful operations follow the exact revision/activity ledger atomically", async () => {
  const requestId = fixedRequestIds(1);
  const service = new LocalRepositoryService({
    now: () => Date.parse("2026-09-02T00:00:00.000Z"),
    waitSecondMs: 1,
  });
  const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Owner" }));
  const ledger: LedgerEntry[] = [{ operation: "launch template", ...counters(owner.surface) }];
  assert.deepEqual(ledger[0], { operation: "launch template", revision: 1, activityVersion: 1 });
  await assertHeadIsAtomic(service, owner.humanSessionToken, owner.surface);

  const worker = success(await service.join({ shareToken: owner.shareToken, displayName: "Worker" }));
  success(await service.connectAgent(worker.agentSessionToken, {
    requestId: requestId(), name: "Counter agent",
  }, worker.sessionInstanceId));
  assert.deepEqual(counters(await inspect(service, owner.humanSessionToken)), { revision: 1, activityVersion: 1 });

  const initialBody = "alpha beta gamma delta epsilon zeta";
  await expectStep(service, owner.humanSessionToken, ledger, "changed human save", [1, 1], () =>
    service.saveHumanRevision(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 1,
      title: "Counter oracle",
      body: initialBody,
    }));

  const unchangedSave = await expectNoDurableChange(service, owner.humanSessionToken, "unchanged human save", () =>
    service.saveHumanRevision(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      title: "Counter oracle",
      body: initialBody,
    }));
  success(unchangedSave);
  ledger.push({ operation: "unchanged human save", ...counters(await inspect(service, owner.humanSessionToken)) });

  const rejectTaskInput = taskInput(requestId(), worker, "Review then reject alpha", "REVIEW", 2, 0, 5);
  const rejectCreated = await expectStep(service, owner.humanSessionToken, ledger, "create reject-path task", [0, 1], () =>
    service.createTask(owner.humanSessionToken, rejectTaskInput));
  const rejectTask = rejectCreated.surface.tasks.find((task) => task.title === rejectTaskInput.title)!;

  const acceptTaskInput = taskInput(requestId(), worker, "Review then accept beta", "REVIEW", 2, 6, 10);
  const acceptCreated = await expectStep(service, owner.humanSessionToken, ledger, "create accept-path task", [0, 1], () =>
    service.createTask(owner.humanSessionToken, acceptTaskInput));
  const acceptTask = acceptCreated.surface.tasks.find((task) => task.title === acceptTaskInput.title)!;

  const directTaskInput = taskInput(requestId(), worker, "Directly replace gamma", "DIRECT", 2, 11, 16);
  const directCreated = await expectStep(service, owner.humanSessionToken, ledger, "create Direct task", [0, 1], () =>
    service.createTask(owner.humanSessionToken, directTaskInput));
  const directTask = directCreated.surface.tasks.find((task) => task.title === directTaskInput.title)!;

  const commentTaskInput = taskInput(requestId(), worker, "Report a document finding", "COMMENT", 2);
  const commentCreated = await expectStep(service, owner.humanSessionToken, ledger, "create Comment task", [0, 1], () =>
    service.createTask(owner.humanSessionToken, commentTaskInput));
  const commentTask = commentCreated.surface.tasks.find((task) => task.title === commentTaskInput.title)!;

  const cancelTaskInput = taskInput(requestId(), worker, "Cancel delta task", "DIRECT", 2, 17, 22);
  const cancelCreated = await expectStep(service, owner.humanSessionToken, ledger, "create cancellation task", [0, 1], () =>
    service.createTask(owner.humanSessionToken, cancelTaskInput));
  const cancelTask = cancelCreated.surface.tasks.find((task) => task.title === cancelTaskInput.title)!;

  const threadCreated = await expectStep(service, owner.humanSessionToken, ledger, "create standalone thread", [0, 1], () =>
    service.createThread(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      body: "Initial standalone observation.",
      anchor: { scope: "DOCUMENT" },
    }));
  const standaloneThread = threadCreated.surface.threads.find((thread) => thread.taskId === null)!;

  await expectStep(service, owner.humanSessionToken, ledger, "human comment", [0, 1], () =>
    service.addHumanComment(owner.humanSessionToken, {
      requestId: requestId(),
      threadId: standaloneThread.threadId,
      body: "A second human observation.",
    }));

  await expectStep(service, owner.humanSessionToken, ledger, "agent comment", [0, 1], () =>
    service.commentOnTask(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: directTask.taskId,
      body: "I checked the bounded target.",
    }, worker.sessionInstanceId));

  const rejectedProposal = await expectStep(service, owner.humanSessionToken, ledger, "Review proposal for rejection", [0, 1], () =>
    service.submitTaskResult(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: rejectTask.taskId,
      basedOnRevision: 2,
      resultSummary: "Propose uppercase alpha.",
      replacementText: "ALPHA",
    }, worker.sessionInstanceId));
  assert.equal(rejectedProposal.data.outcome, "PROPOSED");
  assert.equal(rejectedProposal.surface.tasks.find((task) => task.taskId === rejectTask.taskId)?.status, "PROPOSED");

  const rejected = await expectStep(service, owner.humanSessionToken, ledger, "reject Review", [0, 1], () =>
    service.rejectTaskProposal(owner.humanSessionToken, {
      requestId: requestId(),
      taskId: rejectTask.taskId,
      expectedRevision: 2,
      note: "Keep lowercase alpha.",
    }));
  assert.equal(rejected.surface.tasks.find((task) => task.taskId === rejectTask.taskId)?.status, "REJECTED");
  assert.equal(rejected.surface.document.body, initialBody);

  const acceptedProposal = await expectStep(service, owner.humanSessionToken, ledger, "Review proposal for acceptance", [0, 1], () =>
    service.submitTaskResult(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: acceptTask.taskId,
      basedOnRevision: 2,
      resultSummary: "Propose uppercase beta.",
      replacementText: "BETA",
    }, worker.sessionInstanceId));
  assert.equal(acceptedProposal.data.outcome, "PROPOSED");

  const accepted = await expectStep(service, owner.humanSessionToken, ledger, "accept Review", [1, 1], () =>
    service.acceptTaskProposal(owner.humanSessionToken, {
      requestId: requestId(),
      taskId: acceptTask.taskId,
      expectedRevision: 2,
      note: "Accept the reviewed replacement.",
    }));
  const acceptedTask = accepted.surface.tasks.find((task) => task.taskId === acceptTask.taskId)!;
  assert.equal(acceptedTask.status, "COMPLETED");
  assert.equal(acceptedTask.decision?.kind, "ACCEPTED");
  assert.equal(accepted.surface.document.body, "alpha BETA gamma delta epsilon zeta");
  const reviewRevision = success(await service.readRevision(owner.humanSessionToken, 3));
  assert.equal(reviewRevision.provenance.authority, "REVIEW");
  assert.equal(reviewRevision.provenance.taskId, acceptTask.taskId);

  const committed = await expectStep(service, owner.humanSessionToken, ledger, "Direct result", [1, 1], () =>
    service.submitTaskResult(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: directTask.taskId,
      basedOnRevision: 2,
      resultSummary: "Commit uppercase gamma directly.",
      replacementText: "GAMMA",
    }, worker.sessionInstanceId));
  assert.equal(committed.data.outcome, "COMMITTED");
  assert.equal(committed.surface.tasks.find((task) => task.taskId === directTask.taskId)?.status, "COMPLETED");
  assert.equal(committed.surface.document.body, "alpha BETA GAMMA delta epsilon zeta");
  const directRevision = success(await service.readRevision(owner.humanSessionToken, 4));
  assert.equal(directRevision.provenance.authority, "DIRECT");
  assert.equal(directRevision.provenance.taskId, directTask.taskId);

  const commented = await expectStep(service, owner.humanSessionToken, ledger, "Comment result", [0, 1], () =>
    service.submitTaskResult(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: commentTask.taskId,
      basedOnRevision: 2,
      resultSummary: "No document replacement is required.",
    }, worker.sessionInstanceId));
  assert.equal(commented.data.outcome, "COMMENTED");
  assert.equal(commented.surface.tasks.find((task) => task.taskId === commentTask.taskId)?.status, "COMPLETED");

  const cancelled = await expectStep(service, owner.humanSessionToken, ledger, "cancel task", [0, 1], () =>
    service.cancelTask(owner.humanSessionToken, { requestId: requestId(), taskId: cancelTask.taskId }));
  assert.equal(cancelled.surface.tasks.find((task) => task.taskId === cancelTask.taskId)?.status, "CANCELLED");
  assert.equal(cancelled.surface.threads.find((thread) => thread.threadId === cancelTask.threadId)?.status, "RESOLVED");

  const resolved = await expectStep(service, owner.humanSessionToken, ledger, "resolve standalone thread", [0, 1], () =>
    service.resolveThread(owner.humanSessionToken, { requestId: requestId(), threadId: standaloneThread.threadId }));
  assert.equal(resolved.surface.threads.find((thread) => thread.threadId === standaloneThread.threadId)?.status, "RESOLVED");

  const resolvedAgain = await expectNoDurableChange(service, owner.humanSessionToken, "already-resolved thread no-op", () =>
    service.resolveThread(owner.humanSessionToken, { requestId: requestId(), threadId: standaloneThread.threadId }));
  success(resolvedAgain);

  const restored = await expectStep(service, owner.humanSessionToken, ledger, "restore historical revision", [1, 1], () =>
    service.restoreRevision(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 4,
      revision: 2,
      changeSummary: "Restore the original counter fixture.",
    }));
  assert.equal(restored.surface.document.body, initialBody);
  const restoreRevision = success(await service.readRevision(owner.humanSessionToken, 5));
  assert.equal(restoreRevision.provenance.authority, "RESTORE");
  assert.equal(restoreRevision.provenance.restoredRevision, 2);

  assert.deepEqual(ledger, [
    { operation: "launch template", revision: 1, activityVersion: 1 },
    { operation: "changed human save", revision: 2, activityVersion: 2 },
    { operation: "unchanged human save", revision: 2, activityVersion: 2 },
    { operation: "create reject-path task", revision: 2, activityVersion: 3 },
    { operation: "create accept-path task", revision: 2, activityVersion: 4 },
    { operation: "create Direct task", revision: 2, activityVersion: 5 },
    { operation: "create Comment task", revision: 2, activityVersion: 6 },
    { operation: "create cancellation task", revision: 2, activityVersion: 7 },
    { operation: "create standalone thread", revision: 2, activityVersion: 8 },
    { operation: "human comment", revision: 2, activityVersion: 9 },
    { operation: "agent comment", revision: 2, activityVersion: 10 },
    { operation: "Review proposal for rejection", revision: 2, activityVersion: 11 },
    { operation: "reject Review", revision: 2, activityVersion: 12 },
    { operation: "Review proposal for acceptance", revision: 2, activityVersion: 13 },
    { operation: "accept Review", revision: 3, activityVersion: 14 },
    { operation: "Direct result", revision: 4, activityVersion: 15 },
    { operation: "Comment result", revision: 4, activityVersion: 16 },
    { operation: "cancel task", revision: 4, activityVersion: 17 },
    { operation: "resolve standalone thread", revision: 4, activityVersion: 18 },
    { operation: "restore historical revision", revision: 5, activityVersion: 19 },
  ]);
});

test("D04 observations, presence, waits, failures, aborts, and replays are zero-delta", async () => {
  const requestId = fixedRequestIds(101);
  const service = new LocalRepositoryService({
    now: () => Date.parse("2026-09-02T01:00:00.000Z"),
    waitSecondMs: 1,
  });
  const owner = success(await service.launch({ kind: "PRODUCT_DOCUMENT", displayName: "Owner" }));
  const worker = success(await service.join({ shareToken: owner.shareToken, displayName: "Worker" }));
  success(await service.connectAgent(worker.agentSessionToken, {
    requestId: requestId(), name: "Counter agent",
  }, worker.sessionInstanceId));
  assert.deepEqual(counters(await inspect(service, owner.humanSessionToken)), { revision: 1, activityVersion: 1 });

  success(await expectNoDurableChange(service, owner.humanSessionToken, "inspect", () =>
    service.inspect(owner.humanSessionToken)));
  success(await expectNoDurableChange(service, owner.humanSessionToken, "history read", () =>
    service.readHistory(owner.humanSessionToken, { limit: 10 })));
  success(await expectNoDurableChange(service, owner.humanSessionToken, "revision read", () =>
    service.readRevision(owner.humanSessionToken, 1)));
  success(await expectNoDurableChange(service, owner.humanSessionToken, "task list", () =>
    service.listMyTasks(worker.agentSessionToken, {}, worker.sessionInstanceId)));

  const beforePresence = await inspect(service, owner.humanSessionToken);
  const presenceInput = {
    requestId: requestId(),
    state: "EDITING" as const,
    field: "BODY" as const,
    isTyping: true,
    selectionStart: 0,
    selectionEnd: 4,
    observedRevision: 1,
  };
  success(await service.touchPresence(owner.humanSessionToken, presenceInput));
  const afterPresence = await inspect(service, owner.humanSessionToken);
  assert.deepEqual(counters(afterPresence), counters(beforePresence), "presence must be counter-independent");
  assert.deepEqual(durableState(afterPresence), durableState(beforePresence), "presence must not mutate durable state");
  assert.equal(afterPresence.presence.length, 1);
  const presenceReplay = success(await service.touchPresence(owner.humanSessionToken, presenceInput));
  assert.deepEqual(counters(presenceReplay), { revision: 1, activityVersion: 1 });

  const timedOut = await expectNoDurableChange(service, owner.humanSessionToken, "wait timeout", () =>
    service.waitForMyTasks(worker.agentSessionToken, {
      afterActivityVersion: 1,
      afterRevision: 1,
      timeoutSeconds: 1,
    }, worker.sessionInstanceId));
  assert.equal(success(timedOut).outcome, "TIMEOUT");

  const futureWait = await expectNoDurableChange(service, owner.humanSessionToken, "future-cursor wait failure", () =>
    service.waitForMyTasks(worker.agentSessionToken, {
      afterActivityVersion: 2,
      afterRevision: 2,
      timeoutSeconds: 1,
    }, worker.sessionInstanceId));
  assert.equal(futureWait.ok, false);
  if (!futureWait.ok) assert.equal(futureWait.code, "INVALID_INPUT");

  const abortedSave = {
    requestId: requestId(),
    expectedRevision: 1,
    title: "Aborted title",
    body: "Aborted body",
  };
  const beforeAbort = await inspect(service, owner.humanSessionToken);
  const controller = new AbortController();
  controller.abort(new DOMException("cancel", "AbortError"));
  await assert.rejects(
    service.saveHumanRevision(owner.humanSessionToken, abortedSave, controller.signal),
    { name: "AbortError" },
  );
  const afterAbort = await inspect(service, owner.humanSessionToken);
  assert.deepEqual(durableState(afterAbort), durableState(beforeAbort));
  assert.deepEqual(counters(afterAbort), counters(beforeAbort));

  const saveInput = {
    requestId: requestId(),
    expectedRevision: 1,
    title: "Replay oracle",
    body: "alpha beta gamma",
  };
  const saved = success(await service.saveHumanRevision(owner.humanSessionToken, saveInput));
  assert.deepEqual(counters(saved), { revision: 2, activityVersion: 2 });

  const replayedSave = await expectNoDurableChange(service, owner.humanSessionToken, "content replay", () =>
    service.saveHumanRevision(owner.humanSessionToken, saveInput));
  assert.deepEqual(counters(success(replayedSave)), { revision: 2, activityVersion: 2 });
  const mismatchedSave = await expectNoDurableChange(service, owner.humanSessionToken, "content replay mismatch", () =>
    service.saveHumanRevision(owner.humanSessionToken, { ...saveInput, body: "changed replay input" }));
  assert.equal(mismatchedSave.ok, false);
  if (!mismatchedSave.ok) assert.equal(mismatchedSave.code, "REQUEST_REPLAY_MISMATCH");

  const staleSave = await expectNoDurableChange(service, owner.humanSessionToken, "stale save failure", () =>
    service.saveHumanRevision(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 1,
      title: "Stale title",
      body: "Stale body",
    }));
  assert.equal(staleSave.ok, false);
  if (!staleSave.ok) assert.equal(staleSave.code, "STALE_DOCUMENT");

  const invalidTask = await expectNoDurableChange(service, owner.humanSessionToken, "invalid task failure", () =>
    service.createTask(owner.humanSessionToken, {
      ...taskInput(requestId(), worker, "Invalid Direct scope", "DIRECT", 2, 0, 5),
      anchor: { scope: "DOCUMENT" },
    }));
  assert.equal(invalidTask.ok, false);
  if (!invalidTask.ok) assert.equal(invalidTask.code, "INVALID_INPUT");

  const createInput = taskInput(requestId(), worker, "Replayable Direct task", "DIRECT", 2, 0, 5);
  const created = success(await service.createTask(owner.humanSessionToken, createInput));
  assert.deepEqual(counters(created), { revision: 2, activityVersion: 3 });
  const task = created.tasks.find((entry) => entry.title === createInput.title)!;
  const taskReplay = await expectNoDurableChange(service, owner.humanSessionToken, "coordination replay", () =>
    service.createTask(owner.humanSessionToken, createInput));
  assert.equal(success(taskReplay).tasks.filter((entry) => entry.title === createInput.title).length, 1);
  const taskMismatch = await expectNoDurableChange(service, owner.humanSessionToken, "coordination replay mismatch", () =>
    service.createTask(owner.humanSessionToken, { ...createInput, title: "Changed replay input" }));
  assert.equal(taskMismatch.ok, false);
  if (!taskMismatch.ok) assert.equal(taskMismatch.code, "REQUEST_REPLAY_MISMATCH");

  const available = await expectNoDurableChange(service, owner.humanSessionToken, "wait with available work", () =>
    service.waitForMyTasks(worker.agentSessionToken, {
      afterActivityVersion: 3,
      afterRevision: 2,
      timeoutSeconds: 1,
    }, worker.sessionInstanceId));
  assert.equal(success(available).outcome, "TASKS_AVAILABLE");

  const invalidResult = await expectNoDurableChange(service, owner.humanSessionToken, "mode failure", () =>
    service.submitTaskResult(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: task.taskId,
      basedOnRevision: 2,
      resultSummary: "A Direct task requires replacement text.",
    }, worker.sessionInstanceId));
  assert.equal(invalidResult.ok, false);
  if (!invalidResult.ok) assert.equal(invalidResult.code, "TASK_MODE_VIOLATION");
  const afterInvalidResult = await inspect(service, owner.humanSessionToken);
  assert.equal(afterInvalidResult.tasks.find((entry) => entry.taskId === task.taskId)?.status, "OPEN");

  const commentInput = {
    requestId: requestId(),
    taskId: task.taskId,
    body: "One replayable coordination append.",
  };
  const comment = success(await service.commentOnTask(
    worker.agentSessionToken,
    commentInput,
    worker.sessionInstanceId,
  ));
  assert.equal(comment.activityVersion, 4);
  const commentReplay = await expectNoDurableChange(service, owner.humanSessionToken, "comment replay", () =>
    service.commentOnTask(worker.agentSessionToken, commentInput, worker.sessionInstanceId));
  assert.equal(success(commentReplay).activityVersion, 4);
  assert.equal(
    (await inspect(service, owner.humanSessionToken)).threads.find((thread) => thread.threadId === task.threadId)?.comments.length,
    1,
  );

  const missingTarget = await expectNoDurableChange(service, owner.humanSessionToken, "unauthorized target failure", () =>
    service.commentOnTask(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: "00000000-0000-4000-8000-999999999999",
      body: "This target is not owned.",
    }, worker.sessionInstanceId));
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) assert.equal(missingTarget.code, "UNAUTHORIZED");

  const sameRevisionRestore = await expectNoDurableChange(service, owner.humanSessionToken, "byte-identical restore failure", () =>
    service.restoreRevision(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      revision: 2,
      changeSummary: "Reject a byte-identical restore.",
    }));
  assert.equal(sameRevisionRestore.ok, false);
  if (!sameRevisionRestore.ok) assert.equal(sameRevisionRestore.code, "INVALID_INPUT");

  const finalSurface = await inspect(service, owner.humanSessionToken);
  assert.deepEqual(counters(finalSurface), { revision: 2, activityVersion: 4 });
  assert.equal(finalSurface.history.length, 2);
  assert.equal(finalSurface.tasks.find((entry) => entry.taskId === task.taskId)?.status, "OPEN");
  assert.equal(finalSurface.threads.find((thread) => thread.threadId === task.threadId)?.comments.length, 1);
  await assertHeadIsAtomic(service, owner.humanSessionToken, finalSurface);
});
