import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ApplyAgentAnnotationInput,
  ApplyAgentAnnotationOutcome,
  CompletedDocumentAnnotation,
  DocumentResult,
  DocumentServicePort,
  DocumentSurface,
  PendingDocumentAnnotation,
} from "../document/contracts";
import {
  DOCUMENT_WEBMCP_TOOL_CATALOG,
  getDocumentWebMCPToolDefinition,
} from "./document-catalog";
import {
  captureDocumentCallbackContext,
  createDocumentToolCallback,
} from "./document-executor";
import {
  desiredDocumentWebMCPTools,
  DocumentWebMCPRegistrationManager,
  makeDocumentRegistrationContextKey,
} from "./document-registration";
import type {
  DocumentWebMCPToolName,
  MutableDocumentWebMCPRuntimeRef,
} from "./document-types";
import type { WebMCPModelContextLike, WebMCPToolLike } from "./types";

const ANNOTATION_A = "123e4567-e89b-42d3-a456-426614174000";
const ANNOTATION_B = "223e4567-e89b-42d3-a456-426614174000";
const ANNOTATION_C = "823e4567-e89b-42d3-a456-426614174000";
const REQUEST_A = "323e4567-e89b-42d3-a456-426614174000";
const REQUEST_B = "423e4567-e89b-42d3-a456-426614174000";
const SELF_MEMBER_ID = "member-human-one";
const OTHER_MEMBER_ID = "member-human-two";

function pendingAnnotation(
  annotationId = ANNOTATION_A,
  overrides: Partial<
    Pick<
      PendingDocumentAnnotation,
      "anchorRevision" | "createdAt" | "createdBy" | "instruction" | "selectedText"
    >
  > = {},
): PendingDocumentAnnotation {
  return {
    annotationId,
    kind: "HUMAN_REQUEST",
    presetId: "rewrite_for_clarity",
    label: "Rewrite for clarity",
    instruction: "Rewrite the target for clarity while preserving meaning and factual claims.",
    stageAtCreation: "REFINE",
    source: "KEYBOARD",
    targetField: "BODY",
    targetKind: "DOCUMENT",
    rangeStart: 0,
    rangeEnd: 10,
    selectedText: "Draft text",
    createdRevision: 4,
    anchorRevision: 4,
    createdBy: {
      memberId: SELF_MEMBER_ID,
      displayName: "Guest 1",
    },
    createdAt: "2026-08-31T02:00:00.000Z",
    transition: null,
    status: "PENDING",
    ...overrides,
  };
}

function completedAnnotation(
  annotation: PendingDocumentAnnotation,
  resolvedRevision: number,
): CompletedDocumentAnnotation {
  return {
    ...annotation,
    status: "COMPLETED",
    resolvedAt: "2026-08-31T02:01:00.000Z",
    resolvedRevision,
  };
}

function surface(
  revision = 4,
  annotations: DocumentSurface["annotations"] = [],
  options: { documentId?: string; body?: string } = {},
): DocumentSurface {
  return {
    document: {
      id: options.documentId ?? "document-one",
      title: "Working note",
      body: options.body ?? "Draft text",
      stage: "REFINE",
      revision,
      updatedAt: "2026-08-31T02:00:00.000Z",
      lastEditor: null,
    },
    presence: [
      {
        memberId: SELF_MEMBER_ID,
        displayName: "Guest 1",
        color: "#7357d9",
        state: "EDITING",
        field: "BODY",
        isTyping: false,
        selectionStart: 0,
        selectionEnd: 5,
        observedRevision: revision,
        lastSeenAt: "2026-08-31T02:00:00.000Z",
      },
    ],
    annotations,
    undoAgentEdit: null,
  };
}

function runtime(initialSurface: DocumentSurface): MutableDocumentWebMCPRuntimeRef {
  return {
    current: {
      surface: initialSurface,
      sessionInstanceId: "browser-session-one",
      agentSessionToken: "opaque-agent-token-one",
      selfMemberId: SELF_MEMBER_ID,
    },
  };
}

function contextKey(latest: MutableDocumentWebMCPRuntimeRef): string {
  const current = latest.current;
  return makeDocumentRegistrationContextKey(
    current.surface.document.id,
    current.sessionInstanceId,
    current.agentSessionToken,
    current.selfMemberId,
  );
}

