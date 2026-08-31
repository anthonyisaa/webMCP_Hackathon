# Ratiflow shared document contract

Version 1.2 · Frozen for the annotation queue correction · 2026-08-31

## Product promise and routes

`/` creates a blank note in the background and replaces the address with
`/document/[shareToken]`. The canonical route opens the same account-free note for
another person or a WebMCP-capable browser. Possession of the high-entropy URL grants
temporary access; the UI must not describe the note as private authenticated storage.

The browser stores its opaque human/paired-agent session bundle in `sessionStorage`
under a versioned key scoped to the share token. A valid bundle is reused on reload; a
missing or expired bundle rejoins through the share token as a new anonymous member.
Identity does not follow a person across that boundary. Invalid or expired links offer
**New note**. Starting a new note never deletes the old one.

`/decision-demo` retains the frozen Northstar decision proof and its separate ten-tool
catalog. Document and decision tools must never be registered at the same time.

The document is visually pageless: one continuous neutral surface, a compact top bar,
a centered writing column, and a persistent 340px annotation rail on desktop. The rail
becomes an accessible drawer below 740px. P0 still excludes accounts, folders,
attachments, rich text, tracked changes, line-rendered comment pins, offline sync,
export, and CRDT or character-by-character co-editing.

## Authoritative document and collaboration state

```ts
type DocumentStage =
  | "BRAINSTORMING"
  | "RESEARCHING"
  | "REFINE"
  | "READY_TO_SHIP";

interface SharedDocument {
  id: string;
  title: string;
  body: string;
  stage: DocumentStage;
  revision: number;
  updatedAt: string;
  lastEditor: null | {
    memberId: string;
    displayName: string;
    actorType: "HUMAN" | "AGENT";
    origin: "ORDINARY_UI" | "WEBMCP";
  };
}
```

- A clean launch creates empty title/body, stage `BRAINSTORMING`, and revision `0`.
- Title is at most 160 Unicode code points and body at most 50,000.
- Accepted content or stage changes increment revision exactly once. Presence and
  annotation-only changes do not increment it.
- Client snapshot reconciliation is therefore monotonic. For one document, a higher
  document revision is authoritative and a lower revision cannot regress content or
  queue state. At an equal revision, snapshots are unioned by annotation ID: newly
  observed rows appear, every terminal lifecycle beats `PENDING`, terminal rows never
  regress, and a pending row absent from a delayed response remains pending. The
  reconciled surface retains the latest 20 resolved rows by `resolvedAt, annotationId`
  and returns the selected annotations in `createdAt, annotationId` order. Presence is
  likewise merged per member using the newer `lastSeenAt`; a member absent from a
  delayed response remains until the ordinary presence expiry window.
- Human autosave uses `expectedRevision`. A dirty client never silently adopts a newer
  remote version; it offers **Use latest** or explicit **Keep mine** overwrite.
- Only an ordinary human session may change stage. No WebMCP or agent-session input
  accepts stage, actor, origin, document ID, member ID, or an arbitrary target range.
- The existing durable single-step Undo remains available only for the latest applied
  agent edit and uses compare-and-swap. Undo is treated as a human content edit for
  annotation rebasing.

Presence remains advisory: member, active field, typing state, selection range,
observed revision, and last heartbeat. It may lag by several seconds and must not be
described as character-level live merging.

## Persistent annotation queue

```ts
type DocumentAnnotationStatus =
  | "PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "STALE";

type DocumentAnnotationKind = "HUMAN_REQUEST" | "STAGE_PREPARATION";
type DocumentAnnotationSource =
  | "ANNOTATION_RAIL"
  | "KEYBOARD"
  | "STAGE_TRANSITION";

interface DocumentAnnotationBase {
  annotationId: string;
  label: string;
  instruction: string;
  stageAtCreation: DocumentStage;
  targetField: "TITLE" | "BODY";
  targetKind: "SELECTION" | "CARET" | "DOCUMENT";
  rangeStart: number;
  rangeEnd: number;
  selectedText: string;
  createdRevision: number;
  anchorRevision: number;
  createdBy: {
    memberId: string;
    displayName: string;
  };
  createdAt: string;
}

type DocumentAnnotation = DocumentAnnotationBase & (
  | {
      kind: "HUMAN_REQUEST";
      presetId: HumanAnnotationPresetId;
      source: "ANNOTATION_RAIL" | "KEYBOARD";
      transition: null;
    }
  | {
      kind: "STAGE_PREPARATION";
      presetId: DocumentStagePreparationPresetId;
      source: "STAGE_TRANSITION";
      transition: { fromStage: DocumentStage; toStage: Exclude<DocumentStage, "BRAINSTORMING"> };
    }
) & (
  | { status: "PENDING"; resolvedAt?: never; resolvedRevision?: never }
  | {
      status: "COMPLETED" | "CANCELLED" | "STALE";
      resolvedAt: string;
      resolvedRevision: number;
    }
);

interface DocumentSurface {
  document: SharedDocument;
  presence: DocumentPresence[];
  annotations: DocumentAnnotation[];
  undoAgentEdit: UndoAgentEdit | null;
}
```

