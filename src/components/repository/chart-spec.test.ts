import assert from "node:assert/strict";
import { test } from "vitest";

import { parseRepositoryChart } from "./chart-spec";

const VALID = JSON.stringify({
  version: 1,
  type: "bar",
  title: "Checkout outcomes",
  description: "Attempted, succeeded, and failed checkout counts.",
  labels: ["Attempted", "Succeeded", "Failed"],
  series: [
    { name: "Checkouts", values: [28_417, 21_675, 6_742] },
    { name: "Baseline", values: [30_000, 30_000, 0] },
  ],
  xLabel: "Outcome",
  yLabel: "Attempts",
});

test("accepts the frozen chart grammar without adding executable behavior", () => {
  const result = parseRepositoryChart(VALID);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.version, 1);
  assert.equal(result.value.type, "bar");
  assert.deepEqual(result.value.series[0]?.values, [28_417, 21_675, 6_742]);
});

test("rejects unknown properties, duplicate series, and mismatched values", () => {
  const withUrl = parseRepositoryChart(JSON.stringify({ ...JSON.parse(VALID), url: "https://example.com" }));
  assert.deepEqual(withUrl, { ok: false, error: "Unknown chart property: url." });

  const duplicate = JSON.parse(VALID);
  duplicate.series[1].name = "Checkouts";
  const duplicateResult = parseRepositoryChart(JSON.stringify(duplicate));
  assert.equal(duplicateResult.ok, false);
  if (!duplicateResult.ok) assert.match(duplicateResult.error, /unique/u);

  const mismatched = JSON.parse(VALID);
  mismatched.series[0].values.pop();
  const result = parseRepositoryChart(JSON.stringify(mismatched));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /exactly 3 values/u);
});

test("line charts require at least two labels and all numbers stay finite and bounded", () => {
  const onePoint = JSON.parse(VALID);
  onePoint.type = "line";
  onePoint.labels = ["Only"];
  onePoint.series = [{ name: "Checkouts", values: [1] }];
  const line = parseRepositoryChart(JSON.stringify(onePoint));
  assert.equal(line.ok, false);

  const tooLarge = JSON.parse(VALID);
  tooLarge.series[0].values[0] = 1e13;
  const numeric = parseRepositoryChart(JSON.stringify(tooLarge));
  assert.equal(numeric.ok, false);
});
