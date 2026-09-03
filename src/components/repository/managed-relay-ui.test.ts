import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { DirectoryEntry, RelayWorkspaceState } from "@/agent-relay/contracts";

import { ManagedDirectory } from "./ManagedDirectory";
import { RelayFlightRecorder } from "./RelayFlightRecorder";
import { WebsiteAccessSelector } from "./WebsiteAccessSelector";
import { repositoryRecommendedAccessProfile } from "./relay-access-copy";

const member = { memberId: "member-1", displayName: "Ari" };
const directory: DirectoryEntry[] = [
  {
    kind: "AGENT",
    profileId: "profile-data",
    principal: { memberId: "managed-data", displayName: "Data" },
    handle: "data",
    displayName: "Data",
    visibility: "COMPANY",
    readiness: "READY",
    identitySource: "DEMO_DIRECTORY",
    expertise: "DATA",
    runtime: "OPENAI_LUNA_WEBMCP_RELAY",
  },
  { kind: "HUMAN", member, handle: "ari", displayName: "Ari" },
];

function waitingRetryState(): RelayWorkspaceState {
  return {
    directory,
    runs: [{
      runId: "run-retry",
      taskId: "task-retry",
      profileId: "profile-data",
      agentExpertise: "DATA",
      accessProfile: "METRICS_SCOPED_EDIT",
      runtime: "OPENAI_LUNA_WEBMCP_RELAY",
      model: "gpt-5.6-luna",
      status: "WAITING_RETRY",
      attemptCount: 1,
      maxAttempts: 2,
      terminalReason: null,
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-02T12:00:02.000Z",
      completedAt: null,
    }],
    activeAttempt: null,
    trace: [],
    currentRelayEventVersion: 1,
    webMcpRequired: true,
    recoveryHeartbeatMs: 15_000,
  };
}

test("managed directory presents expertise and visibility without implying tool access", () => {
  const markup = renderToStaticMarkup(createElement(ManagedDirectory, { directory }));
  assert.match(markup, /Managed bots/u);
  assert.match(markup, /Expertise, not access/u);
  assert.match(markup, /@Data/u);
  assert.match(markup, /Data analysis expertise/u);
  assert.match(markup, /company visibility/u);
  assert.match(markup, /People/u);
  assert.match(markup, /@Ari/u);
  assert.match(markup, /discussion only/u);
});

