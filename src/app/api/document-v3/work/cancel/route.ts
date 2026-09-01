import type { CancelDocumentWorkOrderInput } from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response, invalidDocumentV3Request } from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body) return documentV3Response(invalidDocumentV3Request("Malformed work cancellation."));
  const result = await getRuntimeDocumentWorkspaceService().cancelWorkOrder(
    sessionTokenFrom(request) ?? "",
    body as unknown as CancelDocumentWorkOrderInput,
    request.signal,
  );
  return documentV3Response(result);
}
