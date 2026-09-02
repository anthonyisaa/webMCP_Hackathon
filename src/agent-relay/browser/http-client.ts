import type {
  RelayBrowserClientPort,
  RelayBrowserTraceInput,
  RelayClaimOutcome,
  RelayClaimedAttemptView,
  RelayExecutionPermitToken,
  RelayGrant,
  RelayResult,
  RelayRun,
  RelayStepInput,
  RelayStepOutcome,
  RelayWorkspaceState,
  RelayTraceEvent,
} from "../contracts";
import { RelayBrowserError } from "./errors";

const PAGE_SESSION_HEADER = "X-Ratiflow-Page-Session";
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const EXECUTION_PERMIT_HEADER = "X-Ratiflow-Relay-Permit";
const RETRY_RUN_HEADER = "X-Ratiflow-Relay-Retry-Run";

export type RelayRequestIdFactory = () => string;

class RelayTransportFailure extends Error {
  readonly original: unknown;

  constructor(original: unknown) {
    super("Relay transport failed.");
    this.name = "RelayTransportFailure";
    this.original = original;
  }
}

function defaultRequestId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new RelayBrowserError("RELAY_UNAVAILABLE", "Cryptographic request IDs are unavailable.");
  }
  return globalThis.crypto.randomUUID();
}

function defaultOrigin(): string {
  if (typeof window === "undefined") {
    throw new RelayBrowserError("RELAY_UNAVAILABLE", "The Relay HTTP client requires a browser origin.");
  }
  return window.location.origin;
}

async function readRelayResult<T>(response: Response): Promise<RelayResult<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new RelayBrowserError("RELAY_UNAVAILABLE", "The Relay endpoint returned a non-JSON response.");
  }
  return await response.json() as RelayResult<T>;
}

export class RelayHttpClient implements RelayBrowserClientPort {
  readonly #humanSessionToken: string;
  readonly #origin: string;
  readonly #fetch: typeof fetch;
  readonly #createRequestId: RelayRequestIdFactory;

  constructor(input: {
    humanSessionToken: string;
    origin?: string;
    fetch?: typeof fetch;
    createRequestId?: RelayRequestIdFactory;
  }) {
    this.#humanSessionToken = input.humanSessionToken;
    this.#origin = input.origin ?? defaultOrigin();
    this.#fetch = input.fetch ?? globalThis.fetch.bind(globalThis);
    this.#createRequestId = input.createRequestId ?? defaultRequestId;
  }

  readState(signal?: AbortSignal): Promise<RelayResult<RelayWorkspaceState>> {
    return this.#request({
      path: "/api/repository-v4/relay/state",
      method: "GET",
      bearer: this.#humanSessionToken,
      signal,
    });
  }

  claim(
    pageSessionId: string,
    retryRunId?: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimOutcome>> {
    const idempotencyKey = this.#createRequestId();
    return this.#idempotentRequest({
      path: "/api/repository-v4/relay/claim",
      method: "POST",
      bearer: this.#humanSessionToken,
      signal,
      headers: {
        [PAGE_SESSION_HEADER]: pageSessionId,
        [IDEMPOTENCY_HEADER]: idempotencyKey,
        ...(retryRunId ? { [RETRY_RUN_HEADER]: retryRunId } : {}),
      },
    });
  }

  renewLease(
    grant: RelayGrant,
    expectedLeaseId: string,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayClaimedAttemptView>> {
    return this.#request({
      path: "/api/repository-v4/relay/lease/renew",
      method: "POST",
      bearer: grant,
      body: { expectedLeaseId },
      signal,
    });
  }

  releaseLease(grant: RelayGrant, signal?: AbortSignal): Promise<RelayResult<RelayRun>> {
    return this.#request({
      path: "/api/repository-v4/relay/lease/release",
      method: "POST",
      bearer: grant,
      signal,
    });
  }

  recordTrace(
    grant: RelayGrant,
    input: RelayBrowserTraceInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayTraceEvent>> {
    return this.#request({
      path: "/api/repository-v4/relay/trace",
      method: "POST",
      bearer: grant,
      body: input,
      signal,
    });
  }

  step(
    grant: RelayGrant,
    input: RelayStepInput,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayStepOutcome>> {
    const idempotencyKey = this.#createRequestId();
    return this.#idempotentRequest({
      path: "/api/repository-v4/relay/step",
      method: "POST",
      bearer: grant,
      body: input,
      signal,
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
    });
  }

  executeTool(
    grant: RelayGrant,
    permit: RelayExecutionPermitToken,
    physicalToolName: string,
    input: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<RelayResult<{ resultReceiptId: string; output: string }>> {
    const idempotencyKey = this.#createRequestId();
    return this.#idempotentRequest({
      path: "/api/repository-v4/relay/tool",
      method: "POST",
      bearer: grant,
      body: { physicalToolName, input },
      signal,
      headers: {
        [EXECUTION_PERMIT_HEADER]: permit,
        [IDEMPOTENCY_HEADER]: idempotencyKey,
      },
    });
  }

  async #idempotentRequest<T>(input: {
    path: string;
    method: "GET" | "POST";
    bearer: string;
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<RelayResult<T>> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.#request<T>(input);
      } catch (error) {
        if (input.signal?.aborted || !(error instanceof RelayTransportFailure) || attempt === 2) {
          throw error instanceof RelayTransportFailure ? error.original : error;
        }
      }
    }
    throw new RelayBrowserError("RELAY_UNAVAILABLE", "The Relay transport retry was exhausted.");
  }

  async #request<T>(input: {
    path: string;
    method: "GET" | "POST";
    bearer: string;
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<RelayResult<T>> {
    const url = new URL(input.path, this.#origin);
    if (url.origin !== this.#origin || !url.pathname.startsWith("/api/repository-v4/relay/")) {
      throw new RelayBrowserError("RELAY_UNAVAILABLE", "The Relay request was not same-origin.");
    }
    let response: Response;
    try {
      response = await this.#fetch(url.href, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.bearer}`,
          ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...input.headers,
        },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        cache: "no-store",
        signal: input.signal,
      });
    } catch (error) {
      throw new RelayTransportFailure(error);
    }
    return readRelayResult<T>(response);
  }
}

export const RELAY_HTTP_HEADERS = {
  pageSession: PAGE_SESSION_HEADER,
  idempotency: IDEMPOTENCY_HEADER,
  executionPermit: EXECUTION_PERMIT_HEADER,
  retryRun: RETRY_RUN_HEADER,
} as const;
