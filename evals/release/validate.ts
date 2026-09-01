import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const manifestModulePath = "./manifest.ts";
const { RELEASE_CONTRACT_VERSION, sha256Text, validateReleaseManifest } = await import(manifestModulePath) as typeof import("./manifest");
import type { GitState, ManifestValidationOptions } from "./manifest";

export const DEFAULT_MANIFEST = "evals/release/document-v3/manifest.json";
export const EXECUTING_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_SOURCE_FILES = [
  "evals/release/manifest.ts",
  "evals/release/validate.ts",
  DEFAULT_MANIFEST,
  "evals/agent/ledger.ts",
  "evals/agent/score.ts",
  "evals/agent/scenarios.json",
] as const;

type CliIo = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

export type GitInspection = {
  sourceRoot: string;
  state: GitState;
};

export type ReleaseCliDependencies = {
  cwd?: string;
  inspectGit?: (cwd: string) => GitInspection;
  read?: (path: string) => Buffer;
  validationOptions?: Omit<ManifestValidationOptions, "manifestPath" | "gitState">;
};

const processIo: CliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

const writeJson = (write: (value: string) => void, value: unknown) => write(`${JSON.stringify(value, null, 2)}\n`);

const runGit = (cwd: string, args: string[]) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
};

const gitSucceeds = (cwd: string, args: string[]) => runGit(cwd, args).status === 0;

const isPendingGate = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const gate = value as Record<string, unknown>;
  return gate.status === "PENDING" && gate.evidenceClass === "PENDING" && gate.sourceCommitSha === null
    && gate.deployedUrl === null && gate.capturedAtUtc === null && Array.isArray(gate.artifactRefs) && gate.artifactRefs.length === 0;
};

export const isAllPendingTemplate = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;
  const identity = manifest.releaseIdentity;
  if (typeof identity !== "object" || identity === null || Array.isArray(identity)) return false;
  const releaseIdentity = identity as Record<string, unknown>;
  const surface = releaseIdentity.supportedSurface;
  const identityPending = releaseIdentity.sourceCommitSha === null && releaseIdentity.deployedUrl === null
    && releaseIdentity.deploymentId === null && releaseIdentity.migrationIdentity === null && releaseIdentity.recordedAtUtc === null
    && typeof surface === "object" && surface !== null && !Array.isArray(surface)
    && ["client", "clientVersion", "browser", "browserVersion"].every((key) => (surface as Record<string, unknown>)[key] === null);
  const rowSections = ["domainEvidence", "browserEvidence", "releaseChecks", "nativeEvidence", "rehearsalEvidence", "visualEvidence", "judges"];
  const rowsPending = rowSections.every((section) => Array.isArray(manifest[section]) && (manifest[section] as unknown[]).every(isPendingGate));
  const judges = Array.isArray(manifest.judges) && manifest.judges.every((value) => {
    const judge = value as Record<string, unknown>;
    return judge.score === null && judge.evaluatorId === null && Array.isArray(judge.citations) && judge.citations.length === 0
      && judge.strongestGap === null && judge.mustFix === null;
  });
  const publicPackage = manifest.publicPackage as Record<string, unknown> | undefined;
  const publicPending = isPendingGate(publicPackage) && Boolean(publicPackage
    && ["repositoryUrl", "licenseSpdx", "licenseUrl", "videoUrl", "devpostUrl"].every((key) => publicPackage[key] === null));
  return manifest.releaseStatus === "PENDING" && identityPending && rowsPending && judges
    && isPendingGate(manifest.trajectoryLedger) && isPendingGate(manifest.ablation) && publicPending;
};

export const inspectSourceGit = (cwd: string): GitInspection => {
  const rootResult = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (rootResult.status !== 0 || !rootResult.stdout) throw new Error(rootResult.stderr || "not inside a Git checkout");
  const sourceRoot = resolve(rootResult.stdout);
  const headResult = runGit(sourceRoot, ["rev-parse", "HEAD"]);
  if (headResult.status !== 0 || !/^[0-9a-f]{40}$/.test(headResult.stdout)) throw new Error("could not resolve exact Git HEAD");

  const requiredSourceFilesAtHead = REQUIRED_SOURCE_FILES.every((path) =>
    runGit(sourceRoot, ["cat-file", "-t", `HEAD:${path}`]).stdout === "blob");
  let pendingTemplateAtHead = false;
  const templateResult = runGit(sourceRoot, ["show", `HEAD:${DEFAULT_MANIFEST}`]);
  if (templateResult.status === 0) {
    try {
      const parsed = JSON.parse(templateResult.stdout) as unknown;
      const checked = validateReleaseManifest(parsed, { assetRoot: sourceRoot });
      pendingTemplateAtHead = checked.schemaValid && checked.status === "PENDING" && isAllPendingTemplate(parsed);
    } catch {
      pendingTemplateAtHead = false;
    }
  }

  const untracked = runGit(sourceRoot, ["ls-files", "--others", "--exclude-standard"]);
  return {
    sourceRoot,
    state: {
      headSha: headResult.stdout,
      indexClean: gitSucceeds(sourceRoot, ["diff", "--cached", "--quiet", "--exit-code"]),
      worktreeClean: gitSucceeds(sourceRoot, ["diff", "--quiet", "--exit-code"]),
      untrackedClean: untracked.status === 0 && untracked.stdout.length === 0,
      requiredSourceFilesAtHead,
      pendingTemplateAtHead,
    },
  };
};

