import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type {
  CreateIssueTaskServiceInput,
  IssueSessionBundle,
  IssueWorkspaceSurface,
  RepositoryResult,
} from "@/repository/contracts";
import {
  ISSUE_AGENT_LABEL_MAX_LENGTH,
  ISSUE_CHANGE_SUMMARY_MAX_LENGTH,
  ISSUE_EVIDENCE_REF_LIMIT,
  ISSUE_EVIDENCE_REF_MAX_LENGTH,
  ISSUE_TASK_INSTRUCTION_MAX_LENGTH,
  ISSUE_TASK_TITLE_MAX_LENGTH,
  ISSUE_TITLE_MAX_LENGTH,
} from "@/repository/contracts";
import { replaceIssueRange } from "@/repository/range";
import { LocalRepositoryService } from "./repository-service";

const FIXED_NOW = Date.parse("2026-09-02T00:00:00.000Z");

let requestSequence = 0;

function requestId(): string {
  requestSequence += 1;
  return `00000000-0000-4000-8000-${requestSequence.toString(16).padStart(12, "0")}`;
}

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function assertFailure(
  result: RepositoryResult<unknown>,
  code: "INVALID_INPUT" | "NOT_FOUND" | "STALE_DOCUMENT" | "STALE_TASK_CONTEXT" | "TASK_MODE_VIOLATION",
): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

function pointRange(value: string, needle: string): { start: number; end: number } {
  const valuePoints = Array.from(value);
  const needlePoints = Array.from(needle);
  const start = valuePoints.findIndex((_, candidateStart) =>
    needlePoints.every((point, offset) => valuePoints[candidateStart + offset] === point));
  assert.notEqual(start, -1, `missing ${needle}`);
  return { start, end: start + needlePoints.length };
}

async function workspace(body = "alpha 😀 target omega") {
  const service = new LocalRepositoryService({ now: () => FIXED_NOW });
  const owner = success(await service.launch({
    kind: "POSTMORTEM",
    displayName: "Adversarial owner",
  }));
  const worker = success(await service.join({
    shareToken: owner.shareToken,
    displayName: "Adversarial worker",
  }));
  const surface = success(await service.saveHumanRevision(owner.humanSessionToken, {
    requestId: requestId(),
    expectedRevision: 1,
    title: "Adversarial issue",
    body,
    changeSummary: "Install deterministic adversarial content.",
  }));
  return { service, owner, worker, surface };
}

function taskInput(
  assignee: IssueSessionBundle,
  body: string,
  needle: string,
  title: string,
  mode: "COMMENT" | "REVIEW" | "DIRECT" = "DIRECT",
  expectedRevision = 2,
): CreateIssueTaskServiceInput {
  const range = pointRange(body, needle);
  return {
    requestId: requestId(),
    expectedRevision,
    title,
    category: "GENERAL",
    instruction: "Change only the exact delegated selection.",
    agentLabel: "Adversarial agent",
    mode,
    assignedToMemberId: assignee.selfMemberId,
    anchor: {
      scope: "SELECTION",
      field: "BODY",
      rangeStart: range.start,
      rangeEnd: range.end,
    },
  };
}

function namedTask(surface: IssueWorkspaceSurface, title: string) {
  const task = surface.tasks.find((entry) => entry.title === title);
  assert.ok(task, `missing task ${title}`);
  return task;
}

