import assert from "node:assert/strict";
import { test } from "vitest";

import {
  MANAGED_AGENT_TOOL_CATALOGS,
  type ManagedAgentSpecialty,
  RelayBrowserClientPort,
  type RelayExecutionPermit,
  type RelayExecutionPermitToken,
  type RelayGrant,
} from "../contracts";
import { sha256CanonicalJson } from "./canonical-json";
import { RelayBrowserError } from "./errors";
import { normalizeRelayManifest } from "./manifest";
import { RelayWebMCPRegistrationManager } from "./registration";
import { decodeRelayExecuteToolResult } from "./result-decoder";
import { FakeWebMCPConsumer, TEST_ORIGIN, TEST_WINDOW, claimedAttempt, managedAgent } from "./test-helpers";

const GRANT = "rfrelay_v1.test" as RelayGrant;

function permit(input: {
  physicalName: string;
  argumentsDigest: `sha256:${string}`;
  token: string;
}): RelayExecutionPermit {
  return {
    token: input.token as RelayExecutionPermitToken,
    attemptId: claimedAttempt().attemptId,
    functionCallId: `call-${input.token}`,
    physicalToolName: input.physicalName,
    argumentsDigest: input.argumentsDigest,
    registrationGeneration: 1,
    leaseId: claimedAttempt().leaseId,
    expiresAt: "2026-09-02T01:00:30.000Z",
  };
}

test("switches among exact Data, Code, and General catalogs without overlap", async () => {
  const context = new FakeWebMCPConsumer();
  const manager = new RelayWebMCPRegistrationManager({
    context,
    client: {} as RelayBrowserClientPort,
  });
  const expectedCounts: Record<ManagedAgentSpecialty, number> = {
    DATA: 6,
    CODE: 7,
    GENERAL: 7,
  };
  let previousDescriptors = await context.getTools();

  for (const [index, specialty] of (["DATA", "CODE", "GENERAL"] as const).entries()) {
    await manager.register({
      grant: GRANT,
      agent: managedAgent(specialty),
      attempt: claimedAttempt(index + 1),
    });
    const descriptors = await context.getTools();
    assert.equal(descriptors.length, expectedCounts[specialty]);
    assert.deepEqual(
      descriptors.map(({ name }) => manager.logicalNameForPhysical(name)).sort(),
      [...MANAGED_AGENT_TOOL_CATALOGS[specialty]].sort(),
    );
    assert.equal(
      descriptors.every(({ name }) =>
        name.startsWith(`rf_${specialty.toLowerCase()}_0123456789abcdef_g${index + 1}_`)),
      true,
    );
    for (const staleDescriptor of previousDescriptors) {
      await assert.rejects(context.executeTool(staleDescriptor, {}));
    }
    previousDescriptors = descriptors;
  }

  await manager.dispose();
});

