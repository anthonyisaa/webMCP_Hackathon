import { describe, expect, it } from "vitest";

import { LocalRatiflowService } from "./ratiflow-service";
import { getRuntimeRatiflowService, launchRatiflowDemo } from "./ratiflow-runtime";
import { SupabaseRatiflowService } from "./supabase";

describe("Ratiflow runtime provider", () => {
  it("keeps the isolated in-memory backend when cloud configuration is incomplete", () => {
    expect(getRuntimeRatiflowService({ NODE_ENV: "test" })).toBeInstanceOf(LocalRatiflowService);
    expect(getRuntimeRatiflowService({ NODE_ENV: "test", RATIFLOW_SUPABASE_URL: "https://example.supabase.co" })).toBeInstanceOf(LocalRatiflowService);
  });

  it("selects Supabase only when both public server-side values are present", () => {
    const service = getRuntimeRatiflowService({
      NODE_ENV: "test",
      RATIFLOW_SUPABASE_URL: "https://example.supabase.co",
      RATIFLOW_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    });

    expect(service).toBeInstanceOf(SupabaseRatiflowService);
  });

  it("normalizes the synchronous local launch into the async runtime shape", async () => {
    const launch = await launchRatiflowDemo(undefined, { NODE_ENV: "test" });

    expect(launch.workspace.revision).toBe(7);
    expect(launch.mayaSessionToken).toBeTruthy();
    expect(launch.jordanSessionToken).toBeTruthy();
    expect(launch.agentSessionToken).toBeTruthy();
  });
});
