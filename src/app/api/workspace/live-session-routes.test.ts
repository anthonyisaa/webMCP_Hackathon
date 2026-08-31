import { beforeEach, describe, expect, it, vi } from "vitest";

const joinAgentSession = vi.fn(async () => ({ ok: true, cursor: "cursor", data: {} }));
const claimAgentTask = vi.fn(async () => ({ ok: true, cursor: "cursor", data: {} }));
const mutateFromWebMCP = vi.fn(async () => ({ ok: true, data: {} }));
const createAgentTaskFromHumanUi = vi.fn(async () => ({ ok: true, cursor: "cursor", data: {} }));

vi.mock("@/domain/ratiflow-runtime", () => ({
  getRuntimeRatiflowService: () => ({ joinAgentSession, claimAgentTask, mutateFromWebMCP, createAgentTaskFromHumanUi }),
}));

import { POST as autoAction } from "./auto/coordination/[action]/route";
import { POST as autoMutation } from "./auto/route";
import { POST as createTask } from "./tasks/route";
import { POST as browserAction } from "./webmcp/coordination/[action]/route";

const agentToken = "opaque-agent-token";
const pageSessionId = "10000000-0000-4000-8000-000000000001";
const claimId = "10000000-0000-4000-8000-000000000002";

function agentRequest(path: string, body: unknown, extras: Record<string, string> = {}): Request {
  return new Request(`https://ratiflow.test${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${agentToken}`,
      "content-type": "application/json",
      "x-ratiflow-page-session": pageSessionId,
      ...extras,
    },
    body: JSON.stringify(body),
  });
}

describe("live agent-session route families", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives browser caller and selection from the fixed route and headers", async () => {
    const response = await browserAction(agentRequest("/api/workspace/webmcp/coordination/join", {}, {
      "x-ratiflow-selection-kind": "OPTION",
      "x-ratiflow-selection-id": "opt_csv_beta_oct15",
    }), { params: Promise.resolve({ action: "join" }) });

    expect(response.status).toBe(200);
    expect(joinAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ caller: "BROWSER_AGENT", pageSessionId, agentSessionToken: agentToken, signal: expect.any(AbortSignal) }),
      { kind: "OPTION", id: "opt_csv_beta_oct15" },
    );
  });

  it("derives auto caller and claim from headers while rejecting trust fields in JSON", async () => {
    const accepted = await autoAction(agentRequest("/api/workspace/auto/coordination/claim", {
      taskId: "task-1", requestId: "10000000-0000-4000-8000-000000000003",
    }, { "x-ratiflow-claim": claimId }), { params: Promise.resolve({ action: "claim" }) });
    expect(accepted.status).toBe(200);
    expect(claimAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({ caller: "AUTO_RUNNER", pageSessionId, claimId, agentSessionToken: agentToken }),
      { taskId: "task-1", requestId: "10000000-0000-4000-8000-000000000003" },
    );

    const rejected = await autoAction(agentRequest("/api/workspace/auto/coordination/claim", {
      taskId: "task-1", requestId: "10000000-0000-4000-8000-000000000004", caller: "BROWSER_AGENT",
    }), { params: Promise.resolve({ action: "claim" }) });
    expect(rejected.status).toBe(400);
    expect(claimAgentTask).toHaveBeenCalledTimes(1);
  });

  it("keeps decision mutation trust context outside the exact JSON body", async () => {
    const body = {
      toolName: "recommend_option",
      envelope: { expectedWorkspaceRevision: 7, contextEpoch: 1, requestId: "10000000-0000-4000-8000-000000000005", rationale: "O2 fits.", payload: { optionId: "opt_csv_beta_oct15" } },
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 1,
    };
    const response = await autoMutation(agentRequest("/api/workspace/auto", body));
    expect(response.status).toBe(200);
    expect(mutateFromWebMCP).toHaveBeenCalledWith({ ...body, executionContext: expect.objectContaining({ caller: "AUTO_RUNNER", pageSessionId, agentSessionToken: agentToken }) });

    const injected = await autoMutation(agentRequest("/api/workspace/auto", { ...body, executionContext: { caller: "BROWSER_AGENT" } }));
    expect(injected.status).toBe(400);
    expect(mutateFromWebMCP).toHaveBeenCalledTimes(1);
  });

  it("derives human authorship from Authorization and rejects actor injection", async () => {
    const input = { kind: "TASK", body: "Review O2", target: { kind: "DECISION", id: "dec_csv_oct15" }, requestId: "10000000-0000-4000-8000-000000000006" };
    const response = await createTask(new Request("https://ratiflow.test/api/workspace/tasks", {
      method: "POST", headers: { authorization: "Bearer maya-token", "content-type": "application/json" }, body: JSON.stringify(input),
    }));
    expect(response.status).toBe(200);
    expect(createAgentTaskFromHumanUi).toHaveBeenCalledWith("maya-token", input, expect.any(AbortSignal));

    const injected = await createTask(new Request("https://ratiflow.test/api/workspace/tasks", {
      method: "POST", headers: { authorization: "Bearer maya-token", "content-type": "application/json" }, body: JSON.stringify({ ...input, actor: { id: "agent_ratiflow_demo" } }),
    }));
    expect(injected.status).toBe(400);
    expect(createAgentTaskFromHumanUi).toHaveBeenCalledTimes(1);
  });

  it("requires both membership and page-session transport metadata", async () => {
    const missing = await browserAction(new Request("https://ratiflow.test/api/workspace/webmcp/coordination/inbox", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` }, body: "{}",
    }), { params: Promise.resolve({ action: "inbox" }) });
    expect(missing.status).toBe(401);
  });
});
