import {
  DOCUMENT_WORKSPACE_TOOL_NAMES,
  type DocumentActivitySignalPort,
  type DocumentSurfaceV3,
  type DocumentV3ServicePort,
  type DocumentWorkspaceToolName,
} from "../document/contracts";
import type {
  WebMCPModelContextLike,
  WebMCPNamespace,
  WebMCPToolLike,
} from "./types";

export { DOCUMENT_WORKSPACE_TOOL_NAMES };
export type { DocumentWorkspaceToolName };

export interface DocumentWorkspaceWebMCPRuntimeState {
  surface: DocumentSurfaceV3;
  sessionInstanceId: string;
  pageSessionId: string;
  agentSessionToken: string;
  selfMemberId: string;
}

export interface MutableDocumentWorkspaceWebMCPRuntimeRef {
  current: DocumentWorkspaceWebMCPRuntimeState;
}

export interface DocumentWorkspaceWebMCPRuntimeDependencies {
  latest: MutableDocumentWorkspaceWebMCPRuntimeRef;
  service: DocumentV3ServicePort;
  activitySignal: DocumentActivitySignalPort;
  activeWaitKeys: Set<string>;
  now?: () => number;
  createRequestId?: () => string;
  onAuthoritativeSurface?: (surface: DocumentSurfaceV3) => void;
  onToolExecutionChange?: (
    tool: "submit_work_proposal" | "wait_for_my_work" | null,
  ) => void;
}

export interface DocumentWorkspaceWebMCPRegistrationDiff {
  added: DocumentWorkspaceToolName[];
  removed: DocumentWorkspaceToolName[];
  retained: DocumentWorkspaceToolName[];
  reRegistered: DocumentWorkspaceToolName[];
}

export interface DocumentWorkspaceWebMCPBridgeStatus {
  namespace: WebMCPNamespace;
  supported: boolean;
  registeredTools: DocumentWorkspaceToolName[];
  lastDiff: DocumentWorkspaceWebMCPRegistrationDiff;
  error?: string;
}

export type DocumentWorkspaceWebMCPToolCatalogEntry = Omit<
  WebMCPToolLike,
  "name" | "execute"
> & {
  name: DocumentWorkspaceToolName;
};

export type DocumentWorkspaceWebMCPModelContext = WebMCPModelContextLike;
