# Progress — Ratiflow
_Updated: 2026-09-01T22:41:37+08:00_

## Next action
Run a confirmed native three-order write on deployed SHA `d6a3a42`, capture whether the
host resumes after action-time confirmation without reconnecting, and sanitize evidence.

## In flight
- Runtime `d6a3a4215eb8baf3799ffd5eb3d242dde0c737f7` is READY at
  `https://ratiflow-webmcp.vercel.app` as `dpl_AD8nuEvUfZgSmvqpQawjsZWj4UC7`.
- Exact-SHA deployment ledgers are refreshed locally for a docs-only follow-up commit.
- The 1:55 narrated 1080p walkthrough remains ready at
  `demo/video-output/ratiflow-ux-walkthrough.mp4` for review.

## Verified
- `.codex/verify.sh` — TypeScript, ESLint, reset CLI 3/3, Vitest 287/287 in 34 files.
- `pnpm build` — Next.js webpack production build passed.
- Local and production Playwright — 13/13 each, including desktop/390px WebMCP.
- `vercel inspect`/deployment API — READY canonical alias and metadata bind exact SHA;
  post-suite error scan returned no logs.
- Codex in-app browser — exact five new tool descriptions discovered and
  `list_my_work` invoked natively with a structured result on this SHA.
- Independent desktop/390px visual review — all dimensions SHIP after re-review.
- `pnpm eval:release:v3` — schema-valid but intentionally PENDING; the full exact-SHA
  native and public evidence matrix is absent.
- Walkthrough renderer parsed; H.264/AAC/subtitles decoded cleanly; contact sheet reviewed.

## Done this block
- Committed and pushed `d6a3a42` with only the multi-item workflow fix.
- Promoted the clean committed artifact, verified hosted flows, and observed the new
  multi-item catalog natively.
- Added truthful lifecycle/reporting, a three-order regression, and readable prompt UI
  without expanding the five-tool surface; preserved the walkthrough artifacts.

## Files touched
- `src/document/`, `src/webmcp/`, domain tests, document CSS — shipped fix.
- `README.md`, `EVAL_RESULTS.md`, `demo/*.md` — exact-SHA evidence boundary.
- `demo/build-ux-walkthrough.py`, `demo/video-*`, `.gitignore` — concurrent walkthrough
  work preserved outside the runtime commit.

## Open decisions / risks
- Native multi-item proposal submission and host confirmation continuity remain unproven;
  copied pre-authorization cannot override mandatory browser policy.
- Full native/release matrices, YouTube, Devpost, and repository visibility remain pending.
