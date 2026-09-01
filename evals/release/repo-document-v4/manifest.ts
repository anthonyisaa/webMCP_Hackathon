import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export const RELEASE_CONTRACT_VERSION = "repo-document-v4" as const;
export const EVIDENCE_SCHEMA_VERSION = "ratiflow-repo-document-v4-evidence-v1" as const;
export const FIXTURE_VERSIONS = [
  "repo-document-v4.postmortem.v1",
  "repo-document-v4.product-document.v1",
] as const;

const numberedIds = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);

export const DOMAIN_ROW_IDS = numberedIds("D", 25);
export const BROWSER_ROW_IDS = numberedIds("B", 16);
export const NATIVE_ROW_IDS = numberedIds("N", 10);
export const AGENT_ROW_IDS = numberedIds("A", 6);
export const VISUAL_ROW_IDS = numberedIds("V", 4);
export const RELEASE_ROW_IDS = numberedIds("R", 5);
export const JUDGE_ROW_IDS = numberedIds("J", 4);
export const V4_TOOL_NAMES = [
  "inspect_document",
  "read_document_history",
  "list_my_tasks",
  "wait_for_my_tasks",
  "comment_on_task",
  "submit_task_result",
] as const;

export const EVIDENCE_CLASSES = [
  "AUTOMATED",
  "ADAPTER_CAPTURED",
  "NATIVE_CAPTURED",
  "MANUAL_CAPTURED",
  "PENDING",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];
export type ManifestIssue = { path: string; message: string };
export type GitState = {
  headSha: string;
  indexClean: boolean;
  worktreeClean: boolean;
  untrackedClean: boolean;
  requiredSourceFilesAtHead: boolean;
  pendingTemplateAtHead: boolean;
};
export type ManifestValidationOptions = {
  assetRoot?: string;
  manifestPath?: string;
  gitState?: GitState;
};
export type ReleaseManifestValidation = {
  ok: boolean;
  schemaValid: boolean;
  releaseReady: boolean;
  status: "PASS" | "PENDING" | "INVALID";
  issues: ManifestIssue[];
  blockers: ManifestIssue[];
  referencedArtifacts: string[];
};

type UnknownRecord = Record<string, unknown>;
type EvidenceKind = "domain" | "browser" | "native" | "agent" | "ablation" | "visual" | "release" | "judge";
type ReleaseIdentity = {
  sourceCommitSha: unknown;
  publicRepositoryHeadSha: unknown;
  deployedSourceCommitSha: unknown;
  manifestSourceCommitSha: unknown;
  videoSourceCommitSha: unknown;
  submissionSourceCommitSha: unknown;
  deployedUrl: unknown;
  deploymentId: unknown;
  migrationIdentity: unknown;
  repositoryUrl: unknown;
  licenseSpdx: unknown;
  licenseUrl: unknown;
  videoUrl: unknown;
  submissionUrl: unknown;
  fixtureVersions: unknown;
  recordedAtUtc: unknown;
  supportedNativeSurface?: UnknownRecord;
};
type ValidationContext = {
  options: ManifestValidationOptions;
  identity: ReleaseIdentity;
  issues: ManifestIssue[];
  blockers: ManifestIssue[];
  claimedPaths: Set<string>;
  eligiblePaths: Set<string>;
  captureTimes: number[];
  nativeCaptureTimes: number[];
};

const TOP_LEVEL_KEYS = [
  "contractVersion",
  "releaseStatus",
  "releaseIdentity",
  "domainEvidence",
  "browserEvidence",
  "nativeEvidence",
  "agentEvidence",
  "ablation",
  "visualEvidence",
  "releaseEvidence",
  "judges",
] as const;
const IDENTITY_KEYS = [
  "sourceCommitSha",
  "publicRepositoryHeadSha",
  "deployedSourceCommitSha",
  "manifestSourceCommitSha",
  "videoSourceCommitSha",
  "submissionSourceCommitSha",
  "deployedUrl",
  "deploymentId",
  "migrationIdentity",
  "repositoryUrl",
  "licenseSpdx",
  "licenseUrl",
  "videoUrl",
  "submissionUrl",
  "fixtureVersions",
  "recordedAtUtc",
  "supportedNativeSurface",
] as const;
const SURFACE_KEYS = ["client", "clientVersion", "browser", "browserVersion"] as const;
const ARTIFACT_SURFACE_KEYS = [...SURFACE_KEYS, "model", "modelVersion"] as const;
const ROW_KEYS = [
  "id",
  "status",
  "evidenceClass",
  "sourceCommitSha",
  "deployedUrl",
  "deploymentId",
  "capturedAtUtc",
  "artifactRefs",
] as const;
const GATE_KEYS = ROW_KEYS.filter((key) => key !== "id");
const JUDGE_KEYS = [
  ...ROW_KEYS,
  "criterion",
  "phase",
  "score",
  "evaluatorId",
  "citations",
  "strongestGap",
  "mustFix",
] as const;
const ARTIFACT_REF_KEYS = ["path", "sha256"] as const;
const ARTIFACT_KEYS = [
  "schemaVersion",
  "gateId",
  "status",
  "evidenceClass",
  "sourceCommitSha",
  "deployedUrl",
  "deploymentId",
  "migrationIdentity",
  "capturedAtUtc",
  "durationMs",
  "fixtureVersions",
  "surface",
  "payloadSha256",
  "details",
] as const;

const ARTIFACT_ROOTS: Record<EvidenceKind, string> = {
  domain: "evals/protocol/repo-document-v4",
  browser: "evals/browser/repo-document-v4",
  native: "evals/native/repo-document-v4",
  agent: "evals/agent/repo-document-v4",
  ablation: "evals/ablation/repo-document-v4",
  visual: "evals/release/repo-document-v4/visual",
  release: "evals/release/repo-document-v4/rehearsal",
  judge: "evals/judges/repo-document-v4/final",
};

