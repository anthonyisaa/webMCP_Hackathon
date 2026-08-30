import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/**
 * Local deterministic realtime bridge. It authorizes the membership handle before
 * creating the stream and emits invalidation notices only, never workspace payloads.
 */
export async function GET(request: Request) {
  const sessionToken = sessionTokenFrom(request);
  if (!sessionToken) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const service = getRuntimeRatiflowService();
  try {
    await service.inspect(sessionToken, request.signal);
  } catch {
    return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }
  let unsubscribe: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      unsubscribe = service.subscribe(sessionToken, (notice) => {
        controller.enqueue(encoder.encode(`event: revision\ndata: ${JSON.stringify(notice)}\n\n`));
      });
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
