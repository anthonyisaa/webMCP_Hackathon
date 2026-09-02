import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "vitest";

import {
  ISSUE_HISTORY_DEFAULT_LIMIT,
  ISSUE_HISTORY_MAX_LIMIT,
  type IssueSessionBundle,
  type RepositoryResult,
} from "@/repository/contracts";
import { LocalRepositoryService } from "./repository-service";

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

async function saveRevisions(
  service: LocalRepositoryService,
  owner: IssueSessionBundle,
  finalRevision: number,
): Promise<void> {
  for (let expectedRevision = 1; expectedRevision < finalRevision; expectedRevision += 1) {
    const nextRevision = expectedRevision + 1;
    const saved = success(await service.saveHumanRevision(owner.humanSessionToken, {
      requestId: randomUUID(),
      expectedRevision,
      title: `History oracle r${nextRevision}`,
      body: `Immutable body for revision ${nextRevision}.`,
    }));
    assert.equal(saved.document.revision, nextRevision);
  }
}

test("history pagination applies default/min/max bounds and a strict gap-free cursor", async () => {
  const service = new LocalRepositoryService();
  const owner = success(await service.launch({ kind: "PRODUCT_DOCUMENT", displayName: "History owner" }));
  const finalRevision = ISSUE_HISTORY_MAX_LIMIT + 6;
  await saveRevisions(service, owner, finalRevision);

  const defaultPage = success(await service.readHistory(owner.humanSessionToken, {}));
  assert.equal(defaultPage.revisions.length, ISSUE_HISTORY_DEFAULT_LIMIT);
  assert.deepEqual(
    defaultPage.revisions.map(({ revision }) => revision),
    Array.from({ length: ISSUE_HISTORY_DEFAULT_LIMIT }, (_, index) => finalRevision - index),
  );
  assert.equal(defaultPage.hasMoreOlder, true);
  assert.equal(defaultPage.nextBeforeRevision, finalRevision - ISSUE_HISTORY_DEFAULT_LIMIT + 1);
  assert.equal(defaultPage.currentRevision, finalRevision);

  const minimumPage = success(await service.readHistory(owner.humanSessionToken, { limit: 1 }));
  assert.deepEqual(minimumPage.revisions.map(({ revision }) => revision), [finalRevision]);
  assert.equal(minimumPage.hasMoreOlder, true);
  assert.equal(minimumPage.nextBeforeRevision, finalRevision);

  const maximumPage = success(await service.readHistory(owner.humanSessionToken, {
    limit: ISSUE_HISTORY_MAX_LIMIT,
  }));
  assert.deepEqual(
    maximumPage.revisions.map(({ revision }) => revision),
    Array.from({ length: ISSUE_HISTORY_MAX_LIMIT }, (_, index) => finalRevision - index),
  );
  assert.equal(maximumPage.hasMoreOlder, true);
  assert.equal(maximumPage.nextBeforeRevision, finalRevision - ISSUE_HISTORY_MAX_LIMIT + 1);

  const maximumSecondPage = success(await service.readHistory(owner.humanSessionToken, {
    beforeRevision: maximumPage.nextBeforeRevision!,
    limit: ISSUE_HISTORY_MAX_LIMIT,
  }));
  assert.deepEqual(maximumSecondPage.revisions.map(({ revision }) => revision), [6, 5, 4, 3, 2, 1]);
  assert.equal(maximumSecondPage.hasMoreOlder, false);
  assert.equal(maximumSecondPage.nextBeforeRevision, null);

  const traversed: number[] = [];
  let beforeRevision: number | undefined;
  do {
    const page = success(await service.readHistory(owner.humanSessionToken, {
      ...(beforeRevision === undefined ? {} : { beforeRevision }),
      limit: 7,
    }));
    traversed.push(...page.revisions.map(({ revision }) => revision));
    if (!page.hasMoreOlder) {
      assert.equal(page.nextBeforeRevision, null);
      break;
    }
    assert.equal(page.nextBeforeRevision, page.revisions.at(-1)?.revision);
    beforeRevision = page.nextBeforeRevision!;
  } while (true);

  assert.deepEqual(
    traversed,
    Array.from({ length: finalRevision }, (_, index) => finalRevision - index),
  );
  assert.equal(new Set(traversed).size, finalRevision);

  const strictCursor = success(await service.readHistory(owner.humanSessionToken, {
    beforeRevision: 8,
    limit: 3,
  }));
  assert.deepEqual(strictCursor.revisions.map(({ revision }) => revision), [7, 6, 5]);

  const exhausted = success(await service.readHistory(owner.humanSessionToken, {
    beforeRevision: 1,
    limit: 1,
  }));
  assert.deepEqual(exhausted.revisions, []);
  assert.equal(exhausted.hasMoreOlder, false);
  assert.equal(exhausted.nextBeforeRevision, null);

  for (const invalidLimit of [0, ISSUE_HISTORY_MAX_LIMIT + 1]) {
    const invalid = await service.readHistory(owner.humanSessionToken, { limit: invalidLimit });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "INVALID_INPUT");
  }
});

test("wait returns owned work immediately and ignores unrelated activity until timeout", async () => {
  const service = new LocalRepositoryService({ waitSecondMs: 5 });
  const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Owner" }));
  const assignee = success(await service.join({ shareToken: owner.shareToken, displayName: "Assignee" }));
  const pageSessionId = randomUUID();
  success(await service.connectAgent(assignee.agentSessionToken, {
    requestId: randomUUID(), name: "Assignee agent",
  }, pageSessionId));

  const future = await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 2,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId);
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.code, "INVALID_INPUT");

  const explicitTimeout = success(await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId));
  assert.deepEqual(explicitTimeout, {
    outcome: "TIMEOUT",
    tasks: [],
    revision: 1,
    activityVersion: 1,
  });

  // A completed wait must release the page/member slot for the next wait.
  const unrelatedWait = service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId);
  const unrelatedSurface = success(await service.createTask(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Owner-only comment task",
    category: "GENERAL",
    instruction: "Record a note without changing the document.",
    agentLabel: "Owner agent",
    mode: "COMMENT",
    assignedToMemberId: owner.selfMemberId,
    anchor: { scope: "DOCUMENT" },
  }));
  assert.equal(unrelatedSurface.document.revision, 1);
  assert.equal(unrelatedSurface.document.activityVersion, 2);

  const unrelatedOutcome = success(await unrelatedWait);
  assert.deepEqual(unrelatedOutcome, {
    outcome: "TIMEOUT",
    tasks: [],
    revision: 1,
    activityVersion: 2,
  });

  const assignedSurface = success(await service.createTask(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Assignee comment task",
    category: "GENERAL",
    instruction: "Summarize the document without editing it.",
    agentLabel: "Assignee agent",
    mode: "COMMENT",
    assignedToMemberId: assignee.selfMemberId,
    anchor: { scope: "DOCUMENT" },
  }));
  assert.equal(assignedSurface.document.activityVersion, 3);

  const immediate = success(await service.waitForMyTasks(assignee.agentSessionToken, {
    afterActivityVersion: 3,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId));
  assert.equal(immediate.outcome, "TASKS_AVAILABLE");
  assert.equal(immediate.revision, 1);
  assert.equal(immediate.activityVersion, 3);
  assert.equal(immediate.tasks.length, 1);
  assert.equal(immediate.tasks[0]?.task.assignee.memberId, assignee.selfMemberId);
  assert.equal(immediate.tasks[0]?.task.status, "OPEN");
});
