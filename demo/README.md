# Ratiflow submission ledger

This folder tracks the v3 recording and release evidence. Check an item only after the
exact build has produced the named artifact. The flagship is the shared document; the
preserved `/decision-demo` route is compatibility context, not v3 proof.

## Canonical demo promise

**People direct. Agents propose. Decisions remember.**

Two people share one clean decision memo, with one paired agent per person. Maya's agent
is already active on the page: it inspects the memo and waits through WebMCP. Jordan
selects the October 15 recommendation, uses the pointer-origin right-click **Rewrite**
action, and assigns the exact range and instruction to Maya.

The assignment resolves the pending wait. Maya's agent reads document Memory, lists
only its own assigned work, and submits the frozen beta/GA proposal. The memo remains
unchanged until Jordan—the work creator—accepts it in the ordinary UI with rationale.
Acceptance changes both human sessions atomically and records the diff, proposer,
accepter, and reason. A fresh agent then recovers the rejected eight-export-day fact
from Memory even though that fact is absent from the final memo.

The demo's native tool lifecycle is exact:

1. `inspect_document`
2. `wait_for_my_work`
3. `read_document_memory`
4. `list_my_work`
5. `submit_work_proposal`

The page exposes all five definitions from page start so a host's turn-start tool
snapshot cannot strand newly assigned work. The server accepts a proposal only for the
authenticated paired agent's pending order. No WebMCP tool can assign, directly edit,
accept, reject, cancel, or choose an actor, assignee, or text range.

## Fast public proof

