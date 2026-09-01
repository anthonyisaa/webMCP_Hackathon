import type { ListMyIssueTasksInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { invalidRepositoryRequest, pageSessionIdFrom, repositoryResponse } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = request.body === null ? {} : await jsonObject(request);
  const pageSessionId = pageSessionIdFrom(request);
  if (!body || !pageSessionId) return repositoryResponse(invalidRepositoryRequest("Task listing requires valid JSON and page session."));
  return repositoryResponse(await getRuntimeRepositoryService().listMyTasks(sessionTokenFrom(request) ?? "", body as ListMyIssueTasksInput, pageSessionId, request.signal));
}
