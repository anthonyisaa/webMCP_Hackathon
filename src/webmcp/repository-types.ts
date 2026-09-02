import type {
  IssueAgentProfile,
  IssueWorkspaceSurface,
  RepositoryBrowserClientPort,
  RepositoryToolName,
} from "../repository/contracts";
import type {
  WebMCPModelContextLike,
  WebMCPNamespace,
} from "./types";

export interface RepositoryActivitySignalPort {
  readonly latestActivityVersion: number;
  observe(activityVersion: number): void;
  waitForChange(
    afterActivityVersion: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<number | null>;
  close(reason?: string): void;
}

export interface RepositoryWebMCPRuntimeState {
  surface: IssueWorkspaceSurface;
  sessionInstanceId: string;
  pageSessionId: string;
  agentSessionToken: string;
  selfMemberId: string;
}

export interface MutableRepositoryWebMCPRuntimeRef {
  current: RepositoryWebMCPRuntimeState;
}

/** Successful self-declared identity for this mounted top-level page only. */
export interface MutableRepositoryAgentConnectionRef {
  current: IssueAgentProfile | null;
}

export interface RepositoryWebMCPRuntimeDependencies {
  latest: MutableRepositoryWebMCPRuntimeRef;
  connection: MutableRepositoryAgentConnectionRef;
  service: RepositoryBrowserClientPort;
  activitySignal: RepositoryActivitySignalPort;
  activeWaitKeys: Set<string>;
  createRequestId?: () => string;
  onAuthoritativeSurface?: (surface: IssueWorkspaceSurface) => void;
  onAgentConnectionChange?: (profile: IssueAgentProfile | null) => void;
  onToolExecutionChange?: (
    tool: "wait_for_my_tasks" | "comment_on_task" | "submit_task_result" | null,
  ) => void;
}

export interface RepositoryWebMCPRegistrationDiff {
  added: RepositoryToolName[];
  removed: RepositoryToolName[];
  retained: RepositoryToolName[];
  reRegistered: RepositoryToolName[];
}

export interface RepositoryWebMCPBridgeStatus {
  namespace: WebMCPNamespace;
  supported: boolean;
  registeredTools: RepositoryToolName[];
  lastDiff: RepositoryWebMCPRegistrationDiff;
  error?: string;
}

export type RepositoryWebMCPModelContext = WebMCPModelContextLike;
