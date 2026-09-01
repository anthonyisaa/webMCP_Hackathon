import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, vi } from "vitest";

import type {
  CreateDocumentWorkOrderInput,
  DocumentSessionBundleV3,
} from "@/document/contracts";
import { LocalDocumentWorkspaceService } from "./document-workspace-service";

async function collaborativeDocument(body = "Alpha 😀 beta gamma") {
  const service = new LocalDocumentWorkspaceService();
  const jordanLaunch = await service.launchV3({ displayName: "Jordan Lee" });
  assert.equal(jordanLaunch.ok, true);
  if (!jordanLaunch.ok) throw new Error("launch failed");
  const jordan = jordanLaunch.data;
  const mayaJoin = await service.joinV3({
    shareToken: jordan.shareToken,
    displayName: "Maya Chen",
  });
  assert.equal(mayaJoin.ok, true);
  if (!mayaJoin.ok) throw new Error("join failed");
  const maya = mayaJoin.data;
  const save = await service.saveHuman(jordan.humanSessionToken, {
    expectedRevision: 0,
    requestId: randomUUID(),
    title: "Decision memo",
    body,
  });
  assert.equal(save.ok, true);
  return { service, jordan, maya };
}

function workInput(
  assignee: DocumentSessionBundleV3,
  overrides: Partial<CreateDocumentWorkOrderInput> = {},
): CreateDocumentWorkOrderInput {
  return {
    expectedRevision: 1,
    requestId: randomUUID(),
    source: "CONTEXT_MENU",
    intent: "REWRITE",
    instruction: "Rewrite this clearly without changing the facts.",
    assignedToMemberId: assignee.selfMemberId,
    targetField: "BODY",
    rangeStart: 0,
    rangeEnd: 5,
    ...overrides,
  };
}

test("hero reset returns exact seed and opaque base64url bootstrap fragments", async () => {
  const service = new LocalDocumentWorkspaceService();
  const result = await service.resetHeroForEvaluation();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.revision, 1);
  assert.equal(result.data.activityVersion, 1);
  assert.match(result.data.mayaBootstrapPath, /^\/document\/[A-Za-z0-9_-]+#ratiflow-bootstrap=[A-Za-z0-9_-]+$/);
  assert.match(result.data.jordanBootstrapPath, /^\/document\/[A-Za-z0-9_-]+#ratiflow-bootstrap=[A-Za-z0-9_-]+$/);
  const encoded = result.data.mayaBootstrapPath.split("#ratiflow-bootstrap=")[1];
  assert.ok(encoded);
  const maya = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DocumentSessionBundleV3;
  assert.equal(maya.selfMemberId, "00000000-0000-4000-8000-000000000311");
  assert.equal(maya.surface.document.title, "Northstar CSV launch memo");
  assert.equal(Array.from(maya.surface.document.body).length, 370);
  assert.equal(maya.surface.memory[0]?.eventId, "00000000-0000-4000-8000-000000000331");
});

test("proposal is non-editing and creator acceptance atomically records both sides", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const created = await service.createWorkOrder(
    jordan.humanSessionToken,
    workInput(maya),
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const pending = created.data.workOrders.find((order) => order.status === "PENDING");
  assert.ok(pending);
  const proposed = await service.submitWorkProposal(maya.agentSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Omega",
    changeSummary: "Replace Alpha with Omega.",
  }, randomUUID());
  assert.equal(proposed.ok, true);
  if (!proposed.ok) return;
  assert.equal(proposed.data.document.revision, 1);
  assert.equal(proposed.data.document.body, "Alpha 😀 beta gamma");
  assert.deepEqual(proposed.data.document.lastEditor, {
    displayName: "Jordan Lee",
    actorType: "HUMAN",
    origin: "ORDINARY_UI",
  });
  assert.equal(proposed.data.workOrder.status, "PROPOSED");

  const denied = await service.acceptWorkProposal(maya.humanSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    rationale: "I did not create this order.",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "UNAUTHORIZED");

  const accepted = await service.acceptWorkProposal(jordan.humanSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    rationale: "Accepted because this is the clearest precise wording.",
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.data.document.body, "Omega 😀 beta gamma");
  assert.equal(accepted.data.document.revision, 2);
  assert.equal(accepted.data.document.activityVersion, 4);
  assert.deepEqual(accepted.data.document.lastEditor, {
    displayName: "Jordan Lee",
    actorType: "HUMAN",
    origin: "ORDINARY_UI",
  });
  const completed = accepted.data.workOrders.find((order) => order.workOrderId === pending.workOrderId);
  assert.equal(completed?.status, "COMPLETED");
  if (completed?.status === "COMPLETED") {
    assert.equal(completed.proposal.proposedBy.displayName, "Maya Chen's paired agent");
    assert.equal(completed.decision.resultRevision, 2);
  }
  const memory = await service.readMemory(maya.agentSessionToken, { limit: 20 });
  assert.equal(memory.ok, true);
  if (memory.ok) {
    assert.deepEqual(memory.data.events.map((entry) => entry.kind), [
      "DOCUMENT_EDITED",
      "WORK_CREATED",
      "PROPOSAL_SUBMITTED",
      "PROPOSAL_ACCEPTED",
    ]);
    const serialized = JSON.stringify(memory.data.events);
    assert.equal(serialized.includes(jordan.humanSessionToken), false);
    assert.equal(serialized.includes("creatorMemberId"), false);
    assert.match(memory.data.events[3]?.rationale ?? "", /clearest precise wording/);
  }
});

