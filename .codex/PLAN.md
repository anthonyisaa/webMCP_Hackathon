# Plan — Make the human-to-agent handoff obvious
_Updated: 2026-09-01T19:45:32+08:00_

## Goal and ambition mode

Correct the deployed v3 demo around the user-observed failure: a person should reopen
the same note as the same browser identity, understand exactly when their paired agent
is listening, and decide a proposal with one click. This is a **brownfield demo
correction**, not an account system, background agent host, notification service, CRDT,
or general workflow product. Preserve the exact-range assignment, paired-token
authorization, human-only document mutation, durable memory, and five-tool WebMCP
surface already proven on production.

## Chokepoint — freeze first

Freeze these three interaction contracts in `docs/contracts/editor-contract.md`,
`product_spec.md`, `EVALS.md`, and the exported constants/types in
`src/document/contracts.ts` before implementation:

1. **Agent inbox, honestly live:** all five scoped tools, including
   `submit_work_proposal`, register from page start; server ownership, work status, and
   revision checks remain authoritative. `wait_for_my_work` is the supported
   active-turn long-poll. It returns immediately for existing work and otherwise waits
   up to 20 seconds; after `TIMEOUT`, an agent should call it again while its turn
   remains active. A page cannot wake a model after the agent/browser turn ends. The
   Work rail says this plainly, shows **Connecting agent tools** while the complete
   five-tool catalog registers, then **Agent tools ready**, **Your paired agent is
   listening on this page**, **Your paired agent is preparing a proposal**, **Work
   waiting — ask your agent to check**, or **WebMCP unavailable**; offers **Check now**
   for an immediate authoritative page refresh; and offers one copyable and expandable
   listening prompt. Failed registration retries three times before the page asks for a
   reload. **Check now** never claims to start an external agent, and a listening state
   is never projected onto another collaborator's page.
2. **One-click decisions:** a proposal card defaults to `ask -> proposed change` with
   Accept and Reject enabled. Before/after diff, attribution, model summary, and an
   optional human decision note live behind **Details**. Decision input retains the
   exact `rationale` key but accepts either a nonblank 1–500-code-point human note or
   `null`; work and memory preserve that value without inventing human prose. A new
   additive migration loosens only this nullable field and replaces the decision RPC;
   the applied v3 migration remains untouched. The anti-loop golden still submits and
   later retrieves its exact optional rationale, while a separate gate proves the
   default no-note one-click path.
3. **Browser continuity, not accounts:** a versioned, credential-only v3 record
   (`shareToken`, both scoped bearers, session/member IDs, display name, expiry) and a
   last-note pointer persist in `localStorage`; cached surface/document/work/memory stay
   in tab-scoped `sessionStorage` and are always refreshed authoritatively on resume.
   Direct-link precedence is bootstrap fragment -> valid tab session -> valid browser
   credential -> fresh join. Reopening `/` resumes the last valid note; reloads and new
   tabs in the same browser reuse the same member/paired-agent identity. Successful
   migration from the old tab bundle writes the credential and pointer once. Expired,
   `UNAUTHORIZED`, or `NOT_FOUND` credentials are cleared; transient failures are not.
   Storage-blocked browsers retain the current tab-only fallback and say so, and a saved display
   name is used for a fresh join. **New note** remains explicit. Separate humans use
   separate browser profiles/surfaces.

## Streams

### C0 — Corrected contract freeze — pending
- Owner / worktree: coordinating task in the current checkout.
- Scope: every doc/spec/eval row, exported storage/rationale type and constant, exact
  agent prompt/tool wording, golden scenario, and public demo instruction affected by
  this correction.
- Verification: the frozen contracts contain no conditional-proposal dependency, fake
  rationale, cached-surface persistence, cross-page listening claim, or stale native
  catalog count.

### S1 — Browser continuity and resume — pending
- Owner / worktree: coordinating task in the current clean checkout.
- Scope and key files: `src/components/document/document-workspace-editor.tsx` and
  focused document browser tests only.
- Must not touch: applied migrations, legacy `/decision-demo`, WebMCP executor.
- Inputs / frozen contracts: the C0 browser-continuity contract above.
- Verification: reload and reopen `/` preserve share token, member ID, name, and work;
  invalid/expired state clears safely; `New note` still creates a distinct document.

### S2 — Agent listening affordance and reliable tool surface — pending
- Owner / worktree: isolated implementation worker after C0.
- Scope and key files: `src/webmcp/document-workspace-catalog.ts`,
  `src/webmcp/document-workspace-registration.ts`, bridge registration dependencies,
  and focused registration tests only.
- Must not touch: editor TSX/CSS, domain/API, storage, applied migrations.
- Inputs / frozen contracts: the C0 active-turn listening boundary.
- Verification: all five tools register immediately; catalog tells agents to list
  first, wait, repeat after timeout, read memory, and submit proposals only; schemas,
  cancellation, context teardown, and server authority stay frozen.

### S3 — Compact proposal, nullable decision note, and inbox UI — pending
- Owner / worktree: coordinating task after S1/S2.
- Scope and key files: v3 editor TSX/CSS, decision domain/adapter code, one additive
  Supabase migration, and focused unit/route/Playwright specs.
- Must not touch: the applied v3 migration or agent authority.
- Inputs / frozen contracts: S1 storage behavior and S2 catalog wording.
- Verification: two browser surfaces complete assign -> native wait -> proposal ->
  one-click accept with `null` rationale; optional details/note and anti-loop golden
  work; Check now refreshes; 390px rail is overflow-safe; WebMCP-off editing remains
  usable.

