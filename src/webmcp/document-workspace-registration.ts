import type { DocumentSurfaceV3 } from "../document/contracts";
import { documentWorkspaceAbortError } from "./document-workspace-activity-signal";
import { getDocumentWorkspaceWebMCPToolDefinition } from "./document-workspace-catalog";
import {
  captureDocumentWorkspaceCallbackContext,
  createDocumentWorkspaceToolCallback,
} from "./document-workspace-executor";
import {
  DOCUMENT_WORKSPACE_TOOL_NAMES,
  type DocumentWorkspaceToolName,
  type DocumentWorkspaceWebMCPModelContext,
  type DocumentWorkspaceWebMCPRegistrationDiff,
  type DocumentWorkspaceWebMCPRuntimeDependencies,
} from "./document-workspace-types";
import type { WebMCPExecutionOptionsLike, WebMCPToolLike } from "./types";

interface DocumentWorkspaceRegistrationRecord {
  controller: AbortController;
  tool: WebMCPToolLike;
  contextKey: string;
}

const PERMANENT_TOOL_NAMES = DOCUMENT_WORKSPACE_TOOL_NAMES.slice(0, 4);
const CAPABILITY_REMOVED_REASON = "Document workspace capability removed";

function catalogOrder(names: Iterable<string>): DocumentWorkspaceToolName[] {
  const set = new Set(names);
  return DOCUMENT_WORKSPACE_TOOL_NAMES.filter((name) => set.has(name));
}

function linkSignals(
  registrationSignal: AbortSignal,
  executionSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!executionSignal) {
    return { signal: registrationSignal, cleanup: () => undefined };
  }
  if (registrationSignal.aborted) {
    return { signal: registrationSignal, cleanup: () => undefined };
  }
  if (executionSignal.aborted) {
    return { signal: executionSignal, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const abortFromRegistration = () =>
    controller.abort(documentWorkspaceAbortError(registrationSignal));
  const abortFromExecution = () =>
    controller.abort(documentWorkspaceAbortError(executionSignal));
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
    throw new Error("Document workspace tools must return JSON-serializable results.");
  }
  return {
    content: [{ type: "text", text: serialized }],
    structuredContent: JSON.parse(serialized) as unknown,
  };
}

function isSuccess(value: unknown): value is { ok: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === true
  );
}

export function emptyDocumentWorkspaceRegistrationDiff(): DocumentWorkspaceWebMCPRegistrationDiff {
  return { added: [], removed: [], retained: [], reRegistered: [] };
}

export function desiredDocumentWorkspaceWebMCPTools(
  surface: DocumentSurfaceV3,
  selfMemberId: string,
): DocumentWorkspaceToolName[] {
  const hasAssignedPendingWork = surface.workOrders.some(
    (order) =>
      order.status === "PENDING" && order.assignedToMemberId === selfMemberId,
  );
  return hasAssignedPendingWork
    ? [...DOCUMENT_WORKSPACE_TOOL_NAMES]
    : [...PERMANENT_TOOL_NAMES];
}

