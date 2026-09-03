# Ratiflow protocol-4 issue-document and managed-relay contract

Version 4.3 · Ratiflow grants assignment capabilities · 2026-09-03

## v4.3 capability-first authority

Managed bot identity and website authority are independent. `@Data`, `@Code`, and
`@General` retain descriptive `expertise`; directory `visibility` is metadata only. A
managed directory entry does not carry authoritative site tools or source labels.

The canonical managed mention agent arm requires one separately selected
`accessProfile`: `METRICS_SCOPED_EDIT`, `REPOSITORY_SCOPED_EDIT`, or
`EDITORIAL_SCOPED_EDIT`. The server—not the browser or model—maps it through the checked
access policy to task category, ordered site tools, required calls, source labels, and
`DIRECT_SELECTION` authority. It stores the profile on `RelayRun` and returns a distinct
`RelayCapabilityGrant` on claim. The human mention arm rejects `accessProfile`; neither
arm accepts raw tools, sources, actor, owner, origin, credentials, or mutation range
authority.

Every new catalog, physical name, manifest, source read, and permit is reconstructed from
the grant-bound run access profile. Agent expertise must not influence those decisions.
Existing signed token shapes remain unchanged; server authorization follows their bound
run ID. Catalog visibility guides compatible agents, while repository range, revision,
task, lease, and permit checks enforce access.

This refreeze is additive to the shipped v4.1 collaboration document. The literal wire
and storage protocol remains `4`, `REPOSITORY_PROTOCOL_VERSION` remains `4`, and the
public namespace remains `/api/repository-v4/**`. Version 4.2 introduced the managed
sidecar; version 4.3 makes assignment access independent from bot expertise. It does not create protocol 5 or
replace the immutable v4 document, task, thread, comment, revision, and activity ledger.

Checked TypeScript authority is split deliberately. `src/repository/contracts.ts` owns
the existing repository graph plus `IssueMentionTarget` and the additive directory
mention input. `src/agent-relay/contracts.ts` owns every directory, relay, provider,
catalog, error, limit, and port name in this section. A later implementation may add
internal helpers, but may not rename, widen, or silently coerce these public contracts.

The winning product statement is: **Mention the expert. The page supplies the tools.
The document keeps the proof.** OpenAI Site Tools do not currently provide native Luna
WebMCP. Ratiflow therefore describes this feature precisely as an application-owned
WebMCP Relay powered by `gpt-5.6-luna`. Remote MCP is a separate protocol and is not the
runtime described here.

## v4.3.1 Boundary and v4.1 projection isolation

The ordinary issue-document surface and its eight idle BYOA WebMCP tools remain usable
without the relay. Managed execution is an optional sidecar over the same document. It
runs only while an eligible top-level document page is open, dispatches immediately
after a managed mention, and uses a 15-second visible-page recovery heartbeat. This is
not a cron job, background daemon, or promise to run after the page closes.

The v4.1 repository projection remains exact. `IssueWorkspaceSurface`, its existing JSON
keys, `activityVersion`, history pagination, the legacy name/member mention request, and
all pre-v4.2 routes keep their frozen meanings. Directory entries, relay runs, attempts,
leases, grants, permits, result receipts, and relay trace events never leak into that
projection. They are read through `RelayWorkspaceState` at the relay sidecar boundary.
`relayEventVersion` is independent of `activityVersion`; relay progress therefore cannot
wake a legacy task wait or masquerade as a document edit.

Managed profiles and their tasks may be represented to a v4.1-only reader only through
the existing compatibility shapes: the profile is not labeled `DEMO_DIRECTORY` in the
v4.1 profile projection, and a managed task/actor may be projected with the already legal
null-profile compatibility identity when necessary. The relay sidecar is the only
authority for managed identity source, runtime, expertise, readiness, access grant, run,
and attempt state. Existing self-declared profiles and old documents remain byte-for-byte
valid. No managed principal receives the human-owned BYOA session pair, so a legacy
agent route cannot execute managed work.

The sidecar is fail-closed. `RelayWorkspaceState.webMcpRequired` is always `true`. When
`document.modelContext` is absent or the supported WebMCP consumer path cannot be
observed, managed entries report `WEBMCP_UNAVAILABLE`, no Luna request is dispatched,
and no canned result is substituted. A compatibility adapter may support development,
but its evidence must be labeled compatibility and cannot satisfy a native WebMCP row.

## v4.3.2 Agent Directory and canonical mentions

`DirectoryEntry` is a discriminated union of `HumanDirectoryEntry` and
`AgentDirectoryEntry`. A human entry contains exactly `kind: "HUMAN"`, its immutable
member snapshot, handle, and display name. An agent entry contains exactly:

- `kind: "AGENT"`, stable profile UUID, and its distinct internal member principal;
- canonical handle and display name;
- directory visibility `COMPANY | TEAM | PERSONAL`;
- descriptive expertise `DATA | CODE | GENERAL`;
- identity source `DEMO_DIRECTORY | SELF_DECLARED`;
- runtime `OPENAI_LUNA_WEBMCP_RELAY | BRING_YOUR_OWN_AGENT`;
- readiness `READY | WEBMCP_UNAVAILABLE | DISABLED`.

Managed directory profiles own no authoritative tools or source labels. Self-declared
Advanced compatibility entries retain their existing repository-tool metadata.

The three managed demo handles are exactly `data`, `code`, and `general`. Each managed
agent owns a different internal member principal and stable profile. The existing
one-profile-per-document-member invariant therefore remains intact; managed agents are
never multiplexed through the judge's member or credential. `COMPANY | TEAM | PERSONAL`
is demo/display metadata, not authorization. Runtime readiness is derived at the server
and page boundary and is not accepted from a browser or model.

Handles are selected from autocomplete by canonical ID. Display text and typed `@`
names are not authority. `IssueMentionTarget` is exactly one of:

- `{ kind: "HUMAN", memberId }`; or
- `{ kind: "AGENT", profileId }`.

`CreateDirectoryMentionHttpInput` contains current `expectedRevision`, bounded comment,
canonical `target`, and an anchor. A human target may use a Document or Selection anchor
and rejects `accessProfile`. An agent target requires an active, non-empty Selection
anchor no longer than 8,000 code points and exactly one `accessProfile`. The server locks
the document, resolves identity by profile ID, and expands access through the canonical
policy; callers cannot submit raw tools or sources. A missing, renamed, disabled,
cross-document, or type-mismatched target fails with `STALE_MENTION_TARGET`; an unknown or
malformed access choice fails without partial state.

The selected ID is authority, but visible text must still agree with it. The canonical
mention token is `@` followed by the target's current display label; for the managed demo
profiles it is exactly `@Data`, `@Code`, or `@General`. The bounded 2,000-code-point
comment must begin with that exact case-sensitive token, then one or more ASCII space,
tab, CR, or LF code points, then nonblank body text. The compiler removes only that exact
prefix/separator and trims only those four ASCII whitespace characters at both body ends.
For an agent target the remainder is the immutable instruction, preserves interior text,
and must independently fit the 1,000-code-point instruction bound. The server derives the
task title by collapsing runs of those four whitespace characters to one U+0020 space and
taking the first 120 Unicode code points without an ellipsis. A mismatch, stale label, or
overflow fails atomically with `STALE_MENTION_TARGET` or the existing bounded-input error;
it never silently becomes a different mention. Later `@` text is ordinary comment text.

Selecting a human creates one ordinary standalone thread and root comment and returns a
`DirectoryMentionReceipt` with outcome `DISCUSSION_CREATED`, human target, thread and
comment IDs, and null task/run IDs. It does not call a model or create relay work.

Selecting a ready managed agent atomically creates:

1. the root human comment and immutable mention-target snapshot;
2. one task-owned thread;
3. one existing `DIRECT` Selection task with the v4.1 immutable context snapshot;
4. one `RelayRun` in `QUEUED` with immutable `accessProfile`; and
5. one `RUN_QUEUED` relay trace event.

