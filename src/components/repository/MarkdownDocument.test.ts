import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { MarkdownDocument } from "./MarkdownDocument";

test("renders GFM structure while keeping HTML, remote images, and unsafe URLs inert", () => {
  const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
    source: `## Impact\n\n- [ ] Follow up\n\n| Outcome | Count |\n|---|---:|\n| Failed | 6,742 |\n\n[unsafe](javascript:alert(1))\n\n![remote](https://example.com/pixel.png)\n\n<script>alert(1)</script>`,
  }));

  assert.match(markup, /<h2[^>]*><span[^>]*>Impact<\/span><\/h2>/u);
  assert.match(markup, /<table>/u);
  assert.match(markup, /type="checkbox"[^>]*disabled/u);
  assert.doesNotMatch(markup, /<script/u);
  assert.doesNotMatch(markup, /<img/u);
  assert.doesNotMatch(markup, /javascript:/u);
  assert.match(markup, /Image omitted · remote/u);
});

test("renders a valid chart as labelled SVG plus a collapsible HTML data table", () => {
  const source = `\`\`\`chart\n${JSON.stringify({
    version: 1,
    type: "bar",
    title: "Checkout outcomes",
    description: "Counts during the incident.",
    labels: ["Attempted", "Failed"],
    series: [{ name: "Checkouts", values: [28_417, 6_742] }],
    xLabel: "Outcome",
    yLabel: "Attempts",
  })}\n\`\`\``;
  const markup = renderToStaticMarkup(createElement(MarkdownDocument, { source }));
  assert.match(markup, /<svg[^>]*role="img"/u);
  assert.match(markup, /Checkout outcomes/u);
  assert.match(markup, /View chart data/u);
  assert.match(markup, /<table>/u);
});

test("invalid chart JSON stays inert with an actionable inline error", () => {
  const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
    source: "```chart\n{ not-json }\n```",
  }));
  assert.match(markup, /Chart could not be rendered/u);
  assert.match(markup, /Open Edit to correct the source/u);
  assert.doesNotMatch(markup, /<svg/u);
});

test("a rendered sheet maps absolute comment anchors through its source offset", () => {
  const source = "## Detection\n\nThe alert arrived late.";
  const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
    source,
    sourceCodePointOffset: 120,
    highlights: [{
      field: "BODY",
      rangeStart: 120,
      rangeEnd: 132,
      kind: "PENDING",
    }],
  }));

  assert.match(markup, /data-highlight="pending"/u);
  assert.doesNotMatch(markup, /data-commented/u);
});

test("highlights only the exact authored inline leaf instead of its Markdown ancestors", () => {
  const source = "Start **bold 😀** end.";
  const start = Array.from(source.slice(0, source.indexOf("bold"))).length;
  const end = start + Array.from("bold 😀").length;
  const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
    source,
    highlights: [{ field: "BODY", rangeStart: start, rangeEnd: end, kind: "AGENT_CHANGE" }],
  }));

  assert.match(markup, /<strong[^>]*><mark[^>]*data-highlight="agent-change"[^>]*>bold 😀<\/mark><\/strong>/u);
  assert.equal((markup.match(/data-highlight=/gu) ?? []).length, 1);
  assert.doesNotMatch(markup, /<p[^>]*data-highlight|<strong[^>]*data-highlight/u);
});
