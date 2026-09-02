import type { ReadCollaborationContextInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import {
  hasExactRequestKeys,
  invalidRepositoryRequest,
  pageSessionIdFrom,
  repositoryResponse,
} from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = request.body === null ? {} : await jsonObject(request);
  const pageSessionId = pageSessionIdFrom(request);
  if (!body || !pageSessionId
    || !hasExactRequestKeys(body, [], ["beforeActivityVersion", "limit"])) {
    return repositoryResponse(invalidRepositoryRequest(
      "Collaboration context requires valid JSON and a page session.",
    ));
  }
  return repositoryResponse(await getRuntimeRepositoryService().readCollaborationContext(
    sessionTokenFrom(request) ?? "",
    body as ReadCollaborationContextInput,
    pageSessionId,
    request.signal,
  ));
}
