# Ratiflow product specification

Version 1.5 · Frozen for the live agent-session correction · Owner: Ant · 2026-08-31

This file is the product source of truth. Exact seed facts live in
[`docs/contracts/hero-scenario.md`](docs/contracts/hero-scenario.md); exact WebMCP and
wire contracts live in [`docs/contracts/capability-contract.md`](docs/contracts/capability-contract.md)
and [`docs/contracts/live-agent-session-contract.md`](docs/contracts/live-agent-session-contract.md)
for the decision workspace, and [`docs/contracts/editor-contract.md`](docs/contracts/editor-contract.md)
for the shared-document surface.
Implementation may simplify presentation, but it may not invent a state, tool, actor,
authority, seed fact, or error outside those contracts.

## 0. Product surfaces

Ratiflow has two deliberately separate products:

- `/` is the flagship seeded decision room described in Sections 1–13. The same product
  remains at `/decision-demo` as a stable alias.
- `/document/[shareToken]` preserves the pageless shared note, four-stage harness,
  presence/edit awareness, and collaborative annotation queue. A direct document URL or
  its own New-note action creates a note; it no longer owns the flagship root.

The shared note is pageless: borderless title/body dominate a continuous writing
surface; a compact toolbar contains New note, current stage, presence, and share; a
quiet 340px right rail contains target preview, annotation composer, ordered queue, and
manual agent handoff. The rail becomes an accessible drawer on small screens. No launch
card, paper sheet, dashboard, Capability Field, or permanent chat transcript appears.

The note's stages are exactly `BRAINSTORMING`, `RESEARCHING`, `REFINE`, and
`READY_TO_SHIP`. A human may choose any stage; agents can read but never change it. A
forward human stage move atomically appends one target-stage preparation annotation for
that human's paired agent. Backward/no-op moves append none. Stage-specific presets and
custom instructions append multiple revision-anchored annotations instead of replacing
one global request.

Humans see all collaborators' annotations, while the server lets each paired agent list
and apply only its human's pending items. Non-overlapping anchors safely rebase after
edits; overlapping exact ranges become visibly stale. `Cmd/Ctrl+K` focuses the rail
composer. Native mouse/keyboard context menus are never intercepted, preserving browser
dictionary and spelling support.

**Ask ChatGPT** copies a precise “process my queue” prompt and explicitly says it was not
sent. WebMCP exposes page tools during an agent turn but provides no normative idle-agent
wake-up API, so the product never claims an external model was notified or started.

Shared notes are server-backed, account-free, temporary, and link-accessible. Participants
see who is present and whether someone is editing the title/body. Whole-note autosaves
use compare-and-swap revisions; a dirty client preserves its draft on remote change and
requires an explicit conflict choice. This is collaboration awareness, not CRDT merging,
remote cursors, or keystroke streaming. Exact behavior, DTOs, annotation mappings, errors,
and release criteria live in the editor contract and `src/document/contracts.ts`.

Shared-note secondary acceptance is:

1. a direct New-note action becomes an empty editable note at a high-entropy
   `/document/[shareToken]` URL without a launch gate;
2. canonical reload reuses or safely rejoins the share route, and invalid/expired links
   offer New note;
3. autosave, human-only stages, atomic forward-stage preparation, sharing, presence/edit
   awareness, safe conflicts, and revision-safe agent undo work without WebMCP;
4. the right rail can append and retain multiple authored annotations, presents exact
   target excerpts, and works as a drawer at 390px;
5. native context menus remain available and `Cmd/Ctrl+K` focuses the rail composer;
6. the copy/send handoff never claims an agent was started, while a real native paired
   agent can list only its human's queue and apply exact captured targets in sequence;
7. note and decision routes never expose each other's WebMCP tools.

## 1. Decision-room product promise

**Ratiflow is a WebMCP collaboration workspace where agents prepare, people ratify, and
work moves.** The flagship decision room is a consequential launch-scope decision shared
by a product lead, an engineering lead, and an agent that appears as a real participant.

