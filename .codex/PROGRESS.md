# Progress — Ratiflow
_Updated: 2026-08-30T19:31:03+08:00_

## Next action
After the user explicitly confirms Supabase organization `anthonyisaa's projects`
(`vercel_icfg_Xch7Yhjww7zc2brfrFzvdQew`), call `get_cost` for one project and present
the quoted recurring price for explicit acknowledgement; do not create it before both
connector gates are satisfied.

## In flight
- Provision `ratiflow-webmcp` in `ap-southeast-1`, apply both ordered migrations, run
  RPC/advisor checks, bind server-only credentials in Vercel, deploy, and rerun release.
- Still needed: five production rehearsals, Chrome/OpenAI captures, agent evals/ablation,
  public GitHub, and the user's narrated video.

## Verified
- `.codex/verify.sh` — TypeScript, ESLint, and 40/40 Vitest tests passed.
- `pnpm build` — optimized Next.js 16 production build passed with all seven routes.
- `RATIFLOW_BASE_URL=http://localhost:3100 pnpm exec playwright test e2e/hero.spec.ts e2e/accessibility.spec.ts` — 2/2 passed against the optimized build.
- Codex in-app Browser — real `document.modelContext` completed rev 7→11 with dynamic
  discovery, exact stale recovery, Jordan, WebMCP preparation, Maya ratification,
  downstream read, and zero browser errors.
- Fresh visual fallback — SHIP for data truth, coherence, anti-slop, and 390px fit; FLAG only because its own driver could not claim the popup. Configured `design-judge` role was unavailable.

## Done this block
- Built and pushed commit `1cf872c` (`Build Ratiflow WebMCP collaboration demo`) to `origin/main`.
- Built the frozen 5-state/10-tool contract, runtimes, WebMCP bridge, two-person UI,
  evals, README, demo ledger, 2:46 script, and Devpost copy.
- Fixed false popup-blocked feedback, selected/committed state clarity, accountable handoff
  wrapping, provenance attribution, RPC validation, and all golden-contract drift.

## Files touched
- `src/`, `supabase/` — product, native WebMCP, domain/runtime, and database boundary.
- `evals/`, `e2e/`, `EVAL_RESULTS.md` — goldens and evidence gates.
- `README.md`, `demo/`, `.codex/PLAN.md` — judge narrative and release plan.

## Open decisions / risks
- Vercel production still serves the old lifecycle probe; do not present it as Ratiflow.
- GitHub repository remains private and is a submission blocker until release.
- Live Supabase migration parsing/security behavior is unverified until provisioning.
