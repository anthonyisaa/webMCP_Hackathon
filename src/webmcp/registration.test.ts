import assert from "node:assert/strict";
import { test } from "vitest";

import { compileCapabilities } from "../capabilities/compiler";
import { LocalRatiflowService } from "../domain/ratiflow-service";
import type {
  CompiledCapabilities,
  PageSelection,
  RatiflowServicePort,
  ToolResult,
  WorkspaceView,
} from "../contracts/index";
import {
  asStandardWebMCPConsumer,
  detectModelContext,
  makeRegistrationContextKey,
} from "./detect";
import { captureCallbackContext, createToolCallback } from "./executor";
import { WebMCPRegistrationManager } from "./registration";
import type {
  MutableWebMCPRuntimeRef,
  WebMCPModelContextLike,
  WebMCPToolLike,
} from "./types";

function workspace(revision = 7, capacity = 18): WorkspaceView {
  return {
    id: "ws_northstar_csv_launch",
    name: "Northstar CSV launch scope",
    revision,
    decision: {
      id: "dec_csv_oct15",
      question: "Should CSV export ship in the Oct 15 launch?",
      state: capacity >= 18 ? "READY" : "CONTESTED",
      selectedOptionId: "opt_csv_ga_oct15",
      launchDate: "2026-10-15",
      launchCapacityEngineerDays: capacity,
      coreReliabilityEngineerDays: 10,
    },
    customer: {
      id: "cust_northstar_health",
      name: "Northstar Health",
      annualRenewalUsd: 180_000,
      usableExportDueDate: "2026-11-01",
    },
    options: [
      {
        id: "opt_csv_ga_oct15",
        title: "Full GA",
        summary: "Full CSV export at launch.",
        launchDate: "2026-10-15",
        exportEngineerDays: 8,
        totalEngineerDays: 18,
        postLaunchEngineerDays: 0,
      },
      {
        id: "opt_csv_beta_oct15",
        title: "Northstar beta",
        summary: "A single-tenant beta followed by GA.",
        launchDate: "2026-10-15",
        exportEngineerDays: 4,
        totalEngineerDays: 14,
        postLaunchEngineerDays: 4,
      },
    ],
    evidence: [],
    challenges: [],
    preparedDecision: null,
    followup: {
      id: "fu_customer_launch_brief",
      slug: "customer-launch-brief",
      status: "BLOCKED",
      ownerId: "usr_maya_chen",
      dueDate: "2026-10-16",
      inheritedContext: [],
    },
    provenance: [],
    readiness: {
      activeOptionCount: 2,
      hasCurrentCapacityEvidence: true,
      hasNorthstarDeadlineEvidence: true,
      selectedOptionId: "opt_csv_ga_oct15",
      selectedOptionEngineerDays: 18,
      launchCapacityEngineerDays: capacity,
      unresolvedBlockingChallengeCount: 0,
    },
    collaboration: {
      cursor: "10000000-0000-4000-8000-000000000001",
      agent: {
        actor: {
          id: "agent_ratiflow_demo",
          name: "Ratiflow Agent",
          role: "Decision analyst",
        },
        state: "AWAY",
        lastSeenAt: null,
        activeVia: null,
      },
      standingInstructions: {
        autoPickup: false,
        scopes: ["MENTIONS", "TASKS"],
        maxActionsPerHour: 6,
      },
      inbox: [],
      comments: [],
      questions: [],
      recentActivity: [],
    },
  };
}

function compiled(
  state: "READY" | "CONTESTED",
  selection: PageSelection,
  revision: number,
  contextEpoch: number,
): CompiledCapabilities {
  const snapshot = workspace(revision, state === "READY" ? 18 : 14);
  return compileCapabilities({
    state,
    selection,
    memberRole: "PRODUCT_LEAD",
    workspaceRevision: revision,
    contextEpoch,
    readiness: snapshot.readiness,
  });
}

class FakeModelContext implements WebMCPModelContextLike {
  calls: Array<{ tool: WebMCPToolLike; signal?: AbortSignal }> = [];

