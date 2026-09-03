/** Production seed data. Tests compare these builders with independent JSON goldens. */
export const POSTMORTEM_EXAMPLE = {
  title: "INC-482 · Checkout outage postmortem",
  launchSummary: "Created the checkout outage postmortem.",
  body: `## Summary

Checkout requests failed for 38 minutes after a payment-provider throttling event. Service recovered after the retry middleware was rolled back.

## Impact

Investigation in progress.

## Timeline

Investigation in progress.

## Root cause

Investigation in progress.

## Detection and response

The on-call engineer responded to the checkout error-rate alert and coordinated rollback.

## Contributing factors

The retry path had not been load-tested against provider throttling.

## Corrective actions

- [ ] Honor \`Retry-After\` — Payments Platform — September 5
- [ ] Add provider-throttling load tests — Checkout — September 7
- [ ] Alert on retry amplification — Reliability — September 6

## Learnings

Separate external triggers from internal amplifiers when assigning root cause.`,
  tasks: {
    impact: {
      agentName: "Databot",
      prompt: "@Databot Use impact.csv to replace this placeholder with verified checkout attempts, succeeded and failed counts, affected merchants, duplicate-charge status, a GFM outcome table, and a bar chart.",
      replacement: `Between 09:43 and 10:21 UTC, 28,417 checkout attempts produced 21,675 successes and 6,742 failures across 311 merchants. No duplicate charges occurred.

| Outcome | Count |
|---|---:|
| Attempted | 28,417 |
| Succeeded | 21,675 |
| Failed | 6,742 |
| Merchants affected | 311 |
| Duplicate charges | 0 |

\`\`\`chart
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
\`\`\``,
      summary: "Added verified impact totals, the derived success count, a GFM outcome table, and a revisioned checkout-outcome chart; confirmed zero duplicate charges.",
      evidence: ["impact.csv"],
    },
    timeline: {
      agentName: "Logbot",
      prompt: "@Logbot Use checkout.log to replace this placeholder with the exact UTC incident timeline from provider throttling through recovery.",
      replacement: `- **09:43 UTC** — Provider HTTP 429 responses began.
- **09:47 UTC** — Retry traffic reached 5.8× baseline and queue depth grew from 420 to 18,240.
- **10:17 UTC** — The team rolled back retry middleware commit \`7d3c9e1\`.
- **10:21 UTC** — Checkout success rate recovered.`,
      summary: "Added the observed 09:43–10:21 UTC sequence, retry amplification, queue growth, rollback, and recovery from checkout.log.",
      evidence: ["checkout.log"],
    },
    cause: {
      agentName: "Builder",
      prompt: "@Builder Use commit 7d3c9e1 and checkout.log to explain the external trigger, the internal amplifier, and why the outage persisted.",
      replacement: "Provider 429 throttling triggered the incident. Retry middleware introduced in commit `7d3c9e1` ignored `Retry-After` and made up to five zero-delay retries. That behavior amplified provider errors and sustained checkout failures until rollback.",
      summary: "Separated the provider 429 trigger from the retry regression that amplified and sustained the failure.",
      evidence: ["checkout.log", "commit:7d3c9e1"],
    },
    clarification: {
      agentName: "Builder",
      prompt: "@Builder Clarify this section using the earlier discussion: state that provider 429 throttling was the external trigger, quantify the retry amplification and queue growth, and explain why the retry regression—not provider latency alone—was the root cause of the sustained failure.",
      replacement: "Provider 429 throttling at 09:43 UTC was the external trigger. It would not, by itself, explain the sustained 38-minute checkout failure. Retry middleware introduced in commit `7d3c9e1` ignored `Retry-After` and made up to five zero-delay retries, driving retry traffic to 5.8× baseline and queue depth from 420 to 18,240. The retry regression was therefore the internal amplifier and root cause of the sustained failure; provider latency alone was not.",
      summary: "Clarified trigger versus root cause using Priya's question; quantified the 5.8× retry traffic and 420→18,240 queue growth, and ruled out provider latency alone.",
      evidence: ["checkout.log", "commit:7d3c9e1", "thread:PM-HUMAN-DISCUSSION-1"],
    },
  },
  discussion: "Provider throttling happened first. Are we overclaiming our code as the root cause?",
} as const;

