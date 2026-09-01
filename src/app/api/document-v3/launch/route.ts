import type { LaunchDocumentV3Input } from "@/document/contracts";
import { jsonObject } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response, invalidDocumentV3Request } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const hasNoBody = request.body === null;
  const body = await jsonObject(request);
  if (!body && !hasNoBody) {
    return documentV3Response(invalidDocumentV3Request("Malformed v3 document launch request."));
  }
  const result = await getRuntimeDocumentWorkspaceService().launchV3(
    (body ?? {}) as LaunchDocumentV3Input,
    request.signal,
  );
  return documentV3Response(result, 201);
}
