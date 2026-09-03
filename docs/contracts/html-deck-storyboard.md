# Ratiflow v4.3 HTML deck storyboard
_Frozen audience, narrative, copy, composition, and evidence contract · 2026-09-03_

## 1. Purpose

This contract defines the 12-slide Ratiflow WebMCP product demo. The deck walks a
technical audience through the product, the live demonstration paths, the WebMCP
dependency, and concrete next steps.

The communication job is:

> By the end, the audience should understand that Code, Data, and General are descriptive
> bot archetypes; a person separately chooses exactly one temporary Metrics, Repository,
> or Editorial catalog for each assignment; an archetype may suggest a default but never
> grants authority; Ratiflow grants and enforces access; and WebMCP exposes and invokes the
> matching tab-bound site tools until the run ends.

The narrative is `lost agent context -> one new document primitive -> three-step demo ->
bot identity versus assignment access -> Postmortem proof -> durable memory -> ablation ->
Product/Data transfer -> truthful architecture -> WebMCP next steps -> Ratiflow next steps`.

Sources:

- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [OpenAI Site Tools documentation](https://learn.chatgpt.com/docs/webmcp)
- [OpenAI tool search guide](https://developers.openai.com/api/docs/guides/tools-tool-search)
- [GPT-5.6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

Future-direction source metadata is limited to official WebMCP material. These links
inform Ratiflow's proposal; they do not establish that any proposed capability is adopted:

- [Current WebMCP draft](https://webmachinelearning.github.io/webmcp/)
- [WebMCP open questions](https://github.com/webmachinelearning/webmcp#open-questions)
- [Resource subscriptions and invalidation discussion #151](https://github.com/webmachinelearning/webmcp/issues/151)
- [Progress and lifecycle discussion #196](https://github.com/webmachinelearning/webmcp/issues/196)
- [Service workers proposal](https://github.com/webmachinelearning/webmcp/blob/main/docs/service-workers.md)
- [Dynamic definitions and output-schema discussion #167](https://github.com/webmachinelearning/webmcp/issues/167)
- [Identity and delegation discussion #212](https://github.com/webmachinelearning/webmcp/issues/212)
- [Identity, scopes, and delegation-context discussion #96](https://github.com/webmachinelearning/webmcp/issues/96)
- [Receipts and replay discussion #227](https://github.com/webmachinelearning/webmcp/issues/227)

## 2. Global visual contract

- Format is a responsive 16:9 HTML presentation with a 1920 x 1080 design canvas.
- Use the Ratiflow product palette: paper `#f3f5f1`, ink `#20221f`, green `#29685b`,
  violet `#7356a1`, and white paper surfaces. Use the product's Geist type family.
- Product-derived rendered visuals and exact-SHA product screenshots are the primary
  visual language. Every rendered visual must be visibly labeled `PRODUCT FLOW VISUAL`;
  it may explain checked UI, golden facts, or architecture but is never execution proof.
  Do not use stock photography, generic robot art, third-party logos, or invented behavior.
- Each slide makes one claim. Keep the title to one line at the design canvas and visible
  explanatory copy to one short statement unless exact evidence labels require more.
- Use at least 54 px for the cover title, 38 px for slide titles, 25 px for major callouts,
  and 18 px for supporting copy at the 1920 x 1080 canvas.
- Every slide uses the same warm paper canvas. Dark accents may appear inside product or
  architecture visuals, but no slide switches to a separate dark theme. Adjacent slides
  must not repeat the same silhouette.
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
| Rendered HTML/CSS product visualization | `PRODUCT FLOW VISUAL` |
| Bot identity boundary | `BOT EXPERTISE · DESCRIPTIVE` |
| Access boundary | `ASSIGNMENT ACCESS · EXPLICIT GRANT` |
| WebMCP boundary | `WEBMCP · EXPOSES / INVOKES TOOLS` |
| Enforcement boundary | `RATIFLOW SERVER · ENFORCES ACCESS` |
| Future-looking platform thesis | `PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP` |
| Capture provenance | `VERIFIED ON {surface} · {YYYY-MM-DD} · {short SHA}` |

`LIVE LUNA` is allowed only after the named task is observed using the server-held key and
the final release's real `gpt-5.6-luna` Responses path. `NATIVE WEBMCP` is allowed only for
a supported client observing or invoking `document.modelContext`; an adapter, test double,
HTTP call, static screenshot, or replay is not native evidence. Compatibility screenshots
must say `COMPATIBILITY` and cannot substitute for either label.

Never describe Luna as natively supporting OpenAI Site Tools. The approved claim is:

> Ratiflow's application-owned in-page relay lets Luna discover the page's live WebMCP
> tools; the server pins each required next function, Luna composes its strict arguments,
> and the page routes the returned call through `document.modelContext.executeTool()`.
> Bot expertise remains descriptive; Ratiflow maps explicit assignment access to the
> catalog and enforces document, range, and action permissions server-side.

## 4. Visual and evidence provenance

The deck supports two deliberately separate visual classes:

1. `PRODUCT FLOW VISUAL` is rendered HTML/CSS derived from the checked product UI,
   contracts, and independent goldens. It may show the intended interaction, deterministic
   synthetic facts, and required event sequence. It does not prove a live Luna call,
   native WebMCP behavior, deployment status, latency, or reliability and may not carry
   `LIVE LUNA`, `NATIVE WEBMCP`, or `VERIFIED ON` labels.
2. `CAPTURED EVIDENCE` is a screenshot or trace from one observed exact-SHA release. Any
   live-Luna, native-WebMCP, production, or measured claim must use this class and satisfy
   the capture rules below.

Captured deck evidence lives under `demo/v4.2-relay/deck/`. Create
`demo/v4.2-relay/deck/evidence-manifest.json` only when captured evidence is included.
Each captured entry records asset filename and slide; full Git SHA and deployed URL; UTC
timestamp and client/version; viewport and device-pixel ratio; sanitized document/run
lineage where applicable; evidence class; matching sanitized trace/golden/ablation;
visible synthetic labels; and capturer. Rendered visuals instead cite their owning deck
source plus the checked contract/golden and need no invented deployment manifest.

Capture rules:

1. Every captured core frame resolves to the same approved release SHA.
2. A `LIVE LUNA` label requires the named real run through the server-held
   `gpt-5.6-luna` Responses path. Mocked providers and seeded examples are not live proof.
3. A `NATIVE WEBMCP` label requires an observed supported client using the standard
   `document.modelContext` path; record client/version and exact descriptor behavior.
4. Frames presented as one Postmortem or Product lineage must reconcile to that one
   sanitized task/run/attempt and resulting revision.
5. Capture the whole product state before cropping; retain the untouched source and list
   every derived crop in the manifest.
6. Secrets, private URLs, unrestricted provider payloads, and raw model transcripts must
   never enter an asset. A trace may show only bounded, sanitized operational facts and
   never chain-of-thought.
7. Code and data results display their synthetic label in the visual itself.
8. Do not show unresolved placeholders, fake IDs, or future public URLs. Do not claim
   reliability, speed, cost, adoption, or accuracy without the recorded measurement.
9. Rendered visuals never substitute for the separate exact-SHA native and live-provider
   release gates, even when their appearance exactly matches the product.

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
  composition rather than hiding visuals, copy, captions, controls, or citations.
- All meaningful visuals require alt text describing the product state and whether the
  frame is rendered or captured. Decorative texture and connector lines use empty alternative text.
  Important text such as tool names, facts, URLs, and truth labels must remain live HTML,
  even when also present inside a screenshot.
- Text and controls must meet WCAG AA contrast. Color may reinforce but may not be the only
  distinction between human, Data, Code, General, enabled, failed, or completed states.
- Captions identify synthetic material and capture provenance. Links expose meaningful
  visible text and remain usable in print/export. Print CSS renders one complete slide per
  page without clipping.

## 6. Slide contract

Each slide may use the checked rendered composition described below. The file names in an
`Evidence` block are the optional captured-evidence upgrade path; they become mandatory
only if that slide carries a live, native, deployed, or verified label. A `Gate` in those
blocks governs that evidence label, not inclusion of a clearly labeled rendered visual.

### Slide 1 — Ratiflow

**Visible title**

> Ratiflow

**Visible copy**

> Turn @mentions into scoped, reversible agent work—inside the document.

**Composition**

Use a minimal title block in the left third. A large Postmortem workspace visual fills
the right two-thirds and runs off the lower-right edge. The frame shows the checked Code
revision and enough of the Flight Recorder to signal the product's distinguishing proof.

**Evidence**

- `01-postmortem-hero-source.png` — untouched deployed viewport after the successful Code
  run.
- `01-postmortem-hero.png` — approved slide crop derived from that source.
- Captured-evidence labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO CODE`,
  and the capture-provenance label.
- Gate: live Luna run, linked revision, and recorder sequence all verified on the final SHA.

**Section:** `PRODUCT DEMO`.

### Slide 2 — Agent context should not disappear into chat.

**Visible copy**

> Ratiflow keeps prompts, sources, scope, authorship, and outcomes attached to the document.

**Composition**

Place one clean, untouched document crop on the left. On the right, render four editorial
text fragments—`prompt`, `source`, `scope`, and `author`—moving away from the document.
They are conceptual typography, not product controls or a competitor imitation.

**Evidence**

- `02-untouched-postmortem-source.png` — fresh pre-delegation seed capture.
- `02-untouched-postmortem.png` — approved crop.
- Manifest status: `CONCEPTUAL_ONLY`. Do not attach a native or live-runtime label.

**Section:** `WHY IT EXISTS`.

### Slide 3 — From @mention to revision in one governed flow.

**Visible copy**

> Choose the bot and assignment access separately → expose matching site tools → commit a
> bounded, restorable change.

**Composition**

Use one horizontal sequence of three broad product frames: the selected mention plus
access choice, site-tool discovery, and completed exact-range diff. A single hairline connects them. Labels
under the crops read `MENTION`, `DISCOVER`, and `REVISION`.

**Evidence**

- `03a-mention-source.png` and `03a-mention.png`.
- `03b-discovery-source.png` and `03b-discovery.png`.
- `03c-revision-source.png` and `03c-revision.png`.
- All three frames come from the same Postmortem task, run, and final release SHA.
- Captured-evidence labels on discovery/revision frames: `LIVE LUNA · APPLICATION-OWNED WEBMCP
  RELAY` and `SYNTHETIC DEMO CODE`.

**Section:** `CORE INTERACTION`.

### Slide 4 — Demo flow: choose, assign, watch.

**Visible copy**

> Open Postmortem. Assign `@Code` with Repository access to Root cause. Follow tool
> discovery, required calls, and the revision.

**Composition**

Use three vertical product-flow frames with oversized live-text numerals `1`, `2`, and
`3`: `CHOOSE`, `ASSIGN`, and `WATCH EXECUTION`. The first combines nickname and document
selection; the second shows the exact Root cause range, Code identity, and separate
Repository access choice; the third shows the granted catalog, Luna, `executeTool`,
committed revision, and the History/Restore destination.

**Evidence**

- `04a-choose-source.png` and `04a-choose.png`.
- `04b-assign-source.png` and `04b-assign.png`.
- `04c-watch-execution-source.png` and `04c-watch-execution.png`.
- Frames must follow one fresh-session lineage. Do not imply elapsed time or a clean live
  run unless the matching rehearsal artifact passes.

**Section:** `LIVE DEMO`.

### Slide 5 — Three bot archetypes. Dynamic access per assignment.

**Visible copy**

> Code, Data, and General describe expertise. Each run receives exactly one temporary
> Metrics, Repository, or Editorial catalog.

**Composition**

Use a warm-paper mechanism slide with three connected layers:

1. `WHO DOES THE WORK`: the `@Code`, `@Data`, and `@General` archetypes are descriptive;
   they may suggest a default but never grant authority.
2. `WHAT THIS RUN MAY USE`: the person's separate choice of exactly one temporary
   Metrics, Repository, or Editorial catalog plus exact-selection document authority.
3. `RATIFLOW CAPABILITY GRANT`: the seven tab-bound site tools including
   `search_demo_code` and `read_demo_file`.

Below, show the two frozen invariants: `@Code + Metrics` and `@Data + Metrics` receive the
same six logical tools, while `@Code + Metrics` and `@Code + Repository` keep the same bot
but change catalogs and source sequence. Include `@General + Editorial` so all three
archetypes and catalogs are named. Show these labels verbatim:

- `BOT EXPERTISE · DESCRIPTIVE`
- `ASSIGNMENT ACCESS · EXPLICIT GRANT`
- `WEBMCP · EXPOSES / INVOKES TOOLS`
- `RATIFLOW SERVER · ENFORCES ACCESS`

**Evidence**

- `05-capability-grant.json` — frozen bot/access separation and exact profile catalogs.
- `05-repository-task-sequence.json` — sanitized required-function order for the Repository golden.
- Captured native evidence may upgrade the rendered contract only if one catalog
  registration remains active across the matching ordered calls.

**Section:** `SCOPE & CONTROL`.

### Slide 6 — Code verifies the incident and rewrites only the selected section.

**Visible copy**

> Repository evidence separates the external trigger from the retry amplifier in a
> restorable revision.

**Composition**

Use the completed comment's before/after diff as the main visual. A thin evidence line
beneath it shows `commit:7d3c9e1` and `checkout.log`; keep the linked revision and Restore
action visible. The product visual—not added deck prose—carries the detailed finding.

**Evidence**

- `06-code-result-source.png` and `06-code-result.png`.
- `06-code-result-trace.json` — sanitized Luna/WebMCP task lineage.
- The result must match the frozen synthetic golden: ignored `Retry-After`, up to five
  zero-delay retries, 5.8x retry traffic, and queue growth from 420 to 18,240.
- Captured-evidence labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO CODE`,
  and capture provenance.
- Gate: exact-range revision, evidence refs, rationale, model/runtime, and Restore target
  agree across the screenshot, trace, history, and golden.

**Section:** `CODE RESULT`.

### Slide 7 — Every agent change keeps its decision trail.

**Visible copy**

> History preserves who asked, which tools ran, what changed, why it changed, and how to
> restore it.

**Composition**

Use one vertical revision spine showing Human and the same Code bot receiving Repository
then Editorial grants. Beside it, open the second Code revision detail with its prompt,
immutable source context, evidence, before/after change, model/runtime, and Restore action.
Keep comments and revisions visually distinct but connected.

**Evidence**

- `07-history-lineage-source.png` and `07-history-lineage.png`.
- `07-history-lineage.json` — sanitized expected provenance and revision links.
- Captured-evidence labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO CODE`,
  and capture provenance.
- Gate: the human grantor, canonical managed agents, task IDs, attempts, revisions, and
  Restore destination are mutually consistent; no self-declared identity is presented as
  vendor verified.

**Section:** `HISTORY & RESTORE`.

### Slide 8 — Without WebMCP, managed execution stops safely.

**Visible copy**

> The document and comments still work; dynamic discovery and the managed relay fail closed.

**Composition**

Use a clean A/B split of equivalent seeded document states. The left side shows the
enabled relay and discovered tools. The right side shows the honest WebMCP-unavailable
state while ordinary editing and comments remain usable. Use live-text headings `WEBMCP
ON` and `WEBMCP OFF`; do not simulate a broken page.

**Evidence**

- `08a-webmcp-on-source.png` and `08a-webmcp-on.png`.
- `08b-webmcp-off-source.png` and `08b-webmcp-off.png`.
- `08-ablation.json` — exact test setup and observed capability difference.
- Captured-evidence labels: `NATIVE WEBMCP` on the left, `WEBMCP OFF · HUMAN MODE` on the
  right, plus capture provenance on both.
- Gate: controlled ablation proves human read/edit/comment behavior still works and both
  managed discovery and execution cannot proceed without `document.modelContext`.

**Section:** `WEBMCP DEPENDENCY`.

### Slide 9 — The same governed flow works for Data.

**Visible copy**

> `@Data` checks capacity, updates Success Measures, and leaves inspectable arithmetic behind.

**Composition**

Place the Product document's revised Success Measures on the left and its accessible
capacity chart on the right. Let the completed Data comment bridge the two. Preserve the
14-day capacity line, October 15 checkpoint, November 1 commitment, and `$180,000` renewal
only if those facts remain exact in the final Product golden.

**Evidence**

- `09-product-data-result-source.png` and `09-product-data-result.png`.
- `09-product-data-trace.json` — live Data run including `query_demo_metrics` and scoped
  revision submission.
- Captured-evidence labels: `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `SYNTHETIC DEMO DATA`,
  and capture provenance.
- Gate: chart data, accessible data table, comment, trace, evidence refs, exact diff, and
  resulting revision all agree with the independent Product golden.

**Section:** `DATA RESULT`.

### Slide 10 — How a mention becomes a committed revision.

**Visible copy**

> Luna composes each required call; the browser discovers and executes WebMCP tools;
> Ratiflow records the result.

**Composition**

Use a warm-paper single-line architecture flow:

`@mention -> task + lease -> WebMCP catalog <-> Luna Responses -> executeTool -> revision ledger -> assignment catalog withdrawn -> idle catalog restored`

Keep nodes as simple live-text labels, not a dashboard. Under the flow, align the six
required event labels. Add timestamps only when they come from one sanitized captured
run; otherwise label the architecture `PRODUCT FLOW VISUAL`.

**Evidence**

- `10-relay-trace.json` — sanitized end-to-end trace for the exact run shown.
- `10-architecture-evidence.json` — release SHA, source-file anchors, catalog digest,
  response/call correlation, revision ID, and verification references used to generate
  the diagram.
- Always show `APPLICATION-OWNED IN-PAGE RELAY — NOT NATIVE LUNA SITE TOOLS` and the
  visual-class label. Add `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `NATIVE WEBMCP`,
  and capture provenance only for matching captured evidence.
- Captured-evidence gate: one reconciled trace proves a client `tool_search_call`, browser
  `getTools()`, approved `tool_search_output`, server-pinned Luna function call, matching
  `executeTool()`, function output, and committed revision. Without that artifact, the
  rendered architecture is labeled `PRODUCT FLOW VISUAL` and depicts only the required
  sequence. The API key remains server-only and absent from every artifact.

**Section:** `HOW IT WORKS`.

### Slide 11 — Where WebMCP goes next: reactive, durable, accountable.

**Visible copy**

> Our proposal: typed, opt-in pub/sub first; then durable workers, attested scopes, and
> reviewable replay.

**Composition**

Use a light editorial progression with three unequal columns:

- **Today — page-scoped RPC:** register and invoke a tool while its page context is live.
- **10× — reactive capabilities:** typed, opt-in resource invalidation/pub-sub plus stable
  capability lifecycle, progress, and output contracts. Invalidation signals that a typed
  resource changed and may be re-read; it must never become arbitrary prose pushed into
  the model.
- **100× — durable and accountable:** worker-backed sessions, browser-attested delegated
  identity/scopes, cross-page routing, and idempotent receipts with reviewable replay.

Show `PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP` prominently. The in-slide source line
may link only the current draft plus up to three compact official discussions: resources
`#151`, progress `#196`, and the service-workers proposal. Complete official source URLs
are recorded in the source metadata near the top of this storyboard, including open
questions, output schemas, identity/delegation, and receipts/replay.

**Evidence**

- This is Ratiflow's proposed platform direction, informed by official WebMCP drafts and
  discussions. It is not an assertion of adopted, implemented, or browser-shipped behavior.
- Do not add release evidence, `LIVE LUNA`, or `NATIVE WEBMCP` labels to this slide.

**Section:** `NEXT FOR WEBMCP`.

### Slide 12 — Try Ratiflow live.

**Visible copy**

> Choose a bot and assignment access separately, then inspect the site-tool trace,
> revision history, and Restore.

**Composition**

Use two concrete live-demo paths. Postmortem directs the viewer to select Root cause,
assign `@Code + Repository`, and inspect r6. Product directs the viewer to select Success
Measures, assign `@Data + Metrics`, and inspect r7. Beneath them, show the four actions `Choose`, `Assign`,
`Watch`, and `Inspect`, with catalog/required-call and History/Restore details. Close with
the internal live-demo action:

> Open the live demo picker →

Add a verified live URL, public repository URL, and exact release SHA only after each is
observed. Do not end on a generic thank-you slide or a scorecard.

**Evidence**

- `12a-postmortem-final-source.png` and `12a-postmortem-final.png`.
- `12b-product-final-source.png` and `12b-product-final.png`.
- `12-release.json` — verified public URLs, exact release SHA, license detection, and
  release-manifest reference.
- Gate: URLs are publicly reachable, repository visibility and license are verified, and
  the displayed SHA matches every core capture. Until then, omit the corresponding line;
  never render a placeholder.

**Section:** `TRY IT LIVE`.

## 7. Slide-to-evidence gate

| Slide | Allowed rendered visual | Captured-evidence upgrade |
|---|---|---|
| 1 | Checked Postmortem result and recorder composition | Final Postmortem live-run state |
| 2 | Seed document plus detached-context typography | Exact seed screenshot |
| 3 | Checked mention → discovery → revision sequence | Same-lineage captured sequence |
| 4 | Checked choose → assign → watch-execution journey | Fresh-session same-lineage screenshots |
| 5 | Contract-accurate bot/access separation and capability grants | Native catalog plus matching ordered calls |
| 6 | Golden Code diff and synthetic refs | Live Luna result and committed diff |
| 7 | Golden history/provenance lineage | Captured matching lineage |
| 8 | Contract WebMCP-on/off comparison | Controlled native ablation |
| 9 | Golden Data result and chart | Live Data result, diff, and trace |
| 10 | Contract architecture and required event sequence | Composed exact-SHA trace |
| 11 | Clearly labeled proposed WebMCP direction | No captured-evidence upgrade; proposal only |
| 12 | Checked two-document synthesis and internal action | Verified public URLs, SHA, and crops |

If an observation is unavailable, keep the explanatory frame visibly labeled
`PRODUCT FLOW VISUAL` and omit the evidence-only label. The deck becomes submission
evidence only for those captured claims whose artifacts pass this gate; it never converts
rendered visuals into proof by visual similarity.
