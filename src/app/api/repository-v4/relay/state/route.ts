import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryRelayService } from "@/domain/repository-runtime";
import { relayResponse } from "../../_response";
import { rejectIncompatibleRelayContract } from "../_request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const incompatible = rejectIncompatibleRelayContract(request);
  if (incompatible) return incompatible;
  return relayResponse(await getRuntimeRepositoryRelayService().readRelayState(
    sessionTokenFrom(request) ?? "",
    request.signal,
  ));
}
