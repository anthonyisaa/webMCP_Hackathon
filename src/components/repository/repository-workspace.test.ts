import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { IssueRevisionProvenance, IssueWorkspaceSurface } from "@/repository/contracts";

import { RepositoryLanding } from "./RepositoryLanding";
import {
  repositoryCanApplyRevisionSnapshot,
  repositoryCanReceiveSessionResult,
  repositoryClampCodePoints,
  repositoryCommentStartsWithAgent,
  repositoryDraftMatchesDocument,
  repositoryNextHistoryHasMore,
  repositoryProvenanceSummary,
  repositoryRevisionLineageLabel,
  repositorySessionIdentity,
  repositoryShouldAdoptRevisionMutation,
} from "./RepositoryWorkspace";

test("landing makes human identity and the one-agent handoff explicit before its two templates", () => {
  const markup = renderToStaticMarkup(createElement(RepositoryLanding, {
    onCreate() {},
    onOpenExample() {},
  }));
  assert.match(markup, /What should collaborators call you\?/u);
  assert.match(markup, /Choose the nickname collaborators will see\./u);
  assert.match(markup, /Connect the agent you’re bringing\./u);
  assert.match(markup, /Each collaborator connects one current agent/u);
  assert.match(markup, /data-document-kind="POSTMORTEM"/u);
  assert.match(markup, /data-document-kind="PRODUCT_DOCUMENT"/u);
  assert.equal((markup.match(/data-document-kind=/gu) ?? []).length, 2);
  assert.match(markup, /Explore postmortem/u);
  assert.match(markup, /Explore product document/u);
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
});
