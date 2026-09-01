# Ratiflow product specification

Version 3.0 · Frozen for the shared-document flagship · Owner: Ant · 2026-09-01

## 0. Authority and supersession

This file is the submission-facing product source of truth. It supersedes every earlier
shared-note, annotation-queue, stage-machine, native-proof, agent-trajectory, ablation,
release-gate, and proof-order claim for the flagship route.

The v3 document contract is jointly frozen by:

- this specification;
- [`docs/contracts/editor-contract.md`](docs/contracts/editor-contract.md) for exact
  service, schema, authority, transition, error, and browser behavior;
- [`src/document/contracts.ts`](src/document/contracts.ts) for the checked wire types;
- [`docs/contracts/document-hero-scenario.md`](docs/contracts/document-hero-scenario.md)
  for the deterministic Northstar fixture; and
- [`EVALS.md`](EVALS.md) for evidence and release gates.

The existing [`docs/contracts/capability-contract.md`](docs/contracts/capability-contract.md),
[`docs/contracts/hero-scenario.md`](docs/contracts/hero-scenario.md), and
`live-agent-session-contract.md` remain authority only for `/decision-demo`. That route
and its prior native captures are compatibility evidence; they are not the submission
story and do not satisfy a v3 document release gate.

Implementation may simplify presentation, but it may not invent or weaken a v3 actor,
authority boundary, lifecycle state, tool, fixture fact, schema, error, or proof class.

## 1. Product promise

**Ratiflow is one shared decision memo where people assign exact text to a teammate's
agent, agents return reviewable proposals through the live page, and the next agent can
recover why the document evolved.**

The page is the coordination boundary. A supported agent discovers current document,
memory, assignment, waiting, and proposal tools directly from the open top-level page
through `document.modelContext`; it does not need an MCP server configuration, copied
workspace ID, API key, DOM scraping, or pasted prompt. Humans retain the consequential
actions: they create and route work, then accept or reject proposals with rationale.

This is a hackathon POC, not a general word processor, CRDT, autonomous agent host, chat
product, account system, rich-text editor, or workflow engine. The submission proves one
small interaction unusually well: an already-active paired agent reacts to another
human's anchored assignment, proposes without silently editing, and leaves durable
decision memory for a later agent.

## 2. Competition alignment

| Official criterion | Judge-visible v3 proof |
|---|---|
| WebMCP Leverage | The page-native tool surface exposes authoritative content and memory, waits on a live cross-human assignment, conditionally gains a proposal tool for the paired assignee, and cleans up on navigation. Removing WebMCP removes the structured agent collaboration loop. |
| Execution | Two isolated human sessions complete select → assign → wait → inspect → propose → human accept → synchronized content and memory, with ordinary editing still usable when WebMCP is absent. |
| Potential Impact | Teams lose the rationale behind document edits in detached chats. Ratiflow keeps exact work, proposer/accepter provenance, server diff, and human rationale beside the evolving artifact. |
| Creativity and Ambition | WebMCP turns the live document into a rendezvous and capability plane for one agent per collaborator, while revision-bound proposals and append-only memory prevent silent edits and repetitive idea loops. |

WebMCP Leverage is the first tie-breaker and must be the clearest beat in the product and
video. A static API wrapper, injected adapter, copied prompt, or agent-themed animation
does not prove the promise.

## 3. Flagship surface

`/` creates a blank v3 note and opens its temporary high-entropy
`/document/[shareToken]` workspace. The
ordinary surface is a plain title/body document with a compact top bar, lightweight
presence, and a quiet **Work | Memory** margin. The writing surface dominates desktop
and 390px layouts. Shared documents remain account-free and expire with their 24-hour
session; possession of the link grants temporary access and is not described as private
authenticated storage.

On supported pages, one quiet Work-panel line mirrors the registered capability set:
read-only page tools normally, and a temporary proposal tool only for the member whose
paired agent owns pending work. Unsupported pages omit the line; it never claims an
agent is connected or running.

The v3 flagship has no visible four-stage control, stage-generated work, permanent
annotation composer, creator-only agent queue, direct agent mutation, copied **Ask
ChatGPT** prompt, Capability Field, launch dashboard, or permanent chat transcript.
Stored v2 stage and annotation data may remain for rollback, but it never gates v3
behavior or appears in the v3 WebMCP contract.

Participants see attributed collaborators and advisory editing presence. Whole-document
autosave uses compare-and-swap revision checks; a remote update never overwrites a dirty
local draft. This is collaboration awareness rather than character-level merging.

