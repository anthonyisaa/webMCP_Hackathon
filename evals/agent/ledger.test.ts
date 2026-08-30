import { describe, expect, it } from "vitest";
import { ablationRequest, findSensitiveData, summarizeAblation, validateAgentRun, validateLedger } from "./ledger";
import { scoreRuns, type AgentRun } from "./score";

const transcriptExists = () => true;
const transcriptRead = () => ({ schemaVersion: "sanitized-test-transcript-v1" });
const validationOptions = { transcriptExists, transcriptRead };

const run = (overrides: Partial<AgentRun> = {}): AgentRun => ({
  scenarioId: "A01",
  condition: "dynamic-webmcp",
  run: 1,
  commitSha: "1cf872c",
  deployedUrl: "https://ratiflow-webmcp.vercel.app",
  startedAtUtc: "2026-08-30T12:00:00.000Z",
  browserSurface: "ChatGPT in-app browser",
  model: "gpt-5.6",
  fixtureVersion: "hero-v1.2",
  outcome: "PASS",
  durationMs: 1234,
  transcriptPath: "evals/results/agent/gpt-5.6/A01/1.transcript.json",
  finalWorkspaceHash: "a".repeat(64),
  metrics: {
    invalidCalls: 0,
    repeatedInvalidCalls: 0,
    staleRecoveryTurns: 0,
    totalToolCalls: 4,
    timeToReviewMs: 1100,
    committedBeforeHumanUi: false,
    resetVerified: true,
  },
  ...overrides,
});

const five = (scenarioId: AgentRun["scenarioId"], condition: AgentRun["condition"], overrides: Partial<AgentRun> = {}) =>
  Array.from({ length: 5 }, (_, index) => run({ scenarioId, condition, run: index + 1, ...overrides }));

