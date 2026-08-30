import {
  BASE_TOOL_MATRIX,
  TOOL_NAMES,
  type CapabilityCompilerInput,
  type CapabilitySummary,
  type CompiledCapabilities,
  type ToolName,
  type UnavailableAction,
  type WhyNotAction,
} from "../contracts/index";

export const CAPABILITY_REASONS = {
  activeOptions: "at least two active options are required",
  capacityEvidence: "current launch-capacity evidence is required",
  deadlineEvidence: "Northstar deadline evidence is required",
  prepared: "decision already has a prepared review card",
  committed: "decision is already committed",
  humanRatification:
    "ratification is never available through WebMCP; Maya Chen must ratify in the ordinary UI",
  reviewRequired: "ratification requires a prepared decision in REVIEW",
} as const;

function failedReadyPredicates(input: CapabilityCompilerInput): string[] {
  const reasons: string[] = [];

  if (input.readiness.activeOptionCount < 2) {
    reasons.push(CAPABILITY_REASONS.activeOptions);
  }
  if (!input.readiness.hasCurrentCapacityEvidence) {
    reasons.push(CAPABILITY_REASONS.capacityEvidence);
  }
  if (!input.readiness.hasNorthstarDeadlineEvidence) {
    reasons.push(CAPABILITY_REASONS.deadlineEvidence);
  }

  const required = input.readiness.selectedOptionEngineerDays;
  const available = input.readiness.launchCapacityEngineerDays;
  if (required !== null && required > available) {
    reasons.push(
      `selected option requires ${required} engineer-days but launch capacity is ${available}`,
    );
  }

  const blockingCount = input.readiness.unresolvedBlockingChallengeCount;
  if (blockingCount > 0) {
    const optionId = input.readiness.selectedOptionId;
    if (optionId === null) {
      throw new Error("A blocking challenge requires a selected option ID.");
    }
    reasons.push(
      `${blockingCount} unresolved blocking challenge(s) against ${optionId}`,
    );
  }

  return reasons;
}

/**
 * Returns the exact reasons used by both compilation and the `why_not` tool.
 * Keeping this as one function prevents the runtime from growing a second rules table.
 */
export function getUnmetPredicates(
  input: CapabilityCompilerInput,
  action: WhyNotAction,
): string[] {
  if (action === "ratify_decision") {
    return input.state === "REVIEW"
      ? [CAPABILITY_REASONS.humanRatification]
      : [CAPABILITY_REASONS.humanRatification, CAPABILITY_REASONS.reviewRequired];
  }

  switch (input.state) {
    case "OPTIONS":
    case "CONTESTED":
      return failedReadyPredicates(input);
    case "READY":
      return [];
    case "REVIEW":
      return [CAPABILITY_REASONS.prepared];
    case "COMMITTED":
      return [CAPABILITY_REASONS.committed];
  }
}

function compileToolNames(input: CapabilityCompilerInput): ToolName[] {
  const names = new Set<ToolName>(BASE_TOOL_MATRIX[input.state]);

  if (
    input.selection.kind === "OPTION" &&
    (input.state === "OPTIONS" || input.state === "CONTESTED" || input.state === "READY")
  ) {
    names.add("inspect_selected_option");
    names.add("challenge_option");
  }

  if (
    input.state === "COMMITTED" &&
    input.selection.kind === "FOLLOWUP" &&
    input.selection.id === "fu_customer_launch_brief"
  ) {
    names.add("inspect_followup");
  }

  return TOOL_NAMES.filter((name) => names.has(name));
}

function compileUnavailableActions(input: CapabilityCompilerInput): UnavailableAction[] {
  const actions: WhyNotAction[] = ["prepare_decision", "ratify_decision"];
  return actions.flatMap((action) => {
    const unmetPredicates = getUnmetPredicates(input, action);
    return unmetPredicates.length > 0 ? [{ action, unmetPredicates }] : [];
  });
}

export function compileCapabilities(input: CapabilityCompilerInput): CompiledCapabilities {
  const availableTools = compileToolNames(input);
  const unavailableActions = compileUnavailableActions(input);
  const signature = JSON.stringify({
    state: input.state,
    selection: { kind: input.selection.kind, id: input.selection.id },
    memberRole: input.memberRole,
    availableTools,
  });

  return {
    state: input.state,
    workspaceRevision: input.workspaceRevision,
    contextEpoch: input.contextEpoch,
    selection: { ...input.selection },
    availableTools,
    unavailableActions,
    signature,
  };
}

export function summarizeCapabilities(compiled: CompiledCapabilities): CapabilitySummary {
  return {
    state: compiled.state,
    workspaceRevision: compiled.workspaceRevision,
    contextEpoch: compiled.contextEpoch,
    selection: { ...compiled.selection },
    availableTools: [...compiled.availableTools],
    unavailableActions: compiled.unavailableActions.map((action) => ({
      action: action.action,
      unmetPredicates: [...action.unmetPredicates],
    })),
  };
}
