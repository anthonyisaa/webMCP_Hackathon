# Ratiflow product specification

Version 4.0 · Contract freeze candidate · Owner: Ant · 2026-09-01

## 0. Authority and supersession

This file is the submission-facing source of truth for the v4 flagship. It supersedes
the v3 shared-memo product story at `/`, but it does not delete or weaken the deployed
v3 compatibility surface at `/document/[shareToken]`.

The v4 contract is jointly owned by:

- this product specification;
- `docs/contracts/repository-contract.md` for exact entities, transitions, authority,
  transactions, APIs, WebMCP behavior, bounds, and errors;
- `src/repository/contracts.ts` for checked wire types and constants;
- `docs/contracts/postmortem-hero-scenario.md` for the deterministic `INC-482` fixture;
- `evals/goldens/repo-document-v4/` for independently authored exact fixture data; and
- `EVALS.md` for evidence and release gates.

The v3 `docs/contracts/editor-contract.md`, `src/document/contracts.ts`, routes,
migrations, and evidence remain dated compatibility authority only. They cannot prove a
v4 revision, comment, task-authority, direct-write, template, or native-tool claim.

## 1. Product promise

**Ratiflow is a versioned issue document where people and the agents they bring work
from one shared task list, discuss exact parts of the document, and preserve a complete
record of who changed what, why, and under whose authority.**

The final document is the product. Tasks, comments, agent findings, proposals, and
revision history are the path to that product, not a chat transcript that replaces it.
A person can open the shared URL, read and edit the document, discuss it, inspect every
revision, and restore an older version without connecting an agent.

When a compatible agent is present, the top-level page exposes the issue, history,
owned tasks, task discussion, and a governed result submission surface through
`document.modelContext`. Each collaborator may bring a different agent. Ratiflow does
not host the model, require a vendor-specific integration, give the model a workspace
identifier, or claim access to external metrics, logs, or source code. Those external
capabilities belong to the agent the collaborator brought.

Every task has one immutable execution mode selected by a human:

- **Comment only** — the agent may post findings and complete the task without changing
  the document.
- **Review required** — the agent may discuss and propose one scoped replacement; a
  human must accept or reject the proposal.
- **Can edit directly** — the agent may apply one scoped replacement immediately. The
  resulting revision is attributable and reversible, but Ratiflow asks for no product
  approval after the grant.

The task mode is a server-side capability, not model input. An agent cannot promote its
mode, change its assignee, widen its target, forge its actor, or act on another task.

## 2. Why this is not a Git-themed editor

The repository metaphor is an implementation and trust model, not the primary UI.
Ratiflow uses Git-grade properties that ordinary document collaboration lacks:

1. Every content revision stores a complete immutable snapshot and digest.
2. Every revision identifies its parent, author, committer, task, task grant, source
   revision, resulting revision, change summary, evidence references, and timestamp.
3. A review-required revision preserves both the agent author and human approver.
4. A direct agent revision preserves the human grantor and exact task scope.
5. Restore creates a new revision; history is never rewritten or deleted.
6. Comments and task discussion retain the revision and exact text that grounded them.
7. Concurrent disjoint tasks can land after deterministic anchor rebasing; overlaps fail
   closed instead of silently overwriting another contributor.

The human-facing labels are **Threads**, **Tasks**, **History**, **Review required**,
**Can edit directly**, **Compare**, and **Restore**. P0 has no branches, pull requests,
commit graph, staging area, merge queue, repository browser, or Git command vocabulary.

## 3. P0 document scope

The root page offers exactly two new-document choices.

### Incident postmortem

The initial body is exactly:

```markdown
## Summary

Describe what happened, when it started, and when service recovered.

## Impact

Quantify affected customers, failed operations, and data integrity.

## Timeline

List key events in UTC.

## Root cause

Distinguish the triggering event from the system condition that amplified it.

## Detection and response

Explain how the incident was detected and how responders acted.

## Contributing factors

List the conditions that increased likelihood or impact.

## Corrective actions

- [ ] Assign an owner and target date.

## Learnings

Record what should change in how the team designs, operates, or responds.
```

