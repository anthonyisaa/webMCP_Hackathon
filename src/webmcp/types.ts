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
    untrustedContentHint?: boolean;
  };
  execute: (input: unknown, options?: WebMCPExecutionOptionsLike) => Promise<unknown>;
}

export interface WebMCPModelContextLike {
  registerTool(
    tool: WebMCPToolLike,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void> | void;
}

export interface WebMCPRuntimeState {
  compiled: CompiledCapabilities;
  workspace: WorkspaceView;
  memberRole: MemberRole;
  memberSessionInstanceId: string;
  sessionToken: string;
}

export interface MutableWebMCPRuntimeRef {
  current: WebMCPRuntimeState;
}

export interface WebMCPRuntimeDependencies {
  latest: MutableWebMCPRuntimeRef;
  service: RatiflowServicePort;
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
  error?: string;
}
