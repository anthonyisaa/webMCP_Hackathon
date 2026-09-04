import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type {
  IssueAgentActorSnapshot,
  IssueMemberSnapshot,
  IssueRevisionProvenance,
  IssueRevisionSummary,
  IssueSelectionAnchor,
  IssueTask,
  IssueThread,
  IssueWorkspaceSurface,
} from "@/repository/contracts";
import {
  relayAccessProfileForManagedHandle,
  type ManagedAgentDirectoryEntry,
} from "@/agent-relay/contracts";

import { RepositoryLanding } from "./RepositoryLanding";
import {
  REPOSITORY_AGENT_CHANGE_HIGHLIGHT_MS,
  repositoryAgentChangeHighlightTransition,
  repositoryCanApplyRevisionSnapshot,
  repositoryCanReceiveSessionResult,
  repositoryClampCodePoints,
  repositoryCommentStartsWithAgent,
  repositoryDirectoryEntryKey,
  repositoryDraftMatchesDocument,
  repositoryHeadAgentChangeHighlight,
  repositoryNextHistoryHasMore,
  repositoryLivingDocumentSheets,
  repositoryOpenAnchorHighlights,
  repositoryProvenanceSummary,
  repositoryRevisionLineageLabel,
  repositorySectionBodySelection,
  repositorySessionIdentity,
  repositoryShouldAdoptRevisionMutation,
} from "./RepositoryWorkspace";
import { POSTMORTEM_EXAMPLE } from "@/domain/repository-examples";

test("landing makes nickname, managed directory, and the two guided demos explicit", () => {
  const markup = renderToStaticMarkup(createElement(RepositoryLanding, {
    onCreate() {},
    onOpenExample() {},
  }));
  assert.match(markup, /What should collaborators call you\?/u);
  assert.match(markup, /Choose the nickname collaborators will see\./u);
  assert.match(markup, /@Data/u);
  assert.match(markup, /@Code/u);
  assert.match(markup, /@General/u);
  assert.match(markup, /company-set website tools/u);
  assert.match(markup, /@Code uses Repository tools/u);
  assert.match(markup, /15-second check is recovery/u);
  assert.match(markup, /data-document-kind="POSTMORTEM"/u);
  assert.match(markup, /data-document-kind="PRODUCT_DOCUMENT"/u);
  assert.equal((markup.match(/data-document-kind=/gu) ?? []).length, 2);
  assert.match(markup, /Open live postmortem/u);
  assert.match(markup, /Open live product document/u);
  assert.match(markup, /Application-owned WebMCP relay · GPT-5.6 Luna/u);
  assert.match(markup, /Highlight\. @ a bot\. Run/u);
  assert.match(markup, /View the 11-slide story/u);
});

test("seeded examples become exactly two lossless visual sheets", () => {
  const sheets = repositoryLivingDocumentSheets("POSTMORTEM", POSTMORTEM_EXAMPLE.body);
  assert.ok(sheets);
  assert.equal(sheets.length, 2);
  assert.equal(`${sheets[0].markdown}\n${sheets[1].markdown}`, POSTMORTEM_EXAMPLE.body);
  assert.equal(repositoryLivingDocumentSheets("POSTMORTEM", "A blank user document"), null);
});

test("guided whole-section selection stays exact after an access-granted revision", () => {
  const body = "## Summary\n\nBefore 😀\n\n## Root cause\n\nTrigger first.\nAmplifier second.\n\n## Actions\n\nFix it.";
  const selection = repositorySectionBodySelection(body, "## Root cause");
  assert.deepEqual(selection, {
    field: "BODY",
    rangeStart: Array.from(body.slice(0, body.indexOf("Trigger first."))).length,
    rangeEnd: Array.from(body.slice(0, body.indexOf("\n\n## Actions"))).length,
    selectedText: "Trigger first.\nAmplifier second.",
  });
  assert.equal(repositorySectionBodySelection(body, "## Missing"), null);
});

test("same-session collaboration updates do not reset workspace identity", () => {
  const surface = (documentId: string, revision: number) => ({ document: { id: documentId, revision } }) as IssueWorkspaceSurface;
  const initial = repositorySessionIdentity({ sessionInstanceId: "browser-a", surface: surface("doc-a", 1) });
  assert.equal(repositorySessionIdentity({ sessionInstanceId: "browser-a", surface: surface("doc-a", 8) }), initial);
  assert.notEqual(repositorySessionIdentity({ sessionInstanceId: "browser-a", surface: surface("doc-b", 1) }), initial);
});

