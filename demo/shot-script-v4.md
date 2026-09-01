# Ratiflow v4 narrated demo — 2:35 maximum

**Status:** recording plan, not release evidence. Use the protected `INC-482` r1/av4
reset, four isolated collaborator paths, a supported native WebMCP client, and the exact
deployed release SHA. Never show URL fragments, share/session tokens, cookies, browser
storage, DevTools secrets, or unrelated content.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:12 | Open the completed postmortem. Frame the readable document and its compact `r1 → r2 → r3 → r4` revision path. | “Important documents now have human and agent contributors, but the reasoning and authority behind each edit disappear into chats. Ratiflow gives one shared document Git-grade history and a task list.” |
| 0:12–0:28 | Reset to r1/av4 and show DATA-17, LOG-22, and CODE-9 together. Briefly frame each immutable assignee, exact target, and Direct or Review grant. | “Priya delegates three exact passages. She—not the model—chooses whether each agent may comment, propose, or commit directly.” |
| 0:28–0:40 | In the supported client, show exactly six page tools and invoke `list_my_tasks({includeResolved:false})` as the Data agent. | “Any compatible agent can discover its owned work from the page. There is no Ratiflow bot runtime and no model-supplied identity, scope, or access mode.” |
| 0:40–0:57 | Invoke `submit_task_result` for DATA-17. Show `COMMITTED`, r2, the changed Impact passage, and no Ratiflow approval control. | “This task grants Direct access, so one verified range becomes r2 immediately. The server enforces the stored selection; Direct is not document-wide permission.” |
| 0:57–1:12 | As the Logging agent, submit LOG-22 based on stale r1 after r2 exists. Show `COMMITTED`, r3, both changes intact, and the lineage label `Direct from r1, safely rebased`. | “Logging also started from r1. Because the edits are disjoint, Ratiflow rebases it to r3 without overwriting Data. An overlap would fail closed.” |
| 1:12–1:29 | As the Builder agent, submit CODE-9. Show `PROPOSED`, unchanged r3 Root cause, exact before/after diff, and evidence refs. | “Builder has Review access. The same tool now returns a proposal, because outcome comes from the human's stored grant—not the agent's prompt.” |
| 1:29–1:47 | Priya asks whether the code is being overclaimed; invoke `comment_on_task` for the Builder's evidence-backed reply. Then Priya accepts with the frozen rationale. | “The disagreement stays attached to the task. Builder separates the external trigger from the internal retry amplifier; Priya accepts, creating r4.” |
| 1:47–2:06 | Open r4 History. Frame Builder as author, Priya as approver and committer, source r1, parent r3, digest, task, evidence, complete diff, and full snapshot. | “History preserves two kinds of authorship: who produced the change and who authorized it. Every revision is a reconstructable snapshot; restore appends instead of rewriting history.” |
| 2:06–2:22 | Start a fresh Builder-agent turn. Invoke `list_my_tasks({includeResolved:true})`, then `read_document_history`. Show the answer citing CODE-9, `7d3c9e1`, and r4. | “A fresh agent can recover why provider throttling was only the trigger and why our retry change sustained the outage—without replaying old chats.” |
| 2:22–2:31 | Open `/new`, briefly show only Postmortem and Product document, then the WebMCP-unavailable footer in an ordinary browser. | “The shared URL remains a complete human product with or without an agent, and every collaborator can bring their own.” |
| 2:31–2:35 | Return to the finished postmortem and revision path. | “Ratiflow: Git-grade collaboration for the documents that have to be right.” |

## Frozen native calls

Use IDs returned by the protected reset; never record the bearer paths themselves.

```json
{"includeResolved":false}
```

DATA-17 result:

```json
{
  "taskId": "<DATA-17 task UUID>",
  "basedOnRevision": 1,
  "resultSummary": "Replace the impact placeholder with verified checkout failure counts.",
  "replacementText": "Between 09:43 and 10:21 UTC, 28,417 checkout attempts produced 6,742 failures across 311 merchants. No duplicate charges occurred.",
  "evidenceRefs": ["warehouse:checkout_attempts.csv"]
}
```

LOG-22 result:

```json
{
  "taskId": "<LOG-22 task UUID>",
  "basedOnRevision": 1,
  "resultSummary": "Add the verified provider, retry, rollback, and recovery timestamps.",
  "replacementText": "- 09:43 — Provider 429 responses began.\n- 09:47 — Retry traffic reached 5.8× baseline; the checkout queue grew from 420 to 18,240.\n- 10:17 — The team rolled back retry middleware commit 7d3c9e1.\n- 10:21 — Checkout success rate recovered.",
  "evidenceRefs": ["logs:checkout.log"]
}
```

CODE-9 result:

```json
{
  "taskId": "<CODE-9 task UUID>",
  "basedOnRevision": 1,
  "resultSummary": "Separate the provider trigger from the retry regression that sustained the outage.",
  "replacementText": "Provider throttling triggered the incident. Retry middleware introduced in 7d3c9e1 ignored Retry-After and made up to five immediate retries, amplifying provider 429 responses into queue exhaustion. The retry regression—not provider latency alone—was the root cause of the sustained checkout failure.",
  "evidenceRefs": ["commit:7d3c9e1", "logs:checkout.log"]
}
```

Priya's question:

```text
Provider throttling happened first. Are we overclaiming our code as the root cause?
```

Builder reply:

```text
The provider initiated throttling at 09:43, but 7d3c9e1 ignored Retry-After and retried up to five times. That raised retry traffic to 5.8× and exhausted the queue; rollback at 10:17 preceded recovery at 10:21.
```

Acceptance rationale:

```text
Accepted after separating the external trigger from the internal retry amplifier.
```

## Recording gate

- [ ] Exact clean source SHA equals deployed SHA, public repository HEAD, manifest,
  video description, and submission.
- [ ] Remote v4 migration is applied and security/performance advisors are reviewed.
- [ ] A supported client discovers exactly the six v4 tools on the top-level issue page;
  the first visible native invocation lands by 0:40.
- [ ] Direct, stale-base Direct, Review, comment, acceptance, resolved-task/history read,
  authority attacks, wait, and teardown are captured natively—not through an adapter.
- [ ] Any host safety confirmation is shown and described separately from Ratiflow's
  Comment/Review/Direct policy.
- [ ] Five protected-reset rehearsals complete without repair on the release deployment.
- [ ] The finished cut is at most 2:35, narrated, public on YouTube, and playable without
  sign-in.
- [ ] Desktop and 390px receive an independent read-only visual SHIP verdict.
- [ ] Every frame, caption, transcript, and artifact passes the secret/privacy scrub.