const deriveAssetRoot = (manifestPath: string, fallback: string) => {
  const suffix = join("evals", "release", "document-v3", "manifest.json");
  const normalized = resolve(manifestPath);
  if (!normalized.endsWith(`${sep}${suffix}`)) return fallback;
  return normalized.slice(0, -(suffix.length + 1));
};

export function runReleaseManifestCli(
  args: string[],
  io: CliIo = processIo,
  dependencies: ReleaseCliDependencies = {},
): number {
  if (args.length > 1 || args[0]?.startsWith("--")) {
    writeJson(io.stderr, {
      contractVersion: RELEASE_CONTRACT_VERSION,
      status: "INVALID",
      ok: false,
      issues: [{ path: "$", message: "Usage: node evals/release/validate.ts [release-bundle/evals/release/document-v3/manifest.json]" }],
    });
    return 2;
  }

  const cwd = resolve(dependencies.cwd ?? process.cwd());
  const input = args[0] ?? DEFAULT_MANIFEST;
  const manifestPath = resolve(cwd, input);
  let contents: Buffer;
  let value: unknown;
  try {
    contents = (dependencies.read ?? readFileSync)(manifestPath);
    value = JSON.parse(contents.toString("utf8")) as unknown;
  } catch (error) {
    writeJson(io.stderr, {
      contractVersion: RELEASE_CONTRACT_VERSION,
      status: "INVALID",
      ok: false,
      input,
      issues: [{ path: "$", message: `could not read valid JSON: ${error instanceof Error ? error.message : String(error)}` }],
    });
    return 2;
  }

  const claimsPass = typeof value === "object" && value !== null && !Array.isArray(value)
    && (value as Record<string, unknown>).releaseStatus === "PASS";
  let git: GitInspection | undefined;
  if (claimsPass) {
    try { git = (dependencies.inspectGit ?? inspectSourceGit)(EXECUTING_SOURCE_ROOT); }
    catch (error) {
      writeJson(io.stderr, {
        contractVersion: RELEASE_CONTRACT_VERSION,
        status: "INVALID",
        ok: false,
        input,
        manifestSha256: sha256Text(contents),
        issues: [{ path: "$.releaseIdentity.sourceCommitSha", message: `could not verify source Git state: ${error instanceof Error ? error.message : String(error)}` }],
      });
      return 2;
    }
  }

  const configuredAssetRoot = dependencies.validationOptions?.assetRoot;
  const fallbackRoot = git?.sourceRoot ?? cwd;
  const assetRoot = configuredAssetRoot ?? deriveAssetRoot(manifestPath, fallbackRoot);
  let validation;
  try {
    validation = validateReleaseManifest(value, {
      ...dependencies.validationOptions,
      assetRoot,
      manifestPath,
      gitState: git?.state,
    });
  } catch {
    writeJson(io.stderr, {
      contractVersion: RELEASE_CONTRACT_VERSION,
      status: "INVALID",
      ok: false,
      input,
      manifestSha256: sha256Text(contents),
      issues: [{ path: "$", message: "release validation failed closed while inspecting untrusted evidence" }],
    });
    return 2;
  }
  writeJson(io.stdout, {
    contractVersion: RELEASE_CONTRACT_VERSION,
    status: validation.status,
    ok: validation.ok,
    schemaValid: validation.schemaValid,
    releaseReady: validation.releaseReady,
    input,
    sourceRoot: git ? relative(cwd, git.sourceRoot) || "." : null,
    assetRoot: relative(cwd, assetRoot) || ".",
    manifestSha256: sha256Text(contents),
    issues: validation.issues,
    blockers: validation.blockers,
    referencedArtifacts: validation.referencedArtifacts,
  });
  return validation.releaseReady ? 0 : 1;
}

const isDirectExecution = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) process.exitCode = runReleaseManifestCli(process.argv.slice(2));
