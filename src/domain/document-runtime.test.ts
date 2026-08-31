import { describe, expect, it } from "vitest";

import { getRuntimeDocumentService } from "./document-runtime";
import { LocalDocumentService } from "./document-service";
import { SupabaseDocumentService } from "./supabase";

describe("document runtime provider", () => {
  it("uses the in-memory service when cloud configuration is incomplete", () => {
    expect(getRuntimeDocumentService({ NODE_ENV: "test" })).toBeInstanceOf(LocalDocumentService);
    expect(getRuntimeDocumentService({
      NODE_ENV: "test",
      RATIFLOW_SUPABASE_URL: "https://example.supabase.co",
    })).toBeInstanceOf(LocalDocumentService);
  });

  it("selects Supabase only when both server-side public values are present", () => {
    expect(getRuntimeDocumentService({
      NODE_ENV: "test",
      RATIFLOW_SUPABASE_URL: "https://example.supabase.co",
      RATIFLOW_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    })).toBeInstanceOf(SupabaseDocumentService);
  });
});
