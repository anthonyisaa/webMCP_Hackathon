# Northstar CSV managed-relay Product document hero

Version 2 · v4.2 product on protocol 4 · 2026-09-02

## v4.2 judge-owned live overlay

The public **Explore product document** path creates a fresh isolated two-sheet clone of
the detailed Northstar decision below. It preserves existing human saves, agent revisions,
discussion, alternative wording, and Restore, then highlights **Success measures** as the
managed Data transfer proof.

The exact live prompt is:

> @Data Check these success measures against the synthetic Northstar capacity plan. Show
> which October 15 scope fits 14 engineering days and preserve the November 1 renewal
> commitment, then replace only this section.

Selecting the canonical Data profile creates exactly one Direct task and one queued Relay
run. The successful trajectory calls `read_assignment`, `query_demo_metrics`, and
`submit_scoped_revision` through the page's live WebMCP surface. The replacement must show
that 10 reliability days + 4 invite-only-beta days = 14 and fits exactly; 10 + all 8
export days = 18 and exceeds the window by 4; October 15 remains an invite-only
design-partner beta; the remaining four export days lead to full GA by November 1; and the
$180,000 renewal depends on that production-ready date. It must not describe October 15
as general availability. Every fixture is visibly labeled **Synthetic demo data**.

The visible proof uses one task/run/attempt lineage and records Luna client tool search,
the Data-only catalog, WebMCP `getTools()` and `executeTool()`, verified result digests,
the exact Success-measures diff, revision, and Restore. Switching to `@Code` or
`@General` must remove `query_demo_metrics` and expose only that role's specialist delta.

This overlay is independently frozen in
`evals/goldens/repo-document-v4.2/managed-relay.json`. The v4.1 scenario below remains
the complete historical seed and compatibility oracle.

The independent machine-readable oracle is
`evals/goldens/repo-document-v4.1/product-document-comment-first.json`. It is authored
as a scenario oracle rather than a serialization of a production TypeScript object, and
production example code must not import it.

## What this scenario proves

Jordan Lee opens **Northstar · CSV export launch decision**. Revision 1 is a substantial
Product document with an incorrect pre-beta capacity statement, one analysis
placeholder, and one decision-synthesis placeholder. The exact business facts are:

- a Northstar renewal worth **$180,000** requires production-ready CSV by **November 1**;
- the original plan showed 18 engineering days before the beta, but a four-day incident
  rotation leaves **14 days** of pre-beta capacity;
- reliability work requires **10 days**;
- an invite-only beta export requires **4 days** of export work;
- full GA export requires **8 days** of export work in total; and
- the feasible sequence is an invite-only beta on **October 15**, followed by the
  remaining four export days and full GA on **November 1**.

Jordan first makes an ordinary human Save: r2 corrects “18 engineering days” to “14
engineering days after reserving 4 days for incident rotation.” This is visible human
provenance, not agent work. Because only the body changed, the server derives the exact
revision summary `Edited the document.`; the diff carries the specific capacity change.

From r2 Jordan selects `Analysis in progress.` and writes one anchored comment:

> @Databot Compare the reliability-only, staged beta, and full-export-now options using
> the corrected 14-day pre-beta capacity. Add the arithmetic, a GFM table, and a bar
> chart, then recommend a sequence that protects the $180,000 renewal and November 1
> CSV commitment.

Morgan Chen's agent self-declares `Databot`. Its direct result commits r3 with option
arithmetic, a GFM table, and this exact chart object. The oracle scenario label
`PD-DATA-1` maps to stored task key `TASK-1`:

```json
{
  "version": 1,
  "type": "bar",
  "title": "Pre-beta engineering-day options",
  "description": "Required engineering days for each October 15 option compared with 14 days of corrected capacity.",
  "labels": ["Reliability only", "Staged beta", "Full export now"],
  "series": [
    {"name": "Required days", "values": [10, 14, 18]},
    {"name": "Available days", "values": [14, 14, 14]}
  ],
  "xLabel": "Option",
  "yLabel": "Engineering days"
}
```

The arithmetic is exact: reliability-only uses 10 days but does not deliver CSV;
staged beta uses 10 + 4 = 14 days and fits; reliability plus all 8 export days uses 18
and exceeds pre-beta capacity by 4. The staged plan completes those remaining four
export days after beta feedback and reaches full GA by November 1.

Jordan then selects `Synthesis pending.` and delegates:

> @ChatGPT Synthesize the decision using the corrected capacity and Databot analysis.
> State the October 15 audience, November 1 GA commitment, renewal consequence, scope,
> and guardrails without describing the beta as customer-ready GA.

Avery Singh's self-declared `ChatGPT` reads the r1 human correction and r3 Databot
provenance, then directly commits r4. The oracle scenario label `PD-SYNTH-1` maps to
stored task key `TASK-2`. Both Direct revision summaries exactly equal their submitted
result rationales. Elena Ruiz opens an ordinary anchored discussion on the r4
recommendation:

> Does “invite-only beta” make the October 15 build sound customer-ready? The renewal
> depends on full GA by November 1.