The primary experience is not one request followed by one response. A browser agent can
join with a renewable lease, catch up from an activity cursor, wait for addressed
teammate activity, claim work, contribute under its own identity, ask for human input,
and leave. If a browser turn ends, a person may explicitly enable a visible in-page
runner to pick up queued work through the same registry while the page remains open.
The page never claims it can wake ChatGPT or continue after it closes.

The technical idea is **capability compilation**:

```text
effective WebMCP tools = f(agent engagement, workflow state, page selection, member session, revision)
```

One registry combines engagement tools with the compiler's one decision-capability
value; the page's visible Capability Field and native WebMCP registrations consume that
same registry snapshot. When engagement, decision state, or selection changes, the
agent's actual discoverable action space changes. This is not a skinned MCP server or a
REST API catalog: the live page, with the user's current session and selection, is the
authority that exposes the tools.

Lineage line for the README and video:

> React made the interface a function of state. WebMCP lets the agent's action space be
> a function of state.

Public name for the hackathon: **Ratiflow — WebMCP collaboration workspace**. The
qualifier keeps the brand distinct from similarly spelled products. Tagline:
**Agents prepare. People ratify. Work moves.**

## 2. Competition alignment

| Judging criterion | What judges can verify |
|---|---|
| WebMCP leverage | Native join/catch-up/live-wait loop; state-dependent decision registration; page-selection context; stale-handle behavior; one registry shared by native and page callers |
| Execution | A deployed, resettable, two-person flow from addressed live work through agent recovery, human ratification, downstream propagation, and provenance |
| Potential impact | Teams lose decisions in chat and stale documents; Ratiflow makes the current authority, constraints, and consequences legible to both humans and agents |
| Creativity and ambition | Capability compilation turns WebMCP into a dynamic coordination primitive rather than a static menu of API wrappers |

WebMCP leverage is the first tie-break and must remain the most visible part of the
product and video. If WebMCP is removed, the ordinary human UI still works, but the
agent loses zero-setup discovery, current page selection, dynamic authority, and native
capability invalidation. That loss is the ablation proof.

## 3. Canonical hero journey

The one scenario is a B2B analytics team's decision about CSV export in an October 15
launch. Northstar Health's $180,000 renewal needs usable export by November 1. Maya
Chen is the Product Lead and sole ratifier; Jordan Lee is the Engineering Lead and the
second collaborator.

The seeded workspace is READY at revision 7: launch capacity is 18 engineer-days and
the domain recommendation, full GA, consumes all 18. The page initially selects the
decision root. A browser agent calls `join_session`; Ratiflow Agent becomes `LIVE` and
waits at the returned activity cursor. Maya creates an option-scoped task asking for a
risk check. The wait resolves from the task event, the agent atomically claims it, and
its attributed comment appears in the shared thread.

Maya selects O1 and the actual native surface adds its two option-scoped decision tools
without changing workspace revision. While the agent is preparing a revision-7
contribution from that context, Jordan changes capacity to 14 because of incident rotation. Supabase
Realtime updates Maya's page, the workspace becomes CONTESTED at revision 8, and
`prepare_decision` disappears from native discovery. `add_evidence` remains registered,
so the agent's revision-7 write reaches page code and is rejected with the exact
collaborator-authored diff.

The agent inspects revision 8, compares the options, and calls `recommend_option` for the
invite-only Northstar beta. At revision 9 the decision is READY, the page follows the new
recommendation, and `prepare_decision` returns. The agent prepares a review card at
revision 10. Maya may edit its local draft fields, then submits those edits and
ratification in one ordinary-UI transaction at revision 11. The customer launch brief
changes from BLOCKED to READY and inherits the decision.

The submission video and release rehearsal use a real second browser session for Jordan.
That session may be operated by a person/judge or a clearly labeled deterministic
synthetic driver. A synthetic driver must use the same UI/service path; a timer,
single-window mock, bypassed domain mutation, or fabricated UI state is not eligible.

## 4. Critical user stories

### People

1. A judge launches an isolated copy of the seeded workspace in one click.
2. Maya and Jordan act through distinct attributed sessions and see the same revision in
   realtime.