The deterministic Northstar seed is separate from ordinary blank launch. The protected
HTTP harness at `/api/document-v3/eval/reset` exists only in preview/eval and is disabled
on the canonical deployment. Before canonical native capture, a private release CLI may
invoke the service-role-only `ratiflow_reset_document_hero_v3` RPC directly. That RPC is
revoked from `public`, `anon`, and `authenticated` and returns exactly:

```ts
interface ResetDocumentHeroOutcome {
  shareToken: string;
  mayaBootstrapPath: string;
  jordanBootstrapPath: string;
  expiresAt: string;
  revision: 1;
  activityVersion: 1;
}
```

Each bootstrap path is a top-level document path whose URL fragment contains a
base64url-encoded v3 session bundle. The fragment is a bearer credential. The page
validates it against the path, share, protocol, and expiry; stores the bundle in
`sessionStorage`; and clears the fragment before any WebMCP registration. Bootstrap
paths and fragments are never logged, committed, screenshotted, or retained in capture
artifacts. A human operator may open the Maya and Jordan top-level bootstrap paths during
native setup; after that, the agent interacts only through WebMCP.

Reset creates the seed event and **no work orders**; Jordan creates the canonical work
during the observed hero.

### Contextual human interaction

A non-empty title/body selection exposes one compact **Ask agent** affordance. Only an
unmodified pointer-origin right-click on that selection suppresses the browser menu and
opens **Rewrite**, **Research**, and **Assign…**. The implementation tracks the preceding
secondary-button pointer event instead of guessing keyboard origin from coordinates.

Any modified pointer right-click remains native: Shift, Alt, Ctrl, or Meta individually
or in combination. The Context Menu key, Shift+F10, empty selection, and non-editor
targets also remain native. `spellCheck` stays enabled and the UI says **Hold Shift for
spelling menu**. `Cmd/Ctrl+K` is the keyboard-equivalent app action.

Rewrite and Research prefill the same compact composer as Assign. No work order exists
until the human confirms the instruction and a currently available assignee. Selection
anchors are zero-based, end-exclusive Unicode code-point ranges captured from
authoritative title or body content.

## 4. Deterministic Northstar hero

Every release rehearsal uses this fixture; S5 does not invent an optional scenario.
The seeded v3 document is revision `1`, activity version `1`, titled:

```text
Northstar CSV launch memo
```

Its body is exactly:

```text
Recommendation

Launch CSV export as generally available on October 15.

Context

Northstar Health's $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.

Open question

Can a single-tenant beta meet Northstar's need while general availability moves to November 1?
```

The hero is deterministic:

1. Maya Chen's already-active paired agent calls `inspect_document({})`, observes
   revision `1` and activity version `1`, then calls
   `wait_for_my_work({afterActivityVersion: 1, afterRevision: 1, timeoutSeconds: 20})`.
2. Jordan Lee selects BODY code-point range `[16, 71)`, exactly
   `Launch CSV export as generally available on October 15.`, opens pointer-origin
   **Rewrite**, chooses Maya, and confirms:
   `Rewrite this recommendation to fit the 14-day capacity and protect the Northstar renewal. Keep both launch dates explicit.`
3. Work creation leaves revision `1`, advances activity version to `2`, and wakes Maya's
   agent with `WORK_AVAILABLE`.
4. The agent calls `read_document_memory` and `list_my_work`, then submits this proposal
   without changing the document:
   `Launch an invite-only, single-tenant Northstar beta on October 15, then make CSV export generally available on November 1.`
   Its change summary is:
   `Replace October 15 GA with a single-tenant beta, then move general availability to November 1.`
5. Proposal submission leaves revision `1`, advances activity version to `3`, and makes
   the proposal visible to both humans while the original sentence remains intact.
6. Jordan accepts with the authoritative rationale:
   `Accepted because the beta uses the four export days left after reliability and still meets Northstar's November 1 deadline. Full GA on October 15 was rejected because it requires eight export days.`
7. Acceptance atomically applies the stored proposal, completes the work, advances the
   document to revision `2`, and advances activity version to `4` with one event.
8. A fresh Maya-paired agent calls `read_document_memory` and explains the rejected
   eight-export-day fact, which cannot be inferred from the final document text.

The demo may visibly exercise rejection in a secondary branch, but it may not replace
or alter this release fixture.

## 5. Identity, work, and human authority

