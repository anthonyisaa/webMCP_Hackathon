import type { DocumentV3ServicePort } from "@/document/contracts";
import { LocalDocumentWorkspaceService } from "@/domain/document-workspace-service";
import { SupabaseDocumentWorkspaceService } from "@/domain/supabase";

let localWorkspaceService: LocalDocumentWorkspaceService | undefined;

/** Uses deployed persistence when configured and one process-local service otherwise. */
export function getRuntimeDocumentWorkspaceService(
  environment: NodeJS.ProcessEnv = process.env,
): DocumentV3ServicePort {
  return SupabaseDocumentWorkspaceService.fromEnvironment(environment)
    ?? (localWorkspaceService ??= new LocalDocumentWorkspaceService());
}
