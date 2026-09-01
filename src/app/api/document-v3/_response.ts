import type { DocumentV3Failure, DocumentV3Result } from "@/document/contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function invalidDocumentV3Request(message: string): DocumentV3Failure {
  return { ok: false, code: "INVALID_INPUT", message, retryable: false };
}

export function documentV3Response<T>(
  result: DocumentV3Result<T>,
  successStatus = 200,
): Response {
  if (result.ok) return Response.json(result, { status: successStatus });
  const status = result.code === "INVALID_INPUT" ? 400
    : result.code === "UNAUTHORIZED" ? 401
      : result.code === "NOT_FOUND" ? 404
        : result.code === "RATE_LIMITED" ? 429
          : 409;
  return Response.json(result, { status });
}

export function pageSessionIdFrom(request: Request): string | null {
  const value = request.headers.get("X-Ratiflow-Page-Session");
  return value && UUID_PATTERN.test(value) ? value : null;
}

export function idempotencyKeyFrom(request: Request): string | null {
  const value = request.headers.get("Idempotency-Key");
  return value && UUID_PATTERN.test(value) ? value : null;
}