export const PRODUCT_DOCUMENT_EXAMPLE = {
  title: "Northstar · CSV export launch decision",
  launchSummary: "Created the Northstar CSV launch decision.",
  body: `## Decision summary

Synthesis pending.

## Customer and business context

Northstar's **$180,000 renewal** requires production-ready CSV export by **November 1**. The customer needs reliable exports for finance reconciliation, not a one-off internal download.

## Capacity and constraints

- Engineering capacity before October 15: **18 days**.
- Reliability work: **10 engineering days**.
- Invite-only beta export: **4 engineering days**.
- Full GA export: **8 engineering days total**.

## Options and trade-offs

Analysis in progress.

## Milestones

- **October 15** — Candidate invite-only beta checkpoint.
- **November 1** — Contractual production-ready CSV deadline.

## Scope

In scope: CSV download for approved Northstar datasets, audit metadata, export correctness monitoring, and a support runbook.

Out of scope: scheduled delivery, custom schemas, and exports for the full customer base before GA.

## Success measures

- Reliability work completes before beta.
- Design partners can export correct CSV files on October 15.
- Full GA support and the renewal-critical commitment are ready by November 1.

## Risks and guardrails

The beta must remain invite-only until correctness and support signals are reviewed. No milestone label may imply general availability before November 1.`,
  capacityBefore: "- Engineering capacity before October 15: **18 days**.",
  capacityAfter: "- Engineering capacity before October 15: **14 days after reserving 4 days for incident rotation**.",
  dataTask: {
    prompt: "@Databot Compare the reliability-only, staged beta, and full-export-now options using the corrected 14-day pre-beta capacity. Add the arithmetic, a GFM table, and a bar chart, then recommend a sequence that protects the $180,000 renewal and November 1 CSV commitment.",
    replacement: `The corrected pre-beta window is **14 engineering days**. Reliability-only uses 10 days and fits, but it does not deliver CSV. A staged beta uses 10 reliability days + 4 beta-export days = 14 days and exactly fits. Building all 8 export days before beta would require 10 + 8 = 18 days, exceeding capacity by 4.

| Option | Reliability | CSV work before Oct 15 | Total days | Fits 14 days? | Customer outcome |
|---|---:|---:|---:|---|---|
| Reliability only | 10 | 0 | 10 | Yes | No CSV; renewal commitment remains at risk |
| Staged invite-only beta | 10 | 4 | 14 | Yes, exactly | Design-partner beta Oct 15; 4 export days remain |
| Full export before beta | 10 | 8 | 18 | No, 4 over | GA scope too early and reliability competes for capacity |

\`\`\`chart
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
\`\`\`

**Recommendation:** complete reliability plus the four-day invite-only beta slice by October 15, then use beta feedback while finishing the remaining four export days for full GA on November 1. This is the only option that fits corrected pre-beta capacity and preserves the $180,000 renewal commitment.`,
    summary: "Compared all three options against corrected capacity, showed that 10 + 4 = 14 fits while 10 + 8 = 18 is four days over, and recommended an October 15 staged beta followed by November 1 GA.",
    evidence: ["northstar-renewal.md", "capacity-plan.md", "export-estimate.md", "revision:r2"],
  },
  synthesisTask: {
    prompt: "@ChatGPT Synthesize the decision using the corrected capacity and Databot analysis. State the October 15 audience, November 1 GA commitment, renewal consequence, scope, and guardrails without describing the beta as customer-ready GA.",
    replacement: `Ship the reliability work and an **invite-only CSV beta to designated Northstar design partners on October 15**. Use that beta to validate export correctness, audit metadata, monitoring, and the support runbook; it is not GA and is not customer-ready for the full account base.

Complete the remaining four export days after the beta checkpoint and launch **full GA on November 1**. The $180,000 renewal depends on production-ready CSV by that date. Do not broaden access before correctness and support signals pass their guardrails, and do not trade away the 10 reliability days to pull GA forward.`,
    summary: "Synthesized the staged decision with an explicit design-partner-only October 15 beta, November 1 GA, $180,000 renewal consequence, and reliability/correctness guardrails.",
    evidence: ["task:TASK-1", "revision:r2", "revision:r3", "northstar-renewal.md"],
  },
  discussionQuestion: "Does “invite-only beta” make the October 15 build sound customer-ready? The renewal depends on full GA by November 1.",
  discussionReply: "October 15 is limited to designated design partners. Production support and full-account availability start only at November 1 GA; the decision wording keeps that boundary explicit.",
  alternative: "Ship CSV to every customer on October 15 and treat that date as general availability. Finish reliability and support follow-up after launch; the November 1 renewal date remains unchanged.",
  restoreSummary: "Restored the staged design-partner beta and November 1 GA decision.",
} as const;

