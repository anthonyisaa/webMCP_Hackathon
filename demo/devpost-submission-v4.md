# Ratiflow — Devpost submission draft (v4.1)

**Tagline:** A shared document that remembers why.

**Short description:** Ratiflow lets a person select a passage, leave an anchored
`@Agent` comment, and keep writing. The assigned agent can commit only that passage.
Its prompt, source context, rationale, evidence, owner, diff, and revision remain
attached to the document so another person—or a completely new agent—can understand
how the current version came to be.

> Candidate copy only. Do not describe the current build as deployed, live-database
> verified, or natively proven through a supported WebMCP client until those checks have
> been observed against one release SHA.

## Inspiration

Collaborative documents make human editing feel effortless, but agent collaboration
often starts by leaving the document: copy context into a chat, paste the answer back,
then lose the prompt and reasoning that produced it. Approval forms do not fix that.
They just make every agent edit feel heavier.

Ratiflow borrows durable snapshots, authorship, diffs, and Restore from Git, then hides
the machinery behind a document interface. The page stays readable. The history is
quiet until a person—or WebMCP—needs it.

## What it does

After entering a name, a person opens either an **Incident postmortem** or a **Product
document**. To delegate work they select rendered text, open one anchored comment, and
write something natural:

```text
@ChatGPT Rework this paragraph so the decision and tradeoff are explicit.
```

```text
@Databot Use the latest numbers to replace this placeholder with a GFM table and chart.
```

Autocomplete selects a known, owner-bound agent profile. A recognized leading mention
atomically becomes `TASK-n`; any other comment remains a human discussion. There is no
task form, authority checkbox, or document-approval queue.

The selected agent can discuss its task or submit a scoped replacement. A successful
result commits immediately as the next immutable revision. The completed comment shows
the highlighted before/after change, rationale, evidence, revision link, agent name,
and human owner. A person can **Restore** a prior snapshot afterward; Restore appends a
new revision instead of deleting the change. Human discussions use **Close**, which
records who closed them without pretending that a content change was accepted.

Markdown is real source, not decoration. Reading mode safely renders headings, lists,
links, and GFM tables. A validated fenced `chart` object renders an accessible bar or
line chart plus its data table; unsafe HTML, executable content, remote images, and
unvalidated chart options never run.

## The history agents can actually use

Every content revision stores a full title/body snapshot and SHA-256 digest. Agent work
also retains its exact `@` prompt, immutable source range, source revision and digest,
bounded surrounding and prior collaboration context, submitted rationale, evidence,
server-computed diff, agent profile, human owner, and source/parent revision lineage.
Human saves, comments, replies, closures, agent assignments, completions, and Restore
events form a separate ordered collaboration ledger.

This distinction keeps the human view simple while giving a newly connected agent the
facts behind the head revision—including decisions that only occurred in comments.

## Bring your own agent through WebMCP

The top-level document page exposes exactly eight tools through
`document.modelContext`, in this order:

1. `connect_agent`
2. `inspect_document`
3. `read_document_history`
4. `read_collaboration_context`
5. `list_my_tasks`
6. `wait_for_my_tasks`
7. `comment_on_task`
8. `submit_task_result`

The first call in each page-registration lifetime is `connect_agent({ name })`. The
name is explicitly self-declared—not vendor-verified—and the server binds it to the
authenticated human member behind that page. Later calls derive the document, owner,
actor, assignee, scope, and Direct authority from the page credential and stored task;
the model cannot forge or widen them.

`read_collaboration_context` pages a newest-first ledger joined to revisions, prompts,
canonical source context, rationales, evidence, complete task discussions, closed human
comments, and agent-owner profiles. It is the continuity layer for agents arriving from
different platforms. No agent tool creates a human comment, chooses authority, closes a
discussion, or performs Restore.

## Detailed postmortem example

The completed **INC-482 · Checkout outage postmortem** ends at **r5 / activity 11**.
Priya Shah starts at r1 with three `Investigation in progress.` placeholders and leaves
anchored comments for three owner-bound agents:

- `TASK-1` asks Nadia Chen's `Databot` to use `impact.csv`. Its r2 replacement records
  28,417 attempts, 21,675 successes, 6,742 failures, 311 affected merchants, zero
  duplicate charges, a GFM table, and a checkout-outcomes chart.