The default title is `Untitled incident postmortem`.

### Product document

The initial body is exactly:

```markdown
## Problem

Describe the customer or business problem.

## Users and need

Name the users and the outcome they need.

## Goals

Define the outcomes this product should create.

## Non-goals

State what is deliberately outside this document.

## Requirements

List the behavior the product must support.

## Decisions

Record decisions and the context behind them.

## Risks

Describe material delivery, adoption, safety, or operational risks.

## Success metrics

Define how the team will know the product worked.

## Open questions

List unresolved questions and their owners.
```

The default title is `Untitled product document`.

Both templates use the same revision, task, comment, authority, history, and WebMCP
primitives. No blank general-purpose document, folder, attachment, rich-text block,
spreadsheet, or third template appears in P0.

## 4. Flagship surface and human workflow

`/` shows the two-card template picker and an **Open incident example** action. Creating
a template launches a high-entropy shared workspace and opens
`/issue/[shareToken]`. Anyone holding the URL may join while the POC workspace remains
live. The page never describes possession-of-link access as private authenticated
storage.

Open incident example accepts no name or configuration and opens its human as Priya Shah.
It creates a fresh completed r4/av10 clone of the `INC-482` golden, so a person can inspect
the finished postmortem, three resolved tasks, discussion, and provenance without
connecting an agent. Fresh identifiers, credentials, timestamps, expiry, and display
colors are normalized in comparison; content/digests, names/labels, task and reply graph,
anchors, evidence, counters, diffs, and provenance relationships remain exact. The
protected evaluation reset is separate:
it creates the runnable r1/av4 state with all three tasks Open and returns four secret
member bootstrap paths for the controlled native flow. Production example code never
calls the reset.

The workspace has three quiet regions:

- a compact top bar with Ratiflow, document type, `rN · Saved`, collaborators, Share,
  and New document;
- a dominant title/body writing surface; and
- a right **Threads | History** rail, rendered as an accessible drawer below 740 px.

Threads shows open tasks first, then open anchored discussions, with completed work
available under **Done**. A task expands into its instruction, assignee, agent label,
mode, exact target, evidence references, comments, result, and decision. Resolved work
is never discarded merely to keep the inbox short.

History contains content revisions only. Task creation, comments, presence, proposals,
and rejection may advance activity but do not masquerade as document revisions. Opening
a revision shows its full provenance, full historical snapshot, and server-computed
before/after change. **Restore this revision** requires a current-revision check and
creates a new human-authored revision.

A non-empty title/body selection exposes **Comment** and **Create task**. `Cmd/Ctrl+K`
opens Create task for the current selection. The pointer-origin context-menu safeguards,
native spelling menu, Unicode code-point conversion, focus restoration, and modified
right-click behavior remain as strict as v3.

Comment creates an anchored discussion with the selected text and current revision.
Create task requires a title, instruction, durable workspace assignee, agent label, and
one mode. Review required is the default. Comment-only tasks may target the whole
document; Review and Direct require a non-empty exact title/body selection in P0.

Presence is advisory. A known workspace member does not need a heartbeat in the last 15
seconds to receive durable work. Joining the shared URL is still required before a
person can become an assignee.

Ordinary document changes use explicit **Save revision** rather than creating one
history entry per keystroke. The browser preserves an unsaved local draft within the
tab, clearly distinguishes it from the authoritative head, and offers explicit conflict
recovery when the head advances. The product does not claim character-level CRDT or
automatic merge behavior.

## 5. Identity, attribution, and bring-your-own-agent

One workspace member has distinct human and delegated-agent bearer credentials. The
agent credential is a page-scoped capability for whatever compatible agent that member
brings; it is not a verified model identity or a hosted Ratiflow agent.