  registerTool(tool: WebMCPToolLike, options?: { signal?: AbortSignal }): void {
    this.calls.push({ tool, signal: options?.signal });
  }
}

class DelayedFirstRegistrationContext extends FakeModelContext {
  private releaseFirstRegistration: (() => void) | undefined;
  private delayed = false;

  override registerTool(
    tool: WebMCPToolLike,
    options?: { signal?: AbortSignal },
  ): Promise<void> | void {
    super.registerTool(tool, options);
    if (this.delayed) return;
    this.delayed = true;
    return new Promise<void>((resolve) => {
      this.releaseFirstRegistration = resolve;
    });
  }

  release(): void {
    this.releaseFirstRegistration?.();
  }
}

function runtime(initialCompiled: CompiledCapabilities, initialWorkspace = workspace()) {
  const latest: MutableWebMCPRuntimeRef = {
    current: {
      compiled: initialCompiled,
      workspace: initialWorkspace,
      memberRole: "PRODUCT_LEAD",
      memberSessionInstanceId: "maya-tab-1",
      sessionToken: "opaque-session-token",
    },
  };
  let mutationCalls = 0;
  let inspectToken: string | undefined;
  let inspectSignal: AbortSignal | undefined;
  let inspectedWorkspace = initialWorkspace;
  const service = {
    inspect: async (sessionToken: string, signal?: AbortSignal) => {
      inspectToken = sessionToken;
      inspectSignal = signal;
      return inspectedWorkspace;
    },
    mutateFromWebMCP: async () => {
      mutationCalls += 1;
      return {
        ok: false,
        code: "CONFLICT",
        message: "test mutation boundary",
        retryable: false,
        currentWorkspaceRevision: latest.current.compiled.workspaceRevision,
        contextEpoch: latest.current.compiled.contextEpoch,
        currentCapabilities: {
          ...latest.current.compiled,
          signature: undefined,
        },
      } as unknown as ToolResult<never>;
    },
    setLaunchCapacityFromCollaboratorUi: async () => {
      throw new Error("not used");
    },
    ratifyFromHumanUi: async () => {
      throw new Error("not used");
    },
    subscribe: () => () => undefined,
  } as unknown as RatiflowServicePort;
  return {
    latest,
    service,
    getMutationCalls: () => mutationCalls,
    getInspectToken: () => inspectToken,
    getInspectSignal: () => inspectSignal,
    setInspectedWorkspace: (value: WorkspaceView) => {
      inspectedWorkspace = value;
    },
  };
}

test("prefers document.modelContext, falls back to navigator, and is safely unsupported", () => {
  const documentContext = new FakeModelContext();
  const navigatorContext = new FakeModelContext();
  assert.deepEqual(
    detectModelContext({ modelContext: documentContext }, { modelContext: navigatorContext }),
    { namespace: "document.modelContext", context: documentContext },
  );
  assert.deepEqual(detectModelContext({}, { modelContext: navigatorContext }), {
    namespace: "navigator.modelContext",
    context: navigatorContext,
  });
  assert.deepEqual(detectModelContext({}, {}), { namespace: "unsupported" });
});