test("late surface results cannot cross mounted workspace identities", () => {
  const surface = (id: string) => ({ document: { id } }) as IssueWorkspaceSurface;
  const session = { sessionInstanceId: "browser-a", surface: surface("doc-a") };
  const identity = repositorySessionIdentity(session);
  assert.equal(repositoryCanReceiveSessionResult(identity, identity, session, "doc-a"), true);
  assert.equal(repositoryCanReceiveSessionResult("browser-b:doc-b", identity, session, "doc-a"), false);
  assert.equal(repositoryCanReceiveSessionResult(identity, identity, session, "doc-b"), false);
});

test("draft and immutable-revision guards preserve in-flight human edits", () => {
  const baseline = { title: "Incident", body: "Before" };
  assert.equal(repositoryDraftMatchesDocument({ ...baseline }, baseline), true);
  assert.equal(repositoryShouldAdoptRevisionMutation(baseline, baseline, baseline, false), true);
  assert.equal(repositoryShouldAdoptRevisionMutation({ ...baseline, body: "Local" }, baseline, baseline, true), false);
  assert.equal(repositoryCanApplyRevisionSnapshot(4, 4, { revision: 4 }), true);
  assert.equal(repositoryCanApplyRevisionSnapshot(4, 3, { revision: 4 }), false);
  assert.equal(repositoryNextHistoryHasMore(0, false, true), true);
  assert.equal(repositoryNextHistoryHasMore(1, false, true), false);
});

test("bounded text counts code points and delegation requires an explicit agent selection-compatible prefix", () => {
  assert.equal(repositoryClampCodePoints("😀😀agent", 3), "😀😀a");
  assert.equal(repositoryCommentStartsWithAgent("@Databot build the table", "Databot"), true);
  assert.equal(repositoryCommentStartsWithAgent("@Databot\tbuild the table", "Databot"), true);
  assert.equal(repositoryCommentStartsWithAgent("@Databot", "Databot"), false);
  assert.equal(repositoryCommentStartsWithAgent("prefix @Databot build it", "Databot"), false);
});

test("directory selections keep human and agent authority keyed by canonical IDs", () => {
  assert.equal(repositoryDirectoryEntryKey({
    kind: "HUMAN",
    member: { memberId: "member-1", displayName: "Nadia Chen" },
    handle: "nadia",
    displayName: "Nadia Chen",
  }), "HUMAN:member-1");
  assert.equal(repositoryDirectoryEntryKey({
    kind: "AGENT",
    profileId: "profile-code",
    principal: { memberId: "managed-code", displayName: "Code" },
    handle: "code",
    displayName: "Code",
    visibility: "COMPANY",
    readiness: "READY",
    identitySource: "DEMO_DIRECTORY",
    expertise: "CODE",
    runtime: "OPENAI_LUNA_WEBMCP_RELAY",
  }), "AGENT:profile-code");
  assert.equal(relayAccessProfileForManagedHandle("code"), "REPOSITORY_SCOPED_EDIT");
});

test("history provenance names the self-declared agent and human owner", () => {
  const member = { memberId: "member-1", displayName: "Nadia" };
  const agent = {
    actorType: "AGENT" as const,
    displayName: "Databot",
    member,
    agentProfileId: "profile-1",
    agentLabel: "Databot",
  };
  const direct: IssueRevisionProvenance = {
    sourceRevision: 3,
    authority: "DIRECT",
    origin: "WEBMCP",
    authorOrigin: "WEBMCP",
    taskId: "task-1",
    author: agent,
    committer: agent,
    grantedBy: member,
    approvedBy: null,
    restoredRevision: null,
  };
  assert.equal(repositoryProvenanceSummary(direct), "Databot · Nadia changed the document");
  assert.equal(repositoryRevisionLineageLabel({ parentRevision: 4, provenance: direct }), "Databot · Direct from r3, safely rebased");
  const managedCode: ManagedAgentDirectoryEntry = {
    kind: "AGENT",
    profileId: "profile-code",
    principal: { memberId: "managed-code", displayName: "Code · managed agent" },
    handle: "code",
    displayName: "Code",
    visibility: "TEAM",
    readiness: "READY",
    identitySource: "DEMO_DIRECTORY",
    expertise: "CODE",
    runtime: "OPENAI_LUNA_WEBMCP_RELAY",
  };
  const managedProvenance: IssueRevisionProvenance = {
    ...direct,
    author: {
      ...agent,
      displayName: "Code",
      agentLabel: "Code",
      member: { memberId: "managed-code", displayName: "Code · managed agent" },
    },
  };
  assert.equal(
    repositoryProvenanceSummary(managedProvenance, [managedCode]),
    "Code · managed agent changed the document",
  );
  assert.equal(
    repositoryProvenanceSummary({
      ...direct,
      author: {
        ...agent,
        displayName: "Code",
        agentLabel: "Code",
        member: { memberId: "attacker", displayName: "Code · managed agent" },
      },
    }, [managedCode]),
    "Code · Code · managed agent changed the document",
  );
});

