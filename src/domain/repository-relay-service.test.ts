import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { test } from "vitest";

import { createSpecialistFixturePort } from "@/agent-relay/fixtures";
import { buildExpectedManifest } from "@/agent-relay/server/relay-stepper";
import type { ManagedAgentExpertise } from "@/agent-relay/contracts";
import type { CreateDirectoryMentionServiceInput } from "@/repository/contracts";
import { relaySha256 } from "@/domain/repository-relay-security";
import {
  LocalRepositoryService,
  type LocalRepositoryServiceOptions,
} from "@/domain/repository-service";

const SIGNING_SECRET = "relay-test-signing-secret-with-32-bytes-minimum";

function success<T>(result: { ok: true; data: T } | { ok: false; code: string }): T {
  if (result.ok) return result.data;
  throw new Error(result.code);
}

async function queueManagedWorkspace(
  local: LocalRepositoryService,
  displayName = "Priya",
  expertise: ManagedAgentExpertise = "GENERAL",
) {
  const owner = success(await local.launch({ kind: "POSTMORTEM", displayName }));
  success(await local.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Incident",
    body: "Alpha beta gamma",
  }));
  const relay = local.getRelayService();
  const initial = success(await relay.readRelayState(owner.humanSessionToken));
  const agent = initial.directory.find((entry) =>
    entry.kind === "AGENT" && entry.identitySource === "DEMO_DIRECTORY"
      && entry.expertise === expertise);
  if (!agent || agent.kind !== "AGENT" || agent.identitySource !== "DEMO_DIRECTORY") {
    throw new Error(`managed ${expertise} agent missing`);
  }
  const receipt = success(await relay.createDirectoryMention(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 2,
    comment: expertise === "CODE"
      ? "@Code Check this passage against the synthetic repository."
      : `@${agent.displayName} Rewrite this passage clearly.`,
    target: { kind: "AGENT", profileId: agent.profileId },
    anchor: { scope: "SELECTION", field: "BODY", rangeStart: 6, rangeEnd: 10 },
  }));
  assert.equal(receipt.outcome, "MANAGED_TASK_QUEUED");
  return { owner, relay, receipt };
}

async function claimManagedWorkspace(
  local: LocalRepositoryService,
  displayName = "Priya",
  expertise: ManagedAgentExpertise = "GENERAL",
) {
  const queued = await queueManagedWorkspace(local, displayName, expertise);
  const pageSessionId = randomUUID();
  const claimRequestId = randomUUID();
  const claim = success(await queued.relay.claimRelay(
    queued.owner.humanSessionToken, pageSessionId, claimRequestId,
  ));
  if (claim.outcome !== "CLAIMED") throw new Error("managed claim missing");
  return { ...queued, claim, pageSessionId, claimRequestId };
}

async function managedWorkspace(
  options: LocalRepositoryServiceOptions = {},
  expertise: ManagedAgentExpertise = "GENERAL",
) {
  const local = new LocalRepositoryService({
    relaySigningSecret: SIGNING_SECRET,
    specialistFixturePort: createSpecialistFixturePort(),
    ...options,
  });
  return { local, ...await claimManagedWorkspace(local, "Priya", expertise) };
}

async function failAttempt(
  relay: ReturnType<LocalRepositoryService["getRelayService"]>,
  claim: Awaited<ReturnType<typeof claimManagedWorkspace>>["claim"],
) {
  const reservation = {
    requestId: randomUUID(),
    inputDigest: relaySha256({ action: "START", attemptId: claim.attempt.attemptId, expectedStep: 0 }),
    attemptId: claim.attempt.attemptId,
    expectedStep: 0,
  } as const;
  const begun = success(await relay.beginStep(claim.grant, reservation));
  assert.equal(begun.disposition, "AUTHORIZED");
  success(await relay.recordStepResult(claim.grant, {
    ...reservation,
    providerResponseId: null,
    result: {
      ok: false,
      code: "RELAY_UNAVAILABLE",
      message: "Simulated provider failure.",
      retryable: true,
    },
  }));
}