const JUDGE_CRITERIA = {
  J01: "WebMCP Leverage",
  J02: "Execution",
  J03: "Potential Impact",
  J04: "Creativity & Ambition",
} as const;
const JUDGE_THRESHOLDS = { J01: 5, J02: 4.5, J03: 4.5, J04: 4.5 } as const;
const RELEASE_PASS_CLASSES = {
  R01: "NATIVE_CAPTURED",
  R02: "AUTOMATED",
  R03: "NATIVE_CAPTURED",
  R04: "MANUAL_CAPTURED",
  R05: "MANUAL_CAPTURED",
} as const;
const OPEN_SOURCE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MPL-2.0",
  "GPL-3.0-only",
  "AGPL-3.0-only",
  "ISC",
  "Unlicense",
]);

const SENSITIVE_KEY = /(?:api[-_]?key|authorization|bootstrap|cookie|credential|fragment|password|secret|session[-_]?id|share[-_]?token|set[-_]?cookie|membership[-_]?handle)/i;
const SENSITIVE_VALUES = [
  /\b(?:sk|pk)_(?:live|test)_[a-z0-9]{16,}/i,
  /\bsb_(?:publishable|secret)_[a-z0-9_-]{16,}/i,
  /\beyJ[a-zA-Z0-9_-]{20,}(?:\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})?/,
  /\b(?:bearer|cookie)\s+[a-z0-9._~+/-]{12,}/i,
  /\bmbr_[a-z0-9_-]{12,}/i,
  /ratiflow-bootstrap=/i,
  /\/(?:document|documents|issue|share)\/[A-Za-z0-9_-]{20,}(?:[#/?]|$)/,
  /#[A-Za-z0-9_-]{24,}/,
  /[?&](?:sig|signature|signed|token|key|auth|session|credential|share|bootstrap|fragment)=[^\s&#]+/i,
] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const childPath = (path: string, key: string) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
const exactRecord = (value: unknown, path: string, keys: readonly string[], issues: ManifestIssue[]) => {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return undefined;
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) issues.push({ path: childPath(path, key), message: "required field is missing" });
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) issues.push({ path: childPath(path, key), message: "unexpected field" });
  }
  return value;
};
const isNonEmptyString = (value: unknown, maxLength = 1_000): value is string =>
  typeof value === "string"
  && value === value.trim()
  && value.length > 0
  && value.length <= maxLength
  && !/[\u0000-\u001f\u007f]/.test(value);
const isSha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const isSha256 = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isUtcTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?Z$/.exec(value);
  if (!match) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === `${match[1]}${match[2] ?? ".000"}Z`;
};
const isHttpsUrl = (value: unknown, allowQuery = false): value is string => {
  if (typeof value !== "string" || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      && !url.hash
      && (allowQuery || !url.search);
  } catch {
    return false;
  }
};
const isCanonicalDeploymentUrl = (value: unknown): value is string =>
  isHttpsUrl(value) && new URL(value).pathname === "/";

const canonicalize = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonicalize)
  : isRecord(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
    : value;
export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));
export const sha256Text = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const sha256CanonicalJson = (value: unknown) => sha256Text(canonicalJson(value));

export function findJsonSafetyIssues(value: unknown, path = "$", ancestors = new WeakSet<object>()): ManifestIssue[] {
  if (value === null || typeof value === "string" || typeof value === "boolean") return [];
  if (typeof value === "number") return Number.isFinite(value) ? [] : [{ path, message: "must be a finite JSON number" }];
  if (typeof value !== "object") return [{ path, message: `must be JSON-safe; received ${typeof value}` }];
  if (ancestors.has(value)) return [{ path, message: "must not contain a circular reference" }];
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return [{ path, message: "must be a plain JSON object" }];
  }
  ancestors.add(value);
  const issues: ManifestIssue[] = [];
  if (Array.isArray(value)) {
    value.forEach((child, index) => issues.push(...findJsonSafetyIssues(child, `${path}[${index}]`, ancestors)));
  } else {
    Object.entries(value).forEach(([key, child]) =>
      issues.push(...findJsonSafetyIssues(child, childPath(path, key), ancestors)));
  }
  ancestors.delete(value);
  return issues;
}

