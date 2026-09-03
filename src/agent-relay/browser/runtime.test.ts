import assert from "node:assert/strict";
import { test } from "vitest";

import {
  MANAGED_AGENT_MODEL,
  MANAGED_AGENT_RUNTIME,
  RELAY_ACCESS_POLICIES,
  RELAY_BOUNDS,
  type RelayBrowserClientPort,
  type RelayBrowserTraceInput,
  type RelayExecutionPermitToken,
  type RelayGrant,
  type RelayRun,
  type RelayTraceEvent,
  type RelayWorkspaceState,
} from "../contracts";
import { REPOSITORY_TOOL_NAMES } from "../../repository/contracts";
import type { RepositoryWebMCPRegistrationDiff } from "../../webmcp/repository-types";
import { sha256CanonicalJson } from "./canonical-json";
import { makeRelayPhysicalToolName } from "./physical-name";
import { wrapRelayNativeResult } from "./result-decoder";
import { RelayBrowserRuntime } from "./runtime";
import {
  FakeWebMCPConsumer,
  TEST_ORIGIN,
  TEST_WINDOW,
  capabilityGrant,
  claimedAttempt,
  managedAgent,
} from "./test-helpers";
import type {
  RelayBrowserEnvironment,
  RelayBrowserRuntimeStatus,
  RelayIdleCatalogPort,
} from "./types";

const PAGE_ID = "30000000-0000-4000-8000-000000000002";
const TASK_ID = "30000000-0000-4000-8000-000000000004";
const GRANT = "rfrelay_v1.runtime" as RelayGrant;

function run(status: RelayRun["status"], overrides: Partial<RelayRun> = {}): RelayRun {
  return {
    runId: claimedAttempt().runId,
    taskId: TASK_ID,
    profileId: managedAgent("CODE").profileId,
    agentExpertise: "CODE",
    accessProfile: "REPOSITORY_SCOPED_EDIT",
    runtime: MANAGED_AGENT_RUNTIME,
    model: MANAGED_AGENT_MODEL,
    status,
    attemptCount: 1,
    maxAttempts: 2,
    terminalReason: status === "COMPLETED" ? "TASK_COMPLETED" : null,
    createdAt: "2026-09-02T01:00:00.000Z",
    updatedAt: "2026-09-02T01:00:01.000Z",
    completedAt: status === "COMPLETED" ? "2026-09-02T01:00:01.000Z" : null,
    ...overrides,
  };
}

function recordedTrace(input: RelayBrowserTraceInput): RelayTraceEvent {
  return {
    relayEventId: "30000000-0000-4000-8000-000000000099",
    relayEventVersion: 1,
    documentId: "30000000-0000-4000-8000-000000000001",
    runId: claimedAttempt().runId,
    attemptId: claimedAttempt().attemptId,
    kind: input.kind,
    logicalToolName: null,
    physicalToolName: null,
    manifestDigest: null,
    argumentsDigest: null,
    resultDigest: null,
    detail: input.detail,
    createdAt: "2026-09-02T01:00:01.000Z",
  };
}

function state(status: RelayRun["status"]): RelayWorkspaceState {
  return {
    directory: [managedAgent("CODE")],
    runs: [run(status)],
    activeAttempt: null,
    trace: [],
    currentRelayEventVersion: 0,
    webMcpRequired: true,
    recoveryHeartbeatMs: RELAY_BOUNDS.recoveryHeartbeatMs,
  };
}

class FakeEnvironment implements RelayBrowserEnvironment {
  readonly origin = TEST_ORIGIN;
  readonly topLevelWindow = TEST_WINDOW;
  visible = true;
  nowValue = Date.parse("2026-09-02T01:00:00.000Z");
  readonly delays: number[] = [];
  readonly #timers = new Map<number, { callback: () => void; delay: number }>();
  readonly #visibility = new Set<() => void>();
  #timerId = 0;

  isVisible(): boolean {
    return this.visible;
  }