test("managed mention preserves v4.1 projection and emits the frozen discovery trace", async () => {
  const { local, owner, relay, receipt, claim } = await managedWorkspace();
  const legacy = success(await local.inspect(owner.humanSessionToken));
  const projected = legacy.tasks.find((task) => task.taskId === receipt.taskId);
  assert.equal(projected?.agentProfileId, null);
  assert.equal(projected?.context, null);

  for (const transition of ["IDLE_CATALOG_WITHDRAWN", "RELAY_CATALOG_REGISTERED"] as const) {
    success(await relay.recordRelayTrace(claim.grant, {
      kind: transition,
      detail: { transition },
    }));
    success(await relay.recordRelayTrace(claim.grant, {
      kind: "WEBMCP_TOOLCHANGE_OBSERVED",
      detail: { transition },
    }));
  }

  const requestId = randomUUID();
  const reservation = {
    requestId,
    inputDigest: relaySha256({ action: "START", attemptId: claim.attempt.attemptId, expectedStep: 0 }),
    attemptId: claim.attempt.attemptId,
    expectedStep: 0,
  } as const;
  const begun = success(await relay.beginStep(claim.grant, reservation));
  assert.equal(begun.disposition, "AUTHORIZED");
  const inProgress = success(await relay.beginStep(claim.grant, reservation));
  assert.deepEqual(inProgress, { disposition: "IN_PROGRESS", retryAfterMs: 15_000 });

  const result = {
    ok: true as const,
    data: {
      outcome: "DISCOVER_TOOLS" as const,
      attemptId: claim.attempt.attemptId,
      nextStep: 1,
      toolSearchCallId: "search-call-1",
      goal: "Find the exact tools for this assignment.",
    },
  };
  success(await relay.recordStepResult(claim.grant, {
    ...reservation,
    providerResponseId: "response-1",
    result,
  }));
  const replayed = success(await relay.beginStep(claim.grant, reservation));
  assert.deepEqual(replayed, { disposition: "RECORDED", result });

  const expected = success(buildExpectedManifest(
    "https://ratiflow.test",
    claim.run.accessProfile,
    claim.agent.runtime,
    claim.attempt.registrationScope,
    claim.attempt.registrationGeneration,
  ));
  success(await relay.recordRelayManifest(claim.grant, expected.manifest));
  const state = success(await relay.readRelayState(owner.humanSessionToken));
  assert.deepEqual(state.trace.map((event) => event.kind), [
    "RUN_QUEUED",
    "RUN_CLAIMED",
    "IDLE_CATALOG_WITHDRAWN",
    "WEBMCP_TOOLCHANGE_OBSERVED",
    "RELAY_CATALOG_REGISTERED",
    "WEBMCP_TOOLCHANGE_OBSERVED",
    "MODEL_TOOL_SEARCH_REQUESTED",
    "WEBMCP_GET_TOOLS_COMPLETED",
  ]);
});

test("company policy fixes each managed handle to its immutable website access", async () => {
  const dataMetrics = await managedWorkspace({}, "DATA");
  const codeRepository = await managedWorkspace({}, "CODE");
  const generalEditorial = await managedWorkspace({}, "GENERAL");
  assert.equal(dataMetrics.claim.agent.expertise, "DATA");
  assert.equal(codeRepository.claim.agent.expertise, "CODE");
  assert.equal(generalEditorial.claim.agent.expertise, "GENERAL");
  assert.equal(dataMetrics.claim.run.accessProfile, "METRICS_SCOPED_EDIT");
  assert.equal(codeRepository.claim.run.accessProfile, "REPOSITORY_SCOPED_EDIT");
  assert.equal(generalEditorial.claim.run.accessProfile, "EDITORIAL_SCOPED_EDIT");
  assert.notDeepEqual(
    codeRepository.claim.capabilityGrant.logicalToolNames,
    generalEditorial.claim.capabilityGrant.logicalToolNames,
  );
});

test("the Data bot completes its company-configured Metrics run with matching evidence", async () => {
  const { local, owner, relay, claim } = await managedWorkspace({}, "DATA");
  const expected = success(buildExpectedManifest(
    "https://ratiflow.test",
    claim.run.accessProfile,
    claim.agent.runtime,
    claim.attempt.registrationScope,
    claim.attempt.registrationGeneration,
  ));
  success(await relay.recordRelayManifest(claim.grant, expected.manifest));

  const execute = async (
    logicalName: "read_assignment" | "query_demo_metrics" | "submit_scoped_revision",
    functionCallId: string,
    input: Readonly<Record<string, unknown>>,
  ) => {
    const entry = expected.manifest.entries.find((candidate) =>
      candidate.logicalName === logicalName);
    if (!entry) throw new Error(`${logicalName} missing from Metrics catalog`);
    const permit = success(await relay.issueExecutionPermit(claim.grant, {
      attemptId: claim.attempt.attemptId,
      functionCallId,
      physicalToolName: entry.physicalName,
      arguments: input,
    }));
    return success(await relay.executeRelayTool(claim.grant, {
      requestId: randomUUID(),
      permit: permit.token,
      physicalToolName: entry.physicalName,
      input,
    }));
  };

  const assignment = JSON.parse((await execute("read_assignment", "cross-assignment", {})).output);
  assert.equal(assignment.data.agent.expertise, "DATA");
  assert.equal(assignment.data.capabilityGrant.accessProfile, "METRICS_SCOPED_EDIT");
  await execute("query_demo_metrics", "cross-metrics", {
    dataset: "northstar_launch_capacity",
    question: "What launch constraint should this passage state?",
  });
  await execute("submit_scoped_revision", "cross-submit", {
    basedOnRevision: 2,
    resultSummary: "Applied the metrics-backed capacity constraint.",
    replacementText: "capacity-constrained",
    evidenceRefs: ["northstar_launch_capacity"],
  });

  const surface = success(await local.inspect(owner.humanSessionToken));
  assert.equal(surface.document.body, "Alpha capacity-constrained gamma");
  assert.deepEqual(surface.history[0]?.evidenceRefs, ["northstar_launch_capacity"]);
});

