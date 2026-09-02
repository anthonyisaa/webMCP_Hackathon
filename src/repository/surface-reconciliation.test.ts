import assert from "node:assert/strict";
import { test } from "vitest";

import type { IssueWorkspaceSurface } from "@/repository/contracts";
import { reconcileIssueSurface } from "./surface-reconciliation";

function surface(revision: number, activityVersion: number, body: string): IssueWorkspaceSurface {
  return {
    document: {
      id: "00000000-0000-4000-8000-000000000001",
      protocolVersion: 4,
      kind: "POSTMORTEM",
      title: "Incident",
      body,
      revision,
      activityVersion,
      updatedAt: `2026-09-01T00:00:0${revision}.000Z`,
      lastRevision: {
        revisionId: "00000000-0000-4000-8000-000000000002",
        author: {
          actorType: "HUMAN",
          displayName: "Priya",
          member: {
            memberId: "00000000-0000-4000-8000-000000000003",
            displayName: "Priya",
          },
          agentLabel: null,
        },
        authority: "HUMAN",
        summary: "Save",
      },
    },
    members: [],
    agents: [],
    presence: [],
    tasks: [],
    threads: [],
    history: [],
    hasMoreHistory: false,
  };
}

test("higher revision wins content and delayed lower revisions cannot regress it", () => {
  const current = surface(3, 8, "r3");
  const delayed = surface(2, 99, "r2");
  assert.equal(reconcileIssueSurface(current, delayed).document.body, "r3");
  assert.equal(reconcileIssueSurface(delayed, current).document.body, "r3");
});

test("profile-only updates merge independently from document counters", () => {
  const current = surface(3, 9, "r3");
  current.agents = [{
    profileId: "00000000-0000-4000-8000-000000000004",
    member: { memberId: "00000000-0000-4000-8000-000000000003", displayName: "Priya" },
    name: "Databot",
    identitySource: "SELF_DECLARED",
    firstSeenAt: "2026-09-01T00:00:01.000Z",
    lastAccessedAt: "2026-09-01T00:00:08.000Z",
    accessCount: 1,
  }];
  const incoming = surface(3, 9, "r3");
  incoming.agents = [{
    ...current.agents[0]!,
    name: "Numbers",
    lastAccessedAt: "2026-09-01T00:00:09.000Z",
    accessCount: 2,
  }];
  const merged = reconcileIssueSurface(current, incoming);
  assert.deepEqual(merged.agents.map(({ name, accessCount }) => [name, accessCount]), [["Numbers", 2]]);
});

test("higher activity wins at equal revision while presence merges independently", () => {
  const current = surface(3, 8, "r3");
  current.tasks = [{ taskId: "old" } as never];
  current.presence = [{
    memberId: "a",
    displayName: "A",
    color: "#000",
    state: "VIEWING",
    field: null,
    isTyping: false,
    selectionStart: null,
    selectionEnd: null,
    observedRevision: 3,
    lastSeenAt: "2026-09-01T00:00:08.000Z",
  }];
  const incoming = surface(3, 9, "r3");
  incoming.tasks = [{ taskId: "new" } as never];
  incoming.presence = [{
    ...current.presence[0]!,
    state: "EDITING",
    lastSeenAt: "2026-09-01T00:00:09.000Z",
  }];
  const merged = reconcileIssueSurface(current, incoming);
  assert.equal(merged.document.activityVersion, 9);
  assert.equal(merged.tasks[0]?.taskId, "new");
  assert.equal(merged.presence[0]?.state, "EDITING");
});