test("rejection requires rationale, preserves content revision, and advances activity", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const created = await service.createWorkOrder(jordan.humanSessionToken, workInput(maya));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const pending = created.data.workOrders[0];
  assert.ok(pending);
  const proposal = await service.submitWorkProposal(maya.agentSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Delta",
    changeSummary: "Try Delta.",
  }, randomUUID());
  assert.equal(proposal.ok, true);
  const blank = await service.rejectWorkProposal(jordan.humanSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    rationale: "   ",
  });
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.equal(blank.code, "INVALID_INPUT");
  const rejected = await service.rejectWorkProposal(jordan.humanSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    rationale: "Rejected because Delta removes necessary specificity.",
  });
  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.data.document.revision, 1);
    assert.equal(rejected.data.document.activityVersion, 4);
    assert.equal(rejected.data.document.body, "Alpha 😀 beta gamma");
    assert.equal(rejected.data.workOrders[0]?.status, "REJECTED");
  }
});

test("Unicode anchors conservatively shift or stale in one content event", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const shiftedCreate = await service.createWorkOrder(jordan.humanSessionToken, workInput(maya, {
    rangeStart: 6,
    rangeEnd: 7,
    instruction: "Keep this emoji but explain it.",
  }));
  assert.equal(shiftedCreate.ok, true);
  const overlapCreate = await service.createWorkOrder(jordan.humanSessionToken, workInput(maya, {
    rangeStart: 0,
    rangeEnd: 5,
    instruction: "Rewrite the first word.",
  }));
  assert.equal(overlapCreate.ok, true);
  const saved = await service.saveHuman(jordan.humanSessionToken, {
    expectedRevision: 1,
    requestId: randomUUID(),
    title: "Decision memo",
    body: "X 😀 beta gamma",
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  const shiftedId = shiftedCreate.ok ? shiftedCreate.data.workOrders[0]?.workOrderId : "";
  const shifted = saved.data.workOrders.find((entry) => entry.workOrderId === shiftedId);
  assert.equal(shifted?.status, "PENDING");
  assert.equal(shifted?.anchor.rangeStart, 2);
  assert.equal(shifted?.anchor.rangeEnd, 3);
  assert.equal(shifted?.anchor.selectedText, "😀");
  const stale = saved.data.workOrders.find((entry) => entry.instruction === "Rewrite the first word.");
  assert.equal(stale?.status, "STALE");
  const editEvent = saved.data.memory.at(-1);
  assert.equal(editEvent?.kind, "DOCUMENT_EDITED");
  assert.deepEqual(editEvent?.linkedWorkOrderIds, stale ? [stale.workOrderId] : []);
});

test("canonical replay is stable and changed input is rejected", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const input = workInput(maya);
  const first = await service.createWorkOrder(jordan.humanSessionToken, input);
  const replay = await service.createWorkOrder(jordan.humanSessionToken, input);
  assert.deepEqual(replay, first);
  const mismatch = await service.createWorkOrder(jordan.humanSessionToken, {
    ...input,
    instruction: "Different instruction",
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "REQUEST_REPLAY_MISMATCH");
});

test("agent work is pair-private and memory paginates newest windows chronologically", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const created = await service.createWorkOrder(jordan.humanSessionToken, workInput(maya));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const mayaWork = await service.listMyWork(maya.agentSessionToken, randomUUID());
  const jordanWork = await service.listMyWork(jordan.agentSessionToken, randomUUID());
  assert.equal(mayaWork.ok && mayaWork.data.workOrders.length, 1);
  assert.equal(jordanWork.ok && jordanWork.data.workOrders.length, 0);
  const crossPair = await service.submitWorkProposal(jordan.agentSessionToken, {
    workOrderId: created.data.workOrders[0]!.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "No",
    changeSummary: "Unauthorized attempt.",
  }, randomUUID());
  assert.equal(crossPair.ok, false);
  if (!crossPair.ok) assert.equal(crossPair.code, "UNAUTHORIZED");
  const page = await service.readMemory(maya.agentSessionToken, { limit: 1 });
  assert.equal(page.ok, true);
  if (page.ok) {
    assert.equal(page.data.events.length, 1);
    assert.equal(page.data.events[0]?.kind, "WORK_CREATED");
    assert.equal(page.data.hasMoreOlder, true);
    assert.equal(page.data.nextBeforeActivityVersion, 2);
    const older = await service.readMemory(maya.agentSessionToken, {
      limit: 1,
      beforeActivityVersion: page.data.nextBeforeActivityVersion ?? undefined,
    });
    assert.equal(older.ok, true);
    if (older.ok) assert.equal(older.data.events[0]?.kind, "DOCUMENT_EDITED");
  }
});