test("an equal-cardinality Editorial manifest cannot cross a Repository-scoped run boundary", async () => {
  const { owner, relay, claim } = await managedWorkspace({}, "CODE");
  const forged = success(buildExpectedManifest(
    "https://ratiflow.test",
    "EDITORIAL_SCOPED_EDIT",
    claim.agent.runtime,
    claim.attempt.registrationScope,
    claim.attempt.registrationGeneration,
  ));
  assert.equal(forged.manifest.entries.length, claim.capabilityGrant.logicalToolNames.length);
  const rejected = await relay.recordRelayManifest(claim.grant, forged.manifest);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "RELAY_MANIFEST_MISMATCH");

  const editorialTool = forged.manifest.entries.find((entry) =>
    entry.logicalName === "read_company_style_guide");
  if (!editorialTool) throw new Error("forged Editorial tool missing");
  const permit = await relay.issueExecutionPermit(claim.grant, {
    attemptId: claim.attempt.attemptId,
    functionCallId: "forged-editorial-tool",
    physicalToolName: editorialTool.physicalName,
    arguments: {},
  });
  assert.equal(permit.ok, false);
  if (!permit.ok) assert.equal(permit.code, "RELAY_MANIFEST_MISMATCH");
  const state = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(state.trace.some(({ kind }) => kind === "WEBMCP_GET_TOOLS_COMPLETED"), false);
  assert.equal(state.runs[0]?.status, "ACTIVE");
});

