import { sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRepositoryService } from "@/domain/repository-runtime";
import { repositoryResponse } from "../_response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await getRuntimeRepositoryService().inspect(
    sessionTokenFrom(request) ?? "",
    request.signal,
  );
  return repositoryResponse(result);
}
