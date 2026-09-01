import {
  DOCUMENT_MEMBER_DISPLAY_NAME_MAX_LENGTH,
  type LaunchDocumentV3Input,
} from "@/document/contracts";
import { jsonObject } from "@/domain/http-session";
import { createCompletedDocumentWorkspaceExample } from "@/domain/document-workspace-example";
import { getRuntimeDocumentWorkspaceService } from "@/domain/document-workspace-runtime";
import { documentV3Response, invalidDocumentV3Request } from "../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const hasNoBody = request.body === null;
  const body = await jsonObject(request);
  if (!body && !hasNoBody) {
    return documentV3Response(invalidDocumentV3Request("Malformed example request."));
  }
  const input = body ?? {};
  const keys = Object.keys(input);
  const displayName = input.displayName;
  if (
    keys.some((key) => key !== "displayName") ||
    (displayName !== undefined &&
      (typeof displayName !== "string" ||
        displayName.trim().length === 0 ||
        Array.from(displayName).length > DOCUMENT_MEMBER_DISPLAY_NAME_MAX_LENGTH))
  ) {
    return documentV3Response(invalidDocumentV3Request("The example request is invalid."));
  }
  const result = await createCompletedDocumentWorkspaceExample(
    getRuntimeDocumentWorkspaceService(),
    input as LaunchDocumentV3Input,
    request.signal,
  );
  return documentV3Response(result, 201);
}