test("the server derives managed access and both mention arms reject supplied access", async () => {
  const local = new LocalRepositoryService({ relaySigningSecret: SIGNING_SECRET });
  const owner = success(await local.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  const relay = local.getRelayService();
  const state = success(await relay.readRelayState(owner.humanSessionToken));
  const agent = state.directory.find((entry) =>
    entry.kind === "AGENT" && entry.identitySource === "DEMO_DIRECTORY");
  if (!agent || agent.kind !== "AGENT") throw new Error("managed agent missing");
  const base = {
    requestId: randomUUID(),
    expectedRevision: 1,
    comment: `@${agent.displayName} Review this passage.`,
    target: { kind: "AGENT", profileId: agent.profileId },
    anchor: { scope: "SELECTION", field: "BODY", rangeStart: 0, rangeEnd: 5 },
  } as const;
  const agentWithAccess = await relay.createDirectoryMention(
    owner.humanSessionToken,
    { ...base, accessProfile: "METRICS_SCOPED_EDIT" } as unknown as CreateDirectoryMentionServiceInput,
  );
  assert.equal(agentWithAccess.ok, false);
  if (!agentWithAccess.ok) assert.equal(agentWithAccess.code, "INVALID_INPUT");

  const queued = success(await relay.createDirectoryMention(
    owner.humanSessionToken,
    { ...base, requestId: randomUUID() },
  ));
  assert.equal(queued.outcome, "MANAGED_TASK_QUEUED");
  const derived = success(await relay.readRelayState(owner.humanSessionToken)).runs[0];
  assert.equal(derived?.accessProfile, "METRICS_SCOPED_EDIT");

  const humanWithAccess = await relay.createDirectoryMention(
    owner.humanSessionToken,
    {
      requestId: randomUUID(), expectedRevision: 1,
      comment: "@Priya Discuss this document.",
      target: { kind: "HUMAN", memberId: owner.selfMemberId },
      accessProfile: "METRICS_SCOPED_EDIT",
      anchor: { scope: "DOCUMENT" },
    } as unknown as CreateDirectoryMentionServiceInput,
  );
  assert.equal(humanWithAccess.ok, false);
  if (!humanWithAccess.ok) assert.equal(humanWithAccess.code, "INVALID_INPUT");
});

test("one-shot managed tool permits replay one receipt and reject a changed request", async () => {
  const { relay, claim } = await managedWorkspace();
  const expected = success(buildExpectedManifest(
    "https://ratiflow.test",
    claim.run.accessProfile,
    claim.agent.runtime,
    claim.attempt.registrationScope,
    claim.attempt.registrationGeneration,
  ));
  const assignment = expected.manifest.entries.find((entry) =>
    entry.logicalName === "read_assignment");
  if (!assignment) throw new Error("assignment tool missing");
  const functionCallId = "function-call-1";
  const permit = success(await relay.issueExecutionPermit(claim.grant, {
    attemptId: claim.attempt.attemptId,
    functionCallId,
    physicalToolName: assignment.physicalName,
    arguments: {},
  }));
  const requestId = randomUUID();
  const input = {
    requestId,
    permit: permit.token,
    physicalToolName: assignment.physicalName,
    input: {},
  };
  const first = success(await relay.executeRelayTool(claim.grant, input));
  const replay = success(await relay.executeRelayTool(claim.grant, input));
  assert.deepEqual(replay, first);
  assert.equal(JSON.parse(first.output).ok, true);
  const changed = await relay.executeRelayTool(claim.grant, {
    ...input,
    requestId: randomUUID(),
  });
  assert.equal(changed.ok, false);
  if (!changed.ok) assert.equal(changed.code, "REQUEST_REPLAY_MISMATCH");
});

test("read_demo_file permits match the exact path-only catalog schema", async () => {
  const { relay, claim } = await managedWorkspace({}, "CODE");
  const expected = success(buildExpectedManifest(
    "https://ratiflow.test",
    claim.run.accessProfile,
    claim.agent.runtime,
    claim.attempt.registrationScope,
    claim.attempt.registrationGeneration,
  ));
  const readFile = expected.manifest.entries.find((entry) =>
    entry.logicalName === "read_demo_file");
  if (!readFile) throw new Error("read_demo_file tool missing");

  for (const [index, path] of [
    "src/checkout/retry-middleware.ts",
    "checkout.log",
  ].entries()) {
    const accepted = await relay.issueExecutionPermit(claim.grant, {
      attemptId: claim.attempt.attemptId,
      functionCallId: `read-file-valid-${index}`,
      physicalToolName: readFile.physicalName,
      arguments: { path },
    });
    assert.equal(accepted.ok, true, `${path} should match the advertised schema`);
  }

  const rejectedInputs = [
    { path: "checkout.log", startLine: 1, endLine: 5 },
    { path: "checkout.log", unexpected: true },
    { path: "../../.env" },
  ];
  for (const [index, argumentsValue] of rejectedInputs.entries()) {
    const rejected = await relay.issueExecutionPermit(claim.grant, {
      attemptId: claim.attempt.attemptId,
      functionCallId: `read-file-invalid-${index}`,
      physicalToolName: readFile.physicalName,
      arguments: argumentsValue,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "RELAY_RESULT_INVALID");
  }
});

test("a completed submit tool still replays its exact durable receipt", async () => {
  const { owner, relay, claim } = await managedWorkspace();
  const expected = success(buildExpectedManifest(
    "https://ratiflow.test",
    claim.run.accessProfile,
    claim.agent.runtime,
    claim.attempt.registrationScope,
    claim.attempt.registrationGeneration,
  ));
  const submit = expected.manifest.entries.find((entry) =>
    entry.logicalName === "submit_scoped_revision");
  if (!submit) throw new Error("submit tool missing");
  const input = {
    basedOnRevision: 2,
    resultSummary: "Clarified the selected passage.",
    replacementText: "clear",
    evidenceRefs: [],
  };
  const permit = success(await relay.issueExecutionPermit(claim.grant, {
    attemptId: claim.attempt.attemptId,
    functionCallId: "submit-call-1",
    physicalToolName: submit.physicalName,
    arguments: input,
  }));
  const selectionStep = {
    requestId: randomUUID(),
    inputDigest: relaySha256({
      action: "SELECT_SUBMIT", attemptId: claim.attempt.attemptId, expectedStep: 0,
    }),
    attemptId: claim.attempt.attemptId,
    expectedStep: 0,
  } as const;
  assert.equal(success(await relay.beginStep(claim.grant, selectionStep)).disposition, "AUTHORIZED");
  success(await relay.recordStepResult(claim.grant, {
    ...selectionStep,
    providerResponseId: "response-select-submit",
    result: {
      ok: true,
      data: {
        outcome: "EXECUTE_TOOL",
        attemptId: claim.attempt.attemptId,
        nextStep: 1,
        functionCallId: "submit-call-1",
        physicalToolName: submit.physicalName,
        arguments: input,
        permit,
      },
    },
  }));
  const execution = {
    requestId: randomUUID(),
    permit: permit.token,
    physicalToolName: submit.physicalName,
    input,
  };
  const first = success(await relay.executeRelayTool(claim.grant, execution));
  const replay = success(await relay.executeRelayTool(claim.grant, execution));
  assert.deepEqual(replay, first);
  assert.equal(JSON.parse(first.output).ok, true);
  const finalStep = {
    requestId: randomUUID(),
    inputDigest: relaySha256({
      action: "FINAL_PROSE", attemptId: claim.attempt.attemptId, expectedStep: 1,
    }),
    attemptId: claim.attempt.attemptId,
    expectedStep: 1,
  } as const;
  const finalBegin = success(await relay.beginStep(claim.grant, finalStep));
  assert.equal(finalBegin.disposition, "AUTHORIZED");
  if (finalBegin.disposition === "AUTHORIZED") {
    assert.equal(finalBegin.context.attempt.status, "SUCCEEDED");
  }
  const finalUnknown = success(await relay.recordStepResult(claim.grant, {
    ...finalStep,
    providerResponseId: null,
    result: {
      ok: false,
      code: "RELAY_PROVIDER_OUTCOME_UNKNOWN",
      message: "The managed agent provider response was lost after dispatch.",
      retryable: false,
      nextAction: "Wait for authoritative reconciliation before retrying.",
    },
  }));
  assert.equal(finalUnknown.attempt.status, "SUCCEEDED");
  assert.equal(finalUnknown.attempt.providerCallCount, 2);
  const beforeRelease = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(beforeRelease.runs[0]?.status, "COMPLETED");
  assert.equal(beforeRelease.activeAttempt, null);
  for (const transition of ["RELAY_CATALOG_WITHDRAWN", "IDLE_CATALOG_RESTORED"] as const) {
    success(await relay.recordRelayTrace(claim.grant, {
      kind: transition,
      detail: { transition },
    }));
    success(await relay.recordRelayTrace(claim.grant, {
      kind: "WEBMCP_TOOLCHANGE_OBSERVED",
      detail: { transition },
    }));
  }
  success(await relay.releaseRelayLease(claim.grant));
  const kinds = success(await relay.readRelayState(owner.humanSessionToken)).trace
    .map(({ kind }) => kind);
  const ordered = [
    "WEBMCP_EXECUTE_STARTED",
    "REVISION_COMMITTED",
    "WEBMCP_EXECUTE_COMPLETED",
    "RELAY_CATALOG_WITHDRAWN",
    "IDLE_CATALOG_RESTORED",
    "RUN_COMPLETED",
  ] as const;
  let previous = -1;
  for (const kind of ordered) {
    const index = kinds.indexOf(kind);
    assert.ok(index > previous, `${kind} is out of order`);
    previous = index;
  }
});

test("a canonical human mention creates discussion only", async () => {
  const local = new LocalRepositoryService({ relaySigningSecret: SIGNING_SECRET });
  const owner = success(await local.launch({ kind: "PRODUCT_DOCUMENT", displayName: "Data" }));
  const relay = local.getRelayService();
  const receipt = success(await relay.createDirectoryMention(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    comment: "@Data Please review this document.",
    target: { kind: "HUMAN", memberId: owner.selfMemberId },
    anchor: { scope: "DOCUMENT" },
  }));
  assert.equal(receipt.outcome, "DISCUSSION_CREATED");
  assert.equal(receipt.taskId, null);
  assert.equal(receipt.runId, null);
  const state = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(state.runs.length, 0);
  const handles = state.directory.map((entry) => entry.handle.toLowerCase());
  assert.equal(new Set(handles).size, handles.length);
  assert.equal(handles.filter((handle) => handle === "data").length, 1);
});

test("an older WAITING_RETRY head blocks newer work and only its exact retry can claim", async () => {
  const {
    owner, relay, receipt: firstReceipt, claim: firstClaim, pageSessionId, claimRequestId,
  } = await managedWorkspace();
  if (!firstReceipt.runId) throw new Error("first run missing");
  await failAttempt(relay, firstClaim);

  const secondReceipt = success(await relay.createDirectoryMention(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 2,
    comment: "@General Rewrite the next passage clearly.",
    target: { kind: "AGENT", profileId: firstClaim.agent.profileId },
    anchor: { scope: "SELECTION", field: "BODY", rangeStart: 11, rangeEnd: 16 },
  }));
  if (!secondReceipt.runId) throw new Error("second run missing");

  const replayMismatch = await relay.claimRelay(
    owner.humanSessionToken, pageSessionId, claimRequestId, firstReceipt.runId,
  );
  assert.equal(replayMismatch.ok, false);
  if (!replayMismatch.ok) assert.equal(replayMismatch.code, "REQUEST_REPLAY_MISMATCH");

  const ordinary = success(await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(),
  ));
  assert.equal(ordinary.outcome, "NO_WORK");
  const skippedHead = await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(), secondReceipt.runId,
  );
  assert.equal(skippedHead.ok, false);
  if (!skippedHead.ok) assert.equal(skippedHead.code, "RELAY_STATE_CONFLICT");

  const retry = success(await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(), firstReceipt.runId,
  ));
  if (retry.outcome !== "CLAIMED") throw new Error("exact retry was not claimed");
  assert.equal(retry.attempt.attemptNumber, 2);
  const exhausted = success(await relay.releaseRelayLease(retry.grant));
  assert.equal(exhausted.status, "EXHAUSTED");

  const state = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(state.runs.find(({ runId }) => runId === firstReceipt.runId)?.status, "EXHAUSTED");
  assert.equal(state.runs.find(({ runId }) => runId === secondReceipt.runId)?.status, "QUEUED");
  assert.equal(state.trace.some(({ kind }) => kind === "RELAY_CATALOG_WITHDRAWN"), false);
  assert.equal(state.trace.some(({ kind }) => kind === "IDLE_CATALOG_RESTORED"), false);

  const next = success(await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(),
  ));
  assert.equal(next.outcome, "CLAIMED");
  if (next.outcome === "CLAIMED") assert.equal(next.run.runId, secondReceipt.runId);
});

