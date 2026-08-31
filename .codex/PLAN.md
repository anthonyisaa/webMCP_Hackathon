# Plan — Make the agent a live decision-room teammate
_Updated: 2026-09-01T01:59:59+08:00_

## Goal and ambition mode

Replace Ratiflow's one-shot agent demo with one observable human-agent collaboration
loop on the decision workspace: a browser agent can join, catch up from an opaque
cursor, wait for teammate activity, claim addressed work, act under its own identity,
ask a person a question, resume after the answer, resolve the task, and leave. The
optional in-page runner remains visibly unavailable because its model authorization,
native-loop, and spend gate did not pass; no fallback path simulates autonomy.

Ambition mode is **brownfield product correction under the challenge deadline**. The
decision workspace becomes the flagship `/` surface and remains available at
`/decision-demo`; the shared-document route is preserved as a secondary artifact but
is not the submission's human-agent-loop claim. Existing revision checks, dynamic
capability compilation, provenance, and human-only ratification remain non-negotiable.
There is still no headless/background agent, no service-worker execution, no promise
that a page can wake ChatGPT, and no agent tool that ratifies, commits, or finalizes a
decision.

The current 26 Aug WebMCP draft, not the feedback's stale API notes, is authoritative:
`getTools`/`executeTool` are now specified for in-page agents; normative annotations are
`readOnlyHint` and `untrustedContentHint` (not `destructiveHint`);
`document.modelContext` remains primary with the observed `navigator` fallback.

## Chokepoint — freeze first

Freeze `docs/contracts/live-agent-session-contract.md`, the collaboration additions in
`docs/contracts/capability-contract.md`, their checked mirror in
`src/contracts/index.ts`, the additions to `RatiflowServicePort`, the
`AgentToolRegistryPort`, and the collaboration view/fixture types before implementation
streams start. C0 also owns a deployed native feasibility spike; implementation streams
do not start until at least one real async wait is observed resolving by event, timeout,
and cancellation on the supported surface, or the live-wait claim is explicitly
removed from scope.

The frozen kernel must define:

- a server-assigned, opaque, monotonically ordered activity cursor independent of
  workspace revision, plus bounded catch-up semantics and event types;
- the existing `agent_ratiflow_demo` as a real participant with TTL/lease-derived
  `LIVE | LIVE_AUTO | IDLE | AWAY` presence and last-seen time;
- a cryptographically random page-session ID issued on page mount/reset, bound
  server-side to the workspace and authenticated demo-agent handle, rotated on reset,
  rejected after revocation or expiry, and never accepted as model tool input. The
  browser lease is 45 seconds and renewed by waits/reads; `IDLE` begins after lease
  expiry and `AWAY` after two minutes or explicit leave. Task claim leases are 90
  seconds and renewed only by the current owner;
- addressed inbox tasks, `OPEN | CLAIMED | WAITING_HUMAN | DONE | CANCELLED` lifecycle,
  atomic expiring claims used by **both** browser and auto callers, request replay, and
  exactly-once visible effects;
- comments and human-input questions with target, actor, caller attribution, and an
  ordinary-UI answer path;
- standing instructions `{ autoPickup, scopes, maxActionsPerHour }`, off by default,
  enforced server-side rather than only hidden in UI;
- trusted execution context
  `{ caller: "BROWSER_AGENT" | "AUTO_RUNNER", pageSessionId, agentSessionToken, signal }`
  supplied by adapters and never accepted from model tool input;
- one caller-neutral registry that owns definitions, schemas, availability, validation,
  and handlers. Native WebMCP registration and the page runner are adapters over that
  registry, never independent action paths. The registry is page/client-neutral; the
  page holds its one runtime instance. The server-side model route is a stateless,
  authenticated **planner only**: it receives a bounded task transcript and tool
  schemas, returns a proposed tool call, and never imports or executes registry
  handlers. The page validates and executes proposals through the same registry used by
  native WebMCP;
- exact session tools `join_session`, `wait_for_activity`, `catch_up`, and
  `leave_session`; compact reads `get_state_brief`, `get_thread`, and `get_inbox`;
  coordination writes `claim_agent_task`, `resolve_task`, `post_comment`, and
  `request_human_input`; plus the existing phase/selection-gated decision tools;
- initial discovery that makes `join_session` and `catch_up` the two honest first moves;
  joining unlocks the live surface, catch-up unlocks invoked mode, and leaving/lease
  expiry closes live-only capabilities without aborting waits for unrelated selection
  changes;
- read timeouts as successful empty results, wait timeout default 20 seconds and cap
  30 seconds until native-client measurements justify a larger value, cancellation via
  the invocation signal, and no claim that a model response itself is guaranteed within
  two seconds;
- no ratification/finalization tool. Maya's ordinary-UI transaction remains the only
  accepted commitment path.

The frozen service façade owns session issue/renew/leave, bounded catch-up, task CRUD,
atomic claim/resolve, comments, questions/answers, standing instructions, budget
authorization, and activity subscription. The registry façade owns tool discovery and
execution only. The frozen UI fixture exposes the same collaboration view shape as the
HTTP service—no UI-only state vocabulary.

