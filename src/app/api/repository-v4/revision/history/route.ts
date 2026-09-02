import type { ReadIssueHistoryInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, invalidRepositoryRequest, pageSessionIdFrom, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = request.body === null ? {} : await jsonObject(request);
  if (!body || !hasExactRequestKeys(body, [], ["beforeRevision", "limit"])) {
    return repositoryResponse(invalidRepositoryRequest("Malformed history request."));
  }
  const token = sessionTokenFrom(request) ?? "";
  const pageSessionId = pageSessionIdFrom(request);
  const result = pageSessionId
    ? await getRuntimeRepositoryService().readHistoryAsAgent(
        token, body as ReadIssueHistoryInput, pageSessionId, request.signal,
      )
    : await getRuntimeRepositoryService().readHistory(
        token, body as ReadIssueHistoryInput, request.signal,
      );
  return repositoryResponse(result);
}
