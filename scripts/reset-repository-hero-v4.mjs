#!/usr/bin/env node

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL_ENV = "RATIFLOW_BASE_URL";
const RESET_TOKEN_ENV = "RATIFLOW_EVAL_RESET_TOKEN";
const RESET_PATH = "/api/repository-v4/eval/reset";
const RESULT_FILE = "reset-result.json";
const TEMP_DIRECTORY_PREFIX = "ratiflow-repository-hero-v4-";
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;
const BOOTSTRAP_VALUE = /^[A-Za-z0-9_-]{64,8192}$/u;
const FIXTURE_VERSION = "repo-document-v4.postmortem.v1";
const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

class SafeCliError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafeCliError";
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function isBootstrapPath(value, shareToken) {
  if (typeof value !== "string") return false;
  const prefix = `/issue/${shareToken}#ratiflow-bootstrap=`;
  return value.startsWith(prefix)
    && BOOTSTRAP_VALUE.test(value.slice(prefix.length));
}

export function validateResetResult(value, now = Date.now()) {
  if (!hasExactKeys(value, ["ok", "data"]) || value.ok !== true) return false;
  const { data } = value;
  if (!hasExactKeys(data, [
    "fixtureVersion",
    "shareToken",
    "priyaBootstrapPath",
    "nadiaBootstrapPath",
    "leoBootstrapPath",
    "samBootstrapPath",
    "expiresAt",
    "revision",
    "activityVersion",
  ])) return false;

  const expiresAt = typeof data.expiresAt === "string"
    ? Date.parse(data.expiresAt)
    : Number.NaN;
  const paths = [
    data.priyaBootstrapPath,
    data.nadiaBootstrapPath,
    data.leoBootstrapPath,
    data.samBootstrapPath,
  ];

  return data.fixtureVersion === FIXTURE_VERSION
    && typeof data.shareToken === "string"
    && TOKEN.test(data.shareToken)
    && paths.every((path) => isBootstrapPath(path, data.shareToken))
    && new Set(paths).size === paths.length
    && Number.isFinite(expiresAt)
    && expiresAt > now
    && expiresAt <= now + MAX_LIFETIME_MS
    && data.revision === 1
    && data.activityVersion === 4;
}

function readConfiguration(environment) {
  const rawBaseUrl = environment[BASE_URL_ENV];
  if (typeof rawBaseUrl !== "string" || rawBaseUrl.length === 0) {
    throw new SafeCliError(`Missing required environment variable ${BASE_URL_ENV}.`);
  }

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new SafeCliError(`${BASE_URL_ENV} must be a valid URL.`);
  }
  const isLoopback = baseUrl.hostname === "localhost" || baseUrl.hostname === "127.0.0.1";
  if (
    (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && isLoopback))
    || baseUrl.hostname.length === 0
    || baseUrl.username.length > 0
    || baseUrl.password.length > 0
    || baseUrl.search.length > 0
    || baseUrl.hash.length > 0
  ) {
    throw new SafeCliError(
      `${BASE_URL_ENV} must be HTTPS (or loopback HTTP) without credentials, query, or fragment.`,
    );
  }

  const resetToken = environment[RESET_TOKEN_ENV];
  if (
    typeof resetToken !== "string"
    || resetToken.length < 16
    || resetToken.trim() !== resetToken
    || /\s/u.test(resetToken)
  ) {
    throw new SafeCliError(`Missing or invalid ${RESET_TOKEN_ENV}.`);
  }

  return {
    endpoint: new URL(RESET_PATH, baseUrl).href,
    resetToken,
  };
}

async function requestResetResult({ environment, request, now }) {
  const { endpoint, resetToken } = readConfiguration(environment);
  let response;
  try {
    response = await request(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${resetToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      redirect: "error",
    });
  } catch {
    throw new SafeCliError("The private v4 hero reset request could not be completed.");
  }

  if (!response || response.ok !== true) {
    const status = Number.isInteger(response?.status) ? ` (HTTP ${response.status})` : "";
    throw new SafeCliError(`The private v4 hero reset was rejected${status}.`);
  }

  let value;
  try {
    value = await response.json();
  } catch {
    throw new SafeCliError("The private v4 hero reset returned invalid JSON.");
  }
  if (!validateResetResult(value, now)) {
    throw new SafeCliError("The private v4 hero reset returned an invalid result shape.");
  }
  return value;
}

async function persistSecretResult(value, temporaryRoot) {
  let directory;
  try {
    directory = await mkdtemp(join(temporaryRoot, TEMP_DIRECTORY_PREFIX));
    await chmod(directory, 0o700);
    const secretFilePath = join(directory, RESULT_FILE);
    await writeFile(secretFilePath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return secretFilePath;
  } catch {
    if (directory) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
    throw new SafeCliError("The private v4 hero reset result could not be stored securely.");
  }
}

export async function runResetRepositoryHeroV4({
  environment = process.env,
  request = globalThis.fetch,
  now = Date.now(),
  temporaryRoot = tmpdir(),
  stdout = process.stdout,
} = {}) {
  if (typeof request !== "function") {
    throw new SafeCliError("A Fetch-compatible runtime is required.");
  }

  const value = await requestResetResult({ environment, request, now });
  const secretFilePath = await persistSecretResult(value, temporaryRoot);
  stdout.write([
    "Canonical repository postmortem fixture reset successfully.",
    `Revision 1 · activity version 4 · expires ${value.data.expiresAt}`,
    `Secret result file: ${secretFilePath}`,
    `Cleanup required: delete ${resolve(secretFilePath, "..")} immediately after the four bootstrap URLs are opened.`,
    "",
  ].join("\n"));
  return { secretFilePath };
}

export async function main(options = {}) {
  const stderr = options.stderr ?? process.stderr;
  try {
    await runResetRepositoryHeroV4(options);
    return 0;
  } catch (error) {
    const message = error instanceof SafeCliError
      ? error.message
      : "The private v4 hero reset failed safely.";
    stderr.write(`${message}\nNo response content or credentials were printed.\n`);
    return 1;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
