-- Shared-document persistence for the account-free editor. The application uses only
-- these narrow RPCs with a publishable key. Share/session tokens are high-entropy
-- bearer secrets and only their SHA-256 digests are stored.

create schema if not exists ratiflow_document_private;
create extension if not exists pgcrypto with schema extensions;

create type public.ratiflow_document_stage as enum (
  'BRAINSTORMING',
  'RESEARCHING',
  'REFINE',
  'READY_TO_SHIP'
);
create type public.ratiflow_document_actor_type as enum ('HUMAN', 'AGENT');
create type public.ratiflow_document_origin as enum ('ORDINARY_UI', 'WEBMCP');
create type public.ratiflow_document_presence_state as enum ('VIEWING', 'EDITING', 'IDLE');
create type public.ratiflow_document_field as enum ('TITLE', 'BODY');
create type public.ratiflow_document_action_source as enum ('CONTEXT_MENU', 'KEYBOARD');
create type public.ratiflow_document_target_kind as enum ('SELECTION', 'CARET', 'DOCUMENT');
create type public.ratiflow_document_action_status as enum ('PENDING', 'COMPLETED', 'CANCELLED', 'STALE');

create table public.ratiflow_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  share_token_hash bytea not null unique,
  title text not null default '' check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 50000),
  stage public.ratiflow_document_stage not null default 'BRAINSTORMING',
  revision integer not null default 0 check (revision >= 0),
  last_editor_member_id uuid,
  last_editor_display_name text check (
    last_editor_display_name is null or char_length(last_editor_display_name) between 1 and 80
  ),
  last_editor_actor_type public.ratiflow_document_actor_type,
  last_editor_origin public.ratiflow_document_origin,
  undo_agent_revision integer check (undo_agent_revision is null or undo_agent_revision >= 1),
  undo_previous_title text check (undo_previous_title is null or char_length(undo_previous_title) <= 160),
  undo_previous_body text check (undo_previous_body is null or char_length(undo_previous_body) <= 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint ratiflow_documents_last_editor_coherent check (
    (last_editor_member_id is null and last_editor_display_name is null
      and last_editor_actor_type is null and last_editor_origin is null)
    or
    (last_editor_member_id is not null and last_editor_display_name is not null
      and last_editor_actor_type is not null and last_editor_origin is not null)
  ),
  constraint ratiflow_documents_undo_coherent check (
    (undo_agent_revision is null and undo_previous_title is null and undo_previous_body is null)
    or
    (undo_agent_revision is not null and undo_previous_title is not null and undo_previous_body is not null)
  )
);

create table public.ratiflow_document_members (
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  member_id uuid not null default extensions.gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  color text not null check (color ~ '^#[0-9A-F]{6}$'),
  created_at timestamptz not null default now(),
  primary key (document_id, member_id)
);

create table ratiflow_document_private.sessions (
  handle_hash bytea primary key,
  document_id uuid not null,
  member_id uuid not null,
  actor_type public.ratiflow_document_actor_type not null,
  session_instance_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (document_id, member_id)
    references public.ratiflow_document_members(document_id, member_id) on delete cascade,
  unique (document_id, session_instance_id, actor_type)
);

create table public.ratiflow_document_presence (
  document_id uuid not null,
  session_instance_id uuid not null,
  member_id uuid not null,
  state public.ratiflow_document_presence_state not null,
  field public.ratiflow_document_field,
  is_typing boolean not null default false,
  selection_start integer check (selection_start is null or selection_start >= 0),
  selection_end integer check (selection_end is null or selection_end >= 0),
  observed_revision integer not null check (observed_revision >= 0),
  last_seen_at timestamptz not null default now(),
  primary key (document_id, session_instance_id),
  foreign key (document_id, member_id)
    references public.ratiflow_document_members(document_id, member_id) on delete cascade,
  constraint ratiflow_document_presence_selection_coherent check (
    (selection_start is null and selection_end is null)
    or
    (selection_start is not null and selection_end is not null and selection_start <= selection_end)
  ),
  constraint ratiflow_document_presence_field_coherent check (
    field is not null or (not is_typing and selection_start is null and selection_end is null)
  )
);

create table public.ratiflow_document_actions (
  action_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  preset_id text not null check (
    preset_id in (
      'continue_thought', 'turn_into_outline', 'identify_research_gaps',
      'turn_gaps_into_questions', 'rewrite_for_clarity', 'shorten',
      'proofread', 'final_polish', 'custom'
    )
  ),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  instruction text not null check (
    char_length(instruction) between 1 and 500
    and instruction = btrim(instruction)
  ),
  stage public.ratiflow_document_stage not null,
  source public.ratiflow_document_action_source not null,
  target_field public.ratiflow_document_field not null,
  target_kind public.ratiflow_document_target_kind not null,
  range_start integer not null check (range_start >= 0),
  range_end integer not null check (range_end >= range_start),
  selected_text text not null check (char_length(selected_text) <= 50000),
  base_revision integer not null check (base_revision >= 0),
  status public.ratiflow_document_action_status not null default 'PENDING',
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  completed_revision integer check (completed_revision is null or completed_revision >= 1),
  foreign key (document_id, created_by_member_id)
    references public.ratiflow_document_members(document_id, member_id) on delete cascade,
  constraint ratiflow_document_actions_completion_coherent check (
    (status = 'COMPLETED' and completed_revision is not null)
    or (status <> 'COMPLETED' and completed_revision is null)
  )
);

