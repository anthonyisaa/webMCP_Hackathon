# Ratiflow live agent-session contract

Version 1.0 · Frozen for implementation · 2026-08-31

This contract owns the human-agent collaboration loop on the decision workspace. It is
additive to [`capability-contract.md`](capability-contract.md): the existing decision
state machine, optimistic revision checks, dynamic decision tools, and human-only
ratification remain authoritative. TypeScript mirrors this contract in
[`src/contracts/index.ts`](../../src/contracts/index.ts).

The flagship surface is `/`; `/decision-demo` is an alias to the same product. The
shared document at `/document/[shareToken]` remains a separate secondary artifact.

## 1. Product promise and explicit limits

The supported loop is:

1. A browser agent discovers only `join_session` and `catch_up`.
2. `join_session` makes the agent a visible participant and establishes a renewable
   live lease. `catch_up` establishes an invoked, non-live page session.
3. A live agent repeatedly calls `wait_for_activity`. The call waits in page code and
   resolves with relevant server events, or successfully returns an empty event array
   on timeout.
4. A human can address the agent with an inbox task. Browser and auto callers use the
   same atomic claim operation before resolving addressed work.
5. Agent comments, decision mutations, questions, and task results carry the persistent
   agent identity and explicit `BROWSER_AGENT` or `AUTO_RUNNER` attribution.
6. A person answers agent questions and ratifies the decision in ordinary UI.

The page cannot wake an external browser agent, extend a client model turn, guarantee
model response latency, or run after the page closes. Auto pickup is an optional,
visible in-page agent under standing instructions, not a background service. No agent
tool ratifies, commits, finalizes, deletes, or impersonates a person.

## 2. Trust, session, and lease model

`POST /api/demo/launch` already issues distinct Maya, Jordan, and agent membership
tokens. The page keeps the agent token in `sessionStorage` beside the human launch
session and passes it only through private registry dependencies; no tool result issues
or returns a membership token. That existing opaque token authenticates the fixed agent
participant:

```text
id   = agent_ratiflow_demo
name = Ratiflow Agent
role = Decision analyst
```

The page generates a cryptographically random UUID `pageSessionId` on mount. It is
transport metadata, not tool input. Agent adapters supply this registry context out of
band:

```ts
type AgentCaller = "BROWSER_AGENT" | "AUTO_RUNNER";

interface AgentRegistryExecutionContext {
  caller: AgentCaller;
  pageSessionId: string;
  agentSessionToken: string;
  claimId?: string;
  signal?: AbortSignal;
}
```

This registry context is not a trusted HTTP DTO. Client JSON contains tool input only;
membership is the Authorization header, page session and optional claim are dedicated
headers, and caller is absent. Fixed `/webmcp` and `/auto` route families derive caller,
authenticate the member, validate/bind the page session, and only then construct an
internal `AuthenticatedAgentExecutionContext`. A JSON object shaped like either context
has no authority.

The server hashes the membership token, derives workspace and actor from it, and binds
`(workspace, agent, pageSessionId, caller)`. A request body cannot select workspace,
actor, role, origin, caller, claim owner, claim generation, or presence state.

- Browser live lease: 45 seconds. Successful live reads/waits renew it.
- Invoked-session lease: 2 minutes. Invoked reads/writes renew it but do not show
  `LIVE` presence.
- Task claim lease: 90 seconds. Only the current claim owner can renew it.
- A new browser `join_session` atomically revokes older browser page sessions for the
  same workspace agent. Revoked calls return `SESSION_CLOSED`.
- Successful `leave_session`, page reset, or member-session reset revokes the page
  session and rotates the page UUID. Missing `leave_session` is harmless because leases
  expire.
- An active browser live lease suppresses all auto-runner claims and writes. The server,
  not the UI, enforces this with `LIVE_SESSION_ACTIVE`. Browser join atomically fences
  and releases any active auto claims before its join event becomes visible.

Presence is derived, never directly set by a client:

```text
LIVE_AUTO  active AUTO_RUNNER task-claim lease and no active browser live lease
LIVE       active browser live lease
IDLE       no active live lease and last agent activity is less than 2 minutes old
AWAY       explicit leave or last agent activity is at least 2 minutes old
```

## 3. Activity cursor and event log

`ActivityCursor` is an opaque server-assigned UUID token that maps to a monotonic
database sequence inside one workspace. Clients compare cursors only for equality and
send them back; they must not parse, sort, increment, or substitute workspace revision.
Demo launch creates an initial workspace activity row, so even an otherwise empty
workspace has a valid cursor. Every collaboration event gets a cursor. Accepted decision
mutations also get one activity event in the same transaction as their existing
revision/provenance event.

```ts
type ActivityVia = "ORDINARY_UI" | "BROWSER_AGENT" | "AUTO_PICKUP" | "SYSTEM";
type ActivityEventType =
  | "WORKSPACE_MUTATED"
  | "TASK_CREATED"
  | "TASK_CLAIMED"
  | "TASK_WAITING_HUMAN"
  | "TASK_RESOLVED"
  | "TASK_CANCELLED"
  | "AGENT_JOINED"
  | "AGENT_LEFT"
  | "AGENT_COMMENTED"
  | "HUMAN_INPUT_REQUESTED"
  | "HUMAN_INPUT_ANSWERED"
  | "STANDING_INSTRUCTIONS_CHANGED";

interface ActivityEvent {
  id: string;
  cursor: ActivityCursor;
  createdAt: string;
  actor: ActorRef;
  actorType: ActorType;
  via: ActivityVia;
  type: ActivityEventType;
  target: PageSelection;
  summary: string;
  workspaceRevision: number | null;
  taskId?: string;
  questionId?: string;
}
```

Events are append-only and ordered by cursor. `summary` is bounded to 600 characters
and is untrusted human/agent-authored data. Collaboration-only activity does not advance
workspace revision. The current demo retains all activity for its session lifetime. If
retention is later bounded, an unknown old cursor must return `CURSOR_EXPIRED` with a
new reset cursor; it must never silently skip history.

Catch-up rules:

- With `sinceCursor`, scan the next at most 50 source events in chronological order and
  return the relevant subset. `cursor` is exactly the last source-event boundary scanned,
  never a later high-water mark. `observedHighWater` is returned separately and
  `hasMore` is true when `cursor !== observedHighWater`; no relevant event can be skipped
  between pages.
- Without `sinceCursor`, return at most the latest 20 relevant events, ordered oldest to
  newest, plus the current inbox and questions.
- When no source event exists after the supplied cursor, `cursor` and
  `observedHighWater` are equal. When a scanned page contains only irrelevant events,
  `cursor` still advances to that page boundary. This prevents one irrelevant event from
  waking the same wait forever without skipping a later relevant event.
- Relevant events include addressed inbox changes, comments/questions on the decision
  or selected target, option/evidence/challenge/phase changes, standing-instruction
  changes, and agent-session replacement/closure. Heartbeats are never events.
- A supplied cursor must resolve to this workspace and retained history. A foreign,
  unknown, deleted, or otherwise unusable cursor returns the dedicated
  `CURSOR_EXPIRED` result with required `resetCursor`. A valid current cursor is never
  treated as future; UUID tokens avoid accepting guessed numeric positions.

## 4. Collaboration view

`WorkspaceView` gains one required `collaboration` field:

```ts
type AgentPresenceState = "LIVE" | "LIVE_AUTO" | "IDLE" | "AWAY";
type AgentTaskKind = "MENTION" | "TASK";
type AgentTaskStatus = "OPEN" | "CLAIMED" | "WAITING_HUMAN" | "DONE" | "CANCELLED";
type StandingInstructionScope = "MENTIONS" | "TASKS";

interface AgentParticipantView {
  actor: ActorRef;
  state: AgentPresenceState;
  lastSeenAt: string | null;
  activeVia: "BROWSER_AGENT" | "AUTO_PICKUP" | null;
}

interface AgentTaskClaimView {
  claimId?: string;
  via: "BROWSER_AGENT" | "AUTO_PICKUP";
  expiresAt: string;
  ownedByCurrentSession: boolean;
}

interface AgentTaskView {
  id: string;
  kind: AgentTaskKind;
  body: string;
  target: PageSelection;
  status: AgentTaskStatus;
  createdBy: ActorRef;
  assignedAgent: ActorRef;
  claim: AgentTaskClaimView | null;
  resultSummary?: string;
  resultLink?: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentCommentView {
  id: string;
  target: PageSelection;
  body: string;
  replyTo?: string;
  actor: ActorRef;
  via: ActivityVia;
  taskId?: string;
  createdAt: string;
}

interface HumanInputRequestView {
  id: string;
  target: PageSelection;
  question: string;
  status: "OPEN" | "ANSWERED";
  askedBy: ActorRef;
  askedVia: "BROWSER_AGENT" | "AUTO_PICKUP";
  taskId?: string;
  answer?: string;
  answeredBy?: ActorRef;
  askedAt: string;
  answeredAt?: string;
}

interface StandingInstructionsView {
  autoPickup: boolean;
  scopes: StandingInstructionScope[];
  maxActionsPerHour: number;
}

interface CollaborationView {
  cursor: ActivityCursor;
  agent: AgentParticipantView;
  standingInstructions: StandingInstructionsView;
  inbox: AgentTaskView[];
  comments: AgentCommentView[];
  questions: HumanInputRequestView[];
  recentActivity: ActivityEvent[];
}
```

Inbox order is status priority (`OPEN`, `CLAIMED`, `WAITING_HUMAN`, `DONE`,
`CANCELLED`), then creation time and ID. Views contain at most 50 inbox items, 100
comments, 50 questions, and 50 recent events. The authoritative service view supplies
`claimId` only to the trusted adapter for the current owner. `AgentToolRegistry` retains
that generation and strips every `claimId` from model-visible results; model input can
never provide it. Every other caller sees neither another session's ID nor its claim
token. The owner-facing projection may expose only `ownedByCurrentSession: true`.

Default standing instructions are:

```json
{ "autoPickup": false, "scopes": ["MENTIONS", "TASKS"], "maxActionsPerHour": 6 }
```

Only ordinary human UI can change them. `maxActionsPerHour` is an integer from 1 to 20.

## 5. One tool registry

Decision tool names stay unchanged. Coordination names are exactly:

```ts
const AGENT_COORDINATION_TOOL_NAMES = [
  "join_session",
  "wait_for_activity",
  "catch_up",
  "leave_session",
  "get_state_brief",
  "get_thread",
  "get_inbox",
  "claim_agent_task",
  "resolve_task",
  "post_comment",
  "request_human_input",
] as const;
```

The page creates one caller-neutral registry instance. It owns each definition, schema,
availability rule, validation step, and execution handler exactly once:

```ts
interface AgentToolDefinition {
  name: RegisteredToolName;
  description: string;
  inputSchema: JsonObjectSchema;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
}

interface AgentRegistryProjection {
  caller: AgentCaller;
  engagementMode: AgentEngagementMode;
  decisionCapabilities: CompiledCapabilities;
}

interface AgentToolRegistryPort {
  availableDefinitions(projection: AgentRegistryProjection): readonly AgentToolDefinition[];
  execute(
    name: RegisteredToolName,
    input: unknown,
    context: AgentRegistryExecutionContext,
    projection: AgentRegistryProjection,
  ): Promise<unknown>;
}
```

Native WebMCP and the page runner are thin adapters. The native adapter supplies
`BROWSER_AGENT`, wraps the raw JSON result as MCP text plus identical
`structuredContent`, and registers on `document.modelContext` with the observed
`navigator.modelContext` compatibility fallback. The runner supplies `AUTO_RUNNER` and
receives the raw result. The server-side LLM route is a stateless planner only: it may
return a proposed `{ toolName, input }`, but cannot import, call, or proxy registry
handlers.

Browser-agent exposure modes are exact:

| Mode | Registered coordination surface |
|---|---|
| `FRESH` | `join_session`, `catch_up` |
| `INVOKED` | `join_session`, `catch_up`, all three compact reads, and all four coordination writes |
| `LIVE` | all session, compact-read, and coordination-write tools |

`INVOKED` and `LIVE` additionally expose the decision tools produced by the frozen
capability compiler. `wait_for_activity` and `leave_session` exist only in `LIVE`.
Successful catch-up moves the page registry from `FRESH` to `INVOKED`; successful join
moves it to `LIVE`; successful leave rotates page session and returns it to `FRESH`.
Lease expiry contracts `LIVE` to `INVOKED`.

Engagement is a browser-projection state, not mutable global registry state. An
authorized runner uses its own `AUTO_RUNNER` projection: compact reads, coordination
writes, and current decision tools, with all four session tools excluded. Runner calls
cannot expand or contract native browser discovery; browser catch-up/join cannot grant a
runner authority. Both projections select from the same immutable definitions and invoke
the same handler functions.

Stable session registrations use a session key independent of selection/context epoch.
Target-scoped decision tools still reconcile on capability signature and captured
selection. A selection change must not abort an in-flight `wait_for_activity`.

## 6. Exact tool inputs and outputs

Every input schema is an object with `additionalProperties: false`. IDs are 1–80
characters. `requestId`, cursor tokens, and claim IDs are UUIDs. Strings are trimmed.

| Tool | Exact input | Annotation |
|---|---|---|
| `join_session` | `{}` | `readOnlyHint: false`, `untrustedContentHint: true` |
| `wait_for_activity` | `{ cursor, timeoutSeconds? }` | `true`, `true` |
| `catch_up` | `{ sinceCursor? }` | `true`, `true` |
| `leave_session` | `{}` | `false`, `false` |
| `get_state_brief` | `{}` | `true`, `true` |
| `get_thread` | `{ target? }` | `true`, `true` |
| `get_inbox` | `{}` | `true`, `true` |
| `claim_agent_task` | `{ taskId, requestId }` | `false`, `true` |
| `resolve_task` | `{ taskId, requestId, outcome, resultLink? }` | `false`, `true` |
| `post_comment` | `{ target, body, replyTo?, taskId?, requestId }` | `false`, `true` |
| `request_human_input` | `{ question, target, taskId?, requestId }` | `false`, `true` |

`target` is the exact `PageSelection` union. Optional `get_thread.target` defaults to the
captured page selection. Text bounds: comment 1–1,200; question/outcome 1–600;
`resultLink` 1–240 and must be a same-origin path beginning `/`; `replyTo` and `taskId`
must identify existing same-workspace rows.

`timeoutSeconds` defaults to 20 and is clamped to integer 1–30. Timeout is a successful
result with `events: []`. Invocation abort rejects with `AbortError`; cancellation is
not serialized as a domain error.

Coordination callbacks return one family:

```ts
type CoordinationErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "SESSION_CLOSED"
  | "LIVE_SESSION_ACTIVE"
  | "TASK_ALREADY_CLAIMED"
  | "CLAIM_LOST"
  | "ACTION_BUDGET_EXCEEDED"
  | "CURSOR_EXPIRED"
  | "REQUEST_REPLAY_MISMATCH"
  | "CONFLICT"
  | "INTERNAL_ERROR";

type CoordinationResult<T> =
  | { ok: true; data: T; cursor: ActivityCursor }
  | {
      ok: false;
      code: "CURSOR_EXPIRED";
      message: string;
      retryable: true;
      resetCursor: ActivityCursor;
      nextAction: string;
    }
  | {
      ok: false;
      code: Exclude<CoordinationErrorCode, "CURSOR_EXPIRED">;
      message: string;
      retryable: boolean;
      cursor?: ActivityCursor;
      nextAction?: string;
    };
```

Success data is exact:

- `join_session` → `{ identity, presence, stateBrief, inbox, sessionOpen: true }`
- `wait_for_activity` / `catch_up` →
  `{ events, inbox, questions, hasMore, observedHighWater, sessionOpen }`
