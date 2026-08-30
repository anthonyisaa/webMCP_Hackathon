import { TOOL_NAMES, type CompiledCapabilities, type ToolName } from "../contracts/index";
import { getWebMCPToolDefinition } from "./catalog";
import { captureCallbackContext, createToolCallback } from "./executor";
import type {
  RegistrationDiff,
  WebMCPModelContextLike,
  WebMCPRuntimeDependencies,
  WebMCPToolLike,
} from "./types";

interface RegistrationRecord {
  controller: AbortController;
  tool: WebMCPToolLike;
}

function catalogOrder(names: Iterable<string>): string[] {
  const set = new Set(names);
  return TOOL_NAMES.filter((name) => set.has(name));
}

function emptyDiff(): RegistrationDiff {
  return { added: [], removed: [], retained: [], reRegistered: [] };
}

export class WebMCPRegistrationManager {
  readonly #registrations = new Map<ToolName, RegistrationRecord>();
  readonly #context: WebMCPModelContextLike;
  readonly #dependencies: WebMCPRuntimeDependencies;
  #registrationContextKey: string | null = null;
  #queue: Promise<RegistrationDiff> = Promise.resolve(emptyDiff());
  #requestedGeneration = 0;
  #disposed = false;

  constructor(context: WebMCPModelContextLike, dependencies: WebMCPRuntimeDependencies) {
    this.#context = context;
    this.#dependencies = dependencies;
  }

  get registeredTools(): ToolName[] {
    return catalogOrder(this.#registrations.keys()) as ToolName[];
  }

  getRegisteredCallback(name: ToolName): WebMCPToolLike["execute"] | undefined {
    return this.#registrations.get(name)?.tool.execute;
  }

  reconcile(
    compiled: CompiledCapabilities,
    registrationContextKey: string,
  ): Promise<RegistrationDiff> {
    const generation = ++this.#requestedGeneration;
    const desired = new Set(compiled.availableTools);
    const eagerlyRemoved: ToolName[] = [];

    // Remove obsolete registrations immediately, including a registration whose
    // native promise is still pending. The queued generation guard below prevents an
    // older reconciliation from restoring it after a newer snapshot arrives.
    for (const name of this.registeredTools) {
      if (!desired.has(name)) {
        eagerlyRemoved.push(name);
        this.#abortRegistration(name, "Capability superseded");
      }
    }

    const run = this.#queue.then(() =>
      this.#apply(compiled, registrationContextKey, generation, eagerlyRemoved),
    );
    this.#queue = run.catch(() => emptyDiff());
    return run;
  }

  async #apply(
    compiled: CompiledCapabilities,
    registrationContextKey: string,
    generation: number,
    eagerlyRemoved: ToolName[],
  ): Promise<RegistrationDiff> {
    if (this.#disposed || generation !== this.#requestedGeneration) return emptyDiff();

    const before = this.registeredTools;
    const desired = [...compiled.availableTools];
    const desiredSet = new Set(desired);
    const beforeSet = new Set(before);
    const contextChanged =
      this.#registrationContextKey !== null &&
      this.#registrationContextKey !== registrationContextKey;

    const removed = catalogOrder([
      ...eagerlyRemoved,
      ...before.filter((name) => !desiredSet.has(name)),
    ]) as ToolName[];
    const added = desired.filter((name) => !beforeSet.has(name));
    const retained = desired.filter((name) => beforeSet.has(name));
    const reRegistered = contextChanged ? [...retained] : [];

    for (const name of removed) this.#abortRegistration(name, "Capability removed");
    if (contextChanged) {
      for (const name of retained) this.#abortRegistration(name, "Page context changed");
    }

    const namesToRegister = desired.filter((name) => !this.#registrations.has(name));
    for (const name of namesToRegister) {
      if (this.#disposed || generation !== this.#requestedGeneration) break;
      const definition = getWebMCPToolDefinition(name);
      const controller = new AbortController();
      const captured = captureCallbackContext(this.#dependencies.latest);
      const tool: WebMCPToolLike = {
        ...definition,
        execute: createToolCallback(name, captured, this.#dependencies),
      };

      this.#registrations.set(name, { controller, tool });
      try {
        await this.#context.registerTool(tool, { signal: controller.signal });
      } catch (error) {
        this.#registrations.delete(name);
        controller.abort("Registration failed");
        throw error;
      }

      if (generation !== this.#requestedGeneration) {
        this.#abortRegistration(name, "Registration superseded");
        return emptyDiff();
      }
    }

    if (generation !== this.#requestedGeneration) return emptyDiff();
    this.#registrationContextKey = registrationContextKey;
    return {
      added: catalogOrder(added),
      removed: catalogOrder(removed),
      retained: catalogOrder(retained),
      reRegistered: catalogOrder(reRegistered),
    };
  }

  #abortRegistration(name: ToolName, reason: string): void {
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
    this.#registrationContextKey = null;
  }
}
