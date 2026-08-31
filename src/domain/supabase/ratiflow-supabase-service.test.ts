import { describe, expect, it } from "vitest";

import {
  SupabaseRatiflowService,
  normalizeCoordinationResult,
  normalizeToolResult,
  normalizeWorkspaceView,
} from "./ratiflow-supabase-service";

const cursor = "00000000-0000-4000-8000-000000000001";
const actor = { id: "agent_ratiflow_demo", name: "Ratiflow demo agent", role: "Decision analyst" };

const workspace = {
  id: "ws_isolated", name: "Northstar CSV launch scope", revision: 7,
  decision: { id: "dec_csv_oct15", question: "CSV?", state: "READY", selectedOptionId: "opt_csv_ga_oct15", launchDate: "2026-10-15", launchCapacityEngineerDays: 18, coreReliabilityEngineerDays: 10 },
  customer: { id: "cust_northstar_health", name: "Northstar Health", annualRenewalUsd: 180000, usableExportDueDate: "2026-11-01" },
  options: [], evidence: [], challenges: [], provenance: [], preparedDecision: null,
  followup: { id: "fu_customer_launch_brief", slug: "customer-launch-brief", status: "BLOCKED", ownerId: "usr_maya_chen", dueDate: "2026-10-16", inheritedContext: [] },
  readiness: { activeOptionCount: 3, hasCurrentCapacityEvidence: true, hasNorthstarDeadlineEvidence: true, selectedOptionId: "opt_csv_ga_oct15", selectedOptionEngineerDays: 18, launchCapacityEngineerDays: 18, unresolvedBlockingChallengeCount: 0 },
  collaboration: {
    cursor,
    agent: { actor, state: "AWAY", lastSeenAt: null, activeVia: null },
    standingInstructions: { autoPickup: false, scopes: ["MENTIONS", "TASKS"], maxActionsPerHour: 6 },
    inbox: [], comments: [], questions: [],
    recentActivity: [{
      id: "00000000-0000-4000-8000-000000000002",
      cursor,
      createdAt: "2026-09-01T00:00:00.000Z",
      actor: { id: "system_seed", name: "Seed fixture", role: "System" },
      actorType: "SYSTEM",
      via: "SYSTEM",
      type: "WORKSPACE_MUTATED",
      target: { kind: "DECISION", id: "dec_csv_oct15" },
      summary: "Workspace activity initialized.",
      workspaceRevision: 7,
    }],
  },
};

