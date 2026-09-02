import type {
  RepositoryEvaluationPort,
  RepositoryServicePort,
} from "@/repository/contracts";
import { LocalRepositoryService } from "@/domain/repository-service";
import {
  createUnavailableRepositoryRelayService,
  type RepositoryRelayServicePort,
} from "@/domain/repository-relay-service";
import { SupabaseRepositoryService } from "@/domain/supabase/repository-supabase-service";
import { SupabaseRepositoryRelayService } from "@/domain/supabase/repository-supabase-relay-service";
import { createSpecialistFixturePort } from "@/agent-relay/fixtures";

type RuntimeRepositoryService = RepositoryServicePort & RepositoryEvaluationPort;

let localRepositoryService: LocalRepositoryService | undefined;
let unavailableRelayService: RepositoryRelayServicePort | undefined;

function getLocalRepositoryService(environment: NodeJS.ProcessEnv): LocalRepositoryService {
  return localRepositoryService ??= new LocalRepositoryService({
    relaySigningSecret: environment.RATIFLOW_RELAY_SIGNING_SECRET,
    specialistFixturePort: createSpecialistFixturePort(),
  });
}

function selectRuntimeRepositoryService(
  environment: NodeJS.ProcessEnv,
): RuntimeRepositoryService {
  return SupabaseRepositoryService.fromEnvironment(environment)
    ?? getLocalRepositoryService(environment);
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

/** Selects a durable Supabase sidecar in deployment and the shared local reference in dev. */
export function getRuntimeRepositoryRelayService(
  environment: NodeJS.ProcessEnv = process.env,
): RepositoryRelayServicePort {
  const persistentRepository = SupabaseRepositoryService.fromEnvironment(environment);
  if (persistentRepository) {
    return SupabaseRepositoryRelayService.fromEnvironment(
      environment,
      createSpecialistFixturePort(),
    ) ?? (unavailableRelayService ??= createUnavailableRepositoryRelayService());
  }
  return getLocalRepositoryService(environment).getRelayService();
}