Ranges are zero-based, end-exclusive Unicode code-point offsets. `createdRevision` and
`stageAtCreation` never change. `anchorRevision`, range, and `selectedText` may change
only through the deterministic rebase rules below. The checked façade is a discriminated
union: human requests alone accept human preset/custom IDs and rail/keyboard sources;
stage preparation alone accepts a preparation preset, transition source, and non-null
forward transition. Pending rows omit resolution fields; every terminal row has the
time and current document revision at which it resolved.

The human surface shows every active collaborator annotation plus the 20 rows with the
latest `resolvedAt, annotationId`, then returns that selected set in deterministic
`createdAt, annotationId` order. The service
accepts at most 100 pending annotations per document and 50 per member; exceeding either
returns `RATE_LIMITED` without superseding existing work. Resolved history expires with
the 24-hour anonymous document.

Creating an annotation is human-only and has exact input:

```ts
type CreateDocumentAnnotationInput = {
  expectedRevision: number;
  requestId: string;
  source: "ANNOTATION_RAIL" | "KEYBOARD";
  targetField: "TITLE" | "BODY";
  targetKind: "SELECTION" | "CARET" | "DOCUMENT";
  rangeStart: number;
  rangeEnd: number;
} & (
  | { presetId: DocumentActionPresetId; customInstruction?: never }
  | { presetId: "custom"; customInstruction: string }
);
```

The client flushes a dirty draft first. The server checks current revision and derives
the selected text and creator from authoritative state. Creation appends and never
replaces another annotation. Replaying the same request UUID with identical canonical
input returns the original result; changed input returns `REQUEST_REPLAY_MISMATCH`.

The existing stage-specific presets and exact instructions remain. A human request may
use only a preset belonging to the document's current stage; transition preset IDs and
presets from another stage return `INVALID_INPUT`. `custom` requires a non-blank
instruction of at most 500 code points, while every other preset rejects that property.
With no selection, the current field is a
document target, except **Continue the thought**, which may use a caret. The rail always
shows Selection, Caret, or Document plus a bounded excerpt before creation.

Humans see the collaborative queue, but ownership is private for execution: a human may
cancel only an annotation they created, and a paired agent may list or apply only
annotations created by the human who owns that paired session. This is enforced by the
server-derived member ID, never a client-supplied creator field. Applying or cancelling
another member's annotation returns `UNAUTHORIZED` without revealing additional data.
The service exposes a dedicated agent-token `listAgentAnnotations` operation; generic
human `inspect` is not the owner-filtering boundary.

Cancellation input is exact `{ annotationId, requestId }`. It locks the document/action,
checks ownership before terminal state, and resolves without changing document revision.
The first locked apply or cancel wins; the loser receives `STALE_ANNOTATION_CONTEXT`.
An identical request-ID replay returns the original result, while changed input under
that ID returns `REQUEST_REPLAY_MISMATCH`.

## Safe anchor rebasing

Every accepted content mutation is represented per changed field as one conservative
splice `[start, end) -> replacement`, derived from the longest common Unicode-code-point
prefix and suffix. Each other pending annotation in that field is updated atomically:

1. A `DOCUMENT` target rebinds to `[0, latestFieldLength)` and captures the latest full
   field value.
2. A selection/caret whose `rangeEnd <= start` remains at the same offsets.
3. A selection/caret whose `rangeStart >= end` shifts by
   `replacementLength - (end - start)`; for a zero-length insertion, an exact same-point
   caret is treated as before the insertion by rule 2.
