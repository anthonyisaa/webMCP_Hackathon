import assert from "node:assert/strict";
import { test } from "vitest";

import {
  mapExactRenderedEndpoint,
  mapRenderedEndpointsToSource,
  repositoryCodePointOffset,
  sourceRangeToSelection,
} from "./markdown-source-map";

test("maps exact rendered leaves and intentionally keeps intervening Markdown delimiters", () => {
  const source = "Alpha **bold** and plain.";
  const mapped = mapRenderedEndpointsToSource(
    source,
    "BODY",
    { startUtf16: 0, endUtf16: source.length, leafText: "bold", leafOffsetUtf16: 0 },
    { startUtf16: 0, endUtf16: source.length, leafText: " and plain.", leafOffsetUtf16: 10 },
  );
  assert.deepEqual(mapped, {
    field: "BODY",
    rangeStart: 8,
    rangeEnd: 24,
    selectedText: "bold** and plain",
  });
});

test("fails closed for ambiguous leaves, generated text, and surrogate interiors", () => {
  assert.equal(mapExactRenderedEndpoint("same same", {
    startUtf16: 0,
    endUtf16: 9,
    leafText: "same",
    leafOffsetUtf16: 2,
  }), null);
  assert.equal(mapExactRenderedEndpoint("&amp;", {
    startUtf16: 0,
    endUtf16: 5,
    leafText: "&",
    leafOffsetUtf16: 1,
  }), null);
  assert.equal(repositoryCodePointOffset("A😀B", 2), null);
});

test("whole-block anchors convert UTF-16 offsets once into Unicode code points", () => {
  assert.deepEqual(sourceRangeToSelection("😀 table", "BODY", 0, 8), {
    field: "BODY",
    rangeStart: 0,
    rangeEnd: 7,
    selectedText: "😀 table",
  });
});
