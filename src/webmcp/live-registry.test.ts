import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  AgentRegistryProjection,
  CompiledCapabilities,
  CoordinationResult,
  PageSelection,
  RatiflowServicePort,
  WorkspaceView,
} from "../contracts/index";
import { ActivitySignalHub } from "./activity-signal-hub";
import { LiveWebMCPRegistrationManager } from "./live-registration";
import { AgentToolRegistry } from "./registry";
import type {
  MutableWebMCPRuntimeRef,
  WebMCPModelContextLike,
  WebMCPToolLike,
} from "./types";

const CURSOR_1 = "10000000-0000-4000-8000-000000000001";
const CURSOR_2 = "10000000-0000-4000-8000-000000000002";
const REQUEST_ID = "20000000-0000-4000-8000-000000000001";

function collaboration(): WorkspaceView["collaboration"] {
  return {
    cursor: CURSOR_1,
    agent: {
      actor: { id: "agent_ratiflow_demo", name: "Ratiflow Agent", role: "Decision analyst" },
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
  };
}

function workspace(): WorkspaceView {
  return {
    id: "ws_northstar_csv_launch",
    name: "Northstar CSV launch scope",
    revision: 7,
    decision: {
      id: "dec_csv_oct15",
      question: "Should CSV export belong in the Oct 15 launch?",
      state: "READY",
      selectedOptionId: "opt_csv_ga_oct15",
      launchDate: "2026-10-15",
      launchCapacityEngineerDays: 18,
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
        title: "Full CSV export",
        summary: "Full CSV export at launch.",
        launchDate: "2026-10-15",
        exportEngineerDays: 8,
        totalEngineerDays: 18,
        postLaunchEngineerDays: 0,
      },
      {
        id: "opt_csv_beta_oct15",
        title: "Northstar beta",
        summary: "A scoped beta followed by GA.",
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
      launchCapacityEngineerDays: 18,
      unresolvedBlockingChallengeCount: 0,
    },
    collaboration: collaboration(),
  };
}

function compiled(
  selection: PageSelection = { kind: "DECISION", id: "dec_csv_oct15" },
  contextEpoch = 1,
): CompiledCapabilities {
  return {
    state: "READY",
    workspaceRevision: 7,
    contextEpoch,
    selection,
    availableTools:
      selection.kind === "OPTION"
        ? [
            "inspect_decision",
            "inspect_selected_option",
            "recommend_option",
            "challenge_option",
            "add_evidence",
            "compare_options",
            "prepare_decision",
            "why_not",
          ]
        : [
            "inspect_decision",
            "recommend_option",
            "add_evidence",
            "compare_options",
            "prepare_decision",
            "why_not",
          ],
    unavailableActions: [
      {
        action: "ratify_decision",
        unmetPredicates: [
          "ratification is never available through WebMCP; Maya Chen must ratify in the ordinary UI",
          "ratification requires a prepared decision in REVIEW",
        ],
      },
    ],
    signature: JSON.stringify([selection.kind, selection.id, contextEpoch]),
  };
}

function runtime(initialCompiled = compiled()): MutableWebMCPRuntimeRef {
  return {
    current: {
      compiled: initialCompiled,
      workspace: workspace(),
      memberRole: "PRODUCT_LEAD",
      memberSessionInstanceId: "30000000-0000-4000-8000-000000000001",
      pageSessionId: "30000000-0000-4000-8000-000000000002",
      sessionToken: "opaque-agent-token",
    },
  };
}

function projection(
  caller: AgentRegistryProjection["caller"],
  engagementMode: AgentRegistryProjection["engagementMode"],
  decisionCapabilities = compiled(),
): AgentRegistryProjection {
  return { caller, engagementMode, decisionCapabilities };
}

function catchUp(
  cursor = CURSOR_1,
  events: WorkspaceView["collaboration"]["recentActivity"] = [],
): CoordinationResult<{
  events: WorkspaceView["collaboration"]["recentActivity"];
  inbox: [];
  questions: [];
  hasMore: false;
  observedHighWater: string;
  sessionOpen: true;
}> {
  return {
    ok: true,
    cursor,
    data: {
      events,
      inbox: [],
      questions: [],
      hasMore: false,
      observedHighWater: cursor,
      sessionOpen: true,
    },
  };
}

function baseService(
  overrides: Partial<RatiflowServicePort> = {},
): RatiflowServicePort {
  const notUsed = async () => {
    throw new Error("not used");
  };
  return {
    inspect: async () => workspace(),
    mutateFromWebMCP: notUsed,
    joinAgentSession: notUsed,
    catchUpAgentSession: async () => catchUp(),
    leaveAgentSession: notUsed,
    getAgentStateBrief: notUsed,
    getAgentThread: notUsed,
    getAgentInbox: notUsed,
    claimAgentTask: notUsed,
    resolveAgentTask: notUsed,
    postAgentComment: notUsed,
    requestHumanInput: notUsed,
    createAgentTaskFromHumanUi: notUsed,
    answerHumanInputFromHumanUi: notUsed,
    cancelAgentTaskFromHumanUi: notUsed,
    updateStandingInstructionsFromHumanUi: notUsed,
    authorizeAutoRunner: notUsed,
    setLaunchCapacityFromCollaboratorUi: notUsed,
    ratifyFromHumanUi: notUsed,
    subscribe: () => () => undefined,
    ...overrides,
  } as unknown as RatiflowServicePort;
}

test("projects exact immutable browser and runner surfaces without trust inputs", () => {
  const registry = new AgentToolRegistry({
    latest: runtime(),
    service: baseService(),
    activityHub: new ActivitySignalHub(CURSOR_1),
  });

  assert.deepEqual(
    registry.availableDefinitions(projection("BROWSER_AGENT", "FRESH")).map(({ name }) => name),
    ["join_session", "catch_up"],
  );
  const invoked = registry.availableDefinitions(projection("BROWSER_AGENT", "INVOKED"));
  assert.deepEqual(invoked.slice(0, 9).map(({ name }) => name), [
    "join_session",
    "catch_up",
    "get_state_brief",
    "get_thread",
    "get_inbox",
    "claim_agent_task",
    "resolve_task",
    "post_comment",
    "request_human_input",
  ]);
  const runnerNames = registry
    .availableDefinitions(projection("AUTO_RUNNER", "FRESH"))
    .map(({ name }) => name);
  assert.equal(runnerNames.includes("join_session"), false);
  assert.equal(runnerNames.includes("wait_for_activity"), false);
  assert.equal(runnerNames.includes("catch_up"), false);
  assert.equal(runnerNames.includes("leave_session"), false);
  assert.equal(runnerNames.includes("claim_agent_task"), true);
  assert.equal(runnerNames.includes("prepare_decision"), true);

  for (const definition of registry.availableDefinitions(projection("BROWSER_AGENT", "LIVE"))) {
    assert.equal(definition.inputSchema.additionalProperties, false);
    const serialized = JSON.stringify(definition.inputSchema);
    for (const forbidden of ["caller", "actor", "origin", "pageSessionId", "agentSessionToken", "claimId"]) {
      assert.equal(serialized.includes(`\"${forbidden}\"`), false);
    }
    assert.equal(Object.isFrozen(definition), true);
  }
});

test("retains a private winning claim for browser and runner task-linked writes", async () => {
  const receivedClaimIds: Array<string | undefined> = [];
  const task = {
    id: "task_1",
    kind: "TASK" as const,
    body: "Review the beta option.",
    target: { kind: "OPTION" as const, id: "opt_csv_beta_oct15" },
    status: "CLAIMED" as const,
    createdBy: { id: "usr_maya_chen", name: "Maya Chen", role: "Product Lead" },
    assignedAgent: { id: "agent_ratiflow_demo", name: "Ratiflow Agent", role: "Decision analyst" },
    claim: {
      claimId: "40000000-0000-4000-8000-000000000001",
      via: "AUTO_PICKUP" as const,
      expiresAt: "2026-08-31T16:01:30.000Z",
      ownedByCurrentSession: true,
    },
    createdAt: "2026-08-31T16:00:00.000Z",
    updatedAt: "2026-08-31T16:00:00.000Z",
  };
  const service = baseService({
    claimAgentTask: async (context) => {
      receivedClaimIds.push(context.claimId);
      return { ok: true, cursor: CURSOR_2, data: { task } };
    },
    postAgentComment: async (context, input) => {
      receivedClaimIds.push(context.claimId);
      return {
        ok: true,
        cursor: CURSOR_2,
        data: {
          comment: {
            id: "comment_1",
            target: input.target,
            body: input.body,
            actor: task.assignedAgent,
            via: "AUTO_PICKUP",
            taskId: input.taskId,
            createdAt: "2026-08-31T16:00:10.000Z",
          },
        },
      };
    },
  });
  const registry = new AgentToolRegistry({
    latest: runtime(),
    service,
    activityHub: new ActivitySignalHub(CURSOR_1),
  });
  const runner = projection("AUTO_RUNNER", "FRESH");
  const context = {
    caller: "AUTO_RUNNER" as const,
    pageSessionId: "30000000-0000-4000-8000-000000000002",
    agentSessionToken: "opaque-agent-token",
  };

  const claimOutput = await registry.execute(
    "claim_agent_task",
    { taskId: task.id, requestId: REQUEST_ID },
    context,
    runner,
  );
  await registry.execute(
    "post_comment",
    {
      target: task.target,
      body: "The beta option keeps four days of launch capacity free.",
      taskId: task.id,
      requestId: "20000000-0000-4000-8000-000000000002",
    },
    context,
    runner,
  );

  assert.deepEqual(receivedClaimIds, [undefined, task.claim.claimId]);
  assert.equal(JSON.stringify(claimOutput).includes('"claimId"'), false);
});

test("wait cannot lose an activity notice between catch-up and parking", async () => {
  const hub = new ActivitySignalHub(CURSOR_1);
  let calls = 0;
  const activity = {
    id: "activity_2",
    cursor: CURSOR_2,
    createdAt: "2026-08-31T16:00:01.000Z",
    actor: { id: "usr_maya_chen", name: "Maya Chen", role: "Product Lead" },
    actorType: "HUMAN" as const,
    via: "ORDINARY_UI" as const,
    type: "TASK_CREATED" as const,
    target: { kind: "DECISION" as const, id: "dec_csv_oct15" },
    summary: "Maya assigned a task to the agent.",
    workspaceRevision: null,
    taskId: "task_1",
  };
  const service = baseService({
    catchUpAgentSession: async () => {
      calls += 1;
      if (calls === 1) {
        // This is the critical interleaving: SSE observes the event after the
        // authoritative read starts but before the wait installs its waiter.
        hub.observe(CURSOR_2);
        return catchUp(CURSOR_1);
      }
      return catchUp(CURSOR_2, [activity]);
    },
  });
  const registry = new AgentToolRegistry({
    latest: runtime(),
    service,
    activityHub: hub,
  });

  const result = (await registry.execute(
    "wait_for_activity",
    { cursor: CURSOR_1, timeoutSeconds: 20 },
    {
      caller: "BROWSER_AGENT",
      pageSessionId: "30000000-0000-4000-8000-000000000002",
      agentSessionToken: "opaque-agent-token",
    },
    projection("BROWSER_AGENT", "LIVE"),
  )) as { ok: boolean; data: { events: unknown[] } };

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.data.events.length, 1);
});

