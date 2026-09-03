import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { RatiflowDeck } from "./RatiflowDeck";
import { DECK_SLIDE_COUNT, DECK_SLIDES } from "./content";
import { deckIndexForKey, parseDeckHash } from "./navigation";

describe("Ratiflow HTML deck", () => {
  it("freezes exactly twelve stable demo chapters with approved copy", () => {
    assert.equal(DECK_SLIDE_COUNT, 12);
    assert.deepEqual(
      DECK_SLIDES.map(({ id }) => id),
      Array.from({ length: 12 }, (_, index) => `slide-${String(index + 1).padStart(2, "0")}`),
    );
    assert.deepEqual(DECK_SLIDES.map(({ section }) => section), [
      "PRODUCT DEMO",
      "WHY IT EXISTS",
      "CORE INTERACTION",
      "LIVE DEMO",
      "SCOPE & CONTROL",
      "CODE RESULT",
      "HISTORY & RESTORE",
      "WEBMCP DEPENDENCY",
      "DATA RESULT",
      "HOW IT WORKS",
      "NEXT FOR WEBMCP",
      "TRY IT LIVE",
    ]);
    assert.deepEqual(DECK_SLIDES.map(({ title }) => title), [
      "Ratiflow",
      "Agent context should not disappear into chat.",
      "From @mention to revision in one governed flow.",
      "Demo flow: choose, assign, watch.",
      "Three bot archetypes. Dynamic access per assignment.",
      "Code verifies the incident and rewrites only the selected section.",
      "Every agent change keeps its decision trail.",
      "Without WebMCP, managed execution stops safely.",
      "The same governed flow works for Data.",
      "How a mention becomes a committed revision.",
      "Where WebMCP goes next: reactive, durable, accountable.",
      "Try Ratiflow live.",
    ]);
    assert.deepEqual(DECK_SLIDES.map(({ subtitle }) => subtitle), [
      "Turn @mentions into scoped, reversible agent work—inside the document.",
      "Ratiflow keeps prompts, sources, scope, authorship, and outcomes attached to the document.",
      "Choose the bot and assignment access separately → expose matching site tools → commit a bounded, restorable change.",
      "Open Postmortem. Assign @Code with Repository access to Root cause. Follow tool discovery, required calls, and the revision.",
      "Code, Data, and General describe expertise. Each run receives exactly one temporary Metrics, Repository, or Editorial catalog.",
      "Repository evidence separates the external trigger from the retry amplifier in a restorable revision.",
      "History preserves who asked, which tools ran, what changed, why it changed, and how to restore it.",
      "The document and comments still work; dynamic discovery and the managed relay fail closed.",
      "@Data checks capacity, updates Success Measures, and leaves inspectable arithmetic behind.",
      "Luna composes each required call; the browser discovers and executes WebMCP tools; Ratiflow records the result.",
      "Our proposal: typed, opt-in pub/sub first; then durable workers, attested scopes, and reviewable replay.",
      "Choose a bot and assignment access, then inspect the site-tool trace, revision history, and Restore.",
    ]);
    assert.equal(new Set(DECK_SLIDES.map(({ title }) => title)).size, 12);
  });

  it("supports the complete frozen keyboard and fragment contract", () => {
    assert.equal(parseDeckHash("#slide-01"), 0);
    assert.equal(parseDeckHash("#slide-12"), 11);
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
    assert.equal(deckIndexForKey("End", false, 2), 11);
    assert.equal(deckIndexForKey("Enter", false, 2), null);
  });

  it("renders all slides semantically without unresolved release placeholders", () => {
    const markup = renderToStaticMarkup(createElement(RatiflowDeck));

    assert.equal((markup.match(/aria-roledescription="slide"/gu) ?? []).length, 12);
    for (const [index, slide] of DECK_SLIDES.entries()) {
      assert.match(markup, new RegExp(`id="${slide.id}"`, "u"));
      assert.match(markup, new RegExp(`Slide ${index + 1} of 12`, "u"));
    }
    assert.match(markup, /aria-label="Previous slide"/u);
    assert.match(markup, /aria-label="Next slide"/u);
    assert.match(markup, /aria-live="polite"/u);
    assert.match(markup, /RATIFLOW · WEBMCP DEMO/u);
    assert.match(markup, /Turn @mentions into scoped, reversible agent work—inside the document\./u);
    assert.match(markup, /WATCH EXECUTION/u);
    assert.match(markup, /Asked by<\/dt><dd>Ada/u);
    assert.match(markup, /APPLICATION-OWNED LUNA WEBMCP RELAY/u);
    assert.match(markup, /APPLICATION-OWNED IN-PAGE RELAY — NOT NATIVE LUNA SITE TOOLS/u);
    assert.match(markup, /SYNTHETIC DEMO CODE/u);
    assert.match(markup, /SYNTHETIC DEMO DATA/u);
    assert.match(markup, /PRODUCT FLOW VISUAL/u);
    assert.match(markup, /LUNA TOOL SEARCH · LOCAL API OBSERVED/u);
    assert.match(markup, /NATIVE PROOF IS DATED, OBSERVATIONAL EVIDENCE/u);
    assert.match(markup, /Three bot archetypes\. Dynamic access per assignment/u);
    assert.match(markup, /Each run receives exactly one temporary Metrics, Repository, or Editorial catalog/u);
    assert.match(markup, /@Code \+ Metrics/u);
    assert.match(markup, /@Data \+ Metrics/u);
    assert.match(markup, /same catalog · 6 tools/u);
    assert.match(markup, /@Code \+ Repository/u);
    assert.match(markup, /@General \+ Editorial/u);
    assert.match(markup, /May suggest a default; never grants authority/u);
    assert.match(markup, /History preserves who asked, which tools ran, what changed, why it changed, and how to restore it/u);
    assert.match(markup, /r6 · Code/u);
    assert.match(markup, /r7 · Code/u);
    assert.match(markup, /Editorial access · facts preserved/u);
    assert.match(markup, /search_demo_code/u);
    assert.match(markup, /read_demo_file/u);
    assert.match(markup, /BOT EXPERTISE · DESCRIPTIVE/u);
    assert.match(markup, /ASSIGNMENT ACCESS · EXPLICIT GRANT/u);
    assert.match(markup, /WEBMCP · EXPOSES \/ INVOKES TOOLS/u);
    assert.match(markup, /RATIFLOW SERVER · ENFORCES ACCESS/u);
    assert.match(markup, /revision → catalog withdrawn → idle/u);
    assert.match(markup, /RUN END · IDLE CATALOG RESTORED/u);
    assert.match(markup, /PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP/u);
    assert.match(markup, /Typed, opt-in resource invalidation and pub\/sub/u);
    assert.match(markup, /Idempotent receipts with reviewable replay/u);
    assert.match(markup, /href="https:\/\/webmachinelearning\.github\.io\/webmcp\/"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/issues\/151"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/issues\/196"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/blob\/main\/docs\/service-workers\.md"/u);
    assert.match(markup, /PATH 01 · INC-482/u);
    assert.match(markup, /PATH 02 · NORTHSTAR/u);
    assert.match(markup, /Open the live demo picker →/u);
    assert.match(markup, /target="_blank" rel="noreferrer noopener"/u);
    assert.doesNotMatch(markup, /role[- /]scoped|role catalog|specialist catalog/iu);
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
