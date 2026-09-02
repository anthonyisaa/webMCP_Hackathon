import type {
  RelayGrant,
  RelayResult,
  RelayStepOutcome,
} from "@/agent-relay/contracts";
import {
  parseRelayStepInput,
  type RelayStepRequest,
} from "@/agent-relay/server/relay-stepper";
import { relayFailure } from "@/agent-relay/server/safety";
import { jsonObject } from "@/domain/http-session";
import { idempotencyKeyFrom } from "../../_response";

const RELAY_GRANT_MAX_BYTES = 4 * 1_024;

export interface RelayStepExecutor {
  step(
    request: RelayStepRequest,
    signal?: AbortSignal,
  ): Promise<RelayResult<RelayStepOutcome>>;
}

export async function handleRelayStepRequest(
  request: Request,
  executor: RelayStepExecutor,
): Promise<Response> {
  const grant = relayGrantFrom(request);
  if (!grant) {
    return relayResponse(relayFailure(
      "UNAUTHORIZED",
      "A valid managed Relay grant is required.",
      false,
    ));
  }
  const requestId = idempotencyKeyFrom(request);
  const body = await jsonObject(request);
  const input = parseRelayStepInput(body);
  if (!requestId || !input) {
    return relayResponse(relayFailure(
      "INVALID_INPUT",
      "A Relay step requires exact public JSON and Idempotency-Key.",
      false,
    ));
  }
  const requestOrigin = sameRequestOrigin(request);
  if (!requestOrigin) {
    return relayResponse(relayFailure(
      "UNAUTHORIZED",
      "The Relay step must be sent from the document's same origin.",
      false,
    ));
  }

  try {
    return relayResponse(await executor.step({
      grant,
      requestId,
      requestOrigin,
      input,
    }, request.signal));
  } catch {
    return relayResponse(relayFailure(
      "RELAY_UNAVAILABLE",
      "The managed Relay step could not be completed safely.",
      true,
      "Read Relay state before retrying.",
    ));
  }
}

function relayGrantFrom(request: Request): RelayGrant | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token.startsWith("rfrelay_v1.")
    || Buffer.byteLength(token, "utf8") > RELAY_GRANT_MAX_BYTES
    || /[\u0000-\u0020\u007F]/.test(token)) return null;
  return token as RelayGrant;
}

function sameRequestOrigin(request: Request): string | null {
  try {
    const requestOrigin = new URL(request.url).origin;
    const suppliedOrigin = request.headers.get("origin");
    return suppliedOrigin === requestOrigin ? requestOrigin : null;
  } catch {
    return null;
  }
}

function relayResponse<T>(result: RelayResult<T>): Response {
  if (result.ok) return Response.json(result);
  const status = result.code === "INVALID_INPUT" ? 400
    : result.code === "UNAUTHORIZED" ? 401
      : result.code === "NOT_FOUND" ? 404
        : result.code === "RATE_LIMITED" ? 429
          : result.code === "RELAY_UNAVAILABLE" ? 503
            : 409;
  return Response.json(result, { status });
}