  now(): number {
    return this.nowValue;
  }

  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    this.delays.push(delay);
    const id = ++this.#timerId;
    this.#timers.set(id, { callback, delay });
    return id as unknown as ReturnType<typeof setTimeout>;
  }

  clearTimer(timer: ReturnType<typeof setTimeout>): void {
    this.#timers.delete(timer as unknown as number);
  }

  subscribeVisibility(listener: () => void): () => void {
    this.#visibility.add(listener);
    return () => this.#visibility.delete(listener);
  }

  runTimer(delay: number): boolean {
    const entry = [...this.#timers.entries()].find(([, timer]) => timer.delay === delay);
    if (!entry) return false;
    this.#timers.delete(entry[0]);
    entry[1].callback();
    return true;
  }

  changeVisibility(visible: boolean): void {
    this.visible = visible;
    for (const listener of this.#visibility) listener();
  }
}

class FakeIdleCatalog implements RelayIdleCatalogPort {
  readonly #context: FakeWebMCPConsumer;
  #controllers: AbortController[] = [];

  constructor(context: FakeWebMCPConsumer) {
    this.#context = context;
  }

  async withdraw(): Promise<RepositoryWebMCPRegistrationDiff> {
    const removed = [...REPOSITORY_TOOL_NAMES];
    for (const controller of this.#controllers) controller.abort();
    this.#controllers = [];
    return { added: [], removed, retained: [], reRegistered: [] };
  }

  async restore(): Promise<RepositoryWebMCPRegistrationDiff> {
    if (this.#controllers.length > 0) {
      return { added: [], removed: [], retained: [...REPOSITORY_TOOL_NAMES], reRegistered: [] };
    }
    for (const name of REPOSITORY_TOOL_NAMES) {
      const controller = new AbortController();
      this.#controllers.push(controller);
      this.#context.registerTool({
        name,
        description: `Idle ${name}`,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => wrapRelayNativeResult({ ok: true }),
      }, { signal: controller.signal });
    }
    return { added: [...REPOSITORY_TOOL_NAMES], removed: [], retained: [], reRegistered: [] };
  }
}

async function flushUntil(predicate: () => boolean, turns = 100): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("The runtime did not settle in the expected number of microtasks.");
}

