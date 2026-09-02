import type {
  CheckDocumentConsistencyInput,
  QueryDemoMetricsInput,
  ReadDemoFileInput,
  SearchDemoCodeInput,
  SpecialistFixturePort,
} from "@/agent-relay/contracts";

export const SPECIALIST_FIXTURE_VERSION = "ratiflow.specialist-fixtures/v1" as const;
export const SYNTHETIC_DEMO_DATA_LABEL = "Synthetic demo data" as const;

export type SpecialistFixtureErrorCode =
  | "FIXTURE_ABORTED"
  | "FIXTURE_INPUT_INVALID"
  | "FIXTURE_NOT_FOUND";

export class SpecialistFixtureError extends Error {
  readonly code: SpecialistFixtureErrorCode;

  constructor(code: SpecialistFixtureErrorCode, message: string) {
    super(message);
    this.name = "SpecialistFixtureError";
    this.code = code;
  }
}

type DemoSource = {
  path: string;
  evidenceRef: string;
  displayLabel: string;
  kind: "CODE" | "LOG";
  summary: string;
  keywords: readonly string[];
  lines: readonly string[];
  facts: Readonly<Record<string, unknown>>;
};

const NORTHSTAR_CAPACITY = {
  preBetaCapacityDays: 14,
  reliabilityDays: 10,
  inviteOnlyBetaDays: 4,
  fullExportDays: 8,
  inviteOnlyBetaDate: "October 15",
  fullGaDate: "November 1",
  renewalValueUsd: 180_000,
} as const;

const CHECKOUT_IMPACT = {
  incidentId: "INC-482",
  incidentStartUtc: "09:43",
  incidentRecoveryUtc: "10:21",
  checkoutAttempts: 28_417,
  succeededAttempts: 21_675,
  failedAttempts: 6_742,
  affectedMerchants: 311,
  duplicateCharges: 0,
} as const;

const DEMO_SOURCES: readonly DemoSource[] = [
  {
    path: "src/checkout/retry-middleware.ts",
    evidenceRef: "commit:7d3c9e1",
    displayLabel: `${SYNTHETIC_DEMO_DATA_LABEL} · commit:7d3c9e1`,
    kind: "CODE",
    summary:
      "Synthetic retry middleware at commit 7d3c9e1 returned a zero-delay retry for HTTP 429 responses and did not read Retry-After.",
    keywords: [
      "7d3c9e1",
      "commit",
      "retry",
      "retry-after",
      "middleware",
      "429",
      "checkout",
      "root cause",
      "amplifier",
      "zero-delay",
    ],
    lines: [
      "// SYNTHETIC DEMO DATA — no live repository was accessed.",
      "// commit:7d3c9e1",
      "const MAX_RETRIES = 5;",
      "",
      "export function retryDelayMs(status: number, attempt: number): number | null {",
      "  if (status !== 429 || attempt >= MAX_RETRIES) return null;",
      "",
      "  // Regression: response Retry-After was not read by this middleware.",
      "  return 0;",
      "}",
      "",
      "// Effect: up to five retries could be dispatched with zero delay.",
    ],
    facts: {
      commit: "7d3c9e1",
      behavior: "Retry middleware ignored Retry-After and made up to five zero-delay retries.",
      ignoredHeader: "Retry-After",
      maximumZeroDelayRetries: 5,
      retryDelayMs: 0,
      roleInIncident: "internal amplifier",
    },
  },
  {
    path: "checkout.log",
    evidenceRef: "checkout.log",
    displayLabel: `${SYNTHETIC_DEMO_DATA_LABEL} · checkout.log`,
    kind: "LOG",
    summary:
      "Synthetic checkout log records provider 429s, retry amplification, queue growth, rollback, and recovery.",
    keywords: [
      "checkout.log",
      "log",
      "provider",
      "429",
      "retry",
      "queue",
      "rollback",
      "recovery",
      "root cause",
      "trigger",
      "amplifier",
    ],
    lines: [
      "# SYNTHETIC DEMO DATA — no production log was queried.",
      "09:43 UTC provider_response status=429 event=throttling_started",
      "09:47 UTC retry_traffic_multiple=5.8 queue_depth_before=420 queue_depth_peak=18240",
      "10:17 UTC rollback_started commit=7d3c9e1",
      "10:21 UTC checkout_success_rate=recovered",
    ],
    facts: {
      provider429StartedUtc: "09:43",
      retryTrafficMultiple: 5.8,
      queueDepthBefore: 420,
      queueDepthPeak: 18_240,
      rollbackUtc: "10:17",
      recoveryUtc: "10:21",
      providerThrottlingRole: "external trigger",
    },
  },
] as const;

const CHECKOUT_INCIDENT_EVIDENCE_REFS = [
  "checkout.log",
  "commit:7d3c9e1",
] as const;
const GENERAL_EDITORIAL_EVIDENCE_REFS = [
  "Ratiflow company style guide",
  "Ratiflow consistency rules",
] as const;

