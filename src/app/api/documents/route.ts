import type { LaunchDocumentInput } from "@/document/contracts";
import { jsonObject } from "@/domain/http-session";
import { getRuntimeDocumentService } from "@/domain/document-runtime";
import { documentResponse, invalidDocumentRequest } from "@/app/api/document/_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const hasNoBody = request.body === null;
  const body = await jsonObject(request);
  if (!body && !hasNoBody) return documentResponse(invalidDocumentRequest("Malformed document launch request."));
  const result = await getRuntimeDocumentService().launch((body ?? {}) as LaunchDocumentInput, request.signal);
  return documentResponse(result, 201);
}
