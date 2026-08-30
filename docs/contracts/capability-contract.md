# Ratiflow capability and wire contract

Version 1.0 · Frozen for product implementation · 2026-08-30

This document owns the names and shapes shared by the domain service, capability
compiler, WebMCP bridge, UI, and evals. TypeScript mirrors it in
[`src/contracts/index.ts`](../../src/contracts/index.ts). A stream may add internal
fields, but no public field, enum value, tool, or error may drift from this contract
without a coordinated contract revision.

## 1. Canonical values

```text
DecisionState = OPTIONS | CONTESTED | READY | REVIEW | COMMITTED
SelectionKind = DECISION | OPTION | FOLLOWUP
ActorType = HUMAN | AGENT | SYSTEM
EventOrigin = ORDINARY_UI | WEBMCP | SYNTHETIC_DEMO | SYSTEM
ReviewStatus = NOT_APPLICABLE | PROPOSED | EDITED | RATIFIED | REJECTED
```

Entity IDs are opaque non-empty strings of at most 80 characters. The hero fixture uses
the fixed IDs in [`hero-scenario.md`](hero-scenario.md). A page selection is exactly:

```ts
type PageSelection =
  | { kind: "DECISION"; id: string }
  | { kind: "OPTION"; id: string }
  | { kind: "FOLLOWUP"; id: string };
```

`workspaceRevision` is a server-owned non-negative integer advanced once by every
accepted domain mutation. `contextEpoch` is a page-owned non-negative integer advanced
only when page-local authority changes: member session or selection kind/ID. Persisted
state and decision-state changes are protected by `workspaceRevision`; they do not also
advance the epoch.

## 2. Compiler contract

```ts
compileCapabilities(input: {
  state: DecisionState;
  selection: PageSelection;
  memberRole: "PRODUCT_LEAD" | "ENGINEERING_LEAD";
  workspaceRevision: number;
  contextEpoch: number;
  readiness: ReadinessFacts;
}): CompiledCapabilities
```

`CompiledCapabilities` is the only value consumed by both the Capability Field and the
WebMCP bridge:

```ts
interface CompiledCapabilities {
  state: DecisionState;
  workspaceRevision: number;
  contextEpoch: number;
  selection: PageSelection;
  availableTools: ToolName[];
  unavailableActions: Array<{
    action: "prepare_decision" | "ratify_decision";
    unmetPredicates: string[];
  }>;
  signature: string;
}
```

`availableTools` is sorted in canonical catalog order. The catalog order is the
`TOOL_NAMES` tuple in `src/contracts/index.ts`; no second ordering rule exists.
`signature` is a deterministic
hash or stable serialization of state, selection, role, and tool names; it is not a
security token. Separately, the bridge reconciles on a non-secret registration-context
key made from member-session instance ID plus `contextEpoch`. Golden eval fixtures are
authored independently and must not import the compiler.

### State matrix

| State | Base tools in catalog order |
|---|---|
| `OPTIONS` | `inspect_decision`, `recommend_option`, `add_evidence`, `why_not` |
| `CONTESTED` | `inspect_decision`, `recommend_option`, `add_evidence`, `compare_options`, `why_not` |
| `READY` | `inspect_decision`, `recommend_option`, `add_evidence`, `compare_options`, `prepare_decision`, `why_not` |
| `REVIEW` | `inspect_decision`, `trace_decision`, `why_not` |
| `COMMITTED` | `inspect_decision`, `trace_decision`, `why_not` |

Selection augments the base set:

- `OPTION` in `OPTIONS`, `CONTESTED`, or `READY` adds
  `inspect_selected_option` and `challenge_option` in canonical catalog order. Each
  callback captures the selected option and current epoch.
- `FOLLOWUP` with ID `fu_customer_launch_brief` in `COMMITTED` adds
  `inspect_followup` after `trace_decision`.
- Every other state/selection combination adds nothing.

### READY predicates

The compiler and reducer use these exact predicates:

1. at least two active options;
2. current launch-capacity evidence exists;
3. Northstar deadline evidence exists;
4. the selected option's total engineer-days do not exceed current capacity;
5. zero unresolved blocking challenges against the selected option.

`ReadinessFacts.selectedOptionId` is the domain recommendation, independent of the
page-local `selection`. It supplies `{optionId}` in the blocking-challenge reason even
when the user has selected the decision root or follow-up rather than an option card.

`why_not({ action: "prepare_decision" })` returns the failed predicates verbatim. It does
not implement a second rules table.

Exact reason templates are:

```text
at least two active options are required
current launch-capacity evidence is required
Northstar deadline evidence is required
selected option requires {required} engineer-days but launch capacity is {available}
{count} unresolved blocking challenge(s) against {optionId}
decision already has a prepared review card
decision is already committed
ratification is never available through WebMCP; Maya Chen must ratify in the ordinary UI
ratification requires a prepared decision in REVIEW
```

For `prepare_decision`, OPTIONS/CONTESTED return the failed READY predicates in the
numbered order; REVIEW and COMMITTED return their lifecycle reason. For
`ratify_decision`, always return the human-only reason and, outside REVIEW, also the
REVIEW prerequisite. These are the only legal `why_not.action` values.

