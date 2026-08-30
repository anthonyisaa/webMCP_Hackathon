# Demo and submission ledger

This folder is the running source of truth for recording and submission evidence. A box
becomes checked only after a live run, committed result, screenshot, transcript, or
public link exists. As of 2026-08-30, the items below are planning or pending evidence;
none should be represented as passed in a submission.

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
- [ ] Free, unrestricted product URL is tested from a clean session and will remain
  accessible for the full judging period. Record final URL and deployment identity here:
  `PENDING — product redeploy`.
- [ ] Public narrated YouTube URL is below three minutes and plays without
  authentication. Record it here: `PENDING — record and upload`.
- [ ] All four current Devpost written questions are answered. Copy each prompt verbatim
  into the final submission worksheet, map each answer to a visible shot or committed
  artifact, and avoid claims beyond recorded evidence.
- [ ] Final Devpost answer 1 has an evidence link/shot reference: `PENDING`.
- [ ] Final Devpost answer 2 has an evidence link/shot reference: `PENDING`.
- [ ] Final Devpost answer 3 has an evidence link/shot reference: `PENDING`.
- [ ] Final Devpost answer 4 has an evidence link/shot reference: `PENDING`.
- [ ] Native WebMCP client/version, date, commit SHA, deployed URL, before/after tool
  lists, structured results, screenshot, and console result are recorded.
- [ ] Protocol, browser, and agent-evaluation results are committed and sanitized.
- [ ] Five consecutive clean production hero runs pass after reset.

## Evidence boundaries

- The existing deployment is a lifecycle probe, not the release product URL; see
  [VALIDATION.md](../VALIDATION.md).
- A browser test or in-page `getTools()` check does not establish native-client
  discovery. Capture the supported native judging surface from the deployed product.
- Do not commit cookies, membership handles, private workspace content, API keys, raw
  browser storage, or unsanitized agent transcripts.

## Recording assets

Add sanitized screenshots, native discovery captures, transcripts, final links, and
release metadata here. Keep raw secrets and private browser artifacts out of Git.
