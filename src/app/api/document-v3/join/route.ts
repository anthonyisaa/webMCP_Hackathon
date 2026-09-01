import type { JoinDocumentV3Input } from "@/document/contracts";
import { jsonObject } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response, invalidDocumentV3Request } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body) {
    return documentV3Response(invalidDocumentV3Request("Malformed v3 document join request."));
  }
  const result = await getRuntimeDocumentWorkspaceService().joinV3(
    body as unknown as JoinDocumentV3Input,
    request.signal,
  );
  return documentV3Response(result);
}
