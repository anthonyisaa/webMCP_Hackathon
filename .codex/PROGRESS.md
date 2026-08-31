# Progress — Ratiflow
_Updated: 2026-09-01T07:41:10+08:00_

## Next action
Make the GitHub repository publicly reachable, then verify the unauthenticated release
URL returns the intended `main` source.

## In flight
- Production `dpl_Eu6yHDLetV2SrceXdEMTins7DVVw` is `READY` at
  `https://ratiflow-webmcp.vercel.app/`.
- Runtime source commit `8be25fb` is pushed to `origin/main`; unauthenticated GitHub
  requests currently return 404, so public submission reachability is not claimed.

## Verified
- `.codex/verify.sh` — TypeScript, ESLint, 161/161 tests across 25 files.
- `pnpm build` — Next.js 16.3.3 webpack production build passed.
- `RATIFLOW_BASE_URL=https://ratiflow-webmcp.vercel.app pnpm exec playwright test
  e2e/live-agent-session.spec.ts` — 3/3 on the current production deployment; the
  earlier complete release suite passed 19/19.
- Supported production-native Browser — fresh two-tool discovery; catch-up; join;
  ordinary-UI task woke `wait_for_activity`; claim returned `ok: true`,
  `ownedByCurrentSession: true`, `claimIdVisible: false`; task-linked resolve returned
  `DONE`; leave returned `AWAY` and collapsed discovery to two tools.
- Vercel — canonical alias resolves to the current `READY` deployment; no post-cutover
  runtime error cluster or deployment 5xx response.
- `git push origin HEAD:main` — `65aadb7..8be25fb`.

## Done this block
- Shipped the single-registry live/catch-up teammate loop, leases, opaque activity,
  fenced tasks, human questions/answers, attribution, and human-only ratification.
- Redacted the private claim generation from every model-visible result while retaining
  it inside the trusted page adapter for task-linked writes.
- Updated release evidence to require an observed native human-event trajectory.

## Files touched
- `src/domain/`, `src/app/api/workspace/`, `supabase/migrations/` — authoritative live
  collaboration persistence and routes.
- `src/webmcp/`, `src/components/system/WebMCPBridge.tsx` — one registry, lifecycle,
  private claim retention/redaction.
- `README.md`, `.codex/PLAN.md`, `demo/README.md` — current deployment and native proof.

## Open decisions / risks
- Auto pickup stays visibly unavailable; no page wakeup, background, or autonomous
  runner claim is made.
- `design-judge` was unavailable; no independent visual verdict is claimed.
- Public narrated video is still pending.