4. Every other selection/caret overlaps or is ambiguous and becomes `STALE`.

Pending annotations in an unchanged field keep their offsets. Every surviving pending
annotation adopts the new document revision as `anchorRevision` and refreshes its
server-derived `selectedText`. The rule applies to human saves, agent applications, and
Undo. The annotation being applied completes instead of rebasing. Application still
requires its current `anchorRevision` to equal `expectedRevision` and the authoritative
target text to match.

A stage-only mutation changes no text: all pending annotations simply adopt the new
revision. An annotation's creation stage does not restrict later application.

## Human-gated stage preparation

Stage order is Brainstorming → Researching → Refine → Ready to ship. Humans may still
choose any stage directly. A same-stage no-op adds nothing; a backward move adds no
annotation. A successful forward move increments the document revision and atomically
appends exactly one `STAGE_PREPARATION` body-document annotation owned by the human who
made the change, even when stages are skipped:

| Target stage | Label | Instruction |
| --- | --- | --- |
| Researching | Prepare for research | Organize the document into a clear research brief. Preserve ideas, group related points, and surface questions, assumptions, and evidence gaps. Do not invent research or citations. |
| Refine | Prepare to refine | Shape the document into a coherent draft using only its existing content. Preserve factual qualifications and make unresolved gaps explicit. Do not invent evidence or citations. |
| Ready to ship | Prepare to ship | Polish the document for publication by improving clarity, flow, consistency, grammar, and formatting without adding unsupported claims. |

The annotation records the actual `fromStage` and `toStage`, targets the latest complete
body, and uses the new stage revision for both creation and anchor revisions. Agents can
edit content in response but cannot advance, rewind, or ratify a stage.
Stage-preparation annotations count toward both pending limits. When either limit is
full, a requested forward move returns `RATE_LIMITED` with no stage, revision, or
annotation mutation.

## Interaction and native browser behavior

The right rail owns the current target preview, preset/custom composer, queue/history,
per-item status, creator label, own-item cancellation, WebMCP availability, and the
manual agent handoff. Annotation cards are not fake line pins; the selected excerpt and
field identify their target.

`Cmd/Ctrl+K` snapshots the current title/body selection and focuses the rail composer.
Submitting or clearing the composer restores editor focus and selection. Mouse `contextmenu`, the
Context Menu key, and `Shift+F10` are never cancelled or replaced, so native dictionary,
spelling, and platform actions continue to work. The body keeps `spellCheck` enabled.

At narrow widths the non-modal rail drawer is initially collapsed behind a labelled
toggle containing the pending count. Activating the toggle opens it and moves focus to
the drawer heading; Escape from inside closes it and returns focus to the toggle.
`Cmd/Ctrl+K` opens a closed drawer and focuses the composer. Submitting keeps the drawer
open; its clear/cancel control clears the draft and restores the captured editor focus.
The page remains editable while open, has no horizontal overflow at 390px, and uses 44px
minimum touch targets. Conflict, status, and Undo notices remain distinct from the queue.

## Honest Ask ChatGPT handoff

The current WebMCP page-tool surface does not provide a normative page-to-agent prompt
or wake-up API. **Ask ChatGPT** therefore means “copy the handoff prompt,” not “send”:

> Use this page's WebMCP tools to inspect the document and process my queued
> annotations oldest first. Re-inspect after every edit. Do not change the document
> stage.

Adjacent copy states this before the click. Success says **Prompt copied — paste/send in
ChatGPT**. The UI may say `WebMCP available` or `WebMCP unavailable`; it must not say an
agent is connected, queued, notified, or thinking. Only during a real registered-tool
callback may it say `Agent applying annotation…`. A future direct-send integration must
be separately feature-detected and may not remove this fallback.

## Root WebMCP catalog

The document registers two reads in this order and one conditional mutation. All inputs
reject additional properties; all results are JSON-serializable; instructions and
document content are untrusted.

### `inspect_document`

Exact empty input. Returns `{ ok: true, document, presence }` or a typed failure.
Annotations: `readOnlyHint: true`, `untrustedContentHint: true`.

### `list_agent_annotations`

