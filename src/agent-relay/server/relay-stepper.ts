import {
  MANAGED_AGENT_RUNTIME,
  MANAGED_AGENT_MODEL_OUTPUT_SCHEMAS,
  MANAGED_AGENT_TOOL_DEFINITIONS,
  MANAGED_AGENT_EXPERTISES,
  RELAY_BOUNDS,
  RELAY_PHYSICAL_TOOL_NAME_MAX_LENGTH,
  RELAY_PHYSICAL_TOOL_NAME_PATTERN,
  type LunaProviderInput,
  type LunaProviderResult,
  type LunaResponsesProviderPort,
  type ManagedAgentLogicalToolName,
  type ManagedAgentToolDefinition,
  type RelayAttemptAuthorizationPort,
  type RelayExecutionPermit,
  type RelayGrant,
  type RelayAccessProfile,
  type RelayNormalizedToolManifest,
  type RelayNormalizedToolManifestEntry,
  type RelayProviderFunctionTool,
  type RelayResult,
  type RelayRun,
  type RelayStepInput,
  type RelayStepOutcome,
  type RelayStepRecordInput,
} from "@/agent-relay/contracts";
import {
  capabilityGrantMatchesPolicy,
  isRelayAccessProfile,
  relayAccessPolicy,
} from "@/agent-relay/access-policy";
import { FIXED_RELAY_START_PROMPT } from "@/agent-relay/server/luna-responses-provider";
import {
  isPlainRecord,
  jsonValuesEqual,
  matchesJsonSchema,
  relayFailure,
  sanitizeUntrustedText,
  sha256Digest,
  utf8Bytes,
} from "@/agent-relay/server/safety";
import type {
  IssueRelayPermitInput,
} from "@/domain/repository-relay-service";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGISTRATION_SCOPE_PATTERN = /^[a-f0-9]{16}$/;
const SYNTHETIC_SOURCE_LABEL = "Synthetic demo data";
const MODEL_UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const MODEL_HANDLE_PATTERN = /(^|[\s([{])@[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\b/g;
const MODEL_JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const MODEL_INTERNAL_ID_PATTERN =
  /["']?\b(?:task|run|attempt|profile|member|thread|comment|receipt|request|session|lease|call|correlation)(?:[_-]?id)?["']?\s*[:=]\s*["']?[A-Za-z0-9._:-]{2,}["']?/gi;
const MODEL_RANGE_COORDINATE_PATTERN =
  /["']?\b(?:rangeStart|rangeEnd|startLine|endLine|lineNumber|requestedLineRange|availableLineRange)["']?\s*[:=]\s*["']?[A-Za-z0-9._:,[\]{}-]{1,240}["']?/gi;
const MODEL_LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{48,}\b/g;
const SYNTHETIC_CODE_SOURCES = {
  "src/checkout/retry-middleware.ts": {
    kind: "CODE",
    evidenceRef: "commit:7d3c9e1",
  },
  "checkout.log": {
    kind: "LOG",
    evidenceRef: "checkout.log",
  },
} as const;
const CHECKOUT_INCIDENT_EVIDENCE_REFS = [
  "checkout.log",
  "commit:7d3c9e1",
] as const;
const GENERAL_EDITORIAL_EVIDENCE_REFS = [
  "Ratiflow company style guide",
  "Ratiflow consistency rules",
] as const;
const STYLE_RULE_LABELS = {
  DECISION_FIRST: "Decision first",
  INCIDENT_CAUSALITY: "Incident causality",
  LAUNCH_STAGE_LABELS: "Launch stage labels",
  PRESERVE_FACTS: "Preserve facts",
  PLAIN_LANGUAGE: "Plain language",
} as const;

export type { IssueRelayPermitInput } from "@/domain/repository-relay-service";

export interface RelayStepAuthorityPort extends RelayAttemptAuthorizationPort {
  issueExecutionPermit(
    grant: RelayGrant,
    input: IssueRelayPermitInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayExecutionPermit>>;
  recordRelayManifest(
    grant: RelayGrant,
    manifest: RelayNormalizedToolManifest,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ digest: `sha256:${string}` }>>;
}

export interface RelayStepRequest {
  grant: RelayGrant;
  requestId: string;
  requestOrigin: string;
  input: RelayStepInput;
}

export interface RelayStepperOptions {
  authority: RelayStepAuthorityPort;
  provider: LunaResponsesProviderPort;
  now?: () => Date;
}

type ExpectedManifest = {
  manifest: RelayNormalizedToolManifest;
  tools: RelayProviderFunctionTool[];
  byPhysicalName: Map<string, {
    logicalName: ManagedAgentLogicalToolName;
    definition: ManagedAgentToolDefinition;
  }>;
};

type PreparedProviderInput = {
  providerInput: LunaProviderInput;
  successfulSyntheticEvidenceRefs: string[];
};

type ProjectedModelResult = {
  output: string;
  successfulSyntheticEvidenceRefs: string[];
};

export class BoundedLunaRelayStepper {
  readonly #authority: RelayStepAuthorityPort;
  readonly #provider: LunaResponsesProviderPort;
  readonly #now: () => Date;

  constructor(options: RelayStepperOptions) {
    this.#authority = options.authority;
    this.#provider = options.provider;
    this.#now = options.now ?? (() => new Date());
  }

  async step(
    request: RelayStepRequest,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayStepOutcome>> {
    const requestFailure = validateStepRequest(request);
    if (requestFailure) return requestFailure;
    const inputDigest = sha256Digest(request.input);
    const reservation = {
      requestId: request.requestId,
      inputDigest,
      attemptId: request.input.attemptId,
      expectedStep: request.input.expectedStep,
    } as const;

    const begun = await this.#authority.beginStep(request.grant, reservation, signal);
    if (!begun.ok) return begun;
    if (begun.data.disposition === "RECORDED") return begun.data.result;
    if (begun.data.disposition === "IN_PROGRESS") {
      return relayFailure(
        "RELAY_STATE_CONFLICT",
        "This managed agent step is already in progress.",
        true,
        `Retry after ${Math.max(1, Math.ceil(begun.data.retryAfterMs / 1_000))} seconds.`,
      );
    }

    const context = begun.data.context;
    let obtainedProviderResponseId: string | null = null;
    let providerDispatchStarted = false;
    const persist = (
      result: RelayResult<RelayStepOutcome>,
      providerResponseId: string | null,
    ) => this.#persist(
      request.grant,
      { ...reservation, providerResponseId, result },
    );

    try {
      const contextFailure = validateAuthorizedContext(context, request.input, this.#now());
      if (contextFailure) return persist(contextFailure, null);

      const expectedManifest = buildExpectedManifest(
        request.requestOrigin,
        context.run.accessProfile,
        context.agent.runtime,
        context.attempt.registrationScope,
        context.attempt.registrationGeneration,
      );
      if (!expectedManifest.ok) return persist(expectedManifest, null);

      const providerInput = await this.#providerInput(
        request.grant,
        request.input,
        context.previousProviderResponseId,
        context.previousOutcome,
        context.run,
        context.attempt.toolCallCount,
        expectedManifest.data,
        signal,
      );
      if (!providerInput.ok) return persist(providerInput, null);

      if (context.attempt.providerCallCount >= RELAY_BOUNDS.maxResponsesCallsPerAttempt) {
        return persist(relayFailure(
          "RELAY_STATE_CONFLICT",
          "The managed agent provider-call budget is exhausted.",
          false,
          "Retry the managed run with a new attempt.",
        ), null);
      }

      providerDispatchStarted = true;
      const providerResult = await this.#provider.respond(
        providerInput.data.providerInput,
        signal,
      );
      if (!providerResult.ok) return persist(providerResult, null);
      obtainedProviderResponseId = providerResult.data.responseId;

      const projected = await this.#projectOutcome(
        request.grant,
        request.input,
        context.run,
        context.attempt.toolCallCount,
        expectedManifest.data,
        providerResult.data,
        providerInput.data.successfulSyntheticEvidenceRefs,
        signal,
      );
      return persist(projected, obtainedProviderResponseId);
    } catch {
      return persist(
        providerDispatchStarted
          ? providerOutcomeUnknown()
          : relayFailure(
            "RELAY_UNAVAILABLE",
            "The managed agent step was interrupted before provider dispatch.",
            true,
            "Retry the current managed run.",
          ),
        obtainedProviderResponseId,
      );
    }
  }

  async #providerInput(
    grant: RelayGrant,
    input: RelayStepInput,
    previousProviderResponseId: string | null,
    previousOutcome: RelayStepOutcome | null,
    run: RelayRun,
    toolCallCount: number,
    expectedManifest: ExpectedManifest,
    signal?: AbortSignal,
  ): Promise<RelayResult<PreparedProviderInput>> {
    if (input.action === "START") {
      if (previousProviderResponseId !== null || previousOutcome !== null) {
        return continuationMismatch();
      }
      return {
        ok: true,
        data: {
          providerInput: { kind: "START", prompt: FIXED_RELAY_START_PROMPT },
          successfulSyntheticEvidenceRefs: [],
        },
      };
    }

    if (!previousProviderResponseId || !previousOutcome) return continuationMismatch();

    if (input.action === "SUBMIT_SEARCH_RESULT") {
      if (previousOutcome.outcome !== "DISCOVER_TOOLS"
        || previousOutcome.attemptId !== input.attemptId
        || previousOutcome.nextStep !== input.expectedStep
        || previousOutcome.toolSearchCallId !== input.toolSearchCallId
        || !jsonValuesEqual(input.manifest, expectedManifest.manifest)) {
        return relayFailure(
          "RELAY_MANIFEST_MISMATCH",
          "The page tool manifest does not match this managed Relay attempt.",
          false,
        );
      }
      const recordedManifest = await this.#authority.recordRelayManifest(
        grant,
        expectedManifest.manifest,
        signal,
      );
      if (!recordedManifest.ok) return recordedManifest;
      if (recordedManifest.data.digest !== expectedManifest.manifest.digest) {
        return manifestFailure();
      }
      const nextTool = requiredProviderTool(expectedManifest, run, toolCallCount);
      if (!nextTool || toolCallCount !== 0) return continuationMismatch();
      return {
        ok: true,
        data: {
          providerInput: {
            kind: "TOOL_SEARCH_OUTPUT",
            previousResponseId: previousProviderResponseId,
            callId: input.toolSearchCallId,
            tools: expectedManifest.tools,
            nextTool,
          },
          successfulSyntheticEvidenceRefs: [],
        },
      };
    }

    if (previousOutcome.outcome !== "EXECUTE_TOOL"
      || previousOutcome.attemptId !== input.attemptId
      || previousOutcome.nextStep !== input.expectedStep
      || previousOutcome.functionCallId !== input.functionCallId) return continuationMismatch();

    const verified = await this.#authority.loadVerifiedToolResult(
      grant,
      input.resultReceiptId,
      signal,
    );
    if (!verified.ok) return verified;
    if (verified.data.functionCallId !== input.functionCallId
      || utf8Bytes(verified.data.output) > RELAY_BOUNDS.maxVerifiedToolResultBytes
      || !validRelayResultEnvelope(verified.data.output)) {
      return relayFailure(
        "RELAY_RESULT_INVALID",
        "The stored WebMCP tool result does not match the pending function call.",
        false,
      );
    }
    const executedTool = expectedManifest.byPhysicalName.get(previousOutcome.physicalToolName);
    if (!executedTool) return continuationMismatch();
    const executedIndex = toolCallCount - 1;
    if (executedIndex < 0
      || relayAccessPolicy(run.accessProfile).requiredToolOrder[executedIndex]
        !== executedTool.logicalName) return continuationMismatch();
    const projected = projectRelayToolResultForModel(
      executedTool.logicalName,
      verified.data.output,
    );
    if (!projected.ok) return projected;
    const nextTool = executedTool.logicalName === "submit_scoped_revision"
      ? null
      : requiredProviderTool(expectedManifest, run, toolCallCount);
    if (executedTool.logicalName !== "submit_scoped_revision" && !nextTool) {
      return continuationMismatch();
    }
    return {
      ok: true,
      data: {
        providerInput: {
          kind: "FUNCTION_CALL_OUTPUT",
          previousResponseId: previousProviderResponseId,
          callId: input.functionCallId,
          output: projected.data.output,
          completedToolName: executedTool.logicalName,
          nextTool,
        },
        successfulSyntheticEvidenceRefs:
          projected.data.successfulSyntheticEvidenceRefs,
      },
    };
  }

  async #projectOutcome(
    grant: RelayGrant,
    input: RelayStepInput,
    run: RelayRun,
    toolCallCount: number,
    expectedManifest: ExpectedManifest,
    providerResult: LunaProviderResult,
    successfulSyntheticEvidenceRefs: string[],
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayStepOutcome>> {
    const nextStep = input.expectedStep + 1;
    if (providerResult.kind === "SEARCH_REQUIRED") {
      if (input.action !== "START") return invalidProviderTransition();
      return {
        ok: true,
        data: {
          outcome: "DISCOVER_TOOLS",
          attemptId: input.attemptId,
          nextStep,
          toolSearchCallId: providerResult.callId,
          goal: providerResult.goal,
        },
      };
    }

    if (providerResult.kind === "CALL_REQUIRED") {
      if (input.action === "START") return invalidProviderTransition();
      if (toolCallCount >= RELAY_BOUNDS.maxToolCallsPerAttempt) {
        return {
          ok: true,
          data: retryRequired(
            run,
            input.attemptId,
            nextStep,
            this.#now(),
            "The managed agent reached its tool-call limit before completing the assignment.",
          ),
        };
      }
      const selected = expectedManifest.byPhysicalName.get(providerResult.physicalToolName);
      const requiredLogicalName = relayAccessPolicy(run.accessProfile)
        .requiredToolOrder[toolCallCount];
      if (!selected
        || !matchesJsonSchema(providerResult.arguments, selected.definition.inputSchema)
        || selected.logicalName !== requiredLogicalName
        || (selected.logicalName === "submit_scoped_revision"
          && !submissionEvidenceIsBound(
            providerResult.arguments,
            successfulSyntheticEvidenceRefs,
          ))) {
        return invalidProviderTransition();
      }
      const permit = await this.#authority.issueExecutionPermit(grant, {
        attemptId: input.attemptId,
        functionCallId: providerResult.callId,
        physicalToolName: providerResult.physicalToolName,
        arguments: providerResult.arguments,
      }, signal);
      if (!permit.ok) return permit;
      return {
        ok: true,
        data: {
          outcome: "EXECUTE_TOOL",
          attemptId: input.attemptId,
          nextStep,
          functionCallId: providerResult.callId,
          physicalToolName: providerResult.physicalToolName,
          arguments: providerResult.arguments,
          permit: permit.data,
        },
      };
    }

    if (input.action !== "SUBMIT_FUNCTION_RESULT") return invalidProviderTransition();
    if (run.status !== "COMPLETED" || run.terminalReason !== "TASK_COMPLETED") {
      return {
        ok: true,
        data: retryRequired(
          run,
          input.attemptId,
          nextStep,
          this.#now(),
          "The model stopped before the assigned revision was authoritatively completed.",
        ),
      };
    }
    return {
      ok: true,
      data: {
        outcome: "COMPLETED",
        attemptId: input.attemptId,
        nextStep,
        outputText: providerResult.outputText,
        run,
      },
    };
  }

  async #persist(
    grant: RelayGrant,
    record: RelayStepRecordInput,
  ): Promise<RelayResult<RelayStepOutcome>> {
    try {
      // A client disconnect must not prevent durable replay state after Luna was called.
      const recorded = await this.#authority.recordStepResult(grant, record);
      return recorded.ok ? recorded.data.result : recorded;
    } catch {
      return relayFailure(
        "RELAY_UNAVAILABLE",
        "The managed agent step result could not be recorded safely.",
        true,
        "Reconcile the current managed run before retrying.",
      );
    }
  }
}

