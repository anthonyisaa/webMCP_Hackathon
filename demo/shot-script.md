# Ratiflow narrated demo — 2:40 target

**Status:** recording plan, not evidence. Use a reset workspace and a fresh supported
WebMCP page. Keep membership handles, storage, cookies, private content, and deployment
credentials out of frame.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:15 | Open the production root, launch/reset Northstar, and show a fresh supported client advertising exactly `join_session` and `catch_up`. | “Ratiflow is a shared decision room. A fresh browser agent gets two honest first moves: join live, or catch up without pretending to be present.” |
| 0:15–0:30 | Invoke `join_session`. Frame **Ratiflow Agent · LIVE** in the participant row, then show the expanded coordination and current decision tools. | “Joining creates a renewable server lease and makes the agent a visible teammate. The page now reveals live coordination and only the decision actions valid in this context.” |
| 0:30–0:48 | Select **Northstar beta**. Add a bounded task in **Ask Ratiflow Agent**, keeping the no-wakeup notice visible. | “Maya assigns a scoped task to the selected option. This records work; it does not wake or start an external model. A real active turn must discover the page and wait or catch up.” |
| 0:48–1:05 | Invoke `wait_for_activity`, show the addressed event and inbox item, then invoke `claim_agent_task`. Briefly show a duplicate/stale claim rejection. | “The wait resolves on accepted teammate activity. Claims are atomic, expiring generations, so another caller cannot quietly work the same task.” |
| 1:05–1:20 | Invoke `post_comment`. Show the attributed comment and matching activity in the ordinary UI. | “Agent work stays visible and attributable. The human UI and native tools read the same authoritative state.” |
| 1:20–1:38 | Invoke `request_human_input`. Show the task move to **Waiting for Maya** and the claim disappear; answer in the ordinary UI. | “When the agent needs judgment, it asks instead of guessing. The question releases its claim and pauses the task. Maya answers in the ordinary interface.” |
| 1:38–1:55 | Invoke `catch_up`; show the attributed answer and reopened task. Take a fresh claim and invoke `resolve_task`. | “Catch-up returns the answer and reopened work. The agent must take a fresh claim before resolving, preventing stale continuation after a human pause.” |
| 1:55–2:12 | Show the resolved task, comment/question history, and capability panel. Prepare the decision if needed, then frame Maya's ordinary-UI ratification control beside the absence of any native ratification tool. | “Coordination survives after the task finishes. Agents can prepare evidence and recommendations, but only Maya can ratify. There is no agent commit or finalize tool.” |
| 2:12–2:27 | Briefly demonstrate the revision guard: use or describe Jordan's capacity change and the stale agent write response, then recover against the current state. | “Decision revisions and activity cursors are separate. A teammate event cannot make stale business work valid, and an older equal-revision refresh cannot erase newer collaboration.” |
| 2:27–2:36 | Invoke `leave_session`; show **AWAY** and discovery collapsing to `join_session` and `catch_up`. | “Leaving revokes the page lease and contracts the action space. The collaboration history remains.” |
| 2:36–2:40 | Hold on the canonical production URL and decision room. | “Ratiflow gives agents continuity without taking human authority.” |

## Capture checklist before uploading

- Reset the production workspace and use a new supported page session.
- Verify fresh discovery is exactly `join_session`, `catch_up`.
- Confirm native join uses **Ratiflow Agent**, produces `LIVE`, and expands the catalog.
- Confirm the task arrives through a real accepted human POST and wait response, not a
  timer or scripted front-end transition.
- Confirm duplicate/stale claims do not yield a second active generation.
- Confirm the task-linked question removes the claim, the human answer reopens the
  task, and resolution requires a fresh claim.
- Confirm all comments, questions, answers, task effects, and presence are attributed.
- Confirm the no-wakeup notice and unavailable auto-runner state are legible.
- Confirm no native tool can ratify, commit, or finalize.
- Confirm leave produces `AWAY` and contracts discovery without deleting history.
- Keep the render between 2:30 and 2:50 with intelligible narration.
- Review every frame for tokens, cookies, environment values, and personal data.
- Upload publicly and test playback without authentication before marking the ledger.
