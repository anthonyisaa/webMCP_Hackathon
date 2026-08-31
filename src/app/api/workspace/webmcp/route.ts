import { handleAgentMutation } from "@/app/api/workspace/_agent-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleAgentMutation(request, "BROWSER_AGENT");
}
