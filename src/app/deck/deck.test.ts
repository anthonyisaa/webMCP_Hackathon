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
    assert.match(markup, /toolchange → tool_search_call → getTools\(\) → tool_search_output → Luna function call → executeTool\(\)/u);
    assert.match(markup, /NATIVE PROOF IS DATED, OBSERVATIONAL EVIDENCE/u);
    assert.match(markup, /target="_blank" rel="noreferrer noopener"/u);
    assert.doesNotMatch(markup, /PENDING|CAPTURE SLOT|CAPTURE REQUIRED|DESIGN PREVIEW/u);
    assert.doesNotMatch(markup, /LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY/u);
    assert.doesNotMatch(markup, /LIVE DEMO INTERFACE|LIVE DEMO PATH|SUPPORTED CLIENT/u);
    assert.doesNotMatch(markup, /VERIFIED ON \{/u);
  });
});
