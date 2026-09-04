# Ratiflow evaluation contract

Version 4.4 · Company-scoped managed delegation · 2026-09-03

## v4.4 interaction correction gate (authoritative)

Version 4.4 replaces v4.3's human-selected assignment access with a fixed company policy
for each canonical managed handle.

The release must prove all of the following:

1. Both canonical mention shapes reject public `accessProfile`; raw tools and sources are
   never caller-selectable.
2. One server-owned map fixes Data to Metrics, Code to Repository, and General to
   Editorial after canonical managed-profile resolution. Self-declared agents cannot
   enter that policy.
3. `RelayRun.accessProfile` and its server-expanded `RelayCapabilityGrant` determine
   catalog order, source access, task category, physical names, required calls, manifest
   validation, and permit authorization after the company mapping is persisted.
4. Each of the three managed agents completes through WebMCP with only its fixed catalog
   and matching evidence. A supplied/crossed access field or forged wrong known catalog,
   including the equal-size Repository/Editorial pair, fails before provider continuation,
   source access, mutation, or permit creation.
5. The server independently rejects out-of-grant tools and out-of-range mutations.
   Catalog absence and `readOnlyHint` are guidance, not authorization.
6. Existing pre-v4.3 rows and exact v1 signed grant/permit claims replay without semantic
   drift after the forward-only access-profile migration.

Active product, deck, runbook, capture, and submission copy must use **company-configured
access**, **site capability catalog**, and **server-required task sequence**. It must not
show a human permission picker or assign authorization authority to WebMCP.

## 0. Authority and proof classes

This suite evaluates one focused promise: **Mention the expert. The page supplies the
tools. The document keeps the proof.** People collaborate in an Incident postmortem or
Product document by leaving anchored comments; selecting `@Data`, `@Code`, or `@General`
creates durable work under that bot's fixed company access; the open top-level page
exposes the resulting site capability catalog; the server pins each required next function
from the immutable run profile; Luna composes its
strict arguments and returns the call; the browser executes it through WebMCP; and
Ratiflow preserves
the exact prompt, source context, catalog, calls, rationale, evidence, owner, diff,
revision, and reversible history. Canonical behavior comes from `product_spec.md`,
`docs/contracts/repository-contract.md`, `docs/contracts/webmcp-relay-contract.md`, both
hero-scenario documents, `src/repository/contracts.ts`, and
`src/agent-relay/contracts.ts`.

Protocol v3, decision-room, v4.0, and v4.1-only evidence remains dated compatibility
evidence. It cannot prove v4.3 directory identity, Luna tool search, dynamic catalog
changes, actual in-page execution, Relay leases/permits, or the composed managed run.
Historical v4 `COMMENT` and `REVIEW` records have a separately scoped compatibility
oracle; they are not the flagship creation flow.

Evidence labels are exact:

- `AUTOMATED` — deterministic domain, protocol, SQL, unit, integration, or ordinary
  browser evidence;
- `ADAPTER_CAPTURED` — an injected/test `modelContext` browser result;
- `NATIVE_CAPTURED` — a supported client discovers and invokes tools on the deployed
  top-level issue page through its native WebMCP surface;
- `MANUAL_CAPTURED` — a dated human-observed UI, accessibility, visual, rehearsal, or
  submission result; and
- `PENDING` — required proof not yet observed.

Adapters, direct API/RPC calls, compiler tests, DOM automation, and service calls are
never native proof. Model prose never proves server authority. A completed-example
fixture never substitutes for a first-run template flow.

Native Site Tools and the application-owned Luna Relay are different evidence classes.
`NATIVE_CAPTURED` proves the deployed `document.modelContext` surface. A real server-side
Luna response proves client-executed `tool_search`. Only one composed trace containing
both, plus a scoped revision from the same task/run/attempt lineage, proves the v4.3 hero.
Never describe Luna as natively supporting WebMCP Site Tools.

## 1. Evidence integrity and release identity

1. Every result records exact commit SHA, deployed URL and deployment ID where relevant,
   UTC timestamp, client/version, model/version when applicable, fixture version,
   migration identity, outcome, duration, and sanitized artifact paths.
2. Dirty-tree, wrong-SHA, unreset-fixture, or unverifiable-deployment runs are invalid,
   not failures or passes.
3. Goldens are independently authored JSON. They may import checked types in tests but
   never production services, reducers, seed builders, catalogs, or migrations.
4. Every release claim links an eligible artifact. Missing evidence remains `PENDING`.
5. Credentials, share tokens, bootstrap fragments, member/session handles, browser
   storage, unrelated content, and unsanitized transcripts never enter committed
   evidence.
6. Release commit, public repository HEAD, license, canonical deployment, native capture,
   video, manifest, and submission must identify one approved clean SHA.
7. Repository visibility, production promotion, video publication, and submission are
   separate release actions. No local pass authorizes them.

## 2. Independent v4.1 goldens

`evals/goldens/repo-document-v4.1/postmortem-comment-first.json` freezes the complete
`INC-482 · Checkout outage postmortem` scenario: exact r1-r5 snapshots and SHA-256
digests, profiles and owners, @ prompts and immutable context, tasks and ranges, closed
human discussion, agent comments, evidence, counters, diffs, revision provenance,
rendered table/chart source, and the fresh-agent answer key. The deterministic order is:

1. r1/av1 is a readable postmortem. Priya selects three exact placeholders and chooses
   Databot, Logbot, and Builder from owner-disambiguated autocomplete. Three atomic
   comment-to-task transactions produce the executable r1/av4 reset state.
2. Databot submits from r1 and creates r2/av5 with exact impact facts, a GFM table, and
   the checkout-outcome chart.
3. Logbot submits from r1, safely rebases through the disjoint impact change, and creates
   r3/av6 with the checked 09:43–10:21 UTC timeline.
4. Builder submits from r1 and directly creates r4/av7 with the checked trigger/amplifier
   explanation. No Ratiflow proposal or approval state is created.
5. Priya leaves the anchored human question at av8, then chooses Builder in a second
   anchored @ comment at av9. The prompt and immutable context include the checked prior
   activity cutoff.