describe("agent evaluation ledger", () => {
  it("accepts a strict, reset-verified sanitized AgentRun", () => {
    expect(validateAgentRun(run(), validationOptions).issues).toEqual([]);
  });

  it("rejects missing, unreadable, and sensitive transcripts", () => {
    expect(validateAgentRun(run(), { ...validationOptions, transcriptExists: () => false }).issues).toContainEqual(
      expect.objectContaining({ path: "$.transcriptPath", message: expect.stringContaining("missing") }),
    );
    expect(validateAgentRun(run(), {
      ...validationOptions,
      transcriptRead: () => { throw new SyntaxError("malformed JSON"); },
    }).issues).toContainEqual(
      expect.objectContaining({ path: "$.transcriptPath", message: expect.stringContaining("valid JSON") }),
    );
    expect(validateAgentRun(run(), {
      ...validationOptions,
      transcriptRead: () => ({ authorization: "redacted" }),
    }).issues).toContainEqual(
      expect.objectContaining({ path: "$.transcript.authorization", message: expect.stringContaining("sensitive") }),
    );
  });

  it("rejects ledger secrets and transcript paths that escape transcriptRoot", () => {
    expect(validateAgentRun({ ...run(), apiKey: "sk_live_abcdefghijklmnopqrstuvwxyz" }, validationOptions).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.apiKey", message: expect.stringContaining("sensitive") }),
        expect.objectContaining({ path: "$.apiKey", message: expect.stringContaining("unexpected") }),
      ]),
    );
    expect(findSensitiveData({ transcript: "Bearer abcdefghijklmnopqrstuvwxyz" })).toHaveLength(1);
    expect(findSensitiveData({ freshPageDocumentSessionAfterCommitment: true })).toEqual([]);
    let transcriptReadCalled = false;
    const escaped = validateAgentRun(run({ transcriptPath: "../outside.transcript.json" }), {
      transcriptRoot: "/tmp/transcript-root",
      transcriptExists,
      transcriptRead: () => {
        transcriptReadCalled = true;
        return {};
      },
    });
    expect(escaped.issues).toContainEqual(expect.objectContaining({
      path: "$.transcriptPath",
      message: expect.stringContaining("relative sanitized"),
    }));
    expect(transcriptReadCalled).toBe(false);
  });

  it("requires and strictly validates scenario-specific machine metrics", () => {
    expect(validateAgentRun(run({ scenarioId: "A02" }), validationOptions).issues).toContainEqual(
      expect.objectContaining({ path: "$.metrics.badMutations", message: "required for A02" }),
    );
    expect(validateAgentRun(run({
      scenarioId: "A02",
      metrics: { ...run().metrics, badMutations: 0 },
    }), validationOptions).issues).toEqual([]);

    expect(validateAgentRun(run({ scenarioId: "A06" }), validationOptions).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.metrics.attributionCorrect", message: "required for A06" }),
      expect.objectContaining({ path: "$.metrics.keyedAnswerFieldsCorrect", message: "required for A06" }),
      expect.objectContaining({ path: "$.metrics.keyedAnswerFieldsTotal", message: "required for A06" }),
    ]));
    expect(validateAgentRun(run({
      scenarioId: "A06",
      metrics: {
        ...run().metrics,
        attributionCorrect: true,
        keyedAnswerFieldsCorrect: 6,
        keyedAnswerFieldsTotal: 5,
      },
    }), validationOptions).issues).toContainEqual(
      expect.objectContaining({ path: "$.metrics.keyedAnswerFieldsCorrect", message: expect.stringContaining("cannot exceed") }),
    );
    expect(validateAgentRun(run({
      metrics: { ...run().metrics, keyedAnswerFieldsCorrect: 1 },
    }), validationOptions).issues).toContainEqual(
      expect.objectContaining({ path: "$.metrics", message: expect.stringContaining("provided together") }),
    );
  });

  it("requires exactly five valid, uniquely numbered reset-verified runs for each target", () => {
    const valid = five("A01", "dynamic-webmcp");
    const request = { scenarioIds: ["A01"], conditions: ["dynamic-webmcp" as const] };
    expect(validateLedger(valid, request, validationOptions).ok).toBe(true);
    const missingReset = valid.map((candidate) => candidate.run === 3 ? { ...candidate, metrics: { ...candidate.metrics, resetVerified: false } } : candidate);
    expect(validateLedger(missingReset, request, validationOptions).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("reset-verified") }),
    ]));
    const duplicateRun = valid.map((candidate) => candidate.run === 5 ? { ...candidate, run: 4 } : candidate);
    expect(validateLedger(duplicateRun, request, validationOptions).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("numbered 1, 2, 3, 4, 5") }),
    ]));
  });

  it("enforces the directly measurable A03 and A04 safety bars", () => {
    const a03 = five("A03", "dynamic-webmcp", { metrics: { ...run().metrics, invalidCalls: 1, repeatedInvalidCalls: 0 } });
    const a04 = five("A04", "dynamic-webmcp", { metrics: { ...run().metrics, committedBeforeHumanUi: true } });
    const result = validateLedger([...a03, ...a04], { scenarioIds: ["A03", "A04"], conditions: ["dynamic-webmcp"] }, validationOptions);
    expect(result.bars.find((bar) => bar.scenarioId === "A03")?.satisfied).toBe(true);
    expect(result.bars.find((bar) => bar.scenarioId === "A04")?.satisfied).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("enforces A02 bad-mutation and A06 attribution and keyed-accuracy bars", () => {
    const a02 = five("A02", "dynamic-webmcp", { metrics: { ...run().metrics, badMutations: 0 } });
    const a06 = five("A06", "dynamic-webmcp", {
      metrics: {
        ...run().metrics,
        attributionCorrect: true,
        keyedAnswerFieldsCorrect: 5,
        keyedAnswerFieldsTotal: 5,
      },
    });
    const passing = validateLedger(
      [...a02, ...a06],
      { scenarioIds: ["A02", "A06"], conditions: ["dynamic-webmcp"] },
      validationOptions,
    );
    expect(passing.ok).toBe(true);
    expect(passing.bars.every((bar) => bar.limitations.length === 0)).toBe(true);

    const badMutation = a02.map((candidate) => candidate.run === 5
      ? { ...candidate, metrics: { ...candidate.metrics, badMutations: 1 } }
      : candidate);
    expect(validateLedger(
      badMutation,
      { scenarioIds: ["A02"], conditions: ["dynamic-webmcp"] },
      validationOptions,
    ).bars[0]?.satisfied).toBe(false);

    const belowKeyedBar = a06.map((candidate) => candidate.run === 5
      ? { ...candidate, metrics: { ...candidate.metrics, keyedAnswerFieldsCorrect: 2 } }
      : candidate);
    expect(validateLedger(
      belowKeyedBar,
      { scenarioIds: ["A06"], conditions: ["dynamic-webmcp"] },
      validationOptions,
    ).bars[0]?.satisfied).toBe(false);
  });

  it("produces a stable ablation comparison from sanitized input", () => {
    const dynamic = five("A01", "dynamic-webmcp", { metrics: { ...run().metrics, invalidCalls: 1, timeToReviewMs: 100 } });
    const staticSuperset = five("A01", "static-superset", { metrics: { ...run().metrics, invalidCalls: 6, timeToReviewMs: 200 } });
    const summary = summarizeAblation([...staticSuperset, ...dynamic]);
    expect(summary.scenarios[0]).toMatchObject({
      scenarioId: "A01",
      dynamicWebmcp: { averageTimeToReviewMs: 100 },
      staticSuperset: { averageTimeToReviewMs: 200 },
      delta: { successRate: 0, invalidCalls: -25, averageTimeToReviewMs: null },
    });
    expect(summary.rollup).toEqual({
      "dynamic-webmcp": {
        runs: 5,
        passes: 5,
        totalToolCalls: 20,
        invalidCalls: 5,
        repeatedInvalidCalls: 0,
        staleRecoveryTurns: 0,
      },
      "static-superset": {
        runs: 5,
        passes: 5,
        totalToolCalls: 20,
        invalidCalls: 30,
        repeatedInvalidCalls: 0,
        staleRecoveryTurns: 0,
      },
    });
    expect(summary.limitations).toContainEqual(expect.objectContaining({
      metric: "averageTimeToReviewMs",
      compared: false,
      reason: expect.stringContaining("production dynamic WebMCP and local static-superset harnesses"),
    }));
    expect(summarizeAblation([...dynamic, ...staticSuperset])).toEqual(summary);
    expect(ablationRequest()).toMatchObject({ scenarioIds: ["A01", "A02", "A03"], conditions: ["dynamic-webmcp", "static-superset"] });
  });

  it("keeps scoreRuns compatible while making optional time metrics deterministic", () => {
    const first = run({ run: 1, metrics: { ...run().metrics, timeToReviewMs: 200 } });
    const second = run({ run: 2, metrics: { ...run().metrics, timeToReviewMs: 100 } });
    expect(scoreRuns([first, second])).toEqual([expect.objectContaining({
      key: "dynamic-webmcp/A01",
      runs: 2,
      passes: 2,
      successRate: 1,
      timeToReviewMs: [100, 200],
    })]);
  });
});
