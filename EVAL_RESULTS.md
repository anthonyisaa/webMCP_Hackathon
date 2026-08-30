# Ratiflow evaluation results

Status ledger for the frozen v1.2 contract. Local pre-release verification is recorded
separately from release evidence. A missing deployed capture remains `PENDING`; this
file never converts a local or adapter-only pass into a release claim.

## Release identity

| Field | Value |
|---|---|
| Commit SHA | `PENDING — fill from release candidate` |
| Deployed HTTPS URL | `PENDING — clean-session URL` |
| Fixture version | `hero-v1.2` |
| Last protocol run (UTC) | `2026-08-30T11:22:37Z — uncommitted pre-release worktree` |
| Native surface/client | `Codex desktop in-app Browser — local production build; deployed release rerun PENDING` |
| Agent model/version | `PENDING` |

## Evidence status

| Layer | Command / artifact | Result | Evidence class |
|---|---|---|---|
| A — protocol | `.codex/verify.sh` / `pnpm eval:protocol` | **PASS locally: 40/40 across 8 files**; release SHA/cloud RPC rerun pending | AUTOMATED |
| B — native product journey | Codex desktop in-app Browser at `http://localhost:3100` | **PASS locally:** native discovery/invocation, 6→8→7→8→3→4 tools, stale rejection, native recovery/preparation, UI-only ratification, downstream read; deployed capture pending | NATIVE_CAPTURED — LOCAL ONLY |
| B — two-browser hero | `RATIFLOW_BASE_URL=http://localhost:3100 pnpm exec playwright test e2e/hero.spec.ts` | **PASS locally: 1/1** against optimized build; cloud rerun pending | AUTOMATED |
| B — accessibility/mobile | same command, `e2e/accessibility.spec.ts` | **PASS locally: 1/1** at 390px; cloud rerun pending | AUTOMATED |
| C — A01 zero-priming | `evals/results/agent/<model>/A01/1..5.json` | 0/5 recorded | PENDING |
| C — A02 stale recovery | `evals/results/agent/<model>/A02/1..5.json` | 0/5 recorded | PENDING |
| C — A03 capability respect | `evals/results/agent/<model>/A03/1..5.json` | 0/5 recorded | PENDING |
| C — A04 human authority | `evals/results/agent/<model>/A04/1..5.json` | 0/5 recorded | PENDING |
| C — A05 why-not planning | `evals/results/agent/<model>/A05/1..5.json` | 0/5 recorded | PENDING |
| C — A06 continuity | `evals/results/agent/<model>/A06/1..5.json` | 0/5 recorded | PENDING |
| C — A07 downstream handoff | `evals/results/agent/<model>/A07/1..5.json` | 0/5 recorded | PENDING |
| Ablation | `evals/results/ablation/<model>/summary.json` | PENDING dynamic vs static-superset runs | PENDING |

## Release gate

Release remains blocked until the 40-test Layer A pass is repeated against the live
Supabase boundary and release commit, native N01–N11 captures exist on the deployed
judging surfaces, A02/A05 meet 4/5, A04 has zero safety failures, and five consecutive
clean production rehearsals pass. The protocol goldens and exact stale response are
committed under [`evals/goldens/`](evals/goldens/); raw run artifacts must be added
without secrets or browser storage.

## Limitations / not tested

- The final Supabase-backed URL, release-commit native capture, Chrome Inspector pass,
  model trajectories, ablation result, and five-run production rehearsal are pending.
- The local native run used the real page-owned `document.modelContext` surface in the
  Codex in-app Browser. It is meaningful implementation evidence but not a substitute
  for repeating the same run on the deployed release URL and recording a sanitized
  artifact with client version, timestamp, and commit SHA.
- Playwright's second window is an explicitly deterministic synthetic driver using the
  same UI and service routes. The manual in-app Browser run also opened and operated
  Jordan's distinct attributed session; neither local run replaces cloud persistence.
