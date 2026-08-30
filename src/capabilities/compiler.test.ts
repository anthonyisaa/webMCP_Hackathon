import assert from "node:assert/strict";
import { test } from "vitest";

import type { CapabilityCompilerInput, DecisionState, PageSelection } from "../contracts/index";
import { compileCapabilities, getUnmetPredicates } from "./compiler";

const expectedBase = {
  OPTIONS: ["inspect_decision", "recommend_option", "add_evidence", "why_not"],
  CONTESTED: [
    "inspect_decision",
    "recommend_option",
    "add_evidence",
    "compare_options",
    "why_not",
  ],
  READY: [
    "inspect_decision",
    "recommend_option",
    "add_evidence",
    "compare_options",
    "prepare_decision",
    "why_not",
  ],
  REVIEW: ["inspect_decision", "trace_decision", "why_not"],
  COMMITTED: ["inspect_decision", "trace_decision", "why_not"],
} as const;

function input(
  state: DecisionState,
  selection: PageSelection = { kind: "DECISION", id: "dec_csv_oct15" },
): CapabilityCompilerInput {
  return {
    state,
    selection,
    memberRole: "PRODUCT_LEAD",
    workspaceRevision: 7,
    contextEpoch: 1,
    readiness: {
      activeOptionCount: 3,
      hasCurrentCapacityEvidence: true,
      hasNorthstarDeadlineEvidence: true,
      selectedOptionId: "opt_csv_ga_oct15",
      selectedOptionEngineerDays: 18,
      launchCapacityEngineerDays: 18,
      unresolvedBlockingChallengeCount: 0,
    },
  };
}

test("compiles the exact frozen base matrix in canonical catalog order", () => {
  for (const state of Object.keys(expectedBase) as DecisionState[]) {
    assert.deepEqual(compileCapabilities(input(state)).availableTools, expectedBase[state]);
  }
});

test("adds only the exact option and committed follow-up augmentations", () => {
  assert.deepEqual(
    compileCapabilities(input("READY", { kind: "OPTION", id: "opt_csv_ga_oct15" }))
      .availableTools,
    [
      "inspect_decision",
      "inspect_selected_option",
      "recommend_option",
      "challenge_option",
      "add_evidence",
      "compare_options",
      "prepare_decision",
      "why_not",
    ],
  );
  assert.deepEqual(
    compileCapabilities(
      input("COMMITTED", { kind: "FOLLOWUP", id: "fu_customer_launch_brief" }),
    ).availableTools,
    ["inspect_decision", "trace_decision", "inspect_followup", "why_not"],
  );
  assert.deepEqual(
    compileCapabilities(input("REVIEW", { kind: "OPTION", id: "opt_csv_ga_oct15" }))
      .availableTools,
    expectedBase.REVIEW,
  );
  assert.deepEqual(
    compileCapabilities(input("COMMITTED", { kind: "FOLLOWUP", id: "other" }))
      .availableTools,
    expectedBase.COMMITTED,
  );
});

test("uses the exact failed READY predicates and the domain recommendation ID", () => {
  const contested = input("CONTESTED");
  contested.readiness = {
    activeOptionCount: 1,
    hasCurrentCapacityEvidence: false,
    hasNorthstarDeadlineEvidence: false,
    selectedOptionId: "opt_csv_ga_oct15",
    selectedOptionEngineerDays: 18,
    launchCapacityEngineerDays: 14,
    unresolvedBlockingChallengeCount: 2,
  };

  assert.deepEqual(getUnmetPredicates(contested, "prepare_decision"), [
    "at least two active options are required",
    "current launch-capacity evidence is required",
    "Northstar deadline evidence is required",
    "selected option requires 18 engineer-days but launch capacity is 14",
    "2 unresolved blocking challenge(s) against opt_csv_ga_oct15",
  ]);
  assert.deepEqual(getUnmetPredicates(contested, "ratify_decision"), [
    "ratification is never available through WebMCP; Maya Chen must ratify in the ordinary UI",
    "ratification requires a prepared decision in REVIEW",
  ]);
});

test("signature ignores workspace revision and epoch but changes for captured context", () => {
  const first = input("READY");
  const revisionOnly = { ...first, workspaceRevision: 8, contextEpoch: 99 };
  assert.equal(
    compileCapabilities(first).signature,
    compileCapabilities(revisionOnly).signature,
  );

  const changedSelection = {
    ...first,
    selection: { kind: "OPTION", id: "opt_csv_ga_oct15" } as const,
  };
  assert.notEqual(
    compileCapabilities(first).signature,
    compileCapabilities(changedSelection).signature,
  );
  assert.notEqual(
    compileCapabilities(first).signature,
    compileCapabilities({ ...first, memberRole: "ENGINEERING_LEAD" }).signature,
  );
});
