import type { SaveDocumentInput } from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentService } from "@/domain/document-runtime";
import { documentResponse, invalidDocumentRequest } from "./_response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await getRuntimeDocumentService().inspect(sessionTokenFrom(request) ?? "", request.signal);
  return documentResponse(result);
}

export async function PUT(request: Request) {
  const body = await jsonObject(request);
  if (!body) return documentResponse(invalidDocumentRequest("Malformed document save request."));
  const result = await getRuntimeDocumentService().saveHuman(
    sessionTokenFrom(request) ?? "",
    body as unknown as SaveDocumentInput,
    request.signal,
  );
  return documentResponse(result);
}
