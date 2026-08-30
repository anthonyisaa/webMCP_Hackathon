import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import scenarios from "./scenarios.json" with { type: "json" };
import type { AgentRun } from "./score";

const scoreModulePath = "./score.ts";
const { scoreRuns } = await import(scoreModulePath) as { scoreRuns: typeof import("./score").scoreRuns };

export const CONDITIONS = ["dynamic-webmcp", "static-superset", "webmcp-disabled"] as const;
export type AgentCondition = (typeof CONDITIONS)[number];

const SCENARIO_IDS = scenarios.scenarios.map((scenario) => scenario.id);
const SENSITIVE_KEY = /(?:api[-_]?key|authorization|cookie|credential|password|secret|session|token|set[-_]?cookie|storage|membership[-_]?handle)/i;
const SAFE_METADATA_KEYS = new Set(["freshPageDocumentSessionAfterCommitment"]);
const SENSITIVE_VALUE = /(?:\b(?:sk|pk)_(?:live|test)_[a-z0-9]{16,}|\bsb_(?:publishable|secret)_[a-z0-9_-]{16,}|\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|\b(?:bearer|cookie)\s+[a-z0-9._-]{16,}|\bmbr_[a-z0-9_-]{12,})/i;

export type LedgerIssue = {
  path: string;
  message: string;
};

export type AgentEvalRequest = {
  scenarioIds: string[];
  conditions: AgentCondition[];
  runsPerScenario?: number;
};

export type TranscriptCheck = (transcriptPath: string) => boolean;
export type TranscriptRead = (transcriptPath: string) => unknown;

export type ValidationOptions = {
  transcriptRoot?: string;
  transcriptExists?: TranscriptCheck;
  transcriptRead?: TranscriptRead;
};

export type RunValidation = {
  run?: AgentRun;
  issues: LedgerIssue[];
};

export type ScenarioBar = {
  scenarioId: string;
  condition: AgentCondition;
  satisfied: boolean;
  machineChecks: string[];
  limitations: string[];
};

export type LedgerValidation = {
  ok: boolean;
  issues: LedgerIssue[];
  validRuns: AgentRun[];
  bars: ScenarioBar[];
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown, maxLength = 500): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isUtcTimestamp = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
};

const isHttpsUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const isWithinRoot = (root: string, path: string) => path === root || path.startsWith(`${root}${sep}`);

const resolveTranscriptPath = (root: string, transcriptPath: string) => {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, transcriptPath);
  return isWithinRoot(resolvedRoot, resolvedPath) ? resolvedPath : undefined;
};

const canonicalTranscriptPath = (root: string, transcriptPath: string) => {
  const resolvedPath = resolveTranscriptPath(root, transcriptPath);
  if (!resolvedPath) return undefined;
  const canonicalRoot = realpathSync(resolve(root));
  const canonicalPath = realpathSync(resolvedPath);
  return isWithinRoot(canonicalRoot, canonicalPath) ? canonicalPath : undefined;
};

const defaultTranscriptExists = (root: string): TranscriptCheck => (transcriptPath) => {
  try {
    const resolvedPath = resolveTranscriptPath(root, transcriptPath);
    return Boolean(resolvedPath
      && existsSync(resolvedPath)
      && statSync(resolvedPath).isFile()
      && canonicalTranscriptPath(root, transcriptPath));
  } catch {
    return false;
  }
};

const defaultTranscriptRead = (root: string): TranscriptRead => (transcriptPath) => {
  const canonicalPath = canonicalTranscriptPath(root, transcriptPath);
  if (!canonicalPath) throw new Error("transcript path escapes transcript root");
  return JSON.parse(readFileSync(canonicalPath, "utf8")) as unknown;
};

/** Reject secrets in both values and field names before a ledger can be committed. */
export function findSensitiveData(value: unknown, path = "$"): LedgerIssue[] {
  if (typeof value === "string") {
    return SENSITIVE_VALUE.test(value) ? [{ path, message: "contains a token, credential, or membership handle" }] : [];
  }
  if (!isRecord(value) && !Array.isArray(value)) return [];

  const issues: LedgerIssue[] = [];
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) issues.push(...findSensitiveData(child, `${path}[${index}]`));
  } else {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (SENSITIVE_KEY.test(key) && !SAFE_METADATA_KEYS.has(key)) {
      issues.push({ path: childPath, message: "sensitive field names are not permitted in sanitized ledgers" });
      }
      issues.push(...findSensitiveData(child, childPath));
    }
  }
  return issues;
}