One anonymous human member has one server-derived paired-agent identity. Human and agent
tokens are separate. Model input never supplies document, member, actor, origin,
assignee, range, acceptance, decision, or stage authority.

A work order stores exact title/body anchors; immutable `creatorMemberId` and
`assignedToMemberId`; display-name snapshots; instruction and intent; creation and live
anchor revisions; proposal fields; and lifecycle timestamps.
Human creation explicitly supplies the assignee. The server validates current workspace
membership and presence no older than 15 seconds; otherwise it returns
`ASSIGNEE_UNAVAILABLE`. Later inactivity does not revoke already-created work before the
session expires. Presence remains advisory UI state.

Checked v3 code exports and uses the exact names `DocumentWorkOrder`,
`PendingDocumentWorkOrder`, `CreateDocumentWorkOrderInput`, and
`CancelDocumentWorkOrderInput`. Prose shorthand such as “work order” refers to these
types and does not create alternate interfaces.

All members may view work. Only its creator may cancel, accept, or reject it. Only the
paired agent whose member identity is derived from authenticated execution context may
list or submit it. WebMCP never creates, reassigns, accepts, rejects, or cancels work.

Lifecycle is exact:

- `PENDING -> PROPOSED | CANCELLED | STALE`
- `PROPOSED -> COMPLETED | REJECTED | STALE`

`submit_work_proposal` stores a bounded candidate replacement and an untrusted model
summary; it never mutates content. A replacement identical to the current authoritative
target is an invalid no-op and is rejected without a proposal, event, or counter change.
Human accept/reject requires exactly
`{ workOrderId, expectedRevision, requestId, rationale }`. Acceptance atomically
revalidates the stored anchor, applies the stored proposal, completes the work, and
attributes proposer plus accepter. Rejection leaves content unchanged. Human rationale
is authoritative. The first locked decision wins; later conflicting decisions fail
without mutation.

Every accepted/rejected `WorkDecision` records `decisionRevision` as the authoritative
pre-decision revision and `resultRevision` as the post-decision revision. Hero acceptance
therefore records `1 -> 2`; rejection records equal values because it changes no
document content.

Active-work caps count `PENDING` plus `PROPOSED`: 100 per document and 50 per assignee.
The member key is immutable `assignedToMemberId`, never creator or mere workspace
membership.
Instructions and human rationales are 1–500 nonblank Unicode code points; change
summaries are 1–240; title is at most 160 and body at most 50,000. A generic proposal is
at most 50,000 code points, but its resulting field must still meet the title/body bound.

## 6. Revision, activity, anchors, and memory

Every successful content/work transaction locks the document first, increments
server-owned `activityVersion` exactly once, and appends exactly one event. A transaction
that changes content also increments document `revision` exactly once. Acceptance
changes content and work state in the same transaction and event. Reads, presence,
timeouts, aborts, no-ops, failed writes, and idempotent replays advance neither counter.

Higher `activityVersion` is authoritative for work and memory even when document
revision is equal; presence merges independently by heartbeat. Each accepted mutation
uses a request ID for exact replay: identical canonical input returns the original
result, and changed input returns `REQUEST_REPLAY_MISMATCH`.

Non-overlapping Unicode anchors deterministically rebase. An edit before an anchor
shifts it, an edit after it leaves it fixed, and an overlap or ambiguity marks work
`STALE`. Acceptance revalidates the current stored anchor and proposal inside the same
document-first lock. When one document edit or acceptance makes other anchors stale,
those transitions are part of the same compound transaction and primary event, which
lists every staled work-order ID. They do not add another event or counter increment.

Event kinds are exact:

- `DOCUMENT_EDITED`
- `WORK_CREATED`
- `PROPOSAL_SUBMITTED`
- `PROPOSAL_ACCEPTED`
- `PROPOSAL_REJECTED`
- `WORK_CANCELLED`
- `WORK_STALE`

Events contain server-derived actor and origin, base/result revision, linked work IDs,
changed fields, and timestamp. Only target, instruction, proposal, and server-computed
diff excerpts are truncated to 320 Unicode code points. Change summary retains its
240-code-point bound, while human rationale is preserved exactly up to its 500-code-point
bound. Events never contain external browser context, credentials, bearer or member
handles, or unrelated private data. There is no arbitrary memory writer.

