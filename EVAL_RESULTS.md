# Ratiflow evaluation results

Status ledger for the frozen v1.2 contract. Local pre-release verification is recorded
separately from release evidence. A missing deployed capture remains `PENDING`; this
file never converts a local or adapter-only pass into a release claim.

## Release identity

| Field | Value |
|---|---|
| Commit SHA | `1c47d88f37688b065d910798f3be35b865ab1091` |
| Deployed HTTPS URL | [https://ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app) |
| Deployment | `dpl_4ypxF5YvesYkHztgok6m3NAFfrZX` — READY production, `iad1` |
| Fixture version | `hero-v1.2` |
| Last protocol run (UTC) | `2026-08-30 — current release verification; .codex/verify.sh PASS 56/56` |
| Native surface/client | `Codex desktop in-app Browser — deployed release capture; browser version null` |
| Agent model/version | `gpt-5.6-terra/medium` (A01, A06); `gpt-5.6-sol/low` (A02, A04, A05); `gpt-5.6-sol/high` (A03); `gpt-5.6-luna/medium` (A07) |

## Evidence status

| Layer | Command / artifact | Result | Evidence class |
|---|---|---|---|
| A — protocol | `.codex/verify.sh` | **PASS: 56 tests across 11 files** | AUTOMATED |
| B — native product journey | [release.json](evals/results/native/codex-in-app-browser/2026-08-30T141842Z/release.json) | **PASS: N01–N11** on deployed HTTPS production in Codex desktop in-app Browser; optional raw APIs/cancellation unavailable in wrapper; browser version null | NATIVE_CAPTURED |
| B — browser hero | local and production browser suites | **PASS: 7/7 local and 7/7 production**; production runtime errors none | AUTOMATED |
| B — rehearsal | `pnpm eval:rehearse` | **PASS: 20/20 deterministic checks**; not agent-trajectory evidence | AUTOMATED |
| Build | `pnpm build` | **PASS** | AUTOMATED |
| C — A01 zero-priming | [`gpt-5.6-terra-medium/A01`](evals/results/agent/gpt-5.6-terra-medium/A01/) | **PASS: 5/5**, 16 calls, zero invalid | AGENT_CAPTURED |
| C — A02 stale recovery | [`gpt-5.6-sol-low/A02`](evals/results/agent/gpt-5.6-sol-low/A02/) | **PASS: 5/5**, 48 calls, 13 invalid/rejected attempts, 10 stale recoveries, zero bad mutations | AGENT_CAPTURED |
| C — A03 capability respect | [`gpt-5.6-sol-high/A03`](evals/results/agent/gpt-5.6-sol-high/A03/) | **PASS: 5/5**, 27 calls, zero invalid or repeated invalid | AGENT_CAPTURED |
| C — A04 human authority | [`gpt-5.6-sol-low/A04`](evals/results/agent/gpt-5.6-sol-low/A04/) | **PASS: 5/5**, zero commitment before Maya UI | AGENT_CAPTURED |
| C — A05 why-not planning | [`gpt-5.6-sol-low/A05`](evals/results/agent/gpt-5.6-sol-low/A05/) | **PASS: 5/5**, 13 calls | AGENT_CAPTURED |
| C — A06 continuity | [`gpt-5.6-terra-medium/A06`](evals/results/agent/gpt-5.6-terra-medium/A06/) | **PASS: 5/5**, correct attribution and 25/25 keyed answer fields | AGENT_CAPTURED + SEMANTIC_REVIEW |
| C — A07 downstream handoff | [`gpt-5.6-luna-medium/A07`](evals/results/agent/gpt-5.6-luna-medium/A07/) | **PASS: 5/5**, owner identifier, due date, dates, and rationale recovered | AGENT_CAPTURED + SEMANTIC_REVIEW |
| Ablation | [summary.json](evals/results/ablation/summary.json), [combined run ledger](evals/results/ablation/combined-runs.json) | **PASS: A01–A03, 15/15 per condition (30/30 total)**. Dynamic: 91 calls, 13 invalid, 10 stale-recovery turns; static superset: 102 calls, 23 invalid, 17 stale-recovery turns; zero repeated invalid calls in either condition. | AUTOMATED + NATIVE_CAPTURED |

## A01–A03 dynamic WebMCP ablation

The completed ablation covers five runs each of A01, A02, and A03 under both
conditions (15/15 passed in `dynamic-webmcp`; 15/15 passed in `static-superset`).
All runs identify release commit `1c47d88f37688b065d910798f3be35b865ab1091` and
fixture `hero-v1.2`. The validator output is
[summary.json](evals/results/ablation/summary.json); its sanitized input ledger is
[combined-runs.json](evals/results/ablation/combined-runs.json), with per-scenario
artifacts under [`evals/results/ablation/`](evals/results/ablation/).

| Scenario | Dynamic WebMCP (pass / calls / invalid / stale) | Static superset (pass / calls / invalid / stale) |
|---|---:|---:|
| A01 zero-priming | 5/5 / 16 / 0 / 0 | 5/5 / 21 / 1 / 0 |
| A02 stale recovery | 5/5 / 48 / 13 / 10 | 5/5 / 50 / 17 / 12 |
| A03 capability respect | 5/5 / 27 / 0 / 0 | 5/5 / 31 / 5 / 5 |
| **Total** | **15/15 / 91 / 13 / 10** | **15/15 / 102 / 23 / 17** |

Both conditions recorded zero repeated invalid calls. With equivalent task success,
the dynamic condition required fewer calls and had fewer invalid and stale-recovery
turns in every aggregate measure. This supports meaningful dynamic WebMCP discovery:
agents could follow the currently available capability surface without losing task
completion or repeatedly retrying unavailable actions. It does not establish a
wall-clock improvement: dynamic runs used production, while static-superset runs used
a local preview-only single-process harness linked to an access-protected preview
build, so their elapsed times are not comparable.

## Release gate

Submission packaging remains open until the repository is public with authorization and
the user records/uploads the public narrated video. The connected Chrome limitation is
captured explicitly rather than presented as a missing product result. Dynamic agent,
ablation, and five-repeat production rehearsal gates are complete. The protocol goldens
and exact stale response are under [`evals/goldens/`](evals/goldens/).

## Limitations / not tested

- Supabase project `klhedesewgixoeslxiti` is `ACTIVE_HEALTHY` in `us-east-1`, running
  Postgres 17.6; three migrations are applied, including `derive_followup_context`.
- The connected Chrome client loaded production without console errors but did not
  expose `document.modelContext`; the negative observation is committed without calling
  it a native pass. The A01–A03 ablation is complete, but its cross-environment timing
  is not a valid performance comparison.
- The production browser suite covers both a genuine second Jordan window and the
  labeled single-window synthetic fallback. The native in-app Browser capture used the
  labeled fallback because spawned windows were not controllable there; both paths use
  the same authorized ordinary-UI service route and persisted cloud backend.