test("managed Relay accepts only the complete standard document consumer surface", () => {
  const complete = Object.assign(new FakeModelContext(), {
    getTools: async () => [],
    executeTool: async () => "{}",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  assert.equal(asStandardWebMCPConsumer({
    namespace: "document.modelContext",
    context: complete,
  }), complete);
  assert.equal(asStandardWebMCPConsumer({
    namespace: "navigator.modelContext",
    context: complete,
  }), null);
  assert.equal(asStandardWebMCPConsumer({
    namespace: "document.modelContext",
    context: new FakeModelContext(),
  }), null);
});

test("keeps callback identity on revision-only changes and removes exactly prepare_decision", async () => {
  const selection = { kind: "DECISION", id: "dec_csv_oct15" } as const;
  const ready = compiled("READY", selection, 7, 1);
  const state = runtime(ready);
  const context = new FakeModelContext();
  const manager = new WebMCPRegistrationManager(context, state);

  const first = await manager.reconcile(ready, makeRegistrationContextKey("maya-tab-1", 1));
  assert.deepEqual(first.added, ready.availableTools);
  const addEvidenceCallback = manager.getRegisteredCallback("add_evidence");
  const prepareCallback = manager.getRegisteredCallback("prepare_decision");
  const prepareSignal = context.calls.find((call) => call.tool.name === "prepare_decision")?.signal;

  const revisionOnly = compiled("READY", selection, 8, 1);
  state.latest.current = { ...state.latest.current, compiled: revisionOnly, workspace: workspace(8) };
  const second = await manager.reconcile(
    revisionOnly,
    makeRegistrationContextKey("maya-tab-1", 1),
  );
  assert.deepEqual(second.added, []);
  assert.deepEqual(second.removed, []);
  assert.equal(manager.getRegisteredCallback("add_evidence"), addEvidenceCallback);

  const contested = compiled("CONTESTED", selection, 8, 1);
  state.latest.current = {
    ...state.latest.current,
    compiled: contested,
    workspace: workspace(8, 14),
  };
  const third = await manager.reconcile(contested, makeRegistrationContextKey("maya-tab-1", 1));
  assert.deepEqual(third.removed, ["prepare_decision"]);
  assert.deepEqual(third.added, []);
  assert.equal(manager.getRegisteredCallback("add_evidence"), addEvidenceCallback);
  assert.equal(prepareSignal?.aborted, true);
  const removedHandleResult = (await prepareCallback?.({})) as { code: string };
  assert.equal(removedHandleResult.code, "NOT_AVAILABLE_IN_STATE");
});

test("re-registers retained names when selection context changes and old callbacks recover safely", async () => {
  const firstCompiled = compiled(
    "READY",
    { kind: "OPTION", id: "opt_csv_ga_oct15" },
    7,
    2,
  );
  const state = runtime(firstCompiled);
  const context = new FakeModelContext();
  const manager = new WebMCPRegistrationManager(context, state);
  await manager.reconcile(firstCompiled, makeRegistrationContextKey("maya-tab-1", 2));
  const oldSelectedCallback = manager.getRegisteredCallback("inspect_selected_option");
  const oldSignals = context.calls.map((call) => call.signal);

  const secondCompiled = compiled(
    "READY",
    { kind: "OPTION", id: "opt_csv_beta_oct15" },
    7,
    3,
  );
  state.latest.current = { ...state.latest.current, compiled: secondCompiled };
  const diff = await manager.reconcile(
    secondCompiled,
    makeRegistrationContextKey("maya-tab-1", 3),
  );

  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.reRegistered, secondCompiled.availableTools);
  assert.notEqual(manager.getRegisteredCallback("inspect_selected_option"), oldSelectedCallback);
  assert.ok(oldSignals.every((signal) => signal?.aborted));

  const staleResult = (await oldSelectedCallback?.({})) as { ok: boolean; code: string };
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.code, "STALE_PAGE_CONTEXT");
  assert.equal(state.getMutationCalls(), 0);
});

test("re-registers retained names when a reset issues a new member session", async () => {
  const ready = compiled("READY", { kind: "DECISION", id: "dec_csv_oct15" }, 7, 1);
  const state = runtime(ready);
  const context = new FakeModelContext();
  const manager = new WebMCPRegistrationManager(context, state);
  await manager.reconcile(ready, makeRegistrationContextKey("maya-tab-1", 1));
  const oldInspectCallback = manager.getRegisteredCallback("inspect_decision");
  const oldSignals = context.calls.map((call) => call.signal);

  state.latest.current = {
    ...state.latest.current,
    memberSessionInstanceId: "maya-tab-2",
    sessionToken: "new-opaque-session-token",
  };
  const diff = await manager.reconcile(
    ready,
    makeRegistrationContextKey("maya-tab-2", 1),
  );

  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.reRegistered, ready.availableTools);
  assert.notEqual(manager.getRegisteredCallback("inspect_decision"), oldInspectCallback);
  assert.ok(oldSignals.every((signal) => signal?.aborted));

  const staleResult = (await oldInspectCallback?.({})) as { ok: boolean; code: string };
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.code, "STALE_PAGE_CONTEXT");

  const freshResult = (await manager.getRegisteredCallback("inspect_decision")?.({})) as {
    ok: boolean;
  };
  assert.equal(freshResult.ok, true);
  assert.equal(state.getInspectToken(), "new-opaque-session-token");
});