## 3. Stable tool catalog

All schemas use JSON Schema with `type: "object"` and
`additionalProperties: false`. Omitted optional fields are truly optional; `null` is not
accepted unless stated. Workspace ID, member/actor, origin, and selected target are never
model inputs.

### Read inputs

| Tool | Input | Annotations | Captured context |
|---|---|---|---|
| `inspect_decision` | `{}` | `readOnlyHint: true`, `untrustedContentHint: true` | workspace + decision |
| `inspect_selected_option` | `{}` | same | selected option + epoch |
| `compare_options` | `{ optionIds?: string[2..3] }` | same | workspace + epoch |
| `trace_decision` | `{}` | same | decision + provenance |
| `inspect_followup` | `{}` | same | selected follow-up + epoch |
| `why_not` | `{ action: "prepare_decision" | "ratify_decision" }` | `readOnlyHint: true`, `untrustedContentHint: false` | compiled predicates + epoch |

When `compare_options.optionIds` is omitted it compares all three hero options.
`optionIds` is unique, contains two or three entity IDs, and has no additional items.

### Shared mutation envelope

Every write tool input is exactly:

```ts
interface MutationEnvelope<TPayload> {
  expectedWorkspaceRevision: number;
  contextEpoch: number;
  requestId: string;
  rationale: string;
  payload: TPayload;
}
```

Bounds: revision and epoch are integers ≥ 0; `requestId` is a UUID string of at most 36
characters; `rationale` is 1–600 trimmed characters. Every payload has
`additionalProperties: false`.

| Tool | Payload | Captured context |
|---|---|---|
| `recommend_option` | `{ optionId: EntityId }` | workspace + decision + epoch |
| `add_evidence` | `{ optionId: EntityId, kind: EvidenceKind, stance: EvidenceStance, title: string[1..120], detail: string[1..1200], sourceLabel: string[1..120], metrics?: EvidenceMetrics }` | workspace + epoch |
| `challenge_option` | `{ summary: string[1..600], severity: "BLOCKING" | "ADVISORY", requiredEvidenceKind?: EvidenceKind }` | selected option + epoch |
| `prepare_decision` | `{ optionId: EntityId, recommendation: string[1..600], risks: string[0..5] each 1..240, customerMessageDraft: string[1..800] }` | workspace + decision + epoch |

```text
EvidenceKind = CUSTOMER_DEADLINE | ENGINEERING_ESTIMATE | DELIVERY_RISK
EvidenceStance = SUPPORTS | CHALLENGES | CONTEXT
EvidenceMetrics = {
  engineerDays?: integer 0..90,
  annualValueUsd?: integer 0..10000000,
  date?: YYYY-MM-DD
}
```

`add_evidence` is registered in both `READY` and `CONTESTED`. This is deliberate: the
revision-7 hero call reaches the still-valid callback after revision 8 and the server can
return the collaborator diff. A call to an actually removed registration may be rejected
by the native client before page code; no app-defined result is promised for that path.

## 4. Result family

Every callback that reaches page code resolves to a JSON-serializable object. Domain and
validation failures are values, not thrown errors. The bridge may throw only for client
cancellation, document teardown, or an unexpected implementation fault.

```ts
interface CapabilitySummary {
  state: DecisionState;
  workspaceRevision: number;
  contextEpoch: number;
  selection: PageSelection;
  availableTools: ToolName[];
  unavailableActions: Array<{
    action: "prepare_decision" | "ratify_decision";
    unmetPredicates: string[];
  }>;
}

interface SuccessResult<T> {
  ok: true;
  data: T;
  currentWorkspaceRevision: number;
  contextEpoch: number;
  currentCapabilities: CapabilitySummary;
}

interface ErrorResult {
  ok: false;
  code: ErrorCode;
  message: string;
  retryable: boolean;
  currentWorkspaceRevision: number;
  contextEpoch: number;
  currentCapabilities: CapabilitySummary;
  expectedWorkspaceRevision?: number;
  actualWorkspaceRevision?: number;
  expectedContextEpoch?: number;
  actualContextEpoch?: number;
  changes?: CollaboratorChange[];
  nextAction?: string;
}
```

`ErrorCode` is exactly:

```text
INVALID_INPUT
UNAUTHORIZED
NOT_FOUND
NOT_AVAILABLE_IN_STATE
STALE_PAGE_CONTEXT
STALE_WORK_STATE
REQUEST_REPLAY_MISMATCH
CONFLICT
INTERNAL_ERROR
```

`NOT_AVAILABLE_IN_STATE` applies only when a call reaches an extant callback and current
state no longer permits the action. `STALE_PAGE_CONTEXT` means the selected target or
registered callback epoch changed. `STALE_WORK_STATE` means the server revision advanced.
The callback checks page context first; the domain transaction then checks revision.

`CollaboratorChange` is:

```ts
interface CollaboratorChange {
  eventId: string;
  actor: { id: string; name: string; role: string };
  origin: EventOrigin;
  reason: string;
  resultingRevision: number;
  changes: Array<{
    field: string;
    before: string | number | boolean | null;
    after: string | number | boolean | null;
  }>;
}
```

