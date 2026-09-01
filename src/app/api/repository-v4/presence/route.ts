import type { TouchIssuePresenceHttpInput, TouchIssuePresenceServiceInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasPublicRequestId, idempotencyKeyFrom, invalidRepositoryRequest, repositoryResponse } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !requestId || hasPublicRequestId(body)) return repositoryResponse(invalidRepositoryRequest("Presence requires valid public JSON and Idempotency-Key."));
  const input: TouchIssuePresenceServiceInput = { ...(body as unknown as TouchIssuePresenceHttpInput), requestId };
  return repositoryResponse(await getRuntimeRepositoryService().touchPresence(sessionTokenFrom(request) ?? "", input, request.signal));
}
