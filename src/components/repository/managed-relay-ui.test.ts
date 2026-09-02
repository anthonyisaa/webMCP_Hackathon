import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { DirectoryEntry, RelayWorkspaceState } from "@/agent-relay/contracts";

import { ManagedDirectory } from "./ManagedDirectory";
import { RelayFlightRecorder } from "./RelayFlightRecorder";

const member = { memberId: "member-1", displayName: "Ari" };
const directory: DirectoryEntry[] = [
  {
    kind: "AGENT",
    profileId: "profile-data",
    principal: { memberId: "managed-data", displayName: "Data" },
    handle: "data",
    displayName: "Data",
    scope: "COMPANY",
    readiness: "READY",
    syntheticSourceLabels: ["Synthetic demo data"],
    identitySource: "DEMO_DIRECTORY",
    specialty: "DATA",
    runtime: "OPENAI_LUNA_WEBMCP_RELAY",
    logicalToolNames: [
      "read_assignment",
      "read_document_context",
      "read_collaboration_context",
      "comment_on_assignment",
      "submit_scoped_revision",
      "query_demo_metrics",
    ],
  },
  { kind: "HUMAN", member, handle: "ari", displayName: "Ari" },
];

test("managed directory separates ready specialists from discussion-only people", () => {
  const markup = renderToStaticMarkup(createElement(ManagedDirectory, { directory }));
  assert.match(markup, /Managed agents/u);
  assert.match(markup, /Demo directory/u);
  assert.match(markup, /@Data/u);
  assert.match(markup, /Synthetic metrics/u);
  assert.match(markup, /People/u);
  assert.match(markup, /@Ari/u);
  assert.match(markup, /discussion only/u);
});

test("flight recorder shows a role-scoped catalog and sanitized execution proof", () => {
  const state = {
    directory,
    runs: [{
      runId: "run-1",
      taskId: "task-1",
      profileId: "profile-data",
      specialty: "DATA",
      runtime: "OPENAI_LUNA_WEBMCP_RELAY",
      model: "gpt-5.6-luna",
      status: "ACTIVE",
      attemptCount: 1,
      maxAttempts: 2,
      terminalReason: null,
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-02T12:00:02.000Z",
      completedAt: null,
    }],
    activeAttempt: null,
    trace: [{
      relayEventId: "event-1",
      relayEventVersion: 1,
      documentId: "doc-1",
      runId: "run-1",
      attemptId: "attempt-1",
      kind: "MODEL_TOOL_SELECTED",
      logicalToolName: "query_demo_metrics",
      physicalToolName: null,
      manifestDigest: "sha256:abc",
      argumentsDigest: "sha256:def",
      resultDigest: null,
      detail: {},
      createdAt: "2026-09-02T12:00:02.000Z",
    }],
    currentRelayEventVersion: 1,
    webMcpRequired: true,
    recoveryHeartbeatMs: 15_000,
  } as RelayWorkspaceState;

  const markup = renderToStaticMarkup(createElement(RelayFlightRecorder, {
    state,
    runtime: { phase: "EXECUTING_TOOL", activeLogicalTool: "query_demo_metrics", lastError: null, webMcpAvailable: true },
  }));
  assert.match(markup, /Flight Recorder/u);
  assert.match(markup, /@Data/u);
  assert.match(markup, /gpt-5.6-luna/u);
  assert.match(markup, /Application-owned Luna ↔ WebMCP relay/u);
  assert.match(markup, /6 tools · role scoped/u);
  assert.match(markup, /Luna returned the required tool call/u);
  assert.match(markup, /Synthetic sources are labeled/u);
  assert.doesNotMatch(markup, /leaseId|pageSessionId|rfrelay_v1/u);
});

