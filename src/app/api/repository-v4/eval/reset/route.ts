import { timingSafeEqual } from "node:crypto";

import { getRuntimeRepositoryEvaluationService } from "@/domain/repository-runtime";
import { repositoryResponse } from "../../_response";

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
  return repositoryResponse(
    await getRuntimeRepositoryEvaluationService().resetPostmortemHero(request.signal),
    201,
  );
}
