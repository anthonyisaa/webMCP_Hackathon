import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  RELAY_EXECUTION_PERMIT_AUDIENCE,
  RELAY_GRANT_AUDIENCE,
  type RelayExecutionPermitClaims,
  type RelayGrantClaims,
} from "@/agent-relay/contracts";

import {
  RepositoryRelayTokenCodec,
  relayCanonicalJson,
  relaySecretDigest,
  relaySha256,
} from "./repository-relay-security";

const SECRET = "relay-test-secret-with-at-least-32-bytes";

function grantClaims(): RelayGrantClaims {
  return {
    v: 1,
    aud: RELAY_GRANT_AUDIENCE,
    documentId: randomUUID(),
    profileId: randomUUID(),
    taskId: randomUUID(),
    runId: randomUUID(),
    attemptId: randomUUID(),
    claimantMemberId: randomUUID(),
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest(randomUUID()),
    leaseId: randomUUID(),
    registrationGeneration: 1,
    nonce: "abcdefghijklmnop",
    issuedAt: "2026-09-02T00:00:00.000Z",
    expiresAt: "2026-09-02T00:02:00.000Z",
  };
}

function permitClaims(grant: RelayGrantClaims): RelayExecutionPermitClaims {
  return {
    v: 1,
    aud: RELAY_EXECUTION_PERMIT_AUDIENCE,
    attemptId: grant.attemptId,
    functionCallId: "call_assignment",
    physicalToolName: "rf_data_0011223344556677_g1_assignment",
    argumentsDigest: relaySha256({}),
    registrationGeneration: grant.registrationGeneration,
    leaseId: grant.leaseId,
    nonce: "qrstuvwxyzABCDEF",
    issuedAt: "2026-09-02T00:00:10.000Z",
    expiresAt: "2026-09-02T00:00:40.000Z",
  };
}

describe("RepositoryRelayTokenCodec", () => {
  it("canonicalizes nested JSON deterministically", () => {
    expect(relayCanonicalJson({ z: [3, { b: true, a: "x" }], a: -0 }))
      .toBe('{"a":0,"z":[3,{"a":"x","b":true}]}');
    expect(relaySha256({ b: 2, a: 1 })).toBe(relaySha256({ a: 1, b: 2 }));
  });

  it("reconstructs byte-identical grant and permit tokens", () => {
    const codec = new RepositoryRelayTokenCodec(SECRET);
    const grant = grantClaims();
    const firstGrant = codec.signGrant(grant);
    expect(codec.signGrant(structuredClone(grant))).toBe(firstGrant);
    expect(codec.verifyGrant(firstGrant)).toEqual(grant);

    const permit = permitClaims(grant);
    const firstPermit = codec.signPermit(permit);
    expect(codec.signPermit(structuredClone(permit))).toBe(firstPermit);
    expect(codec.verifyPermit(firstPermit)).toEqual(permit);
  });

  it("rejects tampering, wrong domains, and short signing secrets", () => {
    expect(() => new RepositoryRelayTokenCodec("short")).toThrow(/32/u);
    const codec = new RepositoryRelayTokenCodec(SECRET);
    const token = codec.signGrant(grantClaims());
    const [prefix, payload, signature] = token.split(".");
    if (!prefix || !payload || !signature) throw new Error("Signed grant has an invalid shape.");
    const tamperedSignature = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    const tampered = `${prefix}.${payload}.${tamperedSignature}`;
    expect(codec.verifyGrant(tampered)).toBeNull();
    expect(codec.verifyPermit(token)).toBeNull();
  });
});
