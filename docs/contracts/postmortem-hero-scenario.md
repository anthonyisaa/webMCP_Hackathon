# INC-482 managed-relay Postmortem hero

Version 5 · v4.4 product on protocol 4 · 2026-09-03

## v4.4 company-scoped live overlay

The public **Explore postmortem** path creates a fresh isolated two-sheet clone with the
substantial history and synthetic evidence frozen below. It adds the evaluator only as a
non-authoring viewer. The resolved seed paints no historical range. The evaluator may
select any safe rendered text; the suggested 90-second path uses **Root cause**. The
grouped @ directory shows Humans and the immutable managed agents `@Data`, `@Code`, and
`@General`; legacy self-declared profiles remain under Advanced. A live selection is
neutral blue, the submitted open task is yellow, and the newly committed agent
replacement is green for 30 seconds before the document returns to its unpainted reading
state.

The exact hero prompt is:

> @Code Reframe this root-cause section as exactly three labeled Markdown bullets—Trigger,
> Amplifier, and Why it persisted—using the synthetic repository and checkout log. Preserve
> every verified date, quantity, and source reference, then replace only this section.

Selecting the canonical Code profile and **Assign & run** creates exactly one Direct task
and one queued Relay run; there is no access control in the composer. After canonical
profile lookup, company policy resolves Code to `REPOSITORY_SCOPED_EDIT` and stores that
profile immutably on the run. The successful trajectory calls, through the page's live
WebMCP surface,
`read_assignment`, `search_demo_code`, `read_demo_file`, and
`submit_scoped_revision`. The replacement must be exactly one Markdown list of three
bullets labeled **Trigger**, **Amplifier**, and **Why it persisted**. The result must cite
`checkout.log` and `commit:7d3c9e1`, state
that provider 429 throttling was the external trigger, state that ignored `Retry-After`
plus up to five zero-delay retries was the internal amplifier, and quantify 5.8× retry
traffic plus queue growth from 420 to 18,240. It must not call provider latency alone the
root cause.

The visible Flight Recorder must show one consistent task/run/attempt lineage and the
ordered application-observed relay trace: idle catalog withdrawn, Repository assignment
catalog registered,
`toolchange`, Luna client `tool_search`, `getTools()`, the server-pinned function call
returned by Luna, `executeTool()`, result digest,
revision, assignment catalog withdrawn, and idle catalog restored. A later assignment may
use `@General`, whose fixed `EDITORIAL_SCOPED_EDIT` company policy exposes
`read_company_style_guide` and `check_document_consistency`; `@Data` is fixed to
`METRICS_SCOPED_EDIT`. Users and models cannot switch those managed mappings. History
keeps the human grantor, managed agent, resolved immutable run grant, `gpt-5.6-luna`, runtime
`OPENAI_LUNA_WEBMCP_RELAY`, synthetic evidence, exact diff, and Restore.
This readable trace is not native browser attestation; dated supported-client evidence
against the exact deployed SHA remains the native WebMCP proof class.

Ratiflow grants and enforces document, range, and action access. WebMCP exposes and invokes
the matching tab-bound tools; catalog visibility is not the security boundary.

This overlay is independently frozen in
`evals/goldens/repo-document-v4.2/managed-relay.json`. The detailed v4.1 graph below is
retained as seed and compatibility authority; its historical self-declared names are not
presented as the managed directory.

The independent machine-readable oracle is
`evals/goldens/repo-document-v4.1/postmortem-comment-first.json`. Production example
builders must not import that JSON or derive their expected values from production seed
code. The oracle deliberately describes a product scenario rather than mirroring a
TypeScript response type.

## What this scenario proves

Priya Shah opens **INC-482 · Checkout outage postmortem**. Revision 1 is already a
coherent postmortem, but its Impact, Timeline, and Root cause sections each contain the
exact selection `Investigation in progress.` Priya selects each placeholder, opens one
anchored comment, chooses a named agent from autocomplete, and writes the prompt in that
comment. There is no task form, mode chooser, or approval gate.

Three direct mentions begin from r1:

| Scenario label | Stored task key | Visible anchored comment | Owner / self-declared agent | Evidence |
|---|---|---|---|---|
| `PM-DATA-1` | `TASK-1` | `@Databot Use impact.csv to replace this placeholder with verified checkout attempts, succeeded and failed counts, affected merchants, duplicate-charge status, a GFM outcome table, and a bar chart.` | Nadia Chen / Databot | `impact.csv` |
| `PM-LOGS-1` | `TASK-2` | `@Logbot Use checkout.log to replace this placeholder with the exact UTC incident timeline from provider throttling through recovery.` | Leo Park / Logbot | `checkout.log` |
| `PM-CODE-1` | `TASK-3` | `@Builder Use commit 7d3c9e1 and checkout.log to explain the external trigger, the internal amplifier, and why the outage persisted.` | Sam Rivera / Builder | `commit:7d3c9e1`, `checkout.log` |

Autocomplete selection, not raw `@` text, compiles each comment into one Direct task.
The atomic create stores the exact visible comment as the first human comment in the
task thread, the immutable r1 selection, 600-code-point-bounded surrounding context,
the current profile name and owner, and one activity event. All three agents submit from
r1. Because their selections are disjoint, Databot commits r2, Logbot safely rebases and
commits r3, and Builder safely rebases and commits r4. Each result lands immediately and
keeps its prompt, context, evidence, rationale, before/after diff, author, owner, and
revision link. Each Direct revision's change summary is exactly the submitted result
rationale, without a second seed-specific summary.

After r4 Priya creates an ordinary anchored human discussion on the Root cause text:

> Provider throttling happened first. Are we overclaiming our code as the root cause?

That discussion does not create a task or revision. Priya then selects the same r4 Root
cause text and delegates a second anchored comment:

> @Builder Clarify this section using the earlier discussion: state that provider 429
> throttling was the external trigger, quantify the retry amplification and queue growth,
> and explain why the retry regression—not provider latency alone—was the root cause of
> the sustained failure.

Builder reads the prior discussion and collaboration history, then directly commits the
clarified r5. Priya closes the ordinary human discussion. Closing records resolver and
time; it is not acceptance, and it does not create a revision. The second Builder task
uses scenario label `PM-CODE-2` and stored key `TASK-4`; it is Completed and shows its
r4→r5 before/after change in the task detail with a Restore affordance. That resolved
historical anchor does not paint the seeded document.

## Frozen source facts

- `impact.csv` contains 28,417 checkout attempts, 6,742 failures, 21,675 succeeded
  attempts, 311 affected merchants, and zero duplicate charges.
- `checkout.log` records provider HTTP 429 responses beginning at 09:43 UTC, retry
  traffic reaching 5.8× baseline, queue depth growing from 420 to 18,240, rollback at
  10:17, and recovery at 10:21.
- `commit:7d3c9e1` changed retry middleware so it ignored `Retry-After` and made up to
  five zero-delay retries.
- Provider throttling is the external trigger. The retry regression is the internal
  amplifier and root cause of the sustained checkout failure. “Provider latency alone
  was the root cause” is a forbidden conclusion.

The impact replacement includes this exact chart object inside a fenced `chart` block:

```json
{
  "version": 1,
  "type": "bar",
  "title": "Checkout outcomes during INC-482",
  "description": "Attempted, succeeded, and failed checkout counts from 09:43 to 10:21 UTC.",
  "labels": ["Attempted", "Succeeded", "Failed"],
  "series": [
    {"name": "Checkouts", "values": [28417, 21675, 6742]}
  ],
  "xLabel": "Outcome",
  "yLabel": "Checkout attempts"
}
```

It has three labels, well below the protocol maximum of 12. The GFM table and chart are
revisioned Markdown source; reading mode renders them, while Edit exposes the exact
source.

## Revision and activity trajectory

Offsets in the JSON oracle are zero-based, end-exclusive Unicode code-point offsets.
Every revision is a full title/body snapshot even though the oracle also names the one
replacement that produces it.

