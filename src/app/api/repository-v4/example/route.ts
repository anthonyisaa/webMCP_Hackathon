import type { LaunchIssueExampleHttpInput } from "@/repository/contracts";
import { jsonObject } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, invalidRepositoryRequest, repositoryResponse } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body || !hasExactRequestKeys(body, ["kind", "displayName"])) {
    return repositoryResponse(invalidRepositoryRequest(
      "The example request requires an exact kind and displayName.",
    ));
  }
  const result = await getRuntimeRepositoryService().launchExample(
    body as unknown as LaunchIssueExampleHttpInput,
    request.signal,
  );
  return repositoryResponse(result, 201);
}