function serviceHarness(initialSurface: DocumentSurface) {
  let authoritative = initialSurface;
  let inspectCalls = 0;
  let listCalls = 0;
  const applyCalls: Array<{
    token: string;
    input: ApplyAgentAnnotationInput;
    signal?: AbortSignal;
  }> = [];
  const applyLedger = new Map<
    string,
    DocumentResult<ApplyAgentAnnotationOutcome>
  >();

  const unused = async (): Promise<never> => {
    throw new Error("Unexpected document service call");
  };

  const service = {
    launch: unused,
    join: unused,
    inspect: async (sessionToken: string, signal?: AbortSignal) => {
      inspectCalls += 1;
      assert.match(sessionToken, /^opaque-agent-token-/);
      void signal;
      return { ok: true, data: authoritative } as DocumentResult<DocumentSurface>;
    },
    listAgentAnnotations: async (sessionToken: string, signal?: AbortSignal) => {
      listCalls += 1;
      assert.match(sessionToken, /^opaque-agent-token-/);
      void signal;
      const owned = authoritative.annotations
        .filter(
          (annotation): annotation is PendingDocumentAnnotation =>
            annotation.status === "PENDING" &&
            annotation.createdBy.memberId === SELF_MEMBER_ID,
        )
        .toSorted(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.annotationId.localeCompare(right.annotationId),
        );
      return {
        ok: true,
        data: owned,
      } as DocumentResult<PendingDocumentAnnotation[]>;
    },
    saveHuman: unused,
    setStage: unused,
    createAnnotation: unused,
    cancelAnnotation: unused,
    applyAgentAnnotation: async (
      sessionToken: string,
      input: ApplyAgentAnnotationInput,
      signal?: AbortSignal,
    ): Promise<DocumentResult<ApplyAgentAnnotationOutcome>> => {
      applyCalls.push({ token: sessionToken, input, signal });
      const replay = applyLedger.get(input.requestId);
      if (replay) return structuredClone(replay);
      const annotation = authoritative.annotations.find(
        (candidate) => candidate.annotationId === input.annotationId,
      );
      if (!annotation || annotation.createdBy.memberId !== SELF_MEMBER_ID) {
        return {
          ok: false,
          code: "UNAUTHORIZED",
          message: "That annotation does not belong to this paired agent.",
          retryable: false,
          nextAction: "List your annotations again.",
        };
      }
      if (
        annotation.status !== "PENDING" ||
        annotation.anchorRevision !== input.expectedRevision ||
        authoritative.document.revision !== input.expectedRevision
      ) {
        return {
          ok: false,
          code: "STALE_ANNOTATION_CONTEXT",
          message: "The annotation is no longer safely actionable.",
          retryable: true,
          currentSurface: authoritative,
          nextAction: "List your annotations again.",
        };
      }

      const fromRevision = authoritative.document.revision;
      const changed = input.replacementText !== annotation.selectedText;
      const toRevision = changed ? fromRevision + 1 : fromRevision;
      const nextBody = changed ? input.replacementText : authoritative.document.body;
      const resolved = completedAnnotation(annotation, toRevision);
      const nextAnnotations = authoritative.annotations.map((candidate) => {
        if (candidate.annotationId === input.annotationId) return resolved;
        if (candidate.status !== "PENDING") return candidate;
        if (candidate.targetField !== "BODY") {
          return { ...candidate, anchorRevision: toRevision };
        }
        if (candidate.targetKind === "DOCUMENT") {
          return {
            ...candidate,
            rangeStart: 0,
            rangeEnd: Array.from(nextBody).length,
            selectedText: nextBody,
            anchorRevision: toRevision,
          };
        }
        return { ...candidate, anchorRevision: toRevision };
      });
      authoritative = {
        ...authoritative,
        document: changed
          ? {
              ...authoritative.document,
              body: nextBody,
              revision: toRevision,
              updatedAt: "2026-08-31T02:01:00.000Z",
              lastEditor: {
                memberId: "member-agent-one",
                displayName: "Guest 1's agent",
                actorType: "AGENT",
                origin: "WEBMCP",
              },
            }
          : authoritative.document,
        annotations: nextAnnotations,
        undoAgentEdit: changed
          ? {
              agentRevision: toRevision,
              previousTitle: authoritative.document.title,
              previousBody: authoritative.document.body,
            }
          : authoritative.undoAgentEdit,
      };
      const success = {
        ok: true,
        data: {
          surface: authoritative,
          annotation: resolved,
          change: {
            summary: input.changeSummary,
            fromRevision,
            toRevision,
            annotationId: input.annotationId,
          },
          undoAvailable: changed,
        },
      } satisfies DocumentResult<ApplyAgentAnnotationOutcome>;
      applyLedger.set(input.requestId, structuredClone(success));
      return success;
    },
    undoAgentEdit: unused,
    touchPresence: unused,
  } satisfies DocumentServicePort;

  return {
    service,
    getSurface: () => authoritative,
    setSurface: (next: DocumentSurface) => {
      authoritative = next;
    },
    getInspectCalls: () => inspectCalls,
    getListCalls: () => listCalls,
    getApplyCalls: () => applyCalls,
  };
}