const highlightOwner: IssueMemberSnapshot = { memberId: "member-owner", displayName: "Owner" };
const highlightAgentMember: IssueMemberSnapshot = { memberId: "member-agent", displayName: "Code bot" };
const highlightAgent: IssueAgentActorSnapshot = {
  actorType: "AGENT",
  displayName: "Code",
  member: highlightAgentMember,
  agentProfileId: "profile-code",
  agentLabel: "Code",
};
const directBeforeAnchor: IssueSelectionAnchor = {
  scope: "SELECTION",
  field: "BODY",
  rangeStart: 6,
  rangeEnd: 10,
  selectedText: "beta",
  createdRevision: 1,
  anchorRevision: 1,
  anchorState: "ACTIVE",
};
const directReplacementAnchor: IssueSelectionAnchor = {
  ...directBeforeAnchor,
  rangeEnd: 11,
  selectedText: "delta",
  anchorRevision: 2,
};

function directAgentChangeSurface(): IssueWorkspaceSurface {
  const provenance: IssueRevisionProvenance = {
    sourceRevision: 1,
    authority: "DIRECT",
    origin: "WEBMCP",
    authorOrigin: "WEBMCP",
    taskId: "task-direct",
    author: highlightAgent,
    committer: highlightAgent,
    grantedBy: highlightOwner,
    approvedBy: null,
    restoredRevision: null,
  };
  const revision: IssueRevisionSummary = {
    revisionId: "revision-direct",
    revision: 2,
    parentRevision: 1,
    contentDigest: "sha256:direct",
    diffs: [{ field: "BODY", rangeStart: 6, rangeEnd: 10, before: "beta", after: "delta" }],
    provenance,
    changeSummary: "Clarified the cause.",
    evidenceRefs: ["commit:abc"],
    createdAt: "2026-09-03T12:00:00.000Z",
  };
  const task: IssueTask = {
    taskId: "task-direct",
    taskKey: "TASK-1",
    title: "Clarify",
    category: "CODEBASE",
    instruction: "Clarify the selected text.",
    agentLabel: "Code",
    agentProfileId: "profile-code",
    context: null,
    creator: highlightOwner,
    assignee: highlightAgentMember,
    threadId: "thread-direct",
    createdAt: "2026-09-03T11:59:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    mode: "DIRECT",
    status: "COMPLETED",
    creationAnchor: directBeforeAnchor,
    anchor: directReplacementAnchor,
    proposal: null,
    result: {
      outcome: "COMMITTED",
      resultSummary: revision.changeSummary,
      evidenceRefs: [...revision.evidenceRefs],
      sourceRevision: 1,
      resultRevision: 2,
      liveAnchor: directBeforeAnchor,
      replacementText: "delta",
      submittedBy: highlightAgent,
      submittedAt: revision.createdAt,
    },
    decision: null,
    resolvedAt: revision.createdAt,
  };
  const thread: IssueThread = {
    threadId: task.threadId,
    taskId: task.taskId,
    creationAnchor: directBeforeAnchor,
    anchor: directReplacementAnchor,
    status: "RESOLVED",
    createdBy: highlightOwner,
    createdAt: task.createdAt,
    resolvedBy: highlightAgentMember,
    resolvedAt: revision.createdAt,
    comments: [],
  };
  return {
    document: {
      id: "document-highlight",
      protocolVersion: 4,
      kind: "POSTMORTEM",
      title: "Incident",
      body: "Alpha delta omega",
      revision: 2,
      activityVersion: 2,
      updatedAt: revision.createdAt,
      lastRevision: {
        revisionId: revision.revisionId,
        author: highlightAgent,
        authority: "DIRECT",
        summary: revision.changeSummary,
      },
    },
    presence: [],
    members: [highlightOwner, highlightAgentMember],
    agents: [],
    tasks: [task],
    threads: [thread],
    history: [revision],
    hasMoreHistory: true,
  };
}

