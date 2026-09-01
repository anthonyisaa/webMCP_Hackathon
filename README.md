# Ratiflow

> **Git-grade history and task-scoped autonomy for important documents.**

Ratiflow is a shared issue document where people and the agents they bring work on one
durable artifact. Anyone with the link can read and edit through the ordinary web UI.
A compatible browser agent gets a page-native WebMCP surface for its assigned work,
discussion, and document history—without a proprietary bot runtime or an integration
for each model.

The task creator decides the authority boundary:

- **Comment only** — the agent returns a finding to the task discussion.
- **Review required** — the agent proposes a scoped change; its creator accepts or
  rejects it.
- **Can edit directly** — the agent may commit only inside the exact range stored on
  that task. No Ratiflow approval step is added.

Every content change becomes an immutable, reconstructable revision. History records
the author, committer, task, grantor, approver, source revision, evidence, summary,
complete snapshot, and diff. Agents cannot choose or escalate their own authority,
forge identity, or write outside a task's anchor.

Ratiflow deliberately supports exactly two document types:

1. **Incident postmortem** — impact, timeline, root cause, contributing factors,
   resolution, and follow-up actions.
2. **Product document** — problem, users, proposal, constraints, success measures,
   rollout, and open questions.

It is a focused WebMCP Challenge proof, not a general Git host, rich-text editor, CRDT,
account system, or background agent runner.

## The flagship interaction

The deterministic example is **INC-482 · Checkout outage postmortem**.

1. Priya opens a readable r1 postmortem and creates three anchored tasks together:
   DATA-17, LOG-22, and CODE-9.
2. The Data and Logging agents receive **Can edit directly**. Each can commit only its
   stored selection. Their disjoint stale-r1 changes safely land as r2 and r3 without
   overwriting one another.
3. The Builder agent receives **Review required**. It identifies commit `7d3c9e1` as
   the retry amplifier, submits a proposal, and leaves the document unchanged at r3.
4. Priya asks a question in the durable task thread. The Builder replies with evidence.
5. Priya accepts once. Ratiflow creates r4 with the Builder as author and Priya as
   approver and committer.
6. A fresh agent later reads the resolved task and immutable history, then correctly
   explains that provider throttling was the trigger while the retry change sustained
   the outage.

The public **Open incident example** creates a fresh completed r4/av10 clone of this
scenario. The protected evaluation reset creates the executable r1/av4 starting state
with four isolated collaborator bootstrap paths.

## Six page-native tools

The top-level v4 issue page registers exactly six tools through
`document.modelContext`. The page captures its current document, session, and ephemeral
page identity; the server remains authoritative for every read and mutation.

| Tool | Purpose |
| --- | --- |
| `inspect_document` | Read the authoritative document, collaborators, tasks, comments, and current counters. |
| `read_document_history` | Read newest-first revision summaries or one complete immutable historical snapshot. |
| `list_my_tasks` | List only this collaborator's delegated agent tasks, with complete bounded discussions. |
| `wait_for_my_tasks` | Long-poll from explicit cursors for owned work or a document change. |
| `comment_on_task` | Append an ownership-checked agent reply to its task discussion. |
| `submit_task_result` | Let the server derive `COMMENTED`, `PROPOSED`, or `COMMITTED` from the task's stored mode. |

There is no agent tool to create, reassign, cancel, accept, reject, restore, select a
mode, or directly name an actor. Tool presence guides the agent; session ownership,
page identity, revision checks, task mode, and range constraints enforce authority.

```text
shared issue document
  ├─ people → edit, comment, assign, decide, restore
  └─ their agents → inspect, history, owned tasks, wait, discuss, submit result
                                         │
                           server derives task authority
                     ┌───────────────────┼───────────────────┐
                  COMMENT              REVIEW              DIRECT
                  finding              proposal       scoped revision
                     └───────────────────┼───────────────────┘
                              immutable provenance
```

## A document interface first

