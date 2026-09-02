import type {
  ManagedAgentLogicalToolName,
  RelayBrowserClientPort,
  RelayWorkspaceState,
} from "../contracts";
import type { RepositoryWebMCPRegistrationDiff } from "../../webmcp/repository-types";
import type { WebMCPConsumerModelContext } from "../../webmcp/types";

export const RELAY_BROWSER_RUNTIME_PHASES = [
  "UNAVAILABLE",
  "IDLE",
  "CLAIMING",
  "TRANSITIONING_TO_RELAY",
  "DISCOVERING",
  "AWAITING_MODEL",
  "EXECUTING_TOOL",
  "RESTORING_IDLE",
  "PAUSED_HIDDEN",
  "FAILED",
] as const;

export type RelayBrowserRuntimePhase = (typeof RELAY_BROWSER_RUNTIME_PHASES)[number];

/** Sanitized UI projection. It deliberately cannot carry grants, permits, or content. */
export interface RelayBrowserRuntimeStatus {
  phase: RelayBrowserRuntimePhase;
  activeLogicalTool: ManagedAgentLogicalToolName | null;
  lastError: string | null;
  webMcpAvailable: boolean;
}

export interface RelayIdleCatalogPort {
  withdraw(reason?: string): Promise<RepositoryWebMCPRegistrationDiff>;
  restore(): Promise<RepositoryWebMCPRegistrationDiff>;
}

export interface RelayBrowserEnvironment {
  readonly origin: string;
  readonly topLevelWindow: Window;
  isVisible(): boolean;
  now(): number;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
  subscribeVisibility(listener: () => void): () => void;
}

export interface RelayBrowserRuntimeDependencies {
  context: WebMCPConsumerModelContext;
  client: RelayBrowserClientPort;
  idleCatalog: RelayIdleCatalogPort;
  pageSessionId: string;
  environment: RelayBrowserEnvironment;
  onStateChange?: (state: RelayWorkspaceState | null) => void;
  onStatusChange?: (status: RelayBrowserRuntimeStatus) => void;
}

export function createDOMRelayBrowserEnvironment(): RelayBrowserEnvironment {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("The managed Relay requires a browser document.");
  }
  if (window.top !== window) {
    throw new Error("The managed Relay must run in the top-level page.");
  }
  return {
    origin: window.location.origin,
    topLevelWindow: window,
    isVisible: () => document.visibilityState === "visible",
    now: () => Date.now(),
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: (timer) => clearTimeout(timer),
    subscribeVisibility: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}
