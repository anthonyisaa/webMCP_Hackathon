# Ratiflow

> **People direct. Agents propose. Decisions remember.**

Ratiflow is a calm shared decision memo where people and their paired agents work on the
same evolving artifact. A person selects exact text and assigns it to a collaborator's
agent. The agent receives the work through the page's live WebMCP surface and returns a
proposal without editing the document. The work creator accepts or rejects in one click,
may add an optional decision note, and that decision becomes durable memory for the next
agent.

This is deliberately a focused hackathon POC, not a full word processor. It proves one
interaction that detached chat handles poorly: cross-human agent delegation with exact
document context, human-controlled changes, and a record of why the text evolved.

## The flagship interaction

The deterministic demo uses a synthetic **Northstar CSV launch memo**:

1. Maya Chen's already-active paired agent calls `inspect_document`, sees revision 1,
   then starts `wait_for_my_work` from explicit revision and activity cursors.
2. Jordan Lee selects exactly “Launch CSV export as generally available on October
   15.” An unmodified pointer right-click opens Ratiflow's contextual menu; Jordan
   chooses **Rewrite**, assigns Maya, and asks the agent to fit the recommendation to
   14-day capacity while keeping both launch dates explicit.
3. Jordan's assignment advances activity, not document revision. It resolves Maya's
   pending native wait with `WORK_AVAILABLE`.
4. Maya's agent calls `read_document_memory` and `list_my_work`, then proposes an
   invite-only Northstar beta on October 15 followed by general availability on
   November 1.
5. Proposal submission still does not change the memo. Both people see the candidate
   beside the original sentence.
6. Jordan accepts in the ordinary UI with a rationale: four export days remain after
   reliability, while October 15 general availability would require eight.
7. Acceptance atomically applies the stored proposal, completes the work, and advances
   the memo to revision 2 and activity version 4 in both sessions.
8. A fresh agent reads Memory and recovers the rejected eight-day fact even though it
   is absent from the final document. That is the anti-loop proof.

The first native action is scripted by 0:45 and the complete narrated run is capped at
2:40. See [the shot script](demo/shot-script.md).

## Five page-native tools

The top-level v3 document page registers exactly five WebMCP definitions from page start
through the standards path, `document.modelContext`. Server-side ownership and revision
checks—not tool visibility—govern proposal submission.

| Tool | Role |
| --- | --- |
| `inspect_document` | Read authoritative content, revision, activity, and collaborators. |
| `read_document_memory` | Read bounded, chronological edits, work, proposals, decisions, diffs, and human rationale. |
| `list_my_work` | List only pending work assigned to this human's paired agent. |
| `wait_for_my_work` | Wait from explicit cursors for assigned work or a document change, with timeout and cancellation. |
| `submit_work_proposal` | Store an ownership-checked candidate replacement and summary; it never edits content. |

The lifecycle is the point:

```text
page opens → inspect → wait
                      ↓ another human assigns exact text
            memory + my work → governed proposal
                                   ↓
                      creator accepts or rejects in the UI
                                   ↓
                     synchronized document + decision memory
```

There is no WebMCP tool to create, reassign, accept, reject, cancel, or directly edit
work. Server-side execution derives the document, member, paired agent, actor, origin,
assignee, and stored text range; model input cannot claim any of them. Tool presence
guides the agent, while revision checks and authority remain server-enforced.

## A document interface first

`/` resumes the last valid browser note or opens a blank title and body, then moves into a temporary
`/document/[shareToken]` workspace. The document dominates the screen; a quiet
**Work | Memory** margin holds assigned work, proposals, human decisions, and history.
There is no stage machine, permanent composer, always-open agent prompt, dashboard,
Capability Field, or chat transcript on the flagship route.

The Work panel makes the WebMCP boundary judge-visible with honest page-local states:
tools connecting, all five tools ready, this page's paired agent listening or preparing
a proposal, work waiting, or WebMCP unavailable. **Check now** refreshes the page but
cannot wake a model; **Copy agent prompt** gives the external agent one operational
instruction with a selectable fallback.

For a zero-setup judging path, a blank note offers **Open completed example**. It builds
a fresh Jordan → Maya Northstar decision through the same public service operations,
opens the accepted memo directly on Memory, and gives the current browser a fresh paired
agent that can recover why October 15 full GA must not be repeated.

For a live assignment, each person opens the shared note in a separate browser profile.
The assignee chooses **Copy agent prompt**, pastes it into their browser agent while the
note is open, and leaves that turn running. The prompt makes the agent inspect, read
Memory, list its own work, and repeat bounded 20-second `wait_for_my_work` calls. Another
person can then assign selected text; that page event resolves the active wait and the
same turn submits a proposal. **Check now** only refetches human-visible state. It is a
recovery button, not an agent wake button.

