import {
  RELAY_ACCESS_POLICIES,
  type ManagedAgentLogicalToolName,
  type RelayAccessProfile,
  type RelayCapabilityGrant,
} from "./contracts";

export type RelayAccessPolicy =
  (typeof RELAY_ACCESS_POLICIES)[RelayAccessProfile];

export function isRelayAccessProfile(value: unknown): value is RelayAccessProfile {
  return value === "METRICS_SCOPED_EDIT"
    || value === "REPOSITORY_SCOPED_EDIT"
    || value === "EDITORIAL_SCOPED_EDIT";
}

export function relayAccessPolicy(
  accessProfile: RelayAccessProfile,
): RelayAccessPolicy {
  return RELAY_ACCESS_POLICIES[accessProfile];
}

export function capabilityGrantMatchesPolicy(
  value: unknown,
): value is RelayCapabilityGrant {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const grant = value as Partial<RelayCapabilityGrant>;
  if (!exactStrings(Object.keys(value).sort(), [
    "accessProfile",
    "documentAuthority",
    "logicalToolNames",
    "syntheticSourceLabels",
  ])
    || !isRelayAccessProfile(grant.accessProfile)
    || !Array.isArray(grant.logicalToolNames)
    || !Array.isArray(grant.syntheticSourceLabels)) return false;
  const policy = relayAccessPolicy(grant.accessProfile);
  return grant.documentAuthority === policy.documentAuthority
    && exactStrings(grant.logicalToolNames, policy.logicalToolNames)
    && exactStrings(grant.syntheticSourceLabels, policy.syntheticSourceLabels);
}

export function capabilityGrantForAccessProfile(
  accessProfile: RelayAccessProfile,
): RelayCapabilityGrant {
  const policy = relayAccessPolicy(accessProfile);
  return {
    accessProfile,
    documentAuthority: policy.documentAuthority,
    logicalToolNames: [...policy.logicalToolNames],
    syntheticSourceLabels: [...policy.syntheticSourceLabels],
  };
}

function exactStrings(
  actual: readonly string[],
  expected: readonly ManagedAgentLogicalToolName[] | readonly string[],
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}