test("runs the exact WebMCP discovery/execution loop then restores idle with heartbeat and wake", async () => {
  const context = new FakeWebMCPConsumer();
  const idle = new FakeIdleCatalog(context);
  await idle.restore();
  const environment = new FakeEnvironment();
  const attempt = claimedAttempt();
  const agent = managedAgent("CODE");
  const accessGrant = capabilityGrant("REPOSITORY_SCOPED_EDIT");
  const assignmentPhysicalName = makeRelayPhysicalToolName({
    accessProfile: accessGrant.accessProfile,
    registrationScope: attempt.registrationScope,
    registrationGeneration: attempt.registrationGeneration,
    logicalName: "read_assignment",
  });
  const argumentsDigest = await sha256CanonicalJson({});
  let completed = false;
  let stateReads = 0;
  let claims = 0;
  let toolExecutions = 0;
  let submittedManifestDigest: string | null = null;
  const traceInputs: RelayBrowserTraceInput[] = [];
  const observedCatalogs: string[][] = [];
  const client = {
    readState: async () => {
      stateReads += 1;
      return { ok: true as const, data: state(completed ? "COMPLETED" : "QUEUED") };
    },
    claim: async () => {
      claims += 1;
      return {
        ok: true as const,
        data: {
          outcome: "CLAIMED" as const,
          run: run("ACTIVE"),
          attempt,
          agent,
          capabilityGrant: accessGrant,
          grant: GRANT,
        },
      };
    },
    renewLease: async () => ({ ok: true as const, data: attempt }),
    releaseLease: async () => ({ ok: true as const, data: run(completed ? "COMPLETED" : "QUEUED") }),
    recordTrace: async (_grant: RelayGrant, input: RelayBrowserTraceInput) => {
      traceInputs.push(input);
      observedCatalogs.push((await context.getTools()).map(({ name }) => name));
      return { ok: true as const, data: recordedTrace(input) };
    },
    step: async (_grant: RelayGrant, input: { action: string; manifest?: { digest: string } }) => {
      if (input.action === "START") {
        return {
          ok: true as const,
          data: {
            outcome: "DISCOVER_TOOLS" as const,
            attemptId: attempt.attemptId,
            nextStep: 1,
            toolSearchCallId: "search-call-1",
            goal: "Find assignment tools",
          },
        };
      }
      if (input.action === "SUBMIT_SEARCH_RESULT") {
        submittedManifestDigest = input.manifest?.digest ?? null;
        return {
          ok: true as const,
          data: {
            outcome: "EXECUTE_TOOL" as const,
            attemptId: attempt.attemptId,
            nextStep: 2,
            functionCallId: "function-call-1",
            physicalToolName: assignmentPhysicalName,
            arguments: {},
            permit: {
              token: "rfpermit_v1.runtime" as RelayExecutionPermitToken,
              attemptId: attempt.attemptId,
              functionCallId: "function-call-1",
              physicalToolName: assignmentPhysicalName,
              argumentsDigest,
              registrationGeneration: attempt.registrationGeneration,
              leaseId: attempt.leaseId,
              expiresAt: "2026-09-02T01:00:30.000Z",
            },
          },
        };
      }
      completed = true;
      return {
        ok: true as const,
        data: {
          outcome: "COMPLETED" as const,
          attemptId: attempt.attemptId,
          nextStep: 3,
          outputText: "Assignment complete.",
          run: run("COMPLETED"),
        },
      };
    },
    executeTool: async () => {
      toolExecutions += 1;
      return {
        ok: true as const,
        data: {
          resultReceiptId: "receipt-1",
          output: JSON.stringify({ ok: true, data: { taskId: TASK_ID } }),
        },
      };
    },
  } as RelayBrowserClientPort;
  const statuses: RelayBrowserRuntimeStatus[] = [];
  const observedStates: Array<RelayWorkspaceState | null> = [];
  const runtime = new RelayBrowserRuntime({
    context,
    client,
    idleCatalog: idle,
    pageSessionId: PAGE_ID,
    environment,
    onStatusChange: (status) => statuses.push(status),
    onStateChange: (next) => observedStates.push(next),
  });

  runtime.start();
  assert.equal(environment.runTimer(0), true);
  await flushUntil(() => completed && runtime.status.phase === "IDLE");
  assert.equal(claims, 1);
  assert.equal(toolExecutions, 1);
  assert.match(submittedManifestDigest ?? "", /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(
    (await context.getTools()).map(({ name }) => name),
    [...REPOSITORY_TOOL_NAMES].sort(),
  );
  assert.equal(statuses.some(({ phase }) => phase === "DISCOVERING"), true);
  assert.equal(statuses.some(({ phase, activeLogicalTool }) =>
    phase === "EXECUTING_TOOL" && activeLogicalTool === "read_assignment"), true);
  assert.equal(environment.delays.includes(RELAY_BOUNDS.recoveryHeartbeatMs), true);
  assert.deepEqual(traceInputs.map(({ kind }) => kind), [
    "IDLE_CATALOG_WITHDRAWN",
    "WEBMCP_TOOLCHANGE_OBSERVED",
    "RELAY_CATALOG_REGISTERED",
    "WEBMCP_TOOLCHANGE_OBSERVED",
    "RELAY_CATALOG_WITHDRAWN",
    "WEBMCP_TOOLCHANGE_OBSERVED",
    "IDLE_CATALOG_RESTORED",
    "WEBMCP_TOOLCHANGE_OBSERVED",
  ]);
  assert.deepEqual(observedCatalogs[0], []);
  assert.equal(
    observedCatalogs[2]?.length,
    RELAY_ACCESS_POLICIES.REPOSITORY_SCOPED_EDIT.logicalToolNames.length,
  );
  assert.equal(observedCatalogs[2]?.every((name) => name.startsWith("rf_repository_")), true);
  assert.deepEqual(observedCatalogs[4], []);
  assert.deepEqual(observedCatalogs[6], [...REPOSITORY_TOOL_NAMES].sort());

  const readsBeforeWake = stateReads;
  runtime.wake();
  assert.equal(environment.runTimer(0), true);
  await flushUntil(() => stateReads > readsBeforeWake);
  assert.equal(claims, 1);

  environment.changeVisibility(false);
  assert.equal(runtime.status.phase, "PAUSED_HIDDEN");
  const readsWhileHidden = stateReads;
  assert.equal(environment.runTimer(RELAY_BOUNDS.recoveryHeartbeatMs), false);
  assert.equal(stateReads, readsWhileHidden);
  environment.changeVisibility(true);
  assert.equal(environment.runTimer(0), true);
  await flushUntil(() => stateReads > readsWhileHidden);
  assert.equal(observedStates.some((entry) => entry?.runs[0]?.status === "COMPLETED"), true);
  await runtime.dispose();
});

test("renews the lease while visible and releases/restores idle when hidden mid-attempt", async () => {
  const context = new FakeWebMCPConsumer();
  const idle = new FakeIdleCatalog(context);
  await idle.restore();
  const environment = new FakeEnvironment();
  const attempt = claimedAttempt();
  const agent = managedAgent("CODE");
  const accessGrant = capabilityGrant("REPOSITORY_SCOPED_EDIT");
  let stepStarted!: () => void;
  const awaitingStep = new Promise<void>((resolve) => {
    stepStarted = resolve;
  });
  let renewals = 0;
  let releases = 0;
  const client = {
    readState: async () => ({ ok: true as const, data: state("QUEUED") }),
    claim: async () => ({
      ok: true as const,
      data: {
        outcome: "CLAIMED" as const,
        run: run("ACTIVE"),
        attempt,
        agent,
        capabilityGrant: accessGrant,
        grant: GRANT,
      },
    }),
    renewLease: async () => {
      renewals += 1;
      return { ok: true as const, data: attempt };
    },
    releaseLease: async () => {
      releases += 1;
      return { ok: true as const, data: run("QUEUED") };
    },
    recordTrace: async (_grant: RelayGrant, input: RelayBrowserTraceInput) => ({
      ok: true as const,
      data: recordedTrace(input),
    }),
    step: async (_grant: RelayGrant, _input: unknown, signal?: AbortSignal) => {
      stepStarted();
      return await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    },
    executeTool: async () => {
      throw new Error("No tool should execute while START is held.");
    },
  } as RelayBrowserClientPort;
  const runtime = new RelayBrowserRuntime({
    context,
    client,
    idleCatalog: idle,
    pageSessionId: PAGE_ID,
    environment,
  });

  runtime.start();
  assert.equal(environment.runTimer(0), true);
  await awaitingStep;
  assert.equal(environment.runTimer(RELAY_BOUNDS.leaseRenewalMs), true);
  await flushUntil(() => renewals === 1);
  environment.changeVisibility(false);
  await flushUntil(() =>
    releases === 1
    && runtime.status.phase === "PAUSED_HIDDEN",
  );
  assert.deepEqual(
    (await context.getTools()).map(({ name }) => name),
    [...REPOSITORY_TOOL_NAMES].sort(),
  );
  assert.equal(environment.runTimer(RELAY_BOUNDS.recoveryHeartbeatMs), false);
  await runtime.dispose();
});

test("ignores an in-flight renewal failure after a successful terminal submit receipt", async () => {
  const context = new FakeWebMCPConsumer();
  const idle = new FakeIdleCatalog(context);
  await idle.restore();
  const environment = new FakeEnvironment();
  const attempt = claimedAttempt();
  const agent = managedAgent("CODE");
  const accessGrant = capabilityGrant("REPOSITORY_SCOPED_EDIT");
  const submitPhysicalName = makeRelayPhysicalToolName({
    accessProfile: accessGrant.accessProfile,
    registrationScope: attempt.registrationScope,
    registrationGeneration: attempt.registrationGeneration,
    logicalName: "submit_scoped_revision",
  });
  const argumentsDigest = await sha256CanonicalJson({});
  let signalSubmitStart!: () => void;
  const submitStarted = new Promise<void>((resolve) => {
    signalSubmitStart = resolve;
  });
  let finishSubmit!: () => void;
  const submitGate = new Promise<void>((resolve) => {
    finishSubmit = resolve;
  });
  let signalRenewalStart!: () => void;
  const renewalStarted = new Promise<void>((resolve) => {
    signalRenewalStart = resolve;
  });
  let rejectRenewal!: (error: unknown) => void;
  const renewalResult = new Promise<never>((_resolve, reject) => {
    rejectRenewal = reject;
  });
  let signalTerminalStepStart!: () => void;
  const terminalStepStarted = new Promise<void>((resolve) => {
    signalTerminalStepStart = resolve;
  });
  let finishTerminalStep!: () => void;
  const terminalStepGate = new Promise<void>((resolve) => {
    finishTerminalStep = resolve;
  });
  let terminalStepSignal: AbortSignal | undefined;
  let completed = false;
  let releases = 0;
  const client = {
    readState: async () => ({
      ok: true as const,
      data: state(completed ? "COMPLETED" : "QUEUED"),
    }),
    claim: async () => ({
      ok: true as const,
      data: {
        outcome: "CLAIMED" as const,
        run: run("ACTIVE"),
        attempt,
        agent,
        capabilityGrant: accessGrant,
        grant: GRANT,
      },
    }),
    renewLease: async () => {
      signalRenewalStart();
      return await renewalResult;
    },
    releaseLease: async () => {
      releases += 1;
      return { ok: true as const, data: run(completed ? "COMPLETED" : "QUEUED") };
    },
    recordTrace: async (_grant: RelayGrant, input: RelayBrowserTraceInput) => ({
      ok: true as const,
      data: recordedTrace(input),
    }),
    step: async (_grant: RelayGrant, input: { action: string }, signal?: AbortSignal) => {
      if (input.action === "START") {
        return {
          ok: true as const,
          data: {
            outcome: "DISCOVER_TOOLS" as const,
            attemptId: attempt.attemptId,
            nextStep: 1,
            toolSearchCallId: "search-call-terminal",
            goal: "Submit the scoped revision",
          },
        };
      }
      if (input.action === "SUBMIT_SEARCH_RESULT") {
        return {
          ok: true as const,
          data: {
            outcome: "EXECUTE_TOOL" as const,
            attemptId: attempt.attemptId,
            nextStep: 2,
            functionCallId: "function-call-terminal",
            physicalToolName: submitPhysicalName,
            arguments: {},
            permit: {
              token: "rfpermit_v1.terminal" as RelayExecutionPermitToken,
              attemptId: attempt.attemptId,
              functionCallId: "function-call-terminal",
              physicalToolName: submitPhysicalName,
              argumentsDigest,
              registrationGeneration: attempt.registrationGeneration,
              leaseId: attempt.leaseId,
              expiresAt: "2026-09-02T01:00:30.000Z",
            },
          },
        };
      }
      terminalStepSignal = signal;
      signalTerminalStepStart();
      await terminalStepGate;
      completed = true;
      return {
        ok: true as const,
        data: {
          outcome: "COMPLETED" as const,
          attemptId: attempt.attemptId,
          nextStep: 3,
          outputText: "Assignment complete.",
          run: run("COMPLETED"),
        },
      };
    },
    executeTool: async () => {
      signalSubmitStart();
      await submitGate;
      return {
        ok: true as const,
        data: {
          resultReceiptId: "receipt-terminal",
          output: JSON.stringify({ ok: true, data: { revision: 6 } }),
        },
      };
    },
  } as RelayBrowserClientPort;
  const runtime = new RelayBrowserRuntime({
    context,
    client,
    idleCatalog: idle,
    pageSessionId: PAGE_ID,
    environment,
  });

  runtime.start();
  assert.equal(environment.runTimer(0), true);
  await submitStarted;
  assert.equal(environment.runTimer(RELAY_BOUNDS.leaseRenewalMs), true);
  await renewalStarted;
  finishSubmit();
  await terminalStepStarted;

  rejectRenewal(new Error("The terminal attempt no longer owns a renewable lease."));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(terminalStepSignal?.aborted, false);
  assert.equal(
    environment.runTimer(RELAY_BOUNDS.leaseRenewalMs),
    false,
    "A late renewal must not schedule another lease timer after terminal submit.",
  );

  finishTerminalStep();
  await flushUntil(() => completed && releases === 1 && runtime.status.phase === "IDLE");
  await runtime.dispose();
});

test("requires an explicit retry signal before claiming WAITING_RETRY work", async () => {
  const context = new FakeWebMCPConsumer();
  const idle = new FakeIdleCatalog(context);
  await idle.restore();
  const environment = new FakeEnvironment();
  let stateReads = 0;
  let claims = 0;
  const retryTargets: Array<string | undefined> = [];
  const waiting = run("WAITING_RETRY");
  const queued = run("QUEUED", {
    runId: "30000000-0000-4000-8000-000000000098",
    createdAt: "2026-09-02T01:00:02.000Z",
  });
  const mixedState: RelayWorkspaceState = {
    ...state("WAITING_RETRY"),
    runs: [queued, waiting],
  };
  const client = {
    readState: async () => {
      stateReads += 1;
      return { ok: true as const, data: mixedState };
    },
    claim: async (_pageSessionId: string, retryRunId?: string) => {
      claims += 1;
      retryTargets.push(retryRunId);
      if (claims === 1) {
        return {
          ok: false as const,
          code: "RATE_LIMITED" as const,
          message: "The provider-run quota is full.",
          retryable: true,
        };
      }
      return { ok: true as const, data: { outcome: "NO_WORK" as const, retryAfterMs: RELAY_BOUNDS.recoveryHeartbeatMs } };
    },
    renewLease: async () => ({ ok: true as const, data: claimedAttempt() }),
    releaseLease: async () => ({ ok: true as const, data: run("WAITING_RETRY") }),
    recordTrace: async (_grant: RelayGrant, input: RelayBrowserTraceInput) => ({
      ok: true as const,
      data: recordedTrace(input),
    }),
    step: async () => { throw new Error("No attempt was claimed."); },
    executeTool: async () => { throw new Error("No tool was selected."); },
  } as RelayBrowserClientPort;
  const runtime = new RelayBrowserRuntime({
    context,
    client,
    idleCatalog: idle,
    pageSessionId: PAGE_ID,
    environment,
  });

  runtime.start();
  assert.equal(environment.runTimer(0), true);
  await flushUntil(() => stateReads === 1);
  assert.equal(claims, 0);

  runtime.wake();
  assert.equal(environment.runTimer(0), true);
  await flushUntil(() => stateReads === 2);
  assert.equal(claims, 0);

  runtime.retry();
  assert.equal(environment.runTimer(0), true);
  await flushUntil(() => claims === 1 && runtime.status.phase === "FAILED");
  assert.deepEqual(retryTargets, [waiting.runId]);
  assert.equal(environment.runTimer(RELAY_BOUNDS.recoveryHeartbeatMs), true);
  await flushUntil(() => claims === 2);
  assert.deepEqual(retryTargets, [waiting.runId, waiting.runId]);
  await runtime.dispose();
});

test("claim-time quota refusal heartbeats without releasing or consuming an attempt", async () => {
  const context = new FakeWebMCPConsumer();
  const idle = new FakeIdleCatalog(context);
  await idle.restore();
  const environment = new FakeEnvironment();
  let claims = 0;
  let releases = 0;
  const client = {
    readState: async () => ({ ok: true as const, data: state("QUEUED") }),
    claim: async () => {
      claims += 1;
      return {
        ok: false as const,
        code: "RATE_LIMITED" as const,
        message: "The provider-run quota is full.",
        retryable: true,
      };
    },
    renewLease: async () => ({ ok: true as const, data: claimedAttempt() }),
    releaseLease: async () => {
      releases += 1;
      return { ok: true as const, data: run("QUEUED", { attemptCount: 0 }) };
    },
    recordTrace: async (_grant: RelayGrant, input: RelayBrowserTraceInput) => ({
      ok: true as const,
      data: recordedTrace(input),
    }),
    step: async () => { throw new Error("Quota refusal must happen before a step."); },
    executeTool: async () => { throw new Error("Quota refusal must happen before a tool."); },
  } as RelayBrowserClientPort;
  const runtime = new RelayBrowserRuntime({
    context,
    client,
    idleCatalog: idle,
    pageSessionId: PAGE_ID,
    environment,
  });

  runtime.start();
  assert.equal(environment.runTimer(0), true);
  await flushUntil(() => claims === 1 && runtime.status.phase === "FAILED");
  assert.equal(releases, 0);
  assert.deepEqual((await context.getTools()).map(({ name }) => name),
    [...REPOSITORY_TOOL_NAMES].sort());

  assert.equal(environment.runTimer(RELAY_BOUNDS.recoveryHeartbeatMs), true);
  await flushUntil(() => claims === 2 && runtime.status.phase === "FAILED");
  assert.equal(releases, 0);
  await runtime.dispose();
});

test("scheduled tick cleanup handles a rejected runtime promise without floating a rejection", async () => {
  const context = new FakeWebMCPConsumer();
  const idle = new FakeIdleCatalog(context);
  await idle.restore();
  const environment = new FakeEnvironment();
  const client = {
    readState: async () => {
      throw new Error("Synthetic state read failure");
    },
    claim: async () => { throw new Error("No claim expected."); },
    renewLease: async () => { throw new Error("No renewal expected."); },
    releaseLease: async () => { throw new Error("No release expected."); },
    recordTrace: async () => { throw new Error("No trace expected."); },
    step: async () => { throw new Error("No step expected."); },
    executeTool: async () => { throw new Error("No execution expected."); },
  } as Partial<RelayBrowserClientPort> as RelayBrowserClientPort;
  const runtime = new RelayBrowserRuntime({
    context,
    client,
    idleCatalog: idle,
    pageSessionId: PAGE_ID,
    environment,
    onStatusChange: (status) => {
      if (status.phase === "FAILED") throw new Error("Synthetic status sink failure");
    },
  });
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);

  try {
    runtime.start();
    assert.equal(environment.runTimer(0), true);
    await flushUntil(() => runtime.status.phase === "FAILED");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    await runtime.dispose();
  }
});
