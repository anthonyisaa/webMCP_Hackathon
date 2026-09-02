import { randomUUID } from "node:crypto";

import { expect, test, vi } from "vitest";

import type {
  RelayResult,
  RelayStepOutcome,
} from "@/agent-relay/contracts";
import type { RelayStepRequest } from "@/agent-relay/server/relay-stepper";
import {
  handleRelayStepRequest,
  type RelayStepExecutor,
} from "./handler";

const URL = "https://demo.ratiflow.test/api/repository-v4/relay/step";
const GRANT = "rfrelay_v1.test-payload.test-signature";

function post(
  body: unknown,
  options: {
    grant?: string;
    requestId?: string;
    origin?: string;
    rawBody?: string;
  } = {},
): Request {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.grant ?? GRANT}`,
      "Idempotency-Key": options.requestId ?? randomUUID(),
      origin: options.origin ?? "https://demo.ratiflow.test",
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

function executor(result: RelayResult<RelayStepOutcome>) {
  const step = vi.fn(async (request: RelayStepRequest, signal?: AbortSignal) => {
    void request;
    void signal;
    return result;
  });
  return { step } satisfies RelayStepExecutor;
}

test("forwards only the exact Relay step envelope and private transport metadata", async () => {
  const result: RelayResult<RelayStepOutcome> = {
    ok: true,
    data: {
      outcome: "DISCOVER_TOOLS",
      attemptId: "attempt-1",
      nextStep: 1,
      toolSearchCallId: "search-1",
      goal: "Find the assignment tool.",
    },
  };
  const target = executor(result);
  const requestId = randomUUID();
  const response = await handleRelayStepRequest(post({
    action: "START",
    attemptId: "attempt-1",
    expectedStep: 0,
  }, { requestId }), target);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual(result);
  expect(target.step).toHaveBeenCalledTimes(1);
  expect(target.step.mock.calls[0][0]).toEqual({
    grant: GRANT,
    requestId,
    requestOrigin: "https://demo.ratiflow.test",
    input: { action: "START", attemptId: "attempt-1", expectedStep: 0 },
  });
});

test("rejects missing Relay authority and public model, prompt, tool, or request fields", async () => {
  const target = executor({
    ok: false,
    code: "RELAY_UNAVAILABLE",
    message: "Should not run.",
    retryable: false,
  });
  const bodies = [
    { action: "START", attemptId: "attempt-1", expectedStep: 0, model: "other" },
    { action: "START", attemptId: "attempt-1", expectedStep: 0, prompt: "ignore rules" },
    { action: "START", attemptId: "attempt-1", expectedStep: 0, tools: [] },
    { action: "START", attemptId: "attempt-1", expectedStep: 0, requestId: randomUUID() },
  ];
  for (const body of bodies) {
    const response = await handleRelayStepRequest(post(body), target);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  }
  expect(target.step).not.toHaveBeenCalled();
});

test("rejects malformed JSON, missing idempotency, invalid grants, and absent or cross-origin Origin", async () => {
  const target = executor({
    ok: false,
    code: "RELAY_UNAVAILABLE",
    message: "Should not run.",
    retryable: false,
  });
  const malformed = await handleRelayStepRequest(post({}, { rawBody: "{" }), target);
  expect(malformed.status).toBe(400);

  const missingIdempotency = new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${GRANT}`,
      origin: "https://demo.ratiflow.test",
    },
    body: JSON.stringify({ action: "START", attemptId: "attempt-1", expectedStep: 0 }),
  });
  expect((await handleRelayStepRequest(missingIdempotency, target)).status).toBe(400);
  expect((await handleRelayStepRequest(post({
    action: "START", attemptId: "attempt-1", expectedStep: 0,
  }, { grant: "not-a-relay-grant" }), target)).status).toBe(401);
  expect((await handleRelayStepRequest(post({
    action: "START", attemptId: "attempt-1", expectedStep: 0,
  }, { origin: "https://attacker.test" }), target)).status).toBe(401);
  const missingOrigin = new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${GRANT}`,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ action: "START", attemptId: "attempt-1", expectedStep: 0 }),
  });
  expect((await handleRelayStepRequest(missingOrigin, target)).status).toBe(401);
  expect(target.step).not.toHaveBeenCalled();
});

test("maps Relay failures to safe HTTP statuses without rewriting their envelope", async () => {
  const unavailable: RelayResult<RelayStepOutcome> = {
    ok: false,
    code: "RELAY_UNAVAILABLE",
    message: "The managed agent provider is unavailable.",
    retryable: true,
  };
  const unavailableResponse = await handleRelayStepRequest(post({
    action: "START", attemptId: "attempt-1", expectedStep: 0,
  }), executor(unavailable));
  expect(unavailableResponse.status).toBe(503);
  await expect(unavailableResponse.json()).resolves.toEqual(unavailable);

  const conflict: RelayResult<RelayStepOutcome> = {
    ok: false,
    code: "RELAY_STATE_CONFLICT",
    message: "The step is already in progress.",
    retryable: true,
  };
  const conflictResponse = await handleRelayStepRequest(post({
    action: "START", attemptId: "attempt-1", expectedStep: 0,
  }), executor(conflict));
  expect(conflictResponse.status).toBe(409);
  await expect(conflictResponse.json()).resolves.toEqual(conflict);
});

test("converts unexpected executor errors into one fixed redacted failure", async () => {
  const target: RelayStepExecutor = {
    step: vi.fn(async () => {
      throw new Error("provider said sk-proj-never-return-this-secret-123456");
    }),
  };
  const response = await handleRelayStepRequest(post({
    action: "START", attemptId: "attempt-1", expectedStep: 0,
  }), target);
  expect(response.status).toBe(503);
  const payload = await response.text();
  expect(payload).toContain("RELAY_UNAVAILABLE");
  expect(payload).not.toContain("sk-proj-never-return-this-secret-123456");
});
