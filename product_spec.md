# Ratiflow product specification

Version 4.1 · Comment-first collaboration refreeze · Owner: Ant · 2026-09-02

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
- `evals/goldens/repo-document-v4.1/` for independently authored completed-scenario
  oracles (with the v4 directory retained for blank-template compatibility); and
- `EVALS.md` for evidence and release gates.

The v3 `docs/contracts/editor-contract.md`, `src/document/contracts.ts`, routes,
migrations, and evidence remain dated compatibility authority only. They cannot prove a
v4 revision, comment, task-authority, direct-write, template, or native-tool claim.

## 1. Product promise

**Ratiflow is a versioned document where people collaborate by commenting on exact
passages, mention the agents they bring with `@`, and preserve a complete record of who
changed what, why, from which context, and for whom.**

The final document is the product. Tasks, comments, agent findings, proposals, and
revision history are the path to that product, not a chat transcript that replaces it.
A person can open the shared URL, read and edit the document, discuss it, inspect every
revision, and restore an older version without connecting an agent.

When a compatible agent is present, the top-level page exposes the document, joined
history and discussion context, owned mentions, and a scoped result surface through
`document.modelContext`. Each collaborator may bring a different agent. Ratiflow does
not host or wake the model, require a vendor-specific integration, or claim access to
external metrics, logs, or source code. Those capabilities belong to the agent.

There is one primary delegation rule: an anchored comment beginning with a recognized
`@Agent` name creates durable work for that agent and grants one direct replacement of
that exact passage. The agent's change commits immediately as a reversible revision.
There is no task-mode chooser and no Ratiflow approval step. Text without an agent
mention creates an ordinary human discussion that can be closed. Legacy v4 Review and
Comment records remain readable compatibility data but cannot be created from the new
flagship interface.

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

The human-facing labels are **Comments**, **History**, **Change**, **Close**, and
**Restore**. Task mechanics stay behind the comment interaction. P0 has no branches, pull requests,
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

Both templates use the same revision, mention, comment, history, and WebMCP primitives.
The body is stored as Markdown source and read as safely rendered GFM, including tables.
A validated fenced `chart` JSON block renders a revisioned SVG chart and accessible data
table. No blank general-purpose document, folder, attachment, arbitrary HTML/embed,
spreadsheet application, or third template appears in P0.

## 4. Flagship surface and human workflow

`/` asks for the person's display name, shows the two-card template picker, and offers
**Explore postmortem** and **Explore product document** actions. It always shows this
setup, even when the browser retains an earlier credential; `/new` does the same. Direct
`/issue/[shareToken]` reloads resume the matching stored member session. Creating a
template launches a high-entropy shared workspace and opens `/issue/[shareToken]`.
Anyone holding the URL may join while the POC workspace remains live. The page never
describes possession-of-link access as private authenticated storage.

Each example accepts its checked document kind and the person's display name, creates a
fresh completed clone of an independent golden, and adds that person only as the current
non-authoring viewer. `INC-482` is the detailed postmortem; `Northstar CSV launch` is the
detailed Product document. Both contain multiple human and agent revisions, a closed
human discussion, exact @ prompts, context snapshots, rationales, evidence, rendered
tables/charts, and a continuity answer for a genuinely new agent owner. Fresh identifiers,
credentials, timestamps, expiry, and colors are normalized in comparison; content,
digests, names, graph, anchors, evidence, counters, diffs, and provenance remain exact.
Protected runnable resets are separate and production examples never call them.

The workspace has three quiet regions:

- a compact top bar with Ratiflow, document type, `rN · Saved`, collaborators, Share,
  and New document;
- a dominant safely rendered title/body document with a deliberate source-edit mode; and
- a spatially aligned comment margin; History opens as a quiet sheet and both become an
  accessible drawer below 740 px.

On first entry, a dismissible setup strip names the current human and explains the next
agent step without blocking ordinary document work. In a supported client it accepts a
local proposed agent name only to compose a copyable instruction; it does not create a
profile. The external agent must call `connect_agent` itself. The strip reports tool
registration, no-agent, unsupported-client, error, and successfully connected states
separately. Its top-bar control reopens the strip, and a successful connection shows the
exact self-declared agent name plus human owner for this page.

