# Ratiflow — WebMCP collaboration workspace

> **Agents prepare. People ratify. Work moves.**

Ratiflow is a decision room for the moment a team must make a consequential call while
the facts are still changing. In the demo, Maya (Product Lead), Jordan (Engineering
Lead), and an agent decide how to ship CSV export for Northstar Health's renewal. The
agent can inspect, compare, recommend, and prepare a decision; Maya alone ratifies it
in the ordinary UI. Every action stays visible with its actor, origin, revision, and
consequence.

The product idea is **capability compilation**:

```text
effective WebMCP tools = f(workflow state, page selection, member session, revision)
```

React made the interface a function of state. WebMCP lets the agent's action space be a
function of state.

## Submission status

| Item | Current status |
| --- | --- |
| Judging app | **Production live.** [ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app/) — release SHA `1c47d88f37688b065d910798f3be35b865ab1091`, deployment `dpl_4ypxF5YvesYkHztgok6m3NAFfrZX`. |
| Public source repository | **Pending release.** This repository must be public, include this README and the MIT license, and remain accessible through judging. |
| Narrated demo | **Pending recording/upload.** The required public YouTube video must be narrated and shorter than three minutes; the 2:46 recording script is in [demo/shot-script.md](demo/shot-script.md). |
| Evidence | `.codex/verify.sh` passes 56 tests across 11 files; production browser checks pass 7/7, `eval:rehearse` passes 20/20, the dynamic agent ledger passes 35/35, and the matched ablation passes 30/30. Native N01–N11 release capture is recorded; only public-repo release and the user-owned video remain submission gates. See [EVAL_RESULTS.md](EVAL_RESULTS.md). |

Ratiflow is intended to be freely reachable by judges for the full judging period. The
source repository remains private until the user authorizes public release.

## Why this is native WebMCP

Ratiflow does not expose a remote MCP server, an OAuth-connected integration, or a
static REST/API catalog. The top-level web page uses `document.modelContext` to register
the tools that are valid **on this page, for this session, at this revision**. A
compatibility observation of `navigator.modelContext` is supported when present, but is
not the standards path.

The same compiled capability object drives both the human-visible Capability Field and
the native registrations. When Maya selects an option, option-scoped tools appear. When
Jordan changes capacity from 18 to 14 engineer-days in a separate session, the decision
becomes contested and `prepare_decision` is removed from native discovery. The agent
must refresh its view of the page before proceeding. That live, state-dependent action
surface—and the ordinary UI fallback when WebMCP is unavailable—is the point of the
project.

## The Northstar decision story

At revision 7, the team has 18 engineer-days and recommends full CSV export on October
15. Maya selects that option, exposing option-specific native tools. Jordan then records
a four-day incident rotation in a genuine second browser session. Capacity falls to 14,
the decision moves from `READY` to `CONTESTED`, and the agent's old revision-7 write is
rejected with the exact collaborator-authored diff.

The agent inspects the new state, compares alternatives, and recommends an invite-only
Northstar beta: 14 days at launch, with GA on November 1. It prepares an editable review
card. Maya may revise the wording, then ratifies in the human UI. The decision commits,
the `customer-launch-brief` changes from `BLOCKED` to `READY`, and the provenance trail
shows who did what and why.

All seed facts are synthetic. Northstar Health, the $180,000 renewal, Maya, Jordan, and
the options are a deterministic fictional scenario—not customer data. A clearly labeled
synthetic collaborator driver is allowed only when it takes the same UI and service path
as a second browser session; a timer, fabricated UI state, or bypassed domain mutation
does not count as collaboration evidence.

## Five workflow states, ten tools

The server derives state from persisted facts and append-only events; clients cannot set
it directly. Workspace revision advances only for accepted domain mutations.

| State | Meaning | Base native tools |
| --- | --- | --- |
| `OPTIONS` | Evidence or recommendation is incomplete | `inspect_decision`, `recommend_option`, `add_evidence`, `why_not` |
| `CONTESTED` | A live constraint or blocking challenge conflicts with the recommendation | `inspect_decision`, `recommend_option`, `add_evidence`, `compare_options`, `why_not` |
| `READY` | A feasible, evidenced recommendation is ready for review | `inspect_decision`, `recommend_option`, `add_evidence`, `compare_options`, `prepare_decision`, `why_not` |
| `REVIEW` | A prepared decision awaits a person | `inspect_decision`, `trace_decision`, `why_not` |
| `COMMITTED` | A person ratified; downstream work may proceed | `inspect_decision`, `trace_decision`, `why_not` |

The stable catalog has exactly ten tools:

1. `inspect_decision`
2. `inspect_selected_option`
3. `recommend_option`
4. `challenge_option`
5. `add_evidence`
6. `compare_options`
7. `prepare_decision`
8. `trace_decision`
9. `inspect_followup`
10. `why_not`

Selecting an option in `OPTIONS`, `CONTESTED`, or `READY` adds
`inspect_selected_option` and `challenge_option`. Selecting the committed
`customer-launch-brief` adds `inspect_followup`. Changing selection invalidates old
page context even when a tool name remains the same.

There is deliberately no `ratify_decision` or `commit_decision` WebMCP tool. Maya's
ordinary UI route requires her server-issued session, the current revision, `REVIEW`
state, and an explicit interaction. This is a product authority boundary, not a claim
to prevent someone who controls Maya's active browser session from imitating a click.

