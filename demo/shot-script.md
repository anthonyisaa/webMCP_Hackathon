# Ratiflow narrated demo — 2:46 target

**Status:** recording plan, not evidence. Primary flow uses two real browser windows:
Maya plus Jordan’s separately attributed session. If a single-window synthetic Jordan
fallback is used, label it onscreen exactly as “synthetic collaborator — same UI/service
path.” Keep browser chrome, session handles, and secrets out of frame.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:12 | Open the live Ratiflow workspace already at revision 7. Frame the decision, O1, 18-day capacity, and Capability Field. | “This is Ratiflow: a shared decision room where agents prepare, people ratify, and every action has a visible basis. We’re deciding how to deliver CSV export for Northstar.” |
| 0:12–0:29 | Maya selects O1. Show native WebMCP discovery before and after; keep the visible Capability Field in frame. | “The live page is the agent’s action surface. Selecting O1 adds option-scoped tools—no remote MCP server, connector setup, OAuth, or copied workspace ID. The UI and native discovery read the same compiled capability.” |
| 0:29–0:50 | **Primary:** switch to Jordan’s genuine second browser/session; change capacity 18 → 14. **Fallback:** use the single-window control only with the onscreen synthetic-collaborator label. Return to Maya’s page. | **Primary:** “Jordan is the engineering lead in a separate session. An incident rotation cuts capacity from eighteen to fourteen engineer-days.” **Fallback:** “This labeled synthetic collaborator uses the same UI and service path.” |
| 0:50–1:12 | On Maya’s page, show revision 8, `CONTESTED`, and refreshed native discovery with `prepare_decision` gone. Submit the retained stale rev-7 `add_evidence` request and frame its structured diff. | “The page refetches authority and recompiles the native tools. Preparation disappears. The old revision-seven write is safely rejected—not silently applied—with Jordan’s exact change, the state transition, and the next action.” |
| 1:12–1:37 | Use native tools to inspect, compare options, and recommend O2. Show revision 9, `READY`, O2, and returned `prepare_decision`. | “The agent recovers from the structured stale result. O2—the invite-only Northstar beta—fits fourteen days at launch and still gives usable export by November first. When the facts support it, preparation returns.” |
| 1:37–1:57 | Invoke `prepare_decision`. Show the editable review card and `REVIEW` state. Use `why_not` or the unavailable authority message if clearly visible. | “The agent can prepare an editable review card, but it cannot commit. There is intentionally no ratify or commit WebMCP tool. That boundary stays visible to both the person and the agent.” |
| 1:57–2:18 | Maya optionally edits wording and clicks the ordinary UI ratify control. Show revision 11 and `COMMITTED`. | “Maya, the Product Lead, makes the consequential call in the ordinary human UI. Server-side session, revision, and state checks enforce that only this route can ratify.” |
| 2:18–2:37 | Select `customer-launch-brief`; show `BLOCKED` → `READY`, inherited dates/owner, then show the provenance list. | “Ratification moves downstream work: the customer launch brief becomes ready. The timeline preserves whether work came from a person, WebMCP, or the labeled synthetic demo path, with revisions and rationale.” |
| 2:37–2:46 | Return to the full workspace and Capability Field. Show the live URL. Use the final narration below only after the repository is public. | “Ratiflow makes a live page—not a static API menu—the agent’s current, reviewable action space. The live app and evidence are ready for judging.” After public release, add: “The source is public too.” |

## Capture checklist before uploading

- Confirm the deployment is the final public product, not the earlier lifecycle probe.
- Reset and capture the exact revision-7 → 11 route; record deployment URL, commit, date,
  and native client/browser version outside the video.
- Confirm audio is intelligible at normal volume and the final render is 2:40–2:50.
- Review every frame for personal data, session handles, cookies, and API keys.
- Upload publicly to YouTube; test playback without authentication; then update
  [demo/README.md](README.md) with the real link and evidence status.
