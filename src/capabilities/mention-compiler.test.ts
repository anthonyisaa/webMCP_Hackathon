import { describe, expect, it } from "vitest";

import { compileIssueMention } from "@/capabilities/mention-compiler";

describe("compileIssueMention", () => {
  it("uses the exact leading name, trims only ASCII mention whitespace, and preserves the interior", () => {
    expect(compileIssueMention("@ChatGPT \t  rework\n\nthis  paragraph\r\n", "ChatGPT"))
      .toEqual({
        ok: true,
        value: {
          visibleComment: "@ChatGPT \t  rework\n\nthis  paragraph\r\n",
          instruction: "rework\n\nthis  paragraph",
          title: "rework this paragraph",
        },
      });
    expect(compileIssueMention("@ChatGPT\u00a0rework this", "ChatGPT"))
      .toEqual({ ok: false, reason: "INVALID_PREFIX" });
    expect(compileIssueMention("hello @ChatGPT rework this", "ChatGPT"))
      .toEqual({ ok: false, reason: "INVALID_PREFIX" });
  });

  it("truncates the normalized title by Unicode code points without an ellipsis", () => {
    const instruction = `${"🪄".repeat(119)}\nlast trailing words`;
    const compiled = compileIssueMention(`@Agent ${instruction}`, "Agent");
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(Array.from(compiled.value.title)).toHaveLength(120);
    expect(compiled.value.title.endsWith(" ")).toBe(true);
    expect(compiled.value.title.endsWith("…")).toBe(false);
  });
});
