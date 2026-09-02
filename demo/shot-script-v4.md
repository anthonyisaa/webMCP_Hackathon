# Ratiflow v4.1 narrated demo — 2:50 target

**Status:** recording plan, not release evidence. The script may be rehearsed locally,
but native WebMCP, deployed behavior, and live-database claims remain **PENDING** until
captured in the supported client against the exact release SHA.

Record with sanitized completed examples and a fresh viewer named Quinn Patel. Never
show share credentials, URL fragments, bearer paths, cookies, browser storage, DevTools
secrets, reset tokens, or unrelated content.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:12 | On `/`, enter Quinn's nickname, point out that each collaborator connects one agent after the document opens, then open the completed `INC-482` postmortem. | “Ratiflow starts with who you are, then makes the agent handoff explicit. The document still works if you continue without one.” |
| 0:12–0:28 | On a fresh postmortem, select `Investigation in progress.`, open one anchored comment, type `@`, choose `Databot · Nadia Chen`, and finish the prompt. Do not show any secondary task form. | “Delegation is just a comment: select a passage, mention an agent, and describe the work. Any comment without a selected agent remains a normal human discussion.” |
| 0:28–0:40 | Submit the comment. Show `TASK-1`, its exact prompt, owner, selected passage, and Open state in the rail. | “Ratiflow creates scoped work atomically. There is no authority checkbox and no approval queue; the assignment is limited to this exact passage.” |
| 0:40–0:55 | In the setup strip, prepare the Databot prompt. In a supported WebMCP client, show the ordered eight-tool catalog, call `connect_agent({"name":"Databot"})`, show the status change to `Databot · owned by Nadia`, then call `list_my_tasks({"includeResolved":false})`. If native capture is unavailable, omit the invocation and label the UI-only cut. | “The page helps with the handoff but does not invent a bot. The agent self-declares its name, and Ratiflow binds that profile to Nadia before returning only Nadia's delegated work.” |
| 0:55–1:10 | Submit Databot's result. Return to the document and show the rendered counts, GFM table, safe chart, Completed thread, highlighted before/after, rationale, evidence, r2 link, and Restore. | “The result commits directly as a reversible revision. Its prompt, source context, rationale, evidence, owner, and diff stay attached to the completed comment.” |
| 1:10–1:25 | Jump to completed `INC-482` r5/av11. Walk the compact r1→r5 line and the Databot, Logbot, and two Builder completions. Open Priya's separate closed human discussion. | “Three agents fill impact, timeline, and root cause. Priya then challenges the wording in a normal comment. A second Builder task uses that history to clarify r5; Priya closes the discussion without inventing a content approval.” |
| 1:25–1:41 | Open the r5 Builder thread and History detail. Frame `TASK-4`, the r4→r5 highlight, source and parent revisions, owner, exact prompt/context, rationale, `checkout.log`, `commit:7d3c9e1`, digest, and Restore. | “History is Git-like, but designed for context. It records that provider throttling triggered the incident while retry code amplified traffic to 5.8 times and sustained the failure.” |
| 1:41–1:57 | Switch to completed `Northstar · CSV export launch decision` at r6/av11. Show the 14-day correction, option table/chart, Databot and ChatGPT threads, and closed human discussion. | “The Product document tells a different story: a human corrects capacity to 14 days, Databot proves that reliability plus an invite-only beta fits exactly, and ChatGPT synthesizes the October 15 beta and November 1 GA decision.” |
| 1:57–2:10 | In History, compare Elena's r5 “every customer” alternative with Jordan's r6 Restore of r4. Show r5 still present. | “When Elena broadens the rollout, Jordan restores the earlier decision. Restore creates r6; it never deletes r5 or hides who proposed it.” |
| 2:10–2:31 | As Quinn's new agent, call `connect_agent({"name":"Contextbot"})`, page `read_collaboration_context`, then inspect history. Show the returned closed comments, `TASK-n` prompts, rationales, evidence, and revision links. | “Now a completely new agent joins. Contextbot owns no old task and authored nothing. It can still recover the decisions—including facts that only appeared in comments—without replaying old chats.” |
| 2:31–2:43 | Show Contextbot's concise answer for one example, with references. For postmortem: `TASK-4`, `checkout.log`, `commit:7d3c9e1`, closed discussion, r5. For Product: `TASK-1`, `TASK-2`, closed discussion, r5, r6. | “The history is not primarily another screen for people to manage. It is structured memory that helps any compatible agent do the next job correctly.” |
| 2:43–2:50 | Return to the clean rendered document and collapse the rail. | “Ratiflow: one document, simple delegation, and a history that remembers why.” |

## Exact WebMCP catalog shown in the recording

Show all eight tools, in this order, and no human-only management operation:

1. `connect_agent`
2. `inspect_document`
3. `read_document_history`
4. `read_collaboration_context`
5. `list_my_tasks`
6. `wait_for_my_tasks`
7. `comment_on_task`
8. `submit_task_result`

## Minimal native call sequence

Use IDs returned by the current page. Never record credentials or substitute oracle
scenario labels such as `PM-DATA-1` for the stored `TASK-n` keys shown to the user.

```json
{"name":"Contextbot"}
```

```json
{"limit":5}
```

Pass each returned cursor back as `beforeActivityVersion` until it is `null`, then inspect the immutable
revision window. Postmortem r5/av11 requires three context pages at limit 5; Product
r6/av11 requires two at limit 6.

For a task result, use the task UUID returned by `list_my_tasks`, the task's observed
source revision, a concise rationale, the scoped replacement, and evidence labels:

```json
{
  "taskId": "<returned task UUID>",
  "basedOnRevision": 1,
  "resultSummary": "Replace the selected impact placeholder with verified outcomes and readable evidence.",
  "replacementText": "<checked Markdown replacement, including GFM table and chart block>",
  "evidenceRefs": ["impact.csv"]
}
```

The visible outcome must be `COMMITTED`; do not narrate a proposal or Ratiflow approval
state. A host application's own safety confirmation, if one appears, must be described
as host behavior rather than Ratiflow's document model.

## Must-show details

- The `@Agent` prompt is an anchored comment beside selected rendered text.
- A literal or unselected `@` creates only a human comment.
- The human's name and `Agent · owned by Human` attribution are visible.
- A completed task shows prompt, prior context, rationale, evidence, highlighted
  before/after, revision, and Restore.
- A human discussion shows reply and Close, not Accept or Reject.
- Markdown headings, GFM table, and validated chart render in reading mode; source edit
  mode shows the underlying revisioned Markdown.
- History separates content revisions from coordination activity and keeps r5 readable
  after Product r6 Restore.
- Contextbot is created only by its visible `connect_agent` call and has no prior task,
  comment, or revision attribution.

## Recording gate

- [ ] Clean source SHA equals the deployed SHA, public source HEAD, manifest, video
  description, and submission.
- [ ] The additive v4.1 migration is applied to the release database and its RPC, RLS,
  grant, and denial checks are recorded.
- [ ] A supported client discovers exactly the eight tools on the top-level document
  page and completes identity, reads, task completion, waits, cancellation, and teardown
  natively—not through an adapter.
- [ ] Both completed examples match their checked terminal states: Postmortem r5/av11
  and Product r6/av11.
- [ ] The Contextbot continuity answer is captured from a fresh owner with no pre-seeded
  profile or work.
- [ ] Ordinary-browser behavior, WebMCP-absent behavior, desktop, and 390 px layouts are
  visibly checked.
- [ ] The finished cut is no longer than 2:50 and the final public URL is playable
  without sign-in.
- [ ] Every frame, caption, transcript, and artifact passes the privacy scrub.