Exact empty input. Returns `{ ok: true, annotations }`, containing only pending
annotations owned by the paired human in `createdAt, annotationId` order. An empty list
is success. Annotations: `readOnlyHint: true`, `untrustedContentHint: true`.

### `apply_agent_annotation`

```json
{
  "type": "object",
  "properties": {
    "annotationId": { "type": "string", "format": "uuid" },
    "expectedRevision": { "type": "integer", "minimum": 0 },
    "requestId": { "type": "string", "format": "uuid" },
    "replacementText": { "type": "string", "maxLength": 50000 },
    "changeSummary": {
      "type": "string",
      "minLength": 1,
      "maxLength": 240,
      "pattern": ".*\\S.*"
    }
  },
  "required": [
    "annotationId",
    "expectedRevision",
    "requestId",
    "replacementText",
    "changeSummary"
  ],
  "additionalProperties": false
}
```

The server derives document, member, actor, origin, and target. It validates paired-agent
ownership, pending status, current anchor revision, and target text; replaces exactly
that target; completes the annotation; and returns the checked
`ApplyAgentAnnotationOutcome` containing the authoritative surface, resolved annotation,
change metadata, and `undoAvailable`. A changed replacement rebases the remaining queue,
increments revision once, and returns `undoAvailable: true`. If replacement text exactly
equals the authoritative target, the annotation completes at the current revision,
document content/revision and existing Undo remain unchanged, and `undoAvailable` for
this outcome is false. The WebMCP result projects the outcome as
`{ ok: true, document, annotation, change, undoAvailable }`; for a no-op,
`change.fromRevision === change.toRevision`. Replays are idempotent. Annotations: `readOnlyHint: false`,
`untrustedContentHint: true`.

The mutation is registered only while the current paired member owns pending work. Its
callback captures document/session identity, not one annotation ID; it reads changing
state through live refs. Unmount and route changes abort all three tools and remove the
departing catalog before another route's tools appear.

## Exact application façade and failures

[`src/document/contracts.ts`](../../src/document/contracts.ts) is authoritative for all
wire types, constants, sessions, results, and `DocumentServicePort`. UI, API, local,
Supabase, and WebMCP code import it rather than recreating shapes.

- `INVALID_INPUT`: schema, bounds, limit, or text validation failed.
- `UNAUTHORIZED`: handle missing/expired/wrong actor or creator ownership failed.
- `NOT_FOUND`: share token absent or document expired.
- `STALE_WORK_STATE`: expected revision differs; includes current surface and retry data.
- `STALE_ANNOTATION_CONTEXT`: annotation is resolved or no longer safely anchored.
- `REQUEST_REPLAY_MISMATCH`: request UUID was reused with different input.
- `STALE_PAGE_CONTEXT`: a callback outlived its document/session generation.
- `RATE_LIMITED`: anonymous launch/join or pending-annotation limit exceeded.

AbortSignal cancellation throws an abort error. Route handlers validate before calling the service.
Supabase functions lock the document before revision/anchor checks and expose no direct
table privileges.

## Release acceptance

1. A clean `/` visit reaches an empty pageless editor with a visible annotation rail.
2. Two annotations at one revision remain visible and independently actionable; applying
   a non-overlapping first item safely preserves the second.
3. Two humans see the shared queue, but each paired agent can list/apply only its human's
   annotations and each human can cancel only their own.
4. A forward stage move atomically creates the exact preparation annotation; backward,
   same-stage, and agent attempts do not.
5. Selected-text right-click and keyboard context-menu events remain uncancelled;
   `Cmd/Ctrl+K` focuses the annotation composer.
6. Ask ChatGPT only copies the exact prompt and clearly says it was not sent.
7. WebMCP applies exact selection/caret/document edits, visibly refreshes the editor,
   safely rebases or visibly stales remaining anchors, and preserves one-step Undo.
8. Title/body autosave, reload, share, presence, conflict recovery, mobile editing, and
   WebMCP-off fallback continue to work.
9. `/document/[shareToken]` and `/decision-demo` never expose each other's tool catalog.
10. Release evidence includes focused unit/migration tests, `.codex/verify.sh`, build,
    local and hosted document Playwright flows, dated native WebMCP discovery/apply, and
    an independent visual review with no blocking issue.
