import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  IssueAgentProfile,
  IssueRevision,
  IssueWorkspaceSurface,
  ReadCollaborationContextInput,
  RepositoryBrowserClientPort,
  RepositoryFailure,
  RepositoryResult,
  RepositoryToolName,
} from "../repository/contracts";
import {
  REPOSITORY_TOOL_NAMES,
  REPOSITORY_WEBMCP_TOOL_CATALOG,
} from "../repository/contracts";
import { RepositoryActivitySignal } from "./repository-activity-signal";
import { getRepositoryWebMCPToolDefinition } from "./repository-catalog";
import {
  captureRepositoryCallbackContext,
  createRepositoryToolCallback,
} from "./repository-executor";
import {
  makeRepositoryRegistrationContextKey,
  RepositoryWebMCPRegistrationManager,
} from "./repository-registration";
import type {
  MutableRepositoryAgentConnectionRef,
  MutableRepositoryWebMCPRuntimeRef,
  RepositoryWebMCPRuntimeDependencies,
} from "./repository-types";
import type { WebMCPModelContextLike, WebMCPToolLike } from "./types";

const MEMBER_ID = "123e4567-e89b-42d3-a456-426614174000";
const PAGE_ID = "223e4567-e89b-42d3-a456-426614174000";
const DOCUMENT_ID = "323e4567-e89b-42d3-a456-426614174000";
const PROFILE_ID = "623e4567-e89b-42d3-a456-426614174000";

function profile(name = "Contextbot", accessCount = 1): IssueAgentProfile {
  return {
    profileId: PROFILE_ID,
    member: { memberId: MEMBER_ID, displayName: "Priya Shah" },
    name,
    identitySource: "SELF_DECLARED",
    firstSeenAt: "2026-09-01T00:00:00.000Z",
    lastAccessedAt: `2026-09-01T00:00:0${Math.min(accessCount, 9)}.000Z`,
    accessCount,
  };
}

function surface(revision = 1, activityVersion = 1): IssueWorkspaceSurface {
  return {
    document: {
      id: DOCUMENT_ID,
      protocolVersion: 4,
      kind: "POSTMORTEM",
      title: "INC-482 · Checkout outage postmortem",
      body: "## Summary\n\nInvestigation in progress.",
      revision,
      activityVersion,
      updatedAt: "2026-09-01T00:00:00.000Z",
      lastRevision: {
        revisionId: "423e4567-e89b-42d3-a456-426614174000",
        author: {
          actorType: "HUMAN",
          displayName: "Priya Shah",
          member: { memberId: MEMBER_ID, displayName: "Priya Shah" },
          agentLabel: null,
        },
        authority: "HUMAN",
        summary: "Launch incident postmortem.",
      },
    },
    presence: [],
    members: [{ memberId: MEMBER_ID, displayName: "Priya Shah" }],
    agents: [],
    tasks: [],
    threads: [],
    history: [],
    hasMoreHistory: false,
  };
}

