import type {
  DocumentServicePort,
  DocumentSurface,
} from "../document/contracts";
import type {
  WebMCPModelContextLike,
  WebMCPNamespace,
  WebMCPToolLike,
} from "./types";

export const DOCUMENT_WEBMCP_TOOL_NAMES = [
  "inspect_document",
  "list_agent_annotations",
  "apply_agent_annotation",
] as const;

export type DocumentWebMCPToolName = (typeof DOCUMENT_WEBMCP_TOOL_NAMES)[number];

export interface DocumentWebMCPRuntimeState {
  surface: DocumentSurface;
  sessionInstanceId: string;
  agentSessionToken: string;
  selfMemberId: string;
}

export interface MutableDocumentWebMCPRuntimeRef {
  current: DocumentWebMCPRuntimeState;
}

export interface DocumentWebMCPRuntimeDependencies {
  latest: MutableDocumentWebMCPRuntimeRef;
  service: DocumentServicePort;
  onAuthoritativeSurface?: (surface: DocumentSurface) => void;
  onToolExecutionChange?: (tool: "apply_agent_annotation" | null) => void;
}

export interface DocumentWebMCPRegistrationDiff {
  added: DocumentWebMCPToolName[];
  removed: DocumentWebMCPToolName[];
  retained: DocumentWebMCPToolName[];
  reRegistered: DocumentWebMCPToolName[];
}

export interface DocumentWebMCPBridgeStatus {
  namespace: WebMCPNamespace;
  supported: boolean;
  registeredTools: DocumentWebMCPToolName[];
  lastDiff: DocumentWebMCPRegistrationDiff;
  error?: string;
}

export type DocumentWebMCPToolCatalogEntry = Omit<WebMCPToolLike, "name" | "execute"> & {
  name: DocumentWebMCPToolName;
};

export type DocumentWebMCPModelContext = WebMCPModelContextLike;
