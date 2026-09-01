import { describe, expect, it } from "vitest";

import { LocalRepositoryService } from "./repository-service";
import {
  getRuntimeRepositoryEvaluationService,
  getRuntimeRepositoryService,
} from "./repository-runtime";
import { SupabaseRepositoryService } from "./supabase/repository-supabase-service";

describe("repository runtime", () => {
  it("reuses one process-local service for API and evaluation ports", () => {
    const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    const first = getRuntimeRepositoryService(environment);
    const second = getRuntimeRepositoryService(environment);
    const evaluation = getRuntimeRepositoryEvaluationService(environment);

    expect(first).toBeInstanceOf(LocalRepositoryService);
    expect(second).toBe(first);
    expect(evaluation).toBe(first);
  });

  it("selects Supabase when the public connection is configured", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      RATIFLOW_SUPABASE_URL: "https://example.supabase.co",
      RATIFLOW_SUPABASE_PUBLISHABLE_KEY: "sb_publishable",
      RATIFLOW_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    };

    expect(getRuntimeRepositoryService(environment)).toBeInstanceOf(
      SupabaseRepositoryService,
    );
    expect(getRuntimeRepositoryEvaluationService(environment)).toBeInstanceOf(
      SupabaseRepositoryService,
    );
  });
});
