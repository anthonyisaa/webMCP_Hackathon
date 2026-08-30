# Ratiflow — WebMCP collaboration workspace

**Tagline:** Agents prepare. People ratify. Work moves.

**Short description:** Ratiflow is a shared decision room where a live web page compiles
the agent’s current, reviewable action space from workflow state, page selection, member
session, and workspace revision. Agents inspect evidence, compare options, recover from
stale facts, recommend, and prepare; people retain the consequential ratification step.

The hero scenario is explicitly synthetic: Maya Chen (Product Lead), Jordan Lee
(Engineering Lead), and the displayed “Ratiflow demo agent” decide how a B2B analytics
team should deliver CSV export for fictional Northstar Health. No customer data is used.

## Why your use case is a strong fit for WebMCP

Teams make launch decisions while capacity, evidence, and deadlines are changing. A
static API menu cannot tell an agent which action is valid for the page a person is
looking at right now. Ratiflow makes the live page the agent’s action surface: native
tools are discovered with no remote MCP server, connector setup, OAuth flow, API key, or
copied workspace ID.

This is capability compilation, not a skinned MCP server or REST catalog:

```text
effective WebMCP tools = f(workflow state, page selection, member session, revision)
```

Selecting an option adds option-scoped tools. When Jordan changes launch capacity from
18 to 14 engineer-days in a separate session, the decision changes from `READY` to
`CONTESTED` and `prepare_decision` disappears from the live native discovery. A retained
stale write returns the collaborator-authored revision diff and next action. The same
compiled capability object drives the visible Capability Field and the
`document.modelContext` registrations, so judges can see what the person sees and what
the agent can actually do.

## How it creates a better user experience

Ratiflow turns opaque agent activity into a shared decision instrument. People see the
current state, selected target, available tools, unavailable actions with their exact
unmet predicates, revision, capability diffs, and append-only provenance without opening
developer tools. Agents receive structured state instead of scraping the DOM and can
follow a usable recovery path when their assumptions are stale.

The experience has a clear trust boundary: an agent can prepare an editable review card,
but there is intentionally no `ratify_decision` or `commit_decision` WebMCP tool. Maya
ratifies in the ordinary UI. After that human decision, the dependent
`customer-launch-brief` moves from `BLOCKED` to `READY`, with inherited dates, owner, and
rationale visible in the timeline. WebMCP is optional to human usability—the ordinary
two-person UI remains functional when WebMCP is unavailable—but it gives a supported
agent a zero-setup, state-aware action surface.

## Describe what people and agents can do together that was difficult or impossible before

In one coherent flow, Maya selects the full-GA option, Jordan changes capacity in a
genuine second session because of a four-day incident rotation, and the page
authoritatively invalidates the agent’s old basis. The agent sees the exact `18 → 14`
capacity change and `READY → CONTESTED` transition, compares the alternatives, and
recovers by recommending the feasible invite-only Northstar beta: 14 engineer-days at
launch, beta on October 15, 2026, and GA on November 1, 2026.

The agent then prepares a review card, while Maya can edit its wording and makes the
final ratification in the human UI. The committed decision propagates to the launch
brief, and anyone can trace who acted, from which origin, against which revision, with
what rationale and changed entities. This makes a live constraint change, autonomous
agent recovery, human accountability, and downstream handoff one inspectable
human-agent workflow rather than disconnected chat messages, stale documents, or an
agent-controlled commit.

## Briefly explain how you implemented WebMCP

The top-level Next.js App Router page uses the standards path,
`document.modelContext.registerTool`, to register the tools valid for the current page.
A pure TypeScript capability compiler derives the exact state/selection catalog and
feeds both the human Capability Field and the registration planner. Capability changes
abort old registrations with `AbortController`; selected-target callbacks capture their
`contextEpoch`, and every callback revalidates current state, selection, revision, and
server-assigned session context.

Writes go through validated domain mutations backed by Supabase Postgres RPC
transactions. Compare-and-swap workspace revisions prevent stale writes; request IDs
make retries idempotent; append-only events preserve actor, origin, tool, revisions,
rationale, review status, and changed entities. Realtime-style collaborator notices
trigger an authoritative refetch before recompilation. The server assigns actor,
membership, and origin, so model input cannot forge them. Human ratification is exposed
only through the ordinary UI route. A small `navigator.modelContext` observation is
retained only as a compatibility fallback; it is not the public contract.

## Technologies

Next.js App Router, React, TypeScript, CSS, `document.modelContext` WebMCP, Supabase
Postgres/RPC with authorized revision-notice polling, SSE, pnpm, and Vercel.

## Evidence links (replace only with observed release evidence)

- **Live judging URL:** `PENDING — final product redeploy`
- **Public source repository:** `PENDING — public release repository`
- **Demo video (<3 minutes, public YouTube):** `PENDING — record and upload`
- **Native WebMCP discovery/invocation capture:** `PENDING — final judging surface`
- **Agent trajectory and five-run rehearsal results:** `PENDING — release evidence`
- **WebMCP-on/off ablation:** `PENDING — release evidence`
- **Relevant source:** [README](../README.md), [product specification](../product_spec.md),
  [capability contract](../docs/contracts/capability-contract.md), and
  [hero scenario](../docs/contracts/hero-scenario.md)

The four answers follow the required fields in the [official WebMCP Challenge rules](https://webmcp.devpost.com/rules).
Pending links and captures are intentionally not presented as completed proof.
