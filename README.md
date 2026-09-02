# Ratiflow

> **Mention the expert. The page supplies the tools. The document keeps the proof.**

Ratiflow turns a shared document into a dynamic agent workspace. A judge enters a
nickname, opens a completed two-page Postmortem or Product document, selects a passage,
and writes a normal comment beginning with `@Code`, `@Data`, or `@General`. The page then
exposes only that specialist's WebMCP tools, GPT-5.6 Luna composes the required calls
and arguments in a bounded role workflow, and the result lands as a reversible document
revision scoped to the selected passage.

The novelty is not another chat box. It is a page-owned capability switch:

```text
@mention → role-scoped WebMCP catalog → Luna tool search → exact page tool
         → synthetic evidence → scoped revision → immutable history
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

## The 90-second judge path

1. Enter a nickname and choose **Postmortem** or **Product doc**.
2. Follow the three-step coach to select the suggested passage and load the suggested
   specialist prompt.
3. Assign `@Code` to verify the Postmortem's retry regression, or `@Data` to check the
   Product document's launch-capacity arithmetic.
4. Watch the Flight Recorder show the role catalog, Luna's required tool calls, labeled
   synthetic sources, and the committed revision.
5. Mention `@General` on a section to reword it while preserving facts.
6. Open **History** to inspect the prompt, sources, authorship, diff, and Restore action.

The completed **INC-482 · Checkout outage postmortem** begins at r5 with human and agent
history. Its guided `@Code` run verifies `commit:7d3c9e1` and `checkout.log`, then commits
r6. A follow-up `@General` run can reword the revised Root cause as r7.

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
generation-scoped specialist catalog:

| Specialist | Common tools | Specialist tools | Total |
| --- | --- | --- | ---: |
| `@Code` | assignment, document, collaboration, comment, submit | `search_demo_code`, `read_demo_file` | 7 |
| `@Data` | assignment, document, collaboration, comment, submit | `query_demo_metrics` | 6 |
| `@General` | assignment, document, collaboration, comment, submit | `read_company_style_guide`, `check_document_consistency` | 7 |

The exact relay sequence is:

```text
toolchange → tool_search_call → getTools() → tool_search_output
           → Luna function call → executeTool() → revision committed
```

Tool names are unique per registration generation; old descriptors and replayed
one-shot permits fail closed. Server-side task scope, lease ownership, revision checks,
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
the suggested passage, choose the suggested managed specialist, and open the Flight
Recorder. The company directory is deliberately synthetic and labels each agent's
scope and specialty. Bring-your-own-agent setup remains available in an Advanced
section; self-declared profiles are separate from managed demo identities.

A text or whole-block selection opens one compact anchored comment composer. Selecting
an autocomplete result creates `@Agent` work; literal or unselected `@` text creates a
normal comment. The unified comment rail shows discussion and completed work in place.
History is a quiet Git-like view with immutable snapshots, provenance, diffs, and
Restore—useful to people, but primarily the durable context plane agents read.

WebMCP is optional. With it absent, people can still create, read, edit, share, comment,
reply, close discussions, inspect history, and restore a revision. Managed mentions
remain durable but cannot execute until an eligible page opens; the UI says so.

## Why WebMCP matters

Without a page-native contract, collaboration with agents collapses into copied prompts,
pasted findings, bespoke integrations, and lost reasoning. Ratiflow turns the live
document into a discoverable capability and context plane:

- the page changes the available capabilities as `@Code`, `@Data`, and `@General` work;
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
  └─ document.modelContext → idle catalog ⇄ managed role catalog
                                    ↓
                 app-owned Responses API relay (gpt-5.6-luna)
                                    ↓
          lease + permit + exact-range repository authority
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
- Managed runs use one active run per document, two attempts at most, short leases,
  one-shot execution permits, provider-step reservations, and durable spend limits.

The older `/document/[shareToken]` and `/decision-demo` paths remain isolated v3
compatibility surfaces. They do not prove the v4.2 managed relay.

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
proof requires a supported client observing the idle→role→idle lifecycle and invoking
the exact returned descriptor on the top-level deployed issue page.

## Evaluation and release status

The checked [evaluation contract](EVALS.md) defines the domain, browser, native,
live-agent, visual, release, ablation, and independent competition-judge gates. Its
machine-checked row inventory is the source of truth; this README does not duplicate
those fast-changing counts.

The v4.2 candidate has passed local protocol gates and repeated loopback Chrome 152
`document.modelContext` trajectories with the live Luna API. That proves the candidate
flow, but it is not deployed native evidence. A supported-client release run must still
observe the idle→role→idle catalog transition and invoke the exact returned descriptors
on the exact production SHA; adapter-only calls never count as native proof.

The matching v4.2 application deployment is authorized in principle, but the exact
additive Supabase migration still needs explicit production-database approval. Until
the migration and deployment both land, the production URL at
[ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app) remains the prior v4.1
release (`cf1cc80`) and must not be presented as v4.2 evidence. Exact-SHA deployed-native matrices,
remote persistence checks, the public video/package, and the final release manifest also
remain `PENDING`.

Repository visibility, video publication, and Devpost submission remain separate
release actions. The source push and matching application deployment are authorized;
the latter is sequenced after the approved database migration.

## Project documents

- [Product specification](product_spec.md) — frozen v4.2 collaboration and authority contract.
- [Repository contract](docs/contracts/repository-contract.md) — checked entities,
  routes, lifecycle, replay, security, and concurrency behavior.
- [Postmortem hero](docs/contracts/postmortem-hero-scenario.md) — exact INC-482 r1-r5
  scenario and fresh-agent answer key.
- [Product-document hero](docs/contracts/product-document-hero-scenario.md) — exact
  capacity-planning r1-r6 scenario, including the preserved broadened edit and Restore.
- [Evaluation contract](EVALS.md) — automated, browser, native, trajectory, visual,
  rehearsal, and competition-judge gates.
- [Legacy evidence ledger](EVAL_RESULTS.md) — prior-release observations only; it is not
  v4.2 release proof.

## License

[MIT](LICENSE)
