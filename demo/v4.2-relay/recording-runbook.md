# Live walkthrough and screenshot runbook

This is a capture and narration plan only. It does not create or edit video. The seven
beats use two fresh public demo copies: one Postmortem lineage for beats 2–6 and one
Product lineage for beat 7. Beat 1 is the clean picker that starts the Postmortem take.

## The sentence to keep straight

Use this wording whenever scope or turn-by-turn behavior comes up:

> The page uses WebMCP to switch from the idle catalog to one role- and run-scoped
> catalog for Code, Data, or General. Those role tools stay stable for that managed run.
> The relay then pins one required discovered function per Luna continuation. Luna
> composes the arguments; the page executes the call; server-side scope and revision
> rules enforce the result.

Short version: **WebMCP scopes the role/run; the relay scopes the turn.** Never imply a
per-turn WebMCP catalog swap or autonomous workflow selection by Luna.

## Preflight: do not record below this line until it is green

1. Record the approved candidate's full Git SHA and deployment origin. Open only the
   canonical deployment root in the capture browser; never paste or expose an `/issue/`
   URL on screen.
2. Confirm the candidate passed the repository gate and production build:

   ```bash
   .codex/verify.sh
   pnpm build
   ```

3. Confirm the exact production candidate passed the repair-free live trajectory. This
   spends live Luna calls and must run only when the release operator has the required
   credentials and approved URL:

   ```bash
   RATIFLOW_BASE_URL=https://approved-production-origin.example \
   RATIFLOW_LIVE_LUNA_JUDGE=1 \
   RATIFLOW_REQUIRE_FIRST_ATTEMPT=1 \
   pnpm exec playwright test e2e/live-luna-judge-flow.spec.ts \
     --repeat-each=5 --workers=1 --reporter=line
   ```

   The internal confidence bar is 15 total managed runs and 15 total attempts: five each
   for Code, General, and Data, with no Retry, page error, API 5xx, failed/exhausted run,
   leaked lease/permit/reservation, or second attempt. Fewer than five clean rehearsals
   does not block writing this guide, but it blocks a confident recording claim.
4. Confirm a supported client exposes the standard `document.modelContext` path on the
   deployed top-level page and that the previously verified idle → role → idle lifecycle
   belongs to this exact SHA. Keep that native evidence separate; the screenshots below
   do not prove it.
5. Prepare an out-of-frame log monitor for page errors and relay/API 5xx responses. Do
   not show DevTools, terminals, secrets, or request payloads in the take.

If a protected evaluation reset is needed for validation, run it off camera. It writes
bootstrap paths to a private mode-0600 temporary file; neither the command output nor the
result belongs in screenshots:

```bash
RATIFLOW_BASE_URL=https://approved-preview-origin.example \
RATIFLOW_EVAL_RESET_TOKEN=your-private-token \
pnpm eval:reset:v4
```

The public recording flow does **not** use that reset. Opening either card from `/`
creates a fresh isolated completed example.

## Capture setup

- Browser: the verified supported client and version from the release evidence; one app
  tab, no unrelated tabs, extensions, notifications, autofill popovers, or DevTools in
  frame.
- Viewport: exactly `1440 × 1000` CSS pixels, device-pixel ratio `1`, 100% zoom, light
  appearance, default text size, and reduced-motion preference off unless accessibility
  evidence is the purpose of a separate take.
- Output: viewport-only PNG. Do not use an OS full-screen capture; address and tab bars
  must not appear. Retain the untouched viewport source before making a crop.
- Identity: use the public-safe nickname `WebMCP Judge`. Do not use a personal account,
  email address, Discord handle, or private company name.
- Frame: keep the document and collaboration rail legible. Hide the mouse pointer over
  blank paper or a non-action label before each still. Never crop out an error, evidence
  label, revision badge, or status that changes the meaning.
- Timing: hold each settled state for two seconds before and after the still. During live
  waits, narrate the boundary; do not stage, pause, or edit the UI to imitate a transient
  state.

Before every take, fill this slate off camera:

```text
full SHA:
deployment origin:
UTC start:
client/version:
viewport/DPR: 1440x1000 / 1
Postmortem alias: PM-A
Product alias: PD-B
```

