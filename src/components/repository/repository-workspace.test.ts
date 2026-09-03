import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { IssueRevisionProvenance, IssueWorkspaceSurface } from "@/repository/contracts";
import type { ManagedAgentDirectoryEntry } from "@/agent-relay/contracts";

import { RepositoryLanding } from "./RepositoryLanding";
import {
  repositoryCanApplyRevisionSnapshot,
  repositoryCanReceiveSessionResult,
  repositoryClampCodePoints,
  repositoryCommentStartsWithAgent,
  repositoryDirectoryEntryKey,
  repositoryDraftMatchesDocument,
  repositoryNextHistoryHasMore,
  repositoryLivingDocumentSheets,
  repositoryProvenanceSummary,
  repositoryRevisionLineageLabel,
  repositorySectionBodySelection,
  repositorySessionIdentity,
  repositoryShouldAdoptRevisionMutation,
} from "./RepositoryWorkspace";
import { repositoryRecommendedAccessProfile } from "./relay-access-copy";
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
  assert.match(markup, /Website access is chosen per run/u);
  assert.match(markup, /Any bot can use any of those profiles/u);
  assert.match(markup, /15-second check is recovery/u);
  assert.match(markup, /data-document-kind="POSTMORTEM"/u);
  assert.match(markup, /data-document-kind="PRODUCT_DOCUMENT"/u);
  assert.equal((markup.match(/data-document-kind=/gu) ?? []).length, 2);
  assert.match(markup, /Open live postmortem/u);
  assert.match(markup, /Open live product document/u);
  assert.match(markup, /Application-owned WebMCP relay · GPT-5.6 Luna/u);
  assert.match(markup, /Pick the bot\. Grant the tools/u);
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
  assert.equal(repositoryRecommendedAccessProfile("CODE"), "REPOSITORY_SCOPED_EDIT");
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
