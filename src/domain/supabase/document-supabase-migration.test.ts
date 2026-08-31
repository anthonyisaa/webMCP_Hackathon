import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260831022122_shared_document_persistence.sql",
  ),
  "utf8",
);

const annotationQueueMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260831123754_document_annotation_queue.sql",
  ),
  "utf8",
);

describe("shared document Supabase migration", () => {
  it("keeps the already-applied migration byte-for-byte untouched", () => {
    expect(createHash("sha256").update(migration).digest("hex")).toBe(
      "1849812457cbb052f5123c65816342099d5170091b35fac0da841494de2f8877",
    );
  });
  it("keeps bearer secrets hashed behind the RPC boundary", () => {
    expect(migration).toContain("share_token_hash bytea not null unique");
    expect(migration).toContain("handle_hash bytea primary key");
    expect(migration).toContain("extensions.digest(v_share_token, 'sha256')");
    expect(migration).toContain("extensions.digest(v_human_token, 'sha256')");
    expect(migration).toContain("extensions.digest(v_agent_token, 'sha256')");
    expect(migration).not.toMatch(/create table[\s\S]*?\bshare_token\s+text/i);
    expect(migration).not.toMatch(/create table[\s\S]*?\bsession_token\s+text/i);
  });

  it("enables RLS with no table policies and grants only named RPCs", () => {
    for (const table of [
      "ratiflow_documents",
      "ratiflow_document_members",
      "ratiflow_document_presence",
      "ratiflow_document_actions",
      "ratiflow_document_request_ledger",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated;`);
    }
    expect(migration).not.toMatch(/create\s+policy/i);
    expect(migration).not.toContain("revoke all on all functions in schema public");
    expect(migration).toContain("grant execute on function public.ratiflow_document_launch(jsonb)");
    expect(migration).toContain("to anon, authenticated;");
  });

  it("uses document-row CAS locks and one idempotency ledger", () => {
    expect(migration).toContain("create table public.ratiflow_document_request_ledger");
    expect(migration).toContain("primary key (document_id, request_id)");
    expect(migration).toContain("request_fingerprint('SAVE_HUMAN', p_input)");
    expect(migration).toContain("request_fingerprint('SET_STAGE', p_input)");
    expect(migration).toMatch(
      /request_fingerprint\(\s*'CREATE_ACTION',\s*v_normalized_input\s*\)/,
    );
    expect(migration).toMatch(
      /request_fingerprint\(\s*'APPLY_AGENT_EDIT',\s*v_normalized_input\s*\)/,
    );
    expect(migration).toContain("request_fingerprint('UNDO_AGENT_EDIT', p_input)");
    expect(migration).toContain("for update;");
    expect(migration).toContain("v_expected_revision <> v_document.revision");
    expect(migration).toContain("REQUEST_REPLAY_MISMATCH");
  });

  it("enforces the human/agent split and a single anchored pending action", () => {
    expect(migration).toContain("where status = 'PENDING';");
    expect(migration).toContain("ratiflow_document_one_pending_action_idx");
    expect(migration).toContain("v_member.actor_type <> 'HUMAN'");
    expect(migration).toContain("v_member.actor_type <> 'AGENT'");
    expect(migration).toContain("last_editor_origin = 'WEBMCP'");
    expect(migration).toContain("v_action.base_revision <> v_document.revision");
    expect(migration).toContain("v_action.stage <> v_document.stage");
    expect(migration).toContain("v_current_target <> v_action.selected_text");
  });

  it("keeps presence advisory, expiring, and indexed", () => {
    expect(migration).toContain("p.last_seen_at > now() - interval '15 seconds'");
    expect(migration).toContain("ratiflow_document_presence_active_idx");
    expect(migration).toContain("ratiflow_document_sessions_member_idx");
    expect(migration).toContain("ratiflow_document_actions_creator_idx");
    expect(migration).not.toMatch(/alter\s+publication|realtime\./i);
  });

  it("stores durable one-step agent undo and invalidates it on later writes", () => {
    expect(migration).toContain("undo_agent_revision = v_next_revision");
    expect(migration).toContain("undo_previous_title = v_document.title");
    expect(migration).toContain("undo_previous_body = v_document.body");
    expect(migration).toContain("v_document.undo_agent_revision <> v_agent_revision");
    expect(migration.match(/undo_agent_revision = null/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("normalizes bounded custom instructions before storage and replay", () => {
    expect(migration).toContain("char_length(p_input->>'customInstruction') > 500");
    expect(migration).toContain("to_jsonb(btrim(p_input->>'customInstruction'))");
    expect(migration).toContain("v_instruction := v_normalized_input->>'customInstruction'");
    expect(migration).toContain("instruction = btrim(instruction)");
    expect(migration).not.toContain(
      "char_length(btrim(p_input->>'customInstruction')) not between 1 and 500",
    );
  });

  it("bounds raw change summaries and trims them before replay fingerprinting", () => {
    expect(migration).toContain("char_length(p_input->>'changeSummary') > 240");
    expect(migration).toContain("to_jsonb(btrim(p_input->>'changeSummary'))");
    expect(migration).not.toContain(
      "char_length(btrim(p_input->>'changeSummary')) not between 1 and 240",
    );
  });
});

describe("annotation queue additive Supabase migration", () => {
  it("preserves legacy source values, drops only the singleton, and adds queue indexes", () => {
    expect(annotationQueueMigration).toContain(
      "alter type public.ratiflow_document_action_source\n  add value if not exists 'ANNOTATION_RAIL';",
    );
    expect(annotationQueueMigration).toContain(
      "add value if not exists 'STAGE_TRANSITION';",
    );
    expect(annotationQueueMigration).toContain(
      "drop index if exists public.ratiflow_document_one_pending_action_idx;",
    );
    expect(annotationQueueMigration).toContain(
      "ratiflow_document_actions_pending_queue_idx",
    );
    expect(annotationQueueMigration).toContain(
      "(document_id, created_at, action_id)",
    );
    expect(annotationQueueMigration).toContain(
      "ratiflow_document_actions_owner_pending_queue_idx",
    );
    expect(annotationQueueMigration).toContain(
      "ratiflow_document_actions_resolved_history_idx",
    );
    expect(annotationQueueMigration).not.toMatch(/drop\s+table/i);
  });

  it("allows caret annotations only for the body continue-thought preset", () => {
    expect(annotationQueueMigration).toContain(
      "elsif p_input->>'targetKind' = 'CARET' and (",
    );
    expect(annotationQueueMigration).toContain(
      "or p_input->>'targetField' <> 'BODY'",
    );
    expect(annotationQueueMigration).toContain(
      "or p_input->>'presetId' <> 'continue_thought'",
    );
    expect(annotationQueueMigration).not.toContain(
      "or char_length(v_content) = 0",
    );
  });

  it("keeps v1 reads but fences every mixed-version mutation before v2 deploy", () => {
    for (const rpc of [
      "launch",
      "join",
      "inspect",
      "list_agent_annotations",
      "save_human",
      "set_stage",
      "create_annotation",
      "cancel_annotation",
      "apply_agent_annotation",
      "undo_agent_edit",
      "touch_presence",
    ]) {
      expect(annotationQueueMigration).toContain(
        `create or replace function public.ratiflow_document_${rpc}_v2`,
      );
    }
    expect(annotationQueueMigration).not.toMatch(
      /drop\s+function\s+.*ratiflow_document_(launch|join|inspect)\b/i,
    );
    for (const rpc of [
      "save_human",
      "set_stage",
      "create_action",
      "cancel_action",
      "apply_agent_edit",
      "undo_agent_edit",
      "touch_presence",
    ]) {
      expect(annotationQueueMigration).toContain(
        `revoke execute on function public.ratiflow_document_${rpc}`,
      );
    }
    for (const rpc of ["launch", "join", "inspect"]) {
      expect(annotationQueueMigration).not.toContain(
        `revoke execute on function public.ratiflow_document_${rpc}(`,
      );
    }
    // Required ordering: migrate first (brief visible v1 write downtime), deploy v2
    // immediately, then reload every open tab before allowing further edits.
    expect(annotationQueueMigration).toContain(
      "Mixed-version rollout fence (intentional brief write downtime)",
    );
    expect(annotationQueueMigration).toContain(
      "require open tabs\n--    to reload before writing",
    );
  });

  it("derives ownership from the paired token and locks document then annotation rows", () => {
    expect(annotationQueueMigration).toContain(
      "from ratiflow_document_private.member_for_handle(p_handle)",
    );
    expect(annotationQueueMigration).toContain(
      "and a.created_by_member_id = v_member.member_id",
    );
    expect(annotationQueueMigration.match(
      /v_annotation\.created_by_member_id <> v_member\.member_id/g,
    )?.length).toBeGreaterThanOrEqual(2);
    expect(annotationQueueMigration.match(/for update;/g)?.length).toBeGreaterThanOrEqual(7);
    expect(annotationQueueMigration).not.toMatch(
      /p_input->>'(memberId|createdBy|actorType|origin|documentId)'/,
    );
  });

  it("makes create, cancel, apply, save, stage, and undo replay-safe", () => {
    for (const operation of [
      "SAVE_HUMAN",
      "SET_STAGE",
      "CREATE_ANNOTATION",
      "CANCEL_ANNOTATION",
      "APPLY_AGENT_ANNOTATION",
      "UNDO_AGENT_EDIT",
    ]) {
      expect(annotationQueueMigration).toContain(
        `request_fingerprint_v2(\n    '${operation}', v_member.member_id, v_member.actor_type, p_input`,
      );
      expect(annotationQueueMigration).toContain(`v_existing.operation = '${operation}'`);
    }
    expect(annotationQueueMigration).toContain("'memberId', p_member_id");
    expect(annotationQueueMigration).toContain("'actorType', p_actor_type::text");
    expect(annotationQueueMigration).toContain("'input', p_input");
    expect(annotationQueueMigration).toContain("REQUEST_REPLAY_MISMATCH");
    expect(migration).toContain("primary key (document_id, request_id)");
  });

  it("fingerprints exact raw inputs while trimming only stored custom instructions", () => {
    expect(annotationQueueMigration).toContain(
      "'CREATE_ANNOTATION', v_member.member_id, v_member.actor_type, p_input",
    );
    expect(annotationQueueMigration).toContain(
      "v_instruction := v_normalized_input->>'customInstruction'",
    );
    expect(annotationQueueMigration).toContain(
      "'APPLY_AGENT_ANNOTATION', v_member.member_id, v_member.actor_type, p_input",
    );
    expect(annotationQueueMigration).toContain(
      "char_length(btrim(p_input->>'changeSummary')) < 1",
    );
    expect(annotationQueueMigration).toContain(
      "'summary', p_input->>'changeSummary'",
    );
    expect(annotationQueueMigration).not.toContain(
      "to_jsonb(btrim(p_input->>'changeSummary'))",
    );
  });

  it("enforces queue caps before an atomic forward-stage preparation", () => {
    expect(annotationQueueMigration).toContain(
      "v_document_pending >= 100 or v_member_pending >= 50",
    );
    expect(annotationQueueMigration).toMatch(
      /v_is_forward[\s\S]*?rate_limited_v2[\s\S]*?if v_result is null then[\s\S]*?update public\.ratiflow_documents[\s\S]*?insert into public\.ratiflow_document_actions/,
    );
    expect(annotationQueueMigration).toContain("'STAGE_PREPARATION'");
    expect(annotationQueueMigration).toContain("'STAGE_TRANSITION'");
    expect(annotationQueueMigration).toContain(
      "v_document.stage,\n          v_stage",
    );
  });

  it("implements conservative Unicode code-point rebasing and terminal staleness", () => {
    expect(annotationQueueMigration).toContain(
      "PostgreSQL char_length/substring operate on characters rather than UTF-8 bytes",
    );
    expect(annotationQueueMigration).toContain("v_action.range_end <= v_prefix");
    expect(annotationQueueMigration).toContain("v_action.range_start >= v_splice_end");
    expect(annotationQueueMigration).toContain("v_delta := v_replacement_length");
    expect(annotationQueueMigration).toContain("set status = 'STALE'");
    expect(annotationQueueMigration).toContain("resolved_revision = p_next_revision");
    expect(annotationQueueMigration).toContain("target_kind = 'DOCUMENT'");
    expect(annotationQueueMigration).toContain("anchor_revision = p_next_revision");
  });

  it("atomically resolves owned anchor and target mismatches as STALE", () => {
    expect(annotationQueueMigration).toMatch(
      /v_annotation\.anchor_revision <> v_expected_revision[\s\S]*?set status = 'STALE'[\s\S]*?resolved_revision = v_document\.revision[\s\S]*?The annotation is no longer anchored/,
    );
    expect(annotationQueueMigration.match(
      /The annotation target no longer matches the document\./g,
    )?.length).toBe(2);
    expect(annotationQueueMigration.match(
      /where action_id = v_annotation\.action_id and status = 'PENDING';/g,
    )?.length).toBeGreaterThanOrEqual(3);
  });

  it("supports no-op completion without changing revision or replacing existing Undo", () => {
    expect(annotationQueueMigration).toContain(
      "v_is_noop := p_input->>'replacementText' = v_current_target",
    );
    expect(annotationQueueMigration).toContain("'fromRevision', v_document.revision");
    expect(annotationQueueMigration).toContain("'toRevision', v_document.revision");
    expect(annotationQueueMigration).toContain("'undoAvailable', false");
  });

  it("retains RLS, direct-table revokes, private-helper revokes, and exact RPC grants", () => {
    for (const table of [
      "ratiflow_documents",
      "ratiflow_document_members",
      "ratiflow_document_presence",
      "ratiflow_document_actions",
      "ratiflow_document_request_ledger",
    ]) {
      expect(annotationQueueMigration).toContain(
        `alter table public.${table} enable row level security;`,
      );
      expect(annotationQueueMigration).toContain(
        `revoke all on public.${table} from public, anon, authenticated;`,
      );
    }
    expect(annotationQueueMigration).toContain(
      "revoke all on all functions in schema ratiflow_document_private",
    );
    expect(annotationQueueMigration).toContain(
      "grant execute on function public.ratiflow_document_launch_v2(jsonb)",
    );
    expect(annotationQueueMigration).toContain("to anon, authenticated;");
    expect(annotationQueueMigration).not.toMatch(/create\s+policy/i);
  });

  it("does not introduce plaintext bearer-token storage or privileged client fields", () => {
    expect(annotationQueueMigration).not.toMatch(
      /add\s+column\s+(share_token|session_token|human_session_token|agent_session_token)\s+text/i,
    );
    expect(annotationQueueMigration).not.toMatch(/service[_ ]?role/i);
    expect(annotationQueueMigration).not.toMatch(
      /p_input->>'(documentId|memberId|actorType|origin)'/,
    );
  });
});
