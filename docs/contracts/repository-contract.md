# Ratiflow versioned issue-document contract

Version 4.0 · Contract freeze candidate · 2026-09-01

## 1. Boundary, routes, and retention

Protocol v4 owns `/`, `/issue/[shareToken]`, and `/api/repository-v4/**`. Protocol v3
remains isolated at `/document/[shareToken]` and `/api/document-v3/**`; its tools and
data never register or appear on a v4 page.

The root page renders exactly three choices: **Incident postmortem**, **Product
document**, and **Open incident example**. Launch inserts an immutable r1 template
revision before returning a session. A shared v4 issue remains live for 30 days. Its
human and delegated-agent session credentials have the same upper-bound expiry and are
invalid once the issue expires.

Possession of the high-entropy URL grants account-free collaboration during that window.
The share token and session bearers are independent high-entropy secrets; only SHA-256
digests are stored. The browser persists a credential-only resume record and last-issue
pointer. It never stores document, revision, task, thread, comment, or history content in
`localStorage`. A tab may cache the current bundle in `sessionStorage`, but every resume
fetches the authoritative surface before WebMCP registration.

Launch, public example, join, and protected reset issue new plaintext credentials and are
deliberately non-replayable. They accept no request ID or `Idempotency-Key`; each retry is
a new credential-issuance operation. If the response is lost after commit, its unreachable
issue/member expires normally and the UI or harness starts a new operation. The server
never weakens hash-only storage or writes recoverable plaintext credentials merely to
reproduce a lost response. Launch/join/reset rate limits bound orphan creation.

Bootstrap fragment, valid tab session, valid browser credential, then fresh join is the
direct-link precedence. The page validates path/share/protocol/expiry, stores the bundle,
and removes the fragment before registering tools. Expired, `UNAUTHORIZED`, or
`NOT_FOUND` credentials are cleared; transient failures are not.

## 2. Checked entities

Checked TypeScript authority is `src/repository/contracts.ts`. All counters are safe
integers. All offsets and length limits use Unicode code points.

### Document and revisions

`IssueDocument` is the mutable head projection. It contains exactly one kind,
`POSTMORTEM | PRODUCT_DOCUMENT`, title/body, `revision`, `activityVersion`, timestamp,
and last-revision summary.

`IssueRevision` is immutable and reconstructable. It stores:

- UUID `revisionId`, integer `revision`, and `parentRevision`;
- full title/body snapshot;
- `sha256:` plus the lowercase SHA-256 hex digest of UTF-8
  `JSON.stringify({ title, body })`, with that property order;
- full one-splice-per-changed-field diffs in TITLE then BODY order;
- `sourceRevision`, which may precede the parent only after safe anchor rebasing;
- separate `author` and `committer` actor snapshots;
- server-derived `origin` for the committing transaction and `authorOrigin` for the
  authored content;
- authority `HUMAN | DIRECT | REVIEW | RESTORE`;
- linked task, grantor, approver, or restored revision as applicable;
- nonblank change summary and bounded evidence references; and
- timestamp.

The r1 parent is null, source revision is `0`, and its diffs are empty-to-template for
TITLE and BODY. Every later parent is exactly the previous head revision. There are no
gaps or rewritten numbers.

Authority coherence is exact:

| Authority | Origin / author origin | Author | Committer | Task | Grantor | Approver | Restored revision |
|---|---|---|---|---|---|---|---|
| `HUMAN` | UI / UI | human | same human | null | null | null | null |
| `DIRECT` | WebMCP / WebMCP | assigned agent | same agent | required | task creator | null | null |
| `REVIEW` | UI / WebMCP | assigned agent | accepting human | required | task creator | accepting human | null |
| `RESTORE` | UI / UI | human | same human | null | null | null | required |

Checked actors and tasks are discriminated unions. Human actors always have one member
and no agent label; agent actors always have one member and nonblank stored label;
system actors have neither. Task status fixes its legal proposal/result/decision shape:
only Review may be Proposed or Rejected; completed Comment has one COMMENTED result;
completed Direct has one COMMITTED result; completed Review has a proposal plus Accepted
decision; Open/Cancelled have none. Runtime validators enforce same-actor and creator /
grantor / approver identity equality that TypeScript cannot express structurally.

### Actors and members

`IssueMemberSnapshot` contains a stable workspace UUID and display name. An agent actor
contains the server-derived member principal plus the human-authored agent label stored
on its task. The label is descriptive, not authority or verified model identity. System
actors have no member.

No model input accepts actor, member, origin, agent label, document, page session,
grantor, approver, or task mode.

### Anchors

