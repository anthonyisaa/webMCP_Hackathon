# Ratiflow — WebMCP Challenge submission

**Tagline:** Mention the expert. The page supplies the tools. The document keeps the
proof.

- **Planned v4.2 live demo:** [ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app)
- **Planned v4.2 12-slide story:** [ratiflow-webmcp.vercel.app/deck](https://ratiflow-webmcp.vercel.app/deck)
- **Source:** [github.com/anthonyisaa/webMCP_Hackathon](https://github.com/anthonyisaa/webMCP_Hackathon)
  (private during release preparation)

> **Release status:** the URLs above still serve the prior v4.1 release and are not v4.2
> evidence. Application promotion is authorized in principle, but the exact v4.2
> Supabase migration still requires explicit database-project approval; the matching
> deployment and URL checks follow that apply. Remove this note only after the exact-SHA
> v4.2 release is observed.

## The pitch

Ratiflow turns a shared document into a dynamic agent workspace. A person enters a
nickname, opens one of two completed two-page documents, selects a passage, and writes
the most familiar collaboration gesture on the web: a comment beginning with `@Code`,
`@Data`, or `@General`.

That mention changes what the page can do. Ratiflow temporarily replaces its eight
idle bring-your-own-agent tools with only the selected specialist's six- or seven-tool
WebMCP catalog. GPT-5.6 Luna discovers that live catalog through client-executed tool
search; the server pins each required next function in a bounded role workflow, Luna
composes its strict arguments and returns the call, and the browser then invokes the
exact tool descriptor returned by
`document.modelContext.getTools()`. The result can revise only the selected passage.

This is not another rewrite button or chat window. The document itself becomes the
agent's capability, context, and provenance plane.

## The 90-second judge experience

1. Choose a nickname. It labels your comments and revisions; no account is required for
   this prototype.
2. Open the completed **INC-482 Checkout outage postmortem** or **Northstar CSV export
   launch decision**. Each is a working two-page document with human and agent history.
3. Follow the three-step coach. One click selects the exact suggested section and
   prefills the full specialist prompt; the judge still reviews it and chooses
   **Assign & run**. Typing `@` manually opens the Humans plus managed `@Data`, `@Code`,
   and `@General` directory.
4. In the Postmortem, ask `@Code` to verify Root cause against the labeled synthetic
   repository and checkout log. In the Product document, ask `@Data` to test Success
   measures against the labeled synthetic capacity plan.
5. Watch the Flight Recorder show the application's catalog transition and tool-call
   receipts while the result lands as one scoped revision.
6. Ask `@General` to reword a section, then open **History** to inspect authorship,
   prompt, evidence, diff, and Restore.

Two blank templates remain available behind **Prefer a blank document?**, but the main
path starts with the two completed examples so the WebMCP moment is immediately clear.

## What the specialists demonstrate

### `@Code` — evidence from a synthetic repository

The Postmortem begins at r5 with prior human and agent collaboration. `@Code` searches
only the deterministic synthetic checkout repository, opens the bounded allowlisted
incident bundle, and verifies that provider throttling was the external trigger while retry
middleware was the internal amplifier. The evidence records five zero-delay retries,
traffic amplification of 5.8×, and queue growth from 420 to 18,240 before the agent
replaces only Root cause as r6.

### `@Data` — inspectable capacity arithmetic

The Product document begins at r6. `@Data` queries only the deterministic synthetic
Northstar capacity fixture and shows why 10 reliability days plus 4 beta-export days
fit the 14 available days, while 10 plus 8 full-export days require 18. It preserves the
October 15 invite-only beta, November 1 general availability, and renewal commitment,
then replaces only Success measures as r7.

### `@General` — bounded editorial judgment

`@General` receives writing and consistency tools instead of code or data access. It can
read the synthetic company style guide, check terminology, and submit one bounded
rewrite without changing the underlying facts. Switching roles visibly removes the
previous specialist's tools before adding the new catalog.

All specialist outputs are labeled synthetic demo evidence. Ratiflow makes no claim that
the prototype is connected to a live customer database, repository, or filesystem.

## Why WebMCP is essential

Most agent integrations decide every possible tool on the server before the model runs.
Ratiflow demonstrates a different future: the live page publishes the smallest useful
capability set for the work a human just delegated.

When no managed run is active, the top-level page exposes eight advanced
bring-your-own-agent tools:

```text
connect_agent · inspect_document · read_document_history
read_collaboration_context · list_my_tasks · wait_for_my_tasks
comment_on_task · submit_task_result
```

During a managed run, that catalog is withdrawn. Every specialist receives the same five
bounded collaboration tools—read assignment, read document context, read collaboration
context, comment, and submit a scoped revision—plus only its specialty:

| Mention | Specialist tools | Total |
|---|---|---:|
| `@Data` | `query_demo_metrics` | 6 |
| `@Code` | `search_demo_code`, `read_demo_file` | 7 |
| `@General` | `read_company_style_guide`, `check_document_consistency` | 7 |

The composed path is visible and testable:

```text
@mention
  → page registers one role catalog and emits toolchange
  → Luna requests client tool search through the Responses API
  → browser reads document.modelContext.getTools()
  → catalog returns as tool_search_output
  → server pins the exact required function by name
  → Luna composes its strict arguments and returns that call
  → browser calls executeTool() with the exact returned descriptor
  → evidence-backed revision commits
  → role catalog is withdrawn and the eight idle tools return
```

Remove WebMCP and the document still works for people—editing, comments, sharing,
History, and Restore remain available—but managed actuation fails closed. That makes
WebMCP structural to the experience rather than an integration badge.

## How Luna and WebMCP connect

Ratiflow uses an **application-owned WebMCP Relay powered by GPT-5.6 Luna**. Luna's
Responses API supports client-executed `tool_search`; Ratiflow maps that request to the
page's current WebMCP catalog and returns the discovered definitions to the model.

This is explicitly **not** a claim that Luna natively supports OpenAI Site Tools. It is
a forward-looking composition of two real primitives: Luna tool search and the browser's
`document.modelContext` tools. The OpenAI credential stays server-side.

Mentions wake the eligible open page immediately. A 15-second timer only recovers missed
work while that page remains open; it is not cron, an unattended bot, or a background
agent service.

## The document keeps the proof

Every successful result becomes a normal, reversible document revision—not an answer
that disappears in chat. Ratiflow retains:

- the human nickname, managed specialist, and exact `@` instruction;
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

- A universal collaboration gesture—`@mention`—controls a genuinely dynamic tool
  surface without exposing an agent configuration UI.
- Role changes are concrete: `@Code`, `@Data`, and `@General` receive visibly different
  page capabilities.
- One run connects model discovery, exact page execution, synthetic source evidence,
  a bounded write, and durable history.
- The demo is honest about what is application-owned, what is native browser behavior,
  what is synthetic, and what continues working without an agent.
- The same pattern can scale from a hackathon directory to company, team, and personal
  specialists while the document remains the shared source of truth.

## What is next

The hackathon prototype uses a synthetic directory and possession-of-link workspaces.
A production version would add organizational identity and policy, verified agent
principals, longer retention, and permissioned connectors for real repositories,
analytics, and incident systems. The core interaction would stay the same: mention the
right expert, let the page reveal only the right tools, and preserve exactly what changed
and why.
