# Ratiflow hero scenario — canonical seed and goldens

Product: **Ratiflow** — “Agents prepare. People ratify. Work moves.”

This is the only seed scenario used by the hero flow, native WebMCP proof, agent
trajectory eval, and recording at `/` (with `/decision-demo` as a stable alias). Reset
returns that workspace to revision 7 exactly. The separate shared note at `/document`
is not seeded by this scenario.

## Seed

| Entity | Canonical value |
| --- | --- |
| Workspace | `ws_northstar_csv_launch` — “Northstar CSV launch scope” |
| Decision | `dec_csv_oct15` — whether CSV export belongs in the Oct 15, 2026 launch of a B2B analytics product |
| Maya Chen | `usr_maya_chen`, Product Lead; the sole ratifier in this scenario |
| Jordan Lee | `usr_jordan_lee`, Engineering Lead; collaborator |
| Demo agent | `agent_ratiflow_demo`, displayed as `Ratiflow Agent` |
| Customer | `cust_northstar_health`, Northstar Health; $180,000 annual renewal; needs usable CSV export by Nov 1, 2026, not necessarily GA on Oct 15 |
| Option O1 | `opt_csv_ga_oct15` — full CSV export, GA Oct 15, 2026 |
| Option O2 | `opt_csv_beta_oct15` — invite-only, single-tenant Northstar beta Oct 15, 2026; GA Nov 1, 2026 |
| Option O3 | `opt_csv_defer_nov1` — defer all export to GA Nov 1, 2026 |
| Follow-up | `fu_customer_launch_brief` — `customer-launch-brief` |

At revision **7**, `dec_csv_oct15` is `READY`, its domain recommendation is O1, and
launch capacity is 18 engineer-days. The known work is: core reliability 10 engineer-
days, full GA export 8, and invite-only single-tenant beta 4. A freshly loaded Maya page
selects the decision root at `contextEpoch: 1`. Maya then selects O1, which advances the
page to epoch 2 and adds the selected-option tools without changing workspace revision.
The agent possesses a valid revision-7, epoch-2 handle and mutation input for
`add_evidence`.

### Exact option arithmetic

| Option | Oct 15 reliability | Oct 15 export | Oct 15 total | Post-launch export | Deadline assessment |
|---|---:|---:|---:|---:|---|
| O1 | 10 | 8 | 18 | 0 | GA before Nov 1, but no longer fits revision-8 capacity |
| O2 | 10 | 4 | 14 | 4 | Northstar beta Oct 15 and GA Nov 1; fits revision-8 capacity |
| O3 | 10 | 0 | 10 | 8 | GA Nov 1 with zero schedule buffer; highest renewal timing risk |

### Exact seed evidence

All six records are authored by `system_seed` (`Seed fixture`) and exist at revision 7:

| ID | Option | Kind / stance | Title | Detail | Source / metrics |
|---|---|---|---|---|---|
| `ev_capacity_r7` | decision | `ENGINEERING_ESTIMATE` / `CONTEXT` | Launch capacity | 18 engineer-days are available for the Oct 15 launch. | Jordan planning note; `engineerDays: 18` |
| `ev_core_reliability` | decision | `ENGINEERING_ESTIMATE` / `CONTEXT` | Core reliability | Launch reliability work requires 10 engineer-days. | Engineering plan; `engineerDays: 10` |
| `ev_o1_ga_effort` | O1 | `ENGINEERING_ESTIMATE` / `SUPPORTS` | Full GA export effort | Full GA export requires 8 launch engineer-days. | Export estimate; `engineerDays: 8` |
| `ev_o2_beta_effort` | O2 | `ENGINEERING_ESTIMATE` / `SUPPORTS` | Northstar beta effort | A single-tenant beta requires 4 launch engineer-days; the remaining 4 complete GA after launch. | Export estimate; `engineerDays: 4` |
| `ev_o3_deferred_effort` | O3 | `DELIVERY_RISK` / `CONTEXT` | Deferred export effort | O3 uses 0 export days before Oct 15 and all 8 after launch, leaving no buffer before Nov 1. | Export estimate; `engineerDays: 0` |
| `ev_northstar_deadline` | decision | `CUSTOMER_DEADLINE` / `CONTEXT` | Northstar renewal requirement | The $180,000 renewal needs usable CSV export by Nov 1, not general availability on Oct 15. | Renewal brief; `annualValueUsd: 180000`, `date: 2026-11-01` |

## Deterministic timeline

| Revision | Actor / origin | Action | Result |
| --- | --- | --- | --- |
| 7 | Seed / reset | O1 is the domain recommendation with 18 days of capacity; page selection starts at the decision root. | `READY`; `prepare_decision` is present; `customer-launch-brief` is `BLOCKED`; epoch 1. |
| 7 (page-local) | Maya Chen / ordinary UI | Selects O1. | Epoch 1 → 2; `inspect_selected_option` and `challenge_option` are added; workspace revision stays 7. |
| 8 | Jordan Lee / ordinary UI in a second browser | Changes capacity from 18 to 14 because of a four-day incident rotation. | `READY` → `CONTESTED`; O1 remains the domain and page selection; page-local epoch stays 2; `prepare_decision` is removed while `add_evidence` remains registered. |
| 8 (rejected) | `Ratiflow Agent` / `add_evidence` WebMCP call with rev-7 input | The still-registered tool reaches page code. | Reject with `STALE_WORK_STATE` and the exact diff below; no new revision. |
| 9 | `Ratiflow Agent` / WebMCP recovery | Inspects revision 8, compares options, and calls `recommend_option` for O2 using the seeded beta-effort evidence. | The mutation advances workspace revision to 9; `READY`; O2 becomes the domain recommendation; the page follows it and advances epoch to 3; `prepare_decision` returns. |
| 10 | `Ratiflow Agent` / `prepare_decision` WebMCP call | Prepares O2. | `REVIEW`; prepared decision records revision 10. |
| 11 | Maya Chen / ordinary UI | May edit local wording fields, then submits those edits with ratification as one transaction. | `COMMITTED`; no WebMCP tool can ratify. `customer-launch-brief` becomes `READY`. |

