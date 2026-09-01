import type { CreateIssueThreadHttpInput, CreateIssueThreadServiceInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasPublicRequestId, idempotencyKeyFrom, invalidRepositoryRequest, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !requestId || hasPublicRequestId(body)) return repositoryResponse(invalidRepositoryRequest("Thread creation requires valid public JSON and Idempotency-Key."));
  const input: CreateIssueThreadServiceInput = { ...(body as unknown as CreateIssueThreadHttpInput), requestId };
  return repositoryResponse(await getRuntimeRepositoryService().createThread(sessionTokenFrom(request) ?? "", input, request.signal), 201);
}
