# Plan — Harden the flagship and make its proof teachable
_Updated: 2026-09-03T09:53:46+08:00_

## Goal and ambition mode

Finish Ratiflow as a brownfield, judge-ready v4.2 release: remove the two failure states
observed in fresh production rehearsals, make the 12-slide deck explain the actual
role/run and per-turn capability boundaries, add a sourced WebMCP 10×/100× future slide,
and leave a sanitized screenshot pack plus an exact live-recording runbook. The user will
record and narrate the final video; producing or editing video is explicitly out of scope.
Do not change the database schema, protocol version, managed-agent authority model, or
claim autonomous tool choice.

## Chokepoint — freeze first

Freeze one shared judge-story and release contract before implementation:

1. **Two capability gates, stated exactly.** WebMCP changes the live browser catalog from
   idle tools to one run- and role-scoped catalog for `@Code`, `@Data`, or `@General`, then
   restores idle tools. The server separately exposes and pins exactly one discovered
   function on each Luna continuation. The deck may say “the right agent gets the right
   capability at the right moment,” but may not imply that WebMCP itself republishes a
   different catalog every model turn or that Luna chooses the workflow.
2. **Defensible product claim.** Luna composes strict arguments inside a server-enforced
   sequence; the browser discovers and executes the live WebMCP capabilities; server-side
   anchors, revisions, permits, and business rules enforce authority.