function requiredProviderTool(
  expectedManifest: ExpectedManifest,
  run: RelayRun,
  completedToolCallCount: number,
): RelayProviderFunctionTool | null {
  const logicalName = relayAccessPolicy(run.accessProfile)
    .requiredToolOrder[completedToolCallCount];
  if (!logicalName) return null;
  const entry = [...expectedManifest.byPhysicalName.entries()]
    .find(([, value]) => value.logicalName === logicalName);
  if (!entry) return null;
  return expectedManifest.tools.find((tool) => tool.name === entry[0]) ?? null;
}

function submissionEvidenceIsBound(
  argumentsValue: Readonly<Record<string, unknown>>,
  successfulSyntheticEvidenceRefs: string[],
): boolean {
  const evidenceRefs = argumentsValue.evidenceRefs;
  if (!Array.isArray(evidenceRefs)
    || evidenceRefs.length < 1
    || evidenceRefs.length > 12
    || successfulSyntheticEvidenceRefs.length < 1
    || evidenceRefs.length !== successfulSyntheticEvidenceRefs.length) return false;
  const available = new Set(successfulSyntheticEvidenceRefs);
  const submitted = new Set<string>();
  for (const value of evidenceRefs) {
    if (typeof value !== "string"
      || value.trim() !== value
      || value.length < 1
      || value.length > 240
      || submitted.has(value)
      || !available.has(value)) return false;
    submitted.add(value);
  }
  return true;
}