test("wait rejects AbortSignal cancellation instead of serializing it", async () => {
  const registry = new AgentToolRegistry({
    latest: runtime(),
    service: baseService(),
    activityHub: new ActivitySignalHub(CURSOR_1),
  });
  const controller = new AbortController();
  const waiting = registry.execute(
    "wait_for_activity",
    { cursor: CURSOR_1 },
    {
      caller: "BROWSER_AGENT",
      pageSessionId: "30000000-0000-4000-8000-000000000002",
      agentSessionToken: "opaque-agent-token",
      signal: controller.signal,
    },
    projection("BROWSER_AGENT", "LIVE"),
  );
  await Promise.resolve();
  controller.abort("test cancellation");
  await assert.rejects(waiting, { name: "AbortError" });
});

test("wait defaults to 20 seconds, clamps at 30 seconds, and hub teardown cancels", async () => {
  class RecordingHub extends ActivitySignalHub {
    waits: number[] = [];

    override waitForChange(
      _afterCursor: string,
      timeoutMs: number,
    ): Promise<string | null> {
      this.waits.push(timeoutMs);
      return Promise.resolve(null);
    }
  }

  const hub = new RecordingHub(CURSOR_1);
  let now = 1_000;
  const registry = new AgentToolRegistry({
    latest: runtime(),
    service: baseService(),
    activityHub: hub,
    now: () => now,
  });
  const context = {
    caller: "BROWSER_AGENT" as const,
    pageSessionId: "30000000-0000-4000-8000-000000000002",
    agentSessionToken: "opaque-agent-token",
  };
  const live = projection("BROWSER_AGENT", "LIVE");

  await registry.execute("wait_for_activity", { cursor: CURSOR_1 }, context, live);
  now = 2_000;
  await registry.execute(
    "wait_for_activity",
    { cursor: CURSOR_1, timeoutSeconds: 99 },
    context,
    live,
  );
  now = 3_000;
  await registry.execute(
    "wait_for_activity",
    { cursor: CURSOR_1, timeoutSeconds: -4 },
    context,
    live,
  );
  assert.deepEqual(hub.waits, [20_000, 30_000, 1_000]);

  const cancellableHub = new ActivitySignalHub(CURSOR_1);
  const parked = cancellableHub.waitForChange(CURSOR_1, 20_000);
  cancellableHub.close("page teardown");
  await assert.rejects(parked, { name: "AbortError" });
});