3. A user can see the tools available to the agent now, unavailable actions with exact
   reasons, the selected target, and every capability diff without opening DevTools.
4. Jordan's capacity update changes the actual WebMCP tool set on Maya's live page.
5. Agent contributions appear as attributed, editable, reviewable objects, never as
   silent accepted decisions.
6. Maya alone can ratify a prepared decision in the UI and immediately see its
   downstream consequence.
7. Any participant can trace the decision through actor, origin, tool, base revision,
   resulting revision, rationale, review status, and changed entities.
8. A person can address the agent, see its live/idle/away state, answer its question,
   and control standing instructions without using an agent sidebar.

### Agents

1. A new agent first discovers only `join_session` and `catch_up`, with no MCP server
   configuration, API key, OAuth flow, or copied workspace identifier.
2. The agent catches up from an opaque activity cursor and reads compact structured
   state instead of loading everything or scraping the DOM.
3. Page selection scopes selected-option and follow-up tools to the object the human is
   viewing.
4. A stale write returns `STALE_WORK_STATE`, the exact changes since its base revision,
   and a usable next action; the agent can recover without human repair.
5. `why_not` exposes the same unmet predicates used by the compiler.
6. The agent may prepare a decision but no WebMCP tool or agent route can ratify it.
7. A fresh session can answer what was decided, why, what changed, what remains open,
   and who ratified from the page's structured state and provenance.
8. A live agent can wait without busy polling, react to an addressed task, claim it
   before work, post under its own identity, and ask a persisted question.
9. Browser and optional auto callers cannot work the same task concurrently, and every
   accepted effect records which path acted.

## 5. Workflow contract

| State | Meaning | Transition out |
|---|---|---|
| `OPTIONS` | Seeded options exist; evidence or a recommendation is incomplete | A material challenge or conflicting evidence makes the comparison contested |
| `CONTESTED` | The selected recommendation violates a live constraint or has a blocking challenge | Evidence supports a feasible selected option and all blocking challenges are resolved |
| `READY` | At least two options exist; customer deadline and capacity evidence exist; selected option fits capacity; zero blocking challenges | Agent prepares a decision for human review |
| `REVIEW` | An agent-prepared decision card awaits a person | Maya edits or ratifies in the UI; edits remain REVIEW |
| `COMMITTED` | A human ratified the decision | Terminal for the hero decision; downstream work may proceed |

The state is derived from persisted facts and events, not set directly by a client.
Workspace revision is monotonic. Realtime is notification only; every page refetches
authoritative state before recompiling.

## 6. Exact WebMCP catalog

There are ten stable decision-tool definitions:

1. `inspect_decision`
2. `inspect_selected_option`
3. `recommend_option`
4. `challenge_option`
5. `add_evidence`
6. `compare_options`
7. `prepare_decision`
8. `trace_decision`
9. `inspect_followup`
10. `why_not`

State matrix before selection augmentation:

| State | Registered tools |
|---|---|
| `OPTIONS` | `inspect_decision`, `recommend_option`, `add_evidence`, `why_not` |
| `CONTESTED` | `inspect_decision`, `recommend_option`, `add_evidence`, `compare_options`, `why_not` |
| `READY` | `inspect_decision`, `recommend_option`, `add_evidence`, `compare_options`, `prepare_decision`, `why_not` |
| `REVIEW` | `inspect_decision`, `trace_decision`, `why_not` |
| `COMMITTED` | `inspect_decision`, `trace_decision`, `why_not` |

Selection augmentation is exact:

- Selecting an option in `OPTIONS`, `CONTESTED`, or `READY` adds
  `inspect_selected_option` and `challenge_option`. Their registered callbacks capture
  that option and the current `contextEpoch`. `recommend_option` accepts an explicit
  option ID so the agent can recover autonomously after comparing options.
- Selecting `customer-launch-brief` in `COMMITTED` adds `inspect_followup`.
- Changing a selected target invalidates previously fetched handles even when the tool
  names stay the same; the client must refresh.

