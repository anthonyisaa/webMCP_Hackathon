# Ratiflow v4.4 HTML deck storyboard
_Frozen audience, narrative, copy, composition, and evidence contract · 2026-09-03_

## 1. Purpose

This contract defines the 11-slide Ratiflow WebMCP product demo. The deck walks a
technical audience through the product, one focused Code demonstration, the WebMCP
dependency, and concrete next steps.

The communication job is:

> By the end, the audience should understand why people and agents need one durable
> document history; that a person selects exact text and a managed bot without configuring
> permissions; that company policy fixes Data to Metrics, Code to Repository, and General
> to Editorial access; and that Ratiflow stores and enforces the immutable run grant while
> WebMCP exposes and invokes the matching tab-bound site tools until the run ends.

The narrative is `people and agents lose document context -> clean blue/yellow/green
interaction states -> select text + @Code + Assign & run -> fixed company policy -> Code
proof -> durable memory -> WebMCP-off ablation -> model-agnostic API architecture -> two
10x asks -> live app`.

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
  violet `#7356a1`, neutral selection blue, pending yellow, and white paper surfaces.
  Use the product's Geist type family. Color reinforces an explicit state label: initial
  resolved documents have no paint, live selection is blue, open work is yellow, and a
  newly committed agent replacement is green for 30 seconds.
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
  `demo/video-output/**` imagery as v4.4 proof. Those assets depict the superseded
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
| Agent architecture boundary | `APPLICATION-OWNED IN-PAGE RELAY · MODEL VIA API` |
| Rendered HTML/CSS product visualization | `PRODUCT FLOW VISUAL` |
| Shared history boundary | `DOCUMENT HISTORY · SHARED` |
| Company policy boundary | `COMPANY ACCESS · FIXED BY MANAGED BOT` |
| Run-grant boundary | `RUN GRANT · IMMUTABLE` |
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
> Company policy maps the canonical managed bot to one fixed access profile; Ratiflow
> stores that grant immutably on the run and enforces document, range, and action
> permissions server-side. WebMCP exposes and invokes the matching tools.

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

- Represent the deck as one ordered document containing 11 semantic slide sections.
  Each section has an accessible name derived from its visible heading and exposes
  `Slide {n} of 11` to assistive technology.
- Give every slide a stable fragment identifier from `#slide-01` through `#slide-11`.
  Loading a fragment opens that slide directly without replaying earlier motion.
- Support `ArrowRight`, `ArrowDown`, `PageDown`, and `Space` for next; `ArrowLeft`,
  `ArrowUp`, `PageUp`, and `Shift+Space` for previous; `Home` for slide 1; and `End` for
  slide 11. Do not hijack these keys while focus is inside a link or native control.
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

### Slide 2 — Documents are becoming shared workspaces for people and agents.

**Visible copy**

> Without a clear document history, context gets lost, decisions become confusing, and
> agents cannot do their best work.

**Composition**

Place one clean, untouched document crop on the left. On the right, render four editorial
text fragments—`decision`, `source`, `context`, and `author`—moving away from the document.
They are conceptual typography, not product controls or a competitor imitation.

**Evidence**

- `02-untouched-postmortem-source.png` — fresh pre-delegation seed capture.
- `02-untouched-postmortem.png` — approved crop.
- Manifest status: `CONCEPTUAL_ONLY`. Do not attach a native or live-runtime label.

**Section:** `WHY IT EXISTS`.

### Slide 3 — One shared history. Different tools for each agent.

**Visible copy**

> Every agent gets the same document history and provenance. Ratiflow then exposes only
> the tools allowed by company policy.

**Composition**

Use one horizontal sequence of three broad product frames: shared document context,
company-scoped Repository tools, and the completed exact-range diff with provenance. A
single hairline connects them. Labels read `CONTEXT`, `TOOLS`, and `PROVENANCE`.

**Evidence**

