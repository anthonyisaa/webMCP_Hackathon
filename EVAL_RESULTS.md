# Ratiflow evaluation results

Status ledger for the deployed v3 Northstar document runtime. This ledger separates
local implementation evidence from release evidence. A local test, injected
`modelContext`, compatibility result, or older production capture never counts as a
native v3 release pass.

## v3 release identity

| Field | Current state |
|---|---|
| Flagship | Northstar shared-document collaboration hero |
| Release commit SHA | `921dfc4236d6f95bbff0c4e4c4544efc6a947175` |
| Deployed v3 HTTPS URL | [https://ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app) — deployment `dpl_BvRbo4WkF9nDohFbDpCPn93gLGVb`, observed `READY` |
| Remote v3 data plane | **DEPLOYED** — v3 workspace and optional-decision-note migrations applied to Supabase project `klhedesewgixoeslxiti` |
| Supported-client native v3 capture | **PARTIAL, OBSERVED** — exact five-tool discovery plus native inspect, memory, my-work, and bounded-wait invocations on production; proposal submission and the full N matrix remain pending |
| Public source repository | **PENDING** — the configured GitHub URL returned 404 when checked signed out |
| Public narrated video | **PENDING** |
| Devpost submission | **PENDING** |

## v3 evidence ledger

| Layer | Command / scope | Result | Evidence class | What it establishes |
|---|---|---|---|---|
| Fast gate | `.codex/verify.sh` | **PASS: 3/3 private-reset CLI tests plus 285/285 Vitest tests across 34 files** | `AUTOMATED` | TypeScript, lint, private reset safety, protocol, domain, runtime, adapter, route, completed-example, agent-ledger, and release-manifest checks covered by the repository gate |
| Production build | `pnpm build` (Next.js webpack path) | **PASS** | `AUTOMATED` | The current candidate produces a production build |
| Northstar document browser journey | Hardened v3 Playwright suite | **PASS: 13/13 locally and 13/13 against production** | `ADAPTER_CAPTURED` | Human editing, completed-example bootstrap, persisted browser identity, selection assignment, real-pointer acceptance at desktop and 390px, proposal/decision flow, race guards, responsive behavior, WebMCP-off behavior, and injected capability behavior covered by the suite |
| Compatibility browser gate | Preserved `/decision-demo` plus live-session suite | **PASS: 10/10** | `ADAPTER_CAPTURED` | The superseded decision demo and its live-session contract remain operational; this is not v3 flagship or native proof |
| Protected-reset rehearsal | `pnpm eval:rehearse:adapter` on an isolated reset-enabled local server | **PASS: 5/5 consecutive** | `ADAPTER_CAPTURED` | Exact frozen IDs/content/counters, wait-before-assignment, real pointer assignment/acceptance, Jordan tool-layer exclusion, active-wait abort/empty-registry teardown, fresh Maya context, memory recovery, and route isolation; not native, narrated timing, or clean-SHA release proof |
| Native command precondition | `pnpm eval:native:smoke` in ordinary local headless Chromium | **FAIL CLOSED: `document.modelContext` absent** | `AUTOMATED` | The command now targets only the v3 catalog and refuses to convert an unsupported browser into a native pass |
| Private canonical reset | `node --test scripts/reset-document-hero-v3.test.mjs` | **PASS: 3/3** | `AUTOMATED` | Service-role request, strict result validation, mode-0600 secret output, and non-leaking failures are covered without a live network call |
| Persistence implementation | v3 Supabase migration, optional decision notes, and adapter audit | **PASS: remote apply observed** | `AUTOMATED` | The production project contains the v3 schema and nullable decision-note change; authorization/static audit passed and the observed security advisor added no new finding |
| Native WebMCP execution | Codex in-app browser against the deployed matching v3 release | **PARTIAL PASS: five tools discovered; four read/wait tools invoked** | `NATIVE_OBSERVED` | `inspect_document`, `read_document_memory`, `list_my_work`, and `wait_for_my_work` returned structured results; the bounded wait returned `TIMEOUT`. Native proposal submission and complete N01–N12 capture remain pending |
| v3 agent-ledger validator | `pnpm eval:agent:v3` | **PENDING, fail-closed; 53/53 focused validator tests pass** | `AUTOMATED` | The empty canonical ledger exits nonzero; old fixtures, filtered matrices, incomplete/unsafe transcripts, identity drift, and failed A01–A07 bars cannot return `PASS` |
| v3 agent trajectories | A01–A07, five native runs each | **PENDING** | `PENDING` | No exact-SHA `document-hero-v3` trajectory ledger exists; historical v1.2 runs are excluded |
| v3 WebMCP ablation | `native-v3` versus `webmcp-disabled` | **PENDING** | `PENDING` | No controlled v3 comparison exists; the historical static-superset comparison is excluded |
| Independent visual review | Configured `design-judge` | **UNAVAILABLE** | `PENDING` | The configured role was unavailable on all five attempts; no substitute review is presented as a pass |
| v3 release manifest | `pnpm eval:release:v3` | **PENDING, fail-closed; 25/25 focused validator tests pass** | `AUTOMATED` | Content-addressed D01–D24, B01–B16, N01–N12, R01–R04, release-operation, trajectory, ablation, visual, judge, and public-package evidence must bind one clean source SHA before the CLI can exit zero |

The browser automation may inject or adapt `document.modelContext` to exercise the
contract deterministically. That is valuable protocol evidence, but it is **not** a
native supported-client WebMCP capture. Native proof requires a supported agent client
to discover and invoke the tools on the deployed URL matching runtime SHA
`921dfc4236d6f95bbff0c4e4c4544efc6a947175`.

## Contract-row release status

| Contract row | Current status | Release requirement |
|---|---|---|
| N01 Discovery | **PARTIAL, OBSERVED** | Exactly five stable v3 tools were discovered on the deployed top-level page; the canonical sanitized artifact is still pending |
| N02 Inspect invocation | **PARTIAL, OBSERVED** | `inspect_document` was invoked natively on production; the canonical Northstar r1/av1 capture is still pending |
| N03 Memory invocation | **PARTIAL, OBSERVED** | `read_document_memory` was invoked natively on production; the canonical bounded Northstar capture is still pending |
| N04 Active wait/lost-wake | **PENDING** | Start Maya's native wait before Jordan assigns and capture `WORK_AVAILABLE` at r1/av2 |
| N05 Assignee filtering | **PARTIAL, OBSERVED** | `list_my_work` was invoked natively; canonical Maya-only and Jordan-exclusion evidence is still pending |
| N06 Governed proposal | **PENDING** | Invoke the stable proposal tool natively, submit the candidate, and capture unchanged r1 content |
| N07 Cross-session projection | **PENDING** | Capture Jordan seeing the proposal while the selected source remains unchanged |
| N08 Human boundary/acceptance | **PENDING** | Show no agent decision tool, Jordan's one-click UI acceptance, and r2/av4 synchronization |
| N09 Fresh-agent memory | **PENDING** | A fresh native turn must retrieve the eight-export-day fact absent from final content |
| N10 Wait outcomes | **PENDING** | Capture `DOCUMENT_CHANGED`, `TIMEOUT`, `WAIT_ALREADY_ACTIVE`, deadline, and future-cursor behavior |
| N11 Abort/teardown | **PENDING** | Capture abort and navigation cleanup with no active waits, timers, listeners, or v3 tools |
| N12 Runtime health | **PENDING** | Record clean setup-through-navigation health with no secret or pre-scrub registration leakage |
| R01 | **`ADAPTER_CAPTURED` preflight: 5/5; release row pending** | Repeat the complete hero five times from the authorized canonical reset using native page tools, with no manual repair |
| R02 | **PENDING** | Record first native action by 0:45 and a complete narrated run no longer than 2:40 |
| R03 | **PENDING** | Bind every public claim and artifact to the exact release SHA and evidence class |
| R04 | **PENDING** | Verify the free live URL, public source/license, sanitized evidence, and publicly visible YouTube demo |

## Four-criterion judge snapshot

These are internal critical-review scores, not Devpost scores. Every criterion judge
reviewed the simplified deployed runtime and returned a top-10-credible pass with no
must-fix blocker.

| Official criterion | Current score | Gate | Current strength | Must-fix before release |
|---|---:|---|---|---|
| WebMCP Leverage | **4.7 / 5** | **TOP-10-CREDIBLE PASS** | A supported agent discovered all five deployed tools and natively invoked the four read/wait paths, including a structured timeout | Capture native `submit_work_proposal` in the video and retain a sanitized exact-SHA artifact |
| Execution | **4.7 / 5** | **TOP-10-CREDIBLE PASS** | The deployed handoff, completed example, one-click decisions, production service composition, graceful fallback, and 13-case browser suite form a coherent product | No blocker; make browser-profile identity even more explicit before recording |
| Potential Impact | **4.6 / 5** | **TOP-10-CREDIBLE PASS** | The judge drove the completed example and verified that final text omits the rejected eight-day constraint while Memory preserves assignment, proposal, diff, decision, and rationale | No blocker; show the fresh agent cite and avoid the rejected plan in the video |
| Creativity & Ambition | **4.6 / 5** | **TOP-10-CREDIBLE PASS** | The complete topology—cross-human exact-range routing, one paired agent per browser identity, bounded page wait, proposal-only authority, human decision, and rejected-fact memory—is materially different from generic AI rewriting and single-user agent editors | No blocker; make the live handoff, native proposal, and fresh-agent anti-loop payoff the three video beats |

The exact public runtime, remote data plane, hosted browser journey, and partial native
tool invocation are now observed. The remaining release blockers are a native proposal
and full Northstar capture, visual review when the configured role is available,
R01–R04, trajectories/ablation, public source, the narrated video, and Devpost.

## Release gate

The v3 candidate is not submission-ready. The remaining release evidence is:

1. From a fresh supported agent client, record native proposal submission and the
   complete Northstar hero; do not use an injected adapter as the capture.
2. Capture and validate the v3 A01–A07 agent trajectories and the controlled
   `native-v3` versus `webmcp-disabled` ablation.
3. Record the criterion judges' highest-value proof beats in the narrated video.
4. Complete an independent visual review when the configured `design-judge` role is available.
5. Publish the source repository and narrated video, then complete the Devpost submission.
6. Populate the exact-SHA manifest and require `pnpm eval:release:v3` to return `PASS`.

## Superseded v1.2 compatibility/history — not v3 evidence

The following evidence belongs only to the earlier decision-workspace v1.2 release. It
is retained for regression history and must not support a v3 score, release gate, or
submission claim.

| Historical item | Superseded v1.2 result |
|---|---|
| Release SHA | `1c47d88f37688b065d910798f3be35b865ab1091` |
| Hosted surface | The earlier capture used the same alias before its promotion to v3; only the dated v1.2 artifact remains historical |
| Repository gate | 56/56 across 11 files |
| Native release capture | [N01–N11](evals/results/native/codex-in-app-browser/2026-08-30T141842Z/release.json) passed for the v1.2 contract |
| Browser and rehearsal | 7/7 local, 7/7 production, and 20/20 deterministic rehearsal checks |
| Agent scenarios | A01–A07 passed for the v1.2 fixture |
| Dynamic/static ablation | [30/30 combined runs](evals/results/ablation/summary.json) passed for v1.2 |

The current 10/10 `/decision-demo` and live-session compatibility result shows that this
older surface remains preserved. It does not convert its earlier deployment, native
capture, agent runs, or ablation into evidence for the Northstar v3 document flagship.