function rebasedReviewChangeSurface(): IssueWorkspaceSurface {
  const surface = directAgentChangeSurface();
  const proposalAnchor: IssueSelectionAnchor = {
    ...directBeforeAnchor,
    rangeStart: 0,
    rangeEnd: 4,
    selectedText: "beta",
    createdRevision: 2,
    anchorRevision: 2,
  };
  const replacementAnchor: IssueSelectionAnchor = {
    ...proposalAnchor,
    rangeStart: 5,
    rangeEnd: 10,
    selectedText: "delta",
    anchorRevision: 4,
  };
  const provenance: IssueRevisionProvenance = {
    sourceRevision: 2,
    authority: "REVIEW",
    origin: "ORDINARY_UI",
    authorOrigin: "WEBMCP",
    taskId: "task-review",
    author: highlightAgent,
    committer: {
      actorType: "HUMAN",
      displayName: highlightOwner.displayName,
      member: highlightOwner,
      agentLabel: null,
    },
    grantedBy: highlightOwner,
    approvedBy: highlightOwner,
    restoredRevision: null,
  };
  const revision: IssueRevisionSummary = {
    revisionId: "revision-review",
    revision: 4,
    parentRevision: 3,
    contentDigest: "sha256:review",
    diffs: [{ field: "BODY", rangeStart: 5, rangeEnd: 9, before: "beta", after: "delta" }],
    provenance,
    changeSummary: "Accepted the clearer wording.",
    evidenceRefs: ["style-guide"],
    createdAt: "2026-09-03T12:02:00.000Z",
  };
  const task: IssueTask = {
    ...surface.tasks[0]!,
    taskId: "task-review",
    taskKey: "TASK-2",
    threadId: "thread-review",
    mode: "REVIEW",
    status: "COMPLETED",
    creationAnchor: proposalAnchor,
    anchor: replacementAnchor,
    proposal: {
      replacementText: "delta",
      resultSummary: revision.changeSummary,
      evidenceRefs: [...revision.evidenceRefs],
      sourceRevision: 2,
      liveAnchor: proposalAnchor,
      proposedBy: highlightAgent,
      proposedAt: "2026-09-03T12:00:00.000Z",
    },
    result: null,
    decision: {
      kind: "ACCEPTED",
      note: null,
      decidedBy: highlightOwner,
      decidedAt: revision.createdAt,
      decisionRevision: 3,
      resultRevision: 4,
    },
    resolvedAt: revision.createdAt,
  };
  return {
    ...surface,
    document: {
      ...surface.document,
      body: "Lead delta tail",
      revision: 4,
      activityVersion: 4,
      updatedAt: revision.createdAt,
      lastRevision: {
        revisionId: revision.revisionId,
        author: highlightAgent,
        authority: "REVIEW",
        summary: revision.changeSummary,
      },
    },
    tasks: [task],
    threads: [{
      ...surface.threads[0]!,
      threadId: task.threadId,
      taskId: task.taskId,
      creationAnchor: proposalAnchor,
      anchor: replacementAnchor,
    }],
    history: [revision],
  };
}

test("agent change detection uses the committed task's current replacement anchor", () => {
  const surface = directAgentChangeSurface();
  assert.equal(REPOSITORY_AGENT_CHANGE_HIGHLIGHT_MS, 30_000);
  assert.deepEqual(repositoryHeadAgentChangeHighlight(surface), {
    revision: 2,
    taskId: "task-direct",
    anchor: directReplacementAnchor,
  });
  assert.equal(repositoryAgentChangeHighlightTransition(1, surface).kind, "SHOW");
  assert.deepEqual(repositoryAgentChangeHighlightTransition(2, surface), { kind: "KEEP" });
  assert.deepEqual(repositoryAgentChangeHighlightTransition(0, surface), { kind: "CLEAR" });

  const stale = structuredClone(surface);
  stale.tasks[0]!.anchor = { ...directReplacementAnchor, anchorState: "STALE" };
  assert.equal(repositoryHeadAgentChangeHighlight(stale), null);

  const humanActor = {
    actorType: "HUMAN" as const,
    displayName: highlightOwner.displayName,
    member: highlightOwner,
    agentLabel: null,
  };
  const human = structuredClone(surface);
  human.history[0]!.provenance = {
    sourceRevision: 1,
    authority: "HUMAN",
    origin: "ORDINARY_UI",
    authorOrigin: "ORDINARY_UI",
    taskId: null,
    author: humanActor,
    committer: humanActor,
    grantedBy: null,
    approvedBy: null,
    restoredRevision: null,
  };
  human.document.lastRevision = {
    ...human.document.lastRevision,
    author: humanActor,
    authority: "HUMAN",
  };
  assert.equal(repositoryHeadAgentChangeHighlight(human), null);
  assert.deepEqual(repositoryAgentChangeHighlightTransition(1, human), { kind: "CLEAR" });

  const restored = structuredClone(human);
  restored.history[0]!.provenance = {
    ...human.history[0]!.provenance,
    authority: "RESTORE",
    restoredRevision: 1,
  };
  restored.document.lastRevision.authority = "RESTORE";
  assert.equal(repositoryHeadAgentChangeHighlight(restored), null);
  assert.deepEqual(repositoryAgentChangeHighlightTransition(1, restored), { kind: "CLEAR" });
});