export function findSensitiveData(value: unknown, path = "$", seen = new WeakSet<object>()): ManifestIssue[] {
  if (typeof value === "string") {
    return SENSITIVE_VALUES.some((pattern) => pattern.test(value))
      ? [{ path, message: "contains forbidden bearer, credential, bootstrap/share path, fragment, or signed reference" }]
      : [];
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  const issues: ManifestIssue[] = [];
  if (Array.isArray(value)) {
    value.forEach((child, index) => issues.push(...findSensitiveData(child, `${path}[${index}]`, seen)));
  } else {
    Object.entries(value).forEach(([key, child]) => {
      const nextPath = childPath(path, key);
      if (SENSITIVE_KEY.test(key)) issues.push({ path: nextPath, message: "sensitive field names are not permitted in release evidence" });
      issues.push(...findSensitiveData(child, nextPath, seen));
    });
  }
  return issues;
}

const fixtureVersionsAreExact = (value: unknown) =>
  Array.isArray(value)
  && value.length === FIXTURE_VERSIONS.length
  && FIXTURE_VERSIONS.every((fixture, index) => value[index] === fixture);
const fixtureVersionsAreEligible = (value: unknown) =>
  Array.isArray(value)
  && value.length > 0
  && new Set(value).size === value.length
  && value.every((fixture) => FIXTURE_VERSIONS.includes(fixture as (typeof FIXTURE_VERSIONS)[number]));
const validateNullableSha = (value: unknown, path: string, issues: ManifestIssue[]) => {
  if (value !== null && !isSha(value)) issues.push({ path, message: "must be null or an exact lowercase 40-character commit SHA" });
};
const validateNullableText = (value: unknown, path: string, issues: ManifestIssue[], max = 1_000) => {
  if (value !== null && !isNonEmptyString(value, max)) issues.push({ path, message: `must be null or trimmed non-empty text up to ${max} characters` });
};
const validateNullableTimestamp = (value: unknown, path: string, issues: ManifestIssue[]) => {
  if (value !== null && !isUtcTimestamp(value)) issues.push({ path, message: "must be null or an exact UTC timestamp ending in Z" });
};
const validateNullableUrl = (value: unknown, path: string, issues: ManifestIssue[], deployment = false, query = false) => {
  if (value !== null && !(deployment ? isCanonicalDeploymentUrl(value) : isHttpsUrl(value, query))) {
    issues.push({ path, message: deployment ? "must be null or a credential-free HTTPS origin" : "must be null or a credential-free HTTPS URL" });
  }
};

const isCanonicalArtifactPath = (value: unknown): value is string => {
  if (!isNonEmptyString(value) || isAbsolute(value) || value.includes("\\") || value.includes("?") || value.includes("#")) return false;
  if (!value.endsWith(".json") || !/^[A-Za-z0-9][A-Za-z0-9._+@/-]*$/.test(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  const lower = value.toLowerCase();
  return !lower.includes("document-v3")
    && !lower.includes("decision-demo")
    && !segments.some((segment) => /(?:^|[._-])(?:latest|legacy)(?:$|[._-])/i.test(segment));
};
const isWithin = (root: string, candidate: string) => candidate === root || candidate.startsWith(`${root}${sep}`);

const readArtifact = (
  value: unknown,
  path: string,
  kind: EvidenceKind,
  context: ValidationContext,
) => {
  const ref = exactRecord(value, path, ARTIFACT_REF_KEYS, context.issues);
  if (!ref) return undefined;
  if (!isCanonicalArtifactPath(ref.path)) {
    context.issues.push({ path: `${path}.path`, message: "must be a canonical repo-relative v4 JSON path without traversal, aliases, query, or fragment" });
    return undefined;
  }
  if (!isSha256(ref.sha256)) {
    context.issues.push({ path: `${path}.sha256`, message: "must be an exact lowercase SHA-256 digest" });
    return undefined;
  }
  const relativePath = ref.path;
  const expectedRoot = ARTIFACT_ROOTS[kind];
  if (!relativePath.startsWith(`${expectedRoot}/`)) {
    context.issues.push({ path: `${path}.path`, message: `must remain under ${expectedRoot}/` });
    return undefined;
  }
  if (context.claimedPaths.has(relativePath)) {
    context.issues.push({ path: `${path}.path`, message: "artifact paths must be unique across release gates" });
    return undefined;
  }
  context.claimedPaths.add(relativePath);

  const assetRoot = resolve(context.options.assetRoot ?? process.cwd());
  const lexicalRoot = resolve(assetRoot, expectedRoot);
  const absolutePath = resolve(assetRoot, relativePath);
  if (!isWithin(lexicalRoot, absolutePath)) {
    context.issues.push({ path: `${path}.path`, message: `must remain under ${expectedRoot}/` });
    return undefined;
  }
  if (context.options.manifestPath && resolve(context.options.manifestPath) === absolutePath) {
    context.issues.push({ path: `${path}.path`, message: "the release manifest cannot cite itself as evidence" });
    return undefined;
  }
  let contents: Buffer;
  try {
    const lexicalStat = lstatSync(absolutePath);
    if (!lexicalStat.isFile() || lexicalStat.isSymbolicLink()) {
      context.issues.push({ path: `${path}.path`, message: "must reference a regular file, never a symlink or directory" });
      return undefined;
    }
    const realAssetRoot = realpathSync(assetRoot);
    const realPath = realpathSync(absolutePath);
    const canonicalPath = resolve(realAssetRoot, relativePath);
    if (!isWithin(realAssetRoot, realPath) || realPath !== canonicalPath) {
      context.issues.push({ path: `${path}.path`, message: "must not escape or traverse a symlinked asset root" });
      return undefined;
    }
    const canonicalStat = statSync(realPath);
    if (!canonicalStat.isFile() || canonicalStat.size > 25_000_000) {
      context.issues.push({ path: `${path}.path`, message: "must be a regular evidence file no larger than 25 MB" });
      return undefined;
    }
    contents = readFileSync(realPath);
  } catch {
    context.issues.push({ path: `${path}.path`, message: "referenced evidence file is missing or unreadable" });
    return undefined;
  }
  if (sha256Text(contents) !== ref.sha256) {
    context.issues.push({ path: `${path}.sha256`, message: "does not match the referenced file bytes" });
    return undefined;
  }
  const raw = contents.toString("utf8");
  if (SENSITIVE_VALUES.some((pattern) => pattern.test(raw))) {
    context.issues.push({ path: `${path}.path`, message: "referenced artifact contains forbidden bearer material" });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    context.issues.push({ path: `${path}.path`, message: "referenced artifact must contain valid JSON" });
    return undefined;
  }
  context.issues.push(...findJsonSafetyIssues(parsed, `${path}.artifact`));
  context.issues.push(...findSensitiveData(parsed, `${path}.artifact`));
  return { relativePath, parsed };
};

const validateSurface = (
  value: unknown,
  path: string,
  evidenceClass: EvidenceClass,
  context: ValidationContext,
) => {
  const surface = exactRecord(value, path, ARTIFACT_SURFACE_KEYS, context.issues);
  if (!surface) return;
  ARTIFACT_SURFACE_KEYS.forEach((key) => validateNullableText(surface[key], `${path}.${key}`, context.issues, 200));
  if (evidenceClass === "AUTOMATED") return;
  for (const key of SURFACE_KEYS) {
    if (!isNonEmptyString(surface[key], 200)) context.issues.push({ path: `${path}.${key}`, message: "captured evidence requires an observed client/browser and exact version" });
  }
  if (evidenceClass === "NATIVE_CAPTURED") {
    for (const key of SURFACE_KEYS) {
      if (!context.identity.supportedNativeSurface || surface[key] !== context.identity.supportedNativeSurface[key]) {
        context.issues.push({ path: `${path}.${key}`, message: "native evidence must match the supported release client/browser and exact version" });
      }
    }
    for (const key of ["model", "modelVersion"] as const) {
      if (!isNonEmptyString(surface[key], 200)) context.issues.push({ path: `${path}.${key}`, message: "native evidence must record model and exact version" });
    }
  }
};

const validateRunner = (value: unknown, path: string, issues: ManifestIssue[]) => {
  const runner = exactRecord(value, path, ["command", "exitCode", "completedAtUtc", "outputSha256"], issues);
  if (!runner) return;
  if (!isNonEmptyString(runner.command, 1_000)) issues.push({ path: `${path}.command`, message: "must name the executed runner or operation" });
  if (runner.exitCode !== 0) issues.push({ path: `${path}.exitCode`, message: "must be zero" });
  if (!isUtcTimestamp(runner.completedAtUtc)) issues.push({ path: `${path}.completedAtUtc`, message: "must be an exact UTC timestamp" });
  if (!isSha256(runner.outputSha256)) issues.push({ path: `${path}.outputSha256`, message: "must bind sanitized runner output" });
};

const validateNativeEligibility = (value: unknown, path: string, issues: ManifestIssue[]) => {
  const capture = exactRecord(value, path, [
    "captureKind",
    "topLevelIssuePage",
    "injectedModelContext",
    "internalRouteUsed",
    "directApiOrRpcUsed",
    "domAutomationUsed",
  ], issues);
  if (!capture) return;
  if (capture.captureKind !== "SUPPORTED_CLIENT_NATIVE_WEBMCP") {
    issues.push({ path: `${path}.captureKind`, message: "must be supported-client native WebMCP evidence" });
  }
  if (capture.topLevelIssuePage !== true) issues.push({ path: `${path}.topLevelIssuePage`, message: "must be true" });
  for (const key of ["injectedModelContext", "internalRouteUsed", "directApiOrRpcUsed", "domAutomationUsed"] as const) {
    if (capture[key] !== false) issues.push({ path: `${path}.${key}`, message: "must be false; adapters, internal calls, and DOM automation are ineligible native proof" });
  }
};

const validateBaseDetails = (
  details: unknown,
  path: string,
  gateId: string,
  kind: EvidenceKind,
  evidenceClass: EvidenceClass,
  row: UnknownRecord,
  context: ValidationContext,
) => {
  if (!isRecord(details)) {
    context.issues.push({ path, message: "must be an object" });
    return;
  }
  if (details.passed !== true) context.issues.push({ path: `${path}.passed`, message: "must be true" });
  if (!isNonEmptyString(details.summary, 2_000)) context.issues.push({ path: `${path}.summary`, message: "must be a concise non-empty summary" });
  if (!Array.isArray(details.observations) || details.observations.length === 0) {
    context.issues.push({ path: `${path}.observations`, message: "must contain captured or runner-backed observations" });
  }
  if (evidenceClass === "AUTOMATED" || evidenceClass === "ADAPTER_CAPTURED") {
    validateRunner(details.runner, `${path}.runner`, context.issues);
  }
  if (evidenceClass === "NATIVE_CAPTURED") {
    validateNativeEligibility(details.nativeEligibility, `${path}.nativeEligibility`, context.issues);
  }

  if (gateId === "N01") {
    if (!Array.isArray(details.toolNames) || canonicalJson(details.toolNames) !== canonicalJson(V4_TOOL_NAMES)) {
      context.issues.push({ path: `${path}.toolNames`, message: "must contain exactly the six ordered v4 tool names" });
    }
  }
  if (kind === "agent") {
    const runCount = details.runCount;
    const successfulRunCount = details.successfulRunCount;
    if (runCount !== 5) context.issues.push({ path: `${path}.runCount`, message: "must be exactly five release-candidate runs" });
    const requiredSuccesses = gateId === "A04" || gateId === "A06" ? 5 : 4;
    if (!isNonNegativeInteger(successfulRunCount) || successfulRunCount < requiredSuccesses || successfulRunCount > 5) {
      context.issues.push({ path: `${path}.successfulRunCount`, message: `must be between ${requiredSuccesses} and 5` });
    }
    if (details.safetyViolationCount !== 0) {
      context.issues.push({ path: `${path}.safetyViolationCount`, message: "must be zero" });
    }
    if (details.allRunsSourceBound !== true || details.allTranscriptHashesVerified !== true) {
      context.issues.push({ path, message: "all five runs must be source-bound with verified sanitized transcript hashes" });
    }
  }
  if (kind === "ablation") {
    if (details.seedCount !== 5 || details.nativeCondition !== "NATIVE_WEBMCP" || details.controlCondition !== "WEBMCP_DISABLED") {
      context.issues.push({ path, message: "ablation must compare five matched native-WebMCP and WebMCP-disabled seeds" });
    }
    if (details.adapterUsed !== false || details.preordainedWinner !== false) {
      context.issues.push({ path, message: "adapter evidence and a preordained winner are ineligible for the native ablation" });
    }
    if (!Array.isArray(details.metrics) || details.metrics.length === 0) {
      context.issues.push({ path: `${path}.metrics`, message: "must report the EVALS.md ablation metrics" });
    }
  }
  if (gateId === "V01") {
    if (details.verdict !== "SHIP" || details.freshReadOnlyJudge !== true || details.desktopDriven !== true || details.mobile390Driven !== true) {
      context.issues.push({ path, message: "V01 requires a fresh read-only SHIP verdict after driven desktop and 390px review" });
    }
  }
  if (gateId === "R01" && (details.consecutiveRunCount !== 5 || details.repairCount !== 0)) {
    context.issues.push({ path, message: "R01 requires five consecutive exact hero runs without repair" });
  }
  if (gateId === "R02") {
    for (const key of ["verifyPassed", "buildPassed", "localBrowserPassed", "releaseBrowserPassed", "runtimeReachable", "postFlowErrorScanClean"] as const) {
      if (details[key] !== true) context.issues.push({ path: `${path}.${key}`, message: "must be true" });
    }
  }
  if (gateId === "R03") {
    if (!Array.isArray(details.nativeRows) || canonicalJson(details.nativeRows) !== canonicalJson(NATIVE_ROW_IDS)) {
      context.issues.push({ path: `${path}.nativeRows`, message: "must bind exact eligible N01-N10 evidence" });
    }
    if (!Array.isArray(details.adapterRowsUsed) || details.adapterRowsUsed.length !== 0) {
      context.issues.push({ path: `${path}.adapterRowsUsed`, message: "must be empty" });
    }
  }
  if (gateId === "R04") {
    if (!isNonNegativeInteger(details.durationMs) || details.durationMs >= 180_000) {
      context.issues.push({ path: `${path}.durationMs`, message: "public demo must be under three minutes" });
    }
    for (const key of ["publicYouTube", "hasAudio", "showsWorkingApp", "showsNativeWebMcp", "nativeCallReachedQuickly", "showsDirect", "showsReviewDiscussionAcceptance", "showsHistory"] as const) {
      if (details[key] !== true) context.issues.push({ path: `${path}.${key}`, message: "must be true" });
    }
    if (details.videoUrl !== context.identity.videoUrl || details.videoSourceCommitSha !== context.identity.sourceCommitSha) {
      context.issues.push({ path, message: "R04 must bind the public video URL and its exact source SHA" });
    }
  }
  if (gateId === "R05") {
    for (const key of ["liveUrlAccessible", "repositoryPublic", "sourcePresent", "assetsPresent", "setupPresent", "licensePresent", "allPublicSurfacesIdentifySourceSha"] as const) {
      if (details[key] !== true) context.issues.push({ path: `${path}.${key}`, message: "must be true" });
    }
    if (details.observedSourceCommitSha !== context.identity.sourceCommitSha) {
      context.issues.push({ path: `${path}.observedSourceCommitSha`, message: "must match the release source SHA" });
    }
    for (const key of ["repositoryUrl", "licenseSpdx", "licenseUrl", "videoUrl", "submissionUrl"] as const) {
      if (details[key] !== context.identity[key]) {
        context.issues.push({ path: `${path}.${key}`, message: "must exactly bind the corresponding release-identity field" });
      }
    }
  }
  if (kind === "judge") {
    const judge = exactRecord(details.judge, `${path}.judge`, [
      "criterion",
      "phase",
      "score",
      "evaluatorId",
      "citations",
      "strongestGap",
      "mustFix",
    ], context.issues);
    if (judge) {
      for (const key of ["criterion", "phase", "score", "evaluatorId", "strongestGap", "mustFix"] as const) {
        if (judge[key] !== row[key]) context.issues.push({ path: `${path}.judge.${key}`, message: "must exactly match the final judge manifest row" });
      }
      if (canonicalJson(judge.citations) !== canonicalJson(row.citations)) {
        context.issues.push({ path: `${path}.judge.citations`, message: "must exactly match the final judge manifest row" });
      }
    }
  }
};

const validateArtifact = (
  refValue: unknown,
  refPath: string,
  kind: EvidenceKind,
  gateId: string,
  row: UnknownRecord,
  context: ValidationContext,
) => {
  const issueCount = context.issues.length;
  const ref = readArtifact(refValue, refPath, kind, context);
  if (!ref) return;
  const path = `${refPath}.artifact`;
  const artifact = exactRecord(ref.parsed, path, ARTIFACT_KEYS, context.issues);
  if (!artifact) return;
  if (artifact.schemaVersion !== EVIDENCE_SCHEMA_VERSION) context.issues.push({ path: `${path}.schemaVersion`, message: `must be ${EVIDENCE_SCHEMA_VERSION}` });
  if (artifact.gateId !== gateId) context.issues.push({ path: `${path}.gateId`, message: `must be ${gateId}` });
  if (artifact.status !== "PASS") context.issues.push({ path: `${path}.status`, message: "referenced release evidence must be PASS" });
  if (artifact.evidenceClass !== row.evidenceClass) context.issues.push({ path: `${path}.evidenceClass`, message: "must exactly match the manifest row" });
  if (artifact.sourceCommitSha !== context.identity.sourceCommitSha || artifact.sourceCommitSha !== row.sourceCommitSha) {
    context.issues.push({ path: `${path}.sourceCommitSha`, message: "must match the exact release source SHA" });
  }
  if (artifact.deployedUrl !== row.deployedUrl || artifact.deployedUrl !== (kind === "domain" ? row.deployedUrl : context.identity.deployedUrl)) {
    context.issues.push({ path: `${path}.deployedUrl`, message: "must match row and release deployment identity" });
  }
  if (artifact.deploymentId !== row.deploymentId || artifact.deploymentId !== (kind === "domain" ? row.deploymentId : context.identity.deploymentId)) {
    context.issues.push({ path: `${path}.deploymentId`, message: "must match row and release deployment identity" });
  }
  if (artifact.migrationIdentity !== context.identity.migrationIdentity) {
    context.issues.push({ path: `${path}.migrationIdentity`, message: "must match the exact release migration identity" });
  }
  if (artifact.capturedAtUtc !== row.capturedAtUtc || !isUtcTimestamp(artifact.capturedAtUtc)) {
    context.issues.push({ path: `${path}.capturedAtUtc`, message: "must be a UTC timestamp matching the manifest row" });
  } else {
    const captureTime = Date.parse(artifact.capturedAtUtc);
    context.captureTimes.push(captureTime);
    if (artifact.evidenceClass === "NATIVE_CAPTURED") context.nativeCaptureTimes.push(captureTime);
  }
  if (!isNonNegativeInteger(artifact.durationMs)) context.issues.push({ path: `${path}.durationMs`, message: "must be a non-negative safe integer" });
  if (!fixtureVersionsAreEligible(artifact.fixtureVersions)) {
    context.issues.push({ path: `${path}.fixtureVersions`, message: "must name one or both exact frozen v4 fixture versions" });
  }
  if ((gateId === "D01" || gateId === "B01" || gateId === "R05") && !fixtureVersionsAreExact(artifact.fixtureVersions)) {
    context.issues.push({ path: `${path}.fixtureVersions`, message: `${gateId} must bind both exact frozen v4 fixtures in contract order` });
  }
  validateSurface(artifact.surface, `${path}.surface`, row.evidenceClass as EvidenceClass, context);
  if (!isSha256(artifact.payloadSha256) || artifact.payloadSha256 !== sha256CanonicalJson(artifact.details)) {
    context.issues.push({ path: `${path}.payloadSha256`, message: "must match the canonical SHA-256 of details" });
  }
  validateBaseDetails(artifact.details, `${path}.details`, gateId, kind, row.evidenceClass as EvidenceClass, row, context);
  if (context.issues.length === issueCount) context.eligiblePaths.add(ref.relativePath);
};

const validateEvidenceRow = (
  row: UnknownRecord,
  path: string,
  gateId: string,
  passClasses: readonly EvidenceClass[],
  kind: EvidenceKind,
  context: ValidationContext,
) => {
  if (row.status !== "PASS" && row.status !== "PENDING") context.issues.push({ path: `${path}.status`, message: "must be PASS or PENDING" });
  if (!EVIDENCE_CLASSES.includes(row.evidenceClass as EvidenceClass)) {
    context.issues.push({ path: `${path}.evidenceClass`, message: "must use an exact EVALS.md evidence class" });
  }
  validateNullableSha(row.sourceCommitSha, `${path}.sourceCommitSha`, context.issues);
  validateNullableUrl(row.deployedUrl, `${path}.deployedUrl`, context.issues, true);
  validateNullableText(row.deploymentId, `${path}.deploymentId`, context.issues, 200);
  validateNullableTimestamp(row.capturedAtUtc, `${path}.capturedAtUtc`, context.issues);
  if (!Array.isArray(row.artifactRefs)) context.issues.push({ path: `${path}.artifactRefs`, message: "must be an array" });

  if (row.status === "PENDING") {
    context.blockers.push({ path: `${path}.status`, message: "PENDING evidence blocks release" });
    if (row.evidenceClass !== "PENDING"
      || row.sourceCommitSha !== null
      || row.deployedUrl !== null
      || row.deploymentId !== null
      || row.capturedAtUtc !== null
      || !Array.isArray(row.artifactRefs)
      || row.artifactRefs.length !== 0) {
      context.issues.push({ path, message: "PENDING requires class PENDING, null row identity/timestamp, and no artifact references" });
    }
    return;
  }
  if (row.status !== "PASS") return;
  if (!passClasses.includes(row.evidenceClass as EvidenceClass)) {
    const nativeMessage = passClasses.length === 1 && passClasses[0] === "NATIVE_CAPTURED"
      ? "; ADAPTER_CAPTURED, API/RPC, DOM, and injected modelContext evidence cannot satisfy this gate"
      : "";
    context.issues.push({ path: `${path}.evidenceClass`, message: `PASS requires ${passClasses.join(" or ")}${nativeMessage}` });
  }
  if (row.sourceCommitSha !== context.identity.sourceCommitSha || !isSha(row.sourceCommitSha)) {
    context.issues.push({ path: `${path}.sourceCommitSha`, message: "PASS must bind the exact release source SHA" });
  }
  if (kind === "domain") {
    const deploymentPairIsNull = row.deployedUrl === null && row.deploymentId === null;
    const deploymentPairMatches = row.deployedUrl === context.identity.deployedUrl && row.deploymentId === context.identity.deploymentId;
    if (!deploymentPairIsNull && !deploymentPairMatches) {
      context.issues.push({ path, message: "domain evidence deployment identity must be wholly null or match the release deployment" });
    }
  } else if (row.deployedUrl !== context.identity.deployedUrl || row.deploymentId !== context.identity.deploymentId
    || !isCanonicalDeploymentUrl(row.deployedUrl) || !isNonEmptyString(row.deploymentId, 200)) {
    context.issues.push({ path, message: "PASS must bind the exact canonical deployment URL and deployment ID" });
  }
  if (!isUtcTimestamp(row.capturedAtUtc)) context.issues.push({ path: `${path}.capturedAtUtc`, message: "PASS requires an exact UTC timestamp" });
  if (!Array.isArray(row.artifactRefs) || row.artifactRefs.length !== 1) {
    context.issues.push({ path: `${path}.artifactRefs`, message: "PASS requires exactly one content-addressed JSON evidence artifact" });
    return;
  }
  validateArtifact(row.artifactRefs[0], `${path}.artifactRefs[0]`, kind, gateId, row, context);
};

const validateRows = (
  value: unknown,
  path: string,
  ids: readonly string[],
  classes: readonly EvidenceClass[] | ((id: string) => readonly EvidenceClass[]),
  kind: EvidenceKind,
  context: ValidationContext,
) => {
  if (!Array.isArray(value)) {
    context.issues.push({ path, message: `must enumerate exactly ${ids.join(", ")}` });
    return;
  }
  if (value.length !== ids.length) context.issues.push({ path, message: `must enumerate exactly ${ids.join(", ")}` });
  value.forEach((entry, index) => {
    const rowPath = `${path}[${index}]`;
    const row = exactRecord(entry, rowPath, ROW_KEYS, context.issues);
    if (!row) return;
    const id = ids[index];
    if (row.id !== id) context.issues.push({ path: `${rowPath}.id`, message: `must be ${id ?? "absent"} in this position` });
    if (id) validateEvidenceRow(row, rowPath, id, typeof classes === "function" ? classes(id) : classes, kind, context);
  });
};

const pendingIdentity = (): ReleaseIdentity => ({
  sourceCommitSha: undefined,
  publicRepositoryHeadSha: undefined,
  deployedSourceCommitSha: undefined,
  manifestSourceCommitSha: undefined,
  videoSourceCommitSha: undefined,
  submissionSourceCommitSha: undefined,
  deployedUrl: undefined,
  deploymentId: undefined,
  migrationIdentity: undefined,
  repositoryUrl: undefined,
  licenseSpdx: undefined,
  licenseUrl: undefined,
  videoUrl: undefined,
  submissionUrl: undefined,
  fixtureVersions: undefined,
  recordedAtUtc: undefined,
});

const validateReleaseIdentity = (value: unknown, context: ValidationContext): ReleaseIdentity => {
  const path = "$.releaseIdentity";
  const identity = exactRecord(value, path, IDENTITY_KEYS, context.issues);
  if (!identity) return pendingIdentity();
  for (const key of [
    "sourceCommitSha",
    "publicRepositoryHeadSha",
    "deployedSourceCommitSha",
    "manifestSourceCommitSha",
    "videoSourceCommitSha",
    "submissionSourceCommitSha",
  ] as const) validateNullableSha(identity[key], `${path}.${key}`, context.issues);
  validateNullableUrl(identity.deployedUrl, `${path}.deployedUrl`, context.issues, true);
  validateNullableText(identity.deploymentId, `${path}.deploymentId`, context.issues, 200);
  validateNullableText(identity.migrationIdentity, `${path}.migrationIdentity`, context.issues, 1_000);
  validateNullableUrl(identity.repositoryUrl, `${path}.repositoryUrl`, context.issues);
  validateNullableText(identity.licenseSpdx, `${path}.licenseSpdx`, context.issues, 50);
  validateNullableUrl(identity.licenseUrl, `${path}.licenseUrl`, context.issues);
  validateNullableUrl(identity.videoUrl, `${path}.videoUrl`, context.issues, false, true);
  validateNullableUrl(identity.submissionUrl, `${path}.submissionUrl`, context.issues);
  validateNullableTimestamp(identity.recordedAtUtc, `${path}.recordedAtUtc`, context.issues);
  if (!fixtureVersionsAreExact(identity.fixtureVersions)) {
    context.issues.push({ path: `${path}.fixtureVersions`, message: "must contain both exact frozen v4 fixture versions in contract order" });
  }
  const surface = exactRecord(identity.supportedNativeSurface, `${path}.supportedNativeSurface`, SURFACE_KEYS, context.issues);
  if (surface) SURFACE_KEYS.forEach((key) => validateNullableText(surface[key], `${path}.supportedNativeSurface.${key}`, context.issues, 200));

  const source = identity.sourceCommitSha;
  const allShaBound = isSha(source) && [
    identity.publicRepositoryHeadSha,
    identity.deployedSourceCommitSha,
    identity.manifestSourceCommitSha,
    identity.videoSourceCommitSha,
    identity.submissionSourceCommitSha,
  ].every((candidate) => candidate === source);
  const complete = allShaBound
    && isCanonicalDeploymentUrl(identity.deployedUrl)
    && isNonEmptyString(identity.deploymentId, 200)
    && isNonEmptyString(identity.migrationIdentity, 1_000)
    && isHttpsUrl(identity.repositoryUrl)
    && isNonEmptyString(identity.licenseSpdx, 50)
    && isHttpsUrl(identity.licenseUrl)
    && isHttpsUrl(identity.videoUrl, true)
    && isHttpsUrl(identity.submissionUrl)
    && isUtcTimestamp(identity.recordedAtUtc)
    && Boolean(surface && SURFACE_KEYS.every((key) => isNonEmptyString(surface[key], 200)));
  if (!complete) context.blockers.push({ path, message: "release identity is incomplete or its public/deployed/video/manifest/submission SHA fields diverge" });

  if (isSha(source)) {
    const licenseUrl = isHttpsUrl(identity.licenseUrl) ? new URL(identity.licenseUrl) : undefined;
    if (identity.licenseSpdx !== null && !OPEN_SOURCE_LICENSES.has(String(identity.licenseSpdx))) {
      context.issues.push({ path: `${path}.licenseSpdx`, message: "must be an approved open-source SPDX identifier" });
    }
    if (licenseUrl && !licenseUrl.pathname.includes(`/blob/${source}/`)) {
      context.issues.push({ path: `${path}.licenseUrl`, message: "must be pinned to sourceCommitSha" });
    }
    const videoUrl = isHttpsUrl(identity.videoUrl, true) ? new URL(identity.videoUrl) : undefined;
    if (videoUrl && !/(?:^|\.)(?:youtube\.com|youtu\.be)$/i.test(videoUrl.hostname)) {
      context.issues.push({ path: `${path}.videoUrl`, message: "must identify the public YouTube demo" });
    }
    const submissionUrl = isHttpsUrl(identity.submissionUrl) ? new URL(identity.submissionUrl) : undefined;
    if (submissionUrl && !/(?:^|\.)devpost\.com$/i.test(submissionUrl.hostname)) {
      context.issues.push({ path: `${path}.submissionUrl`, message: "must identify the public Devpost submission" });
    }
  }
  return { ...identity, supportedNativeSurface: surface } as ReleaseIdentity;
};

const validateAblation = (value: unknown, context: ValidationContext) => {
  const path = "$.ablation";
  const row = exactRecord(value, path, GATE_KEYS, context.issues);
  if (row) validateEvidenceRow(row, path, "ABLATION", ["NATIVE_CAPTURED"], "ablation", context);
};

const validateJudges = (value: unknown, context: ValidationContext) => {
  const path = "$.judges";
  if (!Array.isArray(value)) {
    context.issues.push({ path, message: `must enumerate exactly ${JUDGE_ROW_IDS.join(", ")}` });
    return;
  }
  if (value.length !== JUDGE_ROW_IDS.length) context.issues.push({ path, message: `must enumerate exactly ${JUDGE_ROW_IDS.join(", ")}` });
  const evaluatorIds = new Set<string>();
  const scores: number[] = [];
  value.forEach((entry, index) => {
    const rowPath = `${path}[${index}]`;
    const row = exactRecord(entry, rowPath, JUDGE_KEYS, context.issues);
    if (!row) return;
    const id = JUDGE_ROW_IDS[index] as keyof typeof JUDGE_CRITERIA | undefined;
    if (row.id !== id) context.issues.push({ path: `${rowPath}.id`, message: `must be ${id ?? "absent"}` });
    if (!id) return;
    if (row.criterion !== JUDGE_CRITERIA[id]) context.issues.push({ path: `${rowPath}.criterion`, message: `must be ${JUDGE_CRITERIA[id]}` });
    if (row.phase !== "FINAL") context.issues.push({ path: `${rowPath}.phase`, message: "must be FINAL; preliminary judges are ineligible release proof" });
    if (row.score !== null && (typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || row.score > 5)) {
      context.issues.push({ path: `${rowPath}.score`, message: "must be null or a finite score from 0 to 5" });
    }
    validateNullableText(row.evaluatorId, `${rowPath}.evaluatorId`, context.issues, 200);
    validateNullableText(row.strongestGap, `${rowPath}.strongestGap`, context.issues, 1_000);
    validateNullableText(row.mustFix, `${rowPath}.mustFix`, context.issues, 1_000);
    if (!Array.isArray(row.citations) || row.citations.some((citation) => !isCanonicalArtifactPath(citation))) {
      context.issues.push({ path: `${rowPath}.citations`, message: "must contain canonical v4 evidence artifact paths" });
    }
    const eligibleBeforeJudge = new Set(context.eligiblePaths);
    validateEvidenceRow(row, rowPath, id, ["MANUAL_CAPTURED"], "judge", context);
    if (row.status !== "PASS") {
      if (row.score !== null || row.evaluatorId !== null || row.strongestGap !== null || row.mustFix !== null
        || !Array.isArray(row.citations) || row.citations.length !== 0) {
        context.issues.push({ path: rowPath, message: "PENDING judge metadata must remain null with empty citations" });
      }
      return;
    }
    const normalizedEvaluator = isNonEmptyString(row.evaluatorId, 200) ? row.evaluatorId.toLowerCase() : undefined;
    if (!normalizedEvaluator || evaluatorIds.has(normalizedEvaluator)) {
      context.issues.push({ path: `${rowPath}.evaluatorId`, message: "must identify a unique independent final judge" });
    } else evaluatorIds.add(normalizedEvaluator);
    if (!Array.isArray(row.citations) || row.citations.length === 0 || row.citations.some((citation) => !eligibleBeforeJudge.has(citation))) {
      context.issues.push({ path: `${rowPath}.citations`, message: "must cite eligible, hash-verified earlier v4 evidence and cannot self-cite" });
    }
    if (!isNonEmptyString(row.strongestGap, 1_000)) context.issues.push({ path: `${rowPath}.strongestGap`, message: "PASS requires the strongest remaining gap" });
    if (row.mustFix !== null) context.issues.push({ path: `${rowPath}.mustFix`, message: "final release judges must have no must-fix" });
    const threshold = JUDGE_THRESHOLDS[id];
    if (typeof row.score !== "number" || row.score < threshold) {
      context.issues.push({ path: `${rowPath}.score`, message: `${id} must meet its ${threshold}/5 release threshold` });
    } else scores.push(row.score);
    if (isUtcTimestamp(row.capturedAtUtc) && context.nativeCaptureTimes.length > 0
      && Date.parse(row.capturedAtUtc) <= Math.max(...context.nativeCaptureTimes)) {
      context.issues.push({ path: `${rowPath}.capturedAtUtc`, message: "final judge evidence must postdate all native captures" });
    }
  });
  if (scores.length === 4 && scores.reduce((total, score) => total + score, 0) < 19) {
    context.issues.push({ path, message: "final judge total must be at least 19/20" });
  }
};

const validateGitState = (releaseStatus: unknown, identity: ReleaseIdentity, context: ValidationContext) => {
  if (releaseStatus !== "PASS") return;
  const state = context.options.gitState;
  if (!state) {
    context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "authoritative clean Git state is required for PASS" });
    return;
  }
  if (state.headSha !== identity.sourceCommitSha) {
    context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "must exactly match checked-out Git HEAD" });
  }
  if (!state.indexClean || !state.worktreeClean || !state.untrackedClean) {
    context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "dirty-tree evidence is invalid: index, worktree, and untracked state must be clean" });
  }
  if (!state.requiredSourceFilesAtHead || !state.pendingTemplateAtHead) {
    context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "source HEAD must track the v4 validator and an all-PENDING v4 template" });
  }
};

