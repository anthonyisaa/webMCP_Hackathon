import {
  MANAGED_AGENT_TOOL_DEFINITIONS,
  RELAY_BOUNDS,
  RELAY_PHYSICAL_TOOL_NAME_PATTERN,
  type DirectoryMentionReceipt,
  type RelayAttempt,
  type RelayBeginStepResult,
  type RelayBrowserTraceInput,
  type RelayClaimOutcome,
  type RelayClaimedAttemptView,
  type RelayExecutionPermit,
  type RelayExecutionPermitClaims,
  type RelayExecutionPermitToken,
  type RelayFailure,
  type RelayGrant,
  type RelayGrantClaims,
  type RelayNormalizedToolManifest,
  type RelayProgressCommentInput,
  type RelayReadAssignmentResult,
  type RelayReadDocumentContextResult,
  type RelayResult,
  type RelayRun,
  type RelayStepOutcome,
  type RelayStepRecordInput,
  type RelayStepReservationInput,
  type RelaySubmitRevisionInput,
  type RelayToolInvocationContext,
  type RelayTraceEvent,
  type RelayWorkspaceState,
  type SpecialistFixturePort,
} from "@/agent-relay/contracts";
import {
  RepositoryRelayTokenCodec,
  relayCanonicalJson,
  relaySecretDigest,
  relaySha256,
  validRelaySigningSecret,
} from "@/domain/repository-relay-security";
import { capabilityGrantMatchesPolicy } from "@/agent-relay/access-policy";
import {
  RELAY_CAPABILITY_CONTRACT_VALUE,
  type CreateDirectoryMentionServiceInput,
  type IssueComment,
  type IssueRevision,
  type IssueTask,
  type RepositoryFailure,
  type RepositoryResult,
} from "@/repository/contracts";
import type {
  IssueRelayPermitInput,
  IssueRelayToolExecutionInput,
  RepositoryRelayServicePort,
} from "@/domain/repository-relay-service";
import {
  RATIFLOW_REPOSITORY_SUPABASE_SERVICE_ROLE_KEY_ENV,
} from "@/domain/supabase/repository-supabase-service";
import {
  RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV,
  RATIFLOW_SUPABASE_URL_ENV,
} from "@/domain/supabase/ratiflow-supabase-service";

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;
type RelayBeginStepWire = RelayBeginStepResult & {
  permitClaims?: RelayExecutionPermitClaims;
  previousPermitClaims?: RelayExecutionPermitClaims;
};
type RelayStepRecordWire = {
  attempt: RelayAttempt;
  result: RelayResult<RelayStepOutcome>;
  permitClaims?: RelayExecutionPermitClaims;
};

const SIGNING_SECRET_ENV = "RATIFLOW_RELAY_SIGNING_SECRET";

export interface SupabaseRepositoryRelayServiceOptions {
  url: string;
  serviceRoleKey: string;
  signingSecret: string;
  fetch?: FetchLike;
  specialistFixturePort?: SpecialistFixturePort;
}