function revision(number: number): IssueRevision {
  const member = { memberId: MEMBER_ID, displayName: "Priya Shah" };
  const actor = {
    actorType: "HUMAN" as const,
    displayName: member.displayName,
    member,
    agentLabel: null,
  };
  return {
    revisionId: "523e4567-e89b-42d3-a456-426614174000",
    revision: number,
    parentRevision: number === 1 ? null : number - 1,
    title: "Historical title",
    body: "Historical body",
    contentDigest: `sha256:${"0".repeat(64)}`,
    diffs: [],
    provenance: {
      authority: "HUMAN",
      origin: "ORDINARY_UI",
      authorOrigin: "ORDINARY_UI",
      taskId: null,
      sourceRevision: Math.max(0, number - 1),
      author: actor,
      committer: actor,
      grantedBy: null,
      approvedBy: null,
      restoredRevision: null,
    },
    changeSummary: "Historical revision.",
    evidenceRefs: [],
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function runtime(initial: IssueWorkspaceSurface): MutableRepositoryWebMCPRuntimeRef {
  return {
    current: {
      surface: initial,
      sessionInstanceId: "session-one",
      pageSessionId: PAGE_ID,
      agentSessionToken: "agent-token",
      selfMemberId: MEMBER_ID,
    },
  };
}

type HarnessMethod =
  | "connectAgent"
  | "inspectAsAgent"
  | "readHistoryAsAgent"
  | "readRevisionAsAgent"
  | "readCollaborationContext"
  | "listMyTasks"
  | "waitForMyTasks"
  | "commentOnTask"
  | "submitTaskResult";

function serviceHarness(initial: IssueWorkspaceSurface) {
  let authoritative = initial;
  let currentProfile: IssueAgentProfile | null = null;
  let contextData: unknown = null;
  let heldInspect = false;
  let heldContext: Promise<void> | null = null;
  let releaseHeldContext: (() => void) | null = null;
  const failures = new Map<HarnessMethod, RepositoryFailure>();
  const calls: Array<{ method: HarnessMethod; args: unknown[] }> = [];
  const ok = <T>(data: T): RepositoryResult<T> => ({ ok: true, data });
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected repository client call");
  };
  const scriptedFailure = (method: HarnessMethod): RepositoryFailure | null => {
    const result = failures.get(method) ?? null;
    failures.delete(method);
    return result;
  };
  const record = (method: HarnessMethod, args: unknown[]) => {
    calls.push({ method, args });
    return scriptedFailure(method);
  };

  const service = {
    launch: unused,
    launchExample: unused,
    join: unused,
    inspect: unused,
    inspectAsAgent: async (...args: unknown[]) => {
      const failure = record("inspectAsAgent", args);
      if (failure) return failure;
      if (heldInspect) {
        const signal = args[2] as AbortSignal | undefined;
        return await new Promise<never>((_resolve, reject) => {
          const abort = () => reject(new DOMException("Registration ended", "AbortError"));
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        });
      }
      return ok(structuredClone(authoritative));
    },
    saveHumanRevision: unused,
    createTask: unused,
    createMentionTask: unused,
    createThread: unused,
    addHumanComment: unused,
    resolveThread: unused,
    cancelTask: unused,
    acceptTaskProposal: unused,
    rejectTaskProposal: unused,
    restoreRevision: unused,
    readHistory: unused,
    readRevision: unused,
    readHistoryAsAgent: async (...args: unknown[]) => {
      const failure = record("readHistoryAsAgent", args);
      if (failure) return failure;
      return ok({
        revisions: [],
        hasMoreOlder: false,
        nextBeforeRevision: null,
        currentRevision: authoritative.document.revision,
        currentActivityVersion: authoritative.document.activityVersion,
      });
    },
    readRevisionAsAgent: async (...args: unknown[]) => {
      const failure = record("readRevisionAsAgent", args);
      if (failure) return failure;
      return ok(revision(args[1] as number));
    },
    connectAgent: async (...args: unknown[]) => {
      const failure = record("connectAgent", args);
      if (failure) return failure;
      const input = args[1] as { name: string };
      currentProfile = profile(input.name, (currentProfile?.accessCount ?? 0) + 1);
      authoritative = {
        ...authoritative,
        agents: [currentProfile],
      };
      return ok({
        profile: currentProfile,
        revision: authoritative.document.revision,
        activityVersion: authoritative.document.activityVersion,
      });
    },
    readCollaborationContext: async (...args: unknown[]) => {
      const failure = record("readCollaborationContext", args);
      if (heldContext) await heldContext;
      if (failure) return failure;
      if (contextData !== null) return ok(contextData);
      const input = args[1] as ReadCollaborationContextInput;
      const firstPage = input.beforeActivityVersion === undefined;
      return ok({
        agents: [
          { ...profile("Databot", 2), profileId: "723e4567-e89b-42d3-a456-426614174000" },
          { ...profile("Logbot", 3), profileId: "823e4567-e89b-42d3-a456-426614174000" },
        ],
        events: firstPage
          ? [
              { activityVersion: 11, kind: "REVISION_COMMITTED", comment: null },
              { activityVersion: 10, kind: "TASK_COMPLETED", comment: null },
            ]
          : [{ activityVersion: 9, kind: "COMMENT_ADDED", comment: { body: "Decision context" } }],
        hasMoreOlder: firstPage,
        nextBeforeActivityVersion: firstPage ? 10 : null,
        currentRevision: authoritative.document.revision,
        currentActivityVersion: 11,
      });
    },
    listMyTasks: async (...args: unknown[]) => {
      const failure = record("listMyTasks", args);
      if (failure) return failure;
      return ok({
        tasks: [],
        revision: authoritative.document.revision,
        activityVersion: authoritative.document.activityVersion,
      });
    },
    waitForMyTasks: async (...args: unknown[]) => {
      const failure = record("waitForMyTasks", args);
      if (failure) return failure;
      return ok({
        outcome: "TIMEOUT" as const,
        tasks: [] as [],
        revision: authoritative.document.revision,
        activityVersion: authoritative.document.activityVersion,
      });
    },
    commentOnTask: async (...args: unknown[]) => {
      const failure = record("commentOnTask", args);
      if (failure) return failure;
      throw new Error("Comment outcome not scripted");
    },
    submitTaskResult: async (...args: unknown[]) => {
      const failure = record("submitTaskResult", args);
      if (failure) return failure;
      throw new Error("Result outcome not scripted");
    },
    touchPresence: unused,
  } as unknown as RepositoryBrowserClientPort;

  return {
    service,
    calls,
    failNext(method: HarnessMethod, code: RepositoryFailure["code"]) {
      failures.set(method, {
        ok: false,
        code,
        message: `${method} failed`,
        retryable: false,
      });
    },
    holdInspect() {
      heldInspect = true;
    },
    holdContextResponse() {
      heldContext = new Promise<void>((resolve) => {
        releaseHeldContext = resolve;
      });
    },
    releaseContextResponse() {
      releaseHeldContext?.();
      heldContext = null;
      releaseHeldContext = null;
    },
    setContextData(value: unknown) {
      contextData = value;
    },
  };
}

function dependencies(
  latest: MutableRepositoryWebMCPRuntimeRef,
  service: RepositoryBrowserClientPort,
  connected: IssueAgentProfile | null = null,
) {
  const connection: MutableRepositoryAgentConnectionRef = { current: connected };
  const authoritativeSurfaces: IssueWorkspaceSurface[] = [];
  const agentConnections: Array<IssueAgentProfile | null> = [];
  const value: RepositoryWebMCPRuntimeDependencies = {
    latest,
    connection,
    service,
    activitySignal: new RepositoryActivitySignal(
      latest.current.surface.document.activityVersion,
    ),
    activeWaitKeys: new Set(),
    onAuthoritativeSurface: (next) => authoritativeSurfaces.push(next),
    onAgentConnectionChange: (profile) => agentConnections.push(profile),
  };
  return { value, connection, authoritativeSurfaces, agentConnections };
}

class FakeModelContext implements WebMCPModelContextLike {
  calls: Array<{ tool: WebMCPToolLike; signal?: AbortSignal }> = [];

  registerTool(tool: WebMCPToolLike, options?: { signal?: AbortSignal }): void {
    this.calls.push({ tool, signal: options?.signal });
  }
}

function callback(
  name: RepositoryToolName,
  latest: MutableRepositoryWebMCPRuntimeRef,
  deps: RepositoryWebMCPRuntimeDependencies,
) {
  return createRepositoryToolCallback(
    name,
    captureRepositoryCallbackContext(latest),
    deps,
  );
}

async function connect(
  latest: MutableRepositoryWebMCPRuntimeRef,
  deps: RepositoryWebMCPRuntimeDependencies,
  name = "Contextbot",
) {
  return callback("connect_agent", latest, deps)({ name }) as Promise<{
    ok: true;
    profile: IssueAgentProfile;
  }>;
}

test("runtime consumes the exact checked eight-tool catalog", () => {
  assert.deepEqual(
    REPOSITORY_WEBMCP_TOOL_CATALOG.map((tool) => tool.name),
    REPOSITORY_TOOL_NAMES,
  );
  assert.equal(REPOSITORY_TOOL_NAMES.length, 8);
  for (const expected of REPOSITORY_WEBMCP_TOOL_CATALOG) {
    assert.deepEqual(getRepositoryWebMCPToolDefinition(expected.name), expected);
    assert.equal(expected.inputSchema.additionalProperties, false);
    const serialized = JSON.stringify(expected.inputSchema);
    assert.equal(serialized.includes("requestId"), false);
    assert.equal(serialized.includes("assignedToMemberId"), false);
    assert.equal(serialized.includes('"mode"'), false);
    assert.equal(serialized.includes('"owner"'), false);
  }
  for (const name of [
    "inspect_document",
    "read_document_history",
    "read_collaboration_context",
    "list_my_tasks",
    "wait_for_my_tasks",
  ] as const) {
    assert.equal(getRepositoryWebMCPToolDefinition(name).annotations.readOnlyHint, true);
    assert.equal(getRepositoryWebMCPToolDefinition(name).annotations.idempotentHint, true);
  }
  assert.equal(
    getRepositoryWebMCPToolDefinition("wait_for_my_tasks").description.includes(
      "does not wake a dormant agent",
    ),
    true,
  );
  assert.deepEqual(
    getRepositoryWebMCPToolDefinition("submit_task_result").annotations,
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      untrustedContentHint: true,
    },
  );
});

