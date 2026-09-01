import { timingSafeEqual } from "node:crypto";

import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response } from "../../_response";

export const dynamic = "force-dynamic";

function authorized(request: Request, expected: string): boolean {
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expected = process.env.RATIFLOW_EVAL_RESET_TOKEN;
  if (process.env.VERCEL_ENV === "production" || !expected || !authorized(request, expected)) {
    return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  }
  const result = await getRuntimeDocumentWorkspaceService().resetHeroForEvaluation(
    request.signal,
  );
  return documentV3Response(result, 201);
}