- `leave_session` → `{ identity, presence, sessionOpen: false }`
- `get_state_brief` → `{ brief }`
- `get_thread` → `{ target, comments, questions }`
- `get_inbox` → `{ inbox }`
- `claim_agent_task` / `resolve_task` → `{ task }`
- `post_comment` → `{ comment }`
- `request_human_input` → `{ question, task? }`

`StateBrief` contains decision ID/question/state, current recommendation, option titles,
blocking challenges, open questions, current participants, current selection, workspace
revision, and activity cursor. It does not duplicate full evidence or provenance.

## 7. Wait and realtime semantics

The page opens one authorized SSE connection immediately after demo launch. Notices are
invalidation only:

```ts
interface RealtimeWorkspaceNotice {
  eventId: string;
  activityCursor: ActivityCursor;
  workspaceRevision: number | null;
}
```

Supabase may poll its authorized notice RPC at no more than 750 ms between reads; it
must not expose tables through the Data API. UI and tools refetch authoritative data.

The wait handler uses a page-local `ActivitySignalHub` shared by the SSE adapter:

1. Call catch-up at the supplied cursor.
2. Return immediately if relevant events or addressed inbox changes exist. If
   `hasMore`, continue bounded catch-up pages before waiting.
3. Otherwise wait until the hub observes a later cursor, the deadline expires, or the
   execution signal aborts.
4. After a wake, call catch-up again. If only irrelevant events occurred, advance through
   returned page-boundary cursors until `observedHighWater`, then continue until the
   original deadline.

The hub is subscribed before tool registration and remembers the latest cursor, so an
event between steps 1 and 3 cannot be lost. SSE reconnect uses the last observed cursor
and a 1.5-second maximum retry. A timeout returns normally; teardown aborts all waiters.

The latency acceptance measurement starts when the teammate mutation endpoint accepts
and commits the write and ends when the waiting tool receives its catch-up result. The
local and hosted p95 target is under 2 seconds. Model inference and subsequent write
confirmation are measured separately.

## 8. Inbox, claims, questions, and exactly-once effects

Ordinary UI can create a task/mention with
`{ kind, body, target, requestId }`, answer a question with
`{ questionId, answer, requestId }`, and cancel an unresolved task. It cannot choose the
agent actor for authored events.

Claiming is an atomic server transaction with a fencing generation:

- `OPEN`, unclaimed, or expired tasks may be claimed.
- The winner becomes `CLAIMED` with owner `(agent, pageSessionId, caller)`, a fresh opaque
  `claimId`, and a 90-second lease. A competing caller receives
  `TASK_ALREADY_CLAIMED` and performs no inference. Reacquisition always mints a new
  claim ID, even for the same tuple, fencing every older in-flight request.
- Replaying the same request returns the same result. Reusing a request ID with different
  canonical input returns `REQUEST_REPLAY_MISMATCH`.
- A current owner may reissue claim with its current claim ID and a new request ID to
  renew without appending a second `TASK_CLAIMED` event. The claim ID is adapter context,
  not model input.
- A `taskId` on comment/question/resolve requires a live, unexpired claim owned by that
  execution context. Claim loss returns `CLAIM_LOST` before any visible effect.
- Every task-linked write rechecks the exact claim ID under the task row lock immediately
  before commit. An expired or superseded generation returns `CLAIM_LOST`, even if the
  same page/caller now owns a newer claim.
- Requesting human input for a claimed task atomically creates the question and moves
  the task to `WAITING_HUMAN` and clears the claim. Waiting tasks cannot be claimed or
  renewed. A human answer serializes on the same task row and moves it to `OPEN`; the
  browser or runner must win a fresh claim generation before resuming.
- Resolving atomically writes one result, one activity event, and status `DONE`.

All coordination writes use the same `(workspace, requestId)` idempotency guarantee as
decision mutations. An accepted visible effect and its activity event commit together;
neither may exist alone.