test("flight recorder shows the access-granted catalog and sanitized execution proof", () => {
  const state = {
    directory,
    runs: [{
      runId: "run-1",
      taskId: "task-1",
      profileId: "profile-data",
      agentExpertise: "DATA",
      accessProfile: "METRICS_SCOPED_EDIT",
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
  assert.match(markup, /Bot expertise/u);
  assert.match(markup, /Website access/u);
  assert.match(markup, /6 tools · Metrics grant/u);
  assert.match(markup, /Luna returned the required tool call/u);
  assert.match(markup, /Synthetic sources are labeled/u);
  assert.doesNotMatch(markup, /leaseId|pageSessionId|rfrelay_v1/u);
});

test("flight recorder keeps the newest completed run and its access visible", () => {
  const general = {
    kind: "AGENT" as const,
    profileId: "profile-general",
    principal: { memberId: "managed-general", displayName: "General" },
    handle: "general",
    displayName: "General",
    visibility: "COMPANY" as const,
    readiness: "READY" as const,
    identitySource: "DEMO_DIRECTORY" as const,
    expertise: "GENERAL" as const,
    runtime: "OPENAI_LUNA_WEBMCP_RELAY" as const,
  };
  const state = {
    directory: [...directory, general],
    runs: [
      {
        runId: "run-data",
        taskId: "task-data",
        profileId: "profile-data",
        agentExpertise: "DATA",
        accessProfile: "METRICS_SCOPED_EDIT",
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
        agentExpertise: "GENERAL",
        accessProfile: "EDITORIAL_SCOPED_EDIT",
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
  assert.match(markup, /7 tools · Editorial grant/u);
  assert.doesNotMatch(markup, /@Data/u);
});

test("flight recorder exposes durable provider reconciliation instead of ready", () => {
  const state = {
    directory,
    runs: [{
      runId: "run-reconciling",
      taskId: "task-reconciling",
      profileId: "profile-data",
      agentExpertise: "DATA",
      accessProfile: "METRICS_SCOPED_EDIT",
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

test.each([
  ["IDLE", null],
  ["FAILED", "The prior attempt stopped safely."],
] as const)("flight recorder offers bounded retry only when runtime is %s", (phase, lastError) => {
  const markup = renderToStaticMarkup(createElement(RelayFlightRecorder, {
    state: waitingRetryState(),
    runtime: { phase, activeLogicalTool: null, lastError, webMcpAvailable: true },
    onRetry: () => undefined,
  }));
  assert.match(markup, /Needs a bounded retry/u);
  assert.match(markup, />Retry once</u);
});

test.each([
  ["CLAIMING", null, "Starting bounded retry"],
  ["TRANSITIONING_TO_RELAY", null, "Switching to granted website tools"],
  ["DISCOVERING", null, "Discovering page tools"],
  ["AWAITING_MODEL", null, "Luna is composing the required call"],
  ["EXECUTING_TOOL", "submit_scoped_revision", "Running submit_scoped_revision"],
  ["RESTORING_IDLE", null, "Restoring idle page tools"],
] as const)("flight recorder hides stale retry while runtime is %s", (phase, activeLogicalTool, status) => {
  const markup = renderToStaticMarkup(createElement(RelayFlightRecorder, {
    state: waitingRetryState(),
    runtime: { phase, activeLogicalTool, lastError: null, webMcpAvailable: true },
    onRetry: () => undefined,
  }));
  assert.ok(markup.includes(status));
  assert.doesNotMatch(markup, />Retry once</u);
});

test("a Code bot can receive Metrics access without changing its expertise", () => {
  const codeBot: DirectoryEntry = {
    kind: "AGENT",
    profileId: "profile-code",
    principal: { memberId: "managed-code", displayName: "Code" },
    handle: "code",
    displayName: "Code",
    visibility: "TEAM",
    readiness: "READY",
    identitySource: "DEMO_DIRECTORY",
    expertise: "CODE",
    runtime: "OPENAI_LUNA_WEBMCP_RELAY",
  };
  const state = {
    ...waitingRetryState(),
    directory: [codeBot],
    runs: [{
      ...waitingRetryState().runs[0]!,
      profileId: "profile-code",
      agentExpertise: "CODE",
      accessProfile: "METRICS_SCOPED_EDIT",
    }],
  } satisfies RelayWorkspaceState;

  const markup = renderToStaticMarkup(createElement(RelayFlightRecorder, {
    state,
    runtime: { phase: "IDLE", activeLogicalTool: null, lastError: null, webMcpAvailable: true },
  }));
  assert.match(markup, /@Code/u);
  assert.match(markup, />code</u);
  assert.match(markup, /6 tools · Metrics grant/u);
  assert.match(markup, /query_demo_metrics/u);
  assert.doesNotMatch(markup, /search_demo_code/u);
});

test("website access stays an explicit, independently editable run choice", () => {
  const markup = renderToStaticMarkup(createElement(WebsiteAccessSelector, {
    value: "METRICS_SCOPED_EDIT",
    onChange: () => undefined,
  }));
  assert.match(markup, /Website access for this run/u);
  assert.match(markup, /Metrics/u);
  assert.match(markup, /Repository/u);
  assert.match(markup, /Editorial/u);
  assert.match(markup, /not the bot’s expertise/u);
  assert.equal(repositoryRecommendedAccessProfile("CODE"), "REPOSITORY_SCOPED_EDIT");
  assert.equal(repositoryRecommendedAccessProfile("DATA"), "METRICS_SCOPED_EDIT");
});
