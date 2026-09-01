import { describe, expect, it } from "vitest";

import { LocalDocumentWorkspaceService } from "./document-workspace-service";
import { getRuntimeDocumentWorkspaceService } from "./document-workspace-runtime";
import { SupabaseDocumentWorkspaceService } from "./supabase";

describe("document workspace runtime", () => {
  it("reuses the process-local fallback when persistence is not configured", () => {
    const first = getRuntimeDocumentWorkspaceService({ NODE_ENV: "test" });
    const second = getRuntimeDocumentWorkspaceService({ NODE_ENV: "test" });
    expect(first).toBeInstanceOf(LocalDocumentWorkspaceService);
    expect(second).toBe(first);
  });

  it("selects the v3 Supabase adapter when its public connection is configured", () => {
    const service = getRuntimeDocumentWorkspaceService({
      NODE_ENV: "test",
      RATIFLOW_SUPABASE_URL: "https://example.supabase.co",
      RATIFLOW_SUPABASE_PUBLISHABLE_KEY: "sb_publishable",
    });
    expect(service).toBeInstanceOf(SupabaseDocumentWorkspaceService);
  });
});
