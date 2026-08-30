import assert from "node:assert/strict";
import { test } from "vitest";

import { TOOL_NAMES, type CompiledCapabilities } from "../contracts/index";
import { registeredToolNames, resolveWebMCPRegistrationMode } from "./mode";

const contested = {
  state: "CONTESTED",
  workspaceRevision: 8,
  contextEpoch: 2,
  selection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
  availableTools: ["inspect_decision", "recommend_option", "add_evidence", "compare_options", "why_not"],
  unavailableActions: [],
  signature: "contested-test",
} as CompiledCapabilities;

test("static-superset mode resolves only for an explicitly marked Vercel preview", () => {
  assert.equal(resolveWebMCPRegistrationMode("preview", "static-superset"), "static-superset");
  assert.equal(resolveWebMCPRegistrationMode("production", "static-superset"), "dynamic");
  assert.equal(resolveWebMCPRegistrationMode("development", "static-superset"), "dynamic");
  assert.equal(resolveWebMCPRegistrationMode("preview", undefined), "dynamic");
  assert.equal(resolveWebMCPRegistrationMode(undefined, "static-superset"), "dynamic");
});

test("static-superset registers exactly the existing catalog and never ratification", () => {
  assert.deepEqual(registeredToolNames("dynamic", contested), contested.availableTools);
  assert.deepEqual(registeredToolNames("static-superset", contested), TOOL_NAMES);
  assert.equal(registeredToolNames("static-superset", contested).includes("ratify_decision" as never), false);
});