Jordan replies that October 15 is limited to design partners, production support starts
only at November 1 GA, and the wording will keep that boundary explicit. Elena closes
the discussion. No task, acceptance state, or content revision is fabricated for this
human-to-human exchange.

Finally the demo makes revision provenance tangible. Elena deliberately saves an
alternative r5 that says CSV should ship to every customer on October 15, erasing the
staged distinction. This second body-only human Save also receives the server-derived
summary `Edited the document.` Jordan chooses **Restore r4**. Restore copies the complete r4
snapshot into new r6; it never deletes r5 or moves the head backwards. History therefore
shows the alternative, who wrote it, why Jordan restored, and that final r6 is byte-for-
byte equal to r4 while retaining distinct Restore provenance.

## Revision and activity trajectory

| Event | Revision | Activity | Provenance |
|---|---:|---:|---|
| Jordan launches the r1 Product document | 1 | 1 | Human / Jordan Lee |
| Jordan corrects capacity | 2 | 2 | Human Save / Jordan Lee |
| Create scenario `PD-DATA-1` / stored `TASK-1` atomically | 2 | 3 | anchored human comment → Direct task |
| Databot completes stored `TASK-1` from r2 | 3 | 4 | Direct / Databot owned by Morgan Chen |
| Create scenario `PD-SYNTH-1` / stored `TASK-2` atomically | 3 | 5 | anchored human comment → Direct task |
| ChatGPT completes stored `TASK-2` from r3 | 4 | 6 | Direct / ChatGPT owned by Avery Singh |
| Elena opens a human discussion | 4 | 7 | standalone comment, no revision |
| Jordan replies | 4 | 8 | standalone reply, no revision |
| Elena closes the discussion | 4 | 9 | resolved discussion, no revision |
| Elena saves an alternative rollout | 5 | 10 | Human Save / Elena Ruiz |
| Jordan restores the full r4 snapshot | 6 | 11 | Restore / Jordan Lee, restored revision 4 |

Agent profile writes and reads do not increment either document counter. Profile access
metadata counts only successful first-commit connects and agent mutations; reads and
waits are no-touch. The completed example therefore contains only the two historical
profiles, Databot and ChatGPT, at access count 2 each (connect + result). The later
continuity probe creates Contextbot at 1 (connect only). The final head is r6/av11. The
exact source, diffs, evidence, rationales, owners, agent names, and comment closure are
frozen in the JSON.

## Fresh-agent continuity probe

Quinn Patel did not author, discuss, or own either task. At r6/av11 Quinn brings a fresh
agent that self-declares `Contextbot`, then pages `read_collaboration_context` with a
limit of 6. The first call returns av11–av6 and cursor 6; the second uses
`beforeActivityVersion: 6`, returns av5–av1, and yields a null cursor. Concatenating the
two windows freezes the exact newest-first order av11→av1 without a gap or duplicate.
Only after reaching that null cursor does the probe assert r6→r1 and all three threads.
The joined events expose the capacity correction, both prompts and source contexts,
Databot arithmetic, ChatGPT rationale, the closed human discussion, the alternative r5,
and r6 Restore provenance. These reads leave Contextbot's access count at 1.

The exact question is:

> What is the approved Northstar CSV sequence, why does it fit, and why is r6 a Restore
> instead of a new product decision?

A passing answer must state that corrected pre-beta capacity is 14 days after a four-day
incident rotation; 10 reliability days plus 4 beta-export days exactly fit; all 8 export
days plus reliability would require 18 and exceed that window by 4; invite-only beta is
October 15; the remaining four export days lead to full GA by November 1; and the
$180,000 renewal depends on that GA date. It must explain that r5 broadened October 15
to every customer and r6 restored the complete r4 snapshot, preserving r5 in history.
It must cite stored tasks `TASK-1` and `TASK-2`, the closed `PD-DISCUSS-1` thread, r5,
and r6. `PD-DATA-1` and `PD-SYNTH-1` may appear only as their oracle scenario labels.

## Oracle schema

Both v4.1 hero JSON files use
`oracleSchemaVersion: "ratiflow.comment-first-scenario-oracle/v1"`. They freeze exact
semantic labels, exact stored `TASK-n` keys, owners and self-declared profiles, prompts,
immutable target and exact
newest-first prior-activity context, source facts, revision and activity trajectories,
final Markdown, chart JSON, comments, rationales/evidence, before/after text, and exact
cursor-page continuity scoring. Runtime UUIDs,
credentials, paths, and timestamps may be normalized; document content and provenance
may not.

Public example creation accepts `{ kind, displayName }`. For the canonical demo input,
`displayName` is `Quinn Patel`: the input creates a fresh current non-authoring viewer
only and does not pre-seed an agent profile. Jordan, Morgan, Avery, and Elena remain the
exact historical contributors, and the new viewer is never retroactively attributed
their revisions, prompts, tasks, or discussion. `connect_agent` in the subsequent
continuity probe is what first creates Quinn's Contextbot profile.