test("browser decision reads renew and validate the bound page session first", async () => {
  let catchUpCalls = 0;
  let inspectCalls = 0;
  const latest = runtime();
  const registry = new AgentToolRegistry({
    latest,
    service: baseService({
      catchUpAgentSession: async () => {
        catchUpCalls += 1;
        return catchUp();
      },
      inspect: async () => {
        inspectCalls += 1;
        return workspace();
      },
    }),
    activityHub: new ActivitySignalHub(CURSOR_1),
  });

  const result = (await registry.execute(
    "inspect_decision",
    {},
    {
      caller: "BROWSER_AGENT",
      pageSessionId: "30000000-0000-4000-8000-000000000002",
      agentSessionToken: "opaque-agent-token",
    },
    projection("BROWSER_AGENT", "INVOKED"),
  )) as { ok: boolean };
  assert.equal(result.ok, true);
  assert.equal(catchUpCalls, 1);
  assert.equal(inspectCalls, 1);

  const closedRegistry = new AgentToolRegistry({
    latest: runtime(),
    service: baseService({
      catchUpAgentSession: async () => ({
        ok: false,
        code: "SESSION_CLOSED",
        message: "The invoked lease expired.",
        retryable: true,
      }),
      inspect: async () => {
        throw new Error("closed reads must not inspect");
      },
    }),
    activityHub: new ActivitySignalHub(CURSOR_1),
  });
  const closed = (await closedRegistry.execute(
    "inspect_decision",
    {},
    {
      caller: "BROWSER_AGENT",
      pageSessionId: "30000000-0000-4000-8000-000000000002",
      agentSessionToken: "opaque-agent-token",
    },
    projection("BROWSER_AGENT", "INVOKED"),
  )) as { ok: boolean; code: string };
  assert.equal(closed.ok, false);
  assert.equal(closed.code, "UNAUTHORIZED");
});

