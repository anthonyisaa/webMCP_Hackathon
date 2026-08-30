# Progress — Ratiflow
_Updated: 2026-08-31T01:22:20+08:00_

## Next action
After explicit user authorization, make `anthonyisaa/webMCP_Hackathon` public and
verify anonymous repository access before the user records/uploads the narrated video.

## In flight
- Only public GitHub visibility and the user-owned sub-three-minute video remain.
- Production stays at product SHA `1c47d88f37688b065d910798f3be35b865ab1091`;
  evidence/docs SHA `454cc14bdf38bc39dad403be599b862f32222cc4` is pushed.

## Verified
- `.codex/verify.sh` — TypeScript, ESLint, and 56/56 tests across 11 files passed.
- `pnpm build` — Next.js 16.3.3 production build passed.
- `RATIFLOW_BASE_URL=https://ratiflow-webmcp.vercel.app pnpm exec playwright test e2e/hero.spec.ts e2e/accessibility.spec.ts e2e/followup-context.spec.ts e2e/webmcp-session-reset.spec.ts` — 7/7 passed, including real two-window collaboration.
- `RATIFLOW_BASE_URL=https://ratiflow-webmcp.vercel.app pnpm eval:rehearse` — 20/20 passed.
- `node evals/agent/validate.ts evals/results/agent --mode release` — all A01–A07 bars passed; 35/35 runs.
- `node evals/agent/validate.ts evals/results/ablation/combined-runs.json --mode ablation` — all six bars passed; dynamic 91/13/10 calls/invalid/stale versus static 102/23/17; timing is non-comparable.
- Cloud connectors — Supabase `ACTIVE_HEALTHY` with three migrations; Vercel production
  `READY` in `iad1`, canonical alias present, no latest-hour runtime errors.

## Done this block
- Committed and pushed sanitized native, agent, and ablation evidence.
- Added machine-enforced A02/A06 bars and transcript-content secret scanning.
- Closed the final independent claim audit and mapped all four Devpost answers to shots
  and evidence.
- Set GitHub About description/homepage; MIT license detection is confirmed.

## Files touched
- `evals/agent/`, `evals/results/` — validator and release evidence.
- Release docs, `demo/`, and `.codex/` — final claims, mappings, and gates.

## Open decisions / risks
- Repository visibility remains `PRIVATE`; do not change it without explicit approval.
- Video recording/upload is user-owned; use `demo/shot-script.md`.
- Connected Chrome lacks `document.modelContext`; recorded as a client limitation.
