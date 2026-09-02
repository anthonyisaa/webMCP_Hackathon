import { jsonObject } from "@/domain/http-session";
import { getRuntimeRepositoryRelayService } from "@/domain/repository-runtime";
import {
  hasExactRequestKeys,
  hasPublicRequestId,
  idempotencyKeyFrom,
  relayResponse,
} from "../../_response";
import { relayGrantFrom, relayPermitFrom } from "../_request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const grant = relayGrantFrom(request);
  const permit = relayPermitFrom(request);
  const requestId = idempotencyKeyFrom(request);
  const body = await jsonObject(request);
  if (!grant || !permit) {
    return relayResponse({ ok: false, code: "UNAUTHORIZED", message: "Relay grant and execution permit are required.", retryable: false });
  }
  if (!requestId || !body || hasPublicRequestId(body)
    || !hasExactRequestKeys(body, ["physicalToolName", "input"])
    || typeof body.physicalToolName !== "string"
    || !body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return relayResponse({ ok: false, code: "INVALID_INPUT", message: "Relay tool execution requires exact JSON and Idempotency-Key.", retryable: false });
  }
  return relayResponse(await getRuntimeRepositoryRelayService().executeRelayTool(
    grant,
    {
      requestId,
      permit,
      physicalToolName: body.physicalToolName,
      input: body.input as Record<string, unknown>,
    },
    request.signal,
  ));
}
