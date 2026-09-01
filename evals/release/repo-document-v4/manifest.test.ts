import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_ROW_IDS,
  BROWSER_ROW_IDS,
  DOMAIN_ROW_IDS,
  EVIDENCE_SCHEMA_VERSION,
  FIXTURE_VERSIONS,
  JUDGE_ROW_IDS,
  NATIVE_ROW_IDS,
  RELEASE_ROW_IDS,
  V4_TOOL_NAMES,
  VISUAL_ROW_IDS,
  findSensitiveData,
  sha256CanonicalJson,
  sha256Text,
  validateReleaseManifest,
  type EvidenceClass,
} from "./manifest";
import { DEFAULT_MANIFEST, isAllPendingTemplate, runReleaseManifestCli } from "./validate";

type UnknownRecord = Record<string, unknown>;
type Bundle = {
  root: string;
  manifest: UnknownRecord;
  options: Parameters<typeof validateReleaseManifest>[1];
  cleanup: () => void;
};

const TEMPLATE_PATH = fileURLToPath(new URL("./manifest.json", import.meta.url));
const template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8")) as UnknownRecord;
const SOURCE_SHA = "a".repeat(40);
const DEPLOYED_URL = "https://ratiflow-v4.example.com/";
const DEPLOYMENT_ID = "dpl_repo_document_v4";
const MIGRATION_ID = "20260901154147_repository_v4_issue_documents.sql";
const CAPTURED_AT = "2026-09-02T10:00:00.000Z";
const NATIVE_AT = "2026-09-02T11:00:00.000Z";
const JUDGE_AT = "2026-09-02T12:00:00.000Z";
const RECORDED_AT = "2026-09-02T13:00:00.000Z";
const cleanGitState = () => ({
  headSha: SOURCE_SHA,
  indexClean: true,
  worktreeClean: true,
  untrackedClean: true,
  requiredSourceFilesAtHead: true,
  pendingTemplateAtHead: true,
});
const clone = <T>(value: T): T => structuredClone(value);
const object = (value: unknown) => value as UnknownRecord;
const array = (value: unknown) => value as unknown[];
const artifactRef = (row: UnknownRecord) => object(array(row.artifactRefs)[0]);

const rootFor = (section: string) => ({
  domainEvidence: "evals/protocol/repo-document-v4",
  browserEvidence: "evals/browser/repo-document-v4",
  nativeEvidence: "evals/native/repo-document-v4",
  agentEvidence: "evals/agent/repo-document-v4",
  ablation: "evals/ablation/repo-document-v4",
  visualEvidence: "evals/release/repo-document-v4/visual",
  releaseEvidence: "evals/release/repo-document-v4/rehearsal",
  judges: "evals/judges/repo-document-v4/final",
}[section] as string);

const evidenceClassFor = (section: string, gateId: string): EvidenceClass => {
  if (section === "domainEvidence") return "AUTOMATED";
  if (section === "browserEvidence") return ["B09", "B10", "B12", "B14"].includes(gateId) ? "ADAPTER_CAPTURED" : "AUTOMATED";
  if (section === "nativeEvidence" || section === "agentEvidence" || section === "ablation") return "NATIVE_CAPTURED";
  if (section === "visualEvidence" || section === "judges") return "MANUAL_CAPTURED";
  if (gateId === "R01" || gateId === "R03") return "NATIVE_CAPTURED";
  if (gateId === "R02") return "AUTOMATED";
  return "MANUAL_CAPTURED";
};

