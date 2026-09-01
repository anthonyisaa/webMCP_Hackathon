import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LedgerValidationOptions } from "./ledger";

const contractModulePath = "./contract.ts";
const ledgerModulePath = "./ledger.ts";
const { LEDGER_SCHEMA_VERSION } = await import(contractModulePath) as typeof import("./contract");
const { sha256Text, validateLedger } = await import(ledgerModulePath) as typeof import("./ledger");

export const DEFAULT_LEDGER = "evals/agent/repo-document-v4/ledger.json";

type CliIo = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

type CliDependencies = {
  cwd?: string;
  read?: (path: string) => Buffer;
  validationOptions?: LedgerValidationOptions;
};

const processIo: CliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

const writeJson = (write: (value: string) => void, value: unknown) =>
  write(`${JSON.stringify(value, null, 2)}\n`);

export function runAgentLedgerCli(
  args: string[],
  dependencies: CliDependencies = {},
  io: CliIo = processIo,
): number {
  if (args.length > 1 || args[0]?.startsWith("--")) {
    writeJson(io.stderr, {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      status: "INVALID",
      ok: false,
      issues: [{ path: "$", message: "Usage: node evals/agent/repo-document-v4/validate.ts [ledger.json]" }],
    });
    return 2;
  }
  const cwd = resolve(dependencies.cwd ?? process.cwd());
  const input = args[0] ?? DEFAULT_LEDGER;
  const ledgerPath = resolve(cwd, input);
  let bytes: Buffer;
  let value: unknown;
  try {
    bytes = (dependencies.read ?? readFileSync)(ledgerPath);
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    writeJson(io.stderr, {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      status: "INVALID",
      ok: false,
      input,
      issues: [{ path: "$", message: `could not read valid JSON: ${error instanceof Error ? error.message : String(error)}` }],
    });
    return 2;
  }

  let validation;
  try {
    validation = validateLedger(value, {
      ...dependencies.validationOptions,
      artifactRoot: dependencies.validationOptions?.artifactRoot ?? dirname(ledgerPath),
    });
  } catch {
    writeJson(io.stderr, {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      status: "INVALID",
      ok: false,
      input,
      ledgerSha256: sha256Text(bytes),
      issues: [{ path: "$", message: "agent-ledger validation failed closed while inspecting untrusted evidence" }],
    });
    return 2;
  }

  writeJson(io.stdout, {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    status: validation.status,
    ok: validation.ok,
    schemaValid: validation.schemaValid,
    complete: validation.complete,
    nativeEligible: validation.nativeEligible,
    barsSatisfied: validation.barsSatisfied,
    pendingRunCount: validation.pendingRunCount,
    ineligibleRunCount: validation.ineligibleRunCount,
    input,
    ledgerSha256: sha256Text(bytes),
    issues: validation.issues,
    blockers: validation.blockers,
    scores: validation.scores,
  });
  return validation.status === "PASS" ? 0 : validation.status === "INVALID" ? 2 : 1;
}

const isDirectExecution = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) process.exitCode = runAgentLedgerCli(process.argv.slice(2));
