import {
  MANAGED_AGENT_TOOL_DEFINITIONS,
  RELAY_PHYSICAL_TOOL_NAME_MAX_LENGTH,
  RELAY_PHYSICAL_TOOL_NAME_PATTERN,
  type ManagedAgentLogicalToolName,
  type RelayAccessProfile,
} from "../contracts";
import { relayAccessPolicy } from "../access-policy";
import { RelayBrowserError } from "./errors";

export function makeRelayPhysicalToolName(input: {
  accessProfile: RelayAccessProfile;
  registrationScope: string;
  registrationGeneration: number;
  logicalName: ManagedAgentLogicalToolName;
}): string {
  if (!/^[a-f0-9]{16}$/u.test(input.registrationScope)) {
    throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The registration scope is invalid.");
  }
  if (!Number.isSafeInteger(input.registrationGeneration) || input.registrationGeneration < 1) {
    throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The registration generation is invalid.");
  }
  const policy = relayAccessPolicy(input.accessProfile);
  const providerKey = MANAGED_AGENT_TOOL_DEFINITIONS[input.logicalName].providerKey;
  const name = `rf_${policy.physicalDiscriminator}_${input.registrationScope}_g${input.registrationGeneration}_${providerKey}`;
  if (
    name.length > RELAY_PHYSICAL_TOOL_NAME_MAX_LENGTH
    || !RELAY_PHYSICAL_TOOL_NAME_PATTERN.test(name)
  ) {
    throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The physical tool name is invalid.");
  }
  return name;
}
