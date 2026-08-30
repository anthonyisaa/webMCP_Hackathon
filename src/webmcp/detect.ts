import type { WebMCPModelContextLike, WebMCPNamespace } from "./types";

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