- `TASK-2` asks Leo Park's `Logbot` to use `checkout.log`. Starting from the same r1,
  its disjoint selection safely rebases and becomes r3 with the 09:43–10:21 UTC
  timeline.
- `TASK-3` asks Sam Rivera's `Builder` to use `commit:7d3c9e1` and the log. Its r4
  change separates provider throttling—the external trigger—from retry middleware that
  ignored `Retry-After`, retried immediately up to five times, drove traffic to 5.8×,
  and exhausted the queue—the internal amplifier.

Priya then leaves an ordinary human comment questioning whether the root-cause wording
overclaims the team's code. A second `@Builder` assignment becomes `TASK-4`; Builder
uses that discussion and prior history to clarify r5. Priya closes the separate human
thread. Both the completed task and closed challenge remain visible, but neither creates
a fake approval event.

## Detailed Product document example

The completed **Northstar · CSV export launch decision** ends at **r6 / activity 11**.
Jordan Lee first makes a human r2 correction: incident rotation reduces pre-beta
capacity from 18 to 14 engineering days.

- `TASK-1` asks Morgan Chen's `Databot` to compare options. Its r3 analysis shows that
  10 reliability days plus 4 beta-export days exactly fit 14; doing all 8 export days
  before beta would require 18 and exceed capacity by 4. The GFM table and chart make
  the arithmetic inspectable.
- `TASK-2` asks Avery Singh's `ChatGPT` to synthesize the decision. Its r4 recommendation
  keeps October 15 as an invite-only design-partner beta, finishes the remaining four
  export days afterward, reaches full GA by November 1, and protects the $180,000
  renewal.

Elena Ruiz opens a human discussion about whether “invite-only beta” sounds like general
availability; Jordan replies and Elena closes it. Elena later saves an alternative r5
that ships to every customer on October 15. Jordan restores r4 as a new r6. History
preserves the alternative and its author while making the restored head explicit.

## The Contextbot continuity moment

Quinn Patel opens either completed example as a new, non-authoring viewer and brings a
fresh agent. Only then does that agent call `connect_agent({"name":"Contextbot"})`, so
it has no pre-seeded profile, task, or authorship. Contextbot pages the collaboration
ledger and revision history to reconstruct the postmortem's trigger-versus-amplifier
decision or the Product document's capacity and staged-launch decision. That is the
core demonstration: provenance is useful context, not a history screen people must
manually decode.

## How it is built

Ratiflow uses Next.js, React, TypeScript, and an additive Supabase/Postgres persistence
path behind the same checked domain operations used by the ordinary UI and WebMCP
bridge. Tool registration belongs to the top-level issue page and tears down on route or
session changes. Server transactions enforce identity, document isolation, replay-safe
mutations, exact-range writes, and revision/activity ordering.

Anchors use Unicode code-point ranges. Disjoint stale-base work may rebase exactly;
overlap, changed selected text, ambiguity, or a stale task fails without a partial
mutation. This is deliberate scoped collaboration, not a character-level CRDT claim.

## What we are proud of

- Delegation is one anchored comment, not a workflow builder.
- Agents do useful work immediately while every edit remains reversible.
- A completed thread explains the change without pulling attention away from the
  document.
- Human discussion and document revision history remain distinct but connected.
- Postmortem and Product examples contain enough real history to test a genuinely new
  agent's understanding.
- The ordinary document experience remains usable when WebMCP is absent.

## What is next

The prototype intentionally supports two document types and possession-of-link
collaboration. A production path would add organizational identity and policy,
longer-lived retention, verified agent principals, and connectors for live logs, data,
and code—without adding complexity to the `@Agent` interaction.

## Release evidence fields

- Live app: **[PENDING exact-SHA deployment]**
- Public source and license: **[PENDING verified public HEAD]**
- Public narrated video: **[PENDING verified URL]**
- Supported-client native WebMCP evidence: **[PENDING exact-SHA capture]**
- Live Supabase v4.1 migration/security verification: **[PENDING]**
- Devpost submission: **[PENDING observed submission URL]**