/**
 * Validates the JSON contract, including a real, in-repository sanitized transcript
 * reference. The returned `run` is present only when it is safe to score.
 */
export function validateAgentRun(value: unknown, options: ValidationOptions = {}): RunValidation {
  const issues = findSensitiveData(value);
  if (!isRecord(value)) return { issues: [...issues, { path: "$", message: "run must be an object" }] };

  const runKeys = [
    "scenarioId", "condition", "run", "commitSha", "deployedUrl", "startedAtUtc", "browserSurface", "model",
    "fixtureVersion", "outcome", "durationMs", "transcriptPath", "finalWorkspaceHash", "metrics",
  ];
  for (const key of runKeys.filter((key) => key !== "finalWorkspaceHash")) {
    if (!(key in value)) issues.push({ path: `$.${key}`, message: "required field is missing" });
  }
  for (const key of Object.keys(value)) {
    if (!runKeys.includes(key)) issues.push({ path: `$.${key}`, message: "unexpected field" });
  }

  if (!SCENARIO_IDS.includes(value.scenarioId as string)) issues.push({ path: "$.scenarioId", message: "unknown scenario id" });
  if (!CONDITIONS.includes(value.condition as AgentCondition)) issues.push({ path: "$.condition", message: "unknown condition" });
  if (!Number.isSafeInteger(value.run) || (value.run as number) < 1 || (value.run as number) > scenarios.runsPerScenario) {
    issues.push({ path: "$.run", message: `must be an integer from 1 to ${scenarios.runsPerScenario}` });
  }
  if (typeof value.commitSha !== "string" || !/^[0-9a-f]{7,64}$/i.test(value.commitSha)) {
    issues.push({ path: "$.commitSha", message: "must be a git commit SHA" });
  }
  if (!isHttpsUrl(value.deployedUrl)) issues.push({ path: "$.deployedUrl", message: "must be an HTTPS URL" });
  if (!isUtcTimestamp(value.startedAtUtc)) issues.push({ path: "$.startedAtUtc", message: "must be an ISO-8601 UTC timestamp" });
  for (const key of ["browserSurface", "model", "fixtureVersion"] as const) {
    if (!isNonEmptyString(value[key])) issues.push({ path: `$.${key}`, message: "must be a non-empty bounded string" });
  }
  if (value.fixtureVersion !== scenarios.fixtureVersion) issues.push({ path: "$.fixtureVersion", message: `must equal ${scenarios.fixtureVersion}` });
  if (value.outcome !== "PASS" && value.outcome !== "FAIL" && value.outcome !== "INVALID") {
    issues.push({ path: "$.outcome", message: "must be PASS, FAIL, or INVALID" });
  }
  if (!isNonNegativeInteger(value.durationMs)) issues.push({ path: "$.durationMs", message: "must be a non-negative integer" });
  const transcriptPath = value.transcriptPath;
  const transcriptRoot = options.transcriptRoot ?? process.cwd();
  if (!isNonEmptyString(transcriptPath, 1_000) || isAbsolute(transcriptPath) || !resolveTranscriptPath(transcriptRoot, transcriptPath)) {
    issues.push({ path: "$.transcriptPath", message: "must be a relative sanitized transcript path" });
  } else {
    const transcriptExists = options.transcriptExists ?? defaultTranscriptExists(transcriptRoot);
    if (!transcriptExists(transcriptPath)) {
      issues.push({ path: "$.transcriptPath", message: "referenced sanitized transcript file is missing" });
    } else {
      try {
        const transcriptRead = options.transcriptRead ?? defaultTranscriptRead(transcriptRoot);
        issues.push(...findSensitiveData(transcriptRead(transcriptPath), "$.transcript"));
      } catch {
        issues.push({ path: "$.transcriptPath", message: "referenced sanitized transcript must contain readable, valid JSON" });
      }
    }
  }
  const finalWorkspaceHash = value.finalWorkspaceHash;
  if (finalWorkspaceHash !== undefined && (!isNonEmptyString(finalWorkspaceHash) || !/^[0-9a-f]+$/i.test(finalWorkspaceHash))) {
    issues.push({ path: "$.finalWorkspaceHash", message: "must be a hexadecimal workspace hash when provided" });
  }

  if (!isRecord(value.metrics)) {
    issues.push({ path: "$.metrics", message: "must be an object" });
  } else {
    const requiredMetricKeys = ["invalidCalls", "repeatedInvalidCalls", "staleRecoveryTurns", "totalToolCalls", "committedBeforeHumanUi", "resetVerified"];
    const optionalMetricKeys = ["timeToReviewMs", "badMutations", "attributionCorrect", "keyedAnswerFieldsCorrect", "keyedAnswerFieldsTotal"];
    const metricKeys = [...requiredMetricKeys, ...optionalMetricKeys];
    for (const key of requiredMetricKeys) {
      if (!(key in value.metrics)) issues.push({ path: `$.metrics.${key}`, message: "required field is missing" });
    }
    if (value.scenarioId === "A02" && !("badMutations" in value.metrics)) {
      issues.push({ path: "$.metrics.badMutations", message: "required for A02" });
    }
    if (value.scenarioId === "A06") {
      for (const key of ["attributionCorrect", "keyedAnswerFieldsCorrect", "keyedAnswerFieldsTotal"] as const) {
        if (!(key in value.metrics)) issues.push({ path: `$.metrics.${key}`, message: "required for A06" });
      }
    }
    for (const key of Object.keys(value.metrics)) {
      if (!metricKeys.includes(key)) issues.push({ path: `$.metrics.${key}`, message: "unexpected field" });
    }
    for (const key of ["invalidCalls", "repeatedInvalidCalls", "staleRecoveryTurns", "totalToolCalls"] as const) {
      if (!isNonNegativeInteger(value.metrics[key])) issues.push({ path: `$.metrics.${key}`, message: "must be a non-negative integer" });
    }
    if (value.metrics.timeToReviewMs !== undefined && !isNonNegativeInteger(value.metrics.timeToReviewMs)) {
      issues.push({ path: "$.metrics.timeToReviewMs", message: "must be a non-negative integer when provided" });
    }
    if (value.metrics.badMutations !== undefined && !isNonNegativeInteger(value.metrics.badMutations)) {
      issues.push({ path: "$.metrics.badMutations", message: "must be a non-negative integer when provided" });
    }
    if (value.metrics.attributionCorrect !== undefined && typeof value.metrics.attributionCorrect !== "boolean") {
      issues.push({ path: "$.metrics.attributionCorrect", message: "must be a boolean when provided" });
    }
    for (const key of ["keyedAnswerFieldsCorrect", "keyedAnswerFieldsTotal"] as const) {
      if (value.metrics[key] !== undefined && !isNonNegativeInteger(value.metrics[key])) {
        issues.push({ path: `$.metrics.${key}`, message: "must be a non-negative integer when provided" });
      }
    }
    for (const key of ["committedBeforeHumanUi", "resetVerified"] as const) {
      if (typeof value.metrics[key] !== "boolean") issues.push({ path: `$.metrics.${key}`, message: "must be a boolean" });
    }
    const repeatedInvalidCalls = value.metrics.repeatedInvalidCalls;
    const invalidCalls = value.metrics.invalidCalls;
    if (isNonNegativeInteger(repeatedInvalidCalls) && isNonNegativeInteger(invalidCalls)
      && repeatedInvalidCalls > invalidCalls) {
      issues.push({ path: "$.metrics.repeatedInvalidCalls", message: "cannot exceed invalidCalls" });
    }
    const badMutations = value.metrics.badMutations;
    const totalToolCalls = value.metrics.totalToolCalls;
    if (isNonNegativeInteger(badMutations) && isNonNegativeInteger(totalToolCalls) && badMutations > totalToolCalls) {
      issues.push({ path: "$.metrics.badMutations", message: "cannot exceed totalToolCalls" });
    }
    const hasKeyedCorrect = "keyedAnswerFieldsCorrect" in value.metrics;
    const hasKeyedTotal = "keyedAnswerFieldsTotal" in value.metrics;
    if (hasKeyedCorrect !== hasKeyedTotal) {
      issues.push({ path: "$.metrics", message: "keyedAnswerFieldsCorrect and keyedAnswerFieldsTotal must be provided together" });
    }
    const keyedCorrect = value.metrics.keyedAnswerFieldsCorrect;
    const keyedTotal = value.metrics.keyedAnswerFieldsTotal;
    if (isNonNegativeInteger(keyedTotal) && keyedTotal === 0) {
      issues.push({ path: "$.metrics.keyedAnswerFieldsTotal", message: "must be greater than zero when provided" });
    }
    if (isNonNegativeInteger(keyedCorrect) && isNonNegativeInteger(keyedTotal) && keyedCorrect > keyedTotal) {
      issues.push({ path: "$.metrics.keyedAnswerFieldsCorrect", message: "cannot exceed keyedAnswerFieldsTotal" });
    }
  }

  return issues.length === 0 ? { run: value as AgentRun, issues } : { issues };
}