/** Project a verified, richer page result into the only shape allowed to reach Luna. */
export function projectRelayToolResultForModel(
  logicalName: ManagedAgentLogicalToolName,
  output: string,
): RelayResult<ProjectedModelResult> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(output) as unknown;
  } catch {
    return invalidToolResult();
  }
  if (!isPlainRecord(envelope)
    || !matchesJsonSchema(envelope, MANAGED_AGENT_TOOL_DEFINITIONS[logicalName].outputSchema)
    || envelope.ok !== true
    || !isPlainRecord(envelope.data)) return invalidToolResult();

  const projectedData = projectSuccessfulToolData(logicalName, envelope.data);
  if (!projectedData) return invalidToolResult();
  const projected = { ok: true as const, data: projectedData };
  if (!matchesJsonSchema(projected, MANAGED_AGENT_MODEL_OUTPUT_SCHEMAS[logicalName])) {
    return invalidToolResult();
  }
  const successfulSyntheticEvidenceRefs = syntheticEvidenceFromProjection(
    logicalName,
    projectedData,
  );
  if (successfulSyntheticEvidenceRefs === null) return invalidToolResult();
  return {
    ok: true,
    data: {
      output: JSON.stringify(projected),
      successfulSyntheticEvidenceRefs,
    },
  };
}