describe.sequential("repository adversarial evaluation matrix", () => {
  test("D06: the first competing terminal action wins and resolved work stays readable", async () => {
    for (const first of ["cancel", "submit"] as const) {
      const setup = await workspace();
      const created = success(await setup.service.createTask(
        setup.owner.humanSessionToken,
        taskInput(setup.worker, setup.surface.document.body, "target", `Race ${first}`),
      ));
      const task = namedTask(created, `Race ${first}`);
      const cancel = () => setup.service.cancelTask(setup.owner.humanSessionToken, {
        requestId: requestId(),
        taskId: task.taskId,
      });
      const submit = () => setup.service.submitTaskResult(setup.worker.agentSessionToken, {
        requestId: requestId(),
        taskId: task.taskId,
        basedOnRevision: 2,
        resultSummary: "Win the terminal race with one atomic replacement.",
        replacementText: "TARGET",
      }, setup.worker.sessionInstanceId);
      const operations = first === "cancel" ? [cancel, submit] : [submit, cancel];
      const [winner, loser] = await Promise.all(operations.map((operation) => operation()));

      assert.equal(winner.ok, true, `${first} should win when invoked first`);
      assertFailure(loser, "TASK_MODE_VIOLATION");
      const final = success(await setup.service.inspect(setup.owner.humanSessionToken));
      const finalTask = namedTask(final, `Race ${first}`);
      assert.equal(finalTask.status, first === "cancel" ? "CANCELLED" : "COMPLETED");
      assert.equal(final.document.revision, first === "cancel" ? 2 : 3);
      assert.equal(final.document.activityVersion, 4);
      const listed = success(await setup.service.listMyTasks(
        setup.worker.agentSessionToken,
        { includeResolved: true },
        setup.worker.sessionInstanceId,
      ));
      assert.equal(listed.tasks.length, 1);
      assert.equal(listed.tasks[0]?.task.status, finalTask.status);
      assert.equal(listed.tasks[0]?.thread.status, "RESOLVED");
    }

    for (const first of ["accept", "reject"] as const) {
      const setup = await workspace();
      const created = success(await setup.service.createTask(
        setup.owner.humanSessionToken,
        taskInput(setup.worker, setup.surface.document.body, "target", `Decision ${first}`, "REVIEW"),
      ));
      const task = namedTask(created, `Decision ${first}`);
      const proposed = success(await setup.service.submitTaskResult(
        setup.worker.agentSessionToken,
        {
          requestId: requestId(),
          taskId: task.taskId,
          basedOnRevision: 2,
          resultSummary: "Prepare one proposal for the terminal decision race.",
          replacementText: "TARGET",
        },
        setup.worker.sessionInstanceId,
      ));
      assert.equal(proposed.outcome, "PROPOSED");
      const accept = () => setup.service.acceptTaskProposal(setup.owner.humanSessionToken, {
        requestId: requestId(),
        taskId: task.taskId,
        expectedRevision: 2,
        note: "Accept first.",
      });
      const reject = () => setup.service.rejectTaskProposal(setup.owner.humanSessionToken, {
        requestId: requestId(),
        taskId: task.taskId,
        expectedRevision: 2,
        note: "Reject first.",
      });
      const operations = first === "accept" ? [accept, reject] : [reject, accept];
      const [winner, loser] = await Promise.all(operations.map((operation) => operation()));

      assert.equal(winner.ok, true, `${first} should win when invoked first`);
      assertFailure(loser, first === "accept" ? "STALE_DOCUMENT" : "TASK_MODE_VIOLATION");
      const final = success(await setup.service.inspect(setup.owner.humanSessionToken));
      const finalTask = namedTask(final, `Decision ${first}`);
      assert.equal(finalTask.status, first === "accept" ? "COMPLETED" : "REJECTED");
      assert.equal(finalTask.decision?.kind, first === "accept" ? "ACCEPTED" : "REJECTED");
      assert.equal(final.document.revision, first === "accept" ? 3 : 2);
      assert.equal(final.document.activityVersion, 5);
    }
  });

  test("D07: durable assignment accepts an absent member and rejects missing or cross-issue IDs", async () => {
    const service = new LocalRepositoryService({ now: () => FIXED_NOW });
    const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Issue A owner" }));
    const absentMember = success(await service.join({
      shareToken: owner.shareToken,
      displayName: "Durable absent member",
    }));
    const otherIssue = success(await service.launch({
      kind: "PRODUCT_DOCUMENT",
      displayName: "Issue B owner",
    }));
    const before = success(await service.inspect(owner.humanSessionToken));
    assert.deepEqual(before.presence, []);

    for (const assignedToMemberId of [
      "00000000-0000-4000-8000-ffffffffffff",
      otherIssue.selfMemberId,
    ]) {
      const rejected = await service.createTask(owner.humanSessionToken, {
        requestId: requestId(),
        expectedRevision: 1,
        title: "Reject isolated membership",
        category: "GENERAL",
        instruction: "Do not assign outside this issue.",
        agentLabel: "Isolation agent",
        mode: "COMMENT",
        assignedToMemberId,
        anchor: { scope: "DOCUMENT" },
      });
      assertFailure(rejected, "NOT_FOUND");
      assert.deepEqual(success(await service.inspect(owner.humanSessionToken)), before);
    }

    const assigned = success(await service.createTask(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 1,
      title: "Assign durable absent member",
      category: "GENERAL",
      instruction: "Assignment depends on membership, not advisory presence.",
      agentLabel: "Durable agent",
      mode: "COMMENT",
      assignedToMemberId: absentMember.selfMemberId,
      anchor: { scope: "DOCUMENT" },
    }));
    const task = namedTask(assigned, "Assign durable absent member");
    assert.equal(task.assignee.memberId, absentMember.selfMemberId);
    assert.deepEqual(assigned.presence, []);
  });

  test("D12: Unicode before/after edits rebase while enclosure, ambiguity, and changed text fail closed", async () => {
    const original = "🧭 alpha 😀 target Ω tail";
    const originalRange = pointRange(original, "target");
    const safeCases = [
      { name: "before", next: `前置 ${original}`, shift: Array.from("前置 ").length },
      { name: "after", next: `${original} 後置`, shift: 0 },
    ] as const;

    for (const scenario of safeCases) {
      const setup = await workspace(original);
      const title = `Unicode ${scenario.name}`;
      const created = success(await setup.service.createTask(
        setup.owner.humanSessionToken,
        taskInput(setup.worker, original, "target", title),
      ));
      const createdTask = namedTask(created, title);
      const saved = success(await setup.service.saveHumanRevision(setup.owner.humanSessionToken, {
        requestId: requestId(),
        expectedRevision: 2,
        title: setup.surface.document.title,
        body: scenario.next,
        changeSummary: `Apply a disjoint Unicode edit ${scenario.name} the target.`,
      }));
      const rebased = namedTask(saved, title);
      assert.deepEqual(rebased.creationAnchor, createdTask.creationAnchor);
      assert.equal(rebased.anchor.scope, "SELECTION");
      if (rebased.anchor.scope === "SELECTION") {
        assert.deepEqual(
          {
            start: rebased.anchor.rangeStart,
            end: rebased.anchor.rangeEnd,
            text: rebased.anchor.selectedText,
            revision: rebased.anchor.anchorRevision,
            state: rebased.anchor.anchorState,
          },
          {
            start: originalRange.start + scenario.shift,
            end: originalRange.end + scenario.shift,
            text: "target",
            revision: 3,
            state: "ACTIVE",
          },
        );
      }
      const committed = success(await setup.service.submitTaskResult(
        setup.worker.agentSessionToken,
        {
          requestId: requestId(),
          taskId: rebased.taskId,
          basedOnRevision: 2,
          resultSummary: "Commit against the safely rebased live Unicode target.",
          replacementText: "TARGET",
        },
        setup.worker.sessionInstanceId,
      ));
      assert.equal(committed.outcome, "COMMITTED");
      if (committed.outcome === "COMMITTED") {
        assert.equal(committed.revision.body, scenario.next.replace("target", "TARGET"));
      }
    }

    const conflictCases = [
      {
        name: "anchor encloses splice",
        original: "pre abcde post",
        needle: "abcde",
        next: "pre abXde post",
      },
      {
        name: "changed selected text",
        original: "pre target post",
        needle: "target",
        next: "pre replacement post",
      },
      {
        name: "ambiguous edits around unchanged text",
        original: "left target right",
        needle: "target",
        next: "LEFT target RIGHT",
      },
    ] as const;

    for (const scenario of conflictCases) {
      const setup = await workspace(scenario.original);
      const created = success(await setup.service.createTask(
        setup.owner.humanSessionToken,
        taskInput(setup.worker, scenario.original, scenario.needle, scenario.name),
      ));
      const task = namedTask(created, scenario.name);
      const staleSurface = success(await setup.service.saveHumanRevision(
        setup.owner.humanSessionToken,
        {
          requestId: requestId(),
          expectedRevision: 2,
          title: setup.surface.document.title,
          body: scenario.next,
          changeSummary: `Create the ${scenario.name} conflict.`,
        },
      ));
      const staleTask = namedTask(staleSurface, scenario.name);
      assert.equal(staleTask.status, "STALE");
      assert.equal(staleTask.anchor.scope, "SELECTION");
      if (staleTask.anchor.scope === "SELECTION") {
        assert.equal(staleTask.anchor.anchorState, "STALE");
      }

      const beforeRejectedResult = success(await setup.service.inspect(
        setup.owner.humanSessionToken,
      ));
      const rejected = await setup.service.submitTaskResult(
        setup.worker.agentSessionToken,
        {
          requestId: requestId(),
          taskId: task.taskId,
          basedOnRevision: 2,
          resultSummary: "A stale target must never commit.",
          replacementText: "forbidden",
        },
        setup.worker.sessionInstanceId,
      );
      assertFailure(rejected, "STALE_TASK_CONTEXT");
      assert.deepEqual(
        success(await setup.service.inspect(setup.owner.humanSessionToken)),
        beforeRejectedResult,
      );
    }
  });

  test("D14: restore appends history, preserves matching live anchors, and never rewrites old snapshots", async () => {
    const bodyR2 = "α 😀 keep tail";
    const bodyR3 = `${bodyR2} added`;
    const setup = await workspace(bodyR2);
    const keepRange = pointRange(bodyR2, "keep");
    let surface = success(await setup.service.createTask(
      setup.owner.humanSessionToken,
      taskInput(setup.worker, bodyR2, "keep", "Keep across restore"),
    ));
    const keepAtCreation = namedTask(surface, "Keep across restore");
    surface = success(await setup.service.createThread(setup.owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      body: "This standalone anchor should remain live across restore.",
      anchor: {
        scope: "SELECTION",
        field: "BODY",
        rangeStart: keepRange.start,
        rangeEnd: keepRange.end,
      },
    }));
    const standaloneThreadId = surface.threads.find((thread) => thread.taskId === null)?.threadId;
    assert.ok(standaloneThreadId);
    surface = success(await setup.service.saveHumanRevision(setup.owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      title: setup.surface.document.title,
      body: bodyR3,
      changeSummary: "Append content after the stable target.",
    }));
    surface = success(await setup.service.createTask(
      setup.owner.humanSessionToken,
      taskInput(setup.worker, bodyR3, "added", "Stale on restore", "COMMENT", 3),
    ));
    assert.equal(namedTask(surface, "Keep across restore").anchor.anchorRevision, 3);

    const r2Before = success(await setup.service.readRevision(
      setup.owner.humanSessionToken,
      2,
    ));
    const r3Before = success(await setup.service.readRevision(
      setup.owner.humanSessionToken,
      3,
    ));
    const restored = success(await setup.service.restoreRevision(setup.owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 3,
      revision: 2,
      changeSummary: "Restore the stable Unicode snapshot.",
    }));
    assert.equal(restored.document.revision, 4);
    assert.equal(restored.document.body, bodyR2);

    const kept = namedTask(restored, "Keep across restore");
    assert.deepEqual(kept.creationAnchor, keepAtCreation.creationAnchor);
    assert.equal(kept.anchor.scope, "SELECTION");
    if (kept.anchor.scope === "SELECTION") {
      assert.deepEqual(
        [kept.anchor.rangeStart, kept.anchor.rangeEnd, kept.anchor.selectedText,
          kept.anchor.anchorRevision, kept.anchor.anchorState],
        [keepRange.start, keepRange.end, "keep", 4, "ACTIVE"],
      );
    }
    const stale = namedTask(restored, "Stale on restore");
    assert.equal(stale.status, "STALE");
    assert.equal(stale.anchor.anchorState, "STALE");
    const standalone = restored.threads.find((thread) => thread.threadId === standaloneThreadId);
    assert.ok(standalone);
    assert.equal(standalone.anchor.anchorRevision, 4);
    assert.equal(standalone.anchor.anchorState, "ACTIVE");

    assert.deepEqual(
      success(await setup.service.readRevision(setup.owner.humanSessionToken, 2)),
      r2Before,
    );
    assert.deepEqual(
      success(await setup.service.readRevision(setup.owner.humanSessionToken, 3)),
      r3Before,
    );
    const r4 = success(await setup.service.readRevision(setup.owner.humanSessionToken, 4));
    assert.equal(r4.parentRevision, 3);
    assert.equal(r4.provenance.authority, "RESTORE");
    assert.equal(r4.provenance.sourceRevision, 2);
    assert.equal(r4.provenance.restoredRevision, 2);
    const history = success(await setup.service.readHistory(
      setup.owner.humanSessionToken,
      { limit: 10 },
    ));
    assert.deepEqual(history.revisions.map((revision) => revision.revision), [4, 3, 2, 1]);

    const committed = success(await setup.service.submitTaskResult(
      setup.worker.agentSessionToken,
      {
        requestId: requestId(),
        taskId: kept.taskId,
        basedOnRevision: 2,
        resultSummary: "Use the still-active anchor after restore.",
        replacementText: "KEEP",
      },
      setup.worker.sessionInstanceId,
    ));
    assert.equal(committed.outcome, "COMMITTED");
    if (committed.outcome === "COMMITTED") {
      assert.equal(
        committed.revision.body,
        replaceIssueRange(bodyR2, keepRange.start, keepRange.end, "KEEP"),
      );
    }
    assert.deepEqual(
      success(await setup.service.readRevision(setup.owner.humanSessionToken, 2)),
      r2Before,
    );
    assert.deepEqual(
      success(await setup.service.readRevision(setup.owner.humanSessionToken, 3)),
      r3Before,
    );
    assert.deepEqual(
      success(await setup.service.readRevision(setup.owner.humanSessionToken, 4)),
      r4,
    );
  });

  test("D20: Unicode limits, unsafe integers, and additional properties fail at the service boundary", async () => {
    const service = new LocalRepositoryService({ now: () => FIXED_NOW });
    const owner = success(await service.launch({ kind: "POSTMORTEM", displayName: "Bounds owner" }));
    const worker = success(await service.join({
      shareToken: owner.shareToken,
      displayName: "Bounds worker",
    }));
    const body = "😀target";
    const exactTitle = "😀".repeat(ISSUE_TITLE_MAX_LENGTH);
    let surface = success(await service.saveHumanRevision(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 1,
      title: exactTitle,
      body,
      changeSummary: "✨".repeat(ISSUE_CHANGE_SUMMARY_MAX_LENGTH),
    }));
    assert.equal(Array.from(surface.document.title).length, ISSUE_TITLE_MAX_LENGTH);
    assert.ok(surface.document.title.length > ISSUE_TITLE_MAX_LENGTH);

    const beforeOverlong = success(await service.inspect(owner.humanSessionToken));
    assertFailure(await service.saveHumanRevision(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      title: `${exactTitle}😀`,
      body,
      changeSummary: "Reject one code point beyond the title limit.",
    }), "INVALID_INPUT");
    assert.deepEqual(success(await service.inspect(owner.humanSessionToken)), beforeOverlong);

    surface = success(await service.createTask(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      title: "🧪".repeat(ISSUE_TASK_TITLE_MAX_LENGTH),
      category: "GENERAL",
      instruction: "🧭".repeat(ISSUE_TASK_INSTRUCTION_MAX_LENGTH),
      agentLabel: "🤖".repeat(ISSUE_AGENT_LABEL_MAX_LENGTH),
      mode: "COMMENT",
      assignedToMemberId: worker.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 0, rangeEnd: 1 },
    }));
    const boundaryTask = surface.tasks.find((task) => task.title.startsWith("🧪"));
    assert.ok(boundaryTask);
    assert.equal(boundaryTask.creationAnchor.selectedText, "😀");
    const boundaryResult = success(await service.submitTaskResult(
      worker.agentSessionToken,
      {
        requestId: requestId(),
        taskId: boundaryTask.taskId,
        basedOnRevision: 2,
        resultSummary: "✨".repeat(ISSUE_CHANGE_SUMMARY_MAX_LENGTH),
        evidenceRefs: Array.from(
          { length: ISSUE_EVIDENCE_REF_LIMIT },
          () => "📎".repeat(ISSUE_EVIDENCE_REF_MAX_LENGTH),
        ),
      },
      worker.sessionInstanceId,
    ));
    assert.equal(boundaryResult.outcome, "COMMENTED");

    const directSurface = success(await service.createTask(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      title: "Open direct schema target",
      category: "GENERAL",
      instruction: "Remain open while malformed inputs are rejected.",
      agentLabel: "Schema agent",
      mode: "DIRECT",
      assignedToMemberId: worker.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 1, rangeEnd: 7 },
    }));
    const directTask = namedTask(directSurface, "Open direct schema target");

    const unsafeIntegers = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, Number.NaN];
    for (const value of unsafeIntegers) {
      const before = success(await service.inspect(owner.humanSessionToken));
      assertFailure(await service.createThread(owner.humanSessionToken, {
        requestId: requestId(),
        expectedRevision: value,
        body: "Unsafe revision cursor.",
        anchor: { scope: "DOCUMENT" },
      }), "INVALID_INPUT");
      assertFailure(await service.createThread(owner.humanSessionToken, {
        requestId: requestId(),
        expectedRevision: 2,
        body: "Unsafe anchor offset.",
        anchor: {
          scope: "SELECTION",
          field: "BODY",
          rangeStart: value,
          rangeEnd: 1,
        },
      }), "INVALID_INPUT");
      assertFailure(await service.submitTaskResult(worker.agentSessionToken, {
        requestId: requestId(),
        taskId: directTask.taskId,
        basedOnRevision: value,
        resultSummary: "Unsafe source revision.",
        replacementText: "TARGET",
      }, worker.sessionInstanceId), "INVALID_INPUT");
      assertFailure(await service.readRevision(owner.humanSessionToken, value), "INVALID_INPUT");
      assert.deepEqual(success(await service.inspect(owner.humanSessionToken)), before);
    }

    const utf16End = body.length;
    assert.ok(utf16End > Array.from(body).length);
    const beforeUtf16Offset = success(await service.inspect(owner.humanSessionToken));
    assertFailure(await service.createThread(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      body: "UTF-16 code-unit offsets must not pass as code-point offsets.",
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 0, rangeEnd: utf16End },
    }), "INVALID_INPUT");
    assert.deepEqual(success(await service.inspect(owner.humanSessionToken)), beforeUtf16Offset);

    const reviewSurface = success(await service.createTask(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      title: "Proposed review schema target",
      category: "GENERAL",
      instruction: "Remain proposed while malformed decisions are rejected.",
      agentLabel: "Review schema agent",
      mode: "REVIEW",
      assignedToMemberId: worker.selfMemberId,
      anchor: { scope: "SELECTION", field: "BODY", rangeStart: 1, rangeEnd: 7 },
    }));
    const reviewTask = namedTask(reviewSurface, "Proposed review schema target");
    success(await service.submitTaskResult(worker.agentSessionToken, {
      requestId: requestId(),
      taskId: reviewTask.taskId,
      basedOnRevision: 2,
      resultSummary: "Create a proposal for malformed-decision checks.",
      replacementText: "TARGET",
    }, worker.sessionInstanceId));
    const threadSurface = success(await service.createThread(owner.humanSessionToken, {
      requestId: requestId(),
      expectedRevision: 2,
      body: "Standalone schema target.",
      anchor: { scope: "DOCUMENT" },
    }));
    const standalone = threadSurface.threads.find((thread) => thread.taskId === null);
    assert.ok(standalone);
    const beforeExtraFields = success(await service.inspect(owner.humanSessionToken));

    const malformedOperations: Array<[
      string,
      () => Promise<RepositoryResult<unknown>>,
    ]> = [
      ["save", () => service.saveHumanRevision(owner.humanSessionToken, {
        requestId: requestId(), expectedRevision: 2, title: exactTitle, body,
        changeSummary: "Reject an extra field.", extra: true,
      } as never)],
      ["create task", () => service.createTask(owner.humanSessionToken, {
        requestId: requestId(), expectedRevision: 2, title: "Malformed task",
        category: "GENERAL", instruction: "Reject extra fields.", agentLabel: "Schema agent",
        mode: "COMMENT", assignedToMemberId: worker.selfMemberId,
        anchor: { scope: "DOCUMENT" }, extra: true,
      } as never)],
      ["create thread anchor", () => service.createThread(owner.humanSessionToken, {
        requestId: requestId(), expectedRevision: 2, body: "Malformed anchor.",
        anchor: { scope: "DOCUMENT", extra: true },
      } as never)],
      ["human comment", () => service.addHumanComment(owner.humanSessionToken, {
        requestId: requestId(), threadId: standalone.threadId, body: "Malformed comment.",
        extra: true,
      } as never)],
      ["resolve thread", () => service.resolveThread(owner.humanSessionToken, {
        requestId: requestId(), threadId: standalone.threadId, extra: true,
      } as never)],
      ["cancel", () => service.cancelTask(owner.humanSessionToken, {
        requestId: requestId(), taskId: directTask.taskId, extra: true,
      } as never)],
      ["agent comment", () => service.commentOnTask(worker.agentSessionToken, {
        requestId: requestId(), taskId: directTask.taskId, body: "Malformed agent comment.",
        extra: true,
      } as never, worker.sessionInstanceId)],
      ["agent result", () => service.submitTaskResult(worker.agentSessionToken, {
        requestId: requestId(), taskId: directTask.taskId, basedOnRevision: 2,
        resultSummary: "Malformed result.", replacementText: "TARGET", extra: true,
      } as never, worker.sessionInstanceId)],
      ["accept", () => service.acceptTaskProposal(owner.humanSessionToken, {
        requestId: requestId(), taskId: reviewTask.taskId, expectedRevision: 2,
        note: null, extra: true,
      } as never)],
      ["reject", () => service.rejectTaskProposal(owner.humanSessionToken, {
        requestId: requestId(), taskId: reviewTask.taskId, expectedRevision: 2,
        note: null, extra: true,
      } as never)],
      ["restore", () => service.restoreRevision(owner.humanSessionToken, {
        requestId: requestId(), expectedRevision: 2, revision: 1,
        changeSummary: "Malformed restore.", extra: true,
      } as never)],
      ["presence", () => service.touchPresence(owner.humanSessionToken, {
        requestId: requestId(), state: "VIEWING", field: null, isTyping: false,
        selectionStart: null, selectionEnd: null, observedRevision: 2, extra: true,
      } as never)],
      ["history", () => service.readHistory(owner.humanSessionToken, {
        limit: 10, extra: true,
      } as never)],
      ["task list", () => service.listMyTasks(worker.agentSessionToken, {
        includeResolved: true, extra: true,
      } as never, worker.sessionInstanceId)],
      ["wait", () => service.waitForMyTasks(worker.agentSessionToken, {
        afterActivityVersion: beforeExtraFields.document.activityVersion,
        afterRevision: 2,
        timeoutSeconds: 1,
        extra: true,
      } as never, worker.sessionInstanceId)],
    ];

    for (const [name, operation] of malformedOperations) {
      assertFailure(await operation(), "INVALID_INPUT");
      assert.deepEqual(
        success(await service.inspect(owner.humanSessionToken)),
        beforeExtraFields,
        `${name} mutated the surface`,
      );
    }
  });
});