test("registers all eight tools from page start and tears them down through AbortSignal", async () => {
  const initial = surface();
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const deps = dependencies(latest, harness.service);
  const context = new FakeModelContext();
  const manager = new RepositoryWebMCPRegistrationManager(context, deps.value);
  const key = makeRepositoryRegistrationContextKey(
    DOCUMENT_ID,
    4,
    latest.current.sessionInstanceId,
    latest.current.pageSessionId,
    latest.current.agentSessionToken,
    latest.current.selfMemberId,
  );

  const first = await manager.reconcile(initial, MEMBER_ID, key);
  assert.deepEqual(first.added, REPOSITORY_TOOL_NAMES);
  assert.deepEqual(context.calls.map((call) => call.tool.name), REPOSITORY_TOOL_NAMES);
  const inspect = manager.getRegisteredCallback("inspect_document");

  const advanced = surface(2, 3);
  latest.current = { ...latest.current, surface: advanced };
  const second = await manager.reconcile(advanced, MEMBER_ID, key);
  assert.deepEqual(second.retained, REPOSITORY_TOOL_NAMES);
  assert.equal(manager.getRegisteredCallback("inspect_document"), inspect);
  assert.equal(context.calls.length, 8);

  deps.connection.current = profile();
  manager.dispose();
  assert.equal(context.calls.every((call) => call.signal?.aborted), true);
  assert.equal(deps.connection.current, null);
  assert.deepEqual(deps.agentConnections, [null]);
});