test("rejects invalid or wrong-epoch writes before domain mutation", async () => {
  const ready = compiled("READY", { kind: "DECISION", id: "dec_csv_oct15" }, 7, 1);
  const state = runtime(ready);
  const context = new FakeModelContext();
  const manager = new WebMCPRegistrationManager(context, state);
  await manager.reconcile(ready, makeRegistrationContextKey("maya-tab-1", 1));
  const callback = manager.getRegisteredCallback("recommend_option");

  const invalid = (await callback?.({ unexpected: true })) as { code: string };
  assert.equal(invalid.code, "INVALID_INPUT");
  const wrongEpoch = (await callback?.({
    expectedWorkspaceRevision: 7,
    contextEpoch: 0,
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    rationale: "Choose the feasible option.",
    payload: { optionId: "opt_csv_beta_oct15" },
  })) as { code: string };
  assert.equal(wrongEpoch.code, "STALE_PAGE_CONTEXT");
  assert.equal(state.getMutationCalls(), 0);
});

test("static evaluation bypasses only the client gate and preserves the server rejection", async () => {
  const service = new LocalRatiflowService();
  const sessions = service.issueDemoSessions();
  await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
    expectedWorkspaceRevision: 7,
    requestId: "11111111-1111-4111-8111-111111111111",
    payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
  });
  const authoritativeWorkspace = await service.inspect(sessions.agentSessionToken);
  const contested = compileCapabilities({
    state: authoritativeWorkspace.decision.state,
    selection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
    memberRole: "PRODUCT_LEAD",
    workspaceRevision: authoritativeWorkspace.revision,
    contextEpoch: 2,
    readiness: authoritativeWorkspace.readiness,
  });
  assert.equal(contested.availableTools.includes("prepare_decision"), false);

  const latest: MutableWebMCPRuntimeRef = {
    current: {
      compiled: contested,
      workspace: authoritativeWorkspace,
      memberRole: "PRODUCT_LEAD",
      memberSessionInstanceId: "maya-tab-1",
      sessionToken: sessions.agentSessionToken,
    },
  };
  const executionContext = {
    caller: "BROWSER_AGENT" as const,
    pageSessionId: "33333333-3333-4333-8333-333333333333",
    agentSessionToken: sessions.agentSessionToken,
  };
  await service.joinAgentSession(executionContext, contested.selection);
  const callback = createToolCallback(
    "prepare_decision",
    captureCallbackContext(latest),
    { latest, service, bypassClientAvailabilityGate: true },
    executionContext,
  );

  const result = await callback({
    expectedWorkspaceRevision: 8,
    contextEpoch: 2,
    requestId: "22222222-2222-4222-8222-222222222222",
    rationale: "Attempt the unavailable preparation only for static-superset evaluation.",
    payload: {
      optionId: "opt_csv_ga_oct15",
      recommendation: "Prepare the full GA option.",
      risks: ["Capacity is currently insufficient."],
      customerMessageDraft: "This is an evaluation-only request.",
    },
  }) as { ok: boolean; code: string; currentWorkspaceRevision: number };

  assert.equal(result.ok, false);
  assert.equal(result.code, "NOT_AVAILABLE_IN_STATE");
  assert.equal(result.currentWorkspaceRevision, 8);
  assert.equal((await service.inspect(sessions.agentSessionToken)).revision, 8);

  const unavailableRead = createToolCallback(
    "trace_decision",
    captureCallbackContext(latest),
    { latest, service, bypassClientAvailabilityGate: true },
  );
  const readResult = await unavailableRead({}) as {
    ok: boolean;
    code: string;
    currentWorkspaceRevision: number;
  };
  assert.equal(readResult.ok, false);
  assert.equal(readResult.code, "NOT_AVAILABLE_IN_STATE");
  assert.equal(readResult.currentWorkspaceRevision, 8);
  assert.equal((await service.inspect(sessions.agentSessionToken)).revision, 8);
});

