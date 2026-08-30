import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";
import type { MutationToolName, WebMCPMutationRequest } from "@/contracts";

export const dynamic = "force-dynamic";

const mutationNames = new Set<MutationToolName>(["recommend_option", "add_evidence", "challenge_option", "prepare_decision"]);

export async function POST(request: Request) {
  const sessionToken = sessionTokenFrom(request);
  const body = await jsonObject(request);
  const envelope = body?.envelope;
  const capturedSelection = body?.capturedSelection;
  if (!sessionToken || !body || typeof body.toolName !== "string" || !mutationNames.has(body.toolName as MutationToolName) || !envelope || typeof envelope !== "object" || Array.isArray(envelope) || !capturedSelection || typeof capturedSelection !== "object" || Array.isArray(capturedSelection) || !Number.isInteger(body.capturedContextEpoch)) {
    return Response.json({ ok: false, code: "INVALID_INPUT", message: "Malformed WebMCP mutation request." }, { status: 400 });
  }
  const result = await getRuntimeRatiflowService().mutateFromWebMCP({
    sessionToken,
    toolName: body.toolName as MutationToolName,
    envelope,
    capturedSelection,
    capturedContextEpoch: body.capturedContextEpoch,
    signal: request.signal,
  } as WebMCPMutationRequest);
  return Response.json(result);
}
