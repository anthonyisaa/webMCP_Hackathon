import type {
  HumanRatificationInput,
  MutationReceipt,
  MutationToolName,
  RatiflowServicePort,
  RealtimeRevisionNotice,
  SetLaunchCapacityInput,
  ToolResult,
  WebMCPMutationRequest,
  WorkspaceView,
} from "@/contracts";

type WorkspaceResponse =
  | { ok: true; workspace: WorkspaceView }
  | { ok: false; code?: string; message?: string };

function requestHeaders(sessionToken: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${sessionToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { message?: string; code?: string };
  if (!response.ok) {
    throw new Error(value.message ?? value.code ?? `Request failed with status ${response.status}.`);
  }
  return value;
}

async function postToolResult(
  path: string,
  sessionToken: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ToolResult<MutationReceipt>> {
  const response = await fetch(path, {
    method: "POST",
    headers: requestHeaders(sessionToken, true),
    body: JSON.stringify(body),
    signal,
  });
  return responseJson<ToolResult<MutationReceipt>>(response);
}

function parseSseBlock(block: string): RealtimeRevisionNotice | null {
  const lines = block.split(/\r?\n/);
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (event !== "revision" || !data) return null;
  try {
    const value = JSON.parse(data) as Partial<RealtimeRevisionNotice>;
    return Number.isInteger(value.workspaceRevision) && typeof value.eventId === "string"
      ? (value as RealtimeRevisionNotice)
      : null;
  } catch {
    return null;
  }
}

async function waitForRetry(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1_500);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export class HttpRatiflowService implements RatiflowServicePort {
  async inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView> {
    const response = await fetch("/api/workspace", {
      headers: requestHeaders(sessionToken),
      cache: "no-store",
      signal,
    });
    const body = await responseJson<WorkspaceResponse>(response);
    if (!body.ok) throw new Error(body.message ?? body.code ?? "Workspace inspection failed.");
    return body.workspace;
  }

  mutateFromWebMCP<TTool extends MutationToolName>(
    request: WebMCPMutationRequest<TTool>,
  ): Promise<ToolResult<MutationReceipt>> {
    return postToolResult(
      "/api/workspace/webmcp",
      request.sessionToken,
      {
        toolName: request.toolName,
        envelope: request.envelope,
        capturedSelection: request.capturedSelection,
        capturedContextEpoch: request.capturedContextEpoch,
      },
      request.signal,
    );
  }

  setLaunchCapacityFromCollaboratorUi(
    sessionToken: string,
    input: SetLaunchCapacityInput,
    signal?: AbortSignal,
  ): Promise<ToolResult<MutationReceipt>> {
    return postToolResult("/api/workspace/capacity", sessionToken, input, signal);
  }

  ratifyFromHumanUi(
    sessionToken: string,
    input: HumanRatificationInput,
    signal?: AbortSignal,
  ): Promise<ToolResult<MutationReceipt>> {
    return postToolResult("/api/workspace/ratify", sessionToken, input, signal);
  }

  subscribe(
    sessionToken: string,
    onRevision: (notice: RealtimeRevisionNotice) => void,
  ): () => void {
    const controller = new AbortController();

    const connect = async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch("/api/workspace/realtime", {
            headers: requestHeaders(sessionToken),
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            throw new Error(`Realtime connection failed with status ${response.status}.`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? "";
            for (const block of blocks) {
              const notice = parseSseBlock(block);
              if (notice) onRevision(notice);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          if (process.env.NODE_ENV === "development") {
            console.warn("Ratiflow realtime reconnecting after an error.", error);
          }
        }
        if (!controller.signal.aborted) await waitForRetry(controller.signal);
      }
    };

    void connect();
    return () => controller.abort();
  }
}

export const httpRatiflowService = new HttpRatiflowService();
