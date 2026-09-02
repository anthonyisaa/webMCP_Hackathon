import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LocalRepositoryService } from "@/domain/repository-service";
import type { RepositoryResult } from "@/repository/contracts";

type Golden = {
  documentKind: "POSTMORTEM" | "PRODUCT_DOCUMENT";
  title: string;
  finalMarkdownSource: string;
  finalState: { revision: number; activityVersion: number; contentDigest: string };
  agentProfiles: Array<{ name: string; accessCountAtFinal: number }>;
  tasks: Array<{
    taskKey: string;
    visiblePrompt: string;
    instruction: string;
    contextSnapshot: {
      sourceRevision: number;
      sourceDigest: string;
      documentTitle: string;
      field: "TITLE" | "BODY";
      selectedText: string;
      codePointRange: { start: number; end: number };
      beforeExcerpt: string;
      afterExcerpt: string;
      priorContext: unknown[];
    };
    completion: { resultSummary: string; replacementText: string; evidenceRefs: string[] };
  }>;
  continuityProbe: {
    toolCalls: Array<{
      input: { beforeActivityVersion?: number; limit: number };
      expected: { activityVersions: number[]; hasMoreOlder: boolean; nextBeforeActivityVersion: number | null };
    }>;
  };
};

function golden(name: string): Golden {
  return JSON.parse(readFileSync(
    new URL(`../../evals/goldens/repo-document-v4.1/${name}`, import.meta.url),
    "utf8",
  )) as Golden;
}

function ok<T>(result: RepositoryResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.data;
}

describe.each([
  ["postmortem-comment-first.json", "POSTMORTEM"],
  ["product-document-comment-first.json", "PRODUCT_DOCUMENT"],
] as const)("completed v4.1 example %s", (filename, kind) => {
  it("matches checked content, prompt/context, completion, profile, and cursor oracles", async () => {
    const expected = golden(filename);
    const service = new LocalRepositoryService();
    const bundle = ok(await service.launchExample({ kind, displayName: "Quinn Patel" }));
    const { surface } = bundle;
    expect(surface.document).toMatchObject({
      kind: expected.documentKind,
      title: expected.title,
      body: expected.finalMarkdownSource,
      revision: expected.finalState.revision,
      activityVersion: expected.finalState.activityVersion,
    });
    expect(surface.history[0]?.contentDigest).toBe(expected.finalState.contentDigest);
    expect(surface.agents.map(({ name, accessCount }) => ({ name, accessCountAtFinal: accessCount })))
      .toEqual(expected.agentProfiles
        .map(({ name, accessCountAtFinal }) => ({ name, accessCountAtFinal }))
        .sort((left, right) => left.name.localeCompare(right.name)));

    for (const expectedTask of expected.tasks) {
      const task = surface.tasks.find(({ taskKey }) => taskKey === expectedTask.taskKey);
      expect(task).toBeDefined();
      if (!task) continue;
      expect(task).toMatchObject({
        taskKey: expectedTask.taskKey,
        instruction: expectedTask.instruction,
        mode: "DIRECT",
        status: "COMPLETED",
        context: {
          sourceRevision: expectedTask.contextSnapshot.sourceRevision,
          sourceDigest: expectedTask.contextSnapshot.sourceDigest,
          documentTitle: expectedTask.contextSnapshot.documentTitle,
          field: expectedTask.contextSnapshot.field,
          rangeStart: expectedTask.contextSnapshot.codePointRange.start,
          rangeEnd: expectedTask.contextSnapshot.codePointRange.end,
          targetText: expectedTask.contextSnapshot.selectedText,
          beforeText: expectedTask.contextSnapshot.beforeExcerpt,
          afterText: expectedTask.contextSnapshot.afterExcerpt,
        },
        result: {
          resultSummary: expectedTask.completion.resultSummary,
          replacementText: expectedTask.completion.replacementText,
          evidenceRefs: expectedTask.completion.evidenceRefs,
        },
      });
      expect(task.context?.priorContext.map((entry) => ({
        activityVersion: entry.activityVersion,
        kind: entry.kind,
        documentRevision: entry.documentRevision,
        actorType: entry.actor.actorType,
        actorName: entry.actor.displayName,
        excerpt: entry.excerpt,
      }))).toEqual(expectedTask.contextSnapshot.priorContext.map((value) => {
        const entry = value as {
          activityVersion: number; kind: string; documentRevision: number;
          actor: { actorType: string; displayName: string }; excerpt: string;
        };
        return {
          activityVersion: entry.activityVersion,
          kind: entry.kind,
          documentRevision: entry.documentRevision,
          actorType: entry.actor.actorType,
          actorName: entry.actor.displayName,
          excerpt: entry.excerpt,
        };
      }));
      const thread = surface.threads.find(({ threadId }) => threadId === task.threadId);
      expect(thread?.comments[0]).toMatchObject({
        body: expectedTask.visiblePrompt,
        createdRevision: expectedTask.contextSnapshot.sourceRevision,
      });
    }

    const page = randomUUID();
    ok(await service.connectAgent(bundle.agentSessionToken, {
      requestId: randomUUID(), name: "Contextbot",
    }, page));
    for (const call of expected.continuityProbe.toolCalls) {
      const context = ok(await service.readCollaborationContext(
        bundle.agentSessionToken,
        call.input,
        page,
      ));
      expect(context.events.map(({ activityVersion }) => activityVersion))
        .toEqual(call.expected.activityVersions);
      expect(context.hasMoreOlder).toBe(call.expected.hasMoreOlder);
      expect(context.nextBeforeActivityVersion).toBe(call.expected.nextBeforeActivityVersion);
    }
  });
});
