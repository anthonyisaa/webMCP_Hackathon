import {
  MANAGED_AGENT_TOOL_CATALOGS,
  MANAGED_AGENT_TOOL_DEFINITIONS,
  type ManagedAgentDirectoryEntry,
  type ManagedAgentLogicalToolName,
  type RelayAttemptStateView,
  type RelayNormalizedToolManifest,
  type RelayNormalizedToolManifestEntry,
} from "../contracts";
import type { WebMCPRegisteredToolLike } from "../../webmcp/types";
import { canonicalJson, sha256CanonicalJson, utf8ByteLength } from "./canonical-json";
import { RelayBrowserError } from "./errors";
import { makeRelayPhysicalToolName } from "./physical-name";

export interface DiscoveredRelayCatalog {
  manifest: RelayNormalizedToolManifest;
  descriptors: ReadonlyMap<string, WebMCPRegisteredToolLike>;
}

const MAX_SCHEMA_UTF8_BYTES = 64 * 1024;
const MAX_SCHEMA_DEPTH = 64;
const MAX_SCHEMA_NODES = 4_096;

function schemaMismatch(message: string): never {
  throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", message);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function assertBoundedJsonTree(root: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 1 }];
  let nodeCount = 0;
  let byteCount = 0;

  const addJsonBytes = (fragment: string): void => {
    if (fragment.length > MAX_SCHEMA_UTF8_BYTES - byteCount) {
      schemaMismatch("A registered input schema exceeded the size limit.");
    }
    byteCount += utf8ByteLength(fragment);
    if (byteCount > MAX_SCHEMA_UTF8_BYTES) {
      schemaMismatch("A registered input schema exceeded the size limit.");
    }
  };

  while (pending.length > 0) {
    const current = pending.pop()!;
    nodeCount += 1;
    if (nodeCount > MAX_SCHEMA_NODES || current.depth > MAX_SCHEMA_DEPTH) {
      schemaMismatch("A registered input schema exceeded the complexity limit.");
    }

    if (current.value === null) {
      addJsonBytes("null");
      continue;
    }
    if (typeof current.value === "string") {
      addJsonBytes(JSON.stringify(current.value));
      continue;
    }
    if (typeof current.value === "boolean") {
      addJsonBytes(current.value ? "true" : "false");
      continue;
    }
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        schemaMismatch("A registered input schema was not a finite JSON tree.");
      }
      addJsonBytes(JSON.stringify(Object.is(current.value, -0) ? 0 : current.value));
      continue;
    }
    if (typeof current.value !== "object") {
      schemaMismatch("A registered input schema was not a finite JSON tree.");
    }

    if (Array.isArray(current.value)) {
      if (nodeCount + pending.length + current.value.length > MAX_SCHEMA_NODES) {
        schemaMismatch("A registered input schema exceeded the complexity limit.");
      }
      addJsonBytes("[]");
      if (current.value.length > 1) addJsonBytes(",".repeat(current.value.length - 1));
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: current.value[index], depth: current.depth + 1 });
      }
      continue;
    }
    if (!isPlainObject(current.value)) {
      schemaMismatch("A registered input schema was not a finite JSON tree.");
    }

    const keys = Object.keys(current.value);
    if (nodeCount + pending.length + keys.length > MAX_SCHEMA_NODES) {
      schemaMismatch("A registered input schema exceeded the complexity limit.");
    }
    addJsonBytes("{}");
    if (keys.length > 1) addJsonBytes(",".repeat(keys.length - 1));
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      addJsonBytes(JSON.stringify(key));
      addJsonBytes(":");
      pending.push({ value: current.value[key], depth: current.depth + 1 });
    }
  }
}

function parseSchema(value: WebMCPRegisteredToolLike["inputSchema"]): Record<string, unknown> {
  if (value === undefined) {
    throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "A registered input schema was missing.");
  }
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (value.length > MAX_SCHEMA_UTF8_BYTES || utf8ByteLength(value) > MAX_SCHEMA_UTF8_BYTES) {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "A registered input schema exceeded the size limit.");
    }
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "A registered input schema was not valid JSON.");
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "A registered input schema was not an object.");
  }
  try {
    assertBoundedJsonTree(parsed);
    return JSON.parse(canonicalJson(parsed)) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RelayBrowserError) {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", error.message);
    }
    throw error;
  }
}

function exactCatalog(agent: ManagedAgentDirectoryEntry): readonly ManagedAgentLogicalToolName[] {
  const expected = MANAGED_AGENT_TOOL_CATALOGS[agent.specialty];
  if (canonicalJson(agent.logicalToolNames) !== canonicalJson(expected)) {
    throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The claimed agent catalog differs from its specialty.");
  }
  return expected;
}

export async function normalizeRelayManifest(input: {
  tools: readonly WebMCPRegisteredToolLike[];
  agent: ManagedAgentDirectoryEntry;
  attempt: Pick<RelayAttemptStateView, "registrationGeneration" | "registrationScope">;
  origin: string;
  topLevelWindow: Window;
}): Promise<DiscoveredRelayCatalog> {
  const expectedLogicalNames = exactCatalog(input.agent);
  if (input.tools.length !== expectedLogicalNames.length) {
    throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The discovered Relay catalog has an unexpected size.");
  }

  const descriptors = new Map<string, WebMCPRegisteredToolLike>();
  for (const descriptor of input.tools) {
    if (descriptors.has(descriptor.name)) {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The discovered Relay catalog contains a duplicate name.");
    }
    if (descriptor.origin !== input.origin || descriptor.window !== input.topLevelWindow) {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "A Relay descriptor was not same-origin and top-level.");
    }
    descriptors.set(descriptor.name, descriptor);
  }

  const entries: RelayNormalizedToolManifestEntry[] = expectedLogicalNames.map((logicalName) => {
    const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
    const physicalName = makeRelayPhysicalToolName({
      specialty: input.agent.specialty,
      registrationScope: input.attempt.registrationScope,
      registrationGeneration: input.attempt.registrationGeneration,
      logicalName,
    });
    const descriptor = descriptors.get(physicalName);
    if (!descriptor) {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", `The ${logicalName} descriptor is missing.`);
    }
    const inputSchema = parseSchema(descriptor.inputSchema);
    if (
      descriptor.description !== definition.description
      || canonicalJson(inputSchema) !== canonicalJson(definition.inputSchema)
      || descriptor.annotations?.readOnlyHint !== definition.annotations.readOnlyHint
      || descriptor.annotations.untrustedContentHint !== definition.annotations.untrustedContentHint
    ) {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", `The ${logicalName} descriptor differs from the frozen definition.`);
    }
    return {
      origin: descriptor.origin,
      physicalName,
      logicalName,
      registrationGeneration: input.attempt.registrationGeneration,
      description: descriptor.description,
      inputSchema,
      annotations: {
        readOnlyHint: definition.annotations.readOnlyHint,
        untrustedContentHint: definition.annotations.untrustedContentHint,
      },
    };
  });
  const digest = await sha256CanonicalJson({ entries });
  return { manifest: { entries, digest }, descriptors };
}