It returns outcome `MANAGED_TASK_QUEUED` with the canonical agent target and the thread,
comment, task, and run UUIDs. Category is server-derived as
`METRICS_SCOPED_EDIT -> DATA`, `REPOSITORY_SCOPED_EDIT -> CODEBASE`, and
`EDITORIAL_SCOPED_EDIT -> WRITING`. Task authority, exact-range validation,
stale overlap behavior, rationale, evidence, revision, and Restore continue to use the
existing repository engine.

The current `/api/repository-v4/task/mention` route accepts two exact, non-overlapping
request shapes. The shipped v4.1 shape `{ expectedRevision, comment,
mentionedAgentName, assignedToMemberId, anchor }` continues to call the old
`createMentionTask` service and RPC. The v4.3 canonical-target-plus-access shape calls
`createDirectoryMention`. Both prohibit public `requestId`, derive it from an
`Idempotency-Key`, and replay only an exact identical request. Literal or unselected `@`
text remains an ordinary comment.

## v4.3.3 Run, attempt, lease, and task lifecycle

`RelayRun` contains run/task/profile IDs, `agentExpertise`, immutable `accessProfile`, constant runtime
`OPENAI_LUNA_WEBMCP_RELAY`, constant model `gpt-5.6-luna`, status, attempt count,
`maxAttempts: 2`, terminal reason, and timestamps. Its status is exactly:

`QUEUED | ACTIVE | WAITING_RETRY | COMPLETED | EXHAUSTED | CANCELLED`.

Its terminal reason is exactly `TASK_COMPLETED | ATTEMPTS_EXHAUSTED | TASK_CANCELLED |
TASK_STALE | null`. `COMPLETED`, `EXHAUSTED`, and `CANCELLED` are terminal. A run never
has more than two numbered attempts.

`RelayAttempt` contains attempt/run IDs, positive attempt number, status, the human
claimant snapshot, page-session UUID, positive registration generation, lease ID and
expiry, provider-dispatched flag, provider/tool call counts, current step, start,
deadline, update, and completion timestamps. Its status is exactly:

`CLAIMED | DISCOVERING | AWAITING_MODEL | EXECUTING_TOOL | RECONCILING | SUCCEEDED |
FAILED | EXPIRED | CANCELLED`.

Only one run may be `ACTIVE` for a document, not merely for a task or agent. This is
required because the top-level page exposes one mutually exclusive assignment capability
catalog. Claim serializes on the document, reconciles any expired active lease, and then
selects eligible work deterministically by creation time and run ID. `RelayClaimOutcome`
is exactly:

- `CLAIMED`, returning run, attempt, managed directory entry, separate
  `RelayCapabilityGrant`, and opaque relay grant token;
- `NO_WORK`, returning the fixed 15-second retry interval; or
- `BUSY`, returning a bounded retry interval and the active run ID.

Any authenticated human member of the document may claim work; claiming does not make
that human the revision author. The managed profile remains the agent author, while the
task creator remains the grantor. The claim transaction binds document, run, attempt,
task, profile, claimant member, credential session instance, page session, lease,
registration generation, deadline, and stable grant nonce/timestamps. The grant is
`rfrelay_v1.<base64url canonical payload>.<base64url HMAC-SHA-256>`, signed with the
server-only `RATIFLOW_RELAY_SIGNING_SECRET` using domain separator
`ratiflow-relay-grant-v1`. The canonical payload uses fixed keys and binds audience,
document/profile/task/run/attempt, claimant member, credential-session digest,
page-session digest, lease ID, registration generation, nonce, issued-at, and expiry.
Claim stores those claims plus only the final token digest; it never stores plaintext.
An exact idempotent retry reconstructs the byte-identical token from the persisted claims.
The signing secret must contain at least 32 random bytes; missing/short configuration
makes managed Relay unavailable without disabling ordinary document use. The plaintext
grant exists only in browser memory, is used only as a same-origin relay bearer, and is
never sent to Luna, stored in browser persistence, returned in state reads, or written to
traces.

The lease lasts 45 seconds and renews every 15 seconds. Renewal is a compare-and-swap on
the exact grant, attempt, page, registration generation, and expected lease ID. A lost,
expired, superseded, cross-document, or cross-page lease fails with
`RELAY_LEASE_LOST`. Release is best-effort and UUID-conditional; server-clock expiry is
the authoritative cleanup.

An attempt has a 90-second absolute deadline. If a lease expires before provider
dispatch, the attempt becomes `EXPIRED` and its run may safely return to `QUEUED`. Once
provider dispatch may have occurred, timeout or transport ambiguity enters
`RECONCILING`; the server re-reads the task, run, permit, receipt, and provider markers.
It never reports a clean cancellation or starts another paid attempt until reconciliation
proves the outcome. A retryable failed attempt moves the run to `WAITING_RETRY`; the
visible Retry action invokes claim to create a new numbered attempt. The automatic
heartbeat claims queued work only and never silently retries `WAITING_RETRY`. The second
failed attempt moves the run to `EXHAUSTED` with `ATTEMPTS_EXHAUSTED`.

Existing task transitions dominate relay state. Cancelling an Open managed task must
atomically cancel any queued or active run, cancel/revoke its nonterminal attempt and
unused permits, release its lease, and append `RUN_CANCELLED` with terminal reason
`TASK_CANCELLED`. Any document edit or Restore that makes the exact task anchor `STALE`
per the existing rebase rules performs the same lineage cancellation with terminal
reason `TASK_STALE`. No provider call or tool mutation may proceed after either
transition. Conversely, an authoritative successful `submit_scoped_revision` completes
the task/thread/revision first and atomically makes the run `COMPLETED`, its attempt
`SUCCEEDED`, and its terminal reason `TASK_COMPLETED`. Reconciliation repairs a lost
HTTP response from that authoritative state without duplicating a revision or spend.

## v4.3.4 Dynamic WebMCP catalogs and trace proof

Idle/BYOA mode retains exactly the shipped ordered eight-tool catalog:

1. `connect_agent`
2. `inspect_document`
3. `read_document_history`
4. `read_collaboration_context`
5. `list_my_tasks`
6. `wait_for_my_tasks`
7. `comment_on_task`
8. `submit_task_result`

Claiming managed work waits for any in-flight idle invocation to settle, aborts the idle
registrations, and records `IDLE_CATALOG_WITHDRAWN`. The top-level page then registers
one attempt- and generation-scoped physical catalog reconstructed from `run.accessProfile`
and records `RELAY_CATALOG_REGISTERED`. Every access profile contains the exact ordered common tools:

1. `read_assignment`
2. `read_document_context`
3. `read_collaboration_context`
4. `comment_on_assignment`
5. `submit_scoped_revision`

The only access-profile additions are:

- Metrics: `query_demo_metrics`;
- Repository: `search_demo_code`, `read_demo_file`; and
- Editorial: `read_company_style_guide`, `check_document_consistency`.

Bot expertise is not an input. Equal access profiles produce equal logical catalogs for
different bots; changing only access changes the same bot's catalog.

Physical WebMCP names are unique to run, attempt, and registration generation; the UI
shows the stable logical names above. An old `RegisteredTool` descriptor cannot execute
under a successor generation. Completion, exhaustion, cancellation, or release aborts
the relay catalog, records `RELAY_CATALOG_WITHDRAWN`, restores the exact idle catalog,
and records `IDLE_CATALOG_RESTORED`.

Ratiflow listens for `toolchange`, calls `document.modelContext.getTools()` from the
top-level page, and calls `document.modelContext.executeTool()` on the exact returned
descriptor. Tool callbacks may not be called directly as a shortcut. The first
model-visible operation must read the assignment through WebMCP. Removing WebMCP must
prevent provider actuation and commit.

`RelayNormalizedToolManifestEntry` contains only same-origin `origin`, physical and
logical names, registration generation, description, normalized JSON Schema, and
`readOnlyHint`/`untrustedContentHint`. It excludes the non-serializable window reference.
The ordered normalized entries and `sha256:` digest form
`RelayNormalizedToolManifest`. The server rejects an unknown origin, logical tool,
physical name, out-of-grant addition, generation, annotation, schema, order, or digest with
`RELAY_MANIFEST_MISMATCH`. Tool descriptions, page content, fixture content, and tool
results remain untrusted input.

