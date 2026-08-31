import { handleAgentAction } from "@/app/api/workspace/_agent-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handleAgentAction(request, "AUTO_RUNNER", (await params).action);
}
