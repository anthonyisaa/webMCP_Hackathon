# Demo and submission ledger

This folder is the source of truth for recording and submission evidence. Check a box
only after the live behavior or public artifact has actually been observed. The
flagship judging flow is the live decision room at `/`; `/decision-demo` is an alias,
and the pageless shared note is preserved separately at `/document`.

## Canonical demo promise

A supported browser agent can join the Northstar decision room as **Ratiflow Agent**,
catch up from an opaque activity cursor, wait for addressed work, atomically claim one
task, comment under its own identity, ask a person a blocking question, resume after
the answer, resolve the task, and leave. The person sees the same authoritative inbox,
questions, comments, activity, and presence throughout.

The page does not pretend that adding a task starts or wakes an external model. A real
agent turn must discover the page and call `join_session` or `catch_up`. The optional
in-page runner is visibly unavailable until model authorization, spend controls, and
the native execution loop pass their release gate. Only Maya can ratify through the
ordinary UI; no WebMCP tool can ratify, commit, or finalize the decision.

## Recording script

Use the [2:40 narrated shot script](shot-script.md). Start with a reset workspace and a
fresh supported WebMCP page so the initial two-tool surface is visible. The complete
task/question loop is the main story; stale decision recovery is a short correctness
proof, not a substitute for the teammate loop.

## Required video evidence

- [ ] A fresh page advertises exactly `join_session` and `catch_up`.
- [ ] Native `join_session` makes Ratiflow Agent visibly `LIVE` and expands the
  coordination plus current decision tools.
- [ ] A person selects Northstar beta, adds a bounded task, and the UI explicitly says
  this records work but does not wake or start an external model.
- [ ] `wait_for_activity` returns the accepted human task and `claim_agent_task`
  produces one fenced claim.
- [ ] A duplicate or stale claim cannot create a second active generation or duplicate
  visible work.
- [ ] `post_comment` produces an attributed comment that appears in the ordinary UI.
- [ ] `request_human_input` releases the claim and moves the task to
  `WAITING_HUMAN`.
- [ ] A person answers in the ordinary UI; `catch_up` returns the answer and reopened
  task; the agent takes a fresh claim and resolves it.
- [ ] Maya ratifies only in the ordinary UI; native discovery never contains a
  ratify/finalize/commit tool.
- [ ] `leave_session` moves presence to `AWAY` and collapses discovery to the two
  fresh-session tools without deleting collaboration history.
- [ ] Narration is clear, the public video is below 3:00, and playback works without
  sign-in.

## Submission gates

- [x] Production deployment `dpl_Eu6yHDLetV2SrceXdEMTins7DVVw` is `READY` at
  [ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app/).
- [x] Live-session persistence and the three production repair migrations are applied
  to Supabase project `klhedesewgixoeslxiti`; advisors were reviewed.
- [x] The hosted browser suite passed 19/19 scenarios, including the complete
  task/question loop and the stale equal-revision response regression.
- [x] A supported native client discovered the exact fresh catalog; caught up; joined;
  woke on an ordinary-UI task; claimed without a model-visible `claimId`; resolved via
  the retained private claim; left; and saw catalog expansion and collapse.
- [x] Post-traffic production logs showed no runtime error cluster or 5xx response.
- [ ] A fresh independent visual grade passes. The configured read-only
  `design-judge` role was unavailable; mobile and accessibility tests are not
  relabeled as a design verdict.
- [ ] The public GitHub repository is reachable without sign-in and contains the
  intended release source.
- [ ] A public narrated video below three minutes plays without authentication.
  Record its URL here: `PENDING — record and upload`.

## Exact observed native result

On **2026-09-01 (Singapore time)**, Codex's supported in-app Browser opened the canonical
production deployment and observed:

1. Fresh discovery: `join_session`, `catch_up`.
2. `catch_up`: successful MCP content plus matching `structuredContent`, a valid opaque
   cursor, bounded activity, and `hasMore: false`.
3. `join_session`: participant name **Ratiflow Agent**; presence `LIVE`; dynamic
   expansion added live coordination and workflow-valid decision tools.
4. A task created in the ordinary UI resolved the pending native
   `wait_for_activity` with its attributed `TASK_CREATED` event and inbox item.
5. `claim_agent_task`: `ok: true`, `ownedByCurrentSession: true`, and the complete
   model-visible result contained no `claimId`.
6. `resolve_task`: successful through the adapter's retained private claim; task
   status became `DONE`.
7. `leave_session`: presence `AWAY`; discovery collapsed to the two fresh tools.

The hosted full-loop test adds the claim race, attributed comment, human-question,
answer, fresh-claim, cancellation, and abort evidence that were not repeated in this
focused native release check.

## Evidence boundaries

- WebMCP gives an active agent a page-local tool surface; this product does not claim
  page-to-agent push, model wakeup, service-worker execution, or background work after
  the page closes.
- Presence is lease-derived, not a reliable unload event. Claims are server-fenced and
  expire independently.
- Decision revision and collaboration activity cursor are different clocks.
- The anonymous launch handle is the demo access boundary. Do not describe it as
  account-authenticated or private customer storage.
- The optional page runner is unavailable, not simulated.
- Do not commit handles, cookies, environment values, raw browser storage, private
  content, or unsanitized agent transcripts.

## Recording assets

Add sanitized screenshots, native captures, the final transcript, release metadata,
and public links here. Public source and video release remain owner-authorized steps.