- `03a-selection-source.png` and `03a-selection.png`.
- `03b-pending-source.png` and `03b-pending.png`.
- `03c-committed-source.png` and `03c-committed.png`.
- All three frames come from the same Postmortem task, run, and final release SHA.
- Captured-evidence labels on discovery/revision frames: `LIVE LUNA · APPLICATION-OWNED WEBMCP
  RELAY` and `SYNTHETIC DEMO CODE`.

**Section:** `THE RATIFLOW MODEL`.

### Slide 4 — Select text. Mention a bot. Assign & run.

**Visible copy**

> In the Postmortem, select any safe passage, choose `@Code`, write the instruction, and
> run—no permission step.

**Composition**

Make the exact Root cause passage the dominant visual and show only the live selection in
neutral blue: the sentence about commit `7d3c9e1`, `Retry-After`, and five zero-delay
retries. Align the `@Code` instruction, **Assign & run**, and exact-range boundary beside
it. A compact informational line may say `@Code → Repository tools` as automatic company
policy; it must not look or behave like a chooser.

**Evidence**

- `04-code-assignment-source.png` and `04-code-assignment.png`.
- The canonical agent target is selected by ID, the task owns the exact range shown, and
  the public submission contains no access profile.
- Visible label: `SYNTHETIC DEMO CODE` when captured evidence is used.

**Section:** `LIVE DEMO`.

### Slide 5 — The history is shared. Access is company policy.

**Visible copy**

> Every agent gets the same document history and provenance. In this demo, hard-coded
> company policy maps `@Code` to Repository tools.

**Composition**

Use a warm-paper mechanism slide with three connected layers:

1. `SHARED INPUT`: canonical `@Code` receives the full document history and provenance
   available to every agent.
2. `FIXED COMPANY POLICY`: the server-owned mapping resolves Code to Repository access;
   it is hard-coded in this demo and organization-configured in practice.
3. `IMMUTABLE RUN GRANT`: the seven tab-bound site tools including
   `search_demo_code` and `read_demo_file`.

Below, show the complete fixed mapping: `@Data → Metrics · 6 tools`, `@Code → Repository
· 7 tools`, and `@General → Editorial · 7 tools`.
Show these labels verbatim:

- `DOCUMENT HISTORY · SHARED`
- `COMPANY ACCESS · FIXED BY MANAGED BOT`
- `RUN GRANT · IMMUTABLE`
- `WEBMCP · EXPOSES / INVOKES TOOLS`
- `RATIFLOW SERVER · ENFORCES ACCESS`

**Evidence**

- `05-capability-grant.json` — frozen managed-handle policy and exact profile catalogs.
- `05-repository-task-sequence.json` — sanitized required-function order for the Repository golden.
- Captured native evidence may upgrade the rendered contract only if one catalog
  registration remains active across the matching ordered calls.

**Section:** `SCOPE & CONTROL`.

### Slide 6 — Code verifies the incident and rewrites only the selected section.

**Visible copy**

> Repository evidence separates the external trigger from the retry amplifier in a
> restorable revision; the new replacement is green for 30 seconds.

**Composition**

Use the completed comment's before/after diff as the main visual. A thin evidence line
beneath it shows `commit:7d3c9e1` and `checkout.log`; keep the linked revision and Restore
action visible. The replacement uses the same green state as the product's 30-second
new-change feedback and carries an explicit label; the product visual—not added deck
prose—carries the detailed finding.

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

> History keeps the asker, agent, runtime, evidence, revision lineage, and restore point
> attached to the document.

**Composition**

Use one vertical revision spine showing historical Builder r4/r5 and the new managed Code
r6. Beside it, open Code r6 with the asker, agent, model/runtime, Repository evidence, and
Restore action. The `Before / after preserved` line states that the immutable diff exists;
the slide does not claim to render its full text.

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

### Slide 9 — How a mention becomes a committed revision.

**Visible copy**

> An agent running through an API composes each call; the browser discovers and executes
> WebMCP tools; Ratiflow enforces and records the result.

**Composition**

Use a warm-paper single-line architecture flow:

`@managed bot -> company policy + immutable grant -> WebMCP site tools <-> agent API -> executeTool -> revision ledger -> assignment catalog withdrawn -> idle catalog restored`

