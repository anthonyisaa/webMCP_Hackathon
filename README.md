# Ratiflow — a live decision room for people and agents

> **Agents prepare. People ratify. Work moves.**

Ratiflow is a shared launch-scope workspace where a browser agent can join as a visible
teammate, catch up on server activity, wait for addressed work, claim one task, leave an
attributed comment, ask a person a question, resume after the answer, and resolve the
task. The human interface and native WebMCP tools read and write the same authoritative
state.

The page is honest about the browser boundary: adding work to the inbox does **not**
start or wake an external model. A supported browser-agent turn must discover the page,
call `join_session`, and wait or catch up. Optional in-page auto-pickup stays visibly
unavailable until its model, native-loop, and spend gate passes.

## Product surfaces

| Route | Purpose |
| --- | --- |
| `/` | Flagship Northstar decision room with the live human-agent loop. |
| `/decision-demo` | Stable alias of the flagship decision room. |
| `/document` and `/document/[shareToken]` | Preserved pageless shared note with human stages and a paired-agent annotation queue. |
| `/webmcp-probe` | Narrow lifecycle probe used only for protocol diagnosis. |

All seed names and facts are deterministic fiction. Northstar Health, its $180,000
renewal, Maya, Jordan, and the launch options are not customer data.

## Try the live loop