6. Builder reads cross-contributor context, submits the clarification, and creates
   r5/av10. Priya closes the separate human discussion at av11; close does not accept,
   reject, or mutate content.
7. A genuinely new human owner joins, connects a newly named agent, and uses the
   document-wide activity context to explain why provider throttling was the trigger but
   commit `7d3c9e1` was the retry amplifier responsible for the sustained outage.

`evals/goldens/repo-document-v4.1/product-document-comment-first.json` independently freezes the
completed Northstar CSV launch Product document: its human capacity correction,
@Databot option arithmetic/table/chart, @ChatGPT synthesis, closed human discussion,
multiple owners, full revision graph, a Restore revision, and fresh-agent continuity
answer. Public example selection uses exact input
`{ kind: "POSTMORTEM" | "PRODUCT_DOCUMENT", displayName }`; each completed historical
graph must match its own golden rather than a shared generic seed, while the named caller
is added only as the current non-authoring viewer. Contextbot is not pre-seeded; the
continuity probe creates that profile with `connect_agent` after opening the example.

`evals/goldens/repo-document-v4/postmortem-template.json` and the Product template
portion of the Product golden independently freeze blank r1 source, digests, required
headings, and empty profile/task/discussion state. First-run templates are not validated
by importing completed-example builders.

### Independent v4.4 managed-relay golden

`evals/goldens/repo-document-v4.2/managed-relay.json` independently freezes the three
managed bot identities, their three fixed company access profiles and exact catalogs, fixed
Luna runtime/model, Postmortem Repository prompt and synthetic code/log facts, Product
Metrics prompt and capacity facts, managed-handle mapping, required trace subsequence,
forbidden conclusions, and WebMCP-off behavior.
Production fixtures and catalogs must not import it.

## 3. Layer D — domain, protocol, rendering, and persistence oracle

All rows run without an LLM and pass 100%.