## Reset and retry discipline

- Start a take at `/`, enter `WebMCP Judge`, and choose a card. Each click creates a new
  completed example; use that new copy as the reset boundary.
- Beats 2–6 must stay in one Postmortem copy: r5 → Code r6 → General r7. Do not reload,
  navigate away, reuse an old share link, or run a protected reset between them.
- Beat 7 starts from `/` in a second fresh copy and opens Product at r6. Do not reuse the
  Postmortem issue URL.
- If an abort condition occurs, stop the take, record the observable failure privately,
  close that issue tab, and start a fresh copy from `/`. Do not click Retry for a
  first-attempt proof, mutate the database, patch text manually, or splice states from
  different lineages.
- Never preserve or share the issue URL. The manifest uses `PM-A` and `PD-B`, not raw
  document, task, run, attempt, lease, or session identifiers.

## Beat 1 — picker ready

**Action**

1. Open `/` in the clean supported client.
2. In `What should collaborators call you?`, enter `WebMCP Judge`.
3. Wait until the setup says `Ready as WebMCP Judge.`

**Landmarks and frame**

- `data-testid="template-picker"`
- `data-document-kind="POSTMORTEM"` and `PRODUCT_DOCUMENT`
- `aria-label="Managed demo agent directory"`
- Frame the promise, nickname, `@Data / @Code / @General`, and both enabled document
  cards. Keep `Prefer a blank document?` collapsed.

**Expected facts**

- Exactly two primary choices: Postmortem and Product document.
- The visible directory maps Data to metrics, Code to repository, and General to writing.
- No agent connection or account setup is required for the managed demo.

**Narration cue**

“The evaluator starts with a name and a real document, not a chat thread. The page already
knows the three managed specialists, but it has not granted any one of them a run yet.”

**Capture**: `screenshots/01-picker-ready.png` · `PRODUCT_UI`.

**Abort if** either primary card is disabled after the name is entered, a third primary
card appears, an error is visible, or browser chrome/identity data would enter the frame.

## Beat 2 — exact Code assignment

**Action**

1. Click `Open live postmortem` and wait for the two-sheet
   `INC-482 · Checkout outage postmortem` at r5.
2. Confirm the coach says WebMCP is ready and `Load @Code on Root cause` is enabled.
3. Click that guided-selection button. Do not click `Assign & run` yet.

**Landmarks and frame**

- Workspace: `data-testid="repository-workspace"`
- Two sheets: `data-testid="writing-surface" data-sheet-count="2"`
- Guided action: `data-testid="guided-selection"`
- Composer: `data-testid="selection-comment-composer"`, label
  `Comment or @ an agent`, and button `Assign & run`
- Frame the selected Root cause passage, the full composer, the `Assigned to @Code · code
  specialist` line, and the r5 badge.

**Exact frozen prompt**

> @Code Reframe this root-cause section as exactly three labeled Markdown
> bullets—Trigger, Amplifier, and Why it persisted—using the synthetic repository and
> checkout log. Preserve every verified date, quantity, and source reference, then
> replace only this section.

**Narration cue**

“The human chooses the exact passage and specialist. The server stores that anchor and
scope before any model call, so Code cannot write elsewhere.”

**Capture**: `screenshots/02-code-assignment.png` · `PRODUCT_UI`.

**Abort if** the document is not r5, the selection is not Root cause, one character of
the frozen prompt differs, `@Code` is not a selected directory entry, WebMCP reports off,
or `Assign & run` is disabled.

## Beat 3 — Code discovery and first turn

This is the only intentionally transient still. Prepare the capture control before the
click. If it passes too quickly, use a fresh copy; never fake or freeze the product state.

**Action**

1. Click `Assign & run`. The `Relay` tab opens automatically.
2. Capture as soon as the Flight Recorder shows `@Code`, the seven-tool list, and one of:
   `Discovering page tools`, `Luna is composing the required call`, or
   `Running read_assignment`.

**Landmarks and frame**

- Rail: `aria-label="Comments, history, and relay"`; selected tab `Relay`
- Recorder: `data-testid="relay-flight-recorder"`
- Catalog: `aria-label="Code tool catalog"`
- Trace: `aria-label="Relay trace"`
- Frame the full seven-tool catalog, active status/tool, and the newest early trace rows.

