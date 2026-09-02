import { createHash } from "node:crypto";

import type { RelayFailure } from "@/agent-relay/contracts";

const API_KEY_PATTERN = /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~-]{8,}\b/gi;
const RELAY_TOKEN_PATTERN = /\brf(?:relay|permit)_v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export function relayFailure(
  code: RelayFailure["code"],
  message: string,
  retryable: boolean,
  nextAction?: string,
): RelayFailure {
  return {
    ok: false,
    code,
    message,
    retryable,
    ...(nextAction ? { nextAction } : {}),
  };
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

export function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function sanitizeUntrustedText(value: string, maxBytes: number): string | null {
  if (utf8Bytes(value) > maxBytes) return null;
  return value
    .replace(API_KEY_PATTERN, "[REDACTED_OPENAI_KEY]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(RELAY_TOKEN_PATTERN, "[REDACTED_RELAY_TOKEN]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Only finite JSON numbers are supported.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isPlainRecord(value)) throw new TypeError("Only JSON objects are supported.");
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

export function sha256Digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

export function matchesJsonSchema(value: unknown, schemaValue: unknown): boolean {
  if (!isPlainRecord(schemaValue)) return false;
  const schema = schemaValue;

  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.filter((candidate) => matchesJsonSchema(value, candidate)).length === 1;
  }
  if (Object.hasOwn(schema, "const") && !jsonValuesEqual(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => jsonValuesEqual(value, candidate))) {
    return false;
  }

  const inferredType = schema.type ?? (isPlainRecord(schema.properties) ? "object" : undefined);
  switch (inferredType) {
    case "object": {
      if (!isPlainRecord(value)) return false;
      const properties = isPlainRecord(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required)
        && schema.required.every((key) => typeof key === "string")
        ? schema.required as string[]
        : [];
      if (!required.every((key) => Object.hasOwn(value, key))) return false;
      if (schema.additionalProperties === false
        && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
      return Object.entries(value).every(([key, entry]) => (
        !Object.hasOwn(properties, key) || matchesJsonSchema(entry, properties[key])
      ));
    }
    case "array": {
      if (!Array.isArray(value)) return false;
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
      if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
      return schema.items === undefined || value.every((entry) => matchesJsonSchema(entry, schema.items));
    }
    case "string": {
      if (typeof value !== "string") return false;
      const length = [...value].length;
      if (typeof schema.minLength === "number" && length < schema.minLength) return false;
      if (typeof schema.maxLength === "number" && length > schema.maxLength) return false;
      return true;
    }
    case "integer":
      if (!Number.isInteger(value)) return false;
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      break;
    case "boolean":
      return typeof value === "boolean";
    case undefined:
      return true;
    default:
      return false;
  }

  const number = value as number;
  if (typeof schema.minimum === "number" && number < schema.minimum) return false;
  if (typeof schema.maximum === "number" && number > schema.maximum) return false;
  return true;
}
