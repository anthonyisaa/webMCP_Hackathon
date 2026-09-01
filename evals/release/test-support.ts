import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVIDENCE_SCHEMA_VERSION,
  RELEASE_CONTRACT_VERSION,
  RELEASE_CHECK_COMMANDS,
  sha256CanonicalJson,
  sha256Text,
  type AgentLedgerValidationInput,
  type GitState,
  type ManifestValidationOptions,
} from "./manifest";

type JsonRecord = Record<string, unknown>;
type EvidenceClass = "AUTOMATED" | "ADAPTER_CAPTURED" | "NATIVE_CAPTURED" | "MANUAL_CAPTURED";
type ArtifactKind = "domain" | "browser" | "release-check" | "native" | "rehearsal" | "trajectory" | "ablation" | "visual" | "judge" | "public";

export const SOURCE_SHA = "0123456789abcdef0123456789abcdef01234567";
export const DEPLOYED_URL = "https://ratiflow.example.test";
export const DEPLOYMENT_ID = "dpl_document_v3_release";
export const MIGRATION_ID = "20260901012216_document_workspace_v3";
export const EARLY_AT = "2026-09-01T08:00:00.000Z";
export const NATIVE_AT = "2026-09-01T09:00:00.000Z";
export const R01_AT = "2026-09-01T09:10:00.000Z";
export const JUDGE_AT = "2026-09-01T10:00:00.000Z";
export const PUBLIC_AT = "2026-09-01T11:00:00.000Z";
export const FINAL_AT = "2026-09-01T12:00:00.000Z";

const TEMPLATE_PATH = fileURLToPath(new URL("./document-v3/manifest.json", import.meta.url));
const ROOTS: Record<ArtifactKind, string> = {
  domain: "evals/protocol/document-v3",
  browser: "evals/browser/document-v3",
  "release-check": "evals/release/document-v3/checks",
  native: "evals/native/document-v3",
  rehearsal: "evals/release/document-v3/rehearsal",
  trajectory: "evals/agent/document-v3",
  ablation: "evals/ablation/document-v3",
  visual: "evals/release/document-v3/visual",
  judge: "evals/judges/document-v3",
  public: "evals/release/document-v3/public",
};

export type PassBundle = {
  root: string;
  manifest: JsonRecord;
  manifestPath: string;
  options: ManifestValidationOptions;
  agentCalls: AgentLedgerValidationInput[];
  cleanup: () => void;
};

export const object = (value: unknown) => value as JsonRecord;
export const array = (value: unknown) => value as unknown[];
export const clone = <T>(value: T): T => structuredClone(value);

const surface = (mode: "native" | "browser" | "none") => mode === "native"
  ? {
      client: "Codex supported client",
      clientVersion: "2026.09.1",
      browser: "Chromium",
      browserVersion: "140.0.0",
      model: "gpt-5.6-sol",
      modelVersion: "2026-09-01",
    }
  : mode === "browser" ? {
      client: "Playwright",
      clientVersion: "1.55.0",
      browser: "Chromium",
      browserVersion: "140.0.0",
      model: null,
      modelVersion: null,
    }
  : { client: null, clientVersion: null, browser: null, browserVersion: null, model: null, modelVersion: null };

const writeJson = (root: string, relativePath: string, value: unknown) => {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(absolutePath, contents, "utf8");
  return { path: relativePath, sha256: sha256Text(contents) };
};

const writeArtifact = (
  root: string,
  kind: ArtifactKind,
  gateId: string,
  evidenceClass: EvidenceClass,
  capturedAtUtc: string,
  details: unknown,
) => {
  const relativePath = `${ROOTS[kind]}/${gateId.toLowerCase()}-evidence.json`;
  const artifact = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    fixtureVersion: RELEASE_CONTRACT_VERSION,
    gateId,
    status: "PASS",
    evidenceClass,
    sourceCommitSha: SOURCE_SHA,
    deployedUrl: DEPLOYED_URL,
    deploymentId: DEPLOYMENT_ID,
    migrationIdentity: MIGRATION_ID,
    capturedAtUtc,
    durationMs: 100,
    surface: surface(["native", "rehearsal", "trajectory", "ablation"].includes(kind) || gateId === "SPELLING_MENU"
      ? "native" : kind === "browser" ? "browser" : "none"),
    payloadSha256: sha256CanonicalJson(details),
    details,
  };
  return writeJson(root, relativePath, artifact);
};

