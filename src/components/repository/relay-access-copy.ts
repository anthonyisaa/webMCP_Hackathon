import type { ManagedAgentExpertise } from "@/agent-relay/contracts";
import type { ManagedRelayAccessProfile } from "@/repository/contracts";

export const RELAY_ACCESS_PROFILE_OPTIONS = [
  {
    value: "METRICS_SCOPED_EDIT",
    label: "Metrics",
    description: "Query the site’s labeled metrics fixtures",
  },
  {
    value: "REPOSITORY_SCOPED_EDIT",
    label: "Repository",
    description: "Search and read the site’s code and log fixtures",
  },
  {
    value: "EDITORIAL_SCOPED_EDIT",
    label: "Editorial",
    description: "Read the site’s style guide and check consistency",
  },
] as const satisfies ReadonlyArray<{
  value: ManagedRelayAccessProfile;
  label: string;
  description: string;
}>;

const RECOMMENDED_ACCESS_BY_EXPERTISE = {
  DATA: "METRICS_SCOPED_EDIT",
  CODE: "REPOSITORY_SCOPED_EDIT",
  GENERAL: "EDITORIAL_SCOPED_EDIT",
} as const satisfies Record<ManagedAgentExpertise, ManagedRelayAccessProfile>;

export function repositoryRecommendedAccessProfile(
  expertise: ManagedAgentExpertise,
): ManagedRelayAccessProfile {
  return RECOMMENDED_ACCESS_BY_EXPERTISE[expertise];
}

export function repositoryAccessProfileLabel(
  accessProfile: ManagedRelayAccessProfile,
): string {
  return RELAY_ACCESS_PROFILE_OPTIONS.find((option) => option.value === accessProfile)?.label
    ?? accessProfile;
}
