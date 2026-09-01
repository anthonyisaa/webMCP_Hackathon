import type { ReadDocumentMemoryInput } from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response, invalidDocumentV3Request } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const hasNoBody = request.body === null;
  const body = await jsonObject(request);
  if (!body && !hasNoBody) {
    return documentV3Response(invalidDocumentV3Request("Malformed memory request."));
  }
  const result = await getRuntimeDocumentWorkspaceService().readMemory(
    sessionTokenFrom(request) ?? "",
    (body ?? {}) as ReadDocumentMemoryInput,
    request.signal,
  );
  return documentV3Response(result);
}