### S4 — Independent evaluation and deploy — pending
- Owner / worktree: coordinating task plus fresh read-only design judge.
- Scope: `.codex/verify.sh`, production build, exact hosted flow, desktop/mobile visual
  review, then additive migration, exact-SHA Vercel deployment, and native re-check.
- Verification: no BLOCK from visual judge; supported in-app Browser discovers tools,
  wait resolves from a human assignment, proposal submits, and one-click acceptance is
  visible in both sessions. Each official hackathon criterion gets a fresh critical
  judge after the flow is proven.

## Checkpoints

- If browser storage cannot safely resume an unexpired scoped session, retain the
  current session-only behavior and add a named profile only; do not invent accounts.
- If supported clients cannot sustain a repeated wait within one turn, keep Check now
  and the copyable prompt but remove every “listening” claim.
- If the nullable-decision migration cannot be applied and verified before code deploy,
  block deployment; never attribute generated fallback prose to a human.
- Any regression in paired authority, proposal-without-mutation, ordinary-browser
  editing, or native tool teardown blocks deployment.

## Integration order

`C0 -> (S1 || S2) -> S3 -> local verification -> dev-visual-review -> hosted native
verification -> criterion judges`. S1 and S3 overlap the editor and must remain
sequential. S2 is the only independent code stream. Reconcile and deploy one clean SHA;
do not create release evidence from synthetic adapter fixtures.

## Risks and open decisions

- Persisting scoped credentials in `localStorage` is a deliberate POC tradeoff. They
  remain high-entropy, same-origin, document-scoped, 24-hour expiring, and are deleted
  on authorization failure; cached document, work, and memory content is never stored
  there. A production account system would use a server-managed secure resume cookie.
- WebMCP registers and executes tools; it does not provide a scheduler that starts a
  dormant model. The demo must show the single explicit agent prompt before assignment.
- Reusing one identity across tabs means a two-human demo needs Chrome plus the in-app
  Browser, different browser profiles, or an incognito profile. This is clearer than
  silently manufacturing Guest 3/4/5.

---
# Archived release plan — Shared decision memory in one live document
_Updated: 2026-09-01T08:44:40+08:00_

## Goal and ambition mode

Ship one award-caliber WebMCP Challenge vertical slice before September 4, 2026
04:00 SGT: Maya and Jordan co-edit one calm decision memo; Jordan selects exact text
and assigns a work order to Maya; Maya's already-active paired agent waits on the page,
reads current content and durable memory, and submits a revision-bound proposal without
mutating the document; Jordan accepts or rejects it with human rationale; a fresh later
agent retrieves that rationale and avoids repeating a rejected idea.

This is a brownfield deadline correction, not a general word processor, CRDT, autonomous
agent host, chat product, account system, rich-text editor, or workflow engine. Preserve
the proven share/join, presence, autosave/conflict, Unicode anchoring/rebasing,
paired-token authorization, idempotency, cancellation, ordinary-browser fallback, and
the live activity/wait infrastructure already on `origin/main`. Remove the visible
stage machine, permanent annotation composer, creator-only queue, direct agent mutation,
and copied-prompt hero from the submission path. `/decision-demo` remains compatibility
evidence, not the document story.

## R0 — Reconcile the release baseline — blocking

Release authority is `origin/main@5957bb4`, which already tracks the shared document
and a production-proven live registry, activity hub, cursor contract, migrations, tests,
and native evidence. The current root is two commits behind and intentionally dirty.
Preserve every file byte while classifying each delta as **port**, **supersede**, or
**retain as compatibility**. Reuse, do not duplicate, the live activity/wait kernel.
Never edit an applied migration or `next-env.d.ts`.

The user's goal explicitly freezes the document-workspace pivot. C0 may run in this
preserved root only after a content inventory confirms the document implementation
matches the remote baseline and identifies every remote file the pivot must retain.
Feature implementation must use isolated ownership after C0. Before publication, branch
and index identity must be reconciled to an approved clean commit. No reset, merge,
commit, push, repository-visibility change, production promotion, video upload, or
Devpost submission is inferred.

## C0 — Atomic contract freeze

C0 supersedes every submission-facing product, native, agent, ablation, release-gate,
and proof-order section in `product_spec.md` and `EVALS.md`; rewrites
`docs/contracts/editor-contract.md` and `src/document/contracts.ts`; and freezes
`docs/contracts/document-hero-scenario.md`. Existing `hero-scenario.md` and
`live-agent-session-contract.md` remain decision-room compatibility authority. No
feature stream starts while a displaced file remains labelled **Frozen**.

The deterministic hero is: Maya's active agent waits; Jordan selects exact body text and
assigns it to Maya; the agent reads the document and memory, submits a proposal without
mutating the document; Jordan accepts or rejects it with rationale; a fresh agent later
recovers a rationale or rejected fact no longer inferable from current text. S5 captures
this exact fixture; it never invents an optional scenario.

### Human interaction

The default surface is a plain title/body document with a compact top bar, presence, and
a quiet **Work | Memory** margin. The four-stage control and stage-generated work are
absent. Stored v2 stage data may remain for rollback but never gates v3 behavior or
appears in the v3 WebMCP contract.

A non-empty title/body selection exposes one compact **Ask agent** affordance. Only an
unmodified pointer-origin right-click on that selection calls `preventDefault` and
opens **Rewrite**, **Research**, and **Assign…**. Track the preceding secondary-button
pointer event instead of guessing keyboard origin from coordinates. Shift+pointer-right-
click, the Context Menu key, Shift+F10, empty selection, and non-editor targets stay
native; `spellCheck` remains enabled and the UI says “Hold Shift for spelling menu.”
Cmd/Ctrl+K is the keyboard-equivalent app action. Rewrite and Research prefill the same
composer; no work order exists until the human confirms instruction and assignee.

### Work and authority

