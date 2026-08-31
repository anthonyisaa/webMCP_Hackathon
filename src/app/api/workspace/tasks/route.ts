import { handleCreateTask } from "@/app/api/workspace/_human-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateTask(request);
}
