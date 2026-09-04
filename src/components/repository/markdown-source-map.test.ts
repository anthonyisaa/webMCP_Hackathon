import assert from "node:assert/strict";
import { test } from "vitest";

import {
  mapExactRenderedEndpoint,
  repositoryCodePointOffset,
  repositoryHighlightedLeafSegments,
  repositorySelectionFromDom,
  sourceRangeToSelection,
} from "./markdown-source-map";

interface TestElement {
  nodeType: 1;
  tagName: string;
  parentElement: TestElement | null;
  attributes: Readonly<Record<string, string>>;
  getAttribute: (name: string) => string | null;
  closest: (selector: string) => TestElement | null;
  contains?: (node: TestElement | TestText) => boolean;
}

interface TestText {
  nodeType: 3;
  data: string;
  parentElement: TestElement;
}

function testElement(
  tagName: string,
  parentElement: TestElement | null,
  attributes: Readonly<Record<string, string>> = {},
): TestElement {
  const element: TestElement = {
    nodeType: 1,
    tagName,
    parentElement,
    attributes,
    getAttribute: (name) => attributes[name] ?? null,
    closest: (selector) => selector === '[data-selection-disabled="true"]'
      && attributes["data-selection-disabled"] === "true" ? element : null,
  };
  return element;
}

function testRoot(): TestElement {
  const root = testElement("DIV", null);
  root.contains = (node) => {
    let candidate: TestElement | null = node.nodeType === 3 ? node.parentElement : node;
    while (candidate) {
      if (candidate === root) return true;
      candidate = candidate.parentElement;
    }
    return false;
  };
  return root;
}

function testLeaf(
  text: string,
  parent: TestElement,
  startUtf16: number,
  endUtf16: number,
): TestText {
  const span = testElement("SPAN", parent, {
    "data-source-start": String(startUtf16),
    "data-source-end": String(endUtf16),
  });
  return { nodeType: 3, data: text, parentElement: span };
}

function testSelection(
  startContainer: TestText,
  startOffset: number,
  endContainer: TestText,
  endOffset: number,
): Selection {
  return {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ startContainer, startOffset, endContainer, endOffset }),
  } as unknown as Selection;
}

test("DOM selection rejects unbalanced inline syntax but allows safe formatting boundaries", () => {
  const source = "Alpha **bold** and plain.";
  const root = testRoot();
  const prefix = testLeaf("Alpha ", root, 0, 6);
  const strong = testElement("STRONG", root);
  const boldStart = testLeaf("bo", strong, 8, 10);
  const boldEnd = testLeaf("ld", strong, 10, 12);
  const suffix = testLeaf(" and plain.", root, 14, 25);

  assert.equal(repositorySelectionFromDom(
    source,
    "BODY",
    root as unknown as HTMLElement,
    testSelection(boldStart, 0, suffix, 10),
  ), null);

  assert.deepEqual(repositorySelectionFromDom(
    source,
    "BODY",
    root as unknown as HTMLElement,
    testSelection(boldStart, 0, boldEnd, 2),
  ), {
    field: "BODY",
    rangeStart: 8,
    rangeEnd: 12,
    selectedText: "bold",
  });

  assert.deepEqual(repositorySelectionFromDom(
    source,
    "BODY",
    root as unknown as HTMLElement,
    testSelection(prefix, 0, suffix, suffix.data.length),
  ), {
    field: "BODY",
    rangeStart: 0,
    rangeEnd: 25,
    selectedText: source,
  });
});

test("all syntax-bearing inline wrappers must match by element identity", () => {
  for (const tagName of ["STRONG", "EM", "DEL", "A"]) {
    const source = "first second";
    const root = testRoot();
    const firstWrapper = testElement(tagName, root);
    const secondWrapper = testElement(tagName, root);
    const first = testLeaf("first", firstWrapper, 0, 5);
    const second = testLeaf("second", secondWrapper, 6, 12);

    assert.equal(repositorySelectionFromDom(
      source,
      "BODY",
      root as unknown as HTMLElement,
      testSelection(first, 0, second, second.data.length),
    ), null, tagName);
  }
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

test("exact Unicode leaves split by source code point with selection over change over pending precedence", () => {
  assert.deepEqual(repositoryHighlightedLeafSegments(
    "A😀BC",
    "BODY",
    { startUtf16: 0, endUtf16: 5, leafText: "A😀BC" },
    [
      { field: "BODY", rangeStart: 0, rangeEnd: 4, kind: "PENDING" },
      { field: "BODY", rangeStart: 1, rangeEnd: 4, kind: "AGENT_CHANGE" },
      { field: "BODY", rangeStart: 2, rangeEnd: 3, kind: "SELECTION" },
    ],
  ), [
    { text: "A", startUtf16: 0, endUtf16: 1, highlight: "PENDING" },
    { text: "😀", startUtf16: 1, endUtf16: 3, highlight: "AGENT_CHANGE" },
    { text: "B", startUtf16: 3, endUtf16: 4, highlight: "SELECTION" },
    { text: "C", startUtf16: 4, endUtf16: 5, highlight: "AGENT_CHANGE" },
  ]);
});

test("sheet offsets stay absolute while leaf DOM coordinates remain local UTF-16", () => {
  assert.deepEqual(repositoryHighlightedLeafSegments(
    "😀BC",
    "BODY",
    { startUtf16: 0, endUtf16: 4, leafText: "😀BC" },
    [{ field: "BODY", rangeStart: 11, rangeEnd: 12, kind: "PENDING" }],
    10,
  ), [
    { text: "😀", startUtf16: 0, endUtf16: 2, highlight: null },
    { text: "B", startUtf16: 2, endUtf16: 3, highlight: "PENDING" },
    { text: "C", startUtf16: 3, endUtf16: 4, highlight: null },
  ]);
});
