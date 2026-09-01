-- Additive v3 shared-document decision memory. Existing v2 rows and RPCs remain
-- rollback-compatible; v3 rows are protocol-bound and reachable only through the
-- narrow functions granted at the end of this migration.

create or replace function ratiflow_document_private.trim_ecmascript_v3(p_value text)
returns text
language sql
immutable
strict
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select btrim(
    p_value,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
  )
$$;

alter table public.ratiflow_documents
  add column protocol_version smallint not null default 2,
  add column activity_version bigint not null default 0;

alter table public.ratiflow_documents alter column revision type bigint;
alter table public.ratiflow_document_presence alter column observed_revision type bigint;

alter table public.ratiflow_documents
  add constraint ratiflow_documents_protocol_version_check
    check (protocol_version in (2, 3)),
  add constraint ratiflow_documents_activity_version_check
    check (activity_version between 0 and 9007199254740991);

alter table public.ratiflow_document_request_ledger
  drop constraint ratiflow_document_request_ledger_operation_check;

alter table public.ratiflow_document_request_ledger
  add constraint ratiflow_document_request_ledger_operation_check check (
    operation in (
      'SAVE_HUMAN', 'SET_STAGE', 'CREATE_ACTION', 'APPLY_AGENT_EDIT',
      'UNDO_AGENT_EDIT', 'CREATE_ANNOTATION', 'CANCEL_ANNOTATION',
      'APPLY_AGENT_ANNOTATION', 'SAVE_DOCUMENT_V3', 'CREATE_DOCUMENT_WORK_V3',
      'CANCEL_DOCUMENT_WORK_V3', 'SUBMIT_DOCUMENT_PROPOSAL_V3',
      'ACCEPT_DOCUMENT_PROPOSAL_V3', 'REJECT_DOCUMENT_PROPOSAL_V3'
    )
  );