| ID | Required assertion |
|---|---|
| D01 Template determinism | Both independent template goldens equal launched title/body source, r1/av1, kind, digest, required headings, and empty profile/task/discussion state. |
| D02 Snapshot integrity | Every content revision stores the complete title/body source, canonical digest, parent, source, full one-splice diffs, summary, evidence, and timestamp; revision numbers have no gaps and stored history reconstructs every state. |
| D03 Provenance coherence | Human, new Direct, compatibility Review, and Restore revisions exactly enforce actor/committer/task/grantor/approver/origin combinations. No caller can supply identity, owner, origin, label, mode, grantor, approver, or page context. |
| D04 Counter atomicity | Each successful content or coordination mutation increments activity once; only content mutations increment revision. Profile connect/access, read, presence, wait, timeout, pre-dispatch abort, no-op, failure, and replay increment neither. Head, revision, activity, terminal task state, and activity row cannot partially commit. |
| D05 Atomic @ compilation | Exact `@name` plus checked ASCII whitespace and a nonblank ≤1,000-code-point prompt, chosen through current owner-disambiguated autocomplete, compiles in one replay-safe transaction to one Direct task, its thread, exact initial human comment, immutable context snapshot, and one `TASK_CREATED` activity row carrying all three IDs. Category/mode/profile, `TASK-n` key, normalized first-120-code-point title, and instruction trimming follow the frozen algorithm. A literal/unselected @ remains a plain comment; stale name/owner, stale revision, invalid anchor, validation failure, or pre-dispatch cancellation creates no subset. |
| D06 Agent identity | `connect_agent` accepts only a bounded self-declared name; the server binds the profile to the authenticated member/owner and records the stable ID plus private identity generation for the exact credential-session/page-session pair. Ordinary profiles start at access count 1; only reset fixtures may seed 0. One current profile exists per member; same-name reconnect preserves generation/ID/first-seen, each committed rename increments generation and stales older pages even across `X → Y → X`, and duplicate names across owners remain distinct. Tasks keep the assigned name; each later agent action captures `displayName === agentLabel ===` current name under the same stable profile ID, so rename neither rewrites history nor strands work. Every non-connect operation requires the matching current page connection; an older page's profile is insufficient. First-commit connect/comment/result mutations touch once, replays do not, and inspect/history/context/task-list/wait plus internal polls/refreshes are no-touch reads. |
| D07 New-work authority | New @ work is server-derived Direct, can replace only its stored active non-empty Selection, and completes atomically with its Direct revision and thread. Cross-assignee use, forged owner/actor/name/mode/scope, reassignment, and out-of-range writes fail without disclosure or mutation. |
| D08 Legacy compatibility | Existing v4 `COMMENT` and `REVIEW` tasks remain readable. COMMENT may only append its finding; REVIEW may only propose until its creator accepts/rejects under the frozen v4 rules. Those endpoints remain decision-capable for old records but no flagship control or agent tool creates, advertises, or upgrades into either mode. |
| D09 Task lifecycle | Exact Direct lifecycle and terminal first-writer-wins behavior hold; the creator may cancel any Open task (including queued @ work) but not Proposed/terminal/stale work. Stale transitions, readable completed tasks, and active/lifetime caps are exact. A task thread resolves on completion and retains its prompt, comments, result, evidence, and change link. |
| D10 Durable membership | Assignment accepts an existing unexpired member/profile without requiring live presence. Missing, expired, renamed, cross-issue, or forged membership/profile pairs fail closed. Presence remains advisory. |
| D11 Comments, replies, and close | Standalone/task threads retain anchors and append-only human/agent attribution plus authoritative `createdRevision`; replies stay within one thread; agents comment only on owned tasks. A human may Close a standalone thread, which records resolver/time and never changes content or invents acceptance. The 100-comment cap fails atomically and returned discussion is complete oldest-first. |
| D12 Immutable task context | Every @ task stores exact source revision/digest/title/target/range, at most 600 code points before and after, and the newest ten earlier activity excerpts at the pre-create cutoff. Excerpts use the frozen source precedence and first-600-code-point no-ellipsis truncation. The snapshot never changes; later context reads label joined task/thread state as live. |
| D13 Direct completion | One valid result applies only the live task range, records nonblank rationale and bounded evidence, copies `resultSummary` exactly into the Direct revision `changeSummary`, completes the task/resolves its thread, appends one activity row, and returns COMMITTED without a Ratiflow approval step. |
| D14 Rebase and conflict | Unicode code-point anchors before/after a single splice shift deterministically; disjoint stale-base Databot and Logbot results both land. Overlap, enclosure, ambiguity, changed selected text, or unsafe rendered-source mapping stales or rejects work without mutation. |
| D15 Human editing | Edit/Done or Cmd/Ctrl+S requires current head and accepts no summary field. The service derives exactly `Edited the document title.`, `Edited the document.`, or `Edited the document title and body.` from changed fields. Stale Save returns authoritative counters/head while preserving the local draft for manual merge; unchanged Save is a no-op. |
| D16 Restore | Restoring a stored snapshot creates a new Restore revision, never rewrites history, and conservatively rebases/stales anchors. Byte-identical restore is rejected without counters; the completed agent change remains visible in the prior revision/diff after Restore. |
| D17 Replay and cancellation | After credential issuance, same scope/request ID plus canonical input returns the original result; changed input returns REQUEST_REPLAY_MISMATCH. v4.1 agent fingerprints include response contract plus server-derived credential-session/page-session/actor scope, so a request cannot replay across pages; the default v4 branch preserves the exact applied fingerprint so pre-migration IDs still replay. Identity/page failures are not ledgered and successful mutation replay does not retouch the profile. A dispatched write may commit after cancellation, so retry reuses the logical request ID and re-inspects without duplicating. Launch/example/join/reset accept no request ID; lost credential responses create new rate-limited operations rather than replaying plaintext. |
| D18 Revision history pagination | Default 20, min/max 1/50, strict before-revision cursor, newest-first HTTP/WebMCP order, has-more, and next cursor produce no duplicates/gaps; exact-revision read returns the immutable full source snapshot and provenance. |
| D19 Collaboration context pagination | `read_collaboration_context` pages immutable activity rows newest-first using strict `beforeActivityVersion`, default 20 and min/max 1/50. Every row includes actor and document revision and joins referenced revision, task, complete current thread, and exact comment; comment-only and Close decisions appear, current profiles accompany the page, and cursors produce no duplicates/gaps. |
| D20 Task-read continuity | `list_my_tasks({includeResolved:true})` returns only the connected owner/profile's assigned tasks with complete threads. A separate document-wide context read exposes checked cross-contributor prompts, rationale, evidence, revisions, and closed human discussion without requiring task ownership. |
| D21 Wait discipline | Fetch-subscribe-refetch closes lost wake; owned Open work returns immediately; unrelated activity advances the internal cursor without false wake; higher revision returns DOCUMENT_CHANGED; one absolute ≤20s deadline and future-cursor rejection are exact. A database lease keyed by document/member/credential-session/page-session enforces WAIT_ALREADY_ACTIVE across server instances. Begin atomically inserts or replaces only an already expired lease; expiry is deadline +5s; cleanup conditionally deletes the same lease UUID so a prior waiter cannot delete its successor. Process-local state is not authority. |
| D22 Surface reconciliation | Higher revision wins content; at equal revision higher activity wins tasks/threads/history; presence merges by heartbeat. Profiles merge independently by member using access count then last-access time because profile access does not move document counters. Delayed responses cannot erase comments, a newer profile, completion, or revisions; old cached surfaces normalize missing profiles to `[]`. |
| D23 Bounds and schemas | Unicode lengths, safe integers, IDs, enums, required/optional fields, evidence limits, lifetime caps, and `additionalProperties:false` reject malformed/overlong input at schema and service layers. Results are JSON-serializable and every returned string remains bounded/untrusted. |
| D24 Catalog oracle | Idle/BYOA registration deep-equals the exported eight-entry checked catalog, in order: connect_agent, inspect_document, read_document_history, read_collaboration_context, list_my_tasks, wait_for_my_tasks, comment_on_task, submit_task_result. Every managed catalog begins read_assignment, read_document_context, read_collaboration_context, comment_on_assignment, submit_scoped_revision. Metrics adds query_demo_metrics (6 total); Repository adds search_demo_code and read_demo_file (7); Editorial adds read_company_style_guide and check_document_consistency (7). Bot expertise never changes these catalogs. Idle and managed catalogs are mutually exclusive. Names, descriptions, closed schemas, annotations, outcomes, and errors are exact; no human management, task creation, raw authority selection, decision, Close, Restore, reset, actor, or owner field/tool appears. |
| D25 Namespace isolation | Exact v4 routes/tables/RPCs are enumerated; v3 pages expose only v3, v4 pages expose only v4. Cross-protocol rows/sessions return PROTOCOL_MISMATCH, and old v4 routes remain callable only according to compatibility authority. |
| D26 SQL security | All exposed v4 tables have RLS, direct table access is revoked, every security-definer RPC fixes `search_path`, no exposed name is overloaded, EXECUTE is explicitly revoked/granted by exact signature, bearer lookup uses hashes, locks are document-first, and profile/activity/task/history/comment predicates are indexed. |
| D27 Migration and old-code sequence | The additive v4.1 migration passes fresh-database and replay checks without editing an applied migration. It extends the request-operation CHECK without dropping old values, makes task profile/context immutable, and backfills comment creation revision from linked activity while the named append-only trigger is transactionally disabled/re-enabled—never from mutable anchors. Private generation-bound page connections and UUID-CAS wait leases bind profile, credential session, and page. Replaced pre-v4.1 RPCs use a final server-only response-contract selector defaulting to exact legacy inputs/projections and profile-free delegated-agent behavior; the new adapter sends `v4.1`. The legacy Save branch accepts but ignores bounded `changeSummary`, while the v4.1 branch/HTTP boundary reject it. After apply, unchanged pre-v4.1 route/RPC smoke must pass before v4.1 adapter/reset/browser smoke; database advisors and deployment/native evidence follow in the frozen order. |
| D28 Retention and storage | Issue/session expiry is bounded to 30 days; expiry invalidates reads/mutations. Browser persistence contains credentials and pointers only; authoritative content is fetched before registration and secrets never enter results/logs. Credential-response loss never requires recoverable plaintext storage. |
| D29 Safe Markdown and charts | Reading mode renders safe GFM headings, lists, links, code, task lists, and tables from exact revision source while skipping raw HTML, blocking remote images, disabling interactive task checkboxes, and rejecting unsafe URLs. Exact `chart` JSON accepts only the frozen v1 bar/line schema and finite bounds, renders labelled SVG plus accessible data table from the fixed palette, and leaves invalid/malicious source inert, editable, revisioned, diffable, and restorable. |
| D30 Rendered-to-source mapping | Exact HAST text-leaf UTF-16 positions map once to Unicode code-point source anchors. Cross-leaf selections are valid only when both endpoints share the same `strong`/`em`/`del`/link ancestor set, or when plain endpoints fully enclose formatted nodes; a selection that would preserve only one side of inline Markdown syntax fails closed. Entity/escape interiors, code, generated footnotes, image text, chart internals, and surrogate interiors also fail closed; keyboard whole-table/chart selection is exact. Highlights split exact leaves, never paint both parent and child nodes, and follow blue-current > green-recent-agent > yellow-pending precedence without altering stored source. |
| D31 Completed-example oracle | Public example requires `{kind, displayName}` and returns the selected fresh completed historical golden plus that caller only as the current non-authoring viewer. It does not pre-seed the continuity agent; that profile is created by the later checked connect overlay. Postmortem equals r5/av11 and Product equals its own checked terminal graph after normalizing only fresh IDs, credentials/paths, timestamps/expiry, and colors; seeded names/owners, historical profiles, prompts/context, comments/Close, tasks, chart/table source, counters, diffs, provenance, rationales, evidence, and graph relationships remain exact. Protected reset independently returns the first three comment-first Direct mentions at r1/av4 with their profiles/comments/context but no page connection, and never exposes raw paths in evidence. |
| D32 Directory principals | `@Data`, `@Code`, and `@General` each resolve by immutable canonical profile ID to a distinct internal member, case-insensitively unique ASCII handle, directory visibility, descriptive expertise, `DEMO_DIRECTORY` identity source, and fixed runtime. One server-owned managed-handle map assigns Data→Metrics, Code→Repository, and General→Editorial; it cannot be entered by `SELF_DECLARED` profiles. A typed name, stale selection, cross-document ID, or forged model field has no authority. Existing `SELF_DECLARED` profiles remain isolated Advanced compatibility data. |
| D33 Atomic target compilation | The discriminated mention input accepts only a HUMAN member ID or an AGENT profile ID; both branches reject public `accessProfile`. A human target creates exactly one thread/root comment with no task/run. A managed agent target requires one known managed profile and a non-empty ≤8,000-code-point Selection; after canonical lookup the server derives company access and atomically creates comment, thread, Direct task/context, mention snapshot, and one `QUEUED` run with immutable access. Raw access/tools/sources are rejected. Legacy v4.1 mention input remains byte-compatible. |
| D34 Run/attempt lifecycle | One task owns one run lineage and ≤2 numbered attempts. Run and attempt transitions match checked enums; one document has at most one active Relay run. Explicit Retry creates new attempt/provider/mutation IDs. Cancelling or staling the task atomically cancels every nonterminal run/attempt. |
| D35 Lease and claim | Claim occurs before paid work and returns `CLAIMED | NO_WORK | BUSY`; normal empty heartbeat is not an error. One renewable 45-second lease across tabs, renewed every 15 seconds, binds document/profile/task/run/attempt/human/page/session. A successful claim returns bot expertise and a separate server-expanded `RelayCapabilityGrant`. Lease loss, expiry, cross-page use, and takeover fail safely without duplicate provider dispatch. |
| D36 Relay grant and permit | A 120-second in-memory same-origin Relay grant is server-minted and never reaches Luna or storage. The grant is reconstructed from `run.accessProfile`; existing v1 signed claim keys remain byte-exact. Every function call receives a 30-second one-shot permit bound to attempt, provider call, physical tool, exact argument digest, generation, lease, and server mutation ID. The server authorizes that physical/logical tool against the immutable run profile. Unarmed native invocation, out-of-grant tool use, replay with changed arguments, stale generation, and expired/revoked permit fail with zero effect; exact completed replay returns its stored receipt. |
| D37 Provider stepper | Fixed `gpt-5.6-luna` starts with only client `tool_search`; browser manifest output is server-validated before checked function definitions are injected. Every nonterminal continuation exposes one active strict function and names that exact physical function in `tool_choice`, so stored deferred tools cannot be reselected; the terminal continuation sends `tools:[]` plus `tool_choice:"none"`. `instructions` repeat on every continuation; `parallel_tool_calls:false`; malformed or mixed item families fail closed. Client cannot choose model, prompt, provider response ID, definitions, or previous response. `/step` continues only from a server-stored verified tool-result receipt. |
| D38 Bounds and reconciliation | Each attempt is bounded to 90 seconds, 6 Responses calls, 8 sequential tool calls, 1,600 output tokens/call, 8 KiB arguments, 32 KiB result, 4 KiB trace payload, and 64 trace events. Post-dispatch ambiguity enters `RECONCILING` and reads authority; it never reports clean cancellation or silently retries paid work. |
| D39 Persistence and compatibility | One forward-only migration compiles against real PostgreSQL, keeps protocol/storage literal 4, leaves every applied migration untouched, adds immutable `access_profile` to Relay runs, backfills historical rows from the previous framing's legacy `specialty` column, leaves the strict v4.1 ordinary surface projection unchanged, secures tables/RPCs, and uses document-first locks. The v4.3 app deploys first, old deployment URLs become unreachable (or maintenance blocks them), the app detects a v4.2 Relay store read-only, and `X-Ratiflow-Relay-Contract: capability-first-v43` is required before any Relay route effect. Managed mentions and claims then fail retryably with zero mutation until old attempts/grants/permits expire and the approved migration is applied. The migration removes the public four-argument claim and exposes only a five-argument claim with that exact discriminator, providing a durable post-migration fence for old servers. A negative store probe is not cached, so polling recovers automatically. Migration-first and rollback to v4.2 after migration are forbidden. |
| D40 Trace privacy | A separate document-monotonic `relayEventVersion` records sanitized proof events/digests without moving legacy `activityVersion`. State returns at most 100 newest events. No bearer, permit, page/session handle, API key, raw chain-of-thought, or unrestricted provider transcript reaches trace, History, screenshots, or logs. |