test("wait rejects future cursors, enforces one page/member wait, wakes for assigned work, and cleans abort", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const pageSessionId = randomUUID();
  const future = await service.waitForMyWork(maya.agentSessionToken, {
    afterActivityVersion: 2,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, pageSessionId);
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.code, "INVALID_INPUT");

  const controller = new AbortController();
  const waiting = service.waitForMyWork(maya.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 2,
  }, pageSessionId, controller.signal);
  const duplicate = await service.waitForMyWork(maya.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 2,
  }, pageSessionId);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "WAIT_ALREADY_ACTIVE");
  const created = await service.createWorkOrder(jordan.humanSessionToken, workInput(maya));
  assert.equal(created.ok, true);
  const woke = await waiting;
  assert.equal(woke.ok, true);
  if (woke.ok) assert.equal(woke.data.outcome, "WORK_AVAILABLE");

  const { service: abortService, maya: abortMaya } = await collaborativeDocument();
  const abortController = new AbortController();
  const abortPageSessionId = randomUUID();
  const aborted = abortService.waitForMyWork(abortMaya.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 2,
  }, abortPageSessionId, abortController.signal);
  abortController.abort("unmount");
  await assert.rejects(aborted, (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError");
  const secondController = new AbortController();
  const second = abortService.waitForMyWork(abortMaya.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 2,
  }, abortPageSessionId, secondController.signal);
  secondController.abort();
  await assert.rejects(second, (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError");
});

test("assignment requires fresh presence while existing work survives presence expiry", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const service = new LocalDocumentWorkspaceService({ now: () => now });
  const jordanResult = await service.launchV3({ displayName: "Jordan" });
  assert.equal(jordanResult.ok, true);
  if (!jordanResult.ok) return;
  const mayaResult = await service.joinV3({
    shareToken: jordanResult.data.shareToken,
    displayName: "Maya",
  });
  assert.equal(mayaResult.ok, true);
  if (!mayaResult.ok) return;
  const { data: jordan } = jordanResult;
  const { data: maya } = mayaResult;
  await service.saveHuman(jordan.humanSessionToken, {
    expectedRevision: 0,
    requestId: randomUUID(),
    title: "Memo",
    body: "Alpha beta",
  });
  now += 15_001;
  const unavailable = await service.createWorkOrder(
    jordan.humanSessionToken,
    workInput(maya),
  );
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.code, "ASSIGNEE_UNAVAILABLE");

  const heartbeat = await service.touchPresence(maya.humanSessionToken, {
    state: "VIEWING",
    field: null,
    isTyping: false,
    selectionStart: null,
    selectionEnd: null,
    observedRevision: 1,
  });
  assert.equal(heartbeat.ok, true);
  const created = await service.createWorkOrder(
    jordan.humanSessionToken,
    workInput(maya, { requestId: randomUUID() }),
  );
  assert.equal(created.ok, true);
  now += 15_001;
  const existing = await service.listMyWork(maya.agentSessionToken, randomUUID());
  assert.equal(existing.ok, true);
  if (existing.ok) assert.equal(existing.data.workOrders.length, 1);
});

