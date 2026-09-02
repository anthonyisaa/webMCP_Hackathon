import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test, vi } from "vitest";

import {
  ISSUE_WAIT_DEFAULT_SECONDS,
  ISSUE_WAIT_MAX_SECONDS,
  type IssueSessionBundle,
  type RepositoryResult,
  type WaitForMyIssueTasksOutcome,
} from "@/repository/contracts";
import { LocalRepositoryService } from "./repository-service";

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function assertFailureCode(
  result: RepositoryResult<unknown>,
  code: string,
): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

async function launchWorkspace(waitSecondMs = 1): Promise<{
  service: LocalRepositoryService;
  owner: IssueSessionBundle;
  assignee: IssueSessionBundle;
  pageSessionId: string;
}> {
  const service = new LocalRepositoryService({ waitSecondMs });
  const owner = success(await service.launch({
    kind: "POSTMORTEM",
    displayName: "Wait owner",
  }));
  const assignee = success(await service.join({
    shareToken: owner.shareToken,
    displayName: "Wait assignee",
  }));
  const pageSessionId = randomUUID();
  success(await service.connectAgent(assignee.agentSessionToken, {
    requestId: randomUUID(), name: "Wait agent",
  }, pageSessionId));
  return { service, owner, assignee, pageSessionId };
}

async function createCommentTask(
  service: LocalRepositoryService,
  owner: IssueSessionBundle,
  assignedToMemberId: string,
  sequence: number,
): Promise<void> {
  success(await service.createTask(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: `Wait task ${sequence}`,
    category: "GENERAL",
    instruction: `Exercise wait discipline ${sequence}.`,
    agentLabel: `Wait agent ${sequence}`,
    mode: "COMMENT",
    assignedToMemberId,
    anchor: { scope: "DOCUMENT" },
  }));
}

function assertTimeout(
  outcome: WaitForMyIssueTasksOutcome,
  activityVersion: number,
): void {
  assert.deepEqual(outcome, {
    outcome: "TIMEOUT",
    tasks: [],
    revision: 1,
    activityVersion,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

test("D18 uses one absolute deadline across repeated unrelated notifications", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { service, owner, assignee, pageSessionId } = await launchWorkspace();
  let settled = false;
  const waiting = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: ISSUE_WAIT_MAX_SECONDS,
  }, pageSessionId).then((result) => {
    settled = true;
    return result;
  });
  await vi.advanceTimersByTimeAsync(0);

  for (const [targetTime, sequence] of [[5, 1], [10, 2], [15, 3], [19, 4]] as const) {
    await vi.advanceTimersByTimeAsync(targetTime - Date.now());
    await createCommentTask(service, owner, owner.selfMemberId, sequence);
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(settled, false, `unrelated activity at ${targetTime}ms must not resolve the wait`);
  }

  await vi.advanceTimersByTimeAsync(1);
  assertTimeout(success(await waiting), 5);
  assert.equal(Date.now(), ISSUE_WAIT_MAX_SECONDS);
});

test("D18 enforces the default and maximum 20-second boundary without real sleeps", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { service, assignee, pageSessionId } = await launchWorkspace();

  const maximum = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: ISSUE_WAIT_MAX_SECONDS,
  }, pageSessionId);
  await vi.advanceTimersByTimeAsync(ISSUE_WAIT_MAX_SECONDS - 1);
  let maximumSettled = false;
  void maximum.then(() => {
    maximumSettled = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(maximumSettled, false);
  await vi.advanceTimersByTimeAsync(1);
  assertTimeout(success(await maximum), 1);
  assert.equal(Date.now(), ISSUE_WAIT_MAX_SECONDS);

  const defaulted = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
  }, pageSessionId);
  await vi.advanceTimersByTimeAsync(ISSUE_WAIT_DEFAULT_SECONDS);
  assertTimeout(success(await defaulted), 1);
  assert.equal(Date.now(), ISSUE_WAIT_MAX_SECONDS + ISSUE_WAIT_DEFAULT_SECONDS);

  assertFailureCode(await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: ISSUE_WAIT_MAX_SECONDS + 1,
  }, pageSessionId), "INVALID_INPUT");
});

test("D18 rejects both future cursors before reserving the page wait", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { service, assignee, pageSessionId } = await launchWorkspace();

  assertFailureCode(await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 2,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId), "INVALID_INPUT");
  assertFailureCode(await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 2,
    timeoutSeconds: 1,
  }, pageSessionId), "INVALID_INPUT");

  const valid = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId);
  await vi.advanceTimersByTimeAsync(1);
  assertTimeout(success(await valid), 1);
});

test("D18 rejects a duplicate page wait and abort releases listener and wait key", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { service, assignee, pageSessionId } = await launchWorkspace();
  const controller = new AbortController();
  const removeListener = vi.spyOn(controller.signal, "removeEventListener");

  const first = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: ISSUE_WAIT_MAX_SECONDS,
  }, pageSessionId, controller.signal);
  await vi.advanceTimersByTimeAsync(0);
  assertFailureCode(await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId), "WAIT_ALREADY_ACTIVE");

  controller.abort(new DOMException("cancel wait", "AbortError"));
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(
    removeListener.mock.calls.some(([type]) => type === "abort"),
    true,
  );

  const afterAbort = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId);
  await vi.advanceTimersByTimeAsync(1);
  assertTimeout(success(await afterAbort), 1);
});

test("D18 returns owned Open work immediately", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { service, owner, assignee, pageSessionId } = await launchWorkspace();
  await createCommentTask(service, owner, assignee.selfMemberId, 1);

  const before = Date.now();
  const available = success(await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 2,
    afterRevision: 1,
    timeoutSeconds: ISSUE_WAIT_MAX_SECONDS,
  }, pageSessionId));
  assert.equal(Date.now(), before);
  assert.equal(available.outcome, "TASKS_AVAILABLE");
  assert.equal(available.revision, 1);
  assert.equal(available.activityVersion, 2);
  assert.equal(available.tasks.length, 1);
  assert.equal(available.tasks[0]?.task.assignee.memberId, assignee.selfMemberId);
  assert.equal(available.tasks[0]?.task.status, "OPEN");
});

test("D18 observes mutations issued immediately after wait subscription", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { service, owner, assignee, pageSessionId } = await launchWorkspace();

  // waitForMyTasks installs its in-process listener synchronously before yielding its
  // Promise, so this is the tightest lost-wake interleaving exposed by the public API.
  const waiting = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: ISSUE_WAIT_MAX_SECONDS,
  }, pageSessionId);
  await createCommentTask(service, owner, assignee.selfMemberId, 1);
  await vi.advanceTimersByTimeAsync(0);

  const available = success(await waiting);
  assert.equal(Date.now(), 0);
  assert.equal(available.outcome, "TASKS_AVAILABLE");
  assert.equal(available.activityVersion, 2);
  assert.equal(available.tasks.length, 1);
});

test("D18 returns DOCUMENT_CHANGED when the revision advances during a wait", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { service, owner, assignee, pageSessionId } = await launchWorkspace();

  const waiting = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: ISSUE_WAIT_MAX_SECONDS,
  }, pageSessionId);
  success(await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Changed while waiting",
    body: "A new immutable document revision.",
  }));
  await vi.advanceTimersByTimeAsync(0);

  assert.deepEqual(success(await waiting), {
    outcome: "DOCUMENT_CHANGED",
    tasks: [],
    revision: 2,
    activityVersion: 2,
  });
  assert.equal(Date.now(), 0);
});
