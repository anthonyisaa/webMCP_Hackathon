# Ratiflow

> **Git-grade history and task-scoped autonomy for important documents.**

Ratiflow is a shared issue document where people and the agents they bring work on one
durable artifact. Anyone with the link can read and edit through the ordinary web UI.
Select a passage and leave a comment; `@Databot check these figures` becomes durable
agent work, while an ordinary comment remains a human discussion. There is no authority
form and no pre-approval queue in the flagship interaction.

A compatible browser agent gets a page-native WebMCP surface for its assigned work,
discussion, and complete collaboration history—without a proprietary bot runtime or an
integration for each model. Agent changes commit directly inside the exact stored range.
The completed comment shows the prompt, source context, owner-bound agent identity,
rationale, evidence, highlighted diff, and revision, and a person can restore it.

Every content change becomes an immutable, reconstructable revision. History records
the author, committer, task, grantor, source revision, evidence, summary, complete
snapshot, and diff. An agent self-declares its name once per page; the server binds that
profile to the authenticated human owner. Agents cannot forge their owner or write
outside a task's anchor.

Ratiflow deliberately supports exactly two document types:

1. **Incident postmortem** — impact, timeline, root cause, contributing factors,
   resolution, and follow-up actions.
2. **Product document** — problem, users, proposal, constraints, success measures,
   rollout, and open questions.

It is a focused WebMCP Challenge proof, not a general Git host, rich-text editor, CRDT,
account system, or background agent runner.

## The flagship interaction

The deterministic example is **INC-482 · Checkout outage postmortem**.

1. Priya selects the Impact, Timeline, and Root cause placeholders and leaves three
   comments: `@Databot …`, `@Logbot …`, and `@Builder …`.
2. Those comments atomically become `TASK-1` through `TASK-3`, each with its exact r1
   source passage and the coordination context that existed when it was created.
3. Databot adds verified totals, a GFM table, and a revisioned bar chart as r2. Logbot's
   disjoint stale-r1 timeline safely lands as r3. Builder separates the provider trigger
   from the retry amplifier in r4.
4. Priya leaves a normal human comment challenging that wording. The discussion closes;
   it is not an approval event. She then assigns `TASK-4` to Builder from the revised
   passage, and Builder's evidence-backed clarification commits as r5.
5. A genuinely new `Contextbot` reads the activity ledger and recovers the prompts,
   closed discussion, evidence, revisions, and the decision that changed the final text.

The Product document example is equally complete: a corrected capacity assumption,
Databot comparison table and chart, ChatGPT synthesis, a closed launch-language
discussion, an intentionally broadened r5 edit, and a new r6 Restore that preserves r5.

The public examples create fresh completed Postmortem r5/av11 or Product r6/av11
workspaces. The protected reset retains its executable Postmortem r1/av4 starting state
with four isolated collaborator bootstrap paths.

## Eight page-native tools

The top-level v4.1 issue page registers exactly eight tools through
`document.modelContext`. The page captures its current document, session, and ephemeral
page identity; the server remains authoritative for every read and mutation.

| Tool | Purpose |
| --- | --- |
| `connect_agent` | Self-declare the page's agent name; the server binds it to the authenticated human owner. |
| `inspect_document` | Read the authoritative document, collaborators, tasks, comments, and current counters. |
| `read_document_history` | Read newest-first revision summaries or one complete immutable historical snapshot. |
| `read_collaboration_context` | Page the immutable activity ledger with prompts, comments, revisions, rationale, evidence, and owner-bound profiles. |
| `list_my_tasks` | List only this collaborator's delegated agent tasks, with complete bounded discussions. |
| `wait_for_my_tasks` | Long-poll from explicit cursors for owned work or a document change. |
| `comment_on_task` | Append an ownership-checked agent reply to its task discussion. |
| `submit_task_result` | Commit a bounded agent result with rationale and evidence, or preserve compatibility behavior for legacy tasks. |

There is no agent tool to create, reassign, cancel, accept, reject, or restore work.
Tool presence guides the agent; server-bound ownership, page generation, revision
checks, and exact source ranges enforce authority.

```text
shared issue document
  ├─ people → edit, comment, @assign, close, restore
  └─ their agents → connect, inspect context, do owned work
                              │
                     exact scoped revision
                              │
                   immutable provenance
```

## A document interface first

`/` and `/new` always present nickname setup, the two templates, and both completed
examples instead of silently reopening old work. `/issue/[shareToken]` resumes its
matching stored session and remains the shareable workspace whose rendered Markdown
document is visually primary. Tables render as tables; validated `chart` fences render
accessible static SVG plus a tabular fallback. A quiet Edit action reveals Markdown
source only when someone needs it, and save summaries are derived rather than typed.

After a document opens, a dismissible setup strip explains how to bring one current
agent for that collaborator. In a WebMCP-capable client, name the agent locally, copy the
generated instruction, and send it to the agent. The profile is not created until the
agent itself calls `connect_agent`; the status then changes from tool-ready to the exact
page-scoped `agent · owner` connection. Teammates connect their own agents.

A text or whole-block selection opens one compact anchored comment composer. Selecting
an autocomplete result creates `@Agent` work; literal or unselected `@` text creates a
normal comment. The unified comment rail shows discussion and completed work in place.
History is a quiet Git-like view with immutable snapshots, provenance, diffs, and
Restore—useful to people, but primarily the durable context plane agents read.

WebMCP is optional. With it absent, people can still create, read, edit, share, comment,
reply, close discussions, inspect history, and restore a revision. A recorded agent
profile is an assignment target, not a live-presence claim; Ratiflow never pretends it
can wake a dormant external agent.

## Why WebMCP matters