function projectSuccessfulToolData(
  logicalName: ManagedAgentLogicalToolName,
  data: Record<string, unknown>,
): Record<string, unknown> | null {
  switch (logicalName) {
    case "read_assignment":
      return projectAssignment(data);
    case "read_document_context":
      return projectDocumentContext(data);
    case "read_collaboration_context":
      return projectCollaborationContext(data);
    case "comment_on_assignment":
      return projectComment(data);
    case "submit_scoped_revision":
      return projectSubmission(data);
    case "query_demo_metrics":
      return projectMetrics(data);
    case "search_demo_code":
      return projectCodeSearch(data);
    case "read_demo_file":
      return projectDemoFile(data);
    case "read_company_style_guide":
      return projectStyleGuide(data);
    case "check_document_consistency":
      return projectConsistency(data);
  }
}

function projectAssignment(data: Record<string, unknown>): Record<string, unknown> | null {
  const taskView = plain(data.task);
  const task = taskView && plain(taskView.task);
  const context = task && plain(task.context);
  const agent = plain(data.agent);
  const capabilityGrant = data.capabilityGrant;
  if (!task
    || !context
    || !agent
    || !isManagedAgentExpertise(agent.expertise)
    || !capabilityGrantMatchesPolicy(capabilityGrant)) return null;
  const documentTitle = modelText(context.documentTitle, 160);
  const instruction = modelText(task.instruction, 1_000);
  const selectedText = modelText(context.targetText, 8_000, true);
  const contextBefore = modelText(context.beforeText, 600, true);
  const contextAfter = modelText(context.afterText, 600, true);
  const basedOnRevision = safeInteger(context.sourceRevision, 1);
  const syntheticSourceLabels = modelStringArray(
    capabilityGrant.syntheticSourceLabels,
    12,
    240,
    true,
  );
  if (documentTitle === null
    || instruction === null
    || selectedText === null
    || contextBefore === null
    || contextAfter === null
    || basedOnRevision === null
    || syntheticSourceLabels === null) return null;
  return {
    expertise: agent.expertise,
    accessProfile: capabilityGrant.accessProfile,
    documentTitle,
    instruction,
    selectedText,
    contextBefore,
    contextAfter,
    basedOnRevision,
    syntheticSourceLabels,
  };
}

function projectDocumentContext(data: Record<string, unknown>): Record<string, unknown> | null {
  const document = plain(data.document);
  const anchor = plain(data.anchor);
  if (!document
    || !anchor
    || (document.kind !== "POSTMORTEM" && document.kind !== "PRODUCT_DOCUMENT")
    || !Array.isArray(data.recentRevisions)) return null;
  const documentTitle = modelText(document.title, 160);
  const currentRevision = safeInteger(document.revision, 1);
  const selectedText = modelText(
    typeof anchor.selectedText === "string" ? anchor.selectedText : "",
    8_000,
    true,
  );
  const documentExcerpt = modelText(document.body, 8_000, true);
  const recentChanges = data.recentRevisions.slice(0, 5).map((value) => {
    const revision = plain(value);
    const revisionNumber = revision && safeInteger(revision.revision, 1);
    const summary = revision && modelText(revision.changeSummary, 240);
    return revisionNumber !== null && summary !== null
      ? { revision: revisionNumber, summary }
      : null;
  });
  if (documentTitle === null
    || currentRevision === null
    || selectedText === null
    || documentExcerpt === null
    || recentChanges.some((value) => value === null)) return null;
  return {
    documentKind: document.kind,
    documentTitle,
    currentRevision,
    selectedText,
    documentExcerpt,
    recentChanges,
  };
}