test("only connect_agent may run before page identity is established", async () => {
  const latest = runtime(surface());
  const harness = serviceHarness(latest.current.surface);
  const deps = dependencies(latest, harness.service);

  for (const name of REPOSITORY_TOOL_NAMES.filter(
    (candidate): candidate is Exclude<RepositoryToolName, "connect_agent"> =>
      candidate !== "connect_agent",
  )) {
    const result = await callback(name, latest, deps.value)({ notEvenValid: true }) as {
      ok: false;
      code: string;
    };
    assert.equal(result.code, "AGENT_IDENTITY_REQUIRED", name);
  }
  assert.deepEqual(harness.calls, []);

  const invalidConnect = await callback("connect_agent", latest, deps.value)({
    name: "@forged",
  }) as { ok: false; code: string };
  assert.equal(invalidConnect.code, "INVALID_INPUT");
  for (const name of ["Context\u2028@forged", "Context\u2029@forged"]) {
    const separatorBypass = await callback(
      "connect_agent",
      latest,
      deps.value,
    )({ name }) as { ok: false; code: string };
    assert.equal(separatorBypass.code, "INVALID_INPUT");
  }
  assert.deepEqual(harness.calls, []);
});

test("connect forwards page identity, updates the visible profile, and rename replaces the binding", async () => {
  const latest = runtime(surface(4, 11));
  const harness = serviceHarness(latest.current.surface);
  const deps = dependencies(latest, harness.service);

  const first = await connect(latest, deps.value, "Contextbot");
  assert.equal(first.ok, true);
  assert.equal(first.profile.name, "Contextbot");
  assert.equal(deps.connection.current?.name, "Contextbot");
  assert.equal(deps.agentConnections.at(-1)?.name, "Contextbot");
  assert.equal(latest.current.surface.agents[0]?.name, "Contextbot");
  assert.equal(deps.authoritativeSurfaces.at(-1)?.agents[0]?.name, "Contextbot");
  assert.deepEqual(harness.calls[0], {
    method: "connectAgent",
    args: ["agent-token", { name: "Contextbot" }, PAGE_ID, undefined],
  });

  const renamed = await connect(latest, deps.value, "Researchbot");
  assert.equal(renamed.profile.profileId, first.profile.profileId);
  assert.equal(deps.connection.current?.name, "Researchbot");
  assert.deepEqual(
    deps.agentConnections.map((entry) => entry?.name ?? null),
    ["Contextbot", "Researchbot"],
  );
  assert.equal(latest.current.surface.agents[0]?.name, "Researchbot");
});