Comments align to their anchored passage. A plain comment shows its author, time,
discussion, and **Close**. An @ mention shows its human owner, named agent, exact prompt,
status, source context, and discussion. When complete it also shows the highlighted
before/after change, agent rationale, evidence, linked revision, and **Restore**. Closed
and completed context remains discoverable without competing with the document.

History is a simple newest-first revision line. Opening a revision shows its author,
owner, parent, exact prompt and source context when agent-authored, concise rationale,
evidence, server-computed before/after change, and historical rendered snapshot. Comments
remain linked context rather than fake content revisions. **Restore this revision**
requires a current-revision check and appends a new human-authored revision.

A non-empty rendered title/body selection or a block comment affordance opens one compact
comment bubble. Typing `@` autocompletes recorded self-declared agent profiles; submitting a
recognized mention creates scoped Direct work. Any other text creates an anchored human
discussion. There is no second form. Ambiguous rendered-to-source mapping fails clearly
and preserves the selection rather than attaching to the wrong text. Pointer-origin
context-menu safeguards, native spelling behavior in source edit mode, Unicode code-point
conversion, focus restoration, and modified right-click behavior remain strict.

Presence is advisory. A known workspace member does not need a heartbeat in the last 15
seconds to receive durable work. Joining the shared URL is still required before a
person can become an assignee.

Ordinary human editing switches the rendered body into Markdown source, preserves a local
draft, and saves one revision through **Done** or Cmd/Ctrl+S with a server-derived summary;
no change-summary form is exposed. The summary is exactly `Edited the document title.`,
`Edited the document.`, or `Edited the document title and body.` according to the fields
that changed. Conflict recovery remains explicit. The product does
not claim character-level CRDT or automatic merge behavior.

## 5. Identity, attribution, and bring-your-own-agent

One workspace member has distinct human and delegated-agent bearer credentials. The
person supplies the display name shown on their own work. The agent credential is a
page-scoped capability for whatever compatible agent that member brings; it is not a
verified model identity or a hosted Ratiflow agent.

The ordinary UI never manufactures an agent profile from a human-entered label. It may
help the person compose `Connect to this Ratiflow document as "Name"` and explain that
one current profile exists per collaborator; teammates connect their own agents. A
profile appears as connected for the current page only after the page callback observes
a successful `connect_agent`, and that state clears on invalidation or teardown.

The current WebMCP draft invokes a tool with the declared input object and execution
options containing `AbortSignal`; it supplies no trustworthy caller/model identity.
Therefore the first agent operation in every page registration lifetime is
`connect_agent({ name })`. The name is explicitly self-declared and bounded. The server
derives and stores its human owner, document, member, first-seen time, last-access time,
and access count from the agent credential; the bridge supplies page-session freshness
outside model JSON. Connect records a server-side binding for the credential session and
page-session UUID, and every later call must match it. Connect plus first-commit agent
comment/result mutations refresh the profile without creating a document revision or
coordination activity; read and wait tools remain true no-touch reads. A recorded profile
is durable identity/provenance, not a live-presence claim. The UI may say
`Databot · owned by Nadia`;
it must not say the vendor identity is verified.

The server derives document, member, actor type, origin, page session, task ownership,
mode, scope, and grantor from authenticated execution context and stored records.
WebMCP input never accepts those fields.

Agent attribution contains:

- the human workspace principal whose page delegated the call;
- the stable profile ID and current self-declared agent name captured for that action;
- the immutable assigned agent name selected by the original mention, when the action
  belongs to a task;
- actor type `AGENT` and origin `WEBMCP`; and
- identity source `SELF_DECLARED`, never a claim inferred from the browser or vendor.

Human attribution contains the stable workspace member snapshot and origin
`ORDINARY_UI`. No public revision, task, comment, tool result, capture, or log contains
bearer tokens, credential hashes, browser storage, bootstrap fragments, or page session
handles.