Without a page-native contract, collaboration with a bring-your-own agent collapses
into copied prompts, pasted findings, ad hoc permissions, and lost reasoning. Ratiflow
turns the live document into a discoverable capability and context plane:

- agents find assigned work and complete discussion without a vendor-specific adapter;
- new `@Agent` results commit only to the exact passage a person selected; legacy task
  modes remain readable for compatibility but are absent from the flagship UI;
- concurrent disjoint work can land without a global approval queue;
- completed reasoning remains recoverable by a fresh agent; and
- people keep a complete ordinary web workflow when no agent is present.

The host browser may still apply its own safety confirmation. That platform policy is
separate from Ratiflow's no-preapproval product flow and is reported separately in
evidence.

## Architecture

```text
Next.js issue page
  ├─ ordinary human UI → authenticated repository-v4 routes
  └─ document.modelContext → checked eight-tool WebMCP lifecycle
                                    ↓
                         authoritative service port
                      ┌─────────────┴─────────────┐
                 local reference service   Supabase RPC adapter
                      └─────────────┬─────────────┘
                full snapshots + revision/activity counters
            profiles + tasks + discussions + replay/context ledger
```

- Next.js App Router, React, TypeScript, CSS Modules, pnpm, and Vercel provide the web
  surface.
- Supabase Postgres/RPC is the production persistence boundary. Mutations lock the
  document first, derive the principal and task authority server-side, and reserve
  request IDs for terminal success or failure.
- Revision and activity are separate counters: content commits advance both; tasks,
  comments, and decisions that do not change content advance activity only.
- Full title/body snapshots and digests make each revision reconstructable. Restore
  creates a new revision instead of rewriting history.
- Activity signals are notifications, not truth. Reads reconcile monotonically, and
  waits use fetch-subscribe-refetch with one bounded deadline.
- WebMCP registration and execution honor `AbortSignal`; route or session changes remove
  tools, waits, timers, listeners, and stale callbacks.

The older `/document/[shareToken]` and `/decision-demo` paths remain isolated v3
compatibility surfaces. They do not prove the v4 product or six-tool catalog.

## Share and session safety

The POC uses anonymous possession-of-link access. A share URL grants access and is not
described as private authenticated storage. Human and delegated-agent session tokens are
separate high-entropy credentials.

One-time bootstrap bundles arrive in the URL fragment, are validated against the path,
share, protocol, and expiry, then are scrubbed before WebMCP registers. Browser
persistence contains credentials and pointers only; authoritative document content is
fetched from the service. Raw share/session tokens, bootstrap fragments, private
content, and unsanitized agent transcripts must never enter committed evidence.

## Run locally

Prerequisites: Node.js compatible with the checked pnpm release and pnpm 11.

```bash
pnpm install
pnpm dev
```

Without Supabase environment variables, development uses the in-memory reference
service shared by browser tabs while the Next.js server remains running. It is suitable
for UI, protocol, and browser testing but does not persist across server restarts.

For Supabase-backed development, configure server-only values:

```bash
RATIFLOW_SUPABASE_URL=https://your-project.supabase.co
RATIFLOW_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply checked migrations in filename order. The v4 issue-document migration is
additive; applied v3 migrations remain untouched.

Fast verification and production build:

```bash
.codex/verify.sh
pnpm build
```

The preview-only protected reset is hidden in production. With the same reset secret on
the app and command, it writes the four bearer bootstrap paths only to a mode-0600 file
inside a fresh private temporary directory:

```bash
RATIFLOW_BASE_URL=https://your-preview.example \
RATIFLOW_EVAL_RESET_TOKEN=your-preview-only-token \
pnpm eval:reset:v4
```

Browser automation and adapter calls are never labeled native WebMCP evidence. Native
proof requires a supported client discovering and invoking the eight tools on the
top-level deployed issue page.

## Evaluation and release status

The checked [evaluation contract](EVALS.md) defines 25 domain/persistence rows, 16
ordinary-browser rows, 10 deployed-native rows, six five-run agent trajectories, four
visual rows, five release gates, an ablation, and four independent competition judges.

The previous v4 implementation was a verified release candidate. The v4.1 comment-first
redesign must re-run the complete local, browser, persistence, and native evidence gates
before inheriting any of those claims. A supported-client run must discover exactly
eight tools, begin with `connect_agent`, exercise collaboration context, and observe
clean teardown on `/new`; adapter-only calls are not deployed native evidence.

Supabase remote apply/advisors, native write/authority matrices on the exact deployed
SHA, real-agent trajectories and ablation, independent visual approval, public video,
public package, and release manifest remain `PENDING`. The deployed v3 runtime at
[ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app) is dated compatibility
evidence only; it must not be presented as v4 proof.

Deployment, repository visibility, video publication, and Devpost submission are
separate release actions and require explicit authorization.

## Project documents

- [Product specification](product_spec.md) — frozen v4.1 collaboration and authority contract.
- [Repository contract](docs/contracts/repository-contract.md) — checked entities,
  routes, lifecycle, replay, security, and concurrency behavior.
- [Postmortem hero](docs/contracts/postmortem-hero-scenario.md) — exact INC-482 r1-r5
  scenario and fresh-agent answer key.
- [Product-document hero](docs/contracts/product-document-hero-scenario.md) — exact
  capacity-planning r1-r6 scenario, including the preserved broadened edit and Restore.
- [Evaluation contract](EVALS.md) — automated, browser, native, trajectory, visual,
  rehearsal, and competition-judge gates.
- [Current evidence ledger](EVAL_RESULTS.md) — observed proof; older v3 rows remain
  compatibility evidence only.

## License

[MIT](LICENSE)
