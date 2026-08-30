import { TOOL_NAMES, type CompiledCapabilities, type ToolName } from "../contracts/index";

/**
 * Dynamic registration is the product behavior. The static superset exists only
 * to measure the cost of registration-time overexposure in an isolated preview.
 */
export type WebMCPRegistrationMode = "dynamic" | "static-superset";

export function resolveWebMCPRegistrationMode(
  vercelEnv: string | undefined,
  ablation: string | undefined,
): WebMCPRegistrationMode {
  return vercelEnv === "preview" && ablation === "static-superset"
    ? "static-superset"
    : "dynamic";
}

/**
 * This is deliberately a registration-only overlay. Callbacks retain the
 * page's dynamic capabilities and the server remains the authorization source.
 */
export function registeredToolNames(
  mode: WebMCPRegistrationMode,
  compiled: CompiledCapabilities,
): ToolName[] {
  return mode === "static-superset" ? [...TOOL_NAMES] : compiled.availableTools;
}
