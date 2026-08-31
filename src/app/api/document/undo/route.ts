import type { UndoAgentEditInput } from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentService } from "@/domain/document-runtime";
import { documentResponse, invalidDocumentRequest } from "@/app/api/document/_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body) return documentResponse(invalidDocumentRequest("Malformed agent-edit undo request."));
  const result = await getRuntimeDocumentService().undoAgentEdit(
    sessionTokenFrom(request) ?? "",
    body as unknown as UndoAgentEditInput,
    request.signal,
  );
  return documentResponse(result);
}
