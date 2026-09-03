import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { RatiflowDeck } from "./RatiflowDeck";
import { DECK_SLIDE_COUNT, DECK_SLIDES } from "./content";
import { deckIndexForKey, parseDeckHash } from "./navigation";

describe("Ratiflow HTML deck", () => {
  it("freezes exactly twelve stable, one-claim slides", () => {
    assert.equal(DECK_SLIDE_COUNT, 12);
    assert.deepEqual(
      DECK_SLIDES.map(({ id }) => id),
      Array.from({ length: 12 }, (_, index) => `slide-${String(index + 1).padStart(2, "0")}`),
    );
    assert.deepEqual(
      DECK_SLIDES.slice(3, 11).map(({ title }) => title),
      [
        "A judge sees the whole transaction in three moves.",
        "The page scopes the role. The relay scopes the turn.",
        "Code separates the trigger from the root cause.",
        "History turns agent work into organizational memory.",
        "Without WebMCP, the document survives; the agent loop does not.",
        "Data turns a launch debate into inspectable arithmetic.",
        "Luna composes the action; the browser executes it.",
        "Today: page-scoped RPC. 10×: reactive. 100×: durable and accountable.",
      ],
    );
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
    assert.match(markup, /APPLICATION-OWNED LUNA WEBMCP RELAY/u);
    assert.match(markup, /APPLICATION-OWNED IN-PAGE RELAY — NOT NATIVE LUNA SITE TOOLS/u);
    assert.match(markup, /SYNTHETIC DEMO CODE/u);
    assert.match(markup, /SYNTHETIC DEMO DATA/u);
    assert.match(markup, /PRODUCT FLOW VISUAL/u);
    assert.match(markup, /LUNA TOOL SEARCH · LOCAL API OBSERVED/u);
    assert.match(markup, /NATIVE PROOF IS DATED, OBSERVATIONAL EVIDENCE/u);
    assert.match(markup, /publishes one WebMCP role\/run catalog/u);
    assert.match(markup, /DATA <b>6<\/b>/u);
    assert.match(markup, /CODE <b>7<\/b>/u);
    assert.match(markup, /GENERAL <b>7<\/b>/u);
    assert.match(markup, /read_assignment/u);
    assert.match(markup, /search_demo_code/u);
    assert.match(markup, /read_demo_file/u);
    assert.match(markup, /submit_scoped_revision/u);
    assert.match(markup, /WEBMCP · ROLE\/RUN CATALOG/u);
    assert.match(markup, /RELAY · ONE REQUIRED FUNCTION PER TURN/u);
    assert.match(markup, /LUNA COMPOSES ARGUMENTS · SERVER ENFORCES ORDER/u);
    assert.match(markup, /PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP/u);
    assert.match(markup, /Typed, opt-in resource invalidation and pub\/sub/u);
    assert.match(markup, /Idempotent receipts with reviewable replay/u);
    assert.match(markup, /href="https:\/\/webmachinelearning\.github\.io\/webmcp\/"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/issues\/151"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/issues\/196"/u);
    assert.match(markup, /href="https:\/\/github\.com\/webmachinelearning\/webmcp\/blob\/main\/docs\/service-workers\.md"/u);
    assert.match(markup, /target="_blank" rel="noreferrer noopener"/u);
    assert.doesNotMatch(markup, /PENDING|CAPTURE SLOT|CAPTURE REQUIRED|DESIGN PREVIEW/u);
    assert.doesNotMatch(markup, /LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY/u);
    assert.doesNotMatch(markup, /LIVE DEMO INTERFACE|LIVE DEMO PATH|SUPPORTED CLIENT/u);
    assert.doesNotMatch(markup, /VERIFIED ON \{/u);
  });
});