A work order stores exact title/body range anchors; immutable `creatorMemberId` and
`assignedToMemberId`; display-name snapshots; instruction/intent; creation and live
anchor revisions; proposal fields; and timestamps. Human creation explicitly supplies
`assignedToMemberId`. The server validates current workspace membership and non-expired
presence when assigning. Presence remains an advisory UI projection; later inactivity
does not revoke existing work before session expiry.

All members may view work. Only the creator may cancel, accept, or reject it. Only the
paired agent whose member identity is derived server-side from authenticated execution
context may list or submit it. WebMCP never creates, reassigns, accepts, or rejects work.

Lifecycle is:

- `PENDING -> PROPOSED | CANCELLED | STALE`
- `PROPOSED -> COMPLETED | REJECTED | STALE`

`submit_work_proposal` stores a bounded candidate replacement and untrusted model
summary; it never mutates document content. Accept/reject requires
`{ workOrderId, expectedRevision, requestId, rationale }`. Acceptance atomically
revalidates the stored anchor, applies the stored proposal, completes the work, and
attributes proposer plus accepter. Human rationale is authoritative. Every transition
locks the document first and is idempotent. Freeze exact request/result schemas, bounds,
errors, replay behavior, revision races, and `ASSIGNEE_UNAVAILABLE`. Non-overlapping
anchors rebase; overlapping ones become stale.

### Activity and decision memory

Every successful content/work transaction locks the document first, increments server-
owned `activityVersion` exactly once, and appends exactly one event. Content-changing
transactions also increment document `revision` exactly once. Acceptance changes the
document and work status in the same transaction/event. Reads, presence, timeout, abort,
no-op, and idempotent replay advance neither counter. Higher `activityVersion` is
authoritative for work/memory; presence merges independently.

Event kinds are `DOCUMENT_EDITED`, `WORK_CREATED`, `PROPOSAL_SUBMITTED`,
`PROPOSAL_ACCEPTED`, `PROPOSAL_REJECTED`, `WORK_CANCELLED`, and `WORK_STALE`.
Events contain server-derived actor/origin, base/result revision, linked work IDs,
changed fields, bounded shared-document/instruction/proposal excerpts, server-computed
diff, human rationale where applicable, and timestamp. They never contain external
browser context, credentials, bearer or membership handles, or unrelated private data.
P0 memory is this server-derived projection; there is no arbitrary memory writer.

### Exact WebMCP surface

- `inspect_document({})`: current content, revision, activity version, collaborators.
- `read_document_memory({ beforeActivityVersion?, limit? })`: bounded ascending window
  with `hasMoreOlder`, `nextBeforeActivityVersion`, and `latestActivityVersion`.
- `list_my_work({})`: oldest pending work assigned to this paired human's agent; process
  every returned order with exactly one discrete proposal unless the user limits scope.
- `wait_for_my_work({ afterActivityVersion, afterRevision, timeoutSeconds? })`: default
  and hard cap 20 seconds. Authoritative fetch, subscribe, then refetch closes lost wake.
  Return immediately as `WORK_AVAILABLE`; return `DOCUMENT_CHANGED` only when revision
  advanced; ignore unrelated activity while advancing the internal cursor; otherwise
  return `TIMEOUT` with current counters. Every wake refetches. Execution/registration/
  route/session abort throws `AbortError` and removes timers/listeners; selection
  changes do not cancel. Duplicate waits return `WAIT_ALREADY_ACTIVE`.
- Conditional `submit_work_proposal({ workOrderId, expectedRevision, replacementText,
  changeSummary })`: call once per pending order being processed; stores a review
  proposal only while the paired agent owns pending work; request IDs are
  callback-generated.

All tool inputs reject additional properties and never accept document, member, actor,
origin, assignee, range, stage, acceptance, or decision fields. Freeze exact descriptions,
bounds, result envelopes, errors, annotations, and service methods. All results are
JSON-serializable and mark human/agent-authored content untrusted. A cancelled remote
write may already have committed, so the agent must re-inspect.

## Streams and ownership

### S1 — Local domain and API behavior
- Owner: one implementation worker after C0.
- Files: `src/domain/document-service.ts`, focused tests, every frozen v3 document API
  route, and
  `src/document/surface-reconciliation*`.
- Scope: assignment, proposal/decision authority, event projection, counters, rebasing,
  races, replay, and human-only acceptance.
- Gate: cross-pair denial; proposal without mutation; creator-only accept/reject;
  accept/reject races; equal-revision activity; pagination; nearby/overlap anchors.

### S2 — Additive Supabase v3 persistence
- Owner: a separate worker after S1's frozen façade.
- Files: one CLI-created additive migration, `src/domain/supabase/document-*`, tests.
- Scope: start from the complete `origin/main` migration chain. Existing rows default
  to protocol v2; new document-workspace rows use v3. Legacy apply RPCs reject v3; new
  proposal RPCs reject v2. Apply and smoke v2, deploy/verify v3 preview, promote the same
  SHA, then consider privilege cleanup while preserving scoped v2 rollback.
- Gate: both protocol paths, grants/revokes/RLS, document-first locks, migration identity,
  isolated smoke, security and performance advisors.

### S3 — WebMCP live-work lifecycle
- Owner: a separate worker after S1's frozen façade.
- Files: `src/webmcp/document-*`, `DocumentWebMCPBridge.tsx`, focused tests.
- Scope: reuse the remote activity hub/registration pattern; exact five-tool catalog,
  authoritative refresh, assignee filtering, conditional proposal capability, internal
  IDs, lost-wake closure, stable cancellation, route cleanup.
- Gate: immediate work, event wait, timeout, abort, duplicate wait, unrelated activity,
  document change, selection stability, teardown, stale session, JSON, navigation.