The server derives document, member, actor type, origin, page session, task ownership,
mode, scope, and grantor from authenticated execution context and stored records.
WebMCP input never accepts those fields.

Agent attribution contains:

- the human workspace principal whose page delegated the call;
- the task's human-authored agent label, such as `Data agent` or `Builder agent`;
- actor type `AGENT` and origin `WEBMCP`; and
- optional client/model text only when clearly marked unverified.

Human attribution contains the stable workspace member snapshot and origin
`ORDINARY_UI`. No public revision, task, comment, tool result, capture, or log contains
bearer tokens, credential hashes, browser storage, bootstrap fragments, or page session
handles.

The v4 POC keeps account-free link access and bounded retention. A document and its
revision history outlive a browser tab and agent turn; they never disappear merely
because presence or a page-local wait ended. Product copy states the actual retention
window rather than promising permanent hosted storage.

## 6. Tasks, comments, and authority

Every task stores:

- immutable creator and assignee member snapshots;
- task title, category, instruction, and human-authored agent label;
- immutable mode `COMMENT | REVIEW | DIRECT`;
- an exact title/body anchor or document scope where allowed;
- creation, source, live-anchor, and result revisions;
- a dedicated discussion thread;
- bounded evidence references;
- proposal/result/decision data; and
- lifecycle timestamps.

Lifecycle is exact:

- `OPEN -> PROPOSED | COMPLETED | CANCELLED | STALE`
- `PROPOSED -> COMPLETED | REJECTED | STALE`

Only the paired agent of the immutable assignee may list, wait for, comment as agent,
or submit a result. All workspace humans may view tasks and discussions. The creator may
cancel or decide a Review proposal. Any workspace human may participate in discussion;
server attribution prevents impersonation.

All comment records are first-class and append-only. A thread may be anchored directly
to document text or owned by a task. A reply references a comment in the same thread.
The original selected text and creation revision never change; the live anchor may
rebase. Resolving a thread changes its state but never deletes its comments.

The 30-day POC has explicit lifetime bounds: 500 tasks and 500 standalone threads per
issue, with at most 100 comments in each thread. The human surface returns this complete
bounded work state; it does not silently truncate terminal tasks or older discussion.

`submit_task_result` behaves only according to stored mode:

- `COMMENT`: replacement text must be absent. The result summary becomes the terminal
  agent finding and the task completes without changing the document.
- `REVIEW`: one replacement and summary create a proposal. Document content and
  revision remain unchanged until the creator accepts. Rejection is terminal and keeps
  the proposal plus discussion.
- `DIRECT`: one replacement and summary are applied to the current stored anchor in the
  same transaction that completes the task, appends activity, and creates the full
  immutable revision.

A successful result may be based on an older revision only when intervening changes are
provably disjoint and the stored anchor rebases exactly. The resulting revision records
both the agent's source revision and the actual parent revision. Overlap, changed target
text, ambiguity, a stale/cancelled task, or a finalized decision fails without partial
mutation.

## 7. Revisions and provenance

Revision numbers are server-owned safe integers beginning at `1`. Template creation
inserts r1. Every content-changing human save, Direct result, accepted Review proposal,
and Restore creates exactly one next revision in a document-locked transaction.

Each immutable revision stores:

- revision UUID, number, parent number, complete title/body snapshot, and SHA-256
  content digest;
- full server-computed changed segments;
- source revision and rebasing metadata;
- content author and commit actor as separate snapshots;
- server-derived commit origin, authored-content origin, and authority kind
  `HUMAN | DIRECT | REVIEW | RESTORE`;
- linked task, grantor, approver, or restored revision where applicable;
- exact bounded change summary and evidence references; and
- creation timestamp.

For a human save, author and committer are the same human. For a Direct task, both are
the assigned agent and the revision also names the human grantor. For an accepted Review
task, the agent remains the author and the accepting human is the committer/approver.

