import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  DOCUMENT_STAGE_PREPARATIONS,
  type CreateDocumentAnnotationInput,
  type DocumentAnnotation,
  type DocumentResult,
  type DocumentSessionBundle,
  type DocumentSurface,
  type PendingDocumentAnnotation,
} from "@/document/contracts";
import { DOCUMENT_PRESENCE_TTL_MS, LocalDocumentService } from "./document-service";

function unwrap<T>(result: DocumentResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.data;
}

async function launch(service: LocalDocumentService, displayName?: string): Promise<DocumentSessionBundle> {
  return unwrap(await service.launch(displayName ? { displayName } : {}));
}

async function save(
  service: LocalDocumentService,
  session: DocumentSessionBundle,
  expectedRevision: number,
  title: string,
  body: string,
  requestId = randomUUID(),
): Promise<DocumentSurface> {
  return unwrap(await service.saveHuman(session.humanSessionToken, {
    expectedRevision,
    requestId,
    title,
    body,
  }));
}

async function annotate(
  service: LocalDocumentService,
  session: DocumentSessionBundle,
  input: Omit<CreateDocumentAnnotationInput, "requestId">,
  requestId = randomUUID(),
): Promise<{ surface: DocumentSurface; annotation: PendingDocumentAnnotation }> {
  const before = unwrap(await service.inspect(session.humanSessionToken));
  const existingIds = new Set(before.annotations.map((annotation) => annotation.annotationId));
  const surface = unwrap(await service.createAnnotation(session.humanSessionToken, {
    ...input,
    requestId,
  } as CreateDocumentAnnotationInput));
  const annotation = surface.annotations.find(
    (candidate) => !existingIds.has(candidate.annotationId)
      && candidate.createdBy.memberId === session.selfMemberId
      && candidate.status === "PENDING"
      && candidate.createdRevision === input.expectedRevision,
  );
  if (!annotation || annotation.status !== "PENDING") throw new Error("Annotation was not created");
  return { surface, annotation };
}

function findAnnotation(surface: DocumentSurface, annotationId: string): DocumentAnnotation {
  const annotation = surface.annotations.find((candidate) => candidate.annotationId === annotationId);
  if (!annotation) throw new Error(`Missing annotation ${annotationId}`);
  return annotation;
}

