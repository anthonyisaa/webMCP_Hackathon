import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { compileCapabilities } from "../../src/capabilities/compiler";
import type {
  AgentRegistryExecutionContext,
  CompiledCapabilities,
  DecisionState,
  MemberRole,
  PageSelection,
  RatiflowServicePort,
  ToolName,
  WorkspaceView,
} from "../../src/contracts";
import { LocalRatiflowService } from "../../src/domain/ratiflow-service";
import { fixtureWorkspace } from "../../src/components/product/fixture-service";
import { makeRegistrationContextKey } from "../../src/webmcp/detect";
import { getWebMCPToolDefinition } from "../../src/webmcp/catalog";
import { createToolCallback } from "../../src/webmcp/executor";
import { WebMCPRegistrationManager } from "../../src/webmcp/registration";
import { validateToolInput } from "../../src/webmcp/validation";
import type {
  MutableWebMCPRuntimeRef,
  WebMCPModelContextLike,
  WebMCPRuntimeDependencies,
  WebMCPToolLike,
} from "../../src/webmcp/types";

const golden = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), "evals/goldens", name), "utf8")) as T;

type GoldenActor = { id: string; name: string; role: string };
type GoldenFollowup = { ownerId: string; dueDate: string; inheritedContext: string[] };

const hero = golden<{
  workspace: Record<string, unknown>;
  actors: Record<string, GoldenActor>;
  options: Array<Record<string, unknown>>;
  evidenceIds: string[];
  timeline: Array<Record<string, unknown>>;
  followup: GoldenFollowup;
}>("hero-revisions.json");
const staleGolden = golden<Record<string, unknown>>("stale-response.json");
const continuity = golden<{ finalState: Record<string, unknown> }>("continuity-answers.json");
const vectors = golden<Array<{ id: string; expectedCode?: string; expectedRevision: number; mutationAccepted: boolean }>>("protocol-vectors.json");
const resultVectors = golden<Array<{ code: string; retryable: boolean }>>("result-envelope-vectors.json");
const schemaVectors = golden<Array<{ id: string; valid: boolean; reason?: string }>>("schema-vectors.json");
const matrix = golden<{ cases: Array<{ id: string; state: DecisionState; selection: PageSelection; availableTools: ToolName[] }> }>("capability-matrix.json");

const ids = {
  capacity: "11111111-1111-4111-8111-111111111111",
  stale: "22222222-2222-4222-8222-222222222222",
  recommend: "33333333-3333-4333-8333-333333333333",
  prepare: "44444444-4444-4444-8444-444444444444",
  ratify: "55555555-5555-4555-8555-555555555555",
  replay: "66666666-6666-4666-8666-666666666666",
  invalid: "77777777-7777-4777-8777-777777777777",
  conflict: "88888888-8888-4888-8888-888888888888",
};

const browserPageSessionId = "99999999-9999-4999-8999-999999999999";

type Sessions = ReturnType<LocalRatiflowService["issueDemoSessions"]>;

function browserContext(
  agentSessionToken: string,
  pageSessionId = browserPageSessionId,
): AgentRegistryExecutionContext {
  return {
    caller: "BROWSER_AGENT",
    pageSessionId,
    agentSessionToken,
  };
}

function envelope<T>(expectedWorkspaceRevision: number, contextEpoch: number, requestId: string, rationale: string, payload: T) {
  return { expectedWorkspaceRevision, contextEpoch, requestId, rationale, payload };
}

