# Ratiflow — a live decision room for people and agents

**Tagline:** Agents prepare. People ratify. Work moves.

**Short description:** Ratiflow is a shared launch-scope workspace where a browser agent
can join as a visible teammate, wait for addressed work, claim one task, collaborate
with a person through comments and blocking questions, and resolve the task—while only
the person can ratify the decision.

## Why this is a strong fit for WebMCP

Decision work depends on page-local context that a broad static API does not capture:
which decision and option the person is viewing, the current workflow phase, the exact
workspace revision, whether the browser agent has joined, and whether a task is open,
claimed, waiting for a person, or done.

Ratiflow compiles that context into a small native action space. A fresh page exposes
only **join_session** and **catch_up**. Joining establishes a renewable browser lease
and reveals the live coordination tools plus only the decision tools valid for the
current phase and selection. Leaving or lease expiry removes live-only capabilities.
There is never an agent ratification, commit, or finalize tool.

The server remains the authority. Tool input cannot choose the workspace, actor,
origin, caller, claim owner, or task generation. Opaque membership and page-session
context select those fields server-side; decision writes still require the current
revision; task writes require an atomic, expiring claim. WebMCP guides the agent to what
is valid now without becoming the security boundary.

## How it improves the human-agent experience

The agent appears in the same ordinary decision room as the people, with real
lease-derived **LIVE**, **IDLE**, or **AWAY** presence. A person selects a target,
writes a bounded request, and adds it to the inbox. The UI is explicit that this
records work but does not start or wake an external model.

During an active turn, **wait_for_activity** resolves when relevant teammate activity
arrives. The agent claims one task, comments with persistent attribution, and can ask a
blocking question. A task-linked question releases the claim and changes the task to
**WAITING_HUMAN**. The person's answer reopens it; catch-up returns the answer and the
agent takes a fresh claim before resolving. Both sides continuously read the same
server state, rather than watching a scripted animation.

This creates a legible control loop: people assign intent and retain the consequential
decision; the agent gets a narrow, current workspace; the server fences concurrent or
stale work; and the visible history explains who did what and through which surface.

## What was difficult before

A one-shot tool call can mutate a record, but it does not make an agent feel like a
teammate. The hard part is continuity and coordination: catching up without conflating
activity with business revisions, waiting without polling theatre, preventing two
callers from working the same task, pausing for a person without retaining a stale
claim, and keeping authorship visible across UI and agent surfaces.

Ratiflow adds those missing mechanics:

- opaque, workspace-bound activity cursors with bounded, non-skipping pagination;
- renewable browser leases and honest derived presence;
- atomic 90-second claim generations shared by browser and optional auto callers;
- idempotent writes and exact task/question/comment attribution;
- question-driven claim release and answer-driven reopen;
- generation-fenced UI refreshes so an older equal-revision response cannot erase
  newer collaboration activity;
- human-only ratification through the ordinary UI.

The optional in-page autonomous runner is intentionally unavailable because model
authorization and spend controls did not pass the release gate. Ratiflow does not
simulate it or claim that WebMCP can wake an idle model.

## WebMCP implementation

The top-level Next.js page registers tools through
`document.modelContext.registerTool`, with an observed `navigator.modelContext`
compatibility fallback. One caller-neutral registry owns definitions, exact schemas,
availability, validation, and handlers. The native adapter registers that projection
and cleans it up with `AbortSignal`; server routes fix the browser caller and derive
trusted execution context outside model JSON.

Fresh discovery is exactly **join_session** and **catch_up**. A live session can add
**wait_for_activity**, **leave_session**, **get_state_brief**, **get_thread**,
**get_inbox**, **claim_agent_task**, **resolve_task**, **post_comment**, and
**request_human_input**, plus workflow-valid decision tools. Native callbacks return
both MCP text content and the same JSON object as `structuredContent`.

Supabase Postgres stores the decision, append-only activity, agent session leases,
tasks, claims, questions, comments, standing instructions, and request replay.
Security-definer RPC transactions derive identity and origin, enforce workspace
isolation and human/agent authority, and preserve decision revision checks. The human UI
uses the same authoritative service through validated Next.js routes.

## Technologies

Next.js App Router, React, TypeScript, WebMCP `document.modelContext`, Supabase
Postgres/RPC, Playwright, Vitest, pnpm, and Vercel.

## Evidence links

- **Live judging URL:** [https://ratiflow-webmcp.vercel.app](https://ratiflow-webmcp.vercel.app)
- **Stable alias:** [https://ratiflow-webmcp.vercel.app/decision-demo](https://ratiflow-webmcp.vercel.app/decision-demo)
- **Secondary shared note:** [https://ratiflow-webmcp.vercel.app/document](https://ratiflow-webmcp.vercel.app/document)
- **Public source repository:** pending owner-authorized release
- **Demo video (<3 minutes):** pending recording/upload
- **Live-session contract:** [live agent-session contract](../docs/contracts/live-agent-session-contract.md)
- **Evaluation contract:** [EVALS](../EVALS.md)

## Answer-to-evidence map

| Claim | Visible video beat | Required evidence |
| --- | --- | --- |
| Contextual WebMCP fit | Fresh two-tool discovery, join, dynamic expansion and leave/collapse | deployed native invocation plus registration tests |
| Better collaboration | human task, wait, fenced claim, attributed comment, blocking question and answer | hosted full-loop browser test plus native catch-up |
| Safe human authority | claim race, stale revision, Maya-only ratification | domain/protocol tests and ordinary-UI ratification flow |
| Honest boundary | “does not wake/start” copy and unavailable runner | production UI plus runner gate record |

Pending public links and the unavailable independent visual grade are not presented as
completed proof.
