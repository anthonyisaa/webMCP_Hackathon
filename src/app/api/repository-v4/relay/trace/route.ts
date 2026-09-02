import {
  RELAY_BROWSER_OBSERVED_CATALOG_TRANSITIONS,
  type RelayBrowserObservedCatalogTransition,
  type RelayBrowserTraceInput,
} from "@/agent-relay/contracts";
import { jsonObject } from "@/domain/http-session";
import { getRuntimeRepositoryRelayService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, relayResponse } from "../../_response";
import { relayGrantFrom } from "../_request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function browserTraceInput(value: Record<string, unknown> | null): RelayBrowserTraceInput | null {
  if (!value || !hasExactRequestKeys(value, ["kind", "detail"])
    || typeof value.kind !== "string"
    || !value.detail || typeof value.detail !== "object" || Array.isArray(value.detail)) return null;
  const detail = value.detail as Record<string, unknown>;
  if (!hasExactRequestKeys(detail, ["transition"]) || typeof detail.transition !== "string"
    || !RELAY_BROWSER_OBSERVED_CATALOG_TRANSITIONS.includes(
      detail.transition as RelayBrowserObservedCatalogTransition,
    )
    || (value.kind !== "WEBMCP_TOOLCHANGE_OBSERVED" && value.kind !== detail.transition)) return null;
  return value as unknown as RelayBrowserTraceInput;
}

export async function POST(request: Request): Promise<Response> {
  const grant = relayGrantFrom(request);
  const input = browserTraceInput(await jsonObject(request));
  if (!grant) {
    return relayResponse({
      ok: false,
      code: "UNAUTHORIZED",
      message: "A Relay grant is required.",
      retryable: false,
    });
  }
  if (!input) {
    return relayResponse({
      ok: false,
      code: "INVALID_INPUT",
      message: "A Relay catalog observation requires exact JSON.",
      retryable: false,
    });
  }
  return relayResponse(await getRuntimeRepositoryRelayService().recordRelayTrace(
    grant,
    input,
    request.signal,
  ));
}