Memory pagination defaults to 20 events and allows 1–50. It selects the newest `limit`
events with `activityVersion < beforeActivityVersion` when that cursor is supplied, or
from the latest event when omitted, then returns the window in ascending order. The
success envelope is exactly
`{ ok: true, events, hasMoreOlder, nextBeforeActivityVersion, latestActivityVersion, revision }`;
`nextBeforeActivityVersion` is the first returned version when older events remain and
otherwise `null`.

## 7. Exact WebMCP surface

The v3 document page registers exactly five tool definitions. The proposal tool is
conditional, so a page without owned pending work exposes four.

| Tool | Exact input | Contract |
|---|---|---|
| `inspect_document` | `{}` | Returns authoritative current content, revision, activity version, and collaborators. |
| `read_document_memory` | `{ beforeActivityVersion?, limit? }` | Returns the bounded ascending memory window in Section 6. |
| `list_my_work` | `{}` | Atomically returns `{ ok: true, workOrders, revision, activityVersion }`, with at most 50 oldest pending orders assigned to this paired human's agent. |
| `wait_for_my_work` | `{ afterActivityVersion, afterRevision, timeoutSeconds? }` | Waits from explicit cursors; timeout is integer seconds, minimum 1, default 20, hard maximum 20. |
| `submit_work_proposal` | `{ workOrderId, expectedRevision, replacementText, changeSummary }` | Conditionally registered only while this paired agent owns pending work; stores a proposal and never edits the document. |

Every schema rejects additional properties. `afterRevision`, `afterActivityVersion`, and
`expectedRevision` accept safe integers from 0 through `Number.MAX_SAFE_INTEGER`;
`beforeActivityVersion` starts at 1. Callback code generates write request IDs; the model
never supplies one. Results are JSON-serializable and mark human/agent-authored content
untrusted. Read tools are annotated read-only; proposal is not.

Wait performs authoritative fetch, subscribes, then refetches to close the lost-wake
window. It returns with this precedence:

1. `{ ok: true, outcome: "WORK_AVAILABLE", workOrders, revision, activityVersion }`
   when owned pending work exists;
2. the same envelope with `outcome: "DOCUMENT_CHANGED"` and exact `workOrders: []`
   only when revision advanced; or
3. the same envelope with `outcome: "TIMEOUT"` and exact `workOrders: []`.

Unrelated activity advances the wait's internal activity cursor but does not wake the
model. The timeout uses one absolute deadline established on entry; signals, unrelated
activity, and authoritative refetches never extend it. A supplied `afterRevision` or
`afterActivityVersion` greater than the current authoritative counter returns
`INVALID_INPUT` before installing a listener or timer. Every valid signal refetches
authoritative state. Execution abort, registration abort, route teardown, and session
teardown throw `AbortError` and remove all timers and listeners; a selection change does
not cancel. A concurrent duplicate returns `WAIT_ALREADY_ACTIVE`. A remotely dispatched
write may commit after client cancellation, so the agent must re-inspect rather than
assume rollback.

Frozen error codes are `INVALID_INPUT`, `UNAUTHORIZED`, `NOT_FOUND`,
`STALE_WORK_STATE`, `STALE_WORK_CONTEXT`, `REQUEST_REPLAY_MISMATCH`,
`STALE_PAGE_CONTEXT`, `ASSIGNEE_UNAVAILABLE`, `WAIT_ALREADY_ACTIVE`, `RATE_LIMITED`, and
`PROTOCOL_MISMATCH`.

## 8. Architecture and rollout

- Next.js App Router, React, TypeScript, pnpm, Vercel, and Supabase Postgres remain the
  implementation stack.
- The established `origin/main` live activity hub, registration lifecycle, cursor,
  abort, and refetch pattern is reused rather than duplicated.
- Realtime or a page-local signal is notification only; every wake refetches
  authoritative state.
- Server validation derives identity and authority independently of tool schemas.
- All transactions lock the document before work rows to keep lock order deterministic.
- V3 HTTP routes are frozen to:
  `/api/document-v3/launch`, `/api/document-v3/join`,
  `/api/document-v3/surface`, `/api/document-v3/save`,
  `/api/document-v3/presence`, `/api/document-v3/work/create`,
  `/api/document-v3/work/cancel`, `/api/document-v3/work/accept`,
  `/api/document-v3/work/reject`, `/api/document-v3/memory`,
  `/api/document-v3/agent/work`, and `/api/document-v3/agent/proposal`.
  `/api/document-v3/eval/reset` is the authenticated preview/eval-only release harness.