export function makeDocumentWorkspaceRegistrationContextKey(
  documentId: string,
  protocolVersion: 3,
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

export class DocumentWorkspaceWebMCPRegistrationManager {
  readonly #registrations = new Map<
    DocumentWorkspaceToolName,
    DocumentWorkspaceRegistrationRecord
  >();
  readonly #context: DocumentWorkspaceWebMCPModelContext;
  readonly #dependencies: DocumentWorkspaceWebMCPRuntimeDependencies;
  #registrationContextKey: string | null = null;
  #queue: Promise<DocumentWorkspaceWebMCPRegistrationDiff> = Promise.resolve(
    emptyDocumentWorkspaceRegistrationDiff(),
  );
  #requestedGeneration = 0;
  #disposed = false;

  constructor(
    context: DocumentWorkspaceWebMCPModelContext,
    dependencies: DocumentWorkspaceWebMCPRuntimeDependencies,
  ) {
    this.#context = context;
    this.#dependencies = dependencies;
  }

  get registeredTools(): DocumentWorkspaceToolName[] {
    return catalogOrder(this.#registrations.keys());
  }

  getRegisteredCallback(
    name: DocumentWorkspaceToolName,
  ): WebMCPToolLike["execute"] | undefined {
    return this.#registrations.get(name)?.tool.execute;
  }

  reconcile(
    surface: DocumentSurfaceV3,
    selfMemberId: string,
    registrationContextKey: string,
  ): Promise<DocumentWorkspaceWebMCPRegistrationDiff> {
    const generation = ++this.#requestedGeneration;
    const before = this.registeredTools;
    const desired = desiredDocumentWorkspaceWebMCPTools(surface, selfMemberId);
    const desiredSet = new Set(desired);
    const eagerlyRemoved: DocumentWorkspaceToolName[] = [];

    for (const name of before) {
      const registration = this.#registrations.get(name);
      if (!registration) continue;
      const contextChanged = registration.contextKey !== registrationContextKey;
      if (contextChanged || !desiredSet.has(name)) {
        eagerlyRemoved.push(name);
        this.#abortRegistration(
          name,
          contextChanged
            ? "Document workspace registration context changed"
            : CAPABILITY_REMOVED_REASON,
        );
      }
    }

    const run = this.#queue.then(() =>
      this.#apply({
        desired,
        before,
        eagerlyRemoved,
        registrationContextKey,
        generation,
      }),
    );
    this.#queue = run.catch(() => emptyDocumentWorkspaceRegistrationDiff());
    return run;
  }

  async #apply(input: {
    desired: DocumentWorkspaceToolName[];
    before: DocumentWorkspaceToolName[];
    eagerlyRemoved: DocumentWorkspaceToolName[];
    registrationContextKey: string;
    generation: number;
  }): Promise<DocumentWorkspaceWebMCPRegistrationDiff> {
    if (this.#disposed || input.generation !== this.#requestedGeneration) {
      return emptyDocumentWorkspaceRegistrationDiff();
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

      const definition = getDocumentWorkspaceWebMCPToolDefinition(name);
      const controller = new AbortController();
      const captured = captureDocumentWorkspaceCallbackContext(
        this.#dependencies.latest,
      );
      const callback = createDocumentWorkspaceToolCallback(
        name,
        captured,
        this.#dependencies,
      );
      const tool: WebMCPToolLike = {
        ...definition,
        execute: (toolInput, options) =>
          this.#executeNative(
            name,
            callback,
            toolInput,
            options,
            controller.signal,
          ),
      };
      this.#registrations.set(name, {
        controller,
        tool,
        contextKey: input.registrationContextKey,
      });

      try {
        await this.#context.registerTool(tool, { signal: controller.signal });
      } catch (error) {
        const current = this.#registrations.get(name);
        if (current?.controller === controller) this.#registrations.delete(name);
        controller.abort("Document workspace tool registration failed");
        throw error;
      }

      if (input.generation !== this.#requestedGeneration) {
        this.#abortRegistration(
          name,
          "Document workspace registration superseded",
        );
        return emptyDocumentWorkspaceRegistrationDiff();
      }
    }

    if (input.generation !== this.#requestedGeneration) {
      return emptyDocumentWorkspaceRegistrationDiff();
    }
    this.#registrationContextKey = input.registrationContextKey;
    return {
      added: catalogOrder(added),
      removed: catalogOrder(removed),
      retained: catalogOrder(retained),
      reRegistered: catalogOrder(reRegistered),
    };
  }

  async #executeNative(
    name: DocumentWorkspaceToolName,
    callback: (
      input: unknown,
      options?: WebMCPExecutionOptionsLike,
    ) => Promise<unknown>,
    input: unknown,
    options: WebMCPExecutionOptionsLike | undefined,
    registrationSignal: AbortSignal,
  ): Promise<unknown> {
    const linked = linkSignals(registrationSignal, options?.signal);
    try {
      if (linked.signal.aborted) throw documentWorkspaceAbortError(linked.signal);
      const result = await callback(input, { signal: linked.signal });

      if (options?.signal?.aborted) {
        throw documentWorkspaceAbortError(options.signal);
      }
      const committedSelfRemovingProposal =
        name === "submit_work_proposal" &&
        isSuccess(result) &&
        registrationSignal.reason === CAPABILITY_REMOVED_REASON;
      if (registrationSignal.aborted && !committedSelfRemovingProposal) {
        throw documentWorkspaceAbortError(registrationSignal);
      }
      return wrapNativeResult(result);
    } finally {
      linked.cleanup();
    }
  }

  #abortRegistration(name: DocumentWorkspaceToolName, reason: string): void {
    const registration = this.#registrations.get(name);
    if (!registration) return;
    this.#registrations.delete(name);
    registration.controller.abort(reason);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#requestedGeneration += 1;
    for (const name of this.registeredTools) {
      this.#abortRegistration(name, "Document workspace WebMCP bridge disposed");
    }
    this.#registrationContextKey = null;
  }
}