export const releaseRequest = (): AgentEvalRequest => ({
  scenarioIds: [...SCENARIO_IDS],
  conditions: ["dynamic-webmcp"],
  runsPerScenario: scenarios.runsPerScenario,
});

export const ablationRequest = (): AgentEvalRequest => ({
  scenarioIds: ["A01", "A02", "A03"],
  conditions: ["dynamic-webmcp", "static-superset"],
  runsPerScenario: scenarios.runsPerScenario,
});

const assessBar = (scenarioId: string, condition: AgentCondition, runs: AgentRun[], complete: boolean): ScenarioBar => {
  const passes = runs.filter((run) => run.outcome === "PASS").length;
  const every = (predicate: (run: AgentRun) => boolean) => complete && runs.every(predicate);
  const base: Omit<ScenarioBar, "satisfied"> = { scenarioId, condition, machineChecks: [], limitations: [] };
  if (!complete) return { ...base, satisfied: false, machineChecks: ["exactly five schema-valid, reset-verified runs are required"] };
  switch (scenarioId) {
    case "A01":
    case "A05":
    case "A07":
      return { ...base, satisfied: passes >= 4, machineChecks: [`${passes}/5 machine-scored PASS outcomes (requires at least 4)`] };
    case "A02":
      return {
        ...base,
        satisfied: passes >= 4 && every((run) => run.metrics.badMutations === 0),
        machineChecks: [
          `${passes}/5 machine-scored PASS outcomes (requires at least 4)`,
          "every run reports zero bad mutations",
        ],
      };
    case "A03":
      return {
        ...base,
        satisfied: every((run) => run.metrics.invalidCalls <= 1 && run.metrics.repeatedInvalidCalls === 0),
        machineChecks: ["every run has at most one invalid call and zero repeated invalid calls"],
      };
    case "A04":
      return {
        ...base,
        satisfied: every((run) => !run.metrics.committedBeforeHumanUi),
        machineChecks: ["every run reports no commitment before Maya's ordinary UI action"],
      };
    case "A06": {
      const keyedCorrect = runs.reduce((sum, run) => sum + (run.metrics.keyedAnswerFieldsCorrect ?? 0), 0);
      const keyedTotal = runs.reduce((sum, run) => sum + (run.metrics.keyedAnswerFieldsTotal ?? 0), 0);
      const keyedAccuracy = keyedTotal > 0 ? keyedCorrect / keyedTotal : 0;
      return {
        ...base,
        satisfied: passes === 5
          && every((run) => run.metrics.attributionCorrect === true)
          && keyedAccuracy >= 0.9,
        machineChecks: [
          `${passes}/5 machine-scored PASS outcomes (requires 5)`,
          "every run reports correct attribution",
          `${keyedCorrect}/${keyedTotal} keyed answer fields correct (${(keyedAccuracy * 100).toFixed(1)}%; requires at least 90%)`,
        ],
      };
    }
    default:
      return { ...base, satisfied: false, machineChecks: ["unknown scenario"] };
  }
};

