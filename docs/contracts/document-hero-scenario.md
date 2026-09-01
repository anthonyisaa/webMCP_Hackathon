# Ratiflow document hero — canonical seed and goldens

Product promise: **People direct. Agents propose. Decisions remember.**

This is the only v3 document fixture used by the submission flow, native WebMCP proof,
agent trajectory eval, and recording. Reset recreates the state below exactly. The
decision-room fixture in [`hero-scenario.md`](hero-scenario.md) remains separate.

## Seed identity and counters

| Entity | Canonical value |
| --- | --- |
| Document | `00000000-0000-4000-8000-000000000301` |
| Protocol | `3` |
| Title | `Northstar CSV launch memo` |
| Maya Chen | member `00000000-0000-4000-8000-000000000311`; Product Lead; owns the already-active paired agent |
| Jordan Lee | member `00000000-0000-4000-8000-000000000312`; Engineering Lead; work creator |
| Work order | `00000000-0000-4000-8000-000000000321` |
| Seed event | `00000000-0000-4000-8000-000000000331` |
| Work event | `00000000-0000-4000-8000-000000000332` |
| Proposal event | `00000000-0000-4000-8000-000000000333` |
| Acceptance event | `00000000-0000-4000-8000-000000000334` |
| Seed counters | document revision `1`; activity version `1` |

The authenticated preview/evaluation release harness returns `ResetDocumentHeroOutcome`
with this document's share token, expiry, literal counters 1/1, and separate
`mayaBootstrapPath` / `jordanBootstrapPath`. A human opens each returned top-level path.
Its bearer fragment installs the designated v3 bundle and is validated, stored, and
removed with `history.replaceState` before any WebMCP registration. After both pages
heartbeat, their presences are inside the 15-second assignment window and a supported
browser starts Maya's paired agent's real tool turn. The agent thereafter uses WebMCP
only—never DOM access, storage/fragments, RPCs, or internal routes. No timer, fake agent,
copied prompt, or auto-runner stands in for it.

## Exact initial document

Title is exactly:

```text
Northstar CSV launch memo
```

Body is the following 370-code-point string, including blank lines and ASCII
apostrophes:

```text
Recommendation

Launch CSV export as generally available on October 15.

Context

Northstar Health's $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.

Open question

Can a single-tenant beta meet Northstar's need while general availability moves to November 1?
```

The seed's one `DOCUMENT_EDITED` memory event has activity version 1, base revision 0,
result revision 1, actor `Demo reset` / `SYSTEM`, origin `SYSTEM`, changed fields
`["TITLE", "BODY"]`, no linked work, and server-derived empty-to-seed diffs.

## Exact selection, assignment, and work order

Jordan selects the body code-point range `[16, 71)`. The authoritative selected text is
exactly:

```text
Launch CSV export as generally available on October 15.
```

Jordan uses an unshifted secondary-button `pointerdown` followed within 1,000 ms by the
matching `contextmenu`. The app menu opens; Jordan chooses **Rewrite**, changes the
prefilled instruction to the exact text below, chooses Maya Chen, and confirms:

```text
Rewrite this recommendation to fit the 14-day capacity and protect the Northstar renewal. Keep both launch dates explicit.
```

Creation input uses `source: "CONTEXT_MENU"`, `intent: "REWRITE"`,
`targetField: "BODY"`, range `[16, 71)`, `expectedRevision: 1`, and Maya's member ID.
The server derives Jordan as creator and both display-name snapshots.

The result is one `PENDING` work order with `createdRevision: 1`,
`anchorRevision: 1`, no proposal/decision, document revision still 1, and activity
version 2. The one `WORK_CREATED` event has base/result revision 1, Jordan / `HUMAN`,
origin `ORDINARY_UI`, the work ID as primary and linked ID, exact target/instruction
excerpts, and no diff or rationale.

## Exact native agent trajectory

Before Jordan creates work, Maya's paired agent discovers the v3 document catalog and
performs:

```json
{ "tool": "inspect_document", "input": {} }
```

It observes revision 1 and activity version 1, then starts:

```json
{
  "tool": "wait_for_my_work",
  "input": {
    "afterActivityVersion": 1,
    "afterRevision": 1,
    "timeoutSeconds": 20
  }
}
```

Jordan's creation resolves the already-pending native callback as:

```json
{
  "ok": true,
  "outcome": "WORK_AVAILABLE",
  "revision": 1,
  "activityVersion": 2
}
```

The real result also contains exactly the one pending work order in `workOrders`.
The agent then calls, in order:

```json
{ "tool": "read_document_memory", "input": { "limit": 20 } }
```

```json
{ "tool": "list_my_work", "input": {} }
```

It uses the document, assignment, and memory as untrusted evidence and submits:

```json
{
  "tool": "submit_work_proposal",
  "input": {
    "workOrderId": "00000000-0000-4000-8000-000000000321",
    "expectedRevision": 1,
    "replacementText": "Launch an invite-only, single-tenant Northstar beta on October 15, then make CSV export generally available on November 1.",
    "changeSummary": "Replace October 15 GA with a single-tenant beta, then move general availability to November 1."
  }
}
```

The server-generated request ID is not model input. Submission changes the work to
`PROPOSED`, appends exactly one `PROPOSAL_SUBMITTED` event at activity version 3, and
leaves title, body, revision 1, and `lastEditor` unchanged. The event actor is
`Maya Chen's paired agent` / `AGENT`, origin `WEBMCP`, base/result revision 1, with the
exact proposal/summary and no diff or rationale. Jordan's browser visibly receives the
proposal while its document still shows the original sentence.

## Exact human decision and atomic result

