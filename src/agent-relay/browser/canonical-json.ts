import { RelayBrowserError } from "./errors";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RelayBrowserError("RELAY_RESULT_INVALID", "Canonical JSON rejects non-finite numbers.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (!isPlainObject(value)) {
    throw new RelayBrowserError("RELAY_RESULT_INVALID", "Canonical JSON accepts only JSON values.");
  }
  const entries = Object.keys(value).sort().map((key) => {
    const entry = value[key];
    if (entry === undefined) {
      throw new RelayBrowserError("RELAY_RESULT_INVALID", "Canonical JSON rejects undefined fields.");
    }
    return `${JSON.stringify(key)}:${canonicalize(entry)}`;
  });
  return `{${entries.join(",")}}`;
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function sha256CanonicalJson(value: unknown): Promise<`sha256:${string}`> {
  if (!globalThis.crypto?.subtle) {
    throw new RelayBrowserError("RELAY_UNAVAILABLE", "SHA-256 is unavailable in this browser.");
  }
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hexadecimal = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hexadecimal}`;
}
