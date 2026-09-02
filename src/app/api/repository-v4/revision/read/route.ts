import type { ReadIssueRevisionHttpInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, invalidRepositoryRequest, pageSessionIdFrom, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body || !hasExactRequestKeys(body, ["revision"])) {
    return repositoryResponse(invalidRepositoryRequest("Malformed revision read request."));
  }
  const input = body as unknown as ReadIssueRevisionHttpInput;
  const token = sessionTokenFrom(request) ?? "";
  const pageSessionId = pageSessionIdFrom(request);
  const result = pageSessionId
    ? await getRuntimeRepositoryService().readRevisionAsAgent(
        token, input.revision, pageSessionId, request.signal,
      )
    : await getRuntimeRepositoryService().readRevision(token, input.revision, request.signal);
  return repositoryResponse(result);
}
