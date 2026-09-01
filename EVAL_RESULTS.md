# Ratiflow evaluation results

Status ledger for the v3 Northstar document release candidate. This ledger separates
local implementation evidence from release evidence. A local test, injected
`modelContext`, compatibility result, or older production capture never counts as a
native v3 release pass.

## v3 release identity

| Field | Current state |
|---|---|
| Flagship | Northstar shared-document collaboration hero |
| Release commit SHA | **PENDING** — the working tree is intentionally dirty; no clean v3 release SHA exists |
| Deployed v3 HTTPS URL | **PENDING** — the hosted surface has not been shown to match this v3 candidate |
| Remote v3 data plane | **PENDING** — the additive v3 Supabase migration has not been applied remotely |
| Supported-client native v3 capture | **PENDING** — no fresh agent-side invocation has been recorded |
| Public source repository | **PENDING** |
| Public narrated video | **PENDING** |
| Devpost submission | **PENDING** |

## v3 evidence ledger

| Layer | Command / scope | Result | Evidence class | What it establishes |
|---|---|---|---|---|
| Fast gate | `.codex/verify.sh` | **PASS: 3/3 private-reset CLI tests plus 273/273 Vitest tests across 32 files** | `AUTOMATED` | TypeScript, lint, private reset safety, protocol, domain, runtime, adapter, route, agent-ledger, and release-manifest checks covered by the repository gate |
| Production build | `pnpm build` (Next.js webpack path) | **PASS** | `AUTOMATED` | The current candidate produces a production build |
| Northstar document browser journey | Hardened v3 Playwright suite | **PASS: 8/8** | `ADAPTER_CAPTURED` | Human editing, selection assignment, real-pointer acceptance at desktop and 390px, proposal/decision flow, responsive behavior, WebMCP-off behavior, and injected capability behavior covered by the suite |
| Compatibility browser gate | Preserved `/decision-demo` plus live-session suite | **PASS: 10/10** | `ADAPTER_CAPTURED` | The superseded decision demo and its live-session contract remain operational; this is not v3 flagship or native proof |
| Protected-reset rehearsal | `pnpm eval:rehearse:adapter` on an isolated reset-enabled local server | **PASS: 5/5 consecutive** | `ADAPTER_CAPTURED` | Exact frozen IDs/content/counters, wait-before-assignment, real pointer assignment/acceptance, Jordan tool-layer exclusion, active-wait abort/empty-registry teardown, fresh Maya context, memory recovery, and route isolation; not native, narrated timing, or clean-SHA release proof |
| Native command precondition | `pnpm eval:native:smoke` in ordinary local headless Chromium | **FAIL CLOSED: `document.modelContext` absent** | `AUTOMATED` | The command now targets only the v3 catalog and refuses to convert an unsupported browser into a native pass |
| Private canonical reset | `node --test scripts/reset-document-hero-v3.test.mjs` | **PASS: 3/3** | `AUTOMATED` | Service-role request, strict result validation, mode-0600 secret output, and non-leaking failures are covered without a live network call |
| Persistence implementation | v3 Supabase migration and adapter audit | **PASS: static audit** | `AUTOMATED` | SQL/adapter shape, authorization boundaries, and error semantics passed static review; no remote migration or runtime database result is claimed |
| Native WebMCP execution | Supported Chrome/ChatGPT agent against a deployed matching v3 release | **PENDING** | `PENDING` | No qualifying v3 capture exists |
| v3 agent-ledger validator | `pnpm eval:agent:v3` | **PENDING, fail-closed; 53/53 focused validator tests pass** | `AUTOMATED` | The empty canonical ledger exits nonzero; old fixtures, filtered matrices, incomplete/unsafe transcripts, identity drift, and failed A01–A07 bars cannot return `PASS` |
| v3 agent trajectories | A01–A07, five native runs each | **PENDING** | `PENDING` | No exact-SHA `document-hero-v3` trajectory ledger exists; historical v1.2 runs are excluded |
| v3 WebMCP ablation | `native-v3` versus `webmcp-disabled` | **PENDING** | `PENDING` | No controlled v3 comparison exists; the historical static-superset comparison is excluded |
| Independent visual review | Configured `design-judge` | **UNAVAILABLE** | `PENDING` | The configured role was unavailable on all five attempts; no substitute review is presented as a pass |
| v3 release manifest | `pnpm eval:release:v3` | **PENDING, fail-closed; 25/25 focused validator tests pass** | `AUTOMATED` | Content-addressed D01–D24, B01–B16, N01–N12, R01–R04, release-operation, trajectory, ablation, visual, judge, and public-package evidence must bind one clean source SHA before the CLI can exit zero |

The browser automation may inject or adapt `document.modelContext` to exercise the
contract deterministically. That is valuable protocol evidence, but it is **not** a
native supported-client WebMCP capture. Native proof requires a supported agent client
to discover and invoke the tools on a deployed URL that matches the eventual clean v3
release SHA.

## Contract-row release status

