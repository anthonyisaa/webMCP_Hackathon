import { jsonObject } from "@/domain/http-session";
import { getRuntimeRepositoryRelayService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, relayResponse } from "../../../_response";
import { rejectIncompatibleRelayContract, relayGrantFrom } from "../../_request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const incompatible = rejectIncompatibleRelayContract(request);
  if (incompatible) return incompatible;
  const grant = relayGrantFrom(request);
  const body = await jsonObject(request);
  if (!grant) {
    return relayResponse({ ok: false, code: "UNAUTHORIZED", message: "A Relay grant is required.", retryable: false });
  }
  if (!body || !hasExactRequestKeys(body, ["expectedLeaseId"])
    || typeof body.expectedLeaseId !== "string") {
    return relayResponse({ ok: false, code: "INVALID_INPUT", message: "A valid expected lease is required.", retryable: false });
  }
  return relayResponse(await getRuntimeRepositoryRelayService().renewRelayLease(
    grant,
    body.expectedLeaseId,
    request.signal,
  ));
}