test("registration context replacement and teardown report a cleared connection", async () => {
  const initial = surface();
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const deps = dependencies(latest, harness.service);
  const manager = new RepositoryWebMCPRegistrationManager(
    new FakeModelContext(),
    deps.value,
  );
  const firstKey = makeRepositoryRegistrationContextKey(
    DOCUMENT_ID,
    4,
    latest.current.sessionInstanceId,
    latest.current.pageSessionId,
    latest.current.agentSessionToken,
    latest.current.selfMemberId,
  );
  await manager.reconcile(initial, MEMBER_ID, firstKey);

  const firstConnect = manager.getRegisteredCallback("connect_agent");
  assert.ok(firstConnect);
  await firstConnect({ name: "Contextbot" });

  latest.current = { ...latest.current, pageSessionId: "replacement-page" };
  const replacementKey = makeRepositoryRegistrationContextKey(
    DOCUMENT_ID,
    4,
    latest.current.sessionInstanceId,
    latest.current.pageSessionId,
    latest.current.agentSessionToken,
    latest.current.selfMemberId,
  );
  await manager.reconcile(initial, MEMBER_ID, replacementKey);
  assert.equal(deps.connection.current, null);

  const replacementConnect = manager.getRegisteredCallback("connect_agent");
  assert.ok(replacementConnect);
  await replacementConnect({ name: "Researchbot" });
  manager.dispose();

  assert.equal(deps.connection.current, null);
  assert.deepEqual(
    deps.agentConnections.map((entry) => entry?.name ?? null),
    ["Contextbot", null, "Researchbot", null],
  );
});

test("agent reads forward the captured page and expose history plus cross-agent continuity", async () => {
  const latest = runtime(surface(4, 11));
  const harness = serviceHarness(latest.current.surface);
  const deps = dependencies(latest, harness.service);
  await connect(latest, deps.value);

  const inspected = await callback("inspect_document", latest, deps.value)({
    revision: 2,
  }) as {
    ok: true;
    document: IssueRevision;
    agents: IssueAgentProfile[];
  };
  assert.equal(inspected.document.revision, 2);
  assert.equal(inspected.agents[0]?.name, "Contextbot");

  await callback("read_document_history", latest, deps.value)({
    beforeRevision: 4,
    limit: 2,
  });
  const firstContext = await callback(
    "read_collaboration_context",
    latest,
    deps.value,
  )({ limit: 2 }) as {
    ok: true;
    agents: IssueAgentProfile[];
    events: Array<{ activityVersion: number }>;
    nextBeforeActivityVersion: number;
  };
  const secondContext = await callback(
    "read_collaboration_context",
    latest,
    deps.value,
  )({ beforeActivityVersion: firstContext.nextBeforeActivityVersion, limit: 2 }) as {
    ok: true;
    events: Array<{ activityVersion: number; comment: { body: string } }>;
    nextBeforeActivityVersion: null;
  };

  assert.deepEqual(firstContext.agents.map((entry) => entry.name), ["Databot", "Logbot"]);
  assert.deepEqual(firstContext.events.map((entry) => entry.activityVersion), [11, 10]);
  assert.deepEqual(secondContext.events.map((entry) => entry.activityVersion), [9]);
  assert.equal(secondContext.events[0]?.comment.body, "Decision context");
  assert.equal(secondContext.nextBeforeActivityVersion, null);

  const calls = harness.calls.slice(1);
  assert.deepEqual(calls.map((entry) => entry.method), [
    "inspectAsAgent",
    "readRevisionAsAgent",
    "readHistoryAsAgent",
    "readCollaborationContext",
    "readCollaborationContext",
  ]);
  for (const call of calls) {
    assert.equal(call.args[0], "agent-token", call.method);
    const pageArgument = call.method === "inspectAsAgent" ? 1 : 2;
    assert.equal(call.args[pageArgument], PAGE_ID, call.method);
  }
});

