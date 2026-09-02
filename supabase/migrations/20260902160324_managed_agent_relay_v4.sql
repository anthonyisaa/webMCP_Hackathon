-- Protocol-4 managed Agent Directory and application-owned WebMCP Relay.
-- Additive to v4.1: ordinary repository projections and RPC names remain intact.

alter table public.ratiflow_documents
  add column relay_event_version bigint not null default 0
    check (relay_event_version between 0 and 9007199254740991);

alter table public.ratiflow_document_request_ledger
  drop constraint ratiflow_document_request_ledger_operation_check;
alter table public.ratiflow_document_request_ledger
  add constraint ratiflow_document_request_ledger_operation_check check (
    operation in (
      'SAVE_HUMAN', 'SET_STAGE', 'CREATE_ACTION', 'APPLY_AGENT_EDIT',
      'UNDO_AGENT_EDIT', 'CREATE_ANNOTATION', 'CANCEL_ANNOTATION',
      'APPLY_AGENT_ANNOTATION', 'SAVE_DOCUMENT_V3', 'CREATE_DOCUMENT_WORK_V3',
      'CANCEL_DOCUMENT_WORK_V3', 'SUBMIT_DOCUMENT_PROPOSAL_V3',
      'ACCEPT_DOCUMENT_PROPOSAL_V3', 'REJECT_DOCUMENT_PROPOSAL_V3',
      'SAVE_ISSUE_REVISION_V4', 'CREATE_ISSUE_TASK_V4',
      'CREATE_ISSUE_THREAD_V4', 'ADD_ISSUE_COMMENT_V4',
      'RESOLVE_ISSUE_THREAD_V4', 'CANCEL_ISSUE_TASK_V4',
      'ACCEPT_ISSUE_TASK_V4', 'REJECT_ISSUE_TASK_V4',
      'RESTORE_ISSUE_REVISION_V4', 'COMMENT_ON_ISSUE_TASK_V4',
      'SUBMIT_ISSUE_TASK_RESULT_V4', 'TOUCH_ISSUE_PRESENCE_V4',
      'CONNECT_ISSUE_AGENT_V4', 'CREATE_ISSUE_MENTION_V4',
      'CREATE_ISSUE_DIRECTORY_MENTION_V4'
    )
  );

alter table public.ratiflow_issue_agent_profiles_v4
  drop constraint ratiflow_issue_agent_profiles_v4_identity_source_check;
alter table public.ratiflow_issue_agent_profiles_v4
  add constraint ratiflow_issue_agent_profiles_v4_identity_source_check
    check (identity_source in ('SELF_DECLARED', 'DEMO_DIRECTORY')),
  add column directory_handle text,
  add column directory_scope text,
  add column managed_specialty text,
  add column managed_runtime text,
  add column managed_readiness text,
  add column managed_logical_tool_names text[],
  add column synthetic_source_labels text[];
alter table public.ratiflow_issue_agent_profiles_v4
  add constraint ratiflow_issue_agent_profiles_directory_shape_check check (
    (identity_source = 'SELF_DECLARED'
      and directory_handle is null and directory_scope is null
      and managed_specialty is null and managed_runtime is null
      and managed_readiness is null and managed_logical_tool_names is null
      and synthetic_source_labels is null)
    or
    (identity_source = 'DEMO_DIRECTORY'
      and directory_handle is not null and directory_scope is not null
      and managed_specialty is not null and managed_runtime is not null
      and managed_readiness is not null and managed_logical_tool_names is not null
      and synthetic_source_labels is not null
      and directory_handle in ('data','code','general')
      and directory_scope in ('COMPANY','TEAM','PERSONAL')
      and managed_specialty in ('DATA','CODE','GENERAL')
      and managed_runtime = 'OPENAI_LUNA_WEBMCP_RELAY'
      and managed_readiness in ('READY','WEBMCP_UNAVAILABLE','DISABLED')
      and cardinality(managed_logical_tool_names) between 6 and 7
      and cardinality(synthetic_source_labels) between 1 and 8)
  );
create unique index ratiflow_issue_agent_profiles_directory_handle_idx
  on public.ratiflow_issue_agent_profiles_v4 (document_id, lower(directory_handle))
  where directory_handle is not null;

-- Preserve the v4/v4.1 compatibility entry points while preventing them from
-- creating managed-directory tasks without their required Relay run. Managed
-- identities are accepted only by ratiflow_create_issue_directory_mention_v4.
alter function public.ratiflow_create_issue_task_v4(text,jsonb,text)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_create_issue_task_v4(text,jsonb,text)
  rename to legacy_create_issue_task_compat_v42;

