import type { IssuePresence, IssueWorkspaceSurface } from "@/repository/contracts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergePresence(
  current: readonly IssuePresence[],
  incoming: readonly IssuePresence[],
): IssuePresence[] {
  const byMember = new Map<string, IssuePresence>();
  for (const presence of [...current, ...incoming]) {
    const existing = byMember.get(presence.memberId);
    if (!existing
      || presence.lastSeenAt > existing.lastSeenAt
      || (presence.lastSeenAt === existing.lastSeenAt
        && presence.observedRevision > existing.observedRevision)) {
      byMember.set(presence.memberId, clone(presence));
    }
  }
  return [...byMember.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
    || left.memberId.localeCompare(right.memberId));
}

/**
 * Reconciles delayed HTTP/tool surfaces without allowing an older response to hide
 * content or same-revision collaboration activity. Presence is an independent,
 * last-observation stream and is merged regardless of which durable surface wins.
 */
export function reconcileIssueSurface(
  current: IssueWorkspaceSurface,
  incoming: IssueWorkspaceSurface,
): IssueWorkspaceSurface {
  const currentRevision = current.document.revision;
  const incomingRevision = incoming.document.revision;
  let durable = current;
  if (incomingRevision > currentRevision) {
    durable = incoming;
  } else if (
    incomingRevision === currentRevision
    && incoming.document.activityVersion > current.document.activityVersion
  ) {
    durable = incoming;
  }
  return {
    ...clone(durable),
    presence: mergePresence(current.presence, incoming.presence),
  };
}