class FakeModelContext implements WebMCPModelContextLike {
  calls: Array<{ tool: WebMCPToolLike; signal?: AbortSignal }> = [];

  registerTool(tool: WebMCPToolLike, options?: { signal?: AbortSignal }): void {
    this.calls.push({ tool, signal: options?.signal });
  }
}

test("selection changes preserve waits, rebind target tools, and native-only wrap results", async () => {
  const firstCompiled = compiled(
    { kind: "OPTION", id: "opt_csv_ga_oct15" },
    2,
  );
  const latest = runtime(firstCompiled);
  const hub = new ActivitySignalHub(CURSOR_1);
  const registry = new AgentToolRegistry({
    latest,
    service: baseService(),
    activityHub: hub,
  });
  const native = new FakeModelContext();
  const manager = new LiveWebMCPRegistrationManager(native, registry, latest);

  await manager.reconcile(
    projection("BROWSER_AGENT", "LIVE", firstCompiled),
    "member-session-1",
    "option-epoch-2",
  );
  const waitCallback = manager.getRegisteredCallback("wait_for_activity");
  const waitSignal = native.calls.find(
    ({ tool }) => tool.name === "wait_for_activity",
  )?.signal;
  const selectedCallback = manager.getRegisteredCallback("inspect_selected_option");

  const secondCompiled = compiled(
    { kind: "OPTION", id: "opt_csv_beta_oct15" },
    3,
  );
  latest.current = { ...latest.current, compiled: secondCompiled };
  const diff = await manager.reconcile(
    projection("BROWSER_AGENT", "LIVE", secondCompiled),
    "member-session-1",
    "option-epoch-3",
  );

  assert.equal(manager.getRegisteredCallback("wait_for_activity"), waitCallback);
  assert.equal(waitSignal?.aborted, false);
  assert.notEqual(
    manager.getRegisteredCallback("inspect_selected_option"),
    selectedCallback,
  );
  assert.equal(diff.reRegistered.includes("inspect_selected_option"), true);
  assert.equal(diff.reRegistered.includes("wait_for_activity"), false);

  const wrapped = (await manager.getRegisteredCallback("catch_up")?.({})) as {
    content: Array<{ type: string; text: string }>;
    structuredContent: unknown;
  };
  assert.equal(wrapped.content[0]?.type, "text");
  assert.deepEqual(JSON.parse(wrapped.content[0]?.text ?? "null"), wrapped.structuredContent);

  manager.dispose();
});
