import type {
  RelayExecutionPermitToken,
  RelayGrant,
} from "@/agent-relay/contracts";

const MAX_RELAY_CREDENTIAL_BYTES = 4 * 1_024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function opaqueRelayCredential(request: Request, header: string, prefix: string): string | null {
  const raw = request.headers.get(header);
  const value = header.toLowerCase() === "authorization" && raw?.startsWith("Bearer ")
    ? raw.slice("Bearer ".length).trim()
    : raw?.trim();
  return value
    && value.startsWith(`${prefix}.`)
    && Buffer.byteLength(value, "utf8") <= MAX_RELAY_CREDENTIAL_BYTES
    && !/[\u0000-\u0020\u007f]/u.test(value)
    ? value
    : null;
}

export function relayGrantFrom(request: Request): RelayGrant | null {
  return opaqueRelayCredential(request, "authorization", "rfrelay_v1") as RelayGrant | null;
}

export function relayPermitFrom(request: Request): RelayExecutionPermitToken | null {
  return opaqueRelayCredential(request, "X-Ratiflow-Relay-Permit", "rfpermit_v1") as RelayExecutionPermitToken | null;
}

export function relayRetryRunIdFrom(request: Request): string | null {
  const value = request.headers.get("X-Ratiflow-Relay-Retry-Run")?.trim();
  return value && UUID_PATTERN.test(value) ? value : null;
}

export async function hasEmptyBody(request: Request): Promise<boolean> {
  return (await request.text()).length === 0;
}
