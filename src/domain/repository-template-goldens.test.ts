import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";

import postmortemGolden from "../../evals/goldens/repo-document-v4/postmortem-template.json";
import productDocumentGolden from "../../evals/goldens/repo-document-v4/product-document.json";
import type { RepositoryResult } from "@/repository/contracts";
import { LocalRepositoryService } from "./repository-service";

type TemplateKind = "POSTMORTEM" | "PRODUCT_DOCUMENT";
type TemplateGolden = typeof productDocumentGolden;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIXED_NOW_MS = Date.parse("2026-08-18T11:00:00.000Z");

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function independentDigest(title: string, body: string): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ title, body }), "utf8")
    .digest("hex")}`;
}

function assertGoldenSelfConsistency(golden: TemplateGolden, kind: TemplateKind): void {
  assert.equal(golden.protocolVersion, 4);
  assert.equal(golden.document.protocolVersion, golden.protocolVersion);
  assert.equal(golden.document.kind, kind);
  assert.equal(golden.document.title, golden.revision.title);
  assert.equal(golden.document.body, golden.revision.body);
  assert.equal(golden.document.revision, golden.revision.revision);
  assert.equal(golden.document.updatedAt, golden.revision.createdAt);
  assert.equal(golden.document.lastRevision.revisionId, golden.revision.revisionId);
  assert.equal(golden.document.lastRevision.summary, golden.revision.changeSummary);
  assert.equal(golden.revision.contentDigest, independentDigest(golden.revision.title, golden.revision.body));
  assert.deepEqual(golden.revision.diffs, [
    {
      field: "TITLE",
      rangeStart: 0,
      rangeEnd: 0,
      before: "",
      after: golden.document.title,
    },
    {
      field: "BODY",
      rangeStart: 0,
      rangeEnd: 0,
      before: "",
      after: golden.document.body,
    },
  ]);
  assert.deepEqual(golden.tasks, []);
  assert.deepEqual(golden.threads, []);
}

async function assertTemplateLaunch(
  service: LocalRepositoryService,
  kind: TemplateKind,
  golden: TemplateGolden,
): Promise<{ documentId: string; memberId: string; revisionId: string }> {
  assertGoldenSelfConsistency(golden, kind);

  const bundle = success(await service.launch({ kind, displayName: "Priya Shah" }));
  const surface = bundle.surface;
  const revision = success(await service.readRevision(bundle.humanSessionToken, 1));
  const documentId = surface.document.id;
  const memberId = bundle.selfMemberId;
  const revisionId = surface.document.lastRevision.revisionId;

  assert.match(documentId, UUID_PATTERN);
  assert.match(memberId, UUID_PATTERN);
  assert.match(revisionId, UUID_PATTERN);
  assert.equal(revision.revisionId, revisionId);

  const member = { memberId, displayName: "Priya Shah" };
  const humanActor = {
    actorType: "HUMAN",
    displayName: "Priya Shah",
    member,
    agentLabel: null,
  };
  const expectedProvenance = {
    ...golden.revision.provenance,
    author: humanActor,
    committer: humanActor,
  };
  const expectedRevision = {
    ...golden.revision,
    revisionId,
    provenance: expectedProvenance,
  };
  const expectedDocument = {
    ...golden.document,
    id: documentId,
    lastRevision: {
      ...golden.document.lastRevision,
      revisionId,
      author: humanActor,
    },
  };
  const expectedHistoryEntry = {
    revisionId,
    revision: golden.revision.revision,
    parentRevision: golden.revision.parentRevision,
    contentDigest: golden.revision.contentDigest,
    diffs: golden.revision.diffs,
    provenance: expectedProvenance,
    changeSummary: golden.revision.changeSummary,
    evidenceRefs: golden.revision.evidenceRefs,
    createdAt: golden.revision.createdAt,
  };

  assert.deepEqual(
    {
      kind: surface.document.kind,
      title: surface.document.title,
      body: surface.document.body,
      contentDigest: revision.contentDigest,
      revision: surface.document.revision,
      activityVersion: surface.document.activityVersion,
    },
    {
      kind: golden.document.kind,
      title: golden.document.title,
      body: golden.document.body,
      contentDigest: golden.revision.contentDigest,
      revision: 1,
      activityVersion: 1,
    },
  );
  assert.deepEqual(revision, expectedRevision);
  assert.deepEqual(revision.provenance, expectedProvenance);
  assert.deepEqual(surface, {
    document: expectedDocument,
    presence: [],
    members: [member],
    tasks: golden.tasks,
    threads: golden.threads,
    history: [expectedHistoryEntry],
    hasMoreHistory: false,
  });

  return { documentId, memberId, revisionId };
}

test("D01 launches both independent empty-template goldens with exact r1 snapshots", async () => {
  const service = new LocalRepositoryService({ now: () => FIXED_NOW_MS });

  const postmortem = await assertTemplateLaunch(service, "POSTMORTEM", postmortemGolden);
  const productDocument = await assertTemplateLaunch(service, "PRODUCT_DOCUMENT", productDocumentGolden);

  assert.notEqual(postmortem.documentId, productDocument.documentId);
  assert.notEqual(postmortem.memberId, productDocument.memberId);
  assert.notEqual(postmortem.revisionId, productDocument.revisionId);
});