const passRow = (
  root: string,
  rowValue: unknown,
  kind: ArtifactKind,
  evidenceClass: EvidenceClass,
  details: unknown,
  capturedAtUtc = EARLY_AT,
) => {
  const row = object(rowValue);
  const id = kind === "public" ? "PUBLIC_PACKAGE" : String(row.id);
  row.status = "PASS";
  row.evidenceClass = evidenceClass;
  row.sourceCommitSha = SOURCE_SHA;
  row.deployedUrl = DEPLOYED_URL;
  row.capturedAtUtc = capturedAtUtc;
  row.artifactRefs = [writeArtifact(root, kind, id, evidenceClass, capturedAtUtc, details)];
  return String(object(array(row.artifactRefs)[0]).path);
};

const writeAgentArtifact = (root: string, gateValue: unknown, kind: "trajectory" | "ablation") => {
  const gate = object(gateValue);
  const gateId = kind === "trajectory" ? "TRAJECTORY" : "ABLATION";
  const count = kind === "trajectory" ? 35 : 70;
  const directory = `${ROOTS[kind]}/${kind}-release`;
  mkdirSync(join(root, directory, "transcripts"), { recursive: true });
  const runs: unknown[] = [];
  const transcriptDigests: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const transcriptPath = `transcripts/${kind}-${String(index + 1).padStart(3, "0")}.json`;
    const transcriptContents = `${JSON.stringify({ redacted: true, index })}\n`;
    writeFileSync(join(root, directory, transcriptPath), transcriptContents, "utf8");
    transcriptDigests.push({ path: transcriptPath, sha256: sha256Text(transcriptContents) });
    runs.push({
      transcriptPath,
      commitSha: SOURCE_SHA,
      deployedUrl: DEPLOYED_URL,
      deploymentId: DEPLOYMENT_ID,
      databaseMigrationIdentity: MIGRATION_ID,
      browserSurface: "Codex supported client 2026.09.1 / Chromium 140.0.0",
      startedAtUtc: new Date(Date.parse(EARLY_AT) + index * 1_000).toISOString(),
      durationMs: 100,
    });
  }
  const details = { runs, transcriptDigests };
  const artifact = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    fixtureVersion: RELEASE_CONTRACT_VERSION,
    gateId,
    status: "PASS",
    evidenceClass: "NATIVE_CAPTURED",
    sourceCommitSha: SOURCE_SHA,
    deployedUrl: DEPLOYED_URL,
    deploymentId: DEPLOYMENT_ID,
    migrationIdentity: MIGRATION_ID,
    capturedAtUtc: NATIVE_AT,
    durationMs: 100,
    surface: surface("native"),
    payloadSha256: sha256CanonicalJson(details),
    details,
  };
  const ref = writeJson(root, `${directory}/${gateId.toLowerCase()}-evidence.json`, artifact);
  gate.status = "PASS";
  gate.evidenceClass = "NATIVE_CAPTURED";
  gate.sourceCommitSha = SOURCE_SHA;
  gate.deployedUrl = DEPLOYED_URL;
  gate.capturedAtUtc = NATIVE_AT;
  gate.artifactRefs = [ref];
};

export const cleanGitState = (overrides: Partial<GitState> = {}): GitState => ({
  headSha: SOURCE_SHA,
  indexClean: true,
  worktreeClean: true,
  untrackedClean: true,
  requiredSourceFilesAtHead: true,
  pendingTemplateAtHead: true,
  ...overrides,
});

