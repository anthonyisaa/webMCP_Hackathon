import type { WaitForMyIssueTasksInput } from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { hasExactRequestKeys, invalidRepositoryRequest, pageSessionIdFrom, repositoryResponse } from "../../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const pageSessionId = pageSessionIdFrom(request);
  if (!body || !pageSessionId || !hasExactRequestKeys(
    body, ["afterActivityVersion", "afterRevision"], ["timeoutSeconds"],
  )) {
    return repositoryResponse(invalidRepositoryRequest("Task wait requires valid JSON and page session."));
  }
  return repositoryResponse(await getRuntimeRepositoryService().waitForMyTasks(sessionTokenFrom(request) ?? "", body as unknown as WaitForMyIssueTasksInput, pageSessionId, request.signal));
}
