import type { ReadIssueHistoryInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { invalidRepositoryRequest, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = request.body === null ? {} : await jsonObject(request);
  if (!body) return repositoryResponse(invalidRepositoryRequest("Malformed history request."));
  return repositoryResponse(await getRuntimeRepositoryService().readHistory(sessionTokenFrom(request) ?? "", body as ReadIssueHistoryInput, request.signal));
}