A non-empty selection exposes **Ask agent**. An unmodified pointer-origin right-click
on that selection opens **Rewrite**, **Research**, and **Assign…**. Holding a modifier,
using the Context Menu key or `Shift+F10`, right-clicking an empty selection, or
right-clicking outside the editor preserves the native browser menu. Spellcheck remains
enabled, and `Cmd/Ctrl+K` opens the same assignment composer for keyboard users.

Two isolated people join as distinct members, see lightweight presence, and receive
authoritative saves. If a remote edit arrives while someone has a dirty draft, Ratiflow
preserves the draft and asks them to choose **Use latest** or **Keep mine**. This is
collaboration awareness, not character-level CRDT merging.

When WebMCP is unavailable, the human surface still edits, shares, assigns, reviews,
accepts or rejects, and reads Memory. It does not pretend that an agent is connected,
notified, or running. WebMCP supplies the zero-configuration structured agent loop; it
is not required for ordinary document use.

## Why this fits the judging criteria

| Official criterion | Judge-visible proof |
| --- | --- |
| **WebMCP Leverage** | Native page discovery, an active cross-human wait, assignee-filtered work, a stable server-governed proposal capability, durable memory, and teardown on navigation. Removing WebMCP removes the structured agent collaboration loop. |
| **Execution** | A clean desktop and 390px editor; two human sessions; exact contextual assignment; proposal without mutation; creator-only decision; synchronized content and Memory; explicit conflict handling; WebMCP-off fallback. |
| **Potential Impact** | The rationale behind edits no longer disappears into detached chats. The evolving artifact retains the request, proposer, accepter, server diff, and human reason. |
| **Creativity & Ambition** | The live document becomes a rendezvous and capability plane for one agent per collaborator, while proposal governance and revision/activity memory prevent silent edits and repeated-idea loops. |

Our stricter internal release gate requires an independent judge for each official
criterion: WebMCP Leverage 5/5, every other criterion at least 4.5/5, total at least
19/20, and no unresolved must-fix. These are evidence-quality targets, not published
hackathon score thresholds.

## Current evidence boundary

As of 2026-09-01, the public v3 runtime is deployed from
`921dfc4236d6f95bbff0c4e4c4544efc6a947175`:

| Evidence | Status |
| --- | --- |
| `.codex/verify.sh` | **Passed:** TypeScript, ESLint, 3/3 private-reset CLI tests, and 285/285 Vitest tests across 34 files. |
| Production webpack build | **Passed locally.** |
| v3 Playwright | **13/13 passed locally and 13/13 against production:** blank-note editing, completed-example bootstrap, desktop and 390px collaboration, real-pointer acceptance, persistence, race guards, WebMCP-off behavior, and conflict recovery. Injected adapter coverage is not native proof. |
| v3 persistence | **Deployed.** The v3 workspace and optional-decision-note migrations are applied to the production Supabase project; the observed security advisor introduced no new finding. |
| Deployed v3 app and exact release identity | **READY:** [ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app), Vercel deployment `dpl_BvRbo4WkF9nDohFbDpCPn93gLGVb`, runtime SHA `921dfc4236d6f95bbff0c4e4c4544efc6a947175`. The hosted suite passed and the post-run error query was empty. |
| Native supported-client capture | **Partial, observed on production:** a Codex in-app browser discovered exactly five page tools and invoked `inspect_document`, `read_document_memory`, `list_my_work`, and `wait_for_my_work`; the wait returned a structured `TIMEOUT`. Native proposal submission and the complete N01–N12 matrix remain pending. |
| Protected-reset adapter rehearsal | **5/5 passed locally:** exact frozen IDs/content/counters, real-pointer assignment, Jordan tool-layer exclusion, active-wait teardown, and a fresh Maya context. This is not native, narrated-timing, or exact-SHA release proof. |
| v3 agent ledger | **Validator passed 53/53 focused tests; evidence remains `PENDING`.** The empty canonical A01–A07 ledger exits nonzero, and the v1.2/static-superset runs are ineligible. |
| v3 release manifest | **Validator passed 25/25 focused tests; manifest remains `PENDING`.** `pnpm eval:release:v3` resolves content-addressed evidence and exits nonzero until every SHA-bound domain, browser, native, rehearsal, trajectory, visual, judge, and public-package gate is complete. |
| Independent criterion judges | **All top-10-credible PASS with no blockers:** WebMCP Leverage 4.7/5, Execution 4.7/5, Potential Impact 4.6/5, Creativity & Ambition 4.6/5. |
| Public repository, public YouTube demo, and Devpost submission | **Pending.** The GitHub URL currently returns 404 when signed out; no public-source claim is made. |

