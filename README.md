# Ratiflow

> **Human chooses the task. Company policy fixes the grant. The page registers the
> tools. The document keeps the proof.**

Ratiflow is a WebMCP Challenge entry about **capability grants on a live page**, not
another AI chat box inside a document.

A person selects a passage, picks a managed expert label (`@Code`, `@Data`, or
`@General`), writes an instruction, and selects **Assign & run**. Company policy maps
that bot to Repository, Metrics, or Editorial access. Ratiflow resolves the policy into
an immutable run grant, registers only the matching WebMCP catalog, and limits the
result to the selected passage. History keeps a restorable revision with the prompt,
sources, authorship, and server-computed diff.

**Why this is a WebMCP project:** the website owns a dynamic, task-scoped tool surface.
Bot identity is descriptive; the server-resolved access grant is the permission boundary
and is enforced server-side.

- Live: [ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app/)
- Devpost: [devpost.com/software/ratiflow](https://devpost.com/software/ratiflow)
- License: MIT

## 90-second judge path

1. Enter a nickname and open the completed **INC-482** postmortem.
2. Select any safe rendered passage, type `@`, choose `@Code`, and write an instruction.
3. Select **Assign & run**. Company policy supplies Repository access; no permission
   picker appears.
4. Watch the exact passage turn yellow while the Flight Recorder shows the granted
   catalog, Luna tool calls, synthetic evidence, and commit.
5. See the committed replacement turn green for 30 seconds, then open **History** to
   inspect its prompt, sources, authorship, diff, and Restore action.
6. Repeat with `@Data` or `@General` to see policy register a different catalog.

## What is *not* the pitch

Ratiflow is not “Google Docs + GitHub for agents.” Collaborative editing is the
substrate. The submission thesis is **task → grant → catalog → scoped revision**.

## Architecture in one line

```text
selection + @mention → company policy → capability grant → WebMCP site-tool catalog
                     → Luna tool search → executeTool()
                     → scoped revision → immutable history
```

Ratiflow uses an **application-owned Luna↔WebMCP relay**. Luna supports client-executed
tool search through the Responses API; the browser maps that request to the current
`document.modelContext` catalog and invokes the exact returned descriptor with
`executeTool()`. This is a forward-looking composition, not a claim that Luna natively
supports OpenAI Site Tools. The API credential remains server-side.

Every run leaves a readable application trace next to the document. Every content
change records the author, task, source revision, bounded source labels, full snapshot,
and server-computed diff. Native WebMCP execution is validated separately as dated,
supported-client observational evidence; the application trace is not presented as
cryptographic browser attestation.

The completed **INC-482 · Checkout outage postmortem** begins at r5 with human and agent
history. Its guided `@Code` run verifies `commit:7d3c9e1` and `checkout.log`, then commits
r6 using Code's fixed Repository access.

The completed **Northstar · CSV export launch decision** begins at r6. Its guided
`@Data` run queries a synthetic capacity fixture, demonstrates that 10 + 4 = 14 fits
while 10 + 8 = 18 does not, and commits Success measures as r7.

Ratiflow deliberately supports exactly two document types. It is a focused WebMCP
Challenge proof, not a general Git host, CRDT, identity provider, or unattended
background-agent service.

## One page, two mutually exclusive tool surfaces

When no managed run is active, the top-level page exposes eight bring-your-own-agent
tools: `connect_agent`, `inspect_document`, `read_document_history`,
`read_collaboration_context`, `list_my_tasks`, `wait_for_my_tasks`, `comment_on_task`,
and `submit_task_result`.

During a managed mention, the page withdraws that idle catalog and registers one
generation-scoped site capability catalog derived from the selected managed bot's fixed
company access policy:

| Managed bot | Fixed company access | Source tools | Total |
| --- | --- | --- | ---: |
| `@Data` | Metrics scoped edit | `query_demo_metrics` | 6 |
| `@Code` | Repository scoped edit | `search_demo_code`, `read_demo_file` | 7 |
| `@General` | Editorial scoped edit | `read_company_style_guide`, `check_document_consistency` | 7 |

Each catalog also contains the five bounded assignment, document, collaboration,
comment, and submit tools. The public mention cannot submit or override an access
profile. After canonical managed-profile lookup, the server stores the resolved profile
immutably on the Relay run; WebMCP exposes and invokes its tools while Ratiflow enforces
document, range, action, revision, lease, and permit authority.

The exact relay sequence is:

```text
toolchange → tool_search_call → getTools() → tool_search_output
           → Luna function call → executeTool() → revision committed
```

Tool names are unique per registration generation; old descriptors and replayed
one-shot permits fail closed. Catalog visibility guides the agent; it is not the security
boundary. Server-side document/range/action authority, lease ownership, revision checks,
evidence bindings, attempt limits, and spend quotas remain authoritative. Mentions wake
the open page immediately; the 15-second timer is recovery only, not a cron service.

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

After a document opens, a dismissible coach shows the live demo in three moves: select
any safe passage, choose a managed bot after typing `@`, and select **Assign & run**. The
company directory is deliberately synthetic and labels each agent's visibility,
descriptive expertise, and company-configured access. No permission selector appears.
Bring-your-own-agent setup remains available in an Advanced section; self-declared
profiles are separate from managed demo identities.

A text or whole-block selection opens one compact anchored comment composer. Selecting
an autocomplete result creates `@Agent` work; literal or unselected `@` text creates a
normal comment. Initial completed examples paint no historical anchors. A live selection
is neutral blue, an open comment or uncommitted task is yellow, and a newly observed
agent replacement is green for 30 seconds; resolved and completed history does not keep
painting the document. The unified comment rail shows discussion and completed work in
place. History is a quiet Git-like view with immutable snapshots, provenance, diffs, and
Restore—useful to people, but primarily the durable context plane agents read.

WebMCP is optional. With it absent, people can still create, read, edit, share, comment,
reply, close discussions, inspect history, and restore a revision. Managed mentions
remain durable but cannot execute until an eligible page opens; the UI says so.

## Why WebMCP matters

Without a page-native contract, collaboration with agents collapses into copied prompts,
pasted findings, bespoke integrations, and lost reasoning. Ratiflow turns the live
document into a discoverable capability and context plane:

- the page changes the available capabilities when a managed bot is selected, following
  the company's fixed Data→Metrics, Code→Repository, and General→Editorial policy;
- Luna discovers those tools at run time instead of receiving one oversized static set;
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
  └─ document.modelContext → idle catalog ⇄ assignment capability catalog
                                    ↓
                 app-owned Responses API relay (gpt-5.6-luna)
                                    ↓
       Ratiflow grant + lease + permit + exact-range server authority
                       ┌────────┴────────┐
              local reference       Supabase RPC adapter
                       └────────┬────────┘
             snapshots + revisions + collaboration ledger
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
- Managed runs use one server-resolved immutable access profile, one active run per document,
  two attempts at most, short leases,
  one-shot execution permits, provider-step reservations, and durable spend limits.

The older `/document/[shareToken]` and `/decision-demo` paths remain isolated v3
compatibility surfaces. They do not prove the v4.4 company-scoped managed relay.

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
open_ai_api=your-openai-api-key
RATIFLOW_RELAY_SIGNING_SECRET=at-least-32-random-bytes
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
proof requires a supported client observing the idle→assignment-catalog→idle lifecycle and invoking
the exact returned descriptor on the top-level deployed issue page.

## Evaluation and release status

The checked [evaluation contract](EVALS.md) defines the domain, browser, native,
live-agent, visual, release, ablation, and independent competition-judge gates. Its
machine-checked row inventory is the source of truth; this README does not duplicate
those fast-changing counts.

The production URL currently serves the shipped v4.4 company-scoped interaction. Local
protocol, browser, deterministic end-to-end, and production smoke gates passed before
promotion. A fresh supported-client release run must still observe the
idle→assignment-catalog→idle transition and invoke the exact returned descriptors on the
v4.4 production source; adapter-only calls never count as native proof. The live managed
provider result, exact-SHA native matrix, public video/package, and final release manifest
remain `PENDING`.

Repository visibility, video publication, and Devpost submission remain separate
release actions. Local and remote Supabase migration-history timestamps still differ, so
no database push should run until that history is reconciled.

## Project documents

- [Product specification](product_spec.md) — frozen v4.4 collaboration and authority contract.
- [Repository contract](docs/contracts/repository-contract.md) — checked entities,
  routes, lifecycle, replay, security, and concurrency behavior.
- [Postmortem hero](docs/contracts/postmortem-hero-scenario.md) — exact INC-482 r1-r5
  scenario and fresh-agent answer key.
- [Product-document hero](docs/contracts/product-document-hero-scenario.md) — exact
  capacity-planning r1-r6 scenario, including the preserved broadened edit and Restore.
- [Evaluation contract](EVALS.md) — automated, browser, native, trajectory, visual,
  rehearsal, and competition-judge gates.
- [Legacy evidence ledger](EVAL_RESULTS.md) — prior-release observations only; it is not
  v4.4 release proof.

## License

[MIT](LICENSE)
