import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryRelayService } from "@/domain/repository-runtime";
import {
  idempotencyKeyFrom,
  pageSessionIdFrom,
  relayResponse,
} from "../../_response";
import {
  hasEmptyBody,
  rejectIncompatibleRelayContract,
  relayRetryRunIdFrom,
} from "../_request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const incompatible = rejectIncompatibleRelayContract(request);
  if (incompatible) return incompatible;
  const pageSessionId = pageSessionIdFrom(request);
  const requestId = idempotencyKeyFrom(request);
  const retryRunHeader = request.headers.get("X-Ratiflow-Relay-Retry-Run");
  const retryRunId = relayRetryRunIdFrom(request);
  if (!pageSessionId || !requestId || (retryRunHeader !== null && !retryRunId)
    || !await hasEmptyBody(request)) {
    return relayResponse({
      ok: false,
      code: "INVALID_INPUT",
      message: "A Relay claim requires page-session and idempotency headers with no body.",
      retryable: false,
    });
  }
  return relayResponse(await getRuntimeRepositoryRelayService().claimRelay(
    sessionTokenFrom(request) ?? "",
    pageSessionId,
    requestId,
    retryRunId ?? undefined,
    request.signal,
  ));
}
