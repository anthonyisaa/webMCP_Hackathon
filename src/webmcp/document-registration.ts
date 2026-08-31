import type { DocumentSurface } from "../document/contracts";
import { getDocumentWebMCPToolDefinition } from "./document-catalog";
import {
  captureDocumentCallbackContext,
  createDocumentToolCallback,
} from "./document-executor";
import {
  DOCUMENT_WEBMCP_TOOL_NAMES,
  type DocumentWebMCPModelContext,
  type DocumentWebMCPRegistrationDiff,
  type DocumentWebMCPRuntimeDependencies,
  type DocumentWebMCPToolName,
} from "./document-types";
import type { WebMCPToolLike } from "./types";

interface DocumentRegistrationRecord {
  controller: AbortController;
  tool: WebMCPToolLike;
  contextKey: string;
}

function catalogOrder(names: Iterable<string>): DocumentWebMCPToolName[] {
  const set = new Set(names);
  return DOCUMENT_WEBMCP_TOOL_NAMES.filter((name) => set.has(name));
}

export function emptyDocumentRegistrationDiff(): DocumentWebMCPRegistrationDiff {
  return { added: [], removed: [], retained: [], reRegistered: [] };
}

export function desiredDocumentWebMCPTools(
  surface: DocumentSurface,
  selfMemberId: string,
): DocumentWebMCPToolName[] {
  const hasOwnedPendingAnnotation = surface.annotations.some(
    (annotation) =>
      annotation.status === "PENDING" && annotation.createdBy.memberId === selfMemberId,
  );
  return hasOwnedPendingAnnotation
    ? [...DOCUMENT_WEBMCP_TOOL_NAMES]
    : ["inspect_document", "list_agent_annotations"];
}

export function makeDocumentRegistrationContextKey(
  documentId: string,
  sessionInstanceId: string,
  agentSessionToken: string,
  selfMemberId: string,
): string {
  return JSON.stringify([documentId, sessionInstanceId, agentSessionToken, selfMemberId]);
}

export class DocumentWebMCPRegistrationManager {
  readonly #registrations = new Map<DocumentWebMCPToolName, DocumentRegistrationRecord>();
  readonly #context: DocumentWebMCPModelContext;
  readonly #dependencies: DocumentWebMCPRuntimeDependencies;
  #registrationContextKey: string | null = null;
  #queue: Promise<DocumentWebMCPRegistrationDiff> = Promise.resolve(
    emptyDocumentRegistrationDiff(),
  );
  #requestedGeneration = 0;
  #disposed = false;

  constructor(
    context: DocumentWebMCPModelContext,
    dependencies: DocumentWebMCPRuntimeDependencies,
  ) {
    this.#context = context;
    this.#dependencies = dependencies;
  }

  get registeredTools(): DocumentWebMCPToolName[] {
    return catalogOrder(this.#registrations.keys());
  }

  getRegisteredCallback(
    name: DocumentWebMCPToolName,
  ): WebMCPToolLike["execute"] | undefined {
    return this.#registrations.get(name)?.tool.execute;
  }

  reconcile(
    surface: DocumentSurface,
    selfMemberId: string,
    registrationContextKey: string,
  ): Promise<DocumentWebMCPRegistrationDiff> {
    const generation = ++this.#requestedGeneration;
    const before = this.registeredTools;
    const desired = desiredDocumentWebMCPTools(surface, selfMemberId);
    const desiredSet = new Set(desired);
    const contextChanged =
      (this.#registrationContextKey !== null &&
        this.#registrationContextKey !== registrationContextKey) ||
      [...this.#registrations.values()].some(
        (registration) => registration.contextKey !== registrationContextKey,
      );

    for (const name of before) {
      if (contextChanged || !desiredSet.has(name)) {
        this.#abortRegistration(name, "Document capability superseded");
      }
    }

    const run = this.#queue.then(() =>
      this.#apply({
        desired,
        before,
        registrationContextKey,
        contextChanged,
        generation,
      }),
    );
    this.#queue = run.catch(() => emptyDocumentRegistrationDiff());
    return run;
  }

  async #apply(input: {
    desired: DocumentWebMCPToolName[];
    before: DocumentWebMCPToolName[];
    registrationContextKey: string;
    contextChanged: boolean;
    generation: number;
  }): Promise<DocumentWebMCPRegistrationDiff> {
    if (this.#disposed || input.generation !== this.#requestedGeneration) {
      return emptyDocumentRegistrationDiff();
    }

    const desiredSet = new Set(input.desired);
    const beforeSet = new Set(input.before);
    const removed = input.before.filter((name) => !desiredSet.has(name));
    const added = input.desired.filter((name) => !beforeSet.has(name));
    const retained = input.desired.filter((name) => beforeSet.has(name));
    const reRegistered = input.contextChanged ? [...retained] : [];

    for (const name of input.desired) {
      if (this.#disposed || input.generation !== this.#requestedGeneration) break;
      if (this.#registrations.has(name)) continue;

      const definition = getDocumentWebMCPToolDefinition(name);
      const controller = new AbortController();
      const captured = captureDocumentCallbackContext(this.#dependencies.latest);
      const tool: WebMCPToolLike = {
        ...definition,
        execute: createDocumentToolCallback(name, captured, this.#dependencies),
      };
      this.#registrations.set(name, {
        controller,
        tool,
        contextKey: input.registrationContextKey,
      });

      try {
        await this.#context.registerTool(tool, { signal: controller.signal });
      } catch (error) {
        const registered = this.#registrations.get(name);
        if (registered?.controller === controller) this.#registrations.delete(name);
        controller.abort("Document tool registration failed");
        throw error;
      }

      if (input.generation !== this.#requestedGeneration) {
        this.#abortRegistration(name, "Document registration superseded");
        return emptyDocumentRegistrationDiff();
      }
    }

    if (input.generation !== this.#requestedGeneration) {
      return emptyDocumentRegistrationDiff();
    }
    this.#registrationContextKey = input.registrationContextKey;
    return {
      added: catalogOrder(added),
      removed: catalogOrder(removed),
      retained: catalogOrder(retained),
      reRegistered: catalogOrder(reRegistered),
    };
  }

  #abortRegistration(name: DocumentWebMCPToolName, reason: string): void {
    const registration = this.#registrations.get(name);
    if (!registration) return;
    this.#registrations.delete(name);
    registration.controller.abort(reason);
  }

  dispose(): void {
    this.#disposed = true;
    this.#requestedGeneration += 1;
    for (const name of this.registeredTools) {
      this.#abortRegistration(name, "Document WebMCP bridge disposed");
    }
    this.#registrationContextKey = null;
  }
}
