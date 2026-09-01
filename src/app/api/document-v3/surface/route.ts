import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response } from "../_response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await getRuntimeDocumentWorkspaceService().inspect(
    sessionTokenFrom(request) ?? "",
    request.signal,
  );
  return documentV3Response(result);
}