describe("LocalDocumentService annotation queue", () => {
  it("launches an isolated 24-hour note with opaque paired sessions and supports joins", async () => {
    const now = Date.parse("2026-08-31T00:00:00.000Z");
    const service = new LocalDocumentService({ now: () => now });
    const first = await launch(service, "Maya");
    const second = unwrap(await service.join({ shareToken: first.shareToken, displayName: "Jordan" }));
    const separate = await launch(service);

    expect(first.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.humanSessionToken).not.toBe(first.agentSessionToken);
    expect(Date.parse(first.expiresAt) - now).toBe(24 * 60 * 60 * 1000);
    expect(first.surface.document).toMatchObject({ title: "", body: "", stage: "BRAINSTORMING", revision: 0 });
    expect(first.surface.annotations).toEqual([]);
    expect(second.surface.document.id).toBe(first.surface.document.id);
    expect(second.surface.presence.map((entry) => entry.displayName)).toEqual(["Jordan", "Maya"]);
    expect(separate.surface.document.id).not.toBe(first.surface.document.id);
  });

  it("enforces actor authority and derives editor identity and origin on the server", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service, "Maya");

    expect(await service.setStage(session.agentSessionToken, {
      expectedRevision: 0,
      requestId: randomUUID(),
      stage: "REFINE",
    })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(await service.createAnnotation(session.agentSessionToken, {
      expectedRevision: 0,
      requestId: randomUUID(),
      presetId: "custom",
      customInstruction: "Draft something",
      source: "KEYBOARD",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: 0,
    })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    const spoofedSave = await service.saveHuman(session.humanSessionToken, {
      expectedRevision: 0,
      requestId: randomUUID(),
      title: "Hello",
      body: "World",
      actor: "spoofed",
    } as never);
    expect(spoofedSave).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const saved = await save(service, session, 0, "Hello", "World");
    expect(saved.document.lastEditor).toEqual({
      memberId: session.selfMemberId,
      displayName: "Maya",
      actorType: "HUMAN",
      origin: "ORDINARY_UI",
    });
  });

  it("uses CAS writes and canonical request replay without double commits", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service);
    const requestId = randomUUID();
    const input = { expectedRevision: 0, requestId, title: "One", body: "First" };

    const first = unwrap(await service.saveHuman(session.humanSessionToken, input));
    const replay = unwrap(await service.saveHuman(session.humanSessionToken, input));
    expect(first.document.revision).toBe(1);
    expect(replay).toEqual(first);
    expect(await service.saveHuman(session.humanSessionToken, { ...input, body: "Changed" }))
      .toMatchObject({ ok: false, code: "REQUEST_REPLAY_MISMATCH" });
    expect(await service.saveHuman(session.humanSessionToken, {
      expectedRevision: 0,
      requestId: randomUUID(),
      title: "Two",
      body: "Stale",
    })).toMatchObject({
      ok: false,
      code: "STALE_WORK_STATE",
      expectedRevision: 0,
      actualRevision: 1,
      currentSurface: { document: { body: "First" } },
    });
  });

  it("appends same-revision annotations and isolates list, apply, and cancel by paired creator", async () => {
    let now = Date.parse("2026-08-31T00:00:00.000Z");
    const service = new LocalDocumentService({ now: () => now });
    const maya = await launch(service, "Maya");
    const jordan = unwrap(await service.join({ shareToken: maya.shareToken, displayName: "Jordan" }));
    await save(service, maya, 0, "", "Alpha beta gamma");

    const mayaFirst = (await annotate(service, maya, {
      expectedRevision: 1,
      presetId: "continue_thought",
      source: "KEYBOARD",
      targetField: "BODY",
      targetKind: "CARET",
      rangeStart: 5,
      rangeEnd: 5,
    })).annotation;
    now += 1;
    const mayaSecond = (await annotate(service, maya, {
      expectedRevision: 1,
      presetId: "turn_into_outline",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 6,
      rangeEnd: 10,
    })).annotation;
    now += 1;
    const jordanOnly = (await annotate(service, jordan, {
      expectedRevision: 1,
      presetId: "custom",
      customInstruction: "Strengthen this conclusion",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 11,
      rangeEnd: 16,
    })).annotation;

    const humanSurface = unwrap(await service.inspect(maya.humanSessionToken));
    expect(humanSurface.annotations.map((entry) => entry.annotationId)).toHaveLength(3);
    expect(unwrap(await service.listAgentAnnotations(maya.agentSessionToken)).map((entry) => entry.annotationId))
      .toEqual([mayaFirst.annotationId, mayaSecond.annotationId]);
    expect(unwrap(await service.listAgentAnnotations(jordan.agentSessionToken)).map((entry) => entry.annotationId))
      .toEqual([jordanOnly.annotationId]);
    expect(await service.listAgentAnnotations(maya.humanSessionToken))
      .toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    expect(await service.cancelAnnotation(maya.humanSessionToken, {
      annotationId: jordanOnly.annotationId,
      requestId: randomUUID(),
    })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(await service.applyAgentAnnotation(maya.agentSessionToken, {
      annotationId: jordanOnly.annotationId,
      expectedRevision: 1,
      requestId: randomUUID(),
      replacementText: "Gamma",
      changeSummary: "Polish the conclusion",
    })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("validates the exact discriminated input and only current-stage presets", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service);
    await save(service, session, 0, "", "Draft");

    expect(await service.createAnnotation(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "rewrite_for_clarity",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: 5,
    })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await service.createAnnotation(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "custom",
      customInstruction: "Continue from here",
      source: "KEYBOARD",
      targetField: "BODY",
      targetKind: "CARET",
      rangeStart: 5,
      rangeEnd: 5,
    })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await service.createAnnotation(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "turn_into_outline",
      source: "KEYBOARD",
      targetField: "BODY",
      targetKind: "CARET",
      rangeStart: 5,
      rangeEnd: 5,
    })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await service.createAnnotation(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "continue_thought",
      source: "KEYBOARD",
      targetField: "TITLE",
      targetKind: "CARET",
      rangeStart: 0,
      rangeEnd: 0,
    })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(unwrap(await service.inspect(session.humanSessionToken)).annotations).toEqual([]);
    expect(await service.createAnnotation(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "continue_thought",
      customInstruction: undefined,
      source: "KEYBOARD",
      targetField: "BODY",
      targetKind: "CARET",
      rangeStart: 5,
      rangeEnd: 5,
    } as never)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await service.createAnnotation(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "custom",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: 5,
    } as never)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await service.createAnnotation(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "custom",
      customInstruction: "  ",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: 5,
    })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("replays annotation creation without appending and rejects changed input under the same request ID", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service);
    await save(service, session, 0, "", "Draft");
    const requestId = randomUUID();
    const input = {
      expectedRevision: 1,
      requestId,
      presetId: "custom" as const,
      customInstruction: "Shape this into a paragraph",
      source: "ANNOTATION_RAIL" as const,
      targetField: "BODY" as const,
      targetKind: "DOCUMENT" as const,
      rangeStart: 0,
      rangeEnd: 5,
    };
    const created = unwrap(await service.createAnnotation(session.humanSessionToken, input));
    const replay = unwrap(await service.createAnnotation(session.humanSessionToken, input));
    expect(replay).toEqual(created);
    expect(replay.annotations.filter((annotation) => annotation.status === "PENDING")).toHaveLength(1);
    expect(await service.createAnnotation(session.humanSessionToken, {
      ...input,
      customInstruction: "Changed request",
    })).toMatchObject({ ok: false, code: "REQUEST_REPLAY_MISMATCH" });
  });

  it("makes cancel first-wins and replay-safe", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service);
    await save(service, session, 0, "", "Draft");
    const annotation = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "turn_into_outline",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: 5,
    })).annotation;
    const requestId = randomUUID();
    const input = { annotationId: annotation.annotationId, requestId };
    const cancelled = unwrap(await service.cancelAnnotation(session.humanSessionToken, input));
    expect(findAnnotation(cancelled, annotation.annotationId)).toMatchObject({
      status: "CANCELLED",
      resolvedRevision: 1,
    });
    expect(unwrap(await service.cancelAnnotation(session.humanSessionToken, input))).toEqual(cancelled);
    expect(await service.cancelAnnotation(session.humanSessionToken, {
      ...input,
      annotationId: randomUUID(),
    })).toMatchObject({ ok: false, code: "REQUEST_REPLAY_MISMATCH" });
    expect(await service.applyAgentAnnotation(session.agentSessionToken, {
      annotationId: annotation.annotationId,
      expectedRevision: 1,
      requestId: randomUUID(),
      replacementText: "Outline",
      changeSummary: "Outline the draft",
    })).toMatchObject({ ok: false, code: "STALE_ANNOTATION_CONTEXT" });
  });

  it("rebases before, after, overlap, caret, document, and Unicode code-point anchors on human save", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service);
    await save(service, session, 0, "", "😀alpha beta gamma");
    const inputs = [
      { key: "before", targetKind: "SELECTION" as const, rangeStart: 0, rangeEnd: 1 },
      { key: "overlap", targetKind: "SELECTION" as const, rangeStart: 7, rangeEnd: 11 },
      { key: "after", targetKind: "SELECTION" as const, rangeStart: 12, rangeEnd: 17 },
      { key: "caret", targetKind: "CARET" as const, rangeStart: 7, rangeEnd: 7 },
      { key: "document", targetKind: "DOCUMENT" as const, rangeStart: 0, rangeEnd: 17 },
    ];
    const ids = new Map<string, string>();
    for (const input of inputs) {
      const created = input.targetKind === "CARET"
        ? await annotate(service, session, {
          expectedRevision: 1,
          presetId: "continue_thought",
          source: "KEYBOARD",
          targetField: "BODY",
          targetKind: "CARET",
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
        })
        : await annotate(service, session, {
          expectedRevision: 1,
          presetId: "custom",
          customInstruction: `Handle ${input.key}`,
          source: "ANNOTATION_RAIL",
          targetField: "BODY",
          targetKind: input.targetKind,
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
        });
      ids.set(input.key, created.annotation.annotationId);
    }

    const changed = await save(service, session, 1, "", "😀alpha B gamma");
    expect(findAnnotation(changed, ids.get("before")!)).toMatchObject({
      status: "PENDING",
      rangeStart: 0,
      rangeEnd: 1,
      selectedText: "😀",
      anchorRevision: 2,
    });
    expect(findAnnotation(changed, ids.get("overlap")!)).toMatchObject({
      status: "STALE",
      resolvedRevision: 2,
    });
    expect(findAnnotation(changed, ids.get("after")!)).toMatchObject({
      status: "PENDING",
      rangeStart: 9,
      rangeEnd: 14,
      selectedText: "gamma",
      anchorRevision: 2,
    });
    expect(findAnnotation(changed, ids.get("caret")!)).toMatchObject({
      status: "PENDING",
      rangeStart: 7,
      rangeEnd: 7,
      selectedText: "",
      anchorRevision: 2,
    });
    expect(findAnnotation(changed, ids.get("document")!)).toMatchObject({
      status: "PENDING",
      rangeStart: 0,
      rangeEnd: 14,
      selectedText: "😀alpha B gamma",
      anchorRevision: 2,
    });
  });

  it("treats a caret at an insertion point as before while shifting following text", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service);
    await save(service, session, 0, "", "ab");
    const caret = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "continue_thought",
      source: "KEYBOARD",
      targetField: "BODY",
      targetKind: "CARET",
      rangeStart: 1,
      rangeEnd: 1,
    })).annotation;
    const after = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "custom",
      customInstruction: "Review this",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 1,
      rangeEnd: 2,
    })).annotation;
    const changed = await save(service, session, 1, "", "aXb");
    expect(findAnnotation(changed, caret.annotationId)).toMatchObject({ rangeStart: 1, rangeEnd: 1 });
    expect(findAnnotation(changed, after.annotationId)).toMatchObject({
      rangeStart: 2,
      rangeEnd: 3,
      selectedText: "b",
    });
  });

  it("applies one annotation, safely rebases another, and supports a CAS-safe undo", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service, "Maya");
    await save(service, session, 0, "", "alpha beta gamma");
    const first = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "custom",
      customInstruction: "Uppercase this",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 0,
      rangeEnd: 5,
    })).annotation;
    const second = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "custom",
      customInstruction: "Polish this",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 11,
      rangeEnd: 16,
    })).annotation;

    const applyInput = {
      annotationId: first.annotationId,
      expectedRevision: 1,
      requestId: randomUUID(),
      replacementText: "A",
      changeSummary: "Condense alpha",
    };
    const applied = unwrap(await service.applyAgentAnnotation(session.agentSessionToken, applyInput));
    expect(applied.surface.document).toMatchObject({ body: "A beta gamma", revision: 2 });
    expect(applied.surface.document.lastEditor).toMatchObject({ actorType: "AGENT", origin: "WEBMCP" });
    expect(applied.annotation).toMatchObject({ annotationId: first.annotationId, status: "COMPLETED", resolvedRevision: 2 });
    expect(findAnnotation(applied.surface, second.annotationId)).toMatchObject({
      status: "PENDING",
      rangeStart: 7,
      rangeEnd: 12,
      selectedText: "gamma",
      anchorRevision: 2,
    });
    expect(applied.change).toEqual({
      summary: "Condense alpha",
      fromRevision: 1,
      toRevision: 2,
      annotationId: first.annotationId,
    });
    expect(applied.undoAvailable).toBe(true);
    expect(unwrap(await service.applyAgentAnnotation(session.agentSessionToken, applyInput))).toEqual(applied);
    expect(await service.cancelAnnotation(session.humanSessionToken, {
      annotationId: first.annotationId,
      requestId: randomUUID(),
    })).toMatchObject({ ok: false, code: "STALE_ANNOTATION_CONTEXT" });

    const undone = unwrap(await service.undoAgentEdit(session.humanSessionToken, {
      expectedRevision: 2,
      agentRevision: 2,
      requestId: randomUUID(),
    }));
    expect(undone.document).toMatchObject({ body: "alpha beta gamma", revision: 3 });
    expect(undone.undoAgentEdit).toBeNull();
    expect(findAnnotation(undone, second.annotationId)).toMatchObject({
      status: "PENDING",
      rangeStart: 11,
      rangeEnd: 16,
      selectedText: "gamma",
      anchorRevision: 3,
    });
  });

  it("completes an identical replacement without changing revision or replacing existing undo", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service);
    await save(service, session, 0, "", "alpha beta");
    const changed = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "custom",
      customInstruction: "Shorten this",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 0,
      rangeEnd: 5,
    })).annotation;
    const firstOutcome = unwrap(await service.applyAgentAnnotation(session.agentSessionToken, {
      annotationId: changed.annotationId,
      expectedRevision: 1,
      requestId: randomUUID(),
      replacementText: "A",
      changeSummary: "Shorten alpha",
    }));
    const noop = (await annotate(service, session, {
      expectedRevision: 2,
      presetId: "custom",
      customInstruction: "Check this",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 0,
      rangeEnd: 1,
    })).annotation;
    const noOpOutcome = unwrap(await service.applyAgentAnnotation(session.agentSessionToken, {
      annotationId: noop.annotationId,
      expectedRevision: 2,
      requestId: randomUUID(),
      replacementText: "A",
      changeSummary: "No change needed",
    }));
    expect(noOpOutcome.surface.document.revision).toBe(2);
    expect(noOpOutcome.annotation).toMatchObject({ status: "COMPLETED", resolvedRevision: 2 });
    expect(noOpOutcome.change).toMatchObject({ fromRevision: 2, toRevision: 2 });
    expect(noOpOutcome.undoAvailable).toBe(false);
    expect(noOpOutcome.surface.undoAgentEdit).toEqual(firstOutcome.surface.undoAgentEdit);
    expect(unwrap(await service.undoAgentEdit(session.humanSessionToken, {
      expectedRevision: 2,
      agentRevision: 2,
      requestId: randomUUID(),
    })).document.body).toBe("alpha beta");
  });

  it("human-gates stages, reanchors existing work, and creates exactly one target-stage preparation on forward moves", async () => {
    const service = new LocalDocumentService();
    const session = await launch(service, "Maya");
    await save(service, session, 0, "", "Draft body");
    const existing = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "custom",
      customInstruction: "Keep this request",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "SELECTION",
      rangeStart: 0,
      rangeEnd: 5,
    })).annotation;

    const researching = unwrap(await service.setStage(session.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      stage: "RESEARCHING",
    }));
    expect(researching.document).toMatchObject({ stage: "RESEARCHING", revision: 2 });
    expect(findAnnotation(researching, existing.annotationId)).toMatchObject({
      status: "PENDING",
      anchorRevision: 2,
      stageAtCreation: "BRAINSTORMING",
    });
    const preparation = researching.annotations.find((annotation) => annotation.kind === "STAGE_PREPARATION");
    expect(preparation).toMatchObject({
      ...DOCUMENT_STAGE_PREPARATIONS.RESEARCHING,
      status: "PENDING",
      stageAtCreation: "RESEARCHING",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      selectedText: "Draft body",
      createdRevision: 2,
      anchorRevision: 2,
      createdBy: { memberId: session.selfMemberId, displayName: "Maya" },
      transition: { fromStage: "BRAINSTORMING", toStage: "RESEARCHING" },
    });

    const backward = unwrap(await service.setStage(session.humanSessionToken, {
      expectedRevision: 2,
      requestId: randomUUID(),
      stage: "BRAINSTORMING",
    }));
    expect(backward.document.revision).toBe(3);
    expect(backward.annotations.filter((annotation) => annotation.kind === "STAGE_PREPARATION")).toHaveLength(1);
    expect(backward.annotations.filter((annotation) => annotation.status === "PENDING")
      .every((annotation) => annotation.anchorRevision === 3)).toBe(true);

    const noOp = unwrap(await service.setStage(session.humanSessionToken, {
      expectedRevision: 3,
      requestId: randomUUID(),
      stage: "BRAINSTORMING",
    }));
    expect(noOp.document.revision).toBe(3);
    expect(noOp.annotations).toEqual(backward.annotations);

    const skipped = unwrap(await service.setStage(session.humanSessionToken, {
      expectedRevision: 3,
      requestId: randomUUID(),
      stage: "READY_TO_SHIP",
    }));
    expect(skipped.document.revision).toBe(4);
    expect(skipped.annotations.filter((annotation) => annotation.kind === "STAGE_PREPARATION")).toHaveLength(2);
    expect(skipped.annotations.find((annotation) => (
      annotation.kind === "STAGE_PREPARATION" && annotation.createdRevision === 4
    ))).toMatchObject({
      ...DOCUMENT_STAGE_PREPARATIONS.READY_TO_SHIP,
      transition: { fromStage: "BRAINSTORMING", toStage: "READY_TO_SHIP" },
    });
  });

  it("enforces 50/member and 100/document pending limits without mutating a blocked forward stage", async () => {
    const service = new LocalDocumentService();
    const maya = await launch(service, "Maya");
    const jordan = unwrap(await service.join({ shareToken: maya.shareToken, displayName: "Jordan" }));
    const casey = unwrap(await service.join({ shareToken: maya.shareToken, displayName: "Casey" }));
    await save(service, maya, 0, "", "x");

    for (const session of [maya, jordan]) {
      for (let index = 0; index < 50; index += 1) {
        unwrap(await service.createAnnotation(session.humanSessionToken, {
          expectedRevision: 1,
          requestId: randomUUID(),
          presetId: "custom",
          customInstruction: `Request ${index}`,
          source: "ANNOTATION_RAIL",
          targetField: "BODY",
          targetKind: "DOCUMENT",
          rangeStart: 0,
          rangeEnd: 1,
        }));
      }
      expect(await service.createAnnotation(session.humanSessionToken, {
        expectedRevision: 1,
        requestId: randomUUID(),
        presetId: "custom",
        customInstruction: "One too many",
        source: "ANNOTATION_RAIL",
        targetField: "BODY",
        targetKind: "DOCUMENT",
        rangeStart: 0,
        rangeEnd: 1,
      })).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    }
    expect(await service.createAnnotation(casey.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      presetId: "custom",
      customInstruction: "Document is full",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: 1,
    })).toMatchObject({ ok: false, code: "RATE_LIMITED" });

    const blocked = await service.setStage(casey.humanSessionToken, {
      expectedRevision: 1,
      requestId: randomUUID(),
      stage: "RESEARCHING",
    });
    expect(blocked).toMatchObject({
      ok: false,
      code: "RATE_LIMITED",
      currentSurface: { document: { stage: "BRAINSTORMING", revision: 1 } },
    });
    const authoritative = unwrap(await service.inspect(maya.humanSessionToken));
    expect(authoritative.document).toMatchObject({ stage: "BRAINSTORMING", revision: 1 });
    expect(authoritative.annotations.filter((annotation) => annotation.status === "PENDING")).toHaveLength(100);
  });

  it("returns every pending annotation plus only the latest 20 resolved in deterministic order", async () => {
    let now = Date.parse("2026-08-31T00:00:00.000Z");
    const service = new LocalDocumentService({ now: () => now });
    const session = await launch(service);
    await save(service, session, 0, "", "x");
    const resolvedIds: string[] = [];
    for (let index = 0; index < 22; index += 1) {
      now += 1;
      const annotation = (await annotate(service, session, {
        expectedRevision: 1,
        presetId: "custom",
        customInstruction: `Resolved ${index}`,
        source: "ANNOTATION_RAIL",
        targetField: "BODY",
        targetKind: "DOCUMENT",
        rangeStart: 0,
        rangeEnd: 1,
      })).annotation;
      resolvedIds.push(annotation.annotationId);
      now += 1;
      unwrap(await service.cancelAnnotation(session.humanSessionToken, {
        annotationId: annotation.annotationId,
        requestId: randomUUID(),
      }));
    }
    now += 1;
    const pending = (await annotate(service, session, {
      expectedRevision: 1,
      presetId: "custom",
      customInstruction: "Still pending",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "DOCUMENT",
      rangeStart: 0,
      rangeEnd: 1,
    })).annotation;
    const surface = unwrap(await service.inspect(session.humanSessionToken));
    expect(surface.annotations).toHaveLength(21);
    expect(surface.annotations.some((annotation) => annotation.annotationId === resolvedIds[0])).toBe(false);
    expect(surface.annotations.some((annotation) => annotation.annotationId === resolvedIds[1])).toBe(false);
    expect(surface.annotations.some((annotation) => annotation.annotationId === pending.annotationId)).toBe(true);
    expect(surface.annotations.map((annotation) => `${annotation.createdAt}:${annotation.annotationId}`))
      .toEqual([...surface.annotations]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
          || left.annotationId.localeCompare(right.annotationId))
        .map((annotation) => `${annotation.createdAt}:${annotation.annotationId}`));
  });

  it("expires presence after fifteen seconds and rejects paired-agent heartbeats", async () => {
    let now = Date.parse("2026-08-31T00:00:00.000Z");
    const service = new LocalDocumentService({ now: () => now });
    const first = await launch(service, "Maya");
    const second = unwrap(await service.join({ shareToken: first.shareToken, displayName: "Jordan" }));
    expect(unwrap(await service.inspect(first.humanSessionToken)).presence).toHaveLength(2);

    now += DOCUMENT_PRESENCE_TTL_MS - 1;
    expect(unwrap(await service.inspect(first.humanSessionToken)).presence).toHaveLength(2);
    now += 1;
    expect(unwrap(await service.inspect(first.humanSessionToken)).presence).toHaveLength(0);

    const touched = unwrap(await service.touchPresence(second.humanSessionToken, {
      state: "EDITING",
      field: "BODY",
      isTyping: true,
      selectionStart: 0,
      selectionEnd: 0,
      observedRevision: 0,
    }));
    expect(touched.presence[0]).toMatchObject({ displayName: "Jordan", field: "BODY", isTyping: true });
    expect(await service.touchPresence(second.agentSessionToken, {
      state: "VIEWING",
      field: null,
      isTyping: false,
      selectionStart: null,
      selectionEnd: null,
      observedRevision: 0,
    })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("honors AbortSignal cancellation", async () => {
    const service = new LocalDocumentService();
    const controller = new AbortController();
    controller.abort("Stop now");
    await expect(service.launch({}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