The immutable, document-monotonic relay trace uses exactly these event kinds:

`RUN_QUEUED`, `RUN_CLAIMED`, `LEASE_RENEWED`, `IDLE_CATALOG_WITHDRAWN`,
`RELAY_CATALOG_REGISTERED`, `WEBMCP_TOOLCHANGE_OBSERVED`,
`MODEL_TOOL_SEARCH_REQUESTED`, `WEBMCP_GET_TOOLS_COMPLETED`, `MODEL_TOOL_SELECTED`,
`WEBMCP_EXECUTE_STARTED`, `WEBMCP_EXECUTE_COMPLETED`, `REVISION_COMMITTED`,
`RELAY_CATALOG_WITHDRAWN`, `IDLE_CATALOG_RESTORED`, `ATTEMPT_RECONCILING`,
`ATTEMPT_FAILED`, `RUN_WAITING_RETRY`, `RUN_COMPLETED`, `RUN_EXHAUSTED`, and
`RUN_CANCELLED`.

`MODEL_TOOL_SELECTED` remains the frozen wire event name. It records that the provider
returned, and the server validated, the exact function the server pinned for that step;
it does not assert that Luna autonomously selected a tool from the discovered catalog.

Each `RelayTraceEvent` contains event/version/document/run IDs, nullable attempt ID,
exact kind, nullable logical/physical tool names and manifest/argument/result digests, a
bounded scalar-only detail object, and timestamp. It never stores chain-of-thought, raw
credentials, unrestricted transcripts, full tool arguments, or private document content.
Browser-reported WebMCP events are accepted only under the live grant and checked
against the server state; provider and mutation events are emitted by the server.

## v4.3.5 Luna stepper, permits, receipts, and executable ports

`open_ai_api` is read only in server code, with `OPENAI_API_KEY` accepted as a
conventional fallback. The browser cannot supply a model,
developer prompt, provider response ID, arbitrary tool definition, credential, actor, or
origin. Every call uses `gpt-5.6-luna`, the fixed repeated developer instruction, and
client-executed tool search. A provider response ID may be retained privately for
continuation and sanitized evidence; it is not authority.

After the browser returns the validated manifest, every nonterminal continuation exposes
only the exact next active physical function and names it in
`tool_choice: { type: "function", name }`. Luna composes that function's strict
arguments and must return the pinned call; any other name is rejected. After
`submit_scoped_revision`, the terminal continuation sends `tools: []` with
`tool_choice: "none"`.

`RelayStepInput` is exactly one of:

- `START` with attempt ID and expected step;
- `SUBMIT_SEARCH_RESULT` with attempt ID, expected step, tool-search call ID, and the
  normalized manifest obtained through WebMCP; or
- `SUBMIT_FUNCTION_RESULT` with attempt ID, expected step, function-call ID, and a
  server-issued result-receipt ID.

`RelayStepOutcome` is exactly `DISCOVER_TOOLS`, `EXECUTE_TOOL`, `COMPLETED`, or
`RETRY_REQUIRED`, with the fields frozen in `src/agent-relay/contracts.ts`.
`DISCOVER_TOOLS` causes the browser to call `getTools()`. `EXECUTE_TOOL` carries the
physical name, parsed bounded arguments, and one `RelayExecutionPermit`. A provider
text completion is insufficient to complete a run unless the authoritative scoped
revision has already completed; otherwise the bounded stepper returns Retry Required or
fails the attempt.

Every execution permit is an opaque one-shot token bound outside model JSON to attempt,
function-call ID, exact physical tool name, argument digest, registration generation,
lease, and expiry. The browser arms it only for the matching `executeTool()` call. A
native or synthetic call without an armed permit fails with
`RELAY_EXECUTION_NOT_ARMED`; a mismatched name, arguments, generation, lease, or call
fails without invoking the tool. Plaintext permits remain in memory and are never sent
to Luna or exposed in state/trace.

Permits use the equivalent deterministic signed format
`rfpermit_v1.<base64url canonical payload>.<base64url HMAC-SHA-256>`, audience
`ratiflow-webmcp-relay-tool`, and domain separator `ratiflow-relay-permit-v1`. Persisted
`RelayExecutionPermitClaims` plus the token digest allow an exact idempotent step replay
to reconstruct the same plaintext permit without storing it; the nonce, issue time, and
expiry never change on replay.

Permit state is exactly `ISSUED | EXECUTING | COMPLETED | FAILED | REVOKED`. Beginning
execution atomically changes the matching permit to Executing and supplies a
server-minted downstream request UUID. Repository mutations use that UUID with the
existing idempotency ledger. Finishing execution validates and stores the bounded,
JSON-safe output and returns `{ resultReceiptId, output }`. An exact retry returns the
stored outcome; changed input fails. The browser cannot submit tool output to Luna as
authority. `SUBMIT_FUNCTION_RESULT` supplies only the receipt ID, and
`loadVerifiedToolResult` loads its bound function-call ID and output server-side. A
decode, schema, size, receipt, or output mismatch fails with `RELAY_RESULT_INVALID`.

The repository execution boundary is `ManagedAgentToolClientPort`:

- `readAssignment` returns the exact task/thread and managed directory entry;
- `readDocumentContext` returns current document, live anchor, and recent revisions;
- `readCollaborationContext` returns bounded tasks and comments;
- `commentOnAssignment` appends an agent progress comment; and
- `submitScopedRevision` applies the existing exact-range Direct result path.

Every method receives a server-derived `RelayToolInvocationContext` containing
document/run/attempt/task/profile/generation, physical/logical names, and the server
request UUID. No model field can override that context.

`SpecialistFixturePort` is pure and deterministic. Its exact operations are
`queryDemoMetrics`, `searchDemoCode`, `readDemoFile`, `readCompanyStyleGuide`, and
`checkDocumentConsistency`. Metrics accept only datasets
`northstar_launch_capacity | inc_482_checkout_impact`. Fixtures perform no network
access, and every returned fact carries an unmistakable synthetic source label.

`RelayAttemptAuthorizationPort.beginStep` atomically locks the attempt and either reserves
the exact expected cursor before provider dispatch, reports that the same request is still
in progress, or replays its terminal full Relay result. Only the caller that receives the
authorized context may spend. `recordStepResult` changes that reservation to terminal and
stores either success or failure; an abandoned reservation stays non-dispatchable until
attempt reconciliation/expiry. The port also loads verified result receipts. Exact replay
reconstructs the original public outcome—including any signed permit—from persisted
claims; a changed digest under the same request UUID fails.
`LunaResponsesProviderPort` accepts only `START`, `TOOL_SEARCH_OUTPUT`, or
`FUNCTION_CALL_OUTPUT` and returns only `SEARCH_REQUIRED`, `CALL_REQUIRED`, or
`COMPLETED`. These ports keep database authority, WebMCP execution, fixtures, and the
OpenAI transport independently testable.

## v4.3.6 HTTP and RPC sidecar

The exact additive HTTP routes are:

- `GET /api/repository-v4/relay/state`
- `POST /api/repository-v4/relay/claim`
- `POST /api/repository-v4/relay/lease/renew`
- `POST /api/repository-v4/relay/lease/release`
- `POST /api/repository-v4/relay/tool`
- `POST /api/repository-v4/relay/step`

State uses the current human session and returns `RelayWorkspaceState`: ordered
directory, runs, at most one sanitized `RelayAttemptStateView`, at most 100 newest trace
events, current
relay event version, literal `webMcpRequired: true`, and literal
`recoveryHeartbeatMs: 15000`. It returns no grant, permit, session handle, provider
credential, raw provider transcript, or unrestricted tool payload.