Keep nodes as simple live-text labels, not a dashboard. Under the flow, align the six
required event labels. Add timestamps only when they come from one sanitized captured
run; otherwise label the architecture `PRODUCT FLOW VISUAL`.

**Evidence**

- `09-relay-trace.json` — sanitized end-to-end trace for the exact run shown.
- `09-architecture-evidence.json` — release SHA, source-file anchors, catalog digest,
  response/call correlation, revision ID, and verification references used to generate
  the diagram.
- Always show `APPLICATION-OWNED IN-PAGE RELAY · MODEL VIA API` and the
  visual-class label. Add `LIVE LUNA · APPLICATION-OWNED WEBMCP RELAY`, `NATIVE WEBMCP`,
  and capture provenance only for matching captured evidence.
- Captured-evidence gate: one reconciled trace proves a client `tool_search_call`, browser
  `getTools()`, approved `tool_search_output`, server-pinned agent function call, matching
  `executeTool()`, function output, and committed revision. Without that artifact, the
  rendered architecture is labeled `PRODUCT FLOW VISUAL` and depicts only the required
  sequence. The API key remains server-only and absent from every artifact.

**Section:** `HOW IT WORKS`.

### Slide 10 — Two things WebMCP needs for real agent work.

**Visible copy**

> Today, tool execution depends on a live page. The next step is keeping context current
> and approved work durable.

**Composition**

Use two equal editorial cards labeled `10× ASK · 01` and `10× ASK · 02` so 10× reads as
an ambition rather than a measured performance claim. Each card has one feature headline,
one plain-language use case, and one compact engineering requirement:

- **10× — Tell agents when relevant information changes.** Use case: an agent refreshes
  affected facts instead of restarting or continuing with stale context. Engineering:
  typed resources plus change notifications let the agent re-read only invalidated state.
- **10× — Let approved tasks finish after the page closes.** Use case: long-running work
  survives navigation and returns a clear, reviewable result. Engineering: worker-backed
  sessions carry delegated identity and scope, with idempotent receipts.

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

### Slide 11 — Try Ratiflow live.

**Visible copy**

> See the full people-and-agents document workflow in the live app.

**Composition**

End on one uncluttered internal live-app action:

> Open the live Ratiflow app →

Add a verified live URL, public repository URL, and exact release SHA only after each is
observed. Do not end on a generic thank-you slide or a scorecard.

**Evidence**

- The relative `/` target must route to the live app in local, preview, and production
  environments. Do not add release metadata, secondary paths, or placeholder URLs.

**Section:** `TRY IT LIVE`.

## 7. Slide-to-evidence gate

| Slide | Allowed rendered visual | Captured-evidence upgrade |
|---|---|---|
| 1 | Checked Postmortem result and recorder composition | Final Postmortem live-run state |
| 2 | Seed document plus detached-context typography | Exact seed screenshot |
| 3 | Checked blue selection → yellow pending → green committed sequence | Same-lineage captured sequence |
| 4 | Checked select → mention → Assign & run journey with no permission chooser | Fresh-session same-lineage screenshots |
| 5 | Contract-accurate fixed managed-bot policy and immutable run grant | Native catalog plus matching ordered calls |
| 6 | Golden Code diff, synthetic refs, and 30-second green result state | Live Luna result and committed diff |
| 7 | Golden Code history/provenance lineage without alternate-access pairing | Captured matching lineage |
| 8 | Contract WebMCP-on/off comparison | Controlled native ablation |
| 9 | Contract architecture and required event sequence | Composed exact-SHA trace |
| 10 | Clearly labeled proposed WebMCP direction | No captured-evidence upgrade; proposal only |
| 11 | Minimal internal live-app action | Reachable live app |

If an observation is unavailable, keep the explanatory frame visibly labeled
`PRODUCT FLOW VISUAL` and omit the evidence-only label. The deck becomes submission
evidence only for those captured claims whose artifacts pass this gate; it never converts
rendered visuals into proof by visual similarity.
