# Ratiflow v4.2 HTML deck storyboard
_Frozen audience, narrative, copy, composition, and evidence contract · 2026-09-02_

## 1. Purpose

This contract defines the 12-slide HTML deck that accompanies the Ratiflow WebMCP
Challenge entry. The deck must persuade a technical judging panel that Ratiflow is a
complete collaboration product whose defining interaction depends materially on WebMCP,
not an AI editor with a decorative tool wrapper.

The communication job is:

> By the end, WebMCP Challenge judges should believe Ratiflow is a novel, credible, and
> working product because a live document dynamically supplies role-scoped WebMCP tools
> to Luna and preserves every resulting action as bounded, reversible provenance.

The narrative is `lost agent context -> one new document primitive -> first-run path ->
Postmortem proof -> WebMCP proof -> durable memory -> ablation -> Product/Data transfer ->
truthful architecture -> judging synthesis`.

The official criteria are equally weighted: WebMCP Leverage, Execution, Potential Impact,
and Creativity & Ambition. WebMCP Leverage is the first tie-break criterion, so native
discovery, invocation, dynamic catalog changes, and the WebMCP-off ablation receive the
strongest evidence treatment.

Sources:

- [WebMCP Challenge official rules](https://webmcp.devpost.com/rules)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [OpenAI Site Tools documentation](https://learn.chatgpt.com/docs/webmcp)
- [OpenAI tool search guide](https://developers.openai.com/api/docs/guides/tools-tool-search)
- [GPT-5.6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

## 2. Global visual contract

- Format is a responsive 16:9 HTML presentation with a 1920 x 1080 design canvas.
- Use the Ratiflow product palette: paper `#f3f5f1`, ink `#20221f`, green `#29685b`,
  violet `#7356a1`, and white paper surfaces. Use the product's Geist type family.
- Product screenshots are the primary visual language. Do not use stock photography,
  generic robot art, third-party logos, or invented interface mockups.
- Each slide makes one claim. Keep the title to one line at the design canvas and visible
  explanatory copy to one short statement unless exact evidence labels require more.
- Use at least 54 px for the cover title, 38 px for slide titles, 25 px for major callouts,
  and 18 px for supporting copy at the 1920 x 1080 canvas.
- Slides 6 and 11 use an ink-dark proof surface to vary the visual rhythm. All other slides
  use the warm paper surface. Adjacent slides must not repeat the same silhouette.
- Avoid grids of decorative cards, fake controls, excessive pills, or dashboard density.
  Prefer one dominant composition per slide: full-bleed crop, editorial split, sequence,
  diff, timeline, ablation, chart, or one simple architecture flow.
- Product annotations may use restrained numbered markers and hairline leaders. They must
  not obscure document copy, task state, tool names, evidence, or revision provenance.
- No animation may imply an execution that did not occur. Motion is limited to navigation,
  progressive emphasis of already captured evidence, and subtle cross-fades.
- The deck must not reuse the older `demo/video-assets/**` or
  `demo/video-output/**` imagery as v4.2 proof. Those assets depict the superseded
  proposal/accept workflow.

## 3. Exact truth labels

Use these phrases verbatim when the associated state is shown. Do not replace them with
broader or more flattering claims.

| State | Visible label |
|---|---|
| Real managed relay run | `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY` |
| Native supported-client page/tool observation | `NATIVE WEBMCP` |
| Browser without WebMCP | `WEBMCP OFF · HUMAN MODE` |
| Code fixture or result | `SYNTHETIC DEMO CODE` |
| Data fixture, result, or chart | `SYNTHETIC DEMO DATA` |
| Luna architecture boundary | `APPLICATION-OWNED IN-PAGE RELAY — NOT NATIVE LUNA SITE TOOLS` |
| Capture provenance | `VERIFIED ON {surface} · {YYYY-MM-DD} · {short SHA}` |

`LIVE LUNA` is allowed only after the named task is observed using the server-held key and
the final release's real `gpt-5.6-luna` Responses path. `NATIVE WEBMCP` is allowed only for
a supported client observing or invoking `document.modelContext`; an adapter, test double,
HTTP call, static screenshot, or replay is not native evidence. Compatibility screenshots
must say `COMPATIBILITY` and cannot substitute for either label.

Never describe Luna as natively supporting OpenAI Site Tools. The approved claim is:

> Ratiflow's application-owned in-page relay lets Luna discover the page's live WebMCP
> tools and routes every selected action through `document.modelContext.executeTool()`.

## 4. Screenshot and evidence provenance

All deck evidence lives under `demo/v4.2-relay/deck/`. Every core screenshot must be
recaptured from the final deployed release; visual similarity to an earlier local build
is insufficient.

Create `demo/v4.2-relay/deck/evidence-manifest.json` beside the assets. Each entry records:

- asset filename and slide number;
- full Git SHA and deployed URL;
- UTC capture timestamp and client name/version;
- viewport and device-pixel ratio;
- document kind, sanitized document ID, run ID, attempt number, and resulting revision
  where applicable;
- whether the observation is `NATIVE_WEBMCP`, `LIVE_LUNA_RELAY`, `WEBMCP_OFF`, or
  `CONCEPTUAL_ONLY`;
- the matching sanitized trace, golden, ablation, or browser-test artifact;
- the synthetic source labels shown in the UI; and
- the person who captured or generated the evidence.

Capture rules:

1. Slides 1, 3, and 5 through 11 must all resolve to the same approved release SHA.
2. Slides 6, 7, 8, and 10 require real Luna relay runs. Canned responses, mocked provider
   tests, and seeded completed examples cannot be presented as live execution.
3. Slides 6, 9, and 11 require a supported WebMCP surface. Record the exact Chrome version
   and flag state or the exact ChatGPT in-app browser version.
4. The Postmortem frames used on slides 3 and 5 through 8 must belong to one traceable task
   lineage. The Product frames on slide 10 must belong to one separate traceable Data run.
5. Capture the whole product state before cropping. Keep an untouched source capture and
   list every derived crop in the evidence manifest.
6. Redact bearer tokens, API keys, share/member credentials, unrestricted provider
   payloads, private URLs, cookies, and raw model transcripts. Never blur a secret after
   committing it; secrets must not enter the asset in the first place.
7. A trace may show event type, bounded input summary, tool name, source labels, latency,
   state, model, runtime, and correlation IDs. It must not show chain-of-thought.
8. Code and data evidence must display the exact synthetic label in the screenshot, not
   only in the deck caption.
9. Do not show unresolved placeholders such as `PENDING`, fake revision numbers, fake
   response IDs, or a future public URL. Omit unavailable evidence until the gate passes.
10. Do not state reliability, speed, cost, adoption, or accuracy numbers unless the exact
    measurement and method are included in the evidence manifest.

## 5. Navigation and accessibility contract

- Represent the deck as one ordered document containing 12 semantic slide sections.
  Each section has an accessible name derived from its visible heading and exposes
  `Slide {n} of 12` to assistive technology.
- Give every slide a stable fragment identifier from `#slide-01` through `#slide-12`.
  Loading a fragment opens that slide directly without replaying earlier motion.
- Support `ArrowRight`, `ArrowDown`, `PageDown`, and `Space` for next; `ArrowLeft`,
  `ArrowUp`, `PageUp`, and `Shift+Space` for previous; `Home` for slide 1; and `End` for
  slide 12. Do not hijack these keys while focus is inside a link or native control.
- Provide always-available Previous and Next controls with at least 44 x 44 CSS-pixel hit
  targets, visible focus rings, and accessible labels. Keyboard or swipe must never be the
  only navigation mechanism.
- On navigation, update the URL fragment, move focus to the current slide heading without
  scrolling it out of view, and announce the new slide number through a polite live region.
- Respect `prefers-reduced-motion: reduce` by removing zoom, parallax, animated counters,
  and cross-slide movement. There is no autoplay and no timed advancement.
- Preserve the full slide reading order in the DOM. At narrow widths, stack the existing
  composition rather than hiding screenshots, copy, captions, controls, or citations.
- All meaningful screenshots require alt text describing the product state and the proof
  visible in it. Decorative texture and connector lines use empty alternative text.
  Important text such as tool names, facts, URLs, and truth labels must remain live HTML,
  even when also present inside a screenshot.
- Text and controls must meet WCAG AA contrast. Color may reinforce but may not be the only
  distinction between human, Data, Code, General, enabled, failed, or completed states.
- Captions identify synthetic material and capture provenance. Links expose meaningful
  visible text and remain usable in print/export. Print CSS renders one complete slide per
  page without clipping.

## 6. Slide contract

### Slide 1 — Ratiflow

**Visible title**

> Ratiflow

**Visible copy**

> The document is the agent runtime.

> Mention the expert. The page supplies the tools. The document keeps the proof.

**Composition**

Use a minimal title block in the left third. A large final Postmortem workspace crop fills
the right two-thirds and runs off the lower-right edge. The crop shows the completed Code
revision and enough of the Flight Recorder to signal the product's distinguishing proof.

**Evidence**

- `01-postmortem-hero-source.png` — untouched deployed viewport after the successful Code
  run.
- `01-postmortem-hero.png` — approved slide crop derived from that source.
- Visible labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO CODE`,
  and the capture-provenance label.
- Gate: live Luna run, linked revision, and recorder sequence all verified on the final SHA.

**Primary criterion:** Creativity & Ambition.

### Slide 2 — The prose survives. The agent work disappears.

**Visible copy**

> Prompts, sources, scope, and authorship scatter across chats and tabs. The next teammate
> inherits the answer—not the evidence.

**Composition**

Place one clean, untouched document crop on the left. On the right, render four editorial
text fragments—`prompt`, `source`, `scope`, and `author`—moving away from the document.
They are conceptual typography, not product controls or a competitor imitation.

**Evidence**

- `02-untouched-postmortem-source.png` — fresh pre-delegation seed capture.
- `02-untouched-postmortem.png` — approved crop.
- Manifest status: `CONCEPTUAL_ONLY`. Do not attach a native or live-runtime label.

**Primary criterion:** Potential Impact.

### Slide 3 — One comment becomes a governed agent transaction.

**Visible copy**

> Mention the expert → assemble the tools → commit a scoped revision.

**Composition**

Use one horizontal sequence of three broad screenshot crops: the selected mention, live
tool discovery, and completed exact-range diff. A single hairline connects them. Labels
under the crops read `MENTION`, `DISCOVER`, and `REVISION`.

**Evidence**

- `03a-mention-source.png` and `03a-mention.png`.
- `03b-discovery-source.png` and `03b-discovery.png`.
- `03c-revision-source.png` and `03c-revision.png`.
- All three frames come from the same Postmortem task, run, and final release SHA.
- Visible labels on discovery/revision frames: `LIVE LUNA · APPLICATION-OWNED WEBMCP
  RELAY` and `SYNTHETIC DEMO CODE`.

**Primary criterion:** WebMCP Leverage.

### Slide 4 — A first-time judge reaches useful work in three familiar moves.

**Visible copy**

> Choose a nickname. Open Postmortem. Select text and type `@Code`.

**Composition**

Use three vertical product crops with oversized live-text numerals `1`, `2`, and `3`:
the nickname field, two-document picker, and the selection/comment coachmark. Preserve
the grouped Humans/Agents mention menu in the third crop if it remains legible.

**Evidence**

- `04a-nickname-source.png` and `04a-nickname.png`.
- `04b-template-picker-source.png` and `04b-template-picker.png`.
- `04c-postmortem-coachmark-source.png` and `04c-postmortem-coachmark.png`.
- Capture in a fresh, isolated browser session. Do not claim elapsed time unless a timed
  rehearsal artifact is later added and cited.

**Primary criterion:** Execution.

### Slide 5 — Postmortem: ask Code to verify the failure.

**Visible copy**

> Select Root cause and ask `@Code` to check the retry behavior against the synthetic
> repository and checkout log.

**Composition**

Make the selected Root Cause passage the dominant visual. Keep the comment composer and
grouped Humans/Agents autocomplete in the aligned margin, with `@Code` selected. The exact
product prompt inside the screenshot must match the frozen Postmortem hero golden; the deck
must not rewrite it for appearance.

**Evidence**

- `05-code-assignment-source.png` — whole workspace immediately before submission.
- `05-code-assignment.png` — slide crop showing selection, prompt, canonical Code target,
  and task scope.
- Visible label: `SYNTHETIC DEMO CODE`.
- Gate: canonical agent target is selected by ID and the task owns the exact range shown.

**Primary criterion:** Execution.

### Slide 6 — The mention changes the page's tool surface.

**Visible copy**

> `toolchange → getTools() → Luna tool_search → executeTool()`

**Composition**

Use an ink-dark proof slide. Put the real Code and General catalog captures on opposite
sides with a restrained `toolchange` transition between them. Visually subordinate common
tools and emphasize only the specialist deltas:

- Code: `search_demo_code`, `read_demo_file`.
- General: `read_company_style_guide`, `check_document_consistency`.

Place one narrow Flight Recorder strip along the bottom with model, origin, registration
generation, and ordered events. Do not display hidden reasoning or unrestricted payloads.

**Evidence**

- `06a-code-catalog-source.png` and `06a-code-catalog.png`.
- `06b-general-catalog-source.png` and `06b-general-catalog.png`.
- `06-role-switch-trace.json` — sanitized ordered events for both catalogs.
- Visible labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `NATIVE WEBMCP`, and
  capture provenance.
- Gate: both catalogs are observed sequentially on one document; physical registration
  generations differ; a real `toolchange` is observed; the old descriptor is rejected.

**Primary criterion:** WebMCP Leverage.

### Slide 7 — Code separates the trigger from the root cause.

**Visible copy**

> Provider throttling triggered the incident. Retry code sustained it.

**Composition**

Use the completed comment's before/after diff as the main visual. A thin evidence line
beneath it shows `commit:7d3c9e1` and `checkout.log`; keep the linked revision and Restore
action visible. The screenshot—not added deck prose—carries the detailed finding.

**Evidence**

- `07-code-result-source.png` and `07-code-result.png`.
- `07-code-result-trace.json` — sanitized Luna/WebMCP task lineage.
- The result must match the frozen synthetic golden: ignored `Retry-After`, up to five
  zero-delay retries, 5.8x retry traffic, and queue growth from 420 to 18,240.
- Visible labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO CODE`,
  and capture provenance.
- Gate: exact-range revision, evidence refs, rationale, model/runtime, and Restore target
  agree across the screenshot, trace, history, and golden.

**Primary criterion:** Execution.

### Slide 8 — History turns agent work into organizational memory.

**Visible copy**

> A new person—or agent—can reconstruct who asked, which tools ran, what changed, and why.

**Composition**

Use one vertical revision spine showing Human, Code, and General authorship. Beside it,
open the General revision detail with its prompt, immutable source context, evidence,
before/after change, model/runtime, and Restore action. Keep comments and revisions visually
distinct but connected.

**Evidence**

- `08-history-lineage-source.png` and `08-history-lineage.png`.
- `08-history-lineage.json` — sanitized expected provenance and revision links.
- Visible labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO CODE`,
  and capture provenance.
- Gate: the human grantor, canonical managed agents, task IDs, attempts, revisions, and
  Restore destination are mutually consistent; no self-declared identity is presented as
  vendor verified.

**Primary criterion:** Potential Impact.

### Slide 9 — Without WebMCP, the document survives; the agent loop does not.

**Visible copy**

> Human editing and comments remain. Dynamic discovery and managed execution fail closed.

**Composition**

Use a clean A/B split of equivalent seeded document states. The left side shows the
enabled relay and discovered tools. The right side shows the honest WebMCP-unavailable
state while ordinary editing and comments remain usable. Use live-text headings `WEBMCP
ON` and `WEBMCP OFF`; do not simulate a broken page.

**Evidence**

- `09a-webmcp-on-source.png` and `09a-webmcp-on.png`.
- `09b-webmcp-off-source.png` and `09b-webmcp-off.png`.
- `09-ablation.json` — exact test setup and observed capability difference.
- Visible labels: `NATIVE WEBMCP` on the left, `WEBMCP OFF · HUMAN MODE` on the right,
  plus capture provenance on both.
- Gate: controlled ablation proves human read/edit/comment behavior still works and both
  managed discovery and execution cannot proceed without `document.modelContext`.

**Primary criterion:** WebMCP Leverage.

### Slide 10 — Data turns a launch debate into inspectable arithmetic.

**Visible copy**

> `@Data` shows that 10 + 4 = 14 fits; 10 + 8 = 18 does not—then revises Success Measures.

**Composition**

Place the Product document's revised Success Measures on the left and its accessible
capacity chart on the right. Let the completed Data comment bridge the two. Preserve the
14-day capacity line, October 15 checkpoint, November 1 commitment, and `$180,000` renewal
only if those facts remain exact in the final Product golden.

**Evidence**

- `10-product-data-result-source.png` and `10-product-data-result.png`.
- `10-product-data-trace.json` — live Data run including `query_demo_metrics` and scoped
  revision submission.
- Visible labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO DATA`,
  and capture provenance.
- Gate: chart data, accessible data table, comment, trace, evidence refs, exact diff, and
  resulting revision all agree with the independent Product golden.

**Primary criterion:** Potential Impact.

### Slide 11 — Luna chooses the action; the browser executes it.

**Visible copy**

> Ratiflow maps Luna's client-executed tool search to
> `document.modelContext.getTools()` and `executeTool()`.

**Composition**

Use an ink-dark single-line architecture flow:

`@mention -> task + lease -> WebMCP catalog <-> Luna Responses -> executeTool -> revision ledger`

Keep nodes as simple live-text labels, not a dashboard. Under the flow, align six event
timestamps from one sanitized real run so the conceptual diagram is visibly grounded in
observed execution.

**Evidence**

- `11-relay-trace.json` — sanitized end-to-end trace for the exact run shown.
- `11-architecture-evidence.json` — release SHA, source-file anchors, catalog digest,
  response/call correlation, revision ID, and verification references used to generate
  the diagram.
- Visible labels: `APPLICATION-OWNED IN-PAGE RELAY — NOT NATIVE LUNA SITE TOOLS`,
  `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `NATIVE WEBMCP`, and capture provenance.
- Gate: the trace proves a client `tool_search_call`, browser `getTools()`, approved
  `tool_search_output`, Luna function call, matching `executeTool()`, function output,
  and committed revision. The API key remains server-only and absent from every artifact.

**Primary criterion:** Creativity & Ambition.

### Slide 12 — One primitive carries all four judging criteria.

**Visible copy**

> **WebMCP Leverage** — the page changes the tools.

> **Execution** — the result is scoped, reliable, and reversible.

> **Potential Impact** — people and agents share one decision trail.

> **Creativity & Ambition** — the document becomes the runtime.

**Composition**

Center one oversized `@` between a fresh Postmortem crop and a fresh Product crop. Place
the four judging lines around it as flat editorial text, not four cards. Close with the
verified live URL, public repository URL, exact release SHA, and one action:

> Try Postmortem → `@Code`

Do not end on a generic thank-you slide.

**Evidence**

- `12a-postmortem-final-source.png` and `12a-postmortem-final.png`.
- `12b-product-final-source.png` and `12b-product-final.png`.
- `12-release.json` — verified public URLs, exact release SHA, license detection, and
  release-manifest reference.
- Gate: URLs are publicly reachable, repository visibility and license are verified, and
  the displayed SHA matches every core capture. Until then, omit the corresponding line;
  never render a placeholder.

**Primary criterion:** all four criteria.

## 7. Slide-to-evidence gate

| Slide | Must be real before inclusion | May be conceptual |
|---|---|---|
| 1 | Final Postmortem live-run state | Cover crop and typography |
| 2 | Untouched seed document | Detached context fragments |
| 3 | Same-lineage mention, discovery, revision | Connector line |
| 4 | Fresh-session NUX states | Oversized step numerals |
| 5 | Exact canonical `@Code` assignment | Selection emphasis |
| 6 | Native role catalog delta and live trace | Layout only |
| 7 | Live Luna result and committed diff | None |
| 8 | Real history/provenance lineage | Revision-spine styling |
| 9 | Controlled native/WebMCP-off ablation | A/B divider |
| 10 | Live Data result, chart, diff, and trace | None |
| 11 | End-to-end trace and source anchors | Simplified flow geometry |
| 12 | Verified final URLs, SHA, and fresh crops | Oversized `@` |

If a required observation is unavailable, remove or replace the claim rather than using
a simulation. The deck may be visually polished before release, but it becomes
submission evidence only when every used asset passes this gate.