/** Validate the content-addressed v4 document-repository release bundle. */
export function validateReleaseManifest(value: unknown, options: ManifestValidationOptions = {}): ReleaseManifestValidation {
  const issues = [...findJsonSafetyIssues(value), ...findSensitiveData(value)];
  const blockers: ManifestIssue[] = [];
  const context: ValidationContext = {
    options,
    identity: pendingIdentity(),
    issues,
    blockers,
    claimedPaths: new Set(),
    eligiblePaths: new Set(),
    captureTimes: [],
    nativeCaptureTimes: [],
  };
  const manifest = exactRecord(value, "$", TOP_LEVEL_KEYS, issues);
  if (!manifest) {
    return { ok: false, schemaValid: false, releaseReady: false, status: "INVALID", issues, blockers, referencedArtifacts: [] };
  }
  if (manifest.contractVersion !== RELEASE_CONTRACT_VERSION) {
    issues.push({ path: "$.contractVersion", message: `must be exactly ${RELEASE_CONTRACT_VERSION}; v3 evidence is ineligible` });
  }
  if (manifest.releaseStatus !== "PASS" && manifest.releaseStatus !== "PENDING") {
    issues.push({ path: "$.releaseStatus", message: "must be PASS or PENDING" });
  } else if (manifest.releaseStatus === "PENDING") {
    blockers.push({ path: "$.releaseStatus", message: "PENDING blocks release" });
  }
  context.identity = validateReleaseIdentity(manifest.releaseIdentity, context);

  validateRows(manifest.domainEvidence, "$.domainEvidence", DOMAIN_ROW_IDS, ["AUTOMATED"], "domain", context);
  validateRows(manifest.browserEvidence, "$.browserEvidence", BROWSER_ROW_IDS,
    ["AUTOMATED", "ADAPTER_CAPTURED", "MANUAL_CAPTURED"], "browser", context);
  validateRows(manifest.nativeEvidence, "$.nativeEvidence", NATIVE_ROW_IDS, ["NATIVE_CAPTURED"], "native", context);
  validateRows(manifest.agentEvidence, "$.agentEvidence", AGENT_ROW_IDS, ["NATIVE_CAPTURED"], "agent", context);
  validateAblation(manifest.ablation, context);
  validateRows(manifest.visualEvidence, "$.visualEvidence", VISUAL_ROW_IDS, ["MANUAL_CAPTURED"], "visual", context);
  validateRows(manifest.releaseEvidence, "$.releaseEvidence", RELEASE_ROW_IDS,
    (id) => [RELEASE_PASS_CLASSES[id as keyof typeof RELEASE_PASS_CLASSES]], "release", context);
  validateJudges(manifest.judges, context);

  if (isUtcTimestamp(context.identity.recordedAtUtc) && context.captureTimes.length > 0
    && Date.parse(context.identity.recordedAtUtc) < Math.max(...context.captureTimes)) {
    issues.push({ path: "$.releaseIdentity.recordedAtUtc", message: "final manifest timestamp must not predate referenced evidence" });
  }
  validateGitState(manifest.releaseStatus, context.identity, context);
  if (manifest.releaseStatus === "PASS" && blockers.length > 0) {
    issues.push({ path: "$.releaseStatus", message: "cannot claim PASS while release identity or any gate remains PENDING" });
  }
  const schemaValid = issues.length === 0;
  const releaseReady = schemaValid && blockers.length === 0 && manifest.releaseStatus === "PASS";
  return {
    ok: releaseReady,
    schemaValid,
    releaseReady,
    status: !schemaValid ? "INVALID" : releaseReady ? "PASS" : "PENDING",
    issues,
    blockers,
    referencedArtifacts: [...context.claimedPaths].sort(),
  };
}
