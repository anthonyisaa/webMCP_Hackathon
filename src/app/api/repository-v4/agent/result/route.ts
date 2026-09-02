import type { SubmitIssueTaskResultServiceInput, SubmitIssueTaskResultToolInput } from "@/repository/contracts";
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
      body, ["taskId", "basedOnRevision", "resultSummary"],
      ["replacementText", "evidenceRefs"],
    )) {
    return repositoryResponse(invalidRepositoryRequest("Agent result requires exact public JSON, page session, and Idempotency-Key."));
  }
  const input: SubmitIssueTaskResultServiceInput = { ...(body as unknown as SubmitIssueTaskResultToolInput), requestId };
  return repositoryResponse(await getRuntimeRepositoryService().submitTaskResult(sessionTokenFrom(request) ?? "", input, pageSessionId, request.signal));
}