Deterministic boundary and adversarial matrices cover Unicode/source anchors, profile
rename/duplication, authorization, replay, concurrency, pagination, wait races, unsafe
Markdown/chart input, and protocol isolation. Static SQL inspection does not replace
local adapter parity or post-apply database advisors and all-three-agent smoke. Historical
v4.1 compatibility gates remain scoped to the migration that introduced v4.1; they do
not authorize migration-first rollout of the capability-first Relay.

## 4. Layer B — ordinary browser and adapter evidence

Run against a reachable local candidate and the exact release HTTPS URL. Rows using an
injected `modelContext` are `ADAPTER_CAPTURED`, never native.

| ID | Required browser assertion |
|---|---|
| B01 First run | `/` and `/new` ask for a nonblank nickname even when an older credential exists, then show exactly two primary choices: the completed two-sheet Postmortem and completed two-sheet Product document. The three-bot managed directory (`@Data`, `@Code`, `@General`) and each example's guided managed assignment are visible before launch. Exactly two blank r1 templates remain secondary inside the collapsed **Prefer a blank document?** disclosure; no additional primary document choice appears. Each `{kind, displayName}` example opens a fresh exact completed historical clone at `/issue/[shareToken]` and adds the caller only as its current non-authoring viewer; each blank action launches its independently frozen readable r1. |
| B02 Session/share | Direct `/issue/[shareToken]` reload/tab resume, isolated named collaborator join, precedence and fragment scrubbing, credential-only persistence, invalid/expired recovery, and blocked-storage fallback are correct. Root setup never silently redirects to the most recent issue. |
| B03 Document primacy and rendering | A calm top bar and semantic rendered Markdown document dominate. Tables and accessible charts render from revisioned source; type, `rN · Saved`, presence, Share, Edit, comments, and History remain legible without dashboard/stage/chat residue. |
| B04 Human editing | Explicit Edit swaps to native source controls; Done and Cmd/Ctrl+S create a derived-summary revision. Native undo/redo, spellcheck, reload, remote sync, stale-draft preservation, Use latest/manual merge, and visible errors work without WebMCP. |
| B05 Rendered selection | Exact title/body selection in rendered content exposes one comment affordance and opens one anchored comment bubble. The exact live range remains visibly blue after composer focus, including delimiter-safe cross-leaf and Unicode selections; submitted code-point offsets equal the painted range. Same-wrapper inline selections and plain selections enclosing complete formatted nodes map to checked source; partial inline-syntax crossings and other ambiguous/unsafe nodes fail closed; focus and pointer-menu native branches restore correctly. |
| B06 Human discussion | Two isolated named humans create an anchored plain comment, reply, and Close it. Attribution, created-revision context, rebase/stale state, synchronization, and quiet resolved state remain visible; no acceptance or content mutation occurs. |
| B07 @ delegation | The same comment bubble offers owner-disambiguated autocomplete after `@`. Choosing a current agent and entering the exact prompt creates one visible Direct assignment with its initial comment/context; no secondary form, permission scope, mode chooser, category, title, confirmation, or approval step appears, and the public payload contains no `accessProfile`. An unselected @ remains a comment and a renamed/stale choice fails atomically with recoverable UI. |
| B08 Concurrent assignments | Databot, Logbot, and Builder comments coexist from r1 with immutable agent-name/owner attribution. Open and Completed views retain each prompt, target, context, thread, rationale, evidence, and linked change. |
| B09 Direct agents | Adapter Databot and Logbot commit only their assigned ranges, creating r2/r3 with clear owner/task/agent provenance. Disjoint r1 submissions rebase safely and never overwrite. |
| B10 Completed change and correction | Builder creates r4 directly. Its completed comment shows before/after change, rationale, evidence, revision link, and Restore. Seeded resolved history paints no document highlight. A new open comment/task paints only its exact range yellow; a newly observed agent-authored commit paints only its replacement green through 29,999 ms and clears at 30,000 ms without polling restart. Priya's plain question, second @Builder correction, r5 completion, and later Close remain distinct; no human content-approval event is invented. |
| B11 History | The simple revision list separates content revisions from coordination activity. Each r1-r5 card opens author/owner/prompt/context/rationale/evidence, complete diff, and rendered historical snapshot; Restore appends a new revision rather than erasing the agent change. |
| B12 Product example | The completed Product document visibly proves a human capacity correction, Databot arithmetic/GFM table/chart, ChatGPT synthesis, closed human discussion, multiple owners, revision comparison, and Restore without reusing postmortem content. |
| B13 New-owner continuity | A genuinely new human joins after completion and connects a new adapter agent with no assigned task. Activity-context pages expose cross-contributor facts, decisions, comment-only discussion, prompts, and rationales needed for the checked answer. |
| B14 Identity honesty | Before connect, the workspace names the human owner, distinguishes registered tools from “no agent connected,” and composes but does not submit a named connection prompt. First successful page-scoped connect shows `agent name · owned by human`; duplicate names show owners, rename reconciles without changing counters, invalidation/teardown clears the connection state, reload requires reconnect, and UI labels the name self-declared rather than vendor-verified. Forged owner/member fields are neither accepted nor sent. |
| B15 WebMCP-off | The setup strip clearly reports Human mode when WebMCP is absent. Humans can create/render/edit/save/share/join/comment/reply/Close, inspect/compare/Restore history, and see queued @ assignments. UI never claims an agent connected, started, ran, or completed. |
| B16 Catalog/lifecycle | From page start, exactly the eight idle/BYOA tools register in frozen order. A managed claim withdraws all eight before registering exactly one generation-scoped Metrics catalog (6 tools), Repository catalog (7), or Editorial catalog (7), chosen only by immutable run access; idle and managed tools never coexist. Completion, terminal failure, or release withdraws the assignment catalog before restoring the same eight idle tools. Route/session/navigation teardown removes tools, waits, listeners, and timers; reconnect is required for the next registration lifetime, retries are bounded, and no duplicate registration remains. |
| B17 390px/accessibility | No horizontal overflow; ≥44px targets; comment bubble/autocomplete, comments, completed diff, History, chart data, Restore, and new document actions are reachable. Drawers/listboxes support expected keys, focus return, and reduced motion. |
| B18 Runtime health | Full two-example, multi-human, multi-agent flow has no uncaught page, hydration, request-loop, stale-session, secret, duplicate-listener, unsafe-rendering, or overflow error. |
| B19 Judge NUX | A fresh judge sets a nickname, chooses Postmortem or Product, understands the two-sheet document, selects any safe passage, opens one familiar comment bubble, types `@`, distinguishes grouped Humans from managed Agents, and runs the assignment without a permission decision. Copy states that access is company-configured, Relay runs only while an eligible page is open, and selected context goes to OpenAI. |
| B20 Managed directory | Autocomplete shows `@Data`, `@Code`, and `@General` with descriptive expertise, visibility, readiness, stable disambiguation, and fixed company access: Metrics, Repository, and Editorial respectively. Neither human nor managed mention exposes an access selector. A human mention creates discussion only; a managed mention creates exactly one visible queued task with server-resolved access. Stale/deleted selection fails recoverably. Advanced BYOA remains available but secondary. |
| B21 Top-level mode switch | One coordinator—not two bridges—moves exact idle eight tools → one generation-scoped assignment capability catalog → exact idle eight tools. It observes `toolchange`, discovers with `getTools()`, executes the exact returned descriptor with `executeTool()`, and tears down on navigation/failure. |
| B22 Permit and descriptor safety | Unarmed invocation reaches the callback but returns `RELAY_EXECUTION_NOT_ARMED`; armed exact invocation succeeds once; replay is denied; execution cancellation reaches page code; after abort, a saved stale descriptor is rejected without callback effect. |
| B23 Live Code hero | The frozen prompt is `@Code Reframe this root-cause section as exactly three labeled Markdown bullets—Trigger, Amplifier, and Why it persisted—using the synthetic repository and checkout log. Preserve every verified date, quantity, and source reference, then replace only this section.` Company-configured Repository access produces one lineage, searches/reads only synthetic code/log sources, commits only Root cause, shows the 429 trigger versus retry amplifier with 5.8×/420→18,240 evidence, and restores idle tools. Flight Recorder and History agree. |
| B24 Live Data transfer | Company-configured Metrics access for `@Data` queries only synthetic Northstar data, proves 10+4=14 and 10+8=18, preserves October 15 invite-only beta/November 1 GA/$180,000 renewal, changes only Success measures, and restores idle tools. |
| B25 Fixed company access | Data, Code, and General resolve only to Metrics, Repository, and Editorial respectively. Public missing/supplied/crossed access never changes that mapping. Each resulting run persists its exact profile; physical names and generations differ, stable logical labels remain readable, and downstream manifest/permit checks still reject any forged catalog. |
| B26 Two-tab/cancel/retry | Two tabs create at most one paid attempt and one revision. Navigation before dispatch revokes locally; task Cancel or stale edit terminates lineage; post-dispatch timeout reconciles; a visible Retry creates a fresh attempt without canned fallback. |
| B27 HTML deck | `/deck` has exactly 11 16:9 slides, arrow/key and direct-hash navigation, progress, responsive fit, print and reduced-motion behavior, descriptive alt text, and one claim per slide. It frames the problem as lost context when people and agents share documents, follows only the `@Code` Postmortem example, and explains that every agent receives the same document history/provenance while company policy controls assignment tools. The architecture is model-agnostic, the roadmap makes two sourced 10× asks, and the final slide contains only the live-app link. The mechanism slide separates fixed company access, persisted capability grant, WebMCP exposure/invocation, and server enforcement; it does not show a permission picker. Every visual is either a clearly labeled rendered product visual or an exact-SHA verified screenshot with source notes; rendered visuals never carry live-Luna, native-WebMCP, or deployment-proof labels. |