`/` resumes the most recent valid workspace when one exists; `/new` always presents the
two templates and the completed incident example without silently reopening old work.
`/issue/[shareToken]` is a shareable workspace whose document remains visually primary.
The quiet **Threads | History** rail contains open and completed tasks, anchored
discussion, proposals, diffs, full historical snapshots, and restore controls.

Completed documents also surface a compact **Revision path** above the fold. It names
who started the document, which agents committed directly, where a stale-base result was
safely rebased, and which reviewed change a person accepted—so provenance is useful
before anyone opens the full history rail.

Human edits use an explicit **Save revision** action and a nonblank change summary.
Native undo/redo remains available. If remote activity advances the head while someone
has a draft, Ratiflow preserves the draft and offers a deliberate merge choice; an
asynchronous task result never silently owns or erases local writing.

A non-empty selection exposes **Comment** and **Create task**. The task composer makes
the assignee, instruction, target, and native access radios explicit. **Review required**
is the default. Comment tasks may instead target the entire document.

WebMCP is optional. With it absent, people can still create, read, edit, share, comment,
reply, create/cancel/decide tasks, inspect history, and restore a revision. The UI never
pretends that an external agent is connected or running.

## Why WebMCP matters

Without a page-native contract, collaboration with a bring-your-own agent collapses
into copied prompts, pasted findings, ad hoc permissions, and lost reasoning. Ratiflow
turns the live document into a discoverable capability and context plane:

- agents find assigned work and complete discussion without a vendor-specific adapter;
- results are applied according to task authority chosen by a person, not by model
  instructions;
- concurrent disjoint work can land without a global approval queue;
- completed reasoning remains recoverable by a fresh agent; and
- people keep a complete ordinary web workflow when no agent is present.

The host browser may still apply its own safety confirmation. That platform policy is
separate from Ratiflow's Comment/Review/Direct product authority and is reported
separately in evidence.

## Architecture

```text
Next.js issue page
  ├─ ordinary human UI → authenticated repository-v4 routes
  └─ document.modelContext → checked six-tool WebMCP lifecycle
                                    ↓
                         authoritative service port
                      ┌─────────────┴─────────────┐
                 local reference service   Supabase RPC adapter
                      └─────────────┬─────────────┘
                full snapshots + revision/activity counters
                     tasks + discussions + replay ledger
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
proof requires a supported client discovering and invoking the six tools on the
top-level deployed issue page.

## Evaluation and release status

The checked [evaluation contract](EVALS.md) defines 25 domain/persistence rows, 16
ordinary-browser rows, 10 deployed-native rows, six five-run agent trajectories, four
visual rows, five release gates, an ablation, and four independent competition judges.

The v4 implementation is currently a verified local candidate: `.codex/verify.sh`
passes 408 tests across 55 files, the production build passes, the ordinary-browser
suite passes 10/10, and the same ten journeys pass 50/50 across five consecutive
rehearsals. A local supported-client diagnostic discovered exactly six tools, completed
the read-only document/history/task calls, and observed clean teardown on `/new`; it is
not deployed native release evidence.

Supabase remote apply/advisors, native write/authority matrices on the exact deployed
SHA, real-agent trajectories and ablation, independent visual approval, public video,
public package, and release manifest remain `PENDING`. The deployed v3 runtime at
[ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app) is dated compatibility
evidence only; it must not be presented as v4 proof.

Deployment, repository visibility, video publication, and Devpost submission are
separate release actions and require explicit authorization.

## Project documents

- [Product specification](product_spec.md) — frozen v4 product and authority contract.
- [Repository contract](docs/contracts/repository-contract.md) — checked entities,
  routes, lifecycle, replay, security, and concurrency behavior.
- [Postmortem hero](docs/contracts/postmortem-hero-scenario.md) — exact INC-482 r1-r4
  scenario and fresh-agent answer key.
- [Evaluation contract](EVALS.md) — automated, browser, native, trajectory, visual,
  rehearsal, and competition-judge gates.
- [Current evidence ledger](EVAL_RESULTS.md) — observed proof; older v3 rows remain
  compatibility evidence only.

## License

[MIT](LICENSE)