test("creator alone may cancel, accept, or reject", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const created = await service.createWorkOrder(jordan.humanSessionToken, workInput(maya));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const pending = created.data.workOrders[0]!;
  const deniedCancel = await service.cancelWorkOrder(maya.humanSessionToken, {
    workOrderId: pending.workOrderId,
    requestId: randomUUID(),
  });
  assert.equal(deniedCancel.ok, false);
  if (!deniedCancel.ok) assert.equal(deniedCancel.code, "UNAUTHORIZED");
  const proposal = await service.submitWorkProposal(maya.agentSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Omega",
    changeSummary: "Use Omega.",
  }, randomUUID());
  assert.equal(proposal.ok, true);
  for (const decide of [
    service.acceptWorkProposal.bind(service),
    service.rejectWorkProposal.bind(service),
  ]) {
    const denied = await decide(maya.humanSessionToken, {
      workOrderId: pending.workOrderId,
      expectedRevision: 1,
      requestId: randomUUID(),
      rationale: "Maya is not the creator.",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "UNAUTHORIZED");
  }
});

test("proposal rejects a no-op replacement", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const created = await service.createWorkOrder(jordan.humanSessionToken, workInput(maya));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const noOp = await service.submitWorkProposal(maya.agentSessionToken, {
    workOrderId: created.data.workOrders[0]!.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Alpha",
    changeSummary: "No effective change.",
  }, randomUUID());
  assert.equal(noOp.ok, false);
  if (!noOp.ok) assert.equal(noOp.code, "INVALID_INPUT");
});

test("exact inputs, bounds, and page-session UUIDs fail closed", async () => {
  const service = new LocalDocumentWorkspaceService();
  const malformedLaunch = await service.launchV3({ displayName: "Jordan", extra: true } as never);
  assert.equal(malformedLaunch.ok, false);
  if (!malformedLaunch.ok) assert.equal(malformedLaunch.code, "INVALID_INPUT");
  const { jordan, maya } = await collaborativeDocument();
  const local = await collaborativeDocument();
  const extraCreate = await local.service.createWorkOrder(local.jordan.humanSessionToken, {
    ...workInput(local.maya),
    extra: true,
  } as never);
  assert.equal(extraCreate.ok, false);
  const longInstruction = await local.service.createWorkOrder(
    local.jordan.humanSessionToken,
    workInput(local.maya, { requestId: randomUUID(), instruction: "x".repeat(501) }),
  );
  assert.equal(longInstruction.ok, false);
  const outOfBounds = await local.service.createWorkOrder(
    local.jordan.humanSessionToken,
    workInput(local.maya, { requestId: randomUUID(), rangeEnd: 99 }),
  );
  assert.equal(outOfBounds.ok, false);
  const oversizedSave = await local.service.saveHuman(local.jordan.humanSessionToken, {
    expectedRevision: 1,
    requestId: randomUUID(),
    title: "Memo",
    body: "x".repeat(50_001),
  });
  assert.equal(oversizedSave.ok, false);
  const badMemory = await local.service.readMemory(local.maya.agentSessionToken, { limit: 51 });
  assert.equal(badMemory.ok, false);
  const badListPage = await local.service.listMyWork(local.maya.agentSessionToken, "not-a-uuid");
  assert.equal(badListPage.ok, false);
  if (!badListPage.ok) assert.equal(badListPage.code, "INVALID_INPUT");
  const badWaitPage = await local.service.waitForMyWork(local.maya.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 1,
  }, "not-a-uuid");
  assert.equal(badWaitPage.ok, false);
  const created = await local.service.createWorkOrder(
    local.jordan.humanSessionToken,
    workInput(local.maya, { requestId: randomUUID() }),
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const badProposalPage = await local.service.submitWorkProposal(local.maya.agentSessionToken, {
    workOrderId: created.data.workOrders[0]!.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Omega",
    changeSummary: "Use Omega.",
  }, "not-a-uuid");
  assert.equal(badProposalPage.ok, false);
  assert.ok(jordan.selfMemberId && maya.selfMemberId);
});

