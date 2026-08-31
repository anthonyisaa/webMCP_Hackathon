import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  DocumentAnnotation,
  DocumentAnnotationStatus,
  DocumentPresence,
  DocumentSurface,
  PendingDocumentAnnotation,
} from "./contracts";
import { reconcileDocumentSurface } from "./surface-reconciliation";

function annotation(
  annotationId: string,
  status: DocumentAnnotationStatus,
  timestamp: string,
): DocumentAnnotation {
  const pending = {
    annotationId,
    kind: "HUMAN_REQUEST",
    presetId: "custom",
    label: "Ask agent…",
    instruction: `Instruction ${annotationId}`,
    stageAtCreation: "BRAINSTORMING",
    source: "ANNOTATION_RAIL",
    targetField: "BODY",
    targetKind: "DOCUMENT",
    rangeStart: 0,
    rangeEnd: 4,
    selectedText: "Text",
    createdRevision: 4,
    anchorRevision: 4,
    createdBy: { memberId: "member-one", displayName: "Guest 1" },
    createdAt: timestamp,
    transition: null,
    status: "PENDING",
  } satisfies PendingDocumentAnnotation;
  if (status === "PENDING") return pending;
  return {
    ...pending,
    status,
    resolvedAt: timestamp,
    resolvedRevision: 4,
  };
}

function presence(
  memberId: string,
  lastSeenAt: string,
  selectionStart: number,
): DocumentPresence {
  return {
    memberId,
    displayName: memberId,
    color: "#2563eb",
    state: "EDITING",
    field: "BODY",
    isTyping: true,
    selectionStart,
    selectionEnd: selectionStart,
    observedRevision: 4,
    lastSeenAt,
  };
}

function surface(
  revision: number,
  annotations: DocumentAnnotation[],
  presences: DocumentPresence[] = [],
  body = "Current text",
): DocumentSurface {
  return {
    document: {
      id: "document-one",
      title: "Working note",
      body,
      stage: "BRAINSTORMING",
      revision,
      updatedAt: `2026-08-31T02:00:0${revision}.000Z`,
      lastEditor: null,
    },
    presence: presences,
    annotations,
    undoAgentEdit: null,
  };
}

test("equal revisions monotonically merge annotation lifecycle and presence", () => {
  const pendingA = annotation("annotation-a", "PENDING", "2026-08-31T02:00:01.000Z");
  const terminalB = annotation("annotation-b", "CANCELLED", "2026-08-31T02:00:02.000Z");
  const pendingC = annotation("annotation-c", "PENDING", "2026-08-31T02:00:03.000Z");
  const current = surface(
    4,
    [pendingA, terminalB, pendingC],
    [
      presence("member-current", "2026-08-31T02:00:20.000Z", 20),
      presence("member-missing-but-live", "2026-08-31T02:00:10.000Z", 10),
      presence("member-expired", "2026-08-31T02:00:09.000Z", 9),
    ],
  );
  const incoming = surface(
    4,
    [
      annotation("annotation-a", "COMPLETED", "2026-08-31T02:00:01.000Z"),
      annotation("annotation-b", "PENDING", "2026-08-31T02:00:02.000Z"),
      annotation("annotation-d", "PENDING", "2026-08-31T02:00:04.000Z"),
    ],
    [
      presence("member-current", "2026-08-31T02:00:15.000Z", 15),
      presence("member-new", "2026-08-31T02:00:25.000Z", 25),
    ],
  );

  const reconciled = reconcileDocumentSurface(current, incoming);
  assert.deepEqual(
    reconciled.annotations.map(({ annotationId, status }) => ({ annotationId, status })),
    [
      { annotationId: "annotation-a", status: "COMPLETED" },
      { annotationId: "annotation-b", status: "CANCELLED" },
      { annotationId: "annotation-c", status: "PENDING" },
      { annotationId: "annotation-d", status: "PENDING" },
    ],
  );
  assert.deepEqual(
    reconciled.presence.map(({ memberId, selectionStart }) => ({ memberId, selectionStart })),
    [
      { memberId: "member-current", selectionStart: 20 },
      { memberId: "member-missing-but-live", selectionStart: 10 },
      { memberId: "member-new", selectionStart: 25 },
    ],
  );
});

test("equal revisions cap resolved history by resolution recency then sort by creation", () => {
  const annotations = Array.from({ length: 22 }, (_, index) =>
    annotation(
      `annotation-${String(index).padStart(2, "0")}`,
      "COMPLETED",
      `2026-08-31T02:00:${String(index).padStart(2, "0")}.000Z`,
    ),
  );
  const reconciled = reconcileDocumentSurface(
    surface(4, annotations.slice(0, 20)),
    surface(4, annotations.slice(20)),
  );

  assert.equal(reconciled.annotations.length, 20);
  assert.deepEqual(
    reconciled.annotations.map((entry) => entry.annotationId),
    annotations.slice(2).map((entry) => entry.annotationId),
  );
});

test("higher revisions replace the surface and lower revisions cannot regress it", () => {
  const terminal = annotation(
    "annotation-a",
    "COMPLETED",
    "2026-08-31T02:00:01.000Z",
  );
  const current = surface(5, [terminal], [], "Revision five");
  const delayed = surface(
    4,
    [annotation("annotation-a", "PENDING", "2026-08-31T02:00:01.000Z")],
    [],
    "Revision four",
  );
  assert.equal(reconcileDocumentSurface(current, delayed), current);

  const newer = surface(6, [], [], "Revision six");
  assert.equal(reconcileDocumentSurface(current, newer), newer);
});
