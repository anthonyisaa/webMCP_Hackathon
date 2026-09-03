import {
  MANAGED_AGENT_RUNTIME,
  type ManagedAgentDirectoryEntry,
  type ManagedAgentExpertise,
  type RelayAccessProfile,
  type RelayCapabilityGrant,
  type RelayClaimedAttemptView,
} from "../contracts";
import { capabilityGrantForAccessProfile } from "../access-policy";
import type {
  WebMCPConsumerModelContext,
  WebMCPRegisteredToolLike,
  WebMCPToolLike,
} from "../../webmcp/types";

export const TEST_WINDOW = {} as Window;
export const TEST_ORIGIN = "https://ratiflow.test";

export function managedAgent(
  expertise: ManagedAgentExpertise = "CODE",
): ManagedAgentDirectoryEntry {
  return {
    kind: "AGENT",
    profileId: "10000000-0000-4000-8000-000000000001",
    principal: {
      memberId: "10000000-0000-4000-8000-000000000002",
      displayName: `${expertise} Agent`,
    },
    handle: expertise.toLowerCase(),
    displayName: `${expertise[0]}${expertise.slice(1).toLowerCase()} Agent`,
    visibility: "TEAM",
    readiness: "READY",
    identitySource: "DEMO_DIRECTORY",
    expertise,
    runtime: MANAGED_AGENT_RUNTIME,
  };
}

export function capabilityGrant(
  accessProfile: RelayAccessProfile = "REPOSITORY_SCOPED_EDIT",
): RelayCapabilityGrant {
  return capabilityGrantForAccessProfile(accessProfile);
}

export function claimedAttempt(
  registrationGeneration = 1,
): RelayClaimedAttemptView {
  return {
    attemptId: "20000000-0000-4000-8000-000000000001",
    runId: "20000000-0000-4000-8000-000000000002",
    attemptNumber: 1,
    status: "CLAIMED",
    claimedBy: {
      memberId: "20000000-0000-4000-8000-000000000003",
      displayName: "Judge",
    },
    registrationGeneration,
    registrationScope: "0123456789abcdef",
    leaseId: "20000000-0000-4000-8000-000000000004",
    leaseExpiresAt: "2026-09-02T01:00:45.000Z",
    providerDispatched: false,
    providerCallCount: 0,
    toolCallCount: 0,
    currentStep: 0,
    startedAt: "2026-09-02T01:00:00.000Z",
    deadlineAt: "2026-09-02T01:01:30.000Z",
    updatedAt: "2026-09-02T01:00:00.000Z",
    completedAt: null,
  };
}

interface ActiveRegistration {
  tool: WebMCPToolLike;
  descriptor: WebMCPRegisteredToolLike;
}

export class FakeWebMCPConsumer implements WebMCPConsumerModelContext {
  readonly #events = new EventTarget();
  readonly #active = new Map<string, ActiveRegistration>();
  readonly #byDescriptor = new WeakMap<object, ActiveRegistration>();
  readonly origin: string;
  readonly ownerWindow: Window;
  readonly schemaEncoding: "OBJECT" | "JSON_STRING";
  readonly forwardCallbackSignal: boolean;
  callbackDispatches = 0;
  lastNativeInput: Record<string, unknown> | string | null = null;

  constructor(
    origin = TEST_ORIGIN,
    ownerWindow = TEST_WINDOW,
    schemaEncoding: "OBJECT" | "JSON_STRING" = "OBJECT",
    forwardCallbackSignal = true,
  ) {
    this.origin = origin;
    this.ownerWindow = ownerWindow;
    this.schemaEncoding = schemaEncoding;
    this.forwardCallbackSignal = forwardCallbackSignal;
  }

  registerTool(tool: WebMCPToolLike, options?: { signal?: AbortSignal }): void {
    if (options?.signal?.aborted) throw options.signal.reason;
    if (this.#active.has(tool.name)) throw new DOMException("Duplicate tool", "InvalidStateError");
    const descriptor: WebMCPRegisteredToolLike = {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: this.schemaEncoding === "JSON_STRING"
        ? JSON.stringify(tool.inputSchema ?? {})
        : structuredClone(tool.inputSchema ?? {}),
      annotations: tool.annotations ? { ...tool.annotations } : undefined,
      origin: this.origin,
      window: this.ownerWindow,
    };
    const registration = { tool, descriptor };
    this.#active.set(tool.name, registration);
    this.#byDescriptor.set(descriptor, registration);
    options?.signal?.addEventListener("abort", () => {
      if (this.#active.get(tool.name) !== registration) return;
      this.#active.delete(tool.name);
      this.#events.dispatchEvent(new Event("toolchange"));
    }, { once: true });
    this.#events.dispatchEvent(new Event("toolchange"));
  }

  async getTools(): Promise<WebMCPRegisteredToolLike[]> {
    return [...this.#active.values()]
      .map(({ descriptor }) => descriptor)
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  }

  async executeTool(
    descriptor: WebMCPRegisteredToolLike,
    input: Record<string, unknown> | string = {},
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const registration = this.#byDescriptor.get(descriptor);
    if (!registration || this.#active.get(registration.tool.name) !== registration) {
      throw new DOMException("Descriptor is stale", "UnknownError");
    }
    if (options?.signal?.aborted) throw options.signal.reason;
    this.lastNativeInput = input;
    if (this.schemaEncoding === "JSON_STRING" && typeof input !== "string") {
      throw new DOMException("Failed to parse input arguments", "UnknownError");
    }
    if (this.schemaEncoding === "OBJECT" && typeof input === "string") {
      throw new DOMException("Expected object input arguments", "TypeError");
    }
    const callbackInput = typeof input === "string"
      ? JSON.parse(input) as Record<string, unknown>
      : input;
    this.callbackDispatches += 1;
    const result = await registration.tool.execute(
      callbackInput,
      this.forwardCallbackSignal
        ? { signal: options?.signal ?? new AbortController().signal }
        : undefined,
    );
    return JSON.stringify(result);
  }

  addEventListener(type: "toolchange", listener: EventListener): void {
    this.#events.addEventListener(type, listener);
  }

  removeEventListener(type: "toolchange", listener: EventListener): void {
    this.#events.removeEventListener(type, listener);
  }
}