**Expected Code catalog, in order**

1. `read_assignment`
2. `read_document_context`
3. `read_collaboration_context`
4. `comment_on_assignment`
5. `submit_scoped_revision`
6. `search_demo_code`
7. `read_demo_file`

The first model-visible function is `read_assignment`. Later required turns are
`search_demo_code`, `read_demo_file`, and `submit_scoped_revision`.

**Narration cue**

“These seven functions are the stable WebMCP catalog for this Code run. The relay now
narrows the first Luna continuation to one discovered function—`read_assignment`—then
pins the next required Code function on each continuation. Luna composes arguments; it
does not choose the workflow.”

**Capture**: `screenshots/03-code-discovery-first-turn.png` ·
`APPLICATION_TRACE`.

**Abort if** the list is not exactly seven, idle tools appear beside it, Data/General
specialty tools appear, the first active function is not `read_assignment`, `Retry once`
appears, an error is visible, or any page error/API 5xx is observed out of frame.

## Beat 4 — Code r6 completion

**Action**

1. Let the first attempt complete without intervention.
2. Wait for the top revision control to read r6 and the recorder to say
   `Revision recorded` and `Run completed`.
3. Scroll only enough to keep the new Root cause bullets and Relay rail together.

**Landmarks and frame**

- Revision control accessible name: `Open revision history. Revision 6`
- Recorder completion rows should include `Page dispatched the selected tool`,
  `Scoped revision committed`, `Application recorded the tool result`,
  `Specialist catalog withdrawn`, `Idle tools restored`, and `Run completed`.
- The recorder may retain Code's last-run catalog for explanation after completion. The
  trace—not that historical list—must show that the live browser surface returned to
  idle.

**Expected result**

- Exactly three labeled Markdown bullets: **Trigger**, **Amplifier**, and
  **Why it persisted**.
- Preserved verified facts include provider HTTP 429 at 09:43 UTC, `Retry-After`, up to
  five zero-delay retries, commit `7d3c9e1`, 5.8× retry traffic, queue growth from 420 to
  18,240, the sustained 38-minute failure, and the rollback/recovery distinction grounded
  in `checkout.log` and `commit:7d3c9e1`.
- Only Root cause changed; no unrelated section changed.

**Narration cue**

“The page executed the server-required calls through WebMCP, and the bounded result
became r6. The application trace keeps the execution story beside the document, then the
specialist catalog is withdrawn and idle tools return.”

**Capture**: `screenshots/04-code-r6-completion.png` · `LIVE_LUNA` only after exact-SHA
lineage reconciliation; otherwise `APPLICATION_TRACE`.

**Abort if** the head is not r6, the result is not the exact three-bullet structure, any
fact/source disappeared or changed, another section changed, completion/restored-idle is
missing, `Retry once` appears, or any error/5xx was observed.

## Beat 5 — General role swap

**Action**

1. At r6, the guided action changes to `Load @General on Root cause`; click it.
2. Confirm the composer selects `@General`, then click `Assign & run`.
3. Capture while the Relay rail shows General's catalog. Let the first attempt finish to
   r7 before continuing to beat 6.

**Expected General catalog, in order**

1. `read_assignment`
2. `read_document_context`
3. `read_collaboration_context`
4. `comment_on_assignment`
5. `submit_scoped_revision`
6. `read_company_style_guide`
7. `check_document_consistency`

`search_demo_code` and `read_demo_file` must be absent. The five common tools remain
because they implement assignment, bounded context, progress, and scoped submission;
only the specialist delta changes.

**Narration cue**

“Changing the assigned role changes the WebMCP surface: Code's repository tools are gone
and General gets style and consistency tools. The catalog is stable for this General
run; the relay still exposes one required function per Luna continuation.”

**Capture**: `screenshots/05-general-role-swap.png` · `APPLICATION_TRACE`.

**Abort if** Code specialty tools remain, General has anything other than seven tools,
idle and managed catalogs coexist, the revision advances before a completed General run,
`Retry once` appears, or the clarity pass loses a verified Code fact or source reference.

