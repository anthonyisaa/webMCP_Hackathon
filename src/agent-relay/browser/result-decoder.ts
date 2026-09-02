import { RELAY_BOUNDS, type RelayFailure } from "../contracts";
import { canonicalJson, utf8ByteLength } from "./canonical-json";
import { RelayBrowserError } from "./errors";

export type ManagedRelayToolOutput =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string; message: string; retryable: boolean };

export interface RelayToolExecutionReceipt {
  resultReceiptId: string;
  output: string;
  parsedOutput: ManagedRelayToolOutput;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateManagedRelayToolOutput(value: unknown): ManagedRelayToolOutput {
  if (!object(value) || typeof value.ok !== "boolean") {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The managed tool output envelope is invalid.");
  }
  if (value.ok) {
    if (!exactKeys(value, ["ok", "data"]) || !object(value.data)) {
      throw new RelayBrowserError("RELAY_RESULT_INVALID", "The managed tool success envelope is invalid.");
    }
    return value as { ok: true; data: Record<string, unknown> };
  }
  if (
    !exactKeys(value, ["ok", "code", "message", "retryable"])
    || typeof value.code !== "string"
    || typeof value.message !== "string"
    || typeof value.retryable !== "boolean"
  ) {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The managed tool failure envelope is invalid.");
  }
  return value as ManagedRelayToolOutput;
}

export function validateRelayToolTransportData(value: unknown): RelayToolExecutionReceipt {
  if (
    !object(value)
    || !exactKeys(value, ["resultReceiptId", "output"])
    || typeof value.resultReceiptId !== "string"
    || value.resultReceiptId.length < 1
    || value.resultReceiptId.length > 240
    || typeof value.output !== "string"
    || utf8ByteLength(value.output) > RELAY_BOUNDS.maxVerifiedToolResultBytes
  ) {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The Relay tool receipt is invalid.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.output) as unknown;
  } catch {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The Relay tool output was not valid JSON.");
  }
  const parsedOutput = validateManagedRelayToolOutput(parsed);
  return { resultReceiptId: value.resultReceiptId, output: value.output, parsedOutput };
}

export function wrapRelayNativeResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: unknown;
} {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The Relay callback result was not serializable.");
  }
  return {
    content: [{ type: "text", text: serialized }],
    structuredContent: JSON.parse(serialized) as unknown,
  };
}

export function decodeRelayExecuteToolResult(raw: string): RelayToolExecutionReceipt {
  if (typeof raw !== "string" || utf8ByteLength(raw) > RELAY_BOUNDS.maxVerifiedToolResultBytes * 2) {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The native WebMCP result exceeded its bound.");
  }
  let wrapper: unknown;
  try {
    wrapper = JSON.parse(raw) as unknown;
  } catch {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The native WebMCP result was not valid JSON.");
  }
  if (
    !object(wrapper)
    || !exactKeys(wrapper, ["content", "structuredContent"])
    || !Array.isArray(wrapper.content)
    || wrapper.content.length !== 1
    || !object(wrapper.content[0])
    || !exactKeys(wrapper.content[0], ["type", "text"])
    || wrapper.content[0].type !== "text"
    || typeof wrapper.content[0].text !== "string"
    || wrapper.content[0].text !== JSON.stringify(wrapper.structuredContent)
  ) {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "The native WebMCP result wrapper was invalid.");
  }
  return validateRelayToolTransportData(wrapper.structuredContent);
}

export function relayFailureOutput(failure: RelayFailure): ManagedRelayToolOutput {
  return {
    ok: false,
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
  };
}