The v4 POC keeps account-free link access and bounded retention. A document and its
revision history outlive a browser tab and agent turn; they never disappear merely
because presence or a page-local wait ended. Product copy states the actual retention
window rather than promising permanent hosted storage.

## 6. Mentions, comments, and scoped work

The browser parses only a leading mention selected from the connected-agent roster. A
recognized `@Agent prompt` plus a non-empty exact title/body source range compiles to one
Direct task. The server derives title, category `GENERAL`, agent name, assignee, mode,
owner, actor, origin, and authority; none are accepted from the model. Every task stores:

- immutable creator, owner, assignee, and agent-profile snapshots;
- the exact comment prompt, selected agent name, and exact source anchor;
- a canonical context snapshot containing source revision/digest, rendered document
  title, bounded source immediately before/after the target, and the target itself;
- creation, source, live-anchor, and result revisions;
- a dedicated discussion thread;
- result rationale, replacement, evidence, and server-computed diff; and
- lifecycle timestamps.

New mention work uses `OPEN -> COMPLETED | CANCELLED | STALE`. Only the paired agent of
the immutable assignee may list, wait, discuss, or submit. Any workspace human may view
the prompt and discussion; server attribution prevents impersonation. Compatibility
records may retain old v4 modes/statuses but the primary UI does not create or decide them.

All comment records are first-class and append-only and record the authoritative document
revision at comment time. A plain thread may be anchored to text or a rendered block; a
reply references a comment in the same thread. The original source target and creation
revision never change; the live anchor may rebase. **Close** resolves a human thread and
records the closer/time without deleting or calling it accepted. A task thread resolves
when the agent task completes and keeps its prompt, context, rationale, and change.

The 30-day POC has explicit lifetime bounds: 500 tasks and 500 standalone threads per
issue, at most 100 members, and at most 100 comments in each thread. The human surface returns this complete
bounded work state; it does not silently truncate terminal tasks or older discussion.

`submit_task_result` requires one nonblank concise rationale and one changed replacement.
The replacement is applied to the current stored anchor in the same transaction that
completes the task, resolves its thread, appends activity, and creates the immutable
revision. It never creates a proposal or waits for Ratiflow approval.

A successful result may be based on an older revision only when intervening changes are
provably disjoint and the stored anchor rebases exactly. The resulting revision records
both the agent's source revision and the actual parent revision. Overlap, changed target
text, ambiguity, a stale/cancelled task, or a finalized decision fails without partial
mutation.

## 7. Revisions and provenance

Revision numbers are server-owned safe integers beginning at `1`. Template creation
inserts r1. Every content-changing human save, completed @Agent result, and Restore
creates exactly one next revision in a document-locked transaction.

Each immutable revision stores:

- revision UUID, number, parent number, complete title/body snapshot, and SHA-256
  content digest;
- full server-computed changed segments;
- source revision and rebasing metadata;
- content author and commit actor as separate snapshots;
- server-derived commit origin, authored-content origin, and authority kind
  `HUMAN | DIRECT | REVIEW | RESTORE`; `REVIEW` is compatibility-only;
- linked task, grantor, approver, or restored revision where applicable;
- exact bounded change summary and evidence references; and
- creation timestamp.

For a human save, author and committer are the same human. For an @Agent task, both are
the selected self-declared agent and the revision also names its human owner/grantor.
Historical accepted Review records retain separate agent author and human approver.

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
comments, replacements, revision digests, and final r5 content.

Source facts are:

- `impact.csv`: 28,417 checkout attempts, 6,742 failures, 311 merchants affected, and
  zero duplicate charges;
- `checkout.log`: provider 429s began 09:43 UTC, retry traffic reached 5.8×, the queue
  grew from 420 to 18,240, rollback began 10:17, and recovery completed 10:21; and
- code fixture commit `7d3c9e1`: retry middleware ignored `Retry-After` and made up to
  five zero-delay retries.

Three anchored @ comments begin together:

