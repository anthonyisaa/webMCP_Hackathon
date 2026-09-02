import type {
  ConnectIssueAgentServiceInput,
  ConnectIssueAgentToolInput,
} from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import {
  hasExactRequestKeys,
  hasPublicRequestId,
  idempotencyKeyFrom,
  invalidRepositoryRequest,
  pageSessionIdFrom,
  repositoryResponse,
} from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const pageSessionId = pageSessionIdFrom(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !pageSessionId || !requestId || hasPublicRequestId(body)
    || !hasExactRequestKeys(body, ["name"])) {
    return repositoryResponse(invalidRepositoryRequest(
      "Agent connection requires exact public JSON, page session, and Idempotency-Key.",
    ));
  }
  const input: ConnectIssueAgentServiceInput = {
    ...(body as unknown as ConnectIssueAgentToolInput),
    requestId,
  };
  return repositoryResponse(await getRuntimeRepositoryService().connectAgent(
    sessionTokenFrom(request) ?? "",
    input,
    pageSessionId,
    request.signal,
  ));
}