function projectCollaborationContext(
  data: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!Array.isArray(data.tasks)
    || data.tasks.length > 20
    || !Array.isArray(data.comments)
    || data.comments.length > 20) return null;
  const tasks = data.tasks.map((value) => {
    const task = plain(value);
    const status = task && modelText(task.status, 40);
    const category = task && modelText(task.category, 40);
    const instruction = task && modelText(task.instruction, 1_000);
    return status !== null && category !== null && instruction !== null
      ? { status, category, instruction }
      : null;
  });
  const comments = data.comments.map((value) => {
    const comment = plain(value);
    const body = comment && modelText(comment.body, 2_000);
    const evidenceRefs = comment
      ? modelStringArray(comment.evidenceRefs, 12, 240, false)
      : null;
    return body !== null && evidenceRefs !== null ? { body, evidenceRefs } : null;
  });
  if (tasks.some((value) => value === null) || comments.some((value) => value === null)) {
    return null;
  }
  return { tasks, comments };
}

function projectComment(data: Record<string, unknown>): Record<string, unknown> | null {
  const comment = plain(data.comment);
  if (!comment) return null;
  const body = modelText(comment.body, 2_000);
  const evidenceRefs = modelStringArray(comment.evidenceRefs, 12, 240, false);
  return body !== null && evidenceRefs !== null
    ? { status: "COMMENTED", body, evidenceRefs }
    : null;
}

function projectSubmission(data: Record<string, unknown>): Record<string, unknown> | null {
  const revision = plain(data.revision);
  const task = plain(data.task);
  const result = task && plain(task.result);
  if (!revision || !task || !result || task.status !== "COMPLETED") return null;
  const resultRevision = safeInteger(revision.revision, 1);
  const resultSummary = modelText(result.resultSummary, 240);
  const evidenceRefs = modelStringArray(result.evidenceRefs, 12, 240, true);
  return resultRevision !== null && resultSummary !== null && evidenceRefs !== null
    ? { status: "COMMITTED", resultRevision, resultSummary, evidenceRefs }
    : null;
}

function projectMetrics(data: Record<string, unknown>): Record<string, unknown> | null {
  if (!validSyntheticSource(data)
    || (data.dataset !== "northstar_launch_capacity"
      && data.dataset !== "inc_482_checkout_impact")) return null;
  const question = modelText(data.question, 500);
  const facts = plain(data.facts);
  if (!facts || question === null) return null;
  if (data.dataset === "northstar_launch_capacity") {
    const evidenceRefs = knownSyntheticEvidence(data.evidenceRefs, [
      "northstar_launch_capacity",
    ]);
    const preBetaCapacityDays = safeInteger(facts.preBetaCapacityDays, 0);
    const reliabilityDays = safeInteger(facts.reliabilityDays, 0);
    const inviteOnlyBetaDays = safeInteger(facts.inviteOnlyBetaDays, 0);
    const fullExportDays = safeInteger(facts.fullExportDays, 0);
    const inviteOnlyBetaDate = modelText(facts.inviteOnlyBetaDate, 80);
    const fullGaDate = modelText(facts.fullGaDate, 80);
    const conclusion = modelText(data.requiredConclusion, 1_000);
    if (evidenceRefs === null
      || preBetaCapacityDays === null
      || reliabilityDays === null
      || inviteOnlyBetaDays === null
      || fullExportDays === null
      || inviteOnlyBetaDate === null
      || fullGaDate === null
      || conclusion === null) return null;
    return {
      sourceLabel: SYNTHETIC_SOURCE_LABEL,
      dataset: data.dataset,
      question,
      findings: [
        `Pre-beta capacity is ${preBetaCapacityDays} days.`,
        `Reliability needs ${reliabilityDays} days; invite-only beta export needs ${inviteOnlyBetaDays}; full export needs ${fullExportDays}.`,
        `Invite-only beta is ${inviteOnlyBetaDate}; full GA is ${fullGaDate}.`,
        conclusion,
      ],
      evidenceRefs,
    };
  }
  const evidenceRefs = knownSyntheticEvidence(data.evidenceRefs, ["impact.csv"]);
  const incidentStartUtc = modelText(facts.incidentStartUtc, 40);
  const incidentRecoveryUtc = modelText(facts.incidentRecoveryUtc, 40);
  const checkoutAttempts = safeInteger(facts.checkoutAttempts, 0);
  const succeededAttempts = safeInteger(facts.succeededAttempts, 0);
  const failedAttempts = safeInteger(facts.failedAttempts, 0);
  const affectedMerchants = safeInteger(facts.affectedMerchants, 0);
  const duplicateCharges = safeInteger(facts.duplicateCharges, 0);
  if (evidenceRefs === null
    || incidentStartUtc === null
    || incidentRecoveryUtc === null
    || checkoutAttempts === null
    || succeededAttempts === null
    || failedAttempts === null
    || affectedMerchants === null
    || duplicateCharges === null) return null;
  return {
    sourceLabel: SYNTHETIC_SOURCE_LABEL,
    dataset: data.dataset,
    question,
    findings: [
      `The synthetic incident window ran from ${incidentStartUtc} UTC to ${incidentRecoveryUtc} UTC.`,
      `${checkoutAttempts} checkout attempts included ${succeededAttempts} successes and ${failedAttempts} failures.`,
      `${affectedMerchants} merchants were affected; duplicate charges: ${duplicateCharges}.`,
    ],
    evidenceRefs,
  };
}