### S4 — Contextual editor and memory margin
- Owner: coordinating task after S1/S3 contracts compile.
- Files: document editor/CSS, work-memory/context components, HTTP adapter, exact v3
  route consumers, and document e2e specs. S4 does not own or reopen route handlers.
- Gate: two isolated humans complete assign -> proposal -> accept/reject; exact context-
  menu branches; keyboard and 390px flows; WebMCP-off editing; no overflow; fresh
  `$dev-visual-review` returns no BLOCK.

### S5a — Fixture, story, and rehearsal
- Owner: coordinator after S1–S4.
- Scope: deterministic Northstar memo, reset seam if safe, submission copy, script, and
  evidence manifest. First native action <=45 seconds; rehearsal <=2:40.
- Gate: five clean local/preview adapter rehearsals as preflight; every planned claim
  names exact evidence. Adapter runs never close R01, which requires five canonical
  native rehearsals on the exact release.

### S5b — Post-deploy native capture
- Owner: coordinator after exact-SHA preview and release identity pass.
- Gate: native discovery and invocation of all document tools; wait resolves from a
  human event; another human sees proposal without content mutation; acceptance changes
  both sessions; fresh agent recovers human rationale from memory; navigation removes
  tools. Adapter Playwright does not satisfy this proof.

## Integration and release gates

Order: `R0 -> C0 -> S1 -> (S2 || S3) -> S4 -> S5a -> preview -> S5b -> judges`.

1. Run the supported-client wait spike immediately after C0; kill only the wait tool and
   listening claim if native behavior fails.
2. Run focused tests and `.codex/verify.sh`, production build, preview DB/app rollout,
   driven browser flow, and `dev-visual-review`.
3. Reconcile to an approved clean commit; deployment, canonical alias, public repository,
   evidence manifest, and license must name the same SHA.
4. Promote that exact SHA, capture native evidence, then run one independent judge for
   each official criterion. Every judge returns 0–5, evidence, strongest gap, and one
   must-fix. Release requires WebMCP Leverage 5/5, every criterion >=4.5, total >=19/20.
5. Repository visibility, video upload, and Devpost submission remain explicit
   user-owned actions.

EVALS must cover cross-assignment; no-mutation proposal; creator authority; decision
races; equal-revision reconciliation; server diff plus human rationale; pagination;
lost-wake/timeout/abort/teardown; every context-menu branch; WebMCP-off fallback; and
fresh-agent recovery of a rationale absent from current text.

Hard cut lines (SGT):

- R0 + C0: September 2 04:00
- S1: September 2 22:00
- S2/S3/S4 preview: September 3 10:00
- Code freeze: September 3 16:00
- Deploy/native capture: September 3 20:00
- User-owned public repo, video, submission: September 4 00:00

If R0/C0 misses its gate, retain the proven decision-room release. Any failure of paired
identity, human-only acceptance, activity ordering, memory truth, native wait, exact-SHA
identity, public accessibility, or the score threshold blocks the document release.

## Residual risks

- Plain textarea ranges limit rich inline decoration; the contextual palette and margin
  carry collaboration while preserving the proven anchor model.
- A cancelled Supabase request may commit; idempotency and re-inspection make the result
  safe, not transactional cancellation.
- The database must retain scoped v2 rollback behavior until the v3 release is proven.
- The canonical URL currently serves the old decision launch; never change it before
  exact-SHA preview, migration compatibility, and user authorization.

---
# Archived prior plan — Make annotation-to-agent work obvious
_Updated: 2026-08-31T22:13:57+08:00_

## Goal and ambition mode

Correct the shared editor around one legible loop: people write in a pageless document,
attach multiple instructions to exact text from a persistent right rail, and point each
person's paired browser agent at that person's queue. Humans alone move the four stages;
each forward stage move atomically adds a document-preparation annotation for the human
who moved it. Preserve native browser spelling/dictionary menus and the frozen
`/decision-demo` surface.

Ambition mode is **brownfield product correction**. This is not autonomous agent
hosting, a comment system, account ownership, rich text, CRDT collaboration, or a
workflow engine. WebMCP still runs only during an agent turn. The page therefore offers
an honest **Ask ChatGPT** handoff that copies a precise request; it never claims to have
started, queued, or notified an external model.

## Chokepoint — freeze first

Freeze `docs/contracts/editor-contract.md`, `src/document/contracts.ts`, and the
shared-document sections in `product_spec.md` and `EVALS.md` before feature streams.

The human surface exposes `annotations`, ordered oldest first, instead of one global
`pendingAction`. It includes every active annotation plus bounded recent history. Each
annotation records its server-derived creator, immutable creation revision/stage,
current anchor revision, instruction, exact target, and one of `PENDING`, `COMPLETED`,
`CANCELLED`, or `STALE`. Creation appends; it never supersedes another annotation.

Paired human and agent tokens share a server-derived member ID. Humans see the whole
collaborative queue, but an agent may list and apply only annotations created by its
paired human; a human may cancel only their own annotation. Losing the anonymous browser
session creates a new member and does not transfer ownership.

Anchors use safe deterministic rebasing. After a content edit, a whole-field document
target rebinds to the latest complete field; non-overlapping selection/caret targets
before the changed span remain fixed; targets after it shift by the Unicode code-point
delta; overlapping or ambiguous targets become visibly `STALE`. Every surviving target
adopts the new anchor revision. This rule applies to human saves and agent edits, so one
queued edit does not silently strand unrelated annotations.

The document page exposes exactly:

- `inspect_document({})` — authoritative document and active collaborators.
- `list_agent_annotations({})` — this paired human's pending annotations, oldest first;
  an exact empty list is a successful result.
