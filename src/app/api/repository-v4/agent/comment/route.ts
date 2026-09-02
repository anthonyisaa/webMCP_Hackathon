import type { CommentOnIssueTaskServiceInput, CommentOnIssueTaskToolInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, hasPublicRequestId, idempotencyKeyFrom, invalidRepositoryRequest, pageSessionIdFrom, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const pageSessionId = pageSessionIdFrom(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !pageSessionId || !requestId || hasPublicRequestId(body)
    || !hasExactRequestKeys(
      body, ["taskId", "body"], ["replyToCommentId", "evidenceRefs"],
    )) {
    return repositoryResponse(invalidRepositoryRequest("Agent comment requires exact public JSON, page session, and Idempotency-Key."));
  }
  const input: CommentOnIssueTaskServiceInput = { ...(body as unknown as CommentOnIssueTaskToolInput), requestId };
  return repositoryResponse(await getRuntimeRepositoryService().commentOnTask(sessionTokenFrom(request) ?? "", input, pageSessionId, request.signal), 201);
}