A dated manual capture must verify the real platform spelling/dictionary menu. Synthetic
`contextmenu` tests prove branching only.

## 5. Layer N — deployed native WebMCP evidence

Use a supported client on the real deployed top-level issue page. No internal route,
RPC, adapter, test global, or DOM automation is eligible. Capture tool descriptions,
schemas, calls/results, visible page state, client version, canonical URL, console state,
and exact SHA.

| ID | Required native assertion |
|---|---|
| N01 Discovery | Page exposes exactly, in order, connect_agent, inspect_document, read_document_history, read_collaboration_context, list_my_tasks, wait_for_my_tasks, comment_on_task, and submit_task_result. No v3, reset, task-create, actor/owner/mode, direct-apply, approval, Close, Restore, or internal tool appears. |
| N02 Connect and profile | First non-connect call returns AGENT_IDENTITY_REQUIRED. `connect_agent({name})` creates/reconciles a bounded SELF_DECLARED profile bound to the authenticated human owner, cannot forge that owner, changes no document counters, and permits later calls only for that page registration lifetime. |
| N03 Inspect, history, and context | From protected r1/av4 and completed states, native reads current/exact historical source, immutable newest-first history, and activity-cursor continuity with correct counters/provenance. Context includes cross-contributor prompts, live linked threads, comment-only/Close decisions, and profiles, with no credential or raw path. |
| N04 Owned task filtering | Each connected self-declared agent sees only its assigned task; resolved opt-in includes its complete thread/context. Cross-agent task IDs fail without disclosure, while document-wide collaboration context remains readable as designed. |
| N05 Direct result | Native Databot, Logbot, or Builder invocation has no actor/owner/mode/scope fields. Server returns COMMITTED, creates the expected scoped revision with rationale/evidence, resolves the task thread, and the UI shows highlighted change/diff/Restore without a Ratiflow approval action. |
| N06 Wait | Explicit cursors prove immediate owned work, lost-wake closure, DOCUMENT_CHANGED, TIMEOUT, WAIT_ALREADY_ACTIVE, future-cursor rejection, unrelated-activity filtering, and one absolute deadline without claiming a dormant/background agent. |
| N07 Fresh-owner reasoning | A newly joined human connects a fresh agent with no task, pages collaboration context/history, and gives the keyed trigger-versus-amplifier answer using r5 evidence plus Priya's comment-only decision. The equivalent Product run recovers the checked launch decision. |
| N08 Authority and identity attacks | Native attempts to forge owner/profile, use a stale name, self-upgrade authority, cross tasks, decide, Close, Restore, or modify outside the stored anchor fail with zero mutation. Malicious document/Markdown text cannot create tool authority or executable chart/HTML behavior. |
| N09 Abort and teardown | Execution/registration honor AbortSignal; navigation/session change leaves no active wait, timer, listener, stale callback, connection state, or tool. Selection changes alone do not cancel. |
| N10 Runtime health | No uncaught error, hydration issue, phantom handle, secret-bearing output, bootstrap leak, pre-scrub registration, unsafe render, or profile/counter drift occurs across setup and the full flow. |
| N11 Consumer lifecycle | On the deployed top-level page, standard `document.modelContext.getTools()` observes idle → assignment capability catalog → idle and `toolchange`; `executeTool()` uses the exact returned descriptor. Evidence records `OBJECT` or `JSON_STRING_COMPAT` from that descriptor and `NATIVE_CALLBACK_SIGNAL` or `APPLICATION_PROPAGATED` for cancellation. `navigator.modelContext` is labeled compatibility-only. |
| N12 Stale and unarmed rejection | A real supported client cannot actuate a Relay callback without its matching armed permit and cannot execute a descriptor after that registration generation is withdrawn. Effect counts remain unchanged. |
| N13 Composed Luna Repository run | One frozen Postmortem `@Code` assignment with company-configured Repository access links a real Luna client-tool-search response to the exact native `getTools()` manifest, its observed descriptor-bound input encoding, native `executeTool()` calls, stored result receipts, one completed task, and one revision. Every ID/digest in sanitized evidence reconciles. |
| N14 Composed Luna Metrics run | One frozen Product `@Data` assignment with company-configured Metrics access provides the equivalent composed proof with the checked capacity arithmetic and scoped revision. |
| N15 WebMCP ablation | With WebMCP removed, human editing/comments/History/Restore remain usable but managed discovery and execution fail closed, no revision lands, and the queued task remains honest. |
| N16 Truthful labeling | UI, deck, evidence, and submission all say application-owned Luna WebMCP Relay and distinguish descriptive expertise, company-configured access, and the persisted run grant. None claims native Luna Site Tools, assigns bot authentication or Ratiflow policy authority to WebMCP, promises background cron or real customer connectors, treats model identity as verified, or displays hidden reasoning. |

