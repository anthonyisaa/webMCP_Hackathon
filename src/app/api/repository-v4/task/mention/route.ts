import type {
  CreateMentionTaskHttpInput,
  CreateMentionTaskServiceInput,
} from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import {
  hasExactRequestKeys,
  hasPublicRequestId,
  idempotencyKeyFrom,
  invalidRepositoryRequest,
  repositoryResponse,
} from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !requestId || hasPublicRequestId(body)
    || !hasExactRequestKeys(body, [
      "expectedRevision", "comment", "mentionedAgentName",
      "assignedToMemberId", "anchor",
    ])) {
    return repositoryResponse(invalidRepositoryRequest(
      "An @ mention requires exact public JSON and Idempotency-Key.",
    ));
  }
  const input: CreateMentionTaskServiceInput = {
    ...(body as unknown as CreateMentionTaskHttpInput),
    requestId,
  };
  return repositoryResponse(await getRuntimeRepositoryService().createMentionTask(
    sessionTokenFrom(request) ?? "",
    input,
    request.signal,
  ), 201);
}
