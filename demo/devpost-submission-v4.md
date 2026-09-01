# Ratiflow — Devpost submission draft (v4)

**Tagline:** Git-grade history and task-scoped autonomy for important documents.

**Short description:** Ratiflow is a shared postmortem or product document where people
delegate exact passages to the agents they bring. Humans choose Comment, Review, or
Direct authority per task; the server enforces the range and every accepted or direct
change becomes an immutable, reconstructable revision with complete provenance.

This is candidate copy. Replace every bracketed release field only after it is observed
on one clean public SHA. Local browser or adapter evidence must not be described as
native WebMCP evidence.

## Inspiration

Teams already collaborate with several people and several agents, but an important
document still ends up with the weakest possible history: pasted chat fragments,
untraceable rewrites, and a review queue where every machine edit needs the same human
approval.

Git solved a related problem for code: durable revisions, authorship, diffs, and the
ability to inspect how the result came to be. Task systems solved delegation. Ratiflow
combines those ideas around one readable document without turning the page into a Git
client or requiring everyone to use the same agent vendor.

## What it does

Ratiflow supports exactly two focused artifacts: an Incident postmortem and a Product
document. Anyone with the shared URL can use the ordinary web UI to read, edit, comment,
delegate, review, inspect history, and restore. WebMCP is optional.

For agent work, the task creator selects one immutable authority mode:

- **Comment only** appends a finding to the task discussion.
- **Review required** stores a scoped proposal while the document stays unchanged.
- **Can edit directly** commits exactly the assigned range with no additional Ratiflow
  approval step.

The model cannot name an actor, choose a mode, expand a range, approve itself, or restore
history. The server derives those facts from the paired session and stored task. Direct
does not mean broad write access.

Every content mutation appends a complete title/body snapshot and SHA-256 digest. Its
provenance records the source and parent revisions, exact diff, author, committer,
grantor, approver, task, origin, evidence, summary, and timestamp. Restore creates a new
revision; it never rewrites an old one.

## Why WebMCP is essential

Bring-your-own-agent collaboration needs live page context that a pasted prompt or
vendor-specific bot cannot safely preserve: which document is open, which paired person
owns the task, which exact passage was granted, which revision it came from, and whether
the human chose Comment, Review, or Direct.

The top-level issue page exposes exactly six stable tools through
`document.modelContext`:

1. `inspect_document`
2. `read_document_history`
3. `list_my_tasks`
4. `wait_for_my_tasks`
5. `comment_on_task`
6. `submit_task_result`

The catalog deliberately omits human management and authority operations: agents cannot
create, reassign, cancel, accept, reject, restore, or select a mode. One generic result
tool returns `COMMENTED`, `PROPOSED`, or `COMMITTED` according to the task authority the
server already knows. That makes the page a portable capability and context plane for
any compatible agent while keeping enforcement out of the prompt.

## The flagship scenario

In `INC-482`, Priya creates three tasks from r1. The Data agent commits verified impact
figures directly as r2. The Logging agent also started from r1; after Data lands, its
disjoint Direct change safely rebases to r3 without overwriting anything. The Builder
agent has Review authority, so its root-cause result remains a proposal.

Priya challenges whether the team is blaming its own code when provider throttling
happened first. The Builder replies with the retry and rollback evidence. Priya accepts
after separating the external trigger from the internal amplifier, creating r4 with the
Builder as author and Priya as approver and committer.

A fresh agent later reads the resolved task and revision history and correctly explains
that provider throttling triggered the incident, while commit `7d3c9e1` ignored
`Retry-After`, amplified traffic 5.8×, and sustained the outage. The reasoning survives
because it belongs to the document, not an old chat.

## How we built it

Ratiflow uses Next.js, React, TypeScript, and a checked service boundary. The ordinary
UI and WebMCP callbacks call the same authoritative operations. Registration is owned by
the top-level page, uses `document.modelContext`, captures an ephemeral page identity,
and tears tools and waits down through `AbortSignal` on route or session changes.

The reference runtime exercises the complete semantics locally. The production adapter
targets additive Supabase Postgres RPCs. Transactions derive identity and authority
server-side, lock the document before task rows, use hashed bearer lookup, enforce
document isolation and idempotent request IDs, and update separate content-revision and
coordination-activity counters atomically.

Anchors use Unicode code-point ranges and retain both the immutable creation target and
the current live target. A single-splice rebase allows disjoint stale-base work to land;
overlap, enclosure, ambiguity, or changed selected text fails closed. This is deliberate
concurrent work, not a CRDT claim.

## Challenges

The hardest design decision was avoiding a universal approval queue without granting an
agent document-wide power. The answer was task-scoped authority enforced in the same
transaction as mutation. A second challenge was preserving dual provenance: a Review
revision needs the agent as author and the human as approver/committer, while a Direct
revision has an agent author/committer and a human grantor. A third was keeping a dirty
human draft safe when remote human or agent work advances the head.

## Accomplishments

- The final document stays primary; collaboration detail is available but quiet.
- Direct and Review work share one closed tool without letting the agent choose its own
  authority.
- Disjoint stale-base changes land in order; conflicting work fails without mutation.
- Completed tasks retain their complete question, answer, proposal, decision, and
  evidence for a fresh agent.
- Both templates, sharing, editing, comments, tasks, history, and restore remain usable
  when WebMCP is absent.
- The local candidate passes the checked repository gate, production build, ten browser
  journeys, and 50/50 five-repeat browser rehearsals. Exact counts and SHA will be bound
  in the final evidence ledger.

## What is next

The challenge prototype intentionally uses possession-of-link collaboration and two
document types. A production path would add organizational identity and access control,
long-term retention policy, verified agent principals, and connectors that agents bring
for logs, data, and code—without changing the task authority or revision model.

## Release fields

- Live app: **[PENDING exact-SHA deployment]**
- Public source and MIT license: **[PENDING verified public HEAD]**
- Public narrated video: **[PENDING verified YouTube URL]**
- Supported-client native evidence: **[PENDING exact-SHA capture]**
- Devpost submission: **[PENDING observed submission URL]**