function relayFailure(
  code: RelayFailure["code"],
  message: string,
  retryable = false,
): RelayFailure {
  return { ok: false, code, message, retryable };
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRelayResult(value: unknown): value is RelayResult<unknown> {
  return isObject(value) && typeof value.ok === "boolean"
    && (value.ok
      ? Object.hasOwn(value, "data")
      : typeof value.code === "string"
        && typeof value.message === "string"
        && typeof value.retryable === "boolean");
}

function isCapabilityFirstRelayWorkspace(value: unknown): value is RelayWorkspaceState {
  if (!isObject(value) || !Array.isArray(value.directory) || !Array.isArray(value.runs)) {
    return false;
  }
  const managedAgents = value.directory.filter((entry) =>
    isObject(entry) && entry.identitySource === "DEMO_DIRECTORY");
  return managedAgents.length > 0
    && managedAgents.every((entry) => typeof entry.expertise === "string"
      && !Object.hasOwn(entry, "specialty")
      && !Object.hasOwn(entry, "logicalToolNames")
      && !Object.hasOwn(entry, "syntheticSourceLabels"))
    && value.runs.every((run) => isObject(run)
      && typeof run.agentExpertise === "string"
      && typeof run.accessProfile === "string"
      && !Object.hasOwn(run, "specialty"));
}

function repositoryFailure(value: RelayFailure): RepositoryFailure {
  const repositoryCodes = new Set([
    "INVALID_INPUT", "UNAUTHORIZED", "AGENT_IDENTITY_REQUIRED", "STALE_AGENT_PROFILE",
    "NOT_FOUND", "STALE_DOCUMENT", "STALE_TASK_CONTEXT", "TASK_MODE_VIOLATION",
    "REQUEST_REPLAY_MISMATCH", "STALE_PAGE_CONTEXT", "WAIT_ALREADY_ACTIVE",
    "RATE_LIMITED", "PROTOCOL_MISMATCH",
  ]);
  return {
    ok: false,
    code: repositoryCodes.has(value.code)
      ? value.code as RepositoryFailure["code"]
      : "PROTOCOL_MISMATCH",
    message: value.message,
    retryable: value.retryable,
  };
}

/** Durable protocol-4 sidecar adapter. Every mutation is finalized by one database RPC. */
export class SupabaseRepositoryRelayService implements RepositoryRelayServicePort {
  readonly #endpoint: string;
  readonly #serviceRoleKey: string;
  readonly #request: FetchLike;
  readonly #tokens: RepositoryRelayTokenCodec;
  readonly #specialistFixturePort?: SpecialistFixturePort;
  #capabilityFirstStoreReady = false;

  constructor(options: SupabaseRepositoryRelayServiceOptions) {
    if (!/^https:\/\//u.test(options.url) || !options.serviceRoleKey
      || !validRelaySigningSecret(options.signingSecret)) {
      throw new Error("A HTTPS Supabase URL, service-role key, and Relay signing secret are required.");
    }
    this.#endpoint = `${options.url.replace(/\/$/u, "")}/rest/v1/rpc`;
    this.#serviceRoleKey = options.serviceRoleKey;
    this.#request = options.fetch ?? fetch;
    this.#tokens = new RepositoryRelayTokenCodec(options.signingSecret);
    this.#specialistFixturePort = options.specialistFixturePort;
  }

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
    specialistFixturePort?: SpecialistFixturePort,
  ): SupabaseRepositoryRelayService | undefined {
    const url = environment[RATIFLOW_SUPABASE_URL_ENV];
    const serviceRoleKey = environment[RATIFLOW_REPOSITORY_SUPABASE_SERVICE_ROLE_KEY_ENV];
    const signingSecret = environment[SIGNING_SECRET_ENV];
    if (!url || !serviceRoleKey || !validRelaySigningSecret(signingSecret)) return undefined;
    // A publishable key still gates ordinary v4.1 selection; the Relay uses service role only.
    if (!environment[RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV]) return undefined;
    return new SupabaseRepositoryRelayService({
      url,
      serviceRoleKey,
      signingSecret,
      specialistFixturePort,
    });
  }

  async createDirectoryMention(
    sessionToken: string,
    input: CreateDirectoryMentionServiceInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<DirectoryMentionReceipt>> {
    if (isObject(input.target) && input.target.kind === "AGENT") {
      const ready = await this.#requireCapabilityFirstStore(sessionToken, signal);
      if (!ready.ok) return ready;
    }
    return this.#rpc("ratiflow_create_issue_directory_mention_v4", {
      p_handle: sessionToken,
      p_request_id: input.requestId,
      p_input: { ...input, requestId: undefined },
    }, signal);
  }

  async readRelayState(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayWorkspaceState>> {
    const result = await this.#rpc<unknown>(
      "ratiflow_read_issue_relay_state_v4",
      { p_handle: sessionToken },
      signal,
    );
    if (!result.ok) return result;
    if (!isCapabilityFirstRelayWorkspace(result.data)) {
      return relayFailure(
        "RELAY_UNAVAILABLE",
        "The capability-first Relay store is not ready.",
        true,
      );
    }
    this.#capabilityFirstStoreReady = true;
    return result as RelayResult<RelayWorkspaceState>;
  }

  async claimRelay(
    sessionToken: string,
    pageSessionId: string,
    requestId: string,
    retryRunId?: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimOutcome>> {
    const ready = await this.#requireCapabilityFirstStore(sessionToken, signal);
    if (!ready.ok) return ready;
    const reserved = await this.#rpc<RelayClaimOutcome & { grantClaims?: RelayGrantClaims }>(
      "ratiflow_claim_issue_relay_v4",
      {
        p_handle: sessionToken,
        p_page_session_id: pageSessionId,
        p_request_id: requestId,
        p_retry_run_id: retryRunId ?? null,
        p_contract: RELAY_CAPABILITY_CONTRACT_VALUE,
      },
      signal,
    );
    if (!reserved.ok || reserved.data.outcome !== "CLAIMED") return reserved;
    const claims = reserved.data.grantClaims;
    if (!claims
      || !capabilityGrantMatchesPolicy(reserved.data.capabilityGrant)
      || reserved.data.run.accessProfile !== reserved.data.capabilityGrant.accessProfile
      || reserved.data.run.agentExpertise !== reserved.data.agent.expertise) {
      return relayFailure(
        "RELAY_RESULT_INVALID",
        "The durable claim omitted its grant or capability binding.",
      );
    }
    const grant = this.#tokens.signGrant(claims);
    const finalized = await this.#rpc<true>("ratiflow_transition_issue_relay_attempt_v4", {
      p_action: "FINALIZE_GRANT",
      p_grant_claims: claims,
      p_grant_digest: relaySecretDigest(grant),
      p_input: {},
    }, signal);
    if (!finalized.ok) return finalized;
    const { grantClaims: _grantClaims, ...claim } = reserved.data;
    void _grantClaims;
    return { ok: true, data: { ...claim, grant } as RelayClaimOutcome };
  }

  renewRelayLease(
    grant: RelayGrant,
    expectedLeaseId: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimedAttemptView>> {
    return this.#grantRpc("ratiflow_renew_issue_relay_lease_v4", grant, {
      p_expected_lease_id: expectedLeaseId,
    }, signal);
  }

  releaseRelayLease(
    grant: RelayGrant,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayRun>> {
    return this.#grantRpc("ratiflow_release_issue_relay_v4", grant, {}, signal);
  }

  async issueExecutionPermit(
    grant: RelayGrant,
    input: IssueRelayPermitInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayExecutionPermit>> {
    const reserved = await this.#transition<{ claims: RelayExecutionPermitClaims }>(
      grant, "ISSUE_PERMIT", {
        ...input,
        argumentsDigest: relaySha256(input.arguments),
      }, signal,
    );
    if (!reserved.ok) return reserved;
    const token = this.#tokens.signPermit(reserved.data.claims);
    const finalized = await this.#transition<true>(grant, "FINALIZE_PERMIT", {
      claims: reserved.data.claims,
      tokenDigest: relaySecretDigest(token),
    }, signal);
    return finalized.ok
      ? { ok: true, data: this.#executionPermit(reserved.data.claims, token) }
      : finalized;
  }

  async executeRelayTool(
    grant: RelayGrant,
    input: IssueRelayToolExecutionInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ resultReceiptId: string; output: string }>> {
    const permitClaims = this.#tokens.verifyPermit(input.permit);
    if (!permitClaims) return relayFailure("RELAY_EXECUTION_NOT_ARMED", "The Relay permit is invalid.");
    const begun = await this.#grantRpc<{
      disposition: "AUTHORIZED" | "RECORDED" | "IN_PROGRESS";
      context?: RelayToolInvocationContext;
      result?: { resultReceiptId: string; output: string };
    }>("ratiflow_begin_issue_relay_tool_v4", grant, {
      p_permit_claims: permitClaims,
      p_permit_digest: relaySecretDigest(input.permit),
      p_request_id: input.requestId,
      p_physical_tool_name: input.physicalToolName,
      p_input: input.input,
    }, signal);
    if (!begun.ok) return begun;
    if (begun.data.disposition === "RECORDED" && begun.data.result) {
      return { ok: true, data: begun.data.result };
    }
    if (begun.data.disposition !== "AUTHORIZED" || !begun.data.context) {
      return relayFailure("RELAY_STATE_CONFLICT", "The durable managed tool call is already in progress.", true);
    }
    let result: RepositoryResult<Readonly<Record<string, unknown>>>;
    try {
      result = await this.#invokeManagedTool(begun.data.context, input.input, signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      result = {
        ok: false,
        code: "PROTOCOL_MISMATCH",
        message: "The managed tool execution failed before producing a valid result.",
        retryable: false,
      };
    }
    const mutableTool = begun.data.context.logicalToolName === "comment_on_assignment"
      || begun.data.context.logicalToolName === "submit_scoped_revision";
    if (!result.ok && result.retryable && result.code === "PROTOCOL_MISMATCH" && mutableTool) {
      result = await this.#invokeManagedTool(begun.data.context, input.input);
      if (!result.ok && result.retryable && result.code === "PROTOCOL_MISMATCH") {
        return relayFailure(
          "RELAY_UNAVAILABLE",
          "The managed mutation outcome is still being reconciled.",
          true,
        );
      }
    }
    const envelope = result.ok
      ? { ok: true as const, data: result.data }
      : { ok: false as const, code: result.code, message: result.message, retryable: result.retryable };
    let output: string;
    try {
      output = relayCanonicalJson(envelope);
      if (Buffer.byteLength(output, "utf8") > RELAY_BOUNDS.maxVerifiedToolResultBytes) {
        throw new Error("Relay result exceeds its durable bound.");
      }
    } catch {
      output = relayCanonicalJson({
        ok: false as const,
        code: "PROTOCOL_MISMATCH",
        message: "The managed tool result could not be serialized within its durable bound.",
        retryable: false,
      });
    }
    return this.#grantRpc("ratiflow_finish_issue_relay_tool_v4", grant, {
      p_permit_claims: permitClaims,
      p_request_id: input.requestId,
      p_output: output,
    }, AbortSignal.timeout(10_000));
  }

  recordRelayManifest(
    grant: RelayGrant,
    manifest: RelayNormalizedToolManifest,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ digest: `sha256:${string}` }>> {
    const claims = this.#tokens.verifyGrant(grant);
    if (!claims) return Promise.resolve(relayFailure("UNAUTHORIZED", "The Relay grant is invalid."));
    if (!this.#validRelayManifestShape(manifest, claims.registrationGeneration)) {
      return Promise.resolve(relayFailure(
        "RELAY_MANIFEST_MISMATCH",
        "The page tool manifest is not a valid managed catalog.",
      ));
    }
    return this.#transition(grant, "RECORD_MANIFEST", { manifest }, signal);
  }

  recordRelayTrace(
    grant: RelayGrant,
    input: RelayBrowserTraceInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayTraceEvent>> {
    return this.#grantRpc("ratiflow_record_issue_relay_trace_v4", grant, {
      p_input: input,
    }, signal);
  }

  async beginStep(
    grant: RelayGrant,
    reservation: RelayStepReservationInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayBeginStepResult>> {
    const response = await this.#transition<RelayBeginStepWire>(
      grant, "BEGIN_STEP", reservation, signal,
    );
    if (!response.ok) return response;
    const data = response.data;
    if (data.disposition === "RECORDED") {
      const result = this.#hydrateStepResult(data.result, data.permitClaims);
      return result.ok
        ? { ok: true, data: { disposition: "RECORDED", result: result.data } }
        : result;
    }
    if (data.disposition === "AUTHORIZED"
      && data.context.previousOutcome?.outcome === "EXECUTE_TOOL") {
      const previous = this.#hydrateStepResult(
        { ok: true, data: data.context.previousOutcome },
        data.previousPermitClaims,
      );
      if (!previous.ok) return previous;
      if (!previous.data.ok) {
        return relayFailure("RELAY_RESULT_INVALID", "The persisted prior step is invalid.");
      }
      return {
        ok: true,
        data: {
          disposition: "AUTHORIZED",
          context: { ...data.context, previousOutcome: previous.data.data },
        },
      };
    }
    return { ok: true, data };
  }

  async recordStepResult(
    grant: RelayGrant,
    record: RelayStepRecordInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ attempt: RelayAttempt; result: RelayResult<RelayStepOutcome> }>> {
    const persisted = this.#stripPermitToken(record.result);
    if (!persisted.ok) return persisted;
    const response = await this.#transition<RelayStepRecordWire>(grant, "RECORD_STEP_RESULT", {
      ...record,
      result: persisted.data,
    }, signal);
    if (!response.ok) return response;
    const result = this.#hydrateStepResult(response.data.result, response.data.permitClaims);
    return result.ok
      ? { ok: true, data: { attempt: response.data.attempt, result: result.data } }
      : result;
  }

  loadVerifiedToolResult(
    grant: RelayGrant,
    resultReceiptId: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ functionCallId: string; output: string }>> {
    return this.#transition(grant, "LOAD_VERIFIED_TOOL_RESULT", { resultReceiptId }, signal);
  }

  readAssignment(
    context: RelayToolInvocationContext,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<RelayReadAssignmentResult>> {
    return this.#repositoryTransition(context, "READ_ASSIGNMENT", {}, signal);
  }

  readDocumentContext(
    context: RelayToolInvocationContext,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<RelayReadDocumentContextResult>> {
    return this.#repositoryTransition(context, "READ_DOCUMENT_CONTEXT", {}, signal);
  }

  readCollaborationContext(
    context: RelayToolInvocationContext,
    limit: number,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<{ tasks: IssueTask[]; comments: IssueComment[] }>> {
    return this.#repositoryTransition(context, "READ_COLLABORATION_CONTEXT", { limit }, signal);
  }

  commentOnAssignment(
    context: RelayToolInvocationContext,
    input: RelayProgressCommentInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<{ comment: IssueComment }>> {
    return this.#repositoryTransition(context, "COMMENT_ON_ASSIGNMENT", input, signal);
  }

  submitScopedRevision(
    context: RelayToolInvocationContext,
    input: RelaySubmitRevisionInput,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<{ revision: IssueRevision; task: IssueTask }>> {
    return this.#repositoryTransition(context, "SUBMIT_SCOPED_REVISION", input, signal);
  }

  async #repositoryTransition<T>(
    context: RelayToolInvocationContext,
    action: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<T>> {
    const result = await this.#rpc<T>("ratiflow_transition_issue_relay_attempt_v4", {
      p_action: action,
      p_context: context,
      p_input: input,
    }, signal);
    return result.ok ? result : repositoryFailure(result);
  }

  async #invokeManagedTool(
    context: RelayToolInvocationContext,
    input: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<RepositoryResult<Readonly<Record<string, unknown>>>> {
    const cast = <T>(value: RepositoryResult<T>) => value as unknown as RepositoryResult<Readonly<Record<string, unknown>>>;
    switch (context.logicalToolName) {
      case "read_assignment": return cast(await this.readAssignment(context, signal));
      case "read_document_context": return cast(await this.readDocumentContext(context, signal));
      case "read_collaboration_context": return cast(await this.readCollaborationContext(context, Number(input.limit), signal));
      case "comment_on_assignment": return cast(await this.commentOnAssignment(context, input as unknown as RelayProgressCommentInput, signal));
      case "submit_scoped_revision": return cast(await this.submitScopedRevision(context, input as unknown as RelaySubmitRevisionInput, signal));
      case "query_demo_metrics": return this.#fixture(() => this.#specialistFixturePort?.queryDemoMetrics(input as never, signal));
      case "search_demo_code": return this.#fixture(() => this.#specialistFixturePort?.searchDemoCode(input as never, signal));
      case "read_demo_file": return this.#fixture(() => this.#specialistFixturePort?.readDemoFile(input as never, signal));
      case "read_company_style_guide": return this.#fixture(() => this.#specialistFixturePort?.readCompanyStyleGuide(signal));
      case "check_document_consistency": return this.#fixture(() => this.#specialistFixturePort?.checkDocumentConsistency(input as never, signal));
    }
  }

  async #fixture(
    invoke: () => Promise<Readonly<Record<string, unknown>>> | undefined,
  ): Promise<RepositoryResult<Readonly<Record<string, unknown>>>> {
    const promise = invoke();
    return promise
      ? { ok: true, data: await promise }
      : { ok: false, code: "PROTOCOL_MISMATCH", message: "The synthetic fixture is unavailable.", retryable: false };
  }

  #transition<T>(
    grant: RelayGrant,
    action: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<RelayResult<T>> {
    return this.#grantRpc("ratiflow_transition_issue_relay_attempt_v4", grant, {
      p_action: action,
      p_input: input,
    }, signal);
  }

  async #requireCapabilityFirstStore(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<true>> {
    if (this.#capabilityFirstStoreReady) return { ok: true, data: true };
    const state = await this.readRelayState(sessionToken, signal);
    return state.ok ? { ok: true, data: true } : state;
  }

  #grantRpc<T>(
    functionName: string,
    grant: RelayGrant,
    parameters: JsonObject,
    signal?: AbortSignal,
  ): Promise<RelayResult<T>> {
    const claims = this.#tokens.verifyGrant(grant);
    if (!claims) return Promise.resolve(relayFailure("UNAUTHORIZED", "The Relay grant is invalid."));
    return this.#rpc(functionName, {
      p_grant_claims: claims,
      p_grant_digest: relaySecretDigest(grant),
      ...parameters,
    }, signal);
  }

  async #rpc<T>(
    functionName: string,
    parameters: JsonObject,
    signal?: AbortSignal,
  ): Promise<RelayResult<T>> {
    let response: Response;
    try {
      response = await this.#request(`${this.#endpoint}/${functionName}`, {
        method: "POST",
        headers: {
          apikey: this.#serviceRoleKey,
          Authorization: `Bearer ${this.#serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parameters, (_key, value) => value === undefined ? undefined : value),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return relayFailure("RELAY_UNAVAILABLE", "The durable Relay store is unavailable.", true);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return relayFailure("RELAY_UNAVAILABLE", "The durable Relay store returned an invalid response.", true);
    }
    if (!response.ok || !isRelayResult(payload)) {
      return relayFailure("RELAY_UNAVAILABLE", "The durable Relay request failed.", response.status >= 500);
    }
    return payload as RelayResult<T>;
  }

  #executionPermit(
    claims: RelayExecutionPermitClaims,
    token: RelayExecutionPermitToken,
  ): RelayExecutionPermit {
    return {
      token,
      attemptId: claims.attemptId,
      functionCallId: claims.functionCallId,
      physicalToolName: claims.physicalToolName,
      argumentsDigest: claims.argumentsDigest,
      registrationGeneration: claims.registrationGeneration,
      leaseId: claims.leaseId,
      expiresAt: claims.expiresAt,
    };
  }

  #stripPermitToken(
    result: RelayResult<RelayStepOutcome>,
  ): RelayResult<RelayResult<RelayStepOutcome>> {
    if (!result.ok || result.data.outcome !== "EXECUTE_TOOL") {
      return { ok: true, data: structuredClone(result) };
    }
    const claims = this.#tokens.verifyPermit(result.data.permit.token);
    if (!claims
      || claims.attemptId !== result.data.attemptId
      || claims.functionCallId !== result.data.functionCallId
      || claims.physicalToolName !== result.data.physicalToolName
      || claims.argumentsDigest !== result.data.permit.argumentsDigest) {
      return relayFailure("RELAY_RESULT_INVALID", "The step permit binding is invalid.");
    }
    const { token: _token, ...persistedPermit } = result.data.permit;
    void _token;
    return {
      ok: true,
      data: {
        ok: true,
        data: {
          ...structuredClone(result.data),
          permit: persistedPermit as RelayExecutionPermit,
        },
      },
    };
  }

  #hydrateStepResult(
    result: RelayResult<RelayStepOutcome>,
    claims?: RelayExecutionPermitClaims,
  ): RelayResult<RelayResult<RelayStepOutcome>> {
    if (!result.ok || result.data.outcome !== "EXECUTE_TOOL") {
      return { ok: true, data: structuredClone(result) };
    }
    if (!claims
      || claims.attemptId !== result.data.attemptId
      || claims.functionCallId !== result.data.functionCallId
      || claims.physicalToolName !== result.data.physicalToolName) {
      return relayFailure("RELAY_RESULT_INVALID", "The persisted step permit binding is invalid.");
    }
    const token = this.#tokens.signPermit(claims);
    return {
      ok: true,
      data: {
        ok: true,
        data: {
          ...structuredClone(result.data),
          permit: this.#executionPermit(claims, token),
        },
      },
    };
  }

  #validRelayManifestShape(
    manifest: RelayNormalizedToolManifest,
    registrationGeneration: number,
  ): boolean {
    if (!isObject(manifest)
      || Object.keys(manifest).sort().join(",") !== "digest,entries"
      || !Array.isArray(manifest.entries)
      || manifest.digest !== relaySha256({ entries: manifest.entries })) return false;
    const names = new Set<string>();
    let origin: string | null = null;
    for (const entry of manifest.entries) {
      if (!isObject(entry)
        || Object.keys(entry).sort().join(",")
          !== "annotations,description,inputSchema,logicalName,origin,physicalName,registrationGeneration"
        || !Object.hasOwn(MANAGED_AGENT_TOOL_DEFINITIONS, entry.logicalName)) return false;
      const logicalName = entry.logicalName as keyof typeof MANAGED_AGENT_TOOL_DEFINITIONS;
      const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
      try {
        const url = new URL(entry.origin);
        if (url.origin !== entry.origin || !["http:", "https:"].includes(url.protocol)) return false;
      } catch {
        return false;
      }
      origin ??= entry.origin;
      if (entry.origin !== origin
        || entry.registrationGeneration !== registrationGeneration
        || !RELAY_PHYSICAL_TOOL_NAME_PATTERN.test(entry.physicalName)
        || names.has(entry.physicalName)
        || entry.description !== definition.description
        || relayCanonicalJson(entry.inputSchema) !== relayCanonicalJson(definition.inputSchema)
        || relayCanonicalJson(entry.annotations) !== relayCanonicalJson(definition.annotations)) return false;
      names.add(entry.physicalName);
    }
    return true;
  }
}