const COMPANY_STYLE_RULES = [
  {
    id: "DECISION_FIRST",
    instruction: "Lead with the decision or conclusion, then support it with evidence.",
  },
  {
    id: "INCIDENT_CAUSALITY",
    instruction:
      "For incidents, distinguish the external trigger from the internal amplifier and sustained root cause.",
  },
  {
    id: "LAUNCH_STAGE_LABELS",
    instruction:
      "Call limited October 15 access an invite-only design-partner beta; reserve full GA for November 1.",
  },
  {
    id: "PRESERVE_FACTS",
    instruction:
      "Rewording must preserve dates, quantities, source references, and the exact selected scope.",
  },
  {
    id: "PLAIN_LANGUAGE",
    instruction: "Use short, direct sentences and avoid unsupported certainty.",
  },
] as const;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SpecialistFixtureError(
      "FIXTURE_ABORTED",
      "The deterministic specialist fixture read was cancelled.",
    );
  }
}

function requireBoundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    throw new SpecialistFixtureError(
      "FIXTURE_INPUT_INVALID",
      `${field} must contain between 1 and ${maxLength} characters.`,
    );
  }
  return value;
}

function cloneRecord<T extends Readonly<Record<string, unknown>>>(value: T): T {
  return structuredClone(value);
}

function sourceMetadata(sourceRefs: readonly string[]): Readonly<Record<string, unknown>> {
  return {
    sourceLabel: SYNTHETIC_DEMO_DATA_LABEL,
    fixtureVersion: SPECIALIST_FIXTURE_VERSION,
    liveSystemQueried: false,
    syntheticSourceLabels: sourceRefs.map(
      (sourceRef) => `${SYNTHETIC_DEMO_DATA_LABEL} · ${sourceRef}`,
    ),
  };
}

function normalizedSearchScore(query: string, source: DemoSource): number {
  const normalizedQuery = query.toLocaleLowerCase("en-US");
  return source.keywords.reduce(
    (score, keyword) => score + (normalizedQuery.includes(keyword) ? 1 : 0),
    0,
  );
}

function findDemoSource(path: string): DemoSource | undefined {
  return DEMO_SOURCES.find((source) => source.path === path);
}

type ConsistencyIssue = {
  ruleId: (typeof COMPANY_STYLE_RULES)[number]["id"];
  severity: "ERROR" | "WARNING";
  message: string;
};

function inspectConsistency(section: string): ConsistencyIssue[] {
  const normalized = section.toLocaleLowerCase("en-US");
  const issues: ConsistencyIssue[] = [];

  if (normalized.includes("provider latency alone") && normalized.includes("root cause")) {
    issues.push({
      ruleId: "INCIDENT_CAUSALITY",
      severity: "ERROR",
      message:
        "The section attributes root cause to provider latency alone instead of separating trigger, amplifier, and sustained cause.",
    });
  }

  const october15IsGa =
    normalized.includes("october 15") &&
    (normalized.includes("treat that date as general availability") ||
      normalized.includes("full ga on october 15") ||
      normalized.includes("customer-ready on october 15") ||
      normalized.includes("every customer on october 15"));
  if (october15IsGa) {
    issues.push({
      ruleId: "LAUNCH_STAGE_LABELS",
      severity: "ERROR",
      message:
        "October 15 must remain an invite-only design-partner beta, not general availability or full-customer access.",
    });
  } else if (
    normalized.includes("october 15") &&
    normalized.includes("beta") &&
    !normalized.includes("invite-only") &&
    !normalized.includes("design partner")
  ) {
    issues.push({
      ruleId: "LAUNCH_STAGE_LABELS",
      severity: "WARNING",
      message:
        "Qualify the October 15 beta as invite-only or design-partner access.",
    });
  }

  if (
    normalized.includes("investigation in progress") ||
    normalized.includes("analysis in progress") ||
    normalized.includes("synthesis pending")
  ) {
    issues.push({
      ruleId: "DECISION_FIRST",
      severity: "WARNING",
      message: "Replace the placeholder with a direct conclusion supported by evidence.",
    });
  }

  return issues;
}