## Outcome and release evidence

- Core loop implemented through one registry and one server-authoritative state model.
- Production deployment `dpl_Eu6yHDLetV2SrceXdEMTins7DVVw` is `READY` at the
  canonical URL; the current deployment has no post-cutover runtime error clusters or
  5xx responses.
- `.codex/verify.sh` passes TypeScript, ESLint, and 161/161 tests across 25 files;
  `pnpm build` passes the Next.js 16.3.3 webpack production build.
- Hosted production browser evidence passes 19/19 scenarios; the focused live loop was
  re-run against the current deployment and passes 3/3.
- The supported in-app Browser natively discovered the exact fresh two-tool catalog,
  caught up, joined as the canonical `Ratiflow Agent`, and woke a pending
  `wait_for_activity` from a task created in the ordinary UI. It claimed the task with
  no model-visible `claimId`, resolved it through the adapter's retained private claim,
  left, and observed contraction back to the two fresh tools.
- The read-only `design-judge` role was unavailable. Mobile and accessibility flows
  passed, but no independent visual verdict is claimed.

## Streams

### C0 — Live-session contract and spike harness — completed
- Owner / checkout: coordinating task in the current preserved dirty worktree.
- Scope and key files: this plan, `product_spec.md`, `EVALS.md`,
  `docs/contracts/live-agent-session-contract.md`, capability contract, checked types,
  service/registry/view façades, and a minimal deployed native wait spike fixture.
- Must not touch: implementation until the contract receives fresh adversarial review.
- Verification: `rg -n "implemented|measurement|deliberately rejected" EVALS.md` maps
  every feedback claim; contract tests typecheck; a dated native probe records event,
  timeout, cancellation, maximum consecutive waits, confirmation behavior, and exposed
  namespace. A fresh reviewer finds no cursor/revision conflation, untrusted caller
  field, presence-without-TTL, hidden duplicate path, or agent ratification. Claim-race
  safety remains an S1 executable gate, not a paper-review claim.

### S1 — Activity, session, inbox, and claim domain — completed
- Owner / files: worker owns `src/domain/ratiflow-*`, `src/domain/supabase/ratiflow-*`,
  `src/app/api/workspace/` collaboration/session endpoints,
  `src/components/product/http-service.ts`, one additive CLI-named migration, and
  focused domain/route/migration tests.
- Scope: cursor-addressed activity, agent presence leases, tasks/comments/questions,
  standing instructions, atomic claim/release/resolve, action budgets, caller
  attribution, replay safety, and long-poll reads. Existing decision mutations append
  matching activity without weakening revision or ratification rules.
- Must not touch: React UI other than the owned HTTP adapter, WebMCP registry, root
  pages, fixture service, or frozen contracts.
- Verification: `pnpm test -- src/domain/ratiflow-live-session.test.ts
  src/app/api/workspace/live-session-routes.test.ts` passes timeout/event/cancellation/
  cursor tests; browser-vs-auto and
  auto-vs-auto claim races; lease expiry; toggle off/on; hourly budget; question/answer;
  every accepted agent effect has exactly one attributed activity event.

### S2 — Single registry and native lifecycle — completed
- Owner / files: worker owns `src/webmcp/`, `src/components/system/WebMCPBridge.tsx`, and
  focused registry/registration tests.
- Scope: caller-neutral registry, session/inbox tools, existing decision tools through
  the same handlers, fresh/invoked/live registration modes, stable wait lifetimes,
  dynamic phase/selection writes, browser claim enforcement, and AbortSignal cleanup.
- Must not touch: persistence, API routes, visual UI, planner route, or frozen
  contracts. `WebMCPBridge.tsx` and the registry are exclusively S2-owned until this
  stream lands; the coordinator integrates only afterward.
- Verification: `pnpm test -- src/webmcp/live-registry.test.ts
  src/webmcp/live-registration.test.ts` passes exact schemas/order, initial two-tool
  surface, join/catch-up expansion,
  phase diffs, wait unaffected by selection, leave/expiry contraction, stale context,
  cancellation, JSON serializability, and direct-registry/native-handler equivalence.

### S3 — Page-triggered auto runner and AI boundary — deferred at release gate
- Owner / files: worker owns `src/agent/`, the runner route under `src/app/api/agent/`,
  package dependency changes, and focused tests.
- Entry gate: S1 + S2 + S4 must first pass the local two-browser live-loop spec and C0
  must retain the native wait claim. If Gateway auth/cost control is not safe, this
  stream is deferred and the UI reports auto pickup unavailable without weakening the
  browser-agent loop.
- Scope: visible-page-only, opt-in, debounced runner; claim before inference; bounded
  step loop; current AI Gateway model discovered from the live catalog; prompt-injection
  boundary; registry schemas supplied to the stateless planner; proposed calls returned
  to the page and executed through its registry instance; no registry-handler imports in
  the route; no session/destructive/human-only tool use; release/retry on model failure;
  abort on hidden/unmounted page.