3. **Reliability exit bar.** Presence heartbeat failures are contained and never become
   uncaught page errors. `Retry once` is visible only while the run is actually waiting
   and is hidden/disabled as soon as an explicit retry starts. The Code hero prompt and
   provider instructions require a materially changed replacement while preserving the
   server's no-op rejection. Freeze the new exact task as: `@Code Reframe this root-cause
   section as exactly three labeled Markdown bullets—Trigger, Amplifier, and Why it
   persisted—using the synthetic repository and checkout log. Preserve every verified
   date, quantity, and source reference, then replace only this section.` No canned
   fallback or weakened invariant is allowed.
4. **Future-spec thesis.** “Today: page-scoped RPC. 10×: reactive. 100×: durable and
   accountable.” The 10× proposal is typed, agent-opted-in resource invalidation/pub-sub,
   stable capability lifecycle, progress, streaming, and output contracts. The 100×
   proposal is durable worker-backed sessions, browser-attested delegation identity and
   scopes, cross-page routing, idempotent receipts, and reviewable replay. Every item is
   visibly labeled proposed direction, not current WebMCP behavior.
5. **Screenshot truth.** Operator screenshots contain no share URL, token, cookie,
   unrestricted transcript, or private identifier. Product, native WebMCP, live Luna,
   local rehearsal, and proposed-spec visuals remain separately labeled. A screenshot
   guide helps the user record; it is not a substitute for the final live demo.

## Streams

### S1 — hosted Luna reliability — active
- Owner / worktree: reliability worker in an isolated `/private/tmp` clone; return one
  reviewed patch for explicit integration.
- Scope and key files: `RepositoryWorkspace.tsx`, `RelayFlightRecorder.tsx`, focused UI
  tests, the fixed Luna developer instructions and tests, the guided Code assignment
  wording and `product_spec.md`, `EVALS.md`,
  `docs/contracts/postmortem-hero-scenario.md`,
  `evals/goldens/repo-document-v4.2/managed-relay.json`, and the live judge-flow
  assertion. Those four contract/golden sources receive the exact frozen prompt before
  implementation expectations change.
- Must not touch: deck files, database migrations, release/submission copy, or user-owned
  legacy media.
- Inputs / frozen contracts: the retry and no-op invariants above; existing role catalogs,
  provider/tool-call bounds, exact-range mutation, and two-attempt maximum remain fixed.
- Verification: focused unit tests prove heartbeat containment, active-retry button
  suppression, no-op-resistant instructions, and unchanged server rejection; then
  `.codex/verify.sh`, build, native lifecycle, and repair-free production rehearsals. Add
  an opt-in `RATIFLOW_REQUIRE_FIRST_ATTEMPT=1` live-test mode that fails immediately if
  Retry appears rather than auto-clicking it.

### S2 — judge deck and future thesis — active
- Owner / worktree: deck worker in a separate isolated `/private/tmp` clone; return one
  reviewed patch for explicit integration.
- Scope and key files: `docs/contracts/html-deck-storyboard.md`, `src/app/deck/**`, and
  `e2e/deck.spec.ts`.
- Must not touch: repository workspace/runtime, relay/provider code, migrations, or legacy
  video assets.
- Inputs / frozen contracts: exact two-gate wording and sourced 10×/100× thesis above.
- Verification: deck unit/e2e tests; all 12 direct hashes and keyboard controls; key
  desktop/mobile captures with no clipping; current-vs-proposed labels and official
  source links; fresh `$dev-visual-review` after integration.

### S3 — screenshot-led recording kit — pending on verified I1 candidate
- Owner / worktree: coordinating task.
- Scope and key files: new `demo/v4.2-relay/recording-runbook.md`, sanitized screenshots
  under `demo/v4.2-relay/screenshots/`, and a narrow capture README/manifest.
- Must not touch: user-owned `demo/video-assets/**`, `demo/video-output/**`, or any final
  video file.
- Inputs / frozen contracts: one clean exact-SHA candidate flow and the final deck order.
- Verification: every image is visually inspected, contains no browser chrome or secrets,
  maps to a numbered runbook beat, and has an explicit evidence class. The runbook covers
  setup, `@Code`, catalog/turn proof, r6 History/Restore, and the shorter `@Data` transfer.

### I1 — integration, deployment, and rehearsal — pending
- Owner / worktree: coordinating task.
- Scope: integrate only the S1/S2 allowlists, run the repository gate and production
  build, drive the real UI, deploy the exact reviewed runtime/deck when local gates pass,
  run the native lifecycle and Luna judge trajectory, reconcile stale `README.md`,
  `demo/devpost-submission-v4.md`, and the release manifest only to observed evidence,
  then hand the verified exact-SHA candidate to S3.
- Verification: `.codex/verify.sh`; `pnpm build`; production UI/deck E2E; native
  idle→role→idle; `RATIFLOW_REQUIRE_FIRST_ATTEMPT=1 ... playwright test
  e2e/live-luna-judge-flow.spec.ts --repeat-each=5 --workers=1 --reporter=line`, which
  fails immediately on Retry; fifteen total runs and attempts, all first-attempt
  successes; zero page errors or API 5xx; aggregate post-run state with no failed
  attempts, active leases, permits, reservations, exhausted runs, or cancellations. If
  external credentials or a privileged aggregate surface are unavailable, report that
  gate as pending rather than infer success.

## Checkpoints

- Any deck wording implies a per-turn WebMCP catalog swap or autonomous Luna tool choice
  -> block the deck and correct the claim.
- A no-op replacement, contradictory retry control, or uncaught background error recurs
  in a clean rehearsal -> block recording and production-confidence claims.
- A future slide presents a proposal as adopted spec behavior, or arbitrary pushed prose
  as safe pub/sub -> block the slide.
- Any capture contains a share token, session material, private identifier, or raw model
  transcript -> discard it and recapture from a fresh sanitized flow.
- Local gate or build fails -> do not deploy.
- Fewer than five repair-free production rehearsals -> the runbook may ship, but the
  release remains explicitly below the internal recording-confidence bar.

## Integration order

`freeze this plan and adversarially review it -> (S1 isolated reliability || S2 isolated
deck) -> reviewed patch integration -> focused tests -> shared integration gate/build ->
driven local browser + visual review -> exact candidate deployment -> native and Luna
rehearsals -> S3 sanitized exact-SHA screenshots/runbook -> final evidence audit ->
dev-handoff`.

S1 and S2 own disjoint implementation paths and can run in parallel after this freeze.
Their test/build processes cannot observe each other's partial edits. S3 deliberately
waits for the verified candidate so screenshots cannot fossilize superseded UI or claims.
The coordinator owns requirements, patch integration, deployment, release-copy truth,
and evidence classification.

## Risks and open decisions

- Luna remains generative; instruction tightening reduces no-op probability but cannot be
  counted as reliability until the repair-free production bar is observed.
- A true per-turn browser catalog would require a larger relay protocol/state-machine
  change. This release explains the existing two-layer least-privilege design rather than
  inventing that behavior under deadline.
- Pub/sub can become a prompt-injection channel. The proposal is typed invalidation plus
  authoritative re-read, opt-in scope, coalescing, expiry, and separate mutation grants.
- The checkout contains unrelated user changes. Integration and deployment must exclude
  them and must not rewrite the legacy untracked demo media.

---

# Archived plan — The document is the agent runtime
_Updated: 2026-09-02T22:40:47+08:00_

## Goal and ambition mode

Turn the shipped v4.1 collaboration document into a brownfield v4.2 flagship, retaining
the literal repository wire/storage protocol `4`. Its winning claim is: **Mention the
expert. The page supplies the tools. The document keeps the proof.** A judge enters a
nickname, chooses a substantial two-sheet Incident
postmortem or Product document, comments on an exact passage or section, and mentions a
known human or one of three managed demo agents: `@Data`, `@Code`, or `@General`.

An agent mention becomes durable work. While the document is open, an application-owned
in-page relay uses the WebMCP consumer APIs to discover the active specialist's live
role-scoped catalog, pins the exact next function in a bounded role workflow, has
GPT-5.6 Luna compose its strict arguments through the Responses API, executes every
returned call through
`document.modelContext.executeTool()`, and commits a bounded,
reversible revision through the existing ledger. A visible flight recorder records the
application-observed catalog delta, discovery, execution, evidence, model/runtime, exact
diff, and resulting revision without exposing hidden reasoning. Dated supported-client
evidence remains the separate native WebMCP proof boundary.

This is an ambitious model-independent agent-runtime extension, not another AI rewrite
button. Preserve the ordinary human experience and the existing top-level eight-tool
BYOA surface. Explicitly do not build production SSO/RBAC, arbitrary agent installation,
real company connectors, a CRDT/live-cursor editor, unbounded autonomy, or a backend
daemon falsely described as WebMCP. Data and code sources are deterministic synthetic
fixtures and visibly labeled. Managed agents run only while an eligible document page is
open; immediate dispatch is backed by a 15-second recovery heartbeat, not a cron promise.
Ship a public, keyboard-navigable 12-slide HTML deck at `/deck` as part of the application,
using the product's own visual system, truthfully labeled rendered product visuals, and
exact-SHA screenshots where available to make the judge story understandable even when
the entry is reviewed from submission materials alone. Rendered visuals communicate the
product flow but never substitute for live Luna or native WebMCP evidence.

## Chokepoint — freeze and prove first

Before feature streams start, freeze one v4.2 Agent Directory / Principal / Relay contract
in `product_spec.md`, `docs/contracts/repository-contract.md`, a new
`docs/contracts/webmcp-relay-contract.md`, `src/repository/contracts.ts`, a new
`src/agent-relay/contracts.ts`, both hero scenario documents, an audience-facing deck
storyboard, independent goldens, and `EVALS.md`. The release name is v4.2; this is an
additive protocol-4 extension with
optional relay/directory fields and new `/api/repository-v4/relay/**` routes, not a literal
protocol 5 or a second repository route family. C0 must also prove the risky protocol
seam with a tiny deployed top-level WebMCP probe and a minimal real Luna
client-tool-search round trip. Documentation alone
is enough to plan the feature, but not enough to claim the live integration works.

Freeze these decisions:

1. **Truthful runtime claim.** OpenAI Site Tools are its native WebMCP implementation and
   currently disable GPT-5.6 Luna; Sol and Terra remain the supported native Site Tools
   path. Ratiflow therefore claims an **application-owned WebMCP Relay powered by Luna**,
   not native Luna WebMCP. Luna supports Responses, function calling, and client-executed
   `tool_search`; remote MCP is a separate server protocol and is not this feature.
2. **Actual WebMCP mediation.** The relay document calls `getTools()`, listens for
   `toolchange`, and executes the exact returned `RegisteredTool` via `executeTool()`.
   Tool callbacks, repository mutations, and synthetic source reads may not be called
   directly as a shortcut. Removing `document.modelContext` must make a live run fail
   closed; a compatibility adapter is separately labeled and cannot count as native
   evidence.
3. **Top-level runtime mode.** Keep all registrations on the top-level page, as required
   by repository guidance. In idle/BYOA mode the current eight viewer-bound tools remain
   exact. Claiming managed work atomically enters mutually exclusive Relay mode, aborts
   the BYOA catalog after in-flight work settles, and registers only one specialist's
   run-scoped catalog. The same top-level JavaScript calls `getTools()` and `executeTool()`.
   Completion/failure restores the eight-tool idle catalog. The UI never claims BYOA and
   the managed relay run concurrently, and the C0 supported-client probe must prove the
   idle/relay/idle transition, cancellation, `toolchange`, and stale-descriptor behavior.
4. **First-class principals and grant boundary.** Humans and agents are distinct
   directory targets. Every managed demo agent has its own internal member principal, so
   the current unique
   profile-per-member invariant can remain. The server derives principal, handle,
   specialty, scope, runtime, category, and authority from a canonical profile ID; model
   JSON can never choose actor, owner, origin, credential, or permission. Existing
   self-declared human-owned BYOA profiles remain available under an Advanced path and
   cannot rename or connect as an immutable `DEMO_DIRECTORY` profile. Any authenticated
   document member may claim the next queued managed task. Lease acquisition mints a
   single-attempt bearer with audience `ratiflow-webmcp-relay`, a 120-second TTL, and
   bindings to document/profile/task/run/attempt/page-session/lease. It lives only in
   memory, is sent only in `Authorization: Bearer` to same-origin relay tool routes, is
   revoked on lease loss/terminal state, and never reaches Luna. Unmount revocation is
   best-effort; every `/relay/step` and `/relay/tool` request authoritatively revalidates
   the renewable lease and TTL. Long-lived human and BYOA credentials never enter the
   tool manifest, model input, trace, or evidence.
5. **Directory and mention contract.** `AgentDirectoryEntry` freezes canonical profile
   ID, unique handle, display name, `COMPANY | TEAM | PERSONAL` scope,
   `DATA | CODE | GENERAL`
   specialty, `DEMO_DIRECTORY | SELF_DECLARED` identity source, runtime, readiness, and
   server-approved logical tool manifest. `COMPANY | TEAM | PERSONAL` is demo/display
   metadata, not authorization. Autocomplete groups Humans and Agents and submits a
   discriminated canonical target (`HUMAN` member ID or `AGENT` profile ID), never a name
   as authority. A human mention atomically creates discussion only; a managed-agent
   mention creates exactly one scoped task and immutable target snapshot. Handles are
   ASCII, case-insensitively unique, reserved against system/tool words, immutable for
   demo agents, and selected by ID; renamed/deleted/stale targets fail explicitly.
6. **Run, attempt, lease, and replay lifecycle.** One mentioned task owns one `RelayRun`
   lineage and one or more numbered `RelayAttempt`s. A run is `QUEUED | ACTIVE |
   WAITING_RETRY | COMPLETED | EXHAUSTED`; an attempt failure moves the run to
   `WAITING_RETRY` while budget remains, explicit Retry returns it to `ACTIVE` with a new
   attempt, and only `COMPLETED`/`EXHAUSTED` are terminal. Retry never reuses provider or
   mutation IDs. An attempt is `CLAIMED | DISCOVERING | AWAITING_MODEL | EXECUTING_TOOL |
   RECONCILING | SUCCEEDED | FAILED | EXPIRED`. Lease acquisition precedes any paid call;
   one task has one renewable live lease across tabs. Each Responses call and function
   `call_id` derives its own stable non-model mutation ID over exact arguments; replays
   return the stored outcome and changed arguments fail. A timeout after dispatch enters
   `RECONCILING`, re-reads authoritative task/run state, and is never reported as a clean
   cancellation. Task creation sends an immediate wake; the dispatcher checks again every
   15 seconds while visible and never promises execution after navigation or page close.
7. **Luna stepper boundary.** `open_ai_api` is server-only, with
   `OPENAI_API_KEY` accepted as a conventional fallback. A start call sends Luna a
   fixed developer prompt and only client-executed `tool_search`; Luna's
   `tool_search_call` returns to the browser. The browser then calls `getTools()`, creates
   a normalized manifest, and returns the exact requested `tool_search_output`. The
   server validates it against the attempt/role allowlist. On every nonterminal
   continuation it exposes only the exact next physical function and pins that name with
   a named `tool_choice` for fixed model `gpt-5.6-luna`; Luna composes the strict arguments
   and must return that function call. Calls return to the browser for `executeTool()`; parsed,
   schema-checked results return as `function_call_output` until a scoped revision lands
   or the bounded loop stops. Developer instructions repeat on continuation. The client
   cannot supply model, developer prompt, arbitrary definitions, or credentials.
   Each function call also returns a signed one-shot `RelayExecutionPermit` bound outside
   model JSON to attempt, response/call ID, physical name, exact argument digest,
   registration generation, lease, and short expiry. The browser arms it only around the
   matching `executeTool()` call; the callback consumes it atomically and `/relay/tool`
   revalidates it. An unarmed native Site Tools invocation fails even in Relay mode. This
   is call correlation, not a claim that WebMCP supplied caller identity.
8. **Dynamic capability and executable-port proof.** Common tools cover assignment
   claim/read, document and collaboration context, progress comment, and scoped result
   submission. `@Data` alone
   adds `query_demo_metrics`; `@Code` alone adds `search_demo_code` and
   `read_demo_file`; `@General` alone adds `read_company_style_guide` and
   `check_document_consistency`. The first model-visible action reads its assignment
   through WebMCP. Each physical WebMCP name is role- and registration-generation-scoped
   (the UI shows a stable logical name), so an old `RegisteredTool` is never reused for a
   new persona/run. C0 freezes an injectable `ManagedAgentToolClientPort` for repository
   reads/mutations and a pure `SpecialistFixturePort` for synthetic metrics/code/style
   reads. S1 and S4 implement those ports; S2 alone adapts them to WebMCP callbacks; I1
   wires them. Role switches must produce a visible catalog delta and `toolchange`.
9. **Manifest, trust, and provenance.** A normalized manifest excludes the
   non-serializable `RegisteredTool.window`; includes exact same-origin `origin`, physical
   and logical name, registration generation, normalized JSON Schema, description, and
   standardized `readOnlyHint`/`untrustedContentHint`; rejects extra origins/tools; and
   hashes only those frozen fields. Producer-only annotations do not silently affect the
   digest. `executeTool()` returns a string: the relay parses it once, unwraps the current
   MCP-style envelope only when contract-valid, validates the logical output schema, and
   never treats a decode failure as a successful call. The server validates all schemas,
   task/run/attempt binding, range, revision, role, lease, and result. Tool descriptions,
   document content, and results
   are untrusted input. Log ordered sanitized `RelayTraceEvent`s—never chain-of-thought,
   raw secrets, or unrestricted transcripts—in a separate bounded monotonic
   `relayEventVersion` stream that does not perturb legacy `activityVersion` waits.
   History records managed agent, human grantor, model, runtime
   `OPENAI_LUNA_WEBMCP_RELAY`, `origin=WEBMCP`, source labels,
   rationale, before/after, and Restore.
10. **Judge-owned demo copies.** Nickname plus document choice creates a fresh isolated
    seeded copy. Each example renders as exactly two visual paper sheets on desktop and a
    two-part stack on mobile, has prior human and agent revisions, and leaves one guided
    issue unresolved. Postmortem is the 90-second hero: Code verifies a retry failure,
    General rewrites the Root Cause section, and History proves both. Product is the
    transfer proof: Data queries 14-day launch-capacity fixtures and revises Success
    metrics. Synthetic evidence is unmistakably labeled.
11. **Cost and safety bounds.** Disclose that selected document context is sent to
    OpenAI. Use short-lived in-memory relay grants, strict same-origin enforcement,
    per-document and global rate limits, maximum calls/tokens/bytes/time/attempts,
    sequential tool calls, cancellation on unmount/navigation before dispatch,
    reconciliation after ambiguous dispatch, and a Retry state. Never silently substitute a
    canned result for a failed live run.
12. **Protocol-4 compatibility.** Existing protocol-4 documents and `/api/repository-v4`
    routes remain authoritative. Relay fields are optional/empty for old records; old
    create/join/read/comment/tool clients keep their current projection and exact eight
    idle tools. New relay routes and storage are additive. `REPOSITORY_PROTOCOL_VERSION`,
    registration context keys, database document checks, and storage prefixes remain
    literal `4`; no stream may invent a protocol-5 surface.
13. **HTML deck.** `/deck` contains exactly 12 16:9 slides with arrow/key navigation,
    progress, direct slide URLs, responsive fit, print styles, and reduced-motion support.
    Its cumulative arc is problem -> document-as-runtime thesis -> judge workflow ->
    WebMCP/Luna mechanism -> dynamic role proof -> trust/revisions -> Postmortem evidence
    -> Product/Data transfer -> architecture -> leverage/impact -> future -> closing
    claim. Use truthfully labeled rendered product visuals and/or real application
    screenshots captured after integration, never invented results. A rendered visual is
    explanatory material, not live/native proof; every external claim/source has a
    visible or accessible source note, and every slide has one clear audience-facing
    takeaway.
14. **Submission truth.** A dated supported-client capture must distinguish the native
    idle Site Tools surface from the mutually exclusive Luna in-page Relay mode. The
    public submission must use a public repository with an open-source license and a
    working judge URL; changing
    the current private GitHub repository's visibility remains an explicit release action.

## Streams

### C0 — relay contract and two protocol spikes — baseline complete; native capture pending
- Owner / worktree: coordinating task; current checkout.
- Scope and key files: `.codex/PLAN.md`, `product_spec.md`,
  `docs/contracts/repository-contract.md`, new WebMCP relay and hero scenario docs,
  `src/repository/contracts.ts`, new `src/agent-relay/contracts.ts`, contract tests,
  independent goldens, `EVALS.md`, and isolated probe-only files.
- Must not touch: feature implementation, applied migrations, UI/CSS, user-owned
  `.codex/PROGRESS.md`, `.gitignore`, `--annotate`, or legacy demo media.
- Verification: contract tests freeze exact entities, discriminated mentions, grant and
  attempt/permit bindings, ports, states, catalogs, manifest fields, event names, protocol-4
  routes/projections, bounds, and golden facts; the local adapter probe proves the
  consumer lifecycle and the deployed supported-client harness remains fail-closed and
  `PENDING` until an eligible native browser is available. One server-held-key Luna API
  run established `tool_search -> tool_search_output -> function_call ->
  function_call_output`; its eligible artifact is regenerated from the exact clean C0
  SHA. A fresh reviewer found no remaining P0/P1 false-claim or ownership blocker. C0
  exits as a named green scaffold commit plus an explicit evidence boundary; final native
  capture remains an I1 release gate rather than a claim inferred from the adapter.

### S1 — directory principals, tasks, leases, and persistence — locally implemented; production migration pending
- Owner / worktree: dedicated Codex-managed worktree after C0.
- Scope and key files: `src/domain/repository-service.ts`, repository runtime and focused
  tests, Supabase adapter/tests, exactly one additive migration, protocol-4 non-relay route
  handlers, the ordinary repository HTTP client, the frozen
  `ManagedAgentToolClientPort` implementation, `/api/repository-v4/relay/claim`, and the
  same-origin `/api/repository-v4/relay/tool` endpoint. Claim acquires the lease before it
  returns the bounded grant; the tool endpoint alone accepts that grant for repository
  reads/mutations.
- Must not touch: frozen contracts, relay browser/server code, UI/CSS, fixture source,
  existing applied migrations, or demo media.
- Inputs / frozen contracts: C0 profile/mention/run/lease schemas, authorization table,
  transitions, grant format/TTL, port and route schemas, errors, and v4.1 compatibility
  projection.
- Verification: focused domain/adapter/API tests prove human versus agent mentions,
  server-derived managed identity, separate agent principals, one active lease across two
  tabs, legal `WAITING_RETRY` transitions, idempotent recovery, stale/cross-document
  denial, grant/permit expiry and one-shot consumption, lease validation on every call,
  immutable trace and
  revision attribution, old v4.1 reads, RLS/grants, and a real PostgreSQL migration
  compile/rehearsal rather than static SQL alone.

### S2 — in-page WebMCP relay runtime — locally implemented; deployed native capture pending
- Owner / worktree: dedicated Codex-managed worktree after C0.
- Scope and key files: `src/webmcp/types.ts`, `src/webmcp/repository-registration.ts`,
  `RepositoryWebMCPBridge.tsx`, new `src/agent-relay/browser/**`, feature detection,
  mutually exclusive idle/relay catalog reconciliation, unique physical-name generation,
  manifest hashing, tool-result decoding, scheduler/election, and focused tests. S2 owns
  the WebMCP callback adapter over injected C0 ports, but not either port implementation.
- Must not touch: domain, API routes, migration, frozen contracts, fixture implementation,
  or workspace UI/CSS.
- Inputs / frozen contracts: C0 browser consumer types, exact role catalogs, grant/wake
  messages, state machine, trace events, and current `document.modelContext` semantics.
- Verification: fake and native-probe tests prove exact eight-tool idle catalog, one
  managed persona catalog at a time, actual `getTools`/`executeTool`, `toolchange`, strict
  same-origin/manifest filtering, generation-distinct physical names, stale-descriptor
  rejection, unarmed native-call denial versus an armed in-page success, one-shot permit
  clearing, both descriptor-bound `OBJECT` and `JSON_STRING_COMPAT` argument encodings
  without speculative retry, result-envelope decoding, 15-second recovery plus immediate wake, abort
  cleanup, hidden-tab
  truthfulness, and WebMCP-off fail-closed behavior.

### S3 — bounded Luna Responses stepper — locally implemented; current-SHA provider closure pending
- Owner / worktree: dedicated Codex-managed worktree after C0.
- Scope and key files: new `src/agent-relay/server/**`,
  `/api/repository-v4/relay/step`, provider adapter, fetch-mocked tests, `package.json`, and
  `pnpm-lock.yaml` if an SDK is justified by the official API shape.
- Must not touch: browser WebMCP code, domain persistence outside its service port,
  workspace UI/CSS, fixture implementation, frozen contracts, or migration.
- Inputs / frozen contracts: C0 relay-attempt authorization service port implemented by
  S1, canonical manifest/digest, Responses item projection, developer prompts, limits,
  trace projection, and exact error taxonomy.
- Verification: provider-contract tests cover client-executed tool search, injected
  approved functions, multi-step outputs, repeated developer instructions, malformed
  JSON/schema rejection, no arbitrary model/tool/prompt input, rate/cost/timeout caps,
  exact signed permit projection, cancellation, safe redaction, and one opt-in real Luna
  smoke with response ID retained
  only in sanitized evidence.

### S4 — specialist fixtures and two living documents — locally implemented; local golden closure verified
- Owner / worktree: dedicated Codex-managed worktree after C0.
- Scope and key files: `src/domain/repository-examples.ts`, new deterministic metrics,
  code-repository, and writing-guide fixture modules/tests, two-page source fixtures,
  the pure `SpecialistFixturePort` implementation, seeded histories, and new sanitized
  `demo/v4.2-relay/**` evidence assets only.
- Must not touch: service/adapter/API, relay loop, UI/CSS, frozen goldens, or user-owned
  legacy walkthrough assets.
- Inputs / frozen contracts: C0 exact `INC-482` and product facts, page split points,
  unfinished anchors, role tool outputs, evidence labels, and final revision oracles.
- Verification: deterministic fixture tests prove both fresh clones, literal two-part
  content, prior multi-author history, unresolved guided work, distinct role answers,
  exact code fact/evidence, exact product metrics, synthetic badges, and independent
  golden parity.

### S5 — judge NUX, directory, and flight recorder — locally implemented; local browser closure verified
- Owner / worktree: dedicated Codex-managed worktree after C0; sole owner of high-conflict
  workspace surfaces.
- Scope and key files: `RepositoryLanding.tsx`, `RepositoryWorkspace.tsx`, new directory,
  coachmark, relay-status, and flight-recorder components/tests, repository CSS, and the
  UI's frozen fake client port. BYOA moves behind an Advanced disclosure but remains.
- Must not touch: domain/server/WebMCP implementation, migration, frozen contracts,
  fixture source, package dependencies, or user-owned demo assets.
- Inputs / frozen contracts: C0 surface/commands/events, two-sheet mapping, grouped mention
  target projection, accessible names, and exact judge script.
- Verification: driven fake flow proves nickname -> document choice -> guided exact
  section comment -> grouped `@` selection -> immediate queued/discovering/working/done
  states -> visible catalog delta/tool calls -> exact diff/evidence/revision -> Restore;
  human mention remains discussion; desktop and 390px layouts, keyboard/screen-reader
  semantics, reduced motion, retry, API-key-unavailable, and WebMCP-off states are clear.

### S6 — 12-slide HTML submission deck — locally implemented; local deck closure verified
- Owner / worktree: dedicated Codex-managed worktree after C0.
- Scope and key files: new `src/app/deck/**`, new `src/components/deck/**`, deck-scoped
  styles/tests, and new `public/deck/**` final assets. Use the existing Ratiflow brand as
  the visual source; do not introduce a second app theme or presentation dependency.
- Must not touch: repository workspace UI, domain/server/WebMCP code, migration, frozen
  contracts, package dependencies, or user-owned demo media.
- Inputs / frozen contracts: C0 12-slide storyboard, exact submission claims, screenshot
  shot list, source notes, and reduced-motion/keyboard/print behaviors.
- Verification: all 12 direct URLs and next/previous/keyboard controls work; 1440x900,
  1280x720, and mobile captures have no clipping or accidental scrolling; titles remain
  one line; copy is low-density; source notes are accessible; rendered product visuals
  are clearly labeled and any screenshot crops are sharp, truthful, and exact-SHA.
  Rendered visuals cannot carry live/native labels. The final deck receives its own fresh
  `$dev-visual-review`.

### I1 — serialized integration, adversarial proof, and release — local closure in progress; production release pending
- Owner / worktree: coordinating task after S1-S6 return focused diffs and evidence.
- Release authority: application promotion is authorized in principle. The exact v4.2
  Supabase migration still requires explicit database-project approval; the matching
  v4.2 production deployment and exact-SHA native capture follow only after that apply.
- Scope and key files: shared app/runtime seams, top-level Relay-mode wiring and wake,
  route composition, release/eval scripts, README/submission copy, deployment configuration,
  and new sanitized final evidence. Do not absorb unrelated dirty files.
- Must not touch: user-owned `.codex/PROGRESS.md`, `.gitignore`, `--annotate`, or legacy
  demo media except through an explicit later decision.
- Verification: `.codex/verify.sh`, focused contract/relay/provider tests, real database
  rehearsal, `pnpm build`, deployed top-level page, production browser e2e,
  two-tab lease/retry, role-catalog comparison, WebMCP ablation, live Luna run, native
  external-client idle-catalog run, supported-client capture, responsive/accessibility pass,
  final product-visual/screenshot audit and full-deck review, fresh workspace and deck
  `$dev-visual-review`s, security/privacy review, three-minute judge rehearsal, public
  repository/license check after authorization, and requirement-by-requirement audit.
  One mandatory composed oracle links one human mention to exactly one lease/run/attempt
  and provider response lineage, the real role-specific `getTools()` manifest, Luna's
  function call, the exact `executeTool()` descriptor/result digest, one completed task,
  and one revision. A second tab creates no second lineage or spend; a role switch produces
  a native catalog delta; an unarmed native invocation fails; WebMCP ablation prevents both
  provider actuation and commit.

## Checkpoints

- Top-level C0 probe cannot swap idle/managed catalogs, execute through native WebMCP, or
  reject an earlier-generation descriptor -> stop feature streams and rescope; do not
  fake mediation.
- Luna cannot complete the documented client-executed tool-search loop with the available
  API account -> continue mockable implementation only, but block live-demo completion
  and every claim that Luna is connected.
- Model-authored mutation arguments can bypass `executeTool()`, choose identity/authority, or
  reuse a stale/cross-task grant or unarmed execution permit -> block integration.
- Switching Data/Code/General does not change the discovered catalog -> the core novelty
  has failed; fix dynamic registration before UI polish.
- The primary story can still be understood as generic @bot rewriting when the recorder
  is closed -> rescope the NUX so WebMCP discovery, role delta, evidence, and revision are
  visible in the golden path.
- One closed/hidden page or a second tab creates duplicate work -> block release; leases,
  idempotency, and truthful page-bound status are non-negotiable.
- A judge cannot reach a successful first agent revision from the public URL without
  setup knowledge, credentials, or more than the nickname/document choice -> simplify
  the NUX before visual review.
- Any synthetic source looks like a production connector, native Luna Site Tools are
  implied, or a compatibility run is labeled native -> block submission copy.
- The repository remains private or lacks a detectable open-source license at submission
  time -> block submission until the user explicitly authorizes visibility and it is
  verified.

## Integration order

`C0 contract + deployed WebMCP probe + minimal Luna round trip + adversarial plan/contract
review -> (S1 || S2 || S3 || S4 || S5 || S6) -> I1 explicit-file integration -> automated and
database gates -> deployed browser/Luna proof -> dev-visual-review -> fixes ->
90-second and three-minute rehearsals -> public-repository/release audit`.

After C0, the six streams are genuinely parallel because they consume frozen types and
ports and own disjoint paths. S1 alone owns persistence-facing service code and the
managed-tool client port; S2 alone owns the in-page runtime and WebMCP adapters; S3 alone
owns OpenAI calls and dependency changes; S4 alone owns fixtures and its pure port; S5
alone owns high-conflict workspace UI; S6 alone owns the HTML deck. The coordinator owns
contract decisions and serial
seams. Each worktree begins at the recorded C0 baseline. Workers may use read-only Git
inspection but make no Git writes, do not revert other changes, and return a file-allowlist
patch plus evidence manifest through native task handoff. Integration uses those explicit
allowlists and preserves all unrelated dirty files.

Release order is additive migration -> database advisors and old-code smoke -> v4.2 adapter
and lease smoke -> top-level deployment -> live Luna smoke -> supported
native-client evidence -> ordinary-browser fallback -> public judge rehearsal. Unavailable
external evidence remains `PENDING`; mocks, compatibility adapters, or screenshots cannot
substitute for an observed native run.

## Risks and open decisions

- WebMCP is a Community Group draft, browser implementation details are moving, and the
  installed Chrome is 152 while some current documentation describes 153 behavior. The
  C0 probe freezes the observed argument/result/unregistration shapes for supported
  judging clients without weakening the standards path. Chrome 152 currently exposes
  stringified consumer schemas and cancels the consumer promise without forwarding the
  callback signal; Ratiflow records those facts and uses exact-descriptor encoding plus
  same-page caller-signal propagation rather than UA sniffing or a second invocation.
- WebMCP supplies no verified caller identity. Relay and BYOA modes are therefore
  mutually exclusive, managed physical tool names are run/generation-unique, and server
  authority remains task/lease/range bound. The C0 probe must establish the precise
  supported-client transition behavior; native browser review is an additional control,
  not an identity primitive.
- A Codex/ChatGPT usage reset does not provision an OpenAI API key or API billing. A
  server-side key, model access, and a small judge-safe spend allowance are required for
  the live Luna gate; no secret may enter Git, browser bundles, storage, logs, or evidence.
- Browser timers are best-effort and throttled in background tabs. The immediate wake is
  the main path; the 15-second timer is recovery only. True closed-page agents would need
  a separate remote MCP/background-worker architecture and would no longer demonstrate
  this page-bound WebMCP loop.
- Literal two-sheet rendering is a demo comprehension device over one immutable Markdown
  source, not pagination semantics or real-time Google Docs parity. Exact source anchors,
  full-snapshot revisions, Restore, and human usability remain the trust model.
- Public judging creates cost and abuse exposure. Rate limits must still permit all three
  intended specialist runs in an isolated judge copy and give a readable exhausted state.

---

# Archived plan — Comments that become agent work
_Updated: 2026-09-02T19:47:14+08:00_

## Goal and ambition mode

Replace the form-heavy v4 flagship with an Apple-simple document collaboration model:
select an exact passage, leave a comment, and an `@Agent` mention becomes durable scoped
work. A named brought agent may edit the granted passage immediately; no Ratiflow
proposal approval is required. The completed task keeps the exact prompt, immutable
source context, self-declared agent name bound to its server-known human owner, concise
rationale, evidence, resulting diff, and revision. A human can inspect and restore the
change. Plain human comments close without inventing an approval state.

This is a brownfield flagship refreeze over the existing v4 repository document. Keep
v3 and old v4 compatibility data readable, preserve applied migrations, and reuse the
proven revision/anchor/idempotency model. Expand the body renderer to safe GFM Markdown
and validated revisioned chart fences; do not build a general rich-text editor, model
host, background wake service, spreadsheet, attachment system, or identity provider.

## Chokepoint — freeze first

Freeze the collaboration contract before implementation in `product_spec.md`,
`docs/contracts/repository-contract.md`, `src/repository/contracts.ts`, the two detailed
hero scenarios/goldens, and `EVALS.md`:

1. This is protocol v4.1 in the existing v4 namespace, not protocol v5. Existing
   `COMMENT`/`REVIEW` data and compatibility decision routes remain valid/readable, but
   the flagship cannot create or surface those controls.
2. `@Agent prompt` is entered in one anchored comment composer. Only choosing an agent
   autocomplete result creates mention work; unselected/literal `@` text is a normal
   comment. One replay-safe server mutation atomically validates the current profile and
   exact selection, derives hidden title/category/label/Direct authority, snapshots
   context, creates task+thread+initial human comment, and increments activity once.
   Duplicate visible names are disambiguated by owner; the request carries member ID,
   exact profile name, exact visible comment, and anchor. Unknown/renamed profiles fail.
3. People provide a display name on create/join. `/` and `/new` always expose that setup
   instead of silently reopening a stored document; direct `/issue/[shareToken]` reloads
   retain credential-only resume. The workspace then exposes a truthful agent-setup
   handoff that distinguishes tool availability from a successful page-scoped agent
   connection. The current WebMCP draft supplies no caller/model identity to `execute`;
   `connect_agent({ name })` records a self-declared agent name and server-binds it to the
   authenticated member owner. The bridge supplies page-session freshness outside model
   JSON, and connect records an exact credential-session/page-session binding that every
   later server call must match. The UI never presents the name as vendor-verified.
4. Exactly one current agent profile exists per document member. Reconnect with the same
   name updates access; a new name renames the current profile while immutable tasks keep
   their original snapshot. Profile expiry follows the document. Task execution remains
   member-authorized because one profile maps to one member; page session scopes only
   the live tool call/wait. A recorded current profile is the autocomplete/assignment
   target but is never presented as a live-presence signal.
   Work is durable and
   is picked up immediately only while the external agent is active; Ratiflow never
   claims it can wake a dormant model.
5. Body source remains immutable revisioned Markdown. The reading surface safely renders
   GFM headings, lists, task lists, links, code, and tables. A fenced `chart` JSON block
   is schema-validated and renders an accessible SVG chart plus a tabular fallback. Raw
   HTML and network-backed embeds are not executed.
6. Rendered selection endpoints must map exactly back to raw source offsets. Exact text
   leaves permit interior endpoints and exact cross-leaf selections preserve intervening
   Markdown delimiters; ambiguous entity/escape interiors, inline/fenced code, generated
   nodes, images, and surrogate-pair interiors fail with a clear recovery message. A
   block comment affordance may target the exact whole-block source range, including
   tables and chart fences. DOM offsets are UTF-16 and convert once to the checked
   Unicode code-point anchor. Invalid chart fences save as inert source with an inline
   error; they never execute or fetch.
7. Every agent task snapshots its prompt, source revision/digest, exact anchor, bounded
   surrounding context, and the ten newest prior coordination-event excerpts at its
   creation cutoff. Completion requires
   a concise agent-authored rationale (`resultSummary`), evidence, replacement, author,
   owner, and resulting revision/diff. Hidden chain-of-thought and raw transcripts are
   never requested or stored.
8. `read_collaboration_context` pages the immutable activity ledger, not only content
   revisions, so comment-only decisions cannot disappear. Each newest-first activity
   event joins its revision/task/thread/comment context at read time. It is the canonical
   cross-contributor continuity surface for a genuinely new agent identity.
9. Agent changes commit directly under the existing exact-range and stale-overlap checks.
   Task cards and History show the highlighted before/after change and link to Restore;
   restore appends a new revision and never rewrites history.
10. Both Postmortem and Product document have detailed completed examples with multiple
   humans, multiple named agents, direct revisions, a closed human comment, Markdown
   tables, rendered charts, evidence, rationale, and a fresh-agent continuity answer.

## Streams

### C0 — collaboration and rendering contract — completed
- Owner / worktree: coordinating task; current checkout.
- Scope and key files: `.codex/PLAN.md`, `product_spec.md`,
  `docs/contracts/repository-contract.md`, hero scenario docs,
  `src/repository/contracts.ts`, `src/repository/comment-first-contract.test.ts`,
  `EVALS.md`, independent goldens.
- Must not touch: applied migrations, user-owned demo media, implementation paths.
- Verification: `pnpm exec vitest run src/repository/comment-first-contract.test.ts`
  passes its exact tool/golden/context assertions; `git diff --check` passes; fresh plan
  reviewer reports no ownership/verification blocker. Full typecheck is intentionally an
  S1–S4 integration gate because C0 advances checked interfaces ahead of implementations.

### S1 — domain, profiles, context, and examples — completed
- Owner / worktree: shared-checkout worker after C0; strict paths below.
- Scope and key files: `src/domain/repository-service.ts`, its focused tests,
  `src/domain/repository-runtime.ts`, `src/capabilities/mention-compiler.ts` plus its test,
  completed example builders, `src/repository/surface-reconciliation.ts` plus its test,
  and `src/repository/browser-storage.ts` plus its test.
- Must not touch: UI/CSS, WebMCP registration, API routes, Supabase.
- Inputs / frozen contracts: C0 checked types, exact examples, mention compiler/context
  projection, profile lifecycle, existing revision/anchor invariants.
- Verification: focused tests cover identity binding, @ task creation, direct completion,
  context snapshot/recovery by a new member, both examples, and restore provenance.

### S2 — additive persistence and HTTP boundary — completed
- Owner / worktree: shared-checkout worker after C0; strict paths below.
- Scope and key files: one new migration, Supabase adapter/tests,
  `src/app/api/repository-v4/**`, and
  `src/components/repository/repository-http-service.ts` plus its test.
- Must not touch: applied migrations, UI/CSS, WebMCP registration, demo media.
- Inputs / frozen contracts: C0 service inputs/results and security rules.
- Verification: static migration/adapter parity, RLS/grant/search-path checks, agent name
  bound from hashed session rather than model-supplied owner, cross-instance wait leases,
  migration-first exact legacy response/input projection (including old-client Save), and
  v4.1 context surviving reload.

### S3 — WebMCP identity and collaboration context — completed
- Owner / worktree: shared-checkout worker after C0; strict paths below.
- Scope and key files: `src/webmcp/repository-*`, their tests, and
  `src/components/repository/RepositoryWebMCPBridge.tsx`.
- Must not touch: UI, domain, migration, contracts after freeze.
- Inputs / frozen contracts: `connect_agent`, expanded inspection, bounded
  `read_collaboration_context`, existing cancellation/page lifecycle rules.
- Verification: exact schemas/results, first-contact identity, new-agent cross-history
  continuity, JSON safety, abort teardown, and no claim of dormant-agent wakeup.

### S4 — rendered editor and comment-first interface — completed
- Owner / worktree: shared-checkout UI worker after C0; strict paths below.
- Scope and key files: `RepositoryWorkspace.tsx`, `RepositoryLanding.tsx`,
  `RepositoryJoin.tsx`, `RepositoryApp.tsx`, new Markdown/chart renderer/tests, focused
  repository CSS, repository UI tests, `package.json`, and `pnpm-lock.yaml`. Explicitly
  exclude the HTTP service and WebMCP bridge.
- Must not touch: domain, routes, migration, WebMCP runtime, user-owned demo media.
- Inputs / frozen contracts: C0 browser client port and deterministic fake.
- Verification: rendered Markdown/table/chart; selection-to-comment; @ autocomplete;
  plain comment close; completed task diff/rationale/restore; quiet History; keyboard,
  390px, WebMCP-off, and reduced-motion behavior.

### I1 — serialized integration, evals, and release proof — completed locally; external evidence pending
- Owner / worktree: coordinator after S1-S4.
- Scope and key files: runtime/page seams, example selection, scripts/e2e/evals, README and
  new sanitized v4.1 demo assets only.
- Must not touch: legacy untracked walkthrough assets or applied migrations.
- Verification: `.codex/verify.sh`, focused v4.1 gates, `pnpm build`, driven desktop/390px
  flows, supported-client native discovery/invocation, WebMCP-off ablation, repair-free
  rehearsals, fresh `dev-visual-review`, and requirement-by-requirement completion audit.

## Checkpoints

- `@Agent` still opens a task/authority form -> block integration and remove the form.
- Agent identity is inferred from vendor/model claims or can forge its human owner ->
  block release; keep name explicitly self-declared and owner server-derived.
- Markdown source appears raw in reading mode, chart JSON is executable/unvalidated, or
  rendered content cannot be selected/commented -> block UI completion.
- A new member's agent cannot recover other contributors' prompts, rationale, comments,
  and revision context -> block the continuity claim.
- Direct work can escape its exact stored anchor or overlap silently -> block release.
- The comment/history chrome competes with the document -> simplify before visual review.

## Integration order

`C0 freeze + adversarial review -> (S1 || S2 || S3 || S4) -> I1 serialized integration
and contract parity -> automated/browser/native gates -> dev-visual-review -> corrections
-> full completion audit`.

Requirements and contract decisions remain in the coordinating task. Collaboration
workers share this checkout, so streams use the strict disjoint paths above rather than
pretend worktrees. Workers do not run Git, do not revert others' edits, and return focused
diffs plus evidence. The coordinator resolves shared seams and stages an explicit-file
allowlist only. User-owned `.gitignore`, `--annotate`, and legacy walkthrough media are
never staged or overwritten.

Release order is additive migration -> database advisors and old-code smoke -> new
adapter/profile/context smoke -> application deployment -> native v4.1 capture. Any
unavailable external step remains `PENDING`; static SQL never substitutes for parity.

## Risks and open decisions

- The WebMCP draft currently exposes tool arguments and `AbortSignal`, not a trustworthy
  caller/model identity. `connect_agent` is therefore self-declaration, not verification.
- The body remains Markdown source to preserve exact snapshots/ranges. Rendered comment
  anchoring must fail clearly on an ambiguous source mapping rather than attach silently.
- Existing `REVIEW` records remain readable compatibility data, but new flagship @ work
  is Direct and no approval controls appear in the primary interface.
- A Restore can supersede later revisions. The UI must show which complete revision will
  become the new head and keep intervening history intact.

---

# Archived plan — Versioned issue documents for people and their own agents
_Updated: 2026-09-02T01:51:28+08:00_

## Goal and ambition mode

Pivot the flagship from one proposal-only shared memo into a focused, Git-grade issue
document for exactly two templates: **Incident postmortem** and **Product document**. A
shared URL remains useful without an agent. People and the agents they bring collaborate
through anchored tasks and threaded findings; every content change becomes an immutable,
reconstructable revision with actor, task, evidence, authority, and approval provenance.
The task creator chooses server-enforced `REVIEW` or `DIRECT` change authority, and an
agent can never grant or escalate its own access.

This is a brownfield flagship replacement under the WebMCP Challenge deadline, not a
general Git host, account system, folder tree, rich-text editor, CRDT, background agent
host, code/log/data connector, branch graph, or arbitrary workflow builder. Preserve the
deployed v3 route as compatibility while `/` and `/issue/[shareToken]` become v4. Preserve
the existing untracked walkthrough files; they teach the superseded v3 workflow and are
not v4 release evidence.

## Chokepoint — freeze first

Freeze one v4 contract before parallel implementation in:

- `product_spec.md` — exact promise, P0 boundary, two templates, authority semantics,
  deterministic hero, WebMCP leverage, and release story;
- `docs/contracts/repository-contract.md` — checked entity, lifecycle, transaction,
  authorization, API, WebMCP, revision, comment, and concurrency behavior;
- `docs/contracts/postmortem-hero-scenario.md` — exact `INC-482` facts, three tasks,
  comments, r1-r4 history, and final postmortem;
- `src/repository/contracts.ts` — the sole checked protocol-v4 names and shapes; and
- `EVALS.md` — v4 automated/browser/native/trajectory/ablation/visual/judge oracles.

The checked TypeScript contract separates public `*HttpInput` / model-visible
`*ToolInput` JSON from internal `*ServiceInput` request identity and freezes an
injectable `RepositoryBrowserClientPort`. This lets the UI and transport compile against
one boundary without owning runtime wiring. It also exports the exact ordered six-tool
catalog—descriptions, closed schemas, and annotations—and a protected hero-reset outcome.

The contract freezes these non-negotiable decisions:

1. A content revision stores a complete title/body snapshot and digest. History is
   reconstructable; bounded event excerpts are not revision storage. Restore creates a
   new revision and never rewrites history.
2. `IssueTask.mode` is immutable `COMMENT | REVIEW | DIRECT`. The creator chooses it;
   the server derives agent, assignee, scope, actor, origin, and mode from the session
   and task. Model input contains none of those authority fields.
3. `COMMENT` completes with a finding; `REVIEW` stores a proposal without changing the
   document; `DIRECT` atomically applies only the granted anchor and creates a revision.
   One `submit_task_result` tool returns the server-derived outcome.
4. Task comments are first-class threaded records with stable human/agent attribution,
   optional reply links, and revision-bound target context. Resolved tasks remain visible.
5. Disjoint task anchors rebase through intervening single-splice edits; overlapping or
   ambiguous writes fail closed. The product claims concurrent work, not CRDT editing.
6. The page registers a stable, top-level WebMCP catalog through
   `document.modelContext`, tears it down with `AbortSignal`, and remains fully usable by
   humans when WebMCP is absent. A host safety confirmation is distinct from Ratiflow's
   task approval policy and is never misrepresented.

## Streams

### C0 — v4 contract and independent goldens — completed
- Owner / worktree: coordinating task in the current checkout.
- Scope and key files: the five chokepoint files above plus
  `evals/goldens/repo-document-v4/`.
- Must not touch: applied migrations, v3 implementation, current demo media.
- Inputs / frozen contracts: user pivot, repository guides, current v3 audit, official
  four judging criteria, exact `INC-482` fixture.
- Verification: contract search finds no mandatory-proposal, presence-only assignment,
  excerpt-as-history, agent-supplied mode, or general-document claim; independent plan
  reviewer reports no unresolved ownership/contract blocker; typecheck and golden
  digest/range validation pass. Then the coordinator creates one explicit-file C0
  checkpoint commit, records its SHA in the handoff, and never stages user-owned media,
  `.gitignore`, or unrelated changes.

### S1 — reference domain, revisions, tasks, and comments — completed
- Owner / isolation: one implementation worker; exclusive new v4 domain paths only.
- Scope and key files: `src/domain/repository-service.ts`, its tests, and v4 surface
  reconciliation/range helpers under `src/repository/`, including the production public
  example builder that returns the normalized-exact completed r4/av10 clone from empty
  input (fresh IDs/credentials/times/colors only; invariant graph/content/provenance).
- Must not touch: UI, API routes, WebMCP, Supabase, v3 files.
- Inputs / frozen contracts: C0 checked types, hero golden, replay/concurrency rules.
- Verification: focused tests prove exact templates; full immutable snapshots/digests;
  human, direct-agent, reviewed-agent, and restore revisions; comments/replies; task
  authority attacks; two disjoint r1 results land; overlap fails; exact final r4 hero.

### S2 — additive Supabase persistence and strict adapter — completed locally; remote apply pending
- Owner / isolation: one implementation worker; exclusive migration/adapter paths only.
- Scope and key files: one CLI-generated additive migration,
  `src/domain/supabase/repository-supabase-service.ts`, and focused migration/adapter
  tests, including the service-role-only r1/av4 hero reset RPC and checked four-bootstrap-
  path outcome. Reuse existing tables only where the v4 contract remains coherent.
- Must not touch: applied migrations, UI, WebMCP, product/eval contracts.
- Inputs / frozen contracts: C0 schema/RPC namespace, checked service port, and golden
  observable semantics. S2 may implement independently; reference-service parity is an
  I1 post-S1 integration gate, not a claim made by this stream alone.
- Verification: static SQL and strict adapter tests; RLS enabled on exposed
  tables, direct table access revoked, every security-definer RPC has fixed search path,
  explicit grants, hashed bearer lookup, server-derived authority, deterministic locks,
  replay ledger, and indexed history/task/comment access. Run database advisors before
  any remote apply; remote mutation remains a release action, not inferred here.

### S3 — v4 API and page-native agent surface — completed locally
- Owner / isolation: one implementation worker; exclusive v4 transport/WebMCP paths.
- Scope and key files: `src/app/api/repository-v4/**`,
  `src/components/repository/repository-http-service.ts`,
  and `src/webmcp/repository-*` including bridge/registration/executor tests. This stream
  owns the preview/eval-only reset route and separate `/agent/tasks` and
  `/agent/tasks/wait` handlers, but not reset semantics or fixture construction.
- Must not touch: runtime selection, root/page wiring, barrels, config/scripts, v4 editor
  CSS/TSX, migration, v3 namespace, or contracts after C0.
- Inputs / frozen contracts: C0 service port, exact six-tool catalog, JSON schemas,
  cancellation, and error names.
- Verification: exact route/catalog oracle; malformed/forged inputs fail; all results are
  JSON serializable; callbacks capture immutable page identity and use live state;
  navigation/session teardown removes tools/listeners/timers; review tasks cannot direct
  commit and direct tasks cannot escape their stored range.

### S4 — postmortem/product-document workspace UI — completed locally
- Owner / isolation: one UI worker after C0; exclusive component/test paths, developing
  against the frozen
  `RepositoryBrowserClientPort` and a deterministic fake.
- Scope and key files: `src/components/repository/**` except the HTTP service and bridge,
  focused CSS, component tests, and fake-backed browser tests. Reuse proven v3 selection,
  context-menu, focus, conflict, presence, and drawer patterns without editing the v3
  component.
- Must not touch: `src/app/**`, runtime, config/scripts, domain, Supabase, WebMCP
  implementation, v3 compatibility route, or current demo media.
- Inputs / frozen contracts: C0 templates, interaction labels, client port, and fake.
- Verification: first-run two-card template picker; clear final document dominates;
  Threads/History rail; anchored comment/reply; durable assignee; explicit default
  Review vs Direct fieldset; direct/review provenance; full diff and historical snapshot;
  restore; resolved-task discovery; WebMCP-off usability; keyboard path and 390px no
  overflow with 44px controls.

### I1 — serialized runtime, page, config, and parity integration — completed
- Owner / isolation: coordinator only, serialized after S1-S4 outputs are reviewable.
- Scope and key files: `src/domain/repository-runtime.ts`, `src/app/page.tsx`,
  `src/app/issue/[shareToken]/page.tsx`, route/runtime seams, any new barrels,
  `vitest.config.ts`, `.codex/verify.sh`, and v4 scripts in `package.json`.
- Must not touch: user-owned demo media or `.gitignore`; never stage by directory.
- Inputs: S1 reference service, S2 adapter, S3 HTTP/WebMCP surface, S4 client-port UI.
- Verification: local/reference/Supabase-adapter parity; both runtime branches compile;
  v4 API/repository/protocol tests are included by Vitest; the fast gate runs a v4 reset
  and hero oracle as well as retained v3 compatibility; package scripts expose v4 agent
  and release gates. Integration fixes return to the owning stream where possible.

### S5 — deterministic example, evaluation, and release story — active; local gates complete
- Owner / isolation: coordinating task after I1 integration.
- Scope and key files: v4 reset harness, `e2e/`, `evals/`, `README.md`, sanitized
  native/browser captures, `demo/shot-script-v4.md`, narration/captions, rendered
  sub-three-minute MP4, thumbnail/contact sheet, public video description, Devpost draft,
  and v4 result/manifest artifacts. Preserve existing v3 evidence as dated compatibility
  only and never overwrite user-owned walkthrough inputs.
- Must not touch: production example/reset/domain/route code except evidence-backed
  corrections returned to its owning stream.
- Inputs / frozen contracts: exact `INC-482` golden and Product document smoke.
- Verification: five repair-free local/adapter rehearsals; `.codex/verify.sh`; production
  build; full desktop/390px driven flow; supported-client native discovery, owned task
  reads, Direct commit, Review proposal/comment/acceptance, resolved-discussion recovery,
  immutable history, and authority failures; WebMCP-off ablation; sanitized exact-SHA
  evidence. Deployment, repository visibility, YouTube upload, and Devpost submission
  require their own release authority/observation.

### S6 — adversarial visual and competition judging — active; official visual review unavailable
- Owner / isolation: fresh read-only design judge plus four fresh criterion judges.
- Scope: running release candidate, exact evidence, submission copy, and <3 minute cut.
- Must not touch: source during scoring. Evidence-backed corrections return to the owning
  stream and force a fresh run.
- Inputs / frozen contracts: official criteria and internal stricter anchors.
- Verification: desktop and 390px visual verdict contain no BLOCK; preliminary judges
  name their strongest gap and may return `mustFix: null`; every genuine non-null
  must-fix is corrected and re-evaluated. Final judges cite eligible evidence, have
  `mustFix: null`, score WebMCP `5.0`, other criteria `>=4.5`, and total `>=19/20`.

## Checkpoints

- Full snapshots/digests cannot be stored or retrieved -> kill the Git/repository claim;
  do not relabel activity excerpts as history.
- Task mode is not checked inside the same transaction as mutation -> kill `DIRECT`.
- A direct task can modify outside its stored anchor, self-upgrade, or forge authorship ->
  block integration and release.
- Disjoint stale-base tasks cannot safely rebase -> require re-inspection/retry and narrow
  the concurrency claim; never imply CRDT/automatic merge.
- Native host requests its own confirmation -> keep Ratiflow's product mode accurate and
  describe the host boundary; do not claim zero universal confirmations.
- The rail competes visually with the finished postmortem -> remove secondary chrome
  until the document is unmistakably primary.
- WebMCP-disabled users cannot read, edit, comment, manage tasks, inspect history, or
  restore -> block release.
- Native invocation, exact-SHA identity, or public package is missing -> mark the
  corresponding claim PENDING; never upgrade adapter or prose evidence.

## Integration order

`C0 checkpoint -> (S1 || S2 implementation || S3 port/WebMCP || S4 fake-backed UI) ->
I1 serialized runtime/page/config integration + S1/S2 parity -> S5 gates/rehearsals ->
dev-visual-review -> S6 preliminary judges -> evidence-backed fixes -> fresh final
judges -> authorized release actions`.

Contract/type decisions stay in the coordinating task. Collaboration workers in this
environment share one checkout, so they do not run Git or pretend to have independent
worktrees: parallel writing is allowed only in the disjoint paths above. The coordinator
alone reviews diffs, owns every hotspot, and creates commits using an explicit file
allowlist—never `git add -A`, a directory-wide add, or a cherry-pick that could hide
overlap. A worker that needs a reserved path stops and hands the change back. Preserve
the user-owned walkthrough files and never amend the deployed v3 evidence commit.

## Risks and open decisions

- Official deadline is September 4, 2026 04:00 SGT. Freeze C0 by September 2 04:00,
  target local code freeze September 3 16:00, and reserve the final twelve hours for
  native evidence, corrections, public package, and submission.
- GitHub is a useful metaphor, not the end-user interface. Use plain labels: Threads,
  Tasks, History, Review required, Can edit directly, Compare, Restore.
- Anonymous possession-of-link is the POC access model. Sessions may expire, but v4
  history must not silently disappear with a browser session. Never describe the link as
  private authenticated storage.
- One page token delegates the current collaborator's permissions to whatever compatible
  agent they bring. Do not claim verified model identity; record the server-known human
  principal, actor type, task, and optional unverified client label separately.
- Ratiflow supplies governed document/task context, not fake access to production data,
  logs, or code. The Data, Logs, and Builder agents bring those capabilities externally.
- The current v3 exact-SHA deployment and 1:55 walkthrough are compatibility artifacts,
  not v4 proof. The working tree contains user-owned video assets that remain uncommitted.

---
# Archived plan — Make the human-to-agent handoff obvious
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