function projectCodeSearch(data: Record<string, unknown>): Record<string, unknown> | null {
  if (!validSyntheticSource(data) || !Array.isArray(data.results)) return null;
  const query = modelText(data.query, 300);
  const searchScope = modelText(data.searchScope, 240);
  if (query === null || searchScope === null) return null;
  const matches = data.results.slice(0, 4).map((value) => {
    const match = plain(value);
    if (!match || typeof match.path !== "string") return null;
    const known = SYNTHETIC_CODE_SOURCES[
      match.path as keyof typeof SYNTHETIC_CODE_SOURCES
    ];
    if (!known
      || match.kind !== known.kind
      || match.evidenceRef !== known.evidenceRef
      || match.sourceLabel !== `${SYNTHETIC_SOURCE_LABEL} · ${known.evidenceRef}`) return null;
    const path = modelText(match.path, 240);
    const sourceLabel = modelText(match.sourceLabel, 240);
    const summary = modelText(match.summary, 1_000);
    return path !== null && sourceLabel !== null && summary !== null
      ? {
        path,
        kind: known.kind,
        evidenceRef: known.evidenceRef,
        sourceLabel,
        summary,
      }
      : null;
  });
  if (matches.some((value) => value === null)) return null;
  return { sourceLabel: SYNTHETIC_SOURCE_LABEL, query, searchScope, matches };
}

function projectDemoFile(data: Record<string, unknown>): Record<string, unknown> | null {
  if (!validSyntheticSource(data) || typeof data.path !== "string") return null;
  const known = SYNTHETIC_CODE_SOURCES[
    data.path as keyof typeof SYNTHETIC_CODE_SOURCES
  ];
  if (!known
    || data.kind !== known.kind
    || data.evidenceRef !== known.evidenceRef) return null;
  const evidenceRefs = exactSyntheticEvidence(
    data.evidenceRefs,
    CHECKOUT_INCIDENT_EVIDENCE_REFS,
  );
  const path = modelText(data.path, 240);
  const content = modelText(data.content, 8_000, true);
  const facts = plain(data.facts);
  if (evidenceRefs === null || path === null || content === null || !facts) return null;
  const findings = known.kind === "CODE"
    ? codeFindings(facts)
    : logFindings(facts);
  if (!findings) return null;
  return {
    sourceLabel: SYNTHETIC_SOURCE_LABEL,
    path,
    kind: known.kind,
    evidenceRef: known.evidenceRef,
    content,
    findings,
    evidenceRefs,
  };
}

function projectStyleGuide(data: Record<string, unknown>): Record<string, unknown> | null {
  if (!validSyntheticSource(data) || !Array.isArray(data.rules)) return null;
  const guide = modelText(data.guide, 240);
  const evidenceRefs = knownSyntheticEvidence(data.evidenceRefs, [
    "Ratiflow company style guide",
  ]);
  if (guide === null || evidenceRefs === null || data.rules.length > 12) return null;
  const rules = data.rules.map((value) => {
    const rule = plain(value);
    if (!rule || typeof rule.id !== "string") return null;
    const label = STYLE_RULE_LABELS[rule.id as keyof typeof STYLE_RULE_LABELS];
    const instruction = modelText(rule.instruction, 1_000);
    return label && instruction !== null ? { label, instruction } : null;
  });
  if (rules.length < 1 || rules.some((value) => value === null)) return null;
  return { sourceLabel: SYNTHETIC_SOURCE_LABEL, guide, rules, evidenceRefs };
}

function projectConsistency(data: Record<string, unknown>): Record<string, unknown> | null {
  if (!validSyntheticSource(data)
    || !["NEEDS_REVISION", "REVIEW", "PASS"].includes(String(data.status))
    || !Array.isArray(data.issues)
    || data.issues.length > 12) return null;
  const evidenceRefs = exactSyntheticEvidence(
    data.evidenceRefs,
    GENERAL_EDITORIAL_EVIDENCE_REFS,
  );
  if (evidenceRefs === null) return null;
  const issues = data.issues.map((value) => {
    const issue = plain(value);
    if (!issue
      || (issue.severity !== "ERROR" && issue.severity !== "WARNING")) return null;
    const message = modelText(issue.message, 1_000);
    return message === null ? null : { severity: issue.severity, message };
  });
  if (issues.some((value) => value === null)) return null;
  return {
    sourceLabel: SYNTHETIC_SOURCE_LABEL,
    status: data.status,
    issues,
    evidenceRefs,
  };
}

function codeFindings(facts: Record<string, unknown>): string[] | null {
  const behavior = modelText(facts.behavior, 1_000);
  const ignoredHeader = modelText(facts.ignoredHeader, 120);
  const retries = safeInteger(facts.maximumZeroDelayRetries, 0);
  const delay = safeInteger(facts.retryDelayMs, 0);
  const role = modelText(facts.roleInIncident, 120);
  return behavior !== null
    && ignoredHeader !== null
    && retries !== null
    && delay !== null
    && role !== null
    ? [
      behavior,
      `Ignored header: ${ignoredHeader}; maximum zero-delay retries: ${retries}; delay: ${delay} ms.`,
      `Incident role: ${role}.`,
    ]
    : null;
}

function logFindings(facts: Record<string, unknown>): string[] | null {
  const start = modelText(facts.provider429StartedUtc, 40);
  const multiple = safeNumber(facts.retryTrafficMultiple, 0);
  const before = safeInteger(facts.queueDepthBefore, 0);
  const peak = safeInteger(facts.queueDepthPeak, 0);
  const rollback = modelText(facts.rollbackUtc, 40);
  const recovery = modelText(facts.recoveryUtc, 40);
  const role = modelText(facts.providerThrottlingRole, 120);
  return start !== null
    && multiple !== null
    && before !== null
    && peak !== null
    && rollback !== null
    && recovery !== null
    && role !== null
    ? [
      `Synthetic provider throttling began at ${start} UTC; retry traffic reached ${multiple}×.`,
      `Queue depth grew from ${before} to ${peak}.`,
      `Rollback began at ${rollback} UTC and recovery completed at ${recovery} UTC.`,
      `Incident role: ${role}.`,
    ]
    : null;
}