Snapshots and digests are immutable. The mutable document head is a projection of the
latest revision. A revision list can paginate metadata, but inspecting any listed
revision returns its complete stored snapshot. Excerpts may optimize cards; they never
replace authoritative revision content. HTTP and WebMCP history are both strictly
newest-first.

Every successful task, comment, decision, content, or thread transaction increments one
server-owned `activityVersion` and appends one activity record. Only a content change
increments `revision`. Reads, waits, timeouts, presence, failures, unchanged saves,
idempotent replays, and cancellation before dispatch increment neither. A dispatched
remote write may commit after client cancellation; the client re-inspects and reuses the
same request identity only when retrying that logical operation.

## 8. Deterministic `INC-482` hero

The primary demo is **`INC-482 · Checkout outage postmortem`**. Its independently
checked golden freezes exact r1 content, collaborators, source facts, task targets,
comments, replacements, revision digests, and final r4 content.

Source facts are:

- `impact.csv`: 28,417 checkout attempts, 6,742 failures, 311 merchants affected, and
  zero duplicate charges;
- `checkout.log`: provider 429s began 09:43 UTC, retry traffic reached 5.8×, the queue
  grew from 420 to 18,240, rollback began 10:17, and recovery completed 10:21; and
- code fixture commit `7d3c9e1`: retry middleware ignored `Retry-After` and made up to
  five zero-delay retries.

Three tasks begin together:

| Task | Target | Mode | Agent outcome |
|---|---|---|---|
| `DATA-17` | Impact placeholder | `DIRECT` | Exact impact and data-integrity facts |
| `LOG-22` | Timeline placeholder | `DIRECT` | Exact 09:43–10:21 timeline |
| `CODE-9` | Root cause placeholder | `REVIEW` | Trigger/amplifier explanation |

The observed sequence is:

1. Priya can read a coherent r1 postmortem before connecting any agent.
2. The Data agent submits from r1. Stored Direct authority creates r2 without product
   approval and completes `DATA-17`.
3. The Logging agent also submits from r1. Its disjoint anchor rebases over r2, creates
   r3, and completes `LOG-22` without product approval.
4. The Builder agent submits `CODE-9`. Stored Review authority creates a proposal only;
   the Root cause placeholder remains at r3.
5. Priya asks in the task thread: `Provider throttling happened first. Are we
   overclaiming our code as the root cause?`
6. The Builder agent replies with the code/log evidence and distinguishes provider
   throttling as trigger from the retry regression as the internal amplifier.
7. Priya accepts once. That creates r4, preserves the Builder agent as author and Priya
   as approver/committer, and completes `CODE-9`.
8. History shows reconstructable r1-r4 snapshots and exact provenance. The final
   postmortem is clean, factual, and actionable rather than a task transcript.
9. A fresh agent for the Builder collaborator reads resolved work and history, then
   explains why provider latency alone was rejected as the sustained root cause.
10. A secondary smoke creates the exact Product document template and proves it uses the
    same Threads, Tasks, History, authority, and restore primitives.

The demo must not imply that Ratiflow itself queried the CSV, log service, or repository.
Those named fixture facts simulate outputs brought by the external specialist agents.

## 9. Exact WebMCP surface

All six v4 tools register from the top-level issue page at page start:

| Tool | Purpose |
|---|---|
| `inspect_document` | Read the current or one requested historical snapshot, counters, collaborators, and bounded task summary. |
| `read_document_history` | Read a bounded newest revision window with complete provenance and full diffs. |
| `list_my_tasks` | Read open tasks assigned to this member's agent; optionally include resolved tasks and their discussion. |
| `wait_for_my_tasks` | Wait up to 20 seconds for owned open work or a document change while the page/tool turn remains active. |
| `comment_on_task` | Add a bounded agent comment or reply to one owned task thread. |
| `submit_task_result` | Submit a finding or scoped replacement; return `COMMENTED`, `PROPOSED`, or `COMMITTED` from stored task mode. |

