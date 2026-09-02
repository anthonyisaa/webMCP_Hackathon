type WebMCPJsonSchema = Record<string, unknown>;

interface WebMCPAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

interface WebMCPExecuteOptions {
  signal: AbortSignal;
}

interface WebMCPTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: WebMCPJsonSchema;
  annotations?: WebMCPAnnotations;
  execute: (
    input: Record<string, unknown>,
    options?: WebMCPExecuteOptions,
  ) => Promise<unknown>;
}

interface WebMCPRegisteredTool {
  name: string;
  title?: string;
  description: string;
  /** Draft shape plus the temporary stringified-schema shape in Chrome 152. */
  inputSchema?: WebMCPJsonSchema | string;
  annotations?: WebMCPAnnotations;
  origin: string;
  window: Window;
}

interface WebMCPModelContext {
  registerTool(
    tool: WebMCPTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void> | void;
  getTools?(options?: { fromOrigins?: string[] }): Promise<WebMCPRegisteredTool[]>;
  executeTool?(
    tool: WebMCPRegisteredTool,
    input?: Record<string, unknown> | string,
    options?: { signal?: AbortSignal },
  ): Promise<string>;
  addEventListener?(type: "toolchange", listener: EventListener): void;
  removeEventListener?(type: "toolchange", listener: EventListener): void;
}

interface Document {
  readonly modelContext?: WebMCPModelContext;
}

interface Navigator {
  readonly modelContext?: WebMCPModelContext;
}
