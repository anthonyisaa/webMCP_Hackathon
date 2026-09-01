import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentCondition } from "./score";
import type { ValidationOptions } from "./ledger";

const ledgerModulePath = "./ledger.ts";
const { ablationRequest, releaseRequest, summarizeAblation, summarizeRuns, validateLedger } = await import(ledgerModulePath);

export const DEFAULT_INPUT = "evals/agent/document-v3";

const usage = "Usage: node evals/agent/validate.ts [runs.json|results-directory] [--mode release|ablation] [--scenarios A01,A02] [--conditions native-v3,webmcp-disabled]";

const runFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? runFiles(path)
      : entry.isFile() && /^[1-5]\.json$/.test(entry.name)
        ? [path]
        : [];
  })
  .sort();

export const readRuns = (path: string): unknown[] => {
  const resolved = resolve(path);
  const stat = statSync(resolved);
  if (stat.isDirectory()) {
    return runFiles(resolved).flatMap((file) => {
      const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
      return Array.isArray(value) ? value : [value];
    });
  }
  const value = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  return Array.isArray(value) ? value : [value];
};

type CliIo = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

type CliDependencies = {
  read?: (path: string) => unknown[];
  validationOptions?: ValidationOptions;
};

const processIo: CliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

export function runValidationCli(
  args: string[],
  io: CliIo = processIo,
  dependencies: CliDependencies = {},
): number {
  const valuedOptions = new Set(["--mode", "--scenarios", "--conditions"]);
  let input: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (valuedOptions.has(argument)) {
      if (args[index + 1] === undefined || args[index + 1]?.startsWith("--")) {
        io.stderr(`${usage}\nMissing value for ${argument}\n`);
        return 2;
      }
      index += 1;
    } else if (argument.startsWith("--")) {
      io.stderr(`${usage}\nUnknown option: ${argument}\n`);
      return 2;
    } else if (input === undefined) {
      input = argument;
    } else {
      io.stderr(`${usage}\nUnexpected argument: ${argument}\n`);
      return 2;
    }
  }
  input ??= DEFAULT_INPUT;

  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const mode = option("--mode") ?? "release";
  const baseRequest = mode === "ablation" ? ablationRequest() : mode === "release" ? releaseRequest() : undefined;
  if (!baseRequest) {
    io.stderr(`${usage}\nUnknown mode: ${mode}\n`);
    return 2;
  }

  const scenarioIds = option("--scenarios")?.split(",").filter(Boolean) ?? baseRequest.scenarioIds;
  const conditions = (option("--conditions")?.split(",").filter(Boolean) ?? baseRequest.conditions) as AgentCondition[];
  const sameMembers = <T>(left: T[], right: T[]) => left.length === right.length
    && left.every((value) => right.includes(value));
  const partialDiagnostic = !sameMembers(scenarioIds, baseRequest.scenarioIds)
    || !sameMembers(conditions, baseRequest.conditions);
  try {
    const ledger = (dependencies.read ?? readRuns)(input);
    const selectedLedger = partialDiagnostic
      ? ledger.filter((entry) => typeof entry === "object"
        && entry !== null
        && !Array.isArray(entry)
        && scenarioIds.includes(String((entry as Record<string, unknown>).scenarioId))
        && conditions.includes((entry as Record<string, unknown>).condition as AgentCondition))
      : ledger;
    const resolvedInput = resolve(input);
    const transcriptRoot = dependencies.validationOptions?.transcriptRoot
      ?? (dependencies.read ? resolve(DEFAULT_INPUT) : statSync(resolvedInput).isDirectory() ? resolvedInput : dirname(resolvedInput));
    const result = validateLedger(selectedLedger, {
      ...baseRequest,
      scenarioIds,
      conditions,
      passBarConditions: conditions.includes("native-v3") ? ["native-v3"] : [],
    }, { ...dependencies.validationOptions, transcriptRoot });
    const status = !result.integrityValid
      ? "INVALID"
      : partialDiagnostic || !result.complete
        ? "PENDING"
        : result.barsSatisfied
          ? "PASS"
          : "FAIL";
    const diagnosticIssues = partialDiagnostic
      ? [{
          path: "$.request",
          message: `filtered ${mode} validation is diagnostic only and cannot satisfy the frozen ${mode} matrix`,
        }]
      : [];
    const payload = {
      status,
      ok: status === "PASS",
      complete: result.complete && !partialDiagnostic,
      integrityValid: result.integrityValid,
      barsSatisfied: result.barsSatisfied,
      input,
      issues: [...diagnosticIssues, ...result.issues],
      passBars: result.bars,
      summary: summarizeRuns(result),
      ablation: mode === "ablation" ? summarizeAblation(result) : undefined,
    };
    io.stdout(`${JSON.stringify(payload, null, 2)}\n`);
    return status === "PASS" ? 0 : 1;
  } catch (error) {
    io.stderr(`Could not validate ${input}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

const isDirectExecution = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) process.exitCode = runValidationCli(process.argv.slice(2));