test("task reads and waits forward the connected agent and page identity", async () => {
  const latest = runtime(surface(1, 4));
  const harness = serviceHarness(latest.current.surface);
  const deps = dependencies(latest, harness.service);
  await connect(latest, deps.value);

  const invalid = await callback("list_my_tasks", latest, deps.value)({
    includeResolved: false,
    memberId: MEMBER_ID,
  }) as { code: string };
  assert.equal(invalid.code, "INVALID_INPUT");

  await callback("list_my_tasks", latest, deps.value)({ includeResolved: true });
  await callback("wait_for_my_tasks", latest, deps.value)({
    afterActivityVersion: 4,
    afterRevision: 1,
    timeoutSeconds: 1,
  });

  const list = harness.calls.find((call) => call.method === "listMyTasks");
  const wait = harness.calls.find((call) => call.method === "waitForMyTasks");
  assert.equal(list?.args[0], "agent-token");
  assert.equal(list?.args[2], PAGE_ID);
  assert.equal(wait?.args[0], "agent-token");
  assert.equal(wait?.args[2], PAGE_ID);
});

test("identity, profile, and page failures clear the page-lifetime binding", async () => {
  const latest = runtime(surface());
  const harness = serviceHarness(latest.current.surface);
  const deps = dependencies(latest, harness.service);
  await connect(latest, deps.value);

  harness.failNext("readCollaborationContext", "STALE_AGENT_PROFILE");
  const staleProfile = await callback(
    "read_collaboration_context",
    latest,
    deps.value,
  )({}) as { code: string };
  assert.equal(staleProfile.code, "STALE_AGENT_PROFILE");
  assert.equal(deps.connection.current, null);
  assert.equal(deps.agentConnections.at(-1), null);

  const callsBeforeGate = harness.calls.length;
  const gated = await callback("inspect_document", latest, deps.value)({}) as {
    code: string;
  };
  assert.equal(gated.code, "AGENT_IDENTITY_REQUIRED");
  assert.equal(harness.calls.length, callsBeforeGate);

  await connect(latest, deps.value);
  harness.failNext("listMyTasks", "STALE_PAGE_CONTEXT");
  const stalePage = await callback("list_my_tasks", latest, deps.value)({}) as {
    code: string;
  };
  assert.equal(stalePage.code, "STALE_PAGE_CONTEXT");
  assert.equal(deps.connection.current, null);
  assert.equal(deps.agentConnections.at(-1), null);

  await connect(latest, deps.value);
  const captured = captureRepositoryCallbackContext(latest);
  latest.current = { ...latest.current, pageSessionId: "new-page" };
  const locallyStale = await createRepositoryToolCallback(
    "inspect_document",
    captured,
    deps.value,
  )({}) as { code: string };
  assert.equal(locallyStale.code, "STALE_PAGE_CONTEXT");
  assert.equal(deps.connection.current, null);
  assert.equal(deps.agentConnections.at(-1), null);
});

