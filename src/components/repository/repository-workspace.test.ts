import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type {
  IssueRevisionProvenance,
  IssueWorkspaceSurface,
} from "@/repository/contracts";

import { RepositoryLanding } from "./RepositoryLanding";
import {
  repositoryAuthorityLabel,
  repositoryCanReceiveSessionResult,
  repositoryCanApplyRevisionSnapshot,
  repositoryClampCodePoints,
  repositoryDraftMatchesDocument,
  repositoryNextHistoryHasMore,
  repositoryProvenanceSummary,
  repositoryRevisionLineageLabel,
  repositorySessionIdentity,
  repositoryShouldAdoptRevisionMutation,
} from "./RepositoryWorkspace";

test("the landing surface offers only the two frozen document types", () => {
  const markup = renderToStaticMarkup(createElement(RepositoryLanding, {
    onCreate() {},
    onOpenExample() {},
  }));

  assert.match(markup, /data-testid="template-picker"/);
  assert.match(markup, /data-document-kind="POSTMORTEM"/);
  assert.match(markup, /data-document-kind="PRODUCT_DOCUMENT"/);
  assert.equal((markup.match(/data-document-kind=/g) ?? []).length, 2);
  assert.match(markup, />Open incident example</);
  assert.doesNotMatch(markup, /Open outage example/);
});

test("same-session activity and revision props do not change the workspace reset identity", () => {
  const surface = (documentId: string, revision: number) => ({
    document: { id: documentId, revision },
  }) as IssueWorkspaceSurface;

  const initial = repositorySessionIdentity({
    sessionInstanceId: "browser-session-a",
    surface: surface("document-a", 1),
  });
  const collaborationUpdate = repositorySessionIdentity({
    sessionInstanceId: "browser-session-a",
    surface: surface("document-a", 8),
  });
  const nextDocument = repositorySessionIdentity({
    sessionInstanceId: "browser-session-a",
    surface: surface("document-b", 1),
  });

  assert.equal(collaborationUpdate, initial);
  assert.notEqual(nextDocument, initial);
});

test("an asynchronous revision result owns only the exact live draft", () => {
  const saved = { title: "Incident", body: "The submitted revision." };

  assert.equal(repositoryDraftMatchesDocument({ ...saved }, saved), true);
  assert.equal(
    repositoryDraftMatchesDocument(
      { ...saved, body: "An edit made while the revision was saving." },
      saved,
    ),
    false,
  );
});

test("accept and restore adopt a mutation only while their baseline still owns the draft", () => {
  const baseline = { title: "Incident", body: "Before" };
  const current = { title: "Incident", body: "After" };

  assert.equal(
    repositoryShouldAdoptRevisionMutation(baseline, baseline, baseline, false),
    true,
  );
  assert.equal(
    repositoryShouldAdoptRevisionMutation(
      { title: "Incident", body: "A later local edit" },
      baseline,
      baseline,
      true,
    ),
    false,
  );
  assert.equal(
    repositoryShouldAdoptRevisionMutation(current, baseline, current, false),
    true,
  );
});

test("late surface and unavailable-session callbacks cannot cross workspace identities", () => {
  const surface = (documentId: string) => ({
    document: { id: documentId },
  }) as IssueWorkspaceSurface;
  const session = {
    sessionInstanceId: "browser-session-a",
    surface: surface("document-a"),
  };
  const expectedIdentity = repositorySessionIdentity(session);

  assert.equal(
    repositoryCanReceiveSessionResult(
      expectedIdentity,
      expectedIdentity,
      session,
      "document-a",
    ),
    true,
  );
  assert.equal(
    repositoryCanReceiveSessionResult(
      "browser-session-b:document-b",
      expectedIdentity,
      session,
      "document-a",
    ),
    false,
  );
  assert.equal(
    repositoryCanReceiveSessionResult(
      expectedIdentity,
      expectedIdentity,
      session,
      "document-b",
    ),
    false,
  );
  assert.equal(
    repositoryCanReceiveSessionResult(expectedIdentity, expectedIdentity, null),
    false,
  );
});

test("revision snapshots render only for the request that still owns selection", () => {
  assert.equal(repositoryCanApplyRevisionSnapshot(4, 4, { revision: 4 }), true);
  assert.equal(repositoryCanApplyRevisionSnapshot(3, 4, { revision: 4 }), false);
  assert.equal(repositoryCanApplyRevisionSnapshot(4, 4, { revision: 3 }), false);
});

test("surface pagination flags synchronize until an older-history cursor is active", () => {
  assert.equal(repositoryNextHistoryHasMore(0, false, true), true);
  assert.equal(repositoryNextHistoryHasMore(0, true, false), false);
  assert.equal(repositoryNextHistoryHasMore(1, false, true), false);
});

test("bounded editor fields count Unicode code points instead of UTF-16 units", () => {
  assert.equal(repositoryClampCodePoints("😀😀agent", 3), "😀😀a");
  assert.equal(repositoryClampCodePoints("short", 20), "short");
});

test("revision copy exposes task authority and human approval", () => {
  const member = { memberId: "member-1", displayName: "Nadia" };
  const agent = {
    actorType: "AGENT" as const,
    displayName: "Research agent",
    member,
    agentLabel: "Research agent",
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
  const reviewed: IssueRevisionProvenance = {
    sourceRevision: 3,
    authority: "REVIEW",
    origin: "ORDINARY_UI",
    authorOrigin: "WEBMCP",
    taskId: "task-2",
    author: agent,
    committer: {
      actorType: "HUMAN",
      displayName: member.displayName,
      member,
      agentLabel: null,
    },
    grantedBy: member,
    approvedBy: member,
    restoredRevision: null,
  };

  assert.equal(repositoryAuthorityLabel(direct.authority), "Direct agent commit");
  assert.equal(
    repositoryProvenanceSummary(direct),
    "Research agent committed directly · granted by Nadia",
  );
  assert.equal(
    repositoryProvenanceSummary(reviewed),
    "Research agent authored · applied by Nadia",
  );
  assert.equal(
    repositoryRevisionLineageLabel({ parentRevision: 4, provenance: direct }),
    "Research agent · Direct from r3, safely rebased",
  );
  assert.equal(
    repositoryRevisionLineageLabel({ parentRevision: 3, provenance: reviewed }),
    "Research agent · Reviewed by Nadia",
  );
});
