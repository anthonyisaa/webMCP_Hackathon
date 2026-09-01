import { jsonObject } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { invalidRepositoryRequest, repositoryResponse } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = request.body === null ? {} : await jsonObject(request);
  if (!body || Object.keys(body).length !== 0) {
    return repositoryResponse(invalidRepositoryRequest("The example request must be empty."));
  }
  const result = await getRuntimeRepositoryService().launchExample({}, request.signal);
  return repositoryResponse(result, 201);
}