alter function public.ratiflow_create_issue_mention_v4(text,jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_create_issue_mention_v4(text,jsonb)
  rename to legacy_create_issue_mention_v4;

create function public.ratiflow_create_issue_mention_v4(
  p_handle text,
  p_input jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_request_id uuid;
declare v_replay jsonb;
begin
  select * into v_session
    from ratiflow_document_private.member_for_handle_v4(p_handle);
  if found and v_session.actor_type='HUMAN'
    and p_input is not null and jsonb_typeof(p_input)='object'
    and ratiflow_document_private.uuid_v4(p_input->'requestId')
    and ratiflow_document_private.uuid_v4(p_input->'assignedToMemberId') then
    if exists (
      select 1 from public.ratiflow_issue_agent_profiles_v4 p
      where p.document_id=v_session.document_id
        and p.member_id=(p_input->>'assignedToMemberId')::uuid
        and p.identity_source='DEMO_DIRECTORY'
    ) then
    select * into strict v_document from public.ratiflow_documents
      where id=v_session.document_id and protocol_version=4
        and expires_at>clock_timestamp() for update;
    v_request_id := (p_input->>'requestId')::uuid;
    v_replay := ratiflow_document_private.replay_v41(
      v_document.id,v_request_id,'CREATE_ISSUE_MENTION_V4',
      v_session.member_id,'HUMAN',p_input
    );
    if v_replay is not null then return v_replay; end if;
    return ratiflow_document_private.record_v41(
      v_document.id,v_request_id,'CREATE_ISSUE_MENTION_V4',
      v_session.member_id,'HUMAN',p_input,
      ratiflow_document_private.error_v4(
        'STALE_AGENT_PROFILE',
        'Managed directory agents require the directory mention flow.',false
      )
    );
    end if;
  end if;
  return ratiflow_document_private.legacy_create_issue_mention_v4(p_handle,p_input);
end;
$$;

revoke all on function public.ratiflow_create_issue_mention_v4(text,jsonb)
  from public,anon,authenticated;
grant execute on function public.ratiflow_create_issue_mention_v4(text,jsonb)
  to anon,authenticated;

create table public.ratiflow_issue_mentions_v4 (
  mention_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  request_id uuid not null,
  target_kind text not null check (target_kind in ('HUMAN','AGENT')),
  target_member_id uuid,
  target_profile_id uuid,
  target_snapshot jsonb not null check (jsonb_typeof(target_snapshot) = 'object'),
  thread_id uuid not null,
  comment_id uuid not null,
  task_id uuid,
  run_id uuid,
  created_by_member_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (document_id, request_id),
  unique (document_id, mention_id),
  foreign key (document_id, target_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, target_profile_id)
    references public.ratiflow_issue_agent_profiles_v4(document_id, profile_id),
  foreign key (document_id, thread_id)
    references public.ratiflow_issue_threads_v4(document_id, thread_id),
  foreign key (document_id, comment_id)
    references public.ratiflow_issue_comments_v4(document_id, comment_id),
  foreign key (document_id, task_id)
    references public.ratiflow_issue_tasks_v4(document_id, task_id),
  foreign key (document_id, created_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  constraint ratiflow_issue_mentions_target_shape_check check (
    (target_kind = 'HUMAN' and target_member_id is not null
      and target_profile_id is null and task_id is null and run_id is null)
    or (target_kind = 'AGENT' and target_member_id is null
      and target_profile_id is not null and task_id is not null and run_id is not null)
  )
);

create table public.ratiflow_issue_relay_runs_v4 (
  run_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  task_id uuid not null,
  profile_id uuid not null,
  specialty text not null check (specialty in ('DATA','CODE','GENERAL')),
  runtime text not null default 'OPENAI_LUNA_WEBMCP_RELAY'
    check (runtime = 'OPENAI_LUNA_WEBMCP_RELAY'),
  model text not null default 'gpt-5.6-luna' check (model = 'gpt-5.6-luna'),
  status text not null default 'QUEUED' check (status in (
    'QUEUED','ACTIVE','WAITING_RETRY','COMPLETED','EXHAUSTED','CANCELLED'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 2),
  max_attempts integer not null default 2 check (max_attempts = 2),
  terminal_reason text check (terminal_reason is null or terminal_reason in (
    'TASK_COMPLETED','ATTEMPTS_EXHAUSTED','TASK_CANCELLED','TASK_STALE'
  )),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (document_id, run_id),
  unique (document_id, task_id),
  foreign key (document_id, task_id)
    references public.ratiflow_issue_tasks_v4(document_id, task_id),
  foreign key (document_id, profile_id)
    references public.ratiflow_issue_agent_profiles_v4(document_id, profile_id),
  constraint ratiflow_issue_relay_run_terminal_check check (
    (status in ('QUEUED','ACTIVE','WAITING_RETRY') and completed_at is null)
    or (status in ('COMPLETED','EXHAUSTED','CANCELLED') and completed_at is not null)
  ),
  constraint ratiflow_issue_relay_run_reason_check check (
    (status in ('QUEUED','ACTIVE','WAITING_RETRY') and terminal_reason is null)
    or (status='COMPLETED' and terminal_reason='TASK_COMPLETED')
    or (status='EXHAUSTED' and terminal_reason='ATTEMPTS_EXHAUSTED')
    or (status='CANCELLED' and terminal_reason in ('TASK_CANCELLED','TASK_STALE'))
  )
);
create unique index ratiflow_issue_relay_one_active_document_idx
  on public.ratiflow_issue_relay_runs_v4 (document_id) where status = 'ACTIVE';
create index ratiflow_issue_relay_run_queue_idx
  on public.ratiflow_issue_relay_runs_v4 (document_id, created_at, run_id)
  where status in ('QUEUED','WAITING_RETRY');

alter table public.ratiflow_issue_mentions_v4
  add constraint ratiflow_issue_mentions_run_fk
  foreign key (document_id, run_id)
  references public.ratiflow_issue_relay_runs_v4(document_id, run_id)
  deferrable initially deferred;

create table public.ratiflow_issue_relay_attempts_v4 (
  attempt_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  run_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 2),
  status text not null check (status in (
    'CLAIMED','DISCOVERING','AWAITING_MODEL','EXECUTING_TOOL','RECONCILING',
    'SUCCEEDED','FAILED','EXPIRED','CANCELLED'
  )),
  claimed_by_member_id uuid not null,
  claimed_by_display_name text not null check (char_length(btrim(claimed_by_display_name)) between 1 and 80),
  credential_session_digest text not null check (credential_session_digest ~ '^sha256:[0-9a-f]{64}$'),
  page_session_id uuid not null,
  page_session_digest text not null check (page_session_digest ~ '^sha256:[0-9a-f]{64}$'),
  claim_request_id uuid not null,
  retry_run_id uuid,
  registration_generation integer not null check (registration_generation between 1 and 2),
  registration_scope text not null check (registration_scope ~ '^[a-f0-9]{16}$'),
  lease_id uuid not null,
  lease_expires_at timestamptz not null,
  grant_claims jsonb not null check (jsonb_typeof(grant_claims) = 'object'),
  grant_digest text check (grant_digest is null or grant_digest ~ '^sha256:[0-9a-f]{64}$'),
  grant_revoked_at timestamptz,
  provider_dispatched boolean not null default false,
  provider_call_count integer not null default 0 check (provider_call_count between 0 and 6),
  tool_call_count integer not null default 0 check (tool_call_count between 0 and 8),
  current_step integer not null default 0 check (current_step between 0 and 6),
  previous_provider_response_id text check (
    previous_provider_response_id is null or octet_length(previous_provider_response_id) between 1 and 1024
  ),
  previous_outcome jsonb check (previous_outcome is null or jsonb_typeof(previous_outcome) = 'object'),
  approved_manifest jsonb check (approved_manifest is null or jsonb_typeof(approved_manifest) = 'object'),
  approved_manifest_digest text check (
    approved_manifest_digest is null or approved_manifest_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  started_at timestamptz not null,
  deadline_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz,
  unique (document_id, attempt_id),
  unique (run_id, attempt_number),
  unique (document_id, claim_request_id),
  foreign key (document_id, run_id)
    references public.ratiflow_issue_relay_runs_v4(document_id, run_id),
  foreign key (document_id, retry_run_id)
    references public.ratiflow_issue_relay_runs_v4(document_id, run_id),
  foreign key (document_id, claimed_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  constraint ratiflow_issue_relay_attempt_terminal_check check (
    (status in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED') and completed_at is not null)
    or (status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED') and completed_at is null)
  ),
  constraint ratiflow_issue_relay_attempt_retry_target_check check (
    retry_run_id is null or retry_run_id=run_id
  )
);
create index ratiflow_issue_relay_attempt_live_idx
  on public.ratiflow_issue_relay_attempts_v4 (document_id, lease_expires_at)
  where status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED');

create table public.ratiflow_issue_relay_trace_v4 (
  relay_event_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  relay_event_version bigint not null check (relay_event_version between 1 and 9007199254740991),
  run_id uuid not null,
  attempt_id uuid,
  kind text not null check (kind in (
    'RUN_QUEUED','RUN_CLAIMED','LEASE_RENEWED','IDLE_CATALOG_WITHDRAWN',
    'RELAY_CATALOG_REGISTERED','WEBMCP_TOOLCHANGE_OBSERVED',
    'MODEL_TOOL_SEARCH_REQUESTED','WEBMCP_GET_TOOLS_COMPLETED','MODEL_TOOL_SELECTED',
    'WEBMCP_EXECUTE_STARTED','WEBMCP_EXECUTE_COMPLETED','REVISION_COMMITTED',
    'RELAY_CATALOG_WITHDRAWN','IDLE_CATALOG_RESTORED','ATTEMPT_RECONCILING',
    'ATTEMPT_FAILED','RUN_WAITING_RETRY','RUN_COMPLETED','RUN_EXHAUSTED','RUN_CANCELLED'
  )),
  logical_tool_name text,
  physical_tool_name text,
  manifest_digest text check (manifest_digest is null or manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  arguments_digest text check (arguments_digest is null or arguments_digest ~ '^sha256:[0-9a-f]{64}$'),
  result_digest text check (result_digest is null or result_digest ~ '^sha256:[0-9a-f]{64}$'),
  detail jsonb not null default '{}'::jsonb check (
    jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096
  ),
  created_at timestamptz not null default clock_timestamp(),
  unique (document_id, relay_event_version),
  foreign key (document_id, run_id)
    references public.ratiflow_issue_relay_runs_v4(document_id, run_id),
  foreign key (document_id, attempt_id)
    references public.ratiflow_issue_relay_attempts_v4(document_id, attempt_id)
);
create index ratiflow_issue_relay_trace_state_idx
  on public.ratiflow_issue_relay_trace_v4 (document_id, relay_event_version desc);

create table ratiflow_document_private.issue_relay_execution_permits_v4 (
  permit_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  run_id uuid not null,
  attempt_id uuid not null,
  task_id uuid not null,
  profile_id uuid not null,
  function_call_id text not null check (octet_length(function_call_id) between 1 and 512),
  physical_tool_name text not null check (
    char_length(physical_tool_name) <= 64
    and physical_tool_name ~ '^rf_(data|code|general)_[a-f0-9]{16}_g[1-9][0-9]*_[a-z0-9_]+$'
  ),
  logical_tool_name text not null,
  arguments jsonb not null check (jsonb_typeof(arguments) = 'object' and octet_length(arguments::text) <= 8192),
  arguments_digest text not null check (arguments_digest ~ '^sha256:[0-9a-f]{64}$'),
  registration_generation integer not null check (registration_generation between 1 and 2),
  lease_id uuid not null,
  permit_claims jsonb not null check (jsonb_typeof(permit_claims) = 'object'),
  token_digest text check (token_digest is null or token_digest ~ '^sha256:[0-9a-f]{64}$'),
  downstream_request_id uuid not null default extensions.gen_random_uuid(),
  execution_request_id uuid,
  status text not null default 'ISSUED' check (status in ('ISSUED','EXECUTING','COMPLETED','FAILED','REVOKED')),
  result_receipt_id uuid unique,
  output text check (output is null or octet_length(output) <= 32768),
  output_digest text check (output_digest is null or output_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (attempt_id, function_call_id),
  foreign key (document_id, run_id)
    references public.ratiflow_issue_relay_runs_v4(document_id, run_id),
  foreign key (document_id, attempt_id)
    references public.ratiflow_issue_relay_attempts_v4(document_id, attempt_id),
  foreign key (document_id, task_id)
    references public.ratiflow_issue_tasks_v4(document_id, task_id),
  foreign key (document_id, profile_id)
    references public.ratiflow_issue_agent_profiles_v4(document_id, profile_id),
  constraint ratiflow_issue_relay_permit_state_check check (
    (status='ISSUED' and execution_request_id is null
      and result_receipt_id is null and output is null and output_digest is null
      and completed_at is null)
    or (status='EXECUTING' and execution_request_id is not null
      and token_digest is not null and result_receipt_id is null
      and output is null and output_digest is null and completed_at is null)
    or (status='COMPLETED' and execution_request_id is not null
      and token_digest is not null and result_receipt_id is not null
      and output is not null and output_digest is not null and completed_at is not null)
    or (status='FAILED' and execution_request_id is not null
      and result_receipt_id is null and output is null and output_digest is null
      and completed_at is not null)
    or (status='REVOKED' and execution_request_id is null
      and result_receipt_id is null and output is null and output_digest is null
      and completed_at is not null)
  )
);
create unique index issue_relay_permit_execution_request_idx
  on ratiflow_document_private.issue_relay_execution_permits_v4(
    attempt_id, execution_request_id
  ) where execution_request_id is not null;

create table ratiflow_document_private.issue_relay_steps_v4 (
  step_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  run_id uuid not null,
  attempt_id uuid not null,
  expected_step integer not null check (expected_step between 0 and 6),
  request_id uuid not null,
  input_digest text not null check (input_digest ~ '^sha256:[0-9a-f]{64}$'),
  status text not null default 'RESERVED' check (status in ('RESERVED','TERMINAL')),
  provider_response_id text check (provider_response_id is null or octet_length(provider_response_id) between 1 and 1024),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  approved_manifest_digest text check (
    approved_manifest_digest is null or approved_manifest_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  permit_id uuid references ratiflow_document_private.issue_relay_execution_permits_v4(permit_id),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (attempt_id, request_id),
  unique (attempt_id, expected_step),
  foreign key (document_id, run_id)
    references public.ratiflow_issue_relay_runs_v4(document_id, run_id),
  foreign key (document_id, attempt_id)
    references public.ratiflow_issue_relay_attempts_v4(document_id, attempt_id),
  constraint ratiflow_issue_relay_step_terminal_check check (
    (status = 'RESERVED' and result is null and completed_at is null)
    or (status = 'TERMINAL' and result is not null and completed_at is not null)
  )
);

create table ratiflow_document_private.issue_relay_provider_dispatches_v4 (
  dispatch_id uuid primary key default extensions.gen_random_uuid(),
  -- Intentionally no cascading lineage FKs: a document/reset deletion must not
  -- erase a recent deployment-wide spend charge before its rolling window ends.
  document_id uuid not null,
  attempt_id uuid not null unique,
  reserved_at timestamptz not null default clock_timestamp(),
  reservation_expires_at timestamptz not null,
  dispatched_at timestamptz,
  constraint issue_relay_provider_dispatch_time_check check (
    reservation_expires_at>reserved_at
    and (dispatched_at is null or dispatched_at>=reserved_at)
  )
);
create index issue_relay_provider_dispatch_global_window_idx
  on ratiflow_document_private.issue_relay_provider_dispatches_v4(dispatched_at)
  where dispatched_at is not null;
create index issue_relay_provider_dispatch_document_window_idx
  on ratiflow_document_private.issue_relay_provider_dispatches_v4(document_id, dispatched_at)
  where dispatched_at is not null;
create index issue_relay_provider_reservation_expiry_idx
  on ratiflow_document_private.issue_relay_provider_dispatches_v4(reservation_expires_at)
  where dispatched_at is null;

alter table public.ratiflow_issue_mentions_v4 enable row level security;
alter table public.ratiflow_issue_mentions_v4 force row level security;
alter table public.ratiflow_issue_relay_runs_v4 enable row level security;
alter table public.ratiflow_issue_relay_runs_v4 force row level security;
alter table public.ratiflow_issue_relay_attempts_v4 enable row level security;
alter table public.ratiflow_issue_relay_attempts_v4 force row level security;
alter table public.ratiflow_issue_relay_trace_v4 enable row level security;
alter table public.ratiflow_issue_relay_trace_v4 force row level security;
alter table ratiflow_document_private.issue_relay_execution_permits_v4 enable row level security;
alter table ratiflow_document_private.issue_relay_execution_permits_v4 force row level security;
alter table ratiflow_document_private.issue_relay_steps_v4 enable row level security;
alter table ratiflow_document_private.issue_relay_steps_v4 force row level security;
alter table ratiflow_document_private.issue_relay_provider_dispatches_v4 enable row level security;
alter table ratiflow_document_private.issue_relay_provider_dispatches_v4 force row level security;

revoke all on public.ratiflow_issue_mentions_v4 from public, anon, authenticated;
revoke all on public.ratiflow_issue_relay_runs_v4 from public, anon, authenticated;
revoke all on public.ratiflow_issue_relay_attempts_v4 from public, anon, authenticated;
revoke all on public.ratiflow_issue_relay_trace_v4 from public, anon, authenticated;
revoke all on ratiflow_document_private.issue_relay_execution_permits_v4 from public, anon, authenticated;
revoke all on ratiflow_document_private.issue_relay_steps_v4 from public, anon, authenticated;
revoke all on ratiflow_document_private.issue_relay_provider_dispatches_v4
  from public, anon, authenticated;

create or replace function ratiflow_document_private.relay_sha256_json_v4(p_value jsonb)
returns text language sql immutable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select 'sha256:' || encode(extensions.digest(p_value::text, 'sha256'), 'hex') $$;

create or replace function ratiflow_document_private.ensure_managed_agents_v4(p_document_id uuid)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_record record;
declare v_member_id uuid;
begin
  for v_record in select * from (values
    ('data','Data','Data · managed agent','COMPANY','DATA',
      array['read_assignment','read_document_context','read_collaboration_context','comment_on_assignment','submit_scoped_revision','query_demo_metrics']::text[],
      array['Synthetic demo data · northstar_launch_capacity','Synthetic demo data · inc_482_checkout_impact']::text[], '#2563EB'),
    ('code','Code','Code · managed agent','TEAM','CODE',
      array['read_assignment','read_document_context','read_collaboration_context','comment_on_assignment','submit_scoped_revision','search_demo_code','read_demo_file']::text[],
      array['Synthetic demo data · commit:7d3c9e1','Synthetic demo data · checkout.log']::text[], '#7C3AED'),
    ('general','General','General · managed agent','PERSONAL','GENERAL',
      array['read_assignment','read_document_context','read_collaboration_context','comment_on_assignment','submit_scoped_revision','read_company_style_guide','check_document_consistency']::text[],
      array['Synthetic demo data · Ratiflow company style guide','Synthetic demo data · Ratiflow consistency rules']::text[], '#0F766E')
  ) as seed(handle, name, principal_name, scope_name, specialty, tools, sources, color)
  loop
    if not exists (
      select 1 from public.ratiflow_issue_agent_profiles_v4 p
      where p.document_id = p_document_id and p.directory_handle = v_record.handle
    ) then
      v_member_id := extensions.gen_random_uuid();
      insert into public.ratiflow_document_members(document_id, member_id, display_name, color)
      values (p_document_id, v_member_id, v_record.principal_name, v_record.color);
      insert into public.ratiflow_issue_agent_profiles_v4(
        document_id, member_id, name, identity_source, identity_generation,
        first_seen_at, last_accessed_at, access_count, directory_handle,
        directory_scope, managed_specialty, managed_runtime, managed_readiness,
        managed_logical_tool_names, synthetic_source_labels
      ) values (
        p_document_id, v_member_id, v_record.name, 'DEMO_DIRECTORY', 1,
        clock_timestamp(), clock_timestamp(), 0, v_record.handle,
        v_record.scope_name, v_record.specialty, 'OPENAI_LUNA_WEBMCP_RELAY',
        'READY', v_record.tools, v_record.sources
      );
    end if;
  end loop;
end;
$$;

create function public.ratiflow_create_issue_task_v4(
  p_handle text,
  p_input jsonb,
  p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_request_id uuid;
declare v_replay jsonb;
begin
  if p_response_contract is null or p_response_contract not in ('v4','v4.1') then
    return ratiflow_document_private.legacy_create_issue_task_compat_v42(
      p_handle,p_input,p_response_contract
    );
  end if;
  select * into v_session
    from ratiflow_document_private.member_for_handle_v4(p_handle);
  if found and v_session.actor_type='HUMAN'
    and p_input is not null and jsonb_typeof(p_input)='object'
    and ratiflow_document_private.uuid_v4(p_input->'requestId')
    and ratiflow_document_private.uuid_v4(p_input->'assignedToMemberId') then
    select * into strict v_document from public.ratiflow_documents
      where id=v_session.document_id and protocol_version=4
        and expires_at>clock_timestamp() for update;
    if exists (
      select 1 from public.ratiflow_issue_agent_profiles_v4 p
      where p.document_id=v_document.id
        and p.member_id=(p_input->>'assignedToMemberId')::uuid
        and p.identity_source='DEMO_DIRECTORY'
    ) then
      v_request_id := (p_input->>'requestId')::uuid;
      v_replay := ratiflow_document_private.replay_v41(
        v_document.id,v_request_id,'CREATE_ISSUE_TASK_V4',
        v_session.member_id,'HUMAN',p_input
      );
      if v_replay is not null then return v_replay; end if;
      return ratiflow_document_private.record_v41(
        v_document.id,v_request_id,'CREATE_ISSUE_TASK_V4',
        v_session.member_id,'HUMAN',p_input,
        ratiflow_document_private.error_v4(
          'STALE_AGENT_PROFILE',
          'Managed directory agents require the directory mention flow.',false
        )
      );
    end if;
  end if;
  return ratiflow_document_private.legacy_create_issue_task_compat_v42(
    p_handle,p_input,p_response_contract
  );
end;
$$;

revoke all on function public.ratiflow_create_issue_task_v4(text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.ratiflow_create_issue_task_v4(text,jsonb,text)
  to anon,authenticated;

create or replace function ratiflow_document_private.relay_trace_append_v4(
  p_document_id uuid,
  p_run_id uuid,
  p_attempt_id uuid,
  p_kind text,
  p_logical_tool_name text default null,
  p_physical_tool_name text default null,
  p_manifest_digest text default null,
  p_arguments_digest text default null,
  p_result_digest text default null,
  p_detail jsonb default '{}'::jsonb
)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_version bigint;
declare v_event public.ratiflow_issue_relay_trace_v4%rowtype;
begin
  update public.ratiflow_documents
  set relay_event_version = relay_event_version + 1
  where id = p_document_id
  returning relay_event_version into strict v_version;
  insert into public.ratiflow_issue_relay_trace_v4(
    document_id, relay_event_version, run_id, attempt_id, kind,
    logical_tool_name, physical_tool_name, manifest_digest,
    arguments_digest, result_digest, detail
  ) values (
    p_document_id, v_version, p_run_id, p_attempt_id, p_kind,
    p_logical_tool_name, p_physical_tool_name, p_manifest_digest,
    p_arguments_digest, p_result_digest, coalesce(p_detail, '{}'::jsonb)
  ) returning * into v_event;
  return jsonb_build_object(
    'relayEventId', v_event.relay_event_id,
    'relayEventVersion', v_event.relay_event_version,
    'documentId', v_event.document_id,
    'runId', v_event.run_id,
    'attemptId', v_event.attempt_id,
    'kind', v_event.kind,
    'logicalToolName', v_event.logical_tool_name,
    'physicalToolName', v_event.physical_tool_name,
    'manifestDigest', v_event.manifest_digest,
    'argumentsDigest', v_event.arguments_digest,
    'resultDigest', v_event.result_digest,
    'detail', v_event.detail,
    'createdAt', v_event.created_at
  );
end;
$$;

create or replace function ratiflow_document_private.relay_run_json_v4(p_run_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'runId', r.run_id, 'taskId', r.task_id, 'profileId', r.profile_id,
    'specialty', r.specialty, 'runtime', r.runtime, 'model', r.model,
    'status', r.status, 'attemptCount', r.attempt_count,
    'maxAttempts', r.max_attempts, 'terminalReason', r.terminal_reason,
    'createdAt', r.created_at, 'updatedAt', r.updated_at,
    'completedAt', r.completed_at
  ) from public.ratiflow_issue_relay_runs_v4 r where r.run_id = p_run_id
$$;

create or replace function ratiflow_document_private.relay_attempt_json_v4(
  p_attempt_id uuid, p_claimed boolean default false, p_private boolean default false
)
returns jsonb language sql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'attemptId', a.attempt_id, 'runId', a.run_id,
    'attemptNumber', a.attempt_number, 'status', a.status,
    'claimedBy', ratiflow_document_private.member_json_v4(
      a.claimed_by_member_id, a.claimed_by_display_name
    ),
    'registrationGeneration', a.registration_generation,
    'registrationScope', a.registration_scope,
    'leaseExpiresAt', a.lease_expires_at,
    'providerDispatched', a.provider_dispatched,
    'providerCallCount', a.provider_call_count,
    'toolCallCount', a.tool_call_count,
    'currentStep', a.current_step,
    'startedAt', a.started_at, 'deadlineAt', a.deadline_at,
    'updatedAt', a.updated_at, 'completedAt', a.completed_at
  ) || case when p_private then jsonb_build_object('pageSessionId',a.page_session_id)
    else '{}'::jsonb end
    || case when p_private or p_claimed then jsonb_build_object('leaseId',a.lease_id)
      else '{}'::jsonb end
  from public.ratiflow_issue_relay_attempts_v4 a
  where a.attempt_id = p_attempt_id
$$;

create or replace function ratiflow_document_private.managed_agent_json_v4(p_profile_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'kind','AGENT','profileId',p.profile_id,
    'principal',ratiflow_document_private.member_json_v4(m.member_id,m.display_name),
    'handle',p.directory_handle,'displayName',p.name,'scope',p.directory_scope,
    'readiness',p.managed_readiness,'identitySource','DEMO_DIRECTORY',
    'specialty',p.managed_specialty,'runtime',p.managed_runtime,
    'logicalToolNames',to_jsonb(p.managed_logical_tool_names),
    'syntheticSourceLabels',to_jsonb(p.synthetic_source_labels)
  ) from public.ratiflow_issue_agent_profiles_v4 p
  join public.ratiflow_document_members m
    on m.document_id=p.document_id and m.member_id=p.member_id
  where p.profile_id=p_profile_id and p.identity_source='DEMO_DIRECTORY'
$$;

-- v4.1 sees only its already-legal identity source even for a managed compatibility projection.
create or replace function ratiflow_document_private.profile_json_v41(p_profile_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'profileId', p.profile_id,
    'member', ratiflow_document_private.member_json_v4(m.member_id, m.display_name),
    'name', p.name, 'identitySource', 'SELF_DECLARED',
    'firstSeenAt', p.first_seen_at, 'lastAccessedAt', p.last_accessed_at,
    'accessCount', p.access_count
  ) from public.ratiflow_issue_agent_profiles_v4 p
  join public.ratiflow_document_members m
    on m.document_id=p.document_id and m.member_id=p.member_id
  where p.profile_id=p_profile_id
$$;

create or replace function ratiflow_document_private.prevent_managed_agent_identity_update_v4()
returns trigger language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if old.identity_source='DEMO_DIRECTORY' and (
    new.name is distinct from old.name
    or new.member_id is distinct from old.member_id
    or new.identity_source is distinct from old.identity_source
    or new.identity_generation is distinct from old.identity_generation
    or new.directory_handle is distinct from old.directory_handle
    or new.directory_scope is distinct from old.directory_scope
    or new.managed_specialty is distinct from old.managed_specialty
    or new.managed_runtime is distinct from old.managed_runtime
    or new.managed_logical_tool_names is distinct from old.managed_logical_tool_names
    or new.synthetic_source_labels is distinct from old.synthetic_source_labels
  ) then raise exception 'managed directory identity is immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger ratiflow_issue_agent_profiles_managed_identity_v4
before update on public.ratiflow_issue_agent_profiles_v4
for each row execute function ratiflow_document_private.prevent_managed_agent_identity_update_v4();

create or replace function ratiflow_document_private.relay_logical_tool_v4(
  p_profile_id uuid,
  p_registration_scope text,
  p_registration_generation integer,
  p_physical_name text
)
returns text language sql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select logical_name from (
    select unnest(p.managed_logical_tool_names) as logical_name,
      unnest(case p.managed_specialty
        when 'DATA' then array['assignment','document','collaboration','progress','submit_revision','metrics']
        when 'CODE' then array['assignment','document','collaboration','progress','submit_revision','code_search','code_read']
        when 'GENERAL' then array['assignment','document','collaboration','progress','submit_revision','style_guide','consistency']
      end) as provider_key,
      lower(p.managed_specialty) as specialty
    from public.ratiflow_issue_agent_profiles_v4 p
    where p.profile_id = p_profile_id and p.identity_source = 'DEMO_DIRECTORY'
  ) catalog
  where p_physical_name = 'rf_' || specialty || '_' || p_registration_scope
    || '_g' || p_registration_generation::text || '_' || provider_key
$$;

create or replace function ratiflow_document_private.relay_trace_json_v4(p_event_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'relayEventId', e.relay_event_id,
    'relayEventVersion', e.relay_event_version,
    'documentId', e.document_id, 'runId', e.run_id,
    'attemptId', e.attempt_id, 'kind', e.kind,
    'logicalToolName', e.logical_tool_name,
    'physicalToolName', e.physical_tool_name,
    'manifestDigest', e.manifest_digest,
    'argumentsDigest', e.arguments_digest,
    'resultDigest', e.result_digest,
    'detail', e.detail, 'createdAt', e.created_at
  ) from public.ratiflow_issue_relay_trace_v4 e
  where e.relay_event_id = p_event_id
$$;

create or replace function ratiflow_document_private.relay_directory_v4(p_document_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  with managed_members as (
    select p.member_id from public.ratiflow_issue_agent_profiles_v4 p
    where p.document_id = p_document_id and p.identity_source = 'DEMO_DIRECTORY'
  ), reserved_handles as (
    select distinct regexp_replace(lower(raw_handle),'[^a-z0-9]+','-','g') as handle
    from unnest(array[
      'data','code','general','system','user','assistant','tool','webmcp','ratiflow',
      'read_assignment','read_document_context','read_collaboration_context',
      'comment_on_assignment','submit_scoped_revision','query_demo_metrics',
      'search_demo_code','read_demo_file','read_company_style_guide',
      'check_document_consistency','connect_agent','inspect_document',
      'read_document_history','list_my_tasks','wait_for_my_tasks','comment_on_task',
      'submit_task_result'
    ]::text[]) as reserved(raw_handle)
  ), humans as (
    select 0 as group_order, lower(m.display_name) as item_order,
      m.member_id as stable_id,'h'::text as kind_tag,
      coalesce(nullif(trim(both '-' from regexp_replace(
        lower(m.display_name), '[^a-z0-9]+', '-', 'g'
      )),''),'member-' || left(m.member_id::text,8)) as base_handle,
      jsonb_build_object(
        'kind','HUMAN',
        'member',ratiflow_document_private.member_json_v4(m.member_id,m.display_name),
        'displayName',m.display_name
      ) as entry
    from public.ratiflow_document_members m
    where m.document_id=p_document_id
      and not exists (select 1 from managed_members x where x.member_id=m.member_id)
  ), managed as (
    select 1 as group_order,
      case p.directory_handle when 'data' then '1' when 'code' then '2' else '3' end as item_order,
      p.profile_id as stable_id,
      ratiflow_document_private.managed_agent_json_v4(p.profile_id) as entry
    from public.ratiflow_issue_agent_profiles_v4 p
    where p.document_id=p_document_id and p.identity_source='DEMO_DIRECTORY'
  ), self_declared as (
    select 2 as group_order, lower(p.name) as item_order,
      p.profile_id as stable_id,'a'::text as kind_tag,
      coalesce(nullif(trim(both '-' from regexp_replace(
        lower(p.name), '[^a-z0-9]+', '-', 'g'
      )),''),'agent-' || left(p.profile_id::text,8)) as base_handle,
      jsonb_build_object(
        'kind','AGENT','profileId',p.profile_id,
        'principal',ratiflow_document_private.member_json_v4(m.member_id,m.display_name),
        'displayName',p.name,'scope','PERSONAL','readiness','READY',
        'identitySource','SELF_DECLARED','specialty','GENERAL',
        'runtime','BRING_YOUR_OWN_AGENT',
        'logicalToolNames',to_jsonb(array[
          'connect_agent','inspect_document','read_document_history',
          'read_collaboration_context','list_my_tasks','wait_for_my_tasks',
          'comment_on_task','submit_task_result'
        ]::text[]),
        'syntheticSourceLabels','[]'::jsonb
      ) as entry
    from public.ratiflow_issue_agent_profiles_v4 p
    join public.ratiflow_document_members m
      on m.document_id=p.document_id and m.member_id=p.member_id
    where p.document_id=p_document_id and p.identity_source='SELF_DECLARED'
  ), raw_nonmanaged as (
    select * from humans union all select * from self_declared
  ), ranked_nonmanaged as (
    select raw_nonmanaged.*,
      count(*) over (partition by lower(base_handle)) as handle_count
    from raw_nonmanaged
  ), nonmanaged as (
    select group_order,item_order,stable_id,
      entry || jsonb_build_object('handle',case
        when handle_count>1 or exists (
          select 1 from reserved_handles r where r.handle=lower(base_handle)
        ) then base_handle || '-' || kind_tag || '-'
          || replace(stable_id::text,'-','')
        else base_handle end) as entry
    from ranked_nonmanaged
  ), entries as (
    select * from nonmanaged union all select * from managed
  )
  select coalesce(jsonb_agg(entry order by group_order,item_order,stable_id),'[]'::jsonb)
  from entries
$$;

create or replace function ratiflow_document_private.recover_completed_relay_permits_v4(
  p_document_id uuid,
  p_run_id uuid,
  p_attempt_id uuid default null,
  p_permit_id uuid default null
)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_permit ratiflow_document_private.issue_relay_execution_permits_v4%rowtype;
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_ledger public.ratiflow_document_request_ledger%rowtype;
declare v_operation text;
declare v_output_json jsonb;
declare v_output text;
declare v_receipt uuid;
declare v_digest text;
declare v_member_id uuid;
declare v_mutation_input jsonb;
declare v_expected_fingerprint text;
declare v_now timestamptz := clock_timestamp();
begin
  for v_permit in
    select permit.*
    from ratiflow_document_private.issue_relay_execution_permits_v4 permit
    where permit.document_id=p_document_id and permit.run_id=p_run_id
      and (p_attempt_id is null or permit.attempt_id=p_attempt_id)
      and (p_permit_id is null or permit.permit_id=p_permit_id)
      and permit.status='EXECUTING'
      and permit.logical_tool_name in (
        'comment_on_assignment','submit_scoped_revision'
      )
    order by permit.created_at,permit.permit_id for update of permit
  loop
    v_operation := case v_permit.logical_tool_name
      when 'comment_on_assignment' then 'COMMENT_ON_ISSUE_TASK_V4'
      else 'SUBMIT_ISSUE_TASK_RESULT_V4' end;
    select p.member_id into v_member_id
      from public.ratiflow_issue_agent_profiles_v4 p
      where p.document_id=v_permit.document_id
        and p.profile_id=v_permit.profile_id
        and p.identity_source='DEMO_DIRECTORY';
    if not found then continue; end if;
    select attempt.* into v_attempt
      from public.ratiflow_issue_relay_attempts_v4 attempt
      where attempt.document_id=v_permit.document_id
        and attempt.run_id=v_permit.run_id
        and attempt.attempt_id=v_permit.attempt_id;
    if not found then continue; end if;
    v_mutation_input := v_permit.arguments || jsonb_build_object(
      'requestId',v_permit.downstream_request_id,'taskId',v_permit.task_id
    );
    v_expected_fingerprint := ratiflow_document_private.request_fingerprint_v41(
      v_operation,v_member_id,'AGENT',v_mutation_input,
      v_attempt.attempt_id,v_attempt.page_session_id
    );
    select ledger.* into v_ledger
      from public.ratiflow_document_request_ledger ledger
      where ledger.document_id=v_permit.document_id
        and ledger.request_id=v_permit.downstream_request_id
        and ledger.operation=v_operation
        and ledger.fingerprint=v_expected_fingerprint;
    if not found then continue; end if;
    if v_ledger.result->>'ok'='true'
      and jsonb_typeof(v_ledger.result->'data')='object' then
      if v_permit.logical_tool_name='comment_on_assignment'
        and jsonb_typeof(v_ledger.result->'data'->'comment')='object' then
        v_output_json := jsonb_build_object('ok',true,'data',jsonb_build_object(
          'comment',v_ledger.result->'data'->'comment'
        ));
      elsif v_permit.logical_tool_name='submit_scoped_revision'
        and jsonb_typeof(v_ledger.result->'data'->'revision')='object'
        and jsonb_typeof(v_ledger.result->'data'->'task')='object' then
        v_output_json := jsonb_build_object('ok',true,'data',jsonb_build_object(
          'revision',v_ledger.result->'data'->'revision',
          'task',v_ledger.result->'data'->'task'
        ));
      else
        v_output_json := jsonb_build_object(
          'ok',false,'code','PROTOCOL_MISMATCH',
          'message','The recovered managed result was invalid.','retryable',false
        );
      end if;
    elsif v_ledger.result->>'ok'='false' then
      v_output_json := jsonb_build_object(
        'ok',false,
        'code',coalesce(v_ledger.result->>'code','PROTOCOL_MISMATCH'),
        'message',coalesce(v_ledger.result->>'message','The managed mutation failed.'),
        'retryable',case when jsonb_typeof(v_ledger.result->'retryable')='boolean'
          then (v_ledger.result->>'retryable')::boolean else false end
      );
    else
      v_output_json := jsonb_build_object(
        'ok',false,'code','PROTOCOL_MISMATCH',
        'message','The recovered managed result was invalid.','retryable',false
      );
    end if;
    v_output := v_output_json::text;
    if octet_length(v_output)>32768 then
      v_output := jsonb_build_object(
        'ok',false,'code','PROTOCOL_MISMATCH',
        'message','The managed tool result exceeded its durable bound.',
        'retryable',false
      )::text;
    end if;
    v_receipt := extensions.gen_random_uuid();
    v_digest := 'sha256:'||encode(extensions.digest(v_output,'sha256'),'hex');
    update ratiflow_document_private.issue_relay_execution_permits_v4 set
      status='COMPLETED',result_receipt_id=v_receipt,output=v_output,
      output_digest=v_digest,completed_at=v_now
      where permit_id=v_permit.permit_id and status='EXECUTING';
    if found then
      update public.ratiflow_issue_relay_attempts_v4 a set
        status=case when r.status='COMPLETED' then 'SUCCEEDED' else 'AWAITING_MODEL' end,
        completed_at=case when r.status='COMPLETED'
          then coalesce(a.completed_at,r.completed_at,v_now) else null end,
        updated_at=v_now
        from public.ratiflow_issue_relay_runs_v4 r
        where a.attempt_id=v_permit.attempt_id and r.run_id=v_permit.run_id
          and r.status in ('ACTIVE','COMPLETED');
      perform ratiflow_document_private.relay_trace_append_v4(
        v_permit.document_id,v_permit.run_id,v_permit.attempt_id,
        'WEBMCP_EXECUTE_COMPLETED',
        p_logical_tool_name=>v_permit.logical_tool_name,
        p_physical_tool_name=>v_permit.physical_tool_name,
        p_arguments_digest=>v_permit.arguments_digest,
        p_result_digest=>v_digest,
        p_detail=>jsonb_build_object('recoveredFromRequestLedger',true)
      );
    end if;
  end loop;
end;
$$;

create or replace function ratiflow_document_private.reconcile_relay_v4(p_document_id uuid)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_latest_attempt_id uuid;
declare v_now timestamptz := clock_timestamp();
begin
  -- A committed scoped revision is authoritative even if the final prose
  -- response was lost. Repair any pre-release unknown-outcome downgrade before
  -- projecting activeAttempt so a completed run can never be reopened.
  update public.ratiflow_issue_relay_attempts_v4 a set
    status='SUCCEEDED',completed_at=coalesce(a.completed_at,r.completed_at,v_now),
    updated_at=v_now
    from public.ratiflow_issue_relay_runs_v4 r
    where a.document_id=p_document_id and a.run_id=r.run_id
      and r.status='COMPLETED' and r.terminal_reason='TASK_COMPLETED'
      and a.status='RECONCILING'
      and exists (
        select 1 from ratiflow_document_private.issue_relay_steps_v4 s
        where s.attempt_id=a.attempt_id and s.status='TERMINAL'
          and s.result->>'ok'='false'
          and s.result->>'code'='RELAY_PROVIDER_OUTCOME_UNKNOWN'
      );
  -- A completed mutation may commit before the browser's best-effort release RPC
  -- arrives. Once the browser has observed idle restoration, state reconciliation
  -- can durably close that truthful sequence if the release response was lost.
  for v_run in
    select r.* from public.ratiflow_issue_relay_runs_v4 r
    where r.document_id=p_document_id and r.status='COMPLETED'
      and r.terminal_reason='TASK_COMPLETED'
      and not exists(select 1 from public.ratiflow_issue_relay_trace_v4 e
        where e.run_id=r.run_id and e.kind='RUN_COMPLETED')
      and exists(select 1 from public.ratiflow_issue_relay_trace_v4 e
        where e.run_id=r.run_id and e.kind='IDLE_CATALOG_RESTORED')
    order by r.created_at,r.run_id for update
  loop
    select a.attempt_id into v_latest_attempt_id
      from public.ratiflow_issue_relay_attempts_v4 a
      where a.run_id=v_run.run_id order by a.attempt_number desc limit 1;
    perform ratiflow_document_private.recover_completed_relay_permits_v4(
      p_document_id,v_run.run_id,v_latest_attempt_id
    );
    perform ratiflow_document_private.relay_trace_append_v4(
      p_document_id,v_run.run_id,v_latest_attempt_id,'RUN_COMPLETED'
    );
  end loop;
  for v_run in
    select r.* from public.ratiflow_issue_relay_runs_v4 r
    where r.document_id=p_document_id
      and r.status in ('QUEUED','WAITING_RETRY')
      and r.attempt_count>=r.max_attempts
    order by r.created_at,r.run_id for update
  loop
    update public.ratiflow_issue_relay_runs_v4 set status='EXHAUSTED',
      terminal_reason='ATTEMPTS_EXHAUSTED',updated_at=v_now,completed_at=v_now
      where run_id=v_run.run_id;
    select a.attempt_id into v_latest_attempt_id
      from public.ratiflow_issue_relay_attempts_v4 a
      where a.run_id=v_run.run_id order by a.attempt_number desc limit 1;
    if not exists(select 1 from public.ratiflow_issue_relay_trace_v4 e
      where e.run_id=v_run.run_id and e.kind='RUN_EXHAUSTED') then
      perform ratiflow_document_private.relay_trace_append_v4(
        p_document_id,v_run.run_id,v_latest_attempt_id,'RUN_EXHAUSTED'
      );
    end if;
  end loop;
  for v_attempt in
    select a.* from public.ratiflow_issue_relay_attempts_v4 a
    join public.ratiflow_issue_relay_runs_v4 r on r.run_id=a.run_id
    where a.document_id=p_document_id and r.status='ACTIVE'
      and a.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
      and (a.lease_expires_at <= v_now or a.deadline_at <= v_now)
    order by a.attempt_number for update of a
  loop
    select * into strict v_run from public.ratiflow_issue_relay_runs_v4
      where run_id=v_attempt.run_id for update;
    update ratiflow_document_private.issue_relay_execution_permits_v4
      set status='REVOKED', completed_at=coalesce(completed_at,v_now)
      where attempt_id=v_attempt.attempt_id and status='ISSUED';
    if v_attempt.provider_dispatched and v_attempt.deadline_at <= v_now then
      update ratiflow_document_private.issue_relay_execution_permits_v4
        set status='FAILED',completed_at=v_now
        where attempt_id=v_attempt.attempt_id and status='EXECUTING';
      update public.ratiflow_issue_relay_attempts_v4 set
        status='FAILED',grant_revoked_at=coalesce(grant_revoked_at,v_now),
        updated_at=v_now,completed_at=v_now where attempt_id=v_attempt.attempt_id;
      update public.ratiflow_issue_relay_runs_v4 set
        status=case when attempt_count>=max_attempts then 'EXHAUSTED' else 'WAITING_RETRY' end,
        terminal_reason=case when attempt_count>=max_attempts
          then 'ATTEMPTS_EXHAUSTED' else null end,
        completed_at=case when attempt_count>=max_attempts then v_now else null end,
        updated_at=v_now where run_id=v_run.run_id returning * into v_run;
      perform ratiflow_document_private.relay_trace_append_v4(
        p_document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_FAILED',
        p_detail=>jsonb_build_object('reason','ATTEMPT_DEADLINE_EXPIRED')
      );
      perform ratiflow_document_private.relay_trace_append_v4(
        p_document_id,v_run.run_id,v_attempt.attempt_id,
        case v_run.status when 'EXHAUSTED' then 'RUN_EXHAUSTED'
          else 'RUN_WAITING_RETRY' end
      );
    elsif v_attempt.provider_dispatched then
      if v_attempt.status <> 'RECONCILING' then
        update public.ratiflow_issue_relay_attempts_v4
          set status='RECONCILING',updated_at=v_now where attempt_id=v_attempt.attempt_id;
        perform ratiflow_document_private.relay_trace_append_v4(
          p_document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_RECONCILING'
        );
      end if;
    else
      delete from ratiflow_document_private.issue_relay_provider_dispatches_v4
        where attempt_id=v_attempt.attempt_id and dispatched_at is null;
      update public.ratiflow_issue_relay_attempts_v4 set
        status='EXPIRED',grant_revoked_at=coalesce(grant_revoked_at,v_now),
        updated_at=v_now,completed_at=v_now where attempt_id=v_attempt.attempt_id;
      update public.ratiflow_issue_relay_runs_v4 set
        status=case when attempt_count>=max_attempts then 'EXHAUSTED' else 'QUEUED' end,
        terminal_reason=case when attempt_count>=max_attempts
          then 'ATTEMPTS_EXHAUSTED' else null end,
        completed_at=case when attempt_count>=max_attempts then v_now else null end,
        updated_at=v_now where run_id=v_run.run_id returning * into v_run;
      perform ratiflow_document_private.relay_trace_append_v4(
        p_document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_FAILED',
        p_detail=>jsonb_build_object('reason','LEASE_EXPIRED_BEFORE_DISPATCH')
      );
      if v_run.status='EXHAUSTED' then
        perform ratiflow_document_private.relay_trace_append_v4(
          p_document_id,v_run.run_id,v_attempt.attempt_id,'RUN_EXHAUSTED'
        );
      end if;
    end if;
  end loop;
end;
$$;

create or replace function ratiflow_document_private.cancel_relay_for_task_v4()
returns trigger language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_attempt_id uuid;
declare v_at timestamptz := clock_timestamp();
begin
  if new.status is not distinct from old.status or new.agent_profile_id is null then
    return new;
  end if;
  select * into v_run from public.ratiflow_issue_relay_runs_v4
    where document_id=new.document_id and task_id=new.task_id for update;
  if not found then return new; end if;
  select attempt_id into v_attempt_id from public.ratiflow_issue_relay_attempts_v4
    where run_id=v_run.run_id order by attempt_number desc limit 1;
  if new.status in ('CANCELLED','STALE')
    and v_run.status not in ('COMPLETED','EXHAUSTED','CANCELLED') then
    update public.ratiflow_issue_relay_runs_v4 set status='CANCELLED',
      terminal_reason=case new.status when 'STALE' then 'TASK_STALE' else 'TASK_CANCELLED' end,
      updated_at=v_at,completed_at=v_at where run_id=v_run.run_id;
    update public.ratiflow_issue_relay_attempts_v4 set status='CANCELLED',
      grant_revoked_at=coalesce(grant_revoked_at,v_at),updated_at=v_at,completed_at=v_at
      where run_id=v_run.run_id and status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED');
    update ratiflow_document_private.issue_relay_execution_permits_v4
      set status='REVOKED',completed_at=coalesce(completed_at,v_at)
      where run_id=v_run.run_id and status='ISSUED';
    update ratiflow_document_private.issue_relay_execution_permits_v4
      set status='FAILED',completed_at=coalesce(completed_at,v_at)
      where run_id=v_run.run_id and status='EXECUTING';
    delete from ratiflow_document_private.issue_relay_provider_dispatches_v4
      where attempt_id in (
        select a.attempt_id from public.ratiflow_issue_relay_attempts_v4 a
        where a.run_id=v_run.run_id and not a.provider_dispatched
      ) and dispatched_at is null;
    perform ratiflow_document_private.relay_trace_append_v4(
      new.document_id,v_run.run_id,v_attempt_id,'RUN_CANCELLED',
      p_detail=>jsonb_build_object('terminalReason',
        case new.status when 'STALE' then 'TASK_STALE' else 'TASK_CANCELLED' end)
    );
  elsif new.status='COMPLETED' and v_run.status not in ('COMPLETED','EXHAUSTED','CANCELLED') then
    update public.ratiflow_issue_relay_runs_v4 set status='COMPLETED',
      terminal_reason='TASK_COMPLETED',updated_at=v_at,completed_at=v_at
      where run_id=v_run.run_id;
    update public.ratiflow_issue_relay_attempts_v4 set status='SUCCEEDED',
      updated_at=v_at,completed_at=v_at where run_id=v_run.run_id
      and status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED');
    update ratiflow_document_private.issue_relay_execution_permits_v4
      set status='REVOKED',completed_at=coalesce(completed_at,v_at)
      where run_id=v_run.run_id and status='ISSUED';
    delete from ratiflow_document_private.issue_relay_provider_dispatches_v4
      where attempt_id in (
        select a.attempt_id from public.ratiflow_issue_relay_attempts_v4 a
        where a.run_id=v_run.run_id and not a.provider_dispatched
      ) and dispatched_at is null;
    perform ratiflow_document_private.relay_trace_append_v4(
      new.document_id,v_run.run_id,v_attempt_id,'REVISION_COMMITTED',
      p_detail=>jsonb_build_object('revision',coalesce(new.result_revision,old.result_revision))
    );
  end if;
  return new;
end;
$$;
create trigger ratiflow_issue_task_relay_lineage_v4
after update of status on public.ratiflow_issue_tasks_v4
for each row execute function ratiflow_document_private.cancel_relay_for_task_v4();

create or replace function public.ratiflow_read_issue_relay_state_v4(p_handle text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_attempt_id uuid;
declare v_state jsonb;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized_v4('A valid human session is required.');
  end if;
  perform 1 from public.ratiflow_documents where id=v_session.document_id
    and protocol_version=4 and expires_at>clock_timestamp() for update;
  perform ratiflow_document_private.ensure_managed_agents_v4(v_session.document_id);
  perform ratiflow_document_private.reconcile_relay_v4(v_session.document_id);
  select a.attempt_id into v_attempt_id
    from public.ratiflow_issue_relay_attempts_v4 a
    join public.ratiflow_issue_relay_runs_v4 r on r.run_id=a.run_id
    where a.document_id=v_session.document_id and r.status='ACTIVE'
      and a.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
    order by a.attempt_number desc limit 1;
  select jsonb_build_object(
    'directory',ratiflow_document_private.relay_directory_v4(v_session.document_id),
    'runs',coalesce((select jsonb_agg(
      ratiflow_document_private.relay_run_json_v4(r.run_id)
      order by r.created_at,r.run_id
    ) from public.ratiflow_issue_relay_runs_v4 r
      where r.document_id=v_session.document_id),'[]'::jsonb),
    'activeAttempt',case when v_attempt_id is null then null else
      ratiflow_document_private.relay_attempt_json_v4(v_attempt_id,false,false) end,
    'trace',coalesce((select jsonb_agg(
      ratiflow_document_private.relay_trace_json_v4(recent.relay_event_id)
      order by recent.relay_event_version
    ) from (select e.relay_event_id,e.relay_event_version
      from public.ratiflow_issue_relay_trace_v4 e
      where e.document_id=v_session.document_id
      order by e.relay_event_version desc limit 100) recent),'[]'::jsonb),
    'currentRelayEventVersion',(select relay_event_version from public.ratiflow_documents
      where id=v_session.document_id),
    'webMcpRequired',true,'recoveryHeartbeatMs',15000
  ) into v_state;
  return jsonb_build_object('ok',true,'data',v_state);
end;
$$;

create or replace function public.ratiflow_create_issue_directory_mention_v4(
  p_handle text,
  p_request_id uuid,
  p_input jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_member public.ratiflow_document_members%rowtype;
declare v_profile public.ratiflow_issue_agent_profiles_v4%rowtype;
declare v_anchor jsonb;
declare v_context jsonb;
declare v_fingerprint_input jsonb;
declare v_replay jsonb;
declare v_result jsonb;
declare v_target jsonb;
declare v_comment text;
declare v_token text;
declare v_instruction text;
declare v_source text;
declare v_task_id uuid := extensions.gen_random_uuid();
declare v_thread_id uuid := extensions.gen_random_uuid();
declare v_comment_id uuid := extensions.gen_random_uuid();
declare v_run_id uuid := extensions.gen_random_uuid();
declare v_at timestamptz;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized_v4('A valid human session is required.');
  end if;
  select * into strict v_document from public.ratiflow_documents
    where id=v_session.document_id and protocol_version=4
      and expires_at>clock_timestamp() for update;
  v_fingerprint_input := coalesce(p_input,'null'::jsonb)
    || jsonb_build_object('requestId',p_request_id);
  if p_request_id is null then
    return ratiflow_document_private.invalid_v4('A UUID idempotency key is required.');
  end if;
  v_replay := ratiflow_document_private.replay_v41(
    v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
    v_session.member_id,'HUMAN',v_fingerprint_input
  );
  if v_replay is not null then return v_replay; end if;
  if not ratiflow_document_private.input_v4(
      p_input,array['expectedRevision','comment','target','anchor'],'{}')
    or not ratiflow_document_private.counter_v4(p_input->'expectedRevision',1)
    or not ratiflow_document_private.text_v4(p_input->'comment',2000,false)
    or jsonb_typeof(p_input->'target') <> 'object' then
    v_result := ratiflow_document_private.invalid_v4('The directory mention input is invalid.');
    return ratiflow_document_private.record_v41(
      v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
      v_session.member_id,'HUMAN',v_fingerprint_input,v_result
    );
  end if;
  if (p_input->>'expectedRevision')::bigint <> v_document.revision then
    v_result := ratiflow_document_private.stale_document_v4(
      v_document.id,(p_input->>'expectedRevision')::bigint
    );
    return ratiflow_document_private.record_v41(
      v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
      v_session.member_id,'HUMAN',v_fingerprint_input,v_result
    );
  end if;
  perform ratiflow_document_private.ensure_managed_agents_v4(v_document.id);
  v_target := p_input->'target';
  v_comment := p_input->>'comment';

  if ratiflow_document_private.input_v4(v_target,array['kind','memberId'],'{}')
    and v_target->>'kind'='HUMAN'
    and ratiflow_document_private.uuid_v4(v_target->'memberId') then
    select m.* into v_member from public.ratiflow_document_members m
      where m.document_id=v_document.id and m.member_id=(v_target->>'memberId')::uuid
        and not exists (select 1 from public.ratiflow_issue_agent_profiles_v4 p
          where p.document_id=m.document_id and p.member_id=m.member_id
            and p.identity_source='DEMO_DIRECTORY')
      for share;
    if not found then
      v_result := ratiflow_document_private.error_v4(
        'STALE_MENTION_TARGET','The selected human changed. Choose them again.',false
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    v_token := '@' || v_member.display_name;
    if left(v_comment,char_length(v_token)) <> v_token
      or char_length(v_comment) <= char_length(v_token)
      or substring(v_comment from char_length(v_token)+1 for 1) not in (' ',chr(9),chr(10),chr(13))
      or char_length(btrim(substring(v_comment from char_length(v_token)+1),E' \t\r\n'))=0 then
      v_result := ratiflow_document_private.error_v4(
        'STALE_MENTION_TARGET','The selected human changed. Choose them again.',false
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    v_anchor := ratiflow_document_private.anchor_from_input_v4(v_document.id,p_input->'anchor');
    if v_anchor is null then
      v_result := ratiflow_document_private.invalid_v4('The discussion target is invalid.');
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    if (select count(*) from public.ratiflow_issue_threads_v4
        where document_id=v_document.id and task_id is null) >= 500 then
      v_result := ratiflow_document_private.error_v4(
        'RATE_LIMITED','The standalone thread limit has been reached.',false
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    v_at := greatest(clock_timestamp(),v_document.updated_at+interval '1 microsecond');
    insert into public.ratiflow_issue_threads_v4(
      thread_id,document_id,task_id,creation_anchor,anchor_scope,anchor_field,
      range_start,range_end,selected_text,created_revision,anchor_revision,
      anchor_state,created_by_member_id,created_by_display_name,created_at
    ) values (
      v_thread_id,v_document.id,null,v_anchor,v_anchor->>'scope',v_anchor->>'field',
      (v_anchor->>'rangeStart')::bigint,(v_anchor->>'rangeEnd')::bigint,
      v_anchor->>'selectedText',v_document.revision,v_document.revision,'ACTIVE',
      v_session.member_id,v_session.display_name,v_at
    );
    insert into public.ratiflow_issue_comments_v4(
      comment_id,document_id,thread_id,author_actor_type,author_member_id,
      author_display_name,origin,created_revision,body,created_at
    ) values (
      v_comment_id,v_document.id,v_thread_id,'HUMAN',v_session.member_id,
      v_session.display_name,'ORDINARY_UI',v_document.revision,v_comment,v_at
    );
    perform ratiflow_document_private.bump_activity_v4(
      v_document.id,'THREAD_CREATED','HUMAN',v_session.member_id,
      v_session.display_name,'ORDINARY_UI',null,null,v_thread_id,v_comment_id,v_at
    );
    insert into public.ratiflow_issue_mentions_v4(
      document_id,request_id,target_kind,target_member_id,target_snapshot,
      thread_id,comment_id,created_by_member_id,created_at
    ) values (
      v_document.id,p_request_id,'HUMAN',v_member.member_id,
      jsonb_build_object('kind','HUMAN','member',
        ratiflow_document_private.member_json_v4(v_member.member_id,v_member.display_name),
        'handle',coalesce(nullif(trim(both '-' from regexp_replace(
          lower(v_member.display_name),'[^a-z0-9]+','-','g')),''),
          'member-'||left(v_member.member_id::text,8)),
        'displayName',v_member.display_name),
      v_thread_id,v_comment_id,v_session.member_id,v_at
    );
    v_result := jsonb_build_object('ok',true,'data',jsonb_build_object(
      'outcome','DISCUSSION_CREATED','target',v_target,'threadId',v_thread_id,
      'commentId',v_comment_id,'taskId',null,'runId',null
    ));
  elsif ratiflow_document_private.input_v4(v_target,array['kind','profileId'],'{}')
    and v_target->>'kind'='AGENT'
    and ratiflow_document_private.uuid_v4(v_target->'profileId') then
    select * into v_profile from public.ratiflow_issue_agent_profiles_v4
      where document_id=v_document.id and profile_id=(v_target->>'profileId')::uuid
        and identity_source='DEMO_DIRECTORY' for share;
    if not found then
      v_result := ratiflow_document_private.error_v4(
        'STALE_MENTION_TARGET','The selected managed agent changed. Choose it again.',false
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    if v_profile.managed_readiness <> 'READY' then
      v_result := ratiflow_document_private.error_v4(
        'RELAY_UNAVAILABLE','The selected managed agent is unavailable.',false
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    select * into strict v_member from public.ratiflow_document_members
      where document_id=v_document.id and member_id=v_profile.member_id for share;
    v_token := '@' || v_profile.name;
    if left(v_comment,char_length(v_token)) <> v_token
      or char_length(v_comment) <= char_length(v_token)
      or substring(v_comment from char_length(v_token)+1 for 1) not in (' ',chr(9),chr(10),chr(13)) then
      v_result := ratiflow_document_private.error_v4(
        'STALE_MENTION_TARGET','The visible @ mention no longer matches the selected agent.',false
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    v_instruction := btrim(substring(v_comment from char_length(v_token)+1),E' \t\r\n');
    if char_length(v_instruction) < 1 or char_length(v_instruction) > 1000 then
      v_result := ratiflow_document_private.invalid_v4('The managed mention instruction is invalid.');
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    v_anchor := ratiflow_document_private.anchor_from_input_v4(v_document.id,p_input->'anchor');
    if v_anchor is null or v_anchor->>'scope'<>'SELECTION'
      or char_length(v_anchor->>'selectedText')>8000 then
      v_result := ratiflow_document_private.invalid_v4(
        'Managed work requires a valid bounded selection.'
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    if (select count(*) from public.ratiflow_issue_tasks_v4 where document_id=v_document.id)>=500
      or (select count(*) from public.ratiflow_issue_tasks_v4
        where document_id=v_document.id and status in ('OPEN','PROPOSED'))>=100
      or (select count(*) from public.ratiflow_issue_tasks_v4
        where document_id=v_document.id and assignee_member_id=v_member.member_id
          and status in ('OPEN','PROPOSED'))>=50 then
      v_result := ratiflow_document_private.error_v4(
        'RATE_LIMITED','The active task limit has been reached.',false
      );
      return ratiflow_document_private.record_v41(
        v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
        v_session.member_id,'HUMAN',v_fingerprint_input,v_result
      );
    end if;
    v_source := case when v_anchor->>'field'='TITLE' then v_document.title else v_document.body end;
    v_context := jsonb_build_object(
      'sourceRevision',v_document.revision,
      'sourceDigest',ratiflow_document_private.content_digest_v4(v_document.title,v_document.body),
      'documentTitle',v_document.title,'field',v_anchor->>'field',
      'rangeStart',(v_anchor->>'rangeStart')::bigint,
      'rangeEnd',(v_anchor->>'rangeEnd')::bigint,
      'targetText',v_anchor->>'selectedText',
      'beforeText',right(left(v_source,(v_anchor->>'rangeStart')::integer),600),
      'afterText',left(substring(v_source from (v_anchor->>'rangeEnd')::integer+1),600),
      'priorContext',ratiflow_document_private.prior_context_v41(
        v_document.id,v_document.activity_version+1
      )
    );
    v_at := greatest(clock_timestamp(),v_document.updated_at+interval '1 microsecond');
    insert into public.ratiflow_issue_tasks_v4(
      task_id,document_id,task_key,title,category,instruction,agent_label,
      agent_profile_id,context_snapshot,mode,creator_member_id,creator_display_name,
      assignee_member_id,assignee_display_name,thread_id,creation_anchor,
      anchor_scope,anchor_field,range_start,range_end,selected_text,
      created_revision,anchor_revision,anchor_state,created_at,updated_at
    ) values (
      v_task_id,v_document.id,'TASK-'||((select count(*)+1
        from public.ratiflow_issue_tasks_v4 where document_id=v_document.id)::text),
      left(regexp_replace(v_instruction,E'[ \t\r\n]+',' ','g'),120),
      case v_profile.managed_specialty when 'DATA' then 'DATA'
        when 'CODE' then 'CODEBASE' else 'GENERAL' end,
      v_instruction,v_profile.name,v_profile.profile_id,v_context,'DIRECT',
      v_session.member_id,v_session.display_name,v_member.member_id,v_member.display_name,
      v_thread_id,v_anchor,'SELECTION',v_anchor->>'field',
      (v_anchor->>'rangeStart')::bigint,(v_anchor->>'rangeEnd')::bigint,
      v_anchor->>'selectedText',v_document.revision,v_document.revision,'ACTIVE',v_at,v_at
    );
    insert into public.ratiflow_issue_threads_v4(
      thread_id,document_id,task_id,creation_anchor,anchor_scope,anchor_field,
      range_start,range_end,selected_text,created_revision,anchor_revision,
      anchor_state,created_by_member_id,created_by_display_name,created_at
    ) values (
      v_thread_id,v_document.id,v_task_id,v_anchor,'SELECTION',v_anchor->>'field',
      (v_anchor->>'rangeStart')::bigint,(v_anchor->>'rangeEnd')::bigint,
      v_anchor->>'selectedText',v_document.revision,v_document.revision,'ACTIVE',
      v_session.member_id,v_session.display_name,v_at
    );
    insert into public.ratiflow_issue_comments_v4(
      comment_id,document_id,thread_id,author_actor_type,author_member_id,
      author_display_name,origin,created_revision,body,created_at
    ) values (
      v_comment_id,v_document.id,v_thread_id,'HUMAN',v_session.member_id,
      v_session.display_name,'ORDINARY_UI',v_document.revision,v_comment,v_at
    );
    insert into public.ratiflow_issue_relay_runs_v4(
      run_id,document_id,task_id,profile_id,specialty,created_at,updated_at
    ) values (
      v_run_id,v_document.id,v_task_id,v_profile.profile_id,
      v_profile.managed_specialty,v_at,v_at
    );
    insert into public.ratiflow_issue_mentions_v4(
      document_id,request_id,target_kind,target_profile_id,target_snapshot,
      thread_id,comment_id,task_id,run_id,created_by_member_id,created_at
    ) values (
      v_document.id,p_request_id,'AGENT',v_profile.profile_id,
      ratiflow_document_private.managed_agent_json_v4(v_profile.profile_id),
      v_thread_id,v_comment_id,v_task_id,v_run_id,v_session.member_id,v_at
    );
    perform ratiflow_document_private.bump_activity_v4(
      v_document.id,'TASK_CREATED','HUMAN',v_session.member_id,
      v_session.display_name,'ORDINARY_UI',null,v_task_id,v_thread_id,v_comment_id,v_at
    );
    perform ratiflow_document_private.relay_trace_append_v4(
      v_document.id,v_run_id,null,'RUN_QUEUED'
    );
    v_result := jsonb_build_object('ok',true,'data',jsonb_build_object(
      'outcome','MANAGED_TASK_QUEUED','target',v_target,'threadId',v_thread_id,
      'commentId',v_comment_id,'taskId',v_task_id,'runId',v_run_id
    ));
  else
    v_result := ratiflow_document_private.invalid_v4('The canonical directory target is invalid.');
  end if;
  return ratiflow_document_private.record_v41(
    v_document.id,p_request_id,'CREATE_ISSUE_DIRECTORY_MENTION_V4',
    v_session.member_id,'HUMAN',v_fingerprint_input,v_result
  );
end;
$$;

create or replace function ratiflow_document_private.relay_grant_attempt_v4(
  p_grant_claims jsonb,
  p_grant_digest text,
  p_allow_terminal boolean default false,
  p_allow_revoked boolean default false
)
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt_id uuid;
declare v_expires_at timestamptz;
begin
  if p_grant_digest is null or p_grant_digest !~ '^sha256:[0-9a-f]{64}$'
    or not ratiflow_document_private.input_v4(p_grant_claims,array[
      'v','aud','documentId','profileId','taskId','runId','attemptId',
      'claimantMemberId','credentialSessionDigest','pageSessionDigest','leaseId',
      'registrationGeneration','nonce','issuedAt','expiresAt'
    ],'{}')
    or not ratiflow_document_private.counter_v4(p_grant_claims->'v',1,1)
    or p_grant_claims->>'aud' is distinct from 'ratiflow-webmcp-relay'
    or not ratiflow_document_private.uuid_v4(p_grant_claims->'documentId')
    or not ratiflow_document_private.uuid_v4(p_grant_claims->'profileId')
    or not ratiflow_document_private.uuid_v4(p_grant_claims->'taskId')
    or not ratiflow_document_private.uuid_v4(p_grant_claims->'runId')
    or not ratiflow_document_private.uuid_v4(p_grant_claims->'attemptId')
    or not ratiflow_document_private.uuid_v4(p_grant_claims->'claimantMemberId')
    or not ratiflow_document_private.uuid_v4(p_grant_claims->'leaseId')
    or not ratiflow_document_private.counter_v4(
      p_grant_claims->'registrationGeneration',1,2
    )
    or p_grant_claims->>'credentialSessionDigest' is null
    or (p_grant_claims->>'credentialSessionDigest') !~ '^sha256:[0-9a-f]{64}$'
    or p_grant_claims->>'pageSessionDigest' is null
    or (p_grant_claims->>'pageSessionDigest') !~ '^sha256:[0-9a-f]{64}$'
    or not ratiflow_document_private.text_v4(p_grant_claims->'nonce',128,false)
    or not ratiflow_document_private.text_v4(p_grant_claims->'issuedAt',64,false)
    or not ratiflow_document_private.text_v4(p_grant_claims->'expiresAt',64,false) then
    return null;
  end if;
  begin
    v_expires_at := (p_grant_claims->>'expiresAt')::timestamptz;
  exception when others then
    return null;
  end;
  if v_expires_at<=clock_timestamp() then return null; end if;
  select a.attempt_id into v_attempt_id
  from public.ratiflow_issue_relay_attempts_v4 a
  join public.ratiflow_issue_relay_runs_v4 r
    on r.document_id=a.document_id and r.run_id=a.run_id
  join public.ratiflow_issue_tasks_v4 t
    on t.document_id=r.document_id and t.task_id=r.task_id
  join public.ratiflow_issue_agent_profiles_v4 p
    on p.document_id=r.document_id and p.profile_id=r.profile_id
  where a.grant_claims=p_grant_claims and a.grant_digest=p_grant_digest
    and (p_allow_revoked or a.grant_revoked_at is null)
    and (p_grant_claims->>'documentId')::uuid=a.document_id
    and (p_grant_claims->>'attemptId')::uuid=a.attempt_id
    and (p_grant_claims->>'runId')::uuid=r.run_id
    and (p_grant_claims->>'taskId')::uuid=t.task_id
    and (p_grant_claims->>'profileId')::uuid=p.profile_id
    and (p_grant_claims->>'claimantMemberId')::uuid=a.claimed_by_member_id
    and (p_grant_claims->>'leaseId')::uuid=a.lease_id
    and (p_grant_claims->>'registrationGeneration')::integer=a.registration_generation
    and p_grant_claims->>'credentialSessionDigest'=a.credential_session_digest
    and p_grant_claims->>'pageSessionDigest'=a.page_session_digest
    and exists (
      select 1 from ratiflow_document_private.sessions s
      where s.document_id=a.document_id and s.member_id=a.claimed_by_member_id
        and s.actor_type='HUMAN' and s.expires_at>clock_timestamp()
        and 'sha256:'||encode(s.handle_hash,'hex')=a.credential_session_digest
    )
    and (
      p_allow_terminal
      or (r.status='ACTIVE'
        and a.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
        and a.lease_expires_at>clock_timestamp()
        and a.deadline_at>clock_timestamp())
    );
  return v_attempt_id;
end;
$$;

create or replace function public.ratiflow_claim_issue_relay_v4(
  p_handle text,
  p_page_session_id uuid,
  p_request_id uuid,
  p_retry_run_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_agent jsonb;
declare v_claims jsonb;
declare v_attempt_id uuid := extensions.gen_random_uuid();
declare v_lease_id uuid := extensions.gen_random_uuid();
declare v_attempt_number integer;
declare v_now timestamptz := clock_timestamp();
declare v_lease_expires timestamptz;
declare v_deadline timestamptz;
declare v_grant_expires timestamptz;
declare v_credential_digest text;
declare v_page_digest text;
declare v_active_run_id uuid;
declare v_retry_ms integer;
begin
  if p_page_session_id is null or p_request_id is null then
    return ratiflow_document_private.invalid_v4(
      'A page session and idempotency key are required.'
    );
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type<>'HUMAN' then
    return ratiflow_document_private.unauthorized_v4('A valid human session is required.');
  end if;
  select * into strict v_document from public.ratiflow_documents
    where id=v_session.document_id and protocol_version=4
      and expires_at>v_now for update;
  perform ratiflow_document_private.ensure_managed_agents_v4(v_document.id);
  v_credential_digest := 'sha256:'||encode(extensions.digest(p_handle,'sha256'),'hex');
  v_page_digest := 'sha256:'||encode(
    extensions.digest(p_page_session_id::text,'sha256'),'hex'
  );
  select * into v_attempt from public.ratiflow_issue_relay_attempts_v4
    where document_id=v_document.id and claim_request_id=p_request_id;
  if found then
    if v_attempt.claimed_by_member_id<>v_session.member_id
      or v_attempt.credential_session_digest<>v_credential_digest
      or v_attempt.page_session_digest<>v_page_digest
      or v_attempt.retry_run_id is distinct from p_retry_run_id then
      return ratiflow_document_private.error_v4(
        'REQUEST_REPLAY_MISMATCH',
        'This request ID was already used with different input.',false
      );
    end if;
    select * into strict v_run from public.ratiflow_issue_relay_runs_v4
      where run_id=v_attempt.run_id;
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'outcome','CLAIMED','run',ratiflow_document_private.relay_run_json_v4(v_run.run_id),
      'attempt',ratiflow_document_private.relay_attempt_json_v4(v_attempt.attempt_id,true,false),
      'agent',ratiflow_document_private.managed_agent_json_v4(v_run.profile_id),
      'grantClaims',v_attempt.grant_claims
    ));
  end if;
  perform ratiflow_document_private.reconcile_relay_v4(v_document.id);
  select r.run_id,a.lease_expires_at into v_active_run_id,v_lease_expires
    from public.ratiflow_issue_relay_runs_v4 r
    left join public.ratiflow_issue_relay_attempts_v4 a on a.run_id=r.run_id
      and a.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
    where r.document_id=v_document.id and r.status='ACTIVE'
    order by a.attempt_number desc limit 1;
  if v_active_run_id is not null then
    v_retry_ms := greatest(1,least(15000,
      coalesce(ceil(extract(epoch from (v_lease_expires-v_now))*1000)::integer,15000)
    ));
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'outcome','BUSY','retryAfterMs',v_retry_ms,'activeRunId',v_active_run_id
    ));
  end if;
  select r.* into v_run from public.ratiflow_issue_relay_runs_v4 r
    where r.document_id=v_document.id and r.status in ('QUEUED','WAITING_RETRY')
    order by r.created_at,r.run_id
    limit 1 for update of r;
  if not found then
    if p_retry_run_id is not null then
      return ratiflow_document_private.error_v4(
        'RELAY_STATE_CONFLICT','The requested Relay retry is no longer available.',false
      );
    end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'outcome','NO_WORK','retryAfterMs',15000
    ));
  end if;
  if v_run.status='WAITING_RETRY' and p_retry_run_id is null then
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'outcome','NO_WORK','retryAfterMs',15000
    ));
  end if;
  if (v_run.status='WAITING_RETRY' and p_retry_run_id is distinct from v_run.run_id)
    or (v_run.status='QUEUED' and p_retry_run_id is not null) then
    return ratiflow_document_private.error_v4(
      'RELAY_STATE_CONFLICT','The explicit Relay retry does not match the queue head.',false
    );
  end if;
  if v_run.attempt_count>=v_run.max_attempts then
    update public.ratiflow_issue_relay_runs_v4 set status='EXHAUSTED',
      terminal_reason='ATTEMPTS_EXHAUSTED',updated_at=v_now,completed_at=v_now
      where run_id=v_run.run_id returning * into v_run;
    perform ratiflow_document_private.relay_trace_append_v4(
      v_document.id,v_run.run_id,null,'RUN_EXHAUSTED'
    );
    return ratiflow_document_private.error_v4(
      'RELAY_STATE_CONFLICT','The Relay queue head has exhausted its attempts.',false
    );
  end if;
  if not exists (
    select 1 from public.ratiflow_issue_tasks_v4 t
    join public.ratiflow_issue_agent_profiles_v4 p
      on p.document_id=t.document_id and p.profile_id=v_run.profile_id
    where t.document_id=v_run.document_id and t.task_id=v_run.task_id
      and t.status='OPEN' and t.agent_profile_id=v_run.profile_id
      and p.identity_source='DEMO_DIRECTORY' and p.managed_readiness='READY'
  ) then
    update public.ratiflow_issue_relay_runs_v4 set status='CANCELLED',
      terminal_reason='TASK_STALE',updated_at=v_now,completed_at=v_now
      where run_id=v_run.run_id returning * into v_run;
    perform ratiflow_document_private.relay_trace_append_v4(
      v_document.id,v_run.run_id,null,'RUN_CANCELLED',
      p_detail=>jsonb_build_object('terminalReason','TASK_STALE')
    );
    return ratiflow_document_private.error_v4(
      'RELAY_STATE_CONFLICT','The queued managed task is no longer eligible.',false
    );
  end if;
  -- Reserve capacity before creating/incrementing an attempt. The same lock is
  -- also taken when BEGIN_STEP converts a reservation to a dispatch, making the
  -- deployment cap exact at the reservation-expiry boundary.
  perform pg_catalog.pg_advisory_xact_lock(1381259596,4);
  v_now := clock_timestamp();
  delete from ratiflow_document_private.issue_relay_provider_dispatches_v4 d
    where (d.dispatched_at is not null
        and d.dispatched_at<=v_now-interval '10 minutes')
      or (d.dispatched_at is null and d.reservation_expires_at<=v_now);
  v_attempt_number := v_run.attempt_count+1;
  v_lease_expires := least(v_now+interval '45 seconds',v_document.expires_at);
  v_deadline := least(v_now+interval '90 seconds',v_document.expires_at);
  v_grant_expires := least(v_now+interval '120 seconds',v_document.expires_at);
  if v_lease_expires<=v_now or v_deadline<=v_now or v_grant_expires<=v_now then
    return ratiflow_document_private.error_v4(
      'RELAY_UNAVAILABLE','The workspace expires before a Relay attempt can start.',false
    );
  end if;
  if (select count(*)
        from ratiflow_document_private.issue_relay_provider_dispatches_v4 d
        where (d.dispatched_at is not null
            and d.dispatched_at>v_now-interval '10 minutes')
          or (d.dispatched_at is null and d.reservation_expires_at>v_now))>=48
    or (select count(*)
        from ratiflow_document_private.issue_relay_provider_dispatches_v4 d
        where d.document_id=v_document.id and (
          (d.dispatched_at is not null
            and d.dispatched_at>v_now-interval '10 minutes')
          or (d.dispatched_at is null and d.reservation_expires_at>v_now)
        ))>=6 then
    return ratiflow_document_private.error_v4(
      'RATE_LIMITED',
      'The managed Relay provider-run quota is reached for this rolling window.',
      true
    );
  end if;
  v_claims := jsonb_build_object(
    'v',1,'aud','ratiflow-webmcp-relay','documentId',v_document.id,
    'profileId',v_run.profile_id,'taskId',v_run.task_id,'runId',v_run.run_id,
    'attemptId',v_attempt_id,'claimantMemberId',v_session.member_id,
    'credentialSessionDigest',v_credential_digest,'pageSessionDigest',v_page_digest,
    'leaseId',v_lease_id,'registrationGeneration',v_attempt_number,
    'nonce',translate(rtrim(encode(extensions.gen_random_bytes(18),'base64'),'='),'+/','-_'),
    'issuedAt',v_now,'expiresAt',v_grant_expires
  );
  insert into public.ratiflow_issue_relay_attempts_v4(
    attempt_id,document_id,run_id,attempt_number,status,claimed_by_member_id,
    claimed_by_display_name,credential_session_digest,page_session_id,
    page_session_digest,claim_request_id,retry_run_id,registration_generation,
    registration_scope,lease_id,lease_expires_at,grant_claims,
    started_at,deadline_at,updated_at
  ) values (
    v_attempt_id,v_document.id,v_run.run_id,v_attempt_number,'CLAIMED',
    v_session.member_id,v_session.display_name,v_credential_digest,p_page_session_id,
    v_page_digest,p_request_id,p_retry_run_id,v_attempt_number,
    encode(extensions.gen_random_bytes(8),'hex'),v_lease_id,v_lease_expires,v_claims,
    v_now,v_deadline,v_now
  ) returning * into v_attempt;
  insert into ratiflow_document_private.issue_relay_provider_dispatches_v4(
    document_id,attempt_id,reserved_at,reservation_expires_at
  ) values (v_document.id,v_attempt.attempt_id,v_now,v_deadline);
  update public.ratiflow_issue_relay_runs_v4 set status='ACTIVE',
    attempt_count=v_attempt_number,updated_at=v_now where run_id=v_run.run_id
    returning * into v_run;
  perform ratiflow_document_private.relay_trace_append_v4(
    v_document.id,v_run.run_id,v_attempt.attempt_id,'RUN_CLAIMED'
  );
  v_agent := ratiflow_document_private.managed_agent_json_v4(v_run.profile_id);
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'outcome','CLAIMED','run',ratiflow_document_private.relay_run_json_v4(v_run.run_id),
    'attempt',ratiflow_document_private.relay_attempt_json_v4(v_attempt.attempt_id,true,false),
    'agent',v_agent,'grantClaims',v_claims
  ));
end;
$$;

create or replace function public.ratiflow_renew_issue_relay_lease_v4(
  p_grant_claims jsonb,
  p_grant_digest text,
  p_expected_lease_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_attempt_id uuid;
declare v_now timestamptz := clock_timestamp();
begin
  v_attempt_id := ratiflow_document_private.relay_grant_attempt_v4(
    p_grant_claims,p_grant_digest,false
  );
  if v_attempt_id is null then
    return ratiflow_document_private.error_v4(
      'RELAY_LEASE_LOST','The managed Relay lease was lost.',false
    );
  end if;
  select * into strict v_attempt from public.ratiflow_issue_relay_attempts_v4
    where attempt_id=v_attempt_id for update;
  if v_attempt.grant_revoked_at is not null
    or v_attempt.status in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
    or p_expected_lease_id is null or p_expected_lease_id<>v_attempt.lease_id
    or v_attempt.lease_expires_at<=v_now or v_attempt.deadline_at<=v_now then
    return ratiflow_document_private.error_v4(
      'RELAY_LEASE_LOST','The managed Relay lease was lost.',false
    );
  end if;
  update public.ratiflow_issue_relay_attempts_v4 set
    lease_expires_at=least(v_now+interval '45 seconds',deadline_at,
      (grant_claims->>'expiresAt')::timestamptz),updated_at=v_now
    where attempt_id=v_attempt_id returning * into v_attempt;
  perform ratiflow_document_private.relay_trace_append_v4(
    v_attempt.document_id,v_attempt.run_id,v_attempt.attempt_id,'LEASE_RENEWED'
  );
  return jsonb_build_object('ok',true,'data',
    ratiflow_document_private.relay_attempt_json_v4(v_attempt_id,true,false)
  );
end;
$$;

create or replace function public.ratiflow_release_issue_relay_v4(
  p_grant_claims jsonb,
  p_grant_digest text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_attempt_id uuid;
declare v_now timestamptz := clock_timestamp();
begin
  v_attempt_id := ratiflow_document_private.relay_grant_attempt_v4(
    p_grant_claims,p_grant_digest,true,true
  );
  if v_attempt_id is null then
    return ratiflow_document_private.unauthorized_v4(
      'The Relay grant is invalid or expired.'
    );
  end if;
  select * into strict v_attempt from public.ratiflow_issue_relay_attempts_v4
    where attempt_id=v_attempt_id for update;
  select * into strict v_run from public.ratiflow_issue_relay_runs_v4
    where run_id=v_attempt.run_id for update;
  if not v_attempt.provider_dispatched then
    delete from ratiflow_document_private.issue_relay_provider_dispatches_v4
      where attempt_id=v_attempt.attempt_id and dispatched_at is null;
  end if;
  if v_attempt.grant_revoked_at is null then
    if v_run.status='COMPLETED' and v_run.terminal_reason='TASK_COMPLETED' then
      perform ratiflow_document_private.recover_completed_relay_permits_v4(
        v_attempt.document_id,v_run.run_id,v_attempt.attempt_id
      );
    end if;
    update public.ratiflow_issue_relay_attempts_v4
      set grant_revoked_at=v_now,updated_at=v_now where attempt_id=v_attempt.attempt_id;
    update ratiflow_document_private.issue_relay_execution_permits_v4
      set status='REVOKED',completed_at=coalesce(completed_at,v_now)
      where attempt_id=v_attempt.attempt_id and status='ISSUED';
    if v_run.status='COMPLETED' and v_run.terminal_reason='TASK_COMPLETED' then
      update public.ratiflow_issue_relay_attempts_v4 set status='SUCCEEDED',
        completed_at=coalesce(completed_at,v_now),updated_at=v_now
        where attempt_id=v_attempt.attempt_id;
    elsif v_run.status='ACTIVE' and v_attempt.provider_dispatched
      and v_attempt.deadline_at<=v_now
      and (v_attempt.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
        or exists (
          select 1 from ratiflow_document_private.issue_relay_steps_v4 s
          where s.attempt_id=v_attempt.attempt_id and s.status='TERMINAL'
            and s.result->>'ok'='false'
            and s.result->>'code'='RELAY_PROVIDER_OUTCOME_UNKNOWN'
        )) then
      update ratiflow_document_private.issue_relay_execution_permits_v4
        set status='FAILED',completed_at=v_now
        where attempt_id=v_attempt.attempt_id and status='EXECUTING';
      update public.ratiflow_issue_relay_attempts_v4 set status='FAILED',
        completed_at=v_now,updated_at=v_now where attempt_id=v_attempt.attempt_id;
      update public.ratiflow_issue_relay_runs_v4 set
        status=case when attempt_count>=max_attempts then 'EXHAUSTED' else 'WAITING_RETRY' end,
        terminal_reason=case when attempt_count>=max_attempts
          then 'ATTEMPTS_EXHAUSTED' else null end,
        completed_at=case when attempt_count>=max_attempts then v_now else null end,
        updated_at=v_now where run_id=v_run.run_id returning * into v_run;
      perform ratiflow_document_private.relay_trace_append_v4(
        v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_FAILED',
        p_detail=>jsonb_build_object('reason','ATTEMPT_DEADLINE_EXPIRED')
      );
      perform ratiflow_document_private.relay_trace_append_v4(
        v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,
        case v_run.status when 'EXHAUSTED' then 'RUN_EXHAUSTED'
          else 'RUN_WAITING_RETRY' end
      );
    elsif v_run.status='ACTIVE' and v_attempt.provider_dispatched
      and v_attempt.deadline_at>v_now and (
        v_attempt.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
        or exists (
          select 1 from ratiflow_document_private.issue_relay_steps_v4 s
          where s.attempt_id=v_attempt.attempt_id and s.status='TERMINAL'
            and s.result->>'ok'='false'
            and s.result->>'code'='RELAY_PROVIDER_OUTCOME_UNKNOWN'
        )
      ) then
      update public.ratiflow_issue_relay_attempts_v4 set status='RECONCILING',
        completed_at=null,updated_at=v_now where attempt_id=v_attempt.attempt_id;
      if not exists(select 1 from public.ratiflow_issue_relay_trace_v4
        where attempt_id=v_attempt.attempt_id and kind='ATTEMPT_RECONCILING') then
        perform ratiflow_document_private.relay_trace_append_v4(
          v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_RECONCILING'
        );
      end if;
    elsif v_run.status='ACTIVE' then
      update public.ratiflow_issue_relay_attempts_v4 set status='EXPIRED',
        completed_at=v_now,updated_at=v_now where attempt_id=v_attempt.attempt_id;
      update public.ratiflow_issue_relay_runs_v4 set
        status=case when attempt_count>=max_attempts then 'EXHAUSTED' else 'QUEUED' end,
        terminal_reason=case when attempt_count>=max_attempts
          then 'ATTEMPTS_EXHAUSTED' else null end,
        completed_at=case when attempt_count>=max_attempts then v_now else null end,
        updated_at=v_now where run_id=v_run.run_id returning * into v_run;
      if v_run.status='EXHAUSTED' then
        perform ratiflow_document_private.relay_trace_append_v4(
          v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_FAILED',
          p_detail=>jsonb_build_object('reason','RELEASED_BEFORE_DISPATCH')
        );
        perform ratiflow_document_private.relay_trace_append_v4(
          v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'RUN_EXHAUSTED'
        );
      end if;
    end if;
  end if;
  if v_run.status='COMPLETED' and v_run.terminal_reason='TASK_COMPLETED'
    and not exists(select 1 from public.ratiflow_issue_relay_trace_v4
      where run_id=v_run.run_id and kind='RUN_COMPLETED')
    and exists(select 1 from public.ratiflow_issue_relay_trace_v4
      where run_id=v_run.run_id and kind='IDLE_CATALOG_RESTORED') then
    perform ratiflow_document_private.relay_trace_append_v4(
      v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'RUN_COMPLETED'
    );
  end if;
  return jsonb_build_object('ok',true,'data',
    ratiflow_document_private.relay_run_json_v4(v_run.run_id)
  );
end;
$$;

create or replace function ratiflow_document_private.relay_context_permit_v4(
  p_context jsonb,
  p_expected_logical_tool text,
  p_allow_completed boolean default false
)
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_permit_id uuid;
begin
  if not ratiflow_document_private.input_v4(p_context,array[
      'documentId','runId','attemptId','taskId','profileId',
      'registrationGeneration','physicalToolName','logicalToolName','requestId'
    ],'{}')
    or not ratiflow_document_private.uuid_v4(p_context->'documentId')
    or not ratiflow_document_private.uuid_v4(p_context->'runId')
    or not ratiflow_document_private.uuid_v4(p_context->'attemptId')
    or not ratiflow_document_private.uuid_v4(p_context->'taskId')
    or not ratiflow_document_private.uuid_v4(p_context->'profileId')
    or not ratiflow_document_private.uuid_v4(p_context->'requestId')
    or not ratiflow_document_private.counter_v4(
      p_context->'registrationGeneration',1,2
    )
    or not ratiflow_document_private.text_v4(
      p_context->'physicalToolName',64,false
    )
    or not ratiflow_document_private.text_v4(
      p_context->'logicalToolName',64,false
    ) then
    return null;
  end if;
  select permit.permit_id into v_permit_id
  from ratiflow_document_private.issue_relay_execution_permits_v4 permit
  join public.ratiflow_issue_relay_attempts_v4 attempt
    on attempt.document_id=permit.document_id and attempt.attempt_id=permit.attempt_id
  join public.ratiflow_issue_relay_runs_v4 run
    on run.document_id=permit.document_id and run.run_id=permit.run_id
  join public.ratiflow_issue_tasks_v4 task
    on task.document_id=permit.document_id and task.task_id=permit.task_id
  where p_context->>'logicalToolName'=p_expected_logical_tool
    and permit.logical_tool_name=p_expected_logical_tool
    and (permit.status='EXECUTING'
      or (p_allow_completed and permit.status='COMPLETED'))
    and permit.execution_request_id is not null
    and permit.document_id=(p_context->>'documentId')::uuid
    and permit.run_id=(p_context->>'runId')::uuid
    and permit.attempt_id=(p_context->>'attemptId')::uuid
    and permit.task_id=(p_context->>'taskId')::uuid
    and permit.profile_id=(p_context->>'profileId')::uuid
    and permit.registration_generation=(p_context->>'registrationGeneration')::integer
    and permit.physical_tool_name=p_context->>'physicalToolName'
    and permit.downstream_request_id=(p_context->>'requestId')::uuid
    and run.profile_id=permit.profile_id and run.task_id=permit.task_id
    and task.agent_profile_id=permit.profile_id
    and attempt.registration_generation=permit.registration_generation
    and attempt.lease_id=permit.lease_id
    and (attempt.status='EXECUTING_TOOL'
      or (p_allow_completed and attempt.status in ('AWAITING_MODEL','SUCCEEDED')))
    and (run.status='ACTIVE' or (p_allow_completed and run.status='COMPLETED'));
  return v_permit_id;
end;
$$;

create or replace function ratiflow_document_private.relay_managed_mutation_v4(
  p_context jsonb,
  p_operation text,
  p_input jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_permit ratiflow_document_private.issue_relay_execution_permits_v4%rowtype;
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_document public.ratiflow_documents%rowtype;
declare v_task public.ratiflow_issue_tasks_v4%rowtype;
declare v_thread public.ratiflow_issue_threads_v4%rowtype;
declare v_profile public.ratiflow_issue_agent_profiles_v4%rowtype;
declare v_member public.ratiflow_document_members%rowtype;
declare v_permit_id uuid;
declare v_expected_logical text;
declare v_handle text;
declare v_result jsonb;
declare v_mutation_input jsonb;
declare v_now timestamptz;
begin
  v_expected_logical := case p_operation
    when 'COMMENT_ON_ISSUE_TASK_V4' then 'comment_on_assignment'
    when 'SUBMIT_ISSUE_TASK_RESULT_V4' then 'submit_scoped_revision'
    else null end;
  if v_expected_logical is null then
    return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    );
  end if;
  v_permit_id := ratiflow_document_private.relay_context_permit_v4(
    p_context,v_expected_logical,true
  );
  if v_permit_id is null then
    return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    );
  end if;
  -- Serialize every authoritative mutation on the document first, then lock its
  -- Relay lineage in one order. The non-locking context lookup above is only a
  -- locator; every authorization predicate is checked again on these rows.
  select * into v_document from public.ratiflow_documents
    where id=(p_context->>'documentId')::uuid for update;
  if not found then return ratiflow_document_private.unauthorized_v4(
    'The managed tool context is no longer authorized.'
  ); end if;
  select * into v_run from public.ratiflow_issue_relay_runs_v4
    where document_id=v_document.id and run_id=(p_context->>'runId')::uuid
    for update;
  if not found then return ratiflow_document_private.unauthorized_v4(
    'The managed tool context is no longer authorized.'
  ); end if;
  select * into v_attempt from public.ratiflow_issue_relay_attempts_v4
    where document_id=v_document.id and run_id=v_run.run_id
      and attempt_id=(p_context->>'attemptId')::uuid for update;
  if not found then return ratiflow_document_private.unauthorized_v4(
    'The managed tool context is no longer authorized.'
  ); end if;
  select permit.* into v_permit
    from ratiflow_document_private.issue_relay_execution_permits_v4 permit
    where permit.permit_id=v_permit_id and permit.document_id=v_document.id
      and permit.run_id=v_run.run_id and permit.attempt_id=v_attempt.attempt_id
    for update;
  if not found then return ratiflow_document_private.unauthorized_v4(
    'The managed tool context is no longer authorized.'
  ); end if;
  select task.* into v_task from public.ratiflow_issue_tasks_v4 task
    where task.document_id=v_document.id and task.task_id=v_run.task_id
      and task.task_id=v_permit.task_id for update;
  if not found then return ratiflow_document_private.unauthorized_v4(
    'The managed tool context is no longer authorized.'
  ); end if;
  select thread.* into v_thread from public.ratiflow_issue_threads_v4 thread
    where thread.document_id=v_document.id and thread.thread_id=v_task.thread_id
    for update;
  if not found then return ratiflow_document_private.unauthorized_v4(
    'The managed tool context is no longer authorized.'
  ); end if;
  v_now := clock_timestamp();
  if v_document.protocol_version<>4
    or v_run.profile_id is distinct from v_permit.profile_id
    or v_run.task_id is distinct from v_permit.task_id
    or v_attempt.registration_generation is distinct from v_permit.registration_generation
    or v_attempt.lease_id is distinct from v_permit.lease_id
    or v_permit.status not in ('EXECUTING','COMPLETED')
    or v_permit.execution_request_id is null
    or v_permit.logical_tool_name is distinct from v_expected_logical
    or v_permit.profile_id is distinct from (p_context->>'profileId')::uuid
    or v_permit.task_id is distinct from (p_context->>'taskId')::uuid
    or v_permit.physical_tool_name is distinct from p_context->>'physicalToolName'
    or v_permit.logical_tool_name is distinct from p_context->>'logicalToolName'
    or v_permit.downstream_request_id is distinct from (p_context->>'requestId')::uuid
    or v_task.agent_profile_id is distinct from v_run.profile_id
    or v_thread.task_id is distinct from v_task.task_id then
    return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    );
  end if;
  if v_permit.status='EXECUTING' then
    -- An exact ledger result wins over cancellation, expiry, or a concurrent
    -- identical caller. Recover it before considering fresh mutation authority.
    perform ratiflow_document_private.recover_completed_relay_permits_v4(
      v_document.id,v_run.run_id,v_attempt.attempt_id,v_permit.permit_id
    );
    select permit.* into strict v_permit
      from ratiflow_document_private.issue_relay_execution_permits_v4 permit
      where permit.permit_id=v_permit_id;
  end if;
  if v_permit.status='COMPLETED' and v_permit.result_receipt_id is not null
    and v_permit.output is not null then
    begin
      v_result := v_permit.output::jsonb;
    exception when others then
      return ratiflow_document_private.unauthorized_v4(
        'The managed tool context is no longer authorized.'
      );
    end;
    if jsonb_typeof(v_result)='object' and jsonb_typeof(v_result->'ok')='boolean' then
      return v_result;
    end if;
    return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    );
  end if;
  v_now := clock_timestamp();
  if v_document.expires_at<=v_now or v_run.status<>'ACTIVE'
    or v_attempt.status<>'EXECUTING_TOOL'
    or v_attempt.grant_revoked_at is not null
    or v_attempt.lease_expires_at<=v_now or v_attempt.deadline_at<=v_now
    or v_permit.status<>'EXECUTING'
    or (v_permit.permit_claims->>'expiresAt')::timestamptz<=v_now
    or v_task.status<>'OPEN' or v_thread.status<>'OPEN' then
    return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    );
  end if;
  select * into v_profile from public.ratiflow_issue_agent_profiles_v4
    where document_id=v_document.id and profile_id=v_permit.profile_id
      and identity_source='DEMO_DIRECTORY' for share;
  if not found then
    return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    );
  end if;
  if v_task.assignee_member_id is distinct from v_profile.member_id then
    return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    );
  end if;
  select * into v_member from public.ratiflow_document_members
    where document_id=v_permit.document_id and member_id=v_profile.member_id
    for share;
  if not found then return ratiflow_document_private.unauthorized_v4(
    'The managed tool context is no longer authorized.'
  ); end if;
  -- This compatibility bearer exists only inside this transaction. It is random,
  -- never returned, and removed before any result leaves the private Relay seam.
  v_handle := 'rfmanaged_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into ratiflow_document_private.sessions(
    handle_hash,document_id,member_id,actor_type,session_instance_id,expires_at
  ) values (
    extensions.digest(v_handle,'sha256'),v_permit.document_id,v_member.member_id,
    'AGENT',v_attempt.attempt_id,v_attempt.deadline_at
  ) on conflict (handle_hash) do update set expires_at=excluded.expires_at;
  insert into ratiflow_document_private.issue_agent_page_connections_v4(
    document_id,member_id,session_instance_id,page_session_id,profile_id,
    identity_generation,connected_at
  ) values (
    v_permit.document_id,v_member.member_id,v_attempt.attempt_id,
    v_attempt.page_session_id,v_profile.profile_id,v_profile.identity_generation,
    clock_timestamp()
  ) on conflict (document_id,member_id,session_instance_id,page_session_id)
    do update set profile_id=excluded.profile_id,
      identity_generation=excluded.identity_generation,connected_at=excluded.connected_at;
  v_mutation_input := p_input || jsonb_build_object(
    'requestId',v_permit.downstream_request_id,'taskId',v_permit.task_id
  );
  v_result := ratiflow_document_private.agent_mutation_v41(
    p_operation,v_handle,v_attempt.page_session_id,v_mutation_input
  );
  delete from ratiflow_document_private.issue_agent_page_connections_v4
    where document_id=v_permit.document_id and member_id=v_member.member_id
      and session_instance_id=v_attempt.attempt_id
      and page_session_id=v_attempt.page_session_id;
  delete from ratiflow_document_private.sessions
    where handle_hash=extensions.digest(v_handle,'sha256');
  if v_result->>'ok'<>'true' then return v_result; end if;
  if p_operation='COMMENT_ON_ISSUE_TASK_V4' then
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'comment',v_result->'data'->'comment'
    ));
  end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'revision',v_result->'data'->'revision','task',v_result->'data'->'task'
  ));
end;
$$;

create or replace function public.ratiflow_transition_issue_relay_attempt_v4(
  p_action text,
  p_grant_claims jsonb default null,
  p_grant_digest text default null,
  p_context jsonb default null,
  p_input jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt_id uuid;
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_task public.ratiflow_issue_tasks_v4%rowtype;
declare v_profile public.ratiflow_issue_agent_profiles_v4%rowtype;
declare v_permit ratiflow_document_private.issue_relay_execution_permits_v4%rowtype;
declare v_step ratiflow_document_private.issue_relay_steps_v4%rowtype;
declare v_now timestamptz := clock_timestamp();
declare v_claims jsonb;
declare v_result jsonb;
declare v_outcome jsonb;
declare v_outcome_name text;
declare v_logical text;
declare v_request_id uuid;
declare v_expected_step integer;
declare v_digest text;
declare v_dispatch_id uuid;
declare v_quota_now timestamptz;
declare v_permit_claims jsonb;
declare v_previous_permit_claims jsonb;
declare v_limit integer;
begin
  if p_action='FINALIZE_GRANT' then
    if p_grant_claims is null or p_grant_digest is null
      or p_grant_digest !~ '^sha256:[0-9a-f]{64}$' then
      return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.');
    end if;
    select * into v_attempt from public.ratiflow_issue_relay_attempts_v4
      where grant_claims=p_grant_claims for update;
    if not found then return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.'); end if;
    if v_attempt.grant_digest is not null and v_attempt.grant_digest<>p_grant_digest then
      return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.');
    end if;
    update public.ratiflow_issue_relay_attempts_v4
      set grant_digest=coalesce(grant_digest,p_grant_digest)
      where attempt_id=v_attempt.attempt_id;
    return jsonb_build_object('ok',true,'data',true);
  end if;

  if p_action in ('READ_ASSIGNMENT','READ_DOCUMENT_CONTEXT','READ_COLLABORATION_CONTEXT') then
    v_logical := case p_action when 'READ_ASSIGNMENT' then 'read_assignment'
      when 'READ_DOCUMENT_CONTEXT' then 'read_document_context'
      else 'read_collaboration_context' end;
    select * into v_permit from ratiflow_document_private.issue_relay_execution_permits_v4
      where permit_id=ratiflow_document_private.relay_context_permit_v4(p_context,v_logical);
    if not found then return ratiflow_document_private.unauthorized_v4(
      'The managed tool context is no longer authorized.'
    ); end if;
    select * into strict v_task from public.ratiflow_issue_tasks_v4
      where task_id=v_permit.task_id;
    if p_action='READ_ASSIGNMENT' then
      return jsonb_build_object('ok',true,'data',jsonb_build_object(
        'task',jsonb_build_object(
          'task',ratiflow_document_private.task_json_v41(v_task.task_id),
          'thread',ratiflow_document_private.thread_json_v41(v_task.thread_id)
        ),
        'agent',ratiflow_document_private.managed_agent_json_v4(v_permit.profile_id)
      ));
    elsif p_action='READ_DOCUMENT_CONTEXT' then
      return jsonb_build_object('ok',true,'data',jsonb_build_object(
        'document',ratiflow_document_private.document_json_v41(v_permit.document_id),
        'anchor',ratiflow_document_private.anchor_json_v4(
          v_task.anchor_scope,v_task.anchor_field,v_task.range_start,v_task.range_end,
          v_task.selected_text,v_task.created_revision,v_task.anchor_revision,v_task.anchor_state
        ),
        'recentRevisions',coalesce((select jsonb_agg(
          ratiflow_document_private.revision_json_v41(
            v_permit.document_id,recent.revision,true
          ) order by recent.revision desc
        ) from (select r.revision from public.ratiflow_issue_revisions_v4 r
          where r.document_id=v_permit.document_id
          order by r.revision desc limit 10) recent),'[]'::jsonb)
      ));
    else
      if not ratiflow_document_private.input_v4(p_input,array['limit'],'{}')
        or not ratiflow_document_private.counter_v4(p_input->'limit',1,20) then
        return ratiflow_document_private.invalid_v4(
          'The collaboration-context limit is invalid.'
        );
      end if;
      v_limit := (p_input->>'limit')::integer;
      return jsonb_build_object('ok',true,'data',jsonb_build_object(
        'tasks',coalesce((select jsonb_agg(
          ratiflow_document_private.task_json_v41(recent.task_id)
          order by recent.updated_at desc,recent.task_id
        ) from (select t.task_id,t.updated_at from public.ratiflow_issue_tasks_v4 t
          where t.document_id=v_permit.document_id and t.task_id<>v_permit.task_id
          order by t.updated_at desc,t.task_id limit v_limit) recent),'[]'::jsonb),
        'comments',coalesce((select jsonb_agg(
          ratiflow_document_private.comment_json_v41(recent.comment_id)
          order by recent.created_at desc,recent.comment_id
        ) from (select c.comment_id,c.created_at from public.ratiflow_issue_comments_v4 c
          where c.document_id=v_permit.document_id
          order by c.created_at desc,c.comment_id limit v_limit) recent),'[]'::jsonb)
      ));
    end if;
  elsif p_action='COMMENT_ON_ASSIGNMENT' then
    if not ratiflow_document_private.input_v4(p_input,array['body','evidenceRefs'],'{}')
      or not ratiflow_document_private.text_v4(p_input->'body',2000,false)
      or not ratiflow_document_private.evidence_v4(p_input->'evidenceRefs') then
      return ratiflow_document_private.invalid_v4('The assignment comment is invalid.');
    end if;
    return ratiflow_document_private.relay_managed_mutation_v4(
      p_context,'COMMENT_ON_ISSUE_TASK_V4',p_input
    );
  elsif p_action='SUBMIT_SCOPED_REVISION' then
    if not ratiflow_document_private.input_v4(
        p_input,array['basedOnRevision','resultSummary','replacementText','evidenceRefs'],'{}')
      or not ratiflow_document_private.counter_v4(p_input->'basedOnRevision',1)
      or not ratiflow_document_private.text_v4(p_input->'resultSummary',240,false)
      or not ratiflow_document_private.text_v4(p_input->'replacementText',50000,false)
      or not ratiflow_document_private.evidence_v4(p_input->'evidenceRefs') then
      return ratiflow_document_private.invalid_v4('The scoped revision input is invalid.');
    end if;
    return ratiflow_document_private.relay_managed_mutation_v4(
      p_context,'SUBMIT_ISSUE_TASK_RESULT_V4',p_input
    );
  end if;

  v_attempt_id := ratiflow_document_private.relay_grant_attempt_v4(
    p_grant_claims,p_grant_digest,true
  );
  if v_attempt_id is null then
    return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.');
  end if;
  select * into strict v_attempt from public.ratiflow_issue_relay_attempts_v4
    where attempt_id=v_attempt_id for update;
  select * into strict v_run from public.ratiflow_issue_relay_runs_v4
    where run_id=v_attempt.run_id for update;
  select * into strict v_task from public.ratiflow_issue_tasks_v4
    where task_id=v_run.task_id;
  select * into strict v_profile from public.ratiflow_issue_agent_profiles_v4
    where profile_id=v_run.profile_id;
  -- relay_grant_attempt_v4 is a non-locking preflight. Recheck revocation after
  -- acquiring the authoritative attempt/run locks so cancellation cannot race
  -- a stale grant into reopening terminal state.
  if v_attempt.grant_revoked_at is not null then
    return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.');
  end if;

  if p_action='ISSUE_PERMIT' then
    if v_run.status<>'ACTIVE'
      or v_attempt.status in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
      or v_attempt.lease_expires_at<=v_now or v_attempt.deadline_at<=v_now
      or not ratiflow_document_private.input_v4(p_input,array[
        'attemptId','functionCallId','physicalToolName','arguments','argumentsDigest'
      ],'{}')
      or not ratiflow_document_private.uuid_v4(p_input->'attemptId')
      or not ratiflow_document_private.text_v4(p_input->'functionCallId',512,false)
      or not ratiflow_document_private.text_v4(p_input->'physicalToolName',64,false)
      or jsonb_typeof(p_input->'arguments')<>'object'
      or octet_length((p_input->'arguments')::text)>8192
      or p_input->>'argumentsDigest' is null
      or (p_input->>'argumentsDigest') !~ '^sha256:[0-9a-f]{64}$'
      or (p_input->>'attemptId')::uuid<>v_attempt.attempt_id then
      return ratiflow_document_private.error_v4(
        'RELAY_RESULT_INVALID','The execution permit request is invalid.',false
      );
    end if;
    v_logical := ratiflow_document_private.relay_logical_tool_v4(
      v_profile.profile_id,v_attempt.registration_scope,
      v_attempt.registration_generation,p_input->>'physicalToolName'
    );
    if v_logical is null then return ratiflow_document_private.error_v4(
      'RELAY_MANIFEST_MISMATCH','The physical tool is not in the active catalog.',false
    ); end if;
    select * into v_permit from ratiflow_document_private.issue_relay_execution_permits_v4
      where attempt_id=v_attempt.attempt_id
        and function_call_id=p_input->>'functionCallId' for update;
    if found then
      if v_permit.physical_tool_name<>p_input->>'physicalToolName'
        or v_permit.arguments<>p_input->'arguments'
        or v_permit.arguments_digest<>p_input->>'argumentsDigest' then
        return ratiflow_document_private.error_v4(
          'REQUEST_REPLAY_MISMATCH','This function call was bound to different input.',false
        );
      end if;
      return jsonb_build_object('ok',true,'data',jsonb_build_object(
        'claims',v_permit.permit_claims
      ));
    end if;
    if (select count(*) from ratiflow_document_private.issue_relay_execution_permits_v4
        where attempt_id=v_attempt.attempt_id)>=8 then
      return ratiflow_document_private.error_v4(
        'RATE_LIMITED','The managed tool-call budget is exhausted.',false
      );
    end if;
    v_claims := jsonb_build_object(
      'v',1,'aud','ratiflow-webmcp-relay-tool','attemptId',v_attempt.attempt_id,
      'functionCallId',p_input->>'functionCallId',
      'physicalToolName',p_input->>'physicalToolName',
      'argumentsDigest',p_input->>'argumentsDigest',
      'registrationGeneration',v_attempt.registration_generation,
      'leaseId',v_attempt.lease_id,
      'nonce',translate(rtrim(encode(extensions.gen_random_bytes(18),'base64'),'='),'+/','-_'),
      'issuedAt',v_now,'expiresAt',least(v_now+interval '30 seconds',
        v_attempt.lease_expires_at,v_attempt.deadline_at)
    );
    insert into ratiflow_document_private.issue_relay_execution_permits_v4(
      document_id,run_id,attempt_id,task_id,profile_id,function_call_id,
      physical_tool_name,logical_tool_name,arguments,arguments_digest,
      registration_generation,lease_id,permit_claims
    ) values (
      v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,v_run.task_id,
      v_run.profile_id,p_input->>'functionCallId',p_input->>'physicalToolName',
      v_logical,p_input->'arguments',p_input->>'argumentsDigest',
      v_attempt.registration_generation,v_attempt.lease_id,v_claims
    );
    return jsonb_build_object('ok',true,'data',jsonb_build_object('claims',v_claims));
  elsif p_action='FINALIZE_PERMIT' then
    if not ratiflow_document_private.input_v4(p_input,array['claims','tokenDigest'],'{}')
      or p_input->>'tokenDigest' is null
      or (p_input->>'tokenDigest') !~ '^sha256:[0-9a-f]{64}$' then
      return ratiflow_document_private.unauthorized_v4('The Relay permit is invalid.');
    end if;
    select * into v_permit from ratiflow_document_private.issue_relay_execution_permits_v4
      where attempt_id=v_attempt.attempt_id and permit_claims=p_input->'claims' for update;
    if not found or (v_permit.token_digest is not null
      and v_permit.token_digest<>p_input->>'tokenDigest') then
      return ratiflow_document_private.unauthorized_v4('The Relay permit is invalid.');
    end if;
    update ratiflow_document_private.issue_relay_execution_permits_v4
      set token_digest=coalesce(token_digest,p_input->>'tokenDigest')
      where permit_id=v_permit.permit_id;
    return jsonb_build_object('ok',true,'data',true);
  elsif p_action='RECORD_MANIFEST' then
    if not ratiflow_document_private.input_v4(p_input,array['manifest'],'{}')
      or jsonb_typeof(p_input->'manifest')<>'object'
      or p_input->'manifest'->>'digest' is null
      or (p_input->'manifest'->>'digest') !~ '^sha256:[0-9a-f]{64}$'
      or jsonb_typeof(p_input->'manifest'->'entries')<>'array'
      or jsonb_array_length(p_input->'manifest'->'entries')
        <>cardinality(v_profile.managed_logical_tool_names)
      or octet_length((p_input->'manifest')::text)>32768 then
      return ratiflow_document_private.error_v4(
        'RELAY_MANIFEST_MISMATCH','The page tool manifest is invalid.',false
      );
    end if;
    if v_attempt.approved_manifest is not null then
      if v_attempt.approved_manifest<>p_input->'manifest' then
        return ratiflow_document_private.error_v4(
          'RELAY_MANIFEST_MISMATCH','The managed catalog changed within the attempt.',false
        );
      end if;
      return jsonb_build_object('ok',true,'data',jsonb_build_object(
        'digest',v_attempt.approved_manifest_digest
      ));
    end if;
    update public.ratiflow_issue_relay_attempts_v4 set
      approved_manifest=p_input->'manifest',
      approved_manifest_digest=p_input->'manifest'->>'digest',updated_at=v_now
      where attempt_id=v_attempt.attempt_id;
    perform ratiflow_document_private.relay_trace_append_v4(
      v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,
      'WEBMCP_GET_TOOLS_COMPLETED',
      p_manifest_digest=>p_input->'manifest'->>'digest',
      p_detail=>jsonb_build_object(
        'toolCount',jsonb_array_length(p_input->'manifest'->'entries')
      )
    );
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'digest',p_input->'manifest'->>'digest'
    ));
  elsif p_action='LOAD_VERIFIED_TOOL_RESULT' then
    if not ratiflow_document_private.input_v4(p_input,array['resultReceiptId'],'{}')
      or not ratiflow_document_private.uuid_v4(p_input->'resultReceiptId') then
      return ratiflow_document_private.error_v4(
        'RELAY_RESULT_INVALID','The tool result receipt is invalid.',false
      );
    end if;
    select * into v_permit from ratiflow_document_private.issue_relay_execution_permits_v4
      where attempt_id=v_attempt.attempt_id
        and result_receipt_id=(p_input->>'resultReceiptId')::uuid
        and status='COMPLETED';
    if not found or v_permit.output is null then return ratiflow_document_private.error_v4(
      'RELAY_RESULT_INVALID','The verified tool result was not found.',false
    ); end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'functionCallId',v_permit.function_call_id,'output',v_permit.output
    ));
  end if;

  if p_action='BEGIN_STEP' then
    if not ratiflow_document_private.input_v4(p_input,array[
        'requestId','inputDigest','attemptId','expectedStep'
      ],'{}')
      or not ratiflow_document_private.uuid_v4(p_input->'requestId')
      or not ratiflow_document_private.uuid_v4(p_input->'attemptId')
      or p_input->>'inputDigest' is null
      or (p_input->>'inputDigest') !~ '^sha256:[0-9a-f]{64}$'
      or not ratiflow_document_private.counter_v4(p_input->'expectedStep',0,6)
      or (p_input->>'attemptId')::uuid<>v_attempt.attempt_id then
      return ratiflow_document_private.invalid_v4('The Relay step reservation is invalid.');
    end if;
    v_request_id := (p_input->>'requestId')::uuid;
    v_expected_step := (p_input->>'expectedStep')::integer;
    v_digest := p_input->>'inputDigest';
    select * into v_step from ratiflow_document_private.issue_relay_steps_v4
      where attempt_id=v_attempt.attempt_id and request_id=v_request_id for update;
    if found then
      if v_step.input_digest is distinct from v_digest
        or v_step.expected_step<>v_expected_step then
        return ratiflow_document_private.error_v4(
          'REQUEST_REPLAY_MISMATCH','This step request ID was used with different input.',false
        );
      end if;
      if v_step.status='RESERVED' then return jsonb_build_object('ok',true,'data',
        jsonb_build_object('disposition','IN_PROGRESS','retryAfterMs',15000)
      ); end if;
      if v_step.permit_id is not null then select permit_claims into v_permit_claims
        from ratiflow_document_private.issue_relay_execution_permits_v4
        where permit_id=v_step.permit_id; end if;
      return jsonb_build_object('ok',true,'data',
        jsonb_build_object('disposition','RECORDED','result',v_step.result)
        || case when v_permit_claims is null then '{}'::jsonb
          else jsonb_build_object('permitClaims',v_permit_claims) end
      );
    end if;
    if exists(select 1 from ratiflow_document_private.issue_relay_steps_v4
        where attempt_id=v_attempt.attempt_id and expected_step=v_expected_step)
      or exists(select 1 from ratiflow_document_private.issue_relay_steps_v4
        where attempt_id=v_attempt.attempt_id and status='RESERVED')
      or (select count(*) from ratiflow_document_private.issue_relay_steps_v4
        where attempt_id=v_attempt.attempt_id)>=6
      or v_expected_step<>v_attempt.current_step then
      return ratiflow_document_private.error_v4(
        'RELAY_STATE_CONFLICT','The Relay step cursor is not available.',false
      );
    end if;
    if not (v_run.status='ACTIVE'
        and v_attempt.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
        and v_attempt.lease_expires_at>v_now and v_attempt.deadline_at>v_now)
      and not (v_run.status='COMPLETED' and v_run.terminal_reason='TASK_COMPLETED'
        and v_attempt.status='SUCCEEDED'
        and v_attempt.previous_outcome->>'outcome'='EXECUTE_TOOL') then
      return ratiflow_document_private.error_v4(
        'RELAY_LEASE_LOST','The managed Relay lease was lost.',false
      );
    end if;
    if v_run.status='ACTIVE' and not v_attempt.provider_dispatched then
      perform pg_catalog.pg_advisory_xact_lock(1381259596,4);
      v_quota_now := clock_timestamp();
      if v_attempt.lease_expires_at<=v_quota_now
        or v_attempt.deadline_at<=v_quota_now then
        return ratiflow_document_private.error_v4(
          'RELAY_LEASE_LOST','The managed Relay lease was lost.',false
        );
      end if;
      update ratiflow_document_private.issue_relay_provider_dispatches_v4
        set dispatched_at=coalesce(dispatched_at,v_quota_now)
        where attempt_id=v_attempt.attempt_id
          and reservation_expires_at>v_quota_now
        returning dispatch_id into v_dispatch_id;
      if v_dispatch_id is null then
        return ratiflow_document_private.error_v4(
          'RELAY_STATE_CONFLICT',
          'The managed Relay provider authorization reservation is missing.',
          false
        );
      end if;
      v_now := v_quota_now;
    end if;
    insert into ratiflow_document_private.issue_relay_steps_v4(
      document_id,run_id,attempt_id,expected_step,request_id,input_digest
    ) values (
      v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,
      v_expected_step,v_request_id,v_digest
    );
    if v_run.status='ACTIVE' then
      update public.ratiflow_issue_relay_attempts_v4 set provider_dispatched=true,
        status='AWAITING_MODEL',updated_at=v_now where attempt_id=v_attempt.attempt_id
        returning * into v_attempt;
    end if;
    if v_attempt.previous_outcome->>'outcome'='EXECUTE_TOOL' then
      select permit_claims into v_previous_permit_claims
      from ratiflow_document_private.issue_relay_execution_permits_v4
      where attempt_id=v_attempt.attempt_id
        and function_call_id=v_attempt.previous_outcome->>'functionCallId';
    end if;
    return jsonb_build_object('ok',true,'data',
      jsonb_build_object('disposition','AUTHORIZED','context',jsonb_build_object(
          'run',ratiflow_document_private.relay_run_json_v4(v_run.run_id),
          'attempt',ratiflow_document_private.relay_attempt_json_v4(
            v_attempt.attempt_id,false,true
          ),
          'agent',ratiflow_document_private.managed_agent_json_v4(v_run.profile_id),
          'previousProviderResponseId',v_attempt.previous_provider_response_id,
          'previousOutcome',v_attempt.previous_outcome
        ))
        || case when v_previous_permit_claims is null then '{}'::jsonb
          else jsonb_build_object('previousPermitClaims',v_previous_permit_claims) end
    );
  elsif p_action='RECORD_STEP_RESULT' then
    if not ratiflow_document_private.input_v4(p_input,array[
        'requestId','inputDigest','attemptId','expectedStep','providerResponseId','result'
      ],'{}')
      or not ratiflow_document_private.uuid_v4(p_input->'requestId')
      or not ratiflow_document_private.uuid_v4(p_input->'attemptId')
      or p_input->>'inputDigest' is null
      or (p_input->>'inputDigest') !~ '^sha256:[0-9a-f]{64}$'
      or not ratiflow_document_private.counter_v4(p_input->'expectedStep',0,6)
      or jsonb_typeof(p_input->'result')<>'object'
      or not (p_input->'result' ? 'ok')
      or (p_input->>'attemptId')::uuid<>v_attempt.attempt_id
      or (p_input->'providerResponseId'<>'null'::jsonb and
        not ratiflow_document_private.text_v4(p_input->'providerResponseId',1024,false)) then
      return ratiflow_document_private.invalid_v4('The Relay step result is invalid.');
    end if;
    v_request_id := (p_input->>'requestId')::uuid;
    select * into v_step from ratiflow_document_private.issue_relay_steps_v4
      where attempt_id=v_attempt.attempt_id and request_id=v_request_id for update;
    if not found or v_step.input_digest is distinct from p_input->>'inputDigest'
      or v_step.expected_step<>(p_input->>'expectedStep')::integer then
      return ratiflow_document_private.error_v4(
        'RELAY_STATE_CONFLICT','The Relay step reservation does not match.',false
      );
    end if;
    if v_step.status='TERMINAL' then
      if v_step.result<>p_input->'result'
        or v_step.provider_response_id is distinct from p_input->>'providerResponseId' then
        return ratiflow_document_private.error_v4(
          'REQUEST_REPLAY_MISMATCH','The Relay step result changed on replay.',false
        );
      end if;
      if v_step.permit_id is not null then select permit_claims into v_permit_claims
        from ratiflow_document_private.issue_relay_execution_permits_v4
        where permit_id=v_step.permit_id; end if;
      return jsonb_build_object('ok',true,'data',
        jsonb_build_object(
          'attempt',ratiflow_document_private.relay_attempt_json_v4(
            v_attempt.attempt_id,false,true
          ),'result',v_step.result
        ) || case when v_permit_claims is null then '{}'::jsonb
          else jsonb_build_object('permitClaims',v_permit_claims) end
      );
    end if;
    if not (v_run.status='ACTIVE'
        and v_attempt.status not in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED'))
      and not (v_run.status='COMPLETED' and v_run.terminal_reason='TASK_COMPLETED'
        and v_attempt.status='SUCCEEDED' and v_task.status='COMPLETED') then
      return ratiflow_document_private.error_v4(
        'RELAY_LEASE_LOST','Terminal Relay state cannot be reopened.',false
      );
    end if;
    v_result := p_input->'result';
    if v_result->>'ok'='true' then
      v_outcome := v_result->'data';
      v_outcome_name := v_outcome->>'outcome';
      if v_outcome_name not in ('DISCOVER_TOOLS','EXECUTE_TOOL','COMPLETED','RETRY_REQUIRED')
        or not ratiflow_document_private.counter_v4(v_outcome->'nextStep',1,6)
        or (v_outcome->>'nextStep')::integer<>v_step.expected_step+1 then
        return ratiflow_document_private.error_v4(
          'RELAY_RESULT_INVALID','The Relay step outcome is invalid.',false
        );
      end if;
      if v_outcome_name='EXECUTE_TOOL' then
        select * into v_permit from ratiflow_document_private.issue_relay_execution_permits_v4
          where attempt_id=v_attempt.attempt_id
            and function_call_id=v_outcome->>'functionCallId'
            and physical_tool_name=v_outcome->>'physicalToolName';
        if not found then return ratiflow_document_private.error_v4(
          'RELAY_RESULT_INVALID','The step outcome has no bound execution permit.',false
        ); end if;
        v_permit_claims := v_permit.permit_claims;
        update ratiflow_document_private.issue_relay_steps_v4
          set permit_id=v_permit.permit_id where step_id=v_step.step_id;
      end if;
      if v_outcome_name='COMPLETED' and v_task.status<>'COMPLETED' then
        return ratiflow_document_private.error_v4(
          'RELAY_STATE_CONFLICT','A model response cannot complete an unfinished task.',false
        );
      end if;
    end if;
    update ratiflow_document_private.issue_relay_steps_v4 set
      status='TERMINAL',provider_response_id=case
        when p_input->'providerResponseId'='null'::jsonb then null
        else p_input->>'providerResponseId' end,
      result=v_result,completed_at=v_now where step_id=v_step.step_id;
    update public.ratiflow_issue_relay_attempts_v4 set
      provider_call_count=provider_call_count+case
        when p_input->'providerResponseId'<>'null'::jsonb
          or (v_result->>'ok'='false'
            and v_result->>'code'='RELAY_PROVIDER_OUTCOME_UNKNOWN') then 1 else 0 end,
      current_step=case when v_result->>'ok'='true'
        then (v_outcome->>'nextStep')::integer else current_step end,
      previous_provider_response_id=case when v_result->>'ok'='true'
        then case when p_input->'providerResponseId'='null'::jsonb then null
          else p_input->>'providerResponseId' end else previous_provider_response_id end,
      previous_outcome=case when v_result->>'ok'='true' then v_outcome else previous_outcome end,
      tool_call_count=tool_call_count+case when v_outcome_name='EXECUTE_TOOL' then 1 else 0 end,
      updated_at=v_now where attempt_id=v_attempt.attempt_id;
    if v_result->>'ok'='false'
      and v_result->>'code'='RELAY_PROVIDER_OUTCOME_UNKNOWN' then
      if v_run.status='COMPLETED' and v_run.terminal_reason='TASK_COMPLETED'
        and v_task.status='COMPLETED' then
        update public.ratiflow_issue_relay_attempts_v4 set status='SUCCEEDED',
          completed_at=coalesce(completed_at,v_run.completed_at,v_now),updated_at=v_now
          where attempt_id=v_attempt.attempt_id;
      else
        update public.ratiflow_issue_relay_attempts_v4 set status='RECONCILING',
          completed_at=null,updated_at=v_now where attempt_id=v_attempt.attempt_id;
        if not exists(select 1 from public.ratiflow_issue_relay_trace_v4 e
          where e.attempt_id=v_attempt.attempt_id and e.kind='ATTEMPT_RECONCILING') then
          perform ratiflow_document_private.relay_trace_append_v4(
            v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_RECONCILING',
            p_detail=>jsonb_build_object('reason','PROVIDER_OUTCOME_UNKNOWN')
          );
        end if;
      end if;
    elsif v_result->>'ok'<>'true' or v_outcome_name='RETRY_REQUIRED' then
      if not (v_run.status='COMPLETED' and v_run.terminal_reason='TASK_COMPLETED'
        and v_task.status='COMPLETED') then
        update public.ratiflow_issue_relay_attempts_v4 set status='FAILED',
          completed_at=v_now,updated_at=v_now where attempt_id=v_attempt.attempt_id;
        update public.ratiflow_issue_relay_runs_v4 set
          status=case when attempt_count>=max_attempts then 'EXHAUSTED' else 'WAITING_RETRY' end,
          terminal_reason=case when attempt_count>=max_attempts
            then 'ATTEMPTS_EXHAUSTED' else null end,
          completed_at=case when attempt_count>=max_attempts then v_now else null end,
          updated_at=v_now where run_id=v_run.run_id returning * into v_run;
        perform ratiflow_document_private.relay_trace_append_v4(
          v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'ATTEMPT_FAILED'
        );
        perform ratiflow_document_private.relay_trace_append_v4(
          v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,
          case v_run.status when 'EXHAUSTED' then 'RUN_EXHAUSTED'
            else 'RUN_WAITING_RETRY' end
        );
      end if;
    elsif v_outcome_name='DISCOVER_TOOLS' then
      update public.ratiflow_issue_relay_attempts_v4 set status='DISCOVERING'
        where attempt_id=v_attempt.attempt_id;
      if v_attempt.previous_outcome is null then
        perform ratiflow_document_private.relay_trace_append_v4(
          v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'MODEL_TOOL_SEARCH_REQUESTED');
      end if;
    elsif v_outcome_name='EXECUTE_TOOL' then
      update public.ratiflow_issue_relay_attempts_v4 set status='EXECUTING_TOOL'
        where attempt_id=v_attempt.attempt_id;
      perform ratiflow_document_private.relay_trace_append_v4(
        v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'MODEL_TOOL_SELECTED',
        p_logical_tool_name=>v_permit.logical_tool_name,
        p_physical_tool_name=>v_permit.physical_tool_name,
        p_arguments_digest=>v_permit.arguments_digest
      );
    elsif v_outcome_name='COMPLETED' then
      update public.ratiflow_issue_relay_attempts_v4 set status='SUCCEEDED',
        completed_at=coalesce(completed_at,v_now),updated_at=v_now
        where attempt_id=v_attempt.attempt_id;
      update public.ratiflow_issue_relay_runs_v4 set status='COMPLETED',
        terminal_reason='TASK_COMPLETED',completed_at=coalesce(completed_at,v_now),
        updated_at=v_now where run_id=v_run.run_id;
    end if;
    select * into strict v_attempt from public.ratiflow_issue_relay_attempts_v4
      where attempt_id=v_attempt.attempt_id;
    return jsonb_build_object('ok',true,'data',
      jsonb_build_object(
        'attempt',ratiflow_document_private.relay_attempt_json_v4(
          v_attempt.attempt_id,false,true
        ),'result',v_result
      ) || case when v_permit_claims is null then '{}'::jsonb
        else jsonb_build_object('permitClaims',v_permit_claims) end
    );
  end if;
  return ratiflow_document_private.invalid_v4('Unknown Relay transition action.');
end;
$$;

create or replace function public.ratiflow_begin_issue_relay_tool_v4(
  p_grant_claims jsonb,
  p_grant_digest text,
  p_permit_claims jsonb,
  p_permit_digest text,
  p_request_id uuid,
  p_physical_tool_name text,
  p_input jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt_id uuid;
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_permit ratiflow_document_private.issue_relay_execution_permits_v4%rowtype;
declare v_permit_id uuid;
declare v_context jsonb;
declare v_now timestamptz := clock_timestamp();
begin
  v_attempt_id := ratiflow_document_private.relay_grant_attempt_v4(
    p_grant_claims,p_grant_digest,true
  );
  if v_attempt_id is null then return ratiflow_document_private.unauthorized_v4(
    'The Relay grant is invalid.'
  ); end if;
  if p_request_id is null or p_permit_claims is null
    or jsonb_typeof(p_permit_claims)<>'object'
    or p_permit_digest is null or p_permit_digest !~ '^sha256:[0-9a-f]{64}$'
    or not ratiflow_document_private.text_v4(to_jsonb(p_physical_tool_name),64,false)
    or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>8192 then
    return ratiflow_document_private.error_v4(
      'RELAY_EXECUTION_NOT_ARMED','The Relay permit is invalid.',false
    );
  end if;
  select * into strict v_attempt from public.ratiflow_issue_relay_attempts_v4
    where attempt_id=v_attempt_id for update;
  select * into strict v_run from public.ratiflow_issue_relay_runs_v4
    where run_id=v_attempt.run_id for update;
  if v_attempt.grant_revoked_at is not null then
    return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.');
  end if;
  select * into v_permit from ratiflow_document_private.issue_relay_execution_permits_v4
    where attempt_id=v_attempt.attempt_id and permit_claims=p_permit_claims for update;
  if not found or v_permit.token_digest is null
    or v_permit.token_digest is distinct from p_permit_digest
    or v_permit.physical_tool_name<>p_physical_tool_name
    or v_permit.arguments<>p_input
    or v_permit.registration_generation<>v_attempt.registration_generation
    or v_permit.lease_id<>v_attempt.lease_id then
    return ratiflow_document_private.error_v4(
      'RELAY_EXECUTION_NOT_ARMED','The Relay permit does not match this call.',false
    );
  end if;
  v_permit_id := v_permit.permit_id;
  if v_permit.execution_request_id is not null
    and v_permit.execution_request_id<>p_request_id then
    return ratiflow_document_private.error_v4(
      'REQUEST_REPLAY_MISMATCH','This permit was consumed by another request.',false
    );
  end if;
  if exists (
    select 1 from ratiflow_document_private.issue_relay_execution_permits_v4 other
    where other.attempt_id=v_attempt.attempt_id
      and other.execution_request_id=p_request_id
      and other.permit_id<>v_permit.permit_id
  ) then
    return ratiflow_document_private.error_v4(
      'REQUEST_REPLAY_MISMATCH','This tool request ID was used by another permit.',false
    );
  end if;
  if v_permit.status='EXECUTING'
    and v_permit.logical_tool_name in (
      'comment_on_assignment','submit_scoped_revision'
    ) then
    -- Recover an already-recorded mutation before testing whether authority is
    -- still live. The exact ledger receipt is authoritative and never invokes
    -- the mutable application port a second time.
    perform ratiflow_document_private.recover_completed_relay_permits_v4(
      v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,v_permit_id
    );
    select permit.* into strict v_permit
      from ratiflow_document_private.issue_relay_execution_permits_v4 permit
      where permit.permit_id=v_permit_id;
  end if;
  v_now := clock_timestamp();
  v_context := jsonb_build_object(
    'documentId',v_attempt.document_id,'runId',v_run.run_id,
    'attemptId',v_attempt.attempt_id,'taskId',v_run.task_id,
    'profileId',v_run.profile_id,
    'registrationGeneration',v_attempt.registration_generation,
    'physicalToolName',v_permit.physical_tool_name,
    'logicalToolName',v_permit.logical_tool_name,
    'requestId',v_permit.downstream_request_id
  );
  if v_permit.status='COMPLETED' and v_permit.result_receipt_id is not null
    and v_permit.output is not null then
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'disposition','RECORDED','result',jsonb_build_object(
        'resultReceiptId',v_permit.result_receipt_id,'output',v_permit.output
      )
    ));
  elsif v_permit.status='EXECUTING' then
    if v_run.status<>'ACTIVE'
      or v_attempt.status in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
      or v_attempt.lease_expires_at<=v_now or v_attempt.deadline_at<=v_now
      or (v_permit.permit_claims->>'expiresAt')::timestamptz<=v_now then
      return ratiflow_document_private.error_v4(
        'RELAY_EXECUTION_NOT_ARMED','The executing permit is expired or inactive.',false
      );
    end if;
    if v_permit.logical_tool_name in (
      'comment_on_assignment','submit_scoped_revision'
    ) then
      -- The same durable downstream request UUID makes a lost HTTP response safe
      -- to reconstruct through the repository request ledger while the original
      -- attempt authority remains live.
      return jsonb_build_object('ok',true,'data',jsonb_build_object(
        'disposition','AUTHORIZED','context',v_context
      ));
    end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'disposition','IN_PROGRESS'
    ));
  elsif v_permit.status<>'ISSUED' then
    return ratiflow_document_private.error_v4(
      'RELAY_EXECUTION_NOT_ARMED','The one-shot permit is no longer armed.',false
    );
  end if;
  if v_run.status<>'ACTIVE'
    or v_attempt.status in ('SUCCEEDED','FAILED','EXPIRED','CANCELLED')
    or v_attempt.lease_expires_at<=v_now or v_attempt.deadline_at<=v_now
    or (v_permit.permit_claims->>'expiresAt')::timestamptz<=v_now then
    return ratiflow_document_private.error_v4(
      'RELAY_EXECUTION_NOT_ARMED','The one-shot permit is expired or inactive.',false
    );
  end if;
  update ratiflow_document_private.issue_relay_execution_permits_v4
    set status='EXECUTING',execution_request_id=p_request_id
    where permit_id=v_permit.permit_id returning * into v_permit;
  update public.ratiflow_issue_relay_attempts_v4
    set status='EXECUTING_TOOL',updated_at=v_now where attempt_id=v_attempt.attempt_id;
  perform ratiflow_document_private.relay_trace_append_v4(
    v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'WEBMCP_EXECUTE_STARTED',
    p_logical_tool_name=>v_permit.logical_tool_name,
    p_physical_tool_name=>v_permit.physical_tool_name,
    p_arguments_digest=>v_permit.arguments_digest
  );
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'disposition','AUTHORIZED','context',v_context
  ));
