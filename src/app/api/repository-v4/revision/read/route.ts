import type { ReadIssueRevisionHttpInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { invalidRepositoryRequest, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body) return repositoryResponse(invalidRepositoryRequest("Malformed revision read request."));
  const input = body as unknown as ReadIssueRevisionHttpInput;
  return repositoryResponse(await getRuntimeRepositoryService().readRevision(sessionTokenFrom(request) ?? "", input.revision, request.signal));
}
