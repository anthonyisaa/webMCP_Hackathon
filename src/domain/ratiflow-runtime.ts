import type { RatiflowServicePort, WorkspaceView } from "@/contracts";
import { getRatiflowService as getLocalRatiflowService } from "@/domain/ratiflow-service";
import { SupabaseRatiflowService } from "@/domain/supabase";

export type RatiflowDemoLaunch = {
  workspace: WorkspaceView;
  mayaSessionToken: string;
  jordanSessionToken: string;
  agentSessionToken: string;
  expiresAt?: string;
};

/**
 * Resolves the stateless Supabase adapter when its complete public configuration is
 * present. Local development keeps one in-memory service so issued demo handles remain
 * valid across route-handler calls.
 */
export function getRuntimeRatiflowService(
  environment: NodeJS.ProcessEnv = process.env,
): RatiflowServicePort {
  return SupabaseRatiflowService.fromEnvironment(environment) ?? getLocalRatiflowService();
}

/** Creates one isolated demo using the launch primitive owned by the active backend. */
export async function launchRatiflowDemo(
  signal?: AbortSignal,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<RatiflowDemoLaunch> {
  const supabaseService = SupabaseRatiflowService.fromEnvironment(environment);
  if (supabaseService) return supabaseService.launchDemo(signal);

  const localService = getLocalRatiflowService();
  const sessions = localService.issueDemoSessions();
  return {
    workspace: await localService.inspect(sessions.mayaSessionToken, signal),
    ...sessions,
  };
}