- Must not touch: registry definitions, domain internals, decision UI, or contracts.
- Verification: `pnpm test -- src/agent/auto-runner.test.ts
  src/app/api/agent/plan/route.test.ts` proves the route cannot execute a handler and
  fake-planner tests cover on/off, live-session suppression, claim loss,
  max steps/actions, hidden-page cancellation, gateway 402/429/unavailable degradation,
  and browser/runner use of the same registry callback.

### S4 — Live decision-room UI and primary route — completed
- Owner / files: worker owns `src/components/product/`, `src/app/page.tsx`, narrowly
  scoped `src/app/globals.css`, and live-session Playwright coverage.
- Scope: agent participant/presence chip, waiting badge and inbox, Ask-agent task entry,
  attributed comments/activity, inline question cards, standing-instruction control,
  runner state, and an agent-capabilities panel driven by actually registered tools.
  Promote the decision workspace to `/` without deleting `/document/[shareToken]`.
- Must not touch: domain, migration, registry, frozen types,
  `src/components/product/http-service.ts`, or `WebMCPBridge.tsx`.
  `decision-workspace.tsx`, `fixture-service.ts`, `types.ts`, `globals.css`, root route,
  and UI specs are exclusively S4-owned until this stream lands.
- Verification: `pnpm exec playwright test e2e/live-agent-session.spec.ts` passes
  two-browser task arrival, join/wait/activity with p95 under two seconds from accepted
  human POST to wait result receipt (model latency excluded),
  model latency, answer round trip, capabilities changing with decision state, auto
  pickup off/on, no double-visible result, keyboard/mobile behavior, and the complete
  human ratification path.

### I0 — Integration, release evidence, and handoff — completed with recorded limits
- Owner: coordinating task after S1-S4.
- Scope: resolve seams, install/migrate only after local gates, run the real AI path,
  deploy, measure the supported ChatGPT surface, update submission material, and record
  residual client limits honestly.
- Verification: focused suites, `.codex/verify.sh`, `pnpm build`,
  `pnpm exec playwright test e2e/live-agent-session.spec.ts e2e/hero.spec.ts
  e2e/accessibility.spec.ts`, driven browser flow,
  fresh `$dev-visual-review`, production logs, database advisors, and dated native
  evidence for loop count, timeout, read confirmations, background-tab behavior,
  document-vs-navigator namespace, return shape, and a real teammate event.

## Checkpoints

- A wait call is cancelled by ordinary selection/context-epoch changes -> split stable
  session registrations from target-scoped registrations before continuing.
- Browser and auto callers can infer against the same task without one holding a claim
  lease -> block runner work and fix the server contract.
- A tool input can select actor, caller, origin, workspace, or claim owner -> block.
- Auto pickup runs while off, hidden, over budget, or while a live browser session owns
  the room -> block.
- Gateway auth/cost controls cannot be exercised safely on the deployed anonymous demo
  -> ship live session and catch-up, but keep auto pickup visibly unavailable rather
  than simulating success.
- Native ChatGPT allows too few wait iterations for a useful turn -> shorten waits to
  the measured safe value and present live mode honestly; never fake page-to-agent push.
- Read-only live-loop calls trigger repeated confirmations -> record the client limit
  and rescope the demo rather than mislabeling mutating tools.
- Any path lets an agent ratify/commit/finalize -> block release.

## Integration order

1. Freeze C0, run the minimal deployed native wait go/no-go, and obtain fresh
   adversarial review.
2. Land S1 while S2 builds against the frozen service façade and S4 builds against
   frozen view/fixture types; their file ownership is disjoint and the coordinator does
   not edit their seams concurrently.
3. Integrate registry + UI locally; prove server claim races and the two-browser loop.
   Only then admit S3, which builds a planner boundary and page adapter against the
   landed registry façade.
4. Integrate the optional runner, then run the repository gate, build, accessibility,
   full hero regression, and independent
   visual review.
5. Apply the additive migration, deploy, verify Gateway and production health, then run
   the native day-one spikes before updating any submission claim.
6. Refresh `.codex/PROGRESS.md` with exact evidence, unsupported client behavior, and
   the one next action.

Conflict hotspots are `src/contracts/index.ts`, the service port, bridge props,
`decision-workspace.tsx`, and root routing. The coordinator owns those seams and no
worker may revert the preserved document-editor changes.

## Risks and open decisions

- The feedback's “reacts within two seconds” is decomposed into a measurable page/tool
  delivery latency and separately reported model/write latency; the latter depends on
  the client and confirmation policy.
- `leave_session` is best-effort. TTL leases, not a final tool call, determine safety.
- Browser-agent claims must be explicit or atomically bundled with inbox pickup; an
  internal-only runner claim cannot prevent duplicate inference.
- The anonymous public runner creates a real spend boundary. Server-side action budgets,
  Vercel Gateway limits, visible consent, and graceful unavailability are release gates.
- Native browser behavior remains empirical. Current spec support for in-page
  `getTools`/`executeTool` does not prove ChatGPT exposes those methods to page script;
  the runner therefore keeps its own registry reference.
- Existing source is uncommitted and deployed. Preserve it; commit/push remains a
  separate owner-authorized action.

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