/**
 * Additive v4.2 presentation metadata for the seeded living-document examples.
 *
 * The document remains one immutable Markdown source. `sheetBreakHeading` is only a
 * deterministic visual split point, while `guidedWork` describes the one managed-agent
 * action deliberately left for the judge. Historical self-declared agents retain their
 * original provenance; the pending action is the managed Relay overlay.
 */
export const MANAGED_RELAY_EXAMPLE_OVERLAYS = {
  POSTMORTEM: {
    title: POSTMORTEM_EXAMPLE.title,
    sheetBreakHeading: "## Detection and response",
    sheetHeadings: [
      ["## Summary", "## Impact", "## Timeline", "## Root cause"],
      [
        "## Detection and response",
        "## Contributing factors",
        "## Corrective actions",
        "## Learnings",
      ],
    ],
    guidedWork: {
      agentHandle: "code",
      sectionHeading: "## Root cause",
      selectionText: POSTMORTEM_EXAMPLE.tasks.clarification.replacement,
      prompt:
        "@Code Reframe this root-cause section as exactly three labeled Markdown bullets—Trigger, Amplifier, and Why it persisted—using the synthetic repository and checkout log. Preserve every verified date, quantity, and source reference, then replace only this section.",
      evidenceRefs: ["checkout.log", "commit:7d3c9e1"],
      syntheticSourceLabels: [
        "Synthetic demo data · checkout.log",
        "Synthetic demo data · commit:7d3c9e1",
      ],
    },
    seededHistory: {
      headRevision: 5,
      hasHumanRevision: true,
      hasAgentRevision: true,
      historicalAgentIdentitySource: "SELF_DECLARED",
      hasClosedHumanDiscussion: true,
      liveManagedActionPending: true,
    },
  },
  PRODUCT_DOCUMENT: {
    title: PRODUCT_DOCUMENT_EXAMPLE.title,
    sheetBreakHeading: "## Scope",
    sheetHeadings: [
      [
        "## Decision summary",
        "## Customer and business context",
        "## Capacity and constraints",
        "## Options and trade-offs",
        "## Milestones",
      ],
      ["## Scope", "## Success measures", "## Risks and guardrails"],
    ],
    guidedWork: {
      agentHandle: "data",
      sectionHeading: "## Success measures",
      selectionText: `- Reliability work completes before beta.
- Design partners can export correct CSV files on October 15.
- Full GA support and the renewal-critical commitment are ready by November 1.`,
      prompt:
        "@Data Check these success measures against the synthetic Northstar capacity plan. Show which October 15 scope fits 14 engineering days and preserve the November 1 renewal commitment, then replace only this section.",
      evidenceRefs: ["northstar_launch_capacity"],
      syntheticSourceLabels: ["Synthetic demo data · northstar_launch_capacity"],
    },
    seededHistory: {
      headRevision: 6,
      hasHumanRevision: true,
      hasAgentRevision: true,
      historicalAgentIdentitySource: "SELF_DECLARED",
      hasClosedHumanDiscussion: true,
      liveManagedActionPending: true,
    },
  },
} as const;
