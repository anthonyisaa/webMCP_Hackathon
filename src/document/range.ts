import type {
  DocumentField,
  DocumentPresetId,
  DocumentTargetKind,
} from "@/document/contracts";

export interface DocumentSelectionSnapshot {
  field: DocumentField;
  startUtf16: number;
  endUtf16: number;
}

export interface DocumentActionTarget {
  targetField: DocumentField;
  targetKind: DocumentTargetKind;
  rangeStart: number;
  rangeEnd: number;
  selectedText: string;
}

function clampUtf16Index(text: string, index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), text.length);
}

/** Convert a browser selection index (UTF-16 code units) to the contract's code-point offset. */
export function utf16IndexToCodePointOffset(text: string, index: number): number {
  return Array.from(text.slice(0, clampUtf16Index(text, index))).length;
}

/** Convert a contract code-point offset back to a browser selection index. */
export function codePointOffsetToUtf16Index(text: string, offset: number): number {
  const safeOffset = Number.isFinite(offset) ? Math.max(Math.trunc(offset), 0) : 0;
  return Array.from(text).slice(0, safeOffset).join("").length;
}

export function resolveDocumentActionTarget(input: {
  field: DocumentField;
  text: string;
  presetId: DocumentPresetId;
  startUtf16: number;
  endUtf16: number;
}): DocumentActionTarget {
  const startUtf16 = clampUtf16Index(input.text, Math.min(input.startUtf16, input.endUtf16));
  const endUtf16 = clampUtf16Index(input.text, Math.max(input.startUtf16, input.endUtf16));
  const rangeStart = utf16IndexToCodePointOffset(input.text, startUtf16);
  const rangeEnd = utf16IndexToCodePointOffset(input.text, endUtf16);

  if (rangeEnd > rangeStart) {
    return {
      targetField: input.field,
      targetKind: "SELECTION",
      rangeStart,
      rangeEnd,
      selectedText: input.text.slice(startUtf16, endUtf16),
    };
  }

  if (input.field === "BODY" && input.presetId === "continue_thought") {
    return {
      targetField: input.field,
      targetKind: "CARET",
      rangeStart,
      rangeEnd: rangeStart,
      selectedText: "",
    };
  }

  return {
    targetField: input.field,
    targetKind: "DOCUMENT",
    rangeStart: 0,
    rangeEnd: Array.from(input.text).length,
    selectedText: input.text,
  };
}
