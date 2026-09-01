import type { SaveDocumentInput } from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response, invalidDocumentV3Request } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body) return documentV3Response(invalidDocumentV3Request("Malformed v3 save request."));
  const result = await getRuntimeDocumentWorkspaceService().saveHuman(
    sessionTokenFrom(request) ?? "",
    body as unknown as SaveDocumentInput,
    request.signal,
  );
  return documentV3Response(result);
}