- `apply_agent_annotation({ annotationId, expectedRevision, requestId,
  replacementText, changeSummary })` — replaces only the server-captured target and
  completes that annotation. It is registered only while this paired human owns a
  pending annotation.

The stage enum remains exactly `BRAINSTORMING`, `RESEARCHING`, `REFINE`, and
`READY_TO_SHIP`, and no agent input accepts stage. A successful forward move adds one
body-document annotation after the stage revision: prepare a research brief when
entering Researching, shape a coherent evidence-faithful draft when entering Refine,
or perform unsupported-claim-safe final polish when entering Ready to ship. A backward
move adds none. Existing annotations survive a stage-only change and adopt its revision.

The desktop surface is continuous rather than paper-on-canvas: compact top bar, centered
writing column, and a 340px right rail. The rail owns target preview, annotation composer,
ordered queue/history, and the Ask ChatGPT handoff. `Cmd/Ctrl+K` focuses that composer.
Mouse right-click, Context Menu, and `Shift+F10` are never prevented, preserving native
dictionary/spelling behavior. On small screens the rail becomes an accessible drawer.

## Streams

### C0 — Queue and interaction contract — completed
- Owner / checkout: coordinating task; preserve the dirty verified baseline.
- Scope: this plan, editor contract, checked façade, shared-document product/eval text.
- Must not touch: implementation or historical decision evidence.
- Verification: fresh read-only adversarial review finds no ambiguity in ownership,
  ordering, rebasing, retention, stage authority, agent invocation, or responsive input.

### S1 — Local domain and HTTP behavior — completed
- Owner / files: worker owns `src/domain/document-service.ts`, its focused tests, and
  `src/app/api/document/`; it imports but does not edit the frozen façade.
- Scope: append/list/cancel/apply semantics, per-creator authorization, content-diff
  rebasing, atomic forward-stage annotation, replay safety, and current single-edit undo.
- Must not touch: Supabase, visual components, WebMCP files, or decision code.
- Verification: two creators and paired agents; multiple same-revision annotations;
  before/after/overlap/document/emoji rebases; stage forward/backward/no-op; stale and
  replay safety; creator-spoof and cross-member rejection.

### S2 — Additive Supabase migration and adapter — completed and deployed
- Owner / files: worker owns one CLI-created additive migration plus
  `src/domain/supabase/document-*` and focused tests.
- Scope: drop only the singleton partial index, deterministic queue index, versioned
  queue-aware surface/RPC behavior, ownership predicates, rebasing under row locks,
  explicit RLS/revokes/grants, and zero-downtime compatibility where practical.
- Must not touch: the applied `20260831022122` migration, components, or WebMCP.
- Verification: migration identity reconciled first; static SQL assertions, adapter
  shape tests, isolated RPC smoke, and Supabase security/performance advisors.

### S3 — WebMCP queue lifecycle — completed
- Owner / files: worker owns `src/webmcp/document-*`,
  `src/components/document/DocumentWebMCPBridge.tsx`, and focused tests.
- Scope: exact catalog above, own-queue filtering, live-ref callbacks, authoritative
  refresh after each application, structured stale/empty results, cancellation, and
  AbortSignal cleanup. No polling tool or fake page-to-agent dispatch.
- Must not touch: domain/API, CSS/editor markup, decision catalog, or Supabase.
- Verification: multiple registrations, empty queue, per-owner visibility, sequential
  edits with callback freshness, stale rejection, route cleanup, and serializable output.

### S4 — Pageless editor and annotation rail — completed
- Owner / files: worker owns `src/components/document/document-editor.tsx`, its CSS
  Module, browser HTTP adapter, and document browser tests.
- Scope: continuous editor layout, persistent rail/drawer, selection snapshot and target
  preview, custom/preset annotation creation, queue/history cards, own-item cancellation,
  honest copied Ask ChatGPT request, forward-stage feedback, native context menus,
  keyboard access, collaboration/conflict/undo preservation, and responsive behavior.
- Must not touch: server domain, Supabase, decision UI, or global CSS unless required.
- Verification: desktop and 390px flows cover multi-annotation queue, reload, two-human
  visibility, native contextmenu not cancelled, Cmd/Ctrl+K, stage-generated annotation,
  WebMCP application/undo, conflict recovery, and WebMCP-off fallback.

### I0 — Integration, release evidence, and handoff — production deployed and verified
- Owner: coordinating task after S1–S4.
- Scope: resolve contract seams, refresh docs/evals, apply the additive remote migration
  only after local gates, deploy, and refresh durable handoff.
- Verification: focused suites, `.codex/verify.sh`, `pnpm build`, both document and
  `/decision-demo` browser flows, supported-surface native WebMCP evidence, production
  error scan, and `$dev-visual-review` with no BLOCK.
- Local evidence: the final repository gate passed 122/122 tests; the production build
  passed; the document browser suite passed 9/9 and the ordinary `/decision-demo`
  regressions passed 7/7. A final independent integration audit returned PASS.
- Release evidence: Supabase project `klhedesewgixoeslxiti` applied remote migration
  `20260831135755 document_annotation_queue`; production deployment
  `dpl_DvXiq26VoZCNyuKjF2GzNSFcoaRx` is READY at the canonical URL. Hosted document
  flows passed 9/9 and ordinary regressions passed 7/7; the new deployment produced no
  warning/error/fatal logs or 5xx responses after test traffic. The supported in-app
  surface advertised the two read tools and dynamically added/removed
  `apply_agent_annotation` with queue state. A fresh agent-side tool execution is still
  worth recording. The configured fresh `design-judge` role was unavailable on two
  attempts; no implementation agent was substituted as evaluator.

## Checkpoints

