# Progress — Ratiflow
_Updated: 2026-09-02T01:51:28+08:00_

## Next action
After explicit user authorization, apply the additive v4 Supabase migration and deploy
the current source-complete v4 `HEAD` to a reset-enabled preview, recording the exact
commit SHA and deployment ID before any native release capture.

## In flight
- The pivot is a complete local candidate: exactly two templates, named shared-link
  collaboration, Comment/Review/Direct tasks, discussions, immutable revisions,
  restore/conflict handling, and six top-level WebMCP tools.
- Remote migration/advisors, exact-SHA deployment, native N01–N10, 30 agent runs,
  ablation, public repository/video, and Devpost remain `PENDING` release actions.
- Required `design-judge` spawning remains unavailable after repeated attempts; no
  independent visual SHIP is claimed.

## Verified
- `.codex/verify.sh` — TypeScript/ESLint, v3 reset 3/3, v4 reset 4/4, and Vitest
  401/401 across 55 files pass.
- `pnpm build` — Next.js webpack production build passes with `/new` and v4 issue/API
  routes.
- `RATIFLOW_BASE_URL=http://localhost:3000 pnpm eval:browser:v4` — 10/10 journeys.
- `RATIFLOW_BASE_URL=http://localhost:3000 pnpm eval:rehearse:v4` — 50/50 across five
  consecutive runs without repair.
- `pnpm eval:agent:v4`; `pnpm eval:release:v4` — schema-valid, intentionally
  fail-closed `PENDING` (0/30 trajectories; no release identity).
- Codex in-app Browser localhost diagnostic — exact six tools; inspect/history/tasks
  reads succeeded; `/new` teardown removed all six. This is not deployed-native proof.

## Done this block
- Completed the document-first service, API, WebMCP, UI, static Supabase layer,
  goldens, adversarial matrices, browser suites, validators, and demo copy.
- Corrected four critical local-review gaps: explicit `/new`, visible/clickable revision
  lineage, named share-link join, and mobile drawer focus containment/Escape restore.

## Files touched
- `src/{app,components/repository,domain,repository,webmcp}/` and `supabase/` — v4 runtime.
- `e2e/`, `evals/`, `scripts/`, `.codex/verify.sh` — deterministic gates and ledgers.
- `README.md`, `EVALS.md`, `EVAL_RESULTS.md`, contracts, `demo/*-v4.md` — evidence/story.

## Open decisions / risks
- Link access, 30-day retention, and turn-scoped waits are POC constraints.
- Preserve user-owned `.gitignore`, `--annotate`, `demo/build-ux-walkthrough.py`,
  `demo/video-assets/`, and `demo/video-output/`; they are outside the v4 checkpoint.
