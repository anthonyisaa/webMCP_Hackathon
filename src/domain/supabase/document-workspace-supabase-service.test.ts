import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LocalDocumentWorkspaceService } from "../document-workspace-service";
import {
  SupabaseDocumentWorkspaceService,
  isDocumentWorkspaceSurface,
  normalizeDocumentV3Result,
} from "./document-workspace-supabase-service";

async function fixtures() {
  const local = new LocalDocumentWorkspaceService();
  const launched = await local.launchV3({ displayName: "Jordan" });
  if (!launched.ok) throw new Error("fixture launch failed");
  const joined = await local.joinV3({ shareToken: launched.data.shareToken, displayName: "Maya" });
  if (!joined.ok) throw new Error("fixture join failed");
  const saved = await local.saveHuman(launched.data.humanSessionToken, {
    expectedRevision: 0,
    requestId: randomUUID(),
    title: "Memo",
    body: "Alpha beta",
  });
  if (!saved.ok) throw new Error("fixture save failed");
  const created = await local.createWorkOrder(launched.data.humanSessionToken, {
    expectedRevision: 1,
    requestId: randomUUID(),
    source: "CONTEXT_MENU",
    intent: "REWRITE",
    instruction: "Rewrite Alpha clearly.",
    assignedToMemberId: joined.data.selfMemberId,
    targetField: "BODY",
    rangeStart: 0,
    rangeEnd: 5,
  });
  if (!created.ok) throw new Error("fixture work failed");
  const pending = created.data.workOrders.find((order) => order.status === "PENDING");
  if (!pending) throw new Error("fixture pending work missing");
  const proposed = await local.submitWorkProposal(joined.data.agentSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: "Omega",
    changeSummary: "Use Omega.",
  }, randomUUID());
  if (!proposed.ok) throw new Error("fixture proposal failed");
  const decided = await local.acceptWorkProposal(launched.data.humanSessionToken, {
    workOrderId: pending.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    rationale: null,
  });
  if (!decided.ok) throw new Error("fixture decision failed");
  return {
    bundle: launched.data,
    surface: created.data,
    pending,
    proposal: proposed.data,
    decidedSurface: decided.data,
    list: {
      workOrders: [pending],
      revision: 1,
      activityVersion: 2,
    },
    memory: {
      events: created.data.memory,
      hasMoreOlder: false,
      nextBeforeActivityVersion: null,
      latestActivityVersion: 2,
      revision: 1,
    },
  };
}

describe("SupabaseDocumentWorkspaceService normalization", () => {
  it("accepts exact v3 surfaces and rejects shape or protocol drift", async () => {
    const fixture = await fixtures();
    expect(isDocumentWorkspaceSurface(fixture.surface)).toBe(true);
    expect(isDocumentWorkspaceSurface(fixture.decidedSurface)).toBe(true);
    const completed = fixture.decidedSurface.workOrders.find((order) => order.status === "COMPLETED");
    expect(completed?.decision.rationale).toBeNull();
    expect(isDocumentWorkspaceSurface({ ...fixture.surface, secret: "no" })).toBe(false);
    expect(isDocumentWorkspaceSurface({
      ...fixture.surface,
      document: { ...fixture.surface.document, protocolVersion: 2 },
    })).toBe(false);
    expect(() => normalizeDocumentV3Result(
      { ok: true, data: { ...fixture.surface, secret: "no" } },
      isDocumentWorkspaceSurface,
    )).toThrow("invalid protocol-v3");
  });

  it("accepts exact stale failures and rejects incomplete envelopes", async () => {
    const fixture = await fixtures();
    expect(normalizeDocumentV3Result({
      ok: false,
      code: "STALE_WORK_STATE",
      message: "stale",
      retryable: true,
      expectedRevision: 0,
      currentRevision: 1,
      currentActivityVersion: 2,
      currentDocument: fixture.surface.document,
      nextAction: "Re-inspect the document and work, then retry against the current revision.",
    }, isDocumentWorkspaceSurface)).toMatchObject({ code: "STALE_WORK_STATE" });
    expect(() => normalizeDocumentV3Result({
      ok: false,
      code: "STALE_WORK_STATE",
      message: "stale",
      retryable: true,
    }, isDocumentWorkspaceSurface)).toThrow("invalid protocol-v3");
  });
});

