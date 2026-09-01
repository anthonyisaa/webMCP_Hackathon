import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { RepositoryHttpService } from "./repository-http-service";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const PAGE_ID = "223e4567-e89b-42d3-a456-426614174000";

afterEach(() => {
  vi.unstubAllGlobals();
});

function installFetchRecorder() {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Response.json({ ok: true, data: {} });
  });
  return calls;
}

function headersOf(call: { init: RequestInit }): Headers {
  return new Headers(call.init.headers);
}

test("credential issuance sends exact public JSON without idempotency headers", async () => {
  const calls = installFetchRecorder();
  const client = new RepositoryHttpService(() => REQUEST_ID);

  await client.launch({ kind: "POSTMORTEM", displayName: "Priya" });
  await client.launchExample({});
  await client.join({ shareToken: "share", displayName: "Nadia" });

  assert.deepEqual(calls.map((call) => call.path), [
    "/api/repository-v4/launch",
    "/api/repository-v4/example",
    "/api/repository-v4/join",
  ]);
  assert.deepEqual(calls.map((call) => JSON.parse(String(call.init.body))), [
    { kind: "POSTMORTEM", displayName: "Priya" },
    {},
    { shareToken: "share", displayName: "Nadia" },
  ]);
  for (const call of calls) {
    assert.equal(headersOf(call).has("Idempotency-Key"), false);
  }
});

test("human mutations keep request identity in the header and out of JSON", async () => {
  const calls = installFetchRecorder();
  const client = new RepositoryHttpService(() => REQUEST_ID);

  await client.saveHumanRevision("human-token", {
    expectedRevision: 1,
    title: "Title",
    body: "Body",
    changeSummary: "Clarify impact.",
  });

  assert.equal(calls[0]?.path, "/api/repository-v4/revision/save");
  assert.equal(headersOf(calls[0]!).get("Authorization"), "Bearer human-token");
  assert.equal(headersOf(calls[0]!).get("Idempotency-Key"), REQUEST_ID);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
    expectedRevision: 1,
    title: "Title",
    body: "Body",
    changeSummary: "Clarify impact.",
  });
  assert.equal(String(calls[0]!.init.body).includes("requestId"), false);
});

test("agent reads and waits carry page identity but no idempotency key", async () => {
  const calls = installFetchRecorder();
  const client = new RepositoryHttpService(() => REQUEST_ID);

  await client.listMyTasks("agent-token", { includeResolved: true }, PAGE_ID);
  await client.waitForMyTasks(
    "agent-token",
    { afterActivityVersion: 4, afterRevision: 1, timeoutSeconds: 20 },
    PAGE_ID,
  );

  assert.deepEqual(calls.map((call) => call.path), [
    "/api/repository-v4/agent/tasks",
    "/api/repository-v4/agent/tasks/wait",
  ]);
  for (const call of calls) {
    const headers = headersOf(call);
    assert.equal(headers.get("X-Ratiflow-Page-Session"), PAGE_ID);
    assert.equal(headers.has("Idempotency-Key"), false);
  }
});

test("agent mutations carry page and request headers while preserving tool JSON", async () => {
  const calls = installFetchRecorder();
  const client = new RepositoryHttpService(() => REQUEST_ID);
  const taskId = "323e4567-e89b-42d3-a456-426614174000";

  await client.commentOnTask(
    "agent-token",
    { taskId, body: "The retry path ignored Retry-After." },
    PAGE_ID,
  );
  await client.submitTaskResult(
    "agent-token",
    {
      taskId,
      basedOnRevision: 1,
      resultSummary: "Separate trigger from amplifier.",
      replacementText: "Revised root cause.",
      evidenceRefs: ["commit:7d3c9e1"],
    },
    PAGE_ID,
  );

  for (const call of calls) {
    const headers = headersOf(call);
    assert.equal(headers.get("X-Ratiflow-Page-Session"), PAGE_ID);
    assert.equal(headers.get("Idempotency-Key"), REQUEST_ID);
    assert.equal(String(call.init.body).includes("requestId"), false);
  }
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/repository-v4/agent/comment",
    "/api/repository-v4/agent/result",
  ]);
});

test("revision read serializes the checked public input", async () => {
  const calls = installFetchRecorder();
  const client = new RepositoryHttpService(() => REQUEST_ID);

  await client.readRevision("human-token", 3);

  assert.equal(calls[0]?.path, "/api/repository-v4/revision/read");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { revision: 3 });
  assert.equal(headersOf(calls[0]!).has("Idempotency-Key"), false);
});
