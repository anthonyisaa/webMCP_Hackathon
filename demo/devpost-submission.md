# Ratiflow — Devpost submission draft

**Tagline:** People direct. Agents propose. Decisions remember.

**Short description:** Launch teams lose why recommendations changed when decisions
scatter across teammate and agent chats. Ratiflow keeps exact assignments, human
decisions, and rejected facts with one calm shared memo, so the next agent builds on the
decision instead of restarting the debate. A paired agent waits through the live page,
reads memory, and returns a proposal that only the work creator can apply.

This copy describes the v3 release candidate. Public links, native claims, and release
identity stay pending until they are observed on one approved exact build.

## Why is this a strong fit for WebMCP?

Document collaboration depends on context a static tool catalog cannot safely express:
which top-level memo is open, which revision is authoritative, what another person just
assigned, which paired agent owns it, and whether a candidate change is still awaiting
a human decision.

Ratiflow makes the live page that coordination boundary. Maya's already-active agent
discovers five structured tools directly from the memo:

- `inspect_document` for authoritative text, revision, activity, and collaborators;
- `read_document_memory` for chronological work, proposals, diffs, and human rationale;
- `list_my_work` for only the orders assigned to Maya's paired identity; and
- `wait_for_my_work` for an explicit-cursor, cancellable wait on cross-human activity;
  and
- `submit_work_proposal` for an ownership-checked candidate that never edits directly.

When Jordan assigns selected text to Maya, the native wait resolves. The proposal tool
was already present so a turn-start tool snapshot cannot strand the assignment, but the
server accepts it only for Maya's authenticated paired identity and pending work. It
stores a bounded replacement and summary but cannot edit the memo.
There is no tool to assign, reassign, directly edit, accept, reject, cancel, or choose an
actor, assignee, document, or text range.

The Work panel reports truthful page-local states: tools connecting, all five tools ready, this page's paired agent
listening or preparing a proposal, work waiting, or WebMCP unavailable. **Check now**
refreshes page state but cannot wake a model; Ratiflow never presents this as hosted
background execution.

WebMCP is essential rather than decorative here: it gives an external agent a
zero-configuration, page-local rendezvous with current work and shared memory. Without
it, the document remains a useful human editor, but the agent would need pasted context,
DOM scraping, or a broad remote API and would lose the live authority boundary.

## How does Ratiflow create a better user experience?

The flagship opens as a blank title and body, not a workflow dashboard. A compact top
bar handles new notes, save state, presence, and sharing. A quiet **Work | Memory**
margin holds only the collaboration state that matters. The same document remains
usable on desktop and at 390px, and it keeps ordinary editing functional when WebMCP is
absent.

Agent work starts where the writing already is. Select a useful passage and choose
**Ask agent**, press `Cmd/Ctrl+K`, or use an unmodified pointer-origin right-click for
**Rewrite**, **Research**, and **Assign…**. Modifier-assisted right-click, the Context
Menu key, `Shift+F10`, empty selection, and non-editor targets preserve the native
browser menu; spellcheck stays enabled.

The composer shows the exact selected text, instruction, and currently available human
assignee before anything is created. Everyone can see who created and owns work, but
only the creator can accept, reject, or cancel it. Proposals appear beside the source
while the document remains unchanged. Accept or reject is one click; an optional
decision note can preserve why. Remote updates never silently overwrite a dirty draft;
the writer chooses **Use latest** or
**Keep mine**.

The interface never claims that the page started, notified, or hosts an idle external
agent. The hero begins with an already-active paired agent using the page's WebMCP
tools. That keeps the experience honest about the protocol boundary.

## What can people and agents do together that was difficult before?

Jordan can select one sentence in a shared launch memo and route it to Maya's agent—not
to a generic chatbot, and not with document-wide write access. The agent receives the
assignment while already waiting on the page, reads the document's prior decisions, and
proposes a precise replacement. Both people review it before Jordan decides.

In the Northstar demo, the agent proposes an invite-only beta on October 15 and general
availability on November 1. Jordan accepts because only four export days remain after
reliability; full October 15 GA would require eight. The accepted memo does not contain
that rejected eight-day fact, but Ratiflow's append-only Memory does. A fresh agent can
recover and cite the human decision instead of reviving the same rejected idea.

That creates a compact collaborative loop:

```text
human selection → cross-human assignment → native agent wait resolves
→ proposal without mutation → creator decision with rationale
→ synchronized document and durable memory → informed next agent
```

The result is more than AI text generation. It is shared governance for how human and
agent contributions enter an evolving artifact.