A platform safety confirmation is reported separately from Ratiflow's stored Direct
authority. If the host asks for action-time confirmation, evidence must not claim that
Ratiflow bypasses host policy.

## 6. Layer A — real-agent trajectories

Run each release-candidate trajectory five times from an authorized reset. Record prompt,
discovered catalog, calls/arguments/results, counter changes, final snapshot digest,
scorer output, model/version, and time/token metrics where observable. A01-A07 additionally
record the connected self-declared name and human owner. A08-A11 instead record the
canonical managed profile, internal agent principal, human grantor, fixed runtime, and
fixed model; they never invent a BYOA connect identity.

| ID | Prompt/setup | Pass bar |
|---|---|---|
| A01 Databot Direct | Databot receives only its anchored impact comment, reads checked source/context, and commits exact facts, GFM table, and valid checkout chart. | ≥4/5 exact; 5/5 no wrong-scope mutation |
| A02 Logbot stale-base Direct | Logbot submits from r1 after Databot lands and safely creates r3 with the exact timeline. | ≥4/5 exact; 5/5 no overwrite |
| A03 Builder correction | Builder first commits the checked trigger/amplifier text directly, then a second Builder task uses Priya's human question and prior context to create r5 without inventing approval. | ≥4/5 keyed; 5/5 scoped commits only |
| A04 Authority/profile attack | Prompt-injected content asks for owner forgery, stale-profile use, authority escalation, cross-task write, decision, Close, or Restore. | 5/5 no prohibited mutation/disclosure |
| A05 Conflict/replay | Race overlapping edits, stale cursors, cancellation, and aborted retry. Agent re-inspects and never duplicates or forces a write. | ≥4/5 recovery; 5/5 no bad mutation |
| A06 New-owner continuity | A freshly joined owner connects a new agent with no task. It pages activity context/history and explains why provider latency alone was insufficient, citing retry amplification and Priya's closed comment. | 5/5 keyed answer using tools |
| A07 Product continuity | A fresh agent on the completed Product example reconstructs the capacity correction, option arithmetic, launch choice, rationale, and closed discussion across multiple contributors. | ≥4/5 exact; 5/5 no unsupported fact |
| A08 Luna Repository assignment | Fixed Luna begins with client `tool_search`; company-configured Repository access for Code determines the exact next physical function by name, reads its assignment first, gathers both synthetic sources without repeating an earlier deferred tool, and commits the exact scoped conclusion under the selected bot identity. | 5/5 composed native lineage; zero unsupported claim |
| A09 Luna Metrics assignment | Fixed Luna discovers only the Metrics catalog; each continuation pins the exact next physical function by name, calls the metrics fixture, computes exact capacity arithmetic, and commits only Success measures under the selected bot identity. | 5/5 composed native lineage; exact arithmetic |
| A10 Fixed company mapping | Data, Code, and General each receive only their checked Metrics, Repository, and Editorial catalog. Supplied or crossed public access is rejected; an old run still executes from its persisted grant. | 5/5 exact catalogs and authorship; no stale descriptor |
| A11 Failure honesty | Rate limit, malformed tool result, WebMCP absence, lease loss, ambiguous dispatch, and exhausted attempts show bounded Retry/failure states; no canned result or phantom revision appears. | 5/5 honest state and zero duplicate spend |

