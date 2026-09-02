import type { JoinIssueHttpInput } from "@/repository/contracts";
import { jsonObject } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, invalidRepositoryRequest, repositoryResponse } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body || !hasExactRequestKeys(body, ["shareToken", "displayName"])) {
    return repositoryResponse(invalidRepositoryRequest("Malformed issue join request."));
  }
  const result = await getRuntimeRepositoryService().join(
    body as unknown as JoinIssueHttpInput,
    request.signal,
  );
  return repositoryResponse(result, 201);
}
