import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";
import type { HumanRatificationInput } from "@/contracts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessionToken = sessionTokenFrom(request);
  const body = await jsonObject(request);
  if (!sessionToken || !body || !Number.isInteger(body.expectedWorkspaceRevision) || typeof body.requestId !== "string" || typeof body.recommendation !== "string" || typeof body.customerMessage !== "string") {
    return Response.json({ ok: false, code: "INVALID_INPUT", message: "Malformed ratification request." }, { status: 400 });
  }
  const input: HumanRatificationInput = {
    expectedWorkspaceRevision: body.expectedWorkspaceRevision as number,
    requestId: body.requestId,
    recommendation: body.recommendation,
    customerMessage: body.customerMessage,
  };
  return Response.json(await getRuntimeRatiflowService().ratifyFromHumanUi(sessionToken, input, request.signal));
}