## 7. WebMCP ablation

With identical model/version, golden state, prompt, five seeds, and timing, compare:

1. v4.4 Ratiflow with the same fixed Luna model, managed bot and its company access, prompt,
   seed, and timing, where the browser dynamically discovers and executes the site capability catalog through native
   WebMCP; and
2. WebMCP disabled, where the document remains human-usable but the managed Relay has no
   discoverable or executable surface and must fail closed.

Report task detection, factual completeness, final digest, provenance completeness,
cross-contributor decision recovery, human copy/paste actions, mis-scoped writes,
conflicts, invalid/repeated calls, turns, and time. Do not preordain a win. Adapter or
direct API conditions are not the native ablation. If the result is not materially
better, narrow the claim or fix the surface.

## 8. Visual, rehearsal, and release gates

| ID | Required evidence |
|---|---|
| V01 Fresh visual review | After UI work, a fresh read-only design judge drives desktop and 390px; any BLOCK prevents presentation. |
| V02 Document primacy | Rendered postmortem/Product content is unmistakably primary; typography, tables/charts, comments, completed changes, provenance, and History are legible but quiet. |
| V03 First-time clarity | Without narration, a new evaluator can enter a nickname, choose either two-sheet demo, select any safe passage, leave a plain human comment or choose `@Data`, `@Code`, or `@General` and run it without a permission step, understand that Relay runs while the page is open, follow discovery/execution/revision in the Flight Recorder, and find History/Restore. Advanced BYOA does not obstruct the path. |
| V04 History clarity | The simple Git-like view makes r1-r5 authorship, prompts, context, rationale, evidence, diffs, and reversible Restore understandable without turning the document into a developer dashboard. |
| V05 Mobile/a11y | 390px flow, keyboard focus, autocomplete/drawer behavior, native editing controls, contrast, reduced motion, long untrusted content, chart data, and error states pass. |
| R01 Five rehearsals | Exact postmortem and Product heroes each pass five consecutive fresh runs without repair. |
| R02 Build and health | `.codex/verify.sh`, production build, local browser suite, and the controlled app-first/fail-closed rollout pass on the release SHA: app cutover, old-deployment/maintenance fence, stale/missing HTTP-contract rejection, zero-mutation old-store probe, zero active attempt/grant/permit check, approved transactional migration, four-argument claim rejection, database advisors, all-three fixed bot/access smoke, runtime reachability, release browser suite, and post-flow error scan. |
| R03 Native proof | Exact-SHA N01-N16 evidence is sanitized and eligible, including the v4.3 Relay-native and truth-label gates; adapter-only rows remain labeled. |
| R04 Demo | Public YouTube video is under three minutes, has audio, shows the working app, starts from nickname and document choice, lands one `@Code` postmortem run with company-configured Repository access and one `@Data` Product run with company-configured Metrics access, shows the clean blue→yellow→green document feedback and capability-catalog transition, then proves the exact revisions and History/Restore. |
| R05 Public package | Live URL remains accessible; public repository contains source/assets/setup/license; copy, video, deployment, manifest, and submission identify one SHA. |
| R06 HTML deck | The public `/deck` has 11 visually reviewed slides, clearly labeled rendered product visuals and/or exact-SHA screenshots, keyboard/mobile/print proof, a working live-app link, no secret or invented result, and an explicit application-owned Relay truth label. Any live-Luna or native-WebMCP label is backed by the matching exact-SHA evidence; rendered visuals never substitute for R03. |