async function heroRun() {
  const service = new LocalRatiflowService();
  const sessions = service.issueDemoSessions();
  const executionContext = browserContext(sessions.agentSessionToken);
  await service.catchUpAgentSession(executionContext, {});
  const initial = await service.inspect(sessions.mayaSessionToken);
  const selection: PageSelection = { kind: "OPTION", id: "opt_csv_ga_oct15" };
  const capacity = await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
    expectedWorkspaceRevision: 7,
    requestId: ids.capacity,
    payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
  });
  const stale = await service.mutateFromWebMCP({
    executionContext,
    toolName: "add_evidence",
    capturedSelection: selection,
    capturedContextEpoch: 2,
    envelope: envelope(7, 2, ids.stale, "Confirm the original estimate.", {
      optionId: "opt_csv_ga_oct15",
      kind: "ENGINEERING_ESTIMATE",
      stance: "CONTEXT",
      title: "Original estimate",
      detail: "The original estimate remains recorded.",
      sourceLabel: "Agent review",
    }),
  });
  const afterStale = await service.inspect(sessions.mayaSessionToken);
  const recommended = await service.mutateFromWebMCP({
    executionContext,
    toolName: "recommend_option",
    capturedSelection: selection,
    capturedContextEpoch: 2,
    envelope: envelope(8, 2, ids.recommend, "O2 fits the reduced launch capacity.", { optionId: "opt_csv_beta_oct15" }),
  });
  const prepared = await service.mutateFromWebMCP({
    executionContext,
    toolName: "prepare_decision",
    capturedSelection: { kind: "OPTION", id: "opt_csv_beta_oct15" },
    capturedContextEpoch: 3,
    envelope: envelope(9, 3, ids.prepare, "Prepare the feasible beta scope for Maya.", {
      optionId: "opt_csv_beta_oct15",
      recommendation: "Invite-only Northstar beta on Oct 15, then GA Nov 1.",
      risks: ["GA readiness remains after beta."],
      customerMessageDraft: "Northstar will receive an invite-only beta on Oct 15 and GA on Nov 1.",
    }),
  });
  const ratified = await service.ratifyFromHumanUi(sessions.mayaSessionToken, {
    expectedWorkspaceRevision: 10,
    requestId: ids.ratify,
    recommendation: "Invite-only Northstar beta on Oct 15, then GA Nov 1.",
    customerMessage: "Northstar will receive an invite-only beta on Oct 15 and GA on Nov 1.",
  });
  return { service, sessions, initial, capacity, stale, afterStale, recommended, prepared, ratified };
}

function compiled(workspace: WorkspaceView, selection: PageSelection, contextEpoch: number, memberRole: MemberRole = "PRODUCT_LEAD"): CompiledCapabilities {
  return compileCapabilities({
    state: workspace.decision.state,
    selection,
    memberRole,
    workspaceRevision: workspace.revision,
    contextEpoch,
    readiness: workspace.readiness,
  });
}

class EvalModelContext implements WebMCPModelContextLike {
  readonly calls: Array<{ tool: WebMCPToolLike; signal?: AbortSignal }> = [];
  registerTool(tool: WebMCPToolLike, options?: { signal?: AbortSignal }): void {
    this.calls.push({ tool, signal: options?.signal });
  }
}

function productionBridge(service: RatiflowServicePort, sessions: Sessions, workspace: WorkspaceView, selection: PageSelection, epoch: number) {
  const latest: MutableWebMCPRuntimeRef = {
    current: {
      workspace,
      compiled: compiled(workspace, selection, epoch),
      memberRole: "PRODUCT_LEAD",
      memberSessionInstanceId: browserPageSessionId,
      sessionToken: sessions.agentSessionToken,
      pageSessionId: browserPageSessionId,
    },
  };
  const dependencies: WebMCPRuntimeDependencies = { latest, service };
  const context = new EvalModelContext();
  const manager = new WebMCPRegistrationManager(context, dependencies);
  return { latest, dependencies, context, manager };
}

function expectResultEnvelope(result: unknown): void {
  expect(result).toEqual(expect.objectContaining({
    currentWorkspaceRevision: expect.any(Number),
    contextEpoch: expect.any(Number),
    currentCapabilities: expect.objectContaining({
      state: expect.any(String),
      workspaceRevision: expect.any(Number),
      contextEpoch: expect.any(Number),
      selection: expect.objectContaining({ kind: expect.any(String), id: expect.any(String) }),
      availableTools: expect.any(Array),
      unavailableActions: expect.any(Array),
    }),
  }));
}