end;
$$;

create or replace function public.ratiflow_finish_issue_relay_tool_v4(
  p_grant_claims jsonb,
  p_grant_digest text,
  p_permit_claims jsonb,
  p_request_id uuid,
  p_output text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt_id uuid;
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_run public.ratiflow_issue_relay_runs_v4%rowtype;
declare v_permit ratiflow_document_private.issue_relay_execution_permits_v4%rowtype;
declare v_receipt uuid := extensions.gen_random_uuid();
declare v_digest text;
declare v_output jsonb;
declare v_now timestamptz := clock_timestamp();
begin
  v_attempt_id := ratiflow_document_private.relay_grant_attempt_v4(
    p_grant_claims,p_grant_digest,true
  );
  if v_attempt_id is null then return ratiflow_document_private.unauthorized_v4(
    'The Relay grant is invalid.'
  ); end if;
  if p_request_id is null or p_output is null or octet_length(p_output)>32768 then
    return ratiflow_document_private.error_v4(
      'RELAY_RESULT_INVALID','The managed tool result is invalid.',false
    );
  end if;
  begin
    v_output := p_output::jsonb;
    if jsonb_typeof(v_output)<>'object'
      or jsonb_typeof(v_output->'ok')<>'boolean'
      or (v_output->>'ok'='true' and (
        not ratiflow_document_private.input_v4(v_output,array['ok','data'],'{}')
        or jsonb_typeof(v_output->'data')<>'object'
      ))
      or (v_output->>'ok'='false' and (
        not ratiflow_document_private.input_v4(
          v_output,array['ok','code','message','retryable'],'{}'
        )
        or not ratiflow_document_private.text_v4(v_output->'code',80,false)
        or not ratiflow_document_private.text_v4(v_output->'message',2000,false)
        or jsonb_typeof(v_output->'retryable')<>'boolean'
      )) then
      return ratiflow_document_private.error_v4(
        'RELAY_RESULT_INVALID','The managed tool result envelope is invalid.',false
      );
    end if;
  exception when others then
    return ratiflow_document_private.error_v4(
      'RELAY_RESULT_INVALID','The managed tool result envelope is invalid.',false
    );
  end;
  select * into strict v_attempt from public.ratiflow_issue_relay_attempts_v4
    where attempt_id=v_attempt_id for update;
  select * into strict v_run from public.ratiflow_issue_relay_runs_v4
    where run_id=v_attempt.run_id for update;
  if v_attempt.grant_revoked_at is not null then
    return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.');
  end if;
  select * into v_permit from ratiflow_document_private.issue_relay_execution_permits_v4
    where attempt_id=v_attempt.attempt_id and permit_claims=p_permit_claims for update;
  if not found or v_permit.execution_request_id<>p_request_id then
    return ratiflow_document_private.error_v4(
      'RELAY_EXECUTION_NOT_ARMED','The managed tool execution is not authorized.',false
    );
  end if;
  if v_permit.status='COMPLETED' and v_permit.output is not null
    and v_permit.output::jsonb=v_output
    and v_permit.result_receipt_id is not null then
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'resultReceiptId',v_permit.result_receipt_id,'output',v_permit.output
    ));
  elsif v_permit.status<>'EXECUTING' then
    return ratiflow_document_private.error_v4(
      'RELAY_EXECUTION_NOT_ARMED','The one-shot permit is no longer executing.',false
    );
  end if;
  v_digest := 'sha256:'||encode(extensions.digest(p_output,'sha256'),'hex');
  update ratiflow_document_private.issue_relay_execution_permits_v4 set
    status='COMPLETED',result_receipt_id=v_receipt,output=p_output,
    output_digest=v_digest,completed_at=v_now where permit_id=v_permit.permit_id
    returning * into v_permit;
  update public.ratiflow_issue_relay_attempts_v4 set
    status=case when v_run.status='COMPLETED' then 'SUCCEEDED' else 'AWAITING_MODEL' end,
    completed_at=case when v_run.status='COMPLETED' then coalesce(completed_at,v_now)
      else null end,updated_at=v_now where attempt_id=v_attempt.attempt_id;
  perform ratiflow_document_private.relay_trace_append_v4(
    v_attempt.document_id,v_run.run_id,v_attempt.attempt_id,'WEBMCP_EXECUTE_COMPLETED',
    p_logical_tool_name=>v_permit.logical_tool_name,
    p_physical_tool_name=>v_permit.physical_tool_name,
    p_arguments_digest=>v_permit.arguments_digest,p_result_digest=>v_digest
  );
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'resultReceiptId',v_receipt,'output',p_output
  ));