test("provider-run quota is consumed once per attempt and reopens after its window", async () => {
  let now = Date.parse("2026-09-02T01:00:00.000Z");
  const { owner, relay, receipt, claim } = await managedWorkspace({
    now: () => now,
    relayProviderQuotaWindowMs: 1_000,
    relayProviderDocumentLimit: 1,
    relayProviderDeploymentLimit: 10,
  });
  if (!receipt.runId) throw new Error("managed run missing");
  await failAttempt(relay, claim);
  const limited = await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(), receipt.runId,
  );
  assert.equal(limited.ok, false);
  if (!limited.ok) {
    assert.equal(limited.code, "RATE_LIMITED");
    assert.equal(limited.retryable, true);
  }
  const repeated = await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(), receipt.runId,
  );
  assert.equal(repeated.ok, false);
  if (!repeated.ok) assert.equal(repeated.code, "RATE_LIMITED");
  const beforeWindow = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(beforeWindow.activeAttempt, null);
  assert.equal(beforeWindow.runs[0]?.status, "WAITING_RETRY");
  assert.equal(beforeWindow.runs[0]?.attemptCount, 1);
  assert.equal(beforeWindow.trace.filter(({ kind }) => kind === "RUN_CLAIMED").length, 1);

  now += 1_001;
  const retry = success(await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(), receipt.runId,
  ));
  if (retry.outcome !== "CLAIMED") throw new Error("retry claim missing");
  assert.equal(retry.attempt.attemptNumber, 2);
  const reservation = {
    requestId: randomUUID(),
    inputDigest: relaySha256({ action: "START", attemptId: retry.attempt.attemptId, expectedStep: 0 }),
    attemptId: retry.attempt.attemptId,
    expectedStep: 0,
  } as const;
  const authorized = success(await relay.beginStep(retry.grant, reservation));
  assert.equal(authorized.disposition, "AUTHORIZED");
  const replay = success(await relay.beginStep(retry.grant, reservation));
  assert.equal(replay.disposition, "IN_PROGRESS");
  const afterDispatch = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(afterDispatch.runs[0]?.attemptCount, 2);
  assert.equal(afterDispatch.activeAttempt?.providerDispatched, true);
});

