# Progress — Ratiflow
_Updated: 2026-09-03T03:07:41+08:00_

## Next action
After explicit user approval, apply only
`supabase/migrations/20260902160324_managed_agent_relay_v4.sql` (SHA-256
`943455110a9ac27afd79566b64dd9b6a61dcdd2a7379ad65653f2e41167e5a74`) to Supabase
project `klhedesewgixoeslxiti`, verify RPC/RLS/ACLs, deploy the matching `main` candidate,
then run exact-SHA production/native checks.

## In flight
- v4.2 code and the 12-slide `/deck` are a reviewed local release candidate.
- Production remains v4.1 (`cf1cc80`) until the approved v4.2 database apply and matching
  deploy; local/adapter runs are not labeled deployed native evidence.

## Verified
- `.codex/verify.sh` — TypeScript, ESLint, reset safety 3/3 + 4/4, and Vitest 564/564.
- `pnpm build` passed with `/deck` and Relay routes; ordinary Chromium UI/deck passed 14/14.
- Native Chrome 152 loopback: idle/BYOA passed 1/1; two independent live-Luna judge runs
  passed Postmortem `@Code`→r6, `@General`→r7 and Product `@Data`→r7.
- Live API smoke passed `tool_search_call` → exact named `function_call` → terminal message
  on `gpt-5.6-luna` in three responses / 976 tokens.
- Security audit returned SHIP after canonical identity/spoof coverage. Read-only visual
  review returned SHIP for desktop/mobile History and the deck after the footer fix.
- Migration hash is pinned; `git diff --check`, `next-env.d.ts`, and secret scans pass.

## Done this block
- Built nickname-first two-page Postmortem/Product NUX, synthetic managed `@Data`, `@Code`,
  and `@General`, revisions/History/Restore, Advanced BYOA, and the Flight Recorder.
- Built the application-owned Luna↔WebMCP Relay with dynamic `document.modelContext` catalogs,
  server-pinned sequences, permits, leases, retries, quotas, and Supabase persistence.
- Built a keyboard/mobile/print-safe 12-slide HTML deck with truthful product-flow labels.

## Open risks / boundaries
- Mixed SQL lock ordering can cause a fail-closed PostgreSQL abort; replay remains safe.
- Deployed-native evidence, public video/package, visibility, and Devpost remain pending.
- Preserve user-owned `.gitignore`, `--annotate`, `demo/build-ux-walkthrough.py`,
  `demo/video-assets/`, and `demo/video-output/`; they are outside this candidate.
