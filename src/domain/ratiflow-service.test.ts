import { describe, expect, it, vi } from "vitest";

import type { AgentRegistryExecutionContext } from "@/contracts";
import { LocalRatiflowService } from "./ratiflow-service";

const ids = {
  capacity: "11111111-1111-4111-8111-111111111111",
  staleEvidence: "22222222-2222-4222-8222-222222222222",
  recommend: "33333333-3333-4333-8333-333333333333",
  prepare: "44444444-4444-4444-8444-444444444444",
  ratify: "55555555-5555-4555-8555-555555555555",
  replay: "66666666-6666-4666-8666-666666666666",
  invalidDate: "77777777-7777-4777-8777-777777777777",
  alternateRecommend: "88888888-8888-4888-8888-888888888888",
  alternatePrepare: "99999999-9999-4999-8999-999999999999",
  alternateRatify: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function browserContext(agentSessionToken: string, pageSessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"): AgentRegistryExecutionContext {
  return { caller: "BROWSER_AGENT", pageSessionId, agentSessionToken };
}

async function invokeAgent(service: LocalRatiflowService, agentSessionToken: string, pageSessionId?: string): Promise<AgentRegistryExecutionContext> {
  const context = browserContext(agentSessionToken, pageSessionId);
  await service.catchUpAgentSession(context, {});
  return context;
}

describe("LocalRatiflowService", () => {
  it("replays the canonical stale recovery and human-only commitment", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const agentContext = await invokeAgent(service, sessions.agentSessionToken);
    const initial = await service.inspect(sessions.mayaSessionToken);
    expect(initial).toMatchObject({ revision: 7, decision: { state: "READY", selectedOptionId: "opt_csv_ga_oct15" } });

    const capacity = await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.capacity,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    expect(capacity).toMatchObject({ ok: true, data: { eventId: "evt_0008_capacity_reduced", resultingRevision: 8 } });

    const stale = await service.mutateFromWebMCP({
      executionContext: agentContext,
      toolName: "add_evidence",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: {
        expectedWorkspaceRevision: 7,
        contextEpoch: 2,
        requestId: ids.staleEvidence,
        rationale: "Confirm the original estimate.",
        payload: { optionId: "opt_csv_ga_oct15", kind: "ENGINEERING_ESTIMATE", stance: "CONTEXT", title: "Original estimate", detail: "The original estimate remains recorded.", sourceLabel: "Agent review" },
      },
    });
    expect(stale).toMatchObject({
      ok: false,
      code: "STALE_WORK_STATE",
      currentWorkspaceRevision: 8,
      expectedWorkspaceRevision: 7,
      actualWorkspaceRevision: 8,
      nextAction: "Call inspect_decision, refresh WebMCP tools, then retry against workspace revision 8.",
      changes: [{ eventId: "evt_0008_capacity_reduced", resultingRevision: 8 }],
    });

    const recommended = await service.mutateFromWebMCP({
      executionContext: agentContext,
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: { expectedWorkspaceRevision: 8, contextEpoch: 2, requestId: ids.recommend, rationale: "O2 fits the reduced launch capacity.", payload: { optionId: "opt_csv_beta_oct15" } },
    });
    expect(recommended).toMatchObject({ ok: true, data: { resultingRevision: 9, workspace: { decision: { state: "READY", selectedOptionId: "opt_csv_beta_oct15" } } } });

    const prepared = await service.mutateFromWebMCP({
      executionContext: agentContext,
      toolName: "prepare_decision",
      capturedSelection: { kind: "OPTION", id: "opt_csv_beta_oct15" },
      capturedContextEpoch: 3,
      envelope: { expectedWorkspaceRevision: 9, contextEpoch: 3, requestId: ids.prepare, rationale: "Prepare the feasible beta scope for Maya.", payload: { optionId: "opt_csv_beta_oct15", recommendation: "Invite-only Northstar beta on Oct 15, then GA Nov 1.", risks: ["GA readiness remains after beta."], customerMessageDraft: "Northstar will receive an invite-only beta on Oct 15 and GA on Nov 1." } },
    });
    expect(prepared).toMatchObject({ ok: true, data: { resultingRevision: 10, workspace: { decision: { state: "REVIEW" } } } });

    const ratified = await service.ratifyFromHumanUi(sessions.mayaSessionToken, {
      expectedWorkspaceRevision: 10,
      requestId: ids.ratify,
      recommendation: "Invite-only Northstar beta on Oct 15, then GA Nov 1.",
      customerMessage: "Northstar will receive an invite-only beta on Oct 15 and GA on Nov 1.",
    });
    expect(ratified).toMatchObject({ ok: true, data: { resultingRevision: 11, workspace: { decision: { state: "COMMITTED" }, followup: { status: "READY", ownerId: "usr_maya_chen", dueDate: "2026-10-16", inheritedContext: ["Northstar beta Oct 15, 2026", "GA Nov 1, 2026", "Capacity reduced to 14 engineer-days after a four-day incident rotation"] } } } });
  });

  it("derives follow-up context from the ratified alternative instead of a golden capacity event", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const agentContext = await invokeAgent(service, sessions.agentSessionToken);
    const recommended = await service.mutateFromWebMCP({
      executionContext: agentContext,
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 1,
      envelope: { expectedWorkspaceRevision: 7, contextEpoch: 1, requestId: ids.alternateRecommend, rationale: "The deferred option fits the customer commitment.", payload: { optionId: "opt_csv_defer_nov1" } },
    });
    expect(recommended).toMatchObject({ ok: true, data: { resultingRevision: 8, workspace: { decision: { selectedOptionId: "opt_csv_defer_nov1", state: "READY" } } } });

    const prepared = await service.mutateFromWebMCP({
      executionContext: agentContext,
      toolName: "prepare_decision",
      capturedSelection: { kind: "OPTION", id: "opt_csv_defer_nov1" },
      capturedContextEpoch: 2,
      envelope: { expectedWorkspaceRevision: 8, contextEpoch: 2, requestId: ids.alternatePrepare, rationale: "Prepare the deferred scope for human review.", payload: { optionId: "opt_csv_defer_nov1", recommendation: "Defer CSV export to Nov 1.", risks: ["No Oct 15 export."], customerMessageDraft: "Northstar will receive CSV export on Nov 1." } },
    });
    expect(prepared).toMatchObject({ ok: true, data: { resultingRevision: 9, workspace: { decision: { state: "REVIEW" } } } });

    const ratified = await service.ratifyFromHumanUi(sessions.mayaSessionToken, {
      expectedWorkspaceRevision: 9,
      requestId: ids.alternateRatify,
      recommendation: "Defer CSV export to Nov 1.",
      customerMessage: "Northstar will receive CSV export on Nov 1.",
    });
    expect(ratified).toMatchObject({ ok: true, data: { workspace: { followup: { inheritedContext: ["Defer export Nov 1, 2026", "GA Nov 1, 2026", "Launch capacity is 18 engineer-days"] } } } });
  });

  it("rejects an agent handle at the human ratification boundary", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const result = await service.ratifyFromHumanUi(sessions.agentSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.ratify,
      recommendation: "Attempted commitment.",
      customerMessage: "Attempted commitment.",
    });
    expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED", currentWorkspaceRevision: 7 });
  });

  it("creates isolated runs without resetting existing sessions or subscribers", async () => {
    const service = new LocalRatiflowService();
    const first = service.issueDemoSessions();
    const firstNotices: string[] = [];
    const secondNotices: string[] = [];
    service.subscribe(first.mayaSessionToken, (notice) => firstNotices.push(notice.eventId));

    const second = service.issueDemoSessions();
    service.subscribe(second.mayaSessionToken, (notice) => secondNotices.push(notice.eventId));
    expect(first.mayaSessionToken).not.toBe(second.mayaSessionToken);
    expect(await service.inspect(first.mayaSessionToken)).toMatchObject({ revision: 7 });
    expect(await service.inspect(second.mayaSessionToken)).toMatchObject({ revision: 7 });

    const firstCapacity = await service.setLaunchCapacityFromCollaboratorUi(first.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.replay,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    expect(firstCapacity).toMatchObject({ ok: true, data: { resultingRevision: 8 } });
    expect(await service.inspect(first.mayaSessionToken)).toMatchObject({ revision: 8, decision: { launchCapacityEngineerDays: 14 } });
    expect(await service.inspect(second.mayaSessionToken)).toMatchObject({ revision: 7, decision: { launchCapacityEngineerDays: 18 } });
    expect(firstNotices).toHaveLength(1);
    expect(firstNotices[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondNotices).toEqual([]);

    const replay = await service.setLaunchCapacityFromCollaboratorUi(first.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.replay,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    expect(replay).toEqual(firstCapacity);
    const mismatch = await service.setLaunchCapacityFromCollaboratorUi(first.jordanSessionToken, {
      expectedWorkspaceRevision: 8,
      requestId: ids.replay,
      payload: { launchCapacityEngineerDays: 13, reason: "An unrelated change" },
    });
    expect(mismatch).toMatchObject({ ok: false, code: "REQUEST_REPLAY_MISMATCH", currentWorkspaceRevision: 8 });

    const sameRequestIdInSecondRun = await service.setLaunchCapacityFromCollaboratorUi(second.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.replay,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    expect(sameRequestIdInSecondRun).toMatchObject({ ok: true, data: { resultingRevision: 8 } });
  });

  it("rejects impossible calendar dates before mutating a run", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const agentContext = await invokeAgent(service, sessions.agentSessionToken);
    const result = await service.mutateFromWebMCP({
      executionContext: agentContext,
      toolName: "add_evidence",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: {
        expectedWorkspaceRevision: 7,
        contextEpoch: 2,
        requestId: ids.invalidDate,
        rationale: "Record an invalid deadline for validation coverage.",
        payload: { optionId: "opt_csv_ga_oct15", kind: "CUSTOMER_DEADLINE", stance: "CONTEXT", title: "Impossible date", detail: "This should be rejected before a revision advances.", sourceLabel: "Validation test", metrics: { date: "2026-02-30" } },
      },
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT", currentWorkspaceRevision: 7 });
    expect(await service.inspect(sessions.mayaSessionToken)).toMatchObject({ revision: 7, evidence: expect.any(Array) });
  });

  it("expires opaque demo memberships and honors cancellation before a synchronous mutation", async () => {
    vi.useFakeTimers();
    try {
      const service = new LocalRatiflowService({ sessionTtlMs: 10 });
      const sessions = service.issueDemoSessions();
      const controller = new AbortController();
      controller.abort("cancel before local commit");
      await expect(service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
        expectedWorkspaceRevision: 7,
        requestId: ids.capacity,
        payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
      }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
      expect(await service.inspect(sessions.mayaSessionToken)).toMatchObject({ revision: 7 });

      vi.advanceTimersByTime(11);
      await expect(service.inspect(sessions.mayaSessionToken)).rejects.toThrow("Unauthorized session");
      const expired = await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
        expectedWorkspaceRevision: 7,
        requestId: ids.capacity,
        payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
      });
      expect(expired).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    } finally {
      vi.useRealTimers();
    }
  });
});
