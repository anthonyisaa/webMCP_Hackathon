import { randomUUID } from "node:crypto";

import { beforeEach, expect, test, vi } from "vitest";

const relay = vi.hoisted(() => ({
  readRelayState: vi.fn(),
  claimRelay: vi.fn(),
  renewRelayLease: vi.fn(),
  releaseRelayLease: vi.fn(),
  recordRelayTrace: vi.fn(),
  executeRelayTool: vi.fn(),
  createDirectoryMention: vi.fn(),
}));

vi.mock("@/domain/repository-runtime", () => ({
  getRuntimeRepositoryRelayService: () => relay,
  getRuntimeRepositoryService: () => ({ createMentionTask: vi.fn() }),
}));

const grant = "rfrelay_v1.payload.signature";
const permit = "rfpermit_v1.payload.signature";

beforeEach(() => {
  vi.clearAllMocks();
  relay.readRelayState.mockResolvedValue({ ok: true, data: { directory: [] } });
  relay.claimRelay.mockResolvedValue({
    ok: true,
    data: { outcome: "NO_WORK", retryAfterMs: 15_000 },
  });
  relay.renewRelayLease.mockResolvedValue({ ok: true, data: { leaseId: randomUUID() } });
  relay.releaseRelayLease.mockResolvedValue({ ok: true, data: { status: "COMPLETED" } });
  relay.recordRelayTrace.mockResolvedValue({
    ok: true,
    data: { relayEventId: randomUUID(), kind: "IDLE_CATALOG_WITHDRAWN" },
  });
  relay.executeRelayTool.mockResolvedValue({
    ok: true,
    data: { resultReceiptId: randomUUID(), output: "{\"ok\":true,\"data\":{}}" },
  });
  relay.createDirectoryMention.mockResolvedValue({
    ok: true,
    data: {
      outcome: "DISCUSSION_CREATED",
      target: { kind: "HUMAN", memberId: randomUUID() },
      threadId: randomUUID(), commentId: randomUUID(), taskId: null, runId: null,
    },
  });
});

test("state and claim use only the human bearer plus exact claim headers", async () => {
  const token = "human-session";
  const pageSessionId = randomUUID();
  const requestId = randomUUID();
  const { GET } = await import("./state/route");
  const state = await GET(new Request("https://ratiflow.test/api/repository-v4/relay/state", {
    headers: { authorization: `Bearer ${token}` },
  }));
  expect(state.status).toBe(200);
  expect(relay.readRelayState).toHaveBeenCalledWith(token, expect.any(AbortSignal));

  const { POST } = await import("./claim/route");
  const claimed = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/claim", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "X-Ratiflow-Page-Session": pageSessionId,
      "Idempotency-Key": requestId,
    },
  }));
  expect(claimed.status).toBe(200);
  expect(relay.claimRelay).toHaveBeenCalledWith(
    token, pageSessionId, requestId, undefined, expect.any(AbortSignal),
  );
  const rejected = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/claim", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "X-Ratiflow-Page-Session": pageSessionId,
      "Idempotency-Key": requestId,
    },
    body: "{}",
  }));
  expect(rejected.status).toBe(400);
});

test("claim binds an explicit retry to one UUID and rejects malformed targets", async () => {
  const token = "human-session";
  const pageSessionId = randomUUID();
  const requestId = randomUUID();
  const retryRunId = randomUUID();
  const { POST } = await import("./claim/route");
  const claimed = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/claim", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "X-Ratiflow-Page-Session": pageSessionId,
      "X-Ratiflow-Relay-Retry-Run": retryRunId,
      "Idempotency-Key": requestId,
    },
  }));
  expect(claimed.status).toBe(200);
  expect(relay.claimRelay).toHaveBeenCalledWith(
    token, pageSessionId, requestId, retryRunId, expect.any(AbortSignal),
  );

  const rejected = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/claim", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "X-Ratiflow-Page-Session": pageSessionId,
      "X-Ratiflow-Relay-Retry-Run": "not-a-run",
      "Idempotency-Key": randomUUID(),
    },
  }));
  expect(rejected.status).toBe(400);
  expect(relay.claimRelay).toHaveBeenCalledTimes(1);
});

test("trace accepts only exact browser-observed catalog transitions", async () => {
  const { POST } = await import("./trace/route");
  const input = {
    kind: "WEBMCP_TOOLCHANGE_OBSERVED",
    detail: { transition: "RELAY_CATALOG_WITHDRAWN" },
  };
  const accepted = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/trace", {
    method: "POST",
    headers: {
      authorization: `Bearer ${grant}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }));
  expect(accepted.status).toBe(200);
  expect(relay.recordRelayTrace).toHaveBeenCalledWith(
    grant, input, expect.any(AbortSignal),
  );

  for (const invalid of [
    { kind: "RUN_COMPLETED", detail: { transition: "IDLE_CATALOG_RESTORED" } },
    { kind: "RELAY_CATALOG_REGISTERED", detail: { transition: "RELAY_CATALOG_WITHDRAWN" } },
    { kind: "IDLE_CATALOG_RESTORED", detail: { transition: "IDLE_CATALOG_RESTORED" }, extra: true },
  ]) {
    const rejected = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/trace", {
      method: "POST",
      headers: {
        authorization: `Bearer ${grant}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invalid),
    }));
    expect(rejected.status).toBe(400);
  }
  expect(relay.recordRelayTrace).toHaveBeenCalledTimes(1);
});

test("tool keeps the one-shot permit outside exact model-visible JSON", async () => {
  const requestId = randomUUID();
  const physicalToolName = "rf_data_0123456789abcdef_g1_assignment";
  const { POST } = await import("./tool/route");
  const response = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/tool", {
    method: "POST",
    headers: {
      authorization: `Bearer ${grant}`,
      "X-Ratiflow-Relay-Permit": permit,
      "Idempotency-Key": requestId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ physicalToolName, input: {} }),
  }));
  expect(response.status).toBe(200);
  expect(relay.executeRelayTool).toHaveBeenCalledWith(grant, {
    requestId,
    permit,
    physicalToolName,
    input: {},
  }, expect.any(AbortSignal));
  const leaked = await POST(new Request("https://ratiflow.test/api/repository-v4/relay/tool", {
    method: "POST",
    headers: {
      authorization: `Bearer ${grant}`,
      "X-Ratiflow-Relay-Permit": permit,
      "Idempotency-Key": requestId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ physicalToolName, input: {}, requestId }),
  }));
  expect(leaked.status).toBe(400);
});

test("canonical mention dispatches only the discriminated directory shape", async () => {
  const requestId = randomUUID();
  const memberId = randomUUID();
  const body = {
    expectedRevision: 1,
    comment: "@Priya Please review this.",
    target: { kind: "HUMAN", memberId },
    anchor: { scope: "DOCUMENT" },
  };
  const { POST } = await import("../task/mention/route");
  const response = await POST(new Request("https://ratiflow.test/api/repository-v4/task/mention", {
    method: "POST",
    headers: {
      authorization: "Bearer human-session",
      "Idempotency-Key": requestId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }));
  expect(response.status).toBe(201);
  expect(relay.createDirectoryMention).toHaveBeenCalledWith(
    "human-session", { ...body, requestId }, expect.any(AbortSignal),
  );
});