- A second annotation replaces or invisibly invalidates the first -> block UI polish and
  fix queue/rebase semantics.
- An agent can inspect/apply another human's annotation, or any agent can change stage ->
  block release.
- A forward stage mutation succeeds without its preparation annotation in the same
  transaction -> block release; do not bolt it on client-side.
- Ask ChatGPT says sent, running, or connected without observed invocation -> block
  release and restore the copied manual handoff.
- A selected-text right-click or keyboard context-menu event is cancelled -> block
  release; agent annotation remains rail/Cmd-K initiated.
- Two dirty windows silently overwrite each other -> preserve the existing explicit
  conflict choice.
- Route navigation mixes document tools with `/decision-demo` tools -> block release.
- Existing applied migration history cannot be reconciled -> stop before remote DDL;
  local UI/domain work may continue.

## Integration order

1. Freeze C0 and obtain a fresh adversarial review.
2. Run S1, S2, S3, and S4 with disjoint ownership against the frozen façade.
3. Integrate local domain + WebMCP + UI, then the Supabase adapter/migration.
4. Run focused unit/protocol tests, the fast gate, build, and driven local browser flows.
5. Run independent visual review, fix blockers, then apply/deploy and repeat hosted flows.
6. Refresh `.codex/PROGRESS.md` with exact evidence and remaining release risk.

Conflict hotspots are `src/document/contracts.ts`, `DocumentSurface`, WebMCP bridge
props, the document editor, and document e2e fixtures. The coordinator resolves these;
workers must not edit outside their named ownership or revert another worker's changes.

## Risks and open decisions

- “Persistent” means for the life of the current anonymous document (24 hours in the
  deployed store), not durable account history.
- The right rail is an instruction queue, not line-rendered comment pins; `<textarea>`
  range geometry remains intentionally out of scope.
- A full-document annotation deliberately follows the latest full field; an overlapping
  exact selection becomes stale rather than guessing.
- Only the latest applied agent edit retains the existing safe single-step Undo.
- Native WebMCP support varies. The human editor and visible copied request remain usable
  without it; a future direct-send integration requires a separately observed API.
- The deployed source is currently uncommitted. Preserve it throughout this correction;
  source-control publication remains a separate explicit action.

---

# Archived prior plan — Build and submit Ratiflow to the WebMCP Challenge
_Archived: 2026-08-31T09:53:24+08:00. Retained for history; the active plan above supersedes it._

## Goal and ambition mode

Ship a public, deployed, end-to-end product that can credibly place in the top ten by
making WebMCP—not an ordinary API—the visible coordination mechanism between a product
lead, an engineering lead, and an agent. The canonical demo is one launch-scope
decision with real-time collaboration, page-local selection scoping, dynamic tool
registration, optimistic-concurrency recovery, human-only ratification through the UI,
one downstream consequence, and inspectable provenance.

Ambition mode is **greenfield, deadline-disciplined expansion**. We will build a
polished vertical slice and evidence for all four judging criteria. Accounts, generic
workflow engines, blank-workspace setup, three-word sharing, broad team management,
cross-agent orchestration, and a reusable package are out of P0 unless the complete
deployed hero flow is already reliable.

This P0 reduction becomes authoritative only when `product_spec.md` and `EVALS.md` are
rewritten at the contract chokepoint. Until that rewrite lands, no product code starts.
The rewrite explicitly removes v1.1 stories H1, H2, H10, A9, the S0 brain-dump flow,
three-word bearer access, and reusable-package/conformance claims. The pure compiler
remains a first-class application module with a stable boundary; packaging it is P1.

Public hackathon name: **Ratiflow — WebMCP collaboration workspace**. Positioning:
“Agents prepare. People ratify. Work moves.” A live collision screen found no exact
product conflict; the qualifier distinguishes the name from the unrelated RatioFlow.

## Chokepoint — freeze first

Before parallel product implementation, freeze one executable contract across these
owned files:

- `product_spec.md`: v1.2 hero scenario, exact workflow states, exact tool matrix,
  authority claims, scope, and acceptance criteria.
- `EVALS.md`: independent oracles and three evidence layers (domain/protocol, native
  browser, agent trajectories).
- `docs/contracts/hero-scenario.md`: all seed entities, numeric facts, collaborator
  action, stale-write beat, ratified decision, downstream effect, and golden answers.
- `docs/contracts/capability-contract.md`: canonical state/selection/revision types,
  exact stable tool definitions, registration lifecycle, mutation envelope, result
  envelope, and error codes.
- `src/contracts/index.ts`: contract-faithful TypeScript façade types and fixture ports
  that let domain, compiler, UI, and eval scaffolding proceed independently.
- `VALIDATION.md`: dated observations from the deployed native WebMCP probe.

The contract owner is the coordinating task. No implementation stream may invent a
tool name, state, schema, seed fact, actor boundary, or error shape outside these files.

The frozen universal write envelope is:

`{ expectedWorkspaceRevision, contextEpoch, requestId, rationale, payload }`

Workspace membership is derived from the signed session; page-local selection and its
target are captured by the registered callback and checked against `contextEpoch`.
Server routes assign event origin. Model-supplied actor/origin values are never trusted.

The frozen result family is JSON-serializable and always includes `ok`,
`currentWorkspaceRevision`, `contextEpoch`, and `currentCapabilities`. Callbacks that
reach page code return typed recoverable errors. We do not promise an app-defined error
when a native client rejects a removed tool before dispatch.

## Streams

### G0 — Repository foundation and native validation probe — completed
- Owner / worktree: coordinating task in the root checkout until the first base commit.
- Scope and key files: repository initialization/linking, `AGENTS.md`, `.codex/verify.sh`,
  minimal Next.js shell, one-page WebMCP probe, `VALIDATION.md`, first Vercel preview.