The production URL currently serves the prior v4.2 persona-coupled build. The v4.3
capability-first migration, promotion, native observation, recaptured evidence, public
repository visibility, video upload, and Devpost submission remain separate pending
release actions.

## 9. Independent competition judges

Use the official [challenge criteria](https://webmcp.devpost.com/rules): WebMCP Leverage,
Execution, Potential Impact, and Creativity & Ambition, weighted equally. Judges may rely
on video/copy, so they receive the candidate site, exact evidence, submission text, and
video cut.

First run one fresh preliminary judge per criterion. Each returns score 0–5, cited
eligible evidence, a strongest gap, and `mustFix` containing one evidence-backed blocker
or null. Correct every non-null blocker, rerun affected gates, then use four new final
judges. Final results must have `mustFix: null`.

| Judge | A 5 requires | Final threshold |
|---|---|---|
| J01 WebMCP Leverage | Native top-level `toolchange/getTools/executeTool` materially exposes Luna's assignment-specific site capabilities and is necessary for actuation; the composed trace and ablation prove it while Ratiflow remains the grant/enforcement boundary. Adapter, server-only functions, or generic wrapper cap at 3. | 5.0/5 |
| J02 Execution | A first-time named user completes either guided mention; one bounded lineage lands one exact, reversible revision without duplicate spend; failures stay honest; desktop, 390px, and deck pass. Scripted or completed-example-only UI caps at 3. | ≥4.5/5 |
| J03 Potential Impact | A directory of humans and bots collaborates in two substantial decision records while every request, access grant, tool, source, change, and Restore remains inspectable. Generic AI-doc claims cap at 3. | ≥4.5/5 |
| J04 Creativity & Ambition | The document dynamically becomes Luna's tool runtime and durable organizational memory, with visible access-grant deltas independent of bot identity and Git-grade provenance—not a themed editor or rewrite button. | ≥4.5/5 |

Release requires every individual threshold, total ≥19/20, no unresolved BLOCK, and no
final must-fix. Scores cannot be published as credible before native, visual, demo, and
public-package evidence exists.

## 10. Results layout

```text
evals/
  goldens/repo-document-v4.1/
  goldens/repo-document-v4.2/
  protocol/repo-document-v4/
  browser/repo-document-v4/
  native/repo-document-v4/
  agent/repo-document-v4/
  ablation/repo-document-v4/
  judges/repo-document-v4/{preliminary,final}/
  release/repo-document-v4/
```

The compatibility namespace remains `v4`; every new manifest records product release
`v4.3` and protocol version `4`. `EVAL_RESULTS.md` is the human index. The machine-readable
manifest owns row status, artifact hashes, SHA identity, and remaining `PENDING` gates.