test("deployment-wide reservation is refunded before dispatch but a dispatch spends one slot", async () => {
  const local = new LocalRepositoryService({
    relaySigningSecret: SIGNING_SECRET,
    specialistFixturePort: createSpecialistFixturePort(),
    relayProviderDeploymentLimit: 1,
    relayProviderDocumentLimit: 6,
  });
  const first = await claimManagedWorkspace(local, "Priya");
  const second = await queueManagedWorkspace(local, "Jordan");
  const blockedByReservation = await second.relay.claimRelay(
    second.owner.humanSessionToken, randomUUID(), randomUUID(),
  );
  assert.equal(blockedByReservation.ok, false);
  if (!blockedByReservation.ok) assert.equal(blockedByReservation.code, "RATE_LIMITED");
  const stillQueued = success(await second.relay.readRelayState(second.owner.humanSessionToken));
  assert.equal(stillQueued.runs[0]?.attemptCount, 0);
  assert.equal(stillQueued.runs[0]?.status, "QUEUED");

  success(await first.relay.releaseRelayLease(first.claim.grant));
  const secondClaim = success(await second.relay.claimRelay(
    second.owner.humanSessionToken, randomUUID(), randomUUID(),
  ));
  if (secondClaim.outcome !== "CLAIMED") throw new Error("refunded slot was not claimable");
  const secondReservation = {
    requestId: randomUUID(),
    inputDigest: relaySha256({ action: "START", attemptId: secondClaim.attempt.attemptId, expectedStep: 0 }),
    attemptId: secondClaim.attempt.attemptId,
    expectedStep: 0,
  } as const;
  assert.equal(success(await second.relay.beginStep(
    secondClaim.grant, secondReservation,
  )).disposition, "AUTHORIZED");
  const blockedAfterDispatch = await first.relay.claimRelay(
    first.owner.humanSessionToken, randomUUID(), randomUUID(),
  );
  assert.equal(blockedAfterDispatch.ok, false);
  if (!blockedAfterDispatch.ok) assert.equal(blockedAfterDispatch.code, "RATE_LIMITED");
});

