import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import {
  MANAGED_RELAY_ACCESS_PROFILES,
  REPOSITORY_PROTOCOL_VERSION,
  REPOSITORY_TOOL_NAMES,
} from "@/repository/contracts";
import { relayResponse } from "@/app/api/repository-v4/_response";

import {
  AGENT_DIRECTORY_IDENTITY_SOURCES,
  AGENT_DIRECTORY_VISIBILITIES,
  MANAGED_AGENT_ACCESS_BY_HANDLE,
  MANAGED_AGENT_HANDLES,
  MANAGED_AGENT_MODEL,
  MANAGED_AGENT_RUNTIME,
  MANAGED_AGENT_EXPERTISES,
  MANAGED_AGENT_TOOL_DEFINITIONS,
  RELAY_ACCESS_POLICIES,
  RELAY_ACCESS_SOURCE_TOOL_NAMES,
  RELAY_COMMON_TOOL_NAMES,
  RELAY_ATTEMPT_STATUSES,
  RELAY_BOUNDS,
  RELAY_ERROR_CODES,
  RELAY_EXECUTION_PERMIT_AUDIENCE,
  RELAY_EXECUTION_PERMIT_SIGNING_DOMAIN,
  RELAY_EXECUTION_PERMIT_TOKEN_PREFIX,
  RELAY_GRANT_AUDIENCE,
  RELAY_GRANT_SIGNING_DOMAIN,
  RELAY_GRANT_TOKEN_PREFIX,
  RELAY_PERMIT_STATUSES,
  RELAY_RUN_STATUSES,
  RELAY_TRACE_KINDS,
} from "./contracts";

type RelayGolden = {
  protocolVersion: number;
  runtime: string;
  model: string;
  agents: Array<{
    handle: string;
    identitySource: string;
  }>;
  postmortem: {
    heroAgent: string;
    prompt: string;
    requiredToolOrder: string[];
    syntheticSources: {
      "checkout.log": {
        retryTrafficMultiple: number;
        queueDepthBefore: number;
        queueDepthPeak: number;
      };
      "commit:7d3c9e1": { behavior: string };
    };
    forbiddenConclusion: string;
  };
  productDocument: {
    heroAgent: string;
    requiredToolOrder: string[];
    syntheticSources: {
      northstar_launch_capacity: {
        preBetaCapacityDays: number;
        reliabilityDays: number;
        inviteOnlyBetaDays: number;
        fullExportDays: number;
        renewalValueUsd: number;
      };
    };
    forbiddenConclusion: string;
  };
  requiredTraceSubsequence: string[];
  ablation: {
    webMcpUnavailable: {
      humanEditingAvailable: boolean;
      commentsAvailable: boolean;
      historyAndRestoreAvailable: boolean;
      managedRelayExecutes: boolean;
      queuedTaskRemainsVisible: boolean;
    };
  };
};