describe("Layer A production implementation integration", () => {
  it("D01: local launch returns the frozen rev-7 fixture and independent facts", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const view = await service.inspect(sessions.mayaSessionToken);
    const expected = hero.workspace;
    expect({
      id: view.id,
      name: view.name,
      decisionId: view.decision.id,
      revision: view.revision,
      state: view.decision.state,
      selectedOptionId: view.decision.selectedOptionId,
      launchDate: view.decision.launchDate,
      launchCapacityEngineerDays: view.decision.launchCapacityEngineerDays,
      coreReliabilityEngineerDays: view.decision.coreReliabilityEngineerDays,
      customerId: view.customer.id,
      customerName: view.customer.name,
      annualRenewalUsd: view.customer.annualRenewalUsd,
      usableExportDueDate: view.customer.usableExportDueDate,
      followupId: view.followup.id,
      followupStatus: view.followup.status,
      readiness: view.readiness,
    }).toEqual(expected);
    expect(view.options.map(({ id, title, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays }) => ({ id, title, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays }))).toEqual(
      hero.options.map(({ id, title, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays }) => ({ id, title, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays })),
    );
    expect(view.evidence.map((evidence) => evidence.id)).toEqual(hero.evidenceIds);
    expect(view.provenance).toEqual([]);
    expect(fixtureWorkspace.options.map(({ id, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays }) => ({ id, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays }))).toEqual(
      hero.options.map(({ id, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays }) => ({ id, summary, launchDate, exportEngineerDays, totalEngineerDays, postLaunchEngineerDays })),
    );
  });

  it("D03/D11: one production compiler value drives registration and exact why_not predicates", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const executionContext = browserContext(sessions.agentSessionToken);
    await service.catchUpAgentSession(executionContext, {});
    const initial = await service.inspect(sessions.mayaSessionToken);
    const state = productionBridge(service, sessions, initial, { kind: "DECISION", id: initial.decision.id }, 1);
    const snapshot = state.latest.current.compiled;
    const diff = await state.manager.reconcile(snapshot, makeRegistrationContextKey("protocol-eval-tab", 1));
    expect(state.manager.registeredTools).toEqual(snapshot.availableTools);
    expect(diff.added).toEqual(snapshot.availableTools);
    expect(state.context.calls.map(({ tool }) => tool.name)).toEqual(snapshot.availableTools);
    expect(snapshot.signature).toBe(compileCapabilities({
      state: initial.decision.state,
      selection: snapshot.selection,
      memberRole: "PRODUCT_LEAD",
      workspaceRevision: initial.revision,
      contextEpoch: 1,
      readiness: initial.readiness,
    }).signature);

    await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.capacity,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    const contested = await service.inspect(sessions.mayaSessionToken);
    state.latest.current = { ...state.latest.current, workspace: contested, compiled: compiled(contested, snapshot.selection, 1) };
    const whyNot = await createToolCallback("why_not", {
      contextEpoch: 1,
      selection: snapshot.selection,
      memberSessionInstanceId: browserPageSessionId,
      sessionToken: sessions.agentSessionToken,
      workspaceId: initial.id,
      decisionId: initial.decision.id,
    }, state.dependencies)({ action: "prepare_decision" });
    expect(whyNot).toMatchObject({ ok: true, data: {
      available: false,
      unmetPredicates: ["selected option requires 18 engineer-days but launch capacity is 14"],
    }});
  });

  it("D02: production compiler and catalog preserve every independent state/selection golden", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const initial = await service.inspect(sessions.mayaSessionToken);
    for (const candidate of matrix.cases) {
      const snapshot = compileCapabilities({
        state: candidate.state,
        selection: candidate.selection,
        memberRole: "PRODUCT_LEAD",
        workspaceRevision: initial.revision,
        contextEpoch: 1,
        readiness: initial.readiness,
      });
      expect(snapshot.availableTools, candidate.id).toEqual(candidate.availableTools);
      expect(snapshot.availableTools.map((name) => getWebMCPToolDefinition(name).name), candidate.id).toEqual(candidate.availableTools);
    }
  });

  it("D04/D05/D07/D10/D14/D16: production services replay the hero, stale diff, provenance, and final outputs", async () => {
    const run = await heroRun();
    expect(run.capacity).toMatchObject({ ok: true, data: { eventId: "evt_0008_capacity_reduced", resultingRevision: 8 } });
    expectResultEnvelope(run.capacity);
    expectResultEnvelope(run.stale);
    expectResultEnvelope(run.recommended);
    expectResultEnvelope(run.prepared);
    expectResultEnvelope(run.ratified);
    expect(run.stale).toMatchObject(staleGolden);
    const staleResult = run.stale as Extract<typeof run.stale, { ok: false }>;
    expect(staleResult.changes).toEqual(staleGolden.changes);
    expect(staleResult.currentCapabilities).toEqual(staleGolden.currentCapabilities);
    expect(staleResult.nextAction).toBe(staleGolden.nextAction);
    expect(run.afterStale.revision).toBe(8);
    expect(run.afterStale.evidence.map(({ id }) => id)).toEqual(run.initial.evidence.map(({ id }) => id));
    expect(run.afterStale.decision.selectedOptionId).toBe(run.initial.decision.selectedOptionId);

    expect(run.recommended).toMatchObject({ ok: true, data: { resultingRevision: 9, workspace: { decision: { state: "READY", selectedOptionId: "opt_csv_beta_oct15" } } } });
    expect(run.prepared).toMatchObject({ ok: true, data: { resultingRevision: 10, workspace: { decision: { state: "REVIEW" } } } });
    expect(run.ratified).toMatchObject({ ok: true, data: { resultingRevision: 11, workspace: { decision: { state: "COMMITTED" }, followup: { status: "READY", ownerId: hero.followup.ownerId, dueDate: hero.followup.dueDate } } } });
    const final = await run.service.inspect(run.sessions.mayaSessionToken);
    expect({ revision: final.revision, state: final.decision.state, selectedOptionId: final.decision.selectedOptionId, followup: final.followup }).toMatchObject(continuity.finalState);
    expect(final.followup.inheritedContext).toEqual(hero.followup.inheritedContext);

    const finalBridge = productionBridge(run.service, run.sessions, final, { kind: "FOLLOWUP", id: final.followup.id }, 4);
    await finalBridge.manager.reconcile(finalBridge.latest.current.compiled, makeRegistrationContextKey("protocol-eval-tab", 4));
    const inspectResult = await finalBridge.manager.getRegisteredCallback("inspect_decision")?.({});
    const traceResult = await finalBridge.manager.getRegisteredCallback("trace_decision")?.({});
    const followupResult = await finalBridge.manager.getRegisteredCallback("inspect_followup")?.({});
    expectResultEnvelope(inspectResult);
    expectResultEnvelope(traceResult);
    expectResultEnvelope(followupResult);
    expect(inspectResult).toMatchObject({ ok: true, data: { workspace: { revision: continuity.finalState.revision, decision: { state: continuity.finalState.state, selectedOptionId: continuity.finalState.selectedOptionId }, customer: { usableExportDueDate: "2026-11-01" } } } });
    expect(traceResult).toMatchObject({ ok: true, data: { events: expect.arrayContaining([expect.objectContaining({ actor: hero.actors.maya, resultingRevision: 11, origin: "ORDINARY_UI", reviewStatus: "RATIFIED" })]) } });
    expect(followupResult).toMatchObject({ ok: true, data: { followup: continuity.finalState.followup } });

    expect(final.provenance.map(({ actor, actorType, origin, toolName, baseRevision, resultingRevision, reviewStatus }) => ({ actor: { id: actor.id, name: actor.name, role: actor.role }, actorType, origin, toolName, baseRevision, resultingRevision, reviewStatus }))).toEqual([
      { actor: { id: hero.actors.jordan.id, name: hero.actors.jordan.name, role: hero.actors.jordan.role }, actorType: "HUMAN", origin: "ORDINARY_UI", toolName: undefined, baseRevision: 7, resultingRevision: 8, reviewStatus: "NOT_APPLICABLE" },
      { actor: { id: hero.actors.agent.id, name: hero.actors.agent.name, role: hero.actors.agent.role }, actorType: "AGENT", origin: "WEBMCP", toolName: "recommend_option", baseRevision: 8, resultingRevision: 9, reviewStatus: "NOT_APPLICABLE" },
      { actor: { id: hero.actors.agent.id, name: hero.actors.agent.name, role: hero.actors.agent.role }, actorType: "AGENT", origin: "WEBMCP", toolName: "prepare_decision", baseRevision: 9, resultingRevision: 10, reviewStatus: "PROPOSED" },
      { actor: { id: hero.actors.maya.id, name: hero.actors.maya.name, role: hero.actors.maya.role }, actorType: "HUMAN", origin: "ORDINARY_UI", toolName: undefined, baseRevision: 10, resultingRevision: 11, reviewStatus: "RATIFIED" },
    ]);
    expect(final.provenance.map((event) => event.changedEntities)).toEqual([
      ["dec_csv_oct15"],
      ["dec_csv_oct15", "opt_csv_beta_oct15"],
      ["pd_10", "dec_csv_oct15", "opt_csv_beta_oct15"],
      ["dec_csv_oct15", "pd_10", "fu_customer_launch_brief"],
    ]);
  });

  it("D06/D08/D09: callback context and server authority deny stale, forged, wrong-member, and agent ratification writes", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const executionContext = browserContext(sessions.agentSessionToken);
    await service.catchUpAgentSession(executionContext, {});
    const initial = await service.inspect(sessions.mayaSessionToken);
    const first = productionBridge(service, sessions, initial, { kind: "OPTION", id: "opt_csv_ga_oct15" }, 2);
    await first.manager.reconcile(first.latest.current.compiled, makeRegistrationContextKey("protocol-eval-tab", 2));
    const oldCallback = first.manager.getRegisteredCallback("recommend_option");
    const changedSelection = { kind: "OPTION", id: "opt_csv_beta_oct15" } as const;
    first.latest.current = { ...first.latest.current, compiled: compiled(initial, changedSelection, 3) };
    await first.manager.reconcile(first.latest.current.compiled, makeRegistrationContextKey("protocol-eval-tab", 3));
    const stalePage = await oldCallback?.(envelope(7, 2, ids.recommend, "stale selection", { optionId: "opt_csv_beta_oct15" }));
    expectResultEnvelope(stalePage);
    expect(stalePage).toMatchObject({ ok: false, code: "STALE_PAGE_CONTEXT", currentWorkspaceRevision: 7 });
    expect(vectors.find((vector) => vector.id === "captured-selection-mismatch")).toMatchObject({ expectedCode: "STALE_PAGE_CONTEXT", mutationAccepted: false });
    expect((await service.inspect(sessions.mayaSessionToken)).revision).toBe(7);

    const wrongEpoch = await service.mutateFromWebMCP({
      executionContext,
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: envelope(7, 1, ids.invalid, "wrong page epoch", { optionId: "opt_csv_beta_oct15" }),
    });
    expectResultEnvelope(wrongEpoch);
    expect(wrongEpoch).toMatchObject({ ok: false, code: "STALE_PAGE_CONTEXT", currentWorkspaceRevision: 7 });

    const invalidRatification = await service.ratifyFromHumanUi("invalid-session", {
      expectedWorkspaceRevision: 7,
      requestId: ids.ratify,
      recommendation: "invalid",
      customerMessage: "invalid",
    });
    expectResultEnvelope(invalidRatification);
    expect(invalidRatification).toMatchObject({ ok: false, code: "UNAUTHORIZED", currentWorkspaceRevision: 7 });

    const otherService = new LocalRatiflowService();
    const otherSessions = otherService.issueDemoSessions();
    const crossWorkspace = await service.mutateFromWebMCP({
      executionContext: browserContext(otherSessions.agentSessionToken),
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: envelope(7, 2, ids.conflict, "cross-workspace attempt", { optionId: "opt_csv_beta_oct15" }),
    });
    expectResultEnvelope(crossWorkspace);
    expect(crossWorkspace).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    const forged = await service.mutateFromWebMCP({
      executionContext: browserContext("forged-session"),
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: envelope(7, 2, ids.invalid, "forged actor", { optionId: "opt_csv_beta_oct15" }),
    });
    expectResultEnvelope(forged);
    expect(forged).toMatchObject({ ok: false, code: "UNAUTHORIZED", currentWorkspaceRevision: 7 });

    const capacity = await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.capacity,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    expect(capacity).toMatchObject({ ok: true, data: { resultingRevision: 8 } });
    const unavailable = await service.mutateFromWebMCP({
      executionContext,
      toolName: "prepare_decision",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: envelope(8, 2, ids.conflict, "prepare impossible O1", { optionId: "opt_csv_ga_oct15", recommendation: "No", risks: [], customerMessageDraft: "No" }),
    });
    expectResultEnvelope(unavailable);
    expect(unavailable).toMatchObject({ ok: false, code: "NOT_AVAILABLE_IN_STATE", currentWorkspaceRevision: 8 });

    const prepared = await service.mutateFromWebMCP({
      executionContext,
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: envelope(8, 2, ids.recommend, "O2 fits reduced capacity", { optionId: "opt_csv_beta_oct15" }),
    });
    expectResultEnvelope(prepared);
    expect(prepared).toMatchObject({ ok: true, data: { resultingRevision: 9 } });
    const review = await service.mutateFromWebMCP({
      executionContext,
      toolName: "prepare_decision",
      capturedSelection: { kind: "OPTION", id: "opt_csv_beta_oct15" },
      capturedContextEpoch: 3,
      envelope: envelope(9, 3, ids.prepare, "prepare O2", { optionId: "opt_csv_beta_oct15", recommendation: "O2", risks: [], customerMessageDraft: "O2" }),
    });
    expectResultEnvelope(review);
    expect(review).toMatchObject({ ok: true, data: { resultingRevision: 10 } });
    const agentRatification = await service.ratifyFromHumanUi(sessions.agentSessionToken, { expectedWorkspaceRevision: 10, requestId: ids.ratify, recommendation: "agent", customerMessage: "agent" });
    const jordanRatification = await service.ratifyFromHumanUi(sessions.jordanSessionToken, { expectedWorkspaceRevision: 10, requestId: ids.ratify, recommendation: "Jordan", customerMessage: "Jordan" });
    expectResultEnvelope(agentRatification);
    expectResultEnvelope(jordanRatification);
    expect(agentRatification).toMatchObject({ ok: false, code: "UNAUTHORIZED", currentWorkspaceRevision: 10 });
    expect(jordanRatification).toMatchObject({ ok: false, code: "UNAUTHORIZED", currentWorkspaceRevision: 10 });
    expect((await service.inspect(sessions.mayaSessionToken)).revision).toBe(10);
  });

  it("D07/D12/D13/D15: idempotency, schema/date bounds, result family, and notice-only realtime are production-backed", async () => {
    const service = new LocalRatiflowService();
    const sessions = service.issueDemoSessions();
    const schemaPageSessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await service.catchUpAgentSession(
      browserContext(sessions.agentSessionToken, schemaPageSessionId),
      {},
    );
    const initial = await service.inspect(sessions.mayaSessionToken);
    const notices: unknown[] = [];
    const unsubscribe = service.subscribe(sessions.mayaSessionToken, (notice) => notices.push(notice));
    service.subscribe("not-a-member", (notice) => notices.push(notice));
    const first = await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.replay,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    expectResultEnvelope(first);
    const replay = await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
      expectedWorkspaceRevision: 7,
      requestId: ids.replay,
      payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
    });
    expectResultEnvelope(replay);
    expect(replay).toEqual(first);
    const mismatch = await service.setLaunchCapacityFromCollaboratorUi(sessions.jordanSessionToken, {
      expectedWorkspaceRevision: 8,
      requestId: ids.replay,
      payload: { launchCapacityEngineerDays: 13, reason: "Changed content" },
    });
    expectResultEnvelope(mismatch);
    expect(mismatch).toMatchObject({ ok: false, code: "REQUEST_REPLAY_MISMATCH", currentWorkspaceRevision: 8 });
    expect(notices).toEqual([
      expect.objectContaining({
        activityCursor: expect.any(String),
        workspaceRevision: 8,
        eventId: expect.any(String),
      }),
    ]);
    expect(Object.keys(notices[0] as object).sort()).toEqual([
      "activityCursor",
      "eventId",
      "workspaceRevision",
    ]);
    const refetched = await service.inspect(sessions.mayaSessionToken);
    expect(refetched.revision).toBe((notices[0] as { workspaceRevision: number }).workspaceRevision);
    unsubscribe();

    const addSchema = getWebMCPToolDefinition("add_evidence").inputSchema;
    expect(addSchema).toBeDefined();
    const callback = createToolCallback("add_evidence", {
      contextEpoch: 1,
      selection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      memberSessionInstanceId: schemaPageSessionId,
      sessionToken: sessions.agentSessionToken,
      workspaceId: initial.id,
      decisionId: initial.decision.id,
    }, { latest: { current: { workspace: initial, compiled: compiled(initial, { kind: "OPTION", id: "opt_csv_ga_oct15" }, 1), memberRole: "PRODUCT_LEAD", memberSessionInstanceId: schemaPageSessionId, sessionToken: sessions.agentSessionToken, pageSessionId: schemaPageSessionId } }, service });
    const valid = envelope(7, 1, ids.invalid, "Bounded evidence", { optionId: "opt_csv_ga_oct15", kind: "CUSTOMER_DEADLINE", stance: "CONTEXT", title: "Deadline", detail: "Valid evidence", sourceLabel: "Eval", metrics: { date: "2026-11-01" } });
    expect(await callback(valid)).toMatchObject({ ok: false, code: "STALE_WORK_STATE" });
    const invalidInputs = [
      { ...valid, extra: true },
      { ...valid, payload: { ...(valid.payload as object), kind: "NOPE" } },
      { ...valid, payload: { ...(valid.payload as object), metrics: { date: "2026-02-30" } } },
      { ...valid, requestId: "bad" },
      { ...valid, rationale: "x".repeat(601) },
      { ...valid, payload: { ...(valid.payload as object), metrics: { engineerDays: -1 } } },
    ];
    for (const input of invalidInputs) {
      const invalidResult = await callback(input);
      expectResultEnvelope(invalidResult);
      expect(invalidResult).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    const compareSchema = getWebMCPToolDefinition("compare_options").inputSchema;
    const oversized = { optionIds: ["opt_csv_ga_oct15", "opt_csv_beta_oct15", "opt_csv_defer_nov1", "extra-option"] };
    expect(validateToolInput(compareSchema ?? {}, oversized)).toMatchObject({ ok: false });
    expect(schemaVectors.filter((vector) => !vector.valid).map((vector) => vector.reason)).toEqual(["additionalProperties", "enum", "date-format", "uuid", "maxLength", "maxItems", "minimum"]);
    expect(resultVectors.map((vector) => vector.code)).toEqual(["INVALID_INPUT", "UNAUTHORIZED", "NOT_AVAILABLE_IN_STATE", "STALE_PAGE_CONTEXT", "STALE_WORK_STATE", "REQUEST_REPLAY_MISMATCH", "CONFLICT"]);
    for (const result of [first, replay, mismatch]) expectResultEnvelope(result);
    expect(initial.revision).toBe(7);

    const conflictService = new LocalRatiflowService();
    const conflictSessions = conflictService.issueDemoSessions();
    const conflictExecutionContext = browserContext(conflictSessions.agentSessionToken);
    await conflictService.catchUpAgentSession(conflictExecutionContext, {});
    const conflict = await conflictService.mutateFromWebMCP({
      executionContext: conflictExecutionContext,
      toolName: "prepare_decision",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 2,
      envelope: envelope(7, 2, ids.conflict, "Prepare a different option", { optionId: "opt_csv_beta_oct15", recommendation: "Different option", risks: [], customerMessageDraft: "Different option" }),
    });
    expectResultEnvelope(conflict);
    expect(conflict).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});