Claim uses the human bearer, `X-Ratiflow-Page-Session`, and a private
`Idempotency-Key`. Renew, release, step, and tool use the in-memory relay grant as their
same-origin bearer. Renew also supplies the expected lease ID. Tool additionally supplies
the one-shot execution permit, exact physical name, and JSON arguments. Step never
accepts raw tool output. All request bodies use exact-key validation, reject public
request IDs and unknown keys, honor AbortSignal, and return JSON-serializable results.

The exact additive public RPC catalog is:

- `ratiflow_create_issue_directory_mention_v4`
- `ratiflow_read_issue_relay_state_v4`
- `ratiflow_claim_issue_relay_v4`
- `ratiflow_renew_issue_relay_lease_v4`
- `ratiflow_release_issue_relay_v4`
- `ratiflow_record_issue_relay_trace_v4`
- `ratiflow_begin_issue_relay_tool_v4`
- `ratiflow_finish_issue_relay_tool_v4`
- `ratiflow_transition_issue_relay_attempt_v4`

Private SQL helpers may split authorization, step recording, result loading, and JSON
projection, but no second public overload or broad table endpoint is permitted. The
mention RPC serves only the new canonical-target branch; the existing
`ratiflow_create_issue_mention_v4` remains the unchanged v4.1 branch. The step route owns
the OpenAI call and uses the attempt transition RPC before and after dispatch. The tool
route alone consumes execution permits and invokes repository or deterministic fixture
ports. No RPC accepts model-supplied identity or authority.

## v4.3.7 Additive persistence and security

The applied v4.2 migration remains immutable. One new forward-only v4.3 migration adds
immutable `access_profile` to Relay runs and backfills historical rows from the previous
framing's legacy `specialty` column.
Catalog, manifest, source, category, and permit authorization then join through the run.
Existing v1 signed grant and permit payloads remain byte-exact.
The retained sidecar relations are:

- `public.ratiflow_issue_mentions_v4` — immutable comment/thread/task association,
  canonical target IDs, and target snapshot;
- `public.ratiflow_issue_relay_runs_v4` — unique managed task lineage, profile,
  agent expertise, immutable access profile, fixed runtime/model, status, attempt budget,
  terminal reason, and times;
- `public.ratiflow_issue_relay_attempts_v4` — numbered attempt, claimant/page,
  generation, embedded lease, fixed grant claims including nonce/issued-at/expiry, grant
  digest, counters, step, provider-dispatch marker, deadline, errors, and times;
- `public.ratiflow_issue_relay_trace_v4` — immutable document-monotonic sanitized relay
  events; and
- `ratiflow_document_private.issue_relay_execution_permits_v4` — function-call binding,
  fixed permit claims including nonce/issued-at/expiry, token digest,
  argument/generation/lease binding, server request UUID, state, verified output, digest,
  and result-receipt ID; and
- `ratiflow_document_private.issue_relay_steps_v4` — one row per bounded step with
  attempt/step/request ID, input digest, `RESERVED | TERMINAL` state, private provider
  response ID, the full successful or failed Relay result, approved manifest digest
  where applicable, linked permit ID, and timestamps. Its unique cursor reservation is
  acquired atomically before provider dispatch; exact in-flight retries observe
  `IN_PROGRESS`, exact terminal retries replay, and competing requests cannot spend.
  It never stores a plaintext grant/permit, reasoning item, or unrestricted transcript.

No separate relay-lease table is needed: the live lease is part of the one active
attempt, and claim/renew/release lock that row with server-clock comparisons. Database
constraints enforce one run per managed task, one numbered attempt per run, one active
run per document, one permit per attempt/function call, one receipt per completed permit,
coherent nullable/terminal timestamps, and document/profile/task/run/attempt foreign-key
lineage. The managed profile columns are all null for a self-declared profile and all
present for a directory profile. Directory handles are unique case-insensitively within
the document. A managed profile cannot be renamed or connected through
`connect_agent`.

All new public-schema relations enable and force RLS, revoke direct privileges from
`public`, `anon`, and `authenticated`, and are reachable only through the exact
security-definer RPCs with pinned search paths. The private permit relation and all
plaintext-secret generation remain inaccessible through the Data API. The database
stores SHA-256 digests of share tokens, sessions, relay grants, and permits, never their
plaintext. Reads are document-scoped; all mutations re-resolve expiry, task state,
profile, claimant, session instance, page, lease, generation, and request identity.

Trace and run persistence never weakens the existing revision contract. An agent edit is
still one `WEBMCP` Direct revision with assigned managed profile, task creator as grantor,
exact before/after diff, rationale, evidence, and Restore. Model/provider metadata lives
in the relay lineage, not in model-controlled revision fields. Synthetic labels identify
the demo metrics, code, and style fixtures in both tool results and visible evidence.
The final access-specific result carries the complete deterministic evidence set for its
required path, and a scoped revision must cite that exact set: one selected Metrics
dataset; both `checkout.log` and `commit:7d3c9e1` for Repository; or both `Ratiflow company
style guide` and `Ratiflow consistency rules` for Editorial. Missing, duplicate, extra, or forged refs
fail before the mutation permit is issued.

## v4.3.8 Exact errors and bounds

Relay operations retain every existing `RepositoryFailure` code and add exactly:

- `STALE_MENTION_TARGET` — the canonical human or agent directory selection changed;
- `RELAY_UNAVAILABLE` — the server/model or required WebMCP runtime is unavailable;
- `RELAY_LEASE_LOST` — the attempt no longer owns the exact live lease;
- `RELAY_STATE_CONFLICT` — the expected step or legal transition no longer matches;
- `RELAY_EXECUTION_NOT_ARMED` — no matching one-shot permit is armed;
- `RELAY_MANIFEST_MISMATCH` — discovered tools differ from the approved generation;
- `RELAY_RESULT_INVALID` — a tool envelope, receipt, schema, or bounded output is invalid; and
- `RELAY_PROVIDER_OUTCOME_UNKNOWN` — a Responses call crossed the dispatch boundary but
  its authenticated result was lost, so the attempt remains `RECONCILING` and no new
  provider attempt is claimable until authoritative reconciliation or expiry.

Invalid or expired grants and permits return the existing generic `UNAUTHORIZED` without
revealing whether a secret once existed. Capacity/cost abuse uses `RATE_LIMITED`.
An unavailable result exposes its checked retryability and never becomes a fabricated
success. `RELAY_PROVIDER_OUTCOME_UNKNOWN` is deliberately non-retryable at the public
boundary: human Retry and the recovery heartbeat cannot purchase another provider call
while its durable step is unresolved.

`RELAY_BOUNDS` is exact:

| Bound | Value |
|---|---:|
| Recovery heartbeat | 15,000 ms |
| Lease TTL | 45,000 ms |
| Lease renewal interval | 15,000 ms |
| Relay grant TTL | 120,000 ms |
| Execution-permit TTL | 30,000 ms |
| Attempt deadline | 90,000 ms |
| Attempts per run | 2 |
| Responses calls per attempt | 6 |
| Tool calls per attempt | 8 |
| Managed selection | 8,000 code points |
| Function arguments | 8,192 bytes |
| Verified tool result | 32,768 bytes |
| Trace detail payload | 4,096 bytes |
| Trace events per attempt | 64 |
| Trace events per state read | 100 |
| Model output per Responses call | 1,600 tokens |

Provider calls and tools execute sequentially. Every limit is checked before the paid or
mutating operation, and an over-limit transition is recorded without leaking content.

## v4.1 compatibility detail

Version 4.1 · Comment-first collaboration refreeze · 2026-09-02

The following contract remains authoritative for legacy surfaces and clients. Version
4.2 changes none of these semantics. Historical `COMMENT`/`REVIEW` records remain
readable; existing Review decision routes remain decision-capable for compatibility but
are absent from the flagship. New legacy-path work remains an anchored @ mention with
server-derived `DIRECT` authority and never enters a proposal/approval state.

## v4.1.1 Boundary, routes, and retention

Protocol v4 owns `/`, `/issue/[shareToken]`, and `/api/repository-v4/**`. Protocol v3
remains isolated at `/document/[shareToken]` and `/api/document-v3/**`; its tools and
data never register or appear on a v4 page.