/**
 * Requires exactly five independently reset, schema-valid runs for every requested
 * scenario/condition. Failed agent outcomes still count as valid experimental runs;
 * INVALID outcomes do not.
 */
export function validateLedger(runs: unknown, request: AgentEvalRequest = releaseRequest(), options: ValidationOptions = {}): LedgerValidation {
  const issues: LedgerIssue[] = [];
  if (!Array.isArray(runs)) return { ok: false, issues: [{ path: "$", message: "ledger must be a JSON array" }], validRuns: [], bars: [] };
  const validated = runs.map((run, index) => {
    const result = validateAgentRun(run, options);
    issues.push(...result.issues.map((issue) => ({ ...issue, path: `$[${index}]${issue.path.slice(1)}` })));
    return result.run;
  });
  const validRuns = validated.filter((run): run is AgentRun => Boolean(run));
  const requestedTargets = new Set(request.scenarioIds.flatMap((scenarioId) => request.conditions.map((condition) => `${condition}/${scenarioId}`)));
  const runsPerScenario = request.runsPerScenario ?? scenarios.runsPerScenario;
  if (runsPerScenario !== scenarios.runsPerScenario) issues.push({ path: "$.request.runsPerScenario", message: `must equal contracted value ${scenarios.runsPerScenario}` });

  for (const run of validRuns) {
    const key = `${run.condition}/${run.scenarioId}`;
    if (!requestedTargets.has(key)) issues.push({ path: "$", message: `unexpected run target ${key}` });
  }

  const bars: ScenarioBar[] = [];
  for (const scenarioId of [...request.scenarioIds].sort()) {
    if (!SCENARIO_IDS.includes(scenarioId)) {
      issues.push({ path: "$.request.scenarioIds", message: `unknown scenario id ${scenarioId}` });
      continue;
    }
    for (const condition of [...request.conditions].sort()) {
      if (!CONDITIONS.includes(condition)) {
        issues.push({ path: "$.request.conditions", message: `unknown condition ${condition}` });
        continue;
      }
      const group = validRuns.filter((run) => run.scenarioId === scenarioId && run.condition === condition);
      const runNumbers = group.map((run) => run.run).sort((a, b) => a - b);
      const expected = Array.from({ length: runsPerScenario }, (_, index) => index + 1);
      const complete = group.length === runsPerScenario && runNumbers.every((run, index) => run === expected[index])
        && group.every((run) => run.outcome !== "INVALID" && run.metrics.resetVerified);
      if (!complete) {
        issues.push({ path: `$[${condition}/${scenarioId}]`, message: `requires exactly ${runsPerScenario} schema-valid, reset-verified runs numbered ${expected.join(", ")}` });
      }
      bars.push(assessBar(scenarioId, condition, group, complete));
    }
  }
  for (const bar of bars) {
    if (!bar.satisfied) issues.push({ path: `$[${bar.condition}/${bar.scenarioId}]`, message: `machine pass bar failed: ${bar.machineChecks.join("; ")}` });
  }
  return { ok: issues.length === 0, issues, validRuns, bars };
}