create table public.ratiflow_document_request_ledger (
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (
    operation in ('SAVE_HUMAN', 'SET_STAGE', 'CREATE_ACTION', 'APPLY_AGENT_EDIT', 'UNDO_AGENT_EDIT')
  ),
  fingerprint text not null check (char_length(fingerprint) = 64),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (document_id, request_id)
);

create table ratiflow_document_private.rate_windows (
  operation text not null check (operation in ('LAUNCH', 'JOIN')),
  bucket timestamptz not null,
  request_count integer not null check (request_count >= 0),
  created_at timestamptz not null default now(),
  primary key (operation, bucket)
);

create unique index ratiflow_document_one_pending_action_idx
  on public.ratiflow_document_actions (document_id)
  where status = 'PENDING';
create index ratiflow_document_actions_document_idx
  on public.ratiflow_document_actions (document_id);
create index ratiflow_document_actions_creator_idx
  on public.ratiflow_document_actions (document_id, created_by_member_id);
create index ratiflow_document_sessions_member_idx
  on ratiflow_document_private.sessions (document_id, member_id);
create index ratiflow_document_sessions_expiry_idx
  on ratiflow_document_private.sessions (expires_at);
create index ratiflow_document_presence_member_idx
  on public.ratiflow_document_presence (document_id, member_id);
create index ratiflow_document_presence_active_idx
  on public.ratiflow_document_presence (document_id, last_seen_at desc);
create index ratiflow_documents_expiry_idx
  on public.ratiflow_documents (expires_at);

alter table public.ratiflow_documents enable row level security;
alter table public.ratiflow_document_members enable row level security;
alter table public.ratiflow_document_presence enable row level security;
alter table public.ratiflow_document_actions enable row level security;
alter table public.ratiflow_document_request_ledger enable row level security;
alter table ratiflow_document_private.sessions enable row level security;
alter table ratiflow_document_private.rate_windows enable row level security;

-- There are intentionally no table policies. The publishable key may invoke the
-- allow-listed RPCs below, but cannot read or write a document table directly.
revoke all on public.ratiflow_documents from public, anon, authenticated;
revoke all on public.ratiflow_document_members from public, anon, authenticated;
revoke all on public.ratiflow_document_presence from public, anon, authenticated;
revoke all on public.ratiflow_document_actions from public, anon, authenticated;
revoke all on public.ratiflow_document_request_ledger from public, anon, authenticated;
revoke all on all tables in schema ratiflow_document_private from public, anon, authenticated;

create or replace function ratiflow_document_private.exact_keys(
  p_value jsonb,
  p_allowed text[]
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_object_keys(p_value) as key
    where key <> all(p_allowed)
  );
end
$$;

