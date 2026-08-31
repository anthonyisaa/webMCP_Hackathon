import {
  AGENT_COORDINATION_TOOL_NAMES,
  TOOL_NAMES,
  type AgentRegistryProjection,
  type AgentToolRegistryPort,
  type RegisteredToolName,
} from "../contracts/index";
import { getWebMCPToolDefinition } from "./catalog";
import type {
  MutableWebMCPRuntimeRef,
  RegistrationDiff,
  WebMCPExecutionOptionsLike,
  WebMCPModelContextLike,
  WebMCPToolLike,
} from "./types";

interface LiveRegistrationRecord {
  controller: AbortController;
  tool: WebMCPToolLike;
  scope: "SESSION" | "DECISION";
  contextKey: string;
}

const REGISTERED_TOOL_ORDER: readonly RegisteredToolName[] = [
  ...AGENT_COORDINATION_TOOL_NAMES,
  ...TOOL_NAMES,
];

function catalogOrder(names: Iterable<string>): RegisteredToolName[] {
  const set = new Set(names);
  return REGISTERED_TOOL_ORDER.filter((name) => set.has(name));
}

export function emptyLiveRegistrationDiff(): RegistrationDiff {
  return { added: [], removed: [], retained: [], reRegistered: [] };
}

function isDecisionName(name: RegisteredToolName): boolean {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function abortError(signal: AbortSignal): DOMException {
  return signal.reason instanceof DOMException && signal.reason.name === "AbortError"
    ? signal.reason
    : new DOMException(
        typeof signal.reason === "string"
          ? signal.reason
          : "Tool execution cancelled",
        "AbortError",
      );
}

function linkSignals(
  first: AbortSignal,
  second?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!second) return { signal: first, cleanup: () => undefined };
  if (first.aborted) return { signal: first, cleanup: () => undefined };
  if (second.aborted) return { signal: second, cleanup: () => undefined };

  const controller = new AbortController();
  const abortFromFirst = () => controller.abort(abortError(first));
  const abortFromSecond = () => controller.abort(abortError(second));
  first.addEventListener("abort", abortFromFirst, { once: true });
  second.addEventListener("abort", abortFromSecond, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener("abort", abortFromFirst);
      second.removeEventListener("abort", abortFromSecond);
    },
  };
}

function wrapNativeResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: unknown;
} {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Registry tools must return a JSON-serializable result.");
  }
  const structuredContent = JSON.parse(serialized) as unknown;
  return {
    content: [{ type: "text", text: serialized }],
    structuredContent,
  };
}

/**
 * Native-only adapter around AgentToolRegistry. Session registrations and decision
 * registrations have separate context keys so a target change cannot cancel a wait.
 */
export class LiveWebMCPRegistrationManager {
  readonly #context: WebMCPModelContextLike;
  readonly #registry: AgentToolRegistryPort;
  readonly #latest: MutableWebMCPRuntimeRef;
  readonly #registrations = new Map<RegisteredToolName, LiveRegistrationRecord>();
  #projection: AgentRegistryProjection | null = null;
  #sessionContextKey: string | null = null;
  #decisionContextKey: string | null = null;
  #queue: Promise<RegistrationDiff> = Promise.resolve(emptyLiveRegistrationDiff());
  #requestedGeneration = 0;
  #disposed = false;

  constructor(
    context: WebMCPModelContextLike,
    registry: AgentToolRegistryPort,
    latest: MutableWebMCPRuntimeRef,
  ) {
    this.#context = context;
    this.#registry = registry;
    this.#latest = latest;
  }

