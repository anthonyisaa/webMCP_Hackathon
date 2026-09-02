import type {
  ManagedAgentToolClientPort,
  RelayAttemptAuthorizationPort,
  RelayBrowserTraceInput,
  RelayClaimOutcome,
  RelayClaimedAttemptView,
  RelayExecutionPermit,
  RelayExecutionPermitToken,
  RelayGrant,
  RelayNormalizedToolManifest,
  RelayResult,
  RelayRun,
  RelayTraceEvent,
  RelayTraceKind,
  RelayWorkspaceState,
} from "@/agent-relay/contracts";
import type {
  CreateDirectoryMentionServiceInput,
} from "@/repository/contracts";
import type {
  DirectoryMentionReceipt,
  ManagedAgentLogicalToolName,
} from "@/agent-relay/contracts";

export interface IssueRelayPermitInput {
  attemptId: string;
  functionCallId: string;
  physicalToolName: string;
  arguments: Readonly<Record<string, unknown>>;
}

export interface IssueRelayToolExecutionInput {
  requestId: string;
  permit: RelayExecutionPermitToken;
  physicalToolName: string;
  input: Readonly<Record<string, unknown>>;
}

export interface IssueRelayTraceInput {
  kind: RelayTraceKind;
  logicalToolName?: ManagedAgentLogicalToolName | null;
  physicalToolName?: string | null;
  manifestDigest?: `sha256:${string}` | null;
  argumentsDigest?: `sha256:${string}` | null;
  resultDigest?: `sha256:${string}` | null;
  detail?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Capacity is reserved atomically with a claim, then finalized as one durable
 * authorization immediately before that attempt's first provider call. An
 * unconsumed reservation is released or expires without spending quota.
 */
export const RELAY_PROVIDER_RUN_QUOTA = {
  windowMs: 10 * 60_000,
  deploymentLimit: 48,
  documentLimit: 6,
} as const;

/**
 * Server-side protocol-4 Relay authority. It is deliberately separate from the
 * frozen v4.1 RepositoryServicePort so legacy callers keep their exact surface.
 */
export interface RepositoryRelayServicePort
extends ManagedAgentToolClientPort, RelayAttemptAuthorizationPort {
  createDirectoryMention(
    sessionToken: string,
    input: CreateDirectoryMentionServiceInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<DirectoryMentionReceipt>>;
  readRelayState(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayWorkspaceState>>;
  claimRelay(
    sessionToken: string,
    pageSessionId: string,
    requestId: string,
    retryRunId?: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimOutcome>>;
  renewRelayLease(
    grant: RelayGrant,
    expectedLeaseId: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimedAttemptView>>;
  releaseRelayLease(
    grant: RelayGrant,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayRun>>;
  issueExecutionPermit(
    grant: RelayGrant,
    input: IssueRelayPermitInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayExecutionPermit>>;
  executeRelayTool(
    grant: RelayGrant,
    input: IssueRelayToolExecutionInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ resultReceiptId: string; output: string }>>;
  recordRelayManifest(
    grant: RelayGrant,
    manifest: RelayNormalizedToolManifest,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ digest: `sha256:${string}` }>>;
  recordRelayTrace(
    grant: RelayGrant,
    input: RelayBrowserTraceInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayTraceEvent>>;
}

/** Fail-closed sidecar used when durable Relay credentials are not configured. */
export function createUnavailableRepositoryRelayService(): RepositoryRelayServicePort {
  const unavailable = async () => ({
    ok: false as const,
    code: "RELAY_UNAVAILABLE" as const,
    message: "Managed Relay is not configured on this server.",
    retryable: false,
  });
  const repositoryUnavailable = async () => ({
    ok: false as const,
    code: "PROTOCOL_MISMATCH" as const,
    message: "Managed Relay is not configured on this server.",
    retryable: false,
  });
  return {
    createDirectoryMention: unavailable,
    readRelayState: unavailable,
    claimRelay: unavailable,
    renewRelayLease: unavailable,
    releaseRelayLease: unavailable,
    issueExecutionPermit: unavailable,
    executeRelayTool: unavailable,
    recordRelayManifest: unavailable,
    recordRelayTrace: unavailable,
    beginStep: unavailable,
    recordStepResult: unavailable,
    loadVerifiedToolResult: unavailable,
    readAssignment: repositoryUnavailable,
    readDocumentContext: repositoryUnavailable,
    readCollaborationContext: repositoryUnavailable,
    commentOnAssignment: repositoryUnavailable,
    submitScopedRevision: repositoryUnavailable,
  } as RepositoryRelayServicePort;
}
