import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRegistryExecutionContext } from "@/contracts";
import { HttpRatiflowService } from "@/components/product/http-service";

const context: AgentRegistryExecutionContext = {
  caller: "AUTO_RUNNER",
  pageSessionId: "10000000-0000-4000-8000-000000000001",
  agentSessionToken: "opaque-agent-token",
  claimId: "10000000-0000-4000-8000-000000000002",
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

describe("HttpRatiflowService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the fixed caller route and keeps authority in headers", async () => {
    const request = vi.fn(async () => jsonResponse({ ok: true, cursor: "cursor", data: { inbox: [] } }));
    vi.stubGlobal("fetch", request);
    const service = new HttpRatiflowService();

    await service.getAgentInbox(context);

    expect(request).toHaveBeenCalledOnce();
    const [path, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/workspace/auto/coordination/inbox");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer opaque-agent-token",
      "X-Ratiflow-Page-Session": context.pageSessionId,
      "X-Ratiflow-Claim": context.claimId,
    });
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("sends decision mutation JSON without caller, token, page session, or claim", async () => {
    const request = vi.fn(async () => jsonResponse({ ok: false, code: "CONFLICT", message: "blocked", retryable: false }));
    vi.stubGlobal("fetch", request);
    const service = new HttpRatiflowService();
    const body = {
      toolName: "recommend_option" as const,
      envelope: { expectedWorkspaceRevision: 7, contextEpoch: 2, requestId: "10000000-0000-4000-8000-000000000003", rationale: "O2 fits.", payload: { optionId: "opt_csv_beta_oct15" } },
      capturedSelection: { kind: "OPTION" as const, id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
    };

    await service.mutateFromWebMCP({ ...body, executionContext: context });

    const [path, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/workspace/auto");
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(String(init.body)).not.toMatch(/agentSessionToken|pageSessionId|claimId|caller|executionContext/);
  });

  it("keeps human-authored task input on the ordinary UI route", async () => {
    const request = vi.fn(async () => jsonResponse({ ok: true, cursor: "cursor", data: { task: {} } }));
    vi.stubGlobal("fetch", request);
    const service = new HttpRatiflowService();
    const input = { kind: "TASK" as const, body: "Review O2", target: { kind: "DECISION" as const, id: "dec_csv_oct15" }, requestId: "10000000-0000-4000-8000-000000000004" };

    await service.createAgentTaskFromHumanUi("maya-token", input);

    const [path, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/workspace/tasks");
    expect(init.headers).toMatchObject({ Authorization: "Bearer maya-token" });
    expect(JSON.parse(String(init.body))).toEqual(input);
  });
});
