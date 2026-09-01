import type {
  SubmitWorkProposalServiceInput,
  SubmitWorkProposalToolInput,
} from "@/document/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import {
  documentV3Response,
  idempotencyKeyFrom,
  invalidDocumentV3Request,
  pageSessionIdFrom,
} from "../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonObject(request);
  const pageSessionId = pageSessionIdFrom(request);
  const requestId = idempotencyKeyFrom(request);
  if (!body || !pageSessionId || !requestId) {
    return documentV3Response(
      invalidDocumentV3Request("Agent proposal requires valid page and idempotency headers."),
    );
  }
  const input: SubmitWorkProposalServiceInput = {
    ...(body as unknown as SubmitWorkProposalToolInput),
    requestId,
  };
  const result = await getRuntimeDocumentWorkspaceService().submitWorkProposal(
    sessionTokenFrom(request) ?? "",
    input,
    pageSessionId,
    request.signal,
  );
  return documentV3Response(result);
}