1. Open [the production workspace](https://ratiflow-webmcp.vercel.app/) and choose
   **Launch deterministic workspace**. The decision starts at revision 7 with 18
   engineer-days of capacity.
2. A fresh supported client discovers exactly `join_session` and `catch_up`.
3. Call `join_session`. Ratiflow Agent becomes visibly `LIVE`; the renewable browser
   lease expands the coordination tools and the current decision tools.
4. Select **Northstar beta**, write a bounded task in **Ask Ratiflow Agent**, and add it
   to the inbox. This records work but does not claim to start an agent.
5. `wait_for_activity` returns the addressed event and inbox item. The agent calls
   `claim_agent_task`; concurrent claim attempts cannot acquire a second generation.
6. The agent may call `post_comment` or `request_human_input`. A task-linked question
   releases the claim and moves the task to `WAITING_HUMAN`.
7. A person answers in the ordinary UI. `catch_up` returns the attributed answer and the
   reopened task; the agent takes a fresh claim and calls `resolve_task`.
8. `leave_session` revokes the page lease, moves presence to `AWAY`, and collapses the
   native catalog back to the two fresh-session tools. Collaboration history remains.

Maya alone can ratify a prepared decision through the ordinary UI. There is no
`ratify_decision`, `finalize_decision`, or equivalent WebMCP tool.

## The contract in one picture

```text
ordinary human UI ───────┐
                        ├─ validated Next.js routes ── Supabase RPC transaction
native browser WebMCP ──┘                                │
                                                        ├─ append-only activity cursor
                                                        ├─ renewable presence lease
                                                        ├─ fenced task claim
                                                        ├─ idempotency ledger
                                                        └─ authoritative workspace view

notice / timer → refetch authoritative view → recompile UI + native tool projection
```

The effective native action space is compiled from server and page context:

```text
tools = f(workflow state, page selection, member authority, caller, engagement)
```

Tool presence guides the agent; it is not the security boundary. Server code derives
workspace, actor, origin, and caller from opaque membership and page-session context.
Model input cannot select those fields.

## Coordination tools

A fresh page exposes only:

- `join_session`
- `catch_up`

A live browser session adds:

- `wait_for_activity`
- `leave_session`
- `get_state_brief`
- `get_thread`
- `get_inbox`
- `claim_agent_task`
- `resolve_task`
- `post_comment`
- `request_human_input`

The decision compiler adds only the reads and writes valid for the current workflow
state and selection. Changing selection invalidates the old page context even when a
tool name remains available. Removing a tool aborts its registration through an
`AbortSignal`; execution cancellation is propagated to the server operation.

Every native callback returns both MCP text content and the same JSON object as
`structuredContent`. Current normative annotations are `readOnlyHint` and
`untrustedContentHint`; Ratiflow does not invent a `destructiveHint` contract.

## Correctness properties

- Activity cursors are opaque, workspace-bound UUIDs backed by a private monotonic
  sequence. Catch-up is bounded, paginated, and cannot skip relevant events.
- Browser-live presence is a 45-second renewable lease. Invoked-but-not-live activity
  uses a two-minute lease; abandoned sessions expire without trusting unload handlers.
- Task claims are atomic 90-second generations. Claim IDs stay inside the trusted page
  adapter and are required for task-linked writes and resolution.
- Request IDs make writes idempotent; changed-content replay is rejected.
- Agent questions pause and release a task. A human answer reopens it for a fresh claim.
- Browser and optional auto-runner callers share one registry but use fixed server
  routes. Caller, actor, and origin never come from model JSON.
- Decision revision and collaboration activity cursor are separate clocks. UI fetches
  are generation-fenced so an older equal-revision response cannot erase fresher agent
  activity.
- The ordinary human UI remains usable when WebMCP is absent.

Exact DTOs and invariants live in
[the live-session contract](docs/contracts/live-agent-session-contract.md) and
[the capability contract](docs/contracts/capability-contract.md).

## Production evidence

As of **2026-09-01 (Singapore time)**:

| Evidence | Result |
| --- | --- |
| Production | `dpl_23TBRzj8rcKRE5eSCsbqJK7T2Dob` is `READY` at [ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app/). |
| Repository gate | TypeScript, ESLint, and 161/161 unit/protocol tests passed across 25 files. |
| Production build | Next.js 16.3.3 webpack build compiled and typechecked successfully. |
| Hosted browser suite | 19/19 scenarios passed against the canonical production URL, including the full live task/question loop and stale equal-revision regression. |
| Native supported surface | Codex in-app Browser discovered the exact two fresh tools, executed `join_session`, observed the expanded catalog, executed `get_state_brief` and `catch_up`, read the persisted `AGENT_JOINED` event, then executed `leave_session` and observed collapse to two tools. |
| Runtime health | Post-traffic Vercel scan found no runtime error clusters and no 5xx responses on the deployment. |
| Database | Remote migrations include live-session persistence plus repairs for lease renewal, required null task claims, and the canonical `Ratiflow Agent` identity. |
| Independent visual grade | Pending: the configured read-only `design-judge` role was unavailable. Functional mobile and accessibility browser scenarios passed, but that is not relabeled as an independent design verdict. |

The public GitHub release and narrated public YouTube submission remain owner-controlled
release steps; neither is claimed complete here.

## Run locally

Prerequisites: Node.js and pnpm 11.

```bash
pnpm install
pnpm dev
```

Without Supabase variables, development uses the deterministic in-memory service. To
exercise the durable backend, provide server-side variables (never `NEXT_PUBLIC_` and
never a service-role key):

```bash
RATIFLOW_SUPABASE_URL=https://your-project.supabase.co
RATIFLOW_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply migrations in filename order. The live-loop additions are:

1. `20260831153213_live_agent_session_persistence.sql`
2. `20260831171049_disambiguate_agent_session_touch.sql`
3. `20260831173240_preserve_null_task_claim.sql`
4. `20260831174501_normalize_agent_display_name.sql`

Use the normal Supabase migration workflow rather than pasting functions out of order.

## Verify

```bash
.codex/verify.sh
pnpm build

RATIFLOW_BASE_URL=https://ratiflow-webmcp.vercel.app \
  pnpm exec playwright test \
  e2e/accessibility.spec.ts \
  e2e/document-collaboration.spec.ts \
  e2e/document-editor.spec.ts \
  e2e/document-webmcp.spec.ts \
  e2e/followup-context.spec.ts \
  e2e/hero.spec.ts \
  e2e/live-agent-session.spec.ts \
  e2e/webmcp-session-reset.spec.ts
```

`e2e/native.spec.ts` checks the current draft API shape, but a regular automation
browser is not proof of native availability. Release evidence must include a supported
deployed surface that actually discovers and invokes the page-defined tools.

## Preserved shared note

The secondary document surface remains a real blank, shareable note with four
human-controlled stages, presence/edit awareness, multiple targeted annotations,
paired-agent ownership, exact-target application, safe rebase/stale behavior, and
human undo. Its distinct catalog is cleaned up before the root decision page registers
its own tools. See [the editor contract](docs/contracts/editor-contract.md).

## Security and privacy

- Tables are RPC-only: RLS is enabled with no broad table policies or direct anon/auth
  grants. Public `SECURITY DEFINER` RPCs are intentionally handle-authenticated and use
  fixed `search_path` values.
- Demo membership handles are high entropy, hashed at rest, scoped to one isolated
  workspace, stored only in tab session storage, and expire after eight hours.
- Inputs are exact-key validated and bounded; outputs are JSON-serializable and agent
  or human text is marked untrusted.
- Do not commit handles, cookies, environment values, raw browser storage, or
  unsanitized agent transcripts.

## Project documents

- [Product specification](product_spec.md)
- [Live agent-session contract](docs/contracts/live-agent-session-contract.md)
- [Capability contract](docs/contracts/capability-contract.md)
- [Hero scenario](docs/contracts/hero-scenario.md)
- [Shared-note contract](docs/contracts/editor-contract.md)
- [Evaluation contract](EVALS.md)
- [Demo and submission ledger](demo/README.md)

## License

[MIT](LICENSE)
