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
const taskImmutabilityMigration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260902021004_repository_v4_1_comment_first_collaboration.sql",
), "utf8");
const capabilityMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260903161308_capability_first_relay_access.sql",
);
const capabilityMigration = readFileSync(capabilityMigrationPath, "utf8");

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

test("the forward-only capability migration backfills and freezes per-run access", () => {
  assert.match(capabilityMigration, /lock table public\.ratiflow_issue_relay_runs_v4 in access exclusive mode/);
  assert.match(capabilityMigration, /lock table public\.ratiflow_issue_relay_attempts_v4 in access exclusive mode/);
  assert.match(capabilityMigration, /lock table ratiflow_document_private\.issue_relay_execution_permits_v4[\s\S]*in access exclusive mode/);
  assert.match(capabilityMigration, /status not in \('SUCCEEDED','FAILED','EXPIRED','CANCELLED'\)/);
  assert.match(capabilityMigration, /grant_digest is not null[\s\S]*grant_revoked_at is null[\s\S]*expiresAt/);
  assert.match(capabilityMigration, /status in \('ISSUED','EXECUTING'\)/);
  assert.match(capabilityMigration, /Capability-first migration requires a fully drained v4\.2 Relay/);
  assert.match(capabilityMigration, /add column access_profile text/);
  assert.match(capabilityMigration, /set access_profile = case specialty[\s\S]*'DATA' then 'METRICS_SCOPED_EDIT'[\s\S]*'CODE' then 'REPOSITORY_SCOPED_EDIT'[\s\S]*'EDITORIAL_SCOPED_EDIT'/);
  assert.match(capabilityMigration, /ratiflow_issue_relay_runs_access_profile_v43_check/);
  assert.match(capabilityMigration, /access_profile in \([\s\S]*'METRICS_SCOPED_EDIT'[\s\S]*'REPOSITORY_SCOPED_EDIT'[\s\S]*'EDITORIAL_SCOPED_EDIT'/);
  assert.match(capabilityMigration, /relay run access profile is immutable/);
  assert.match(capabilityMigration, /create constraint trigger ratiflow_issue_relay_run_access_required_v43[\s\S]*deferrable initially deferred/);
});

test("directory expertise is descriptive while run and claim projections expose separate access", () => {
  const runProjection = capabilityMigration.slice(
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.relay_run_json_v4"),
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.managed_agent_json_v4"),
  );
  assert.match(runProjection, /'agentExpertise',r\.specialty,'accessProfile',r\.access_profile/);
  assert.doesNotMatch(runProjection, /'specialty'/);

  const managedProjection = capabilityMigration.slice(
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.managed_agent_json_v4"),
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.relay_directory_v4"),
  );
  assert.match(managedProjection, /'visibility',p\.directory_scope/);
  assert.match(managedProjection, /'expertise',p\.managed_specialty/);
  assert.doesNotMatch(managedProjection, /'logicalToolNames'|'syntheticSourceLabels'|'specialty'|'scope'/);

  const claimWrapper = capabilityMigration.slice(
    capabilityMigration.indexOf("create function public.ratiflow_claim_issue_relay_v4"),
    capabilityMigration.indexOf("alter function public.ratiflow_transition_issue_relay_attempt_v4"),
  );
  assert.match(claimWrapper, /relay_capability_grant_v43\(v_run_id\)/);
  assert.match(claimWrapper, /jsonb_set\(v_result,'\{data,capabilityGrant\}'/);
});

test("the public claim RPC requires the capability-first contract before reservation", () => {
  assert.match(
    capabilityMigration,
    /alter function public\.ratiflow_claim_issue_relay_v4\(text,uuid,uuid,uuid\)\s+set schema ratiflow_document_private/,
  );
  assert.match(
    capabilityMigration,
    /alter function ratiflow_document_private\.ratiflow_claim_issue_relay_v4\(\s*text,uuid,uuid,uuid\s*\) rename to legacy_claim_issue_relay_v42/,
  );
  const publicCreations = [...capabilityMigration.matchAll(
    /create function public\.ratiflow_claim_issue_relay_v4\s*\(([\s\S]*?)\)\s*returns jsonb/g,
  )];
  assert.equal(publicCreations.length, 1);
  assert.equal(
    publicCreations[0]![1]!.replace(/\s+/g, " ").trim(),
    "p_handle text, p_page_session_id uuid, p_request_id uuid, p_retry_run_id uuid, p_contract text",
  );

  const claimWrapper = capabilityMigration.slice(
    capabilityMigration.indexOf("create function public.ratiflow_claim_issue_relay_v4"),
    capabilityMigration.indexOf("alter function public.ratiflow_transition_issue_relay_attempt_v4"),
  );
  const contractCheck = claimWrapper.indexOf(
    "if p_contract is distinct from 'capability-first-v43'",
  );
  const reservation = claimWrapper.indexOf(
    "v_result := ratiflow_document_private.legacy_claim_issue_relay_v42",
  );
  assert.ok(contractCheck >= 0 && reservation > contractCheck);
  assert.match(claimWrapper, /PROTOCOL_MISMATCH/);
  assert.match(
    capabilityMigration,
    /revoke all on function public\.ratiflow_claim_issue_relay_v4\(\s*text,uuid,uuid,uuid,text\s*\) from public,anon,authenticated/,
  );
  assert.match(
    capabilityMigration,
    /grant execute on function public\.ratiflow_claim_issue_relay_v4\(\s*text,uuid,uuid,uuid,text\s*\) to service_role/,
  );
  assert.doesNotMatch(
    capabilityMigration,
    /grant execute on function public\.ratiflow_claim_issue_relay_v4\(\s*text,uuid,uuid,uuid\s*\)/,
  );
});

test("agent mention access is exact, persisted, and independent of selected expertise", () => {
  const wrapper = capabilityMigration.slice(
    capabilityMigration.indexOf("create function public.ratiflow_create_issue_directory_mention_v4"),
    capabilityMigration.indexOf("alter function public.ratiflow_claim_issue_relay_v4"),
  );
  assert.match(wrapper, /v_target_kind='HUMAN'[\s\S]*array\['expectedRevision','comment','target','anchor'\]/);
  assert.match(wrapper, /v_target_kind<>'AGENT'[\s\S]*array\['expectedRevision','comment','target','accessProfile','anchor'\]/);
  assert.match(wrapper, /p_input-'accessProfile'/);
  assert.match(wrapper, /update public\.ratiflow_issue_relay_runs_v4[\s\S]*set access_profile=v_access_profile/);
  assert.match(wrapper, /v_existing_access<>v_access_profile[\s\S]*REQUEST_REPLAY_MISMATCH/);
});

test("crossed managed mentions are born with access-derived immutable categories", () => {
  const policy = capabilityMigration.slice(
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.relay_access_policy_v43"),
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.relay_capability_grant_v43"),
  );
  assert.match(policy, /when 'METRICS_SCOPED_EDIT'[\s\S]*'taskCategory','DATA'/);
  assert.match(policy, /when 'EDITORIAL_SCOPED_EDIT'[\s\S]*'taskCategory','WRITING'/);

  const initializer = capabilityMigration.slice(
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.initialize_relay_task_access_v43"),
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.prevent_relay_access_update_v43"),
  );
  assert.match(initializer, /current_setting\([\s\S]*ratiflow\.relay_access_profile_v43/);
  assert.match(initializer, /relay_access_policy_v43\(v_access_profile\)/);
  assert.match(initializer, /p\.profile_id=new\.agent_profile_id[\s\S]*p\.identity_source='DEMO_DIRECTORY'/);
  assert.match(initializer, /new\.category := v_policy->>'taskCategory'/);
  assert.match(initializer, /before insert on public\.ratiflow_issue_tasks_v4/);
  assert.doesNotMatch(initializer, /managed_specialty|specialty/);

  const wrapper = capabilityMigration.slice(
    capabilityMigration.indexOf("create function public.ratiflow_create_issue_directory_mention_v4"),
    capabilityMigration.indexOf("alter function public.ratiflow_claim_issue_relay_v4"),
  );
  const setAccess = wrapper.indexOf(
    "set_config('ratiflow.relay_access_profile_v43',v_access_profile,true)",
  );
  const createMention = wrapper.indexOf(
    "legacy_create_issue_directory_mention_v42(",
    setAccess,
  );
  const restoreAccess = wrapper.indexOf(
    "'ratiflow.relay_access_profile_v43',coalesce(v_previous_access_setting,''),true",
  );
  assert.ok(setAccess >= 0 && createMention > setAccess && restoreAccess > createMention);
  assert.doesNotMatch(wrapper, /update public\.ratiflow_issue_tasks_v4/);

  const immutableTask = taskImmutabilityMigration.slice(
    taskImmutabilityMigration.indexOf(
      "create or replace function ratiflow_document_private.immutable_task_identity_v4",
    ),
    taskImmutabilityMigration.indexOf("-- Backfill comment provenance"),
  );
  assert.match(immutableTask, /new\.category is distinct from old\.category/);
  assert.doesNotMatch(
    capabilityMigration,
    /create or replace function ratiflow_document_private\.immutable_task_identity_v4/,
  );
});

test("manifest and permit authority are reconstructed from immutable run access", () => {
  const logicalLookup = capabilityMigration.slice(
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.relay_logical_tool_v4"),
    capabilityMigration.indexOf("alter table ratiflow_document_private.issue_relay_execution_permits_v4"),
  );
  assert.match(logicalLookup, /ratiflow_issue_relay_attempts_v4 a[\s\S]*ratiflow_issue_relay_runs_v4 r/);
  assert.match(logicalLookup, /relay_access_policy_v43\([\s\S]*r\.access_profile/);
  assert.match(logicalLookup, /physicalDiscriminator/);
  assert.doesNotMatch(logicalLookup, /managed_specialty|managed_logical_tool_names/);
  assert.match(capabilityMigration, /add column capability_first_access boolean not null default false/);
  assert.match(capabilityMigration, /alter column capability_first_access set default true/);
  assert.match(capabilityMigration, /not capability_first_access and physical_tool_name[\s\S]*\^rf_\(data\|code\|general\)_/);
  assert.match(capabilityMigration, /capability_first_access and physical_tool_name[\s\S]*\^rf_\(metrics\|repository\|editorial\)_/);
  assert.match(capabilityMigration, /\^rf_\(metrics\|repository\|editorial\)_/);

  const validator = capabilityMigration.slice(
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.relay_manifest_valid_v43"),
    capabilityMigration.indexOf("create or replace function ratiflow_document_private.prevent_invalid_relay_manifest_v43"),
  );
  assert.match(validator, /v_policy := ratiflow_document_private\.relay_access_policy_v43\(v_run\.access_profile\)/);
  assert.match(validator, /v_entry->>'logicalName'<>v_expected_logical/);
  assert.match(validator, /v_entry->>'physicalName'<>'rf_'\|\|\(v_policy->>'physicalDiscriminator'\)/);
  assert.match(validator, /jsonb_array_length\(p_manifest->'entries'\)[\s\S]*jsonb_array_length\(v_policy->'logicalToolNames'\)/);
  assert.match(validator, /relay_tool_definition_v43\([\s\S]*v_expected_logical/);
  assert.match(validator, /v_entry->>'description'<>v_definition->>'description'/);
  assert.match(validator, /v_entry->'inputSchema'<>v_definition->'inputSchema'/);
  assert.match(validator, /v_entry->'annotations'<>v_definition->'annotations'/);
  assert.match(validator, /relay_canonical_json_v43\([\s\S]*jsonb_build_object\('entries',v_expected_entries\)/);
  assert.match(validator, /p_manifest->>'digest'=v_expected_digest/);

  const transitionWrapper = capabilityMigration.slice(
    capabilityMigration.indexOf("create function public.ratiflow_transition_issue_relay_attempt_v4"),
    capabilityMigration.indexOf("revoke all on function ratiflow_document_private.legacy_create_issue_directory_mention_v42"),
  );
  const preLegacy = transitionWrapper.slice(
    0,
    transitionWrapper.indexOf("v_result := ratiflow_document_private.legacy_transition_issue_relay_attempt_v42"),
  );
  assert.match(preLegacy, /p_action='RECORD_MANIFEST'/);
  assert.match(preLegacy, /relay_manifest_valid_v43/);
  assert.match(preLegacy, /approved_manifest=p_input->'manifest'/);
  assert.match(preLegacy, /WEBMCP_GET_TOOLS_COMPLETED/);
  assert.doesNotMatch(preLegacy, /managed_logical_tool_names|managed_specialty/);
  assert.doesNotMatch(
    capabilityMigration,
    /cardinality\(v_profile\.managed_logical_tool_names\)/,
    "a legacy bot-profile count must not veto a valid crossed run catalog",
  );
});

test("v1 token claims remain unchanged and superseded RPCs are private", () => {
  assert.doesNotMatch(capabilityMigration, /jsonb_build_object\(\s*'v',1,'aud'/);
  for (const name of [
    "legacy_create_issue_directory_mention_v42",
    "legacy_claim_issue_relay_v42",
    "legacy_transition_issue_relay_attempt_v42",
  ]) {
    assert.match(capabilityMigration, new RegExp(
      `revoke all on function ratiflow_document_private\\.${name}\\([\\s\\S]*service_role`,
    ));
  }
  for (const name of [
    "ratiflow_create_issue_directory_mention_v4",
    "ratiflow_claim_issue_relay_v4",
    "ratiflow_transition_issue_relay_attempt_v4",
  ]) {
    assert.match(capabilityMigration, new RegExp(
      `grant execute on function public\\.${name}\\([\\s\\S]*to service_role`,
    ));
  }
});