test("a delayed stale response cannot erase a newer successful reconnect", async () => {
  const latest = runtime(surface());
  const harness = serviceHarness(latest.current.surface);
  const deps = dependencies(latest, harness.service);
  await connect(latest, deps.value, "Contextbot");

  harness.failNext("readCollaborationContext", "STALE_AGENT_PROFILE");
  harness.holdContextResponse();
  const delayed = callback(
    "read_collaboration_context",
    latest,
    deps.value,
  )({});
  await Promise.resolve();

  const reconnected = await connect(latest, deps.value, "Researchbot");
  assert.equal(reconnected.profile.name, "Researchbot");
  assert.equal(deps.connection.current?.name, "Researchbot");

  harness.releaseContextResponse();
  const stale = await delayed as { ok: false; code: string };
  assert.equal(stale.code, "STALE_AGENT_PROFILE");
  assert.equal(deps.connection.current?.name, "Researchbot");
  assert.deepEqual(
    deps.agentConnections.map((entry) => entry?.name ?? null),
    ["Contextbot", "Researchbot"],
  );

  const stillConnected = await callback(
    "list_my_tasks",
    latest,
    deps.value,
  )({ includeResolved: false }) as { ok: boolean };
  assert.equal(stillConnected.ok, true);
});

test("registration teardown aborts an in-flight connected read", async () => {
  const initial = surface();
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const deps = dependencies(latest, harness.service);
  const context = new FakeModelContext();
  const manager = new RepositoryWebMCPRegistrationManager(context, deps.value);
  const key = makeRepositoryRegistrationContextKey(
    DOCUMENT_ID,
    4,
    latest.current.sessionInstanceId,
    latest.current.pageSessionId,
    latest.current.agentSessionToken,
    latest.current.selfMemberId,
  );
  await manager.reconcile(initial, MEMBER_ID, key);

  const connectTool = manager.getRegisteredCallback("connect_agent");
  const inspectTool = manager.getRegisteredCallback("inspect_document");
  assert.ok(connectTool);
  assert.ok(inspectTool);
  await connectTool({ name: "Contextbot" });
  harness.holdInspect();
  const pending = inspectTool({});
  manager.dispose();
  await assert.rejects(pending, (error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  });
  assert.equal(deps.connection.current, null);
  assert.deepEqual(
    deps.agentConnections.map((entry) => entry?.name ?? null),
    ["Contextbot", null],
  );
});

test("tool output fails closed when a service returns non-JSON data", async () => {
  const latest = runtime(surface());
  const harness = serviceHarness(latest.current.surface);
  const deps = dependencies(latest, harness.service);
  await connect(latest, deps.value);
  const circular: { self?: unknown } = {};
  circular.self = circular;
  harness.setContextData({
    agents: [],
    events: [circular],
    hasMoreOlder: false,
    nextBeforeActivityVersion: null,
    currentRevision: 1,
    currentActivityVersion: 1,
  });

  await assert.rejects(
    callback("read_collaboration_context", latest, deps.value)({}),
    /circular|serialize|JSON/i,
  );
});

test("managed Relay suspension withdraws all idle tools and blocks reconciliation until resume", async () => {
  const initial = surface();
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const deps = dependencies(latest, harness.service);
  const context = new FakeModelContext();
  const manager = new RepositoryWebMCPRegistrationManager(context, deps.value);
  const key = makeRepositoryRegistrationContextKey(
    DOCUMENT_ID,
    4,
    latest.current.sessionInstanceId,
    latest.current.pageSessionId,
    latest.current.agentSessionToken,
    latest.current.selfMemberId,
  );

  await manager.reconcile(initial, MEMBER_ID, key);
  const withdrawn = await manager.suspend();
  assert.deepEqual(withdrawn.removed, REPOSITORY_TOOL_NAMES);
  assert.deepEqual(manager.registeredTools, []);
  assert.equal(context.calls.every(({ signal }) => signal?.aborted), true);

  const whileSuspended = await manager.reconcile(initial, MEMBER_ID, key);
  assert.deepEqual(whileSuspended, {
    added: [],
    removed: [],
    retained: [],
    reRegistered: [],
  });
  assert.deepEqual(manager.registeredTools, []);

  manager.resume();
  const restored = await manager.reconcile(initial, MEMBER_ID, key);
  assert.deepEqual(restored.added, REPOSITORY_TOOL_NAMES);
  assert.deepEqual(manager.registeredTools, REPOSITORY_TOOL_NAMES);
  manager.dispose();
});