function readGolden(): RelayGolden {
  const path = fileURLToPath(
    new URL("../../evals/goldens/repo-document-v4.2/managed-relay.json", import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as RelayGolden;
}

test("keeps protocol 4 and the exact idle BYOA catalog", () => {
  assert.equal(REPOSITORY_PROTOCOL_VERSION, 4);
  assert.deepEqual(REPOSITORY_TOOL_NAMES, [
    "connect_agent",
    "inspect_document",
    "read_document_history",
    "read_collaboration_context",
    "list_my_tasks",
    "wait_for_my_tasks",
    "comment_on_task",
    "submit_task_result",
  ]);
});

test("freezes descriptive bot identities separately from website access policies", () => {
  assert.deepEqual(MANAGED_AGENT_EXPERTISES, ["DATA", "CODE", "GENERAL"]);
  assert.deepEqual(MANAGED_AGENT_HANDLES, ["data", "code", "general"]);
  assert.deepEqual(MANAGED_AGENT_ACCESS_BY_HANDLE, {
    data: "METRICS_SCOPED_EDIT",
    code: "REPOSITORY_SCOPED_EDIT",
    general: "EDITORIAL_SCOPED_EDIT",
  });
  assert.deepEqual(AGENT_DIRECTORY_VISIBILITIES, ["COMPANY", "TEAM", "PERSONAL"]);
  assert.deepEqual(AGENT_DIRECTORY_IDENTITY_SOURCES, [
    "DEMO_DIRECTORY",
    "SELF_DECLARED",
  ]);
  assert.deepEqual(MANAGED_RELAY_ACCESS_PROFILES, [
    "METRICS_SCOPED_EDIT",
    "REPOSITORY_SCOPED_EDIT",
    "EDITORIAL_SCOPED_EDIT",
  ]);
  assert.deepEqual(RELAY_COMMON_TOOL_NAMES, [
    "read_assignment",
    "read_document_context",
    "read_collaboration_context",
    "comment_on_assignment",
    "submit_scoped_revision",
  ]);
  assert.deepEqual(RELAY_ACCESS_SOURCE_TOOL_NAMES, {
    METRICS_SCOPED_EDIT: ["query_demo_metrics"],
    REPOSITORY_SCOPED_EDIT: ["search_demo_code", "read_demo_file"],
    EDITORIAL_SCOPED_EDIT: ["read_company_style_guide", "check_document_consistency"],
  });

  const policies = Object.values(RELAY_ACCESS_POLICIES);
  for (const policy of policies) {
    assert.equal(policy.documentAuthority, "DIRECT_SELECTION");
    assert.deepEqual(policy.logicalToolNames.slice(0, RELAY_COMMON_TOOL_NAMES.length), [
      ...RELAY_COMMON_TOOL_NAMES,
    ]);
  }
  assert.equal(
    RELAY_ACCESS_POLICIES.REPOSITORY_SCOPED_EDIT.logicalToolNames.length,
    RELAY_ACCESS_POLICIES.EDITORIAL_SCOPED_EDIT.logicalToolNames.length,
  );
  assert.notDeepEqual(
    RELAY_ACCESS_POLICIES.REPOSITORY_SCOPED_EDIT.logicalToolNames,
    RELAY_ACCESS_POLICIES.EDITORIAL_SCOPED_EDIT.logicalToolNames,
  );

  for (const [logicalName, definition] of Object.entries(MANAGED_AGENT_TOOL_DEFINITIONS)) {
    assert.equal(definition.logicalName, logicalName);
    assert.match(definition.providerKey, /^[a-z0-9_]+$/);
    assert.equal(definition.annotations.untrustedContentHint, true);
    const schema = definition.inputSchema as {
      properties: Readonly<Record<string, unknown>>;
      required: readonly string[];
      additionalProperties: boolean;
    };
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  }
  assert.deepEqual(MANAGED_AGENT_TOOL_DEFINITIONS.read_demo_file.inputSchema, {
    type: "object",
    properties: {
      path: {
        type: "string",
        enum: ["src/checkout/retry-middleware.ts", "checkout.log"],
      },
    },
    required: ["path"],
    additionalProperties: false,
  });
  assert.match(
    MANAGED_AGENT_TOOL_DEFINITIONS.submit_scoped_revision.description,
    /replacementText must materially differ from the active selected text/u,
  );
});

test("freezes bounded lease, retry, permit, and trace state machines", () => {
  assert.equal(RELAY_GRANT_AUDIENCE, "ratiflow-webmcp-relay");
  assert.equal(RELAY_GRANT_TOKEN_PREFIX, "rfrelay_v1");
  assert.equal(RELAY_GRANT_SIGNING_DOMAIN, "ratiflow-relay-grant-v1");
  assert.equal(RELAY_EXECUTION_PERMIT_AUDIENCE, "ratiflow-webmcp-relay-tool");
  assert.equal(RELAY_EXECUTION_PERMIT_TOKEN_PREFIX, "rfpermit_v1");
  assert.equal(RELAY_EXECUTION_PERMIT_SIGNING_DOMAIN, "ratiflow-relay-permit-v1");
  assert.deepEqual(RELAY_RUN_STATUSES, [
    "QUEUED",
    "ACTIVE",
    "WAITING_RETRY",
    "COMPLETED",
    "EXHAUSTED",
    "CANCELLED",
  ]);
  assert.deepEqual(RELAY_ATTEMPT_STATUSES, [
    "CLAIMED",
    "DISCOVERING",
    "AWAITING_MODEL",
    "EXECUTING_TOOL",
    "RECONCILING",
    "SUCCEEDED",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
  ]);
  assert.deepEqual(RELAY_PERMIT_STATUSES, [
    "ISSUED",
    "EXECUTING",
    "COMPLETED",
    "FAILED",
    "REVOKED",
  ]);
  assert.deepEqual(RELAY_ERROR_CODES, [
    "STALE_MENTION_TARGET",
    "RELAY_UNAVAILABLE",
    "RELAY_LEASE_LOST",
    "RELAY_STATE_CONFLICT",
    "RELAY_EXECUTION_NOT_ARMED",
    "RELAY_MANIFEST_MISMATCH",
    "RELAY_RESULT_INVALID",
    "RELAY_PROVIDER_OUTCOME_UNKNOWN",
  ]);
  assert.equal(relayResponse({
    ok: false,
    code: "RELAY_PROVIDER_OUTCOME_UNKNOWN",
    message: "The managed agent provider response was lost after dispatch.",
    retryable: false,
    nextAction: "Wait for authoritative reconciliation before retrying.",
  }).status, 409);
  assert.equal(RELAY_BOUNDS.recoveryHeartbeatMs, 15_000);
  assert.equal(RELAY_BOUNDS.leaseRenewalMs * 3, RELAY_BOUNDS.leaseTtlMs);
  assert.equal(RELAY_BOUNDS.maxAttemptsPerRun, 2);
  assert.equal(RELAY_BOUNDS.maxResponsesCallsPerAttempt, 6);
  assert.equal(RELAY_BOUNDS.maxToolCallsPerAttempt, 8);
  assert.ok(RELAY_BOUNDS.executionPermitTtlMs < RELAY_BOUNDS.grantTtlMs);
});

test("freezes the independent managed-relay oracle", () => {
  const golden = readGolden();
  assert.equal(golden.protocolVersion, REPOSITORY_PROTOCOL_VERSION);
  assert.equal(golden.runtime, MANAGED_AGENT_RUNTIME);
  assert.equal(golden.model, MANAGED_AGENT_MODEL);
  assert.deepEqual(
    golden.agents.map(({ handle }) => handle),
    [...MANAGED_AGENT_HANDLES],
  );
  for (const agent of golden.agents) {
    assert.equal(agent.identitySource, "DEMO_DIRECTORY");
  }

  assert.equal(golden.postmortem.heroAgent, "code");
  assert.equal(
    golden.postmortem.prompt,
    "@Code Reframe this root-cause section as exactly three labeled Markdown bullets—Trigger, Amplifier, and Why it persisted—using the synthetic repository and checkout log. Preserve every verified date, quantity, and source reference, then replace only this section.",
  );
  assert.deepEqual(golden.postmortem.requiredToolOrder, [
    "read_assignment",
    "search_demo_code",
    "read_demo_file",
    "submit_scoped_revision",
  ]);
  assert.equal(golden.postmortem.syntheticSources["checkout.log"].retryTrafficMultiple, 5.8);
  assert.equal(
    golden.postmortem.syntheticSources["checkout.log"].queueDepthPeak /
      golden.postmortem.syntheticSources["checkout.log"].queueDepthBefore,
    18240 / 420,
  );
  assert.match(
    golden.postmortem.syntheticSources["commit:7d3c9e1"].behavior,
    /ignored Retry-After/,
  );
  assert.match(golden.postmortem.forbiddenConclusion, /latency alone/);

  const capacity = golden.productDocument.syntheticSources.northstar_launch_capacity;
  assert.equal(capacity.reliabilityDays + capacity.inviteOnlyBetaDays, capacity.preBetaCapacityDays);
  assert.equal(capacity.reliabilityDays + capacity.fullExportDays, 18);
  assert.equal(capacity.renewalValueUsd, 180_000);
  assert.match(golden.productDocument.forbiddenConclusion, /general availability/);

  const expectedTraceSubsequence = [
    "RUN_QUEUED",
    "RUN_CLAIMED",
    "IDLE_CATALOG_WITHDRAWN",
    "RELAY_CATALOG_REGISTERED",
    "WEBMCP_TOOLCHANGE_OBSERVED",
    "MODEL_TOOL_SEARCH_REQUESTED",
    "WEBMCP_GET_TOOLS_COMPLETED",
    "MODEL_TOOL_SELECTED",
    "WEBMCP_EXECUTE_STARTED",
    "REVISION_COMMITTED",
    "WEBMCP_EXECUTE_COMPLETED",
    "RELAY_CATALOG_WITHDRAWN",
    "WEBMCP_TOOLCHANGE_OBSERVED",
    "IDLE_CATALOG_RESTORED",
    "RUN_COMPLETED",
  ];
  assert.deepEqual(golden.requiredTraceSubsequence, expectedTraceSubsequence);
  for (const kind of golden.requiredTraceSubsequence) {
    assert.ok(
      RELAY_TRACE_KINDS.includes(kind as (typeof RELAY_TRACE_KINDS)[number]),
      `${kind} must be a checked trace kind`,
    );
  }
  assert.deepEqual(golden.ablation.webMcpUnavailable, {
    humanEditingAvailable: true,
    commentsAvailable: true,
    historyAndRestoreAvailable: true,
    managedRelayExecutes: false,
    queuedTaskRemainsVisible: true,
  });
});