An anchor is `DOCUMENT` or `SELECTION`. Selection anchors store field, zero-based
end-exclusive code-point offsets, exact selected text, creation revision, current anchor
revision, and `ACTIVE | STALE` state. Document anchors contain no field, offsets, or
selected text and are always active.

Review and Direct tasks require a non-empty Selection anchor. Comment tasks and
standalone discussion may use Document or Selection.

On each content mutation, the server derives at most one contiguous splice per changed
field from the old and new full values. An active anchor:

- before a splice is unchanged;
- after a splice shifts by the code-point delta;
- disjoint from a splice keeps its text and adopts the new anchor revision; and
- overlapping, enclosed by, enclosing, or ambiguous with a splice becomes stale.

Anchors in an unchanged field adopt the new revision. A restore conservatively stales
all active selection tasks and selection threads whose selected text/range does not
exist exactly at the same location in the restored snapshot.

### Tasks

Every `IssueTask` has immutable creator, assignee, agent label, mode, instruction,
category, target, and thread. Assignment requires an existing, unexpired workspace
member but never requires current presence.

Mode is exact:

- `COMMENT`: Document or Selection target; result contains no replacement.
- `REVIEW`: Selection target; result stores one proposal and does not mutate content.
- `DIRECT`: Selection target; result atomically applies one replacement.

Lifecycle is:

- `OPEN -> PROPOSED | COMPLETED | CANCELLED | STALE`
- `PROPOSED -> COMPLETED | REJECTED | STALE`

The creator alone may cancel or decide. Only the delegated agent session belonging to
the immutable assignee may list, wait, comment as that agent, or submit. Cross-task and
cross-assignee access returns `UNAUTHORIZED` without confirming the target exists.

Active-task limits count `OPEN` plus `PROPOSED`: 100 per issue and 50 per assignee. An
issue may create at most 500 tasks over its 30-day life. Reaching the lifetime cap fails
without mutation; terminal tasks are never pruned or hidden.

### Threads and comments

A standalone thread has `taskId: null`; every task owns one dedicated thread. Each
thread stores its anchor, creator, state, timestamps, and append-only comments. A reply
must name an existing comment in the same thread. Human comments may be added to any
visible thread. Agent comments require ownership of the linked task and cannot target a
standalone thread.

Resolving a standalone thread requires a workspace human. A task thread follows task
lifecycle and remains readable after completion/rejection/cancellation/stale. Resolving
never deletes or rewrites a comment.

Each comment stores server-derived author/origin, exact bounded body, bounded evidence
references, optional reply link, and timestamp. Every returned body, instruction,
selection, label, summary, and evidence reference is untrusted content.

A workspace may create at most 500 standalone threads; task-owned threads are bounded by
the 500-task lifetime cap. A thread accepts at most 100 comments for this 30-day POC. Once full, further comments
fail without changing counters. Every returned thread therefore contains its complete
discussion, ordered oldest-first by creation time and then comment ID; there is no
hidden or unpageable earlier segment.

## 3. Transaction and counter semantics

Every modifying transaction resolves the session, locks the document row first, checks
protocol/expiry/authority/replay, performs all validation, then changes state.

| Operation | Revision | Activity | Primary effect |
|---|---:|---:|---|
| Launch template | r1 | av1 | head + full r1 snapshot |
| Changed human Save revision | +1 | +1 | head + full Human revision |
| Create/cancel task | — | +1 | task/thread state |
| Create/resolve thread | — | +1 | thread state |
| Human/agent comment | — | +1 | append comment |
| Comment task result | — | +1 | append finding + complete task |
| Review result | — | +1 | store proposal |
| Reject Review | — | +1 | store terminal decision |
| Accept Review | +1 | +1 | head + full Review revision + decision |
| Direct result | +1 | +1 | head + full Direct revision + completed task |
| Restore | +1 | +1 | head + full Restore revision |
| Presence/read/wait/timeout/pre-dispatch abort/no-op/failure/replay | — | — | none |

One transaction appends exactly one activity record with the resulting activity
version. Content-changing operations insert exactly one revision and update head in the
same transaction. There is no state where head advanced without its snapshot, or work
completed without its Direct/Review revision.

Every authenticated human or agent mutation after credential issuance has a UUID request
ID outside model JSON. The ledger key is document plus request ID. Identical canonical
input returns the original result without new counters; changed canonical input returns
`REQUEST_REPLAY_MISMATCH`. A browser client creates one request ID per logical mutation
and reuses it only for transport retries of that same call. A separately invoked comment
is a new logical append even when its model-visible arguments are identical.

