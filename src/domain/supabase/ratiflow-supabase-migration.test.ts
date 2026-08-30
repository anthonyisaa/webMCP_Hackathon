import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260830190000_ratiflow_rpc_boundary.sql"),
  "utf8",
);

describe("ratiflow Supabase RPC boundary migration", () => {
  it("keeps all public writes behind fixed-search-path RPCs", () => {
    expect(migration).toContain("create or replace function public.ratiflow_mutate_webmcp");
    expect(migration).toContain("create or replace function public.ratiflow_set_launch_capacity");
    expect(migration).toContain("create or replace function public.ratiflow_ratify_human");
    expect(migration).toContain("security definer set search_path = pg_catalog, ratiflow_private, public, extensions");
    expect(migration).toContain("revoke all on all functions in schema public from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.ratiflow_launch_demo(integer)");
  });

  it("uses expiring hashed handles and notice-only authorization without Realtime schema changes", () => {
    expect(migration).toContain("handle_hash=extensions.digest(p_handle,'sha256')");
    expect(migration).toContain("s.expires_at>now()");
    expect(migration).toContain("create or replace function public.ratiflow_workspace_notice");
    expect(migration).not.toMatch(/alter\s+publication|realtime\./i);
  });

  it("contains atomic revision, replay, and append-only event safeguards", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("REQUEST_REPLAY_MISMATCH");
    expect(migration).toContain("ratiflow_private.ratiflow_stale");
    expect(migration).toContain("insert into public.ratiflow_events");
    expect(migration).toContain("Only Maya Chen can ratify through the ordinary UI.");
  });

  it("locks audited validation and DTO parity rules into the SQL boundary", () => {
    expect(migration).toContain("ratiflow_valid_evidence_metrics");
    expect(migration).toContain("ratiflow_valid_risks");
    expect(migration).toContain("ratiflow_unauthorized");
    expect(migration).toContain("The committed decision cannot be changed.");
    expect(migration).toContain("'id', case when w.id like 'ws_northstar_csv_launch_%' then 'ws_northstar_csv_launch'");
    expect(migration).toContain("when 'opt_csv_ga_oct15' then 1 when 'opt_csv_beta_oct15' then 2");
    expect(migration).toContain("ratiflow_capabilities(w.id,p_selection,p_epoch) - 'signature'");
    expect(migration).toContain("demo_launch_rate_windows");
    expect(migration).toContain("when p_member.actor_type = 'AGENT' then 'Agent'");
  });

  it("has one executable human RPC definition and rejects unsafe tool-name/input forms", () => {
    const executableSql = migration.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(executableSql.match(/create or replace function public\.ratiflow_set_launch_capacity/g)).toHaveLength(1);
    expect(executableSql.match(/create or replace function public\.ratiflow_ratify_human/g)).toHaveLength(1);
    expect(executableSql).toContain("ratiflow_valid_nonnegative_integer");
    expect(executableSql).toContain("p_tool_name is null or char_length(btrim(p_tool_name)) = 0");
  });
});
