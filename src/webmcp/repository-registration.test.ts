import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  IssueRevision,
  IssueWorkspaceSurface,
  RepositoryBrowserClientPort,
  RepositoryResult,
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
  MutableRepositoryWebMCPRuntimeRef,
  RepositoryWebMCPRuntimeDependencies,
} from "./repository-types";
import type { WebMCPModelContextLike, WebMCPToolLike } from "./types";

const MEMBER_ID = "123e4567-e89b-42d3-a456-426614174000";
const PAGE_ID = "223e4567-e89b-42d3-a456-426614174000";

function surface(revision = 1, activityVersion = 1): IssueWorkspaceSurface {
  return {
    document: {
      id: "323e4567-e89b-42d3-a456-426614174000",
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

function serviceHarness(initial: IssueWorkspaceSurface) {
  let authoritative = initial;
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const ok = <T>(data: T): RepositoryResult<T> => ({ ok: true, data });
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected repository client call");
  };
  const service = {
    launch: unused,
    launchExample: unused,
    join: unused,
    inspect: async (...args: unknown[]) => {
      calls.push({ method: "inspect", args });
      return ok(structuredClone(authoritative));
    },
    saveHumanRevision: unused,
    createTask: unused,
    createThread: unused,
    addHumanComment: unused,
    resolveThread: unused,
    cancelTask: unused,
    acceptTaskProposal: unused,
    rejectTaskProposal: unused,
    restoreRevision: unused,
    readHistory: async (...args: unknown[]) => {
      calls.push({ method: "readHistory", args });
      return ok({
        revisions: [],
        hasMoreOlder: false,
        nextBeforeRevision: null,
        currentRevision: authoritative.document.revision,
        currentActivityVersion: authoritative.document.activityVersion,
      });
    },
    readRevision: async (_token: string, requested: number) => {
      calls.push({ method: "readRevision", args: [_token, requested] });
      return ok(revision(requested));
    },
    listMyTasks: async (...args: unknown[]) => {
      calls.push({ method: "listMyTasks", args });
      return ok({
        tasks: [],
        revision: authoritative.document.revision,
        activityVersion: authoritative.document.activityVersion,
      });
    },
    waitForMyTasks: async (...args: unknown[]) => {
      calls.push({ method: "waitForMyTasks", args });
      return ok({
        outcome: "TIMEOUT" as const,
        tasks: [] as [],
        revision: authoritative.document.revision,
        activityVersion: authoritative.document.activityVersion,
      });
    },
    commentOnTask: async (...args: unknown[]) => {
      calls.push({ method: "commentOnTask", args });
      throw new Error("Comment outcome not scripted");
    },
    submitTaskResult: async (...args: unknown[]) => {
      calls.push({ method: "submitTaskResult", args });
      throw new Error("Result outcome not scripted");
    },
    touchPresence: unused,
  } as unknown as RepositoryBrowserClientPort;
  return {
    service,
    calls,
    setSurface(next: IssueWorkspaceSurface) {
      authoritative = next;
    },
  };
}

function dependencies(
  latest: MutableRepositoryWebMCPRuntimeRef,
  service: RepositoryBrowserClientPort,
): RepositoryWebMCPRuntimeDependencies {
  return {
    latest,
    service,
    activitySignal: new RepositoryActivitySignal(
      latest.current.surface.document.activityVersion,
    ),
    activeWaitKeys: new Set(),
  };
}

class FakeModelContext implements WebMCPModelContextLike {
  calls: Array<{ tool: WebMCPToolLike; signal?: AbortSignal }> = [];

  registerTool(tool: WebMCPToolLike, options?: { signal?: AbortSignal }): void {
    this.calls.push({ tool, signal: options?.signal });
  }
}

test("runtime lookup consumes the exact checked six-tool catalog", () => {
  assert.deepEqual(
    REPOSITORY_WEBMCP_TOOL_CATALOG.map((tool) => tool.name),
    REPOSITORY_TOOL_NAMES,
  );
  for (const expected of REPOSITORY_WEBMCP_TOOL_CATALOG) {
    assert.deepEqual(getRepositoryWebMCPToolDefinition(expected.name), expected);
    assert.equal(expected.inputSchema.additionalProperties, false);
    const serialized = JSON.stringify(expected.inputSchema);
    assert.equal(serialized.includes("requestId"), false);
    assert.equal(serialized.includes("assignedToMemberId"), false);
    assert.equal(serialized.includes('"mode"'), false);
  }
  assert.equal(
    getRepositoryWebMCPToolDefinition("comment_on_task").annotations.idempotentHint,
    false,
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

test("registers all six tools at page start and keeps stable callbacks for surface changes", async () => {
  const initial = surface();
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const context = new FakeModelContext();
  const manager = new RepositoryWebMCPRegistrationManager(
    context,
    dependencies(latest, harness.service),
  );
  const key = makeRepositoryRegistrationContextKey(
    initial.document.id,
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
  assert.equal(context.calls.length, 6);

  manager.dispose();
  assert.equal(context.calls.every((call) => call.signal?.aborted), true);
});

test("historical inspect preserves current counters and task projection", async () => {
  const initial = surface(4, 10);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const callback = createRepositoryToolCallback(
    "inspect_document",
    captureRepositoryCallbackContext(latest),
    dependencies(latest, harness.service),
  );

  const result = await callback({ revision: 2 }) as {
    ok: true;
    document: IssueRevision;
    currentRevision: number;
    currentActivityVersion: number;
  };
  assert.equal(result.ok, true);
  assert.equal(result.document.revision, 2);
  assert.equal(result.currentRevision, 4);
  assert.equal(result.currentActivityVersion, 10);
  assert.deepEqual(harness.calls.map((call) => call.method), ["inspect", "readRevision"]);
});

test("list and wait pass captured agent/page identity and reject extra input", async () => {
  const initial = surface(1, 4);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const deps = dependencies(latest, harness.service);
  const captured = captureRepositoryCallbackContext(latest);

  const invalid = await createRepositoryToolCallback(
    "list_my_tasks",
    captured,
    deps,
  )({ includeResolved: false, memberId: MEMBER_ID });
  assert.deepEqual((invalid as { code: string }).code, "INVALID_INPUT");

  await createRepositoryToolCallback("list_my_tasks", captured, deps)({
    includeResolved: true,
  });
  await createRepositoryToolCallback("wait_for_my_tasks", captured, deps)({
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

test("captured callbacks fail closed after page identity changes", async () => {
  const initial = surface();
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const callback = createRepositoryToolCallback(
    "inspect_document",
    captureRepositoryCallbackContext(latest),
    dependencies(latest, harness.service),
  );
  latest.current = { ...latest.current, pageSessionId: "new-page" };

  const result = await callback({}) as { ok: false; code: string };
  assert.equal(result.ok, false);
  assert.equal(result.code, "STALE_PAGE_CONTEXT");
  assert.equal(harness.calls.length, 0);
});
