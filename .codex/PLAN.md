# Plan — Build and submit Ratiflow to the WebMCP Challenge
_Updated: 2026-08-30T17:49:20+08:00_

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

Provisional public name: **Ratiflow**. Internal codename `Aperture` may remain in old
notes only. Positioning: “Agents prepare. People ratify. Work moves.”

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

### G0 — Repository foundation and native validation probe — active
- Owner / worktree: coordinating task in the root checkout until the first base commit.
- Scope and key files: repository initialization/linking, `AGENTS.md`, `.codex/verify.sh`,
  minimal Next.js shell, one-page WebMCP probe, `VALIDATION.md`, first Vercel preview.
- Must not touch: product domain schema, polished product UI, final tool catalog.
- Inputs / frozen contracts: current WebMCP draft and official surface documentation.
- Verification: deployed HTTPS page is reachable; `document.modelContext` discovery,
  registration/AbortSignal removal, `toolchange`, JSON result, cancellation, and error
  rendering are observed on every available judging surface and recorded with browser,
  client, URL, and date.

### C0 — Product and interface contract freeze — pending
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

### S1 — Domain, persistence, and collaboration — pending
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

### S2 — Capability compiler and WebMCP lifecycle — pending
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

### S3 — Product experience and visual system — pending
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

### S4 — Evals and reliability evidence — pending
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

### S5 — Demo, submission, and release evidence — pending
- Owner / worktree: coordinating task owns `demo/`, `README.md`, public submission copy,
  release checklist, screenshots/transcripts, and final deployment evidence.
- Scope and key files: running shot/evidence list, sub-2:59 script, demo reset procedure,
  Devpost four-answer copy, OSS/license/readme quality, exact judging setup instructions.
- Must not touch: product behavior to manufacture a cleaner recording.
- Inputs / frozen contracts: verified deployed product and committed eval results.
- Verification: first 10–15 seconds show a working product; every claim maps to a visible
  shot or committed artifact; clean judge session completes five times; public repo,
  public YouTube URL, live URL, license, and all Devpost fields are checked before freeze.

### I0 — Page integration and production deployment — pending
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
- Two-person realtime adds nondeterminism after one focused repair pass -> keep the real
  second window for the video and use a clearly labeled deterministic synthetic driver
  only in automated evals.
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
- 2026-09-01 18:00 — deterministic suite green and Chrome native smoke captured.
- 2026-09-02 12:00 — all v1.2 agent runs complete; visual review corrections landed.
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

- GitHub `anthonyisaa/webMCP_Hackathon` exists but is currently private and empty. Keep
  private during build; public visibility is a release gate.
- The current local directory is not a git checkout. Link it to the empty remote before
  implementation and preserve the existing two planning documents.
- The competition deadline is 2026-09-04 04:00 SGT. Target a submission-ready freeze by
  2026-09-03 12:00 SGT, leaving sixteen hours for judge-surface rehearsal and upload.
- Ratiflow is provisional until C0 and must be finalized by 2026-08-31 06:00 SGT. The
  coordinator owns the one-time replacement across specs, UI copy, and submission docs.
- Supabase/Vercel creation is authorized, but cloud resources wait until contracts are
  frozen to avoid duplicate projects and migrations.
- Human-only means: no WebMCP tool or agent-specific endpoint can ratify. It is not a
  claim that an arbitrary browser-driving agent or same-session attacker cannot click or
  imitate the human UI route.