/** Pure, deterministic specialist data for the public demo; no connector or filesystem access. */
export class DeterministicSpecialistFixtureAdapter implements SpecialistFixturePort {
  async queryDemoMetrics(
    input: QueryDemoMetricsInput,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    throwIfAborted(signal);
    const question = requireBoundedText(input?.question, "question", 500);

    if (input.dataset === "northstar_launch_capacity") {
      return cloneRecord({
        ...sourceMetadata(["northstar_launch_capacity"]),
        dataset: input.dataset,
        question,
        facts: NORTHSTAR_CAPACITY,
        options: [
          {
            option: "Reliability only",
            calculation: "10 reliability days",
            totalDays: 10,
            fitsPreBetaCapacity: true,
            customerOutcome: "No CSV on October 15",
          },
          {
            option: "Invite-only design-partner beta",
            calculation: "10 reliability days + 4 beta-export days = 14 days",
            totalDays: 14,
            fitsPreBetaCapacity: true,
            remainingExportDaysAfterBeta: 4,
            customerOutcome: "Invite-only beta on October 15; full GA on November 1",
          },
          {
            option: "Full export before beta",
            calculation: "10 reliability days + 8 full-export days = 18 days",
            totalDays: 18,
            fitsPreBetaCapacity: false,
            exceedsCapacityByDays: 4,
            customerOutcome: "Does not fit the October 15 window",
          },
        ],
        requiredConclusion:
          "10 reliability days plus 4 invite-only beta days exactly fit 14 days; 10 plus 8 full-export days require 18 and exceed capacity by 4; finish full GA by November 1.",
        forbiddenConclusion: "The October 15 invite-only beta is general availability.",
        evidenceRefs: ["northstar_launch_capacity"],
      });
    }

    if (input.dataset === "inc_482_checkout_impact") {
      return cloneRecord({
        ...sourceMetadata(["impact.csv"]),
        dataset: input.dataset,
        question,
        facts: CHECKOUT_IMPACT,
        reconciliations: {
          succeededPlusFailed: 28_417,
          equalsCheckoutAttempts: true,
          duplicateChargeFinding: "No duplicate charges occurred.",
        },
        evidenceRefs: ["impact.csv"],
      });
    }

    throw new SpecialistFixtureError(
      "FIXTURE_NOT_FOUND",
      "The requested synthetic metrics dataset is not allowlisted.",
    );
  }

  async searchDemoCode(
    input: SearchDemoCodeInput,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    throwIfAborted(signal);
    const query = requireBoundedText(input?.query, "query", 300);
    const results = DEMO_SOURCES
      .map((source) => ({ source, score: normalizedSearchScore(query, source) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.source.path.localeCompare(right.source.path))
      .map(({ source, score }) => ({
        path: source.path,
        kind: source.kind,
        evidenceRef: source.evidenceRef,
        sourceLabel: source.displayLabel,
        lineRange: { startLine: 1, endLine: source.lines.length },
        relevanceScore: score,
        summary: source.summary,
        facts: source.facts,
      }));

    return cloneRecord({
      ...sourceMetadata(["checkout.log", "commit:7d3c9e1"]),
      query,
      searchScope: "Bounded two-source synthetic checkout repository",
      resultCount: results.length,
      results,
      availablePaths: DEMO_SOURCES.map(({ path }) => path),
    });
  }

  async readDemoFile(
    input: ReadDemoFileInput,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    throwIfAborted(signal);
    const path = requireBoundedText(input?.path, "path", 240);
    const source = findDemoSource(path);
    if (!source) {
      throw new SpecialistFixtureError(
        "FIXTURE_NOT_FOUND",
        "The requested path is not in the synthetic source allowlist.",
      );
    }

    const selectedLines = source.lines;
    return cloneRecord({
      // The role sequence requires a successful deterministic search before this
      // read. Carry its complete, server-known incident evidence bundle forward
      // so the eventual revision can be bound to both canonical sources.
      ...sourceMetadata(CHECKOUT_INCIDENT_EVIDENCE_REFS),
      path: source.path,
      kind: source.kind,
      evidenceRef: source.evidenceRef,
      evidenceRefs: CHECKOUT_INCIDENT_EVIDENCE_REFS,
      availableLineRange: { startLine: 1, endLine: source.lines.length },
      requestedLineRange: { startLine: 1, endLine: source.lines.length },
      content: selectedLines.join("\n"),
      lines: selectedLines.map((text, index) => ({
        lineNumber: index + 1,
        text,
      })),
      facts: source.facts,
    });
  }

  async readCompanyStyleGuide(
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    throwIfAborted(signal);
    return cloneRecord({
      ...sourceMetadata(["Ratiflow company style guide"]),
      guide: "Ratiflow company writing guide",
      rules: COMPANY_STYLE_RULES,
      evidenceRefs: ["Ratiflow company style guide"],
    });
  }

  async checkDocumentConsistency(
    input: CheckDocumentConsistencyInput,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    throwIfAborted(signal);
    const section = requireBoundedText(input?.section, "section", 8_000);
    const issues = inspectConsistency(section);
    return cloneRecord({
      // The role sequence requires a successful style-guide read before this
      // consistency check, so carry the complete editorial evidence bundle.
      ...sourceMetadata(GENERAL_EDITORIAL_EVIDENCE_REFS),
      status: issues.some(({ severity }) => severity === "ERROR")
        ? "NEEDS_REVISION"
        : issues.length > 0
          ? "REVIEW"
          : "PASS",
      issueCount: issues.length,
      issues,
      checkedRuleIds: COMPANY_STYLE_RULES.map(({ id }) => id),
      evidenceRefs: GENERAL_EDITORIAL_EVIDENCE_REFS,
    });
  }
}

export function createSpecialistFixturePort(): SpecialistFixturePort {
  return new DeterministicSpecialistFixtureAdapter();
}