| Contract row | Current status | Release requirement |
|---|---|---|
| N01 Discovery | **PENDING** | Observe exactly the four initial v3 tools on the scrubbed top-level page |
| N02 Inspect invocation | **PENDING** | Invoke `inspect_document` natively and capture the exact Northstar r1/av1 result |
| N03 Memory invocation | **PENDING** | Invoke bounded, ascending decision memory natively with its untrusted-content boundary |
| N04 Active wait/lost-wake | **PENDING** | Start Maya's native wait before Jordan assigns and capture `WORK_AVAILABLE` at r1/av2 |
| N05 Assignee filtering | **PENDING** | Capture Maya-only owned work and Jordan-agent exclusion |
| N06 Conditional proposal | **PENDING** | Observe the temporary proposal tool, native proposal submission, and unchanged r1 content |
| N07 Cross-session projection | **PENDING** | Capture Jordan seeing the proposal while the selected source remains unchanged |
| N08 Human boundary/acceptance | **PENDING** | Show no agent decision tool, Jordan's UI acceptance, r2/av4 sync, and proposal-tool removal |
| N09 Fresh-agent memory | **PENDING** | A fresh native turn must retrieve the eight-export-day fact absent from final content |
| N10 Wait outcomes | **PENDING** | Capture `DOCUMENT_CHANGED`, `TIMEOUT`, `WAIT_ALREADY_ACTIVE`, deadline, and future-cursor behavior |
| N11 Abort/teardown | **PENDING** | Capture abort and navigation cleanup with no active waits, timers, listeners, or v3 tools |
| N12 Runtime health | **PENDING** | Record clean setup-through-navigation health with no secret or pre-scrub registration leakage |
| R01 | **`ADAPTER_CAPTURED` preflight: 5/5; release row pending** | Repeat the complete hero five times from the authorized canonical reset using native page tools, with no manual repair |
| R02 | **PENDING** | Record first native action by 0:45 and a complete narrated run no longer than 2:40 |
| R03 | **PENDING** | Bind every public claim and artifact to the exact release SHA and evidence class |
| R04 | **PENDING** | Verify the free live URL, public source/license, sanitized evidence, and publicly visible YouTube demo |

## Four-criterion pre-release judge snapshot

These are current pre-release scores, not submission scores. All four gates remain
failed until their must-fix evidence is addressed and the judges are rerun.

| Official criterion | Current score | Gate | Current strength | Must-fix before release |
|---|---:|---|---|---|
| WebMCP Leverage | **4.0 / 5** | **FAIL** | Dynamic, revision-bound document tools and conditional proposal capability are exercised locally | Capture the exact v3 hero through native tool discovery and execution in a supported client against the matching deployed release |
| Execution | **4.1 / 5** | **FAIL** | Fast gate, production build, readable Work/Memory rail, hardened browser journey, and real-pointer acceptance on desktop and mobile pass locally | Run the complete journey through real supported-client WebMCP on the exact clean, Supabase-backed deployed SHA |
| Potential Impact | **4.2 / 5** | **FAIL** | The pain-first story and focused human-plus-agent loop make the anti-repetition value legible | Show a fresh native agent retrieve the rejected fact and avoid the rejected plan, backed by the matching WebMCP-disabled comparison |
| Creativity & Ambition | **4.3 / 5** | **FAIL** | The live Page capability line makes paired temporary authority and its return to read-only tools judge-visible without claiming agent presence | Capture the cross-human wait, temporary authority, human decision, and anti-loop memory behavior natively on the matching public release and compare WebMCP-disabled behavior |

The blocker common to all four judges is the absence of supported-client native v3
evidence tied to the exact public deployment and clean release SHA. Remote migration,
visual review, R01–R04, v3 trajectories/ablation, and completion of the authorized publication remain
separate release blockers. Each judge's latest local-only finding—tool-layer
privacy/teardown, rail legibility, pain-first framing, and capability visibility—was
implemented and confirmed closed; none upgrades adapter evidence to native proof.

## Release gate

The v3 candidate is not submission-ready. The remaining release evidence is:

1. Apply and verify the additive v3 Supabase migration on the intended remote project.
2. Produce a clean release SHA and deploy that exact v3 candidate to HTTPS.
3. From a fresh supported agent client, record native tool discovery and invocation for the Northstar hero; do not use an injected adapter as the capture.
4. Capture and validate the v3 A01–A07 agent trajectories and the controlled
   `native-v3` versus `webmcp-disabled` ablation.
5. Rerun all four independent criterion judges against the release evidence and clear their must-fix findings.
6. Complete an independent visual review when the configured `design-judge` role is available.
7. Publish the authorized source repository and narrated video, then complete the Devpost submission.
8. Populate the exact-SHA manifest and require `pnpm eval:release:v3` to return `PASS`.

## Superseded v1.2 compatibility/history — not v3 evidence

The following evidence belongs only to the earlier decision-workspace v1.2 release. It
is retained for regression history and must not support a v3 score, release gate, or
submission claim.

| Historical item | Superseded v1.2 result |
|---|---|
| Release SHA | `1c47d88f37688b065d910798f3be35b865ab1091` |
| Hosted surface | [https://ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app) — historical v1.2 surface, not accepted as a deployed v3 URL |
| Repository gate | 56/56 across 11 files |
| Native release capture | [N01–N11](evals/results/native/codex-in-app-browser/2026-08-30T141842Z/release.json) passed for the v1.2 contract |
| Browser and rehearsal | 7/7 local, 7/7 production, and 20/20 deterministic rehearsal checks |
| Agent scenarios | A01–A07 passed for the v1.2 fixture |
| Dynamic/static ablation | [30/30 combined runs](evals/results/ablation/summary.json) passed for v1.2 |

The current 10/10 `/decision-demo` and live-session compatibility result shows that this
older surface remains preserved. It does not convert its earlier deployment, native
capture, agent runs, or ablation into evidence for the Northstar v3 document flagship.
