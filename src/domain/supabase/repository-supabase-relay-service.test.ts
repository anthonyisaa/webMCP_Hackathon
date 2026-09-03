import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { test } from "vitest";

import type {
  RelayAttempt,
  RelayExecutionPermitClaims,
  RelayGrantClaims,
  RelayStepOutcome,
} from "@/agent-relay/contracts";
import {
  RepositoryRelayTokenCodec,
  relaySecretDigest,
  relaySha256,
} from "@/domain/repository-relay-security";
import { RELAY_CAPABILITY_CONTRACT_VALUE } from "@/repository/contracts";
import { SupabaseRepositoryRelayService } from "./repository-supabase-relay-service";

const SECRET = "supabase-relay-test-secret-with-at-least-32-bytes";
const now = "2026-09-02T00:00:00.000Z";
const later = "2026-09-02T00:02:00.000Z";

function capabilityFirstState() {
  return {
    directory: [{
      kind: "AGENT",
      identitySource: "DEMO_DIRECTORY",
      expertise: "CODE",
    }],
    runs: [],
    activeAttempt: null,
    trace: [],
    currentRelayEventVersion: 0,
    webMcpRequired: true,
    recoveryHeartbeatMs: 15_000,
  };
}

test("step persistence removes plaintext permits and rehydrates exact replay tokens", async () => {
  const ids = Array.from({ length: 10 }, () => randomUUID());
  const grantClaims: RelayGrantClaims = {
    v: 1,
    aud: "ratiflow-webmcp-relay",
    documentId: ids[0]!,
    profileId: ids[1]!,
    taskId: ids[2]!,
    runId: ids[3]!,
    attemptId: ids[4]!,
    claimantMemberId: ids[5]!,
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest("page"),
    leaseId: ids[6]!,
    registrationGeneration: 1,
    nonce: "grant-nonce-123456789",
    issuedAt: now,
    expiresAt: later,
  };
  const physicalToolName = "rf_editorial_0123456789abcdef_g1_assignment";
  const permitClaims: RelayExecutionPermitClaims = {
    v: 1,
    aud: "ratiflow-webmcp-relay-tool",
    attemptId: grantClaims.attemptId,
    functionCallId: "call-1",
    physicalToolName,
    argumentsDigest: relaySha256({}),
    registrationGeneration: 1,
    leaseId: grantClaims.leaseId,
    nonce: "permit-nonce-12345678",
    issuedAt: now,
    expiresAt: later,
  };
  const codec = new RepositoryRelayTokenCodec(SECRET);
  const grant = codec.signGrant(grantClaims);
  const permitToken = codec.signPermit(permitClaims);
  const outcome: RelayStepOutcome = {
    outcome: "EXECUTE_TOOL",
    attemptId: grantClaims.attemptId,
    nextStep: 2,
    functionCallId: permitClaims.functionCallId,
    physicalToolName,
    arguments: {},
    permit: {
      token: permitToken,
      attemptId: permitClaims.attemptId,
      functionCallId: permitClaims.functionCallId,
      physicalToolName,
      argumentsDigest: permitClaims.argumentsDigest,
      registrationGeneration: 1,
      leaseId: permitClaims.leaseId,
      expiresAt: permitClaims.expiresAt,
    },
  };
  const attempt: RelayAttempt = {
    attemptId: grantClaims.attemptId,
    runId: grantClaims.runId,
    attemptNumber: 1,
    status: "EXECUTING_TOOL",
    claimedBy: { memberId: grantClaims.claimantMemberId, displayName: "Priya" },
    pageSessionId: ids[7]!,
    registrationGeneration: 1,
    registrationScope: "0123456789abcdef",
    leaseId: grantClaims.leaseId,
    leaseExpiresAt: later,
    providerDispatched: true,
    providerCallCount: 2,
    toolCallCount: 1,
    currentStep: 2,
    startedAt: now,
    deadlineAt: later,
    updatedAt: now,
    completedAt: null,
  };
  let persistedBody: Record<string, unknown> | undefined;
  const request = (async (_url: URL | RequestInfo, init?: RequestInit) => {
    persistedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const input = persistedBody.p_input as { result: unknown };
    return Response.json({
      ok: true,
      data: { attempt, result: input.result, permitClaims },
    });
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    signingSecret: SECRET,
    fetch: request,
  });
  const response = await service.recordStepResult(grant, {
    requestId: ids[8]!,
    inputDigest: relaySha256({ action: "step" }),
    attemptId: grantClaims.attemptId,
    expectedStep: 1,
    providerResponseId: "response-1",
    result: { ok: true, data: outcome },
  });
  assert.equal(response.ok, true);
  if (!response.ok || !response.data.result.ok
    || response.data.result.data.outcome !== "EXECUTE_TOOL") return;
  assert.equal(response.data.result.data.permit.token, permitToken);
  assert.ok(persistedBody);
  assert.equal(JSON.stringify(persistedBody).includes(permitToken), false);
  assert.equal(JSON.stringify(persistedBody).includes(SECRET), false);
});