## Architecture

```text
Top-level Next.js page
  ├─ Capability compiler → visible Capability Field + document.modelContext registrations
  ├─ Ordinary human UI → authenticated domain routes
  └─ WebMCP callbacks → validated mutation route
                         ↓
             Supabase RPC boundary / Postgres transaction
                         ↓
          append-only provenance + monotonic workspace revision
                         ↓
        collaborator notice → refetch authoritative state → recompile
```

- Next.js App Router, React, TypeScript, CSS, and pnpm run the application.
- A pure compiler produces the one capability object consumed by both UI and WebMCP
  registration; removed registrations are aborted with `AbortController`.
- Supabase Postgres is authoritative. RPCs assign member, actor, and origin on the
  server; compare-and-swap mutations and request IDs provide revision safety and
  idempotent retry.
- Realtime-style notices are notifications, not truth: the page refetches authoritative
  state before recompiling capabilities.
- Events record actor, actor type, origin, optional tool, base/result revisions,
  rationale, review status, and changed entities.

## Run locally

Prerequisites: Node.js compatible with the checked-in pnpm version and pnpm 11.

```bash
pnpm install
pnpm dev
```

Without backend environment variables, development uses an in-memory deterministic
service. It is useful for UI and protocol work, but is not a cross-session deployment.

### Supabase environment and migration order

To use the authoritative backend, configure these server-side deployment/local
environment variables. They are intentionally named without `NEXT_PUBLIC_`; never put a
service-role key, browser storage, or demo-session handle in the repository.

```bash
RATIFLOW_SUPABASE_URL=https://your-project.supabase.co
RATIFLOW_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply the SQL migrations in this filename order to the target Supabase project:

1. `supabase/migrations/20260830104328_ratiflow_persistence_foundation.sql`
2. `supabase/migrations/20260830190000_ratiflow_rpc_boundary.sql`
3. `supabase/migrations/20260830201915_derive_followup_context.sql`

The second migration relies on the first migration's schema, types, and private session
boundary. Use the team's normal Supabase migration workflow (for example, a configured
`supabase db push`) rather than executing them out of order.

### Verification

```bash
.codex/verify.sh
pnpm eval:protocol
RATIFLOW_BASE_URL=https://ratiflow-webmcp.vercel.app pnpm eval:native
pnpm build
```

`pnpm eval:native` is browser automation, not by itself proof that a native client
discovered the release page. Final native evidence must come from the deployed HTTPS
URL on at least one supported native judging surface. Record additional client surfaces
honestly: a client that does not expose WebMCP is an availability observation, not a
required pass or a product failure. Release observations cover discovery, invocation,
dynamic tool removal, stale-write handling, selection invalidation, absence of a ratify
tool, downstream recompilation, available optional client APIs, WebMCP-off UI fallback,
and runtime health. See [EVALS.md](EVALS.md) and [VALIDATION.md](VALIDATION.md).

## Security and privacy

- Tool presence informs the agent; server-side session, revision, state, context, and
  schema validation enforce the business rules.
- WebMCP origin and ordinary-UI origin are server-assigned. Model input cannot choose an
  actor, workspace, selected target, or origin.
- Every write carries a request ID and expected revision. Replays with identical content
  are idempotent; changed-content replays are rejected.
- Human- and agent-authored text is treated as data and marked untrusted in read-tool
  results. Inputs are bounded and results are JSON-serializable.
- Demo launches issue separate high-entropy, per-tab handles. A one-time fragment
  bootstrap may create the Jordan view, then exchanges into `sessionStorage` and scrubs
  the URL. Do not commit handles, cookies, API keys, raw browser storage, or transcripts
  containing them.

## Historical probe and current evidence boundaries

The earlier lifecycle probe established native `document.modelContext` behavior; it is
historical evidence only. The current production release has a dated N01–N11 native
capture in Codex desktop’s in-app Browser at [the release artifact](evals/results/native/codex-in-app-browser/2026-08-30T141842Z/release.json).
The wrapper did not expose raw `getTools`/`executeTool` or callback cancellation fields;
browser version is null. A separate exact-production Chrome observation found
`document.modelContext` unavailable on that connected client, with zero console errors
and no mutations; it is recorded as a client-setup limitation, not a product pass or
failure, in [the Chrome observation](evals/results/native/chrome-extension/2026-08-30T170405Z/release.json).

The dynamic agent ledger is 35/35 and the matched A01–A03 ablation is 30/30. At equal
task success, dynamic discovery used 11 fewer calls, 10 fewer invalid calls, and seven
fewer stale-recovery turns than the static superset; cross-environment elapsed time is
not compared. Public video and final public-repo release remain pending.

## Project documents

- [Product specification](product_spec.md) — product promise and release contract.
- [Capability contract](docs/contracts/capability-contract.md) — exact states, tools,
  result envelopes, and authority rules.
- [Hero scenario](docs/contracts/hero-scenario.md) — deterministic seed, revisions, and
  video goldens.
- [Evaluation contract](EVALS.md) — protocol, native-surface, trajectory, and ablation
  gates.
- [Demo ledger](demo/README.md) — submission checklist and evidence status.

## License

[MIT](LICENSE)
