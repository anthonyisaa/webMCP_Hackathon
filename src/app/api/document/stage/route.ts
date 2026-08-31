import type { SetDocumentStageInput } from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentService } from "@/domain/document-runtime";
import { documentResponse, invalidDocumentRequest } from "@/app/api/document/_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body) return documentResponse(invalidDocumentRequest("Malformed document stage request."));
  const result = await getRuntimeDocumentService().setStage(
    sessionTokenFrom(request) ?? "",
    body as unknown as SetDocumentStageInput,
    request.signal,
  );
  return documentResponse(result);
}
