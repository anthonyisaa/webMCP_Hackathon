import {
  DOCUMENT_WORKSPACE_TERMINAL_HISTORY_LIMIT,
  type DocumentMemoryEvent,
  type DocumentPresence,
  type DocumentSurfaceV3,
  type DocumentWorkOrder,
} from "./contracts";

const PRESENCE_TTL_MS = 15_000;

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function mergePresence(
  current: DocumentPresence[],
  incoming: DocumentPresence[],
): DocumentPresence[] {
  const byMember = new Map(
    current.map((entry) => [entry.memberId, entry] as const),
  );
  for (const entry of incoming) {
    const existing = byMember.get(entry.memberId);
    if (!existing || timestamp(entry.lastSeenAt) > timestamp(existing.lastSeenAt)) {
      byMember.set(entry.memberId, entry);
    }
  }

  const frontier = Math.max(
    Number.NEGATIVE_INFINITY,
    ...[...byMember.values()].map((entry) => timestamp(entry.lastSeenAt)),
  );
  return [...byMember.values()]
    .filter((entry) => !Number.isFinite(frontier)
      || timestamp(entry.lastSeenAt) >= frontier - PRESENCE_TTL_MS)
    .sort((left, right) => left.displayName.localeCompare(right.displayName)
      || left.memberId.localeCompare(right.memberId));
}

function workStatusRank(status: DocumentWorkOrder["status"]): number {
  if (status === "PENDING") return 0;
  if (status === "PROPOSED") return 1;
  return 2;
}

function mergeWorkOrders(
  current: DocumentWorkOrder[],
  incoming: DocumentWorkOrder[],
): DocumentWorkOrder[] {
  const byId = new Map(
    current.map((order) => [order.workOrderId, order] as const),
  );
  for (const order of incoming) {
    const existing = byId.get(order.workOrderId);
    if (!existing
      || workStatusRank(order.status) > workStatusRank(existing.status)
      || (workStatusRank(order.status) === workStatusRank(existing.status)
        && order.updatedAt > existing.updatedAt)) {
      byId.set(order.workOrderId, order);
    }
  }

  const active: DocumentWorkOrder[] = [];
  const terminal: DocumentWorkOrder[] = [];
  for (const order of byId.values()) {
    if (order.status === "PENDING" || order.status === "PROPOSED") active.push(order);
    else terminal.push(order);
  }
  const boundedTerminalIds = new Set(
    terminal
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)
        || right.workOrderId.localeCompare(left.workOrderId))
      .slice(0, DOCUMENT_WORKSPACE_TERMINAL_HISTORY_LIMIT)
      .map((order) => order.workOrderId),
  );
  return [...active, ...terminal.filter((order) => boundedTerminalIds.has(order.workOrderId))]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
      || left.workOrderId.localeCompare(right.workOrderId));
}

function mergeMemory(
  current: DocumentMemoryEvent[],
  incoming: DocumentMemoryEvent[],
): DocumentMemoryEvent[] {
  const byId = new Map(
    current.map((event) => [event.eventId, event] as const),
  );
  for (const event of incoming) byId.set(event.eventId, event);
  return [...byId.values()]
    .sort((left, right) => left.activityVersion - right.activityVersion
      || left.eventId.localeCompare(right.eventId))
    .slice(-20);
}

/**
 * Reconciles independently delivered v3 snapshots. Document content follows revision,
 * work and memory follow activityVersion, and presence follows its own heartbeat.
 */
export function reconcileDocumentWorkspaceSurface(
  current: DocumentSurfaceV3,
  incoming: DocumentSurfaceV3,
): DocumentSurfaceV3 {
  if (current.document.id !== incoming.document.id) return incoming;

  const presence = mergePresence(current.presence, incoming.presence);
  if (incoming.document.revision > current.document.revision) {
    return { ...incoming, presence };
  }
  if (incoming.document.revision < current.document.revision) {
    return { ...current, presence };
  }

  if (incoming.document.activityVersion > current.document.activityVersion) {
    return { ...incoming, presence };
  }
  if (incoming.document.activityVersion < current.document.activityVersion) {
    return { ...current, presence };
  }

  return {
    ...current,
    presence,
    workOrders: mergeWorkOrders(current.workOrders, incoming.workOrders),
    memory: mergeMemory(current.memory, incoming.memory),
  };
}