create or replace function ratiflow_document_private.valid_nonnegative_integer(
  p_value jsonb,
  p_max integer
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_text text;
  v_number integer;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    return false;
  end if;
  v_text := p_value #>> '{}';
  if v_text !~ '^(0|[1-9][0-9]*)$' then
    return false;
  end if;
  begin
    v_number := v_text::integer;
  exception when numeric_value_out_of_range then
    return false;
  end;
  return v_number between 0 and p_max;
end
$$;

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
  select
    s.document_id,
    s.member_id,
    m.display_name,
    m.color,
    s.actor_type,
    s.session_instance_id,
    s.expires_at
  from ratiflow_document_private.sessions as s
  join public.ratiflow_document_members as m
    on m.document_id = s.document_id and m.member_id = s.member_id
  join public.ratiflow_documents as d on d.id = s.document_id
  where p_handle is not null
    and char_length(p_handle) between 32 and 256
    and s.handle_hash = extensions.digest(p_handle, 'sha256')
    and s.expires_at > now()
    and d.expires_at > now()
$$;

create or replace function ratiflow_document_private.surface(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'document', jsonb_build_object(
      'id', d.id,
      'title', d.title,
      'body', d.body,
      'stage', d.stage::text,
      'revision', d.revision,
      'updatedAt', d.updated_at,
      'lastEditor', case
        when d.last_editor_member_id is null then null
        else jsonb_build_object(
          'memberId', d.last_editor_member_id,
          'displayName', d.last_editor_display_name,
          'actorType', d.last_editor_actor_type::text,
          'origin', d.last_editor_origin::text
        )
      end
    ),
    'presence', coalesce((
      select jsonb_agg(
        jsonb_build_object(
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
        )
        order by p.last_seen_at desc, p.member_id
      )
      from public.ratiflow_document_presence as p
      join public.ratiflow_document_members as m
        on m.document_id = p.document_id and m.member_id = p.member_id
      where p.document_id = d.id
        and p.last_seen_at > now() - interval '15 seconds'
    ), '[]'::jsonb),
    'pendingAction', (
      select jsonb_build_object(
        'actionId', a.action_id,
        'presetId', a.preset_id,
        'label', a.label,
        'instruction', a.instruction,
        'stage', a.stage::text,
        'source', a.source::text,
        'targetField', a.target_field::text,
        'targetKind', a.target_kind::text,
        'rangeStart', a.range_start,
        'rangeEnd', a.range_end,
        'selectedText', a.selected_text,
        'baseRevision', a.base_revision,
        'status', a.status::text,
        'createdByMemberId', a.created_by_member_id,
        'createdAt', a.created_at
      )
      from public.ratiflow_document_actions as a
      where a.document_id = d.id and a.status = 'PENDING'
      limit 1
    ),
    'undoAgentEdit', case
      when d.undo_agent_revision = d.revision then jsonb_build_object(
        'agentRevision', d.undo_agent_revision,
        'previousTitle', d.undo_previous_title,
        'previousBody', d.undo_previous_body
      )
      else null
    end
  )
  from public.ratiflow_documents as d
  where d.id = p_document_id and d.expires_at > now()
$$;

create or replace function ratiflow_document_private.error(
  p_code text,
  p_message text,
  p_retryable boolean,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'ok', false,
    'code', p_code,
    'message', p_message,
    'retryable', p_retryable
  ) || coalesce(p_extra, '{}'::jsonb)
$$;

create or replace function ratiflow_document_private.stale(
  p_document_id uuid,
  p_expected_revision integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error(
    'STALE_WORK_STATE',
    format('The note advanced from revision %s to %s.', p_expected_revision, d.revision),
    true,
    jsonb_build_object(
      'currentSurface', ratiflow_document_private.surface(d.id),
      'expectedRevision', p_expected_revision,
      'actualRevision', d.revision,
      'nextAction', format('Read the current note and retry against revision %s.', d.revision)
    )
  )
  from public.ratiflow_documents as d
  where d.id = p_document_id
$$;

create or replace function ratiflow_document_private.session_bundle(
  p_document_id uuid,
  p_share_token text,
  p_human_session_token text,
  p_agent_session_token text,
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
    'humanSessionToken', p_human_session_token,
    'agentSessionToken', p_agent_session_token,
    'sessionInstanceId', p_session_instance_id,
    'selfMemberId', p_member_id,
    'expiresAt', p_expires_at,
    'surface', ratiflow_document_private.surface(p_document_id)
  )
$$;

create or replace function ratiflow_document_private.input_error()
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error(
    'INVALID_INPUT',
    'The document request is invalid.',
    false
  )
$$;

create or replace function ratiflow_document_private.unauthorized()
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error(
    'UNAUTHORIZED',
    'A valid document session is required.',
    false
  )
$$;

create or replace function ratiflow_document_private.request_fingerprint(
  p_operation text,
  p_input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select encode(
    extensions.digest(
      jsonb_build_object('operation', p_operation, 'input', p_input)::text,
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.ratiflow_document_launch(p_input jsonb default '{}'::jsonb)
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
    return ratiflow_document_private.input_error();
  end if;
  if p_input ? 'displayName' then
    if jsonb_typeof(p_input->'displayName') <> 'string'
      or char_length(btrim(p_input->>'displayName')) not between 1 and 80 then
      return ratiflow_document_private.input_error();
    end if;
    v_display_name := btrim(p_input->>'displayName');
  else
    v_display_name := 'Guest 1';
  end if;

  delete from public.ratiflow_documents where expires_at <= now();
  delete from ratiflow_document_private.rate_windows
    where bucket < v_bucket - interval '10 minutes';
  insert into ratiflow_document_private.rate_windows(operation, bucket, request_count)
  values ('LAUNCH', v_bucket, 1)
  on conflict (operation, bucket)
  do update set request_count = ratiflow_document_private.rate_windows.request_count + 1
  returning request_count into v_request_count;
  if v_request_count > 60 then
    return ratiflow_document_private.error(
      'RATE_LIMITED',
      'Too many notes were created at once. Try again shortly.',
      true,
      jsonb_build_object('nextAction', 'Try creating a new note in one minute.')
    );
  end if;

  insert into public.ratiflow_documents(
    id, share_token_hash, title, body, stage, revision, expires_at
  ) values (
    v_document_id,
    extensions.digest(v_share_token, 'sha256'),
    '',
    '',
    'BRAINSTORMING',
    0,
    v_expires_at
  );
  insert into public.ratiflow_document_members(
    document_id, member_id, display_name, color
  ) values (
    v_document_id, v_member_id, v_display_name, '#007AFF'
  );
  insert into ratiflow_document_private.sessions(
    handle_hash, document_id, member_id, actor_type, session_instance_id, expires_at
  ) values
    (
      extensions.digest(v_human_token, 'sha256'), v_document_id, v_member_id,
      'HUMAN', v_session_instance_id, v_expires_at
    ),
    (
      extensions.digest(v_agent_token, 'sha256'), v_document_id, v_member_id,
      'AGENT', v_session_instance_id, v_expires_at
    );
  insert into public.ratiflow_document_presence(
    document_id, session_instance_id, member_id, state, field, is_typing,
    selection_start, selection_end, observed_revision, last_seen_at
  ) values (
    v_document_id, v_session_instance_id, v_member_id, 'VIEWING', null, false,
    null, null, 0, now()
  );

  return jsonb_build_object(
    'ok', true,
    'data', ratiflow_document_private.session_bundle(
      v_document_id,
      v_share_token,
      v_human_token,
      v_agent_token,
      v_session_instance_id,
      v_member_id,
      v_expires_at
    )
  );
end
$$;

create or replace function public.ratiflow_document_join(
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
    return ratiflow_document_private.input_error();
  end if;
  if p_input ? 'displayName' and (
    jsonb_typeof(p_input->'displayName') <> 'string'
    or char_length(btrim(p_input->>'displayName')) not between 1 and 80
  ) then
    return ratiflow_document_private.input_error();
  end if;

  delete from ratiflow_document_private.rate_windows
    where bucket < v_bucket - interval '10 minutes';
  insert into ratiflow_document_private.rate_windows(operation, bucket, request_count)
  values ('JOIN', v_bucket, 1)
  on conflict (operation, bucket)
  do update set request_count = ratiflow_document_private.rate_windows.request_count + 1
  returning request_count into v_request_count;
  if v_request_count > 240 then
    return ratiflow_document_private.error(
      'RATE_LIMITED',
      'Too many people joined notes at once. Try again shortly.',
      true,
      jsonb_build_object('nextAction', 'Try opening this note again in one minute.')
    );
  end if;

  select * into v_document
  from public.ratiflow_documents
  where share_token_hash = extensions.digest(p_share_token, 'sha256')
    and expires_at > now()
  for update;
  if not found then
    return ratiflow_document_private.error(
      'NOT_FOUND',
      'This note is no longer available.',
      false,
      jsonb_build_object('nextAction', 'Create a new note.')
    );
  end if;

  select count(*)::integer + 1 into v_member_number
  from public.ratiflow_document_members
  where document_id = v_document.id;
  v_display_name := case
    when p_input ? 'displayName' then btrim(p_input->>'displayName')
    else format('Guest %s', v_member_number)
  end;
  v_color := (array['#007AFF', '#AF52DE', '#34C759', '#FF9500', '#FF2D55', '#5AC8FA'])[
    ((v_member_number - 1) % 6) + 1
  ];

  insert into public.ratiflow_document_members(
    document_id, member_id, display_name, color
  ) values (
    v_document.id, v_member_id, v_display_name, v_color
  );
  insert into ratiflow_document_private.sessions(
    handle_hash, document_id, member_id, actor_type, session_instance_id, expires_at
  ) values
    (
      extensions.digest(v_human_token, 'sha256'), v_document.id, v_member_id,
      'HUMAN', v_session_instance_id, v_document.expires_at
    ),
    (
      extensions.digest(v_agent_token, 'sha256'), v_document.id, v_member_id,
      'AGENT', v_session_instance_id, v_document.expires_at
    );
  insert into public.ratiflow_document_presence(
    document_id, session_instance_id, member_id, state, field, is_typing,
    selection_start, selection_end, observed_revision, last_seen_at
  ) values (
    v_document.id, v_session_instance_id, v_member_id, 'VIEWING', null, false,
    null, null, v_document.revision, now()
  );

  return jsonb_build_object(
    'ok', true,
    'data', ratiflow_document_private.session_bundle(
      v_document.id,
      p_share_token,
      v_human_token,
      v_agent_token,
      v_session_instance_id,
      v_member_id,
      v_document.expires_at
    )
  );
end
$$;

create or replace function public.ratiflow_document_inspect(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;
  return jsonb_build_object(
    'ok', true,
    'data', ratiflow_document_private.surface(v_member.document_id)
  );
end
$$;

create or replace function public.ratiflow_document_save_human(
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
  v_request_id uuid;
  v_expected_revision integer;
  v_fingerprint text;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_result jsonb;
  v_next_revision integer;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input, array['expectedRevision', 'requestId', 'title', 'body']
    )
    or not (p_input ?& array['expectedRevision', 'requestId', 'title', 'body'])
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'expectedRevision', 2147483647
    )
    or jsonb_typeof(p_input->'requestId') <> 'string'
    or jsonb_typeof(p_input->'title') <> 'string'
    or jsonb_typeof(p_input->'body') <> 'string'
    or char_length(p_input->>'title') > 160
    or char_length(p_input->>'body') > 50000 then
    return ratiflow_document_private.input_error();
  end if;
  begin
    v_request_id := (p_input->>'requestId')::uuid;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;
  v_expected_revision := (p_input->>'expectedRevision')::integer;
  v_fingerprint := ratiflow_document_private.request_fingerprint('SAVE_HUMAN', p_input);

  select * into v_document
  from public.ratiflow_documents
  where id = v_member.document_id and expires_at > now()
  for update;
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;

  select * into v_existing
  from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'SAVE_HUMAN' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale(v_document.id, v_expected_revision);
  elsif v_document.title = p_input->>'title' and v_document.body = p_input->>'body' then
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface(v_document.id)
    );
  else
    v_next_revision := v_document.revision + 1;
    update public.ratiflow_document_actions
    set status = 'STALE'
    where document_id = v_document.id and status = 'PENDING';
    update public.ratiflow_documents
    set title = p_input->>'title',
        body = p_input->>'body',
        revision = v_next_revision,
        updated_at = now(),
        last_editor_member_id = v_member.member_id,
        last_editor_display_name = v_member.display_name,
        last_editor_actor_type = 'HUMAN',
        last_editor_origin = 'ORDINARY_UI',
        undo_agent_revision = null,
        undo_previous_title = null,
        undo_previous_body = null
    where id = v_document.id;
    update public.ratiflow_document_presence
    set observed_revision = v_next_revision, last_seen_at = now()
    where document_id = v_document.id
      and session_instance_id = v_member.session_instance_id;
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface(v_document.id)
    );
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'SAVE_HUMAN', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_set_stage(
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
  v_request_id uuid;
  v_expected_revision integer;
  v_stage public.ratiflow_document_stage;
  v_fingerprint text;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_result jsonb;
  v_next_revision integer;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input, array['expectedRevision', 'requestId', 'stage']
    )
    or not (p_input ?& array['expectedRevision', 'requestId', 'stage'])
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'expectedRevision', 2147483647
    )
    or jsonb_typeof(p_input->'requestId') <> 'string'
    or jsonb_typeof(p_input->'stage') <> 'string'
    or p_input->>'stage' not in (
      'BRAINSTORMING', 'RESEARCHING', 'REFINE', 'READY_TO_SHIP'
    ) then
    return ratiflow_document_private.input_error();
  end if;
  begin
    v_request_id := (p_input->>'requestId')::uuid;
    v_stage := (p_input->>'stage')::public.ratiflow_document_stage;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;
  v_expected_revision := (p_input->>'expectedRevision')::integer;
  v_fingerprint := ratiflow_document_private.request_fingerprint('SET_STAGE', p_input);

  select * into v_document
  from public.ratiflow_documents
  where id = v_member.document_id and expires_at > now()
  for update;
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;
  select * into v_existing
  from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'SET_STAGE' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale(v_document.id, v_expected_revision);
  elsif v_stage = v_document.stage then
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface(v_document.id)
    );
  else
    v_next_revision := v_document.revision + 1;
    update public.ratiflow_document_actions
    set status = 'STALE'
    where document_id = v_document.id and status = 'PENDING';
    update public.ratiflow_documents
    set stage = v_stage,
        revision = v_next_revision,
        updated_at = now(),
        last_editor_member_id = v_member.member_id,
        last_editor_display_name = v_member.display_name,
        last_editor_actor_type = 'HUMAN',
        last_editor_origin = 'ORDINARY_UI',
        undo_agent_revision = null,
        undo_previous_title = null,
        undo_previous_body = null
    where id = v_document.id;
    update public.ratiflow_document_presence
    set observed_revision = v_next_revision, last_seen_at = now()
    where document_id = v_document.id
      and session_instance_id = v_member.session_instance_id;
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface(v_document.id)
    );
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'SET_STAGE', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function ratiflow_document_private.preset(
  p_stage public.ratiflow_document_stage,
  p_preset_id text
)
returns table (label text, instruction text)
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select preset.label, preset.instruction
  from (values
    (
      'BRAINSTORMING'::public.ratiflow_document_stage,
      'continue_thought',
      'Continue the thought',
      'Continue naturally from the target, matching the document voice and adding no unsupported factual claims.'
    ),
    (
      'BRAINSTORMING'::public.ratiflow_document_stage,
      'turn_into_outline',
      'Turn into an outline',
      'Turn the target into a clear concise outline while preserving its meaning.'
    ),
    (
      'RESEARCHING'::public.ratiflow_document_stage,
      'identify_research_gaps',
      'Identify research gaps',
      'Identify claims, assumptions, or missing evidence; do not invent citations or claim research was performed.'
    ),
    (
      'RESEARCHING'::public.ratiflow_document_stage,
      'turn_gaps_into_questions',
      'Turn gaps into questions',
      'Turn research gaps in the target into focused questions; do not invent citations.'
    ),
    (
      'REFINE'::public.ratiflow_document_stage,
      'rewrite_for_clarity',
      'Rewrite for clarity',
      'Rewrite the target for clarity while preserving meaning and factual claims.'
    ),
    (
      'REFINE'::public.ratiflow_document_stage,
      'shorten',
      'Shorten',
      'Shorten the target without losing essential meaning or factual qualifications.'
    ),
    (
      'READY_TO_SHIP'::public.ratiflow_document_stage,
      'proofread',
      'Proofread',
      'Correct grammar, spelling, and punctuation without changing meaning.'
    ),
    (
      'READY_TO_SHIP'::public.ratiflow_document_stage,
      'final_polish',
      'Final polish',
      'Polish the target for publication, improving flow and consistency without adding unsupported claims.'
    )
  ) as preset(stage, preset_id, label, instruction)
  where preset.stage = p_stage and preset.preset_id = p_preset_id
$$;

create or replace function public.ratiflow_document_create_action(
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
  v_request_id uuid;
  v_expected_revision integer;
  v_range_start integer;
  v_range_end integer;
  v_fingerprint text;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_result jsonb;
  v_action_id uuid := extensions.gen_random_uuid();
  v_content text;
  v_selected_text text;
  v_label text;
  v_instruction text;
  v_normalized_input jsonb;
  v_preset record;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input,
      array[
        'expectedRevision', 'requestId', 'presetId', 'customInstruction',
        'source', 'targetField', 'targetKind', 'rangeStart', 'rangeEnd'
      ]
    )
    or not (p_input ?& array[
      'expectedRevision', 'requestId', 'presetId', 'source', 'targetField',
      'targetKind', 'rangeStart', 'rangeEnd'
    ])
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'expectedRevision', 2147483647
    )
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'rangeStart', 50000
    )
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'rangeEnd', 50000
    )
    or jsonb_typeof(p_input->'requestId') <> 'string'
    or jsonb_typeof(p_input->'presetId') <> 'string'
    or jsonb_typeof(p_input->'source') <> 'string'
    or jsonb_typeof(p_input->'targetField') <> 'string'
    or jsonb_typeof(p_input->'targetKind') <> 'string'
    or p_input->>'presetId' not in (
      'continue_thought', 'turn_into_outline', 'identify_research_gaps',
      'turn_gaps_into_questions', 'rewrite_for_clarity', 'shorten',
      'proofread', 'final_polish', 'custom'
    )
    or p_input->>'source' not in ('CONTEXT_MENU', 'KEYBOARD')
    or p_input->>'targetField' not in ('TITLE', 'BODY')
    or p_input->>'targetKind' not in ('SELECTION', 'CARET', 'DOCUMENT') then
    return ratiflow_document_private.input_error();
  end if;
  if p_input->>'presetId' = 'custom' then
    if not (p_input ? 'customInstruction')
      or jsonb_typeof(p_input->'customInstruction') <> 'string'
      or char_length(p_input->>'customInstruction') > 500
      or char_length(btrim(p_input->>'customInstruction')) < 1 then
      return ratiflow_document_private.input_error();
    end if;
    v_normalized_input := jsonb_set(
      p_input,
      '{customInstruction}',
      to_jsonb(btrim(p_input->>'customInstruction')),
      false
    );
  elsif p_input ? 'customInstruction' then
    return ratiflow_document_private.input_error();
  else
    v_normalized_input := p_input;
  end if;
  begin
    v_request_id := (p_input->>'requestId')::uuid;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;
  v_expected_revision := (p_input->>'expectedRevision')::integer;
  v_range_start := (p_input->>'rangeStart')::integer;
  v_range_end := (p_input->>'rangeEnd')::integer;
  if v_range_start > v_range_end then
    return ratiflow_document_private.input_error();
  end if;
  v_fingerprint := ratiflow_document_private.request_fingerprint(
    'CREATE_ACTION',
    v_normalized_input
  );

  select * into v_document
  from public.ratiflow_documents
  where id = v_member.document_id and expires_at > now()
  for update;
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;
  select * into v_existing
  from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'CREATE_ACTION' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale(v_document.id, v_expected_revision);
  else
    if p_input->>'presetId' = 'custom' then
      v_label := 'Ask agent…';
      v_instruction := v_normalized_input->>'customInstruction';
    else
      select * into v_preset
      from ratiflow_document_private.preset(v_document.stage, p_input->>'presetId');
      if not found then
        v_result := ratiflow_document_private.input_error();
      else
        v_label := v_preset.label;
        v_instruction := v_preset.instruction;
      end if;
    end if;

    if v_result is null then
      v_content := case
        when p_input->>'targetField' = 'TITLE' then v_document.title
        else v_document.body
      end;
      if v_range_end > char_length(v_content) then
        v_result := ratiflow_document_private.input_error();
      elsif p_input->>'targetKind' = 'SELECTION' and v_range_start = v_range_end then
        v_result := ratiflow_document_private.input_error();
      elsif p_input->>'targetKind' = 'CARET' and (
        v_range_start <> v_range_end
        or not (
          (p_input->>'targetField' = 'BODY' and p_input->>'presetId' = 'continue_thought')
          or char_length(v_content) = 0
        )
      ) then
        v_result := ratiflow_document_private.input_error();
      elsif p_input->>'targetKind' = 'DOCUMENT' and (
        v_range_start <> 0 or v_range_end <> char_length(v_content)
      ) then
        v_result := ratiflow_document_private.input_error();
      end if;
    end if;

    if v_result is null then
      v_selected_text := substring(
        v_content from v_range_start + 1 for v_range_end - v_range_start
      );
      update public.ratiflow_document_actions
      set status = 'STALE'
      where document_id = v_document.id and status = 'PENDING';
      insert into public.ratiflow_document_actions(
        action_id, document_id, preset_id, label, instruction, stage, source,
        target_field, target_kind, range_start, range_end, selected_text,
        base_revision, status, created_by_member_id
      ) values (
        v_action_id,
        v_document.id,
        p_input->>'presetId',
        v_label,
        v_instruction,
        v_document.stage,
        (p_input->>'source')::public.ratiflow_document_action_source,
        (p_input->>'targetField')::public.ratiflow_document_field,
        (p_input->>'targetKind')::public.ratiflow_document_target_kind,
        v_range_start,
        v_range_end,
        v_selected_text,
        v_document.revision,
        'PENDING',
        v_member.member_id
      );
      v_result := jsonb_build_object(
        'ok', true,
        'data', ratiflow_document_private.surface(v_document.id)
      );
    end if;
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'CREATE_ACTION', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_cancel_action(
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
  v_action_id uuid;
  v_action public.ratiflow_document_actions%rowtype;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(p_input, array['actionId'])
    or not (p_input ? 'actionId')
    or jsonb_typeof(p_input->'actionId') <> 'string' then
    return ratiflow_document_private.input_error();
  end if;
  begin
    v_action_id := (p_input->>'actionId')::uuid;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;

  select * into v_document
  from public.ratiflow_documents
  where id = v_member.document_id and expires_at > now()
  for update;
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;
  select * into v_action
  from public.ratiflow_document_actions
  where action_id = v_action_id and document_id = v_document.id
  for update;
  if not found or v_action.status <> 'PENDING' then
    return ratiflow_document_private.error(
      'STALE_ACTION_CONTEXT',
      'That agent action is no longer pending.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface(v_document.id),
        'nextAction', 'Choose a new agent action from the current note.'
      )
    );
  end if;
  update public.ratiflow_document_actions
  set status = 'CANCELLED'
  where action_id = v_action_id;
  return jsonb_build_object(
    'ok', true,
    'data', ratiflow_document_private.surface(v_document.id)
  );
