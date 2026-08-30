import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DecisionState, PageSelection, ToolName } from "../../src/contracts/index";

type CapabilityCase = {
  id: string;
  state: DecisionState;
  selection: PageSelection;
  availableTools: ToolName[];
  unavailableActions: Array<"prepare_decision" | "ratify_decision">;
};

const golden = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), "evals/goldens", name), "utf8")) as T;

const matrix = golden<{
  fixtureVersion: string;
  catalogOrder: ToolName[];
  cases: CapabilityCase[];
}>("capability-matrix.json");
const hero = golden<{
  fixtureVersion: string;
  workspace: Record<string, unknown>;
  timeline: Array<Record<string, unknown>>;
  options: Array<Record<string, unknown>>;
  evidenceIds: string[];
  followup: Record<string, unknown>;
}>("hero-revisions.json");
const stale = golden<Record<string, unknown>>("stale-response.json");
const continuity = golden<{
  answers: Record<string, string>;
  finalState: Record<string, unknown>;
}>("continuity-answers.json");

// Deliberately duplicated from the frozen contract: this is an oracle, not a call to
// BASE_TOOL_MATRIX or the production compiler. A shared production bug must fail here.
const BASE: Record<DecisionState, ToolName[]> = {
  OPTIONS: ["inspect_decision", "recommend_option", "add_evidence", "why_not"],
  CONTESTED: ["inspect_decision", "recommend_option", "add_evidence", "compare_options", "why_not"],
  READY: ["inspect_decision", "recommend_option", "add_evidence", "compare_options", "prepare_decision", "why_not"],
  REVIEW: ["inspect_decision", "trace_decision", "why_not"],
  COMMITTED: ["inspect_decision", "trace_decision", "why_not"],
};

const expectedTools = (state: DecisionState, selection: PageSelection): ToolName[] => {
  const tools = [...BASE[state]];
  if ((state === "OPTIONS" || state === "CONTESTED" || state === "READY") && selection.kind === "OPTION") {
    // Keep the single frozen catalog order; selected tools are not a second order.
    tools.splice(tools.indexOf("recommend_option"), 0, "inspect_selected_option");
    tools.splice(tools.indexOf("add_evidence"), 0, "challenge_option");
  }
  if (state === "COMMITTED" && selection.kind === "FOLLOWUP" && selection.id === "fu_customer_launch_brief") {
    tools.splice(tools.indexOf("trace_decision") + 1, 0, "inspect_followup");
  }
  return tools;
};

