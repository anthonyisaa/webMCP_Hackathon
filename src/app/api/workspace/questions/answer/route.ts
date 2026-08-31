import { handleAnswerQuestion } from "@/app/api/workspace/_human-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleAnswerQuestion(request);
}