test("proposed work still counts against the per-assignee active capacity", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  let firstWorkOrderId = "";
  for (let index = 0; index < 50; index += 1) {
    const created = await service.createWorkOrder(
      jordan.humanSessionToken,
      workInput(maya, {
        requestId: randomUUID(),
        instruction: `Rewrite this clearly, request ${index + 1}.`,
      }),
    );
    assert.equal(created.ok, true);
    if (created.ok && index === 0) firstWorkOrderId = created.data.workOrders[0]!.workOrderId;
  }
  const proposal = await service.submitWorkProposal(maya.agentSessionToken, {
    workOrderId: firstWorkOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Omega",
    changeSummary: "Use Omega.",
  }, randomUUID());
  assert.equal(proposal.ok, true);
  const overCapacity = await service.createWorkOrder(
    jordan.humanSessionToken,
    workInput(maya, {
      requestId: randomUUID(),
      instruction: "This fifty-first active order must be rejected.",
    }),
  );
  assert.equal(overCapacity.ok, false);
  if (!overCapacity.ok) assert.equal(overCapacity.code, "RATE_LIMITED");
});

test("cancel versus submit and accept versus reject each have exactly one winner", async () => {
  const first = await collaborativeDocument();
  const created = await first.service.createWorkOrder(
    first.jordan.humanSessionToken,
    workInput(first.maya),
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const pending = created.data.workOrders[0]!;
  const cancelVsSubmit = await Promise.all([
    first.service.cancelWorkOrder(first.jordan.humanSessionToken, {
      workOrderId: pending.workOrderId,
      requestId: randomUUID(),
    }),
    first.service.submitWorkProposal(first.maya.agentSessionToken, {
      workOrderId: pending.workOrderId,
      expectedRevision: 1,
      requestId: randomUUID(),
      replacementText: "Omega",
      changeSummary: "Use Omega.",
    }, randomUUID()),
  ]);
  assert.equal(cancelVsSubmit.filter((result) => result.ok).length, 1);
  const firstSurface = await first.service.inspect(first.jordan.humanSessionToken);
  assert.equal(firstSurface.ok, true);
  if (firstSurface.ok) {
    assert.equal(firstSurface.data.workOrders[0]?.status, "CANCELLED");
    assert.equal(firstSurface.data.memory.filter((event) =>
      event.kind === "WORK_CANCELLED" || event.kind === "PROPOSAL_SUBMITTED").length, 1);
  }

  const second = await collaborativeDocument();
  const secondCreated = await second.service.createWorkOrder(
    second.jordan.humanSessionToken,
    workInput(second.maya),
  );
  assert.equal(secondCreated.ok, true);
  if (!secondCreated.ok) return;
  const secondPending = secondCreated.data.workOrders[0]!;
  await second.service.submitWorkProposal(second.maya.agentSessionToken, {
    workOrderId: secondPending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Omega",
    changeSummary: "Use Omega.",
  }, randomUUID());
  const decisionInput = {
    workOrderId: secondPending.workOrderId,
    expectedRevision: 1,
    rationale: "Choose exactly one terminal decision.",
  };
  const acceptVsReject = await Promise.all([
    second.service.acceptWorkProposal(second.jordan.humanSessionToken, {
      ...decisionInput,
      requestId: randomUUID(),
    }),
    second.service.rejectWorkProposal(second.jordan.humanSessionToken, {
      ...decisionInput,
      requestId: randomUUID(),
    }),
  ]);
  assert.equal(acceptVsReject.filter((result) => result.ok).length, 1);
  const secondSurface = await second.service.inspect(second.jordan.humanSessionToken);
  assert.equal(secondSurface.ok, true);
  if (secondSurface.ok) {
    assert.equal(secondSurface.data.workOrders[0]?.status, "COMPLETED");
    assert.equal(secondSurface.data.memory.filter((event) =>
      event.kind === "PROPOSAL_ACCEPTED" || event.kind === "PROPOSAL_REJECTED").length, 1);
  }
});

test("one human edit event stales every overlapping active order", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  for (const instruction of ["First overlapping request.", "Second overlapping request."]) {
    const created = await service.createWorkOrder(
      jordan.humanSessionToken,
      workInput(maya, { requestId: randomUUID(), instruction }),
    );
    assert.equal(created.ok, true);
  }
  const saved = await service.saveHuman(jordan.humanSessionToken, {
    expectedRevision: 1,
    requestId: randomUUID(),
    title: "Decision memo",
    body: "Delta 😀 beta gamma",
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.deepEqual(saved.data.workOrders.map((order) => order.status), ["STALE", "STALE"]);
  const editEvents = saved.data.memory.filter((event) =>
    event.kind === "DOCUMENT_EDITED" && event.resultRevision === 2);
  assert.equal(editEvents.length, 1);
  assert.equal(editEvents[0]?.linkedWorkOrderIds.length, 2);
  assert.equal(saved.data.document.activityVersion, 4);
});

test("wait times out at one absolute deadline despite irrelevant activity", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    const { service, jordan, maya } = await collaborativeDocument();
    let settled = false;
    const waiting = service.waitForMyWork(maya.agentSessionToken, {
      afterActivityVersion: 1,
      afterRevision: 1,
      timeoutSeconds: 1,
    }, randomUUID()).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(400);
    assert.equal(settled, false);
    const unrelated = await service.createWorkOrder(
      jordan.humanSessionToken,
      workInput(jordan, {
        requestId: randomUUID(),
        instruction: "Work for Jordan's paired agent only.",
      }),
    );
    assert.equal(unrelated.ok, true);
    await vi.advanceTimersByTimeAsync(599);
    assert.equal(settled, false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await waiting;
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.outcome, "TIMEOUT");
      assert.equal(result.data.activityVersion, 2);
      assert.equal(result.data.revision, 1);
    }
  } finally {
    vi.useRealTimers();
  }
});