Cancellation is definitive only before dispatch or before the server transaction begins.
After a remote write is dispatched, the client may observe `AbortError` even though the
server commits. It must re-inspect authoritative state; retrying the same logical call
reuses its request ID and therefore cannot double-commit. No UI or tool result claims
that cancellation rolled back a dispatched request.

## 4. Result submission and concurrency

`submit_task_result` accepts only task ID, `basedOnRevision`, result summary, optional
replacement, and optional evidence references. The server performs the mode branch.

For `COMMENT`, replacement must be absent. The result is appended to the task thread as
an agent finding, task becomes Completed, and outcome is `COMMENTED`.

For `REVIEW`, replacement is required and must differ from the live target. A proposal
captures replacement, summary, evidence, source revision, agent, and time. Head/revision
do not change and outcome is `PROPOSED`.

For `DIRECT`, replacement is required and must differ from the live target. In one
transaction the replacement is applied to the current stored anchor, other anchors are
rebased/staled, full revision is inserted, task completes, and outcome is `COMMITTED`.

`basedOnRevision` may equal the task's creation revision or any observed revision at or
after it. A value greater than current head is invalid. A value below current head is
accepted only if the stored task remains Open/Proposed as appropriate, its active anchor
has deterministically rebased through every intervening content revision, and the live
selected text still equals the stored target. The new revision records the supplied
source and actual current parent.

Review acceptance repeats the same live-anchor check. A non-overlapping later edit may
rebase a proposal. Any overlap stales it before acceptance. First terminal decision wins.

## 5. Human operations

The human service supports launch, example, join, inspect, explicit Save revision,
create task, create standalone thread, add/reply comment, resolve thread, cancel task,
accept/reject Review proposal, read history, read exact revision, restore revision, and
presence.

Save revision requires current head, full bounded title/body, and a nonblank summary. An
unchanged save is a no-op with no counter. A stale save returns current counters and
head; the UI preserves the local draft and offers Use latest or retry after manual merge.

Restore requires current head and an existing target revision in the same document. It
copies the stored snapshot into a new next revision with authority Restore. Restoring
the current byte-identical content is an invalid no-op.

## 6. History, surfaces, and pagination

The human surface returns current document, presence, durable member list, all tasks and
threads within the checked lifetime caps, and newest revision summaries. It never treats
presence as membership. Tasks are ordered active before terminal, then `updatedAt`
descending and task ID ascending. Threads follow their task's order, followed by
standalone threads ordered `createdAt` descending and thread ID ascending. This is a
complete bounded projection, not a truncated array with hidden older work.

History pagination selects the newest `limit` revisions whose revision is strictly less
than optional `beforeRevision`, or newest revisions when omitted, and returns them in
strict revision-descending (newest-first) order for both HTTP/UI and WebMCP. Limit is
1–50, default 20. `nextBeforeRevision` is the oldest returned revision when more exist,
else null. Reading one revision returns its complete snapshot and provenance. Tests
prevent duplicates, gaps, or order reversal.

Surface reconciliation is monotonic: higher document revision wins content; at equal
revision, higher activity wins tasks/threads/history; presence merges independently by
newest heartbeat. A delayed equal-revision response cannot hide a comment, proposal, or
terminal task.

## 7. Exact WebMCP catalog

All six tools register from page start in this order:

1. `inspect_document({ revision? })`
2. `read_document_history({ beforeRevision?, limit? })`
3. `list_my_tasks({ includeResolved? })`
4. `wait_for_my_tasks({ afterActivityVersion, afterRevision, timeoutSeconds? })`
5. `comment_on_task({ taskId, body, replyToCommentId?, evidenceRefs? })`
6. `submit_task_result({ taskId, basedOnRevision, resultSummary,
   replacementText?, evidenceRefs? })`

Schemas reject additional properties. Bounds come only from
`src/repository/contracts.ts`. The exported `REPOSITORY_WEBMCP_TOOL_CATALOG` freezes each
exact description, closed JSON Schema, annotation set, and order; registration consumes
that value rather than recreating it. Read tools are read-only/idempotent/untrusted. Comment and
result tools are mutating, closed-world, untrusted, and declare `idempotentHint: false`:
a new invocation is a new logical operation. One callback execution still uses a stable
bridge-generated request ID across ambiguous transport retries. A Direct result is
reversible through revision Restore; tool annotations and copy must not call it read-only.

`inspect_document` returns current document for omitted revision, or the exact stored
historical snapshot for a supplied revision, plus collaborators and bounded task
summary. `read_document_history` returns immutable revision provenance/diffs.