`add_evidence` intentionally remains registered across the READY → CONTESTED hero
transition so the stale request reaches the callback and can return the domain diff.
The demo does not misuse a removed tool to manufacture an app error: the observed native
client may reject a removed handle before dispatch.

`ratify_decision` and `commit_decision` do not exist. Tool presence guides the agent;
server-side authorization and state validation enforce the boundary.

The single registry also owns eleven collaboration tools in this exact order:
`join_session`, `wait_for_activity`, `catch_up`, `leave_session`, `get_state_brief`,
`get_thread`, `get_inbox`, `claim_agent_task`, `resolve_task`, `post_comment`, and
`request_human_input`. A fresh page advertises only `join_session` and `catch_up`.
Catch-up unlocks invoked reads/writes plus current decision capabilities. Join additionally
unlocks wait/leave and a visible 45-second renewable live lease. Exact schemas, honest
read-only annotations, cursor behavior, claims, and result shapes live in the live-session
contract.

## 7. Registration and result behavior

- The top-level page registers imperative tools through `document.modelContext`.
- A small feature-detection adapter may observe `navigator.modelContext` for preview
  compatibility, but it is not the normative contract.
- Stable names, schemas, and handlers come from one caller-neutral registry. Native
  WebMCP and the page runner are adapters over it. Capability change aborts only affected
  target registrations with `AbortController`; a selection change never aborts a live
  wait.
- The bridge treats `toolchange`, page-side `getTools`/`executeTool`, and callback context
  as optional client features. It never relies on event ordering.
- Every callback revalidates current state, captured target, `contextEpoch`, and expected
  workspace revision. It honors the execution signal when supplied and tolerates clients
  that omit it, as recorded in [`VALIDATION.md`](VALIDATION.md).
- Genuine read tools declare `readOnlyHint: true`. Join, leave, claims, and all visible
  writes do not pretend to be reads. Results containing human- or agent-authored
  content declare `untrustedContentHint: true`.
- Schemas and server validation independently bound every string and array.
- All callback results use the envelopes in the capability contract and are JSON
  serializable.

## 8. Human authority and session boundary

Human-only means exactly this: no WebMCP tool and no agent-specific API route can create
an accepted commitment. The server assigns actor, membership, and origin from the signed
per-tab demo session; model input cannot choose them. The human ratification route
requires Maya's member session, a current revision, a REVIEW decision, and an explicit UI
interaction.

This is not a claim that an arbitrary browser-driving attacker with Maya's active session
cannot imitate a click. The challenge entry demonstrates product authority separation,
not hardened enterprise identity.

Each demo launch clones the seed into a new workspace and issues separate high-entropy,
signed Maya, Jordan, and fixed-agent sessions. A page UUID is bound to the agent handle
server-side; caller and presence are adapter-derived, never model input. A one-time
fragment bootstrap can open the Jordan view,
exchange into `sessionStorage`, scrub the URL, and become non-replayable. No account,
email, password, public join directory, or memorable bearer code is P0.

## 9. Product experience

Visual direction is a clean **Decision Instrument**, not a chat app or kanban board:

- warm canvas `#F7F7F4`, white panels, ink `#171817`, action blue `#255BFF`;
- restrained green, amber, and red only for trust/status;
- Geist Sans with a mono face for revisions, tools, and provenance;
- 4px spacing rhythm, 12px controls, 16px primary panels;
- keyboard-visible focus, WCAG AA text contrast, reduced-motion support, and useful
  loading, disconnected, empty, and error states.

The signature visual is the **Capability Field**. It shows the exact compiled set, plain-
language unavailable actions, revision, selected target, and animated diffs. During a
stale rejection it compares the agent's old basis in dashed amber with the current
collaborator-authored fact in solid blue. Generic assistant chat, gradients, glass,
cyberpunk motifs, and decorative dashboards are out.

The decision room also shows Ratiflow Agent in the participant strip, a waiting-work
badge and inbox, target-scoped Ask-agent composer, attributed comment thread, inline
question cards, and an off-by-default standing-instructions control. Its capability panel
renders the registry's actually registered names, including engagement changes; it does
not reconstruct them from labels.

