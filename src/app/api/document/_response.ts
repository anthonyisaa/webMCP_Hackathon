import type { DocumentFailure, DocumentResult } from "@/document/contracts";

export function invalidDocumentRequest(message: string): DocumentFailure {
  return { ok: false, code: "INVALID_INPUT", message, retryable: false };
}

export function documentResponse<T>(result: DocumentResult<T>, successStatus = 200): Response {
  if (result.ok) return Response.json(result, { status: successStatus });
  const status = result.code === "INVALID_INPUT" ? 400
    : result.code === "UNAUTHORIZED" ? 401
      : result.code === "NOT_FOUND" ? 404
        : result.code === "RATE_LIMITED" ? 429
          : 409;
  return Response.json(result, { status });
}