class FakeModelContext implements WebMCPModelContextLike {
  calls: Array<{ tool: WebMCPToolLike; signal?: AbortSignal }> = [];

  registerTool(tool: WebMCPToolLike, options?: { signal?: AbortSignal }): void {
    this.calls.push({ tool, signal: options?.signal });
  }
}

function callbackFor(
  name: DocumentWebMCPToolName,
  latest: MutableDocumentWebMCPRuntimeRef,
  service: DocumentServicePort,
  callbacks: {
    onAuthoritativeSurface?: (next: DocumentSurface) => void;
    onToolExecutionChange?: (tool: "apply_agent_annotation" | null) => void;
  } = {},
) {
  return createDocumentToolCallback(name, captureDocumentCallbackContext(latest), {
    latest,
    service,
    ...callbacks,
  });
}

function applyInput(
  annotationId: string,
  expectedRevision: number,
  requestId: string,
  replacementText: string,
): ApplyAgentAnnotationInput {
  return {
    annotationId,
    expectedRevision,
    requestId,
    replacementText,
    changeSummary: `Applied ${annotationId === ANNOTATION_A ? "first" : "second"} annotation.`,
  };
}

test("publishes only the exact ordered annotation queue catalog", () => {
  assert.deepEqual(
    DOCUMENT_WEBMCP_TOOL_CATALOG.map((tool) => tool.name),
    ["inspect_document", "list_agent_annotations", "apply_agent_annotation"],
  );
  assert.deepEqual(getDocumentWebMCPToolDefinition("inspect_document").inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(getDocumentWebMCPToolDefinition("list_agent_annotations").inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(getDocumentWebMCPToolDefinition("list_agent_annotations").annotations, {
    readOnlyHint: true,
    untrustedContentHint: true,
  });
  assert.deepEqual(getDocumentWebMCPToolDefinition("apply_agent_annotation").inputSchema, {
    type: "object",
    properties: {
      annotationId: { type: "string", format: "uuid" },
      expectedRevision: { type: "integer", minimum: 0 },
      requestId: { type: "string", format: "uuid" },
      replacementText: { type: "string", maxLength: 50_000 },
      changeSummary: {
        type: "string",
        minLength: 1,
        maxLength: 240,
        pattern: ".*\\S.*",
      },
    },
    required: [
      "annotationId",
      "expectedRevision",
      "requestId",
      "replacementText",
      "changeSummary",
    ],
    additionalProperties: false,
  });
  assert.deepEqual(getDocumentWebMCPToolDefinition("apply_agent_annotation").annotations, {
    readOnlyHint: false,
    untrustedContentHint: true,
  });
  assert.equal(
    DOCUMENT_WEBMCP_TOOL_CATALOG.some((tool) => /wait|poll|dispatch/i.test(tool.name)),
    false,
  );
});

test("rejects non-empty reads and malformed annotation applications before service calls", async () => {
  const initial = surface(4, [pendingAnnotation()]);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);

  for (const name of ["inspect_document", "list_agent_annotations"] as const) {
    const result = (await callbackFor(name, latest, harness.service)({ unexpected: true })) as {
      ok: false;
      code: string;
    };
    assert.equal(result.code, "INVALID_INPUT");
  }

  const apply = callbackFor("apply_agent_annotation", latest, harness.service);
  for (const input of [
    applyInput("not-a-uuid", 4, REQUEST_A, "Clear text"),
    applyInput(ANNOTATION_A, -1, REQUEST_A, "Clear text"),
    applyInput(ANNOTATION_A, 4, "not-a-uuid", "Clear text"),
    applyInput(ANNOTATION_A, 4, REQUEST_A, "x".repeat(50_001)),
    { ...applyInput(ANNOTATION_A, 4, REQUEST_A, "Clear text"), changeSummary: "   " },
    { ...applyInput(ANNOTATION_A, 4, REQUEST_A, "Clear text"), actorType: "AGENT" },
  ]) {
    const result = (await apply(input)) as { ok: false; code: string };
    assert.equal(result.code, "INVALID_INPUT");
  }
  assert.equal(harness.getInspectCalls(), 0);
  assert.equal(harness.getListCalls(), 0);
  assert.equal(harness.getApplyCalls().length, 0);
});

test("uses the dedicated owner-filtered list service and treats an empty queue as success", async () => {
  const other = pendingAnnotation(ANNOTATION_B, {
    createdBy: { memberId: OTHER_MEMBER_ID, displayName: "Guest 2" },
  });
  const initial = surface(4, [other]);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const accepted: DocumentSurface[] = [];

  const result = await callbackFor("list_agent_annotations", latest, harness.service, {
    onAuthoritativeSurface: (next) => accepted.push(next),
  })({});
  assert.deepEqual(result, { ok: true, annotations: [] });
  assert.equal(harness.getListCalls(), 1);
  assert.equal(harness.getInspectCalls(), 0);
  assert.deepEqual(accepted, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("registers one generic apply tool only while the paired member owns pending work", async () => {
  const otherOnly = surface(4, [
    pendingAnnotation(ANNOTATION_B, {
      createdBy: { memberId: OTHER_MEMBER_ID, displayName: "Guest 2" },
    }),
  ]);
  const latest = runtime(otherOnly);
  const harness = serviceHarness(otherOnly);
  const context = new FakeModelContext();
  const manager = new DocumentWebMCPRegistrationManager(context, {
    latest,
    service: harness.service,
  });

  assert.deepEqual(desiredDocumentWebMCPTools(otherOnly, SELF_MEMBER_ID), [
    "inspect_document",
    "list_agent_annotations",
  ]);
  const first = await manager.reconcile(otherOnly, SELF_MEMBER_ID, contextKey(latest));
  assert.deepEqual(first.added, ["inspect_document", "list_agent_annotations"]);

  const withOwn = surface(4, [pendingAnnotation()]);
  latest.current = { ...latest.current, surface: withOwn };
  harness.setSurface(withOwn);
  const second = await manager.reconcile(withOwn, SELF_MEMBER_ID, contextKey(latest));
  assert.deepEqual(second.added, ["apply_agent_annotation"]);
  const stableApply = manager.getRegisteredCallback("apply_agent_annotation");
  const applySignal = context.calls.find(
    (call) => call.tool.name === "apply_agent_annotation",
  )?.signal;

  const differentOwnId = surface(4, [pendingAnnotation(ANNOTATION_B)]);
  latest.current = { ...latest.current, surface: differentOwnId };
  harness.setSurface(differentOwnId);
  const third = await manager.reconcile(
    differentOwnId,
    SELF_MEMBER_ID,
    contextKey(latest),
  );
  assert.deepEqual(third.reRegistered, []);
  assert.equal(manager.getRegisteredCallback("apply_agent_annotation"), stableApply);

  const completed = surface(4, [completedAnnotation(pendingAnnotation(ANNOTATION_B), 4)]);
  latest.current = { ...latest.current, surface: completed };
  harness.setSurface(completed);
  const fourth = await manager.reconcile(completed, SELF_MEMBER_ID, contextKey(latest));
  assert.deepEqual(fourth.removed, ["apply_agent_annotation"]);
  assert.equal(applySignal?.aborted, true);
  assert.deepEqual(manager.registeredTools, [
    "inspect_document",
    "list_agent_annotations",
  ]);

  manager.dispose();
  assert.deepEqual(manager.registeredTools, []);
});

test("one live apply callback processes multiple sequential annotation IDs", async () => {
  const second = pendingAnnotation(ANNOTATION_B, {
    createdAt: "2026-08-31T02:00:01.000Z",
  });
  const initial = surface(4, [pendingAnnotation(), second]);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const accepted: DocumentSurface[] = [];
  const execution: Array<"apply_agent_annotation" | null> = [];
  const apply = callbackFor("apply_agent_annotation", latest, harness.service, {
    onAuthoritativeSurface: (next) => accepted.push(next),
    onToolExecutionChange: (tool) => execution.push(tool),
  });
  const list = callbackFor("list_agent_annotations", latest, harness.service);

  const first = await apply(applyInput(ANNOTATION_A, 4, REQUEST_A, "First pass"));
  assert.deepEqual(first, {
    ok: true,
    document: harness.getSurface().document,
    annotation: completedAnnotation(pendingAnnotation(), 5),
    change: {
      summary: "Applied first annotation.",
      fromRevision: 4,
      toRevision: 5,
      annotationId: ANNOTATION_A,
    },
    undoAvailable: true,
  });
  const afterFirst = (await list({})) as {
    ok: true;
    annotations: PendingDocumentAnnotation[];
  };
  assert.deepEqual(afterFirst.annotations.map((annotation) => annotation.annotationId), [
    ANNOTATION_B,
  ]);
  assert.equal(afterFirst.annotations[0]?.anchorRevision, 5);

  const secondResult = (await apply(
    applyInput(ANNOTATION_B, 5, REQUEST_B, "Second pass"),
  )) as { ok: true; document: { revision: number; body: string } };
  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.document.revision, 6);
  assert.equal(secondResult.document.body, "Second pass");
  assert.deepEqual(
    harness.getApplyCalls().map((call) => call.input.annotationId),
    [ANNOTATION_A, ANNOTATION_B],
  );
  assert.deepEqual(execution, [
    "apply_agent_annotation",
    null,
    "apply_agent_annotation",
    null,
  ]);
  assert.deepEqual(
    accepted.map((next) => next.document.revision),
    [5, 6],
  );
  assert.equal(latest.current.surface.document.revision, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(secondResult)), secondResult);
});

test("projects the exact authoritative no-op outcome without inventing undo", async () => {
  const annotation = pendingAnnotation();
  const initial = {
    ...surface(4, [annotation]),
    undoAgentEdit: {
      agentRevision: 3,
      previousTitle: "Earlier",
      previousBody: "Earlier draft",
    },
  } satisfies DocumentSurface;
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const accepted: DocumentSurface[] = [];

  const result = await callbackFor("apply_agent_annotation", latest, harness.service, {
    onAuthoritativeSurface: (next) => accepted.push(next),
  })(applyInput(ANNOTATION_A, 4, REQUEST_A, "Draft text"));
  assert.deepEqual(result, {
    ok: true,
    document: initial.document,
    annotation: completedAnnotation(annotation, 4),
    change: {
      summary: "Applied first annotation.",
      fromRevision: 4,
      toRevision: 4,
      annotationId: ANNOTATION_A,
    },
    undoAvailable: false,
  });
  assert.equal(accepted.at(-1)?.document.revision, 4);
  assert.deepEqual(accepted.at(-1)?.undoAgentEdit, initial.undoAgentEdit);
});

test("refreshes live registration after a historical same-revision replay", async () => {
  const annotationA = pendingAnnotation();
  const annotationB = pendingAnnotation(ANNOTATION_B, {
    createdAt: "2026-08-31T02:00:01.000Z",
  });
  const initial = surface(4, [annotationA, annotationB]);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const context = new FakeModelContext();
  const pendingReconciliations: Array<Promise<unknown>> = [];
  const manager = new DocumentWebMCPRegistrationManager(context, {
    latest,
    service: harness.service,
    onAuthoritativeSurface: (next) => {
      pendingReconciliations.push(
        manager.reconcile(next, SELF_MEMBER_ID, contextKey(latest)),
      );
    },
  });
  const settleRegistration = async () => {
    while (pendingReconciliations.length > 0) {
      await Promise.all(pendingReconciliations.splice(0));
    }
  };

  await manager.reconcile(initial, SELF_MEMBER_ID, contextKey(latest));
  const apply = manager.getRegisteredCallback("apply_agent_annotation");
  assert.ok(apply);

  const requestA = applyInput(ANNOTATION_A, 4, REQUEST_A, "Draft text");
  const first = await apply(requestA);
  await settleRegistration();
  assert.equal(
    latest.current.surface.annotations.find(
      (annotation) => annotation.annotationId === ANNOTATION_B,
    )?.status,
    "PENDING",
  );
  assert.equal(manager.getRegisteredCallback("apply_agent_annotation"), apply);

  await apply(applyInput(ANNOTATION_B, 4, REQUEST_B, "Draft text"));
  await settleRegistration();
  assert.equal(
    latest.current.surface.annotations.find(
      (annotation) => annotation.annotationId === ANNOTATION_B,
    )?.status,
    "COMPLETED",
  );
  assert.deepEqual(manager.registeredTools, [
    "inspect_document",
    "list_agent_annotations",
  ]);

  const replay = await apply(requestA);
  await settleRegistration();
  assert.deepEqual(replay, first);
  assert.equal(
    latest.current.surface.annotations.find(
      (annotation) => annotation.annotationId === ANNOTATION_B,
    )?.status,
    "COMPLETED",
  );
  assert.deepEqual(manager.registeredTools, [
    "inspect_document",
    "list_agent_annotations",
  ]);
  assert.equal(
    context.calls.filter((call) => call.tool.name === "apply_agent_annotation").length,
    1,
  );
  assert.equal(harness.getApplyCalls().length, 3);
  assert.equal(harness.getInspectCalls(), 3);

  manager.dispose();
});

test("does not resurrect pending work when an older equal-revision inspect finishes last", async () => {
  const annotation = pendingAnnotation();
  const initial = surface(4, [annotation]);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const context = new FakeModelContext();
  let inspectCall = 0;
  let markOldInspectCaptured: (() => void) | undefined;
  const oldInspectCaptured = new Promise<void>((resolve) => {
    markOldInspectCaptured = resolve;
  });
  let releaseOldInspect:
    | ((result: DocumentResult<DocumentSurface>) => void)
    | undefined;
  const heldOldInspect = new Promise<DocumentResult<DocumentSurface>>((resolve) => {
    releaseOldInspect = resolve;
  });
  const racingService: DocumentServicePort = {
    ...harness.service,
    inspect: async (sessionToken, signal) => {
      assert.equal(sessionToken, latest.current.agentSessionToken);
      void signal;
      inspectCall += 1;
      if (inspectCall === 1) {
        markOldInspectCaptured?.();
        return heldOldInspect;
      }
      return { ok: true, data: harness.getSurface() };
    },
  };
  const pendingReconciliations: Array<Promise<unknown>> = [];
  const manager = new DocumentWebMCPRegistrationManager(context, {
    latest,
    service: racingService,
    onAuthoritativeSurface: (next) => {
      pendingReconciliations.push(
        manager.reconcile(next, SELF_MEMBER_ID, contextKey(latest)),
      );
    },
  });
  const settleRegistration = async () => {
    while (pendingReconciliations.length > 0) {
      await Promise.all(pendingReconciliations.splice(0));
    }
  };

  await manager.reconcile(initial, SELF_MEMBER_ID, contextKey(latest));
  const inspect = manager.getRegisteredCallback("inspect_document");
  const apply = manager.getRegisteredCallback("apply_agent_annotation");
  assert.ok(inspect);
  assert.ok(apply);

  const delayedResult = inspect({});
  await oldInspectCaptured;
  await apply(applyInput(ANNOTATION_A, 4, REQUEST_A, "Draft text"));
  await settleRegistration();
  assert.equal(latest.current.surface.annotations[0]?.status, "COMPLETED");
  assert.deepEqual(manager.registeredTools, [
    "inspect_document",
    "list_agent_annotations",
  ]);

  releaseOldInspect?.({ ok: true, data: initial });
  await delayedResult;
  await settleRegistration();
  assert.equal(latest.current.surface.annotations[0]?.status, "COMPLETED");
  assert.deepEqual(manager.registeredTools, [
    "inspect_document",
    "list_agent_annotations",
  ]);
  assert.equal(
    context.calls.filter((call) => call.tool.name === "apply_agent_annotation").length,
    1,
  );
  assert.equal(inspectCall, 2);

  manager.dispose();
});

test("preserves structured stale and authorization failures and adopts supplied surfaces", async () => {
  const initial = surface(4, [pendingAnnotation()]);
  const collaboratorInstruction = "SECRET COLLABORATOR INSTRUCTION";
  const current = surface(
    5,
    [
      pendingAnnotation(ANNOTATION_A, {
        anchorRevision: 5,
        selectedText: "Current text",
      }),
      pendingAnnotation(ANNOTATION_C, {
        anchorRevision: 5,
        createdBy: { memberId: OTHER_MEMBER_ID, displayName: "Guest 2" },
        instruction: collaboratorInstruction,
        selectedText: "Current text",
      }),
    ],
    { body: "Current text" },
  );
  const agentSafeCurrent = {
    ...current,
    annotations: current.annotations.filter(
      (annotation) => annotation.createdBy.memberId === SELF_MEMBER_ID,
    ),
  };
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  harness.setSurface(current);
  const accepted: DocumentSurface[] = [];
  const staleService: DocumentServicePort = {
    ...harness.service,
    applyAgentAnnotation: async () => ({
      ok: false,
      code: "STALE_WORK_STATE",
      message: "The document changed after the annotation was listed.",
      retryable: true,
      currentSurface: current,
      expectedRevision: 4,
      actualRevision: 5,
      nextAction: "List your annotations again.",
    }),
  };

  const stale = await callbackFor("apply_agent_annotation", latest, staleService, {
    onAuthoritativeSurface: (next) => accepted.push(next),
  })(applyInput(ANNOTATION_A, 4, REQUEST_A, "Clear text"));
  assert.deepEqual(stale, {
    ok: false,
    code: "STALE_WORK_STATE",
    message: "The document changed after the annotation was listed.",
    retryable: true,
    currentSurface: agentSafeCurrent,
    expectedRevision: 4,
    actualRevision: 5,
    nextAction: "List your annotations again.",
  });
  assert.equal(JSON.stringify(stale).includes(collaboratorInstruction), false);
  assert.deepEqual(
    (stale as { currentSurface: DocumentSurface }).currentSurface.annotations.map(
      (annotation) => annotation.annotationId,
    ),
    [ANNOTATION_A],
  );
  assert.equal(latest.current.surface, current);
  assert.equal(accepted.at(-1), current);

  const unauthorizedService: DocumentServicePort = {
    ...harness.service,
    applyAgentAnnotation: async () => ({
      ok: false,
      code: "UNAUTHORIZED",
      message: "That annotation is not owned by this paired agent.",
      retryable: false,
      nextAction: "List your annotations again.",
    }),
  };
  const unauthorized = await callbackFor(
    "apply_agent_annotation",
    latest,
    unauthorizedService,
  )(applyInput(ANNOTATION_A, 5, REQUEST_B, "Clear text"));
  assert.deepEqual(unauthorized, {
    ok: false,
    code: "UNAUTHORIZED",
    message: "That annotation is not owned by this paired agent.",
    retryable: false,
    nextAction: "List your annotations again.",
  });
});

test("invalidates departed page contexts, re-registers route tools, and aborts cleanup", async () => {
  const initial = surface(4, [pendingAnnotation()]);
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const context = new FakeModelContext();
  const manager = new DocumentWebMCPRegistrationManager(context, {
    latest,
    service: harness.service,
  });
  await manager.reconcile(initial, SELF_MEMBER_ID, contextKey(latest));
  const oldInspect = manager.getRegisteredCallback("inspect_document");
  const oldSignals = context.calls.map((call) => call.signal);

  const nextDocument = surface(4, [pendingAnnotation()], { documentId: "document-two" });
  latest.current = {
    surface: nextDocument,
    sessionInstanceId: "browser-session-two",
    agentSessionToken: "opaque-agent-token-two",
    selfMemberId: SELF_MEMBER_ID,
  };
  harness.setSurface(nextDocument);
  const switched = await manager.reconcile(
    nextDocument,
    SELF_MEMBER_ID,
    contextKey(latest),
  );
  assert.deepEqual(switched.reRegistered, [
    "inspect_document",
    "list_agent_annotations",
    "apply_agent_annotation",
  ]);
  assert.ok(oldSignals.every((signal) => signal?.aborted));
  const stale = (await oldInspect?.({})) as { ok: false; code: string };
  assert.equal(stale.code, "STALE_PAGE_CONTEXT");
  assert.equal(harness.getInspectCalls(), 0);

  const newSignals = context.calls.slice(oldSignals.length).map((call) => call.signal);
  manager.dispose();
  assert.ok(newSignals.every((signal) => signal?.aborted));
  assert.deepEqual(manager.registeredTools, []);
});

test("throws AbortError for cancelled executions before calling the service", async () => {
  const initial = surface();
  const latest = runtime(initial);
  const harness = serviceHarness(initial);
  const controller = new AbortController();
  controller.abort("Test cancellation");

  await assert.rejects(
    callbackFor("inspect_document", latest, harness.service)(
      {},
      { signal: controller.signal },
    ),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(harness.getInspectCalls(), 0);
});