describe("SupabaseDocumentWorkspaceService RPC adapter", () => {
  it("maps only the 13 frozen RPCs and keeps service-role reset isolated", async () => {
    const fixture = await fixtures();
    const requests: Array<{ name: string; body: unknown; headers: HeadersInit | undefined }> = [];
    const service = new SupabaseDocumentWorkspaceService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      serviceRoleKey: "service-secret",
      fetch: async (url, init) => {
        const name = String(url).split("/").at(-1) ?? "";
        requests.push({
          name,
          body: JSON.parse(String(init?.body ?? "{}")),
          headers: init?.headers,
        });
        const data = name === "ratiflow_launch_document_v3" || name === "ratiflow_join_document_v3"
          ? fixture.bundle
          : name === "ratiflow_list_agent_work_v3"
            ? fixture.list
            : name === "ratiflow_read_document_memory_v3"
              ? fixture.memory
              : name === "ratiflow_submit_document_proposal_v3"
                ? fixture.proposal
                : name === "ratiflow_reset_document_hero_v3"
                  ? {
                      shareToken: "a".repeat(64),
                      mayaBootstrapPath: `/document/${"a".repeat(64)}#ratiflow-bootstrap=abc`,
                      jordanBootstrapPath: `/document/${"a".repeat(64)}#ratiflow-bootstrap=def`,
                      expiresAt: "2026-09-02T00:00:00.000Z",
                      revision: 1,
                      activityVersion: 1,
                    }
                  : fixture.surface;
        return Response.json({ ok: true, data });
      },
    });
    const human = "h".repeat(64);
    const agent = "a".repeat(64);
    const page = randomUUID();
    const workOrderId = fixture.pending.workOrderId;
    await service.launchV3({ displayName: "Jordan" });
    await service.joinV3({ shareToken: "a".repeat(64), displayName: "Maya" });
    await service.inspect(human);
    await service.saveHuman(human, {
      expectedRevision: 1, requestId: randomUUID(), title: "Memo", body: "Alpha beta",
    });
    await service.touchPresence(human, {
      state: "VIEWING", field: null, isTyping: false,
      selectionStart: null, selectionEnd: null, observedRevision: 1,
    });
    await service.createWorkOrder(human, {
      expectedRevision: 1, requestId: randomUUID(), source: "CONTEXT_MENU",
      intent: "REWRITE", instruction: "Rewrite Alpha clearly.",
      assignedToMemberId: fixture.pending.assignedToMemberId,
      targetField: "BODY", rangeStart: 0, rangeEnd: 5,
    });
    await service.cancelWorkOrder(human, { workOrderId, requestId: randomUUID() });
    await service.acceptWorkProposal(human, {
      workOrderId, expectedRevision: 1, requestId: randomUUID(), rationale: null,
    });
    await service.rejectWorkProposal(human, {
      workOrderId, expectedRevision: 1, requestId: randomUUID(), rationale: "Reject.",
    });
    await service.readMemory(agent, { limit: 20 });
    await service.listMyWork(agent, page);
    await service.submitWorkProposal(agent, {
      workOrderId, expectedRevision: 1, requestId: randomUUID(),
      replacementText: "Omega", changeSummary: "Use Omega.",
    }, page);
    await service.resetHeroForEvaluation();

    expect(requests.map(({ name }) => name)).toEqual([
      "ratiflow_launch_document_v3",
      "ratiflow_join_document_v3",
      "ratiflow_inspect_document_v3",
      "ratiflow_save_document_v3",
      "ratiflow_touch_document_presence_v3",
      "ratiflow_create_document_work_v3",
      "ratiflow_cancel_document_work_v3",
      "ratiflow_accept_document_proposal_v3",
      "ratiflow_reject_document_proposal_v3",
      "ratiflow_read_document_memory_v3",
      "ratiflow_list_agent_work_v3",
      "ratiflow_submit_document_proposal_v3",
      "ratiflow_reset_document_hero_v3",
    ]);
    expect(requests.slice(0, -1).every(({ headers }) =>
      JSON.stringify(headers).includes("sb_publishable"))).toBe(true);
    expect(JSON.stringify(requests.at(-1)?.headers)).toContain("service-secret");
    expect(JSON.stringify(requests)).not.toContain("pageSessionId");
    expect(JSON.stringify(requests)).not.toContain("actorType");
    expect(JSON.stringify(requests)).not.toContain("origin");
    expect(requests.find(({ name }) => name === "ratiflow_accept_document_proposal_v3")?.body)
      .toMatchObject({ p_input: { rationale: null } });
  });

  it("validates page UUIDs locally and never invents a wait RPC", async () => {
    let calls = 0;
    const service = new SupabaseDocumentWorkspaceService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async () => {
        calls += 1;
        return Response.json({});
      },
    });
    await expect(service.listMyWork("a".repeat(64), "bad-page")).resolves.toMatchObject({
      ok: false, code: "INVALID_INPUT",
    });
    await expect(service.waitForMyWork("a".repeat(64), {
      afterActivityVersion: 0, afterRevision: 0,
    }, randomUUID())).resolves.toMatchObject({
      ok: false, code: "PROTOCOL_MISMATCH",
    });
    await expect(service.submitWorkProposal("a".repeat(64), {
      workOrderId: randomUUID(), expectedRevision: 0, requestId: randomUUID(),
      replacementText: "x", changeSummary: "x",
    }, "bad-page")).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(service.resetHeroForEvaluation()).resolves.toMatchObject({
      ok: false, code: "UNAUTHORIZED",
    });
    expect(calls).toBe(0);
  });

  it("does not normalize HTTP failures into typed success", async () => {
    const service = new SupabaseDocumentWorkspaceService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async () => Response.json({ message: "down" }, { status: 503 }),
    });
    await expect(service.inspect("h".repeat(64))).rejects.toThrow("failed (503)");
  });
});