test("an unknown post-dispatch provider outcome reconciles and blocks a paid retry until deadline", async () => {
  let now = Date.parse("2026-09-02T02:00:00.000Z");
  const { owner, relay, receipt, claim } = await managedWorkspace({
    now: () => now,
    relayProviderQuotaWindowMs: 1_000,
  });
  if (!receipt.runId) throw new Error("managed run missing");
  const reservation = {
    requestId: randomUUID(),
    inputDigest: relaySha256({
      action: "START", attemptId: claim.attempt.attemptId, expectedStep: 0,
    }),
    attemptId: claim.attempt.attemptId,
    expectedStep: 0,
  } as const;
  assert.equal(success(await relay.beginStep(claim.grant, reservation)).disposition, "AUTHORIZED");
  const unknown = {
    ok: false as const,
    code: "RELAY_PROVIDER_OUTCOME_UNKNOWN" as const,
    message: "The managed agent provider response was lost after dispatch.",
    retryable: false,
    nextAction: "Wait for authoritative reconciliation before retrying.",
  };
  const recorded = success(await relay.recordStepResult(claim.grant, {
    ...reservation,
    providerResponseId: null,
    result: unknown,
  }));
  assert.deepEqual(recorded.result, unknown);
  assert.equal(recorded.attempt.status, "RECONCILING");
  assert.equal(recorded.attempt.providerCallCount, 1);
  assert.deepEqual(success(await relay.recordStepResult(claim.grant, {
    ...reservation,
    providerResponseId: null,
    result: unknown,
  })).result, unknown);

  const released = success(await relay.releaseRelayLease(claim.grant));
  assert.equal(released.status, "ACTIVE");
  const state = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(state.runs[0]?.status, "ACTIVE");
  assert.equal(state.runs[0]?.attemptCount, 1);
  assert.equal(state.activeAttempt?.status, "RECONCILING");
  assert.equal(state.activeAttempt?.completedAt, null);
  assert.equal(state.trace.filter(({ kind }) => kind === "ATTEMPT_RECONCILING").length, 1);
  const blocked = success(await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(),
  ));
  assert.equal(blocked.outcome, "BUSY");

  now = Date.parse(claim.attempt.deadlineAt) + 1;
  const afterDeadline = success(await relay.readRelayState(owner.humanSessionToken));
  assert.equal(afterDeadline.runs[0]?.status, "WAITING_RETRY");
  assert.equal(afterDeadline.runs[0]?.attemptCount, 1);
  const retry = success(await relay.claimRelay(
    owner.humanSessionToken, randomUUID(), randomUUID(), receipt.runId,
  ));
  assert.equal(retry.outcome, "CLAIMED");
  if (retry.outcome === "CLAIMED") assert.equal(retry.attempt.attemptNumber, 2);
});

test("release rejects an expired Relay grant instead of mutating terminal state", async () => {
  let now = Date.parse("2026-09-02T03:00:00.000Z");
  const { relay, claim } = await managedWorkspace({ now: () => now });
  const payload = claim.grant.split(".")[1];
  if (!payload) throw new Error("Relay grant payload missing");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    expiresAt: string;
  };
  now = Date.parse(claims.expiresAt) + 1;

  const released = await relay.releaseRelayLease(claim.grant);
  assert.equal(released.ok, false);
  if (!released.ok) assert.equal(released.code, "UNAUTHORIZED");
});