## Beat 6 — History, proof, and Restore

**Action**

1. After General completes, verify the head is r7.
2. In the `Comments, history, and relay` rail, choose the `History` tab.
3. Open `data-testid="revision-card" data-revision="6"`.
4. Frame the r6 detail. Do not click `Restore r6` in the core seven-frame lineage.

**Expected detail**

- `Code · managed agent changed the document`
- `Direct from r5` lineage, the full before/after diff, and evidence references
  `checkout.log` and `commit:7d3c9e1`
- `Immutable snapshot`
- Visible `Restore r6` action because r7 is the current head

**Narration cue**

“The result is not trapped in a transcript. History connects the human's prompt, the
managed agent, sources, exact diff, and immutable r6 snapshot. Restore is append-only—it
can bring r6 forward without deleting General's r7.”

**Capture**: `screenshots/06-history-code-r6.png` · `LIVE_LUNA` only when it matches the
verified Code run; otherwise `PRODUCT_UI`.

**Optional live Restore proof**

Only after all core frames are safe, repeat the flow in a disposable fresh Postmortem
copy. From head r7, open r6 and click `Restore r6`. Expect a new r8 Restore revision and
both r6 and r7 to remain in History. Do not continue the canonical Data take from this
copy, and do not substitute this optional state for `06-history-code-r6.png`.

**Abort if** r6 is missing, provenance/evidence/diff is incomplete, the snapshot is not
loaded, the action says anything other than `Restore r6`, or opening History changes the
document.

## Beat 7 — Data transfer result

**Action**

1. Return to `/` without exposing the prior issue URL. Enter `WebMCP Judge` and open a
   fresh Product document at r6.
2. Click `Load @Data on Success measures`. Confirm this exact prompt, then assign:

   > @Data Check these success measures against the synthetic Northstar capacity plan.
   > Show which October 15 scope fits 14 engineering days and preserve the November 1
   > renewal commitment, then replace only this section.

3. Let the first attempt complete to r7. Center Page 2's Success measures. Open History,
   select the r7 card, and keep the document result plus linked Data diff/evidence visible
   in one viewport.

**Expected Data catalog and facts**

- Six tools: the same five common tools plus `query_demo_metrics`; no Code or General
  specialty tool.
- 10 reliability days + 4 invite-only-beta days = 14 and fits exactly.
- 10 + all 8 export days = 18, exceeding the window by 4.
- October 15 remains an invite-only design-partner beta; the remaining four export days
  lead to full GA by November 1; the production-ready date protects the $180,000 renewal.
- Evidence references the visibly synthetic `northstar_launch_capacity` source, and only
  Success measures changed.

**Narration cue**

“The same mechanism transfers to Data with a smaller role catalog. It reads the synthetic
capacity fixture, proves 10 plus 4 fits while 10 plus 8 does not, and commits only Success
measures with the source and diff attached.”

**Capture**: `screenshots/07-data-r7-result.png` · `LIVE_LUNA` only after exact-SHA
lineage reconciliation; otherwise `PRODUCT_UI`.

**Abort if** the Product copy does not start at r6, Data's list is not exactly six, the
result implies October 15 is GA, omits November 1 or the $180,000 renewal, contains wrong
arithmetic, changes another section, offers Retry, or lacks linked synthetic evidence.

## Final audit before sharing anything

1. Inspect all seven PNGs at original resolution; reject blurred copy, clipped controls,
   hover overlays, stale statuses, and any accidental browser UI.
2. Search visually for URLs, tokens, IDs, emails, cookies, storage panes, terminals,
   request headers, raw JSON/provider payloads, or unrestricted transcripts. Discard and
   recapture rather than redact over a secret-bearing frame.
3. Reconcile beats 2–6 to the one `PM-A` lineage and beat 7 to `PD-B`. Confirm r5 → r6 →
   r7 and Product r6 → r7 without Retry.
4. Complete the filename manifest in [README.md](README.md). Downgrade any unreconciled
   `LIVE_LUNA` frame to its fallback class.
5. Keep the separate native WebMCP artifact and its client/version/date beside—not
   inside—the seven-frame application pack. Never infer native proof from the Flight
   Recorder.

