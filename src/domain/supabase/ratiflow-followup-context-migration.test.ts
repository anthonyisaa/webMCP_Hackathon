import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260830201915_derive_followup_context.sql"),
  "utf8",
);

describe("ratiflow follow-up context migration", () => {
  it("derives the follow-up from the prepared option, live capacity, and an actual capacity event", () => {
    expect(migration).toContain("create or replace function ratiflow_private.ratiflow_followup_context");
    expect(migration).toContain("p_option_id text");
    expect(migration).toContain("public.ratiflow_events");
    expect(migration).toContain("decision.launchCapacityEngineerDays");
    expect(migration).toContain("Launch capacity is %s engineer-days");
    expect(migration).toContain("ratiflow_private.ratiflow_followup_context(w.id,prepared.option_id)");
  });

  it("keeps the private helper inaccessible and the human RPC on a fixed search path", () => {
    expect(migration).toContain("revoke all on function ratiflow_private.ratiflow_followup_context(text, text) from public, anon, authenticated;");
    expect(migration).toContain("security definer set search_path = pg_catalog, ratiflow_private, public, extensions");
  });
});
