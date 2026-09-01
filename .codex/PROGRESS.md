# Progress — Ratiflow
_Updated: 2026-09-01T21:22:45+08:00_

## Next action
Record the 2:40 native hero on deployed runtime `921dfc4`, including the cross-human
wait resolution, native proposal, and a fresh agent avoiding the rejected October 15 GA.

## In flight
- Runtime `921dfc4236d6f95bbff0c4e4c4544efc6a947175` is READY at
  `https://ratiflow-webmcp.vercel.app` (`dpl_BvRbo4WkF9nDohFbDpCPn93gLGVb`).
- Evidence and final judges are committed and pushed at `6d9a376`, above the deployed
  runtime SHA; do not redeploy the docs-only commit.
- Video, full native N01–N12/R01–R04 evidence, YouTube, and Devpost remain pending.

## Verified
- `.codex/verify.sh` — TypeScript, ESLint, reset CLI 3/3, Vitest 285/285 in 34 files.
- `pnpm build` — Next.js webpack production build passed for runtime `921dfc4`.
- Local v3 Playwright — 13/13 passed; hosted v3 Playwright — 13/13 passed.
- `vercel inspect` — exact deployment READY; post-suite error query returned no logs.
- Production Supabase — v3 and optional-decision-note migrations applied; advisor had
  no new finding.
- Supported Codex browser — five tools discovered; inspect, memory, my-work, and bounded
  wait invoked natively; wait returned structured `TIMEOUT`.
- Criterion judges — WebMCP 4.7, Execution 4.7, Impact 4.6, Creativity 4.6; all
  top-10-credible PASS with no blockers.

## Done this block
- Added explicit Copy prompt → paste → leave turn running instructions and truthful
  20-second bounded listening states.
- Made Accept/Reject one click; details and decision note are optional.
- Added credential-only localStorage identity/resume while content remains server-side.
- Added a one-click completed Northstar example through ordinary production services.

## Files touched
- `src/components/document/`, `src/document/` — UX and browser identity.
- `src/domain/document-workspace-example.ts`, `src/app/api/document-v3/example/` — example.
- `e2e/document-webmcp.spec.ts`, domain tests — release coverage.
- `README.md`, `EVAL_RESULTS.md`, `demo/` — exact release and submission evidence.

## Open decisions / risks
- GitHub remains private. A visibility change was rejected as broad disclosure; obtain
  explicit informed approval before exposing the entire repository. Common secret
  signatures were not found in current/history scans.
- YouTube and Devpost remain unclaimed; native proposal/full release manifest remain
  pending; configured `design-judge` was unavailable.