create table public.ratiflow_document_work_orders (
  work_order_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  intent text not null check (intent in ('REWRITE', 'RESEARCH', 'CUSTOM')),
  source text not null check (source in ('SELECTION_AFFORDANCE', 'CONTEXT_MENU', 'KEYBOARD')),
  instruction text not null check (
    char_length(instruction) between 1 and 500
    and char_length(ratiflow_document_private.trim_ecmascript_v3(instruction)) >= 1
  ),
  anchor_field public.ratiflow_document_field not null,
  range_start bigint not null check (range_start between 0 and 9007199254740991),
  range_end bigint not null check (
    range_end between 0 and 9007199254740991 and range_end > range_start
  ),
  selected_text text not null check (char_length(selected_text) between 1 and 50000),
  created_revision bigint not null check (created_revision between 0 and 9007199254740991),
  anchor_revision bigint not null check (anchor_revision between 0 and 9007199254740991),
  creator_member_id uuid not null,
  creator_display_name text not null check (
    char_length(ratiflow_document_private.trim_ecmascript_v3(creator_display_name)) between 1 and 80
  ),
  assigned_to_member_id uuid not null,
  assigned_to_display_name text not null check (
    char_length(ratiflow_document_private.trim_ecmascript_v3(assigned_to_display_name)) between 1 and 80
  ),
  status text not null default 'PENDING' check (
    status in ('PENDING', 'PROPOSED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'STALE')
  ),
  proposal_replacement_text text check (
    proposal_replacement_text is null or char_length(proposal_replacement_text) <= 50000
  ),
  proposal_change_summary text check (
    proposal_change_summary is null or (
      char_length(proposal_change_summary) between 1 and 240
      and char_length(
        ratiflow_document_private.trim_ecmascript_v3(proposal_change_summary)
      ) >= 1
    )
  ),
  proposal_based_on_revision bigint check (
    proposal_based_on_revision is null
    or proposal_based_on_revision between 0 and 9007199254740991
  ),
  proposed_by_display_name text check (
    proposed_by_display_name is null or char_length(
      ratiflow_document_private.trim_ecmascript_v3(proposed_by_display_name)
    ) between 1 and 120
  ),
  proposed_at timestamptz,
  decision_kind text check (decision_kind is null or decision_kind in ('ACCEPTED', 'REJECTED')),
  decision_rationale text check (
    decision_rationale is null or (
      char_length(decision_rationale) between 1 and 500
      and char_length(ratiflow_document_private.trim_ecmascript_v3(decision_rationale)) >= 1
    )
  ),
  decided_by_member_id uuid,
  decided_by_display_name text check (
    decided_by_display_name is null or char_length(
      ratiflow_document_private.trim_ecmascript_v3(decided_by_display_name)
    ) between 1 and 80
  ),
  decided_at timestamptz,
  decision_revision bigint check (
    decision_revision is null or decision_revision between 0 and 9007199254740991
  ),
  result_revision bigint check (
    result_revision is null or result_revision between 0 and 9007199254740991
  ),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, creator_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, assigned_to_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, decided_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  constraint ratiflow_document_work_proposal_coherent check (
    (
      status in ('PENDING', 'CANCELLED')
      and proposal_replacement_text is null and proposal_change_summary is null
      and proposal_based_on_revision is null and proposed_by_display_name is null
      and proposed_at is null
    ) or (
      status in ('PROPOSED', 'COMPLETED', 'REJECTED', 'STALE')
      and (
        (status = 'STALE' and proposal_replacement_text is null
          and proposal_change_summary is null and proposal_based_on_revision is null
          and proposed_by_display_name is null and proposed_at is null)
        or
        (proposal_replacement_text is not null and proposal_change_summary is not null
          and proposal_based_on_revision is not null and proposed_by_display_name is not null
          and proposed_at is not null)
      )
    )
  ),
  constraint ratiflow_document_work_decision_coherent check (
    (
      status = 'COMPLETED' and decision_kind = 'ACCEPTED'
      and decision_rationale is not null and decided_by_member_id is not null
      and decided_by_display_name is not null and decided_at is not null
      and decision_revision is not null and result_revision = decision_revision + 1
      and resolved_at is not null
    ) or (
      status = 'REJECTED' and decision_kind = 'REJECTED'
      and decision_rationale is not null and decided_by_member_id is not null
      and decided_by_display_name is not null and decided_at is not null
      and decision_revision is not null and result_revision = decision_revision
      and resolved_at is not null
    ) or (
      status in ('PENDING', 'PROPOSED', 'CANCELLED', 'STALE')
      and decision_kind is null and decision_rationale is null
      and decided_by_member_id is null and decided_by_display_name is null
      and decided_at is null and decision_revision is null and result_revision is null
      and ((status in ('PENDING', 'PROPOSED') and resolved_at is null)
        or (status in ('CANCELLED', 'STALE') and resolved_at is not null))
    )
  )
);

create table public.ratiflow_document_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  activity_version bigint not null check (activity_version between 1 and 9007199254740991),
  kind text not null check (kind in (
    'DOCUMENT_EDITED', 'WORK_CREATED', 'PROPOSAL_SUBMITTED',
    'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'WORK_CANCELLED', 'WORK_STALE'
  )),
  actor_display_name text not null check (
    char_length(ratiflow_document_private.trim_ecmascript_v3(actor_display_name)) between 1 and 120
  ),
  actor_type text not null check (actor_type in ('HUMAN', 'AGENT', 'SYSTEM')),
  origin text not null check (origin in ('ORDINARY_UI', 'WEBMCP', 'SYSTEM')),
  base_revision bigint not null check (base_revision between 0 and 9007199254740991),
  result_revision bigint not null check (result_revision between 0 and 9007199254740991),
  work_order_id uuid references public.ratiflow_document_work_orders(work_order_id),
  linked_work_order_ids uuid[] not null default '{}',
  changed_fields text[] not null default '{}',
  target_excerpt text check (target_excerpt is null or char_length(target_excerpt) <= 320),
  instruction_excerpt text check (instruction_excerpt is null or char_length(instruction_excerpt) <= 320),
  proposal_excerpt text check (proposal_excerpt is null or char_length(proposal_excerpt) <= 320),
  change_summary text check (change_summary is null or char_length(change_summary) between 1 and 240),
  diffs jsonb not null default '[]'::jsonb check (jsonb_typeof(diffs) = 'array'),
  rationale text check (rationale is null or char_length(rationale) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (document_id, activity_version),
  constraint ratiflow_document_events_changed_fields_check check (
    changed_fields <@ array['TITLE', 'BODY']::text[]
  )
);

create index ratiflow_document_work_active_idx
  on public.ratiflow_document_work_orders (document_id, created_at, work_order_id)
  where status in ('PENDING', 'PROPOSED');
create index ratiflow_document_work_assignee_pending_idx
  on public.ratiflow_document_work_orders (
    document_id, assigned_to_member_id, created_at, work_order_id
  ) where status = 'PENDING';
create index ratiflow_document_work_terminal_idx
  on public.ratiflow_document_work_orders (document_id, resolved_at desc, work_order_id desc)
  where status in ('COMPLETED', 'REJECTED', 'CANCELLED', 'STALE');
create index ratiflow_document_events_memory_idx
  on public.ratiflow_document_events (document_id, activity_version desc);

alter table public.ratiflow_document_work_orders enable row level security;
alter table public.ratiflow_document_events enable row level security;
revoke all on public.ratiflow_document_work_orders from public, anon, authenticated;
revoke all on public.ratiflow_document_events from public, anon, authenticated;

create or replace function ratiflow_document_private.safe_counter_v3(p_value jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'number' then false
    when (p_value #>> '{}') !~ '^(0|[1-9][0-9]*)$' then false
    else (p_value #>> '{}')::numeric between 0 and 9007199254740991
  end
$$;

create or replace function ratiflow_document_private.safe_integer_counter_v3(p_value jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when not ratiflow_document_private.safe_counter_v3(p_value) then false
    else (p_value #>> '{}')::numeric <= 2147483647
  end
$$;

create or replace function ratiflow_document_private.safe_counter_between_v3(
  p_value jsonb,
  p_minimum numeric,
  p_maximum numeric
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when p_minimum is null or p_maximum is null or p_minimum > p_maximum then false
    when not ratiflow_document_private.safe_counter_v3(p_value) then false
    else (p_value #>> '{}')::numeric between p_minimum and p_maximum
  end
$$;

create or replace function ratiflow_document_private.nonblank_text_v3(
  p_value jsonb,
  p_maximum_length integer
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'string' then false
    when p_maximum_length is null or p_maximum_length < 1 then false
    else char_length(p_value #>> '{}') <= p_maximum_length
      and char_length(ratiflow_document_private.trim_ecmascript_v3(p_value #>> '{}')) >= 1
  end
$$;

create or replace function ratiflow_document_private.uuid_text_v3(p_value jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select p_value is not null and jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

create or replace function ratiflow_document_private.excerpt_v3(p_value text)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when p_value is null then null
    when char_length(p_value) <= 320 then p_value
    else substring(p_value from 1 for 319) || '…'
  end
$$;

create or replace function ratiflow_document_private.error_v3(
  p_code text,
  p_message text,
  p_retryable boolean default false,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'ok', false, 'code', p_code, 'message', p_message, 'retryable', p_retryable
  ) || coalesce(p_details, '{}'::jsonb)
$$;

create or replace function ratiflow_document_private.unauthorized_v3()
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error_v3(
    'UNAUTHORIZED', 'A valid protocol-v3 document session is required.', false
  )
$$;

create or replace function ratiflow_document_private.auth_failure_v3(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_legacy record;
begin
  select * into v_legacy from ratiflow_document_private.member_for_handle(p_handle);
  if found then
    return ratiflow_document_private.error_v3(
      'PROTOCOL_MISMATCH', 'This session belongs to protocol version 2.', false
    );
  end if;
  return ratiflow_document_private.unauthorized_v3();
end
$$;

create or replace function ratiflow_document_private.member_for_handle_v3(p_handle text)
returns table (
  document_id uuid,
  member_id uuid,
  display_name text,
  color text,
  actor_type public.ratiflow_document_actor_type,
  session_instance_id uuid,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select s.document_id, s.member_id, m.display_name, m.color,
    s.actor_type, s.session_instance_id, s.expires_at
  from ratiflow_document_private.sessions as s
  join public.ratiflow_document_members as m
    on m.document_id = s.document_id and m.member_id = s.member_id
  join public.ratiflow_documents as d on d.id = s.document_id
  where p_handle is not null and char_length(p_handle) between 32 and 256
    and s.handle_hash = extensions.digest(p_handle, 'sha256')
    and s.expires_at > now() and d.expires_at > now()
    and d.protocol_version = 3
$$;

-- Protocol-fence every legacy v2 helper user. A v3 bearer cannot fall through to a
-- stage/annotation mutation even while the rollback catalog remains deployed.
create or replace function ratiflow_document_private.member_for_handle(p_handle text)
returns table (
  document_id uuid,
  member_id uuid,
  display_name text,
  color text,
  actor_type public.ratiflow_document_actor_type,
  session_instance_id uuid,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select s.document_id, s.member_id, m.display_name, m.color,
    s.actor_type, s.session_instance_id, s.expires_at
  from ratiflow_document_private.sessions as s
  join public.ratiflow_document_members as m
    on m.document_id = s.document_id and m.member_id = s.member_id
  join public.ratiflow_documents as d on d.id = s.document_id
  where p_handle is not null and char_length(p_handle) between 32 and 256
    and s.handle_hash = extensions.digest(p_handle, 'sha256')
    and s.expires_at > now() and d.expires_at > now()
    and d.protocol_version = 2
$$;

create or replace function ratiflow_document_private.document_json_v3(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'id', d.id,
    'protocolVersion', 3,
    'title', d.title,
    'body', d.body,
    'revision', d.revision,
    'activityVersion', d.activity_version,
    'updatedAt', d.updated_at,
    'lastEditor', case when d.last_editor_member_id is null then null else jsonb_build_object(
      'displayName', d.last_editor_display_name,
      'actorType', d.last_editor_actor_type::text,
      'origin', d.last_editor_origin::text
    ) end
  )
  from public.ratiflow_documents as d
  where d.id = p_document_id and d.protocol_version = 3 and d.expires_at > now()
$$;

create or replace function ratiflow_document_private.work_json_v3(p_work_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'workOrderId', w.work_order_id,
    'intent', w.intent,
    'source', w.source,
    'instruction', w.instruction,
    'anchor', jsonb_build_object(
      'field', w.anchor_field::text,
      'rangeStart', w.range_start,
      'rangeEnd', w.range_end,
      'selectedText', w.selected_text,
      'createdRevision', w.created_revision,
      'anchorRevision', w.anchor_revision
    ),
    'creatorMemberId', w.creator_member_id,
    'creatorDisplayName', w.creator_display_name,
    'assignedToMemberId', w.assigned_to_member_id,
    'assignedToDisplayName', w.assigned_to_display_name,
    'createdAt', w.created_at,
    'updatedAt', w.updated_at,
    'status', w.status,
    'proposal', case when w.proposal_based_on_revision is null then null else jsonb_build_object(
      'replacementText', w.proposal_replacement_text,
      'changeSummary', w.proposal_change_summary,
      'basedOnRevision', w.proposal_based_on_revision,
      'proposedBy', jsonb_build_object(
        'displayName', w.proposed_by_display_name,
        'actorType', 'AGENT'
      ),
      'proposedAt', w.proposed_at
    ) end,
    'decision', case when w.decision_kind is null then null else jsonb_build_object(
      'kind', w.decision_kind,
      'rationale', w.decision_rationale,
      'decidedBy', jsonb_build_object(
        'memberId', w.decided_by_member_id,
        'displayName', w.decided_by_display_name
      ),
      'decidedAt', w.decided_at,
      'decisionRevision', w.decision_revision,
      'resultRevision', w.result_revision
    ) end,
    'resolvedAt', w.resolved_at
  )
  from public.ratiflow_document_work_orders as w
  where w.work_order_id = p_work_order_id
$$;

create or replace function ratiflow_document_private.event_json_v3(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'eventId', e.event_id,
    'activityVersion', e.activity_version,
    'kind', e.kind,
    'actor', jsonb_build_object(
      'displayName', e.actor_display_name,
      'actorType', e.actor_type
    ),
    'origin', e.origin,
    'baseRevision', e.base_revision,
    'resultRevision', e.result_revision,
    'workOrderId', e.work_order_id,
    'linkedWorkOrderIds', to_jsonb(e.linked_work_order_ids),
    'changedFields', to_jsonb(e.changed_fields),
    'targetExcerpt', e.target_excerpt,
    'instructionExcerpt', e.instruction_excerpt,
    'proposalExcerpt', e.proposal_excerpt,
    'changeSummary', e.change_summary,
    'diffs', e.diffs,
    'rationale', e.rationale,
    'createdAt', e.created_at
  )
  from public.ratiflow_document_events as e
  where e.event_id = p_event_id
$$;

create or replace function ratiflow_document_private.surface_v3(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'document', ratiflow_document_private.document_json_v3(d.id),
    'presence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', p.member_id,
        'displayName', m.display_name,
        'color', m.color,
        'state', p.state::text,
        'field', case when p.field is null then null else p.field::text end,
        'isTyping', p.is_typing,
        'selectionStart', p.selection_start,
        'selectionEnd', p.selection_end,
        'observedRevision', p.observed_revision,
        'lastSeenAt', p.last_seen_at
      ) order by m.display_name, p.member_id)
      from public.ratiflow_document_presence as p
      join public.ratiflow_document_members as m
        on m.document_id = p.document_id and m.member_id = p.member_id
      where p.document_id = d.id and p.last_seen_at > now() - interval '15 seconds'
    ), '[]'::jsonb),
    'workOrders', coalesce((
      select jsonb_agg(ratiflow_document_private.work_json_v3(selected.work_order_id)
        order by selected.created_at, selected.work_order_id)
      from (
        select w.work_order_id, w.created_at
        from public.ratiflow_document_work_orders as w
        where w.document_id = d.id and w.status in ('PENDING', 'PROPOSED')
        union all
        select terminal.work_order_id, terminal.created_at
        from (
          select w.work_order_id, w.created_at
          from public.ratiflow_document_work_orders as w
          where w.document_id = d.id
            and w.status in ('COMPLETED', 'REJECTED', 'CANCELLED', 'STALE')
          order by w.resolved_at desc, w.work_order_id desc
          limit 20
        ) as terminal
      ) as selected
    ), '[]'::jsonb),
    'memory', coalesce((
      select jsonb_agg(ratiflow_document_private.event_json_v3(recent.event_id)
        order by recent.activity_version)
      from (
        select e.event_id, e.activity_version
        from public.ratiflow_document_events as e
        where e.document_id = d.id
        order by e.activity_version desc
        limit 20
      ) as recent
    ), '[]'::jsonb)
  )
  from public.ratiflow_documents as d
  where d.id = p_document_id and d.protocol_version = 3 and d.expires_at > now()
$$;

create or replace function ratiflow_document_private.session_bundle_v3(
  p_document_id uuid,
  p_share_token text,
  p_human_token text,
  p_agent_token text,
  p_session_instance_id uuid,
  p_member_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'shareToken', p_share_token,
    'humanSessionToken', p_human_token,
    'agentSessionToken', p_agent_token,
    'sessionInstanceId', p_session_instance_id,
    'selfMemberId', p_member_id,
    'expiresAt', p_expires_at,
    'protocolVersion', 3,
    'surface', ratiflow_document_private.surface_v3(p_document_id)
  )
$$;

create or replace function ratiflow_document_private.request_fingerprint_v3(
  p_operation text,
  p_member_id uuid,
  p_actor_type public.ratiflow_document_actor_type,
  p_input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select encode(extensions.digest(jsonb_build_object(
    'operation', p_operation,
    'memberId', p_member_id,
    'actorType', p_actor_type::text,
    'input', p_input
  )::text, 'sha256'), 'hex')
$$;

create or replace function ratiflow_document_private.stale_v3(
  p_document_id uuid,
  p_expected_revision bigint
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error_v3(
    'STALE_WORK_STATE',
    format('The document advanced from revision %s to %s.', p_expected_revision, d.revision),
    true,
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'currentRevision', d.revision,
      'currentActivityVersion', d.activity_version,
      'currentDocument', ratiflow_document_private.document_json_v3(d.id),
      'nextAction', 'Re-inspect the document and work, then retry against the current revision.'
    )
  ) from public.ratiflow_documents as d where d.id = p_document_id
$$;

create or replace function ratiflow_document_private.immutable_work_identity_v3()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if new.document_id is distinct from old.document_id
    or new.creator_member_id is distinct from old.creator_member_id
    or new.creator_display_name is distinct from old.creator_display_name
    or new.assigned_to_member_id is distinct from old.assigned_to_member_id
    or new.assigned_to_display_name is distinct from old.assigned_to_display_name
    or new.created_revision is distinct from old.created_revision
    or new.created_at is distinct from old.created_at then
    raise exception 'document work identity is immutable' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger ratiflow_document_work_identity_trigger
before update on public.ratiflow_document_work_orders
for each row execute function ratiflow_document_private.immutable_work_identity_v3();

create or replace function ratiflow_document_private.diff_v3(
  p_field public.ratiflow_document_field,
  p_before text,
  p_after text
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_prefix integer := 0;
  v_suffix integer := 0;
  v_before_length integer := char_length(p_before);
  v_after_length integer := char_length(p_after);
  v_end integer;
  v_replacement_length integer;
begin
  if p_before = p_after then return null; end if;
  while v_prefix < v_before_length and v_prefix < v_after_length
    and substring(p_before from v_prefix + 1 for 1)
      = substring(p_after from v_prefix + 1 for 1) loop
    v_prefix := v_prefix + 1;
  end loop;
  while v_suffix < v_before_length - v_prefix
    and v_suffix < v_after_length - v_prefix
    and substring(p_before from v_before_length - v_suffix for 1)
      = substring(p_after from v_after_length - v_suffix for 1) loop
    v_suffix := v_suffix + 1;
  end loop;
  v_end := v_before_length - v_suffix;
  v_replacement_length := v_after_length - v_prefix - v_suffix;
  return jsonb_build_object(
    'field', p_field::text,
    'rangeStart', v_prefix,
    'rangeEnd', v_end,
    'beforeExcerpt', ratiflow_document_private.excerpt_v3(
      substring(p_before from v_prefix + 1 for v_end - v_prefix)
    ),
    'afterExcerpt', ratiflow_document_private.excerpt_v3(
      substring(p_after from v_prefix + 1 for v_replacement_length)
    )
  );
end
$$;

create or replace function ratiflow_document_private.rebase_work_v3(
  p_document_id uuid,
  p_field public.ratiflow_document_field,
  p_old_content text,
  p_new_content text,
  p_next_revision bigint,
  p_excluded_work_order_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_old_length integer := char_length(p_old_content);
  v_new_length integer := char_length(p_new_content);
  v_prefix integer := 0;
  v_suffix integer := 0;
  v_splice_end integer;
  v_replacement_length integer;
  v_delta integer;
  v_work public.ratiflow_document_work_orders%rowtype;
  v_start bigint;
  v_end bigint;
  v_staled uuid[] := '{}';
begin
  -- char_length/substring count Unicode characters rather than UTF-8 bytes.
  if p_old_content <> p_new_content then
    while v_prefix < v_old_length and v_prefix < v_new_length
      and substring(p_old_content from v_prefix + 1 for 1)
        = substring(p_new_content from v_prefix + 1 for 1) loop
      v_prefix := v_prefix + 1;
    end loop;
    while v_suffix < v_old_length - v_prefix
      and v_suffix < v_new_length - v_prefix
      and substring(p_old_content from v_old_length - v_suffix for 1)
        = substring(p_new_content from v_new_length - v_suffix for 1) loop
      v_suffix := v_suffix + 1;
    end loop;
    v_splice_end := v_old_length - v_suffix;
    v_replacement_length := v_new_length - v_prefix - v_suffix;
    v_delta := v_replacement_length - (v_splice_end - v_prefix);
  end if;

  for v_work in
    select * from public.ratiflow_document_work_orders
    where document_id = p_document_id
      and status in ('PENDING', 'PROPOSED')
      and (p_excluded_work_order_id is null or work_order_id <> p_excluded_work_order_id)
    order by work_order_id
    for update
  loop
    v_start := v_work.range_start;
    v_end := v_work.range_end;
    if v_work.anchor_field <> p_field or p_old_content = p_new_content then
      update public.ratiflow_document_work_orders
      set anchor_revision = p_next_revision,
          selected_text = case when v_work.anchor_field = p_field
            then substring(p_new_content from v_start::integer + 1 for (v_end - v_start)::integer)
            else selected_text end,
          updated_at = now()
      where work_order_id = v_work.work_order_id;
    elsif v_end <= v_prefix then
      update public.ratiflow_document_work_orders
      set anchor_revision = p_next_revision,
          selected_text = substring(p_new_content from v_start::integer + 1 for (v_end - v_start)::integer),
          updated_at = now()
      where work_order_id = v_work.work_order_id;
    elsif v_start >= v_splice_end then
      v_start := v_start + v_delta;
      v_end := v_end + v_delta;
      update public.ratiflow_document_work_orders
      set range_start = v_start,
          range_end = v_end,
          anchor_revision = p_next_revision,
          selected_text = substring(p_new_content from v_start::integer + 1 for (v_end - v_start)::integer),
          updated_at = now()
      where work_order_id = v_work.work_order_id;
    else
      update public.ratiflow_document_work_orders
      set status = 'STALE', resolved_at = now(), updated_at = now()
      where work_order_id = v_work.work_order_id;
      v_staled := array_append(v_staled, v_work.work_order_id);
    end if;
  end loop;
  return (select coalesce(array_agg(value order by value), '{}') from unnest(v_staled) as value);
end
$$;

create or replace function public.ratiflow_launch_document_v3(
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_document_id uuid := extensions.gen_random_uuid();
  v_member_id uuid := extensions.gen_random_uuid();
  v_session_instance_id uuid := extensions.gen_random_uuid();
  v_share_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_human_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_agent_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := now() + interval '24 hours';
  v_display_name text;
  v_bucket timestamptz := date_trunc('minute', now());
  v_request_count integer;
begin
  if not ratiflow_document_private.exact_keys(p_input, array['displayName']) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The launch request is malformed.');
  end if;
  if p_input ? 'displayName' then
    if not ratiflow_document_private.nonblank_text_v3(p_input->'displayName', 80) then
      return ratiflow_document_private.error_v3('INVALID_INPUT', 'The display name is invalid.');
    end if;
    v_display_name := ratiflow_document_private.trim_ecmascript_v3(
      p_input->>'displayName'
    );
  else
    v_display_name := 'Guest 1';
  end if;

  delete from public.ratiflow_documents where expires_at <= now();
  delete from ratiflow_document_private.rate_windows
    where bucket < v_bucket - interval '10 minutes';
  insert into ratiflow_document_private.rate_windows(operation, bucket, request_count)
  values ('LAUNCH', v_bucket, 1)
  on conflict (operation, bucket) do update
    set request_count = ratiflow_document_private.rate_windows.request_count + 1
  returning request_count into v_request_count;
  if v_request_count > 60 then
    return ratiflow_document_private.error_v3(
      'RATE_LIMITED', 'Too many notes were created at once.', false,
      jsonb_build_object('nextAction', 'Try creating a new note in one minute.')
    );
  end if;

  insert into public.ratiflow_documents(
    id, share_token_hash, title, body, stage, revision,
    protocol_version, activity_version, expires_at
  ) values (
    v_document_id, extensions.digest(v_share_token, 'sha256'), '', '',
    'BRAINSTORMING', 0, 3, 0, v_expires_at
  );
  insert into public.ratiflow_document_members(document_id, member_id, display_name, color)
  values (v_document_id, v_member_id, v_display_name, '#007AFF');
  insert into ratiflow_document_private.sessions(
    handle_hash, document_id, member_id, actor_type, session_instance_id, expires_at
  ) values
    (extensions.digest(v_human_token, 'sha256'), v_document_id, v_member_id,
      'HUMAN', v_session_instance_id, v_expires_at),
    (extensions.digest(v_agent_token, 'sha256'), v_document_id, v_member_id,
      'AGENT', v_session_instance_id, v_expires_at);
  insert into public.ratiflow_document_presence(
    document_id, session_instance_id, member_id, state, field, is_typing,
    selection_start, selection_end, observed_revision, last_seen_at
  ) values (
    v_document_id, v_session_instance_id, v_member_id, 'VIEWING', null, false,
    null, null, 0, now()
  );
  return jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.session_bundle_v3(
      v_document_id, v_share_token, v_human_token, v_agent_token,
      v_session_instance_id, v_member_id, v_expires_at
    )
  );
end
$$;

create or replace function public.ratiflow_join_document_v3(
  p_share_token text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_document public.ratiflow_documents%rowtype;
  v_member_id uuid := extensions.gen_random_uuid();
  v_session_instance_id uuid := extensions.gen_random_uuid();
  v_human_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_agent_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_display_name text;
  v_member_number integer;
  v_color text;
  v_bucket timestamptz := date_trunc('minute', now());
  v_request_count integer;
begin
  if p_share_token is null or p_share_token !~ '^[0-9a-f]{64}$'
    or not ratiflow_document_private.exact_keys(p_input, array['displayName']) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The join request is malformed.');
  end if;
  if p_input ? 'displayName'
    and not ratiflow_document_private.nonblank_text_v3(p_input->'displayName', 80) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The display name is invalid.');
  end if;
  delete from ratiflow_document_private.rate_windows where bucket < v_bucket - interval '10 minutes';
  insert into ratiflow_document_private.rate_windows(operation, bucket, request_count)
  values ('JOIN', v_bucket, 1)
  on conflict (operation, bucket) do update
    set request_count = ratiflow_document_private.rate_windows.request_count + 1
  returning request_count into v_request_count;
  if v_request_count > 240 then
    return ratiflow_document_private.error_v3('RATE_LIMITED', 'Too many people joined at once.', false);
  end if;
  select * into v_document from public.ratiflow_documents
  where share_token_hash = extensions.digest(p_share_token, 'sha256')
    and expires_at > now() for update;
  if not found then
    return ratiflow_document_private.error_v3(
      'NOT_FOUND', 'This note is no longer available.', false,
      jsonb_build_object('nextAction', 'Create a new note.')
    );
  end if;
  if v_document.protocol_version <> 3 then
    return ratiflow_document_private.error_v3('PROTOCOL_MISMATCH', 'This link belongs to another document protocol.');
  end if;
  select count(*)::integer + 1 into v_member_number
  from public.ratiflow_document_members where document_id = v_document.id;
  v_display_name := case when p_input ? 'displayName' then
      ratiflow_document_private.trim_ecmascript_v3(p_input->>'displayName')
    else format('Guest %s', v_member_number) end;
  v_color := (array['#007AFF', '#AF52DE', '#34C759', '#FF9500', '#FF2D55', '#5AC8FA'])[
    ((v_member_number - 1) % 6) + 1
  ];
  insert into public.ratiflow_document_members(document_id, member_id, display_name, color)
  values (v_document.id, v_member_id, v_display_name, v_color);
  insert into ratiflow_document_private.sessions(
    handle_hash, document_id, member_id, actor_type, session_instance_id, expires_at
  ) values
    (extensions.digest(v_human_token, 'sha256'), v_document.id, v_member_id,
      'HUMAN', v_session_instance_id, v_document.expires_at),
    (extensions.digest(v_agent_token, 'sha256'), v_document.id, v_member_id,
      'AGENT', v_session_instance_id, v_document.expires_at);
  insert into public.ratiflow_document_presence(
    document_id, session_instance_id, member_id, state, field, is_typing,
    selection_start, selection_end, observed_revision, last_seen_at
  ) values (
    v_document.id, v_session_instance_id, v_member_id, 'VIEWING', null, false,
    null, null, v_document.revision, now()
  );
  return jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.session_bundle_v3(
      v_document.id, p_share_token, v_human_token, v_agent_token,
      v_session_instance_id, v_member_id, v_document.expires_at
    )
  );
end
$$;

create or replace function public.ratiflow_inspect_document_v3(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_member record;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  return jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v3(v_member.document_id));
end
$$;

create or replace function public.ratiflow_read_document_memory_v3(
  p_handle text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_document public.ratiflow_documents%rowtype;
  v_limit integer := 20;
  v_before bigint;
  v_events jsonb;
  v_has_more boolean;
  v_first bigint;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if not ratiflow_document_private.exact_keys(p_input, array['beforeActivityVersion', 'limit'])
    or (p_input ? 'beforeActivityVersion' and not
      ratiflow_document_private.safe_counter_between_v3(
        p_input->'beforeActivityVersion', 1, 9007199254740991
      ))
    or (p_input ? 'limit' and not
      ratiflow_document_private.safe_counter_between_v3(p_input->'limit', 1, 50)) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The memory window is malformed.');
  end if;
  if p_input ? 'limit' then v_limit := (p_input->>'limit')::integer; end if;
  if p_input ? 'beforeActivityVersion' then v_before := (p_input->>'beforeActivityVersion')::bigint; end if;
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id and protocol_version = 3;
  with eligible as (
    select e.event_id, e.activity_version
    from public.ratiflow_document_events as e
    where e.document_id = v_document.id
      and (v_before is null or e.activity_version < v_before)
    order by e.activity_version desc limit v_limit + 1
  ), selected as (
    select * from eligible order by activity_version desc limit v_limit
  )
  select coalesce(jsonb_agg(ratiflow_document_private.event_json_v3(s.event_id)
      order by s.activity_version), '[]'::jsonb),
    (select count(*) > v_limit from eligible), min(s.activity_version)
  into v_events, v_has_more, v_first from selected as s;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'events', v_events,
    'hasMoreOlder', coalesce(v_has_more, false),
    'nextBeforeActivityVersion', case when v_has_more then v_first else null end,
    'latestActivityVersion', v_document.activity_version,
    'revision', v_document.revision
  ));
end
$$;

create or replace function public.ratiflow_list_agent_work_v3(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_document public.ratiflow_documents%rowtype;
  v_work jsonb;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if v_member.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized_v3();
  end if;
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id and protocol_version = 3;
  select coalesce(jsonb_agg(ratiflow_document_private.work_json_v3(selected.work_order_id)
    order by selected.created_at, selected.work_order_id), '[]'::jsonb)
  into v_work from (
    select w.work_order_id, w.created_at
    from public.ratiflow_document_work_orders as w
    where w.document_id = v_document.id
      and w.assigned_to_member_id = v_member.member_id and w.status = 'PENDING'
    order by w.created_at, w.work_order_id limit 50
  ) as selected;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'workOrders', v_work,
    'revision', v_document.revision,
    'activityVersion', v_document.activity_version
  ));
end
$$;

create or replace function public.ratiflow_save_document_v3(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_document public.ratiflow_documents%rowtype;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_request_id uuid;
  v_expected bigint;
  v_fingerprint text;
  v_result jsonb;
  v_next_revision bigint;
  v_next_activity bigint;
  v_staled_title uuid[] := '{}';
  v_staled_body uuid[] := '{}';
  v_linked uuid[] := '{}';
  v_diffs jsonb := '[]'::jsonb;
  v_changed text[] := '{}';
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if v_member.actor_type <> 'HUMAN' then return ratiflow_document_private.unauthorized_v3(); end if;
  if not ratiflow_document_private.exact_keys(
      p_input, array['expectedRevision', 'requestId', 'title', 'body'])
    or not (p_input ?& array['expectedRevision', 'requestId', 'title', 'body'])
    or not ratiflow_document_private.safe_counter_v3(p_input->'expectedRevision')
    or not ratiflow_document_private.uuid_text_v3(p_input->'requestId')
    or jsonb_typeof(p_input->'title') <> 'string'
    or jsonb_typeof(p_input->'body') <> 'string'
    or char_length(p_input->>'title') > 160
    or char_length(p_input->>'body') > 50000 then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The document save is malformed.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  v_expected := (p_input->>'expectedRevision')::bigint;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v3(
    'SAVE_DOCUMENT_V3', v_member.member_id, v_member.actor_type, p_input
  );
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id for update;
  if v_document.protocol_version <> 3 then
    return ratiflow_document_private.error_v3('PROTOCOL_MISMATCH', 'This document is not protocol version 3.');
  end if;
  select * into v_existing from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'SAVE_DOCUMENT_V3' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error_v3(
      'REQUEST_REPLAY_MISMATCH', 'This request ID was already used with different input.'
    );
  end if;
  if v_expected <> v_document.revision then
    return ratiflow_document_private.stale_v3(v_document.id, v_expected);
  end if;
  if v_document.title = p_input->>'title' and v_document.body = p_input->>'body' then
    v_result := jsonb_build_object('ok', true, 'data',
      ratiflow_document_private.surface_v3(v_document.id));
    insert into public.ratiflow_document_request_ledger(
      document_id, request_id, operation, fingerprint, result
    ) values (v_document.id, v_request_id, 'SAVE_DOCUMENT_V3', v_fingerprint, v_result);
    return v_result;
  end if;
  v_next_revision := v_document.revision + 1;
  v_next_activity := v_document.activity_version + 1;
  if v_document.title <> p_input->>'title' then
    v_changed := array_append(v_changed, 'TITLE');
    v_diffs := v_diffs || jsonb_build_array(ratiflow_document_private.diff_v3(
      'TITLE', v_document.title, p_input->>'title'));
  end if;
  if v_document.body <> p_input->>'body' then
    v_changed := array_append(v_changed, 'BODY');
    v_diffs := v_diffs || jsonb_build_array(ratiflow_document_private.diff_v3(
      'BODY', v_document.body, p_input->>'body'));
  end if;
  update public.ratiflow_documents set
    title = p_input->>'title', body = p_input->>'body',
    revision = v_next_revision, activity_version = v_next_activity,
    updated_at = now(), last_editor_member_id = v_member.member_id,
    last_editor_display_name = v_member.display_name,
    last_editor_actor_type = 'HUMAN', last_editor_origin = 'ORDINARY_UI',
    undo_agent_revision = null, undo_previous_title = null, undo_previous_body = null
  where id = v_document.id;
  v_staled_title := ratiflow_document_private.rebase_work_v3(
    v_document.id, 'TITLE', v_document.title, p_input->>'title', v_next_revision
  );
  v_staled_body := ratiflow_document_private.rebase_work_v3(
    v_document.id, 'BODY', v_document.body, p_input->>'body', v_next_revision
  );
  select coalesce(array_agg(value order by value), '{}') into v_linked
  from (select distinct unnest(v_staled_title || v_staled_body) as value) as ids;
  insert into public.ratiflow_document_events(
    document_id, activity_version, kind, actor_display_name, actor_type, origin,
    base_revision, result_revision, linked_work_order_ids, changed_fields, diffs
  ) values (
    v_document.id, v_next_activity, 'DOCUMENT_EDITED', v_member.display_name,
    'HUMAN', 'ORDINARY_UI', v_document.revision, v_next_revision,
    v_linked, v_changed, v_diffs
  );
  v_result := jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v3(v_document.id));
  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (v_document.id, v_request_id, 'SAVE_DOCUMENT_V3', v_fingerprint, v_result);
  return v_result;
end
$$;

create or replace function public.ratiflow_touch_document_presence_v3(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_document public.ratiflow_documents%rowtype;
  v_field public.ratiflow_document_field;
  v_start integer;
  v_end integer;
  v_length integer;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if v_member.actor_type <> 'HUMAN' then return ratiflow_document_private.unauthorized_v3(); end if;
  if not ratiflow_document_private.exact_keys(p_input,
      array['state', 'field', 'isTyping', 'selectionStart', 'selectionEnd', 'observedRevision'])
    or not (p_input ?& array['state', 'field', 'isTyping', 'selectionStart', 'selectionEnd', 'observedRevision'])
    or jsonb_typeof(p_input->'state') is distinct from 'string'
    or p_input->>'state' not in ('VIEWING', 'EDITING', 'IDLE')
    or jsonb_typeof(p_input->'isTyping') <> 'boolean'
    or not ratiflow_document_private.safe_counter_v3(p_input->'observedRevision') then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The presence update is malformed.');
  end if;
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id and protocol_version = 3;
  if (p_input->>'observedRevision')::bigint > v_document.revision then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'Presence cannot observe a future revision.');
  end if;
  if p_input->'field' = 'null'::jsonb then
    if p_input->'selectionStart' <> 'null'::jsonb or p_input->'selectionEnd' <> 'null'::jsonb
      or (p_input->>'isTyping')::boolean then
      return ratiflow_document_private.error_v3('INVALID_INPUT', 'Fieldless presence cannot select or type.');
    end if;
    v_field := null; v_start := null; v_end := null;
  else
    if p_input->>'field' not in ('TITLE', 'BODY')
      or not ratiflow_document_private.safe_integer_counter_v3(p_input->'selectionStart')
      or not ratiflow_document_private.safe_integer_counter_v3(p_input->'selectionEnd') then
      return ratiflow_document_private.error_v3('INVALID_INPUT', 'The presence selection is malformed.');
    end if;
    v_field := (p_input->>'field')::public.ratiflow_document_field;
    v_start := (p_input->>'selectionStart')::integer;
    v_end := (p_input->>'selectionEnd')::integer;
    v_length := char_length(case when v_field = 'TITLE' then v_document.title else v_document.body end);
    if v_start > v_end or v_end > v_length then
      return ratiflow_document_private.error_v3('INVALID_INPUT', 'The presence selection is outside the document.');
    end if;
  end if;
  insert into public.ratiflow_document_presence(
    document_id, session_instance_id, member_id, state, field, is_typing,
    selection_start, selection_end, observed_revision, last_seen_at
  ) values (
    v_document.id, v_member.session_instance_id, v_member.member_id,
    (p_input->>'state')::public.ratiflow_document_presence_state,
    v_field, (p_input->>'isTyping')::boolean, v_start, v_end,
    (p_input->>'observedRevision')::bigint, now()
  ) on conflict (document_id, session_instance_id) do update set
    state = excluded.state, field = excluded.field, is_typing = excluded.is_typing,
    selection_start = excluded.selection_start, selection_end = excluded.selection_end,
    observed_revision = excluded.observed_revision, last_seen_at = excluded.last_seen_at;
  return jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v3(v_document.id));
end
$$;

create or replace function public.ratiflow_create_document_work_v3(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_assignee record;
  v_document public.ratiflow_documents%rowtype;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_request_id uuid;
  v_expected bigint;
  v_fingerprint text;
  v_result jsonb;
  v_work_id uuid;
  v_event_id uuid;
  v_field public.ratiflow_document_field;
  v_start integer;
  v_end integer;
  v_content text;
  v_selected text;
  v_document_active integer;
  v_assignee_active integer;
  v_next_activity bigint;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if v_member.actor_type <> 'HUMAN' then return ratiflow_document_private.unauthorized_v3(); end if;
  if not ratiflow_document_private.exact_keys(p_input, array[
      'expectedRevision', 'requestId', 'source', 'intent', 'instruction',
      'assignedToMemberId', 'targetField', 'rangeStart', 'rangeEnd'])
    or not (p_input ?& array[
      'expectedRevision', 'requestId', 'source', 'intent', 'instruction',
      'assignedToMemberId', 'targetField', 'rangeStart', 'rangeEnd'])
    or not ratiflow_document_private.safe_counter_v3(p_input->'expectedRevision')
    or not ratiflow_document_private.uuid_text_v3(p_input->'requestId')
    or not ratiflow_document_private.uuid_text_v3(p_input->'assignedToMemberId')
    or jsonb_typeof(p_input->'source') is distinct from 'string'
    or p_input->>'source' not in ('SELECTION_AFFORDANCE', 'CONTEXT_MENU', 'KEYBOARD')
    or jsonb_typeof(p_input->'intent') is distinct from 'string'
    or p_input->>'intent' not in ('REWRITE', 'RESEARCH', 'CUSTOM')
    or not ratiflow_document_private.nonblank_text_v3(p_input->'instruction', 500)
    or jsonb_typeof(p_input->'targetField') is distinct from 'string'
    or p_input->>'targetField' not in ('TITLE', 'BODY')
    or not ratiflow_document_private.safe_integer_counter_v3(p_input->'rangeStart')
    or not ratiflow_document_private.safe_integer_counter_v3(p_input->'rangeEnd') then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The work order is malformed.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  v_expected := (p_input->>'expectedRevision')::bigint;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v3(
    'CREATE_DOCUMENT_WORK_V3', v_member.member_id, v_member.actor_type, p_input
  );
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id for update;
  if v_document.protocol_version <> 3 then
    return ratiflow_document_private.error_v3('PROTOCOL_MISMATCH', 'This document is not protocol version 3.');
  end if;
  select * into v_existing from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'CREATE_DOCUMENT_WORK_V3' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error_v3('REQUEST_REPLAY_MISMATCH', 'This request ID was reused.');
  end if;
  if v_expected <> v_document.revision then return ratiflow_document_private.stale_v3(v_document.id, v_expected); end if;
  select m.member_id, m.display_name into v_assignee
  from public.ratiflow_document_members as m
  where m.document_id = v_document.id and m.member_id = (p_input->>'assignedToMemberId')::uuid
    and exists (
      select 1 from ratiflow_document_private.sessions as s
      where s.document_id = m.document_id and s.member_id = m.member_id
        and s.actor_type = 'HUMAN' and s.expires_at > now()
    )
    and exists (
      select 1 from public.ratiflow_document_presence as presence
      where presence.document_id = m.document_id and presence.member_id = m.member_id
        and presence.last_seen_at > now() - interval '15 seconds'
    );
  if not found then
    return ratiflow_document_private.error_v3('ASSIGNEE_UNAVAILABLE', 'The selected collaborator is not assignable.');
  end if;
  select count(*)::integer,
    count(*) filter (where assigned_to_member_id = v_assignee.member_id)::integer
  into v_document_active, v_assignee_active
  from public.ratiflow_document_work_orders
  where document_id = v_document.id and status in ('PENDING', 'PROPOSED');
  if v_document_active >= 100 or v_assignee_active >= 50 then
    return ratiflow_document_private.error_v3('RATE_LIMITED', 'The active work-order limit has been reached.');
  end if;
  v_field := (p_input->>'targetField')::public.ratiflow_document_field;
  v_start := (p_input->>'rangeStart')::integer;
  v_end := (p_input->>'rangeEnd')::integer;
  v_content := case when v_field = 'TITLE' then v_document.title else v_document.body end;
  if v_start >= v_end or v_end > char_length(v_content) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The selected range is invalid.');
  end if;
  v_selected := substring(v_content from v_start + 1 for v_end - v_start);
  v_work_id := case when v_document.id = '00000000-0000-4000-8000-000000000301'::uuid
    and v_document.activity_version = 1
    and not exists (select 1 from public.ratiflow_document_work_orders where document_id = v_document.id)
    then '00000000-0000-4000-8000-000000000321'::uuid else extensions.gen_random_uuid() end;
  v_event_id := case when v_work_id = '00000000-0000-4000-8000-000000000321'::uuid
    then '00000000-0000-4000-8000-000000000332'::uuid else extensions.gen_random_uuid() end;
  insert into public.ratiflow_document_work_orders(
    work_order_id, document_id, intent, source, instruction, anchor_field,
    range_start, range_end, selected_text, created_revision, anchor_revision,
    creator_member_id, creator_display_name, assigned_to_member_id, assigned_to_display_name
  ) values (
    v_work_id, v_document.id, p_input->>'intent', p_input->>'source',
    p_input->>'instruction', v_field, v_start, v_end, v_selected,
    v_document.revision, v_document.revision, v_member.member_id, v_member.display_name,
    v_assignee.member_id, v_assignee.display_name
  );
  v_next_activity := v_document.activity_version + 1;
  update public.ratiflow_documents set activity_version = v_next_activity where id = v_document.id;
  insert into public.ratiflow_document_events(
    event_id, document_id, activity_version, kind, actor_display_name, actor_type, origin,
    base_revision, result_revision, work_order_id, linked_work_order_ids,
    target_excerpt, instruction_excerpt
  ) values (
    v_event_id, v_document.id, v_next_activity, 'WORK_CREATED', v_member.display_name,
    'HUMAN', 'ORDINARY_UI', v_document.revision, v_document.revision, v_work_id,
    array[v_work_id], ratiflow_document_private.excerpt_v3(v_selected),
    ratiflow_document_private.excerpt_v3(p_input->>'instruction')
  );
  v_result := jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v3(v_document.id));
  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (v_document.id, v_request_id, 'CREATE_DOCUMENT_WORK_V3', v_fingerprint, v_result);
  return v_result;
end
$$;

create or replace function public.ratiflow_cancel_document_work_v3(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_document public.ratiflow_documents%rowtype;
  v_work public.ratiflow_document_work_orders%rowtype;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_request_id uuid;
  v_work_id uuid;
  v_fingerprint text;
  v_activity bigint;
  v_result jsonb;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if v_member.actor_type <> 'HUMAN' then return ratiflow_document_private.unauthorized_v3(); end if;
  if not ratiflow_document_private.exact_keys(p_input, array['workOrderId', 'requestId'])
    or not (p_input ?& array['workOrderId', 'requestId'])
    or not ratiflow_document_private.uuid_text_v3(p_input->'workOrderId')
    or not ratiflow_document_private.uuid_text_v3(p_input->'requestId') then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The cancellation request is malformed.');
  end if;
  v_work_id := (p_input->>'workOrderId')::uuid;
  v_request_id := (p_input->>'requestId')::uuid;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v3(
    'CANCEL_DOCUMENT_WORK_V3', v_member.member_id, v_member.actor_type, p_input
  );
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id for update;
  select * into v_work from public.ratiflow_document_work_orders
  where document_id = v_document.id and work_order_id = v_work_id for update;
  if not found or v_work.creator_member_id <> v_member.member_id then
    return ratiflow_document_private.unauthorized_v3();
  end if;
  select * into v_existing from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'CANCEL_DOCUMENT_WORK_V3' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error_v3('REQUEST_REPLAY_MISMATCH', 'This request ID was reused.');
  end if;
  if v_work.status <> 'PENDING' then
    return ratiflow_document_private.error_v3(
      'STALE_WORK_CONTEXT', 'Only pending work may be cancelled.', false,
      jsonb_build_object(
        'currentRevision', v_document.revision,
        'currentActivityVersion', v_document.activity_version,
        'currentWorkOrder', ratiflow_document_private.work_json_v3(v_work.work_order_id)
      )
    );
  end if;
  update public.ratiflow_document_work_orders
  set status = 'CANCELLED', resolved_at = now(), updated_at = now()
  where work_order_id = v_work.work_order_id;
  v_activity := v_document.activity_version + 1;
  update public.ratiflow_documents set activity_version = v_activity where id = v_document.id;
  insert into public.ratiflow_document_events(
    document_id, activity_version, kind, actor_display_name, actor_type, origin,
    base_revision, result_revision, work_order_id, linked_work_order_ids,
    target_excerpt, instruction_excerpt
  ) values (
    v_document.id, v_activity, 'WORK_CANCELLED', v_member.display_name, 'HUMAN',
    'ORDINARY_UI', v_document.revision, v_document.revision, v_work.work_order_id,
    array[v_work.work_order_id], ratiflow_document_private.excerpt_v3(v_work.selected_text),
    ratiflow_document_private.excerpt_v3(v_work.instruction)
  );
  v_result := jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v3(v_document.id));
  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (v_document.id, v_request_id, 'CANCEL_DOCUMENT_WORK_V3', v_fingerprint, v_result);
  return v_result;
end
$$;

create or replace function public.ratiflow_submit_document_proposal_v3(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_document public.ratiflow_documents%rowtype;
  v_work public.ratiflow_document_work_orders%rowtype;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_request_id uuid;
  v_work_id uuid;
  v_expected bigint;
  v_fingerprint text;
  v_current text;
  v_resulting_length integer;
  v_activity bigint;
  v_event_id uuid;
  v_result jsonb;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if v_member.actor_type <> 'AGENT' then return ratiflow_document_private.unauthorized_v3(); end if;
  if not ratiflow_document_private.exact_keys(p_input,
      array['workOrderId', 'expectedRevision', 'replacementText', 'changeSummary', 'requestId'])
    or not (p_input ?& array['workOrderId', 'expectedRevision', 'replacementText', 'changeSummary', 'requestId'])
    or not ratiflow_document_private.uuid_text_v3(p_input->'workOrderId')
    or not ratiflow_document_private.uuid_text_v3(p_input->'requestId')
    or not ratiflow_document_private.safe_counter_v3(p_input->'expectedRevision')
    or jsonb_typeof(p_input->'replacementText') <> 'string'
    or char_length(p_input->>'replacementText') > 50000
    or not ratiflow_document_private.nonblank_text_v3(p_input->'changeSummary', 240) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The proposal is malformed.');
  end if;
  v_work_id := (p_input->>'workOrderId')::uuid;
  v_request_id := (p_input->>'requestId')::uuid;
  v_expected := (p_input->>'expectedRevision')::bigint;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v3(
    'SUBMIT_DOCUMENT_PROPOSAL_V3', v_member.member_id, v_member.actor_type, p_input
  );
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id for update;
  select * into v_work from public.ratiflow_document_work_orders
  where document_id = v_document.id and work_order_id = v_work_id for update;
  if not found or v_work.assigned_to_member_id <> v_member.member_id then
    return ratiflow_document_private.unauthorized_v3();
  end if;
  select * into v_existing from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'SUBMIT_DOCUMENT_PROPOSAL_V3' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error_v3('REQUEST_REPLAY_MISMATCH', 'This request ID was reused.');
  end if;
  if v_work.status <> 'PENDING' then
    return ratiflow_document_private.error_v3('STALE_WORK_CONTEXT', 'Only pending work accepts a proposal.', false,
      jsonb_build_object('currentRevision', v_document.revision,
        'currentActivityVersion', v_document.activity_version,
        'currentWorkOrder', ratiflow_document_private.work_json_v3(v_work.work_order_id)));
  end if;
  if v_expected <> v_document.revision or v_work.anchor_revision <> v_document.revision then
    return ratiflow_document_private.stale_v3(v_document.id, v_expected);
  end if;
  v_current := substring(
    case when v_work.anchor_field = 'TITLE' then v_document.title else v_document.body end
    from v_work.range_start::integer + 1
    for (v_work.range_end - v_work.range_start)::integer
  );
  if v_current <> v_work.selected_text then
    return ratiflow_document_private.error_v3('STALE_WORK_CONTEXT', 'The work anchor no longer matches.', false,
      jsonb_build_object('currentRevision', v_document.revision,
        'currentActivityVersion', v_document.activity_version,
        'currentWorkOrder', ratiflow_document_private.work_json_v3(v_work.work_order_id)));
  end if;
  if p_input->>'replacementText' = v_work.selected_text then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'A proposal must change the selected text.');
  end if;
  v_resulting_length := char_length(
    case when v_work.anchor_field = 'TITLE' then v_document.title else v_document.body end
  ) - char_length(v_work.selected_text) + char_length(p_input->>'replacementText');
  if (v_work.anchor_field = 'TITLE' and v_resulting_length > 160)
    or (v_work.anchor_field = 'BODY' and v_resulting_length > 50000) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The replacement exceeds the field limit.');
  end if;
  update public.ratiflow_document_work_orders set
    status = 'PROPOSED', proposal_replacement_text = p_input->>'replacementText',
    proposal_change_summary = p_input->>'changeSummary',
    proposal_based_on_revision = v_document.revision,
    proposed_by_display_name = v_member.display_name || '''s paired agent',
    proposed_at = now(), updated_at = now()
  where work_order_id = v_work.work_order_id;
  v_activity := v_document.activity_version + 1;
  v_event_id := case when v_work.work_order_id = '00000000-0000-4000-8000-000000000321'::uuid
    then '00000000-0000-4000-8000-000000000333'::uuid else extensions.gen_random_uuid() end;
  update public.ratiflow_documents set activity_version = v_activity where id = v_document.id;
  insert into public.ratiflow_document_events(
    event_id, document_id, activity_version, kind, actor_display_name, actor_type, origin,
    base_revision, result_revision, work_order_id, linked_work_order_ids,
    target_excerpt, instruction_excerpt, proposal_excerpt, change_summary
  ) values (
    v_event_id, v_document.id, v_activity, 'PROPOSAL_SUBMITTED',
    v_member.display_name || '''s paired agent', 'AGENT', 'WEBMCP',
    v_document.revision, v_document.revision, v_work.work_order_id,
    array[v_work.work_order_id], ratiflow_document_private.excerpt_v3(v_work.selected_text),
    ratiflow_document_private.excerpt_v3(v_work.instruction),
    ratiflow_document_private.excerpt_v3(p_input->>'replacementText'),
    p_input->>'changeSummary'
  );
  v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'workOrder', ratiflow_document_private.work_json_v3(v_work.work_order_id),
    'document', ratiflow_document_private.document_json_v3(v_document.id),
    'event', ratiflow_document_private.event_json_v3(v_event_id)
  ));
  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (v_document.id, v_request_id, 'SUBMIT_DOCUMENT_PROPOSAL_V3', v_fingerprint, v_result);
  return v_result;
end
$$;

create or replace function ratiflow_document_private.decide_document_proposal_v3(
  p_handle text,
  p_input jsonb,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_document public.ratiflow_documents%rowtype;
  v_work public.ratiflow_document_work_orders%rowtype;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_request_id uuid;
  v_work_id uuid;
  v_expected bigint;
  v_operation text := case when p_accept then 'ACCEPT_DOCUMENT_PROPOSAL_V3' else 'REJECT_DOCUMENT_PROPOSAL_V3' end;
  v_fingerprint text;
  v_current text;
  v_old_field text;
  v_new_field text;
  v_next_revision bigint;
  v_activity bigint;
  v_staled uuid[] := '{}';
  v_linked uuid[];
  v_event_id uuid;
  v_result jsonb;
begin
  select * into v_member from ratiflow_document_private.member_for_handle_v3(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v3(p_handle); end if;
  if v_member.actor_type <> 'HUMAN' then return ratiflow_document_private.unauthorized_v3(); end if;
  if not ratiflow_document_private.exact_keys(
      p_input, array['workOrderId', 'expectedRevision', 'requestId', 'rationale'])
    or not (p_input ?& array['workOrderId', 'expectedRevision', 'requestId', 'rationale'])
    or not ratiflow_document_private.uuid_text_v3(p_input->'workOrderId')
    or not ratiflow_document_private.uuid_text_v3(p_input->'requestId')
    or not ratiflow_document_private.safe_counter_v3(p_input->'expectedRevision')
    or not ratiflow_document_private.nonblank_text_v3(p_input->'rationale', 500) then
    return ratiflow_document_private.error_v3('INVALID_INPUT', 'The proposal decision is malformed.');
  end if;
  v_work_id := (p_input->>'workOrderId')::uuid;
  v_request_id := (p_input->>'requestId')::uuid;
  v_expected := (p_input->>'expectedRevision')::bigint;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v3(
    v_operation, v_member.member_id, v_member.actor_type, p_input
  );
  select * into v_document from public.ratiflow_documents
  where id = v_member.document_id for update;
  select * into v_work from public.ratiflow_document_work_orders
  where document_id = v_document.id and work_order_id = v_work_id for update;
  if not found or v_work.creator_member_id <> v_member.member_id then
    return ratiflow_document_private.unauthorized_v3();
  end if;
  select * into v_existing from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = v_operation and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error_v3('REQUEST_REPLAY_MISMATCH', 'This request ID was reused.');
  end if;
  if v_work.status <> 'PROPOSED' then
    return ratiflow_document_private.error_v3('STALE_WORK_CONTEXT', 'Only proposed work may be decided.', false,
      jsonb_build_object('currentRevision', v_document.revision,
        'currentActivityVersion', v_document.activity_version,
        'currentWorkOrder', ratiflow_document_private.work_json_v3(v_work.work_order_id)));
  end if;
  if v_expected <> v_document.revision or v_work.anchor_revision <> v_document.revision then
    return ratiflow_document_private.stale_v3(v_document.id, v_expected);
  end if;
  v_old_field := case when v_work.anchor_field = 'TITLE' then v_document.title else v_document.body end;
  v_current := substring(v_old_field from v_work.range_start::integer + 1
    for (v_work.range_end - v_work.range_start)::integer);
  if v_current <> v_work.selected_text then
    return ratiflow_document_private.error_v3('STALE_WORK_CONTEXT', 'The work anchor no longer matches.');
  end if;
  v_activity := v_document.activity_version + 1;
  if not p_accept then
    update public.ratiflow_document_work_orders set
      status = 'REJECTED', decision_kind = 'REJECTED',
      decision_rationale = p_input->>'rationale', decided_by_member_id = v_member.member_id,
      decided_by_display_name = v_member.display_name, decided_at = now(),
      decision_revision = v_document.revision, result_revision = v_document.revision,
      resolved_at = now(), updated_at = now()
    where work_order_id = v_work.work_order_id;
    update public.ratiflow_documents set activity_version = v_activity where id = v_document.id;
    insert into public.ratiflow_document_events(
      document_id, activity_version, kind, actor_display_name, actor_type, origin,
      base_revision, result_revision, work_order_id, linked_work_order_ids,
      target_excerpt, instruction_excerpt, proposal_excerpt, change_summary, rationale
    ) values (
      v_document.id, v_activity, 'PROPOSAL_REJECTED', v_member.display_name, 'HUMAN',
      'ORDINARY_UI', v_document.revision, v_document.revision, v_work.work_order_id,
      array[v_work.work_order_id], ratiflow_document_private.excerpt_v3(v_work.selected_text),
      ratiflow_document_private.excerpt_v3(v_work.instruction),
      ratiflow_document_private.excerpt_v3(v_work.proposal_replacement_text),
      v_work.proposal_change_summary, p_input->>'rationale'
    );
  else
    v_new_field := substring(v_old_field from 1 for v_work.range_start::integer)
      || v_work.proposal_replacement_text
      || substring(v_old_field from v_work.range_end::integer + 1);
    v_next_revision := v_document.revision + 1;
    update public.ratiflow_documents set
      title = case when v_work.anchor_field = 'TITLE' then v_new_field else title end,
      body = case when v_work.anchor_field = 'BODY' then v_new_field else body end,
      revision = v_next_revision, activity_version = v_activity, updated_at = now(),
      last_editor_member_id = v_member.member_id,
      last_editor_display_name = v_member.display_name,
      last_editor_actor_type = 'HUMAN', last_editor_origin = 'ORDINARY_UI',
      undo_agent_revision = null, undo_previous_title = null, undo_previous_body = null
    where id = v_document.id;
    update public.ratiflow_document_work_orders set
      status = 'COMPLETED', decision_kind = 'ACCEPTED',
      decision_rationale = p_input->>'rationale', decided_by_member_id = v_member.member_id,
      decided_by_display_name = v_member.display_name, decided_at = now(),
      decision_revision = v_document.revision, result_revision = v_next_revision,
      resolved_at = now(), updated_at = now()
    where work_order_id = v_work.work_order_id;
    v_staled := ratiflow_document_private.rebase_work_v3(
      v_document.id, v_work.anchor_field, v_old_field, v_new_field,
      v_next_revision, v_work.work_order_id
    );
    select coalesce(array_agg(value order by value), '{}') into v_linked
    from (select distinct unnest(array[v_work.work_order_id] || v_staled) as value) as ids;
    v_event_id := case when v_work.work_order_id = '00000000-0000-4000-8000-000000000321'::uuid
      then '00000000-0000-4000-8000-000000000334'::uuid else extensions.gen_random_uuid() end;
    insert into public.ratiflow_document_events(
      event_id, document_id, activity_version, kind, actor_display_name, actor_type, origin,
      base_revision, result_revision, work_order_id, linked_work_order_ids, changed_fields,
      target_excerpt, instruction_excerpt, proposal_excerpt, change_summary, diffs, rationale
    ) values (
      v_event_id, v_document.id, v_activity, 'PROPOSAL_ACCEPTED', v_member.display_name,
      'HUMAN', 'ORDINARY_UI', v_document.revision, v_next_revision, v_work.work_order_id,
      v_linked, array[v_work.anchor_field::text],
      ratiflow_document_private.excerpt_v3(v_work.selected_text),
      ratiflow_document_private.excerpt_v3(v_work.instruction),
      ratiflow_document_private.excerpt_v3(v_work.proposal_replacement_text),
      v_work.proposal_change_summary,
      jsonb_build_array(jsonb_build_object(
        'field', v_work.anchor_field::text, 'rangeStart', v_work.range_start,
        'rangeEnd', v_work.range_end,
        'beforeExcerpt', ratiflow_document_private.excerpt_v3(v_work.selected_text),
        'afterExcerpt', ratiflow_document_private.excerpt_v3(v_work.proposal_replacement_text)
      )), p_input->>'rationale'
    );
  end if;
  v_result := jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v3(v_document.id));
  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (v_document.id, v_request_id, v_operation, v_fingerprint, v_result);
  return v_result;
end
$$;

create or replace function public.ratiflow_accept_document_proposal_v3(
  p_handle text, p_input jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.decide_document_proposal_v3(p_handle, p_input, true)
$$;

create or replace function public.ratiflow_reject_document_proposal_v3(
  p_handle text, p_input jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.decide_document_proposal_v3(p_handle, p_input, false)
$$;

create or replace function public.ratiflow_reset_document_hero_v3()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_document_id constant uuid := '00000000-0000-4000-8000-000000000301';
  v_maya_id constant uuid := '00000000-0000-4000-8000-000000000311';
  v_jordan_id constant uuid := '00000000-0000-4000-8000-000000000312';
  v_share_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_maya_human text := encode(extensions.gen_random_bytes(32), 'hex');
  v_maya_agent text := encode(extensions.gen_random_bytes(32), 'hex');
  v_jordan_human text := encode(extensions.gen_random_bytes(32), 'hex');
  v_jordan_agent text := encode(extensions.gen_random_bytes(32), 'hex');
  v_maya_session uuid := extensions.gen_random_uuid();
  v_jordan_session uuid := extensions.gen_random_uuid();
  v_expires timestamptz := now() + interval '24 hours';
  v_title constant text := 'Northstar CSV launch memo';
  v_body constant text := E'Recommendation\n\nLaunch CSV export as generally available on October 15.\n\nContext\n\nNorthstar Health''s $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.\n\nOpen question\n\nCan a single-tenant beta meet Northstar''s need while general availability moves to November 1?';
  v_maya_bundle jsonb;
  v_jordan_bundle jsonb;
  v_maya_encoded text;
  v_jordan_encoded text;
begin
  delete from public.ratiflow_documents where id = v_document_id;
  insert into public.ratiflow_documents(
    id, share_token_hash, title, body, stage, revision,
    protocol_version, activity_version, created_at, updated_at, expires_at
  ) values (
    v_document_id, extensions.digest(v_share_token, 'sha256'), v_title, v_body,
    'BRAINSTORMING', 1, 3, 1, now(), now(), v_expires
  );
  insert into public.ratiflow_document_members(document_id, member_id, display_name, color)
  values
    (v_document_id, v_maya_id, 'Maya Chen', '#007AFF'),
    (v_document_id, v_jordan_id, 'Jordan Lee', '#AF52DE');
  insert into ratiflow_document_private.sessions(
    handle_hash, document_id, member_id, actor_type, session_instance_id, expires_at
  ) values
    (extensions.digest(v_maya_human, 'sha256'), v_document_id, v_maya_id, 'HUMAN', v_maya_session, v_expires),
    (extensions.digest(v_maya_agent, 'sha256'), v_document_id, v_maya_id, 'AGENT', v_maya_session, v_expires),
    (extensions.digest(v_jordan_human, 'sha256'), v_document_id, v_jordan_id, 'HUMAN', v_jordan_session, v_expires),
    (extensions.digest(v_jordan_agent, 'sha256'), v_document_id, v_jordan_id, 'AGENT', v_jordan_session, v_expires);
  insert into public.ratiflow_document_presence(
    document_id, session_instance_id, member_id, state, field, is_typing,
    selection_start, selection_end, observed_revision, last_seen_at
  ) values
    (v_document_id, v_maya_session, v_maya_id, 'VIEWING', null, false, null, null, 1, now()),
    (v_document_id, v_jordan_session, v_jordan_id, 'VIEWING', null, false, null, null, 1, now());
  insert into public.ratiflow_document_events(
    event_id, document_id, activity_version, kind, actor_display_name, actor_type,
    origin, base_revision, result_revision, changed_fields, diffs
  ) values (
    '00000000-0000-4000-8000-000000000331', v_document_id, 1,
    'DOCUMENT_EDITED', 'Demo reset', 'SYSTEM', 'SYSTEM', 0, 1,
    array['TITLE', 'BODY'], jsonb_build_array(
      jsonb_build_object(
        'field', 'TITLE', 'rangeStart', 0, 'rangeEnd', 0,
        'beforeExcerpt', '', 'afterExcerpt', ratiflow_document_private.excerpt_v3(v_title)
      ),
      jsonb_build_object(
        'field', 'BODY', 'rangeStart', 0, 'rangeEnd', 0,
        'beforeExcerpt', '', 'afterExcerpt', ratiflow_document_private.excerpt_v3(v_body)
      )
    )
  );
  v_maya_bundle := ratiflow_document_private.session_bundle_v3(
    v_document_id, v_share_token, v_maya_human, v_maya_agent,
    v_maya_session, v_maya_id, v_expires
  );
  v_jordan_bundle := ratiflow_document_private.session_bundle_v3(
    v_document_id, v_share_token, v_jordan_human, v_jordan_agent,
    v_jordan_session, v_jordan_id, v_expires
  );
  v_maya_encoded := translate(rtrim(replace(
    encode(convert_to(v_maya_bundle::text, 'UTF8'), 'base64'), E'\n', ''
  ), '='), '+/', '-_');
  v_jordan_encoded := translate(rtrim(replace(
    encode(convert_to(v_jordan_bundle::text, 'UTF8'), 'base64'), E'\n', ''
  ), '='), '+/', '-_');
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'shareToken', v_share_token,
    'mayaBootstrapPath', format('/document/%s#ratiflow-bootstrap=%s', v_share_token, v_maya_encoded),
    'jordanBootstrapPath', format('/document/%s#ratiflow-bootstrap=%s', v_share_token, v_jordan_encoded),
    'expiresAt', v_expires,
    'revision', 1,
    'activityVersion', 1
  ));
end
$$;

-- Keep both historical join entrypoints available for protocol-v1/v2 documents, but
-- reject a protocol-v3 share token before either legacy implementation can mint a
-- member, paired sessions, or presence row.
alter function public.ratiflow_document_join(text, jsonb)
  rename to ratiflow_document_join_v1_legacy;
alter function public.ratiflow_document_join_v2(text, jsonb)
  rename to ratiflow_document_join_v2_legacy;

create or replace function public.ratiflow_document_join(
  p_share_token text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_protocol smallint;
begin
  select d.protocol_version into v_protocol
  from public.ratiflow_documents as d
  where p_share_token is not null
    and d.share_token_hash = extensions.digest(p_share_token, 'sha256')
    and d.expires_at > now()
  for update;
  if v_protocol = 3 then
    return ratiflow_document_private.error_v3(
      'PROTOCOL_MISMATCH',
      'Protocol-v3 documents must use the v3 join entrypoint.'
    );
  end if;
  return public.ratiflow_document_join_v1_legacy(p_share_token, p_input);
end
$$;

create or replace function public.ratiflow_document_join_v2(
  p_share_token text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_protocol smallint;
begin
  select d.protocol_version into v_protocol
  from public.ratiflow_documents as d
  where p_share_token is not null
    and d.share_token_hash = extensions.digest(p_share_token, 'sha256')
    and d.expires_at > now()
  for update;
  if v_protocol = 3 then
    return ratiflow_document_private.error_v3(
      'PROTOCOL_MISMATCH',
      'Protocol-v3 documents must use the v3 join entrypoint.'
    );
  end if;
  return public.ratiflow_document_join_v2_legacy(p_share_token, p_input);
end
$$;

-- Preserve the legacy implementation behind a protocol-aware wrapper so a valid v3
-- paired token receives the frozen mixed-protocol failure instead of touching v2 work.
alter function public.ratiflow_document_apply_agent_annotation_v2(text, jsonb)
  rename to ratiflow_document_apply_agent_annotation_v2_legacy;

create or replace function public.ratiflow_document_apply_agent_annotation_v2(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_protocol smallint;
begin
  select d.protocol_version into v_protocol
  from ratiflow_document_private.sessions as s
  join public.ratiflow_documents as d on d.id = s.document_id
  where p_handle is not null
    and s.handle_hash = extensions.digest(p_handle, 'sha256')
    and s.expires_at > now() and d.expires_at > now();
  if v_protocol = 3 then
    return ratiflow_document_private.error_v3(
      'PROTOCOL_MISMATCH', 'Protocol-v3 work cannot use the v2 annotation mutation.'
    );
  end if;
  return public.ratiflow_document_apply_agent_annotation_v2_legacy(p_handle, p_input);
end
$$;

-- Private helpers and tables are never exposed through PostgREST. Public RPCs are
-- allow-listed explicitly because new Supabase projects no longer auto-expose tables.
revoke all on all functions in schema ratiflow_document_private
  from public, anon, authenticated;
revoke all on public.ratiflow_document_work_orders from public, anon, authenticated;
revoke all on public.ratiflow_document_events from public, anon, authenticated;

revoke all on function public.ratiflow_launch_document_v3(jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_join_document_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_inspect_document_v3(text) from public, anon, authenticated;
revoke all on function public.ratiflow_save_document_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_touch_document_presence_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_create_document_work_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_cancel_document_work_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_accept_document_proposal_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_reject_document_proposal_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_read_document_memory_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_list_agent_work_v3(text) from public, anon, authenticated;
revoke all on function public.ratiflow_submit_document_proposal_v3(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_reset_document_hero_v3() from public, anon, authenticated;
revoke all on function public.ratiflow_document_apply_agent_annotation_v2_legacy(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_apply_agent_annotation_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_join_v1_legacy(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_join_v2_legacy(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_join(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_join_v2(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.ratiflow_launch_document_v3(jsonb),
  public.ratiflow_join_document_v3(text, jsonb),
  public.ratiflow_inspect_document_v3(text),
  public.ratiflow_save_document_v3(text, jsonb),
  public.ratiflow_touch_document_presence_v3(text, jsonb),
  public.ratiflow_create_document_work_v3(text, jsonb),
  public.ratiflow_cancel_document_work_v3(text, jsonb),
  public.ratiflow_accept_document_proposal_v3(text, jsonb),
  public.ratiflow_reject_document_proposal_v3(text, jsonb),
  public.ratiflow_read_document_memory_v3(text, jsonb),
  public.ratiflow_list_agent_work_v3(text),
  public.ratiflow_submit_document_proposal_v3(text, jsonb)
to anon, authenticated;

grant execute on function public.ratiflow_document_apply_agent_annotation_v2(text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_document_join(text, jsonb),
  public.ratiflow_document_join_v2(text, jsonb)
  to anon, authenticated;

grant execute on function public.ratiflow_reset_document_hero_v3() to service_role;
