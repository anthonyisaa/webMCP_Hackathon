import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type {
  CreateIssueTaskServiceInput,
  IssueSessionBundle,
  IssueWorkspaceSurface,
  RepositoryResult,
} from "@/repository/contracts";
import {
  ISSUE_ACTIVE_TASK_LIMIT,
  ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT,
  ISSUE_STANDALONE_THREAD_LIMIT,
  ISSUE_WORKSPACE_TASK_LIMIT,
} from "@/repository/contracts";
import { LocalRepositoryService } from "./repository-service";

const FIXED_NOW = Date.parse("2026-09-02T00:00:00.000Z");

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function assertRateLimited(result: RepositoryResult<unknown>): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "RATE_LIMITED");
}

function requestIds(): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
  };
}

async function workspace(memberCount: number) {
  const service = new LocalRepositoryService({ now: () => FIXED_NOW });
  const owner = success(await service.launch({
    kind: "POSTMORTEM",
    displayName: "Limit owner",
  }));
  const assignees: IssueSessionBundle[] = [];
  for (let index = 0; index < memberCount; index += 1) {
    assignees.push(success(await service.join({
      shareToken: owner.shareToken,
      displayName: `Limit assignee ${index + 1}`,
    })));
  }
  return { service, owner, assignees, nextRequestId: requestIds() };
}

function taskInput(
  assignee: IssueSessionBundle,
  requestId: string,
  index: number,
  mode: "COMMENT" | "REVIEW" = "COMMENT",
): CreateIssueTaskServiceInput {
  return {
    requestId,
    expectedRevision: 1,
    title: `Boundary task ${index}`,
    category: "GENERAL",
    instruction: "Exercise the exact repository capacity boundary.",
    agentLabel: "Boundary agent",
    mode,
    assignedToMemberId: assignee.selfMemberId,
    anchor: mode === "COMMENT"
      ? { scope: "DOCUMENT" }
      : { scope: "SELECTION", field: "TITLE", rangeStart: 0, rangeEnd: 8 },
  };
}

async function createTask(
  setup: Awaited<ReturnType<typeof workspace>>,
  assignee: IssueSessionBundle,
  index: number,
  mode: "COMMENT" | "REVIEW" = "COMMENT",
): Promise<IssueWorkspaceSurface> {
  return success(await setup.service.createTask(
    setup.owner.humanSessionToken,
    taskInput(assignee, setup.nextRequestId(), index, mode),
  ));
}

async function createProposedTask(
  setup: Awaited<ReturnType<typeof workspace>>,
  assignee: IssueSessionBundle,
  index: number,
): Promise<IssueWorkspaceSurface> {
  const created = await createTask(setup, assignee, index, "REVIEW");
  const task = created.tasks.find((entry) => entry.title === `Boundary task ${index}`);
  assert.ok(task);
  const proposed = success(await setup.service.submitTaskResult(
    assignee.agentSessionToken,
    {
      requestId: setup.nextRequestId(),
      taskId: task.taskId,
      basedOnRevision: 1,
      resultSummary: "Prepared a bounded proposal.",
      replacementText: "Reviewed",
    },
    assignee.sessionInstanceId,
  ));
  assert.equal(proposed.outcome, "PROPOSED");
  return success(await setup.service.inspect(setup.owner.humanSessionToken));
}

function activeTasks(surface: IssueWorkspaceSurface) {
  return surface.tasks.filter((task) => task.status === "OPEN" || task.status === "PROPOSED");
}

function assertRejectedWithoutMutation(
  before: IssueWorkspaceSurface,
  after: IssueWorkspaceSurface,
): void {
  assert.deepEqual(after, before);
  assert.equal(after.document.revision, before.document.revision);
  assert.equal(after.document.activityVersion, before.document.activityVersion);
  assert.equal(after.tasks.length, before.tasks.length);
  assert.equal(after.threads.length, before.threads.length);
}