## 9. Auto pickup boundary

Auto pickup is admitted only after the browser-agent loop passes end to end. It runs
only while the page is mounted and `document.visibilityState === "visible"`, standing
instructions are on, the task kind is in scope, no browser live lease exists, and the
server authorizes another action within the hourly limit.

The initial AUTO_RUNNER claim transaction atomically checks standing settings and scope,
checks for a browser live lease, reserves the first hourly action, creates the 90-second
claim generation, and thereby supplies the `LIVE_AUTO` presence lease. Every subsequent
auto write requires that claim ID, rechecks browser-live suppression, and atomically
consumes one action from the same server budget. A browser join fences/releases the
claim; an old planner response then fails with `CLAIM_LOST`. A read-only
`authorizeAutoRunner` response is advisory and never reserves authority.

The runner debounces inbox events by two seconds, claims before inference, handles one
task at a time, permits at most six model/tool steps per task, and aborts on hide,
unmount, setting change, claim loss, or browser join. The planner receives a bounded
state brief, task, recent thread, and only the currently registered non-session,
non-human-only definitions. It treats all workspace text as untrusted data. It may not
propose `join_session`, `wait_for_activity`, `catch_up`, `leave_session`, or any absent
tool. Every proposed call is revalidated and executed by the page registry.

Gateway authentication, model ID, rate limit, and spend cap are deployment
configuration. A missing/402/429/unavailable planner leaves the task open, releases it
at lease expiry, sets presence to `IDLE`, and shows a visible unavailable state; it does
not simulate a result.

## 10. UI and conformance gates

The ordinary UI must expose the agent as a participant; `LIVE`, `LIVE_AUTO`, `IDLE`, or
`AWAY` plus last seen; waiting task count and inbox; task composer on decision/options;
attributed comments; inline human-input cards; standing-instruction controls; and the
exact names currently registered by the registry. Human UI remains usable without
WebMCP or the planner.

Conformance requires:

1. Cursor and workspace revision never substitute for one another.
2. Only the fixed route/adapter supplies caller; model input cannot supply trust fields.
3. A live browser lease blocks auto work server-side.
4. Browser-vs-auto and auto-vs-auto races produce one claim winner and no duplicate
   visible result.
5. Selection changes do not cancel waits; leave, reset, unmount, or invocation abort do.
6. Every accepted agent effect has identity and caller attribution in activity.
7. Tool availability shown in UI equals registry definitions for the same instant.
8. The planner route cannot execute tools.
9. Ratification remains a Maya-only ordinary-UI transaction.
10. Native measurements record namespace, return shape, confirmations, wait iteration
    count, timeout, cancellation, background behavior, and a real teammate wake before
    any production live-loop claim is marked passed.

Caller mapping is exact: registry/server caller `BROWSER_AGENT` persists activity
`via: BROWSER_AGENT` and decision provenance `origin: WEBMCP`; caller `AUTO_RUNNER`
persists activity `via: AUTO_PICKUP` and decision provenance `origin: AUTO_PICKUP`.

## 11. Feedback disposition

| Feedback request | Contract disposition |
|---|---|
| Live session | Implemented as renewable browser lease + read-only long wait |
| Catch-up | Implemented with an independent opaque activity cursor |
| Autonomous pickup | Measurement-gated, opt-in visible page runner |
| Single tool surface | Implemented through one caller-neutral registry |
| Agent identity/presence | Implemented with TTL-derived participant state |
| Inbox/tasks/mentions | Implemented with atomic expiring claims |
| Agent questions | Implemented as persisted state plus ordinary-UI answer |
| Phase-gated tools | Existing capability compiler retained and shown from registry |
| `finalize_decision` | Deliberately rejected; human ratification remains exclusive |
| `destructiveHint` | Deliberately rejected; not a normative current annotation |
| Guaranteed 1–2s agent reaction | Measurement split: transport target <2s; model latency not guaranteed |
| Background/headless agent | Deliberately rejected by product and platform boundary |
| Native loop behavior | Measurement required on the deployed supported surface |