- V3 persistence adds exactly `ratiflow_document_work_orders` and
  `ratiflow_document_events`. Its RPC names are exactly
  `ratiflow_launch_document_v3`, `ratiflow_join_document_v3`,
  `ratiflow_inspect_document_v3`, `ratiflow_save_document_v3`,
  `ratiflow_touch_document_presence_v3`, `ratiflow_create_document_work_v3`,
  `ratiflow_cancel_document_work_v3`, `ratiflow_accept_document_proposal_v3`,
  `ratiflow_reject_document_proposal_v3`, `ratiflow_read_document_memory_v3`,
  `ratiflow_list_agent_work_v3`, and `ratiflow_submit_document_proposal_v3`.
  The service-role-only fixture RPC is `ratiflow_reset_document_hero_v3`.
- Persistence is additive. Existing documents default to protocol v2 and retain scoped
  rollback behavior; new document-workspace rows use v3. Legacy direct-apply RPCs reject
  v3, and new proposal/decision RPCs reject v2. Applied migrations are never edited.
- `document.modelContext` is normative. Any observed `navigator.modelContext` support is
  compatibility only and never the public contract.

The ordinary human UI remains usable when WebMCP is absent. It can edit, share, assign,
review, accept/reject, and read memory; it cannot supply an external agent with the
native zero-configuration structured collaboration loop.

## 9. P0 acceptance criteria

1. The document, not a launch dashboard, is the flagship and remains calm and usable on
   desktop and at 390px with or without WebMCP.
2. Two isolated people join as distinct members, see presence and authoritative saves,
   preserve dirty drafts across remote edits, and never leak bearer/member handles.
3. Every selection and context-menu branch in Section 3 behaves exactly, including a
   real native spelling-menu capture.
4. Jordan can assign the exact hero range to Maya; unavailable, forged, cross-workspace,
   expired, and model-supplied identities fail server-side.
5. Maya's already-active paired agent wakes from the human event, reads current content
   and memory, sees only its assigned work, and submits the exact proposal.
6. Submission changes activity but not content/revision. Both humans see the proposal
   while the original sentence remains; a replacement identical to its target is
   rejected as a no-op.
7. Only Jordan, as creator, can accept/reject. Acceptance atomically changes content and
   work state with the exact rationale, revision, activity version, server diff, and
   provenance. Decision races cannot double-apply.
8. Equal-revision activity, pagination, nearby anchor rebasing, overlaps, replay,
   timeout, abort, duplicate wait, navigation, and session teardown pass their frozen
   gates.
9. A fresh agent discovers and invokes memory, then recovers the eight-day rejected-GA
   fact absent from current text.
10. `/decision-demo` retains only its compatibility catalog; navigation removes every
    document tool and listener.
11. The exact Northstar flow passes five consecutive rehearsals, the first native action
    occurs within 45 seconds, and the narrated release run stays within 2:40.
12. The code, public repository, license, deployment, evidence manifest, native capture,
    and submission all identify one approved clean commit SHA.

## 10. Scope discipline and compatibility

P0 excludes accounts, folders, attachments, rich text, line comments, tracked changes,
remote cursors, offline sync, export, CRDT merging, idle external-agent hosting,
agent-to-agent orchestration, arbitrary memory entries, generalized roles, and multiple
document scenarios. Do not add one while an acceptance or native-proof row is pending.

`/decision-demo` may continue to demonstrate the proven live session, dynamic decision
catalog, and previous native wait capture. It must not appear as the flagship, share a
catalog with the document, or be cited as proof that the v3 document tools ran. If the
v3 identity, authority, memory, native wait, exact-SHA, accessibility, or score gates
fail, retain that proven release rather than promoting a partial document pivot.

## 11. Submission proof order

The video opens on the working document and shows the active native wait in the first 45
seconds, then Jordan's exact cross-assignment, native inspect/memory/work calls, proposal
without mutation, Jordan's acceptance, synchronized document change, and a fresh agent
recovering the hidden eight-day rationale. Judges must see the human/agent boundary and
the reason WebMCP is indispensable without opening DevTools.

Release order is: focused tests and `.codex/verify.sh`; production build; v2/v3 preview
database and app rollout; driven browser flow and fresh read-only visual review; approved
clean commit and public-repository identity; exact-SHA deployment and canonical
promotion; native capture; four independent official-criterion judges; then the
user-owned public video and Devpost submission actions. [`EVALS.md`](EVALS.md) is the
complete evidence contract.