describe.sequential("repository capacity boundaries", () => {
  test("50 active tasks per assignee count Open plus Proposed and reject atomically", async () => {
    const setup = await workspace(1);
    const [assignee] = setup.assignees;
    assert.ok(assignee);

    await createProposedTask(setup, assignee, 1);
    let surface: IssueWorkspaceSurface | undefined;
    for (let index = 2; index <= ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT; index += 1) {
      surface = await createTask(setup, assignee, index);
    }
    assert.ok(surface);
    assert.equal(activeTasks(surface).length, ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT);
    assert.equal(activeTasks(surface).filter((task) => task.status === "PROPOSED").length, 1);
    assert.equal(surface.document.revision, 1);
    assert.equal(surface.document.activityVersion, ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT + 2);

    const beforeFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRateLimited(await setup.service.createTask(
      setup.owner.humanSessionToken,
      taskInput(assignee, setup.nextRequestId(), ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT + 1),
    ));
    const afterFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRejectedWithoutMutation(beforeFailure, afterFailure);

    const cancellable = afterFailure.tasks.find((task) => task.status === "OPEN");
    assert.ok(cancellable);
    success(await setup.service.cancelTask(setup.owner.humanSessionToken, {
      requestId: setup.nextRequestId(),
      taskId: cancellable.taskId,
    }));
    const replacement = await createTask(
      setup,
      assignee,
      ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT + 2,
    );
    assert.equal(activeTasks(replacement).length, ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT);
    assert.equal(replacement.tasks.length, ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT + 1);
    assert.equal(replacement.threads.length, ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT + 1);
    assert.ok(replacement.tasks.some((task) => task.taskKey === "TASK-51"));
  });

  test("100 active tasks per issue count Proposed work and reject atomically", async () => {
    const setup = await workspace(3);
    const [first, second, third] = setup.assignees;
    assert.ok(first);
    assert.ok(second);
    assert.ok(third);

    await createProposedTask(setup, first, 1);
    await createProposedTask(setup, second, 2);
    let surface: IssueWorkspaceSurface | undefined;
    for (let index = 0; index < ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT - 1; index += 1) {
      surface = await createTask(setup, first, index + 3);
      surface = await createTask(
        setup,
        second,
        index + 3 + ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT,
      );
    }
    assert.ok(surface);
    assert.equal(activeTasks(surface).length, ISSUE_ACTIVE_TASK_LIMIT);
    assert.equal(activeTasks(surface).filter((task) => task.status === "PROPOSED").length, 2);
    assert.equal(
      activeTasks(surface).filter((task) => task.assignee.memberId === first.selfMemberId).length,
      ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT,
    );
    assert.equal(
      activeTasks(surface).filter((task) => task.assignee.memberId === second.selfMemberId).length,
      ISSUE_ASSIGNEE_ACTIVE_TASK_LIMIT,
    );

    const beforeFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRateLimited(await setup.service.createTask(
      setup.owner.humanSessionToken,
      taskInput(third, setup.nextRequestId(), ISSUE_ACTIVE_TASK_LIMIT + 1),
    ));
    const afterFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRejectedWithoutMutation(beforeFailure, afterFailure);

    const cancellable = afterFailure.tasks.find((task) =>
      task.status === "OPEN" && task.assignee.memberId === first.selfMemberId);
    assert.ok(cancellable);
    success(await setup.service.cancelTask(setup.owner.humanSessionToken, {
      requestId: setup.nextRequestId(),
      taskId: cancellable.taskId,
    }));
    const replacement = await createTask(setup, third, ISSUE_ACTIVE_TASK_LIMIT + 2);
    assert.equal(activeTasks(replacement).length, ISSUE_ACTIVE_TASK_LIMIT);
    assert.equal(replacement.tasks.length, ISSUE_ACTIVE_TASK_LIMIT + 1);
    assert.equal(replacement.threads.length, ISSUE_ACTIVE_TASK_LIMIT + 1);
    assert.ok(replacement.tasks.some((task) => task.taskKey === "TASK-101"));
  });

  test("500 lifetime tasks remain capped after all work is terminal", async () => {
    const setup = await workspace(1);
    const [assignee] = setup.assignees;
    assert.ok(assignee);

    let surface: IssueWorkspaceSurface | undefined;
    for (let index = 1; index <= ISSUE_WORKSPACE_TASK_LIMIT; index += 1) {
      const created = await createTask(setup, assignee, index);
      const task = created.tasks.find((entry) => entry.title === `Boundary task ${index}`);
      assert.ok(task);
      surface = success(await setup.service.cancelTask(setup.owner.humanSessionToken, {
        requestId: setup.nextRequestId(),
        taskId: task.taskId,
      }));
    }
    assert.ok(surface);
    assert.equal(surface.tasks.length, ISSUE_WORKSPACE_TASK_LIMIT);
    assert.equal(surface.threads.length, ISSUE_WORKSPACE_TASK_LIMIT);
    assert.equal(activeTasks(surface).length, 0);
    assert.equal(surface.tasks.every((task) => task.status === "CANCELLED"), true);
    assert.equal(surface.document.revision, 1);
    assert.equal(surface.document.activityVersion, 1 + (2 * ISSUE_WORKSPACE_TASK_LIMIT));
    assert.equal(new Set(surface.tasks.map((task) => task.taskKey)).size, ISSUE_WORKSPACE_TASK_LIMIT);
    assert.ok(surface.tasks.some((task) => task.taskKey === "TASK-500"));

    const beforeFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRateLimited(await setup.service.createTask(
      setup.owner.humanSessionToken,
      taskInput(assignee, setup.nextRequestId(), ISSUE_WORKSPACE_TASK_LIMIT + 1),
    ));
    const afterFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRejectedWithoutMutation(beforeFailure, afterFailure);
    assert.equal(afterFailure.tasks.some((task) => task.taskKey === "TASK-501"), false);
  }, 45_000);

  test("500 standalone threads are a lifetime cap and reject atomically", async () => {
    const setup = await workspace(0);

    let surface: IssueWorkspaceSurface | undefined;
    for (let index = 1; index <= ISSUE_STANDALONE_THREAD_LIMIT; index += 1) {
      surface = success(await setup.service.createThread(setup.owner.humanSessionToken, {
        requestId: setup.nextRequestId(),
        expectedRevision: 1,
        body: `Boundary discussion ${index}`,
        anchor: { scope: "DOCUMENT" },
      }));
    }
    assert.ok(surface);
    assert.equal(surface.tasks.length, 0);
    assert.equal(surface.threads.length, ISSUE_STANDALONE_THREAD_LIMIT);
    assert.equal(surface.threads.every((thread) => thread.taskId === null), true);
    assert.equal(surface.document.revision, 1);
    assert.equal(surface.document.activityVersion, 1 + ISSUE_STANDALONE_THREAD_LIMIT);

    const beforeFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRateLimited(await setup.service.createThread(setup.owner.humanSessionToken, {
      requestId: setup.nextRequestId(),
      expectedRevision: 1,
      body: "One discussion beyond the lifetime cap",
      anchor: { scope: "DOCUMENT" },
    }));
    const afterFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRejectedWithoutMutation(beforeFailure, afterFailure);

    const resolvable = afterFailure.threads.find((thread) => thread.status === "OPEN");
    assert.ok(resolvable);
    success(await setup.service.resolveThread(setup.owner.humanSessionToken, {
      requestId: setup.nextRequestId(),
      threadId: resolvable.threadId,
    }));
    const beforeResolvedFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRateLimited(await setup.service.createThread(setup.owner.humanSessionToken, {
      requestId: setup.nextRequestId(),
      expectedRevision: 1,
      body: "Resolved discussions do not free lifetime capacity",
      anchor: { scope: "DOCUMENT" },
    }));
    const afterResolvedFailure = success(await setup.service.inspect(setup.owner.humanSessionToken));
    assertRejectedWithoutMutation(beforeResolvedFailure, afterResolvedFailure);
  }, 45_000);
});