1. Open [the public app](https://ratiflow-webmcp.vercel.app).
2. Choose **Open completed example**. The final memo opens with **Memory** visible.
3. Choose **Copy agent prompt**, paste it into the browser agent while the note remains
   open, and leave that turn running.
4. Ask: “What decision should this memo not repeat?” The fresh paired agent can retrieve
   the rejected eight-day fact that is absent from the final memo.

For the live two-person loop, open the share link in a second browser profile. The
assignee starts the same agent prompt before the creator assigns selected text. The
prompt repeats bounded 20-second `wait_for_my_work` calls while the turn is active, so
the assignment resolves the waiting call. **Check now** only refreshes page state; it
cannot start or wake an external model.

## Recording contract

Use the [2:40 shot script](shot-script.md). The first native tool invocation must be
visible by 0:45; the final render must be no longer than 2:40. Use the deterministic
synthetic Northstar fixture and two genuinely isolated human sessions. A supported
native client must operate only through page tools after a human opens the authorized
top-level session paths.

Required visible beats:

- [ ] Calm memo, quiet **Work | Memory** margin, two attributed humans, and no stage,
  permanent composer, always-open prompt, dashboard, or chat transcript.
- [ ] Native discovery of exactly the five page tools, followed by a real
  `inspect_document` invocation and an active `wait_for_my_work` by 0:45.
- [ ] Jordan selects the frozen BODY range `[16, 71)`, uses an unmodified pointer
  right-click, chooses **Rewrite**, assigns Maya, and confirms the exact instruction.
- [ ] Jordan's assignment resolves Maya's already-pending native wait with
  `WORK_AVAILABLE` at revision 1/activity 2.
- [ ] Maya's agent calls Memory and My Work, sees only its assigned order, and uses the
  server-governed proposal capability.
- [ ] The agent submits the exact October 15 beta / November 1 GA proposal and summary;
  both humans see it while the source sentence and revision remain unchanged.
- [ ] Only Jordan sees enabled decision controls. Jordan enters the complete frozen
  rationale and accepts; both sessions show revision 2/activity 4 and completed work.
- [ ] Memory shows one acceptance event with server diff and human rationale—not a
  separate edit—and the five-tool catalog remains stable after queue drain.
- [ ] A fresh Maya-paired agent calls `inspect_document` and `read_document_memory`, then
  cites Jordan's eight-day rejected-GA rationale rather than inventing it from the final
  text.
- [ ] Narration clearly distinguishes an already-active external agent from a page that
  starts or hosts agent turns.

Required supporting evidence outside the main cut:

- [ ] Shift/Alt/Ctrl/Meta pointer right-click branches, Context Menu key, `Shift+F10`,
  empty selection, and non-editor targets preserve the native menu; the real spelling
  menu is captured manually.
- [ ] `Cmd/Ctrl+K` opens the same assignment composer with the exact selection.
- [ ] The editor remains usable at 390px and with WebMCP absent.
- [ ] Dirty local drafts survive remote saves and expose **Use latest** / **Keep mine**.
- [ ] Sharing creates a distinct member; expired/invalid links recover safely.
- [ ] Evaluation fragments are validated, stored, and scrubbed before registration;
  no bearer path, token, cookie, or browser storage appears in footage or evidence.
- [ ] Navigation to `/decision-demo` removes every v3 document tool, wait, timer, and
  listener before the compatibility catalog registers.

## Evidence status — 2026-09-01

| Gate | Current status |
| --- | --- |
| `.codex/verify.sh` | **PASS — 3/3 private-reset CLI tests and 287/287 Vitest tests across 34 files**, plus TypeScript and ESLint. |
| Production build | **PASS locally.** |
| v3 Playwright | **PASS — 13/13 locally and 13/13 against production**, including completed-example bootstrap, browser identity persistence, collaboration, race guards, real-pointer acceptance at desktop and 390px, WebMCP-off interaction, and conflict recovery. Adapter paths are not native proof. |
| Persistence | **REMOTE APPLY OBSERVED.** The v3 workspace and optional-decision-note migrations are live in Supabase project `klhedesewgixoeslxiti`; the observed advisor introduced no new finding. |
| Production database/app | **PASS.** Hosted browser tests exercised the public Supabase-backed app. |
| Exact-SHA deployment/canonical URL | **READY.** Runtime `d6a3a4215eb8baf3799ffd5eb3d242dde0c737f7`, deployment `dpl_AD8nuEvUfZgSmvqpQawjsZWj4UC7`, [public app](https://ratiflow-webmcp.vercel.app). |
| Supported-client native capture | **PARTIAL, OBSERVED.** Exactly five tools with the new multi-item descriptions were discovered and `list_my_work` was invoked natively on this production SHA. Multi-item proposal submission and the full N01–N12 capture remain pending. |
| Protected-reset adapter rehearsal | **PASS — 5/5 locally.** Exact fixture, pointer assignment, Jordan tool-layer exclusion, active-wait teardown, and fresh-context memory are covered; native/timing/release proof remains pending. |
| v3 agent trajectories / ablation | **PENDING.** A01–A07 require five exact-SHA native runs each; the comparison is `native-v3` versus `webmcp-disabled`. Historical v1.2 runs do not count. |
| v3 agent-ledger validator | **53/53 focused tests PASS; canonical ledger `PENDING`.** Missing, filtered, identity-drifted, unsafe, or failed run matrices exit nonzero. |
| Exact-SHA release manifest | **PENDING, fail-closed.** The validator's 25/25 focused tests pass; `pnpm eval:release:v3` resolves content-addressed artifacts and cannot exit zero while any required domain, browser, native, rehearsal, visual, judge, or public-package row is missing. |
| Independent criterion judges | **ALL TOP-10-CREDIBLE PASS, no blockers:** WebMCP 4.7/5, Execution 4.7/5, Impact 4.6/5, Creativity 4.6/5. |

Release-row status is deliberately explicit: N01–N12 are all still `PENDING`; the
local 5/5 run is only an `ADAPTER_CAPTURED` preflight for R01. R01 release completion
and R02 timing, R03 SHA-bound claim manifest, and R04 public package remain pending.
The exact row definitions live in [the evaluation contract](../EVALS.md), and current
evidence classes live in [the results ledger](../EVAL_RESULTS.md).

## Authorized release steps

The owner authorized the full release path. Completed remote actions are checked only
after their result was observed:

- [x] Approve one clean runtime commit and record its exact SHA.
- [x] Apply and smoke the v3 migration on production, including v2 compatibility,
  authorization, grants/revokes/RLS, and advisor review.
- [x] Deploy and promote that exact SHA; record the deployment identity and accessible
  judging URL only after observation.
- [x] Capture native discovery and `list_my_work` on the exact deployed top-level page.
- [ ] Capture native proposal submission and the complete N01–N12 matrix.
- [ ] Run five clean native 2:40 rehearsals on the exact release.
- [ ] Run and validate five exact-SHA native trajectories for each v3 A01–A07 scenario,
  plus the controlled `native-v3` versus `webmcp-disabled` ablation.
- [ ] Rerun four fresh official-criterion judges against the complete release package.
- [ ] Make the source repository public with the MIT license and sanitized evidence.
- [ ] Record, upload to YouTube, and verify the public narrated video without sign-in.
- [ ] Submit on Devpost and record the observed submission link/status.
- [ ] Populate the one exact-SHA v3 release manifest and require
  `pnpm eval:release:v3` to return `PASS` before claiming release readiness.

## Evidence boundaries

- Browser automation or an injected `modelContext` validates lifecycle behavior but is
  never labeled native discovery.
- The v3 migration's static audit is not a remote apply, database smoke, or production
  persistence claim.
- Presence is bounded viewing/editing awareness, not character-level CRDT co-editing.
- Possession of a temporary share link grants access; the note is not marketed as
  private authenticated storage.
- All Northstar names and facts are deterministic synthetic demo data.
- Historical `/decision-demo` artifacts remain scoped to that route and must never be
  relabeled as v3 shared-document evidence.

Store only sanitized screenshots, transcripts, native captures, release metadata, and
final public links in this folder. Never commit session bundles, share tokens, cookies,
API keys, private note content, or raw unsanitized agent transcripts.
