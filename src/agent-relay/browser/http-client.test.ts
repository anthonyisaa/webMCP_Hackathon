import assert from "node:assert/strict";
import { test } from "vitest";

import { RELAY_CAPABILITY_CONTRACT_VALUE } from "@/repository/contracts";

import type {
  RelayBrowserTraceInput,
  RelayExecutionPermitToken,
  RelayGrant,
} from "../contracts";
import { RelayHttpClient, RELAY_HTTP_HEADERS } from "./http-client";

const FAILURE_BODY = {
  ok: false,
  code: "RELAY_UNAVAILABLE",
  message: "Temporarily unavailable.",
  retryable: true,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

test("retries claim, step, and tool transport once with the identical private idempotency key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let failTransport = true;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (failTransport) {
      failTransport = false;
      throw new TypeError("simulated connection reset");
    }
    failTransport = true;
    return jsonResponse(FAILURE_BODY);
  }) as typeof fetch;
  let requestNumber = 0;
  const client = new RelayHttpClient({
    humanSessionToken: "human-secret",
    origin: "https://ratiflow.test",
    fetch: fetcher,
    createRequestId: () => `request-${++requestNumber}`,
  });
  const grant = "rfrelay_v1.secret" as RelayGrant;

  const retryRunId = "30000000-0000-4000-8000-000000000012";
  await client.claim("page-session", retryRunId);
  await client.step(grant, {
    action: "START",
    attemptId: "attempt-1",
    expectedStep: 0,
  });
  await client.executeTool(
    grant,
    "rfpermit_v1.secret" as RelayExecutionPermitToken,
    "rf_repository_0123456789abcdef_g1_assignment",
    {},
  );

  assert.equal(calls.length, 6);
  for (const call of calls) {
    assert.equal(
      new Headers(call.init?.headers).get(RELAY_HTTP_HEADERS.contract),
      RELAY_CAPABILITY_CONTRACT_VALUE,
    );
  }
  for (let index = 0; index < calls.length; index += 2) {
    const first = new Headers(calls[index]?.init?.headers);
    const second = new Headers(calls[index + 1]?.init?.headers);
    assert.equal(
      first.get(RELAY_HTTP_HEADERS.idempotency),
      second.get(RELAY_HTTP_HEADERS.idempotency),
    );
  }
  const toolHeaders = new Headers(calls[4]?.init?.headers);
  const claimHeaders = new Headers(calls[0]?.init?.headers);
  assert.equal(claimHeaders.get(RELAY_HTTP_HEADERS.retryRun), retryRunId);
  assert.equal(new Headers(calls[1]?.init?.headers).get(RELAY_HTTP_HEADERS.retryRun), retryRunId);
  assert.equal(toolHeaders.get(RELAY_HTTP_HEADERS.executionPermit), "rfpermit_v1.secret");
  assert.equal(JSON.stringify(calls).includes("human-secret"), true);
  assert.equal(JSON.stringify(calls).includes("rfpermit_v1.secret"), true);
});

test("does not retry a decoded application failure", async () => {
  let calls = 0;
  const client = new RelayHttpClient({
    humanSessionToken: "human-secret",
    origin: "https://ratiflow.test",
    fetch: (async () => {
      calls += 1;
      return jsonResponse(FAILURE_BODY);
    }) as typeof fetch,
    createRequestId: () => "request-one",
  });
  const result = await client.claim("page-session");
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});

test("records only the exact browser observation at the dedicated trace route", async () => {
  let observed: { url: string; init?: RequestInit } | undefined;
  const client = new RelayHttpClient({
    humanSessionToken: "human-secret",
    origin: "https://ratiflow.test",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      observed = { url: String(url), init };
      return Response.json({ ok: true, data: {} });
    }) as typeof fetch,
  });
  const input: RelayBrowserTraceInput = {
    kind: "WEBMCP_TOOLCHANGE_OBSERVED",
    detail: { transition: "RELAY_CATALOG_WITHDRAWN" },
  };
  await client.recordTrace("rfrelay_v1.secret" as RelayGrant, input);
  assert.equal(observed?.url, "https://ratiflow.test/api/repository-v4/relay/trace");
  assert.deepEqual(JSON.parse(String(observed?.init?.body)), input);
  assert.equal(
    new Headers(observed?.init?.headers).get("Authorization"),
    "Bearer rfrelay_v1.secret",
  );
  assert.equal(
    new Headers(observed?.init?.headers).get(RELAY_HTTP_HEADERS.contract),
    RELAY_CAPABILITY_CONTRACT_VALUE,
  );
});

test("sends the exact capability-first contract on every Relay endpoint", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new RelayHttpClient({
    humanSessionToken: "human-secret",
    origin: "https://ratiflow.test",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json({ ok: true, data: {} });
    }) as typeof fetch,
    createRequestId: () => "request-one",
  });
  const grant = "rfrelay_v1.secret" as RelayGrant;

  await client.readState();
  await client.claim("page-session");
  await client.renewLease(grant, "lease-one");
  await client.releaseLease(grant);
  await client.recordTrace(grant, {
    kind: "WEBMCP_TOOLCHANGE_OBSERVED",
    detail: { transition: "RELAY_CATALOG_WITHDRAWN" },
  });
  await client.step(grant, {
    action: "START",
    attemptId: "attempt-one",
    expectedStep: 0,
  });
  await client.executeTool(
    grant,
    "rfpermit_v1.secret" as RelayExecutionPermitToken,
    "rf_repository_0123456789abcdef_g1_assignment",
    {},
  );

  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
    "/api/repository-v4/relay/state",
    "/api/repository-v4/relay/claim",
    "/api/repository-v4/relay/lease/renew",
    "/api/repository-v4/relay/lease/release",
    "/api/repository-v4/relay/trace",
    "/api/repository-v4/relay/step",
    "/api/repository-v4/relay/tool",
  ]);
  for (const call of calls) {
    assert.equal(
      new Headers(call.init?.headers).get(RELAY_HTTP_HEADERS.contract),
      RELAY_CAPABILITY_CONTRACT_VALUE,
    );
  }
});
