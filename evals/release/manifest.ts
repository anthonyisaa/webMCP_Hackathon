import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const ledgerModulePath = "../agent/ledger.ts";
const { ablationRequest, releaseRequest, validateLedger } = await import(ledgerModulePath) as typeof import("../agent/ledger");

export const RELEASE_CONTRACT_VERSION = "document-hero-v3" as const;
export const EVIDENCE_SCHEMA_VERSION = "ratiflow-document-v3-evidence-v1" as const;
export const DOMAIN_ROW_IDS = Array.from({ length: 24 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`);
export const BROWSER_ROW_IDS = Array.from({ length: 16 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`);
export const NATIVE_ROW_IDS = Array.from({ length: 12 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`);
export const REHEARSAL_ROW_IDS = ["R01", "R02", "R03", "R04"] as const;
export const TRAJECTORY_IDS = ["A01", "A02", "A03", "A04", "A05", "A06", "A07"] as const;
export const VISUAL_ROW_IDS = ["V01", "V02", "V03"] as const;
export const JUDGE_IDS = ["J01", "J02", "J03", "J04"] as const;
export const RELEASE_CHECK_IDS = [
  "VERIFY",
  "BUILD",
  "PREVIEW_MIGRATION_CHAIN",
  "PREVIEW_V2_SMOKE",
  "PREVIEW_V3_SMOKE",
  "PREVIEW_AUTHORIZATION",
  "PREVIEW_GRANTS_RLS",
  "PREVIEW_SECURITY_ADVISOR",
  "PREVIEW_PERFORMANCE_ADVISOR",
  "DEPLOYMENT_IDENTITY",
  "SPELLING_MENU",
] as const;
export const EVIDENCE_CLASSES = ["AUTOMATED", "ADAPTER_CAPTURED", "NATIVE_CAPTURED", "MANUAL_CAPTURED", "PENDING"] as const;

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
export type AgentLedgerValidationInput = {
  kind: "trajectory" | "ablation";
  runs: unknown[];
  transcriptRoot: string;
  sourceCommitSha: string;
  deployedUrl: string;
  deploymentId: string;
  migrationIdentity: string;
  browserSurface: string;
};
export type AgentLedgerValidationOutput = { ok: boolean; issues: ManifestIssue[] };
export type ManifestValidationOptions = {
  assetRoot?: string;
  manifestPath?: string;
  gitState?: GitState;
  validateAgentLedger?: (input: AgentLedgerValidationInput) => AgentLedgerValidationOutput;
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
type ReleaseIdentity = {
  sourceCommitSha: unknown;
  deployedUrl: unknown;
  deploymentId: unknown;
  migrationIdentity: unknown;
  recordedAtUtc: unknown;
  supportedSurface?: UnknownRecord;
};
type ArtifactKind = "domain" | "browser" | "release-check" | "native" | "rehearsal" | "trajectory" | "ablation" | "visual" | "judge" | "public";
type ValidationContext = {
  options: ManifestValidationOptions;
  identity: ReleaseIdentity;
  issues: ManifestIssue[];
  blockers: ManifestIssue[];
  claimedPaths: Set<string>;
  artifactPaths: Set<string>;
  nativeCaptureTimes: number[];
  judgeCaptureTimes: number[];
  deploymentCaptureTimes: number[];
  allCaptureTimes: number[];
  deferredClaimCitations: Array<{ path: string; refs: string[]; eligibleRefs: Set<string> }>;
};

const TOP_LEVEL_KEYS = [
  "contractVersion", "releaseStatus", "releaseIdentity", "domainEvidence", "browserEvidence", "releaseChecks",
  "nativeEvidence", "rehearsalEvidence", "trajectoryLedger", "ablation", "visualEvidence", "judges", "publicPackage",
] as const;
const RELEASE_IDENTITY_KEYS = ["sourceCommitSha", "deployedUrl", "deploymentId", "migrationIdentity", "recordedAtUtc", "supportedSurface"] as const;
const SUPPORTED_SURFACE_KEYS = ["client", "clientVersion", "browser", "browserVersion"] as const;
const ARTIFACT_REF_KEYS = ["path", "sha256"] as const;
const EVIDENCE_ROW_KEYS = ["id", "status", "evidenceClass", "sourceCommitSha", "deployedUrl", "capturedAtUtc", "artifactRefs"] as const;
const GATE_KEYS = EVIDENCE_ROW_KEYS.filter((key) => key !== "id");
const JUDGE_KEYS = [...EVIDENCE_ROW_KEYS, "criterion", "score", "evaluatorId", "citations", "strongestGap", "mustFix"] as const;
const PUBLIC_PACKAGE_KEYS = [...GATE_KEYS, "repositoryUrl", "licenseSpdx", "licenseUrl", "videoUrl", "devpostUrl"] as const;
const ARTIFACT_KEYS = [
  "schemaVersion", "fixtureVersion", "gateId", "status", "evidenceClass", "sourceCommitSha", "deployedUrl",
  "deploymentId", "migrationIdentity", "capturedAtUtc", "durationMs", "surface", "payloadSha256", "details",
] as const;
const ARTIFACT_SURFACE_KEYS = ["client", "clientVersion", "browser", "browserVersion", "model", "modelVersion"] as const;
const ARTIFACT_ROOTS: Record<ArtifactKind, string> = {
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
const JUDGE_CRITERIA = { J01: "WebMCP Leverage", J02: "Execution", J03: "Potential Impact", J04: "Creativity and Ambition" } as const;
const JUDGE_THRESHOLDS = { J01: 5, J02: 4.5, J03: 4.5, J04: 4.5 } as const;
const REHEARSAL_PASS_CLASSES = { R01: "NATIVE_CAPTURED", R02: "MANUAL_CAPTURED", R03: "MANUAL_CAPTURED", R04: "MANUAL_CAPTURED" } as const;
const RELEASE_CHECK_PASS_CLASSES = {
  VERIFY: "AUTOMATED", BUILD: "AUTOMATED", PREVIEW_MIGRATION_CHAIN: "AUTOMATED", PREVIEW_V2_SMOKE: "AUTOMATED",
  PREVIEW_V3_SMOKE: "AUTOMATED", PREVIEW_AUTHORIZATION: "AUTOMATED", PREVIEW_GRANTS_RLS: "AUTOMATED",
  PREVIEW_SECURITY_ADVISOR: "AUTOMATED", PREVIEW_PERFORMANCE_ADVISOR: "AUTOMATED", DEPLOYMENT_IDENTITY: "AUTOMATED",
  SPELLING_MENU: "MANUAL_CAPTURED",
} as const;
export const RELEASE_CHECK_COMMANDS: Record<(typeof RELEASE_CHECK_IDS)[number], string> = {
  VERIFY: ".codex/verify.sh",
  BUILD: "pnpm build",
  PREVIEW_MIGRATION_CHAIN: "release-operation:preview-migration-chain",
  PREVIEW_V2_SMOKE: "release-operation:preview-v2-smoke",
  PREVIEW_V3_SMOKE: "release-operation:preview-v3-smoke",
  PREVIEW_AUTHORIZATION: "release-operation:preview-authorization",
  PREVIEW_GRANTS_RLS: "release-operation:preview-grants-rls",
  PREVIEW_SECURITY_ADVISOR: "release-operation:preview-security-advisor",
  PREVIEW_PERFORMANCE_ADVISOR: "release-operation:preview-performance-advisor",
  DEPLOYMENT_IDENTITY: "release-operation:deployment-provider-inspect",
  SPELLING_MENU: "supported-client:native-spelling-menu-capture",
};
const OPEN_SOURCE_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "MPL-2.0", "GPL-3.0-only", "AGPL-3.0-only", "ISC", "Unlicense"]);

const SENSITIVE_KEY = /(?:api[-_]?key|authorization|bootstrap|cookie|credential|fragment|password|secret|session|share[-_]?token|token|set[-_]?cookie|storage|membership[-_]?handle)/i;
const SENSITIVE_VALUES = [
  /\b(?:sk|pk)_(?:live|test)_[a-z0-9]{16,}/i,
  /\bsb_(?:publishable|secret)_[a-z0-9_-]{16,}/i,
  /\beyJ[a-zA-Z0-9_-]{20,}(?:\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})?/,
  /\b(?:bearer|cookie)\s+[a-z0-9._~+/-]{12,}/i,
  /\bmbr_[a-z0-9_-]{12,}/i,
  /ratiflow-bootstrap=/i,
  /\/(?:document|documents|share)\/[A-Za-z0-9_-]{20,}(?:[#/?]|$)/,
  /#[A-Za-z0-9_-]{24,}/,
  /[?&](?:sig|signature|signed|token|key|auth|session|credential|share|bootstrap|fragment)=[^\s&#]+/i,
  /\b(?=[A-Za-z0-9_-]{43,256}\b)(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/,
] as const;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const childPath = (path: string, key: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
const exactRecord = (value: unknown, path: string, keys: readonly string[], issues: ManifestIssue[]): UnknownRecord | undefined => {
  if (!isRecord(value)) { issues.push({ path, message: "must be an object" }); return undefined; }
  for (const key of keys) if (!Object.hasOwn(value, key)) issues.push({ path: childPath(path, key), message: "required field is missing" });
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push({ path: childPath(path, key), message: "unexpected field" });
  return value;
};
const isNonEmptyString = (value: unknown, maxLength = 1_000): value is string =>
  typeof value === "string" && value.trim().length > 0 && value === value.trim() && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
const isNonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isSafeTokenMetadata = (key: string, value: unknown) => {
  if (key === "tokenUsage") return isRecord(value);
  return (key === "promptTokens" || key === "completionTokens" || key === "totalTokens")
    && (value === null || isNonNegativeInteger(value));
};
const isSourceCommitSha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const isSha256 = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isUtcTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?Z$/.exec(value);
  if (!match) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === `${match[1]}${match[2] ?? ".000"}Z`;
};
const isHttpsUrl = (value: unknown, allowQuery = false): value is string => {
  if (typeof value !== "string" || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash && (allowQuery || !url.search);
  } catch { return false; }
};
const isDeploymentUrl = (value: unknown): value is string => isHttpsUrl(value, false) && new URL(value).pathname === "/";
const hasSensitiveUrlParts = (value: string) => {
  try {
    const url = new URL(value);
    return Boolean(url.username || url.password) || [...url.searchParams.keys()].some((key) =>
      SENSITIVE_KEY.test(key) || /^(?:sig|signature|signed|share|bootstrap|fragment)$/i.test(key));
  } catch { return false; }
};

export function findSensitiveData(value: unknown, path = "$", seen = new WeakSet<object>()): ManifestIssue[] {
  if (typeof value === "string") {
    return SENSITIVE_VALUES.some((pattern) => pattern.test(value)) || hasSensitiveUrlParts(value)
      ? [{ path, message: "contains a bearer, credential, signed reference, bootstrap/share path, fragment, or base64url bundle" }] : [];
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  const issues: ManifestIssue[] = [];
  if (Array.isArray(value)) for (const [index, child] of value.entries()) issues.push(...findSensitiveData(child, `${path}[${index}]`, seen));
  else for (const [key, child] of Object.entries(value)) {
    const nextPath = childPath(path, key);
    if (SENSITIVE_KEY.test(key) && !isSafeTokenMetadata(key, child)) {
      issues.push({ path: nextPath, message: "sensitive field names are not permitted in release evidence" });
    }
    issues.push(...findSensitiveData(child, nextPath, seen));
  }
  return issues;
}

export function findJsonSafetyIssues(value: unknown, path = "$", ancestors = new WeakSet<object>()): ManifestIssue[] {
  if (value === null || typeof value === "string" || typeof value === "boolean") return [];
  if (typeof value === "number") return Number.isFinite(value) ? [] : [{ path, message: "must be a finite JSON number" }];
  if (typeof value !== "object") return [{ path, message: `must be JSON-safe; received ${typeof value}` }];
  if (ancestors.has(value)) return [{ path, message: "must not contain a circular reference" }];
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return [{ path, message: "must be a plain JSON object" }];
  ancestors.add(value);
  const issues: ManifestIssue[] = [];
  if (Array.isArray(value)) for (const [index, child] of value.entries()) issues.push(...findJsonSafetyIssues(child, `${path}[${index}]`, ancestors));
  else for (const [key, child] of Object.entries(value)) issues.push(...findJsonSafetyIssues(child, childPath(path, key), ancestors));
  ancestors.delete(value);
  return issues;
}

const canonicalize = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonicalize)
  : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));
export const sha256Text = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const sha256CanonicalJson = (value: unknown) => sha256Text(canonicalJson(value));

const validateNullableText = (value: unknown, path: string, issues: ManifestIssue[], maxLength = 1_000) => {
  if (value !== null && !isNonEmptyString(value, maxLength)) issues.push({ path, message: `must be null or a trimmed non-empty string up to ${maxLength} characters` });
};
const validateNullableSha = (value: unknown, path: string, issues: ManifestIssue[]) => {
  if (value !== null && !isSourceCommitSha(value)) issues.push({ path, message: "must be null or an exact 40-character lowercase source commit SHA" });
};
const validateNullableTimestamp = (value: unknown, path: string, issues: ManifestIssue[]) => {
  if (value !== null && !isUtcTimestamp(value)) issues.push({ path, message: "must be null or a valid UTC timestamp ending in Z" });
};
const validateNullableDeploymentUrl = (value: unknown, path: string, issues: ManifestIssue[]) => {
  if (value !== null && !isDeploymentUrl(value)) issues.push({ path, message: "must be null or a canonical credential-free HTTPS origin" });
};
const isCanonicalRelativeJsonPath = (value: unknown): value is string => {
  if (!isNonEmptyString(value, 1_000) || isAbsolute(value) || value.includes("\\") || value.includes("?") || value.includes("#")) return false;
  if (!value.endsWith(".json") || !/^[A-Za-z0-9][A-Za-z0-9._+@/-]*$/.test(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  const lower = value.toLowerCase();
  return !segments.some((segment) => {
    const stem = segment.replace(/\.json$/i, "");
    return /(?:^|[._-])(?:latest|legacy)(?:$|[._-])/i.test(stem) || /(?:hero-v1|v1\.2)/i.test(segment);
  }) && !lower.includes("decision-demo");
};
const isWithinRoot = (root: string, candidate: string) => candidate === root || candidate.startsWith(`${root}${sep}`);

const claimUniquePath = (ref: string, path: string, context: ValidationContext) => {
  if (context.claimedPaths.has(ref)) {
    context.issues.push({ path, message: "artifact and nested evidence paths must be unique across every release gate" });
    return false;
  }
  context.claimedPaths.add(ref);
  return true;
};

const readCanonicalRegularFile = (
  relativePath: string,
  expectedRoot: string,
  path: string,
  context: ValidationContext,
): { absolutePath: string; contents: Buffer } | undefined => {
  const assetRoot = resolve(context.options.assetRoot ?? process.cwd());
  const lexicalRoot = resolve(assetRoot, expectedRoot);
  const absolutePath = resolve(assetRoot, relativePath);
  if (!isWithinRoot(lexicalRoot, absolutePath)) {
    context.issues.push({ path, message: `must remain under ${expectedRoot}/` });
    return undefined;
  }
  if (context.options.manifestPath && resolve(context.options.manifestPath) === absolutePath) {
    context.issues.push({ path, message: "the release manifest cannot cite itself as evidence" });
    return undefined;
  }
  try {
    const lexicalStat = lstatSync(absolutePath);
    if (lexicalStat.isSymbolicLink() || !lexicalStat.isFile()) {
      context.issues.push({ path, message: "must reference a canonical regular file, never a symlink or directory" });
      return undefined;
    }
    const realAssetRoot = realpathSync(assetRoot);
    const realExpectedRoot = realpathSync(lexicalRoot);
    const realPath = realpathSync(absolutePath);
    const canonicalExpectedPath = resolve(realAssetRoot, relative(assetRoot, absolutePath));
    if (!isWithinRoot(realAssetRoot, realPath) || !isWithinRoot(realExpectedRoot, realPath) || realPath !== canonicalExpectedPath) {
      context.issues.push({ path, message: "must not escape or traverse a symlinked asset root" });
      return undefined;
    }
    const canonicalStat = statSync(realPath);
    if (!canonicalStat.isFile() || canonicalStat.size > 25_000_000) {
      context.issues.push({ path, message: "must be a regular evidence file no larger than 25 MB" });
      return undefined;
    }
    return { absolutePath: realPath, contents: readFileSync(realPath) };
  } catch {
    context.issues.push({ path, message: "referenced evidence file is missing or unreadable" });
    return undefined;
  }
};

const validateArtifactRef = (
  value: unknown,
  path: string,
  kind: ArtifactKind,
  context: ValidationContext,
): { relativePath: string; absolutePath: string; parsed: unknown } | undefined => {
  const ref = exactRecord(value, path, ARTIFACT_REF_KEYS, context.issues);
  if (!ref) return undefined;
  if (!isCanonicalRelativeJsonPath(ref.path)) {
    context.issues.push({ path: `${path}.path`, message: "must be a canonical repo-relative JSON path without latest, legacy, query, fragment, or traversal" });
    return undefined;
  }
  if (!isSha256(ref.sha256)) {
    context.issues.push({ path: `${path}.sha256`, message: "must carry an exact lowercase SHA-256 digest" });
    return undefined;
  }
  const relativePath = ref.path;
  if (!relativePath.startsWith(`${ARTIFACT_ROOTS[kind]}/`)) {
    context.issues.push({ path: `${path}.path`, message: `must be under the ${ARTIFACT_ROOTS[kind]}/ type root` });
    return undefined;
  }
  if (!claimUniquePath(relativePath, `${path}.path`, context)) return undefined;
  const file = readCanonicalRegularFile(relativePath, ARTIFACT_ROOTS[kind], `${path}.path`, context);
  if (!file) return undefined;
  if (sha256Text(file.contents) !== ref.sha256) {
    context.issues.push({ path: `${path}.sha256`, message: "does not match the referenced file bytes" });
    return undefined;
  }
  const raw = file.contents.toString("utf8");
  if (SENSITIVE_VALUES.some((pattern) => pattern.test(raw))) {
    context.issues.push({ path: `${path}.path`, message: "referenced artifact contents contain forbidden bearer material" });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch {
    context.issues.push({ path: `${path}.path`, message: "referenced artifact must contain valid JSON" });
    return undefined;
  }
  context.issues.push(...findJsonSafetyIssues(parsed, `${path}.artifact`));
  context.issues.push(...findSensitiveData(parsed, `${path}.artifact`));
  context.artifactPaths.add(relativePath);
  return { relativePath, absolutePath: file.absolutePath, parsed };
};

const expectedBrowserSurface = (identity: ReleaseIdentity) => identity.supportedSurface
  ? `${String(identity.supportedSurface.client)} ${String(identity.supportedSurface.clientVersion)} / ${String(identity.supportedSurface.browser)} ${String(identity.supportedSurface.browserVersion)}`
  : "";

const defaultAgentLedgerValidation = (input: AgentLedgerValidationInput): AgentLedgerValidationOutput => {
  const result = validateLedger(input.runs, input.kind === "trajectory" ? releaseRequest() : ablationRequest(), { transcriptRoot: input.transcriptRoot });
  const issues = result.issues.map((issue) => ({ path: `$.ledger${issue.path.slice(1)}`, message: issue.message }));
  if (!result.ok) return { ok: false, issues };
  for (const [index, run] of result.validRuns.entries()) {
    const path = `$.ledger[${index}]`;
    if (run.commitSha !== input.sourceCommitSha) issues.push({ path: `${path}.commitSha`, message: "must match release sourceCommitSha" });
    if (run.deployedUrl !== input.deployedUrl) issues.push({ path: `${path}.deployedUrl`, message: "must match canonical deployment URL" });
    if (run.deploymentId !== input.deploymentId) issues.push({ path: `${path}.deploymentId`, message: "must match release deployment ID" });
    if (run.databaseMigrationIdentity !== input.migrationIdentity) issues.push({ path: `${path}.databaseMigrationIdentity`, message: "must match release migration identity" });
    if (run.browserSurface !== input.browserSurface) issues.push({ path: `${path}.browserSurface`, message: "must match supported release surface" });
  }
  return { ok: issues.length === 0, issues };
};

const validateTranscriptDigests = (
  details: UnknownRecord,
  artifactPath: string,
  kind: "trajectory" | "ablation",
  path: string,
  context: ValidationContext,
) => {
  if (!Array.isArray(details.runs)) {
    context.issues.push({ path: `${path}.runs`, message: "must be the raw agent-run array" });
    return;
  }
  const expectedRuns = kind === "trajectory" ? 35 : 70;
  if (details.runs.length !== expectedRuns) context.issues.push({ path: `${path}.runs`, message: `must contain exactly ${expectedRuns} raw v3 runs` });
  if (!Array.isArray(details.transcriptDigests)) {
    context.issues.push({ path: `${path}.transcriptDigests`, message: "must contain one content digest for every transcript" });
    return;
  }
  const expectedPaths = details.runs.flatMap((run) => isRecord(run) && typeof run.transcriptPath === "string" ? [run.transcriptPath] : []);
  if (expectedPaths.length !== details.runs.length || details.transcriptDigests.length !== details.runs.length) {
    context.issues.push({ path: `${path}.transcriptDigests`, message: "must correspond one-to-one with every run transcriptPath" });
  }
  const assetRoot = resolve(context.options.assetRoot ?? process.cwd());
  const ledgerRelativeDirectory = relative(realpathSync(assetRoot), dirname(artifactPath)).split(sep).join("/");
  const seen = new Set<string>();
  for (const [index, value] of details.transcriptDigests.entries()) {
    const digestPath = `${path}.transcriptDigests[${index}]`;
    const digest = exactRecord(value, digestPath, ARTIFACT_REF_KEYS, context.issues);
    if (!digest) continue;
    if (!isCanonicalRelativeJsonPath(digest.path) || !isSha256(digest.sha256)) {
      context.issues.push({ path: digestPath, message: "must carry a canonical relative transcript path and lowercase SHA-256" });
      continue;
    }
    const transcriptPath = digest.path;
    if (seen.has(transcriptPath)) context.issues.push({ path: `${digestPath}.path`, message: "duplicate transcript path" });
    seen.add(transcriptPath);
    if (!expectedPaths.includes(transcriptPath)) {
      context.issues.push({ path: `${digestPath}.path`, message: "must match one raw run transcriptPath" });
      continue;
    }
    const bundleRelativePath = `${ledgerRelativeDirectory}/${transcriptPath}`;
    if (!claimUniquePath(bundleRelativePath, `${digestPath}.path`, context)) continue;
    const file = readCanonicalRegularFile(bundleRelativePath, ARTIFACT_ROOTS[kind], `${digestPath}.path`, context);
    if (!file) continue;
    if (sha256Text(file.contents) !== digest.sha256) context.issues.push({ path: `${digestPath}.sha256`, message: "does not match transcript bytes" });
    const transcript = file.contents.toString("utf8");
    if (SENSITIVE_VALUES.some((pattern) => pattern.test(transcript))) {
      context.issues.push({ path: `${digestPath}.path`, message: "transcript contents contain forbidden bearer material" });
    }
    try {
      const parsed = JSON.parse(transcript) as unknown;
      const transcriptIssues = findSensitiveData(parsed, `${digestPath}.transcript`);
      for (const issue of transcriptIssues) {
        context.issues.push({ ...issue, message: `transcript contents ${issue.message}` });
      }
      context.issues.push(...findJsonSafetyIssues(parsed, `${digestPath}.transcript`));
    } catch {
      context.issues.push({ path: `${digestPath}.path`, message: "transcript contents must be valid JSON" });
    }
  }
};

const validateAssertionDetails = (details: unknown, gateId: string, path: string, issues: ManifestIssue[]) => {
  const record = exactRecord(details, path, ["assertionId", "passed"], issues);
  if (!record) return;
  if (record.assertionId !== gateId) issues.push({ path: `${path}.assertionId`, message: `must be ${gateId}` });
  if (record.passed !== true) issues.push({ path: `${path}.passed`, message: "must be true" });
};

const validateMachineAssertionDetails = (details: unknown, gateId: string, path: string, issues: ManifestIssue[]) => {
  const record = exactRecord(details, path, ["assertionId", "passed", "runner", "exitCode", "observationSha256"], issues);
  if (!record) return;
  if (record.assertionId !== gateId) issues.push({ path: `${path}.assertionId`, message: `must be ${gateId}` });
  if (record.passed !== true) issues.push({ path: `${path}.passed`, message: "must be true" });
  if (!isNonEmptyString(record.runner, 500)) issues.push({ path: `${path}.runner`, message: "must identify the executed test/browser runner" });
  if (record.exitCode !== 0) issues.push({ path: `${path}.exitCode`, message: "captured machine gate must exit zero" });
  if (!isSha256(record.observationSha256)) issues.push({ path: `${path}.observationSha256`, message: "must bind sanitized runner output" });
};

const validateReleaseCheckDetails = (
  details: unknown,
  gateId: string,
  identity: ReleaseIdentity,
  capturedAtUtc: unknown,
  path: string,
  issues: ManifestIssue[],
) => {
  if (gateId === "DEPLOYMENT_IDENTITY") {
    const record = exactRecord(details, path, [
      "checkId", "command", "exitCode", "observationSha256", "observedAtUtc", "sourceCommitSha", "deploymentId",
      "canonicalUrl", "previewMigrationIdentity", "productionMigrationIdentity", "sourceVerified", "reachable",
    ], issues);
    if (!record) return;
    if (record.checkId !== gateId) issues.push({ path: `${path}.checkId`, message: `must be ${gateId}` });
    if (record.command !== RELEASE_CHECK_COMMANDS.DEPLOYMENT_IDENTITY) issues.push({ path: `${path}.command`, message: "must name the canonical deployment metadata operation" });
    if (record.exitCode !== 0) issues.push({ path: `${path}.exitCode`, message: "deployment metadata operation must exit zero" });
    if (!isSha256(record.observationSha256)) issues.push({ path: `${path}.observationSha256`, message: "must bind captured deployment-provider output" });
    if (!isUtcTimestamp(record.observedAtUtc) || record.observedAtUtc !== capturedAtUtc) {
      issues.push({ path: `${path}.observedAtUtc`, message: "must match the dated UTC deployment artifact capture" });
    }
    if (record.sourceCommitSha !== identity.sourceCommitSha) issues.push({ path: `${path}.sourceCommitSha`, message: "must match release source SHA" });
    if (record.deploymentId !== identity.deploymentId) issues.push({ path: `${path}.deploymentId`, message: "must match release deployment ID" });
    if (record.canonicalUrl !== identity.deployedUrl) issues.push({ path: `${path}.canonicalUrl`, message: "must match canonical release URL" });
    if (record.previewMigrationIdentity !== identity.migrationIdentity || record.productionMigrationIdentity !== identity.migrationIdentity) {
      issues.push({ path, message: "preview and production must share the exact release migration identity" });
    }
    if (record.sourceVerified !== true) issues.push({ path: `${path}.sourceVerified`, message: "must be true" });
    if (record.reachable !== true) issues.push({ path: `${path}.reachable`, message: "canonical deployment must be observed reachable" });
    return;
  }
  const isAdvisor = gateId === "PREVIEW_SECURITY_ADVISOR" || gateId === "PREVIEW_PERFORMANCE_ADVISOR";
  const isSpelling = gateId === "SPELLING_MENU";
  const detailKeys = ["checkId", "passed", "command", "exitCode", "observationSha256", "environment",
    ...(isAdvisor ? ["advisor", "blockingFindingCount"] : []),
    ...(isSpelling ? ["menuSurface", "syntheticEventUsed"] : [])];
  const record = exactRecord(details, path, detailKeys, issues);
  if (!record) return;
  if (record.checkId !== gateId) issues.push({ path: `${path}.checkId`, message: `must be ${gateId}` });
  if (record.passed !== true) issues.push({ path: `${path}.passed`, message: "must be true" });
  if (record.command !== RELEASE_CHECK_COMMANDS[gateId as keyof typeof RELEASE_CHECK_COMMANDS]) {
    issues.push({ path: `${path}.command`, message: "must name the exact release operation for this gate" });
  }
  if (record.exitCode !== 0) issues.push({ path: `${path}.exitCode`, message: "captured operation must exit zero" });
  if (!isSha256(record.observationSha256)) issues.push({ path: `${path}.observationSha256`, message: "must bind sanitized captured operation output" });
  const expectedEnvironment = gateId.startsWith("PREVIEW_") ? "PREVIEW" : gateId === "SPELLING_MENU" ? "SUPPORTED_CLIENT" : "SOURCE";
  if (record.environment !== expectedEnvironment) issues.push({ path: `${path}.environment`, message: `must be ${expectedEnvironment}` });
  if (isAdvisor) {
    const expectedAdvisor = gateId === "PREVIEW_SECURITY_ADVISOR" ? "SECURITY" : "PERFORMANCE";
    if (record.advisor !== expectedAdvisor) issues.push({ path: `${path}.advisor`, message: `must be ${expectedAdvisor}` });
    if (record.blockingFindingCount !== 0) issues.push({ path: `${path}.blockingFindingCount`, message: "advisor evidence must have zero blocking findings" });
  }
  if (isSpelling) {
    if (record.menuSurface !== "REAL_PLATFORM_SPELLING_MENU") issues.push({ path: `${path}.menuSurface`, message: "must capture the real platform spelling menu" });
    if (record.syntheticEventUsed !== false) issues.push({ path: `${path}.syntheticEventUsed`, message: "synthetic contextmenu evidence cannot satisfy the spelling gate" });
  }
};

const validateRehearsalDetails = (
  details: unknown,
  gateId: string,
  path: string,
  context: ValidationContext,
  ownArtifactPath?: string,
  parentCapturedAtUtc?: unknown,
) => {
  if (gateId === "R01") {
    const record = exactRecord(details, path, ["rehearsals"], context.issues);
    if (!record || !Array.isArray(record.rehearsals)) {
      context.issues.push({ path: `${path}.rehearsals`, message: "must contain five canonical native rehearsals" });
      return;
    }
    if (record.rehearsals.length !== 5) context.issues.push({ path: `${path}.rehearsals`, message: "must contain exactly five rehearsals" });
    const runIds = new Set<string>();
    const resetIds = new Set<string>();
    const starts = new Set<string>();
    let previousCompletedAt = Number.NEGATIVE_INFINITY;
    for (const [index, item] of record.rehearsals.entries()) {
      const itemPath = `${path}.rehearsals[${index}]`;
      const rehearsal = exactRecord(item, itemPath, [
        "runId", "resetId", "resetAtUtc", "startedAtUtc", "completedAtUtc", "canonicalNative", "resetVerified",
        "manualRepairCount", "finalSnapshotSha256", "nativeRehearsalRef", "resetEvidenceRef", "finalStateRef",
      ], context.issues);
      if (!rehearsal) continue;
      for (const [key, set] of [["runId", runIds], ["resetId", resetIds], ["startedAtUtc", starts]] as const) {
        if (!isNonEmptyString(rehearsal[key], 200) || set.has(rehearsal[key])) {
          context.issues.push({ path: `${itemPath}.${key}`, message: "must be non-empty and unique across the five rehearsals" });
        } else set.add(rehearsal[key]);
      }
      const resetAt = isUtcTimestamp(rehearsal.resetAtUtc) ? Date.parse(rehearsal.resetAtUtc) : Number.NaN;
      const startedAt = isUtcTimestamp(rehearsal.startedAtUtc) ? Date.parse(rehearsal.startedAtUtc) : Number.NaN;
      const completedAt = isUtcTimestamp(rehearsal.completedAtUtc) ? Date.parse(rehearsal.completedAtUtc) : Number.NaN;
      if (!Number.isFinite(resetAt) || !Number.isFinite(startedAt) || !Number.isFinite(completedAt)
        || resetAt > startedAt || startedAt >= completedAt || resetAt < previousCompletedAt || startedAt < previousCompletedAt) {
        context.issues.push({ path: itemPath, message: "must have consecutive, non-overlapping UTC reset/start/completion timestamps" });
      }
      if (!isUtcTimestamp(parentCapturedAtUtc) || (Number.isFinite(completedAt) && completedAt > Date.parse(parentCapturedAtUtc))) {
        context.issues.push({ path: `${itemPath}.completedAtUtc`, message: "nested rehearsal evidence must not postdate its parent R01 capture" });
      }
      if (Number.isFinite(completedAt)) previousCompletedAt = completedAt;
      if (rehearsal.canonicalNative !== true || rehearsal.resetVerified !== true) {
        context.issues.push({ path: itemPath, message: "must be canonical-native and independently reset-verified" });
      }
      if (rehearsal.manualRepairCount !== 0) context.issues.push({ path: `${itemPath}.manualRepairCount`, message: "must be zero" });
      if (!isSha256(rehearsal.finalSnapshotSha256)) context.issues.push({ path: `${itemPath}.finalSnapshotSha256`, message: "must be a SHA-256 final-state digest" });

      const ordinal = String(index + 1).padStart(2, "0");
      validateEvidenceArtifact(
        rehearsal.resetEvidenceRef,
        `${itemPath}.resetEvidenceRef`,
        "rehearsal",
        `R01_RESET_${ordinal}`,
        "AUTOMATED",
        { evidenceClass: "AUTOMATED", capturedAtUtc: rehearsal.resetAtUtc },
        context,
        (proof, proofPath) => {
          const reset = exactRecord(proof, proofPath, ["resetId", "resetVerified", "resetMethod"], context.issues);
          if (!reset) return;
          if (reset.resetId !== rehearsal.resetId) context.issues.push({ path: `${proofPath}.resetId`, message: "must match rehearsal resetId" });
          if (reset.resetVerified !== true) context.issues.push({ path: `${proofPath}.resetVerified`, message: "must be true" });
          if (reset.resetMethod !== "SERVICE_ROLE_CLI") {
            context.issues.push({ path: `${proofPath}.resetMethod`, message: "canonical rehearsal reset must use the private service-role CLI" });
          }
        },
      );
      validateEvidenceArtifact(
        rehearsal.nativeRehearsalRef,
        `${itemPath}.nativeRehearsalRef`,
        "rehearsal",
        `R01_RUN_${ordinal}`,
        "NATIVE_CAPTURED",
        { evidenceClass: "NATIVE_CAPTURED", capturedAtUtc: rehearsal.completedAtUtc },
        context,
        (proof, proofPath) => {
          const native = exactRecord(proof, proofPath, ["runId", "resetId", "canonicalNative", "manualRepairCount", "finalSnapshotSha256"], context.issues);
          if (!native) return;
          for (const key of ["runId", "resetId", "canonicalNative", "manualRepairCount", "finalSnapshotSha256"] as const) {
            if (native[key] !== rehearsal[key]) context.issues.push({ path: `${proofPath}.${key}`, message: "must exactly match the rehearsal summary" });
          }
        },
      );
      validateEvidenceArtifact(
        rehearsal.finalStateRef,
        `${itemPath}.finalStateRef`,
        "rehearsal",
        `R01_FINAL_${ordinal}`,
        "NATIVE_CAPTURED",
        { evidenceClass: "NATIVE_CAPTURED", capturedAtUtc: rehearsal.completedAtUtc },
        context,
        (proof, proofPath) => {
          const finalState = exactRecord(proof, proofPath, ["runId", "authoritativeStateVerified", "finalSnapshotSha256", "snapshot"], context.issues);
          if (!finalState) return;
          if (finalState.runId !== rehearsal.runId) context.issues.push({ path: `${proofPath}.runId`, message: "must match rehearsal runId" });
          if (finalState.authoritativeStateVerified !== true) context.issues.push({ path: `${proofPath}.authoritativeStateVerified`, message: "must be true" });
          if (!isRecord(finalState.snapshot) || finalState.finalSnapshotSha256 !== rehearsal.finalSnapshotSha256
            || finalState.finalSnapshotSha256 !== sha256CanonicalJson(finalState.snapshot)) {
            context.issues.push({ path: `${proofPath}.finalSnapshotSha256`, message: "must bind the canonical authoritative final-state snapshot" });
          }
        },
      );
    }
    return;
  }
  if (gateId === "R02") {
    const record = exactRecord(details, path, ["firstNativeActionMs", "narratedDurationMs", "passed"], context.issues);
    if (!record) return;
    if (!isNonNegativeInteger(record.firstNativeActionMs) || record.firstNativeActionMs > 45_000) {
      context.issues.push({ path: `${path}.firstNativeActionMs`, message: "must be at most 45000" });
    }
    if (!isNonNegativeInteger(record.narratedDurationMs) || record.narratedDurationMs > 160_000) {
      context.issues.push({ path: `${path}.narratedDurationMs`, message: "must be at most 160000" });
    }
    if (record.passed !== true) context.issues.push({ path: `${path}.passed`, message: "must be true" });
    return;
  }
  if (gateId === "R03") {
    const record = exactRecord(details, path, ["claims"], context.issues);
    if (!record || !Array.isArray(record.claims) || record.claims.length === 0) {
      context.issues.push({ path: `${path}.claims`, message: "must contain at least one SHA-bound claim" });
      return;
    }
    for (const [index, item] of record.claims.entries()) {
      const claimPath = `${path}.claims[${index}]`;
      const claim = exactRecord(item, claimPath, ["claim", "evidencePaths", "limitation"], context.issues);
      if (!claim) continue;
      if (!isNonEmptyString(claim.claim, 500)) context.issues.push({ path: `${claimPath}.claim`, message: "must be non-empty" });
      if (typeof claim.limitation !== "boolean") context.issues.push({ path: `${claimPath}.limitation`, message: "must be boolean" });
      if (!Array.isArray(claim.evidencePaths) || claim.evidencePaths.length === 0 || claim.evidencePaths.some((entry) => !isCanonicalRelativeJsonPath(entry))) {
        context.issues.push({ path: `${claimPath}.evidencePaths`, message: "must cite canonical v3 evidence paths" });
      } else {
        const eligibleRefs = new Set(context.artifactPaths);
        if (ownArtifactPath) eligibleRefs.delete(ownArtifactPath);
        context.deferredClaimCitations.push({ path: `${claimPath}.evidencePaths`, refs: claim.evidencePaths, eligibleRefs });
      }
    }
    return;
  }
  validateAssertionDetails(details, gateId, path, context.issues);
};

const validateJudgeDetails = (details: unknown, judge: UnknownRecord, path: string, issues: ManifestIssue[]) => {
  const record = exactRecord(details, path, ["evaluatorId", "criterion", "score", "citations", "strongestGap", "mustFix"], issues);
  if (!record) return;
  for (const key of ["evaluatorId", "criterion", "score", "strongestGap", "mustFix"] as const) {
    if (record[key] !== judge[key]) issues.push({ path: `${path}.${key}`, message: "must exactly match the judge manifest row" });
  }
  if (canonicalJson(record.citations) !== canonicalJson(judge.citations)) issues.push({ path: `${path}.citations`, message: "must exactly match judge citations" });
};

const validatePublicDetails = (details: unknown, publicPackage: UnknownRecord, identity: ReleaseIdentity, path: string, issues: ManifestIssue[]) => {
  const record = exactRecord(details, path, ["repositoryHeadSha", "migrationIdentity", "canonicalUrl", "observations"], issues);
  if (!record) return;
  if (record.repositoryHeadSha !== identity.sourceCommitSha) issues.push({ path: `${path}.repositoryHeadSha`, message: "must match source SHA" });
  if (record.migrationIdentity !== identity.migrationIdentity) issues.push({ path: `${path}.migrationIdentity`, message: "must match release migration" });
  if (record.canonicalUrl !== identity.deployedUrl) issues.push({ path: `${path}.canonicalUrl`, message: "must match canonical deployment" });
  const fields = ["repositoryUrl", "licenseUrl", "videoUrl", "devpostUrl"] as const;
  if (!Array.isArray(record.observations) || record.observations.length !== fields.length) {
    issues.push({ path: `${path}.observations`, message: "must contain one dated reachability/content observation per public field" });
    return;
  }
  for (const [index, value] of record.observations.entries()) {
    const observationPath = `${path}.observations[${index}]`;
    const observation = exactRecord(value, observationPath, [
      "field", "url", "observedAtUtc", "reachable", "contentVerified", "mentionsSourceCommitSha", "contentSha256",
    ], issues);
    if (!observation) continue;
    const field = fields[index];
    if (observation.field !== field) issues.push({ path: `${observationPath}.field`, message: `must be ${field}` });
    if (observation.url !== publicPackage[field]) issues.push({ path: `${observationPath}.url`, message: "must match public package URL" });
    if (!isUtcTimestamp(observation.observedAtUtc)
      || observation.observedAtUtc !== publicPackage.capturedAtUtc
      || (isUtcTimestamp(identity.recordedAtUtc) && Date.parse(String(observation.observedAtUtc)) > Date.parse(identity.recordedAtUtc))) {
      issues.push({ path: `${observationPath}.observedAtUtc`, message: "must match the public artifact capture time and not postdate the final manifest" });
    }
    if (observation.reachable !== true || observation.contentVerified !== true || observation.mentionsSourceCommitSha !== true) {
      issues.push({ path: observationPath, message: "must record reachable, content-verified, exact-source-SHA public evidence" });
    }
    if (!isSha256(observation.contentSha256)) issues.push({ path: `${observationPath}.contentSha256`, message: "must bind the observed public content bytes" });
  }
};

const validateEvidenceArtifact = (
  refValue: unknown,
  refPath: string,
  kind: ArtifactKind,
  gateId: string,
  expectedClass: EvidenceClass,
  row: UnknownRecord,
  context: ValidationContext,
  detailsValidator?: (details: unknown, detailsPath: string, absolutePath: string, relativePath: string) => void,
) => {
  const ref = validateArtifactRef(refValue, refPath, kind, context);
  if (!ref) return;
  const path = `${refPath}.artifact`;
  const artifact = exactRecord(ref.parsed, path, ARTIFACT_KEYS, context.issues);
  if (!artifact) return;
  if (artifact.schemaVersion !== EVIDENCE_SCHEMA_VERSION) context.issues.push({ path: `${path}.schemaVersion`, message: `must be ${EVIDENCE_SCHEMA_VERSION}` });
  if (artifact.fixtureVersion !== RELEASE_CONTRACT_VERSION) context.issues.push({ path: `${path}.fixtureVersion`, message: `must be ${RELEASE_CONTRACT_VERSION}` });
  if (artifact.gateId !== gateId) context.issues.push({ path: `${path}.gateId`, message: `must be ${gateId}` });
  if (artifact.status !== "PASS") context.issues.push({ path: `${path}.status`, message: "referenced release evidence must be PASS" });
  if (artifact.evidenceClass !== expectedClass || artifact.evidenceClass !== row.evidenceClass) {
    context.issues.push({ path: `${path}.evidenceClass`, message: `must be exact ${expectedClass} evidence` });
  }
  for (const [key, expected] of [
    ["sourceCommitSha", context.identity.sourceCommitSha], ["deployedUrl", context.identity.deployedUrl],
    ["deploymentId", context.identity.deploymentId], ["migrationIdentity", context.identity.migrationIdentity],
  ] as const) if (artifact[key] !== expected) context.issues.push({ path: `${path}.${key}`, message: "must match exact release identity" });
  if (artifact.capturedAtUtc !== row.capturedAtUtc || !isUtcTimestamp(artifact.capturedAtUtc)) {
    context.issues.push({ path: `${path}.capturedAtUtc`, message: "must be a UTC timestamp matching manifest row" });
  } else {
    const timestamp = Date.parse(artifact.capturedAtUtc);
    context.allCaptureTimes.push(timestamp);
    if (artifact.evidenceClass === "NATIVE_CAPTURED") context.nativeCaptureTimes.push(timestamp);
    if (kind === "judge") context.judgeCaptureTimes.push(timestamp);
    if (kind === "release-check" && gateId === "DEPLOYMENT_IDENTITY") context.deploymentCaptureTimes.push(timestamp);
  }
  if (!isNonNegativeInteger(artifact.durationMs)) context.issues.push({ path: `${path}.durationMs`, message: "must be a non-negative integer" });
  const surface = exactRecord(artifact.surface, `${path}.surface`, ARTIFACT_SURFACE_KEYS, context.issues);
  if (surface) {
    for (const key of ARTIFACT_SURFACE_KEYS) validateNullableText(surface[key], `${path}.surface.${key}`, context.issues, 200);
    if (kind === "browser") for (const key of SUPPORTED_SURFACE_KEYS) {
      if (!isNonEmptyString(surface[key], 200)) context.issues.push({ path: `${path}.surface.${key}`, message: "browser evidence must record the observed client/browser and exact version" });
    }
    if (kind === "release-check" && gateId === "SPELLING_MENU") for (const key of SUPPORTED_SURFACE_KEYS) {
      if (!context.identity.supportedSurface || surface[key] !== context.identity.supportedSurface[key]) {
        context.issues.push({ path: `${path}.surface.${key}`, message: "spelling-menu capture must match the supported release client/browser and version" });
      }
    }
    if (["native", "rehearsal", "trajectory", "ablation"].includes(kind)) for (const key of SUPPORTED_SURFACE_KEYS) {
      if (!context.identity.supportedSurface || surface[key] !== context.identity.supportedSurface[key]) {
        context.issues.push({ path: `${path}.surface.${key}`, message: "must match supported release client/browser and version" });
      }
    }
  }
  if (!isSha256(artifact.payloadSha256) || artifact.payloadSha256 !== sha256CanonicalJson(artifact.details)) {
    context.issues.push({ path: `${path}.payloadSha256`, message: "must match canonical SHA-256 of details" });
  }
  detailsValidator?.(artifact.details, `${path}.details`, ref.absolutePath, ref.relativePath);
};

const validateCommonEvidenceFields = (
  record: UnknownRecord,
  path: string,
  expectedPassClasses: readonly EvidenceClass[],
  kind: ArtifactKind,
  gateId: string,
  context: ValidationContext,
  detailsValidator?: (details: unknown, detailsPath: string, absolutePath: string, relativePath: string) => void,
) => {
  if (record.status !== "PASS" && record.status !== "PENDING") context.issues.push({ path: `${path}.status`, message: "must be PASS or PENDING" });
  if (!EVIDENCE_CLASSES.includes(record.evidenceClass as EvidenceClass)) context.issues.push({ path: `${path}.evidenceClass`, message: "must use an exact EVALS.md evidence class" });
  validateNullableSha(record.sourceCommitSha, `${path}.sourceCommitSha`, context.issues);
  validateNullableDeploymentUrl(record.deployedUrl, `${path}.deployedUrl`, context.issues);
  validateNullableTimestamp(record.capturedAtUtc, `${path}.capturedAtUtc`, context.issues);
  if (!Array.isArray(record.artifactRefs)) context.issues.push({ path: `${path}.artifactRefs`, message: "must be an array" });
  if (record.status === "PENDING") {
    context.blockers.push({ path: `${path}.status`, message: "PENDING evidence blocks release" });
    if (record.evidenceClass !== "PENDING" || record.sourceCommitSha !== null || record.deployedUrl !== null || record.capturedAtUtc !== null
      || !Array.isArray(record.artifactRefs) || record.artifactRefs.length !== 0) {
      context.issues.push({ path, message: "PENDING requires class PENDING, null row identity/timestamp, and no artifact references" });
    }
    return;
  }
  if (record.status !== "PASS") return;
  if (!expectedPassClasses.includes(record.evidenceClass as EvidenceClass)) context.issues.push({ path: `${path}.evidenceClass`, message: `PASS requires ${expectedPassClasses.join(" or ")}` });
  if (record.sourceCommitSha !== context.identity.sourceCommitSha || !isSourceCommitSha(record.sourceCommitSha)) context.issues.push({ path: `${path}.sourceCommitSha`, message: "PASS must bind exact release source SHA" });
  if (record.deployedUrl !== context.identity.deployedUrl || !isDeploymentUrl(record.deployedUrl)) context.issues.push({ path: `${path}.deployedUrl`, message: "PASS must bind exact canonical deployment URL" });
  if (!isUtcTimestamp(record.capturedAtUtc)) context.issues.push({ path: `${path}.capturedAtUtc`, message: "PASS requires UTC capture timestamp" });
  if (!Array.isArray(record.artifactRefs) || record.artifactRefs.length !== 1) {
    context.issues.push({ path: `${path}.artifactRefs`, message: "PASS requires exactly one content-addressed evidence artifact" });
    return;
  }
  if (expectedPassClasses.includes(record.evidenceClass as EvidenceClass)) {
    validateEvidenceArtifact(record.artifactRefs[0], `${path}.artifactRefs[0]`, kind, gateId, record.evidenceClass as EvidenceClass, record, context, detailsValidator);
  }
};

const validateRows = (
  value: unknown,
  path: string,
  expectedIds: readonly string[],
  classes: readonly EvidenceClass[] | ((id: string) => readonly EvidenceClass[]),
  kind: ArtifactKind,
  context: ValidationContext,
  detailFor?: (id: string, row: UnknownRecord) => (details: unknown, detailsPath: string, absolutePath: string, relativePath: string) => void,
) => {
  if (!Array.isArray(value)) { context.issues.push({ path, message: "must be an array" }); return; }
  if (value.length !== expectedIds.length) context.issues.push({ path, message: `must enumerate exactly ${expectedIds.join(", ")}` });
  for (let index = 0; index < value.length; index += 1) {
    const rowPath = `${path}[${index}]`;
    const row = exactRecord(value[index], rowPath, EVIDENCE_ROW_KEYS, context.issues);
    if (!row) continue;
    const expectedId = expectedIds[index];
    if (row.id !== expectedId) context.issues.push({ path: `${rowPath}.id`, message: `must be ${expectedId ?? "absent"} in this position` });
    if (!expectedId) continue;
    validateCommonEvidenceFields(row, rowPath, typeof classes === "function" ? classes(expectedId) : classes, kind, expectedId, context, detailFor?.(expectedId, row));
  }
};

const validateReleaseIdentity = (value: unknown, context: ValidationContext): ReleaseIdentity => {
  const path = "$.releaseIdentity";
  const record = exactRecord(value, path, RELEASE_IDENTITY_KEYS, context.issues);
  if (!record) return { sourceCommitSha: undefined, deployedUrl: undefined, deploymentId: undefined, migrationIdentity: undefined, recordedAtUtc: undefined };
  validateNullableSha(record.sourceCommitSha, `${path}.sourceCommitSha`, context.issues);
  validateNullableDeploymentUrl(record.deployedUrl, `${path}.deployedUrl`, context.issues);
  validateNullableText(record.deploymentId, `${path}.deploymentId`, context.issues, 200);
  validateNullableText(record.migrationIdentity, `${path}.migrationIdentity`, context.issues, 1_000);
  validateNullableTimestamp(record.recordedAtUtc, `${path}.recordedAtUtc`, context.issues);
  const surface = exactRecord(record.supportedSurface, `${path}.supportedSurface`, SUPPORTED_SURFACE_KEYS, context.issues);
  if (surface) for (const key of SUPPORTED_SURFACE_KEYS) validateNullableText(surface[key], `${path}.supportedSurface.${key}`, context.issues, 200);
  const complete = isSourceCommitSha(record.sourceCommitSha) && isDeploymentUrl(record.deployedUrl)
    && isNonEmptyString(record.deploymentId, 200) && isNonEmptyString(record.migrationIdentity, 1_000)
    && isUtcTimestamp(record.recordedAtUtc) && Boolean(surface && SUPPORTED_SURFACE_KEYS.every((key) => isNonEmptyString(surface[key], 200)));
  if (!complete) context.blockers.push({ path, message: "release identity is incomplete" });
  return {
    sourceCommitSha: record.sourceCommitSha,
    deployedUrl: record.deployedUrl,
    deploymentId: record.deploymentId,
    migrationIdentity: record.migrationIdentity,
    recordedAtUtc: record.recordedAtUtc,
    supportedSurface: surface,
  };
};

const validateAgentGate = (value: unknown, path: string, kind: "trajectory" | "ablation", context: ValidationContext) => {
  const record = exactRecord(value, path, GATE_KEYS, context.issues);
  if (!record) return;
  validateCommonEvidenceFields(record, path, ["NATIVE_CAPTURED"], kind, kind === "trajectory" ? "TRAJECTORY" : "ABLATION", context,
    (details, detailsPath, absolutePath) => {
      const detailRecord = exactRecord(details, detailsPath, ["runs", "transcriptDigests"], context.issues);
      if (!detailRecord) return;
      validateTranscriptDigests(detailRecord, absolutePath, kind, detailsPath, context);
      if (!Array.isArray(detailRecord.runs)) return;
      for (const [index, value] of detailRecord.runs.entries()) {
        const runPath = `${detailsPath}.runs[${index}]`;
        if (!isRecord(value)) continue;
        for (const [key, expected] of [
          ["commitSha", context.identity.sourceCommitSha],
          ["deployedUrl", context.identity.deployedUrl],
          ["deploymentId", context.identity.deploymentId],
          ["databaseMigrationIdentity", context.identity.migrationIdentity],
          ["browserSurface", expectedBrowserSurface(context.identity)],
        ] as const) {
          if (value[key] !== expected) context.issues.push({ path: `${runPath}.${key}`, message: "must match exact release identity and supported surface" });
        }
        if (!isUtcTimestamp(value.startedAtUtc) || !isNonNegativeInteger(value.durationMs)) {
          context.issues.push({ path: runPath, message: "must carry a UTC start and non-negative duration for proof ordering" });
        } else if (!isUtcTimestamp(record.capturedAtUtc)
          || Date.parse(value.startedAtUtc) + value.durationMs > Date.parse(record.capturedAtUtc)) {
          context.issues.push({ path: runPath, message: "nested agent run must complete before its ledger artifact is captured" });
        }
      }
      let output: AgentLedgerValidationOutput;
      try {
        output = (context.options.validateAgentLedger ?? defaultAgentLedgerValidation)({
          kind,
          runs: detailRecord.runs,
          transcriptRoot: dirname(absolutePath),
          sourceCommitSha: String(context.identity.sourceCommitSha),
          deployedUrl: String(context.identity.deployedUrl),
          deploymentId: String(context.identity.deploymentId),
          migrationIdentity: String(context.identity.migrationIdentity),
          browserSurface: expectedBrowserSurface(context.identity),
        });
      } catch {
        context.issues.push({ path: detailsPath, message: `hardened v3 ${kind} ledger validator threw and failed closed` });
        return;
      }
      if (!isRecord(output) || typeof output.ok !== "boolean" || !Array.isArray(output.issues)) {
        context.issues.push({ path: detailsPath, message: `hardened v3 ${kind} ledger validator returned an invalid result` });
        return;
      }
      context.issues.push(...output.issues.map((issue) => ({ ...issue, path: `${detailsPath}${issue.path.slice(1)}` })));
      if (!output.ok) context.issues.push({ path: detailsPath, message: `hardened v3 ${kind} ledger validation did not pass` });
    });
};

const validateJudges = (value: unknown, context: ValidationContext) => {
  const path = "$.judges";
  if (!Array.isArray(value)) { context.issues.push({ path, message: "must enumerate J01-J04" }); return; }
  if (value.length !== JUDGE_IDS.length) context.issues.push({ path, message: `must enumerate exactly ${JUDGE_IDS.join(", ")}` });
  const evaluatorIds = new Set<string>();
  const scores: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const judgePath = `${path}[${index}]`;
    const judge = exactRecord(value[index], judgePath, JUDGE_KEYS, context.issues);
    if (!judge) continue;
    const id = JUDGE_IDS[index];
    if (judge.id !== id) context.issues.push({ path: `${judgePath}.id`, message: `must be ${id ?? "absent"}` });
    if (!id) continue;
    if (judge.criterion !== JUDGE_CRITERIA[id]) context.issues.push({ path: `${judgePath}.criterion`, message: `must be ${JUDGE_CRITERIA[id]}` });
    if (judge.score !== null && (typeof judge.score !== "number" || !Number.isFinite(judge.score) || judge.score < 0 || judge.score > 5)) {
      context.issues.push({ path: `${judgePath}.score`, message: "must be null or a score from 0 to 5" });
    }
    validateNullableText(judge.evaluatorId, `${judgePath}.evaluatorId`, context.issues, 200);
    validateNullableText(judge.strongestGap, `${judgePath}.strongestGap`, context.issues, 1_000);
    if (judge.mustFix !== null) context.issues.push({ path: `${judgePath}.mustFix`, message: "final release judge must have no remaining must-fix" });
    if (!Array.isArray(judge.citations) || judge.citations.some((citation) => !isCanonicalRelativeJsonPath(citation))) {
      context.issues.push({ path: `${judgePath}.citations`, message: "must be canonical v3 evidence-path citations" });
    }
    const eligibleCitations = new Set(context.artifactPaths);
    validateCommonEvidenceFields(judge, judgePath, ["MANUAL_CAPTURED"], "judge", id, context,
      (details, detailsPath) => validateJudgeDetails(details, judge, detailsPath, context.issues));
    if (judge.status !== "PASS") continue;
    const evaluatorIdentity = isNonEmptyString(judge.evaluatorId, 200) ? judge.evaluatorId.toLocaleLowerCase("en-US") : undefined;
    if (!evaluatorIdentity || evaluatorIds.has(evaluatorIdentity)) {
      context.issues.push({ path: `${judgePath}.evaluatorId`, message: "must identify a unique independent evaluator" });
    } else evaluatorIds.add(evaluatorIdentity);
    if (!Array.isArray(judge.citations) || judge.citations.length === 0 || judge.citations.some((citation) => !eligibleCitations.has(citation))) {
      context.issues.push({ path: `${judgePath}.citations`, message: "must cite at least one eligible earlier release artifact and cannot self-cite" });
    }
    if (!isNonEmptyString(judge.strongestGap, 1_000)) context.issues.push({ path: `${judgePath}.strongestGap`, message: "PASS requires strongest gap" });
    if (typeof judge.score !== "number" || judge.score < JUDGE_THRESHOLDS[id]) {
      context.issues.push({ path: `${judgePath}.score`, message: `${id} does not meet its release threshold` });
    } else scores.push(judge.score);
    if (isUtcTimestamp(judge.capturedAtUtc) && context.nativeCaptureTimes.length > 0
      && Date.parse(judge.capturedAtUtc) <= Math.max(...context.nativeCaptureTimes)) {
      context.issues.push({ path: `${judgePath}.capturedAtUtc`, message: "judge evidence must be captured after all native evidence" });
    }
  }
  if (scores.length === 4 && scores.reduce((sum, score) => sum + score, 0) < 19) context.issues.push({ path, message: "judge total is below 19/20" });
};

const validatePublicPackage = (value: unknown, context: ValidationContext) => {
  const path = "$.publicPackage";
  const record = exactRecord(value, path, PUBLIC_PACKAGE_KEYS, context.issues);
  if (!record) return;
  for (const key of ["repositoryUrl", "licenseUrl", "videoUrl", "devpostUrl"] as const) {
    if (record[key] !== null && !isHttpsUrl(record[key], key === "videoUrl")) context.issues.push({ path: `${path}.${key}`, message: "must be null or a credential-free HTTPS URL" });
  }
  validateNullableText(record.licenseSpdx, `${path}.licenseSpdx`, context.issues, 50);
  validateCommonEvidenceFields(record, path, ["MANUAL_CAPTURED"], "public", "PUBLIC_PACKAGE", context,
    (details, detailsPath) => validatePublicDetails(details, record, context.identity, detailsPath, context.issues));
  if (record.status !== "PASS") return;
  const urls = [record.repositoryUrl, record.licenseUrl, record.videoUrl, record.devpostUrl];
  if (urls.some((url) => !isHttpsUrl(url, true)) || new Set(urls).size !== urls.length || urls.includes(context.identity.deployedUrl)) {
    context.issues.push({ path, message: "public repository, license, video, and Devpost URLs must be present, field-distinct, and distinct from deployment" });
  }
  if (!OPEN_SOURCE_LICENSES.has(String(record.licenseSpdx))) context.issues.push({ path: `${path}.licenseSpdx`, message: "must be an allowed open-source SPDX identifier" });
  const sha = String(context.identity.sourceCommitSha);
  const repository = isHttpsUrl(record.repositoryUrl) ? new URL(record.repositoryUrl) : undefined;
  const license = isHttpsUrl(record.licenseUrl) ? new URL(record.licenseUrl) : undefined;
  const video = isHttpsUrl(record.videoUrl, true) ? new URL(record.videoUrl) : undefined;
  const devpost = isHttpsUrl(record.devpostUrl) ? new URL(record.devpostUrl) : undefined;
  const repositoryMatch = repository?.hostname.toLowerCase() === "github.com"
    ? /^\/([^/]+)\/([^/]+)\/(?:tree|commit)\/([0-9a-f]{40})\/?$/.exec(repository.pathname)
    : null;
  if (!repositoryMatch || repositoryMatch[3] !== sha) {
    context.issues.push({ path: `${path}.repositoryUrl`, message: "must be an exact github.com repository tree/commit URL pinned to sourceCommitSha" });
  }
  const licenseMatch = license?.hostname.toLowerCase() === "github.com"
    ? /^\/([^/]+)\/([^/]+)\/blob\/([0-9a-f]{40})\/(?:.*\/)?((?:LICENSE|COPYING)(?:\.[A-Za-z0-9]+)?)$/i.exec(license.pathname)
    : null;
  if (!licenseMatch || licenseMatch[3].toLowerCase() !== sha
    || !repositoryMatch || licenseMatch[1].toLowerCase() !== repositoryMatch[1].toLowerCase()
    || licenseMatch[2].toLowerCase() !== repositoryMatch[2].toLowerCase()) {
    context.issues.push({ path: `${path}.licenseUrl`, message: "must point to LICENSE/COPYING in the same GitHub repository at sourceCommitSha" });
  }
  if (!video || !/(?:^|\.)(?:youtube\.com|youtu\.be)$/i.test(video.hostname)) {
    context.issues.push({ path: `${path}.videoUrl`, message: "must identify the publicly visible YouTube demo required by the hackathon rules" });
  }
  if (!devpost || !/(?:^|\.)devpost\.com$/i.test(devpost.hostname)) {
    context.issues.push({ path: `${path}.devpostUrl`, message: "must identify public Devpost entry" });
  }
  if (isUtcTimestamp(record.capturedAtUtc) && context.judgeCaptureTimes.length > 0
    && Date.parse(record.capturedAtUtc) <= Math.max(...context.judgeCaptureTimes)) {
    context.issues.push({ path: `${path}.capturedAtUtc`, message: "public video/submission observations must be captured after all judge evidence" });
  }
};

const validateGitState = (releaseStatus: unknown, identity: ReleaseIdentity, context: ValidationContext) => {
  if (releaseStatus !== "PASS") return;
  const git = context.options.gitState;
  if (!git) { context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "authoritative clean Git state is required for PASS" }); return; }
  if (git.headSha !== identity.sourceCommitSha) context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "must exactly match checked-out Git HEAD" });
  if (!git.indexClean || !git.worktreeClean || !git.untrackedClean) context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "source checkout index, worktree, and untracked state must all be clean" });
  if (!git.requiredSourceFilesAtHead || !git.pendingTemplateAtHead) {
    context.issues.push({ path: "$.releaseIdentity.sourceCommitSha", message: "source HEAD must track validator code and an all-PENDING v3 template; final evidence remains external/content-addressed" });
  }
};

/** Validate a complete content-addressed v3 release asset bundle against one clean source commit. */
export function validateReleaseManifest(value: unknown, options: ManifestValidationOptions = {}): ReleaseManifestValidation {
  const issues = [...findJsonSafetyIssues(value), ...findSensitiveData(value)];
  const blockers: ManifestIssue[] = [];
  const context: ValidationContext = {
    options,
    identity: { sourceCommitSha: undefined, deployedUrl: undefined, deploymentId: undefined, migrationIdentity: undefined, recordedAtUtc: undefined },
    issues,
    blockers,
    claimedPaths: new Set(),
    artifactPaths: new Set(),
    nativeCaptureTimes: [],
    judgeCaptureTimes: [],
    deploymentCaptureTimes: [],
    allCaptureTimes: [],
    deferredClaimCitations: [],
  };
  const manifest = exactRecord(value, "$", TOP_LEVEL_KEYS, issues);
  if (!manifest) return { ok: false, schemaValid: false, releaseReady: false, status: "INVALID", issues, blockers, referencedArtifacts: [] };
  if (manifest.contractVersion !== RELEASE_CONTRACT_VERSION) issues.push({ path: "$.contractVersion", message: `must be exactly ${RELEASE_CONTRACT_VERSION}; v1.2 evidence is superseded` });
  if (manifest.releaseStatus !== "PASS" && manifest.releaseStatus !== "PENDING") issues.push({ path: "$.releaseStatus", message: "must be PASS or PENDING" });
  else if (manifest.releaseStatus === "PENDING") blockers.push({ path: "$.releaseStatus", message: "PENDING blocks release" });
  context.identity = validateReleaseIdentity(manifest.releaseIdentity, context);

  validateRows(manifest.domainEvidence, "$.domainEvidence", DOMAIN_ROW_IDS, ["AUTOMATED"], "domain", context,
    (id) => (details, path) => validateMachineAssertionDetails(details, id, path, issues));
  validateRows(manifest.browserEvidence, "$.browserEvidence", BROWSER_ROW_IDS, ["AUTOMATED", "ADAPTER_CAPTURED"], "browser", context,
    (id) => (details, path) => validateMachineAssertionDetails(details, id, path, issues));
  validateRows(manifest.releaseChecks, "$.releaseChecks", RELEASE_CHECK_IDS,
    (id) => [RELEASE_CHECK_PASS_CLASSES[id as keyof typeof RELEASE_CHECK_PASS_CLASSES] ?? "PENDING"], "release-check", context,
    (id, row) => (details, path) => validateReleaseCheckDetails(details, id, context.identity, row.capturedAtUtc, path, issues));
  validateRows(manifest.nativeEvidence, "$.nativeEvidence", NATIVE_ROW_IDS, ["NATIVE_CAPTURED"], "native", context,
    (id) => (details, path) => validateAssertionDetails(details, id, path, issues));
  validateAgentGate(manifest.trajectoryLedger, "$.trajectoryLedger", "trajectory", context);
  validateAgentGate(manifest.ablation, "$.ablation", "ablation", context);
  validateRows(manifest.visualEvidence, "$.visualEvidence", VISUAL_ROW_IDS, ["MANUAL_CAPTURED"], "visual", context,
    (id) => (details, path) => validateAssertionDetails(details, id, path, issues));
  validateRows(manifest.rehearsalEvidence, "$.rehearsalEvidence", REHEARSAL_ROW_IDS,
    (id) => [REHEARSAL_PASS_CLASSES[id as keyof typeof REHEARSAL_PASS_CLASSES] ?? "PENDING"], "rehearsal", context,
    (id, row) => (details, path, _absolutePath, relativePath) => validateRehearsalDetails(details, id, path, context, relativePath, row.capturedAtUtc));
  validateJudges(manifest.judges, context);
  validatePublicPackage(manifest.publicPackage, context);

  for (const citation of context.deferredClaimCitations) {
    if (citation.refs.some((ref) => !citation.eligibleRefs.has(ref))) issues.push({ path: citation.path, message: "every claim must cite an eligible earlier validated artifact and cannot self-cite" });
  }
  if (isUtcTimestamp(context.identity.recordedAtUtc) && context.allCaptureTimes.length > 0
    && Date.parse(context.identity.recordedAtUtc) < Math.max(...context.allCaptureTimes)) {
    issues.push({ path: "$.releaseIdentity.recordedAtUtc", message: "final manifest timestamp must not predate referenced evidence" });
  }
  if (context.deploymentCaptureTimes.length > 0 && context.nativeCaptureTimes.length > 0
    && Math.min(...context.nativeCaptureTimes) <= Math.max(...context.deploymentCaptureTimes)) {
    issues.push({ path: "$.releaseIdentity.recordedAtUtc", message: "native evidence must be captured after deployment identity is observed" });
  }
  validateGitState(manifest.releaseStatus, context.identity, context);
  if (manifest.releaseStatus === "PASS" && blockers.length > 0) issues.push({ path: "$.releaseStatus", message: "cannot claim PASS while any gate remains pending" });
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
