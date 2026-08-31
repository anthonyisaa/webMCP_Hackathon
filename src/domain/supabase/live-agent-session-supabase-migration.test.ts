import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831153213_live_agent_session_persistence.sql"),
  "utf8",
);
const touchRepairMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260831171049_disambiguate_agent_session_touch.sql",
  ),
  "utf8",
);
const taskViewRepairMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260831173240_preserve_null_task_claim.sql",
  ),
  "utf8",
);
const identityRepairMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260831174501_normalize_agent_display_name.sql",
  ),
  "utf8",
);

describe("live agent-session Supabase migration", () => {
  it("uses opaque UUID cursors backed by a workspace-local monotonic sequence", () => {
    expect(migration).toContain("create table public.ratiflow_activity_sequences");
    expect(migration).toContain("last_sequence = last_sequence + 1");
    expect(migration).toContain("cursor uuid not null default extensions.gen_random_uuid()");
    expect(migration).toContain("unique (cursor)");
    expect(migration).toContain("'Workspace activity initialized.'");
    expect(migration).toContain("limit 50");
    expect(migration).toContain("'observedHighWater', v_high_cursor::text");
    expect(migration).toContain("'hasMore', v_boundary_sequence < v_high_sequence");
  });

  it("binds renewable page leases to an authenticated agent handle", () => {
    expect(migration).toContain("create table public.ratiflow_agent_page_sessions");
    expect(migration).toContain("now() + interval '45 seconds'");
    expect(migration).toContain("now() + interval '2 minutes'");
    expect(migration).toContain("ratiflow_private.ratiflow_member_for_handle(p_handle)");
    expect(migration).toContain("and x.caller = p_caller");
    expect(migration).toContain("set revoked_at = now(), lease_expires_at = now()");
    expect(migration).toContain("ratiflow_private.ratiflow_has_live_browser");
    expect(migration).toContain("'LIVE_SESSION_ACTIVE'");
  });

  it("fences inbox work with atomic claim generations and exactly-once writes", () => {
    expect(migration).toContain("create table public.ratiflow_agent_tasks");
    expect(migration).toContain("v_new_claim := extensions.gen_random_uuid()");
    expect(migration).toContain("claim_expires_at = now() + interval '90 seconds'");
    expect(migration).toContain("for update");
    expect(migration).toContain("'TASK_ALREADY_CLAIMED'");
    expect(migration).toContain("'CLAIM_LOST'");
    expect(migration).toContain("ratiflow_coordination_replay");
    expect(migration).toContain("'REQUEST_REPLAY_MISMATCH'");
  });

  it("persists standing instructions, human questions, and a server action budget", () => {
    expect(migration).toContain("create table public.ratiflow_standing_instructions");
    expect(migration).toContain("create table public.ratiflow_human_input_requests");
    expect(migration).toContain("create table public.ratiflow_auto_action_windows");
    expect(migration).toContain("ratiflow_private.ratiflow_consume_auto_action");
    expect(migration).toContain("'ACTION_BUDGET_EXCEEDED'");
    expect(migration).toContain("'TASK_WAITING_HUMAN'");
    expect(migration).toContain("'HUMAN_INPUT_ANSWERED'");
  });

  it("appends activity atomically with decision provenance and exposes cursor notices", () => {
    const commitStart = migration.indexOf("create or replace function ratiflow_private.ratiflow_commit(");
    const commitEnd = migration.indexOf("create or replace function public.ratiflow_agent_mutate(");
    const commit = migration.slice(commitStart, commitEnd);
    expect(commit).toContain("insert into public.ratiflow_events");
    expect(commit).toContain("insert into public.ratiflow_revision_notices");
    expect(commit).toContain("ratiflow_private.ratiflow_append_activity");
    expect(commit).toContain("v_origin::public.ratiflow_event_origin");
    expect(migration).toContain("returns table (\n  activity_cursor text,\n  workspace_revision integer,\n  event_id text");
  });

  it("keeps every table behind RLS and grants only fixed RPCs", () => {
    const tables = [
      "ratiflow_activity_sequences",
      "ratiflow_activity",
      "ratiflow_agent_page_sessions",
      "ratiflow_agent_status",
      "ratiflow_standing_instructions",
      "ratiflow_agent_tasks",
      "ratiflow_agent_comments",
      "ratiflow_human_input_requests",
      "ratiflow_auto_action_windows",
    ];
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated;`);
    }
    expect(migration).toContain("revoke all on function public.ratiflow_mutate_webmcp");
    expect(migration).toContain("grant execute on function public.ratiflow_agent_mutate");
    expect(migration).toContain("grant execute on function public.ratiflow_human_create_agent_task");
    expect(migration).not.toMatch(/realtime\.|alter\s+publication/i);
  });

  it("keeps page-session renewal strict while disambiguating its conflict target", () => {
    expect(touchRepairMigration).toContain(
      "create or replace function ratiflow_private.ratiflow_touch_agent_session",
    );
    expect(touchRepairMigration).toContain(
      "on conflict on constraint ratiflow_agent_status_pkey do update",
    );
    expect(touchRepairMigration).not.toContain("on conflict (workspace_id)");
    expect(touchRepairMigration).toContain(
      "set search_path = pg_catalog, ratiflow_private, public, extensions",
    );
  });

  it("preserves required task claim members while hiding the opaque claim id", () => {
    expect(taskViewRepairMigration).toContain(
      "create or replace function ratiflow_private.ratiflow_task_view",
    );
    expect(taskViewRepairMigration).toContain("select jsonb_build_object(");
    expect(taskViewRepairMigration).toContain("'claim', case");
    expect(taskViewRepairMigration).toContain(
      "'ownedByCurrentSession', coalesce(",
    );
    expect(taskViewRepairMigration).toContain(
      ") || jsonb_strip_nulls(jsonb_build_object(\n    'resultSummary'",
    );
    expect(taskViewRepairMigration).toContain(
      "set search_path = pg_catalog, ratiflow_private, public, extensions",
    );
  });

  it("normalizes the fixed agent identity for existing and future launches", () => {
    expect(identityRepairMigration).toContain(
      "create trigger ratiflow_normalize_agent_display_name_before_write",
    );
    expect(identityRepairMigration).toContain(
      "new.display_name := 'Ratiflow Agent'",
    );
    expect(identityRepairMigration).toContain(
      "update public.ratiflow_members\nset display_name = 'Ratiflow Agent'",
    );
    expect(identityRepairMigration).toContain(
      "revoke all on function ratiflow_private.ratiflow_normalize_agent_display_name()",
    );
  });
});