The root page first requires a nonblank human display name, then renders **Incident
postmortem**, **Product document**, **Explore postmortem**, and **Explore product
document**. Launch inserts an immutable r1 template
revision before returning a session. A shared v4 issue remains live for 30 days. Its
human and delegated-agent session credentials have the same upper-bound expiry and are
invalid once the issue expires.

Human display names are 1–80 trimmed code points. A document admits at most 100 members
over its lifetime, making the complete member/profile roster bounded; an over-cap join
fails atomically with `RATE_LIMITED`.

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

## v4.1.2 Checked entities

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
For new Direct work, submitted/comment/revision agent actors must match both the task's
assignee member and stable `agentProfileId`; their captured name may differ only because
that same profile was renamed after assignment. Compatibility tasks with a null profile
ID retain the prior member-only rule.
For every new agent action, `actor.displayName === actor.agentLabel ===` the current
profile name at the locked action boundary.

### Actors and members

`IssueMemberSnapshot` contains a stable workspace UUID and display name. A new agent actor
contains the server-derived member principal, stable agent-profile UUID, and current
self-declared profile name captured at that action. Compatibility actors may have a null
profile UUID. The task separately keeps the name that the human originally selected;
when a profile has since been renamed, the UI can truthfully show “assigned to ChatGPT,
completed by Databot” under the same owner/profile instead of falsifying attribution.
The label is descriptive, not authority or verified model identity. System actors have
no member.

No model input accepts actor, member, origin, agent label, document, page session,
grantor, approver, or task mode.

`IssueAgentProfile` contains a stable UUID, the owning immutable member snapshot, a
1–80 code-point self-declared `name`, identity source `SELF_DECLARED`, `firstSeenAt`,
`lastAccessedAt`, and a nonnegative safe-integer `accessCount`. Ordinary profiles start at
1 on their first committed connect; only the protected deterministic reset may seed a
profile at 0 before any real page access. Names are trimmed, contain
neither `@` nor CR/LF, and may duplicate another member's name. There is exactly zero or
one current profile per document member; autocomplete therefore displays both name and
owner. Historical tasks keep their immutable assigned profile-ID/name snapshot when the
current profile is renamed. Already-authored comments and revisions keep the profile
name captured when each action occurred.

The WebMCP execute callback receives only its JSON input and execution options containing
`AbortSignal`; no caller/model identity is available. `connect_agent({ name })` is the
only name source. The agent bearer resolves document/member/owner and the bridge supplies
the page session outside model JSON. Connecting upserts the profile; same-name reconnect
preserves the stable ID and first-seen time, while a different valid name is a last-write-
wins rename. The bridge requires a successful connect in every top-level page registration
lifetime and clears that in-memory connection on navigation/session teardown. A successful
connect also records a server-side page connection keyed by document, member, credential
session-instance UUID, and page-session UUID, capturing the stable profile ID and a private
identity generation. Profiles start at generation 1; a same-name connect preserves it and
every committed rename increments it once. Every non-connect request must match that
connection, current profile ID, and current generation; merely having a profile from an
older page does not satisfy the check. This prevents an `X → Y → X` rename from silently
reauthorizing the original X page. The generation is server authority, not model input or
user-facing verification.

Agent access metadata never changes document revision/activity. `accessCount` counts
successful first-commit connects and agent-authored mutations, not read calls. For
request-ledger mutations (`connect_agent`, agent comment, and result), only the first
committed logical request touches the profile; an identical replay returns the recorded
result without a second touch. Inspect, history, context, task-list, wait, internal wait
polls, and post-mutation refreshes are no-touch reads, preserving their read-only and
idempotent contract. A required connect therefore records every top-level page access even
when the agent only reads. Page UUID scopes live wait/freshness behavior, not member
authority. An old open task remains executable after profile rename because authorization
is the authenticated owner/member plus stable profile ID and stored assignee, never the
mutable name. Its task card keeps the assigned name, while any new comment/result captures
the connected profile's current self-declared name.

### Anchors

An anchor is `DOCUMENT` or `SELECTION`. Selection anchors store field, zero-based
end-exclusive code-point offsets, exact selected text, creation revision, current anchor
revision, and `ACTIVE | STALE` state. Document anchors contain no field, offsets, or
selected text and are always active.

Every task and thread exposes two anchor records. `creationAnchor` is an immutable copy
of the exact target at creation and is never rebased or replaced. `anchor` is the live
target and is the only record updated by deterministic rebases, staleness, restore, or a
task's own committed replacement. Direct results and Review proposals also snapshot the
pre-apply live Selection anchor used for that submission, so provenance never has to be
reconstructed from a later mutable anchor.

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

Historical mode remains exact:

- `COMMENT`: Document or Selection target; result contains no replacement.
- `REVIEW`: Selection target; result stores one proposal and does not mutate content.
- `DIRECT`: Selection target; result atomically applies one replacement.

New flagship creation does not accept mode, category, title, or agent label. Exact
`CreateMentionTaskHttpInput` is `{ expectedRevision, comment, mentionedAgentName,
assignedToMemberId, anchor }`. Mention work is created only after the human explicitly
chooses an autocomplete profile; an unselected literal `@` stays a plain comment.
The exact visible `comment` must fit the 2,000-code-point comment bound and begin with
exact `@${mentionedAgentName}` followed by one or more ASCII
space, tab, CR, or LF code points and a nonblank instruction. The compiler removes that
exact prefix/separator and trims only those four ASCII whitespace characters at both
instruction ends; interior instruction text is preserved exactly and must independently
fit the 1,000-code-point instruction bound. A selected mention whose full comment or
compiled instruction exceeds either bound fails atomically rather than becoming a plain
comment. The name must exactly match the current profile owned by
`assignedToMemberId`; duplicate names are disambiguated by that owner ID. Later @ text is
ordinary prompt text. Unknown/renamed profiles fail `STALE_AGENT_PROFILE`. The server
derives `GENERAL`, immutable agent label/profile, and `DIRECT`. It derives the title by
replacing every run of those four ASCII whitespace characters in the instruction with
one U+0020 space and taking the first 120 Unicode code points without an ellipsis. The
task key is `TASK-${n}`, where `n` is the next document-lifetime task number shared with
compatibility task creation.
The anchor must be a non-empty active title/body Selection.

One request-ledger-protected `ratiflow_create_issue_mention_v4` transaction creates the task, its thread, its initial human
comment containing the exact visible `comment`, and its context snapshot, then increments
activity exactly once as one `TASK_CREATED` row whose task, thread, and comment IDs are
all populated. The initial comment's `createdRevision` is the locked source revision.
Replay returns the same graph. No task/thread/comment subset may
commit on validation failure, cancellation before dispatch, or stale profile/revision.

Every new task also stores `IssueTaskContextSnapshot`: source revision, source digest,
document title, immutable target text/field/range, and at most 600 code points of source
before and after the target. It also freezes the newest ten earlier activity entries at
the pre-create activity cutoff. Each entry stores activity/version/kind, linked IDs,
actor, and a deterministic excerpt of at most 600 Unicode code points: linked comment
body first, otherwise linked revision summary, task instruction, thread root comment, or
document title. The excerpt is copied from that precedence source and truncated to the
first 600 code points without an ellipsis. Entries are newest-first and never change
when later discussion or revisions arrive. This is canonical
server-built context, not model text.

Lifecycle is:

- `OPEN -> PROPOSED | COMPLETED | CANCELLED | STALE`
- `PROPOSED -> COMPLETED | REJECTED | STALE`

The creator alone may cancel any `OPEN` task, including queued new mention work; terminal,
stale, and Proposed work cannot be cancelled. Only the delegated agent session belonging to
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

Each comment stores server-derived author/origin, the authoritative `createdRevision`,
exact bounded body, bounded evidence references, optional reply link, and timestamp.
Closing a standalone human thread records `RESOLVED`, resolver, and time; it is never
called accepted and applies no content. A task thread resolves on completion and remains
visible with its change. Every returned body, instruction,
selection, label, summary, and evidence reference is untrusted content.