- Must not touch: product domain schema, polished product UI, final tool catalog.
- Inputs / frozen contracts: current WebMCP draft and official surface documentation.
- Verification: deployed HTTPS page is reachable; `document.modelContext` discovery,
  registration/AbortSignal removal, `toolchange`, JSON result, cancellation, and error
  rendering are observed on every available judging surface and recorded with browser,
  client, URL, and date.

### C0 — Product and interface contract freeze — completed
- Owner / worktree: coordinating task in the root checkout; serial dependency on G0.
- Scope and key files: every chokepoint file listed above, final P0 cuts, exact name
  replacement, judge-surface evidence matrix, domain/service façade signatures, and
  independently authored goldens.
- Must not touch: feature implementation beyond contract/type stubs.
- Inputs / frozen contracts: G0 observations, official rules/spec evidence, reviewed
  v1.1 critique, and the approved two-person hero journey.
- Verification: docs contain no old P0 contradictions or placeholders; exact state/tool
  matrix and seed facts each have one definition; `tsc --noEmit` accepts the façade; an
  adversarial reviewer finds no unresolved ownership or schema collision.

### S1 — Domain, persistence, and collaboration — completed (Free US project live and RPC-smoked)
- Owner / worktree: worker with ownership of `supabase/`, `src/domain/`, and
  `src/app/api/` only; Codex-managed isolated worktree after the C0 base commit.
- Scope and key files: typed seed clone, compare-and-swap mutations, idempotency,
  append-only events, isolated demo-session membership, two attributed participants,
  properly authorized realtime updates, and a UI-only ratification route. Demo access
  uses opaque high-entropy membership handles, not three-word bearer codes.
- Must not touch: WebMCP adapter/compiler, visual components, eval runner.
- Inputs / frozen contracts: hero scenario and capability/result types.
- Verification: database tests prove atomic revision checks, exact changes since a base
  revision, idempotent retry, cross-workspace rejection, server-assigned origin, and one
  realtime collaborator update. Direct WebMCP/agent routes cannot create an accepted
  commitment; the claim does not extend to an arbitrary same-session browser attacker.

### S2 — Capability compiler and WebMCP lifecycle — completed locally
- Owner / worktree: worker with ownership of `src/capabilities/`, `src/webmcp/`, and
  `src/components/system/WebMCPBridge.tsx` plus focused tests only; Codex-managed
  isolated worktree after the C0 base commit.
- Scope and key files: exact state/selection compiler, stable catalog, top-level
  imperative registration, AbortController lifecycle, context epoch, callback
  revalidation, feature detection, and structured result normalization.
- Must not touch: database migrations, app visual components, demo copy.
- Inputs / frozen contracts: capability contract plus `VALIDATION.md` findings.
- Verification: independent golden fixtures prove each state and selection tool set;
  adapter tests prove precise add/remove diffs, cancellation, serializable results, and
  callback-level stale/selection recovery.

### S3 — Product experience and visual system — completed; visual and native recording reviews passed
- Owner / worktree: worker with ownership of `src/app/` pages and `src/components/`
  only, excluding API routes and `src/components/system/WebMCPBridge.tsx`;
  Codex-managed isolated worktree after the C0 base commit.
- Scope and key files: one-click isolated seed, primary decision workspace, second-person
  window, capability field/panel, option/evidence surface, stale reconciliation card,
  human review/ratification, downstream item, and provenance ribbon.
- Must not touch: canonical schemas, server business rules, WebMCP definitions.
- Inputs / frozen contracts: scenario fixture, typed service façade, compiled
  capabilities. Initial work uses the frozen fixture/service ports, so static UI work is
  parallel with S1 and S2 rather than waiting for their implementations.
- Verification: ordinary UI completes the hero flow without WebMCP; two separate
  attributed sessions show realtime change; responsive desktop layout passes keyboard,
  contrast, empty/loading/error checks; final UI is graded through `dev-visual-review`.

### S4 — Evals and reliability evidence — completed (56 protocol, 35/35 agent, 30/30 ablation, 20/20 rehearsal)
- Owner / worktree: worker with ownership of `evals/`, `vitest.config.ts`,
  `playwright.config.ts`, and `EVAL_RESULTS.md`; Codex-managed isolated worktree after
  the C0 base commit. The coordinator alone merges root `package.json` script changes.
- Scope and key files: independent domain/protocol oracle, native browser smoke using
  the official `webmcp-evals` tooling where compatible, agent trajectories, static-all-
  tools/no-WebMCP ablation, sanitized transcripts, five-run reliability evidence.
- Must not touch: production behavior or schemas; failures return to their owning stream.
- Inputs / frozen contracts: scenario and capability contract for immediate fixture and
  runner work; browser and agent executions depend on the stable integrated preview.
- Verification: protocol suite 100%; native smoke proves browser discovery rather than
  adapter-only behavior; every v1.2 agent scenario has five committed sanitized runs;
  zero safety-gate failures; every hero trajectory succeeds at least 4/5 before polish
  and the complete release flow succeeds 5/5 before submission.

### S5 — Demo, submission, and release evidence — in progress (public repo and user-owned video remain)
- Owner / worktree: coordinating task owns `demo/`, `README.md`, public submission copy,
  release checklist, screenshots/transcripts, and final deployment evidence.
- Scope and key files: running shot/evidence list, sub-2:59 script, demo reset procedure,
  Devpost four-answer copy, OSS/license/readme quality, exact judging setup instructions.
- Must not touch: product behavior to manufacture a cleaner recording.
- Inputs / frozen contracts: verified deployed product and committed eval results.
- Verification: first 10–15 seconds show a working product; every claim maps to a visible
  shot or committed artifact; clean judge session completes five times; public repo,
  public YouTube URL, live URL, license, and all Devpost fields are checked before freeze.

