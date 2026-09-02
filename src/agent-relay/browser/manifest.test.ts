import assert from "node:assert/strict";
import { test } from "vitest";

import {
  MANAGED_AGENT_TOOL_CATALOGS,
  MANAGED_AGENT_TOOL_DEFINITIONS,
  RELAY_PHYSICAL_TOOL_NAME_PATTERN,
} from "../contracts";
import { canonicalJson } from "./canonical-json";
import { RelayBrowserError } from "./errors";
import { normalizeRelayManifest } from "./manifest";
import { makeRelayPhysicalToolName } from "./physical-name";
import { FakeWebMCPConsumer, TEST_ORIGIN, TEST_WINDOW, claimedAttempt, managedAgent } from "./test-helpers";

async function codeCatalog() {
  const context = new FakeWebMCPConsumer();
  const agent = managedAgent("CODE");
  const attempt = claimedAttempt();
  for (const logicalName of MANAGED_AGENT_TOOL_CATALOGS.CODE) {
    const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
    context.registerTool({
      name: makeRelayPhysicalToolName({
        specialty: "CODE",
        registrationScope: attempt.registrationScope,
        registrationGeneration: attempt.registrationGeneration,
        logicalName,
      }),
      description: definition.description,
      inputSchema: definition.inputSchema as Record<string, unknown>,
      annotations: definition.annotations,
      execute: async () => ({}),
    });
  }
  return { tools: await context.getTools(), agent, attempt };
}

async function expectSchemaRejection(
  inputSchema: Record<string, unknown> | string | undefined,
  message: RegExp,
): Promise<void> {
  const { tools, agent, attempt } = await codeCatalog();
  const tampered = tools.map((tool, index) => index === 0
    ? { ...tool, inputSchema }
    : tool);
  await assert.rejects(
    normalizeRelayManifest({
      tools: tampered,
      agent,
      attempt,
      origin: TEST_ORIGIN,
      topLevelWindow: TEST_WINDOW,
    }),
    (error: unknown) => error instanceof RelayBrowserError
      && error.code === "RELAY_MANIFEST_MISMATCH"
      && message.test(error.message),
  );
}

test("builds generation-unique exact role catalogs and a stable normalized manifest", async () => {
  const context = new FakeWebMCPConsumer();
  const agent = managedAgent("CODE");
  const attempt = claimedAttempt(7);

  for (const logicalName of MANAGED_AGENT_TOOL_CATALOGS.CODE) {
    const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
    const name = makeRelayPhysicalToolName({
      specialty: "CODE",
      registrationScope: attempt.registrationScope,
      registrationGeneration: attempt.registrationGeneration,
      logicalName,
    });
    assert.match(name, RELAY_PHYSICAL_TOOL_NAME_PATTERN);
    context.registerTool({
      name,
      description: definition.description,
      inputSchema: definition.inputSchema as Record<string, unknown>,
      annotations: definition.annotations,
      execute: async () => ({}),
    });
  }

  const tools = await context.getTools();
  tools[0] = { ...tools[0], inputSchema: JSON.stringify(tools[0]?.inputSchema) };
  const discovered = await normalizeRelayManifest({
    tools,
    agent,
    attempt,
    origin: TEST_ORIGIN,
    topLevelWindow: TEST_WINDOW,
  });
  assert.deepEqual(
    discovered.manifest.entries.map(({ logicalName }) => logicalName),
    MANAGED_AGENT_TOOL_CATALOGS.CODE,
  );
  assert.match(discovered.manifest.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(discovered.manifest.entries.every(({ origin }) => origin === TEST_ORIGIN), true);
  assert.equal(canonicalJson(discovered.manifest).includes("window"), false);

  const newerName = makeRelayPhysicalToolName({
    specialty: "CODE",
    registrationScope: attempt.registrationScope,
    registrationGeneration: attempt.registrationGeneration + 1,
    logicalName: "read_assignment",
  });
  assert.notEqual(newerName, discovered.manifest.entries[0]?.physicalName);
});

test("rejects extra, cross-origin, and definition-tampered descriptors", async () => {
  const context = new FakeWebMCPConsumer();
  const agent = managedAgent("DATA");
  const attempt = claimedAttempt();
  for (const logicalName of MANAGED_AGENT_TOOL_CATALOGS.DATA) {
    const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
    context.registerTool({
      name: makeRelayPhysicalToolName({
        specialty: "DATA",
        registrationScope: attempt.registrationScope,
        registrationGeneration: attempt.registrationGeneration,
        logicalName,
      }),
      description: definition.description,
      inputSchema: definition.inputSchema as Record<string, unknown>,
      annotations: definition.annotations,
      execute: async () => ({}),
    });
  }
  const tools = await context.getTools();
  const tampered = tools.map((tool, index) => index === 0
    ? { ...tool, origin: "https://attacker.invalid" }
    : tool);
  await assert.rejects(
    normalizeRelayManifest({
      tools: tampered,
      agent,
      attempt,
      origin: TEST_ORIGIN,
      topLevelWindow: TEST_WINDOW,
    }),
    (error: unknown) => error instanceof RelayBrowserError
      && error.code === "RELAY_MANIFEST_MISMATCH",
  );
  await assert.rejects(
    normalizeRelayManifest({
      tools: [...tools, tools[0]!],
      agent,
      attempt,
      origin: TEST_ORIGIN,
      topLevelWindow: TEST_WINDOW,
    }),
    (error: unknown) => error instanceof RelayBrowserError
      && error.code === "RELAY_MANIFEST_MISMATCH",
  );
});

test("rejects malformed, primitive, and absent schemas from registered descriptors", async () => {
  await expectSchemaRejection("{", /not valid JSON/u);
  await expectSchemaRejection("42", /not an object/u);
  await expectSchemaRejection(undefined, /was missing/u);
});

test("rejects oversized schemas in both native descriptor encodings", async () => {
  const oversizedProperty = "x".repeat(70_000);
  await expectSchemaRejection(
    JSON.stringify({ type: "object", description: oversizedProperty }),
    /size limit/u,
  );
  await expectSchemaRejection(
    { type: "object", description: oversizedProperty },
    /size limit/u,
  );
});

test("rejects schema trees that exceed finite depth or node limits", async () => {
  let overlyDeep: Record<string, unknown> = { type: "string" };
  for (let depth = 0; depth < 70; depth += 1) {
    overlyDeep = { nested: overlyDeep };
  }
  await expectSchemaRejection(overlyDeep, /complexity limit/u);
  await expectSchemaRejection(
    { type: "object", enum: Array.from({ length: 4_100 }, (_, index) => index) },
    /complexity limit/u,
  );
});