A workspace may create at most 500 standalone threads; task-owned threads are bounded by
the 500-task lifetime cap. A thread accepts at most 100 comments for this 30-day POC. Once full, further comments
fail without changing counters. Every returned thread therefore contains its complete
discussion, ordered oldest-first by creation time and then comment ID; there is no
hidden or unpageable earlier segment.

## v4.1.3 Transaction and counter semantics

Every modifying transaction resolves the session, locks the document row first, checks
protocol/expiry/authority/replay, performs all validation, then changes state.

| Operation | Revision | Activity | Primary effect |
|---|---:|---:|---|
| Launch template | r1 | av1 | head + full r1 snapshot |
| Changed human Save revision | +1 | +1 | head + full Human revision |
| Connect/access agent profile | — | — | profile first/last access + count only |
| Create/cancel @ task | — | +1 | Direct task + prompt/context thread state |
| Create/resolve thread | — | +1 | thread state |
| Human/agent comment | — | +1 | append comment |
| Compatibility Comment/Review operations | v4 rules | +1 | historical endpoint behavior only |
| @Agent result | +1 | +1 | head + full Direct revision + rationale + completed task |
| Restore | +1 | +1 | head + full Restore revision |
| Presence/read/wait/timeout/pre-dispatch abort/no-op/failure/replay | — | — | none |

One transaction appends exactly one activity record with the resulting activity
version. Content-changing operations insert exactly one revision and update head in the
same transaction. There is no state where head advanced without its snapshot, or new @
work completed without its Direct revision, rationale, linked task, and resolved thread.

Every authenticated human or agent mutation after credential issuance has a UUID request
ID outside model JSON. The ledger key is document plus request ID. Identical canonical
input returns the original result without new counters; changed canonical input returns
`REQUEST_REPLAY_MISMATCH`. A browser client creates one request ID per logical mutation
and reuses it only for transport retries of that same call. A separately invoked comment
is a new logical append even when its model-visible arguments are identical.
For a `v4.1` agent mutation, the server-built canonical fingerprint additionally includes
the literal response-contract selector, resolved credential session-instance UUID,
page-session UUID, and actor kind outside model JSON. A request ID therefore cannot replay
a successful connect/comment/result onto another page or credential. The compatibility
`v4` branch deliberately computes the byte-for-byte applied legacy fingerprint, with no
new selector/scope material, so request IDs committed before migration still replay. A
v4.1 attempt reusing such an ID mismatches rather than inheriting legacy authority.
Profile/page-authority failures are checked before recording and are never inserted into
the ledger; a same-page ambiguous retry may still retrieve its already committed result
without touching the profile again.

For mutations that name a task, the server validates only enough UUID shape to locate
the target, proves creator/assignee authority, and only then consults the document replay
ledger or validates the remaining payload. An unauthorized or missing target always
returns nondisclosing `UNAUTHORIZED`, cannot reveal a cached result/mismatch, and is
never recorded; therefore an attacker cannot reserve a request ID ahead of its owner.
Authorized terminal successes and failures remain replayable.

Cancellation is definitive only before dispatch or before the server transaction begins.
After a remote write is dispatched, the client may observe `AbortError` even though the
server commits. It must re-inspect authoritative state; retrying the same logical call
reuses its request ID and therefore cannot double-commit. No UI or tool result claims
that cancellation rolled back a dispatched request.

## v4.1.4 Result submission and concurrency

`submit_task_result` accepts only task ID, `basedOnRevision`, nonblank `resultSummary`
(the concise rationale), required changed replacement, and optional evidence references
for new @ work. The server reads stored authority; model input cannot choose it. A new
Direct revision copies `resultSummary` byte-for-byte into its `changeSummary`; there is no
second model-supplied summary or hidden prose generator. The same value therefore explains
the task completion and labels its history revision.

For `COMMENT`, replacement must be absent. The result is appended to the task thread as
an agent finding, task becomes Completed, and outcome is `COMMENTED`.

For `REVIEW`, replacement is required and must differ from the live target. A proposal
captures replacement, summary, evidence, source revision, agent, and time. Head/revision
do not change and outcome is `PROPOSED`.

For new `DIRECT` mention work, replacement is required and must differ from the live target. In one
transaction the replacement is applied to the current stored anchor, other anchors are
rebased/staled, full revision is inserted, task/thread complete, and outcome is
`COMMITTED`. Compatibility `COMMENT`/`REVIEW` records retain their prior mode branches
but cannot be created from the flagship.

`basedOnRevision` may equal the task's creation revision or any observed revision at or
after it. A value greater than current head is invalid. A value below current head is
accepted only if the stored task remains Open/Proposed as appropriate, its active anchor
has deterministically rebased through every intervening content revision, and the live
selected text still equals the stored target. The new revision records the supplied
source and actual current parent.

Review acceptance repeats the same live-anchor check. A non-overlapping later edit may
rebase a proposal. Any overlap stales it before acceptance. First terminal decision wins.

## v4.1.5 Human operations

The primary human service supports named launch/example/join, inspect, Save revision,
create @ mention, create standalone thread, add/reply comment, close thread, cancel open
mention, read history/exact revision, restore revision, and presence. Collaboration
context is an agent-only continuity surface. Compatibility
accept/reject endpoints remain valid for existing Review records but are not linked from
the flagship and cannot decide new mention work.

Save revision requires current head and full bounded title/body; its public input contains
no summary. After locking and comparing the current head, the service derives exactly
`Edited the document title.` when only title changed, `Edited the document.` when only
body changed, and `Edited the document title and body.` when both changed. The flagship
exposes no summary form. An
unchanged save is a no-op with no counter. A stale save returns current counters and
head; the UI preserves the local draft and offers Use latest or retry after manual merge.

Restore requires current head and an existing target revision in the same document. It
copies the stored snapshot into a new next revision with authority Restore. Restoring
the current byte-identical content is an invalid no-op.

## v4.1.6 History, surfaces, and pagination

The human surface returns current document, presence, durable member list, current agent
profiles, all tasks and
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

`read_collaboration_context` uses `{ beforeActivityVersion?, limit? }`, with the same
1–50/default-20 bounds, to select immutable activity rows strictly below the optional
cursor and return them newest-first. Every event includes its actor and document revision
and joins the referenced revision, task, complete current thread, and exact comment when
present. This activity cursor includes comment-only and thread-close decisions that a
revision cursor would skip. `nextBeforeActivityVersion` is the oldest returned activity
version when more exist. Current profiles are returned alongside the window. The stored
task context remains immutable; joined task/thread state is explicitly live as of the
read. Returned context is document-wide for any connected agent because every link-holder
human already sees it.

Surface reconciliation is monotonic: higher document revision wins content; at equal
revision, higher activity wins tasks/threads/history; presence merges independently by
newest heartbeat. Profiles merge independently by member, preferring higher
`accessCount`, then later `lastAccessedAt`, so access/rename updates are not lost when
document counters are unchanged. Missing `agents` in an old cached v4 bundle normalizes
to `[]` before the first authoritative fetch. A delayed equal-revision response cannot
hide a comment, newer profile, or terminal task.

## v4.1.7 Exact WebMCP catalog

All eight tools register from page start in this order:

1. `connect_agent({ name })`
2. `inspect_document({ revision? })`
3. `read_document_history({ beforeRevision?, limit? })`
4. `read_collaboration_context({ beforeActivityVersion?, limit? })`
5. `list_my_tasks({ includeResolved? })`
6. `wait_for_my_tasks({ afterActivityVersion, afterRevision, timeoutSeconds? })`
7. `comment_on_task({ taskId, body, replyToCommentId?, evidenceRefs? })`
8. `submit_task_result({ taskId, basedOnRevision, resultSummary,
   replacementText?, evidenceRefs? })`