For the hero stale response, `changes` contains one collaborator event at revision 8
with the three field changes frozen in `hero-scenario.md`. `nextAction` is exactly:

```text
Call inspect_decision, refresh WebMCP tools, then retry against workspace revision 8.
```

### Success data by tool

The generic `data` field is not open-ended. It is mapped exactly:

| Tool | `data` shape |
|---|---|
| `inspect_decision` | `{ workspace: WorkspaceView }` |
| `inspect_selected_option` | `{ option: OptionView, evidence: EvidenceView[], challenges: ChallengeView[] }` |
| `compare_options` | `{ comparisons: OptionComparison[], currentRecommendationOptionId: EntityId }` |
| `trace_decision` | `{ events: ProvenanceEvent[], preparedDecision: PreparedDecisionView | null }` |
| `inspect_followup` | `{ followup: FollowupView }` |
| `why_not` | `{ action: WhyNotAction, available: boolean, unmetPredicates: string[] }` |
| `recommend_option`, `add_evidence`, `challenge_option`, `prepare_decision` | `MutationReceipt` |

```ts
interface OptionComparison {
  optionId: string;
  launchEngineerDays: number;
  postLaunchEngineerDays: number;
  fitsCurrentLaunchCapacity: boolean;
  meetsNorthstarDeadline: boolean;
  scheduleBufferDays: number;
  tradeoffs: string[];
}
```

The referenced view and receipt shapes are exactly those in `src/contracts/index.ts`.
Human- or agent-authored strings remain data and retain the untrusted-content annotation.

## 5. Registration lifecycle

1. The top-level client component feature-detects `document.modelContext`; a separately
   labeled compatibility branch may observe `navigator.modelContext`.
2. It compiles once from the authoritative snapshot and current page selection.
3. It renders the Capability Field and registers the exact same compiled value; neither
   consumer reconstructs a tool list.
4. Each tool registration gets its own `AbortController`. Callbacks capture member
   session, workspace/decision, and selection target where applicable; a live ref exposes
   the latest workspace revision and state.
5. Reconcile on a compiled-signature change **or** a registration-context-key change.
   Diff by tool name: abort removed tools, retain unchanged registrations, and register
   additions. Re-register a retained name only
   when its captured member or selected target changed, which also advances
   `contextEpoch`. Surface the exact added/removed names. Do not mutate schemas in place.
6. Callback entry compares its captured epoch with current page epoch. It then validates
   JSON input and calls the domain service with server-derived member and origin.
7. If the client supplies an execution signal, propagate it through fetch/domain work.
   An abort rejects with `AbortError`; it is a client lifecycle outcome, not an
   `ErrorResult`. If the preview client omits callback options, continue safely without a
   signal; never destructure an assumed argument.

`toolchange`, `getTools`, and `executeTool` may be used for diagnostics where exposed,
but product correctness does not depend on them. Realtime events cause an authoritative
refetch; ordering of Realtime and WebMCP lifecycle events is never a correctness input.

## 6. Server authority and idempotency

- Signed membership determines workspace and actor. API clients cannot submit
  `workspaceId`, actor, role, or origin as trusted mutation fields.
- The WebMCP route assigns origin `WEBMCP`; human UI routes assign `ORDINARY_UI`; the
  labeled deterministic fallback assigns `SYNTHETIC_DEMO` and Jordan's fixed demo member.
- Jordan's capacity control is the internal, non-WebMCP action
  `SET_LAUNCH_CAPACITY`. Its input is
  `{ expectedWorkspaceRevision, requestId, payload: { launchCapacityEngineerDays,
  reason } }`; capacity is an integer 0–90 and reason is 1–240 characters. The golden
  action is 14 and `Four-day incident rotation`. It emits the three revision-8 field
  changes in `hero-scenario.md`.
- A Postgres transaction compares `expectedWorkspaceRevision`, validates current state
  and entity status, appends one typed event, advances revision once, and returns the
  authoritative snapshot.
- `(workspaceId, requestId)` is unique. Repeating the same canonical tool + payload +
  rationale returns the original result. Reusing a request ID with different content
  returns `REQUEST_REPLAY_MISMATCH` and never mutates.
- The stale diff is built from persisted events after the expected revision, not from the
  client's old snapshot.
- Ratification is absent from this catalog and from the WebMCP mutation route. The human
  endpoint requires Maya's session, state `REVIEW`, and current revision, then records
  `RATIFIED` and applies the downstream transition atomically. Review-card wording edits
  are local form state folded into that single ratification request; they do not create a
  separate workspace revision.

## 7. Conformance invariants

1. No catalog tool can directly create `COMMITTED` state.
2. The visible and registered tool-name arrays are equal for the same compiled object.
3. Every catalog name has one stable schema for the life of the document.
4. No mutation succeeds with a stale revision, stale page epoch, wrong workspace member,
   invalid state, or replay-mismatched request ID.
5. Human/agent-authored text is returned as data with untrusted-content annotation and
   never interpolated into tool instructions.
6. The complete hero flow uses only catalog tools plus ordinary human UI actions.