test("a valid reviewed replacement can highlight after its proposal anchor rebased", () => {
  const surface = rebasedReviewChangeSurface();
  assert.deepEqual(repositoryHeadAgentChangeHighlight(surface), {
    revision: 4,
    taskId: "task-review",
    anchor: surface.tasks[0]!.anchor,
  });
  assert.equal(repositoryAgentChangeHighlightTransition(3, surface).kind, "SHOW");
});

test("only active standalone threads and open or proposed tasks become pending highlights", () => {
  const surface = directAgentChangeSurface();
  const active = (rangeStart: number, rangeEnd: number): IssueSelectionAnchor => ({
    scope: "SELECTION",
    field: "BODY",
    rangeStart,
    rangeEnd,
    selectedText: surface.document.body.slice(rangeStart, rangeEnd),
    createdRevision: 2,
    anchorRevision: 2,
    anchorState: "ACTIVE",
  });
  const openTask = {
    ...surface.tasks[0]!,
    taskId: "task-open",
    status: "OPEN",
    anchor: active(6, 11),
    result: null,
    resolvedAt: null,
  } as IssueTask;
  const proposedTask = {
    ...rebasedReviewChangeSurface().tasks[0]!,
    taskId: "task-proposed",
    status: "PROPOSED",
    anchor: active(12, 17),
    decision: null,
    resolvedAt: null,
  } as IssueTask;
  const mismatchedActiveAnchor = {
    ...active(6, 11),
    anchorRevision: 1,
  };
  const invalidOpenTask = {
    ...openTask,
    taskId: "task-invalid-active-anchor",
    anchor: mismatchedActiveAnchor,
  } as IssueTask;
  const standalone = (threadId: string, status: "OPEN" | "RESOLVED", anchor: IssueSelectionAnchor): IssueThread => ({
    threadId,
    taskId: null,
    creationAnchor: anchor,
    anchor,
    status,
    createdBy: highlightOwner,
    createdAt: "2026-09-03T12:00:00.000Z",
    resolvedBy: status === "OPEN" ? null : highlightOwner,
    resolvedAt: status === "OPEN" ? null : "2026-09-03T12:01:00.000Z",
    comments: [],
  });
  surface.tasks = [openTask, proposedTask, invalidOpenTask, surface.tasks[0]!];
  surface.threads = [
    { ...surface.threads[0]!, taskId: openTask.taskId, anchor: active(0, 1) },
    { ...surface.threads[0]!, threadId: "thread-proposed", taskId: proposedTask.taskId, anchor: active(1, 2) },
    {
      ...surface.threads[0]!,
      threadId: "thread-invalid-task-anchor",
      taskId: invalidOpenTask.taskId,
      anchor: mismatchedActiveAnchor,
    },
    surface.threads[0]!,
    standalone("thread-open", "OPEN", active(0, 5)),
    standalone("thread-invalid-active-anchor", "OPEN", mismatchedActiveAnchor),
    standalone("thread-resolved", "RESOLVED", active(12, 17)),
  ];

  assert.deepEqual(repositoryOpenAnchorHighlights(surface), [
    { field: "BODY", rangeStart: 6, rangeEnd: 11, kind: "PENDING" },
    { field: "BODY", rangeStart: 12, rangeEnd: 17, kind: "PENDING" },
    { field: "BODY", rangeStart: 0, rangeEnd: 5, kind: "PENDING" },
  ]);
});
