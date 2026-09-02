import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  main,
  runResetRepositoryHeroV4,
  validateResetResult,
} from "./reset-repository-hero-v4.mjs";

const RESET_TOKEN = "preview-reset-secret-that-must-never-appear";
const SHARE_TOKEN = "s".repeat(43);
const NOW = Date.parse("2026-09-01T00:00:00.000Z");
const EXPIRES_AT = "2026-09-08T00:00:00.000Z";
const BOOTSTRAPS = {
  priyaBootstrapPath: "p".repeat(96),
  nadiaBootstrapPath: "n".repeat(96),
  leoBootstrapPath: "l".repeat(96),
  samBootstrapPath: "a".repeat(96),
};

function resetResult(overrides = {}) {
  const paths = Object.fromEntries(Object.entries(BOOTSTRAPS).map(([key, value]) => [
    key,
    `/issue/${SHARE_TOKEN}#ratiflow-bootstrap=${value}`,
  ]));
  return {
    ok: true,
    data: {
      fixtureVersion: "repo-document-v4.postmortem.v1",
      shareToken: SHARE_TOKEN,
      ...paths,
      expiresAt: EXPIRES_AT,
      revision: 1,
      activityVersion: 4,
      ...overrides,
    },
  };
}

const cleanupDirectories = [];
after(async () => {
  await Promise.all(cleanupDirectories.map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

test("posts an authenticated empty reset request and stores only a mode-0600 secret file", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ratiflow-v4-reset-test-"));
  cleanupDirectories.push(temporaryRoot);
  const calls = [];
  let output = "";
  const expected = resetResult();

  const outcome = await runResetRepositoryHeroV4({
    environment: {
      RATIFLOW_BASE_URL: "https://preview.example.com/",
      RATIFLOW_EVAL_RESET_TOKEN: RESET_TOKEN,
    },
    request: async (...args) => {
      calls.push(args);
      return { ok: true, status: 201, json: async () => expected };
    },
    now: NOW,
    temporaryRoot,
    stdout: { write: (chunk) => { output += chunk; } },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://preview.example.com/api/repository-v4/eval/reset");
  assert.deepEqual(calls[0][1], {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${RESET_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    redirect: "error",
  });
  assert.equal((await stat(outcome.secretFilePath)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(outcome.secretFilePath, "utf8")), expected);
  assert.match(output, /Canonical repository postmortem fixture reset successfully\./u);
  assert.match(output, /Revision 1 · activity version 4/u);
  assert.match(output, new RegExp(`Secret result file: ${outcome.secretFilePath}`, "u"));
  for (const secret of [
    RESET_TOKEN,
    SHARE_TOKEN,
    ...Object.values(BOOTSTRAPS),
    ...Object.values(expected.data).filter((value) => typeof value === "string" && value.startsWith("/issue/")),
  ]) {
    assert.equal(output.includes(secret), false);
  }
});

test("accepts loopback HTTP but rejects unsafe origins and invalid configuration", async () => {
  assert.equal(validateResetResult(resetResult()), true);

  const calls = [];
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ratiflow-v4-loopback-test-"));
  cleanupDirectories.push(temporaryRoot);
  await runResetRepositoryHeroV4({
    environment: {
      RATIFLOW_BASE_URL: "http://127.0.0.1:3000",
      RATIFLOW_EVAL_RESET_TOKEN: RESET_TOKEN,
    },
    request: async (...args) => {
      calls.push(args);
      return { ok: true, status: 201, json: async () => resetResult() };
    },
    temporaryRoot,
    now: NOW,
    stdout: { write: () => undefined },
  });
  assert.equal(calls[0][0], "http://127.0.0.1:3000/api/repository-v4/eval/reset");

  let stderr = "";
  const exitCode = await main({
    environment: {
      RATIFLOW_BASE_URL: "http://example.com",
      RATIFLOW_EVAL_RESET_TOKEN: RESET_TOKEN,
    },
    request: async () => { throw new Error("must not be called"); },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  assert.equal(exitCode, 1);
  assert.match(stderr, /must be HTTPS/u);
  assert.equal(stderr.includes(RESET_TOKEN), false);
});

test("fails closed on HTTP, network, and schema errors without reading or printing secrets", async () => {
  const environment = {
    RATIFLOW_BASE_URL: "https://preview.example.com",
    RATIFLOW_EVAL_RESET_TOKEN: RESET_TOKEN,
  };
  const secretBody = `server leaked ${SHARE_TOKEN} ${RESET_TOKEN}`;
  let rejectedBodyRead = false;
  const cases = [
    {
      request: async () => ({
        ok: false,
        status: 404,
        json: async () => {
          rejectedBodyRead = true;
          throw new Error(secretBody);
        },
      }),
    },
    { request: async () => { throw new Error(secretBody); } },
    {
      request: async () => ({
        ok: true,
        status: 201,
        json: async () => resetResult({ activityVersion: 5, secretBody }),
      }),
    },
  ];

  for (const entry of cases) {
    let stdout = "";
    let stderr = "";
    const exitCode = await main({
      environment,
      request: entry.request,
      now: NOW,
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    });
    assert.equal(exitCode, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /No response content or credentials were printed\./u);
    assert.equal(stderr.includes(secretBody), false);
    assert.equal(stderr.includes(SHARE_TOKEN), false);
    assert.equal(stderr.includes(RESET_TOKEN), false);
  }
  assert.equal(rejectedBodyRead, false);
});

test("rejects extra keys, duplicate or malformed paths, stale expiries, and wrong counters", () => {
  assert.equal(validateResetResult({ ...resetResult(), extra: true }), false);
  assert.equal(validateResetResult(resetResult({ expiresAt: "2020-01-01T00:00:00Z" })), false);
  assert.equal(validateResetResult(resetResult({ expiresAt: "2026-10-02T00:00:00Z" }), NOW), false);
  assert.equal(validateResetResult(resetResult({
    samBootstrapPath: resetResult().data.priyaBootstrapPath,
  })), false);
  assert.equal(validateResetResult(resetResult({
    priyaBootstrapPath: `/document/${SHARE_TOKEN}#ratiflow-bootstrap=${BOOTSTRAPS.priyaBootstrapPath}`,
  })), false);
  assert.equal(validateResetResult(resetResult({
    priyaBootstrapPath: `/issue/${SHARE_TOKEN}#ratiflow-bootstrap=${"p".repeat(65_537)}`,
  })), false);
  assert.equal(validateResetResult(resetResult({ revision: 2 })), false);
});
