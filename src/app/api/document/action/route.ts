import type {
  CancelDocumentAnnotationInput,
  CreateDocumentAnnotationInput,
} from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentService } from "@/domain/document-runtime";
import { documentResponse, invalidDocumentRequest } from "@/app/api/document/_response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await getRuntimeDocumentService().listAgentAnnotations(
    sessionTokenFrom(request) ?? "",
    request.signal,
  );
  return documentResponse(result);
}

export async function POST(request: Request) {
  const body = await jsonObject(request);
  if (!body) return documentResponse(invalidDocumentRequest("Malformed annotation request."));
  const result = await getRuntimeDocumentService().createAnnotation(
    sessionTokenFrom(request) ?? "",
    body as unknown as CreateDocumentAnnotationInput,
    request.signal,
  );
  return documentResponse(result);
}

export async function DELETE(request: Request) {
  const body = await jsonObject(request);
  if (!body) return documentResponse(invalidDocumentRequest("Malformed annotation cancellation."));
  const result = await getRuntimeDocumentService().cancelAnnotation(
    sessionTokenFrom(request) ?? "",
    body as unknown as CancelDocumentAnnotationInput,
    request.signal,
  );
  return documentResponse(result);
}