test("flight recorder keeps the newest completed specialist visible", () => {
  const general = {
    kind: "AGENT" as const,
    profileId: "profile-general",
    principal: { memberId: "managed-general", displayName: "General" },
    handle: "general",
    displayName: "General",
    scope: "COMPANY" as const,
    readiness: "READY" as const,
    syntheticSourceLabels: ["Synthetic company style guide"],
    identitySource: "DEMO_DIRECTORY" as const,
    specialty: "GENERAL" as const,
    runtime: "OPENAI_LUNA_WEBMCP_RELAY" as const,
    logicalToolNames: [
      "read_assignment",
      "read_document_context",
      "read_collaboration_context",
      "comment_on_assignment",
      "submit_scoped_revision",
      "read_company_style_guide",
      "check_document_consistency",
    ],
  };
  const state = {
    directory: [...directory, general],
    runs: [
      {
        runId: "run-data",
        taskId: "task-data",
        profileId: "profile-data",
        specialty: "DATA",
        runtime: "OPENAI_LUNA_WEBMCP_RELAY",
        model: "gpt-5.6-luna",
        status: "COMPLETED",
        attemptCount: 1,
        maxAttempts: 2,
        terminalReason: null,
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:02.000Z",
        completedAt: "2026-09-02T12:00:02.000Z",
      },
      {
        runId: "run-general",
        taskId: "task-general",
        profileId: "profile-general",
        specialty: "GENERAL",
        runtime: "OPENAI_LUNA_WEBMCP_RELAY",
        model: "gpt-5.6-luna",
        status: "COMPLETED",
        attemptCount: 1,
        maxAttempts: 2,
        terminalReason: null,
        createdAt: "2026-09-02T12:01:00.000Z",
        updatedAt: "2026-09-02T12:01:02.000Z",
        completedAt: "2026-09-02T12:01:02.000Z",
      },
    ],
    activeAttempt: null,
    trace: [],
    currentRelayEventVersion: 2,
    webMcpRequired: true,
    recoveryHeartbeatMs: 15_000,
  } as RelayWorkspaceState;

  const markup = renderToStaticMarkup(createElement(RelayFlightRecorder, {
    state,
    runtime: { phase: "IDLE", activeLogicalTool: null, lastError: null, webMcpAvailable: true },
  }));
  assert.match(markup, /@General/u);
  assert.match(markup, /7 tools · role scoped/u);
  assert.doesNotMatch(markup, /@Data/u);
});

test("flight recorder exposes durable provider reconciliation instead of ready", () => {
  const state = {
    directory,
    runs: [{
      runId: "run-reconciling",
      taskId: "task-reconciling",
      profileId: "profile-data",
      specialty: "DATA",
      runtime: "OPENAI_LUNA_WEBMCP_RELAY",
      model: "gpt-5.6-luna",
      status: "ACTIVE",
      attemptCount: 1,
      maxAttempts: 2,
      terminalReason: null,
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-02T12:00:02.000Z",
      completedAt: null,
    }],
    activeAttempt: {
      attemptId: "attempt-reconciling",
      runId: "run-reconciling",
      attemptNumber: 1,
      status: "RECONCILING",
      claimedBy: member,
      registrationGeneration: 1,
      registrationScope: "0011223344556677",
      leaseExpiresAt: "2026-09-02T12:00:45.000Z",
      providerDispatched: true,
      providerCallCount: 1,
      toolCallCount: 0,
      currentStep: 0,
      startedAt: "2026-09-02T12:00:00.000Z",
      deadlineAt: "2026-09-02T12:01:30.000Z",
      updatedAt: "2026-09-02T12:00:02.000Z",
      completedAt: null,
    },
    trace: [],
    currentRelayEventVersion: 1,
    webMcpRequired: true,
    recoveryHeartbeatMs: 15_000,
  } as RelayWorkspaceState;

  const markup = renderToStaticMarkup(createElement(RelayFlightRecorder, {
    state,
    runtime: { phase: "IDLE", activeLogicalTool: null, lastError: null, webMcpAvailable: true },
  }));
  assert.match(markup, /Reconciling the provider result/u);
  assert.doesNotMatch(markup, /Ready for a mention/u);
});
