import { launchRatiflowDemo } from "@/domain/ratiflow-runtime";

export const dynamic = "force-dynamic";

/** Starts an isolated deterministic demo clone and returns its opaque role memberships. */
export async function POST(request: Request) {
  return Response.json(await launchRatiflowDemo(request.signal));
}
