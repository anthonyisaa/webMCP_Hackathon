import type { LaunchIssueHttpInput } from "@/repository/contracts";
import { jsonObject } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, invalidRepositoryRequest, repositoryResponse } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body || !hasExactRequestKeys(body, ["kind", "displayName"])) {
    return repositoryResponse(invalidRepositoryRequest("Malformed issue launch request."));
  }
  const result = await getRuntimeRepositoryService().launch(
    body as unknown as LaunchIssueHttpInput,
    request.signal,
  );
  return repositoryResponse(result, 201);
}