`list_my_tasks` returns only tasks assigned to the current member's agent. Each task is
paired with its dedicated thread and complete, oldest-first discussion (at most 100
comments). Default omits terminal tasks; `includeResolved: true` includes them so a
fresh delegated agent can recover prior reasoning.

`wait_for_my_tasks` uses explicit cursors and one absolute deadline, default/max 20
seconds. It fetches, subscribes, refetches, and returns owned Open work immediately.
Otherwise a higher document revision returns `DOCUMENT_CHANGED`; unrelated activity
advances the internal activity cursor without producing a false task wake; deadline
returns `TIMEOUT`. Future cursors fail before installing a listener. One page/member wait
may be active; a second returns `WAIT_ALREADY_ACTIVE`. The wait exists only during the
open page/tool turn and never claims to wake a dormant model.

`comment_on_task` checks paired ownership and appends an agent comment/reply.
`submit_task_result` returns one of `COMMENTED | PROPOSED | COMMITTED` from stored mode.
The model does not choose the outcome.

Callbacks capture document, protocol, browser session, page session, member, and agent
token when registered. They read mutable current state through a live ref, honor tool
`AbortSignal`, throw/observe `AbortError` as supported, refetch after mutations, and fail
`STALE_PAGE_CONTEXT` if navigation/session identity changed. Every result is JSON-safe.

No v4 tool creates, reassigns, cancels, accepts, rejects, restores, resolves, or changes
mode. No v3 or decision-room tool appears on the issue page.

## 8. HTTP namespace

The exact v4 route namespace is:

- `POST /api/repository-v4/launch`
- `POST /api/repository-v4/example`
- `POST /api/repository-v4/join`
- `GET /api/repository-v4/surface`
- `POST /api/repository-v4/revision/save`
- `POST /api/repository-v4/revision/history`
- `POST /api/repository-v4/revision/read`
- `POST /api/repository-v4/revision/restore`
- `POST /api/repository-v4/task/create`
- `POST /api/repository-v4/task/cancel`
- `POST /api/repository-v4/task/accept`
- `POST /api/repository-v4/task/reject`
- `POST /api/repository-v4/thread/create`
- `POST /api/repository-v4/thread/comment`
- `POST /api/repository-v4/thread/resolve`
- `POST /api/repository-v4/presence`
- `POST /api/repository-v4/agent/tasks`
- `POST /api/repository-v4/agent/tasks/wait`
- `POST /api/repository-v4/agent/comment`
- `POST /api/repository-v4/agent/result`
- `POST /api/repository-v4/eval/reset` in preview/eval only

Human routes require human bearer except launch/join/example. Agent routes require agent
bearer and page-session header. Credential-issuing launch, example, join, and protected
reset accept no idempotency key. Every other mutation, including presence, requires a
UUID `Idempotency-Key` header. Public bodies use the exact `*HttpInput` or model-visible
`*ToolInput` shapes in `src/repository/contracts.ts`, reject unknown properties, and never
accept `requestId`. `revision/read` uses `ReadIssueRevisionHttpInput`. The HTTP/bridge
boundary adds the header to the corresponding internal `*ServiceInput`, retaining it for
transport retry of the same logical call.

## 9. Persistence namespace and security

Applied v2/v3 migrations are immutable. One additive v4 migration may extend the
document protocol constraint and request-ledger operations, add document kind, and add:

- `ratiflow_issue_revisions_v4`
- `ratiflow_issue_tasks_v4`
- `ratiflow_issue_threads_v4`
- `ratiflow_issue_comments_v4`
- `ratiflow_issue_activity_v4`

Every exposed-schema table has RLS enabled. Direct table privileges are revoked from
`public`, `anon`, and `authenticated`. Narrow security-definer RPCs validate opaque
hashed sessions, set a fixed search path, and receive explicit grants. Because current
Supabase defaults are moving to opt-in Data API exposure, the migration must explicitly
revoke defaults and grant only intended RPC execution; it cannot rely on implicit table
or function ACLs.

The exact RPC names are:

- `ratiflow_launch_issue_v4`
- `ratiflow_join_issue_v4`
- `ratiflow_inspect_issue_v4`
- `ratiflow_save_issue_revision_v4`
- `ratiflow_create_issue_task_v4`
- `ratiflow_create_issue_thread_v4`
- `ratiflow_add_issue_comment_v4`
- `ratiflow_resolve_issue_thread_v4`
- `ratiflow_cancel_issue_task_v4`
- `ratiflow_accept_issue_task_v4`
- `ratiflow_reject_issue_task_v4`
- `ratiflow_restore_issue_revision_v4`
- `ratiflow_read_issue_history_v4`
- `ratiflow_read_issue_revision_v4`
- `ratiflow_list_my_issue_tasks_v4`
- `ratiflow_comment_on_issue_task_v4`
- `ratiflow_submit_issue_task_result_v4`
- `ratiflow_touch_issue_presence_v4`
- `ratiflow_reset_postmortem_hero_v4` (service-role only)