export const createPassBundle = (): PassBundle => {
  const root = mkdtempSync(join(tmpdir(), "ratiflow-release-"));
  const manifest = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8")) as JsonRecord;
  manifest.releaseStatus = "PASS";
  const identity = object(manifest.releaseIdentity);
  identity.sourceCommitSha = SOURCE_SHA;
  identity.deployedUrl = DEPLOYED_URL;
  identity.deploymentId = DEPLOYMENT_ID;
  identity.migrationIdentity = MIGRATION_ID;
  identity.recordedAtUtc = FINAL_AT;
  Object.assign(object(identity.supportedSurface), {
    client: "Codex supported client",
    clientVersion: "2026.09.1",
    browser: "Chromium",
    browserVersion: "140.0.0",
  });

  for (const row of array(manifest.domainEvidence)) passRow(root, row, "domain", "AUTOMATED", {
    assertionId: object(row).id,
    passed: true,
    runner: "vitest:document-v3-protocol",
    exitCode: 0,
    observationSha256: sha256Text(`domain-output:${String(object(row).id)}`),
  });
  for (const row of array(manifest.browserEvidence)) passRow(root, row, "browser", "ADAPTER_CAPTURED", {
    assertionId: object(row).id,
    passed: true,
    runner: "playwright:document-v3-browser",
    exitCode: 0,
    observationSha256: sha256Text(`browser-output:${String(object(row).id)}`),
  });

  for (const row of array(manifest.releaseChecks)) {
    const id = String(object(row).id);
    const evidenceClass = id === "SPELLING_MENU" ? "MANUAL_CAPTURED" : "AUTOMATED";
    const details = id === "DEPLOYMENT_IDENTITY"
      ? {
          checkId: id,
          command: RELEASE_CHECK_COMMANDS.DEPLOYMENT_IDENTITY,
          exitCode: 0,
          observationSha256: sha256Text("deployment-provider-metadata"),
          observedAtUtc: EARLY_AT,
          sourceCommitSha: SOURCE_SHA,
          deploymentId: DEPLOYMENT_ID,
          canonicalUrl: DEPLOYED_URL,
          previewMigrationIdentity: MIGRATION_ID,
          productionMigrationIdentity: MIGRATION_ID,
          sourceVerified: true,
          reachable: true,
        }
      : {
          checkId: id,
          passed: true,
          command: RELEASE_CHECK_COMMANDS[id as keyof typeof RELEASE_CHECK_COMMANDS],
          exitCode: 0,
          observationSha256: sha256Text(`release-check-output:${id}`),
          environment: id.startsWith("PREVIEW_") ? "PREVIEW" : id === "SPELLING_MENU" ? "SUPPORTED_CLIENT" : "SOURCE",
          ...(id === "PREVIEW_SECURITY_ADVISOR" || id === "PREVIEW_PERFORMANCE_ADVISOR" ? {
            advisor: id === "PREVIEW_SECURITY_ADVISOR" ? "SECURITY" : "PERFORMANCE",
            blockingFindingCount: 0,
          } : {}),
          ...(id === "SPELLING_MENU" ? {
            menuSurface: "REAL_PLATFORM_SPELLING_MENU",
            syntheticEventUsed: false,
          } : {}),
        };
    passRow(root, row, "release-check", evidenceClass, details);
  }

  let nativeCitation = "";
  for (const row of array(manifest.nativeEvidence)) {
    const path = passRow(root, row, "native", "NATIVE_CAPTURED", { assertionId: object(row).id, passed: true }, NATIVE_AT);
    nativeCitation ||= path;
  }
  writeAgentArtifact(root, manifest.trajectoryLedger, "trajectory");
  writeAgentArtifact(root, manifest.ablation, "ablation");
  for (const row of array(manifest.visualEvidence)) passRow(root, row, "visual", "MANUAL_CAPTURED", { assertionId: object(row).id, passed: true }, NATIVE_AT);

  const rehearsals = Array.from({ length: 5 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, "0");
    const runId = `rehearsal-${index + 1}`;
    const resetId = `verified-reset-${index + 1}`;
    const resetAtUtc = `2026-09-01T09:0${index}:00.000Z`;
    const startedAtUtc = `2026-09-01T09:0${index}:05.000Z`;
    const completedAtUtc = `2026-09-01T09:0${index}:30.000Z`;
    const snapshot = { runId, revision: 2, activityVersion: 4, workStatus: "COMPLETED", contentVerified: true };
    const finalSnapshotSha256 = sha256CanonicalJson(snapshot);
    const resetEvidenceRef = writeArtifact(root, "rehearsal", `R01_RESET_${ordinal}`, "AUTOMATED", resetAtUtc, {
      resetId,
      resetVerified: true,
      resetMethod: "SERVICE_ROLE_CLI",
    });
    const nativeRehearsalRef = writeArtifact(root, "rehearsal", `R01_RUN_${ordinal}`, "NATIVE_CAPTURED", completedAtUtc, {
      runId,
      resetId,
      canonicalNative: true,
      manualRepairCount: 0,
      finalSnapshotSha256,
    });
    const finalStateRef = writeArtifact(root, "rehearsal", `R01_FINAL_${ordinal}`, "NATIVE_CAPTURED", completedAtUtc, {
      runId,
      authoritativeStateVerified: true,
      finalSnapshotSha256,
      snapshot,
    });
    return {
      runId,
      resetId,
      resetAtUtc,
      startedAtUtc,
      completedAtUtc,
      canonicalNative: true,
      resetVerified: true,
      manualRepairCount: 0,
      finalSnapshotSha256,
      nativeRehearsalRef,
      resetEvidenceRef,
      finalStateRef,
    };
  });
  const rehearsalDetails: Record<string, unknown> = {
    R01: { rehearsals },
    R02: { firstNativeActionMs: 44_000, narratedDurationMs: 159_000, passed: true },
    R03: { claims: [{ claim: "Native document collaboration is captured.", evidencePaths: [nativeCitation], limitation: false }] },
    R04: { assertionId: "R04", passed: true },
  };
  for (const row of array(manifest.rehearsalEvidence)) {
    const id = String(object(row).id);
    passRow(root, row, "rehearsal", id === "R01" ? "NATIVE_CAPTURED" : "MANUAL_CAPTURED", rehearsalDetails[id], R01_AT);
  }

  const scores = [5, 4.5, 4.5, 5];
  for (const [index, judgeValue] of array(manifest.judges).entries()) {
    const judge = object(judgeValue);
    judge.score = scores[index];
    judge.evaluatorId = `independent-evaluator-${index + 1}`;
    judge.citations = [nativeCitation];
    judge.strongestGap = `Non-blocking gap ${index + 1}`;
    judge.mustFix = null;
    passRow(root, judge, "judge", "MANUAL_CAPTURED", {
      evaluatorId: judge.evaluatorId,
      criterion: judge.criterion,
      score: judge.score,
      citations: judge.citations,
      strongestGap: judge.strongestGap,
      mustFix: null,
    }, JUDGE_AT);
  }

  const publicPackage = object(manifest.publicPackage);
  publicPackage.repositoryUrl = `https://github.com/example/ratiflow/tree/${SOURCE_SHA}`;
  publicPackage.licenseSpdx = "MIT";
  publicPackage.licenseUrl = `https://github.com/example/ratiflow/blob/${SOURCE_SHA}/LICENSE`;
  publicPackage.videoUrl = "https://www.youtube.com/watch?v=ratiflow-release";
  publicPackage.devpostUrl = "https://devpost.com/software/ratiflow";
  const fields = ["repositoryUrl", "licenseUrl", "videoUrl", "devpostUrl"] as const;
  passRow(root, publicPackage, "public", "MANUAL_CAPTURED", {
    repositoryHeadSha: SOURCE_SHA,
    migrationIdentity: MIGRATION_ID,
    canonicalUrl: DEPLOYED_URL,
    observations: fields.map((field) => ({
      field,
      url: publicPackage[field],
      observedAtUtc: PUBLIC_AT,
      reachable: true,
      contentVerified: true,
      mentionsSourceCommitSha: true,
      contentSha256: sha256Text(`public-content:${field}`),
    })),
  }, PUBLIC_AT);

  const manifestPath = join(root, "evals/release/document-v3/manifest.json");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const agentCalls: AgentLedgerValidationInput[] = [];
  return {
    root,
    manifest,
    manifestPath,
    agentCalls,
    options: {
      assetRoot: root,
      manifestPath,
      gitState: cleanGitState(),
      validateAgentLedger: (input) => {
        agentCalls.push(input);
        return { ok: input.runs.length === (input.kind === "trajectory" ? 35 : 70), issues: [] };
      },
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

export const rewriteArtifact = (
  bundle: PassBundle,
  refValue: unknown,
  mutate: (artifact: JsonRecord) => void,
  recomputePayload = true,
) => {
  const ref = object(refValue);
  const path = String(ref.path);
  const absolutePath = join(bundle.root, path);
  const artifact = JSON.parse(readFileSync(absolutePath, "utf8")) as JsonRecord;
  mutate(artifact);
  if (recomputePayload) artifact.payloadSha256 = sha256CanonicalJson(artifact.details);
  const contents = `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(absolutePath, contents, "utf8");
  ref.sha256 = sha256Text(contents);
};
