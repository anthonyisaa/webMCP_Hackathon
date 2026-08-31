import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRegistryExecutionContext, CoordinationResult } from "@/contracts";
import { LocalRatiflowService } from "./ratiflow-service";

const decision = { kind: "DECISION", id: "dec_csv_oct15" } as const;

function uuid(index: number): string {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function browser(agentSessionToken: string, index = 1, claimId?: string): AgentRegistryExecutionContext {
  return { caller: "BROWSER_AGENT", pageSessionId: uuid(1_000 + index), agentSessionToken, ...(claimId ? { claimId } : {}) };
}

function auto(agentSessionToken: string, index = 1, claimId?: string): AgentRegistryExecutionContext {
  return { caller: "AUTO_RUNNER", pageSessionId: uuid(2_000 + index), agentSessionToken, ...(claimId ? { claimId } : {}) };
}

function data<T>(result: CoordinationResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.data;
}

describe("LocalRatiflowService live agent session", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the opaque activity cursor independent from workspace revision", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const initial = await service.inspect(sessions.mayaSessionToken);

    expect(initial.revision).toBe(7);
    expect(initial.collaboration.cursor).toMatch(/^[0-9a-f-]{36}$/);
    expect(initial.collaboration.cursor).not.toBe(String(initial.revision));
    expect(initial.collaboration.recentActivity).toHaveLength(1);

    const context = browser(sessions.agentSessionToken);
    const invoked = await service.catchUpAgentSession(context, { sinceCursor: initial.collaboration.cursor });
    expect(invoked).toMatchObject({ ok: true, data: { events: [], hasMore: false, observedHighWater: initial.collaboration.cursor, sessionOpen: true } });

    const foreign = await service.catchUpAgentSession(context, { sinceCursor: uuid(999_999) });
    expect(foreign).toMatchObject({ ok: false, code: "CURSOR_EXPIRED", retryable: true, resetCursor: initial.collaboration.cursor });
  });

  it("derives live, idle, away, replacement, and explicit-leave presence from leases", async () => {
    vi.useFakeTimers();
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const first = browser(sessions.agentSessionToken, 1);
    const second = browser(sessions.agentSessionToken, 2);

    const joined = await service.joinAgentSession(first, decision);
    expect(joined).toMatchObject({ ok: true, data: { presence: { state: "LIVE", activeVia: "BROWSER_AGENT" }, sessionOpen: true } });

    vi.advanceTimersByTime(46_000);
    expect((await service.inspect(sessions.mayaSessionToken)).collaboration.agent.state).toBe("IDLE");

    await service.joinAgentSession(second, decision);
    expect(await service.getAgentInbox(first)).toMatchObject({ ok: false, code: "SESSION_CLOSED" });
    expect((await service.inspect(sessions.mayaSessionToken)).collaboration.agent.state).toBe("LIVE");

    const left = await service.leaveAgentSession(second);
    expect(left).toMatchObject({ ok: true, data: { presence: { state: "AWAY" }, sessionOpen: false } });
    expect(await service.leaveAgentSession(second)).toMatchObject({ ok: false, code: "SESSION_CLOSED" });
  });

  it("paginates at source-event boundaries without skipping activity", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const context = browser(sessions.agentSessionToken);
    const initial = (await service.inspect(sessions.mayaSessionToken)).collaboration.cursor;
    await service.catchUpAgentSession(context, { sinceCursor: initial });

    for (let index = 1; index <= 55; index += 1) {
      const created = await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, {
        kind: "TASK", body: `Review decision item ${index}`, target: decision, requestId: uuid(10_000 + index),
      });
      expect(created.ok).toBe(true);
    }

    const firstPage = await service.catchUpAgentSession(context, { sinceCursor: initial });
    expect(firstPage).toMatchObject({ ok: true, data: { hasMore: true } });
    expect(data(firstPage).events).toHaveLength(50);
    expect(firstPage.ok && firstPage.cursor).not.toBe(data(firstPage).observedHighWater);

    const secondPage = await service.catchUpAgentSession(context, { sinceCursor: firstPage.ok ? firstPage.cursor : initial });
    expect(data(secondPage).events).toHaveLength(5);
    expect(secondPage).toMatchObject({ ok: true, data: { hasMore: false } });
    expect(secondPage.ok && secondPage.cursor).toBe(data(secondPage).observedHighWater);
  });

  it("fences browser-vs-auto and auto-vs-auto claims to one winner", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    await service.updateStandingInstructionsFromHumanUi(sessions.mayaSessionToken, { autoPickup: true, scopes: ["MENTIONS", "TASKS"], maxActionsPerHour: 20, requestId: uuid(20_000) });
    const created = data(await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, { kind: "TASK", body: "Check the capacity tradeoff", target: decision, requestId: uuid(20_001) })).task;
    const browserContext = browser(sessions.agentSessionToken);
    const autoContext = auto(sessions.agentSessionToken);
    await service.catchUpAgentSession(browserContext, {});

    const [browserClaim, autoClaim] = await Promise.all([
      service.claimAgentTask(browserContext, { taskId: created.id, requestId: uuid(20_002) }),
      service.claimAgentTask(autoContext, { taskId: created.id, requestId: uuid(20_003) }),
    ]);
    expect([browserClaim, autoClaim].filter((result) => result.ok)).toHaveLength(1);
    expect([browserClaim, autoClaim].filter((result) => !result.ok)).toEqual([expect.objectContaining({ code: "TASK_ALREADY_CLAIMED" })]);
    if (!browserClaim.ok) throw new Error("The first synchronous contender should own the test claim.");
    expect(await service.claimAgentTask(browser(sessions.agentSessionToken, 1, browserClaim.data.task.claim?.claimId), { taskId: created.id, requestId: uuid(20_002) })).toEqual(browserClaim);

    const second = data(await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, { kind: "MENTION", body: "Compare launch options", target: decision, requestId: uuid(20_004) })).task;
    const [autoOne, autoTwo] = await Promise.all([
      service.claimAgentTask(auto(sessions.agentSessionToken, 2), { taskId: second.id, requestId: uuid(20_005) }),
      service.claimAgentTask(auto(sessions.agentSessionToken, 3), { taskId: second.id, requestId: uuid(20_006) }),
    ]);
    expect([autoOne, autoTwo].filter((result) => result.ok)).toHaveLength(1);
    expect([autoOne, autoTwo].filter((result) => !result.ok)).toEqual([expect.objectContaining({ code: "TASK_ALREADY_CLAIMED" })]);
  });

  it("requires a fresh claim after the agent asks a human and the human answers", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const baseContext = browser(sessions.agentSessionToken);
    await service.catchUpAgentSession(baseContext, {});
    const task = data(await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, { kind: "TASK", body: "Confirm which option Maya prefers", target: decision, requestId: uuid(30_000) })).task;
    const claimed = data(await service.claimAgentTask(baseContext, { taskId: task.id, requestId: uuid(30_001) })).task;
    const claimedContext = browser(sessions.agentSessionToken, 1, claimed.claim?.claimId);

    const asked = await service.requestHumanInput(claimedContext, { taskId: task.id, target: decision, question: "Should I optimize for launch scope or GA completeness?", requestId: uuid(30_002) });
    expect(asked).toMatchObject({ ok: true, data: { task: { status: "WAITING_HUMAN", claim: null }, question: { status: "OPEN" } } });
    const question = data(asked).question;

    const answered = await service.answerHumanInputFromHumanUi(sessions.mayaSessionToken, { questionId: question.id, answer: "Optimize for the Oct 15 launch scope.", requestId: uuid(30_003) });
    expect(answered).toMatchObject({ ok: true, data: { question: { status: "ANSWERED" }, task: { status: "OPEN" } } });
    expect(await service.resolveAgentTask(claimedContext, { taskId: task.id, outcome: "Used the answer.", requestId: uuid(30_004) })).toMatchObject({ ok: false, code: "CLAIM_LOST" });

    const reclaimed = data(await service.claimAgentTask(baseContext, { taskId: task.id, requestId: uuid(30_005) })).task;
    const resolved = await service.resolveAgentTask(browser(sessions.agentSessionToken, 1, reclaimed.claim?.claimId), { taskId: task.id, outcome: "Recommended the scoped beta.", resultLink: "/decision-demo", requestId: uuid(30_006) });
    expect(resolved).toMatchObject({ ok: true, data: { task: { status: "DONE", resultSummary: "Recommended the scoped beta." } } });
  });

  it("replays coordination writes exactly once and rejects request-ID reuse", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const requestId = uuid(40_000);
    const before = await service.inspect(sessions.mayaSessionToken);
    const input = { kind: "MENTION" as const, body: "Please review O2", target: decision, requestId };

    const first = await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, input);
    const replay = await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, input);
    expect(replay).toEqual(first);
    expect((await service.inspect(sessions.mayaSessionToken)).collaboration.recentActivity).toHaveLength(before.collaboration.recentActivity.length + 1);

    const mismatch = await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, { ...input, body: "Different work" });
    expect(mismatch).toMatchObject({ ok: false, code: "REQUEST_REPLAY_MISMATCH" });
  });

  it("enforces browser-live suppression, toggle fencing, and the server action budget", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    await service.updateStandingInstructionsFromHumanUi(sessions.mayaSessionToken, { autoPickup: true, scopes: ["TASKS"], maxActionsPerHour: 2, requestId: uuid(50_000) });
    const task = data(await service.createAgentTaskFromHumanUi(sessions.mayaSessionToken, { kind: "TASK", body: "Review current recommendation", target: decision, requestId: uuid(50_001) })).task;
    const autoBase = auto(sessions.agentSessionToken);
    const claimed = data(await service.claimAgentTask(autoBase, { taskId: task.id, requestId: uuid(50_002) })).task;
    const autoClaimed = auto(sessions.agentSessionToken, 1, claimed.claim?.claimId);

    await service.joinAgentSession(browser(sessions.agentSessionToken), decision);
    expect(await service.resolveAgentTask(autoClaimed, { taskId: task.id, outcome: "Should not commit", requestId: uuid(50_003) })).toMatchObject({ ok: false, code: "CLAIM_LOST" });

    const browserContext = browser(sessions.agentSessionToken);
    await service.leaveAgentSession(browserContext);
    const reclaimed = data(await service.claimAgentTask(autoBase, { taskId: task.id, requestId: uuid(50_004) })).task;
    const reclaimedContext = auto(sessions.agentSessionToken, 1, reclaimed.claim?.claimId);
    expect(await service.postAgentComment(reclaimedContext, { target: decision, taskId: task.id, body: "Budgeted analysis complete.", requestId: uuid(50_005) })).toMatchObject({ ok: false, code: "ACTION_BUDGET_EXCEEDED" });

    await service.updateStandingInstructionsFromHumanUi(sessions.mayaSessionToken, { autoPickup: false, scopes: ["TASKS"], maxActionsPerHour: 2, requestId: uuid(50_006) });
    expect(await service.resolveAgentTask(reclaimedContext, { taskId: task.id, outcome: "Still fenced", requestId: uuid(50_007) })).toMatchObject({ ok: false, code: "CLAIM_LOST" });
  });

  it("attributes decision mutations to the persistent agent and emits one matching activity event", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const context = browser(sessions.agentSessionToken);
    await service.joinAgentSession(context, decision);
    const before = await service.inspect(sessions.mayaSessionToken);

    const result = await service.mutateFromWebMCP({
      executionContext: context,
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 3,
      envelope: { expectedWorkspaceRevision: 7, contextEpoch: 3, requestId: uuid(60_000), rationale: "The beta fits current capacity.", payload: { optionId: "opt_csv_beta_oct15" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.data.workspace.provenance.at(-1)).toMatchObject({ actor: { id: "agent_ratiflow_demo" }, origin: "WEBMCP" });
    const after = await service.inspect(sessions.mayaSessionToken);
    const newActivity = after.collaboration.recentActivity.slice(before.collaboration.recentActivity.length);
    expect(newActivity).toEqual([expect.objectContaining({ type: "WORKSPACE_MUTATED", actor: { id: "agent_ratiflow_demo", name: "Ratiflow Agent", role: "Decision analyst" }, via: "BROWSER_AGENT", workspaceRevision: 8 })]);
  });

  it("honors an already-aborted invocation without serializing cancellation", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const controller = new AbortController();
    controller.abort("page reset");
    await expect(service.catchUpAgentSession({ ...browser(sessions.agentSessionToken), signal: controller.signal }, {})).rejects.toMatchObject({ name: "AbortError" });
  });
});
