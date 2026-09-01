import type { ResolveIssueThreadHttpInput, ResolveIssueThreadServiceInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasPublicRequestId, idempotencyKeyFrom, invalidRepositoryRequest, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !requestId || hasPublicRequestId(body)) return repositoryResponse(invalidRepositoryRequest("Thread resolution requires valid public JSON and Idempotency-Key."));
  const input: ResolveIssueThreadServiceInput = { ...(body as unknown as ResolveIssueThreadHttpInput), requestId };
  return repositoryResponse(await getRuntimeRepositoryService().resolveThread(sessionTokenFrom(request) ?? "", input, request.signal));
}
