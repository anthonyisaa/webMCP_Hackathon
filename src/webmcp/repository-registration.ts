import type { IssueWorkspaceSurface, RepositoryToolName } from "../repository/contracts";
import { REPOSITORY_TOOL_NAMES } from "../repository/contracts";
import { repositoryAbortError } from "./repository-activity-signal";
import { getRepositoryWebMCPToolDefinition } from "./repository-catalog";
import {
  captureRepositoryCallbackContext,
  createRepositoryToolCallback,
} from "./repository-executor";
import type {
  RepositoryWebMCPModelContext,
  RepositoryWebMCPRegistrationDiff,
  RepositoryWebMCPRuntimeDependencies,
} from "./repository-types";
import type { WebMCPExecutionOptionsLike, WebMCPToolLike } from "./types";

interface RepositoryRegistrationRecord {
  controller: AbortController;
  tool: WebMCPToolLike;
  contextKey: string;
}

function catalogOrder(names: Iterable<string>): RepositoryToolName[] {
  const set = new Set(names);
  return REPOSITORY_TOOL_NAMES.filter((name) => set.has(name));
}

function linkSignals(
  registrationSignal: AbortSignal,
  executionSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!executionSignal) return { signal: registrationSignal, cleanup: () => undefined };
  if (registrationSignal.aborted) {
    return { signal: registrationSignal, cleanup: () => undefined };
  }
  if (executionSignal.aborted) {
    return { signal: executionSignal, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const abortFromRegistration = () =>
    controller.abort(repositoryAbortError(registrationSignal));
  const abortFromExecution = () =>
    controller.abort(repositoryAbortError(executionSignal));
  registrationSignal.addEventListener("abort", abortFromRegistration, { once: true });
  executionSignal.addEventListener("abort", abortFromExecution, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      registrationSignal.removeEventListener("abort", abortFromRegistration);
      executionSignal.removeEventListener("abort", abortFromExecution);
    },
  };
}

function wrapNativeResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: unknown;
} {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Repository tools must return JSON-serializable results.");
  }
  return {
    content: [{ type: "text", text: serialized }],
    structuredContent: JSON.parse(serialized) as unknown,
  };
}

export function emptyRepositoryRegistrationDiff(): RepositoryWebMCPRegistrationDiff {
  return { added: [], removed: [], retained: [], reRegistered: [] };
}

export function desiredRepositoryWebMCPTools(
  surface: IssueWorkspaceSurface,
  selfMemberId: string,
): RepositoryToolName[] {
  // Presence and current task state guide the model only. The server decides authority.
  void surface;
  void selfMemberId;
  return [...REPOSITORY_TOOL_NAMES];
}

export function makeRepositoryRegistrationContextKey(
  documentId: string,
  protocolVersion: 4,
  sessionInstanceId: string,
  pageSessionId: string,
  agentSessionToken: string,
  selfMemberId: string,
): string {
  return JSON.stringify([
    documentId,
    protocolVersion,
    sessionInstanceId,
    pageSessionId,
    agentSessionToken,
    selfMemberId,
  ]);
}