Reset is revoked from `public`, `anon`, and `authenticated`. Canonical production does
not expose the HTTP reset. Example creation composes ordinary service operations or a
separately proven public example builder; it never calls the protected reset.

The public **Open incident example** builder is production behavior owned by the domain
service and adapter parity: it returns a fresh completed r4/av10 clone of the exact golden
to its opening human as Priya Shah; its public input is the exact empty object and cannot
rename, replace, or add a fixture member. Exact comparison normalizes only fresh document,
revision, member, task, thread, comment, session, request, and share identifiers; all
credentials/bootstrap paths; every creation/update/resolution/expiry timestamp; and
derived display colors. The referential graph must remain isomorphic. Document kind,
title/body snapshots and digests, human names, agent labels, task keys/modes/statuses/
anchors, thread and reply relationships, comments, results, decisions, evidence,
revision numbers/parents/sources/diffs/summaries/provenance roles, and r4/av10 counters
must equal the golden. Timestamps must retain golden event order even though values vary.
The protected
reset instead creates the executable starting state r1/av4 with Priya, Nadia, Leo, and
Sam plus the three Open tasks. Its checked `ResetPostmortemHeroOutcome` returns fixture
version, share token, four named top-level bootstrap paths, expiry, revision 1,
and activity 4. A bootstrap path is a bearer secret until opened and scrubbed; raw paths,
fragments, or exchanged session bundles never enter logs or evidence. Reset response
loss starts a fresh reset rather than replaying plaintext credentials.

## 10. Errors and bounds

Errors use the checked codes:

- `INVALID_INPUT` — malformed shape, future counter, no-op, blank/overlong text, bad
  reply/evidence, or a replacement where mode forbids it;
- `UNAUTHORIZED` — invalid/expired/cross-member/cross-task authority without disclosure;
- `NOT_FOUND` — issue or same-authority requested entity absent;
- `STALE_DOCUMENT` — strict human save/restore expected revision differs;
- `STALE_TASK_CONTEXT` — task anchor/result/proposal cannot safely apply;
- `TASK_MODE_VIOLATION` — authenticated agent operation contradicts stored mode;
- `REQUEST_REPLAY_MISMATCH` — request ID reused with changed canonical input;
- `STALE_PAGE_CONTEXT` — registered page/session identity changed;
- `WAIT_ALREADY_ACTIVE` — duplicate page/member wait;
- `RATE_LIMITED` — active task/thread/comment or launch limit exceeded; and
- `PROTOCOL_MISMATCH` — v4 operation against a non-v4 issue.

Text limits, history/wait limits, 500-task and 500-standalone-thread lifetime caps, and
active/comment capacities are exactly the exported constants.
Unknown properties and unsafe integers fail at schema and server layers. Evidence refs
are 1–240 nonblank code points, at most 12 per comment/result/revision, and are labels or
URLs—not fetched or certified by Ratiflow.

## 11. Deterministic hero and product-document smoke

`docs/contracts/postmortem-hero-scenario.md` and independent JSON goldens freeze
`INC-482`, r1-r4, task IDs, exact facts, comment thread, replacements, digests, and fresh
agent answer. Production seed code may import checked types but tests compare it to the
independent JSON; it cannot import that production builder as its oracle.

The Product document smoke creates the exact template from `product_spec.md`, r1/av1,
one human member, no tasks/threads, and a valid full initial revision. It proves the same
human and WebMCP surface without inventing a second complex hero.

## 12. Accessibility and fallback

The title/body remain native spellchecked controls. Modified pointer right-click,
keyboard context-menu invocation, empty selections, and non-editor targets retain native
behavior. Selection actions, task composer, radio fieldset, thread replies, History,
revision detail, restore, conflicts, and errors are keyboard reachable with visible
focus.

At 390 px there is no horizontal overflow; the rail is a non-modal labelled drawer,
touch controls are at least 44 px, long untrusted text wraps, Escape closes and restores
focus, and reduced-motion preferences are honored.

With WebMCP absent, a human can create either template, edit/save, share/join, create and
manage tasks, discuss, decide proposals, inspect full history, compare, and restore. The
agent status says WebMCP unavailable and never claims an agent was connected, notified,
or started.
