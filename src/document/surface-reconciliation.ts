import {
  DOCUMENT_RESOLVED_ANNOTATION_HISTORY_LIMIT,
  type DocumentAnnotation,
  type DocumentPresence,
  type DocumentSurface,
} from "./contracts";

// Presence expires on the service after fifteen seconds. Using the freshest observed
// heartbeat as the deterministic time frontier lets a delayed response retain members
// that are still plausibly active without keeping already-expired entries forever.
const DOCUMENT_PRESENCE_TTL_MS = 15_000;

function compareCreated(
  left: DocumentAnnotation,
  right: DocumentAnnotation,
): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.annotationId.localeCompare(right.annotationId)
  );
}

function compareResolvedNewestFirst(
  left: Exclude<DocumentAnnotation, { status: "PENDING" }>,
  right: Exclude<DocumentAnnotation, { status: "PENDING" }>,
): number {
  return (
    right.resolvedAt.localeCompare(left.resolvedAt) ||
    right.annotationId.localeCompare(left.annotationId)
  );
}

function mergeAnnotation(
  current: DocumentAnnotation | undefined,
  incoming: DocumentAnnotation,
): DocumentAnnotation {
  if (!current) return incoming;
  if (current.status !== "PENDING") return current;
  return incoming.status === "PENDING" ? current : incoming;
}

function mergeEqualRevisionAnnotations(
  current: DocumentAnnotation[],
  incoming: DocumentAnnotation[],
): DocumentAnnotation[] {
  const byId = new Map(
    current.map((annotation) => [annotation.annotationId, annotation] as const),
  );
  for (const annotation of incoming) {
    byId.set(annotation.annotationId, mergeAnnotation(byId.get(annotation.annotationId), annotation));
  }

  const pending: DocumentAnnotation[] = [];
  const resolved: Array<Exclude<DocumentAnnotation, { status: "PENDING" }>> = [];
  for (const annotation of byId.values()) {
    if (annotation.status === "PENDING") pending.push(annotation);
    else resolved.push(annotation);
  }

  return [
    ...pending,
    ...resolved
      .sort(compareResolvedNewestFirst)
      .slice(0, DOCUMENT_RESOLVED_ANNOTATION_HISTORY_LIMIT),
  ].sort(compareCreated);
}

function presenceTimestamp(presence: DocumentPresence): number {
  const parsed = Date.parse(presence.lastSeenAt);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function mergeEqualRevisionPresence(
  current: DocumentPresence[],
  incoming: DocumentPresence[],
): DocumentPresence[] {
  const byMemberId = new Map(
    current.map((presence) => [presence.memberId, presence] as const),
  );
  for (const presence of incoming) {
    const existing = byMemberId.get(presence.memberId);
    if (!existing || presence.lastSeenAt > existing.lastSeenAt) {
      byMemberId.set(presence.memberId, presence);
    }
  }

  const freshestTimestamp = Math.max(
    ...[...byMemberId.values()].map(presenceTimestamp),
  );
  const expiryCutoff = freshestTimestamp - DOCUMENT_PRESENCE_TTL_MS;
  return [...byMemberId.values()]
    .filter(
      (presence) =>
        !Number.isFinite(freshestTimestamp) ||
        presenceTimestamp(presence) >= expiryCutoff,
    )
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.memberId.localeCompare(right.memberId),
    );
}

/**
 * Reconciles independently delivered snapshots without allowing annotation-only or
 * presence-only responses at one document revision to move client state backwards.
 */
export function reconcileDocumentSurface(
  current: DocumentSurface,
  incoming: DocumentSurface,
): DocumentSurface {
  if (current.document.id !== incoming.document.id) return incoming;

  if (incoming.document.revision > current.document.revision) return incoming;
  if (incoming.document.revision < current.document.revision) return current;

  return {
    document: current.document,
    presence: mergeEqualRevisionPresence(current.presence, incoming.presence),
    annotations: mergeEqualRevisionAnnotations(
      current.annotations,
      incoming.annotations,
    ),
    undoAgentEdit: current.undoAgentEdit,
  };
}
