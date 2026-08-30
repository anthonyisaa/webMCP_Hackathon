# Demo and submission ledger

This folder is the running source of truth for recording and submission evidence. A box
becomes checked only after a live run, committed result, screenshot, transcript, or
public link exists. As of 2026-08-30, completed items below are backed by sanitized
release artifacts; recording and public-repository release remain pending.

## Canonical demo promise

A Product Lead, Engineering Lead, and agent share one launch-scope decision. Selecting
an option changes the page's actual native WebMCP tools. A second attributed participant
reduces capacity in another browser. A revision-7 agent write is rejected with the exact
human-authored revision-8 diff, after which the agent recovers, prepares a review card,
and the Product Lead ratifies in the ordinary UI. The downstream launch brief and
provenance timeline then update.

The deterministic Northstar scenario is synthetic. If a synthetic collaborator driver
is used, label it onscreen and ensure it uses the same UI and service path as the second
browser; it cannot be a timer, single-window mock, or fabricated mutation.

## Recording script

Use the [2:46 narrated shot script](shot-script.md). It starts with a working product,
then shows native discovery, live capability removal, stale recovery, UI-only
ratification, downstream propagation, and provenance. Rehearse against a reset workspace
and replace every planned marker with observed footage before upload.

## Required video evidence

- [ ] Working product appears within the first 10–15 seconds.
- [ ] Normal human UI is visibly useful without developer tools or WebMCP.
- [ ] An agent discovers tools from the live top-level page with no connector, API key,
  OAuth, or copied workspace ID.
- [ ] Page selection visibly changes the actual discovered tool set.
- [ ] Jordan's attributed second-browser action changes capacity from 18 to 14.
- [ ] Maya's page visibly becomes `CONTESTED` and native discovery loses
  `prepare_decision` after refetch.
- [ ] The old revision-7 `add_evidence` request shows `STALE_WORK_STATE` and Jordan's
  exact 18 → 14 / `READY` → `CONTESTED` diff.
- [ ] The agent refreshes, compares options, recommends O2, and prepares without manual
  repair.
- [ ] Maya edits if needed and ratifies in the ordinary human UI; no WebMCP ratify tool
  is shown or used.
- [ ] `customer-launch-brief` visibly changes from `BLOCKED` to `READY` after
  ratification.
- [ ] Provenance distinguishes ordinary UI, WebMCP, and any labeled synthetic-demo work.
- [ ] Narration is clear, the public YouTube runtime is below 3:00, and the final upload
  plays without sign-in.

## Submission gates

- [ ] Public GitHub repository is reachable without sign-in, includes all source, MIT
  license, local setup, and this evidence ledger.
- [x] Free, unrestricted product URL is tested from a clean session and will remain
  accessible for the full judging period. Record final URL and deployment identity here:
  `https://ratiflow-webmcp.vercel.app` — deployment `dpl_4ypxF5YvesYkHztgok6m3NAFfrZX`,
  release SHA `1c47d88f37688b065d910798f3be35b865ab1091`.
- [ ] Public narrated YouTube URL is below three minutes and plays without
  authentication. Record it here: `PENDING — record and upload`.
- [x] All four current Devpost written questions are answered. Copy each prompt verbatim
  into the final submission worksheet, map each answer to a visible shot or committed
  artifact, and avoid claims beyond recorded evidence.
- [x] Final Devpost answer 1 maps to the 0:12–1:37 beats, native N01–N07, and ablation.
- [x] Final Devpost answer 2 maps to the 0:50–2:37 beats, native N03–N11, and browser suite.
- [x] Final Devpost answer 3 maps to the 0:29–2:37 beats and A02/A04/A06/A07 evidence.
- [x] Final Devpost answer 4 maps to the 0:12–1:57 beats, capability contract, protocol
  suite, and native release capture.
- [x] Native WebMCP client/date/commit/deployed URL, before/after tools, structured
  results, screenshot, and console result are recorded for N01–N11 (browser version is
  null): [release capture](../evals/results/native/codex-in-app-browser/2026-08-30T141842Z/release.json).
- [x] Protocol and browser results are recorded and sanitized: 56 tests/11 files,
  production browser 7/7, and deterministic rehearsal 20/20.
- [x] Agent trajectories, ablation, and final clean judging rehearsal are complete:
  dynamic scenarios 35/35, matched ablation 30/30, and five consecutive hero repeats
  represented by the 20/20 production rehearsal checks.

## Evidence boundaries

- The earlier deployment was a lifecycle probe; current release evidence is recorded in
  [VALIDATION.md](../VALIDATION.md).
- A browser test or in-page `getTools()` check does not establish native-client
  discovery. Capture the supported native judging surface from the deployed product.
- Do not commit cookies, membership handles, private workspace content, API keys, raw
  browser storage, or unsanitized agent transcripts.

## Recording assets

Add sanitized screenshots, native discovery captures, transcripts, final links, and
release metadata here. Keep raw secrets and private browser artifacts out of Git.
