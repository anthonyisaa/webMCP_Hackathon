# Ratiflow narrated demo — 2:40 maximum

**Status:** recording plan, not release evidence. Use the deterministic synthetic
Northstar fixture, two isolated human browser sessions, and one supported WebMCP client
for Maya's already-active paired agent. Do not show DevTools, session fragments,
tokens, browser storage, cookies, or credentials.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:10 | Open Maya and Jordan's authorized top-level memo sessions side by side. Frame the calm document, presence, and quiet **Work | Memory** margin. | “Teams lose why recommendations changed across teammate and agent chats. Ratiflow keeps requests, decisions, and rejected facts with the memo, so the next agent does not restart the debate.” |
| 0:10–0:22 | In the supported client, show the five page tools. Invoke `inspect_document({})`; frame revision 1 and activity version 1. | “Maya's already-active agent discovers structured context directly from this page—no workspace ID, DOM scraping, or remote MCP setup.” |
| 0:22–0:34 | Invoke `wait_for_my_work({afterActivityVersion:1,afterRevision:1,timeoutSeconds:20})` and leave the native call pending. Frame **Your paired agent is listening on this page**. | “It can wait on explicit document cursors. The page is now a live rendezvous, not a static editor API.” |
| 0:34–0:56 | In Jordan's page, select exactly the October 15 recommendation, unmodified right-click, choose **Rewrite**, select Maya, enter the frozen instruction, and click **Assign work**. | “Jordan assigns one exact range to Maya's agent. The server—not the model—derives Jordan, Maya, the memo, and the selected text.” |
| 0:56–1:08 | Return to the native call. Show `WORK_AVAILABLE`, revision 1, activity version 2, and the one assigned order. | “The human event resolves the already-pending wait. Activity advanced, but the document revision did not.” |
| 1:08–1:25 | Invoke `read_document_memory({limit:20})`, then `list_my_work({})`. Show that Maya's agent sees only the frozen order and that `submit_work_proposal` was already available. | “The stable tool surface avoids a mid-turn discovery race; the server still accepts only work owned by this paired agent.” |
| 1:25–1:43 | Invoke `submit_work_proposal` with the frozen replacement and summary. In both human pages, frame the compact **Asked → Proposed** card beside the unchanged original sentence and revision 1. | “This is deliberately a proposal, not an edit. Both people can review it, and WebMCP has no accept or direct-apply tool.” |
| 1:43–2:05 | In Jordan's proposal **Details**, add the full frozen optional decision note and click **Accept**. Show both sessions synchronize to the beta sentence, completed work, revision 2, and activity version 4. | “Accept and reject are one click by default. Here Jordan adds the reason worth preserving; acceptance atomically records proposer, accepter, diff, and decision note.” |
| 2:05–2:19 | Open **Memory** in both sessions. Frame the one acceptance event and rationale; the five-tool catalog remains stable. | “The decision becomes shared memory, so later agents inherit the reasoning instead of restarting it.” |
| 2:19–2:35 | Start a fresh Maya-paired agent turn. Invoke `inspect_document({})` and `read_document_memory({limit:20})`; ask why full GA should not return on October 15. Show the answer citing Jordan's eight-day rationale. | “The final memo no longer contains the rejected eight-day fact. A fresh agent recovers it from the human decision instead of repeating the same idea.” |
| 2:35–2:40 | Hold on the final memo and Memory. | “People direct. Agents propose. Decisions remember.” |

## Frozen on-screen inputs

Jordan's selection is BODY code-point range `[16, 71)`:

```text
Launch CSV export as generally available on October 15.
```

Jordan's assignment instruction:

```text
Rewrite this recommendation to fit the 14-day capacity and protect the Northstar renewal. Keep both launch dates explicit.
```

Maya's agent proposal:

```text
Launch an invite-only, single-tenant Northstar beta on October 15, then make CSV export generally available on November 1.
```

Change summary:

```text
Replace October 15 GA with a single-tenant beta, then move general availability to November 1.
```

Jordan's authoritative rationale:

```text
Accepted because the beta uses the four export days left after reliability and still meets Northstar's November 1 deadline. Full GA on October 15 was rejected because it requires eight export days.
```

Fresh-agent golden answer:

```text
Jordan rejected October 15 full GA because it requires eight export days, while only four remain after ten days of reliability work. The accepted beta uses those four days and still meets Northstar's November 1 deadline.
```

## Preflight before recording

- [x] Owner has approved runtime commit `921dfc4236d6f95bbff0c4e4c4544efc6a947175`
  and the production deployment actions.
- [x] The v3 migration and optional decision-note migration are applied and smoked on
  production; static audit alone is not used as a persistence claim.
- [ ] The exact deployed build passes `.codex/verify.sh`, production build, 13/13 local
  and 13/13 hosted browser tests, production database checks, visual review, and
  runtime-health review. All are observed except the configured independent visual role,
  which is currently unavailable.
- [ ] A supported client discovers and invokes the real deployed page tools in the
  recording; five-tool discovery plus four read/wait invocations are already observed,
  but native proposal submission remains to capture. An injected adapter is not
  substituted in the video.
- [ ] The main cut captures N01–N09 on the exact deployed SHA; separate dated native
  artifacts cover N10 wait outcomes, N11 abort/teardown, and N12 runtime health.
- [ ] Reset produces the exact memo at revision 1/activity 1 with no work orders, and
  the human-opened bootstrap fragments are scrubbed before registration.
- [ ] Both human sessions are genuinely isolated and show distinct Maya/Jordan identity.
- [ ] Shift-right-click opens the real spelling menu; all modified/keyboard/native
  context branches, `Cmd/Ctrl+K`, 390px, conflict recovery, and WebMCP-off editing have
  separate sanitized evidence.
- [ ] The full hero rehearses five consecutive times without manual repair.
- [ ] The first native invocation lands before 0:45 and the final cut is at most 2:40.
- [ ] R01–R04 are complete: five canonical native rehearsals, timing, an exact-SHA claim
  manifest, and the verified live/repository/video package. The local adapter preflight
  does not complete R01.
- [ ] Four independent criterion judges pass: WebMCP Leverage 5/5, all others at least
  4.5/5, total at least 19/20, and no must-fix.
- [ ] The pre-recording manifest binds every available artifact to the exact SHA and
  leaves only genuinely post-recording/public rows `PENDING`; adapter evidence closes
  no native or release row. The final validator runs after publication.
- [ ] Every frame and transcript is checked for share/session tokens, fragments,
  cookies, credentials, private content, and unrelated browser context.
- [ ] Owner uploads the narrated cut publicly to YouTube, verifies playback without sign-in, and
  only then replaces the pending video entry in [the ledger](README.md).