end
$$;

create or replace function public.ratiflow_document_apply_agent_edit(
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
  v_action public.ratiflow_document_actions%rowtype;
  v_action_id uuid;
  v_request_id uuid;
  v_expected_revision integer;
  v_fingerprint text;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_result jsonb;
  v_content text;
  v_current_target text;
  v_new_content text;
  v_next_revision integer;
  v_normalized_input jsonb;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input,
      array['actionId', 'expectedRevision', 'requestId', 'replacementText', 'changeSummary']
    )
    or not (p_input ?& array[
      'actionId', 'expectedRevision', 'requestId', 'replacementText', 'changeSummary'
    ])
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'expectedRevision', 2147483647
    )
    or jsonb_typeof(p_input->'actionId') <> 'string'
    or jsonb_typeof(p_input->'requestId') <> 'string'
    or jsonb_typeof(p_input->'replacementText') <> 'string'
    or jsonb_typeof(p_input->'changeSummary') <> 'string'
    or char_length(p_input->>'replacementText') > 50000
    or char_length(p_input->>'changeSummary') > 240
    or char_length(btrim(p_input->>'changeSummary')) < 1 then
    return ratiflow_document_private.input_error();
  end if;
  begin
    v_action_id := (p_input->>'actionId')::uuid;
    v_request_id := (p_input->>'requestId')::uuid;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;
  v_expected_revision := (p_input->>'expectedRevision')::integer;
  v_normalized_input := jsonb_set(
    p_input,
    '{changeSummary}',
    to_jsonb(btrim(p_input->>'changeSummary')),
    false
  );
  v_fingerprint := ratiflow_document_private.request_fingerprint(
    'APPLY_AGENT_EDIT',
    v_normalized_input
  );

  select * into v_document
  from public.ratiflow_documents
  where id = v_member.document_id and expires_at > now()
  for update;
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;
  select * into v_existing
  from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'APPLY_AGENT_EDIT'
      and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale(v_document.id, v_expected_revision);
  else
    select * into v_action
    from public.ratiflow_document_actions
    where action_id = v_action_id and document_id = v_document.id
    for update;
    if not found
      or v_action.status <> 'PENDING'
      or v_action.stage <> v_document.stage
      or v_action.base_revision <> v_document.revision then
      v_result := ratiflow_document_private.error(
        'STALE_ACTION_CONTEXT',
        'That agent action no longer matches the current note.',
        false,
        jsonb_build_object(
          'currentSurface', ratiflow_document_private.surface(v_document.id),
          'nextAction', 'Ask the person to choose a new action from the current note.'
        )
      );
    else
      v_content := case
        when v_action.target_field = 'TITLE' then v_document.title
        else v_document.body
      end;
      if v_action.range_end > char_length(v_content) then
        v_result := ratiflow_document_private.error(
          'STALE_ACTION_CONTEXT',
          'That agent action no longer matches the current note.',
          false,
          jsonb_build_object(
            'currentSurface', ratiflow_document_private.surface(v_document.id),
            'nextAction', 'Ask the person to choose a new action from the current note.'
          )
        );
      else
        v_current_target := substring(
          v_content from v_action.range_start + 1
          for v_action.range_end - v_action.range_start
        );
        if v_current_target <> v_action.selected_text then
          v_result := ratiflow_document_private.error(
            'STALE_ACTION_CONTEXT',
            'That agent action no longer matches the current note.',
            false,
            jsonb_build_object(
              'currentSurface', ratiflow_document_private.surface(v_document.id),
              'nextAction', 'Ask the person to choose a new action from the current note.'
            )
          );
        end if;
      end if;
    end if;

    if v_result is null then
      v_new_content := left(v_content, v_action.range_start)
        || (p_input->>'replacementText')
        || substring(v_content from v_action.range_end + 1);
      if (v_action.target_field = 'TITLE' and char_length(v_new_content) > 160)
        or (v_action.target_field = 'BODY' and char_length(v_new_content) > 50000) then
        v_result := ratiflow_document_private.input_error();
      else
        v_next_revision := v_document.revision + 1;
        update public.ratiflow_document_actions
        set status = 'COMPLETED', completed_revision = v_next_revision
        where action_id = v_action.action_id;
        update public.ratiflow_documents
        set title = case
              when v_action.target_field = 'TITLE' then v_new_content
              else title
            end,
            body = case
              when v_action.target_field = 'BODY' then v_new_content
              else body
            end,
            revision = v_next_revision,
            updated_at = now(),
            last_editor_member_id = v_member.member_id,
            last_editor_display_name = v_member.display_name,
            last_editor_actor_type = 'AGENT',
            last_editor_origin = 'WEBMCP',
            undo_agent_revision = v_next_revision,
            undo_previous_title = v_document.title,
            undo_previous_body = v_document.body
        where id = v_document.id;
        update public.ratiflow_document_presence
        set observed_revision = v_next_revision, last_seen_at = now()
        where document_id = v_document.id
          and session_instance_id = v_member.session_instance_id;
        v_result := jsonb_build_object(
          'ok', true,
          'data', ratiflow_document_private.surface(v_document.id)
        );
      end if;
    end if;
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'APPLY_AGENT_EDIT', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_undo_agent_edit(
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
  v_request_id uuid;
  v_expected_revision integer;
  v_agent_revision integer;
  v_fingerprint text;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_result jsonb;
  v_next_revision integer;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input, array['expectedRevision', 'requestId', 'agentRevision']
    )
    or not (p_input ?& array['expectedRevision', 'requestId', 'agentRevision'])
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'expectedRevision', 2147483647
    )
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'agentRevision', 2147483647
    )
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_document_private.input_error();
  end if;
  begin
    v_request_id := (p_input->>'requestId')::uuid;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;
  v_expected_revision := (p_input->>'expectedRevision')::integer;
  v_agent_revision := (p_input->>'agentRevision')::integer;
  if v_expected_revision <> v_agent_revision then
    return ratiflow_document_private.input_error();
  end if;
  v_fingerprint := ratiflow_document_private.request_fingerprint('UNDO_AGENT_EDIT', p_input);

  select * into v_document
  from public.ratiflow_documents
  where id = v_member.document_id and expires_at > now()
  for update;
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;
  select * into v_existing
  from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_request_id;
  if found then
    if v_existing.operation = 'UNDO_AGENT_EDIT'
      and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale(v_document.id, v_expected_revision);
  elsif v_document.undo_agent_revision is null
    or v_document.undo_agent_revision <> v_agent_revision then
    v_result := ratiflow_document_private.error(
      'STALE_ACTION_CONTEXT',
      'That agent edit can no longer be undone.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface(v_document.id),
        'nextAction', 'Keep the current note or edit it directly.'
      )
    );
  else
    v_next_revision := v_document.revision + 1;
    update public.ratiflow_document_actions
    set status = 'STALE'
    where document_id = v_document.id and status = 'PENDING';
    update public.ratiflow_documents
    set title = v_document.undo_previous_title,
        body = v_document.undo_previous_body,
        revision = v_next_revision,
        updated_at = now(),
        last_editor_member_id = v_member.member_id,
        last_editor_display_name = v_member.display_name,
        last_editor_actor_type = 'HUMAN',
        last_editor_origin = 'ORDINARY_UI',
        undo_agent_revision = null,
        undo_previous_title = null,
        undo_previous_body = null
    where id = v_document.id;
    update public.ratiflow_document_presence
    set observed_revision = v_next_revision, last_seen_at = now()
    where document_id = v_document.id
      and session_instance_id = v_member.session_instance_id;
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface(v_document.id)
    );
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'UNDO_AGENT_EDIT', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_touch_presence(
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
  v_selection_start integer;
  v_selection_end integer;
  v_observed_revision integer;
  v_content_length integer;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input,
      array[
        'state', 'field', 'isTyping', 'selectionStart', 'selectionEnd',
        'observedRevision'
      ]
    )
    or not (p_input ?& array[
      'state', 'field', 'isTyping', 'selectionStart', 'selectionEnd',
      'observedRevision'
    ])
    or jsonb_typeof(p_input->'state') <> 'string'
    or p_input->>'state' not in ('VIEWING', 'EDITING', 'IDLE')
    or jsonb_typeof(p_input->'isTyping') <> 'boolean'
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'observedRevision', 2147483647
    ) then
    return ratiflow_document_private.input_error();
  end if;
  if jsonb_typeof(p_input->'field') = 'null' then
    if (p_input->>'isTyping')::boolean
      or jsonb_typeof(p_input->'selectionStart') <> 'null'
      or jsonb_typeof(p_input->'selectionEnd') <> 'null' then
      return ratiflow_document_private.input_error();
    end if;
    v_field := null;
  elsif jsonb_typeof(p_input->'field') = 'string'
    and p_input->>'field' in ('TITLE', 'BODY') then
    v_field := (p_input->>'field')::public.ratiflow_document_field;
    if jsonb_typeof(p_input->'selectionStart') = 'null'
      and jsonb_typeof(p_input->'selectionEnd') = 'null' then
      v_selection_start := null;
      v_selection_end := null;
    elsif ratiflow_document_private.valid_nonnegative_integer(
        p_input->'selectionStart', 50000
      )
      and ratiflow_document_private.valid_nonnegative_integer(
        p_input->'selectionEnd', 50000
      ) then
      v_selection_start := (p_input->>'selectionStart')::integer;
      v_selection_end := (p_input->>'selectionEnd')::integer;
      if v_selection_start > v_selection_end then
        return ratiflow_document_private.input_error();
      end if;
    else
      return ratiflow_document_private.input_error();
    end if;
  else
    return ratiflow_document_private.input_error();
  end if;
  if (p_input->>'isTyping')::boolean and p_input->>'state' <> 'EDITING' then
    return ratiflow_document_private.input_error();
  end if;
  v_observed_revision := (p_input->>'observedRevision')::integer;

  select * into v_document
  from public.ratiflow_documents
  where id = v_member.document_id and expires_at > now();
  if not found then
    return ratiflow_document_private.unauthorized();
  end if;
  if v_observed_revision > v_document.revision then
    return ratiflow_document_private.input_error();
  end if;
  if v_field is not null and v_selection_end is not null then
    v_content_length := case
      when v_field = 'TITLE' then char_length(v_document.title)
      else char_length(v_document.body)
    end;
    if v_selection_end > v_content_length then
      return ratiflow_document_private.input_error();
    end if;
  end if;

  insert into public.ratiflow_document_presence(
    document_id, session_instance_id, member_id, state, field, is_typing,
    selection_start, selection_end, observed_revision, last_seen_at
  ) values (
    v_document.id,
    v_member.session_instance_id,
    v_member.member_id,
    (p_input->>'state')::public.ratiflow_document_presence_state,
    v_field,
    (p_input->>'isTyping')::boolean,
    v_selection_start,
    v_selection_end,
    v_observed_revision,
    now()
  )
  on conflict (document_id, session_instance_id)
  do update set
    member_id = excluded.member_id,
    state = excluded.state,
    field = excluded.field,
    is_typing = excluded.is_typing,
    selection_start = excluded.selection_start,
    selection_end = excluded.selection_end,
    observed_revision = excluded.observed_revision,
    last_seen_at = excluded.last_seen_at;

  return jsonb_build_object(
    'ok', true,
    'data', ratiflow_document_private.surface(v_document.id)
  );
end
$$;

-- Private helpers remain unreachable. Public security-definer RPCs are intentional
-- bearer-token API endpoints: each derives document/member/actor from a token digest,
-- validates exact bounded input, and never accepts actor/origin/document identifiers.
revoke all on all functions in schema ratiflow_document_private
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_launch(jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_join(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_inspect(text)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_save_human(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_set_stage(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_create_action(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_cancel_action(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_apply_agent_edit(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_undo_agent_edit(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_touch_presence(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.ratiflow_document_launch(jsonb),
  public.ratiflow_document_join(text, jsonb),
  public.ratiflow_document_inspect(text),
  public.ratiflow_document_save_human(text, jsonb),
  public.ratiflow_document_set_stage(text, jsonb),
  public.ratiflow_document_create_action(text, jsonb),
  public.ratiflow_document_cancel_action(text, jsonb),
  public.ratiflow_document_apply_agent_edit(text, jsonb),
  public.ratiflow_document_undo_agent_edit(text, jsonb),
  public.ratiflow_document_touch_presence(text, jsonb)
to anon, authenticated;