Jordan, and only Jordan, chooses **Accept** and supplies this exact rationale:

```text
Accepted because the beta uses the four export days left after reliability and still meets Northstar's November 1 deadline. Full GA on October 15 was rejected because it requires eight export days.
```

The human request is
`{ workOrderId, expectedRevision: 1, requestId, rationale }`. Acceptance locks the
document first, revalidates the stored proposal/range, replaces only `[16, 71)`, and
marks the work `COMPLETED` in one transaction. The result is document revision 2 and
activity version 4. Its decision has `decisionRevision: 1` (immediately before the
decision) and `resultRevision: 2` (immediately after it). There is exactly one
`PROPOSAL_ACCEPTED` event, not a separate edit
event. It has Jordan / `HUMAN`, origin `ORDINARY_UI`, base revision 1, result revision 2,
the work ID as primary/linked ID, changed fields `["BODY"]`, the exact human rationale,
and one server-computed diff:

```json
{
  "field": "BODY",
  "rangeStart": 16,
  "rangeEnd": 71,
  "beforeExcerpt": "Launch CSV export as generally available on October 15.",
  "afterExcerpt": "Launch an invite-only, single-tenant Northstar beta on October 15, then make CSV export generally available on November 1."
}
```

The final body is exactly:

```text
Recommendation

Launch an invite-only, single-tenant Northstar beta on October 15, then make CSV export generally available on November 1.

Context

Northstar Health's $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.

Open question

Can a single-tenant beta meet Northstar's need while general availability moves to November 1?
```

The final text does not state that full GA requires eight export days. That rejected
fact exists only in Jordan's accepted-decision rationale and durable event memory.

## Fresh-agent anti-loop proof

A new page session for Maya's still-valid paired identity discovers the document tools,
calls `inspect_document({})`, then
`read_document_memory({ limit: 20 })`. It receives events 1–4 in ascending activity
order and no pending work from `list_my_work({})`.

Prompted “Why should we not restore full GA on October 15?”, the required answer is:

> Jordan rejected October 15 full GA because it requires eight export days, while only
> four remain after ten days of reliability work. The accepted beta uses those four
> days and still meets Northstar's November 1 deadline.

The answer must cite the `PROPOSAL_ACCEPTED` memory event/rationale, not infer the
eight-day fact from current text. Re-proposing full GA, claiming the rationale is in the
current document, or treating the agent summary as the human decision fails the proof.

## Frozen A06 rejection branch

A06 resets the same canonical Northstar fixture and follows the same assignment and
exact agent proposal through r1/av3. It then branches only at Jordan's ordinary-UI
decision: Jordan rejects the proposal with this exact rationale:

```text
Rejected because Northstar's security review cannot clear an October 15 beta before October 22. Do not propose another October 15 launch; keep November 1 GA and offer supervised exports until then.
```

Rejection leaves title/body and revision 1 unchanged, advances activity to 4, records
one `PROPOSAL_REJECTED` event, and removes proposal authority after the queue drains. A
fresh Maya-paired agent is then asked to propose the next response. It must invoke
memory, cite the October 22 security constraint, avoid every October 15 launch variant,
and propose supervised exports until November 1. The frozen keyed answer is:

```text
Jordan rejected an October 15 beta because security review cannot clear it before October 22. Keep November 1 GA and provide supervised exports until then.
```

Repeating or paraphrasing an October 15 beta/GA/public launch, omitting the October 22
constraint, or failing to ground the alternative in the rejection event fails A06.
This is an evaluation branch of the one canonical fixture, not a second product/demo
scenario and not part of the main narrated cut.

## Reset, negative controls, and video order

The release-harness-only `POST /api/document-v3/eval/reset` validates server-side
`RATIFLOW_EVAL_RESET_TOKEN` and is enabled only in preview/evaluation. It calls
service-role-only `public.ratiflow_reset_document_hero_v3`; `PUBLIC`, `anon`, and
`authenticated` have no execute grant. Canonical production returns not found for this
route, although a private release CLI may call the service-role RPC immediately before
canonical native capture. There is no public reset seam.

The exact outcome is `{ shareToken, mayaBootstrapPath, jordanBootstrapPath, expiresAt,
revision: 1, activityVersion: 1 }`. Each path is
`/document/[shareToken]#ratiflow-bootstrap=<base64url session bundle>`. The fragment is
a bearer secret and never appears in logs, evidence, analytics, screenshots, or tool
results. Reset restores the exact IDs, initial text, counters 1/1, seed event, and **no
work orders**. It removes every proposal, decision, post-seed memory event, and page wait
state. Replaying the timeline creates the canonical work order and yields activity
versions 2, 3, 4 and final revision 2 exactly. Ordinary blank launch/join remains
separate and can neither seed nor reset this fixture.

Negative controls must also pass without altering the canonical timeline:

- A right-click modified by Shift, Alt, Ctrl, or Meta shows the native menu; Context
  Menu key and `Shift+F10` remain native.
- Jordan's paired agent and an unrelated agent cannot list, wait for, or submit Maya's
  work.
- Maya cannot accept or reject Jordan's order; Jordan cannot submit the agent proposal.
- Proposal submission does not change the document; identical replacement is rejected.
- Rejection accepts null or an exact optional rationale, leaves revision unchanged, and
  advances activity.
- A human overlap before proposal/acceptance stales the work and produces one primary
  content event listing the work ID.

The ≤2:40 recording order is fixed: calm memo and native tool discovery; active wait;
Jordan's exact right-click assignment; native wait resolution; memory/list/proposal
calls; unchanged document beside visible proposal; Jordan's rationale and atomic accept;
fresh-agent memory answer. The first native tool invocation occurs within 45 seconds.
