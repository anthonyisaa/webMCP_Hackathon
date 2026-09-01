import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  main,
  runResetDocumentHeroV3,
  validateResetResult,
} from "./reset-document-hero-v3.mjs";

const SERVICE_ROLE_KEY = "service-role-secret-that-must-never-appear";
const SHARE_TOKEN = "a".repeat(64);
const MAYA_BOOTSTRAP = "m".repeat(96);
const JORDAN_BOOTSTRAP = "j".repeat(96);
const EXPIRES_AT = "2099-09-01T00:00:00.000Z";

function resetResult(overrides = {}) {
  return {
    ok: true,
    data: {
      shareToken: SHARE_TOKEN,
      mayaBootstrapPath: `/document/${SHARE_TOKEN}#ratiflow-bootstrap=${MAYA_BOOTSTRAP}`,
      jordanBootstrapPath: `/document/${SHARE_TOKEN}#ratiflow-bootstrap=${JORDAN_BOOTSTRAP}`,
      expiresAt: EXPIRES_AT,
      revision: 1,
      activityVersion: 1,
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

test("posts an authenticated empty RPC request and stores only a mode-0600 secret file", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ratiflow-reset-test-"));
  cleanupDirectories.push(temporaryRoot);
  const calls = [];
  let output = "";
  const expected = resetResult();

  const outcome = await runResetDocumentHeroV3({
    environment: {
      RATIFLOW_SUPABASE_URL: "https://example.supabase.co/",
      RATIFLOW_SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    },
    request: async (...args) => {
      calls.push(args);
      return {
        ok: true,
        status: 200,
        json: async () => expected,
      };
    },
    now: Date.parse("2026-09-01T00:00:00.000Z"),
    temporaryRoot,
    stdout: { write: (chunk) => { output += chunk; } },
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0][0],
    "https://example.supabase.co/rest/v1/rpc/ratiflow_reset_document_hero_v3",
  );
  assert.deepEqual(calls[0][1], {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
    redirect: "error",
  });

  assert.equal((await stat(outcome.secretFilePath)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(outcome.secretFilePath, "utf8")), expected);
  assert.match(output, /Canonical document hero fixture reset successfully\./u);
  assert.match(output, /Revision 1 · activity version 1/u);
  assert.match(output, new RegExp(`Secret result file: ${outcome.secretFilePath}`, "u"));
  assert.match(output, /Cleanup required: delete /u);
  for (const secret of [
    SERVICE_ROLE_KEY,
    SHARE_TOKEN,
    MAYA_BOOTSTRAP,
    JORDAN_BOOTSTRAP,
    expected.data.mayaBootstrapPath,
    expected.data.jordanBootstrapPath,
  ]) {
    assert.equal(output.includes(secret), false);
  }
});

test("fails closed on HTTP, network, and schema errors without reading or printing bodies", async () => {
  const environment = {
    RATIFLOW_SUPABASE_URL: "https://example.supabase.co",
    RATIFLOW_SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  };
  const secretResponseBody = `server leaked ${SHARE_TOKEN} ${SERVICE_ROLE_KEY}`;
  let rejectedBodyRead = false;
  const cases = [
    {
      request: async () => ({
        ok: false,
        status: 403,
        json: async () => {
          rejectedBodyRead = true;
          throw new Error(secretResponseBody);
        },
      }),
    },
    {
      request: async () => { throw new Error(secretResponseBody); },
    },
    {
      request: async () => ({
        ok: true,
        status: 200,
        json: async () => resetResult({ revision: 2, secretResponseBody }),
      }),
    },
  ];

  for (const entry of cases) {
    let stdout = "";
    let stderr = "";
    const exitCode = await main({
      environment,
      request: entry.request,
      now: Date.parse("2026-09-01T00:00:00.000Z"),
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    });

    assert.equal(exitCode, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /No response content or credentials were printed\./u);
    assert.equal(stderr.includes(secretResponseBody), false);
    assert.equal(stderr.includes(SHARE_TOKEN), false);
    assert.equal(stderr.includes(SERVICE_ROLE_KEY), false);
  }
  assert.equal(rejectedBodyRead, false);
});

test("rejects extra keys, stale expiries, mismatched paths, and non-HTTPS configuration", async () => {
  assert.equal(validateResetResult({ ...resetResult(), extra: true }), false);
  assert.equal(validateResetResult(resetResult({ expiresAt: "2020-01-01T00:00:00Z" })), false);
  assert.equal(validateResetResult(resetResult({
    mayaBootstrapPath: `/document/${"b".repeat(64)}#ratiflow-bootstrap=${MAYA_BOOTSTRAP}`,
  })), false);

  let stderr = "";
  const exitCode = await main({
    environment: {
      RATIFLOW_SUPABASE_URL: "http://example.supabase.co",
      RATIFLOW_SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    },
    request: async () => { throw new Error("must not be called"); },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  assert.equal(exitCode, 1);
  assert.match(stderr, /must be an HTTPS URL/u);
  assert.equal(stderr.includes(SERVICE_ROLE_KEY), false);
});
