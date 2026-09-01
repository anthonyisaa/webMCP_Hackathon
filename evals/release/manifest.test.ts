import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BROWSER_ROW_IDS,
  DOMAIN_ROW_IDS,
  NATIVE_ROW_IDS,
  RELEASE_CHECK_IDS,
  findSensitiveData,
  sha256CanonicalJson,
  sha256Text,
  validateReleaseManifest,
} from "./manifest";
import { DEFAULT_MANIFEST, EXECUTING_SOURCE_ROOT, inspectSourceGit, isAllPendingTemplate, runReleaseManifestCli } from "./validate";
import {
  DEPLOYED_URL,
  NATIVE_AT,
  SOURCE_SHA,
  array,
  cleanGitState,
  clone,
  createPassBundle,
  object,
  rewriteArtifact,
  type PassBundle,
} from "./test-support";

const TEMPLATE_PATH = fileURLToPath(new URL("./document-v3/manifest.json", import.meta.url));
const template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8")) as unknown;
const bundles: PassBundle[] = [];
const temporaryRoots: string[] = [];
const bundle = () => {
  const value = createPassBundle();
  bundles.push(value);
  return value;
};
afterEach(() => {
  bundles.splice(0).forEach((value) => value.cleanup());
  temporaryRoots.splice(0).forEach((value) => rmSync(value, { recursive: true, force: true }));
});

const sectionRow = (value: PassBundle, section: string, index: number) => object(array(value.manifest[section])[index]);
const firstRef = (row: Record<string, unknown>) => object(array(row.artifactRefs)[0]);

