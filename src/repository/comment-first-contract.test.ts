import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import {
  REPOSITORY_TOOL_NAMES,
  REPOSITORY_WEBMCP_TOOL_CATALOG,
} from "./contracts";

type JsonRecord = Record<string, unknown>;

type PriorContextEntry = {
  activityVersion: number;
  kind: string;
  documentRevision: number;
  revisionId: string | null;
  taskId: string | null;
  threadId: string | null;
  commentId: string | null;
  actor: JsonRecord;
  excerpt: string;
};

type GoldenTask = {
  taskKey: string;
  semanticKey: string;
  createdActivityVersion: number;
  contextSnapshot: {
    priorContext: PriorContextEntry[];
  };
  completion: {
    resultSummary: string;
  };
};

type GoldenRevision = {
  revision: number;
  authority: string;
  taskKey: string | null;
  summary: string;
};

type Golden = {
  documentKind: "POSTMORTEM" | "PRODUCT_DOCUMENT";
  title: string;
  finalMarkdownSource: string;
  finalState: {
    contentDigest: string;
  };
  agentProfiles: Array<{
    name: string;
    accessCountAtFinal: number;
  }>;
  tasks: GoldenTask[];
  threads: Array<{
    threadKey: string;
    comments: Array<{
      evidenceRefs: string[];
    }>;
  }>;
  humanCapacityCorrection?: {
    evidenceRefs: string[];
  };
  revisionTrajectory: GoldenRevision[];
  continuityProbe: {
    expectedConnectedProfile: {
      name: string;
      accessCountAfterConnect: number;
    };
    toolCalls: Array<{
      input: {
        beforeActivityVersion?: number;
      };
      expected: {
        activityVersions: number[];
        hasMoreOlder: boolean;
        nextBeforeActivityVersion: number | null;
      };
    }>;
    expectedActivityOrder: Array<{
      activityVersion: number;
    }>;
  };
};

const GOLDEN_PATHS = [
  "../../evals/goldens/repo-document-v4.1/postmortem-comment-first.json",
  "../../evals/goldens/repo-document-v4.1/product-document-comment-first.json",
] as const;

function readGolden(relativePath: (typeof GOLDEN_PATHS)[number]): Golden {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Golden;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function digest(title: string, body: string): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ title, body }), "utf8")
    .digest("hex")}`;
}

test("freezes the exact comment-first WebMCP tool surface", () => {
  const expected = [
    "connect_agent",
    "inspect_document",
    "read_document_history",
    "read_collaboration_context",
    "list_my_tasks",
    "wait_for_my_tasks",
    "comment_on_task",
    "submit_task_result",
  ];

  assert.deepEqual([...REPOSITORY_TOOL_NAMES], expected);
  assert.deepEqual(
    REPOSITORY_WEBMCP_TOOL_CATALOG.map(({ name }) => name),
    expected,
  );
});

for (const relativePath of GOLDEN_PATHS) {
  const golden = readGolden(relativePath);

  test(`${golden.documentKind} golden freezes task keys, rationale, and immutable context`, () => {
    assert.deepEqual(
      golden.tasks.map(({ taskKey }) => taskKey),
      golden.tasks.map((_, index) => `TASK-${index + 1}`),
    );

    const expectedPriorKeys = [
      "activityVersion",
      "kind",
      "documentRevision",
      "revisionId",
      "taskId",
      "threadId",
      "commentId",
      "actor",
      "excerpt",
    ];

    for (const task of golden.tasks) {
      const expectedPriorVersions = Array.from(
        { length: Math.min(10, task.createdActivityVersion - 1) },
        (_, index) => task.createdActivityVersion - index - 1,
      );
      assert.deepEqual(
        task.contextSnapshot.priorContext.map(({ activityVersion }) => activityVersion),
        expectedPriorVersions,
        `${task.semanticKey} must snapshot the newest ten earlier activities without gaps`,
      );

      for (const entry of task.contextSnapshot.priorContext) {
        assert.deepEqual(Object.keys(entry), expectedPriorKeys);
        assert.ok(codePointLength(entry.excerpt) <= 600);
      }

      const directRevision = golden.revisionTrajectory.find(
        ({ authority, taskKey }) => authority === "DIRECT" && taskKey === task.taskKey,
      );
      assert.ok(directRevision, `${task.taskKey} must have one Direct revision`);
      assert.equal(directRevision.summary, task.completion.resultSummary);
    }

    for (const thread of golden.threads) {
      assert.deepEqual(
        thread.comments[0]?.evidenceRefs,
        [],
        `${thread.threadKey} creation cannot invent evidence outside its frozen input`,
      );
    }
    if (golden.humanCapacityCorrection) {
      assert.deepEqual(
        golden.humanCapacityCorrection.evidenceRefs,
        [],
        "ordinary Save cannot invent evidence outside its frozen input",
      );
    }
  });

  test(`${golden.documentKind} golden freezes new-agent continuity pagination`, () => {
    assert.equal(
      golden.agentProfiles.some(({ name }) => name === "Contextbot"),
      false,
      "the continuity agent must not be preseeded",
    );
    assert.deepEqual(golden.continuityProbe.expectedConnectedProfile, {
      ...golden.continuityProbe.expectedConnectedProfile,
      name: "Contextbot",
      accessCountAfterConnect: 1,
    });

    const pageVersions = golden.continuityProbe.toolCalls.flatMap(
      ({ expected }) => expected.activityVersions,
    );
    assert.deepEqual(
      pageVersions,
      golden.continuityProbe.expectedActivityOrder.map(({ activityVersion }) =>
        activityVersion,
      ),
    );

    golden.continuityProbe.toolCalls.forEach((call, index, calls) => {
      if (index === 0) {
        assert.equal(call.input.beforeActivityVersion, undefined);
      } else {
        assert.equal(
          call.input.beforeActivityVersion,
          calls[index - 1].expected.nextBeforeActivityVersion,
        );
      }
      const isLast = index === calls.length - 1;
      assert.equal(call.expected.hasMoreOlder, !isLast);
      assert.equal(
        call.expected.nextBeforeActivityVersion,
        isLast ? null : call.expected.activityVersions.at(-1),
      );
    });
  });

  test(`${golden.documentKind} golden final digest and profile touch counts are exact`, () => {
    assert.equal(
      digest(golden.title, golden.finalMarkdownSource),
      golden.finalState.contentDigest,
    );

    const expectedCounts =
      golden.documentKind === "POSTMORTEM" ? [2, 2, 3] : [2, 2];
    assert.deepEqual(
      golden.agentProfiles.map(({ accessCountAtFinal }) => accessCountAtFinal),
      expectedCounts,
    );

    if (golden.documentKind === "PRODUCT_DOCUMENT") {
      const ordinaryBodyEdits = golden.revisionTrajectory.filter(
        ({ authority, taskKey }) => authority === "HUMAN" && taskKey === null,
      );
      assert.deepEqual(
        ordinaryBodyEdits.slice(1).map(({ summary }) => summary),
        ["Edited the document.", "Edited the document."],
      );
    }
  });
}
