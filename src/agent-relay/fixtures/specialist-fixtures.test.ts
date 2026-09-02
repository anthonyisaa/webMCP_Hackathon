import { describe, expect, it } from "vitest";

import managedRelayGolden from "../../../evals/goldens/repo-document-v4.2/managed-relay.json";
import {
  DeterministicSpecialistFixtureAdapter,
  SPECIALIST_FIXTURE_VERSION,
  SYNTHETIC_DEMO_DATA_LABEL,
} from "./specialist-fixtures";

describe("deterministic specialist fixtures", () => {
  it("matches the independent Northstar capacity oracle and shows its synthetic boundary", async () => {
    const fixtures = new DeterministicSpecialistFixtureAdapter();
    const result = await fixtures.queryDemoMetrics({
      dataset: "northstar_launch_capacity",
      question: "Which October 15 scope fits the corrected capacity?",
    });

    expect(result).toMatchObject({
      sourceLabel: SYNTHETIC_DEMO_DATA_LABEL,
      fixtureVersion: SPECIALIST_FIXTURE_VERSION,
      liveSystemQueried: false,
      syntheticSourceLabels: ["Synthetic demo data · northstar_launch_capacity"],
      dataset: "northstar_launch_capacity",
      facts: managedRelayGolden.productDocument.syntheticSources.northstar_launch_capacity,
      requiredConclusion: managedRelayGolden.productDocument.requiredConclusion,
      forbiddenConclusion: managedRelayGolden.productDocument.forbiddenConclusion,
      evidenceRefs: ["northstar_launch_capacity"],
    });
    expect(result.options).toEqual([
      expect.objectContaining({ totalDays: 10, fitsPreBetaCapacity: true }),
      expect.objectContaining({
        totalDays: 14,
        fitsPreBetaCapacity: true,
        remainingExportDaysAfterBeta: 4,
      }),
      expect.objectContaining({
        totalDays: 18,
        fitsPreBetaCapacity: false,
        exceedsCapacityByDays: 4,
      }),
    ]);
  });

  it("returns the checked INC-482 impact arithmetic without a live connector", async () => {
    const fixtures = new DeterministicSpecialistFixtureAdapter();
    const result = await fixtures.queryDemoMetrics({
      dataset: "inc_482_checkout_impact",
      question: "Reconcile attempts, successes, and failures.",
    });

    expect(result).toMatchObject({
      sourceLabel: SYNTHETIC_DEMO_DATA_LABEL,
      liveSystemQueried: false,
      syntheticSourceLabels: ["Synthetic demo data · impact.csv"],
      facts: {
        checkoutAttempts: 28_417,
        succeededAttempts: 21_675,
        failedAttempts: 6_742,
        affectedMerchants: 311,
        duplicateCharges: 0,
      },
      reconciliations: {
        succeededPlusFailed: 28_417,
        equalsCheckoutAttempts: true,
        duplicateChargeFinding: "No duplicate charges occurred.",
      },
      evidenceRefs: ["impact.csv"],
    });
  });

  it("searches and reads only the allowlisted synthetic code and log sources", async () => {
    const fixtures = new DeterministicSpecialistFixtureAdapter();
    const search = await fixtures.searchDemoCode({
      query: "INC-482 root cause: retry 429 queue checkout.log commit 7d3c9e1",
    });

    expect(search).toMatchObject({
      sourceLabel: SYNTHETIC_DEMO_DATA_LABEL,
      liveSystemQueried: false,
      resultCount: 2,
      availablePaths: ["src/checkout/retry-middleware.ts", "checkout.log"],
    });
    expect(search.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "src/checkout/retry-middleware.ts",
        evidenceRef: "commit:7d3c9e1",
        facts: {
          commit: "7d3c9e1",
          behavior: managedRelayGolden.postmortem.syntheticSources["commit:7d3c9e1"].behavior,
          ignoredHeader: "Retry-After",
          maximumZeroDelayRetries: 5,
          retryDelayMs: 0,
          roleInIncident: "internal amplifier",
        },
      }),
      expect.objectContaining({
        path: "checkout.log",
        evidenceRef: "checkout.log",
        facts: expect.objectContaining(
          managedRelayGolden.postmortem.syntheticSources["checkout.log"],
        ),
      }),
    ]));

    const code = await fixtures.readDemoFile({
      path: "src/checkout/retry-middleware.ts",
    });
    expect(code).toMatchObject({
      sourceLabel: SYNTHETIC_DEMO_DATA_LABEL,
      syntheticSourceLabels: [
        "Synthetic demo data · checkout.log",
        "Synthetic demo data · commit:7d3c9e1",
      ],
      evidenceRef: "commit:7d3c9e1",
      evidenceRefs: ["checkout.log", "commit:7d3c9e1"],
      facts: {
        commit: "7d3c9e1",
        behavior: managedRelayGolden.postmortem.syntheticSources["commit:7d3c9e1"].behavior,
        ignoredHeader: "Retry-After",
        maximumZeroDelayRetries: 5,
      },
    });
    expect(code.content).toContain("return 0;");
    expect(code.content).toContain("up to five retries");

    const log = await fixtures.readDemoFile({
      path: "checkout.log",
    });
    expect(log).toMatchObject({
      syntheticSourceLabels: [
        "Synthetic demo data · checkout.log",
        "Synthetic demo data · commit:7d3c9e1",
      ],
      evidenceRef: "checkout.log",
      evidenceRefs: ["checkout.log", "commit:7d3c9e1"],
      requestedLineRange: { startLine: 1, endLine: 5 },
      facts: expect.objectContaining(
        managedRelayGolden.postmortem.syntheticSources["checkout.log"],
      ),
    });
    expect(log.content).toContain("retry_traffic_multiple=5.8");
    expect(log.content).toContain("queue_depth_before=420 queue_depth_peak=18240");
  });

  it("rejects non-allowlisted paths, malformed inputs, and cancellation", async () => {
    const fixtures = new DeterministicSpecialistFixtureAdapter();

    await expect(fixtures.readDemoFile({
      path: "../../.env",
    } as never)).rejects.toMatchObject({ code: "FIXTURE_NOT_FOUND" });
    await expect(fixtures.searchDemoCode({ query: "" })).rejects.toMatchObject({
      code: "FIXTURE_INPUT_INVALID",
    });

    const controller = new AbortController();
    controller.abort();
    await expect(fixtures.readCompanyStyleGuide(controller.signal)).rejects.toMatchObject({
      code: "FIXTURE_ABORTED",
    });
  });

  it("keeps General editorial guidance distinct from Code and Data facts", async () => {
    const fixtures = new DeterministicSpecialistFixtureAdapter();
    const guide = await fixtures.readCompanyStyleGuide();
    const invalidIncident = await fixtures.checkDocumentConsistency({
      section: "Provider latency alone was the root cause.",
    });
    const invalidLaunch = await fixtures.checkDocumentConsistency({
      section: "Ship CSV to every customer on October 15 and treat that date as general availability.",
    });
    const valid = await fixtures.checkDocumentConsistency({
      section:
        "Run an invite-only design-partner beta on October 15, then launch full GA on November 1.",
    });

    expect(guide).toMatchObject({
      sourceLabel: SYNTHETIC_DEMO_DATA_LABEL,
      liveSystemQueried: false,
      guide: "Ratiflow company writing guide",
    });
    expect(JSON.stringify(guide)).not.toContain("7d3c9e1");
    expect(JSON.stringify(guide)).not.toContain("180000");
    expect(invalidIncident).toMatchObject({
      status: "NEEDS_REVISION",
      evidenceRefs: [
        "Ratiflow company style guide",
        "Ratiflow consistency rules",
      ],
      issues: [expect.objectContaining({ ruleId: "INCIDENT_CAUSALITY", severity: "ERROR" })],
    });
    expect(invalidLaunch).toMatchObject({
      status: "NEEDS_REVISION",
      issues: [expect.objectContaining({ ruleId: "LAUNCH_STAGE_LABELS", severity: "ERROR" })],
    });
    expect(valid).toMatchObject({ status: "PASS", issueCount: 0 });
  });

  it("returns fresh values so a caller cannot poison later deterministic reads", async () => {
    const fixtures = new DeterministicSpecialistFixtureAdapter();
    const first = await fixtures.queryDemoMetrics({
      dataset: "northstar_launch_capacity",
      question: "capacity",
    });
    const mutableFacts = first.facts as Record<string, unknown>;
    mutableFacts.preBetaCapacityDays = 999;

    const second = await fixtures.queryDemoMetrics({
      dataset: "northstar_launch_capacity",
      question: "capacity",
    });
    expect(second).toMatchObject({ facts: { preBetaCapacityDays: 14 } });
  });
});
