# Ratiflow product specification

Version 1.2 · Frozen for implementation · Owner: Ant · 2026-08-30

This file is the product source of truth. Exact seed facts live in
[`docs/contracts/hero-scenario.md`](docs/contracts/hero-scenario.md); exact WebMCP and
wire contracts live in
[`docs/contracts/capability-contract.md`](docs/contracts/capability-contract.md).
Implementation may simplify presentation, but it may not invent a state, tool, actor,
authority, seed fact, or error outside those contracts.

## 1. Product promise

**Ratiflow is a WebMCP collaboration workspace where agents prepare, people ratify, and
work moves.** Its demonstration is a consequential launch-scope decision shared by a
product lead, an engineering lead, and an agent.

The technical idea is **capability compilation**:

```text
effective WebMCP tools = f(workflow state, page selection, member session, revision)
```

One compiled value drives both the page's visible Capability Field and its native
WebMCP registrations. When the decision changes, the agent's actual discoverable action
space changes. This is not a skinned MCP server or a REST API catalog: the live page,
with the user's current session and selection, is the authority that exposes the tools.

Lineage line for the README and video:

> React made the interface a function of state. WebMCP lets the agent's action space be
> a function of state.

Public name for the hackathon: **Ratiflow — WebMCP collaboration workspace**. The
qualifier keeps the brand distinct from similarly spelled products. Tagline:
**Agents prepare. People ratify. Work moves.**

## 2. Competition alignment

| Judging criterion | What judges can verify |
|---|---|
| WebMCP leverage | Native discovery with no connector setup; state-dependent registration; page-selection context; stale-handle behavior; the same compiled object rendered to humans and agents |
| Execution | A deployed, resettable, two-person flow from live constraint change through agent recovery, human ratification, downstream propagation, and provenance |
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
decision root; Maya selects O1 and the actual native surface adds its two option-scoped
tools without changing workspace revision. While the agent is preparing a revision-7
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

### Agents

1. A new agent discovers the valid tools from the page with no MCP server configuration,
   API key, OAuth flow, or copied workspace identifier.
2. Inspection returns structured state instead of requiring DOM scraping.
3. Page selection scopes selected-option and follow-up tools to the object the human is
   viewing.
4. A stale write returns `STALE_WORK_STATE`, the exact changes since its base revision,
   and a usable next action; the agent can recover without human repair.
5. `why_not` exposes the same unmet predicates used by the compiler.
6. The agent may prepare a decision but no WebMCP tool or agent route can ratify it.
7. A fresh session can answer what was decided, why, what changed, what remains open,
   and who ratified from the page's structured state and provenance.

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

There are ten stable tool definitions total:

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

## 7. Registration and result behavior

- The top-level page registers imperative tools through `document.modelContext`.
- A small feature-detection adapter may observe `navigator.modelContext` for preview
  compatibility, but it is not the normative contract.
- Stable names and schemas come from one catalog. Capability change aborts registrations
  with `AbortController`; there is no `updateTool`, iframe tool, or declarative form tool.
- The bridge treats `toolchange`, page-side `getTools`/`executeTool`, and callback context
  as optional client features. It never relies on event ordering.
- Every callback revalidates current state, captured target, `contextEpoch`, and expected
  workspace revision. It honors the execution signal when supplied and tolerates clients
  that omit it, as recorded in [`VALIDATION.md`](VALIDATION.md).
- Read tools declare `readOnlyHint: true`. Results containing human- or agent-authored
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
signed Maya and Jordan sessions. A one-time fragment bootstrap can open the Jordan view,
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

The ordinary UI must complete the full journey when WebMCP is unavailable. That is
fallback usability, not feature equivalence: only a supported WebMCP client receives the
native agent action surface.

## 10. Architecture and data

- Next.js App Router, React, TypeScript, Tailwind, pnpm, deployed on Vercel.
- Supabase Postgres for authoritative state and append-only events; Realtime for
  collaborator notifications.
- A pure application module compiles capabilities. Packaging it for reuse is P1.
- One compare-and-swap domain mutation appends an event and advances workspace revision
  atomically. `requestId` makes retries idempotent.
- Persisted events include server-assigned actor/member, `actorType`, `origin`, optional
  `toolName`, base/result revisions, rationale, review status, and changed entities.
- The exact mutation and result envelopes are frozen in the capability contract and
  mirrored by [`src/contracts/index.ts`](src/contracts/index.ts).

## 11. P0 acceptance criteria

1. The live HTTPS URL launches an isolated seed without credentials or setup.
2. A real Jordan session changes 18 → 14 and Maya's page receives it without reload; the
   labeled synthetic fallback uses the same service and event shape.
3. Native discovery on the release judging surface exactly matches the compiler and the
   visible Capability Field.
4. READY → CONTESTED removes `prepare_decision`; selecting/scoping refreshes native
   handles; no phantom tools remain after refetch.
5. The revision-7 `add_evidence` request at revision 8 returns the golden structured diff
   and no mutation.
6. The agent recovers, prepares O2, and never requires a hidden prompt or manual repair.
7. Only Maya's UI ratifies; direct agent-origin attempts fail server-side.
8. Ratification moves `customer-launch-brief` BLOCKED → READY and `inspect_followup`
   appears when the item is selected.
9. Provenance and the five golden continuity answers match the scenario contract.
10. Reset reproduces revision 7 and the seed exactly; the full release flow passes five
    consecutive times.
11. Domain/protocol, native-browser, and agent-trajectory evidence meet
    [`EVALS.md`](EVALS.md).
12. The repository is public with MIT license, clear run instructions, committed evidence,
    a working live URL, four Devpost answers, and a public narrated video under three
    minutes.

## 12. Scope discipline

P0 excludes accounts, generic workspace creation, three-word join codes, blank-workspace
brain dumps, rich text, templates, a workflow engine, multiple scenarios, generalized
roles, billing, agent-to-agent orchestration, a published compiler package, and reliance
on built-in Gemini. Do not add one while any acceptance criterion above is incomplete.

P1, only after the hero is reliable: package the compiler, add a prompt-injection beat,
and broaden domain examples. Mobile must remain usable, but the polished demonstration
targets desktop and a two-window layout.

## 13. Submission proof order

The video must show working product state in its first 10–15 seconds, then: native tool
discovery and visible Capability Field; Jordan's live update and capability removal; the
stale diff and autonomous agent recovery; Maya's UI-only ratification; downstream change
and provenance. The four written answers use the same evidence. Judges must not need to
run the app to understand why WebMCP is essential.