Schemas reject additional properties. Bounds come only from
`src/repository/contracts.ts`. The exported `REPOSITORY_WEBMCP_TOOL_CATALOG` freezes each
exact description, closed JSON Schema, annotation set, and order; registration consumes
that value rather than recreating it. Read tools are read-only/idempotent/untrusted. Comment and
result tools are mutating, closed-world, untrusted, and declare `idempotentHint: false`:
a new invocation is a new logical operation. One callback execution still uses a stable
bridge-generated request ID across ambiguous transport retries. A Direct result is
reversible through revision Restore; tool annotations and copy must not call it read-only.

`connect_agent` upserts and returns the self-declared profile whose owner is derived from
the agent bearer, records the current page connection, and touches the profile once on its
first committed request. The bridge blocks all other callbacks until connect succeeds in
the current registration lifetime; the server independently requires the matching page
connection. Read tools do not mutate profile metadata. `inspect_document` returns current
document for omitted revision, or the exact stored
historical snapshot for a supplied revision, plus collaborators and bounded task
summary. `read_document_history` returns immutable revision provenance/diffs.
`read_collaboration_context` returns the joined bounded continuity projection defined in
section 6, including other agents' completed reasoning and closed human discussions.

`list_my_tasks` returns only tasks assigned to the current member's agent. Each task is
paired with its dedicated thread and complete, oldest-first discussion (at most 100
comments). Default omits terminal tasks; `includeResolved: true` includes them so a
fresh delegated agent can recover prior reasoning.

`wait_for_my_tasks` uses explicit cursors and one absolute deadline, default/max 20
seconds. It fetches, subscribes, refetches, and returns owned Open work immediately.
Otherwise a higher document revision returns `DOCUMENT_CHANGED`; unrelated activity
advances the internal activity cursor without producing a false task wake; deadline
returns `TIMEOUT`. Future cursors fail before installing a listener. One page/member wait
may be active; a second returns `WAIT_ALREADY_ACTIVE`. After cursor validation and before
subscription, the adapter generates an opaque lease UUID and acquires a database-backed
lease for the exact document/member, credential-session, and page-session tuple. Begin is
one atomic compare-and-swap: insert an absent row or replace it only when its server-clock
expiry is already past; zero affected rows returns `WAIT_ALREADY_ACTIVE`. Expiry is five
seconds after the requested deadline. `finally` performs an idempotent conditional delete
on the full authority tuple and the same lease UUID, so an expired wait can never delete
its successor's lease. Process-local deduplication is only an optimization. This remains
ephemeral coordination state, not a
document/profile/activity mutation. The wait exists only during the open page/tool turn
and never claims to wake a dormant model.

`comment_on_task` checks paired ownership and appends an agent comment/reply.
`submit_task_result` returns `COMMITTED` for new @ work. Compatibility tasks may retain
old outcomes; the model never chooses or escalates authority.

Callbacks capture document, protocol, browser session, page session, member, and agent
token when registered. They read mutable current state through a live ref, honor tool
`AbortSignal`, throw/observe `AbortError` as supported, refetch after mutations, and fail
`STALE_PAGE_CONTEXT` if navigation/session identity changed. Every result is JSON-safe.

No v4 tool creates, reassigns, cancels, accepts, rejects, restores, resolves, or changes
mode. No v3 or decision-room tool appears on the issue page.

## v4.1.8 HTTP namespace

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
- `POST /api/repository-v4/task/mention`
- `POST /api/repository-v4/task/cancel`
- `POST /api/repository-v4/task/accept`
- `POST /api/repository-v4/task/reject`
- `POST /api/repository-v4/thread/create`
- `POST /api/repository-v4/thread/comment`
- `POST /api/repository-v4/thread/resolve`
- `POST /api/repository-v4/presence`
- `POST /api/repository-v4/agent/tasks`
- `POST /api/repository-v4/agent/tasks/wait`
- `POST /api/repository-v4/agent/connect`
- `POST /api/repository-v4/agent/context`
- `POST /api/repository-v4/agent/comment`
- `POST /api/repository-v4/agent/result`
- `POST /api/repository-v4/eval/reset` in preview/eval only

Mutation routes under revision/task/thread/presence require a human bearer. The read-only
surface/history/revision routes accept a human bearer for the UI or an agent bearer for
WebMCP; agent use additionally requires the matching current-profile page connection and
valid per-page UUID header, but does not touch profile metadata. Agent routes require an
agent bearer and the same header.
The page UUID is distinct from the credential's
session-instance UUID: the server uses it to scope concurrent waits, while the registered
callback compares both captured identities to reject stale navigation. Credential-issuing
launch, example, join, and protected
reset accept no idempotency key. Every other mutation, including presence, requires a
UUID `Idempotency-Key` header. Public bodies use the exact `*HttpInput` or model-visible
`*ToolInput` shapes in `src/repository/contracts.ts`, reject unknown properties, and never
accept `requestId`. `revision/read` uses `ReadIssueRevisionHttpInput`. The HTTP/bridge
boundary adds the header to the corresponding internal `*ServiceInput`, retaining it for
transport retry of the same logical call.

## v4.1.9 Persistence namespace and security

All applied migrations, including `20260901154147_repository_v4_issue_documents.sql`,
are immutable. One new additive v4.1 migration adds:

- `ratiflow_issue_agent_profiles_v4` keyed by document/member with bounded name,
  stable profile UUID, private positive identity generation, first/last access, count, and
  fixed `SELF_DECLARED` source;
- `ratiflow_document_private.issue_agent_page_connections_v4`, keyed by document/member,
  credential session-instance UUID, and page-session UUID, referencing the current stable
  profile and recording its identity generation plus `connected_at`; non-connect lookup
  requires that generation to equal the current profile generation;
- `ratiflow_document_private.issue_agent_wait_leases_v4`, keyed by the same authority
  tuple with an opaque lease UUID and bounded expiry, for cross-instance duplicate-wait
  exclusion;
- nullable `agent_profile_id` plus a checked JSON context snapshot on
  `ratiflow_issue_tasks_v4` for new @ work; the migration replaces the applied immutable
  task trigger so both new fields join the immutable identity set;
- an extended request-ledger operation CHECK that preserves every applied operation and
  adds exactly `CONNECT_ISSUE_AGENT_V4` and `CREATE_ISSUE_MENTION_V4`; and
- authoritative `created_revision` on issue comments. The migration adds it nullable,
  temporarily disables the named append-only comment trigger inside the migration
  transaction, backfills from the earliest activity row carrying the exact `comment_id`
  and its authoritative `revision`, and uses the owning thread's immutable
  `created_revision` only for a proven compatibility row with no linked activity. It
  asserts no null remains, sets the column `NOT NULL`, and re-enables the trigger. The
  mutable thread `anchor_revision` is never a backfill source.

It may replace existing v4 RPC function bodies to include the additive fields, but it
does not rewrite or drop the existing tables:

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
- `ratiflow_create_issue_mention_v4`
- `ratiflow_create_issue_thread_v4`
- `ratiflow_add_issue_comment_v4`
- `ratiflow_resolve_issue_thread_v4`
- `ratiflow_cancel_issue_task_v4`
- `ratiflow_accept_issue_task_v4`
- `ratiflow_reject_issue_task_v4`
- `ratiflow_restore_issue_revision_v4`
- `ratiflow_read_issue_history_v4`
- `ratiflow_read_issue_revision_v4`
- `ratiflow_connect_issue_agent_v4`
- `ratiflow_read_issue_collaboration_context_v4`
- `ratiflow_list_my_issue_tasks_v4`
- `ratiflow_begin_issue_task_wait_v4`
- `ratiflow_end_issue_task_wait_v4`
- `ratiflow_comment_on_issue_task_v4`
- `ratiflow_submit_issue_task_result_v4`
- `ratiflow_touch_issue_presence_v4`
- `ratiflow_reset_postmortem_hero_v4` (service-role only)

Reset is revoked from `public`, `anon`, and `authenticated`. Canonical production does
not expose the HTTP reset. Example creation composes ordinary service operations or a
separately proven public example builder; it never calls the protected reset.

No exposed RPC name is overloaded. The migration drops and recreates the single inspect,
history, and exact-revision signatures with a trailing optional page-session UUID that
defaults to null: legacy/human calls remain valid, while agent calls must supply a UUID
whose page connection matches. Exact old and new signatures are explicitly revoked and
the intended replacements regranted.

