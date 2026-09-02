import type {
  CompiledCapabilities,
  MemberRole,
  RatiflowServicePort,
  WorkspaceView,
} from "../contracts/index";

export type WebMCPNamespace =
  | "document.modelContext"
  | "navigator.modelContext"
  | "unsupported";

export interface WebMCPExecutionOptionsLike {
  signal?: AbortSignal;
}

export interface WebMCPToolLike {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: unknown, options?: WebMCPExecutionOptionsLike) => Promise<unknown>;
}

/** Consumer descriptor returned by `getTools()`. Its object identity is executable. */
export interface WebMCPRegisteredToolLike {
  name: string;
  title?: string;
  description: string;
  /** The current draft exposes an object; some native clients still return its JSON string form. */
  inputSchema?: Record<string, unknown> | string;
  annotations?: WebMCPToolLike["annotations"];
  origin: string;
  window?: Window;
}

export interface WebMCPModelContextLike {
  registerTool(
    tool: WebMCPToolLike,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void> | void;
  getTools?(options?: { fromOrigins?: string[] }): Promise<WebMCPRegisteredToolLike[]>;
  executeTool?(
    tool: WebMCPRegisteredToolLike,
    input?: Record<string, unknown> | string,
    options?: WebMCPExecutionOptionsLike,
  ): Promise<string>;
  addEventListener?(type: "toolchange", listener: EventListener): void;
  removeEventListener?(type: "toolchange", listener: EventListener): void;
}

export type WebMCPConsumerModelContext = WebMCPModelContextLike & {
  getTools(options?: { fromOrigins?: string[] }): Promise<WebMCPRegisteredToolLike[]>;
  executeTool(
    tool: WebMCPRegisteredToolLike,
    input?: Record<string, unknown> | string,
    options?: WebMCPExecutionOptionsLike,
  ): Promise<string>;
  addEventListener(type: "toolchange", listener: EventListener): void;
  removeEventListener(type: "toolchange", listener: EventListener): void;
};

export interface WebMCPRuntimeState {
  compiled: CompiledCapabilities;
  workspace: WorkspaceView;
  memberRole: MemberRole;
  memberSessionInstanceId: string;
  sessionToken: string;
  /** Private page-session UUID. It is adapter context and never model input. */
  pageSessionId?: string;
}

export interface MutableWebMCPRuntimeRef {
  current: WebMCPRuntimeState;
}

export interface WebMCPRuntimeDependencies {
  latest: MutableWebMCPRuntimeRef;
  service: RatiflowServicePort;
  /** Preview-only static-superset evaluation lets the server decide unavailable mutations. */
  bypassClientAvailabilityGate?: boolean;
  onAuthoritativeSnapshot?: (
    workspace: WorkspaceView,
    compiled: CompiledCapabilities,
  ) => void;
}

export interface RegistrationDiff {
  added: string[];
  removed: string[];
  retained: string[];
  reRegistered: string[];
}

export interface WebMCPBridgeStatus {
  namespace: WebMCPNamespace;
  supported: boolean;
  registeredTools: string[];
  lastDiff: RegistrationDiff;
  engagementMode?: import("../contracts/index").AgentEngagementMode;
  error?: string;
}
