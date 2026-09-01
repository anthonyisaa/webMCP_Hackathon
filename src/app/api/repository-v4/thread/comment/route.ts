import type { AddHumanIssueCommentHttpInput, AddHumanIssueCommentServiceInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasPublicRequestId, idempotencyKeyFrom, invalidRepositoryRequest, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !requestId || hasPublicRequestId(body)) return repositoryResponse(invalidRepositoryRequest("Comment requires valid public JSON and Idempotency-Key."));
  const input: AddHumanIssueCommentServiceInput = { ...(body as unknown as AddHumanIssueCommentHttpInput), requestId };
  return repositoryResponse(await getRuntimeRepositoryService().addHumanComment(sessionTokenFrom(request) ?? "", input, request.signal), 201);
}
