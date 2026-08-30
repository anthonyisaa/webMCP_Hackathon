import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

type AgentCondition = "dynamic-webmcp" | "static-superset" | "webmcp-disabled";
const ledgerModulePath = "./ledger.ts";
const { ablationRequest, releaseRequest, summarizeAblation, summarizeRuns, validateLedger } = await import(ledgerModulePath);

const usage = "Usage: node evals/agent/validate.ts [runs.json|results-directory] [--mode release|ablation] [--scenarios A01,A02] [--conditions dynamic-webmcp,static-superset]";

const args = process.argv.slice(2);
const valuedOptions = new Set(["--mode", "--scenarios", "--conditions"]);
let input: string | undefined;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (valuedOptions.has(argument)) {
    index += 1;
  } else if (!argument.startsWith("--") && input === undefined) {
    input = argument;
  }
}
input ??= "evals/results/agent";

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

const readRuns = (path: string): unknown[] => {
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

{
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const mode = option("--mode") ?? "release";
  const baseRequest = mode === "ablation" ? ablationRequest() : mode === "release" ? releaseRequest() : undefined;
  if (!baseRequest) {
    process.stderr.write(`${usage}\nUnknown mode: ${mode}\n`);
    process.exitCode = 2;
  } else {
    const scenarioIds = option("--scenarios")?.split(",").filter(Boolean) ?? baseRequest.scenarioIds;
    const conditions = (option("--conditions")?.split(",").filter(Boolean) ?? baseRequest.conditions) as AgentCondition[];
    try {
      const ledger = readRuns(input);
      const result = validateLedger(ledger, { ...baseRequest, scenarioIds, conditions });
      const payload = {
        ok: result.ok,
        issues: result.issues,
        passBars: result.bars,
        summary: summarizeRuns(result.validRuns),
        ablation: mode === "ablation" ? summarizeAblation(result.validRuns) : undefined,
      };
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      process.stderr.write(`Could not validate ${input}: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
  }
}
