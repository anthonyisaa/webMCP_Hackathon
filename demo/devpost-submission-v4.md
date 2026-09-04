# Ratiflow — WebMCP Challenge submission

**Tagline:** Mention the expert. The page supplies the tools. The document keeps the
proof.

- **Planned v4.4 live demo:** [ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app)
- **Planned v4.4 11-slide story:** [ratiflow-webmcp.vercel.app/deck](https://ratiflow-webmcp.vercel.app/deck)
- **Source:** [github.com/anthonyisaa/webMCP_Hackathon](https://github.com/anthonyisaa/webMCP_Hackathon)
  (private during release preparation)

> **Release status:** the URLs above serve the shipped v4.3 capability-first build. They
> are not evidence for the v4.4 company-scoped interaction. Promotion, native
> observation, screenshots, and URL checks remain pending; remove this note only after
> the corrected exact SHA is deployed and observed.

## The pitch

Ratiflow turns a shared document into a dynamic agent workspace. A person enters a
nickname, opens one of two completed two-page documents, selects a passage, and writes
the most familiar collaboration gesture on the web: a comment beginning with `@Code`,
`@Data`, or `@General`.

The person chooses the bot, not a permission profile. Company policy fixes `@Data` to
Metrics access, `@Code` to Repository access, and `@General` to Editorial access.
Ratiflow resolves that mapping after canonical profile lookup, stores one immutable run
grant, and temporarily replaces its eight idle bring-your-own-agent tools with the
matching six- or seven-tool catalog. GPT-5.6 Luna discovers the catalog, composes each
server-required call, and the browser invokes the exact descriptor returned by
`document.modelContext.getTools()`. Ratiflow's server—not WebMCP—enforces the selected
document range and permitted actions.

This is not another rewrite button or chat window. The document itself becomes the
agent's capability, context, and provenance plane.

## The 90-second judge experience

1. Choose a nickname. It labels your comments and revisions; no account is required for
   this prototype.
2. Open the completed **INC-482 Checkout outage postmortem** or **Northstar CSV export
   launch decision**. Each is a working two-page document with human and agent history.
3. Select any safe rendered text, type `@`, choose `@Data`, `@Code`, or `@General`, write
   the instruction, and choose **Assign & run**. No permission chooser appears.
4. In the Postmortem, ask `@Code` to verify Root cause; company policy supplies
   Repository access. In the Product document, ask `@Data` to test Success measures;
   company policy supplies Metrics access.
5. Watch the exact pending passage turn yellow while the Flight Recorder shows the
   immutable run catalog and tool-call receipts. Initial resolved history stays unpainted.
6. When the result lands, see the new replacement in green for 30 seconds, then open
   **History** to inspect authorship, prompt, evidence, diff, and Restore.

Two blank templates remain available behind **Prefer a blank document?**, but the main
path starts with the two completed examples so the WebMCP moment is immediately clear.

## What the managed bots demonstrate

### `@Code` → Repository access — evidence from a synthetic repository

The Postmortem begins at r5 with prior human and agent collaboration. Selecting `@Code`
automatically grants Repository access for that immutable run, letting the bot search
only the deterministic synthetic checkout repository, opens the bounded allowlisted
incident bundle, and verifies that provider throttling was the external trigger while retry
middleware was the internal amplifier. The evidence records five zero-delay retries,
traffic amplification of 5.8×, and queue growth from 420 to 18,240 before the agent
replaces only Root cause as r6.

### `@Data` → Metrics access — inspectable capacity arithmetic

The Product document begins at r6. Selecting `@Data` automatically grants Metrics access
for that run and queries only the deterministic synthetic Northstar capacity fixture. It
shows why 10 reliability days plus 4 beta-export days
fit the 14 available days, while 10 plus 8 full-export days require 18. It preserves the
October 15 invite-only beta, November 1 general availability, and renewal commitment,
then replaces only Success measures as r7.

### `@General` → Editorial access — bounded editorial judgment

Selecting `@General` automatically grants Editorial access, with writing and consistency
tools instead of repository or metrics tools. It can read the synthetic company style
guide, check terminology, and submit one bounded rewrite without changing the facts.
The caller cannot switch any managed bot to a different profile.

All source-tool outputs are labeled synthetic demo evidence. Ratiflow makes no claim that
the prototype is connected to a live customer database, repository, or filesystem.

## Why WebMCP is essential

Most agent integrations decide every possible tool on the server before the model runs.
Ratiflow demonstrates a different future: a person selects a company-managed bot,
Ratiflow resolves its fixed policy into an immutable run grant, and the live page exposes
the matching capability set only while that work runs.

When no managed run is active, the top-level page exposes eight advanced
bring-your-own-agent tools:

```text
connect_agent · inspect_document · read_document_history
read_collaboration_context · list_my_tasks · wait_for_my_tasks
comment_on_task · submit_task_result
```

During a managed run, that catalog is withdrawn. Every access profile includes the same
five bounded collaboration tools—read assignment, read document context, read
collaboration context, comment, and submit a scoped revision—plus its source tools:

| Managed bot | Fixed company access | Source tools | Total |
|---|---|---|---:|
| `@Data` | Metrics scoped edit | `query_demo_metrics` | 6 |
| `@Code` | Repository scoped edit | `search_demo_code`, `read_demo_file` | 7 |
| `@General` | Editorial scoped edit | `read_company_style_guide`, `check_document_consistency` | 7 |

The public mention accepts no access profile, raw tool list, source labels, actor, owner,
or range authority. The canonical managed handle selects exactly one company profile;
that resolved profile is immutable on the Relay run.

The composed path is visible and testable:

```text
@mention
  → Ratiflow resolves the managed bot's fixed company access
  → Ratiflow records one immutable capability grant
  → page registers that site capability catalog and emits toolchange
  → Luna requests client tool search through the Responses API
  → browser reads document.modelContext.getTools()
  → catalog returns as tool_search_output
  → server pins the exact access-profile-required function by name
  → Luna composes its strict arguments and returns that call
  → browser calls executeTool() with the exact returned descriptor
  → evidence-backed revision commits
  → assignment catalog is withdrawn and the eight idle tools return
```

Remove WebMCP and the document still works for people—editing, comments, sharing,
History, and Restore remain available—but managed actuation fails closed. That makes
WebMCP structural to the experience rather than an integration badge.

## How Luna and WebMCP connect

Ratiflow uses an **application-owned WebMCP Relay powered by GPT-5.6 Luna**. Luna's
Responses API supports client-executed `tool_search`; Ratiflow maps that request to the
page's current WebMCP catalog and returns the discovered definitions to the model.
WebMCP exposes and invokes those tools; it does not authenticate the bot, grant Ratiflow
access, or enforce Ratiflow permissions.

This is explicitly **not** a claim that Luna natively supports OpenAI Site Tools. It is
a forward-looking composition of two real primitives: Luna tool search and the browser's
`document.modelContext` tools. The OpenAI credential stays server-side.

Mentions wake the eligible open page immediately. A 15-second timer only recovers missed
work while that page remains open; it is not cron, an unattended bot, or a background
agent service.

## The document keeps the proof

Every successful result becomes a normal, reversible document revision—not an answer
that disappears in chat. Ratiflow retains:

- the human nickname, managed bot, server-resolved company access, and exact `@` instruction;
- the selected passage and immutable source revision;
- labeled evidence references and bounded tool receipts;
- rationale and a server-computed before/after diff;
- the resulting full document snapshot and revision lineage; and
- comments, replies, closures, and Restore as a separate collaboration history.

Restore appends a new revision instead of erasing the agent's change. Server-side
revision checks, task scope, leases, one-shot permits, evidence binding, attempt limits,
and spend quotas—not model prose—enforce authority.

The Flight Recorder is a readable **application trace** of that relay. It is not
presented as cryptographic browser attestation. Native WebMCP behavior is a separate
proof class, evaluated as dated observational evidence from a supported client against
the deployed release.

## How we built it

Ratiflow uses Next.js, React, TypeScript, Vercel, and Supabase/Postgres. The top-level
document owns one mutually exclusive WebMCP coordinator. Tool registrations are scoped
to a generation and removed with `AbortSignal`; stale descriptors and replayed one-shot
permits fail closed. The server derives actor, agent, task, range, and revision authority
instead of accepting those fields from the model.

The editor stores complete Markdown snapshots and SHA-256 digests. Safe GFM tables and
validated chart blocks remain revisioned, diffable, and restorable. Human editing and
comments do not depend on WebMCP.

## What we are proud of

- A universal collaboration gesture—select text, `@mention`, **Assign & run**—controls a
  genuinely dynamic tool surface without asking the person to configure permissions.
- The fixed company mapping is legible and enforceable: Data→Metrics, Code→Repository,
  and General→Editorial, with one immutable grant per run.
- One run connects model discovery, exact page execution, synthetic source evidence,
  a bounded write, and durable history.
- The demo is honest about what is application-owned, what is native browser behavior,
  what is synthetic, and what continues working without an agent.
- The same pattern can scale from a hackathon directory to organization bot identities
  and centrally managed access policies while the document remains the shared source of truth.

## What is next

The hackathon prototype uses a synthetic directory and possession-of-link workspaces.
A production version would add organizational identity and policy, verified agent
principals, longer retention, and permissioned connectors for real repositories,
analytics, and incident systems. The core interaction would stay the same: mention the
right bot, let company policy resolve its website access, let WebMCP expose those tools,
and preserve exactly what changed and why.
