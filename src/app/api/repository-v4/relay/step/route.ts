import { OpenAILunaResponsesProvider } from "@/agent-relay/server/luna-responses-provider";
import { BoundedLunaRelayStepper } from "@/agent-relay/server/relay-stepper";
import { relayFailure } from "@/agent-relay/server/safety";
import { getRuntimeRepositoryRelayService } from "@/domain/repository-runtime";
import {
  handleRelayStepRequest,
  type RelayStepExecutor,
} from "./handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const executor = await runtimeRelayStepExecutor();
  if (!executor) {
    return Response.json(relayFailure(
      "RELAY_UNAVAILABLE",
      "The durable managed Relay authority is unavailable.",
      false,
    ), { status: 503 });
  }
  return handleRelayStepRequest(request, executor);
}

async function runtimeRelayStepExecutor(): Promise<RelayStepExecutor | null> {
  try {
    return new BoundedLunaRelayStepper({
      authority: getRuntimeRepositoryRelayService(),
      provider: new OpenAILunaResponsesProvider(),
    });
  } catch {
    return null;
  }
}