`src/repository/contracts.ts` exports the complete ordered catalog, including each exact
description, closed JSON Schema, and annotation set. Runtime registration consumes that
catalog; it does not maintain a second hand-written version.

The model never supplies request ID, document, member, actor, origin, task mode,
assignee, grantor, anchor, approval, or commit authority. The bridge supplies page and
request identity outside tool JSON. One logical mutation keeps one request identity
through transport retries; a new invocation is a new operation. Every tool validates
inputs at schema and server layers, treats returned human/agent text as untrusted,
returns JSON-serializable data, handles cancellation with re-inspection after ambiguous
dispatch, and tears down on navigation/session expiry.

No tool creates, reassigns, cancels, accepts, rejects, restores, or changes a task mode.
Those remain ordinary human actions. A host may independently confirm a mutating tool
call under its own safety policy; Ratiflow never labels that host decision as a required
document review.

Launch, example, join, and protected reset issue plaintext credentials once and are not
idempotently replayed. Only their SHA-256 digests are stored. A lost response may leave an
unreachable workspace/member that expires normally; retry starts a new credential
operation. Authenticated mutations after issuance use replay-safe request identities.

## 10. Competition alignment and proof discipline

| Official criterion | Judge-visible v4 proof |
|---|---|
| WebMCP Leverage | Different collaborators bring agents to the same live issue. The page natively exposes owned tasks, exact document/history context, task discussion, and server-governed result submission. Removing WebMCP removes the zero-configuration multi-agent loop. |
| Execution | Two Direct tasks land safely from the same source revision, one Review task preserves human judgment, comments synchronize, history reconstructs every revision, restore works, and both templates remain usable without WebMCP. |
| Potential Impact | Teams finish with one accurate postmortem or product document while retaining the facts, disagreements, agent work, grants, decisions, and revisions that produced it. |
| Creativity and Ambition | Git-grade authorship and task-scoped agent autonomy become native document collaboration rather than a detached agent chat, generic API wrapper, or AI rewrite button. |

Adapter tests, internal service calls, direct RPC calls, animated screenshots, or model
prose never count as native WebMCP proof. Native claims require a supported client to
discover and invoke tools on the deployed top-level page tied to the exact release SHA.

Final criterion judging happens only after implementation, browser, native, visual,
rehearsal, and public-package evidence. Preliminary judges must name their strongest gap
and may return `mustFix: null`; only a genuine evidence-backed must-fix blocks and
requires correction. Final judges must cite eligible evidence and return no open
must-fix. Internal release thresholds are WebMCP `5.0/5`, each other criterion at least
`4.5/5`, and total at least `19/20`.

## 11. P0 exclusions and release boundary

P0 excludes accounts, organizations, folders, multiple files per issue, attachments,
rich text, arbitrary templates, character-level CRDT, offline sync, background agent
execution, agent-to-agent messaging, branches, merges, pull requests, arbitrary code or
observability connectors, verified model identity, public search, permanent storage
claims, and generalized workflow roles.

The ordinary human UI must remain useful without WebMCP. The v3 compatibility route must
keep passing its own tests. Applied migrations are immutable; v4 persistence is
additive. No secret, credential, private external data, or unsanitized agent transcript
may enter source, logs, screenshots, video assets, or evidence.

Release requires `.codex/verify.sh`, the v4 focused domain/protocol/browser gates,
production build, five repair-free hero rehearsals, desktop/390px driven behavior, fresh
read-only visual review, supported-client native capture, controlled WebMCP-off ablation,
four final criterion judges, and one clean exact-SHA identity across repository,
deployment, evidence, video, and submission.

Deployment, repository visibility, video publication, and Devpost submission are
external release actions. Until authorized and observed, their evidence remains
`PENDING`; local or adapter success never upgrades those rows.
