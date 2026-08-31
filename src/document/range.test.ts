import { describe, expect, it } from "vitest";
import {
  codePointOffsetToUtf16Index,
  resolveDocumentActionTarget,
  utf16IndexToCodePointOffset,
} from "@/document/range";

describe("document range conversion", () => {
  it("converts browser UTF-16 indices around emoji into code-point offsets", () => {
    const text = "A🧠B";
    expect(utf16IndexToCodePointOffset(text, 1)).toBe(1);
    expect(utf16IndexToCodePointOffset(text, 3)).toBe(2);
    expect(codePointOffsetToUtf16Index(text, 2)).toBe(3);
  });

  it("keeps composed characters as their constituent Unicode code points", () => {
    const text = "Cafe\u0301 🌍";
    expect(utf16IndexToCodePointOffset(text, 5)).toBe(5);
    expect(codePointOffsetToUtf16Index(text, 5)).toBe(5);
    expect(utf16IndexToCodePointOffset(text, text.length)).toBe(Array.from(text).length);
  });

  it("derives selected text and code-point ranges from DOM indices", () => {
    const target = resolveDocumentActionTarget({
      field: "BODY",
      text: "Plan 🧠 carefully",
      presetId: "shorten",
      startUtf16: 5,
      endUtf16: 9,
    });
    expect(target).toEqual({
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 5,
      rangeEnd: 8,
      selectedText: "🧠 c",
    });
  });

  it("targets the caret only for Continue the thought in an unselected body", () => {
    expect(
      resolveDocumentActionTarget({
        field: "BODY",
        text: "An opening",
        presetId: "continue_thought",
        startUtf16: 3,
        endUtf16: 3,
      }),
    ).toMatchObject({ targetKind: "CARET", rangeStart: 3, rangeEnd: 3 });

    expect(
      resolveDocumentActionTarget({
        field: "BODY",
        text: "An opening",
        presetId: "turn_into_outline",
        startUtf16: 3,
        endUtf16: 3,
      }),
    ).toMatchObject({ targetKind: "DOCUMENT", rangeStart: 0, rangeEnd: 10 });

    expect(
      resolveDocumentActionTarget({
        field: "TITLE",
        text: "",
        presetId: "custom",
        startUtf16: 0,
        endUtf16: 0,
      }),
    ).toMatchObject({ targetKind: "DOCUMENT", rangeStart: 0, rangeEnd: 0 });
  });
});
