import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import {
  documentV3Response,
  invalidDocumentV3Request,
  pageSessionIdFrom,
} from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const pageSessionId = pageSessionIdFrom(request);
  if (!body || Object.keys(body).length !== 0 || !pageSessionId) {
    return documentV3Response(
      invalidDocumentV3Request("Agent work requires an empty object and valid page session."),
    );
  }
  const result = await getRuntimeDocumentWorkspaceService().listMyWork(
    sessionTokenFrom(request) ?? "",
    pageSessionId,
    request.signal,
  );
  return documentV3Response(result);
}
