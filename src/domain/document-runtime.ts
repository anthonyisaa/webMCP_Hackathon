import type { DocumentServicePort } from "@/document/contracts";
import { getLocalDocumentService } from "@/domain/document-service";
import { SupabaseDocumentService } from "@/domain/supabase";

/**
 * Keeps one local document service alive across route-handler calls. The persistence
 * adapter can replace this selection without changing the document API or UI ports.
 */
export function getRuntimeDocumentService(
  environment: NodeJS.ProcessEnv = process.env,
): DocumentServicePort {
  return SupabaseDocumentService.fromEnvironment(environment) ?? getLocalDocumentService();
}
