import { describe, expect, test } from "vitest";

import {
  capabilityGrantForAccessProfile,
  capabilityGrantMatchesPolicy,
} from "./access-policy";

describe("capabilityGrantMatchesPolicy", () => {
  const valid = capabilityGrantForAccessProfile("REPOSITORY_SCOPED_EDIT");

  test("accepts only the exact policy expansion", () => {
    expect(capabilityGrantMatchesPolicy(valid)).toBe(true);

    const invalidCases: Array<[string, unknown]> = [
      ["document authority", { ...valid, documentAuthority: "BOT_EXPERTISE" }],
      ["source labels", { ...valid, syntheticSourceLabels: ["Synthetic demo data · forged"] }],
      ["logical order", { ...valid, logicalToolNames: [...valid.logicalToolNames].reverse() }],
      ["extra key", { ...valid, agentType: "CODE" }],
      ["non-object shape", [valid]],
    ];

    for (const [label, candidate] of invalidCases) {
      expect(capabilityGrantMatchesPolicy(candidate), label).toBe(false);
    }
  });
});