Migration-first response compatibility is explicit. Every replaced pre-v4.1 RPC that
returns a session, surface, task, comment, history, or revision gains one final optional
`p_response_contract text default 'v4'`; the new adapter always supplies `v4.1`, while the
still-running old deployment omits it. Default `v4` preserves the old accepted launch /
example / join inputs, legacy delegated-agent page behavior without named-profile
connection for null-profile compatibility tasks, and exact old JSON projection, omitting
`agents`, profile/context fields, and comment `createdRevision`. The legacy task-list/result
branch never exposes or executes a new nonnull-profile mention; any action through it
therefore remains a compatibility action with null profile identity in the v4.1
projection. `v4.1` enforces the new checked
inputs/page connection and emits the new projection. The server-only selector is never
accepted in HTTP/model JSON. It enters only v4.1 mutation fingerprints; the default branch
retains the exact applied legacy fingerprint for pre-migration replay. New-only connect,
mention, context, and wait-lease RPCs need no legacy branch. This compatibility projection
may be removed only in a later gated migration after the old app can no longer call it.

For migration-first rollout only, the `v4` Save branch accepts the old app's optional
bounded `changeSummary` key but ignores it and derives the frozen summary from the locked
head. The `v4.1` branch, new HTTP route, and all checked TypeScript inputs reject that key.
This narrow database compatibility allowance prevents the additive migration from
breaking the still-running pre-v4.1 deployment.

The public example builder is production behavior owned by domain/adapter parity. Exact
input is `{ kind: "POSTMORTEM" | "PRODUCT_DOCUMENT", displayName }`; it returns the
corresponding fresh completed historical graph plus one non-authoring viewer member/session
whose name exactly equals the input. Historical fixture members/content/profiles are
immutable and the viewer is never retroactively attributed to a task, comment, revision,
or pre-existing agent profile. The fresh continuity agent profile is absent initially and
is created only by that viewer's later `connect_agent`; its expected overlay is frozen
separately in the golden continuity probe. Exact comparison
normalizes only fresh document,
revision, member, task, thread, comment, session, request, and share identifiers; all
credentials/bootstrap paths; every creation/update/resolution/expiry timestamp; and
derived display colors, and the viewer's fresh member ID; its display name must equal the
input. The historical referential graph must remain isomorphic. Document kind,
title/body snapshots and digests, human names, agent labels, task keys/modes/statuses/
anchors, thread and reply relationships, comments, results, decisions, evidence,
revision numbers/parents/sources/diffs/summaries/provenance roles, historical profiles, context
snapshots, Markdown/chart source, and final counters must equal the selected golden.
Timestamps must retain golden event order even though values vary.
The protected
reset instead creates the executable comment-first starting state r1/av4 with Priya,
Nadia, Leo, and Sam. It seeds the three historical self-declared profiles at access count
0 and the first three golden Direct mentions with exact initial comments, task contexts,
and linked `TASK_CREATED` activities; it seeds no page connection, so each real agent must
still call `connect_agent` on its actual page before executing. Its checked
`ResetPostmortemHeroOutcome` returns fixture
version, share token, four named top-level bootstrap paths, expiry, revision 1,
and activity 4. A bootstrap path is a bearer secret until opened and scrubbed; raw paths,
fragments, or exchanged session bundles never enter logs or evidence. Reset response
loss starts a fresh reset rather than replaying plaintext credentials.

## v4.1.10 Errors and bounds

Errors use the checked codes:

- `INVALID_INPUT` — malformed shape, future counter, no-op, blank/overlong text, bad
  reply/evidence, or a replacement where mode forbids it;
- `UNAUTHORIZED` — invalid/expired/cross-member/cross-task authority without disclosure;
- `AGENT_IDENTITY_REQUIRED` — a non-connect agent tool ran before `connect_agent` for
  the current authenticated owner/page context;
- `STALE_AGENT_PROFILE` — human @ submission no longer exactly matches the selected
  member's current profile name;
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
the 100-member, active-task, and comment capacities are exactly the exported constants.
Unknown properties and unsafe integers fail at schema and server layers. Evidence refs
are 1–240 nonblank code points, at most 12 per comment/result/revision, and are labels or
URLs—not fetched or certified by Ratiflow.

## v4.1.11 Deterministic postmortem and Product document heroes

`docs/contracts/postmortem-hero-scenario.md` and independent JSON goldens freeze
`INC-482`, r1-r5, profile names/owners, exact @ prompts/context, facts, closed human
discussion, replacements, rationales, chart source, digests, and fresh
agent answer. Production seed code may import checked types but tests compare it to the
independent JSON; it cannot import that production builder as its oracle.

`docs/contracts/product-document-hero-scenario.md` and its independent golden freeze the
completed Northstar CSV launch Product document: human capacity correction, @Databot
option arithmetic/table/chart, @ChatGPT synthesis, closed human discussion, multiple
owners, exact revision provenance, and a fresh connected agent continuity answer.

## v4.1.12 Markdown and chart rendering

Revision content remains the exact Markdown source. Reading mode renders GFM without raw
HTML. Links receive safe protocols and external rel attributes. A fenced block whose info
string is exactly `chart` contains one JSON object with only `version`, `type`, `title`,
`description`, `labels`, `series`, `xLabel`, and `yLabel`. `version` is exactly `1`;
`type` is `bar | line`; the fence is at most 20,000 code points; title is 1–120,
description 1–500, and optional axis labels 1–80 nonblank code points; labels contains
1–12 strings (at least two for a line); series contains 1–4
`{ name, values }` entries, with labels and unique series names each 1–80 code points,
whose finite numeric arrays exactly match label count and stay
within ±1e12. Duplicate names and unknown fields are invalid. Colors come only from the
fixed application palette; chart source cannot provide CSS, URLs, or formatters.

Valid chart source renders an accessible labelled SVG and the same values in a visually
available/collapsible HTML table. Invalid JSON/schema renders a non-executable inline
error and keeps the source editable. No chart block fetches a URL, evaluates code, or
injects HTML. The entire fence is ordinary revisioned source and can be diffed/restored.

The renderer keeps exact source positions. HAST text leaves whose raw UTF-16 slice equals
their visible text permit interior endpoints. Cross-leaf selections are valid when both
endpoints are exact; the stored raw slice intentionally includes intervening Markdown
delimiters. Entity/escape interiors, inline or fenced code, generated footnote chrome,
image replacement text, chart internals, and an offset inside a surrogate pair fail
closed. A chart or table block may instead use its keyboard-accessible whole-block source
anchor. DOM UTF-16 offsets convert once to Unicode code-point offsets before the existing
exact selected-text check. Active highlights split exact leaves at anchor boundaries;
ambiguous leaves may be highlighted only when fully covered.

Rendering uses no raw-HTML plugin or unsafe HTML injection. HTML is skipped, the Markdown
URL transform and an explicit element allow-list remain active, remote images never load,
and task-list controls are disabled. Invalid chart source stays inert; persistence accepts
it as ordinary bounded Markdown rather than pretending it is a valid chart.

## v4.1.13 Accessibility and fallback

The title and Markdown source editor remain native spellchecked controls. Reading mode
is semantic and selectable; each rendered block has a keyboard-accessible comment
affordance and a source range. Modified pointer right-click, empty selections, and
non-document targets retain native behavior. Comment composer, @ autocomplete, replies, History,
revision detail, restore, conflicts, and errors are keyboard reachable with visible
focus.

At 390 px there is no horizontal overflow; the rail is a non-modal labelled drawer,
touch controls are at least 44 px, long untrusted text wraps, Escape closes and restores
focus, and reduced-motion preferences are honored.

With WebMCP absent, a human can create either template, render/edit/save Markdown,
share/join, leave/close comments, inspect full history, compare, and restore. @ mentions
remain visibly queued rather than pretending an agent ran. The
agent status says WebMCP unavailable and never claims an agent was connected, notified,
or started.