test("an expired execution permit cannot invoke its Relay tool", async () => {
  let now = Date.parse("2026-09-02T04:00:00.000Z");
  const { owner, relay, claim } = await managedWorkspace({ now: () => now });
  const expected = success(buildExpectedManifest(
    "https://ratiflow.test",
    claim.run.accessProfile,
    claim.agent.runtime,
    claim.attempt.registrationScope,
    claim.attempt.registrationGeneration,
  ));
  const assignment = expected.manifest.entries.find((entry) =>
    entry.logicalName === "read_assignment");
  if (!assignment) throw new Error("assignment tool missing");
  const permit = success(await relay.issueExecutionPermit(claim.grant, {
    attemptId: claim.attempt.attemptId,
    functionCallId: "expired-permit-call",
    physicalToolName: assignment.physicalName,
    arguments: {},
  }));
  now = Date.parse(permit.expiresAt) + 1;

  const result = await relay.executeRelayTool(claim.grant, {
    requestId: randomUUID(),
    permit: permit.token,
    physicalToolName: assignment.physicalName,
    input: {},
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "RELAY_EXECUTION_NOT_ARMED");
  const state = success(await relay.readRelayState(owner.humanSessionToken));
  assert.notEqual(state.activeAttempt?.status, "EXECUTING_TOOL");
});

test("ordinary task compatibility rejects managed principals but preserves humans and BYOA", async () => {
  const local = new LocalRepositoryService({ relaySigningSecret: SIGNING_SECRET });
  const owner = success(await local.launch({ kind: "POSTMORTEM", displayName: "Priya" }));
  success(await local.saveHumanRevision(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 1, title: "Incident", body: "Alpha beta gamma",
  }));
  const state = success(await local.getRelayService().readRelayState(owner.humanSessionToken));
  const managedMemberIds = state.directory.flatMap((entry) =>
    entry.kind === "AGENT" && entry.identitySource === "DEMO_DIRECTORY"
      ? [entry.principal.memberId]
      : []);
  assert.equal(managedMemberIds.length, 3);
  for (const [index, memberId] of managedMemberIds.entries()) {
    const input = {
      requestId: randomUUID(),
      expectedRevision: 2,
      title: `Managed bypass ${index}`,
      category: "GENERAL" as const,
      instruction: "Review this incident and report one finding.",
      agentLabel: "Managed agent",
      mode: "COMMENT" as const,
      assignedToMemberId: memberId,
      anchor: { scope: "DOCUMENT" as const },
    };
    const rejected = await local.createTask(owner.humanSessionToken, input);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "STALE_AGENT_PROFILE");
    assert.deepEqual(await local.createTask(owner.humanSessionToken, input), rejected);
  }

  const managed = state.directory.find((entry) =>
    entry.kind === "AGENT" && entry.identitySource === "DEMO_DIRECTORY"
      && entry.expertise === "GENERAL");
  if (!managed || managed.kind !== "AGENT") throw new Error("managed directory principal missing");
  const rejected = await local.createMentionTask(owner.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 2,
    comment: "@General Rewrite this passage.",
    mentionedAgentName: "General",
    assignedToMemberId: managed.principal.memberId,
    anchor: { scope: "SELECTION", field: "BODY", rangeStart: 0, rangeEnd: 5 },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "STALE_AGENT_PROFILE");

  const human = success(await local.createTask(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 2, title: "Human follow-up",
    category: "GENERAL", instruction: "Coordinate the human follow-up.",
    agentLabel: "Priya", mode: "COMMENT", assignedToMemberId: owner.selfMemberId,
    anchor: { scope: "DOCUMENT" },
  }));
  assert.equal(human.tasks.at(-1)?.assignee.memberId, owner.selfMemberId);

  const joined = success(await local.join({
    shareToken: owner.shareToken, displayName: "Maya",
  }));
  success(await local.connectAgent(joined.agentSessionToken, {
    requestId: randomUUID(), name: "Maya BYOA",
  }, randomUUID()));
  const byoa = success(await local.createTask(owner.humanSessionToken, {
    requestId: randomUUID(), expectedRevision: 2, title: "BYOA review",
    category: "GENERAL", instruction: "Review the incident as the connected BYOA agent.",
    agentLabel: "Maya BYOA", mode: "COMMENT", assignedToMemberId: joined.selfMemberId,
    anchor: { scope: "DOCUMENT" },
  }));
  const byoaTask = byoa.tasks.find(({ title }) => title === "BYOA review");
  assert.equal(byoaTask?.assignee.memberId, joined.selfMemberId);
  assert.equal(byoaTask?.agentProfileId, null);
  assert.equal(success(await local.getRelayService().readRelayState(
    owner.humanSessionToken,
  )).runs.length, 0);
});
