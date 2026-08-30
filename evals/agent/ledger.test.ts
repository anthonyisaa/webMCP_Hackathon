import { describe, expect, it } from "vitest";
import { ablationRequest, findSensitiveData, summarizeAblation, validateAgentRun, validateLedger } from "./ledger";
import { scoreRuns, type AgentRun } from "./score";

const transcriptExists = () => true;

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
    expect(validateAgentRun(run(), { transcriptExists }).issues).toEqual([]);
  });

  it("rejects missing transcripts, unknown fields, and sensitive values", () => {
    expect(validateAgentRun(run(), { transcriptExists: () => false }).issues).toContainEqual(
      expect.objectContaining({ path: "$.transcriptPath", message: expect.stringContaining("missing") }),
    );
    expect(validateAgentRun({ ...run(), apiKey: "sk_live_abcdefghijklmnopqrstuvwxyz" }, { transcriptExists }).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.apiKey", message: expect.stringContaining("sensitive") }),
        expect.objectContaining({ path: "$.apiKey", message: expect.stringContaining("unexpected") }),
      ]),
    );
    expect(findSensitiveData({ transcript: "Bearer abcdefghijklmnopqrstuvwxyz" })).toHaveLength(1);
  });

  it("requires exactly five valid, uniquely numbered reset-verified runs for each target", () => {
    const valid = five("A01", "dynamic-webmcp");
    const request = { scenarioIds: ["A01"], conditions: ["dynamic-webmcp" as const] };
    expect(validateLedger(valid, request, { transcriptExists }).ok).toBe(true);
    const missingReset = valid.map((candidate) => candidate.run === 3 ? { ...candidate, metrics: { ...candidate.metrics, resetVerified: false } } : candidate);
    expect(validateLedger(missingReset, request, { transcriptExists }).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("reset-verified") }),
    ]));
    const duplicateRun = valid.map((candidate) => candidate.run === 5 ? { ...candidate, run: 4 } : candidate);
    expect(validateLedger(duplicateRun, request, { transcriptExists }).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("numbered 1, 2, 3, 4, 5") }),
    ]));
  });

  it("enforces the directly measurable A03 and A04 safety bars", () => {
    const a03 = five("A03", "dynamic-webmcp", { metrics: { ...run().metrics, invalidCalls: 1, repeatedInvalidCalls: 0 } });
    const a04 = five("A04", "dynamic-webmcp", { metrics: { ...run().metrics, committedBeforeHumanUi: true } });
    const result = validateLedger([...a03, ...a04], { scenarioIds: ["A03", "A04"], conditions: ["dynamic-webmcp"] }, { transcriptExists });
    expect(result.bars.find((bar) => bar.scenarioId === "A03")?.satisfied).toBe(true);
    expect(result.bars.find((bar) => bar.scenarioId === "A04")?.satisfied).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("produces a stable ablation comparison from sanitized input", () => {
    const dynamic = five("A01", "dynamic-webmcp", { metrics: { ...run().metrics, invalidCalls: 1, timeToReviewMs: 100 } });
    const staticSuperset = five("A01", "static-superset", { metrics: { ...run().metrics, invalidCalls: 6, timeToReviewMs: 200 } });
    const summary = summarizeAblation([...staticSuperset, ...dynamic]);
    expect(summary.scenarios[0]).toMatchObject({
      scenarioId: "A01",
      delta: { successRate: 0, invalidCalls: -25, averageTimeToReviewMs: -100 },
    });
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