Exact stale-work response at revision 8:

```json
{
  "ok": false,
  "code": "STALE_WORK_STATE",
  "message": "Workspace advanced from revision 7 to 8.",
  "retryable": true,
  "currentWorkspaceRevision": 8,
  "contextEpoch": 2,
  "currentCapabilities": {
    "state": "CONTESTED",
    "workspaceRevision": 8,
    "contextEpoch": 2,
    "selection": { "kind": "OPTION", "id": "opt_csv_ga_oct15" },
    "availableTools": [
      "inspect_decision",
      "inspect_selected_option",
      "recommend_option",
      "challenge_option",
      "add_evidence",
      "compare_options",
      "why_not"
    ],
    "unavailableActions": [
      {
        "action": "prepare_decision",
        "unmetPredicates": [
          "selected option requires 18 engineer-days but launch capacity is 14"
        ]
      },
      {
        "action": "ratify_decision",
        "unmetPredicates": [
          "ratification is never available through WebMCP; Maya Chen must ratify in the ordinary UI",
          "ratification requires a prepared decision in REVIEW"
        ]
      }
    ]
  },
  "expectedWorkspaceRevision": 7,
  "actualWorkspaceRevision": 8,
  "changes": [
    {
      "eventId": "evt_0008_capacity_reduced",
      "actor": { "id": "usr_jordan_lee", "name": "Jordan Lee", "role": "Engineering Lead" },
      "origin": "ORDINARY_UI",
      "reason": "Four-day incident rotation",
      "resultingRevision": 8,
      "changes": [
        { "field": "decision.launchCapacityEngineerDays", "before": 18, "after": 14 },
        { "field": "decision.state", "before": "READY", "after": "CONTESTED" },
        { "field": "capabilities.prepare_decision", "before": true, "after": false }
      ]
    }
  ],
  "nextAction": "Call inspect_decision, refresh WebMCP tools, then retry against workspace revision 8."
}
```

Committed follow-up (`fu_customer_launch_brief`): `BLOCKED` → `READY`; Northstar
beta Oct 15, 2026, GA Nov 1, 2026, owner Maya Chen (`usr_maya_chen`), due Oct 16,
2026. Selecting it
while committed exposes `inspect_followup`.

## Golden answers

| Question | Required answer |
| --- | --- |
| What was decided? | O2: an invite-only, single-tenant Northstar beta on Oct 15, followed by GA on Nov 1. |
| Why? | The incident rotation reduced capacity to 14 days. O1 needs 18 days (10 reliability + 8 full GA export), while O2 needs 14 (10 reliability + 4 beta) and still gives Northstar usable export by Nov 1. |
| What changed? | Jordan reduced capacity from 18 to 14 in a second browser due to a four-day incident rotation; the decision moved `READY` to `CONTESTED`, invalidating the agent’s revision-7 basis. |
| What remains open? | GA readiness and the customer-launch-brief execution after the Oct 15 beta; the committed launch scope itself is not open. |
| Who ratified? | Maya Chen, Product Lead, in the ordinary human UI at revision 11. |

## Reset requirements

- Reset recreates the same IDs, facts, domain recommendation O1, revision 7, `READY`
  state, 18-day capacity, blocked follow-up, and decision-root page selection at epoch 1.
  Selecting O1 deterministically produces the revision-7, epoch-2 agent
  `add_evidence` input.
- Reset clears all later evidence, selection/support for O2, prepared decision,
  human wording edit, ratification, history, and second-browser change.
- The second browser must perform Jordan’s revision-8 change against the same workspace.
  It may be operated by a person or a clearly labeled deterministic synthetic driver;
  it is never a simulated timer or a single-window mock.
- Replaying the timeline yields the same revisions, states, option, stale response,
  follow-up fields, and golden answers.

## Required ≤3-minute video evidence

1. Establish the live workspace, O1, and 18-day capacity; select O1 and show the two
   selected-option tools appear in native discovery.
2. Show Jordan in a genuine second browser changing capacity to 14 for the incident
   rotation; show the resulting `CONTESTED` state and removal of `prepare_decision`.
3. Invoke the agent’s old `add_evidence` input and show the in-page `STALE_WORK_STATE`
   response with Jordan’s exact diff.
4. Show agent recovery to O2 and the return of `prepare_decision`, then preparation.
5. Show Maya ratifying in the ordinary UI (not through WebMCP), the committed provenance,
   and the `customer-launch-brief` transition to `READY` with its inherited details.
