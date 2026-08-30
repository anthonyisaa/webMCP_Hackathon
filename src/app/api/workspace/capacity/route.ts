import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";
import type { SetLaunchCapacityInput } from "@/contracts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessionToken = sessionTokenFrom(request);
  const body = await jsonObject(request);
  const payload = body?.payload;
  if (!sessionToken || !body || !payload || typeof payload !== "object" || Array.isArray(payload) || typeof body.requestId !== "string" || !Number.isInteger(body.expectedWorkspaceRevision) || !Number.isInteger((payload as Record<string, unknown>).launchCapacityEngineerDays) || typeof (payload as Record<string, unknown>).reason !== "string") {
    return Response.json({ ok: false, code: "INVALID_INPUT", message: "Malformed capacity request." }, { status: 400 });
  }
  const input: SetLaunchCapacityInput = {
    expectedWorkspaceRevision: body.expectedWorkspaceRevision as number,
    requestId: body.requestId,
    payload: {
      launchCapacityEngineerDays: (payload as Record<string, unknown>).launchCapacityEngineerDays as number,
      reason: (payload as Record<string, unknown>).reason as string,
    },
  };
  return Response.json(await getRuntimeRatiflowService().setLaunchCapacityFromCollaboratorUi(sessionToken, input, request.signal));
}
