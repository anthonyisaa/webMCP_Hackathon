import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { RatiflowDeck } from "./RatiflowDeck";
import { DECK_SLIDE_COUNT, DECK_SLIDES } from "./content";
import { deckIndexForKey, parseDeckHash } from "./navigation";

describe("Ratiflow HTML deck", () => {
  it("freezes exactly eleven stable demo chapters with approved copy", () => {
    assert.equal(DECK_SLIDE_COUNT, 11);
    assert.deepEqual(
      DECK_SLIDES.map(({ id }) => id),
      Array.from({ length: 11 }, (_, index) => `slide-${String(index + 1).padStart(2, "0")}`),
    );
    assert.deepEqual(DECK_SLIDES.map(({ section }) => section), [
      "PRODUCT DEMO",
      "WHY IT EXISTS",
      "THE RATIFLOW MODEL",
      "LIVE DEMO",
      "SCOPE & CONTROL",
      "CODE RESULT",
      "HISTORY & RESTORE",
      "WEBMCP DEPENDENCY",
      "HOW IT WORKS",
      "NEXT FOR WEBMCP",
      "TRY IT LIVE",
    ]);
    assert.deepEqual(DECK_SLIDES.map(({ title }) => title), [
      "Ratiflow",
      "Documents are becoming shared workspaces for people and agents.",
      "One shared history. Different tools for each agent.",
      "Select text. Mention a bot. Assign & run.",
      "The history is shared. Access is company policy.",
      "Code verifies the incident and rewrites only the selected section.",
      "Every agent change keeps its decision trail.",
      "Without WebMCP, managed execution stops safely.",
      "How a mention becomes a committed revision.",
      "Two things WebMCP needs for real agent work.",
      "Try Ratiflow live.",
    ]);
    assert.deepEqual(DECK_SLIDES.map(({ subtitle }) => subtitle), [
      "Turn @mentions into scoped, reversible agent work—inside the document.",
      "Without a clear document history, context gets lost, decisions become confusing, and agents cannot do their best work.",
      "Every agent gets the same document history and provenance. Ratiflow then exposes only the tools allowed by company policy.",
      "In the Postmortem, select any safe passage, choose @Code, write the instruction, and run—no permission step.",
      "Every agent gets the same document history and provenance. In this demo, hard-coded company policy maps @Code to Repository tools.",
      "Repository evidence separates the trigger from the retry amplifier; the new replacement is green for 30 seconds and remains restorable.",
      "History keeps the asker, agent, runtime, evidence, revision lineage, and restore point attached to the document.",
      "The document and comments still work; dynamic discovery and the managed relay fail closed.",
      "An agent running through an API composes each call; the browser discovers and executes WebMCP tools; Ratiflow enforces and records the result.",
      "Today, tool execution depends on a live page. The next step is keeping context current and approved work durable.",
      "See the full people-and-agents document workflow in the live app.",
    ]);
    assert.equal(new Set(DECK_SLIDES.map(({ title }) => title)).size, 11);
  });

  it("supports the complete frozen keyboard and fragment contract", () => {
    assert.equal(parseDeckHash("#slide-01"), 0);
    assert.equal(parseDeckHash("#slide-11"), 10);
    assert.equal(parseDeckHash("#slide-12"), null);
    assert.equal(parseDeckHash("#slide-13"), null);
    assert.equal(parseDeckHash("#slide-1"), null);
    assert.equal(deckIndexForKey("ArrowRight", false, 4), 5);
    assert.equal(deckIndexForKey("ArrowDown", false, 4), 5);
    assert.equal(deckIndexForKey("PageDown", false, 4), 5);
    assert.equal(deckIndexForKey(" ", false, 4), 5);
    assert.equal(deckIndexForKey("ArrowLeft", false, 4), 3);
    assert.equal(deckIndexForKey("ArrowUp", false, 4), 3);
    assert.equal(deckIndexForKey("PageUp", false, 4), 3);
    assert.equal(deckIndexForKey(" ", true, 4), 3);
    assert.equal(deckIndexForKey("Home", false, 8), 0);
    assert.equal(deckIndexForKey("End", false, 2), 10);
    assert.equal(deckIndexForKey("Enter", false, 2), null);
  });

  it("renders all slides semantically without unresolved release placeholders", () => {
    const markup = renderToStaticMarkup(createElement(RatiflowDeck));

    assert.equal((markup.match(/aria-roledescription="slide"/gu) ?? []).length, 11);
    for (const [index, slide] of DECK_SLIDES.entries()) {
      assert.match(markup, new RegExp(`id="${slide.id}"`, "u"));
      assert.match(markup, new RegExp(`Slide ${index + 1} of 11`, "u"));
    }
    assert.match(markup, /aria-label="Previous slide"/u);
    assert.match(markup, /aria-label="Next slide"/u);
    assert.match(markup, /aria-live="polite"/u);
    assert.match(markup, /RATIFLOW · WEBMCP DEMO/u);
    assert.match(markup, /Turn @mentions into scoped, reversible agent work—inside the document\./u);
    assert.match(markup, /EXACT PASSAGE IN THE DEMO DOCUMENT/u);
    assert.match(markup, /Asked by<\/dt><dd>Ada/u);
    assert.match(markup, /APPLICATION-OWNED LUNA WEBMCP RELAY/u);
    assert.match(markup, /APPLICATION-OWNED IN-PAGE RELAY · MODEL VIA API/u);
    assert.match(markup, /SYNTHETIC DEMO CODE/u);
    assert.match(markup, /PRODUCT FLOW VISUAL/u);
    assert.match(markup, /AGENT MODEL · RUNNING VIA API/u);
    assert.match(markup, /NATIVE PROOF IS DATED, OBSERVATIONAL EVIDENCE/u);
    assert.match(markup, /Documents are becoming shared workspaces for people and agents/u);
    assert.match(markup, /context gets lost, decisions become confusing/u);
    assert.match(markup, /same document history and provenance/u);
    assert.match(markup, /SAME HISTORY \+ PROVENANCE/u);
    assert.match(markup, /AGENT-SPECIFIC TOOLS · COMPANY POLICY/u);
    assert.match(markup, /Assign &amp; run/u);
    assert.match(markup, /NO PERMISSION CHOOSER/u);
    assert.match(markup, /Automatic company policy/u);
    assert.match(markup, /@Code → Repository tools/u);
    assert.match(markup, /History keeps the asker, agent, runtime, evidence, revision lineage, and restore point attached to the document/u);
    assert.match(markup, /ASKER · AGENT · EVIDENCE · RESTORE/u);
    assert.match(markup, /r4 · Builder/u);
    assert.match(markup, /r5 · Builder/u);
    assert.match(markup, /r6 · Code/u);
    assert.match(markup, /search_demo_code/u);
    assert.match(markup, /read_demo_file/u);
    assert.match(markup, /@Data/u);
    assert.match(markup, /Metrics · 6 tools/u);
    assert.match(markup, /@General/u);
    assert.match(markup, /Editorial · 7 tools/u);
    assert.match(markup, /COMPANY ACCESS · FIXED BY MANAGED BOT/u);
    assert.match(markup, /DOCUMENT HISTORY · SHARED/u);
    assert.match(markup, /RUN GRANT · IMMUTABLE/u);
    assert.match(markup, /WEBMCP · EXPOSES \/ INVOKES TOOLS/u);
    assert.match(markup, /RATIFLOW SERVER · ENFORCES ACCESS/u);
    assert.match(markup, /revision → catalog withdrawn → idle/u);
    assert.match(markup, /RUN END · IDLE CATALOG RESTORED/u);
    assert.match(markup, /PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP/u);
    assert.match(markup, /Typed resources plus change notifications let agents re-read only invalidated state/u);
    assert.match(markup, /Worker-backed sessions carry delegated identity and scope, with idempotent receipts/u);
    assert.match(markup, /href="https:\/\/webmachinelearning\.github\.io\/webmcp\/"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/issues\/151"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/issues\/196"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/blob\/main\/docs\/service-workers\.md"/u);
    assert.match(markup, /Open the live Ratiflow app →/u);
    assert.doesNotMatch(markup, /100×/u);
    assert.doesNotMatch(markup, /The same governed flow works for Data/u);
    assert.match(markup, /target="_blank" rel="noreferrer noopener"/u);
    assert.doesNotMatch(markup, /role[- /]scoped|role catalog|specialist catalog/iu);
    assert.doesNotMatch(markup, /access choice|choose(?:s)? (?:the )?(?:website |assignment )?access|same bot.*different access|same Code.*different/u);
    assert.doesNotMatch(markup, /r7 · Code|Editorial access · facts preserved/u);
    assert.doesNotMatch(markup, /WebMCP (?:grants?|enforces?|authenticates?)/iu);
    assert.doesNotMatch(markup, /darkSlide/u);
    assert.doesNotMatch(markup, /\bjudge(?:s)?\b|judging|criteria|criterion|rubric/iu);
    assert.doesNotMatch(markup, /WebMCP Leverage|Potential Impact|Creativity & Ambition/u);
    assert.doesNotMatch(markup, /PENDING|CAPTURE SLOT|CAPTURE REQUIRED|DESIGN PREVIEW/u);
    assert.doesNotMatch(markup, /LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY/u);
    assert.doesNotMatch(markup, /LIVE DEMO INTERFACE|LIVE DEMO PATH|SUPPORTED CLIENT/u);
    assert.doesNotMatch(markup, /VERIFIED ON \{/u);
  });
});
