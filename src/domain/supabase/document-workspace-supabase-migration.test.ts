import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260901012216_document_workspace_v3.sql",
), "utf8");

const optionalDecisionNotesMigration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260901121107_optional_document_decision_notes.sql",
), "utf8");

describe("document workspace v3 additive migration", () => {
  it("adds protocol/counters and exactly the two frozen persistence tables", () => {
    expect(migration).toContain("add column protocol_version smallint not null default 2");
    expect(migration).toContain("add column activity_version bigint not null default 0");
    expect(migration).toContain("alter column revision type bigint");
    expect(migration.match(/create table public\.ratiflow_document_(?:work_orders|events)/g)).toHaveLength(2);
    expect(migration).toContain("create table public.ratiflow_document_work_orders");
    expect(migration).toContain("create table public.ratiflow_document_events");
    expect(migration).not.toMatch(/drop table|truncate table/i);
  });

  it("defines only the exact 13 v3 RPC names and no wait RPC", () => {
    const names = [
      "ratiflow_launch_document_v3",
      "ratiflow_join_document_v3",
      "ratiflow_inspect_document_v3",
      "ratiflow_save_document_v3",
      "ratiflow_touch_document_presence_v3",
      "ratiflow_create_document_work_v3",
      "ratiflow_cancel_document_work_v3",
      "ratiflow_accept_document_proposal_v3",
      "ratiflow_reject_document_proposal_v3",
      "ratiflow_read_document_memory_v3",
      "ratiflow_list_agent_work_v3",
      "ratiflow_submit_document_proposal_v3",
      "ratiflow_reset_document_hero_v3",
    ];
    for (const name of names) {
      expect(migration).toContain(`function public.${name}`);
    }
    expect(migration).not.toMatch(/function public\.\w*wait\w*_v3/i);
  });

  it("keeps secrets hashed and derives actor/document/member at the RPC boundary", () => {
    expect(migration).toContain("extensions.digest(v_share_token, 'sha256')");
    expect(migration).toContain("extensions.digest(v_human_token, 'sha256')");
    expect(migration).toContain("extensions.digest(v_agent_token, 'sha256')");
    expect(migration).toContain("member_for_handle_v3(p_handle)");
    expect(migration).not.toMatch(/p_input->>'(?:actorType|origin|documentId|creatorMemberId)'/);
    expect(migration).toContain("assigned_to_member_id = v_member.member_id");
    expect(migration).toContain("creator_member_id <> v_member.member_id");
  });

  it("locks document first, fingerprints replay identity, and compounds counters/events", () => {
    expect(migration.match(/from public\.ratiflow_documents[\s\S]{0,100}for update;/g)?.length)
      .toBeGreaterThanOrEqual(6);
    expect(migration).toContain("request_fingerprint_v3");
    for (const operation of [
      "SAVE_DOCUMENT_V3",
      "CREATE_DOCUMENT_WORK_V3",
      "CANCEL_DOCUMENT_WORK_V3",
      "SUBMIT_DOCUMENT_PROPOSAL_V3",
      "ACCEPT_DOCUMENT_PROPOSAL_V3",
      "REJECT_DOCUMENT_PROPOSAL_V3",
    ]) expect(migration).toContain(`'${operation}'`);
    expect(migration).toContain("REQUEST_REPLAY_MISMATCH");
    expect(migration).toContain("revision = v_next_revision, activity_version = v_activity");
    expect(migration).toContain("'PROPOSAL_ACCEPTED'");
    expect(migration).toContain("linked_work_order_ids");
  });

  it("enforces immutable assignment, active capacity, Unicode rebasing, and bounded memory", () => {
    expect(migration).toContain("immutable_work_identity_v3");
    expect(migration).toContain("assigned_to_member_id is distinct from old.assigned_to_member_id");
    expect(migration).toContain("status in ('PENDING', 'PROPOSED')");
    expect(migration).toContain("v_document_active >= 100 or v_assignee_active >= 50");
    expect(migration).toContain("char_length/substring count Unicode characters");
    expect(migration).toContain("v_end <= v_prefix");
    expect(migration).toContain("v_start >= v_splice_end");
    expect(migration).toContain("set status = 'STALE'");
    expect(migration).toContain("order by e.activity_version desc limit v_limit + 1");
    expect(migration).toContain("order by s.activity_version");
  });

  it("rejects safe JavaScript counters before narrowing presence and work ranges to integer", () => {
    expect(migration).toContain("safe_integer_counter_v3(p_value jsonb)");
    expect(migration).toContain("(p_value #>> '{}')::numeric <= 2147483647");
    for (const key of ["selectionStart", "selectionEnd", "rangeStart", "rangeEnd"]) {
      expect(migration).toContain(`safe_integer_counter_v3(p_input->'${key}')`);
    }
    expect(migration).toContain("(p_input->>'observedRevision')::bigint");
    expect(migration).not.toContain("(p_input->>'observedRevision')::integer");
  });

  it("rejects null and non-string enum inputs before testing their allowed values", () => {
    for (const key of ["state", "source", "intent", "targetField"]) {
      const typeGuard = `jsonb_typeof(p_input->'${key}') is distinct from 'string'`;
      const guardIndex = migration.indexOf(typeGuard);
      const enumIndex = migration.indexOf(`p_input->>'${key}' not in`, guardIndex);
      expect(guardIndex).toBeGreaterThan(-1);
      expect(enumIndex).toBeGreaterThan(guardIndex);
    }
  });

  it("stages arbitrary memory-window JSON before every numeric cast", () => {
    const start = migration.indexOf(
      "create or replace function public.ratiflow_read_document_memory_v3(",
    );
    const end = migration.indexOf("\n$$;", start);
    const body = migration.slice(start, end);
    expect(body).toContain("safe_counter_between_v3(\n        p_input->'beforeActivityVersion', 1, 9007199254740991");
    expect(body).toContain("safe_counter_between_v3(p_input->'limit', 1, 50)");
    expect(body).not.toMatch(/\(p_input->>'(?:beforeActivityVersion|limit)'\)::numeric/);
    expect(migration).toContain("when not ratiflow_document_private.safe_counter_v3(p_value) then false");
  });

  it("uses the ECMAScript trim set for every v3 nonblank input", () => {
    expect(migration).toContain("trim_ecmascript_v3(p_value text)");
    expect(migration).toContain("\\0009\\000A\\000B\\000C\\000D\\0020");
    expect(migration).toContain("\\00A0\\1680\\2000");
    expect(migration).toContain("\\2028\\2029\\202F\\205F\\3000\\FEFF");
    for (const [key, maximum] of [
      ["displayName", 80],
      ["instruction", 500],
      ["changeSummary", 240],
      ["rationale", 500],
    ] as const) {
      expect(migration).toContain(`nonblank_text_v3(p_input->'${key}', ${maximum})`);
    }
    expect(migration).not.toMatch(
      /btrim\(p_input->>'(?:displayName|instruction|changeSummary|rationale)'\)/,
    );
    expect(migration).not.toMatch(/char_length\(btrim\(/);
  });

  it("keeps anonymous launch and join rate limits non-retryable", () => {
    expect(migration).toContain(
      "'RATE_LIMITED', 'Too many notes were created at once.', false,",
    );
    expect(migration).toContain(
      "error_v3('RATE_LIMITED', 'Too many people joined at once.', false)",
    );
  });

  it("fences both legacy join entrypoints before they can mint v3 sessions", () => {
    expect(migration).toContain(
      "alter function public.ratiflow_document_join(text, jsonb)\n  rename to ratiflow_document_join_v1_legacy;",
    );
    expect(migration).toContain(
      "alter function public.ratiflow_document_join_v2(text, jsonb)\n  rename to ratiflow_document_join_v2_legacy;",
    );
    for (const [entrypoint, legacy] of [
      ["ratiflow_document_join", "ratiflow_document_join_v1_legacy"],
      ["ratiflow_document_join_v2", "ratiflow_document_join_v2_legacy"],
    ] as const) {
      const start = migration.indexOf(`create or replace function public.${entrypoint}(`);
      const end = migration.indexOf("\n$$;", start);
      const body = migration.slice(start, end);
      const fence = body.indexOf("if v_protocol = 3 then");
      const delegate = body.indexOf(`return public.${legacy}(p_share_token, p_input);`);
      expect(fence).toBeGreaterThan(-1);
      expect(body.indexOf("'PROTOCOL_MISMATCH'", fence)).toBeGreaterThan(fence);
      expect(delegate).toBeGreaterThan(fence);
      expect(body).not.toContain("insert into ratiflow_document_private.sessions");
      expect(migration).toContain(
        `revoke all on function public.${legacy}(text, jsonb)\n  from public, anon, authenticated;`,
      );
    }
    expect(migration).toContain("and d.protocol_version = 3");
  });

  it("retains v2 behind a protocol fence and makes reset service-role-only", () => {
    expect(migration).toContain("and d.protocol_version = 2");
    expect(migration).toContain("and d.protocol_version = 3");
    expect(migration).toContain("ratiflow_document_apply_agent_annotation_v2_legacy");
    expect(migration).toContain("'PROTOCOL_MISMATCH'");
    expect(migration).toContain("revoke all on function public.ratiflow_reset_document_hero_v3() from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.ratiflow_reset_document_hero_v3() to service_role;");
    expect(migration).toContain("#ratiflow-bootstrap=%s");
    expect(migration).not.toMatch(/raise\s+(?:notice|log|warning).*token/i);
  });

  it("uses RLS, direct-table revokes, partial indexes, and named RPC grants", () => {
    for (const table of ["ratiflow_document_work_orders", "ratiflow_document_events"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated;`);
    }
    expect(migration).not.toMatch(/create\s+policy/i);
    expect(migration).toContain("ratiflow_document_work_assignee_pending_idx");
    expect(migration).toContain("where status = 'PENDING'");
    expect(migration).toContain("ratiflow_document_work_terminal_idx");
    expect(migration).toContain("ratiflow_document_events_memory_idx");
    expect(migration).toContain("to anon, authenticated;");
  });
});

describe("optional document decision notes additive migration", () => {
  it("keeps the exact rationale key while accepting only JSON null or bounded nonblank text", () => {
    expect(optionalDecisionNotesMigration).toContain(
      "p_input, array['workOrderId', 'expectedRevision', 'requestId', 'rationale']",
    );
    expect(optionalDecisionNotesMigration).toContain(
      "p_input ?& array['workOrderId', 'expectedRevision', 'requestId', 'rationale']",
    );
    expect(optionalDecisionNotesMigration).toContain(
      "jsonb_typeof(p_input->'rationale') is distinct from 'null'",
    );
    expect(optionalDecisionNotesMigration).toContain(
      "nonblank_text_v3(p_input->'rationale', 500)",
    );
  });

  it("allows null only for terminal decision notes and preserves it in work and memory", () => {
    expect(optionalDecisionNotesMigration).toContain(
      "drop constraint ratiflow_document_work_decision_coherent",
    );
    const constraintStart = optionalDecisionNotesMigration.indexOf(
      "add constraint ratiflow_document_work_decision_coherent",
    );
    const functionStart = optionalDecisionNotesMigration.indexOf(
      "create or replace function ratiflow_document_private.decide_document_proposal_v3",
    );
    const constraint = optionalDecisionNotesMigration.slice(constraintStart, functionStart);
    expect(constraint).toContain("status = 'COMPLETED' and decision_kind = 'ACCEPTED'");
    expect(constraint).toContain("status = 'REJECTED' and decision_kind = 'REJECTED'");
    expect(constraint).not.toMatch(
      /status = '(?:COMPLETED|REJECTED)'[^;]*decision_rationale is not null/,
    );
    expect(constraint).toContain(
      "status in ('PENDING', 'PROPOSED', 'CANCELLED', 'STALE')",
    );
    expect(constraint).toContain("decision_kind is null and decision_rationale is null");
    expect(optionalDecisionNotesMigration.match(
      /decision_rationale = p_input->>'rationale'/g,
    )).toHaveLength(2);
    expect(optionalDecisionNotesMigration.match(/p_input->>'rationale'/g)).toHaveLength(4);
  });

  it("retains creator authority, row locks, replay identity, and terminal operation names", () => {
    expect(optionalDecisionNotesMigration).toContain(
      "v_work.creator_member_id <> v_member.member_id",
    );
    expect(optionalDecisionNotesMigration).toContain(
      "where id = v_member.document_id for update",
    );
    expect(optionalDecisionNotesMigration).toContain(
      "where document_id = v_document.id and work_order_id = v_work_id for update",
    );
    expect(optionalDecisionNotesMigration).toContain("request_fingerprint_v3(");
    expect(optionalDecisionNotesMigration).toContain("'ACCEPT_DOCUMENT_PROPOSAL_V3'");
    expect(optionalDecisionNotesMigration).toContain("'REJECT_DOCUMENT_PROPOSAL_V3'");
    expect(optionalDecisionNotesMigration).toContain("REQUEST_REPLAY_MISMATCH");
    expect(optionalDecisionNotesMigration).not.toMatch(/drop table|truncate table/i);
  });
});
