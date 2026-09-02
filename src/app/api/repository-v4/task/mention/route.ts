import type {
  CreateDirectoryMentionHttpInput,
  CreateDirectoryMentionServiceInput,
  CreateMentionTaskHttpInput,
  CreateMentionTaskServiceInput,
} from "@/repository/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import {
  getRuntimeRepositoryRelayService,
  getRuntimeRepositoryService,
} from "@/domain/repository-runtime";
import {
  hasExactRequestKeys,
  hasPublicRequestId,
  idempotencyKeyFrom,
  invalidRepositoryRequest,
  relayResponse,
  repositoryResponse,
} from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !requestId || hasPublicRequestId(body)) {
    return repositoryResponse(invalidRepositoryRequest(
      "An @ mention requires exact public JSON and Idempotency-Key.",
    ));
  }
  if (hasExactRequestKeys(body, ["expectedRevision", "comment", "target", "anchor"])) {
    const input: CreateDirectoryMentionServiceInput = {
      ...(body as unknown as CreateDirectoryMentionHttpInput),
      requestId,
    };
    return relayResponse(await getRuntimeRepositoryRelayService().createDirectoryMention(
      sessionTokenFrom(request) ?? "",
      input,
      request.signal,
    ), 201);
  }
  if (!hasExactRequestKeys(body, [
    "expectedRevision", "comment", "mentionedAgentName",
    "assignedToMemberId", "anchor",
  ])) {
    return repositoryResponse(invalidRepositoryRequest(
      "An @ mention requires one exact canonical or compatibility request shape.",
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
