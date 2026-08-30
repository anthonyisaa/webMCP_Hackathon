import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionToken = sessionTokenFrom(request);
  if (!sessionToken) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  try {
    return Response.json({ ok: true, workspace: await getRuntimeRatiflowService().inspect(sessionToken, request.signal) });
  } catch {
    return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }
}