  get registeredTools(): RegisteredToolName[] {
    return catalogOrder(this.#registrations.keys());
  }

  getRegisteredCallback(
    name: RegisteredToolName,
  ): WebMCPToolLike["execute"] | undefined {
    return this.#registrations.get(name)?.tool.execute;
  }

  reconcile(
    projection: AgentRegistryProjection,
    sessionContextKey: string,
    decisionContextKey: string,
  ): Promise<RegistrationDiff> {
    const generation = ++this.#requestedGeneration;
    this.#projection = projection;
    const before = this.registeredTools;
    const desiredDefinitions = this.#registry.availableDefinitions(projection);
    const desired = desiredDefinitions.map((definition) => definition.name);
    const desiredSet = new Set(desired);
    const eagerRemoved: RegisteredToolName[] = [];

    for (const name of this.registeredTools) {
      const record = this.#registrations.get(name);
      if (!record) continue;
      const contextChanged =
        record.scope === "SESSION"
          ? this.#sessionContextKey !== null &&
            this.#sessionContextKey !== sessionContextKey
          : (this.#sessionContextKey !== null &&
              this.#sessionContextKey !== sessionContextKey) ||
            (this.#decisionContextKey !== null &&
              this.#decisionContextKey !== decisionContextKey);
      if (!desiredSet.has(name) || contextChanged) {
        eagerRemoved.push(name);
        this.#abortRegistration(
          name,
          contextChanged ? "Registration context changed" : "Capability removed",
        );
      }
    }

    const run = this.#queue.then(() =>
      this.#apply({
        projection,
        desired,
        sessionContextKey,
        decisionContextKey,
        eagerRemoved,
        before,
        generation,
      }),
    );
    this.#queue = run.catch(() => emptyLiveRegistrationDiff());
    return run;
  }

  async #apply(input: {
    projection: AgentRegistryProjection;
    desired: RegisteredToolName[];
    sessionContextKey: string;
    decisionContextKey: string;
    eagerRemoved: RegisteredToolName[];
    before: RegisteredToolName[];
    generation: number;
  }): Promise<RegistrationDiff> {
    if (this.#disposed || input.generation !== this.#requestedGeneration) {
      return emptyLiveRegistrationDiff();
    }

    const desiredSet = new Set(input.desired);
    const beforeSet = new Set(input.before);
    const removed = catalogOrder(
      input.before.filter((name) => !desiredSet.has(name)),
    );
    const added = input.desired.filter((name) => !beforeSet.has(name));
    const retained = input.desired.filter((name) => beforeSet.has(name));
    const reRegistered = input.desired.filter(
      (name) => input.eagerRemoved.includes(name) && desiredSet.has(name),
    );

    for (const name of input.desired) {
      if (this.#disposed || input.generation !== this.#requestedGeneration) break;
      if (this.#registrations.has(name)) continue;

      const definition = this.#registry
        .availableDefinitions(input.projection)
        .find((candidate) => candidate.name === name);
      if (!definition) continue;

      const controller = new AbortController();
      const scope = isDecisionName(name) ? "DECISION" : "SESSION";
      const capturedProjection =
        scope === "DECISION" ? input.projection : undefined;
      const decisionDefinition = scope === "DECISION"
        ? getWebMCPToolDefinition(name as (typeof TOOL_NAMES)[number])
        : undefined;
      const tool: WebMCPToolLike = {
        name,
        ...(decisionDefinition?.title ? { title: decisionDefinition.title } : {}),
        description: definition.description,
        inputSchema: definition.inputSchema as unknown as Record<string, unknown>,
        annotations: definition.annotations,
        execute: (toolInput, options) =>
          this.#executeNative(
            name,
            toolInput,
            options,
            controller.signal,
            capturedProjection,
          ),
      };
      this.#registrations.set(name, {
        controller,
        tool,
        scope,
        contextKey:
          scope === "SESSION"
            ? input.sessionContextKey
            : input.decisionContextKey,
      });

      try {
        await this.#context.registerTool(tool, { signal: controller.signal });
      } catch (error) {
        const current = this.#registrations.get(name);
        if (current?.controller === controller) this.#registrations.delete(name);
        controller.abort("Registration failed");
        throw error;
      }

      if (input.generation !== this.#requestedGeneration) {
        this.#abortRegistration(name, "Registration superseded");
        return emptyLiveRegistrationDiff();
      }
    }

    if (input.generation !== this.#requestedGeneration) {
      return emptyLiveRegistrationDiff();
    }
    this.#sessionContextKey = input.sessionContextKey;
    this.#decisionContextKey = input.decisionContextKey;
    return {
      added: catalogOrder(added),
      removed,
      retained: catalogOrder(retained),
      reRegistered: catalogOrder(reRegistered),
    };
  }

  async #executeNative(
    name: RegisteredToolName,
    input: unknown,
    options: WebMCPExecutionOptionsLike | undefined,
    registrationSignal: AbortSignal,
    capturedProjection?: AgentRegistryProjection,
  ): Promise<unknown> {
    const currentProjection = capturedProjection ?? this.#projection;
    if (!currentProjection) {
      throw new DOMException("WebMCP bridge is not active", "AbortError");
    }
    const linked = linkSignals(registrationSignal, options?.signal);
    try {
      if (linked.signal.aborted) throw abortError(linked.signal);
      const current = this.#latest.current;
      const result = await this.#registry.execute(
        name,
        input,
        {
          caller: "BROWSER_AGENT",
          pageSessionId:
            current.pageSessionId ?? current.memberSessionInstanceId,
          agentSessionToken: current.sessionToken,
          signal: linked.signal,
        },
        currentProjection,
      );
      if (linked.signal.aborted) throw abortError(linked.signal);
      return wrapNativeResult(result);
    } finally {
      linked.cleanup();
    }
  }

  #abortRegistration(name: RegisteredToolName, reason: string): void {
    const registration = this.#registrations.get(name);
    if (!registration) return;
    this.#registrations.delete(name);
    registration.controller.abort(reason);
  }

  dispose(): void {
    this.#disposed = true;
    for (const name of this.registeredTools) {
      this.#abortRegistration(name, "WebMCP bridge disposed");
    }
    this.#projection = null;
    this.#sessionContextKey = null;
    this.#decisionContextKey = null;
  }
}