The preserved `/decision-demo` route remains a compatibility proof for the earlier
decision-room catalog. Its historical evidence is not evidence that the v3 document
tools ran, and it is not the flagship submission story.

Authoritative release status: [N01–N12 and R01–R04 remain pending](EVAL_RESULTS.md#contract-row-release-status).

## Architecture

```text
Top-level Next.js document
  ├─ ordinary human UI → authenticated document-v3 routes
  └─ document.modelContext → checked five-tool WebMCP lifecycle
                              ↓
                    authoritative service boundary
                              ↓
             Supabase RPC transaction / local dev service
                              ↓
         document revision + activity version + append-only memory
                              ↓
              refetch and reconcile in every human session
```

- Next.js App Router, React, TypeScript, CSS Modules, pnpm, and Vercel provide the app
  surface.
- Supabase Postgres/RPC is the authoritative production backend. Transactions
  lock the document first, use compare-and-swap revisions and idempotent request IDs,
  and append one activity event per successful transaction.
- Activity signals are notifications, not truth. Every wake refetches authoritative
  state and closes the lost-wake window.
- Registration and execution use abort signals. Route, document, and session teardown
  remove tools, waits, timers, and listeners.
- `/decision-demo` keeps its separate compatibility catalog; route navigation never
  shares document and decision tools.

## Share and session safety

Shared documents are account-free and temporary. Possession of the share link grants
access, so the link is not described as private authenticated storage. Human and paired
agent tokens are distinct, high-entropy, per-session credentials and never appear in
tool results.

The protected Northstar evaluation setup uses one-time fragment bootstrap bundles. The
page validates the bundle against path, share, protocol, and expiry, stores the full
bundle in tab storage plus a credential-only browser projection, and scrubs the fragment
before WebMCP registers. Browser storage never retains document/work/memory content. Bootstrap paths,
fragments, tokens, cookies, private document content, and unsanitized agent transcripts
must never be logged, committed, recorded, or included in evidence.

## Run locally

Prerequisites: Node.js compatible with the checked-in pnpm version and pnpm 11.

```bash
pnpm install
pnpm dev
```

Without Supabase environment variables, development uses an in-memory service shared
by browser tabs while the local server remains running. It is suitable for UI and
protocol work, but does not persist across restarts.

For Supabase-backed development, configure server-side values only:

```bash
RATIFLOW_SUPABASE_URL=https://your-project.supabase.co
RATIFLOW_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply the checked-in migrations in filename order through
`20260901121107_optional_document_decision_notes.sql`. The v3 migrations are additive
and preserve the scoped v2 compatibility path. A service-role key is required only for
the protected evaluation reset workflow and must never be exposed to the browser or
committed.

Verification commands:

```bash
.codex/verify.sh
pnpm build
RATIFLOW_BASE_URL=http://localhost:3000 pnpm exec playwright test \
  e2e/document-editor.spec.ts \
  e2e/document-collaboration.spec.ts \
  e2e/document-webmcp.spec.ts
```

Preview/evaluation can run the guarded exact-fixture rehearsal with the same server-only
`RATIFLOW_EVAL_RESET_TOKEN` configured on the app and command:

```bash
RATIFLOW_BASE_URL=https://your-preview.example \
RATIFLOW_EVAL_RESET_TOKEN=your-preview-only-token \
pnpm eval:rehearse:adapter
```

Canonical production keeps the HTTP reset disabled. An authorized release operator
uses `pnpm eval:reset:v3`; it calls the service-role-only reset RPC and writes bearer
bootstrap paths only to a mode-0600 file in a fresh private temporary directory.

Browser automation validates behavior but cannot satisfy native WebMCP evidence. Final
proof requires a supported client discovering and invoking the five-tool lifecycle on
the exact deployed release. The final package is accepted only when
`pnpm eval:release:v3` returns `PASS` for the one exact-SHA manifest.

## Project documents

- [Product specification](product_spec.md) — frozen v3 product and authority contract.
- [Editor contract](docs/contracts/editor-contract.md) — exact UI, service, schema, and
  browser behavior.
- [Northstar hero](docs/contracts/document-hero-scenario.md) — deterministic fixture,
  text, revisions, activity, proposal, decision, and fresh-agent golden.
- [Evaluation contract](EVALS.md) — automated, native, trajectory, visual, rehearsal,
  and independent-judge gates.
- [Submission ledger](demo/README.md) — current evidence and owner-only release steps.

## License

[MIT](LICENSE)