const detailsFor = (
  section: string,
  gateId: string,
  evidenceClass: EvidenceClass,
  capturedAtUtc: string,
  row?: UnknownRecord,
) => {
  const details: UnknownRecord = {
    passed: true,
    summary: `${gateId} passed against the exact v4 release candidate`,
    observations: [{ assertion: gateId, outcome: "PASS" }],
  };
  if (evidenceClass === "AUTOMATED" || evidenceClass === "ADAPTER_CAPTURED") {
    details.runner = {
      command: `release-operation:${gateId.toLowerCase()}`,
      exitCode: 0,
      completedAtUtc: capturedAtUtc,
      outputSha256: "b".repeat(64),
    };
  }
  if (evidenceClass === "NATIVE_CAPTURED") {
    details.nativeEligibility = {
      captureKind: "SUPPORTED_CLIENT_NATIVE_WEBMCP",
      topLevelIssuePage: true,
      injectedModelContext: false,
      internalRouteUsed: false,
      directApiOrRpcUsed: false,
      domAutomationUsed: false,
    };
  }
  if (gateId === "N01") details.toolNames = [...V4_TOOL_NAMES];
  if (section === "agentEvidence") {
    details.runCount = 5;
    details.successfulRunCount = gateId === "A04" || gateId === "A06" ? 5 : 4;
    details.safetyViolationCount = 0;
    details.allRunsSourceBound = true;
    details.allTranscriptHashesVerified = true;
  }
  if (section === "ablation") {
    details.seedCount = 5;
    details.nativeCondition = "NATIVE_WEBMCP";
    details.controlCondition = "WEBMCP_DISABLED";
    details.adapterUsed = false;
    details.preordainedWinner = false;
    details.metrics = ["task detection", "final digest", "provenance", "turns", "time"];
  }
  if (gateId === "V01") {
    details.verdict = "SHIP";
    details.freshReadOnlyJudge = true;
    details.desktopDriven = true;
    details.mobile390Driven = true;
  }
  if (gateId === "R01") {
    details.consecutiveRunCount = 5;
    details.repairCount = 0;
  }
  if (gateId === "R02") {
    details.verifyPassed = true;
    details.buildPassed = true;
    details.localBrowserPassed = true;
    details.releaseBrowserPassed = true;
    details.runtimeReachable = true;
    details.postFlowErrorScanClean = true;
  }
  if (gateId === "R03") {
    details.nativeRows = [...NATIVE_ROW_IDS];
    details.adapterRowsUsed = [];
  }
  if (gateId === "R04") {
    details.durationMs = 170_000;
    details.publicYouTube = true;
    details.hasAudio = true;
    details.showsWorkingApp = true;
    details.showsNativeWebMcp = true;
    details.nativeCallReachedQuickly = true;
    details.showsDirect = true;
    details.showsReviewDiscussionAcceptance = true;
    details.showsHistory = true;
    details.videoUrl = "https://youtu.be/ratiflowv4";
    details.videoSourceCommitSha = SOURCE_SHA;
  }
  if (gateId === "R05") {
    details.liveUrlAccessible = true;
    details.repositoryPublic = true;
    details.sourcePresent = true;
    details.assetsPresent = true;
    details.setupPresent = true;
    details.licensePresent = true;
    details.allPublicSurfacesIdentifySourceSha = true;
    details.observedSourceCommitSha = SOURCE_SHA;
    details.repositoryUrl = "https://github.com/example/ratiflow";
    details.licenseSpdx = "MIT";
    details.licenseUrl = `https://github.com/example/ratiflow/blob/${SOURCE_SHA}/LICENSE`;
    details.videoUrl = "https://youtu.be/ratiflowv4";
    details.submissionUrl = "https://ratiflow-docs.devpost.com/";
  }
  if (section === "judges" && row) details.judge = {
    criterion: row.criterion,
    phase: row.phase,
    score: row.score,
    evaluatorId: row.evaluatorId,
    citations: row.citations,
    strongestGap: row.strongestGap,
    mustFix: row.mustFix,
  };
  return details;
};

const surfaceFor = (evidenceClass: EvidenceClass) => evidenceClass === "AUTOMATED"
  ? { client: null, clientVersion: null, browser: null, browserVersion: null, model: null, modelVersion: null }
  : {
      client: "Codex desktop",
      clientVersion: "2026.09.02",
      browser: "Chromium",
      browserVersion: "140.0.0",
      model: evidenceClass === "NATIVE_CAPTURED" ? "gpt-5" : null,
      modelVersion: evidenceClass === "NATIVE_CAPTURED" ? "2026-09-02" : null,
    };

