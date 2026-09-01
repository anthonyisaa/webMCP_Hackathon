import type { DecideIssueTaskHttpInput, DecideIssueTaskServiceInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasPublicRequestId, idempotencyKeyFrom, invalidRepositoryRequest, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !requestId || hasPublicRequestId(body)) return repositoryResponse(invalidRepositoryRequest("Task rejection requires valid public JSON and Idempotency-Key."));
  const input: DecideIssueTaskServiceInput = { ...(body as unknown as DecideIssueTaskHttpInput), requestId };
  return repositoryResponse(await getRuntimeRepositoryService().rejectTaskProposal(sessionTokenFrom(request) ?? "", input, request.signal));
}
