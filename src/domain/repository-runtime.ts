import type {
  RepositoryEvaluationPort,
  RepositoryServicePort,
} from "@/repository/contracts";
import { LocalRepositoryService } from "@/domain/repository-service";
import { SupabaseRepositoryService } from "@/domain/supabase/repository-supabase-service";

type RuntimeRepositoryService = RepositoryServicePort & RepositoryEvaluationPort;

let localRepositoryService: LocalRepositoryService | undefined;

function selectRuntimeRepositoryService(
  environment: NodeJS.ProcessEnv,
): RuntimeRepositoryService {
  return SupabaseRepositoryService.fromEnvironment(environment)
    ?? (localRepositoryService ??= new LocalRepositoryService());
}

/** Uses deployed persistence when configured and one process-local service otherwise. */
export function getRuntimeRepositoryService(
  environment: NodeJS.ProcessEnv = process.env,
): RepositoryServicePort {
  return selectRuntimeRepositoryService(environment);
}

/** Keeps the protected fixture reset on the same persistence boundary as the public API. */
export function getRuntimeRepositoryEvaluationService(
  environment: NodeJS.ProcessEnv = process.env,
): RepositoryEvaluationPort {
  return selectRuntimeRepositoryService(environment);
}
