import type {
  WebMCPConsumerModelContext,
  WebMCPModelContextLike,
  WebMCPNamespace,
} from "./types";

interface ModelContextHost {
  modelContext?: WebMCPModelContextLike;
}

export interface DetectedWebMCP {
  namespace: WebMCPNamespace;
  context?: WebMCPModelContextLike;
}

export function detectModelContext(
  documentHost?: ModelContextHost,
  navigatorHost?: ModelContextHost,
): DetectedWebMCP {
  const currentDocument =
    documentHost ?? (typeof document === "undefined" ? undefined : document);
  if (currentDocument?.modelContext) {
    return {
      namespace: "document.modelContext",
      context: currentDocument.modelContext,
    };
  }

  const currentNavigator =
    navigatorHost ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (currentNavigator?.modelContext) {
    return {
      namespace: "navigator.modelContext",
      context: currentNavigator.modelContext,
    };
  }

  return { namespace: "unsupported" };
}

export function makeRegistrationContextKey(
  memberSessionInstanceId: string,
  contextEpoch: number,
): string {
  return JSON.stringify([memberSessionInstanceId, contextEpoch]);
}

/** Managed Relay is standard-only and requires the complete consumer surface. */
export function asStandardWebMCPConsumer(
  detected: DetectedWebMCP,
): WebMCPConsumerModelContext | null {
  const context = detected.context;
  if (
    detected.namespace !== "document.modelContext"
    || !context
    || typeof context.getTools !== "function"
    || typeof context.executeTool !== "function"
    || typeof context.addEventListener !== "function"
    || typeof context.removeEventListener !== "function"
  ) {
    return null;
  }
  return context as WebMCPConsumerModelContext;
}
