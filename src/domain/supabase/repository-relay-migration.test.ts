import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260902160324_managed_agent_relay_v4.sql",
);
const migration = readFileSync(migrationPath, "utf8");

test("the reviewed managed Relay migration is byte-for-byte pinned", () => {
  assert.equal(
    createHash("sha256").update(migration, "utf8").digest("hex"),
    "943455110a9ac27afd79566b64dd9b6a61dcdd2a7379ad65653f2e41167e5a74",
  );
});

test("the single additive migration exposes only the frozen public Relay RPC catalog", () => {
  const names = [...migration.matchAll(
    /create or replace function public\.(ratiflow_[a-z0-9_]+)\s*\(/g,
  )].map((match) => match[1]);
  assert.deepEqual(names, [
    "ratiflow_read_issue_relay_state_v4",
    "ratiflow_create_issue_directory_mention_v4",
    "ratiflow_claim_issue_relay_v4",
    "ratiflow_renew_issue_relay_lease_v4",
    "ratiflow_release_issue_relay_v4",
    "ratiflow_transition_issue_relay_attempt_v4",
    "ratiflow_begin_issue_relay_tool_v4",
    "ratiflow_finish_issue_relay_tool_v4",
    "ratiflow_record_issue_relay_trace_v4",
  ]);
  for (const name of names) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(`));
  }
});

test("durable steps reserve atomically and never persist plaintext grants or permits", () => {
  assert.match(migration, /create table ratiflow_document_private\.issue_relay_steps_v4/);
  assert.match(migration, /status text not null default 'RESERVED'[\s\S]*'RESERVED','TERMINAL'/);
  assert.match(migration, /unique \(attempt_id, request_id\)/);
  assert.match(migration, /unique \(attempt_id, expected_step\)/);
  assert.match(migration, /result jsonb/);
  assert.match(migration, /grant_digest text/);
  assert.match(migration, /token_digest text/);
  assert.doesNotMatch(migration, /\bgrant_token\b|\bpermit_token\b|\bplaintext_token\b/);
  assert.match(migration, /force row level security/g);
  assert.match(migration, /revoke all on ratiflow_document_private\.issue_relay_steps_v4/);
});

test("run serialization, lineage cancellation, and server-owned discovery facts are database-owned", () => {
  assert.match(migration, /where status = 'ACTIVE'/);
  assert.match(migration, /new\.status in \('CANCELLED','STALE'\)/);
  assert.match(migration, /terminal_reason=case new\.status when 'STALE' then 'TASK_STALE' else 'TASK_CANCELLED'/);
  const discovery = migration.slice(
    migration.indexOf("elsif v_outcome_name='DISCOVER_TOOLS'"),
    migration.indexOf("elsif v_outcome_name='EXECUTE_TOOL'"),
  );
  assert.match(discovery, /MODEL_TOOL_SEARCH_REQUESTED/);
  assert.doesNotMatch(discovery, /IDLE_CATALOG_WITHDRAWN|RELAY_CATALOG_REGISTERED|WEBMCP_TOOLCHANGE_OBSERVED/);
  const manifest = migration.slice(
    migration.indexOf("p_action='RECORD_MANIFEST'"),
    migration.indexOf("p_action='LOAD_VERIFIED_TOOL_RESULT'"),
  );
  assert.match(manifest, /WEBMCP_GET_TOOLS_COMPLETED/);
  assert.doesNotMatch(manifest, /WEBMCP_TOOLCHANGE_OBSERVED/);
  const release = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_release_issue_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.relay_context_permit_v4"),
  );
  assert.doesNotMatch(
    release,
    /relay_trace_append_v4\([^;]*'(?:RELAY_CATALOG_WITHDRAWN|IDLE_CATALOG_RESTORED|WEBMCP_TOOLCHANGE_OBSERVED)'/,
  );
  assert.match(release, /kind='IDLE_CATALOG_RESTORED'[\s\S]*'RUN_COMPLETED'/);
});

test("post-lock grant checks prevent stale requests from reopening cancelled Relay state", () => {
  const renew = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_renew_issue_relay_lease_v4"),
    migration.indexOf("create or replace function public.ratiflow_release_issue_relay_v4"),
  );
  assert.match(renew, /relay_grant_attempt_v4\([\s\S]*p_grant_claims,p_grant_digest,false/);
  assert.match(renew, /where attempt_id=v_attempt_id for update[\s\S]*grant_revoked_at is not null/);

  const release = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_release_issue_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.relay_context_permit_v4"),
  );
  assert.match(
    release,
    /relay_grant_attempt_v4\([\s\S]*p_grant_claims,p_grant_digest,true,true/,
  );
  assert.doesNotMatch(
    release,
    /where a\.grant_claims=p_grant_claims and a\.grant_digest=p_grant_digest/,
  );

  const transition = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_transition_issue_relay_attempt_v4"),
    migration.indexOf("create or replace function public.ratiflow_begin_issue_relay_tool_v4"),
  );
  assert.match(transition, /where attempt_id=v_attempt_id for update/);
  assert.match(transition, /grant_revoked_at is not null[\s\S]*The Relay grant is invalid/);
  const recordResult = transition.slice(transition.indexOf("p_action='RECORD_STEP_RESULT'"));
  assert.match(recordResult, /v_step\.status='TERMINAL'[\s\S]*return jsonb_build_object/);
  assert.match(recordResult, /v_run\.status='ACTIVE'[\s\S]*Terminal Relay state cannot be reopened/);

  for (const [start, end] of [
    ["create or replace function public.ratiflow_begin_issue_relay_tool_v4", "create or replace function public.ratiflow_finish_issue_relay_tool_v4"],
    ["create or replace function public.ratiflow_finish_issue_relay_tool_v4", "create or replace function public.ratiflow_record_issue_relay_trace_v4"],
    ["create or replace function public.ratiflow_record_issue_relay_trace_v4", "revoke all on function public.ratiflow_create_issue_directory_mention_v4"],
  ] as const) {
    const rpc = migration.slice(migration.indexOf(start), migration.indexOf(end));
    assert.match(rpc, /where attempt_id=v_attempt_id for update[\s\S]*grant_revoked_at is not null/);
  }
});

test("WAITING_RETRY is a FIFO barrier and claim replay binds the exact retry target", () => {
  assert.match(migration, /retry_run_id uuid/);
  assert.match(migration, /retry_run_id is null or retry_run_id=run_id/);
  assert.match(migration, /v_attempt\.retry_run_id is distinct from p_retry_run_id/);
  assert.match(migration, /status in \('QUEUED','WAITING_RETRY'\)[\s\S]*order by r\.created_at,r\.run_id/);
  assert.match(migration, /v_run\.status='WAITING_RETRY' and p_retry_run_id is null/);
  assert.match(migration, /explicit Relay retry does not match the queue head/);
  assert.match(migration, /revoke all on function public\.ratiflow_claim_issue_relay_v4\(text,uuid,uuid,uuid\)/);
  assert.match(migration, /grant execute on function public\.ratiflow_claim_issue_relay_v4\(text,uuid,uuid,uuid\)/);
});

test("attempt two release and expiry exhaust instead of returning an unclaimable queue head", () => {
  const reconcile = migration.slice(
    migration.indexOf("create or replace function ratiflow_document_private.reconcile_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.cancel_relay_for_task_v4"),
  );
  assert.match(reconcile, /status in \('QUEUED','WAITING_RETRY'\)[\s\S]*attempt_count>=r\.max_attempts/);
  assert.match(reconcile, /status=case when attempt_count>=max_attempts then 'EXHAUSTED' else 'QUEUED' end/);
  assert.match(reconcile, /LEASE_EXPIRED_BEFORE_DISPATCH/);
  const release = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_release_issue_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.relay_context_permit_v4"),
  );
  assert.match(release, /status=case when attempt_count>=max_attempts then 'EXHAUSTED' else 'QUEUED' end/);
  assert.match(release, /RELEASED_BEFORE_DISPATCH/);
  assert.match(release, /RUN_EXHAUSTED/);
});

test("provider-run quotas are durable, atomic, deployment-wide, and per document", () => {
  const ledger = migration.slice(
    migration.indexOf("create table ratiflow_document_private.issue_relay_provider_dispatches_v4"),
    migration.indexOf("create index issue_relay_provider_dispatch_global_window_idx"),
  );
  assert.match(ledger, /attempt_id uuid not null unique/);
  assert.match(ledger, /reserved_at timestamptz not null/);
  assert.match(ledger, /reservation_expires_at timestamptz not null/);
  assert.match(ledger, /dispatched_at timestamptz,/);
  assert.doesNotMatch(ledger, /\breferences\b|\bforeign key\b/);
  assert.match(migration, /issue_relay_provider_dispatch_global_window_idx[\s\S]*\(dispatched_at\)/);
  assert.match(migration, /issue_relay_provider_dispatch_document_window_idx[\s\S]*\(document_id, dispatched_at\)/);
  assert.match(migration, /issue_relay_provider_reservation_expiry_idx/);
  const claim = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_claim_issue_relay_v4"),
    migration.indexOf("create or replace function public.ratiflow_renew_issue_relay_lease_v4"),
  );
  assert.match(claim, /pg_advisory_xact_lock\(1381259596,4\)/);
  assert.match(claim, /pg_advisory_xact_lock\(1381259596,4\)[\s\S]*v_now := clock_timestamp\(\)/);
  assert.match(claim, /dispatched_at<=v_now-interval '10 minutes'[\s\S]*reservation_expires_at<=v_now/);
  assert.match(claim, /reservation_expires_at>v_now[\s\S]*>=48/);
  assert.match(claim, /d\.document_id=v_document\.id[\s\S]*reservation_expires_at>v_now[\s\S]*>=6/);
  assert.match(claim, /'RATE_LIMITED',[\s\S]*provider-run quota is reached/);
  assert.ok(claim.indexOf("'RATE_LIMITED'") < claim.indexOf(
    "insert into public.ratiflow_issue_relay_attempts_v4",
  ));
  assert.match(claim, /insert into ratiflow_document_private\.issue_relay_provider_dispatches_v4\([\s\S]*reserved_at,reservation_expires_at/);
  const beginStep = migration.slice(
    migration.indexOf("if p_action='BEGIN_STEP'"),
    migration.indexOf("elsif p_action='RECORD_STEP_RESULT'"),
  );
  assert.match(beginStep, /pg_advisory_xact_lock\(1381259596,4\)[\s\S]*v_quota_now := clock_timestamp\(\)/);
  assert.match(beginStep, /set dispatched_at=coalesce\(dispatched_at,v_quota_now\)/);
  assert.match(beginStep, /reservation_expires_at>v_quota_now/);
  assert.doesNotMatch(beginStep, /provider-run quota is reached/);
  const release = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_release_issue_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.relay_context_permit_v4"),
  );
  assert.match(release, /not v_attempt\.provider_dispatched[\s\S]*delete from ratiflow_document_private\.issue_relay_provider_dispatches_v4/);
  assert.match(migration, /force row level security/g);
  assert.match(migration, /revoke all on ratiflow_document_private\.issue_relay_provider_dispatches_v4/);
});

test("unknown post-dispatch provider outcomes remain reconciling and block a second attempt", () => {
  const transition = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_transition_issue_relay_attempt_v4"),
    migration.indexOf("create or replace function public.ratiflow_begin_issue_relay_tool_v4"),
  );
  assert.match(transition, /RELAY_PROVIDER_OUTCOME_UNKNOWN'[\s\S]*status='RECONCILING'/);
  assert.match(transition, /v_run\.status='COMPLETED'[\s\S]*v_task\.status='COMPLETED'[\s\S]*status='SUCCEEDED'/);
  assert.match(transition, /provider_call_count=provider_call_count\+case[\s\S]*RELAY_PROVIDER_OUTCOME_UNKNOWN'[\s\S]*then 1/);
  assert.match(transition, /'ATTEMPT_RECONCILING'[\s\S]*PROVIDER_OUTCOME_UNKNOWN/);
  const release = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_release_issue_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.relay_context_permit_v4"),
  );
  assert.match(release, /v_run\.status='ACTIVE'[\s\S]*RELAY_PROVIDER_OUTCOME_UNKNOWN'[\s\S]*status='RECONCILING'/);
  assert.match(release, /completed_at=null/);
  const claim = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_claim_issue_relay_v4"),
    migration.indexOf("create or replace function public.ratiflow_renew_issue_relay_lease_v4"),
  );
  assert.match(claim, /r\.status='ACTIVE'[\s\S]*'outcome','BUSY'/);
  const reconcile = migration.slice(
    migration.indexOf("create or replace function ratiflow_document_private.reconcile_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.cancel_relay_for_task_v4"),
  );
  assert.match(reconcile, /committed scoped revision is authoritative[\s\S]*status='SUCCEEDED'[\s\S]*RELAY_PROVIDER_OUTCOME_UNKNOWN/);
});

test("browser observations are exact, serialized, terminal-safe application trace only", () => {
  const trace = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_record_issue_relay_trace_v4"),
    migration.indexOf("revoke all on function public.ratiflow_create_issue_directory_mention_v4"),
  );
  assert.match(trace, /relay_grant_attempt_v4\([\s\S]*p_grant_claims,p_grant_digest,true/);
  assert.match(trace, /input_v4\(p_input,array\['kind','detail'\],'\{\}'\)/);
  assert.match(trace, /input_v4\(v_detail,array\['transition'\],'\{\}'\)/);
  assert.match(trace, /p_input->>'kind'<>v_detail->>'transition'/);
  assert.match(trace, /where attempt_id=v_attempt_id for update/);
  assert.match(trace, /count\(\*\)[\s\S]*>=64/);
});

test("lost mutable responses reconstruct the same ledger request and terminal facts backfill", () => {
  const recovery = migration.slice(
    migration.indexOf("create or replace function ratiflow_document_private.recover_completed_relay_permits_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.reconcile_relay_v4"),
  );
  assert.match(recovery, /permit\.status='EXECUTING'/);
  assert.match(recovery, /ledger\.request_id=v_permit\.downstream_request_id/);
  assert.match(recovery, /ledger\.operation=v_operation/);
  assert.match(recovery, /request_fingerprint_v41\([\s\S]*v_attempt\.attempt_id,v_attempt\.page_session_id/);
  assert.match(recovery, /p_permit_id is null or permit\.permit_id=p_permit_id/);
  assert.match(recovery, /status='COMPLETED',result_receipt_id=v_receipt,output=v_output/);
  assert.match(recovery, /r\.status in \('ACTIVE','COMPLETED'\)/);
  assert.match(recovery, /WEBMCP_EXECUTE_COMPLETED/);
  assert.match(recovery, /recoveredFromRequestLedger/);
  const beginTool = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_begin_issue_relay_tool_v4"),
    migration.indexOf("create or replace function public.ratiflow_finish_issue_relay_tool_v4"),
  );
  assert.ok(
    beginTool.indexOf("v_permit.status='COMPLETED'")
      < beginTool.indexOf("elsif v_permit.status='EXECUTING'"),
    "a completed receipt must replay before live execution authority is checked",
  );
  const executingRecovery = beginTool.slice(
    beginTool.indexOf("elsif v_permit.status='EXECUTING'"),
    beginTool.indexOf("elsif v_permit.status<>'ISSUED'"),
  );
  assert.match(executingRecovery, /v_run\.status<>'ACTIVE'/);
  assert.match(executingRecovery, /v_attempt\.status in \('SUCCEEDED','FAILED','EXPIRED','CANCELLED'\)/);
  assert.match(executingRecovery, /v_attempt\.lease_expires_at<=v_now/);
  assert.match(executingRecovery, /v_attempt\.deadline_at<=v_now/);
  assert.match(executingRecovery, /v_permit\.permit_claims->>'expiresAt'\)::timestamptz<=v_now/);
  assert.match(executingRecovery, /RELAY_EXECUTION_NOT_ARMED[\s\S]*logical_tool_name in[\s\S]*'disposition','AUTHORIZED'/);
  assert.match(beginTool, /v_permit_id := v_permit\.permit_id[\s\S]*recover_completed_relay_permits_v4\([\s\S]*v_permit_id[\s\S]*where permit\.permit_id=v_permit_id[\s\S]*v_now := clock_timestamp\(\)/);
  assert.match(beginTool, /v_permit\.status='EXECUTING'[\s\S]*comment_on_assignment','submit_scoped_revision/);
  assert.match(beginTool, /'disposition','AUTHORIZED','context',v_context/);
  assert.match(beginTool, /'requestId',v_permit\.downstream_request_id/);
  assert.match(beginTool, /WEBMCP_EXECUTE_STARTED/);
  const finishTool = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_finish_issue_relay_tool_v4"),
    migration.indexOf("create or replace function public.ratiflow_record_issue_relay_trace_v4"),
  );
  assert.match(finishTool, /v_permit\.status='COMPLETED' and v_permit\.output is not null[\s\S]*v_permit\.output::jsonb=v_output/);
  assert.match(finishTool, /WEBMCP_EXECUTE_COMPLETED/);
  assert.match(migration, /'REVISION_COMMITTED'/);
  const reconcile = migration.slice(
    migration.indexOf("create or replace function ratiflow_document_private.reconcile_relay_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.cancel_relay_for_task_v4"),
  );
  assert.match(reconcile, /kind='IDLE_CATALOG_RESTORED'[\s\S]*'RUN_COMPLETED'/);
  const trace = migration.slice(
    migration.indexOf("create or replace function public.ratiflow_record_issue_relay_trace_v4"),
    migration.indexOf("revoke all on function public.ratiflow_create_issue_directory_mention_v4"),
  );
  assert.match(trace, /kind'='RELAY_CATALOG_WITHDRAWN'[\s\S]*recover_completed_relay_permits_v4/);

  const managedMutation = migration.slice(
    migration.indexOf("create or replace function ratiflow_document_private.relay_managed_mutation_v4"),
    migration.indexOf("create or replace function public.ratiflow_transition_issue_relay_attempt_v4"),
  );
  const lockOrder = [
    "from public.ratiflow_documents",
    "from public.ratiflow_issue_relay_runs_v4",
    "from public.ratiflow_issue_relay_attempts_v4",
    "from ratiflow_document_private.issue_relay_execution_permits_v4",
    "from public.ratiflow_issue_tasks_v4",
    "from public.ratiflow_issue_threads_v4",
  ].map((fragment) => managedMutation.indexOf(fragment));
  assert.ok(lockOrder.every((index) => index >= 0));
  assert.deepEqual([...lockOrder].sort((left, right) => left - right), lockOrder);
  assert.match(managedMutation, /v_permit\.status not in \('EXECUTING','COMPLETED'\)/);
  assert.match(managedMutation, /recover_completed_relay_permits_v4\([\s\S]*v_permit\.permit_id[\s\S]*return v_result/);
  assert.match(managedMutation, /v_attempt\.grant_revoked_at is not null/);
  assert.match(managedMutation, /v_attempt\.lease_expires_at<=v_now or v_attempt\.deadline_at<=v_now/);
  assert.match(managedMutation, /v_task\.status<>'OPEN' or v_thread\.status<>'OPEN'/);
});

test("ordinary task and mention compatibility cannot strand managed-directory work", () => {
  assert.match(migration, /rename to legacy_create_issue_task_compat_v42/);
  const taskCompatibility = migration.slice(
    migration.indexOf("create function public.ratiflow_create_issue_task_v4"),
    migration.indexOf("create or replace function ratiflow_document_private.relay_trace_append_v4"),
  );
  assert.ok(
    migration.indexOf("create function public.ratiflow_create_issue_task_v4")
      > migration.indexOf("create or replace function ratiflow_document_private.ensure_managed_agents_v4"),
  );
  assert.doesNotMatch(taskCompatibility, /ensure_managed_agents_v4\(/);
  assert.match(taskCompatibility, /p\.identity_source='DEMO_DIRECTORY'/);
  assert.match(taskCompatibility, /replay_v41\([\s\S]*'CREATE_ISSUE_TASK_V4'/);
  assert.match(taskCompatibility, /record_v41\([\s\S]*'STALE_AGENT_PROFILE'/);
  assert.match(taskCompatibility, /legacy_create_issue_task_compat_v42\([\s\S]*p_handle,p_input,p_response_contract/);
  assert.match(taskCompatibility, /grant execute on function public\.ratiflow_create_issue_task_v4\(text,jsonb,text\)/);

  const mentionCompatibility = migration.slice(
    migration.indexOf("alter function public.ratiflow_create_issue_mention_v4"),
    migration.indexOf("create table public.ratiflow_issue_mentions_v4"),
  );
  assert.match(mentionCompatibility, /rename to legacy_create_issue_mention_v4/);
  assert.match(mentionCompatibility, /p\.identity_source='DEMO_DIRECTORY'/);
  assert.match(mentionCompatibility, /Managed directory agents require the directory mention flow/);
  assert.match(mentionCompatibility, /legacy_create_issue_mention_v4\(p_handle,p_input\)/);
  assert.match(migration, /directory_handle is not null and directory_scope is not null/);
  assert.match(migration, /managed_logical_tool_names is not null[\s\S]*synthetic_source_labels is not null/);
});