test("wait reports document changes and list returns one authoritative counter snapshot", async () => {
  const { service, jordan, maya } = await collaborativeDocument();
  const waiting = service.waitForMyWork(maya.agentSessionToken, {
    afterActivityVersion: 1,
    afterRevision: 1,
    timeoutSeconds: 2,
  }, randomUUID());
  const save = await service.saveHuman(jordan.humanSessionToken, {
    expectedRevision: 1,
    requestId: randomUUID(),
    title: "Decision memo",
    body: "Alpha 😀 beta gamma updated",
  });
  assert.equal(save.ok, true);
  const changed = await waiting;
  assert.equal(changed.ok, true);
  if (changed.ok) {
    assert.equal(changed.data.outcome, "DOCUMENT_CHANGED");
    assert.equal(changed.data.revision, 2);
    assert.equal(changed.data.activityVersion, 2);
  }
  const created = await service.createWorkOrder(
    jordan.humanSessionToken,
    workInput(maya, { expectedRevision: 2, requestId: randomUUID() }),
  );
  assert.equal(created.ok, true);
  const listed = await service.listMyWork(maya.agentSessionToken, randomUUID());
  const inspected = await service.inspect(maya.agentSessionToken);
  assert.equal(listed.ok, true);
  assert.equal(inspected.ok, true);
  if (listed.ok && inspected.ok) {
    assert.equal(listed.data.revision, inspected.data.document.revision);
    assert.equal(listed.data.activityVersion, inspected.data.document.activityVersion);
    assert.equal(listed.data.workOrders.length, 1);
  }
});