The ordinary UI must complete the full journey when WebMCP is unavailable. That is
fallback usability, not feature equivalence: only a supported WebMCP client receives the
native agent action surface.

## 10. Architecture and data

- Next.js App Router, React, TypeScript, Tailwind, pnpm, deployed on Vercel.
- Supabase Postgres for authoritative state and append-only events; Realtime for
  collaborator notifications.
- A cursor-addressed collaboration log is independent of workspace revision. Presence
  and task ownership use expiring server leases; all visible effects and activity events
  commit atomically.
- A pure application module compiles capabilities. Packaging it for reuse is P1.
- One page-owned tool registry executes both native browser calls and validated proposals
  from the optional in-page runner. The backend model endpoint plans only and cannot
  execute tools.
- One compare-and-swap domain mutation appends an event and advances workspace revision
  atomically. `requestId` makes retries idempotent.
- Persisted events include server-assigned actor/member, `actorType`, `origin`, optional
  `toolName`, base/result revisions, rationale, review status, and changed entities.
- The exact mutation and result envelopes are frozen in the capability contract and
  mirrored by [`src/contracts/index.ts`](src/contracts/index.ts).

## 11. P0 acceptance criteria

1. The live HTTPS URL launches an isolated decision room without credentials or setup.
2. A real Jordan session changes 18 → 14 and Maya's page receives it without reload; the
   labeled synthetic fallback uses the same service and event shape.
3. Fresh native discovery contains only join/catch-up; joining makes the agent visible,
   unlocks the live surface, and an addressed teammate task resolves the wait transport
   in under two seconds p95 before model latency.
4. Catch-up returns only bounded cursor-addressed changes plus current inbox; cursor and
   workspace revision remain independent.
5. Native discovery after engagement exactly matches the registry and visible Capability
   Field.
6. READY → CONTESTED removes `prepare_decision`; selecting/scoping refreshes native
   handles; no phantom tools remain after refetch.
7. The revision-7 `add_evidence` request at revision 8 returns the golden structured diff
   and no mutation.
8. Browser-vs-auto and auto-vs-auto claim races produce one winner and one visible result;
   auto pickup is off by default and server-suppressed during a live browser lease.
9. The agent can persist a human-input question and resume after an ordinary-UI answer.
10. The agent recovers, prepares O2, and never requires a hidden prompt or manual repair.
11. Only Maya's UI ratifies; direct agent-origin attempts fail server-side.
12. Ratification moves `customer-launch-brief` BLOCKED → READY and `inspect_followup`
   appears when the item is selected.
13. Provenance/activity and the five golden continuity answers match the contracts.
14. Reset reproduces revision 7 and the seed exactly; the full release flow passes five
    consecutive times.
15. Domain/protocol, native-browser, and agent-trajectory evidence meet
    [`EVALS.md`](EVALS.md).
16. The repository is public with MIT license, clear run instructions, committed evidence,
    a working live URL, four Devpost answers, and a public narrated video under three
    minutes.

## 12. Decision-demo scope discipline

The decision-room P0 excludes accounts, generic decision-workspace creation, three-word
join codes, rich text, templates, a workflow engine, multiple decision scenarios,
generalized roles, billing, agent-to-agent orchestration, a published compiler package,
headless/background execution, agent ratification, and reliance on built-in Gemini. The
separate plain shared-note surface in Section 0 is intentional and does not expand the
decision domain. Do not add another capability while either surface's acceptance
criteria are incomplete.

P1, only after the hero is reliable: package the compiler, add a prompt-injection beat,
and broaden domain examples. Mobile must remain usable, but the polished demonstration
targets desktop and a two-window layout.

## 13. Submission proof order

The video must show working product state in its first 10–15 seconds, then: fresh native
discovery; agent join and visible presence; a teammate-created task waking the wait;
attributed claim/comment; dynamic capability change; honest optional auto pickup if it
passed its gate; catch-up; Maya's UI-only ratification; downstream change and provenance.
The four written answers use the same evidence. Judges must not need to run the app to
understand why WebMCP is essential.