test("propagates optional cancellation and stamps reads from the authoritative refresh", async () => {
  const ready = compiled("READY", { kind: "DECISION", id: "dec_csv_oct15" }, 7, 1);
  const state = runtime(ready);
  const refreshed = workspace(8, 14);
  state.setInspectedWorkspace(refreshed);
  let accepted: CompiledCapabilities | undefined;
  const context = new FakeModelContext();
  const manager = new WebMCPRegistrationManager(context, {
    latest: state.latest,
    service: state.service,
    onAuthoritativeSnapshot: (_workspace, nextCompiled) => {
      accepted = nextCompiled;
    },
  });
  await manager.reconcile(ready, makeRegistrationContextKey("maya-tab-1", 1));
  const callback = manager.getRegisteredCallback("inspect_decision");
  const controller = new AbortController();
  const result = (await callback?.({}, { signal: controller.signal })) as {
    ok: boolean;
    currentWorkspaceRevision: number;
    currentCapabilities: { state: string; workspaceRevision: number };
    data: { workspace: WorkspaceView };
  };

  assert.equal(state.getInspectSignal(), controller.signal);
  assert.equal(result.data.workspace.revision, 8);
  assert.equal(result.currentWorkspaceRevision, 8);
  assert.equal(result.currentCapabilities.workspaceRevision, 8);
  assert.equal(result.currentCapabilities.state, "CONTESTED");
  assert.equal(accepted?.workspaceRevision, 8);
  assert.doesNotThrow(() => JSON.stringify(result));

  controller.abort("cancelled");
  await assert.rejects(callback?.({}, { signal: controller.signal }) ?? Promise.resolve(), {
    name: "AbortError",
  });
});

test("why_not refreshes before returning predicates", async () => {
  const ready = compiled("READY", { kind: "DECISION", id: "dec_csv_oct15" }, 7, 1);
  const state = runtime(ready);
  state.setInspectedWorkspace(workspace(8, 14));
  const context = new FakeModelContext();
  const manager = new WebMCPRegistrationManager(context, state);
  await manager.reconcile(ready, makeRegistrationContextKey("maya-tab-1", 1));

  const result = (await manager.getRegisteredCallback("why_not")?.({
    action: "prepare_decision",
  })) as {
    currentWorkspaceRevision: number;
    data: { available: boolean; unmetPredicates: string[] };
  };
  assert.equal(result.currentWorkspaceRevision, 8);
  assert.equal(result.data.available, false);
  assert.deepEqual(result.data.unmetPredicates, [
    "selected option requires 18 engineer-days but launch capacity is 14",
  ]);
});

test("a newer capability snapshot supersedes an in-flight reconciliation", async () => {
  const selection = { kind: "DECISION", id: "dec_csv_oct15" } as const;
  const ready = compiled("READY", selection, 7, 1);
  const contested = compiled("CONTESTED", selection, 8, 1);
  const state = runtime(ready);
  const context = new DelayedFirstRegistrationContext();
  const manager = new WebMCPRegistrationManager(context, state);

  const first = manager.reconcile(ready, makeRegistrationContextKey("maya-tab-1", 1));
  await Promise.resolve();
  state.latest.current = {
    ...state.latest.current,
    compiled: contested,
    workspace: workspace(8, 14),
  };
  const second = manager.reconcile(
    contested,
    makeRegistrationContextKey("maya-tab-1", 1),
  );
  context.release();

  await Promise.all([first, second]);
  assert.deepEqual(manager.registeredTools, contested.availableTools);
  assert.equal(manager.getRegisteredCallback("prepare_decision"), undefined);
  assert.equal(context.calls[0]?.signal?.aborted, true);
});
