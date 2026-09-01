import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  DocumentMemoryEvent,
  DocumentPresence,
  DocumentSurfaceV3,
  DocumentWorkOrder,
} from "./contracts";
import { reconcileDocumentWorkspaceSurface } from "./workspace-surface-reconciliation";

const presence = (memberId: string, lastSeenAt: string): DocumentPresence => ({
  memberId,
  displayName: memberId,
  color: "#2563eb",
  state: "VIEWING",
  field: null,
  isTyping: false,
  selectionStart: null,
  selectionEnd: null,
  observedRevision: 1,
  lastSeenAt,
});

const order = (status: "PENDING" | "CANCELLED", updatedAt: string): DocumentWorkOrder => {
  const common = {
  workOrderId: "00000000-0000-4000-8000-000000000001",
  intent: "CUSTOM",
  source: "KEYBOARD",
  instruction: "Improve this",
  anchor: {
    field: "BODY",
    rangeStart: 0,
    rangeEnd: 4,
    selectedText: "Text",
    createdRevision: 1,
    anchorRevision: 1,
  },
  creatorMemberId: "creator",
  creatorDisplayName: "Creator",
  assignedToMemberId: "assignee",
  assignedToDisplayName: "Assignee",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt,
    proposal: null,
    decision: null,
  } as const;
  return status === "PENDING"
    ? { ...common, status, resolvedAt: null }
    : { ...common, status, resolvedAt: updatedAt };
};

const event = (activityVersion: number): DocumentMemoryEvent => ({
  eventId: `00000000-0000-4000-8000-${String(activityVersion).padStart(12, "0")}`,
  activityVersion,
  kind: "WORK_CREATED",
  actor: { displayName: "Creator", actorType: "HUMAN" },
  origin: "ORDINARY_UI",
  baseRevision: 1,
  resultRevision: 1,
  workOrderId: null,
  linkedWorkOrderIds: [],
  changedFields: [],
  targetExcerpt: null,
  instructionExcerpt: null,
  proposalExcerpt: null,
  changeSummary: null,
  diffs: [],
  rationale: null,
  createdAt: "2026-09-01T00:00:00.000Z",
});

function surface(revision: number, activityVersion: number): DocumentSurfaceV3 {
  return {
    document: {
      id: "document",
      protocolVersion: 3,
      title: "Title",
      body: `Body ${revision}`,
      revision,
      activityVersion,
      updatedAt: "2026-09-01T00:00:00.000Z",
      lastEditor: null,
    },
    presence: [],
    workOrders: [],
    memory: [],
  };
}

test("equal revision accepts higher activity while merging independent presence", () => {
  const current = { ...surface(1, 1), presence: [presence("old", "2026-09-01T00:00:10.000Z")] };
  const incoming = {
    ...surface(1, 2),
    workOrders: [order("PENDING", "2026-09-01T00:00:20.000Z")],
    memory: [event(2)],
    presence: [presence("new", "2026-09-01T00:00:20.000Z")],
  };
  const result = reconcileDocumentWorkspaceSurface(current, incoming);
  assert.equal(result.document.activityVersion, 2);
  assert.equal(result.workOrders.length, 1);
  assert.deepEqual(result.presence.map((entry) => entry.memberId), ["new", "old"]);
});

test("lower revision and activity cannot regress authoritative state", () => {
  const current = { ...surface(2, 4), memory: [event(4)] };
  const delayed = surface(1, 5);
  const result = reconcileDocumentWorkspaceSurface(current, delayed);
  assert.equal(result.document.revision, 2);
  assert.equal(result.document.activityVersion, 4);
});

test("same counters merge lifecycle monotonically and deduplicate memory", () => {
  const current = {
    ...surface(1, 2),
    workOrders: [order("CANCELLED", "2026-09-01T00:00:20.000Z")],
    memory: [event(1), event(2)],
  };
  const incoming = {
    ...surface(1, 2),
    workOrders: [order("PENDING", "2026-09-01T00:00:00.000Z")],
    memory: [event(2)],
  };
  const result = reconcileDocumentWorkspaceSurface(current, incoming);
  assert.equal(result.workOrders[0]?.status, "CANCELLED");
  assert.deepEqual(result.memory.map((entry) => entry.activityVersion), [1, 2]);
});