| Mention | Target | Agent outcome |
|---|---|---|
| `@Databot` | Impact placeholder | Exact impact facts, GFM table, and checkout outcome chart |
| `@Logbot` | Timeline placeholder | Exact 09:43–10:21 UTC timeline |
| `@Builder` | Root cause placeholder | Trigger/amplifier explanation from code and log evidence |

The observed sequence is:

1. Priya can read a coherent r1 postmortem before connecting any agent.
2. Databot submits from r1. Direct authority creates r2 and completes its mention.
3. Logbot also submits from r1. Its disjoint anchor rebases over r2 and creates r3.
4. Builder submits from r1 and creates r4 without product approval.
5. Priya comments on the committed Root cause: `Provider throttling happened first. Are
   we overclaiming our code as the root cause?`
6. Priya assigns a second anchored `@Builder` comment. Builder uses the prior prompt,
   comment, code/log evidence, and revision history, then creates clarified r5. Priya
   closes the human discussion; no content approval event is invented.
7. History shows reconstructable r1-r5 snapshots and exact prompt/context/rationale
   provenance. The final
   postmortem is clean, factual, and actionable rather than a task transcript.
8. A newly joined human connects a fresh agent with no prior task. It reads collaboration
   context and explains why provider latency alone was insufficient as root cause.
9. The completed Northstar Product document independently proves human revision,
   @Databot analysis/table/chart, @ChatGPT synthesis, closed discussion, restore, and the
   same fresh-agent continuity path.

The demo must not imply that Ratiflow itself queried the CSV, log service, or repository.
Those named fixture facts simulate outputs brought by the external specialist agents.

## 9. Exact WebMCP surface

All eight tools register from the top-level issue page at page start:

| Tool | Purpose |
|---|---|
| `connect_agent` | Record a bounded self-declared agent name bound to the authenticated human owner and return the current profile. |
| `inspect_document` | Read the current or one requested historical snapshot, counters, collaborators, and bounded task summary. |
| `read_document_history` | Read a bounded newest revision window with complete provenance and full diffs. |
| `read_collaboration_context` | Page the newest-first activity ledger joined to revisions, prompts, source context, rationales, discussions, closed human comments, and agent profiles across contributors. |
| `list_my_tasks` | Read open tasks assigned to this member's agent; optionally include resolved tasks and their discussion. |
| `wait_for_my_tasks` | Wait up to 20 seconds for owned open work or a document change while the page/tool turn remains active. |
| `comment_on_task` | Add a bounded agent comment or reply to one owned task thread. |
| `submit_task_result` | Submit a rationale, evidence, and scoped replacement; successful new mention work returns `COMMITTED`. |

`src/repository/contracts.ts` exports the complete ordered catalog, including each exact
description, closed JSON Schema, and annotation set. Runtime registration consumes that
catalog; it does not maintain a second hand-written version.

Except for the explicitly self-declared display name in `connect_agent`, the model never
supplies request ID, document, member, owner, actor, origin, task mode, assignee, grantor,
anchor, approval, or commit authority. The bridge supplies page and
request identity outside tool JSON. One logical mutation keeps one request identity
through transport retries; a new invocation is a new operation. Every tool validates
inputs at schema and server layers, treats returned human/agent text as untrusted,
returns JSON-serializable data, handles cancellation with re-inspection after ambiguous
dispatch, and tears down on navigation/session expiry.

No agent tool creates, reassigns, cancels, restores, or changes task authority.
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
| WebMCP Leverage | Different collaborators connect named agents to the same live document. The page natively exposes owned @ mentions, joined history/discussion context, and scoped result submission. Removing WebMCP removes the zero-configuration multi-agent loop. |
| Execution | Multiple @ mentions land safely from shared source revisions, comments synchronize/close, Markdown tables and charts render, history reconstructs every prompt/context/rationale/change, restore works, and both detailed examples remain usable without WebMCP. |
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
arbitrary WYSIWYG rich-text blocks, executable/raw HTML, network embeds, arbitrary
templates, character-level CRDT, offline sync, background agent execution, agent-to-agent
messaging, branches, merges, pull requests, arbitrary code or observability connectors,
verified model identity, public search, permanent storage claims, and generalized roles.

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
