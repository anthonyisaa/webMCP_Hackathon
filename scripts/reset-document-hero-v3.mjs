#!/usr/bin/env node

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_ENV = "RATIFLOW_SUPABASE_URL";
const SERVICE_ROLE_KEY_ENV = "RATIFLOW_SUPABASE_SERVICE_ROLE_KEY";
const RPC_NAME = "ratiflow_reset_document_hero_v3";
const RESULT_FILE = "reset-result.json";
const TEMP_DIRECTORY_PREFIX = "ratiflow-document-hero-v3-";
const TOKEN = /^(?:[0-9a-f]{64}|[A-Za-z0-9_-]{32,128})$/;
const BOOTSTRAP_VALUE = /^[A-Za-z0-9_-]{64,8192}$/;

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
  const prefix = `/document/${shareToken}#ratiflow-bootstrap=`;
  return value.startsWith(prefix)
    && BOOTSTRAP_VALUE.test(value.slice(prefix.length));
}

export function validateResetResult(value, now = Date.now()) {
  if (!hasExactKeys(value, ["ok", "data"]) || value.ok !== true) return false;
  const { data } = value;
  if (!hasExactKeys(data, [
    "shareToken",
    "mayaBootstrapPath",
    "jordanBootstrapPath",
    "expiresAt",
    "revision",
    "activityVersion",
  ])) return false;

  const expiresAt = typeof data.expiresAt === "string"
    ? Date.parse(data.expiresAt)
    : Number.NaN;

  return typeof data.shareToken === "string"
    && TOKEN.test(data.shareToken)
    && isBootstrapPath(data.mayaBootstrapPath, data.shareToken)
    && isBootstrapPath(data.jordanBootstrapPath, data.shareToken)
    && data.mayaBootstrapPath !== data.jordanBootstrapPath
    && Number.isFinite(expiresAt)
    && expiresAt > now
    && data.revision === 1
    && data.activityVersion === 1;
}

function readConfiguration(environment) {
  const rawUrl = environment[URL_ENV];
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    throw new SafeCliError(`Missing required environment variable ${URL_ENV}.`);
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeCliError(`${URL_ENV} must be a valid HTTPS URL.`);
  }

  if (
    url.protocol !== "https:"
    || url.hostname.length === 0
    || url.username.length > 0
    || url.password.length > 0
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new SafeCliError(
      `${URL_ENV} must be an HTTPS URL without credentials, query, or fragment.`,
    );
  }

  const serviceRoleKey = environment[SERVICE_ROLE_KEY_ENV];
  if (
    typeof serviceRoleKey !== "string"
    || serviceRoleKey.length === 0
    || serviceRoleKey.trim() !== serviceRoleKey
    || /\s/u.test(serviceRoleKey)
  ) {
    throw new SafeCliError(`Missing or invalid ${SERVICE_ROLE_KEY_ENV}.`);
  }

  return {
    endpoint: new URL(`/rest/v1/rpc/${RPC_NAME}`, url).href,
    serviceRoleKey,
  };
}

async function requestResetResult({ environment, request, now }) {
  const { endpoint, serviceRoleKey } = readConfiguration(environment);
  let response;
  try {
    response = await request(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: "{}",
      redirect: "error",
    });
  } catch {
    throw new SafeCliError("The private hero reset request could not be completed.");
  }

  if (!response || response.ok !== true) {
    const status = Number.isInteger(response?.status) ? ` (HTTP ${response.status})` : "";
    throw new SafeCliError(`The private hero reset request was rejected${status}.`);
  }

  let value;
  try {
    value = await response.json();
  } catch {
    throw new SafeCliError("The private hero reset returned invalid JSON.");
  }

  if (!validateResetResult(value, now)) {
    throw new SafeCliError("The private hero reset returned an invalid result shape.");
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
    throw new SafeCliError("The private hero reset result could not be stored securely.");
  }
}

export async function runResetDocumentHeroV3({
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
    "Canonical document hero fixture reset successfully.",
    `Revision 1 · activity version 1 · expires ${value.data.expiresAt}`,
    `Secret result file: ${secretFilePath}`,
    `Cleanup required: delete ${resolve(secretFilePath, "..")} immediately after both bootstrap URLs are opened.`,
    "",
  ].join("\n"));
  return { secretFilePath };
}

export async function main(options = {}) {
  const stderr = options.stderr ?? process.stderr;
  try {
    await runResetDocumentHeroV3(options);
    return 0;
  } catch (error) {
    const message = error instanceof SafeCliError
      ? error.message
      : "The private hero reset failed safely.";
    stderr.write(`${message}\nNo response content or credentials were printed.\n`);
    return 1;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
