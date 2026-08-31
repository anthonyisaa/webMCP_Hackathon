# Progress — Ratiflow
_Updated: 2026-09-01T02:21:57+08:00_

## Next action
Push the verified live-loop source to `origin/main`, promote the corrected build to
production, then natively confirm claim → task-linked write returns no model-visible
`claimId`.

## In flight
- Preview `dpl_FZqrq8ppGF5MoKe84vQ5K8mJWzh8` is `READY` with the redaction fix.
  Its protected URL was not opened with the temporary share token; the same source was
  driven locally through the supported native Browser.
- Production `dpl_23TBRzj8rcKRE5eSCsbqJK7T2Dob` runs the prior source. The native
  teammate loop works, but claim output exposes its private generation. Do not call
  production fully corrected before promotion and recheck.
- Owner explicitly authorized the GitHub push and production promotion from this
  detached, isolated worktree.

## Verified
- `.codex/verify.sh` — TypeScript, ESLint, 161/161 tests across 25 files.
- `pnpm build` — Next.js 16.3.3 webpack production build passed.
- Hosted `e2e/live-agent-session.spec.ts` — 3/3 after final migration; earlier hosted
  release suite 19/19.
- Supported production native run — join; real wait wake from Maya's task; claim;
  attributed comment; question/release; human answer; catch-up; fresh claim; resolve;
  leave; final two-tool catalog. This exposed the claim leak.
- Corrected local native run — `claimOk: true`, `claimIdVisible: false`,
  `taskOwned: true`; a subsequent task-linked comment succeeded, proving private
  adapter retention.
- Preview is `READY`; current production has no post-cutover runtime error cluster or
  5xx. Supabase lists nine migrations through `normalize_agent_display_name`.
- `git diff --check` — clean.

## Done this block
- Replaced the one-shot demo with leases, opaque activity, fenced tasks,
  questions/answers, attribution, one registry, and human-only ratification.
- Fixed lease renewal ambiguity, null task serialization, agent identity,
  equal-revision UI races, and the model-visible claim leak. Updated contracts and
  submission copy to the honest no-wakeup loop.

## Files touched
- `src/domain/`, `src/app/api/workspace/`, `supabase/migrations/` — persistence and
  authoritative routes.
- `src/webmcp/`, `src/components/system/WebMCPBridge.tsx` — registry, lifecycle,
  private claim retention/redaction.
- `src/components/product/`, `src/app/`, `e2e/`, `docs/contracts/`, `demo/` —
  flagship UI, verification, contracts, and release story.

## Open decisions / risks
- Production promotion needs approval; public source/video remain owner-controlled.
- Auto pickup stays unavailable; no background/wakeup claim is made.
- `design-judge` was unavailable; no independent visual verdict is claimed.