export class RepositoryWebMCPRegistrationManager {
  readonly #registrations = new Map<RepositoryToolName, RepositoryRegistrationRecord>();
  readonly #context: RepositoryWebMCPModelContext;
  readonly #dependencies: RepositoryWebMCPRuntimeDependencies;
  #queue: Promise<RepositoryWebMCPRegistrationDiff> = Promise.resolve(
    emptyRepositoryRegistrationDiff(),
  );
  #contextKey: string | null = null;
  #requestedGeneration = 0;
  #disposed = false;
  #suspended = false;
  readonly #inFlight = new Set<Promise<void>>();

  constructor(
    context: RepositoryWebMCPModelContext,
    dependencies: RepositoryWebMCPRuntimeDependencies,
  ) {
    this.#context = context;
    this.#dependencies = dependencies;
  }

  get registeredTools(): RepositoryToolName[] {
    return catalogOrder(this.#registrations.keys());
  }

  get suspended(): boolean {
    return this.#suspended;
  }

  getRegisteredCallback(
    name: RepositoryToolName,
  ): WebMCPToolLike["execute"] | undefined {
    return this.#registrations.get(name)?.tool.execute;
  }

  reconcile(
    surface: IssueWorkspaceSurface,
    selfMemberId: string,
    contextKey: string,
  ): Promise<RepositoryWebMCPRegistrationDiff> {
    if (this.#suspended || this.#disposed) {
      return Promise.resolve(emptyRepositoryRegistrationDiff());
    }
    if (this.#contextKey !== null && this.#contextKey !== contextKey) {
      this.#dependencies.connection.current = null;
      this.#dependencies.onAgentConnectionChange?.(null);
    }
    this.#contextKey = contextKey;
    const generation = ++this.#requestedGeneration;
    const before = this.registeredTools;
    const desired = desiredRepositoryWebMCPTools(surface, selfMemberId);
    const desiredSet = new Set(desired);
    const eagerlyRemoved: RepositoryToolName[] = [];

    for (const name of before) {
      const registration = this.#registrations.get(name);
      if (!registration) continue;
      if (registration.contextKey !== contextKey || !desiredSet.has(name)) {
        eagerlyRemoved.push(name);
        this.#abortRegistration(
          name,
          registration.contextKey !== contextKey
            ? "Repository registration context changed"
            : "Repository capability removed",
        );
      }
    }

    const run = this.#queue.then(() =>
      this.#apply({ desired, before, eagerlyRemoved, contextKey, generation }),
    );
    this.#queue = run.catch(() => emptyRepositoryRegistrationDiff());
    return run;
  }

  async #apply(input: {
    desired: RepositoryToolName[];
    before: RepositoryToolName[];
    eagerlyRemoved: RepositoryToolName[];
    contextKey: string;
    generation: number;
  }): Promise<RepositoryWebMCPRegistrationDiff> {
    if (this.#disposed || input.generation !== this.#requestedGeneration) {
      return emptyRepositoryRegistrationDiff();
    }

    const desiredSet = new Set(input.desired);
    const beforeSet = new Set(input.before);
    const removed = input.before.filter((name) => !desiredSet.has(name));
    const added = input.desired.filter((name) => !beforeSet.has(name));
    const retained = input.desired.filter((name) => beforeSet.has(name));
    const reRegistered = input.desired.filter(
      (name) => input.eagerlyRemoved.includes(name) && desiredSet.has(name),
    );

    for (const name of input.desired) {
      if (this.#disposed || input.generation !== this.#requestedGeneration) break;
      if (this.#registrations.has(name)) continue;

      const definition = getRepositoryWebMCPToolDefinition(name);
      const controller = new AbortController();
      const captured = captureRepositoryCallbackContext(this.#dependencies.latest);
      const callback = createRepositoryToolCallback(name, captured, this.#dependencies);
      const tool: WebMCPToolLike = {
        name: definition.name,
        description: definition.description,
        inputSchema: JSON.parse(JSON.stringify(definition.inputSchema)) as Record<
          string,
          unknown
        >,
        annotations: { ...definition.annotations },
        execute: (toolInput, options) =>
          this.#executeNative(
            callback,
            toolInput,
            options,
            controller.signal,
          ),
      };
      this.#registrations.set(name, {
        controller,
        tool,
        contextKey: input.contextKey,
      });

      try {
        await this.#context.registerTool(tool, { signal: controller.signal });
      } catch (error) {
        const current = this.#registrations.get(name);
        if (current?.controller === controller) this.#registrations.delete(name);
        controller.abort("Repository tool registration failed");
        throw error;
      }

      if (input.generation !== this.#requestedGeneration) {
        this.#abortRegistration(name, "Repository registration superseded");
        return emptyRepositoryRegistrationDiff();
      }
    }

    if (input.generation !== this.#requestedGeneration) {
      return emptyRepositoryRegistrationDiff();
    }
    return {
      added: catalogOrder(added),
      removed: catalogOrder(removed),
      retained: catalogOrder(retained),
      reRegistered: catalogOrder(reRegistered),
    };
  }

  async #executeNative(
    callback: (
      input: unknown,
      options?: WebMCPExecutionOptionsLike,
    ) => Promise<unknown>,
    input: unknown,
    options: WebMCPExecutionOptionsLike | undefined,
    registrationSignal: AbortSignal,
  ): Promise<unknown> {
    const linked = linkSignals(registrationSignal, options?.signal);
    let settleExecution!: () => void;
    const settled = new Promise<void>((resolve) => {
      settleExecution = resolve;
    });
    this.#inFlight.add(settled);
    try {
      if (linked.signal.aborted) throw repositoryAbortError(linked.signal);
      const result = await callback(input, { signal: linked.signal });
      if (options?.signal?.aborted) throw repositoryAbortError(options.signal);
      if (registrationSignal.aborted) throw repositoryAbortError(registrationSignal);
      return wrapNativeResult(result);
    } finally {
      linked.cleanup();
      settleExecution();
      this.#inFlight.delete(settled);
    }
  }

  /** Withdraw the complete idle/BYOA surface before a managed Relay catalog is exposed. */
  async suspend(reason = "Managed Relay mode entered"): Promise<RepositoryWebMCPRegistrationDiff> {
    if (this.#disposed) return emptyRepositoryRegistrationDiff();
    this.#suspended = true;
    this.#requestedGeneration += 1;
    const removed = this.registeredTools;
    for (const name of removed) this.#abortRegistration(name, reason);
    await Promise.allSettled([...this.#inFlight]);
    return { added: [], removed, retained: [], reRegistered: [] };
  }

  /** Allow the bridge to reconcile the exact eight-tool idle catalog again. */
  resume(): void {
    if (!this.#disposed) this.#suspended = false;
  }

  #abortRegistration(name: RepositoryToolName, reason: string): void {
    const registration = this.#registrations.get(name);
    if (!registration) return;
    this.#registrations.delete(name);
    registration.controller.abort(reason);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#suspended = true;
    this.#dependencies.connection.current = null;
    this.#dependencies.onAgentConnectionChange?.(null);
    this.#requestedGeneration += 1;
    for (const name of this.registeredTools) {
      this.#abortRegistration(name, "Repository WebMCP bridge disposed");
    }
  }
}