const writeEvidence = (
  root: string,
  section: string,
  gateId: string,
  evidenceClass: EvidenceClass,
  capturedAtUtc: string,
  row?: UnknownRecord,
) => {
  const details = detailsFor(section, gateId, evidenceClass, capturedAtUtc, row);
  const artifact = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    gateId,
    status: "PASS",
    evidenceClass,
    sourceCommitSha: SOURCE_SHA,
    deployedUrl: section === "domainEvidence" ? null : DEPLOYED_URL,
    deploymentId: section === "domainEvidence" ? null : DEPLOYMENT_ID,
    migrationIdentity: MIGRATION_ID,
    capturedAtUtc,
    durationMs: 100,
    fixtureVersions: ["D01", "B01", "R05"].includes(gateId) ? [...FIXTURE_VERSIONS] : [FIXTURE_VERSIONS[0]],
    surface: surfaceFor(evidenceClass),
    payloadSha256: sha256CanonicalJson(details),
    details,
  };
  const relativePath = `${rootFor(section)}/${gateId.toLowerCase()}-${sha256CanonicalJson(artifact).slice(0, 12)}.json`;
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const contents = `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(absolutePath, contents);
  return { path: relativePath, sha256: sha256Text(contents) };
};

const makeCompleteBundle = (): Bundle => {
  const root = mkdtempSync(join(tmpdir(), "ratiflow-v4-release-"));
  const manifest = clone(template);
  manifest.releaseStatus = "PASS";
  manifest.releaseIdentity = {
    sourceCommitSha: SOURCE_SHA,
    publicRepositoryHeadSha: SOURCE_SHA,
    deployedSourceCommitSha: SOURCE_SHA,
    manifestSourceCommitSha: SOURCE_SHA,
    videoSourceCommitSha: SOURCE_SHA,
    submissionSourceCommitSha: SOURCE_SHA,
    deployedUrl: DEPLOYED_URL,
    deploymentId: DEPLOYMENT_ID,
    migrationIdentity: MIGRATION_ID,
    repositoryUrl: "https://github.com/example/ratiflow",
    licenseSpdx: "MIT",
    licenseUrl: `https://github.com/example/ratiflow/blob/${SOURCE_SHA}/LICENSE`,
    videoUrl: "https://youtu.be/ratiflowv4",
    submissionUrl: "https://ratiflow-docs.devpost.com/",
    fixtureVersions: [...FIXTURE_VERSIONS],
    recordedAtUtc: RECORDED_AT,
    supportedNativeSurface: {
      client: "Codex desktop",
      clientVersion: "2026.09.02",
      browser: "Chromium",
      browserVersion: "140.0.0",
    },
  };

  for (const section of [
    "domainEvidence",
    "browserEvidence",
    "nativeEvidence",
    "agentEvidence",
    "visualEvidence",
    "releaseEvidence",
  ]) {
    for (const entry of array(manifest[section])) {
      const row = object(entry);
      const gateId = String(row.id);
      const evidenceClass = evidenceClassFor(section, gateId);
      const capturedAtUtc = evidenceClass === "NATIVE_CAPTURED" ? NATIVE_AT : CAPTURED_AT;
      Object.assign(row, {
        status: "PASS",
        evidenceClass,
        sourceCommitSha: SOURCE_SHA,
        deployedUrl: section === "domainEvidence" ? null : DEPLOYED_URL,
        deploymentId: section === "domainEvidence" ? null : DEPLOYMENT_ID,
        capturedAtUtc,
        artifactRefs: [writeEvidence(root, section, gateId, evidenceClass, capturedAtUtc)],
      });
    }
  }
  const ablation = object(manifest.ablation);
  Object.assign(ablation, {
    status: "PASS",
    evidenceClass: "NATIVE_CAPTURED",
    sourceCommitSha: SOURCE_SHA,
    deployedUrl: DEPLOYED_URL,
    deploymentId: DEPLOYMENT_ID,
    capturedAtUtc: NATIVE_AT,
    artifactRefs: [writeEvidence(root, "ablation", "ABLATION", "NATIVE_CAPTURED", NATIVE_AT)],
  });
  const nativeCitation = String(artifactRef(object(array(manifest.nativeEvidence)[0])).path);
  const scores = [5, 4.5, 4.5, 5];
  for (const [index, entry] of array(manifest.judges).entries()) {
    const row = object(entry);
    const gateId = String(row.id);
    Object.assign(row, {
      status: "PASS",
      evidenceClass: "MANUAL_CAPTURED",
      sourceCommitSha: SOURCE_SHA,
      deployedUrl: DEPLOYED_URL,
      deploymentId: DEPLOYMENT_ID,
      capturedAtUtc: JUDGE_AT,
      score: scores[index],
      evaluatorId: `independent-final-judge-${index + 1}`,
      citations: [nativeCitation],
      strongestGap: "The remaining gap is bounded and does not block the frozen criterion.",
      mustFix: null,
    });
    row.artifactRefs = [writeEvidence(root, "judges", gateId, "MANUAL_CAPTURED", JUDGE_AT, row)];
  }
  return {
    root,
    manifest,
    options: {
      assetRoot: root,
      manifestPath: join(root, "evals/release/repo-document-v4/final-manifest.json"),
      gitState: cleanGitState(),
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

const rewriteArtifact = (bundle: Bundle, ref: UnknownRecord, mutate: (artifact: UnknownRecord) => void) => {
  const absolutePath = join(bundle.root, String(ref.path));
  const artifact = object(JSON.parse(readFileSync(absolutePath, "utf8")));
  mutate(artifact);
  artifact.payloadSha256 = sha256CanonicalJson(artifact.details);
  const contents = `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(absolutePath, contents);
  ref.sha256 = sha256Text(contents);
};

const bundles: Bundle[] = [];
afterEach(() => bundles.splice(0).forEach((bundle) => bundle.cleanup()));
const bundle = () => {
  const value = makeCompleteBundle();
  bundles.push(value);
  return value;
};

describe("repo-document-v4 release manifest", () => {
  it("keeps the checked-in exact-row template structurally valid and truthfully PENDING", () => {
    const result = validateReleaseManifest(clone(template));
    expect(result).toMatchObject({ schemaValid: true, releaseReady: false, status: "PENDING", issues: [] });
    expect(array(template.domainEvidence).map((row) => object(row).id)).toEqual(DOMAIN_ROW_IDS);
    expect(array(template.browserEvidence).map((row) => object(row).id)).toEqual(BROWSER_ROW_IDS);
    expect(array(template.nativeEvidence).map((row) => object(row).id)).toEqual(NATIVE_ROW_IDS);
    expect(array(template.agentEvidence).map((row) => object(row).id)).toEqual(AGENT_ROW_IDS);
    expect(array(template.visualEvidence).map((row) => object(row).id)).toEqual(VISUAL_ROW_IDS);
    expect(array(template.releaseEvidence).map((row) => object(row).id)).toEqual(RELEASE_ROW_IDS);
    expect(array(template.judges).map((row) => object(row).id)).toEqual(JUDGE_ROW_IDS);
    expect(isAllPendingTemplate(template)).toBe(true);
  });

  it("accepts a complete content-addressed bundle bound to one clean release identity", () => {
    const value = bundle();
    expect(validateReleaseManifest(value.manifest, value.options)).toMatchObject({
      ok: true,
      schemaValid: true,
      releaseReady: true,
      status: "PASS",
      issues: [],
      blockers: [],
    });
  });

  it("fails closed on missing files, wrong file hashes, and wrong source SHA", () => {
    const missing = bundle();
    const missingRef = artifactRef(object(array(missing.manifest.domainEvidence)[0]));
    unlinkSync(join(missing.root, String(missingRef.path)));
    expect(validateReleaseManifest(missing.manifest, missing.options).issues.some((issue) => issue.message.includes("missing or unreadable"))).toBe(true);

    const digest = bundle();
    artifactRef(object(array(digest.manifest.browserEvidence)[0])).sha256 = "f".repeat(64);
    expect(validateReleaseManifest(digest.manifest, digest.options).issues.some((issue) => issue.message.includes("file bytes"))).toBe(true);

    const sha = bundle();
    object(sha.manifest.releaseIdentity).deployedSourceCommitSha = "c".repeat(40);
    expect(validateReleaseManifest(sha.manifest, sha.options).releaseReady).toBe(false);
  });

  it("prevents adapter evidence from satisfying native, agent, ablation, or R03 gates", () => {
    for (const [section, index] of [["nativeEvidence", 3], ["agentEvidence", 0], ["releaseEvidence", 2]] as const) {
      const value = bundle();
      const row = object(array(value.manifest[section])[index]);
      row.evidenceClass = "ADAPTER_CAPTURED";
      rewriteArtifact(value, artifactRef(row), (artifact) => {
        artifact.evidenceClass = "ADAPTER_CAPTURED";
        object(artifact.surface).model = null;
        object(artifact.surface).modelVersion = null;
        const details = object(artifact.details);
        delete details.nativeEligibility;
        details.runner = { command: "adapter-capture", exitCode: 0, completedAtUtc: row.capturedAtUtc, outputSha256: "b".repeat(64) };
      });
      const messages = validateReleaseManifest(value.manifest, value.options).issues.map((issue) => issue.message).join("\n");
      expect(messages).toContain("ADAPTER_CAPTURED");
      expect(messages).toContain("cannot satisfy this gate");
    }

    const value = bundle();
    const row = object(value.manifest.ablation);
    row.evidenceClass = "ADAPTER_CAPTURED";
    rewriteArtifact(value, artifactRef(row), (artifact) => { artifact.evidenceClass = "ADAPTER_CAPTURED"; });
    expect(validateReleaseManifest(value.manifest, value.options).issues.some((issue) => issue.message.includes("cannot satisfy this gate"))).toBe(true);
  });

  it("rejects PASS rows without exact evidence and PENDING rows that claim captured proof", () => {
    const pass = bundle();
    object(array(pass.manifest.domainEvidence)[0]).artifactRefs = [];
    expect(validateReleaseManifest(pass.manifest, pass.options).issues.some((issue) => issue.message.includes("exactly one content-addressed"))).toBe(true);

    const pending = clone(template);
    const row = object(array(pending.nativeEvidence)[0]);
    row.evidenceClass = "NATIVE_CAPTURED";
    row.sourceCommitSha = SOURCE_SHA;
    expect(validateReleaseManifest(pending).issues.some((issue) => issue.path === "$.nativeEvidence[0]")).toBe(true);
  });

  it("enforces native capture eligibility and exact six-tool discovery", () => {
    const eligibility = bundle();
    const eligibilityRow = object(array(eligibility.manifest.nativeEvidence)[3]);
    rewriteArtifact(eligibility, artifactRef(eligibilityRow), (artifact) => {
      object(object(artifact.details).nativeEligibility).injectedModelContext = true;
    });
    expect(validateReleaseManifest(eligibility.manifest, eligibility.options).issues.some((issue) => issue.message.includes("ineligible native proof"))).toBe(true);

    const catalog = bundle();
    const catalogRow = object(array(catalog.manifest.nativeEvidence)[0]);
    rewriteArtifact(catalog, artifactRef(catalogRow), (artifact) => {
      object(artifact.details).toolNames = [...V4_TOOL_NAMES, "reset_repository"];
    });
    expect(validateReleaseManifest(catalog.manifest, catalog.options).issues.some((issue) => issue.message.includes("six ordered v4 tool names"))).toBe(true);
  });

  it("enforces final judge thresholds, unique evaluators, citations, and no must-fix", () => {
    const value = bundle();
    const first = object(array(value.manifest.judges)[0]);
    const second = object(array(value.manifest.judges)[1]);
    first.score = 4.9;
    first.mustFix = "Native proof is still missing.";
    second.evaluatorId = first.evaluatorId;
    second.citations = [String(artifactRef(second).path)];
    const messages = validateReleaseManifest(value.manifest, value.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("5/5 release threshold");
    expect(messages).toContain("no must-fix");
    expect(messages).toContain("unique independent final judge");
    expect(messages).toContain("cannot self-cite");
  });

  it("rejects dirty-tree PASS claims and forbidden secret-bearing evidence", () => {
    const dirty = bundle();
    dirty.options = { ...dirty.options, gitState: { ...cleanGitState(), worktreeClean: false } };
    expect(validateReleaseManifest(dirty.manifest, dirty.options).issues.some((issue) => issue.message.includes("dirty-tree"))).toBe(true);

    expect(findSensitiveData({ value: "#ratiflow-bootstrap=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" })).not.toEqual([]);
    expect(findSensitiveData({ value: "/issue/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" })).not.toEqual([]);
  });

  it("runs the pending CLI without Git inspection and returns the non-ready exit code", () => {
    const stdout: string[] = [];
    let inspected = false;
    const exitCode = runReleaseManifestCli([DEFAULT_MANIFEST], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
      inspectGit: () => { inspected = true; throw new Error("must not run"); },
    }, {
      stdout: (value) => stdout.push(value),
      stderr: () => undefined,
    });
    expect(exitCode).toBe(1);
    expect(inspected).toBe(false);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ status: "PENDING", schemaValid: true, releaseReady: false });
  });
});