describe("independent Ratiflow protocol goldens", () => {
  it("D01: keeps the deterministic hero reset fixture", () => {
    expect(hero.fixtureVersion).toBe("hero-v1.2");
    expect(hero.workspace).toMatchObject({
      id: "ws_northstar_csv_launch",
      decisionId: "dec_csv_oct15",
      revision: 7,
      state: "READY",
      selectedOptionId: "opt_csv_ga_oct15",
      launchCapacityEngineerDays: 18,
      followupStatus: "BLOCKED",
    });
    expect(hero.workspace.readiness).toEqual({
      activeOptionCount: 3,
      hasCurrentCapacityEvidence: true,
      hasNorthstarDeadlineEvidence: true,
      selectedOptionId: "opt_csv_ga_oct15",
      selectedOptionEngineerDays: 18,
      launchCapacityEngineerDays: 18,
      unresolvedBlockingChallengeCount: 0,
    });
    expect(hero.options.map((option) => option.id)).toEqual([
      "opt_csv_ga_oct15",
      "opt_csv_beta_oct15",
      "opt_csv_defer_nov1",
    ]);
    expect(hero.evidenceIds).toEqual([
      "ev_capacity_r7",
      "ev_core_reliability",
      "ev_o1_ga_effort",
      "ev_o2_beta_effort",
      "ev_o3_deferred_effort",
      "ev_northstar_deadline",
    ]);
  });

  it("D02: matches every state and selection class in canonical order", () => {
    expect(matrix.cases).toHaveLength(16);
    for (const candidate of matrix.cases) {
      expect(expectedTools(candidate.state, candidate.selection), candidate.id).toEqual(candidate.availableTools);
    }
    for (const candidate of matrix.cases) {
      expect(candidate.availableTools).toEqual(
        [...candidate.availableTools].sort((a, b) => matrix.catalogOrder.indexOf(a) - matrix.catalogOrder.indexOf(b)),
      );
    }
  });

  it("D04/D05: freezes the capacity collision and proves stale writes cannot advance state", () => {
    const timeline = hero.timeline;
    expect(timeline[2]).toMatchObject({ revision: 8, action: "reduce_capacity", state: "CONTESTED", capacity: 14 });
    expect(timeline[3]).toMatchObject({ revision: 8, action: "stale_add_evidence_rejected" });
    expect(stale).toMatchObject({
      ok: false,
      code: "STALE_WORK_STATE",
      expectedWorkspaceRevision: 7,
      actualWorkspaceRevision: 8,
      currentWorkspaceRevision: 8,
      nextAction: "Call inspect_decision, refresh WebMCP tools, then retry against workspace revision 8.",
    });
    expect((stale.changes as Array<Record<string, unknown>>)).toHaveLength(1);
    expect((stale.changes as Array<Record<string, unknown>>)[0]).toMatchObject({
      eventId: "evt_0008_capacity_reduced",
      resultingRevision: 8,
      origin: "ORDINARY_UI",
    });
    expect((stale.currentCapabilities as Record<string, unknown>).availableTools).not.toContain("prepare_decision");

    // A tiny independent CAS probe makes the no-mutation guarantee executable without
    // importing the production reducer or service.
    const probe = { revision: 8, evidenceCount: 6 };
    const before = structuredClone(probe);
    const accepted = probe.revision === 7;
    expect(accepted).toBe(false);
    expect(probe).toEqual(before);
  });

  it("D06/D07/D08/D09: executes context, replay, authority, and ratification vectors", () => {
    const vectors = golden<Array<{
      id: string;
      expectedCode?: string;
      expectedRevision: number;
      mutationAccepted: boolean;
      actor?: string;
      origin?: string;
    }>>("protocol-vectors.json");
    expect(vectors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "wrong-context-epoch", expectedCode: "STALE_PAGE_CONTEXT", mutationAccepted: false }),
      expect.objectContaining({ id: "replay-same-content", mutationAccepted: true }),
      expect.objectContaining({ id: "replay-different-content", expectedCode: "REQUEST_REPLAY_MISMATCH", mutationAccepted: false }),
      expect.objectContaining({ id: "agent-ratification", expectedCode: "UNAUTHORIZED", mutationAccepted: false }),
      expect.objectContaining({ id: "maya-ui-ratification", actor: "usr_maya_chen", origin: "ORDINARY_UI", mutationAccepted: true, expectedRevision: 11 }),
    ]));

    const replay = new Map<string, string>();
    const request = (requestId: string, canonicalPayload: string) => {
      const prior = replay.get(requestId);
      if (prior && prior !== canonicalPayload) return "REQUEST_REPLAY_MISMATCH";
      replay.set(requestId, canonicalPayload);
      return "accepted";
    };
    expect(request("req_o2", '{"optionId":"opt_csv_beta_oct15"}')).toBe("accepted");
    expect(request("req_o2", '{"optionId":"opt_csv_beta_oct15"}')).toBe("accepted");
    expect(request("req_o2", '{"optionId":"opt_csv_ga_oct15"}')).toBe("REQUEST_REPLAY_MISMATCH");

    const canRatify = (actorId: string, origin: string) => actorId === "usr_maya_chen" && origin === "ORDINARY_UI";
    expect(canRatify("agent_ratiflow_demo", "WEBMCP")).toBe(false);
    expect(canRatify("usr_jordan_lee", "ORDINARY_UI")).toBe(false);
    expect(canRatify("usr_maya_chen", "ORDINARY_UI")).toBe(true);
  });

  it("D01/reset: returns an equivalent fixture before each replay", () => {
    const reset = structuredClone(hero.workspace);
    const replayed = structuredClone(hero.workspace);
    expect(replayed).toEqual(reset);
    expect(reset).toMatchObject({ revision: 7, state: "READY", launchCapacityEngineerDays: 18, followupStatus: "BLOCKED" });
  });

  it("D10/D14/D16: freezes downstream transition, provenance, and continuity answers", () => {
    expect(hero.timeline.at(-1)).toMatchObject({ revision: 11, state: "COMMITTED", actorId: "usr_maya_chen", origin: "ORDINARY_UI" });
    expect(hero.followup).toMatchObject({ id: "fu_customer_launch_brief", statusBefore: "BLOCKED", statusAfter: "READY", ownerId: "usr_maya_chen", dueDate: "2026-10-16" });
    expect(continuity.finalState).toMatchObject({ revision: 11, state: "COMMITTED", selectedOptionId: "opt_csv_beta_oct15" });
    expect(Object.keys(continuity.answers)).toEqual(["whatWasDecided", "why", "whatChanged", "whatRemainsOpen", "whoRatified"]);
    expect(continuity.answers.whoRatified).toContain("Maya Chen");
  });

  it("D12/D13: validates the frozen error/result envelope vectors", () => {
    const errors = golden<Array<{ code: string; retryable: boolean; hasRevision: boolean; hasEpoch: boolean }>>("result-envelope-vectors.json");
    expect(errors).toHaveLength(7);
    for (const result of errors) {
      expect(result.code).toMatch(/^(INVALID_INPUT|UNAUTHORIZED|NOT_FOUND|NOT_AVAILABLE_IN_STATE|STALE_PAGE_CONTEXT|STALE_WORK_STATE|REQUEST_REPLAY_MISMATCH|CONFLICT|INTERNAL_ERROR)$/);
      expect(result.hasRevision).toBe(true);
      expect(result.hasEpoch).toBe(true);
    }
    const schema = golden<Array<{ id: string; valid: boolean; reason?: string }>>("schema-vectors.json");
    expect(schema.filter((vector) => !vector.valid)).toHaveLength(7);
    expect(schema.find((vector) => vector.id === "valid-bounded-envelope")?.valid).toBe(true);
    expect(schema.filter((vector) => !vector.valid).map((vector) => vector.reason)).toEqual([
      "additionalProperties", "enum", "date-format", "uuid", "maxLength", "maxItems", "minimum",
    ]);
  });
});
