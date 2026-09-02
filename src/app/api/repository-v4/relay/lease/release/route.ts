import { getRuntimeRepositoryRelayService } from "@/domain/repository-runtime";
import { relayResponse } from "../../../_response";
import { hasEmptyBody, relayGrantFrom } from "../../_request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const grant = relayGrantFrom(request);
  if (!grant) {
    return relayResponse({ ok: false, code: "UNAUTHORIZED", message: "A Relay grant is required.", retryable: false });
  }
  if (!await hasEmptyBody(request)) {
    return relayResponse({ ok: false, code: "INVALID_INPUT", message: "Relay release accepts no request body.", retryable: false });
  }
  return relayResponse(await getRuntimeRepositoryRelayService().releaseRelayLease(
    grant,
    request.signal,
  ));
}