describe("SupabaseRatiflowService", () => {
  it("accepts the frozen workspace envelope and rejects malformed RPC data", () => {
    expect(normalizeWorkspaceView(workspace).revision).toBe(7);
    expect(() => normalizeWorkspaceView({ id: "missing" })).toThrow("invalid WorkspaceView");
    expect(() => normalizeWorkspaceView({ ...workspace, unexpected: true })).toThrow("invalid WorkspaceView");
    expect(() => normalizeWorkspaceView({ ...workspace, collaboration: undefined })).toThrow("invalid WorkspaceView");
    expect(() => normalizeWorkspaceView({ ...workspace, decision: { ...workspace.decision, launchDate: "2026-02-30" } })).toThrow("invalid WorkspaceView");
    expect(() => normalizeToolResult({ ok: true })).toThrow("invalid ToolResult");
  });

  it("requires an explicit null claim for open tasks and a boolean ownership fence", () => {
    const openTask = {
      id: "00000000-0000-4000-8000-000000000030",
      kind: "TASK",
      body: "Review delivery risk.",
      target: { kind: "OPTION", id: "opt_csv_beta_oct15" },
      status: "OPEN",
      createdBy: { id: "usr_maya_chen", name: "Maya Chen", role: "Product Lead" },
      assignedAgent: actor,
      claim: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const withOpenTask = {
      ...workspace,
      collaboration: { ...workspace.collaboration, inbox: [openTask] },
    };
    expect(normalizeWorkspaceView(withOpenTask).collaboration.inbox).toHaveLength(1);

    const withoutClaim: Partial<typeof openTask> = { ...openTask };
    delete withoutClaim.claim;
    expect(() => normalizeWorkspaceView({
      ...workspace,
      collaboration: { ...workspace.collaboration, inbox: [withoutClaim] },
    })).toThrow("invalid WorkspaceView");

    expect(normalizeWorkspaceView({
      ...workspace,
      collaboration: {
        ...workspace.collaboration,
        inbox: [{
          ...openTask,
          status: "CLAIMED",
          claim: {
            via: "BROWSER_AGENT",
            expiresAt: "2026-09-01T00:01:30.000Z",
            ownedByCurrentSession: false,
          },
        }],
      },
    }).collaboration.inbox[0].claim).toMatchObject({
      ownedByCurrentSession: false,
    });
  });

  it("validates the coordination result family, including cursor resets", () => {
    expect(normalizeCoordinationResult({ ok: true, data: {}, cursor })).toEqual({ ok: true, data: {}, cursor });
    expect(normalizeCoordinationResult({
      ok: false,
      code: "CURSOR_EXPIRED",
      message: "reset",
      retryable: true,
      resetCursor: cursor,
      nextAction: "Catch up again.",
    })).toMatchObject({ code: "CURSOR_EXPIRED", resetCursor: cursor });
    expect(() => normalizeCoordinationResult({ ok: true, data: {} })).toThrow("invalid coordination success");
  });

  it("maps the frozen session and claim calls to exact RPC parameters", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const toolError = {
      ok: false, code: "CONFLICT", message: "blocked", retryable: true,
      currentWorkspaceRevision: 7, contextEpoch: 0,
      currentCapabilities: { state: "READY", workspaceRevision: 7, contextEpoch: 0, selection: { kind: "DECISION", id: "dec_csv_oct15" }, availableTools: [], unavailableActions: [] },
    };
    const service = new SupabaseRatiflowService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_example",
      fetch: async (url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ url: String(url), body });
        return Response.json(String(url).endsWith("/ratiflow_agent_mutate")
          ? toolError
          : { ok: true, data: {}, cursor });
      },
    });
    const context = {
      caller: "BROWSER_AGENT" as const,
      pageSessionId: "00000000-0000-4000-8000-000000000010",
      agentSessionToken: "opaque-agent-handle",
      claimId: "00000000-0000-4000-8000-000000000011",
    };
    const selection = { kind: "DECISION" as const, id: "dec_csv_oct15" };

    await service.joinAgentSession(context, selection);
    await service.catchUpAgentSession(context, { sinceCursor: cursor });
    await service.claimAgentTask(context, {
      taskId: "00000000-0000-4000-8000-000000000020",
      requestId: "00000000-0000-4000-8000-000000000021",
    });
    await service.mutateFromWebMCP({
      executionContext: context,
      toolName: "recommend_option",
      envelope: {
        expectedWorkspaceRevision: 7,
        contextEpoch: 0,
        requestId: "00000000-0000-4000-8000-000000000022",
        rationale: "Keep the current recommendation.",
        payload: { optionId: "opt_csv_ga_oct15" },
      },
      capturedSelection: selection,
      capturedContextEpoch: 0,
    });

    expect(calls.map((call) => call.url.split("/").at(-1))).toEqual([
      "ratiflow_agent_join",
      "ratiflow_agent_catch_up",
      "ratiflow_agent_claim_task",
      "ratiflow_agent_mutate",
    ]);
    expect(calls[1].body).toEqual({
      p_handle: "opaque-agent-handle",
      p_page_session_id: context.pageSessionId,
      p_caller: "BROWSER_AGENT",
      p_since_cursor: cursor,
    });
    expect(calls[2].body).toMatchObject({
      p_handle: "opaque-agent-handle",
      p_page_session_id: context.pageSessionId,
      p_caller: "BROWSER_AGENT",
      p_claim_id: context.claimId,
    });
    expect(calls[3].body).not.toHaveProperty("workspaceId");
    expect(calls[3].body).not.toHaveProperty("actor");
    expect(calls[3].body).not.toHaveProperty("origin");
  });

  it("accepts the full structured unauthorized result but rejects capability drift", () => {
    const error = {
      ok: false, code: "UNAUTHORIZED", message: "A valid demo membership session is required.", retryable: false,
      currentWorkspaceRevision: 0, contextEpoch: 0,
      currentCapabilities: { state: "OPTIONS", workspaceRevision: 0, contextEpoch: 0, selection: { kind: "DECISION", id: "dec_csv_oct15" }, availableTools: [], unavailableActions: [] },
    };
    expect(normalizeToolResult(error)).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(() => normalizeToolResult({ ...error, currentCapabilities: { ...error.currentCapabilities, signature: "not-public" } })).toThrow("invalid ToolResult");
  });

  it("sends opaque handles only as RPC parameters and does not pretend a failed call succeeded", async () => {
    let request: RequestInit | undefined;
    const service = new SupabaseRatiflowService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_example",
      fetch: async (_url, init) => {
        request = init;
        return new Response(JSON.stringify({ message: "network denied" }), { status: 503 });
      },
    });
    await expect(service.inspect("opaque-handle")).rejects.toThrow("failed (503)");
    expect(request?.headers).toMatchObject({ apikey: "sb_publishable_example" });
    expect(request?.body).toBe(JSON.stringify({ p_handle: "opaque-handle" }));
  });
});