test("claim finalizes only a digest while returning a signed in-memory grant", async () => {
  const codec = new RepositoryRelayTokenCodec(SECRET);
  const grantClaims: RelayGrantClaims = {
    v: 1,
    aud: "ratiflow-webmcp-relay",
    documentId: randomUUID(), profileId: randomUUID(), taskId: randomUUID(),
    runId: randomUUID(), attemptId: randomUUID(), claimantMemberId: randomUUID(),
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest("page"), leaseId: randomUUID(),
    registrationGeneration: 1, nonce: "grant-nonce-123456789",
    issuedAt: now, expiresAt: later,
  };
  const observed: Array<Record<string, unknown>> = [];
  let stateReads = 0;
  const request = (async (url: URL | RequestInfo, init?: RequestInit) => {
    if (String(url).endsWith("/ratiflow_read_issue_relay_state_v4")) {
      stateReads += 1;
      return Response.json({ ok: true, data: capabilityFirstState() });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    observed.push(body);
    if (body.p_action === "FINALIZE_GRANT") {
      return Response.json({ ok: true, data: true });
    }
    return Response.json({
      ok: true,
      data: {
        outcome: "CLAIMED",
        run: {
          runId: grantClaims.runId,
          taskId: grantClaims.taskId,
          profileId: grantClaims.profileId,
          agentExpertise: "CODE",
          accessProfile: "METRICS_SCOPED_EDIT",
          runtime: "OPENAI_LUNA_WEBMCP_RELAY",
          model: "gpt-5.6-luna",
          status: "ACTIVE",
          attemptCount: 1,
          maxAttempts: 2,
          terminalReason: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        },
        attempt: {},
        agent: {
          kind: "AGENT",
          profileId: grantClaims.profileId,
          principal: { memberId: randomUUID(), displayName: "Code · managed agent" },
          handle: "code",
          displayName: "Code",
          visibility: "TEAM",
          readiness: "READY",
          identitySource: "DEMO_DIRECTORY",
          expertise: "CODE",
          runtime: "OPENAI_LUNA_WEBMCP_RELAY",
        },
        capabilityGrant: {
          accessProfile: "METRICS_SCOPED_EDIT",
          documentAuthority: "DIRECT_SELECTION",
          logicalToolNames: [
            "read_assignment", "read_document_context", "read_collaboration_context",
            "comment_on_assignment", "submit_scoped_revision", "query_demo_metrics",
          ],
          syntheticSourceLabels: [
            "Synthetic demo data · northstar_launch_capacity",
            "Synthetic demo data · inc_482_checkout_impact",
          ],
        },
        grantClaims,
      },
    });
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    signingSecret: SECRET,
    fetch: request,
  });
  const retryRunId = randomUUID();
  const result = await service.claimRelay(
    "human-session", randomUUID(), randomUUID(), retryRunId,
  );
  assert.equal(result.ok, true);
  if (!result.ok || result.data.outcome !== "CLAIMED") return;
  assert.equal(result.data.grant, codec.signGrant(grantClaims));
  assert.equal(result.data.agent.expertise, "CODE");
  assert.equal(result.data.capabilityGrant.accessProfile, "METRICS_SCOPED_EDIT");
  assert.equal(stateReads, 1);
  assert.equal(observed.length, 2);
  assert.equal(observed[0]!.p_retry_run_id, retryRunId);
  assert.equal(observed[0]!.p_contract, RELAY_CAPABILITY_CONTRACT_VALUE);
  assert.equal(observed[1]!.p_grant_digest, relaySecretDigest(result.data.grant));
  assert.equal(JSON.stringify(observed).includes(result.data.grant), false);
});

test("managed mention and claim fail closed before mutating a persona-era store", async () => {
  let stateReads = 0;
  let mutationCalls = 0;
  const request = (async (url: URL | RequestInfo) => {
    if (String(url).endsWith("/ratiflow_read_issue_relay_state_v4")) {
      stateReads += 1;
      return Response.json({
        ok: true,
        data: {
          ...capabilityFirstState(),
          directory: [{
            kind: "AGENT",
            identitySource: "DEMO_DIRECTORY",
            specialty: "CODE",
            logicalToolNames: ["read_assignment", "search_demo_code"],
            syntheticSourceLabels: ["Synthetic demo data · commit:7d3c9e1"],
          }],
        },
      });
    }
    mutationCalls += 1;
    throw new Error(`Unexpected mutating RPC: ${String(url)}`);
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    signingSecret: SECRET,
    fetch: request,
  });

  const mention = await service.createDirectoryMention("human-session", {
    expectedRevision: 1,
    requestId: randomUUID(),
    comment: "@Code inspect this selection",
    target: { kind: "AGENT", profileId: randomUUID() },
    accessProfile: "METRICS_SCOPED_EDIT",
    anchor: { scope: "SELECTION", field: "BODY", rangeStart: 0, rangeEnd: 4 },
  });
  const claim = await service.claimRelay(
    "human-session",
    randomUUID(),
    randomUUID(),
  );

  assert.equal(mention.ok, false);
  if (!mention.ok) assert.equal(mention.code, "RELAY_UNAVAILABLE");
  assert.equal(claim.ok, false);
  if (!claim.ok) assert.equal(claim.code, "RELAY_UNAVAILABLE");
  assert.equal(stateReads, 2);
  assert.equal(mutationCalls, 0);
});

test("a lost mutable response reuses its durable context and finishes one receipt", async () => {
  const codec = new RepositoryRelayTokenCodec(SECRET);
  const grantClaims: RelayGrantClaims = {
    v: 1,
    aud: "ratiflow-webmcp-relay",
    documentId: randomUUID(), profileId: randomUUID(), taskId: randomUUID(),
    runId: randomUUID(), attemptId: randomUUID(), claimantMemberId: randomUUID(),
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest("page"), leaseId: randomUUID(),
    registrationGeneration: 1, nonce: "grant-nonce-123456789",
    issuedAt: now, expiresAt: later,
  };
  const physicalToolName = "rf_editorial_0123456789abcdef_g1_progress";
  const toolInput = { body: "Progress", evidenceRefs: [] as string[] };
  const permitClaims: RelayExecutionPermitClaims = {
    v: 1,
    aud: "ratiflow-webmcp-relay-tool",
    attemptId: grantClaims.attemptId,
    functionCallId: "call-1",
    physicalToolName,
    argumentsDigest: relaySha256(toolInput),
    registrationGeneration: 1,
    leaseId: grantClaims.leaseId,
    nonce: "permit-nonce-12345678",
    issuedAt: now,
    expiresAt: later,
  };
  const downstreamRequestId = randomUUID();
  const context = {
    documentId: grantClaims.documentId,
    runId: grantClaims.runId,
    attemptId: grantClaims.attemptId,
    taskId: grantClaims.taskId,
    profileId: grantClaims.profileId,
    registrationGeneration: 1,
    physicalToolName,
    logicalToolName: "comment_on_assignment" as const,
    requestId: downstreamRequestId,
  };
  let beginCalls = 0;
  let mutationCalls = 0;
  let finishCalls = 0;
  const request = (async (url: URL | RequestInfo) => {
    const target = String(url);
    if (target.endsWith("/ratiflow_begin_issue_relay_tool_v4")) {
      beginCalls += 1;
      return Response.json({ ok: true, data: { disposition: "AUTHORIZED", context } });
    }
    if (target.endsWith("/ratiflow_transition_issue_relay_attempt_v4")) {
      mutationCalls += 1;
      if (mutationCalls === 1) throw new DOMException("response lost", "AbortError");
      return Response.json({ ok: true, data: { comment: { commentId: randomUUID() } } });
    }
    if (target.endsWith("/ratiflow_finish_issue_relay_tool_v4")) {
      finishCalls += 1;
      return Response.json({
        ok: true,
        data: { resultReceiptId: randomUUID(), output: "{\"ok\":true,\"data\":{}}" },
      });
    }
    throw new Error(`Unexpected RPC: ${target}`);
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    signingSecret: SECRET,
    fetch: request,
  });
  const grant = codec.signGrant(grantClaims);
  const execution = {
    requestId: randomUUID(),
    permit: codec.signPermit(permitClaims),
    physicalToolName,
    input: toolInput,
  };
  await assert.rejects(service.executeRelayTool(grant, execution), /response lost/);
  const recovered = await service.executeRelayTool(grant, execution);
  assert.equal(recovered.ok, true);
  assert.equal(beginCalls, 2);
  assert.equal(mutationCalls, 2);
  assert.equal(finishCalls, 1);
});

test("an in-request mutable response loss recovers the ledger result before FINISH", async () => {
  const codec = new RepositoryRelayTokenCodec(SECRET);
  const grantClaims: RelayGrantClaims = {
    v: 1, aud: "ratiflow-webmcp-relay",
    documentId: randomUUID(), profileId: randomUUID(), taskId: randomUUID(),
    runId: randomUUID(), attemptId: randomUUID(), claimantMemberId: randomUUID(),
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest("page"), leaseId: randomUUID(),
    registrationGeneration: 1, nonce: "grant-nonce-123456789",
    issuedAt: now, expiresAt: later,
  };
  const physicalToolName = "rf_editorial_0123456789abcdef_g1_progress";
  const toolInput = { body: "Progress", evidenceRefs: [] as string[] };
  const permitClaims: RelayExecutionPermitClaims = {
    v: 1, aud: "ratiflow-webmcp-relay-tool",
    attemptId: grantClaims.attemptId, functionCallId: "ambiguous-call",
    physicalToolName, argumentsDigest: relaySha256(toolInput),
    registrationGeneration: 1, leaseId: grantClaims.leaseId,
    nonce: "permit-nonce-12345678", issuedAt: now, expiresAt: later,
  };
  const commentId = randomUUID();
  const receiptId = randomUUID();
  const recoveredEnvelope = {
    ok: true as const,
    data: { comment: { commentId, body: "Recovered from the exact ledger." } },
  };
  const storedOutput = JSON.stringify(recoveredEnvelope, null, 2);
  const context = {
    documentId: grantClaims.documentId, runId: grantClaims.runId,
    attemptId: grantClaims.attemptId, taskId: grantClaims.taskId,
    profileId: grantClaims.profileId, registrationGeneration: 1,
    physicalToolName, logicalToolName: "comment_on_assignment" as const,
    requestId: randomUUID(),
  };
  let beginCalls = 0;
  let mutationCalls = 0;
  let finishCalls = 0;
  const request = (async (url: URL | RequestInfo, init?: RequestInit) => {
    const target = String(url);
    if (target.endsWith("/ratiflow_begin_issue_relay_tool_v4")) {
      beginCalls += 1;
      return Response.json({ ok: true, data: { disposition: "AUTHORIZED", context } });
    }
    if (target.endsWith("/ratiflow_transition_issue_relay_attempt_v4")) {
      mutationCalls += 1;
      if (mutationCalls === 1) {
        return Response.json({ error: "response lost after commit" }, { status: 504 });
      }
      return Response.json(recoveredEnvelope);
    }
    if (target.endsWith("/ratiflow_finish_issue_relay_tool_v4")) {
      finishCalls += 1;
      const body = JSON.parse(String(init?.body)) as { p_output: string };
      assert.notEqual(body.p_output, storedOutput);
      assert.deepEqual(JSON.parse(body.p_output), JSON.parse(storedOutput));
      return Response.json({
        ok: true,
        data: { resultReceiptId: receiptId, output: storedOutput },
      });
    }
    throw new Error(`Unexpected RPC: ${target}`);
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co", serviceRoleKey: "service-role",
    signingSecret: SECRET, fetch: request,
  });
  const result = await service.executeRelayTool(codec.signGrant(grantClaims), {
    requestId: randomUUID(), permit: codec.signPermit(permitClaims), physicalToolName, input: toolInput,
  });
  assert.deepEqual(result, {
    ok: true,
    data: { resultReceiptId: receiptId, output: storedOutput },
  });
  assert.equal(beginCalls, 1);
  assert.equal(mutationCalls, 2);
  assert.equal(finishCalls, 1);
});

test("concurrent exact mutable calls converge on one ledger mutation and receipt", async () => {
  const codec = new RepositoryRelayTokenCodec(SECRET);
  const grantClaims: RelayGrantClaims = {
    v: 1, aud: "ratiflow-webmcp-relay",
    documentId: randomUUID(), profileId: randomUUID(), taskId: randomUUID(),
    runId: randomUUID(), attemptId: randomUUID(), claimantMemberId: randomUUID(),
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest("page"), leaseId: randomUUID(),
    registrationGeneration: 1, nonce: "grant-nonce-123456789",
    issuedAt: now, expiresAt: later,
  };
  const physicalToolName = "rf_editorial_0123456789abcdef_g1_progress";
  const toolInput = { body: "Progress", evidenceRefs: [] as string[] };
  const permitClaims: RelayExecutionPermitClaims = {
    v: 1, aud: "ratiflow-webmcp-relay-tool",
    attemptId: grantClaims.attemptId, functionCallId: "concurrent-call",
    physicalToolName, argumentsDigest: relaySha256(toolInput),
    registrationGeneration: 1, leaseId: grantClaims.leaseId,
    nonce: "permit-nonce-12345678", issuedAt: now, expiresAt: later,
  };
  const recoveredEnvelope = {
    ok: true as const,
    data: { comment: { commentId: randomUUID(), body: "One committed comment." } },
  };
  const storedOutput = JSON.stringify(recoveredEnvelope, null, 2);
  const receiptId = randomUUID();
  const context = {
    documentId: grantClaims.documentId, runId: grantClaims.runId,
    attemptId: grantClaims.attemptId, taskId: grantClaims.taskId,
    profileId: grantClaims.profileId, registrationGeneration: 1,
    physicalToolName, logicalToolName: "comment_on_assignment" as const,
    requestId: randomUUID(),
  };
  let beginCalls = 0;
  let mutationCalls = 0;
  let applicationMutations = 0;
  let finishCalls = 0;
  let releaseMutationBarrier: (() => void) | undefined;
  const mutationBarrier = new Promise<void>((resolve) => {
    releaseMutationBarrier = resolve;
  });
  const request = (async (url: URL | RequestInfo, init?: RequestInit) => {
    const target = String(url);
    if (target.endsWith("/ratiflow_begin_issue_relay_tool_v4")) {
      beginCalls += 1;
      return Response.json({ ok: true, data: { disposition: "AUTHORIZED", context } });
    }
    if (target.endsWith("/ratiflow_transition_issue_relay_attempt_v4")) {
      mutationCalls += 1;
      if (applicationMutations === 0) applicationMutations += 1;
      if (mutationCalls === 2) releaseMutationBarrier?.();
      await mutationBarrier;
      return Response.json(recoveredEnvelope);
    }
    if (target.endsWith("/ratiflow_finish_issue_relay_tool_v4")) {
      finishCalls += 1;
      const body = JSON.parse(String(init?.body)) as { p_output: string };
      assert.deepEqual(JSON.parse(body.p_output), JSON.parse(storedOutput));
      return Response.json({
        ok: true,
        data: { resultReceiptId: receiptId, output: storedOutput },
      });
    }
    throw new Error(`Unexpected RPC: ${target}`);
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co", serviceRoleKey: "service-role",
    signingSecret: SECRET, fetch: request,
  });
  const execution = {
    requestId: randomUUID(), permit: codec.signPermit(permitClaims), physicalToolName, input: toolInput,
  };
  const grant = codec.signGrant(grantClaims);
  const [left, right] = await Promise.all([
    service.executeRelayTool(grant, execution),
    service.executeRelayTool(grant, execution),
  ]);
  assert.deepEqual(left, right);
  assert.deepEqual(left, {
    ok: true,
    data: { resultReceiptId: receiptId, output: storedOutput },
  });
  assert.equal(beginCalls, 2);
  assert.equal(mutationCalls, 2);
  assert.equal(applicationMutations, 1);
  assert.equal(finishCalls, 2);
});

test("an expired executing permit rejection never re-invokes the mutable adapter port", async () => {
  const codec = new RepositoryRelayTokenCodec(SECRET);
  const grantClaims: RelayGrantClaims = {
    v: 1, aud: "ratiflow-webmcp-relay",
    documentId: randomUUID(), profileId: randomUUID(), taskId: randomUUID(),
    runId: randomUUID(), attemptId: randomUUID(), claimantMemberId: randomUUID(),
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest("page"), leaseId: randomUUID(),
    registrationGeneration: 1, nonce: "grant-nonce-123456789",
    issuedAt: now, expiresAt: later,
  };
  const input = { body: "Progress", evidenceRefs: [] as string[] };
  const physicalToolName = "rf_editorial_0123456789abcdef_g1_progress";
  const permitClaims: RelayExecutionPermitClaims = {
    v: 1, aud: "ratiflow-webmcp-relay-tool",
    attemptId: grantClaims.attemptId, functionCallId: "expired-call",
    physicalToolName, argumentsDigest: relaySha256(input),
    registrationGeneration: 1, leaseId: grantClaims.leaseId,
    nonce: "permit-nonce-12345678", issuedAt: now, expiresAt: later,
  };
  let mutationCalls = 0;
  const request = (async (url: URL | RequestInfo) => {
    const target = String(url);
    if (target.endsWith("/ratiflow_begin_issue_relay_tool_v4")) {
      return Response.json({
        ok: false,
        code: "RELAY_EXECUTION_NOT_ARMED",
        message: "The executing permit is expired or inactive.",
        retryable: false,
      });
    }
    mutationCalls += 1;
    throw new Error(`Unexpected RPC after expired permit rejection: ${target}`);
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    signingSecret: SECRET,
    fetch: request,
  });
  const result = await service.executeRelayTool(codec.signGrant(grantClaims), {
    requestId: randomUUID(),
    permit: codec.signPermit(permitClaims),
    physicalToolName,
    input,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "RELAY_EXECUTION_NOT_ARMED");
  assert.equal(mutationCalls, 0);
});

test("a definitive retryable repository error is finalized instead of wedging EXECUTING", async () => {
  const codec = new RepositoryRelayTokenCodec(SECRET);
  const grantClaims: RelayGrantClaims = {
    v: 1, aud: "ratiflow-webmcp-relay",
    documentId: randomUUID(), profileId: randomUUID(), taskId: randomUUID(),
    runId: randomUUID(), attemptId: randomUUID(), claimantMemberId: randomUUID(),
    credentialSessionDigest: relaySecretDigest("credential"),
    pageSessionDigest: relaySecretDigest("page"), leaseId: randomUUID(),
    registrationGeneration: 1, nonce: "grant-nonce-123456789",
    issuedAt: now, expiresAt: later,
  };
  const physicalToolName = "rf_editorial_0123456789abcdef_g1_progress";
  const toolInput = { body: "Progress", evidenceRefs: [] as string[] };
  const permitClaims: RelayExecutionPermitClaims = {
    v: 1, aud: "ratiflow-webmcp-relay-tool",
    attemptId: grantClaims.attemptId, functionCallId: "call-1", physicalToolName,
    argumentsDigest: relaySha256(toolInput), registrationGeneration: 1,
    leaseId: grantClaims.leaseId, nonce: "permit-nonce-12345678",
    issuedAt: now, expiresAt: later,
  };
  const context = {
    documentId: grantClaims.documentId, runId: grantClaims.runId,
    attemptId: grantClaims.attemptId, taskId: grantClaims.taskId,
    profileId: grantClaims.profileId, registrationGeneration: 1,
    physicalToolName, logicalToolName: "comment_on_assignment" as const,
    requestId: randomUUID(),
  };
  let mutationCalls = 0;
  let finishedOutput = "";
  const request = (async (url: URL | RequestInfo, init?: RequestInit) => {
    const target = String(url);
    if (target.endsWith("/ratiflow_begin_issue_relay_tool_v4")) {
      return Response.json({ ok: true, data: { disposition: "AUTHORIZED", context } });
    }
    if (target.endsWith("/ratiflow_transition_issue_relay_attempt_v4")) {
      mutationCalls += 1;
      return Response.json({
        ok: false, code: "STALE_DOCUMENT", message: "Head changed.", retryable: true,
      });
    }
    if (target.endsWith("/ratiflow_finish_issue_relay_tool_v4")) {
      const body = JSON.parse(String(init?.body)) as { p_output: string };
      finishedOutput = body.p_output;
      return Response.json({
        ok: true,
        data: { resultReceiptId: randomUUID(), output: body.p_output },
      });
    }
    throw new Error(`Unexpected RPC: ${target}`);
  }) as typeof fetch;
  const service = new SupabaseRepositoryRelayService({
    url: "https://example.supabase.co", serviceRoleKey: "service-role",
    signingSecret: SECRET, fetch: request,
  });
  const result = await service.executeRelayTool(codec.signGrant(grantClaims), {
    requestId: randomUUID(), permit: codec.signPermit(permitClaims), physicalToolName, input: toolInput,
  });
  assert.equal(result.ok, true);
  assert.equal(mutationCalls, 1);
  assert.deepEqual(JSON.parse(finishedOutput), {
    ok: false, code: "STALE_DOCUMENT", message: "Head changed.", retryable: true,
  });
});