function syntheticEvidenceFromProjection(
  logicalName: ManagedAgentLogicalToolName,
  data: Record<string, unknown>,
): string[] | null {
  if (![
    "query_demo_metrics",
    "read_demo_file",
    "read_company_style_guide",
    "check_document_consistency",
  ].includes(logicalName)) return [];
  return Array.isArray(data.evidenceRefs)
    && data.evidenceRefs.every((value) => typeof value === "string")
    ? [...data.evidenceRefs] as string[]
    : null;
}

function validSyntheticSource(data: Record<string, unknown>): boolean {
  return data.sourceLabel === SYNTHETIC_SOURCE_LABEL
    && data.liveSystemQueried === false
    && typeof data.fixtureVersion === "string"
    && data.fixtureVersion.length > 0;
}

function knownSyntheticEvidence(value: unknown, allowed: readonly string[]): string[] | null {
  if (!Array.isArray(value)
    || value.length < 1
    || value.length > 12
    || value.some((entry) => typeof entry !== "string")
    || new Set(value).size !== value.length
    || value.some((entry) => !allowed.includes(entry as string))) return null;
  return [...value] as string[];
}

function exactSyntheticEvidence(value: unknown, expected: readonly string[]): string[] | null {
  return jsonValuesEqual(value, expected) ? [...expected] : null;
}

function modelStringArray(
  value: unknown,
  maxItems: number,
  maxTextLength: number,
  requireOne: boolean,
): string[] | null {
  if (!Array.isArray(value)
    || value.length > maxItems
    || (requireOne && value.length < 1)) return null;
  const projected = value.map((entry) => modelText(entry, maxTextLength));
  return projected.some((entry) => entry === null)
    ? null
    : projected as string[];
}

function modelText(value: unknown, maxLength: number, allowEmpty = false): string | null {
  if (typeof value !== "string") return null;
  const bounded = [...value].slice(0, maxLength).join("");
  const sanitized = sanitizeUntrustedText(bounded, maxLength * 4);
  if (sanitized === null) return null;
  const redacted = sanitized
    .replace(MODEL_UUID_PATTERN, "[REDACTED_UUID]")
    .replace(MODEL_HANDLE_PATTERN, "$1[REDACTED_HANDLE]")
    .replace(MODEL_JWT_PATTERN, "[REDACTED_TOKEN]")
    .replace(MODEL_INTERNAL_ID_PATTERN, "[REDACTED_INTERNAL_ID]")
    .replace(MODEL_RANGE_COORDINATE_PATTERN, "[REDACTED_RANGE]")
    .replace(MODEL_LONG_TOKEN_PATTERN, "[REDACTED_TOKEN]")
    .trim();
  return redacted.length > 0 || allowEmpty ? redacted : null;
}

function plain(value: unknown): Record<string, unknown> | null {
  return isPlainRecord(value) ? value : null;
}

function safeInteger(value: unknown, minimum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum
    ? value as number
    : null;
}

function safeNumber(value: unknown, minimum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? value
    : null;
}

function isManagedAgentExpertise(
  value: unknown,
): value is (typeof MANAGED_AGENT_EXPERTISES)[number] {
  return MANAGED_AGENT_EXPERTISES.some((expertise) => expertise === value);
}

function invalidToolResult(): RelayResult<never> {
  return relayFailure(
    "RELAY_RESULT_INVALID",
    "The stored WebMCP tool result could not be safely projected for the model.",
    false,
    "Retry the managed run with a new attempt.",
  );
}

function providerOutcomeUnknown(): RelayResult<never> {
  return relayFailure(
    "RELAY_PROVIDER_OUTCOME_UNKNOWN",
    "The managed agent provider response was lost after dispatch.",
    false,
    "Wait for authoritative reconciliation before retrying.",
  );
}

export function buildExpectedManifest(
  origin: string,
  accessProfile: RelayAccessProfile,
  runtime: string,
  registrationScope: string,
  registrationGeneration: number,
): RelayResult<ExpectedManifest> {
  if (!isRelayAccessProfile(accessProfile)
    || runtime !== MANAGED_AGENT_RUNTIME
    || !validOrigin(origin)
    || !REGISTRATION_SCOPE_PATTERN.test(registrationScope)
    || !Number.isInteger(registrationGeneration)
    || registrationGeneration < 1) return manifestFailure();
  const policy = relayAccessPolicy(accessProfile);
  const logicalNames = [...policy.logicalToolNames];

  const entries: RelayNormalizedToolManifestEntry[] = [];
  const tools: RelayProviderFunctionTool[] = [];
  const byPhysicalName: ExpectedManifest["byPhysicalName"] = new Map();
  for (const logicalName of logicalNames) {
    const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
    const physicalName = [
      "rf",
      policy.physicalDiscriminator,
      registrationScope,
      `g${registrationGeneration}`,
      definition.providerKey,
    ].join("_");
    if (physicalName.length > RELAY_PHYSICAL_TOOL_NAME_MAX_LENGTH
      || !RELAY_PHYSICAL_TOOL_NAME_PATTERN.test(physicalName)) return manifestFailure();
    entries.push({
      origin,
      physicalName,
      logicalName,
      registrationGeneration,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: {
        readOnlyHint: definition.annotations.readOnlyHint,
        untrustedContentHint: definition.annotations.untrustedContentHint,
      },
    });
    tools.push({
      type: "function",
      name: physicalName,
      description: definition.description,
      defer_loading: true,
      parameters: definition.inputSchema,
      strict: true,
    });
    byPhysicalName.set(physicalName, { logicalName, definition });
  }
  const manifest: RelayNormalizedToolManifest = {
    entries,
    digest: sha256Digest({ entries }),
  };
  return { ok: true, data: { manifest, tools, byPhysicalName } };
}

