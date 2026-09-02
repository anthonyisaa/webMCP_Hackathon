import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { pageSessionIdFrom, repositoryResponse } from "../_response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = sessionTokenFrom(request) ?? "";
  const pageSessionId = pageSessionIdFrom(request);
  const result = pageSessionId
    ? await getRuntimeRepositoryService().inspectAsAgent(token, pageSessionId, request.signal)
    : await getRuntimeRepositoryService().inspect(token, request.signal);
  return repositoryResponse(result);
}
