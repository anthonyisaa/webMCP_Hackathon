import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
// Vercel can terminate a streaming invocation at 300 seconds. Close before that
// ceiling so the browser observes a normal EOF and can reconnect itself.
const REALTIME_STREAM_LIFETIME_MS = 240_000;

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
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cleanedUp = false;
  let streamClosed = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timeout !== undefined) clearTimeout(timeout);
    request.signal.removeEventListener("abort", closeStream);
    unsubscribe();
  };
  const closeStream = () => {
    if (streamClosed) return;
    streamClosed = true;
    cleanup();
    // The request can be cancelled at the same time as the lifetime timer. A
    // cancelled stream rejects close(), so cleanup must remain best-effort.
    try {
      controller?.close();
    } catch {
      // The consumer has already cancelled the stream.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      request.signal.addEventListener("abort", closeStream, { once: true });
      if (request.signal.aborted) {
        closeStream();
        return;
      }
      unsubscribe = service.subscribe(sessionToken, (notice) => {
        if (streamClosed) return;
        streamController.enqueue(encoder.encode(`event: revision\ndata: ${JSON.stringify(notice)}\n\n`));
      });
      streamController.enqueue(encoder.encode(": connected\n\n"));
      timeout = setTimeout(closeStream, REALTIME_STREAM_LIFETIME_MS);
    },
    cancel() {
      streamClosed = true;
      cleanup();
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