| Event | Revision | Activity | Provenance |
|---|---:|---:|---|
| Priya launches the r1 template | 1 | 1 | Human / Priya Shah |
| Create scenario `PM-DATA-1` / stored `TASK-1` atomically | 1 | 2 | anchored human comment → Direct task |
| Create scenario `PM-LOGS-1` / stored `TASK-2` atomically | 1 | 3 | anchored human comment → Direct task |
| Create scenario `PM-CODE-1` / stored `TASK-3` atomically | 1 | 4 | anchored human comment → Direct task |
| Databot completes stored `TASK-1` from r1 | 2 | 5 | Direct / Databot owned by Nadia Chen |
| Logbot completes stored `TASK-2` from r1 | 3 | 6 | Direct / Logbot owned by Leo Park |
| Builder completes stored `TASK-3` from r1 | 4 | 7 | Direct / Builder owned by Sam Rivera |
| Priya opens the human root-cause discussion | 4 | 8 | standalone comment, no revision |
| Create scenario `PM-CODE-2` / stored `TASK-4` atomically at r4 | 4 | 9 | anchored human comment → Direct task |
| Builder completes stored `TASK-4` from r4 | 5 | 10 | Direct clarification / Builder |
| Priya closes the human discussion | 5 | 11 | resolved discussion, no revision |

Agent profile writes and reads change neither document counter. Profile access metadata
counts only one successful connect per page lifetime and first-commit agent mutations;
reads and waits never touch it. The completed example therefore contains only the three
historical profiles: Databot and Logbot at access count 2 (connect + result), and Builder
at 3 (one connect + two results in one page lifetime). The later continuity probe creates
Contextbot at 1 (connect only). The final document is r5/av11. r1–r5 remain immutable,
and Restoring any prior revision would create a new Restore revision rather than
rewriting history.

## Fresh-agent continuity probe

Quinn Patel owns no task and did not participate in any revision or discussion. At
r5/av11 Quinn brings a fresh agent, which self-declares `Contextbot`. After
`connect_agent`, it pages `read_collaboration_context` from that observed activity state
with a limit of 5. The first call returns av11–av7 and cursor 7; the second uses
`beforeActivityVersion: 7`, returns av6–av2, and yields cursor 2; the third uses
`beforeActivityVersion: 2`, returns av1, and yields a null cursor. Concatenating those
windows produces the exact newest-first order av11→av1 with no gap or duplicate. Only
after paging to the null cursor does the probe assert r5→r1 and all five threads. The
joined events expose each revision's prompt, canonical source context, thread, rationale,
evidence, diff, and agent profile, including the closed standalone Priya discussion.
These reads leave Contextbot's access count at 1.

The exact question is:

> What caused INC-482, how did the team distinguish trigger from root cause, and which
> prior discussion changed the final wording?

A passing answer must say that provider 429 throttling was the trigger; `7d3c9e1`
ignored `Retry-After` and made up to five zero-delay retries; traffic reached 5.8× and
the queue grew from 420 to 18,240; the retry regression was the internal amplifier/root
cause of the sustained failure; and Priya's r4 human discussion led to `PM-CODE-2` and
stored `TASK-4` and the clarified r5. Here `PM-CODE-2` is only the oracle scenario label;
the recoverable document task key is `TASK-4`. It must cite `TASK-4`, `checkout.log`,
`commit:7d3c9e1`, and the closed discussion. It must not say that provider latency alone
was the root cause.

## Oracle schema

The JSON uses `oracleSchemaVersion: "ratiflow.comment-first-scenario-oracle/v1"` and
freezes:

- exact deterministic owner, profile, stored `TASK-n`, thread, comment, and discussion
  keys, with `PM-*` names explicitly limited to oracle scenario labels;
- prompts and immutable creation context, including source revision, source digest, and
  the exact newest-first prior-activity snapshots present when each task was created;
- source facts and exact chart JSON;
- one-splice revision materialization plus exact full final Markdown;
- activity/revision counters and direct/close provenance;
- rationales, evidence, highlighted before/after text, and discussion state; and
- a fresh-owner continuity query with exact cursor pages/event order, required
  facts/references, and forbidden claims.

Fresh production UUIDs, credentials, paths, and timestamps may be normalized by the
example parity test. No semantic value above may be normalized.

Public example creation accepts `{ kind, displayName }`. For the canonical demo input,
`displayName` is `Quinn Patel`: that input creates a fresh current non-authoring viewer
only and does not pre-seed an agent profile. Priya, Nadia, Leo, and Sam remain the exact
historical contributors, and the new viewer is never retroactively attributed their
revisions, prompts, tasks, or comments. `connect_agent` in the subsequent continuity
probe is what first creates Quinn's Contextbot profile.