test("denies unarmed calls, consumes one permit, propagates cancellation, and rejects stale descriptors", async () => {
  const context = new FakeWebMCPConsumer();
  let serverEffects = 0;
  let cancellationReachedServer = 0;
  let holdNext = false;
  let signalServerStart!: () => void;
  const serverStarted = new Promise<void>((resolve) => {
    signalServerStart = resolve;
  });
  const client = {
    executeTool: async (
      _grant: RelayGrant,
      _permit: RelayExecutionPermitToken,
      _name: string,
      _input: Readonly<Record<string, unknown>>,
      signal?: AbortSignal,
    ) => {
      serverEffects += 1;
      if (holdNext) {
        signalServerStart();
        return await new Promise<never>((_resolve, reject) => {
          const abort = () => {
            cancellationReachedServer += 1;
            reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
          };
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        });
      }
      return {
        ok: true as const,
        data: {
          resultReceiptId: `receipt-${serverEffects}`,
          output: JSON.stringify({ ok: true, data: { effect: serverEffects } }),
        },
      };
    },
  } as RelayBrowserClientPort;
  const manager = new RelayWebMCPRegistrationManager({
    context,
    client,
    now: () => Date.parse("2026-09-02T01:00:00.000Z"),
  });
  const agent = managedAgent("CODE");
  const attempt = claimedAttempt();
  await manager.register({ grant: GRANT, agent, attempt });
  assert.equal(manager.registeredNames.length, 7);

  const discovered = await normalizeRelayManifest({
    tools: await context.getTools(),
    agent,
    attempt,
    origin: TEST_ORIGIN,
    topLevelWindow: TEST_WINDOW,
  });
  const assignment = discovered.manifest.entries[0]!;
  const assignmentDescriptor = discovered.descriptors.get(assignment.physicalName)!;
  const unarmedRaw = await context.executeTool(assignmentDescriptor, {});
  const unarmed = JSON.parse(unarmedRaw) as { structuredContent: { code: string } };
  assert.equal(unarmed.structuredContent.code, "RELAY_EXECUTION_NOT_ARMED");
  assert.equal(serverEffects, 0);

  const emptyDigest = await sha256CanonicalJson({});
  const firstPermit = permit({
    physicalName: assignment.physicalName,
    argumentsDigest: emptyDigest,
    token: "permit-one",
  });
  const armedRaw = await manager.executeArmed({
    descriptor: assignmentDescriptor,
    arguments: {},
    permit: firstPermit,
  });
  assert.equal(decodeRelayExecuteToolResult(armedRaw).resultReceiptId, "receipt-1");
  assert.equal(serverEffects, 1);
  await assert.rejects(
    manager.executeArmed({
      descriptor: assignmentDescriptor,
      arguments: {},
      permit: firstPermit,
    }),
    (error: unknown) => error instanceof RelayBrowserError
      && error.code === "RELAY_EXECUTION_NOT_ARMED",
  );

  const secondEntry = discovered.manifest.entries[1]!;
  const secondDescriptor = discovered.descriptors.get(secondEntry.physicalName)!;
  holdNext = true;
  const controller = new AbortController();
  const pending = manager.executeArmed({
    descriptor: secondDescriptor,
    arguments: {},
    permit: permit({
      physicalName: secondEntry.physicalName,
      argumentsDigest: emptyDigest,
      token: "permit-two",
    }),
    signal: controller.signal,
  });
  await serverStarted;
  controller.abort(new DOMException("Cancelled", "AbortError"));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancellationReachedServer, 1);

  const dispatchesBeforeStale = context.callbackDispatches;
  await manager.withdraw();
  await assert.rejects(context.executeTool(assignmentDescriptor, {}));
  assert.equal(context.callbackDispatches, dispatchesBeforeStale);
});

test("uses the exact native input encoding advertised by a string-schema descriptor", async () => {
  const context = new FakeWebMCPConsumer(TEST_ORIGIN, TEST_WINDOW, "JSON_STRING", false);
  let receivedInput: Readonly<Record<string, unknown>> | null = null;
  let receivedSignal: AbortSignal | undefined;
  let signalServerStart!: () => void;
  const serverStarted = new Promise<void>((resolve) => {
    signalServerStart = resolve;
  });
  const client = {
    executeTool: async (
      _grant: RelayGrant,
      _permit: RelayExecutionPermitToken,
      _name: string,
      input: Readonly<Record<string, unknown>>,
      signal?: AbortSignal,
    ) => {
      receivedInput = input;
      receivedSignal = signal;
      signalServerStart();
      return await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    },
  } as Partial<RelayBrowserClientPort> as RelayBrowserClientPort;
  const manager = new RelayWebMCPRegistrationManager({
    context,
    client,
    now: () => Date.parse("2026-09-02T01:00:00.000Z"),
  });
  const agent = managedAgent("CODE");
  const attempt = claimedAttempt();
  await manager.register({ grant: GRANT, agent, attempt });
  const discovered = await normalizeRelayManifest({
    tools: await context.getTools(),
    agent,
    attempt,
    origin: TEST_ORIGIN,
    topLevelWindow: TEST_WINDOW,
  });
  const progressComment = discovered.manifest.entries[3]!;
  const descriptor = discovered.descriptors.get(progressComment.physicalName)!;
  assert.equal(typeof descriptor.inputSchema, "string");
  const argumentsValue = { evidenceRefs: [], body: "Checking the assigned passage." };
  const executionController = new AbortController();
  const pending = manager.executeArmed({
    descriptor,
    arguments: argumentsValue,
    permit: permit({
      physicalName: progressComment.physicalName,
      argumentsDigest: await sha256CanonicalJson(argumentsValue),
      token: "permit-string-schema",
    }),
    signal: executionController.signal,
  });
  await serverStarted;
  assert.equal(
    context.lastNativeInput,
    '{"body":"Checking the assigned passage.","evidenceRefs":[]}',
  );
  assert.deepEqual(receivedInput, {
    body: "Checking the assigned passage.",
    evidenceRefs: [],
  });
  assert.equal(receivedSignal?.aborted, false);
  executionController.abort(new DOMException("Cancelled", "AbortError"));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(receivedSignal?.aborted, true);
  await manager.dispose();
});