function validateStepRequest(request: RelayStepRequest): RelayResult<never> | null {
  if (!REQUEST_ID_PATTERN.test(request.requestId)
    || !validOrigin(request.requestOrigin)
    || !request.input.attemptId
    || !Number.isSafeInteger(request.input.expectedStep)
    || request.input.expectedStep < 0) {
    return relayFailure(
      "INVALID_INPUT",
      "The managed agent step request is invalid.",
      false,
    );
  }
  return null;
}

function validateAuthorizedContext(
  context: {
    run: RelayRun;
    attempt: {
      attemptId: string;
      runId: string;
      status: string;
      providerCallCount: number;
      toolCallCount: number;
      deadlineAt: string;
    };
    agent: { profileId: string };
  },
  input: RelayStepInput,
  now: Date,
): RelayResult<never> | null {
  const deadline = Date.parse(context.attempt.deadlineAt);
  const terminalAttempt = ["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"]
    .includes(context.attempt.status);
  const completingFinalResponse = input.action === "SUBMIT_FUNCTION_RESULT"
    && context.run.status === "COMPLETED"
    && context.run.terminalReason === "TASK_COMPLETED"
    && context.attempt.status === "SUCCEEDED";
  if (context.attempt.attemptId !== input.attemptId
    || context.attempt.runId !== context.run.runId
    || context.run.profileId !== context.agent.profileId
    || !isRelayAccessProfile(context.run.accessProfile)
    || (context.run.status !== "ACTIVE"
      && !(input.action === "SUBMIT_FUNCTION_RESULT" && context.run.status === "COMPLETED"))
    || (terminalAttempt && !completingFinalResponse)
    || !Number.isFinite(deadline)
    || deadline <= now.getTime()) {
    return relayFailure(
      "RELAY_STATE_CONFLICT",
      "The managed agent attempt is no longer eligible for this step.",
      false,
      "Read Relay state before retrying.",
    );
  }
  return null;
}

function retryRequired(
  run: RelayRun,
  attemptId: string,
  nextStep: number,
  now: Date,
  message: string,
): Extract<RelayStepOutcome, { outcome: "RETRY_REQUIRED" }> {
  const exhausted = run.attemptCount >= run.maxAttempts;
  const timestamp = now.toISOString();
  return {
    outcome: "RETRY_REQUIRED",
    attemptId,
    nextStep,
    run: {
      ...run,
      status: exhausted ? "EXHAUSTED" : "WAITING_RETRY",
      terminalReason: exhausted ? "ATTEMPTS_EXHAUSTED" : null,
      updatedAt: timestamp,
      completedAt: exhausted ? timestamp : null,
    },
    message,
  };
}

function validRelayResultEnvelope(output: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return false;
  }
  return matchesJsonSchema(
    parsed,
    MANAGED_AGENT_TOOL_DEFINITIONS.read_assignment.outputSchema,
  );
}

function validOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && parsed.origin === origin
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

function continuationMismatch(): RelayResult<never> {
  return relayFailure(
    "RELAY_STATE_CONFLICT",
    "The managed agent continuation does not match the reserved prior step.",
    false,
  );
}

function invalidProviderTransition(): RelayResult<never> {
  return relayFailure(
    "RELAY_RESULT_INVALID",
    "The managed agent provider requested an invalid or out-of-scope transition.",
    false,
    "Retry the managed run with a new attempt.",
  );
}

function manifestFailure(): RelayResult<never> {
  return relayFailure(
    "RELAY_MANIFEST_MISMATCH",
    "The page tool manifest does not match this managed Relay attempt.",
    false,
  );
}

export function parseRelayStepInput(value: unknown): RelayStepInput | null {
  if (!isPlainRecord(value)
    || typeof value.action !== "string"
    || typeof value.attemptId !== "string"
    || value.attemptId.length < 1
    || value.attemptId.length > 256
    || !Number.isSafeInteger(value.expectedStep)
    || (value.expectedStep as number) < 0) return null;

  if (value.action === "START") {
    return hasOnlyKeys(value, ["action", "attemptId", "expectedStep"])
      ? value as unknown as RelayStepInput
      : null;
  }
  if (value.action === "SUBMIT_SEARCH_RESULT") {
    return hasOnlyKeys(value, [
      "action", "attemptId", "expectedStep", "toolSearchCallId", "manifest",
    ])
      && safeOpaqueId(value.toolSearchCallId)
      && isPlainRecord(value.manifest)
      && Array.isArray(value.manifest.entries)
      && typeof value.manifest.digest === "string"
      ? value as unknown as RelayStepInput
      : null;
  }
  if (value.action === "SUBMIT_FUNCTION_RESULT") {
    return hasOnlyKeys(value, [
      "action", "attemptId", "expectedStep", "functionCallId", "resultReceiptId",
    ])
      && safeOpaqueId(value.functionCallId)
      && safeOpaqueId(value.resultReceiptId)
      ? value as unknown as RelayStepInput
      : null;
  }
  return null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => keys.includes(key));
}

function safeOpaqueId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && utf8Bytes(value) <= 512
    && !/[\u0000-\u001F\u007F]/.test(value);
}
