# Progress — Ratiflow
_Updated: 2026-09-02T02:36:00+08:00_

## Next action
After explicit user authorization, apply the v4 Supabase migration and deploy audited
`HEAD` to a reset-enabled preview; record its SHA and deployment ID before capture.

## In flight
- The pivot is a complete local candidate: exactly two templates, named shared-link
  collaboration, Comment/Review/Direct tasks, discussions, immutable revisions,
  restore/conflict handling, and six top-level WebMCP tools.
- Remote migration/advisors, exact-SHA deployment, native N01–N10, 30 agent runs,
  ablation, public repository/video, and Devpost remain `PENDING` release actions.
- `design-judge` remains unavailable; no independent visual SHIP is claimed.

## Verified
- `.codex/verify.sh` — TypeScript/ESLint, v3 reset 3/3, v4 reset 4/4, and Vitest
  408/408 across 55 files pass.
- `pnpm build` — Next.js webpack build passes with `/new` and v4 routes.
- `RATIFLOW_BASE_URL=http://localhost:3000 pnpm eval:browser:v4` — 10/10;
  `pnpm eval:rehearse:v4` — 50/50 over five runs without repair.
- `pnpm eval:agent:v4`; `pnpm eval:release:v4` — schema-valid, intentionally
  fail-closed `PENDING` (0/30 trajectories; no release identity).
- Local supported-client diagnostic — exact six tools, successful reads, clean `/new`
  teardown; not deployed-native proof.
- Two independent wait/transport audits — `mustFix: null` after adversarial
  deadline, lost-wake, cancellation, duplicate, outage, and cleanup coverage.

## Done this block
- Completed the document-first service, API, WebMCP, UI, Supabase layer,
  goldens, adversarial matrices, browser suites, validators, and demo copy.
- Closed the Supabase wait boundary race: exact nominal deadline, bounded authoritative
  final refresh, honest no-snapshot failure, abort preservation, and first-wait ordering.

## Files touched
- `src/{app,components/repository,domain,repository,webmcp}/`, `supabase/` — v4 runtime.
- `src/domain/supabase/repository-supabase-service{,.test}.ts` — final wait correction.
- `e2e/`, `evals/`, `scripts/`, `.codex/verify.sh`, docs, `demo/*-v4.md` — evidence.

## Open decisions / risks
- Link access, 30-day retention, and turn-scoped waits are POC constraints.
- Preserve user-owned `.gitignore`, `--annotate`, `demo/build-ux-walkthrough.py`,
  `demo/video-assets/`, and `demo/video-output/`; they are outside the v4 checkpoint.
