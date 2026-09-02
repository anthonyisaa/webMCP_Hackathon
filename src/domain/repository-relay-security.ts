import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  RELAY_EXECUTION_PERMIT_AUDIENCE,
  RELAY_EXECUTION_PERMIT_SIGNING_DOMAIN,
  RELAY_EXECUTION_PERMIT_TOKEN_PREFIX,
  RELAY_GRANT_AUDIENCE,
  RELAY_GRANT_SIGNING_DOMAIN,
  RELAY_GRANT_TOKEN_PREFIX,
  type RelayExecutionPermitClaims,
  type RelayExecutionPermitToken,
  type RelayGrant,
  type RelayGrantClaims,
} from "@/agent-relay/contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HEX_16 = /^[0-9a-f]{16}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** JSON Canonicalization Scheme-compatible serialization for the JSON subset. */
export function relayCanonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Relay JSON requires finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(relayCanonicalJson).join(",")}]`;
  if (!isPlainRecord(value)) throw new TypeError("Relay JSON accepts only JSON values.");
  return `{${Object.keys(value).sort().map((key) => {
    const entry = value[key];
    if (entry === undefined) throw new TypeError("Relay JSON rejects undefined fields.");
    return `${JSON.stringify(key)}:${relayCanonicalJson(entry)}`;
  }).join(",")}}`;
}

export function relaySha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(relayCanonicalJson(value), "utf8").digest("hex")}`;
}

export function relaySecretDigest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function validRelaySigningSecret(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 32;
}

type TokenDefinition<Claims> = {
  prefix: string;
  domain: string;
  validate: (value: unknown) => value is Claims;
};

const GRANT_DEFINITION: TokenDefinition<RelayGrantClaims> = {
  prefix: RELAY_GRANT_TOKEN_PREFIX,
  domain: RELAY_GRANT_SIGNING_DOMAIN,
  validate: isRelayGrantClaims,
};

const PERMIT_DEFINITION: TokenDefinition<RelayExecutionPermitClaims> = {
  prefix: RELAY_EXECUTION_PERMIT_TOKEN_PREFIX,
  domain: RELAY_EXECUTION_PERMIT_SIGNING_DOMAIN,
  validate: isRelayExecutionPermitClaims,
};

export class RepositoryRelayTokenCodec {
  readonly #secret: string;

  constructor(secret: string) {
    if (!validRelaySigningSecret(secret)) {
      throw new Error("RATIFLOW_RELAY_SIGNING_SECRET must contain at least 32 UTF-8 bytes.");
    }
    this.#secret = secret;
  }

  signGrant(claims: RelayGrantClaims): RelayGrant {
    return this.#sign(claims, GRANT_DEFINITION) as RelayGrant;
  }

  verifyGrant(token: string): RelayGrantClaims | null {
    return this.#verify(token, GRANT_DEFINITION);
  }

  signPermit(claims: RelayExecutionPermitClaims): RelayExecutionPermitToken {
    return this.#sign(claims, PERMIT_DEFINITION) as RelayExecutionPermitToken;
  }

  verifyPermit(token: string): RelayExecutionPermitClaims | null {
    return this.#verify(token, PERMIT_DEFINITION);
  }

  #sign<Claims>(claims: Claims, definition: TokenDefinition<Claims>): string {
    if (!definition.validate(claims)) throw new TypeError("Relay token claims are invalid.");
    const payload = Buffer.from(relayCanonicalJson(claims), "utf8").toString("base64url");
    const signature = this.#mac(definition.domain, definition.prefix, payload);
    return `${definition.prefix}.${payload}.${signature}`;
  }

  #verify<Claims>(token: string, definition: TokenDefinition<Claims>): Claims | null {
    const [prefix, payload, signature, extra] = token.split(".");
    if (extra !== undefined || prefix !== definition.prefix || !payload || !signature) return null;
    const expected = this.#mac(definition.domain, prefix, payload);
    const actualBytes = Buffer.from(signature, "base64url");
    const expectedBytes = Buffer.from(expected, "base64url");
    if (actualBytes.length !== expectedBytes.length
      || !timingSafeEqual(actualBytes, expectedBytes)) return null;
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (!definition.validate(value)
      || Buffer.from(relayCanonicalJson(value), "utf8").toString("base64url") !== payload) {
      return null;
    }
    return value;
  }

  #mac(domain: string, prefix: string, payload: string): string {
    return createHmac("sha256", this.#secret)
      .update(domain, "utf8")
      .update("\0", "utf8")
      .update(prefix, "utf8")
      .update(".", "utf8")
      .update(payload, "utf8")
      .digest("base64url");
  }
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isPlainRecord(value)
    && keys.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => keys.includes(key));
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRelayGrantClaims(value: unknown): value is RelayGrantClaims {
  if (!exact(value, [
    "v", "aud", "documentId", "profileId", "taskId", "runId", "attemptId",
    "claimantMemberId", "credentialSessionDigest", "pageSessionDigest", "leaseId",
    "registrationGeneration", "nonce", "issuedAt", "expiresAt",
  ])) return false;
  return value.v === 1
    && value.aud === RELAY_GRANT_AUDIENCE
    && UUID.test(String(value.documentId))
    && UUID.test(String(value.profileId))
    && UUID.test(String(value.taskId))
    && UUID.test(String(value.runId))
    && UUID.test(String(value.attemptId))
    && UUID.test(String(value.claimantMemberId))
    && SHA256.test(String(value.credentialSessionDigest))
    && SHA256.test(String(value.pageSessionDigest))
    && UUID.test(String(value.leaseId))
    && positiveSafeInteger(value.registrationGeneration)
    && NONCE.test(String(value.nonce))
    && timestamp(value.issuedAt)
    && timestamp(value.expiresAt)
    && Date.parse(value.issuedAt as string) < Date.parse(value.expiresAt as string);
}

function isRelayExecutionPermitClaims(value: unknown): value is RelayExecutionPermitClaims {
  if (!exact(value, [
    "v", "aud", "attemptId", "functionCallId", "physicalToolName",
    "argumentsDigest", "registrationGeneration", "leaseId", "nonce",
    "issuedAt", "expiresAt",
  ])) return false;
  return value.v === 1
    && value.aud === RELAY_EXECUTION_PERMIT_AUDIENCE
    && UUID.test(String(value.attemptId))
    && typeof value.functionCallId === "string"
    && value.functionCallId.length > 0 && value.functionCallId.length <= 512
    && typeof value.physicalToolName === "string"
    && value.physicalToolName.length > 0 && value.physicalToolName.length <= 64
    && SHA256.test(String(value.argumentsDigest))
    && positiveSafeInteger(value.registrationGeneration)
    && UUID.test(String(value.leaseId))
    && NONCE.test(String(value.nonce))
    && timestamp(value.issuedAt)
    && timestamp(value.expiresAt)
    && Date.parse(value.issuedAt as string) < Date.parse(value.expiresAt as string);
}

export function relayRegistrationScope(value: string): boolean {
  return HEX_16.test(value);
}
