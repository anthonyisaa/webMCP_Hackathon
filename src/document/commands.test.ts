import { describe, expect, it } from "vitest";
import { getDocumentAgentCommands, moveCommandIndex } from "@/document/commands";

describe("document agent commands", () => {
  it("returns exactly two stage presets and the custom command", () => {
    expect(getDocumentAgentCommands("REFINE").map((command) => command.label)).toEqual([
      "Rewrite for clarity",
      "Shorten",
      "Ask agent…",
    ]);
  });

  it("wraps keyboard navigation", () => {
    expect(moveCommandIndex(0, -1, 3)).toBe(2);
    expect(moveCommandIndex(2, 1, 3)).toBe(0);
    expect(moveCommandIndex(-1, 1, 3)).toBe(1);
  });
});