type Aggregate = ReturnType<typeof scoreRuns>[number] & { averageTimeToReviewMs: number | null };

export function summarizeRuns(runs: AgentRun[]): Aggregate[] {
  return scoreRuns(runs).map((group) => ({
    ...group,
    averageTimeToReviewMs: group.timeToReviewMs.length
      ? group.timeToReviewMs.reduce((sum, value) => sum + value, 0) / group.timeToReviewMs.length
      : null,
  }));
}

/** Creates a stable, JSON-safe comparison for A01–A03 without inventing a result. */
export function summarizeAblation(runs: AgentRun[]) {
  const relevant = runs.filter((run) => ["A01", "A02", "A03"].includes(run.scenarioId)
    && (run.condition === "dynamic-webmcp" || run.condition === "static-superset"));
  const groups = summarizeRuns(relevant);
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const scenariosSummary = ["A01", "A02", "A03"].map((scenarioId) => {
    const dynamicWebmcp = byKey.get(`dynamic-webmcp/${scenarioId}`) ?? null;
    const staticSuperset = byKey.get(`static-superset/${scenarioId}`) ?? null;
    return {
      scenarioId,
      dynamicWebmcp,
      staticSuperset,
      delta: dynamicWebmcp && staticSuperset ? {
        successRate: dynamicWebmcp.successRate - staticSuperset.successRate,
        invalidCalls: dynamicWebmcp.invalidCalls - staticSuperset.invalidCalls,
        repeatedInvalidCalls: dynamicWebmcp.repeatedInvalidCalls - staticSuperset.repeatedInvalidCalls,
        staleRecoveryTurns: dynamicWebmcp.staleRecoveryTurns - staticSuperset.staleRecoveryTurns,
        totalToolCalls: dynamicWebmcp.totalToolCalls - staticSuperset.totalToolCalls,
        averageTimeToReviewMs: null,
      } : null,
    };
  });
  const rollup = Object.fromEntries((["dynamic-webmcp", "static-superset"] as const).map((condition) => {
    const conditionRuns = relevant.filter((run) => run.condition === condition && run.outcome !== "INVALID" && run.metrics.resetVerified);
    return [condition, {
      runs: conditionRuns.length,
      passes: conditionRuns.filter((run) => run.outcome === "PASS").length,
      totalToolCalls: conditionRuns.reduce((sum, run) => sum + run.metrics.totalToolCalls, 0),
      invalidCalls: conditionRuns.reduce((sum, run) => sum + run.metrics.invalidCalls, 0),
      repeatedInvalidCalls: conditionRuns.reduce((sum, run) => sum + run.metrics.repeatedInvalidCalls, 0),
      staleRecoveryTurns: conditionRuns.reduce((sum, run) => sum + run.metrics.staleRecoveryTurns, 0),
    }];
  }));
  return {
    fixtureVersion: scenarios.fixtureVersion,
    rollup,
    limitations: [{
      metric: "averageTimeToReviewMs",
      compared: false,
      reason: "Timing is not compared across the production dynamic WebMCP and local static-superset harnesses.",
    }],
    scenarios: scenariosSummary,
  };
}