### I0 — Page integration and production deployment — completed (Supabase + Vercel US release live)
- Owner / worktree: coordinating task in the integration checkout after S1–S3 land.
- Scope and key files: root configuration/scripts, `src/app/layout.tsx`, the workspace
  page mount for `WebMCPBridge`, service wiring, environment bindings, migrations, and
  Vercel production promotion.
- Must not touch: frozen schemas or product behavior without returning the issue to the
  owning stream and recording the contract change.
- Inputs / frozen contracts: verified S1 façade implementation, S2 bridge/compiler, S3
  page extension point.
- Verification: a real top-level page mounts one bridge; panel and effective registry
  consume the same compiled value; ordinary UI and native WebMCP both mutate the same
  persisted workspace; two-window stale recovery and ratification complete end to end.

## Checkpoints

- Native tool discovery fails on ChatGPT and Chrome -> stop product work and resolve or
  rescope before investing in UI.
- Removed-tool behavior bypasses page callbacks -> retain callback revalidation but
  remove the universal `NOT_AVAILABLE_IN_STATE` claim.
- Two-person realtime adds nondeterminism after one focused repair pass -> keep a real
  second browser session for the video; it may be operated by a person or a clearly
  labeled deterministic synthetic driver using the same UI/service path, never a timer
  or single-window mock.
- The exact hero flow cannot complete 4/5 by 2026-09-02 SGT -> cut secondary screens,
  setup, and non-hero tools; do not cut native discovery, dynamic capability diff,
  stale recovery, ratification, or downstream propagation.
- Clean UI cannot explain the capability change without narration -> rescope visual
  chrome around the capability field before adding features.
- By release, GitHub is not public, deployment is not unrestricted, or license is not
  visible -> submission is blocked.

### Dated gates (SGT)

- 2026-08-30 23:59 — repository baseline, fast gate, and HTTPS probe deployed.
- 2026-08-31 06:00 — native observations recorded; C0 contracts and final public name
  frozen; base commit ready for managed worktrees.
- 2026-09-01 06:00 — S1–S3 integrated once; real two-window hero flow works manually.
- 2026-09-01 18:00 — deterministic suite green; unsupported connected Chrome surface recorded honestly.
- 2026-09-02 12:00 — all v1.2 agent and ablation runs complete; visual review corrections landed.
- 2026-09-03 00:00 — release candidate deployed; README/submission/video script final.
- 2026-09-03 12:00 — submission-ready freeze; remaining time is rehearsal/upload only.

## Integration order

1. Commit the planning/docs baseline and repository harness.
2. Deploy G0 probe; update `VALIDATION.md`; complete C0 and commit the frozen façade.
3. Create Codex-managed worktrees. S1, S2, static S3, and S4 fixture/runner scaffolding
   proceed concurrently against the frozen façade.
4. Integrate S1, S2, and S3 through I0; then give S4 the stable deployed preview.
5. Run S4 protocol/browser/agent evidence; fixes go back to their owning stream.
6. Run independent visual review, complete S5, deploy production, and execute a clean
   five-run release rehearsal.
7. Make GitHub public, confirm the license/repo About metadata, submit, and freeze the
   submitted repo/site through judging.

Conflict hotspots: shared types, seed fixture, app layout, and package scripts. The
coordinator alone edits shared contracts, root configuration, and the integration mount
after parallel work starts. UI and eval workers consume the frozen domain façade rather
than reaching into tables. Parallel code streams are blocked until the C0 base commit
and their managed worktrees exist.

## Coordination protocol

- One goal per agent turn. Each brief names owned files, forbidden files, frozen inputs,
  and an observable completion check.
- Agents read this plan plus only their stream contracts; they do not need the entire
  conversation or all research notes.
- Requirement and integration decisions remain with the coordinating task.
- Every landed stream returns changed files, verification output, and residual risk.
- `.codex/PROGRESS.md` is refreshed at meaningful handoffs; this plan tracks stream
  status rather than duplicating narrative history.

## Risks and open decisions

- GitHub `anthonyisaa/webMCP_Hackathon` is linked and the reviewed baseline is pushed.
  It remains private during build; public visibility is a release gate.
- The competition deadline is 2026-09-04 04:00 SGT. Target a submission-ready freeze by
  2026-09-03 12:00 SGT, leaving sixteen hours for judge-surface rehearsal and upload.
- Ratiflow is frozen for the hackathon with the public qualifier “WebMCP collaboration
  workspace.” Commercial use would require a separate trademark clearance.
- `https://ratiflow-webmcp.vercel.app` now serves the persistent release candidate from
  Vercel Functions in `iad1`. It uses project `ratiflow-webmcp` in the separate Supabase
  Free organization `Ratiflow`, with the database in `us-east-1` so the US judging path
  and persistence stay colocated.
- Release evidence is green for 56 protocol tests across 11 files, the optimized production build,
  the deployed Maya/Jordan two-window path, and the deployed 390px accessibility smoke.
  A direct HTTPS Data API smoke also completed the real Supabase rev 7→11 journey with
  exact stale recovery and downstream propagation. `eval:rehearse` is 20/20 deterministic
  checks, native N01–N11 release capture is recorded, all 35 dynamic agent runs pass,
  and the matched 30-run ablation validates the dynamic-capability claim.
- GitHub remains private during implementation. Public visibility, GitHub About license
  detection, and the live URL are disqualifying release gates, not optional polish.
- Human-only means: no WebMCP tool or agent-specific endpoint can ratify. It is not a
  claim that an arbitrary browser-driving agent or same-session attacker cannot click or
  imitate the human UI route.