## How was WebMCP implemented?

The top-level Next.js document registers checked tool definitions with
`document.modelContext.registerTool`; an observed `navigator.modelContext` namespace is
only a compatibility fallback. An AbortSignal-backed registration manager owns all five
tools from page start while the server enforces paired proposal authority. Tool
callbacks read current runtime state, validate closed JSON schemas,
call the authoritative v3 service, and refetch before updating controlled React state.

The wait path performs fetch → subscribe → refetch to close the lost-wake race. It uses
one absolute deadline, ignores unrelated activity as a false wake, rejects duplicate
waits, and removes timers/listeners on execution, registration, route, or session abort.
Navigating to `/decision-demo` unregisters the document catalog before the preserved
compatibility page registers its separate tools.

Supabase Postgres/RPC is the intended deployment authority. Human and paired-agent
tokens are distinct. Transactions derive identity and origin server-side, lock the
document before work rows, enforce creator/assignee boundaries, validate Unicode text
anchors, use compare-and-swap revisions and idempotent request IDs, and append one
activity event per successful transaction. Proposal submission changes activity but
not content revision; acceptance applies the stored range, completes work, computes the
diff, and records the human rationale atomically.

Evaluation bootstrap fragments are treated as bearer secrets: the page validates,
stores, and scrubs them before registering WebMCP. Tool results and committed evidence
exclude tokens, paths, cookies, private content, and unrelated browser context.

## Alignment to the official judging criteria

| Criterion | Submission proof |
| --- | --- |
| **WebMCP Leverage** | Native discovery and invocation, live wait resolved by another human, assignee-filtered work, stable server-governed proposal authority, durable memory, teardown, and WebMCP-off ablation. Target: 5/5. |
| **Execution** | Calm desktop/mobile editor, two isolated humans, exact context menu, proposal governance, synchronized acceptance, conflict recovery, accessibility, and evidence discipline. |
| **Potential Impact** | Keeps request, proposer, accepter, diff, and decision rationale beside the artifact instead of losing them in detached chats, preventing repeated rejected ideas. |
| **Creativity & Ambition** | Uses the page as a cross-human agent rendezvous and capability plane, combining native waiting, one-agent-per-human routing, proposal-only authority, and revision/activity memory. |

Our stricter internal evidence bar is WebMCP Leverage 5/5, every other criterion at
least 4.5/5, total at least 19/20, and no independent judge must-fix. These are not
published hackathon score thresholds.

## Current evidence and links

- **Local verification:** `.codex/verify.sh` passed TypeScript, ESLint, 3/3 private-reset
  CLI tests, and 273/273 Vitest tests across 32 files.
- **Local build:** production webpack build passed.
- **Local browser evidence:** v3 Playwright passed 8/8 across the local document journey, desktop,
  two-human collaboration, real-pointer acceptance on desktop and 390px, WebMCP-off behavior, and conflict recovery. Its
  injected page adapter is not native-client proof.
- **Protected-reset rehearsal:** the exact Northstar fixture passed 5/5 locally with
  real pointer assignment and a fresh Maya context. It remains adapter, not native or
  narrated-timing evidence.
- **Persistence:** static audit passed; the v3 migration has not been remotely applied.
- **Live v3 judging URL:** pending authorized deployment and observation.
- **Exact public release SHA:** pending clean commit and push.
- **Supported-client native capture:** pending on the exact deployed build.
- **Authoritative release rows:** N01–N12 and R01–R04 remain pending; see the
  [v3 results ledger](../EVAL_RESULTS.md#contract-row-release-status).
- **v3 trajectories and ablation:** pending exact-SHA native A01–A07 runs and the
  `native-v3` versus `webmcp-disabled` comparison; v1.2 artifacts are excluded.
- **Release manifest:** `pnpm eval:release:v3` is fail-closed and remains `PENDING`
  until every exact-SHA native, rehearsal, trajectory, visual, judge, and public link
  row is populated.
- **Public source repository:** authorized; pending publication and observation.
- **Narrated public YouTube video:** pending recording/upload; the script is capped at 2:40 and
  places the first native invocation before 0:45.
- **Devpost submission:** authorized; pending completion and observation.
- **Contracts:** [product specification](../product_spec.md),
  [Northstar hero](../docs/contracts/document-hero-scenario.md), and
  [evaluation contract](../EVALS.md).

The preserved `/decision-demo` route and its earlier evidence remain compatibility
material only. They are not cited as proof that the v3 document lifecycle ran.