end;
$$;

create or replace function public.ratiflow_record_issue_relay_trace_v4(
  p_grant_claims jsonb,
  p_grant_digest text,
  p_input jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_attempt_id uuid;
declare v_attempt public.ratiflow_issue_relay_attempts_v4%rowtype;
declare v_event jsonb;
declare v_detail jsonb;
begin
  v_attempt_id := ratiflow_document_private.relay_grant_attempt_v4(
    p_grant_claims,p_grant_digest,true
  );
  if v_attempt_id is null then return ratiflow_document_private.unauthorized_v4(
    'The Relay grant is invalid.'
  ); end if;
  if not ratiflow_document_private.input_v4(p_input,array['kind','detail'],'{}')
    or p_input->>'kind' not in (
      'IDLE_CATALOG_WITHDRAWN','RELAY_CATALOG_REGISTERED',
      'WEBMCP_TOOLCHANGE_OBSERVED','RELAY_CATALOG_WITHDRAWN','IDLE_CATALOG_RESTORED'
    ) then return ratiflow_document_private.invalid_v4('The Relay trace event is invalid.');
  end if;
  v_detail := coalesce(p_input->'detail','{}'::jsonb);
  if not ratiflow_document_private.input_v4(v_detail,array['transition'],'{}')
    or v_detail->>'transition' not in (
      'IDLE_CATALOG_WITHDRAWN','RELAY_CATALOG_REGISTERED',
      'RELAY_CATALOG_WITHDRAWN','IDLE_CATALOG_RESTORED'
    ) or (p_input->>'kind'<>'WEBMCP_TOOLCHANGE_OBSERVED'
      and p_input->>'kind'<>v_detail->>'transition') then
    return ratiflow_document_private.invalid_v4('The Relay trace detail is invalid.');
  end if;
  select * into strict v_attempt from public.ratiflow_issue_relay_attempts_v4
    where attempt_id=v_attempt_id for update;
  if v_attempt.grant_revoked_at is not null then
    return ratiflow_document_private.unauthorized_v4('The Relay grant is invalid.');
  end if;
  if p_input->>'kind'='RELAY_CATALOG_WITHDRAWN' then
    perform ratiflow_document_private.recover_completed_relay_permits_v4(
      v_attempt.document_id,v_attempt.run_id,v_attempt.attempt_id
    );
  end if;
  if (select count(*) from public.ratiflow_issue_relay_trace_v4
      where attempt_id=v_attempt_id)>=64 then
    return ratiflow_document_private.error_v4(
      'RATE_LIMITED','The Relay trace event limit is reached.',false
    );
  end if;
  v_event := ratiflow_document_private.relay_trace_append_v4(
    v_attempt.document_id,v_attempt.run_id,v_attempt.attempt_id,p_input->>'kind',
    p_input->>'logicalToolName',p_input->>'physicalToolName',
    p_input->>'manifestDigest',p_input->>'argumentsDigest',p_input->>'resultDigest',v_detail
  );
  return jsonb_build_object('ok',true,'data',v_event);
end;
$$;

revoke all on function public.ratiflow_create_issue_directory_mention_v4(text,uuid,jsonb)
  from public,anon,authenticated;
revoke all on function public.ratiflow_read_issue_relay_state_v4(text)
  from public,anon,authenticated;
revoke all on function public.ratiflow_claim_issue_relay_v4(text,uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.ratiflow_renew_issue_relay_lease_v4(jsonb,text,uuid)
  from public,anon,authenticated;
revoke all on function public.ratiflow_release_issue_relay_v4(jsonb,text)
  from public,anon,authenticated;
revoke all on function public.ratiflow_record_issue_relay_trace_v4(jsonb,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.ratiflow_begin_issue_relay_tool_v4(
  jsonb,text,jsonb,text,uuid,text,jsonb
) from public,anon,authenticated;
revoke all on function public.ratiflow_finish_issue_relay_tool_v4(
  jsonb,text,jsonb,uuid,text
) from public,anon,authenticated;
revoke all on function public.ratiflow_transition_issue_relay_attempt_v4(
  text,jsonb,text,jsonb,jsonb
) from public,anon,authenticated;

grant execute on function public.ratiflow_create_issue_directory_mention_v4(text,uuid,jsonb)
  to service_role;
grant execute on function public.ratiflow_read_issue_relay_state_v4(text)
  to service_role;
grant execute on function public.ratiflow_claim_issue_relay_v4(text,uuid,uuid,uuid)
  to service_role;
grant execute on function public.ratiflow_renew_issue_relay_lease_v4(jsonb,text,uuid)
  to service_role;
grant execute on function public.ratiflow_release_issue_relay_v4(jsonb,text)
  to service_role;
grant execute on function public.ratiflow_record_issue_relay_trace_v4(jsonb,text,jsonb)
  to service_role;
grant execute on function public.ratiflow_begin_issue_relay_tool_v4(
  jsonb,text,jsonb,text,uuid,text,jsonb
) to service_role;
grant execute on function public.ratiflow_finish_issue_relay_tool_v4(
  jsonb,text,jsonb,uuid,text
) to service_role;
grant execute on function public.ratiflow_transition_issue_relay_attempt_v4(
  text,jsonb,text,jsonb,jsonb
) to service_role;

revoke all on all functions in schema ratiflow_document_private
  from public,anon,authenticated;