describe("content-addressed v3 release manifest", () => {
  it("keeps the checked-in exact-row template structurally valid and PENDING", () => {
    const result = validateReleaseManifest(clone(template));

    expect(result).toMatchObject({ schemaValid: true, releaseReady: false, status: "PENDING", issues: [] });
    expect(array(object(template).domainEvidence).map((row) => object(row).id)).toEqual(DOMAIN_ROW_IDS);
    expect(array(object(template).browserEvidence).map((row) => object(row).id)).toEqual(BROWSER_ROW_IDS);
    expect(array(object(template).releaseChecks).map((row) => object(row).id)).toEqual(RELEASE_CHECK_IDS);
    expect(array(object(template).nativeEvidence).map((row) => object(row).id)).toEqual(NATIVE_ROW_IDS);
    expect(isAllPendingTemplate(template)).toBe(true);
    const mixed = clone(template);
    object(array(object(mixed).domainEvidence)[0]).status = "PASS";
    expect(isAllPendingTemplate(mixed)).toBe(false);
  });

  it("accepts a complete external release bundle bound to one clean source commit", () => {
    const value = bundle();
    const result = validateReleaseManifest(value.manifest, value.options);

    expect(result).toMatchObject({ ok: true, schemaValid: true, releaseReady: true, status: "PASS", issues: [], blockers: [] });
    expect(value.agentCalls.map((call) => [call.kind, call.runs.length])).toEqual([["trajectory", 35], ["ablation", 70]]);
    expect(result.referencedArtifacts.length).toBeGreaterThan(170);
  });

  it("requires every D01-D24, B01-B16, verify/build, preview DB/security/advisor, deployment, and spelling gate", () => {
    const value = bundle();
    array(value.manifest.domainEvidence).pop();
    array(value.manifest.browserEvidence).splice(3, 1);
    array(value.manifest.releaseChecks).pop();

    const result = validateReleaseManifest(value.manifest, value.options);
    expect(result.releaseReady).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "$.domainEvidence",
      "$.browserEvidence",
      "$.releaseChecks",
    ]));
  });

  it("requires captured runner output, exact release operations, and observed browser versions", () => {
    const value = bundle();
    rewriteArtifact(value, firstRef(sectionRow(value, "domainEvidence", 0)), (artifact) => {
      object(artifact.details).runner = null;
      object(artifact.details).observationSha256 = "not-a-digest";
    });
    rewriteArtifact(value, firstRef(sectionRow(value, "browserEvidence", 0)), (artifact) => {
      object(artifact.surface).clientVersion = null;
      object(artifact.surface).browserVersion = null;
    });
    rewriteArtifact(value, firstRef(sectionRow(value, "releaseChecks", 0)), (artifact) => {
      object(artifact.details).command = "echo pass";
      object(artifact.details).exitCode = 1;
    });
    rewriteArtifact(value, firstRef(sectionRow(value, "releaseChecks", RELEASE_CHECK_IDS.indexOf("PREVIEW_SECURITY_ADVISOR"))), (artifact) => {
      object(artifact.details).blockingFindingCount = 1;
    });
    rewriteArtifact(value, firstRef(sectionRow(value, "releaseChecks", RELEASE_CHECK_IDS.indexOf("SPELLING_MENU"))), (artifact) => {
      object(artifact.details).syntheticEventUsed = true;
    });
    const messages = validateReleaseManifest(value.manifest, value.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("executed test/browser runner");
    expect(messages).toContain("bind sanitized runner output");
    expect(messages).toContain("observed client/browser and exact version");
    expect(messages).toContain("exact release operation");
    expect(messages).toContain("exit zero");
    expect(messages).toContain("zero blocking findings");
    expect(messages).toContain("cannot satisfy the spelling gate");
  });

  it("rejects PENDING rows that claim captured evidence or release identity", () => {
    const value = clone(template);
    const row = object(array(object(value).nativeEvidence)[0]);
    row.evidenceClass = "NATIVE_CAPTURED";
    row.sourceCommitSha = SOURCE_SHA;

    expect(validateReleaseManifest(value).issues.some((issue) => issue.path === "$.nativeEvidence[0]")).toBe(true);
  });

  it("requires existing canonical regular files in the correct document-v3 type root", () => {
    const missing = bundle();
    const missingRef = firstRef(sectionRow(missing, "nativeEvidence", 0));
    unlinkSync(join(missing.root, String(missingRef.path)));
    expect(validateReleaseManifest(missing.manifest, missing.options).issues.some((issue) => issue.message.includes("missing or unreadable"))).toBe(true);

    const wrongRoot = bundle();
    firstRef(sectionRow(wrongRoot, "nativeEvidence", 0)).path = "evals/results/protocol/hero-v1.2.json";
    expect(validateReleaseManifest(wrongRoot.manifest, wrongRoot.options).issues.some((issue) => issue.message.includes("canonical repo-relative"))).toBe(true);

    const latest = bundle();
    firstRef(sectionRow(latest, "nativeEvidence", 0)).path = "evals/native/document-v3/latest/n01.json";
    expect(validateReleaseManifest(latest.manifest, latest.options).issues.some((issue) => issue.message.includes("latest"))).toBe(true);

    for (const filename of ["latest.json", "legacy.json"]) {
      const alias = bundle();
      firstRef(sectionRow(alias, "nativeEvidence", 0)).path = `evals/native/document-v3/${filename}`;
      expect(validateReleaseManifest(alias.manifest, alias.options).issues.some((issue) => issue.message.includes("latest, legacy"))).toBe(true);
    }
  });

  it("rejects symlink artifacts, self/traversal references, and reuse across gates", () => {
    const linked = bundle();
    const linkedRef = firstRef(sectionRow(linked, "nativeEvidence", 0));
    const linkedPath = join(linked.root, String(linkedRef.path));
    const targetPath = join(linked.root, String(firstRef(sectionRow(linked, "nativeEvidence", 1)).path));
    unlinkSync(linkedPath);
    symlinkSync(targetPath, linkedPath);
    expect(validateReleaseManifest(linked.manifest, linked.options).issues.some((issue) => issue.message.includes("symlink"))).toBe(true);

    const traversal = bundle();
    firstRef(sectionRow(traversal, "nativeEvidence", 0)).path = "evals/native/document-v3/../release/document-v3/manifest.json";
    expect(validateReleaseManifest(traversal.manifest, traversal.options).schemaValid).toBe(false);

    const duplicate = bundle();
    sectionRow(duplicate, "nativeEvidence", 1).artifactRefs = clone(sectionRow(duplicate, "nativeEvidence", 0).artifactRefs);
    expect(validateReleaseManifest(duplicate.manifest, duplicate.options).issues.some((issue) => issue.message.includes("unique across every release gate"))).toBe(true);
  });

  it("verifies the full-file digest and strict artifact header/payload schema", () => {
    const digest = bundle();
    firstRef(sectionRow(digest, "nativeEvidence", 0)).sha256 = "f".repeat(64);
    expect(validateReleaseManifest(digest.manifest, digest.options).issues.some((issue) => issue.message.includes("file bytes"))).toBe(true);

    const strict = bundle();
    const row = sectionRow(strict, "nativeEvidence", 0);
    rewriteArtifact(strict, firstRef(row), (artifact) => {
      artifact.status = "PENDING";
      artifact.evidenceClass = "ADAPTER_CAPTURED";
      artifact.fixtureVersion = "hero-v1.2";
      artifact.sourceCommitSha = "f".repeat(40);
      artifact.capturedAtUtc = "2026-08-01T00:00:00.000Z";
      artifact.payloadSha256 = "0".repeat(64);
    }, false);
    const messages = validateReleaseManifest(strict.manifest, strict.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("must be PASS");
    expect(messages).toContain("exact NATIVE_CAPTURED");
    expect(messages).toContain("document-hero-v3");
    expect(messages).toContain("exact release identity");
    expect(messages).toContain("canonical SHA-256");
  });

  it("scans referenced artifact and transcript contents for actual v3 bearer formats", () => {
    const artifactBundle = bundle();
    const row = sectionRow(artifactBundle, "nativeEvidence", 0);
    rewriteArtifact(artifactBundle, firstRef(row), (artifact) => {
      object(artifact.details).observation = "ratiflow-bootstrap=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDE";
    });
    expect(validateReleaseManifest(artifactBundle.manifest, artifactBundle.options).issues.some((issue) => issue.message.includes("bearer"))).toBe(true);

    const transcriptBundle = bundle();
    const gate = object(transcriptBundle.manifest.trajectoryLedger);
    const artifactRef = firstRef(gate);
    const artifactPath = join(transcriptBundle.root, String(artifactRef.path));
    const artifact = object(JSON.parse(readFileSync(artifactPath, "utf8")));
    const details = object(artifact.details);
    const digest = object(array(details.transcriptDigests)[0]);
    const transcriptPath = join(artifactPath, "..", String(digest.path));
    writeFileSync(transcriptPath, JSON.stringify({ leaked: "/document/abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890" }));
    digest.sha256 = "0".repeat(64);
    artifact.payloadSha256 = sha256CanonicalJson(details);
    const contents = `${JSON.stringify(artifact, null, 2)}\n`;
    writeFileSync(artifactPath, contents);
    artifactRef.sha256 = sha256Text(contents);
    expect(validateReleaseManifest(transcriptBundle.manifest, transcriptBundle.options).issues.some((issue) => issue.message.includes("transcript contents"))).toBe(true);
  });

  it("recognizes bootstrap, fragment, share-path, signed-query, and base64url bundle secrets", () => {
    const samples = [
      "ratiflow-bootstrap=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDE",
      "https://example.test/document/abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890",
      "https://example.test/share/abcdefghijklmnopqrstuvwxyz123456",
      "https://example.test/evidence.json?sig=abcdef1234567890",
      "https://example.test/evidence.json?share=abcdef1234567890",
      "#AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDE",
      "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDE",
    ];
    for (const sample of samples) expect(findSensitiveData({ value: sample })).not.toEqual([]);
    expect(findSensitiveData({ tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } })).toEqual([]);
    expect(findSensitiveData({ tokenUsage: { token: "secret-value" } })).not.toEqual([]);
  });

  it("runs the hardened 35-run trajectory and 70-run ablation validators and fails on either result", () => {
    const value = bundle();
    const calls: string[] = [];
    const result = validateReleaseManifest(value.manifest, {
      ...value.options,
      validateAgentLedger: (input) => {
        calls.push(input.kind);
        return input.kind === "trajectory" ? { ok: false, issues: [{ path: "$.runs", message: "bar failed" }] } : { ok: true, issues: [] };
      },
    });
    expect(calls).toEqual(["trajectory", "ablation"]);
    expect(result.issues.some((issue) => issue.message.includes("trajectory ledger validation"))).toBe(true);

    const throwing = bundle();
    expect(() => validateReleaseManifest(throwing.manifest, {
      ...throwing.options,
      validateAgentLedger: () => { throw new Error("untrusted validator failure"); },
    })).not.toThrow();
    expect(validateReleaseManifest(throwing.manifest, {
      ...throwing.options,
      validateAgentLedger: () => { throw new Error("untrusted validator failure"); },
    }).issues.some((issue) => issue.message.includes("threw and failed closed"))).toBe(true);

    const direct = bundle();
    const resultWithRealValidator = validateReleaseManifest(direct.manifest, {
      assetRoot: direct.root,
      manifestPath: direct.manifestPath,
      gitState: cleanGitState(),
    });
    expect(resultWithRealValidator.issues.some((issue) => issue.message.includes("hardened v3 trajectory ledger validation"))).toBe(true);
  });

  it("requires one digest per raw agent transcript and exact 35/70 run matrices", () => {
    const value = bundle();
    const gate = object(value.manifest.trajectoryLedger);
    const ref = firstRef(gate);
    rewriteArtifact(value, ref, (artifact) => {
      const details = object(artifact.details);
      array(details.runs).pop();
      array(details.transcriptDigests).pop();
    });
    expect(validateReleaseManifest(value.manifest, value.options).issues.some((issue) => issue.message.includes("exactly 35"))).toBe(true);

    const future = bundle();
    rewriteArtifact(future, firstRef(object(future.manifest.trajectoryLedger)), (artifact) => {
      object(array(object(artifact.details).runs)[0]).startedAtUtc = "2026-09-02T00:00:00.000Z";
    });
    expect(validateReleaseManifest(future.manifest, future.options).issues.some((issue) => issue.message.includes("complete before its ledger artifact"))).toBe(true);
  });

  it("requires five unique canonical native rehearsals with unique verified resets", () => {
    const value = bundle();
    const row = sectionRow(value, "rehearsalEvidence", 0);
    rewriteArtifact(value, firstRef(row), (artifact) => {
      const rehearsals = array(object(artifact.details).rehearsals);
      object(rehearsals[1]).runId = object(rehearsals[0]).runId;
      object(rehearsals[1]).resetId = object(rehearsals[0]).resetId;
      object(rehearsals[2]).canonicalNative = false;
      object(rehearsals[3]).manualRepairCount = 1;
    });
    const messages = validateReleaseManifest(value.manifest, value.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("unique across the five rehearsals");
    expect(messages).toContain("canonical-native");
    expect(messages).toContain("must be zero");
  });

  it("requires each R01 run/reset proof file and rejects overlapping or future nested evidence", () => {
    const value = bundle();
    const row = sectionRow(value, "rehearsalEvidence", 0);
    const parentPath = join(value.root, String(firstRef(row).path));
    const parent = object(JSON.parse(readFileSync(parentPath, "utf8")));
    const rehearsals = array(object(parent.details).rehearsals).map(object);
    const nestedRef = object(rehearsals[0].nativeRehearsalRef);
    unlinkSync(join(value.root, String(nestedRef.path)));
    rehearsals[1].startedAtUtc = rehearsals[0].startedAtUtc;
    rehearsals[4].completedAtUtc = "2026-09-01T09:20:00.000Z";
    parent.payloadSha256 = sha256CanonicalJson(parent.details);
    const contents = `${JSON.stringify(parent, null, 2)}\n`;
    writeFileSync(parentPath, contents);
    firstRef(row).sha256 = sha256Text(contents);

    const messages = validateReleaseManifest(value.manifest, value.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("missing or unreadable");
    expect(messages).toContain("consecutive, non-overlapping");
    expect(messages).toContain("must not postdate its parent R01 capture");
  });

  it("requires R03 and judges to cite eligible earlier artifacts rather than themselves", () => {
    const claimsBundle = bundle();
    const r03 = sectionRow(claimsBundle, "rehearsalEvidence", 2);
    const r03Path = String(firstRef(r03).path);
    rewriteArtifact(claimsBundle, firstRef(r03), (artifact) => {
      object(array(object(artifact.details).claims)[0]).evidencePaths = [r03Path];
    });
    expect(validateReleaseManifest(claimsBundle.manifest, claimsBundle.options).issues.some((issue) => issue.message.includes("cannot self-cite"))).toBe(true);

    const judgeBundle = bundle();
    const judge = object(array(judgeBundle.manifest.judges)[0]);
    const judgePath = String(firstRef(judge).path);
    judge.citations = [judgePath];
    rewriteArtifact(judgeBundle, firstRef(judge), (artifact) => { object(artifact.details).citations = [judgePath]; });
    expect(validateReleaseManifest(judgeBundle.manifest, judgeBundle.options).issues.some((issue) => issue.message.includes("cannot self-cite"))).toBe(true);
  });

  it("requires deployment metadata to bind source, canonical URL, deployment, and one preview/production migration", () => {
    const value = bundle();
    const row = sectionRow(value, "releaseChecks", RELEASE_CHECK_IDS.indexOf("DEPLOYMENT_IDENTITY"));
    rewriteArtifact(value, firstRef(row), (artifact) => {
      object(artifact.details).productionMigrationIdentity = "different_migration";
    });
    expect(validateReleaseManifest(value.manifest, value.options).issues.some((issue) => issue.message.includes("preview and production"))).toBe(true);
  });

  it("requires four independent judge artifacts, cited evidence, strongest gaps, no must-fix, and post-native timestamps", () => {
    const value = bundle();
    const judges = array(value.manifest.judges).map(object);
    judges[1].evaluatorId = judges[0].evaluatorId;
    judges[2].citations = [];
    judges[2].strongestGap = null;
    judges[3].mustFix = "Capture native evidence.";
    judges[0].capturedAtUtc = NATIVE_AT;
    for (const judge of judges) rewriteArtifact(value, firstRef(judge), (artifact) => {
      artifact.capturedAtUtc = judge.capturedAtUtc;
      Object.assign(object(artifact.details), {
        evaluatorId: judge.evaluatorId,
        citations: judge.citations,
        strongestGap: judge.strongestGap,
        mustFix: judge.mustFix,
      });
    });
    const messages = validateReleaseManifest(value.manifest, value.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("unique independent evaluator");
    expect(messages).toContain("eligible earlier release artifact");
    expect(messages).toContain("strongest gap");
    expect(messages).toContain("remaining must-fix");
    expect(messages).toContain("after all native evidence");
  });

  it("requires judges after trajectory, ablation, and R01 NATIVE_CAPTURED evidence", () => {
    for (const target of ["trajectory", "ablation", "r01"] as const) {
      const value = bundle();
      const row = target === "trajectory" ? object(value.manifest.trajectoryLedger)
        : target === "ablation" ? object(value.manifest.ablation)
        : sectionRow(value, "rehearsalEvidence", 0);
      row.capturedAtUtc = "2026-09-01T10:30:00.000Z";
      rewriteArtifact(value, firstRef(row), (artifact) => { artifact.capturedAtUtc = row.capturedAtUtc; });
      expect(validateReleaseManifest(value.manifest, value.options).issues.some((issue) => issue.message.includes("after all native evidence"))).toBe(true);
    }
  });

  it("requires field-specific, distinct, exact-SHA public URLs and dated verified observations", () => {
    const value = bundle();
    const publicPackage = object(value.manifest.publicPackage);
    publicPackage.repositoryUrl = "https://github.com/example/ratiflow";
    publicPackage.licenseSpdx = "Proprietary";
    publicPackage.videoUrl = publicPackage.devpostUrl;
    rewriteArtifact(value, firstRef(publicPackage), (artifact) => {
      const observations = array(object(artifact.details).observations).map(object);
      observations[0].url = publicPackage.repositoryUrl;
      observations[2].url = publicPackage.videoUrl;
      observations[3].reachable = false;
    });
    const messages = validateReleaseManifest(value.manifest, value.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("field-distinct");
    expect(messages).toContain("open-source SPDX");
    expect(messages).toContain("pinned to sourceCommitSha");
    expect(messages).toContain("reachable, content-verified");
  });

  it("fails closed on malformed/spoofed public URLs and unbound or future content observations", () => {
    const malformed = bundle();
    const malformedPublic = object(malformed.manifest.publicPackage);
    malformedPublic.repositoryUrl = "not a URL";
    malformedPublic.licenseUrl = "also not a URL";
    malformedPublic.devpostUrl = "still not a URL";
    expect(() => validateReleaseManifest(malformed.manifest, malformed.options)).not.toThrow();
    expect(validateReleaseManifest(malformed.manifest, malformed.options).status).toBe("INVALID");

    const spoofed = bundle();
    const spoofedPublic = object(spoofed.manifest.publicPackage);
    spoofedPublic.repositoryUrl = `https://attacker.example/example/ratiflow/tree/${SOURCE_SHA}`;
    spoofedPublic.licenseUrl = `https://github.com/another/repository/blob/${SOURCE_SHA}/LICENSE`;
    spoofedPublic.videoUrl = "https://attacker.example/video";
    rewriteArtifact(spoofed, firstRef(spoofedPublic), (artifact) => {
      const observations = array(object(artifact.details).observations).map(object);
      observations[0].url = spoofedPublic.repositoryUrl;
      observations[1].url = spoofedPublic.licenseUrl;
      observations[2].url = spoofedPublic.videoUrl;
      observations[2].observedAtUtc = "2026-09-02T00:00:00.000Z";
      observations[2].contentSha256 = "not-a-digest";
    });
    const messages = validateReleaseManifest(spoofed.manifest, spoofed.options).issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("exact github.com");
    expect(messages).toContain("same GitHub repository");
    expect(messages).toContain("publicly visible YouTube demo");
    expect(messages).toContain("not postdate the final manifest");
    expect(messages).toContain("observed public content bytes");
  });

  it("rejects Vimeo and Loom even when their public observations otherwise reconcile", () => {
    for (const videoUrl of [
      "https://vimeo.com/123456789",
      "https://www.loom.com/share/ratiflow-demo",
    ]) {
      const value = bundle();
      const publicPackage = object(value.manifest.publicPackage);
      publicPackage.videoUrl = videoUrl;
      rewriteArtifact(value, firstRef(publicPackage), (artifact) => {
        array(object(artifact.details).observations).map(object)[2].url = videoUrl;
      });
      const messages = validateReleaseManifest(value.manifest, value.options).issues
        .map((issue) => issue.message).join("\n");
      expect(messages).toContain("publicly visible YouTube demo");
    }
  });

  it("requires authoritative clean HEAD and tracked validator/PENDING-template source provenance only for PASS", () => {
    const missing = bundle();
    expect(validateReleaseManifest(missing.manifest, { ...missing.options, gitState: undefined }).issues.some((issue) => issue.message.includes("authoritative clean Git"))).toBe(true);

    const dirty = bundle();
    const result = validateReleaseManifest(dirty.manifest, {
      ...dirty.options,
      gitState: cleanGitState({ headSha: "f".repeat(40), indexClean: false, requiredSourceFilesAtHead: false }),
    });
    const messages = result.issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("checked-out Git HEAD");
    expect(messages).toContain("index, worktree, and untracked");
    expect(messages).toContain("all-PENDING v3 template");
  });

  it("rejects superseded v1.2 shapes and decision-demo deployment paths", () => {
    const legacy = { fixtureVersion: "hero-v1.2", status: "PASS", assertions: [] };
    expect(validateReleaseManifest(legacy).status).toBe("INVALID");

    const value = bundle();
    object(value.manifest.releaseIdentity).deployedUrl = `${DEPLOYED_URL}/decision-demo`;
    expect(validateReleaseManifest(value.manifest, value.options).issues.some((issue) => issue.path === "$.releaseIdentity.deployedUrl")).toBe(true);
  });
});

describe("release CLI", () => {
  it("defaults to the checked-in template and exits 1 while PENDING", () => {
    let stdout = "";
    const exitCode = runReleaseManifestCli([], { stdout: (value) => { stdout += value; }, stderr: () => undefined });
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({ input: DEFAULT_MANIFEST, status: "PENDING", releaseReady: false });
  });

  it("inspects a real clean Git source commit with blob-tracked validators and an all-PENDING template", () => {
    const root = mkdtempSync(join(tmpdir(), "ratiflow-release-git-"));
    temporaryRoots.push(root);
    const sourceFiles: Record<string, string> = {
      "evals/release/manifest.ts": "export {};\n",
      "evals/release/validate.ts": "export {};\n",
      "evals/agent/ledger.ts": "export {};\n",
      "evals/agent/score.ts": "export {};\n",
      "evals/agent/scenarios.json": "{}\n",
      [DEFAULT_MANIFEST]: `${JSON.stringify(template, null, 2)}\n`,
    };
    for (const [relativePath, contents] of Object.entries(sourceFiles)) {
      const absolutePath = join(root, relativePath);
      mkdirSync(join(absolutePath, ".."), { recursive: true });
      writeFileSync(absolutePath, contents);
    }
    expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(0);
    expect(spawnSync("git", ["add", "."], { cwd: root }).status).toBe(0);
    expect(spawnSync("git", ["-c", "user.name=Release Test", "-c", "user.email=release@example.test", "commit", "--quiet", "-m", "source"], { cwd: root }).status).toBe(0);

    expect(inspectSourceGit(root).state).toMatchObject({
      indexClean: true,
      worktreeClean: true,
      untrackedClean: true,
      requiredSourceFilesAtHead: true,
      pendingTemplateAtHead: true,
    });
    writeFileSync(join(root, "untracked.txt"), "dirty\n");
    expect(inspectSourceGit(root).state.untrackedClean).toBe(false);
  });

  it("uses injected clean Git source proof for an external immutable bundle and emits its manifest digest", () => {
    const value = bundle();
    let stdout = "";
    let inspectedRoot = "";
    const exitCode = runReleaseManifestCli([value.manifestPath], {
      stdout: (chunk) => { stdout += chunk; },
      stderr: () => undefined,
    }, {
      cwd: value.root,
      inspectGit: (root) => {
        inspectedRoot = root;
        return { sourceRoot: "/clean/source", state: cleanGitState() };
      },
      validationOptions: {
        assetRoot: value.root,
        validateAgentLedger: value.options.validateAgentLedger,
      },
    });
    expect(exitCode).toBe(0);
    expect(inspectedRoot).toBe(EXECUTING_SOURCE_ROOT);
    expect(JSON.parse(stdout)).toMatchObject({ status: "PASS", releaseReady: true });
    expect(JSON.parse(stdout).manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
