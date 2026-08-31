-- Live human-agent collaboration for the isolated Ratiflow decision demo.
--
-- This migration is deliberately additive. Public tables remain inaccessible through
-- the Data API; fixed SECURITY DEFINER RPCs authenticate the existing high-entropy
-- membership handle, derive workspace/actor from it, and return bounded JSON views.
-- Activity cursors are opaque UUIDs. A separately stored, workspace-local sequence is
-- used only by the database for lossless pagination and serialization.

alter type public.ratiflow_event_origin add value if not exists 'AUTO_PICKUP';

create table public.ratiflow_activity_sequences (
  workspace_id text primary key references public.ratiflow_workspaces(id) on delete cascade,
  last_sequence bigint not null default 0 check (last_sequence >= 0)
);

create table public.ratiflow_activity (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  id uuid not null default extensions.gen_random_uuid(),
  cursor uuid not null default extensions.gen_random_uuid(),
  actor_member_id text not null check (char_length(actor_member_id) between 1 and 80),
  actor_name text not null check (char_length(actor_name) between 1 and 120),
  actor_role text not null check (char_length(actor_role) between 1 and 120),
  actor_type text not null check (actor_type in ('HUMAN', 'AGENT', 'SYSTEM')),
  via text not null check (via in ('ORDINARY_UI', 'BROWSER_AGENT', 'AUTO_PICKUP', 'SYSTEM')),
  event_type text not null check (event_type in (
    'WORKSPACE_MUTATED', 'TASK_CREATED', 'TASK_CLAIMED', 'TASK_WAITING_HUMAN',
    'TASK_RESOLVED', 'TASK_CANCELLED', 'AGENT_JOINED', 'AGENT_LEFT',
    'AGENT_COMMENTED', 'HUMAN_INPUT_REQUESTED', 'HUMAN_INPUT_ANSWERED',
    'STANDING_INSTRUCTIONS_CHANGED'
  )),
  target_kind text not null check (target_kind in ('DECISION', 'OPTION', 'FOLLOWUP')),
  target_id text not null check (char_length(target_id) between 1 and 80),
  summary text not null check (char_length(btrim(summary)) between 1 and 600),
  workspace_revision integer check (workspace_revision is null or workspace_revision >= 0),
  task_id uuid,
  question_id uuid,
  created_at timestamptz not null default now(),
  primary key (workspace_id, sequence),
  unique (id),
  unique (cursor)
);

create table public.ratiflow_agent_page_sessions (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  agent_member_id text not null check (char_length(agent_member_id) between 1 and 80),
  page_session_id uuid not null,
  caller text not null check (caller in ('BROWSER_AGENT', 'AUTO_RUNNER')),
  engagement text not null check (engagement in ('INVOKED', 'LIVE')),
  lease_expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, page_session_id, caller),
  foreign key (workspace_id, agent_member_id)
    references public.ratiflow_members(workspace_id, member_id) on delete cascade
);

create table public.ratiflow_agent_status (
  workspace_id text primary key references public.ratiflow_workspaces(id) on delete cascade,
  agent_member_id text not null check (char_length(agent_member_id) between 1 and 80),
  last_seen_at timestamptz,
  explicitly_away boolean not null default true,
  foreign key (workspace_id, agent_member_id)
    references public.ratiflow_members(workspace_id, member_id) on delete cascade
);

create table public.ratiflow_standing_instructions (
  workspace_id text primary key references public.ratiflow_workspaces(id) on delete cascade,
  auto_pickup boolean not null default false,
  scopes text[] not null default array['MENTIONS', 'TASKS']::text[]
    check (cardinality(scopes) between 1 and 2 and scopes <@ array['MENTIONS', 'TASKS']::text[]),
  max_actions_per_hour integer not null default 6 check (max_actions_per_hour between 1 and 20),
  updated_at timestamptz not null default now()
);

create table public.ratiflow_agent_tasks (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  id uuid not null default extensions.gen_random_uuid(),
  kind text not null check (kind in ('MENTION', 'TASK')),
  body text not null check (char_length(btrim(body)) between 1 and 1200),
  target_kind text not null check (target_kind in ('DECISION', 'OPTION', 'FOLLOWUP')),
  target_id text not null check (char_length(target_id) between 1 and 80),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLAIMED', 'WAITING_HUMAN', 'DONE', 'CANCELLED')),
  created_by_member_id text not null check (char_length(created_by_member_id) between 1 and 80),
  assigned_agent_member_id text not null check (char_length(assigned_agent_member_id) between 1 and 80),
  claim_id uuid,
  claim_page_session_id uuid,
  claim_caller text check (claim_caller is null or claim_caller in ('BROWSER_AGENT', 'AUTO_RUNNER')),
  claim_expires_at timestamptz,
  result_summary text check (result_summary is null or char_length(btrim(result_summary)) between 1 and 600),
  result_link text check (result_link is null or (char_length(result_link) between 1 and 240 and result_link like '/%')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, created_by_member_id)
    references public.ratiflow_members(workspace_id, member_id),
  foreign key (workspace_id, assigned_agent_member_id)
    references public.ratiflow_members(workspace_id, member_id),
  check (
    (status = 'CLAIMED' and claim_id is not null and claim_page_session_id is not null
      and claim_caller is not null and claim_expires_at is not null)
    or
    (status <> 'CLAIMED' and claim_id is null and claim_page_session_id is null
      and claim_caller is null and claim_expires_at is null)
  )
);

create table public.ratiflow_agent_comments (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  id uuid not null default extensions.gen_random_uuid(),
  target_kind text not null check (target_kind in ('DECISION', 'OPTION', 'FOLLOWUP')),
  target_id text not null check (char_length(target_id) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 1200),
  reply_to uuid,
  actor_member_id text not null check (char_length(actor_member_id) between 1 and 80),
  via text not null check (via in ('BROWSER_AGENT', 'AUTO_PICKUP')),
  task_id uuid,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, reply_to) references public.ratiflow_agent_comments(workspace_id, id),
  foreign key (workspace_id, task_id) references public.ratiflow_agent_tasks(workspace_id, id),
  foreign key (workspace_id, actor_member_id)
    references public.ratiflow_members(workspace_id, member_id)
);

create table public.ratiflow_human_input_requests (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  id uuid not null default extensions.gen_random_uuid(),
  target_kind text not null check (target_kind in ('DECISION', 'OPTION', 'FOLLOWUP')),
  target_id text not null check (char_length(target_id) between 1 and 80),
  question text not null check (char_length(btrim(question)) between 1 and 600),
  status text not null default 'OPEN' check (status in ('OPEN', 'ANSWERED')),
  asked_by_member_id text not null check (char_length(asked_by_member_id) between 1 and 80),
  asked_via text not null check (asked_via in ('BROWSER_AGENT', 'AUTO_PICKUP')),
  task_id uuid,
  answer text check (answer is null or char_length(btrim(answer)) between 1 and 600),
  answered_by_member_id text check (answered_by_member_id is null or char_length(answered_by_member_id) between 1 and 80),
  asked_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, task_id) references public.ratiflow_agent_tasks(workspace_id, id),
  foreign key (workspace_id, asked_by_member_id)
    references public.ratiflow_members(workspace_id, member_id),
  foreign key (workspace_id, answered_by_member_id)
    references public.ratiflow_members(workspace_id, member_id),
  check (
    (status = 'OPEN' and answer is null and answered_by_member_id is null and answered_at is null)
    or
    (status = 'ANSWERED' and answer is not null and answered_by_member_id is not null and answered_at is not null)
  )
);

create table public.ratiflow_auto_action_windows (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  hour_bucket timestamptz not null,
  action_count integer not null default 0 check (action_count between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, hour_bucket)
);

create index ratiflow_activity_workspace_cursor_idx
  on public.ratiflow_activity (workspace_id, cursor);
create index ratiflow_activity_workspace_created_idx
  on public.ratiflow_activity (workspace_id, created_at desc, sequence desc);
create index ratiflow_agent_sessions_live_idx
  on public.ratiflow_agent_page_sessions (workspace_id, caller, lease_expires_at desc)
  where revoked_at is null;
create index ratiflow_agent_tasks_inbox_idx
  on public.ratiflow_agent_tasks (workspace_id, status, created_at, id);
create index ratiflow_agent_tasks_claim_idx
  on public.ratiflow_agent_tasks (workspace_id, claim_id)
  where claim_id is not null;
create index ratiflow_agent_comments_target_idx
  on public.ratiflow_agent_comments (workspace_id, target_kind, target_id, created_at);
create index ratiflow_human_input_target_idx
  on public.ratiflow_human_input_requests (workspace_id, target_kind, target_id, asked_at);

alter table public.ratiflow_activity_sequences enable row level security;
alter table public.ratiflow_activity enable row level security;
alter table public.ratiflow_agent_page_sessions enable row level security;
alter table public.ratiflow_agent_status enable row level security;
alter table public.ratiflow_standing_instructions enable row level security;
alter table public.ratiflow_agent_tasks enable row level security;
alter table public.ratiflow_agent_comments enable row level security;
alter table public.ratiflow_human_input_requests enable row level security;
alter table public.ratiflow_auto_action_windows enable row level security;

revoke all on public.ratiflow_activity_sequences from public, anon, authenticated;
revoke all on public.ratiflow_activity from public, anon, authenticated;
revoke all on public.ratiflow_agent_page_sessions from public, anon, authenticated;
revoke all on public.ratiflow_agent_status from public, anon, authenticated;
revoke all on public.ratiflow_standing_instructions from public, anon, authenticated;
revoke all on public.ratiflow_agent_tasks from public, anon, authenticated;
revoke all on public.ratiflow_agent_comments from public, anon, authenticated;
revoke all on public.ratiflow_human_input_requests from public, anon, authenticated;
revoke all on public.ratiflow_auto_action_windows from public, anon, authenticated;

create or replace function ratiflow_private.ratiflow_activity_cursor(p_workspace_id text)
returns uuid
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select a.cursor
  from public.ratiflow_activity a
  where a.workspace_id = p_workspace_id
  order by a.sequence desc
  limit 1
$$;

create or replace function ratiflow_private.ratiflow_append_activity(
  p_workspace_id text,
  p_actor_member_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_type text,
  p_via text,
  p_event_type text,
  p_target jsonb,
  p_summary text,
  p_workspace_revision integer default null,
  p_task_id uuid default null,
  p_question_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  v_sequence bigint;
  v_cursor uuid := extensions.gen_random_uuid();
begin
  insert into public.ratiflow_activity_sequences(workspace_id, last_sequence)
  values (p_workspace_id, 0)
  on conflict (workspace_id) do nothing;

  update public.ratiflow_activity_sequences
  set last_sequence = last_sequence + 1
  where workspace_id = p_workspace_id
  returning last_sequence into v_sequence;

  insert into public.ratiflow_activity(
    workspace_id, sequence, id, cursor, actor_member_id, actor_name, actor_role,
    actor_type, via, event_type, target_kind, target_id, summary,
    workspace_revision, task_id, question_id, created_at
  ) values (
    p_workspace_id, v_sequence, extensions.gen_random_uuid(), v_cursor,
    p_actor_member_id, p_actor_name, p_actor_role, p_actor_type, p_via,
    p_event_type, p_target->>'kind', p_target->>'id', btrim(p_summary),
    p_workspace_revision, p_task_id, p_question_id, now()
  );

  if p_actor_type = 'AGENT' then
    insert into public.ratiflow_agent_status(
      workspace_id, agent_member_id, last_seen_at, explicitly_away
    ) values (p_workspace_id, p_actor_member_id, now(), false)
    on conflict (workspace_id) do update
      set agent_member_id = excluded.agent_member_id,
          last_seen_at = excluded.last_seen_at,
          explicitly_away = false;
  end if;

  return v_cursor;
end
$$;

create or replace function ratiflow_private.ratiflow_valid_target(
  p_workspace_id text,
  p_target jsonb
)
returns boolean
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select
    p_target is not null
    and jsonb_typeof(p_target) = 'object'
    and ratiflow_private.ratiflow_exact_keys(p_target, array['kind', 'id'])
    and coalesce(char_length(p_target->>'id'), 0) between 1 and 80
    and (
      (p_target->>'kind' = 'DECISION' and exists (
        select 1 from public.ratiflow_workspaces w
        where w.id = p_workspace_id and w.decision_id = p_target->>'id'
      ))
      or
      (p_target->>'kind' = 'OPTION' and exists (
        select 1 from public.ratiflow_options o
        where o.workspace_id = p_workspace_id and o.id = p_target->>'id'
      ))
      or
      (p_target->>'kind' = 'FOLLOWUP' and exists (
        select 1 from public.ratiflow_followups f
        where f.workspace_id = p_workspace_id and f.id = p_target->>'id'
      ))
    )
$$;

create or replace function ratiflow_private.ratiflow_coordination_error(
  p_workspace_id text,
  p_code text,
  p_message text,
  p_retryable boolean,
  p_next_action text default null
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'ok', false,
    'code', p_code,
    'message', p_message,
    'retryable', p_retryable,
    'cursor', ratiflow_private.ratiflow_activity_cursor(p_workspace_id),
    'nextAction', p_next_action
  ))
$$;

create or replace function ratiflow_private.ratiflow_actor_view(
  p_workspace_id text,
  p_member_id text
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', m.member_id,
        'name', m.display_name,
        'role', case
          when m.actor_type = 'AGENT' then 'Decision analyst'
          when m.member_role = 'PRODUCT_LEAD' then 'Product Lead'
          else 'Engineering Lead'
        end
      )
      from public.ratiflow_members m
      where m.workspace_id = p_workspace_id and m.member_id = p_member_id
    ),
    jsonb_build_object('id', p_member_id, 'name', p_member_id, 'role', 'System')
  )
$$;

create or replace function ratiflow_private.ratiflow_activity_view(
  p_activity public.ratiflow_activity
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'id', p_activity.id::text,
    'cursor', p_activity.cursor::text,
    'createdAt', p_activity.created_at,
    'actor', jsonb_build_object(
      'id', p_activity.actor_member_id,
      'name', p_activity.actor_name,
      'role', p_activity.actor_role
    ),
    'actorType', p_activity.actor_type,
    'via', p_activity.via,
    'type', p_activity.event_type,
    'target', jsonb_build_object('kind', p_activity.target_kind, 'id', p_activity.target_id),
    'summary', p_activity.summary,
    'workspaceRevision', p_activity.workspace_revision
  ) || jsonb_strip_nulls(jsonb_build_object(
    'taskId', p_activity.task_id::text,
    'questionId', p_activity.question_id::text
  ))
$$;

create or replace function ratiflow_private.ratiflow_task_view(
  p_task public.ratiflow_agent_tasks,
  p_page_session_id uuid default null,
  p_caller text default null
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_task.id::text,
    'kind', p_task.kind,
    'body', p_task.body,
    'target', jsonb_build_object('kind', p_task.target_kind, 'id', p_task.target_id),
    'status', case
      when p_task.status = 'CLAIMED' and p_task.claim_expires_at <= now() then 'OPEN'
      else p_task.status
    end,
    'createdBy', ratiflow_private.ratiflow_actor_view(p_task.workspace_id, p_task.created_by_member_id),
    'assignedAgent', ratiflow_private.ratiflow_actor_view(p_task.workspace_id, p_task.assigned_agent_member_id),
    'claim', case
      when p_task.status <> 'CLAIMED' or p_task.claim_expires_at <= now() then null
      else jsonb_strip_nulls(jsonb_build_object(
        'claimId', case
          when p_task.claim_page_session_id = p_page_session_id and p_task.claim_caller = p_caller
            then p_task.claim_id::text
          else null
        end,
        'via', case when p_task.claim_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
        'expiresAt', p_task.claim_expires_at,
        'ownedByCurrentSession',
          p_task.claim_page_session_id = p_page_session_id and p_task.claim_caller = p_caller
      ))
    end,
    'resultSummary', p_task.result_summary,
    'resultLink', p_task.result_link,
    'createdAt', p_task.created_at,
    'updatedAt', p_task.updated_at
  ))
$$;

create or replace function ratiflow_private.ratiflow_comment_view(
  p_comment public.ratiflow_agent_comments
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_comment.id::text,
    'target', jsonb_build_object('kind', p_comment.target_kind, 'id', p_comment.target_id),
    'body', p_comment.body,
    'replyTo', p_comment.reply_to::text,
    'actor', ratiflow_private.ratiflow_actor_view(p_comment.workspace_id, p_comment.actor_member_id),
    'via', p_comment.via,
    'taskId', p_comment.task_id::text,
    'createdAt', p_comment.created_at
  ))
$$;

create or replace function ratiflow_private.ratiflow_question_view(
  p_question public.ratiflow_human_input_requests
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_question.id::text,
    'target', jsonb_build_object('kind', p_question.target_kind, 'id', p_question.target_id),
    'question', p_question.question,
    'status', p_question.status,
    'askedBy', ratiflow_private.ratiflow_actor_view(p_question.workspace_id, p_question.asked_by_member_id),
    'askedVia', p_question.asked_via,
    'taskId', p_question.task_id::text,
    'answer', p_question.answer,
    'answeredBy', case when p_question.answered_by_member_id is null then null
      else ratiflow_private.ratiflow_actor_view(p_question.workspace_id, p_question.answered_by_member_id) end,
    'askedAt', p_question.asked_at,
    'answeredAt', p_question.answered_at
  ))
$$;

create or replace function ratiflow_private.ratiflow_agent_presence_view(
  p_workspace_id text
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  with agent as (
    select m.*
    from public.ratiflow_members m
    where m.workspace_id = p_workspace_id and m.actor_type = 'AGENT'
    order by m.member_id
    limit 1
  ), presence as (
    select
      exists (
        select 1 from public.ratiflow_agent_page_sessions s
        where s.workspace_id = p_workspace_id
          and s.caller = 'BROWSER_AGENT'
          and s.engagement = 'LIVE'
          and s.revoked_at is null
          and s.lease_expires_at > now()
      ) as browser_live,
      exists (
        select 1 from public.ratiflow_agent_tasks t
        where t.workspace_id = p_workspace_id
          and t.status = 'CLAIMED'
          and t.claim_caller = 'AUTO_RUNNER'
          and t.claim_expires_at > now()
      ) as auto_live
  )
  select jsonb_build_object(
    'actor', ratiflow_private.ratiflow_actor_view(p_workspace_id, a.member_id),
    'state', case
      when p.browser_live then 'LIVE'
      when p.auto_live then 'LIVE_AUTO'
      when coalesce(s.explicitly_away, true) then 'AWAY'
      when s.last_seen_at > now() - interval '2 minutes' then 'IDLE'
      else 'AWAY'
    end,
    'lastSeenAt', s.last_seen_at,
    'activeVia', case
      when p.browser_live then 'BROWSER_AGENT'
      when p.auto_live then 'AUTO_PICKUP'
      else null
    end
  )
  from agent a
  cross join presence p
  left join public.ratiflow_agent_status s
    on s.workspace_id = p_workspace_id and s.agent_member_id = a.member_id
$$;

create or replace function ratiflow_private.ratiflow_standing_view(
  p_workspace_id text
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'autoPickup', i.auto_pickup,
    'scopes', to_jsonb(i.scopes),
    'maxActionsPerHour', i.max_actions_per_hour
  )
  from public.ratiflow_standing_instructions i
  where i.workspace_id = p_workspace_id
$$;

create or replace function ratiflow_private.ratiflow_inbox_view(
  p_workspace_id text,
  p_page_session_id uuid default null,
  p_caller text default null
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select coalesce(jsonb_agg(item.value order by item.priority, item.created_at, item.id), '[]'::jsonb)
  from (
    select
      ratiflow_private.ratiflow_task_view(t, p_page_session_id, p_caller) as value,
      case
        when t.status = 'OPEN' or (t.status = 'CLAIMED' and t.claim_expires_at <= now()) then 1
        when t.status = 'CLAIMED' then 2
        when t.status = 'WAITING_HUMAN' then 3
        when t.status = 'DONE' then 4
        else 5
      end as priority,
      t.created_at,
      t.id
    from public.ratiflow_agent_tasks t
    where t.workspace_id = p_workspace_id
    order by priority, t.created_at, t.id
    limit 50
  ) item
$$;

create or replace function ratiflow_private.ratiflow_questions_view(
  p_workspace_id text,
  p_target jsonb default null
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select coalesce(jsonb_agg(item.value order by item.asked_at, item.id), '[]'::jsonb)
  from (
    select ratiflow_private.ratiflow_question_view(q) as value, q.asked_at, q.id
    from public.ratiflow_human_input_requests q
    where q.workspace_id = p_workspace_id
      and (p_target is null or (q.target_kind = p_target->>'kind' and q.target_id = p_target->>'id'))
    order by q.asked_at, q.id
    limit 50
  ) item
$$;

create or replace function ratiflow_private.ratiflow_comments_view(
  p_workspace_id text,
  p_target jsonb default null
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select coalesce(jsonb_agg(item.value order by item.created_at, item.id), '[]'::jsonb)
  from (
    select ratiflow_private.ratiflow_comment_view(c) as value, c.created_at, c.id
    from public.ratiflow_agent_comments c
    where c.workspace_id = p_workspace_id
      and (p_target is null or (c.target_kind = p_target->>'kind' and c.target_id = p_target->>'id'))
    order by c.created_at desc, c.id desc
    limit 100
  ) item
$$;

create or replace function ratiflow_private.ratiflow_recent_activity_view(
  p_workspace_id text
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select coalesce(jsonb_agg(item.value order by item.sequence), '[]'::jsonb)
  from (
    select ratiflow_private.ratiflow_activity_view(a) as value, a.sequence
    from public.ratiflow_activity a
    where a.workspace_id = p_workspace_id
    order by a.sequence desc
    limit 50
  ) item
$$;

create or replace function ratiflow_private.ratiflow_collaboration_view(
  p_workspace_id text,
  p_page_session_id uuid default null,
  p_caller text default null
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'cursor', ratiflow_private.ratiflow_activity_cursor(p_workspace_id)::text,
    'agent', ratiflow_private.ratiflow_agent_presence_view(p_workspace_id),
    'standingInstructions', ratiflow_private.ratiflow_standing_view(p_workspace_id),
    'inbox', ratiflow_private.ratiflow_inbox_view(p_workspace_id, p_page_session_id, p_caller),
    'comments', ratiflow_private.ratiflow_comments_view(p_workspace_id),
    'questions', ratiflow_private.ratiflow_questions_view(p_workspace_id),
    'recentActivity', ratiflow_private.ratiflow_recent_activity_view(p_workspace_id)
  )
$$;

-- Replace the existing view builder so every inspect/mutation receipt contains the
-- frozen CollaborationView. Claim IDs remain hidden unless an agent-specific RPC uses
-- ratiflow_task_view with its bound page session.
create or replace function ratiflow_private.ratiflow_workspace_view(p_workspace_id text)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'id', case when w.id like 'ws_northstar_csv_launch_%' then 'ws_northstar_csv_launch' else w.id end,
    'name', w.name,
    'revision', w.revision,
    'decision', jsonb_build_object(
      'id', w.decision_id,
      'question', w.decision_question,
      'state', w.decision_state::text,
      'selectedOptionId', w.selected_option_id,
      'launchDate', w.launch_date::text,
      'launchCapacityEngineerDays', w.launch_capacity_engineer_days,
      'coreReliabilityEngineerDays', w.core_reliability_engineer_days
    ),
    'customer', jsonb_build_object(
      'id', w.customer_id,
      'name', w.customer_name,
      'annualRenewalUsd', w.customer_annual_renewal_usd,
      'usableExportDueDate', w.customer_usable_export_due_date::text
    ),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'title', o.title,
        'summary', o.summary,
        'launchDate', o.launch_date::text,
        'exportEngineerDays', o.export_engineer_days,
        'totalEngineerDays', o.total_engineer_days,
        'postLaunchEngineerDays', o.post_launch_engineer_days
      ) order by case o.id
        when 'opt_csv_ga_oct15' then 1
        when 'opt_csv_beta_oct15' then 2
        when 'opt_csv_defer_nov1' then 3
        else 4
      end)
      from public.ratiflow_options o where o.workspace_id = w.id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'optionId', e.option_id,
        'kind', e.kind::text,
        'stance', e.stance::text,
        'title', e.title,
        'detail', e.detail,
        'sourceLabel', e.source_label,
        'actor', coalesce(
          ratiflow_private.ratiflow_actor_view(w.id, e.actor_id),
          jsonb_build_object('id', e.actor_id, 'name', e.actor_id, 'role', 'System')
        ),
        'createdAt', e.created_at
      ) || case when e.metrics = '{}'::jsonb then '{}'::jsonb
        else jsonb_build_object('metrics', e.metrics) end order by e.id)
      from public.ratiflow_evidence e where e.workspace_id = w.id
    ), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'optionId', c.option_id,
        'summary', c.summary,
        'severity', c.severity,
        'resolved', c.resolved
      ) order by c.id)
      from public.ratiflow_challenges c where c.workspace_id = w.id
    ), '[]'::jsonb),
    'preparedDecision', (
      select jsonb_build_object(
        'id', p.id,
        'optionId', p.option_id,
        'recommendation', p.recommendation,
        'risks', p.risks,
        'customerMessageDraft', p.customer_message_draft,
        'reviewStatus', p.review_status::text,
        'preparedBy', ratiflow_private.ratiflow_actor_view(w.id, p.prepared_by_member_id)
      ) || case when p.ratified_by_member_id is null then '{}'::jsonb
        else jsonb_build_object(
          'ratifiedBy', ratiflow_private.ratiflow_actor_view(w.id, p.ratified_by_member_id)
        ) end
      from public.ratiflow_prepared_decisions p where p.workspace_id = w.id
    ),
    'followup', (
      select jsonb_build_object(
        'id', f.id,
        'slug', f.slug,
        'status', f.status,
        'ownerId', f.owner_member_id,
        'dueDate', f.due_date::text,
        'inheritedContext', f.inherited_context
      )
      from public.ratiflow_followups f where f.workspace_id = w.id
    ),
    'provenance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'actor', jsonb_build_object(
          'id', x.actor_member_id,
          'name', x.actor_name,
          'role', x.actor_role
        ),
        'actorType', x.actor_type::text,
        'origin', x.origin::text,
        'baseRevision', x.base_revision,
        'resultingRevision', x.resulting_revision,
        'rationale', x.rationale,
        'reviewStatus', x.review_status::text,
        'changedEntities', x.changed_entities,
        'createdAt', x.created_at
      ) || case when x.tool_name is null then '{}'::jsonb
        else jsonb_build_object('toolName', x.tool_name) end order by x.resulting_revision)
      from public.ratiflow_events x where x.workspace_id = w.id
    ), '[]'::jsonb),
    'readiness', ratiflow_private.ratiflow_readiness(w.id),
    'collaboration', ratiflow_private.ratiflow_collaboration_view(w.id)
  )
  from public.ratiflow_workspaces w
  where w.id = p_workspace_id
$$;

-- Bootstrap existing runs, then make future workspace creation self-initializing. The
-- bootstrap cursor is a real append-only event, so catch-up never needs a sentinel.
insert into public.ratiflow_activity_sequences(workspace_id, last_sequence)
select w.id, 0 from public.ratiflow_workspaces w
on conflict (workspace_id) do nothing;

insert into public.ratiflow_standing_instructions(
  workspace_id, auto_pickup, scopes, max_actions_per_hour, updated_at
)
select w.id, false, array['MENTIONS', 'TASKS']::text[], 6, now()
from public.ratiflow_workspaces w
on conflict (workspace_id) do nothing;

insert into public.ratiflow_agent_status(
  workspace_id, agent_member_id, last_seen_at, explicitly_away
)
select m.workspace_id, m.member_id, null, true
from public.ratiflow_members m
where m.actor_type = 'AGENT'
on conflict (workspace_id) do nothing;

do $$
declare w record;
begin
  for w in
    select x.id, x.decision_id, x.revision
    from public.ratiflow_workspaces x
    where not exists (
      select 1 from public.ratiflow_activity a where a.workspace_id = x.id
    )
  loop
    perform ratiflow_private.ratiflow_append_activity(
      w.id,
      'system_seed',
      'Seed fixture',
      'System',
      'SYSTEM',
      'SYSTEM',
      'WORKSPACE_MUTATED',
      jsonb_build_object('kind', 'DECISION', 'id', w.decision_id),
      'Workspace activity initialized.',
      w.revision
    );
  end loop;
end
$$;

create or replace function ratiflow_private.ratiflow_seed_collaboration()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
begin
  insert into public.ratiflow_activity_sequences(workspace_id, last_sequence)
  values (new.id, 0);
  insert into public.ratiflow_standing_instructions(
    workspace_id, auto_pickup, scopes, max_actions_per_hour, updated_at
  ) values (new.id, false, array['MENTIONS', 'TASKS']::text[], 6, now());
  perform ratiflow_private.ratiflow_append_activity(
    new.id,
    'system_seed',
    'Seed fixture',
    'System',
    'SYSTEM',
    'SYSTEM',
    'WORKSPACE_MUTATED',
    jsonb_build_object('kind', 'DECISION', 'id', new.decision_id),
    'Workspace activity initialized.',
    new.revision
  );
  return new;
end
$$;

drop trigger if exists ratiflow_seed_collaboration_after_workspace on public.ratiflow_workspaces;
create trigger ratiflow_seed_collaboration_after_workspace
after insert on public.ratiflow_workspaces
for each row execute function ratiflow_private.ratiflow_seed_collaboration();

create or replace function ratiflow_private.ratiflow_touch_agent_session(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_allow_create boolean default false
)
returns table (
  context_status text,
  workspace_id text,
  member_id text,
  display_name text,
  member_role public.ratiflow_member_role,
  actor_type public.ratiflow_actor_type,
  page_session_id uuid
)
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  m record;
  s public.ratiflow_agent_page_sessions%rowtype;
  v_page uuid;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found then
    return query select 'UNAUTHORIZED'::text, null::text, null::text, null::text,
      null::public.ratiflow_member_role, null::public.ratiflow_actor_type, null::uuid;
    return;
  end if;
  if m.actor_type <> 'AGENT' then
    return query select 'UNAUTHORIZED'::text, m.workspace_id, m.member_id, m.display_name,
      m.member_role, m.actor_type, null::uuid;
    return;
  end if;
  if p_caller not in ('BROWSER_AGENT', 'AUTO_RUNNER') then
    return query select 'INVALID_INPUT'::text, m.workspace_id, m.member_id, m.display_name,
      m.member_role, m.actor_type, null::uuid;
    return;
  end if;
  begin
    v_page := p_page_session_id::uuid;
  exception when others then
    return query select 'INVALID_INPUT'::text, m.workspace_id, m.member_id, m.display_name,
      m.member_role, m.actor_type, null::uuid;
    return;
  end;

  perform 1 from public.ratiflow_workspaces w where w.id = m.workspace_id for update;
  select * into s
  from public.ratiflow_agent_page_sessions x
  where x.workspace_id = m.workspace_id
    and x.page_session_id = v_page
    and x.caller = p_caller;

  if not found then
    if not p_allow_create then
      return query select 'SESSION_CLOSED'::text, m.workspace_id, m.member_id, m.display_name,
        m.member_role, m.actor_type, v_page;
      return;
    end if;
    insert into public.ratiflow_agent_page_sessions(
      workspace_id, agent_member_id, page_session_id, caller, engagement,
      lease_expires_at, last_seen_at, revoked_at, created_at
    ) values (
      m.workspace_id, m.member_id, v_page, p_caller, 'INVOKED',
      now() + interval '2 minutes', now(), null, now()
    );
  elsif s.revoked_at is not null then
    return query select 'SESSION_CLOSED'::text, m.workspace_id, m.member_id, m.display_name,
      m.member_role, m.actor_type, v_page;
    return;
  elsif s.engagement = 'LIVE' and s.lease_expires_at > now() then
    update public.ratiflow_agent_page_sessions x
    set lease_expires_at = now() + interval '45 seconds', last_seen_at = now()
    where x.workspace_id = m.workspace_id and x.page_session_id = v_page and x.caller = p_caller;
  else
    update public.ratiflow_agent_page_sessions x
    set engagement = 'INVOKED', lease_expires_at = now() + interval '2 minutes', last_seen_at = now()
    where x.workspace_id = m.workspace_id and x.page_session_id = v_page and x.caller = p_caller;
  end if;

  insert into public.ratiflow_agent_status(
    workspace_id, agent_member_id, last_seen_at, explicitly_away
  ) values (m.workspace_id, m.member_id, now(), false)
  on conflict (workspace_id) do update
    set agent_member_id = excluded.agent_member_id,
        last_seen_at = excluded.last_seen_at,
        explicitly_away = false;

  return query select 'OK'::text, m.workspace_id, m.member_id, m.display_name,
    m.member_role, m.actor_type, v_page;
end
$$;

create or replace function ratiflow_private.ratiflow_has_live_browser(
  p_workspace_id text
)
returns boolean
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select exists (
    select 1 from public.ratiflow_agent_page_sessions s
    where s.workspace_id = p_workspace_id
      and s.caller = 'BROWSER_AGENT'
      and s.engagement = 'LIVE'
      and s.revoked_at is null
      and s.lease_expires_at > now()
  )
$$;

create or replace function ratiflow_private.ratiflow_auto_remaining_actions(
  p_workspace_id text
)
returns integer
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select greatest(
    i.max_actions_per_hour - coalesce(w.action_count, 0),
    0
  )
  from public.ratiflow_standing_instructions i
  left join public.ratiflow_auto_action_windows w
    on w.workspace_id = i.workspace_id and w.hour_bucket = date_trunc('hour', now())
  where i.workspace_id = p_workspace_id
$$;

create or replace function ratiflow_private.ratiflow_consume_auto_action(
  p_workspace_id text
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select i.max_actions_per_hour into v_limit
  from public.ratiflow_standing_instructions i
  where i.workspace_id = p_workspace_id;

  insert into public.ratiflow_auto_action_windows(
    workspace_id, hour_bucket, action_count, updated_at
  ) values (p_workspace_id, date_trunc('hour', now()), 1, now())
  on conflict (workspace_id, hour_bucket) do update
    set action_count = public.ratiflow_auto_action_windows.action_count + 1,
        updated_at = now()
    where public.ratiflow_auto_action_windows.action_count < v_limit
  returning action_count into v_count;

  return v_count is not null and v_count <= v_limit;
end
$$;

create or replace function ratiflow_private.ratiflow_state_brief(
  p_workspace_id text,
  p_selection jsonb
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'decisionId', w.decision_id,
    'question', w.decision_question,
    'state', w.decision_state::text,
    'currentRecommendationOptionId', w.selected_option_id,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title) order by o.id)
      from public.ratiflow_options o where o.workspace_id = w.id
    ), '[]'::jsonb),
    'blockingChallenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'optionId', c.option_id, 'summary', c.summary
      ) order by c.id)
      from public.ratiflow_challenges c
      where c.workspace_id = w.id and c.severity = 'BLOCKING' and not c.resolved
    ), '[]'::jsonb),
    'openQuestions', coalesce((
      select jsonb_agg(ratiflow_private.ratiflow_question_view(q) order by q.asked_at, q.id)
      from public.ratiflow_human_input_requests q
      where q.workspace_id = w.id and q.status = 'OPEN'
    ), '[]'::jsonb),
    'participants', jsonb_build_array(ratiflow_private.ratiflow_agent_presence_view(w.id)),
    'selection', p_selection,
    'workspaceRevision', w.revision,
    'cursor', ratiflow_private.ratiflow_activity_cursor(w.id)::text
  )
  from public.ratiflow_workspaces w
  where w.id = p_workspace_id
$$;

create or replace function public.ratiflow_agent_join(
  p_handle text,
  p_page_session_id text,
  p_selection jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  m record;
  s public.ratiflow_agent_page_sessions%rowtype;
  v_page uuid;
  v_was_live boolean := false;
  v_cursor uuid;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found or m.actor_type <> 'AGENT' then
    return jsonb_build_object(
      'ok', false, 'code', 'UNAUTHORIZED',
      'message', 'A valid agent membership session is required.', 'retryable', false
    );
  end if;
  begin v_page := p_page_session_id::uuid;
  exception when others then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'The page session is invalid.', false
    );
  end;
  if not ratiflow_private.ratiflow_valid_target(m.workspace_id, p_selection) then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'The captured page selection is invalid.', false
    );
  end if;

  perform 1 from public.ratiflow_workspaces w where w.id = m.workspace_id for update;
  select * into s
  from public.ratiflow_agent_page_sessions x
  where x.workspace_id = m.workspace_id
    and x.page_session_id = v_page
    and x.caller = 'BROWSER_AGENT';
  if found and s.revoked_at is not null then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'SESSION_CLOSED', 'This page session has been closed.', false
    );
  end if;
  v_was_live := found and s.engagement = 'LIVE' and s.lease_expires_at > now();

  update public.ratiflow_agent_page_sessions
  set revoked_at = now(), lease_expires_at = now()
  where workspace_id = m.workspace_id
    and caller = 'BROWSER_AGENT'
    and page_session_id <> v_page
    and revoked_at is null;

  update public.ratiflow_agent_tasks
  set status = 'OPEN', claim_id = null, claim_page_session_id = null,
      claim_caller = null, claim_expires_at = null, updated_at = now()
  where workspace_id = m.workspace_id
    and status = 'CLAIMED'
    and (
      claim_caller = 'AUTO_RUNNER'
      or (claim_caller = 'BROWSER_AGENT' and claim_page_session_id <> v_page)
    );

  insert into public.ratiflow_agent_page_sessions(
    workspace_id, agent_member_id, page_session_id, caller, engagement,
    lease_expires_at, last_seen_at, revoked_at, created_at
  ) values (
    m.workspace_id, m.member_id, v_page, 'BROWSER_AGENT', 'LIVE',
    now() + interval '45 seconds', now(), null, now()
  ) on conflict (workspace_id, page_session_id, caller) do update
    set agent_member_id = excluded.agent_member_id,
        engagement = 'LIVE',
        lease_expires_at = excluded.lease_expires_at,
        last_seen_at = excluded.last_seen_at;

  insert into public.ratiflow_agent_status(
    workspace_id, agent_member_id, last_seen_at, explicitly_away
  ) values (m.workspace_id, m.member_id, now(), false)
  on conflict (workspace_id) do update
    set agent_member_id = excluded.agent_member_id,
        last_seen_at = excluded.last_seen_at,
        explicitly_away = false;

  if not v_was_live then
    v_cursor := ratiflow_private.ratiflow_append_activity(
      m.workspace_id, m.member_id, m.display_name, 'Decision analyst', 'AGENT',
      'BROWSER_AGENT', 'AGENT_JOINED', p_selection,
      'Ratiflow Agent joined the live decision session.'
    );
  else
    v_cursor := ratiflow_private.ratiflow_activity_cursor(m.workspace_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'identity', ratiflow_private.ratiflow_actor_view(m.workspace_id, m.member_id),
      'presence', ratiflow_private.ratiflow_agent_presence_view(m.workspace_id),
      'stateBrief', ratiflow_private.ratiflow_state_brief(m.workspace_id, p_selection),
      'inbox', ratiflow_private.ratiflow_inbox_view(m.workspace_id, v_page, 'BROWSER_AGENT'),
      'sessionOpen', true
    ),
    'cursor', v_cursor::text
  );
end
$$;

create or replace function public.ratiflow_agent_catch_up(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_since_cursor text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  c record;
  v_since uuid;
  v_since_sequence bigint;
  v_high_sequence bigint;
  v_high_cursor uuid;
  v_boundary_sequence bigint;
  v_boundary_cursor uuid;
  v_events jsonb;
begin
  select * into c
  from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, true
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id,
      c.context_status,
      case c.context_status
        when 'UNAUTHORIZED' then 'A valid agent membership session is required.'
        when 'SESSION_CLOSED' then 'This page session has been closed.'
        else 'The agent session context is invalid.'
      end,
      false
    );
  end if;

  select a.sequence, a.cursor into v_high_sequence, v_high_cursor
  from public.ratiflow_activity a
  where a.workspace_id = c.workspace_id
  order by a.sequence desc
  limit 1;

  if p_since_cursor is null then
    v_boundary_sequence := v_high_sequence;
    v_boundary_cursor := v_high_cursor;
    select coalesce(jsonb_agg(page.value order by page.sequence), '[]'::jsonb)
    into v_events
    from (
      select ratiflow_private.ratiflow_activity_view(a) as value, a.sequence
      from public.ratiflow_activity a
      where a.workspace_id = c.workspace_id
      order by a.sequence desc
      limit 20
    ) page;
  else
    begin v_since := p_since_cursor::uuid;
    exception when others then v_since := null;
    end;
    select a.sequence into v_since_sequence
    from public.ratiflow_activity a
    where a.workspace_id = c.workspace_id and a.cursor = v_since;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'code', 'CURSOR_EXPIRED',
        'message', 'The activity cursor is not available in this workspace.',
        'retryable', true,
        'resetCursor', v_high_cursor::text,
        'nextAction', 'Call catch_up without sinceCursor, then continue from the returned cursor.'
      );
    end if;

    select max(page.sequence) into v_boundary_sequence
    from (
      select a.sequence
      from public.ratiflow_activity a
      where a.workspace_id = c.workspace_id and a.sequence > v_since_sequence
      order by a.sequence
      limit 50
    ) page;
    if v_boundary_sequence is null then
      v_boundary_sequence := v_since_sequence;
    end if;
    select a.cursor into v_boundary_cursor
    from public.ratiflow_activity a
    where a.workspace_id = c.workspace_id and a.sequence = v_boundary_sequence;
    select coalesce(jsonb_agg(page.value order by page.sequence), '[]'::jsonb)
    into v_events
    from (
      select ratiflow_private.ratiflow_activity_view(a) as value, a.sequence
      from public.ratiflow_activity a
      where a.workspace_id = c.workspace_id
        and a.sequence > v_since_sequence
        and a.sequence <= v_boundary_sequence
      order by a.sequence
    ) page;
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'events', v_events,
      'inbox', ratiflow_private.ratiflow_inbox_view(c.workspace_id, c.page_session_id, p_caller),
      'questions', ratiflow_private.ratiflow_questions_view(c.workspace_id),
      'hasMore', v_boundary_sequence < v_high_sequence,
      'observedHighWater', v_high_cursor::text,
      'sessionOpen', true
    ),
    'cursor', v_boundary_cursor::text
  );
end
$$;

create or replace function public.ratiflow_agent_leave(
  p_handle text,
  p_page_session_id text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  m record;
  s public.ratiflow_agent_page_sessions%rowtype;
  w public.ratiflow_workspaces%rowtype;
  v_page uuid;
  v_cursor uuid;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found or m.actor_type <> 'AGENT' then
    return jsonb_build_object(
      'ok', false, 'code', 'UNAUTHORIZED',
      'message', 'A valid agent membership session is required.', 'retryable', false
    );
  end if;
  begin v_page := p_page_session_id::uuid;
  exception when others then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'The page session is invalid.', false
    );
  end;
  select * into w from public.ratiflow_workspaces where id = m.workspace_id for update;
  select * into s
  from public.ratiflow_agent_page_sessions x
  where x.workspace_id = m.workspace_id
    and x.page_session_id = v_page
    and x.caller = 'BROWSER_AGENT';
  if not found or s.revoked_at is not null then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'SESSION_CLOSED', 'This page session has already closed.', false
    );
  end if;

  update public.ratiflow_agent_page_sessions
  set revoked_at = now(), lease_expires_at = now(), last_seen_at = now()
  where workspace_id = m.workspace_id
    and page_session_id = v_page
    and caller = 'BROWSER_AGENT';
  update public.ratiflow_agent_tasks
  set status = 'OPEN', claim_id = null, claim_page_session_id = null,
      claim_caller = null, claim_expires_at = null, updated_at = now()
  where workspace_id = m.workspace_id
    and status = 'CLAIMED'
    and claim_page_session_id = v_page
    and claim_caller = 'BROWSER_AGENT';
  insert into public.ratiflow_agent_status(
    workspace_id, agent_member_id, last_seen_at, explicitly_away
  ) values (m.workspace_id, m.member_id, now(), true)
  on conflict (workspace_id) do update
    set agent_member_id = excluded.agent_member_id,
        last_seen_at = excluded.last_seen_at,
        explicitly_away = true;
  v_cursor := ratiflow_private.ratiflow_append_activity(
    m.workspace_id, m.member_id, m.display_name, 'Decision analyst', 'AGENT',
    'BROWSER_AGENT', 'AGENT_LEFT',
    jsonb_build_object('kind', 'DECISION', 'id', w.decision_id),
    'Ratiflow Agent left the live decision session.'
  );
  update public.ratiflow_agent_status
  set explicitly_away = true
  where workspace_id = m.workspace_id;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'identity', ratiflow_private.ratiflow_actor_view(m.workspace_id, m.member_id),
      'presence', ratiflow_private.ratiflow_agent_presence_view(m.workspace_id),
      'sessionOpen', false
    ),
    'cursor', v_cursor::text
  );
end
$$;

create or replace function public.ratiflow_agent_state_brief(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_selection jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare c record;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The agent session is not open.', false
    );
  end if;
  if not ratiflow_private.ratiflow_valid_target(c.workspace_id, p_selection) then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'The captured page selection is invalid.', false
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'brief', ratiflow_private.ratiflow_state_brief(c.workspace_id, p_selection)
    ),
    'cursor', ratiflow_private.ratiflow_activity_cursor(c.workspace_id)::text
  );
end
$$;

create or replace function public.ratiflow_agent_thread(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_target jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare c record;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The agent session is not open.', false
    );
  end if;
  if not ratiflow_private.ratiflow_valid_target(c.workspace_id, p_target) then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'The requested thread target is invalid.', false
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'target', p_target,
      'comments', ratiflow_private.ratiflow_comments_view(c.workspace_id, p_target),
      'questions', ratiflow_private.ratiflow_questions_view(c.workspace_id, p_target)
    ),
    'cursor', ratiflow_private.ratiflow_activity_cursor(c.workspace_id)::text
  );
end
$$;

create or replace function public.ratiflow_agent_inbox(
  p_handle text,
  p_page_session_id text,
  p_caller text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare c record;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The agent session is not open.', false
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'inbox', ratiflow_private.ratiflow_inbox_view(c.workspace_id, c.page_session_id, p_caller)
    ),
    'cursor', ratiflow_private.ratiflow_activity_cursor(c.workspace_id)::text
  );
end
$$;

create or replace function ratiflow_private.ratiflow_uuid_or_null(p_value text)
returns uuid
language plpgsql immutable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end
$$;

create or replace function ratiflow_private.ratiflow_coordination_replay(
  p_workspace_id text,
  p_request_id uuid,
  p_fingerprint text
)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare existing public.ratiflow_request_ledger%rowtype;
begin
  select * into existing
  from public.ratiflow_request_ledger l
  where l.workspace_id = p_workspace_id and l.request_id = p_request_id;
  if not found then return null; end if;
  if existing.fingerprint = p_fingerprint then return existing.result; end if;
  return ratiflow_private.ratiflow_coordination_error(
    p_workspace_id,
    'REQUEST_REPLAY_MISMATCH',
    'This request ID was already used with different content.',
    false
  );
end
$$;

create or replace function ratiflow_private.ratiflow_store_coordination_result(
  p_workspace_id text,
  p_request_id uuid,
  p_fingerprint text,
  p_result jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
begin
  insert into public.ratiflow_request_ledger(
    workspace_id, request_id, fingerprint, result, created_at
  ) values (p_workspace_id, p_request_id, p_fingerprint, p_result, now());
  return p_result;
end
$$;

create or replace function public.ratiflow_agent_authorize_auto(
  p_handle text,
  p_page_session_id text,
  p_task_id text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  c record;
  t public.ratiflow_agent_tasks%rowtype;
  i public.ratiflow_standing_instructions%rowtype;
  v_task uuid;
  v_remaining integer;
  v_reason text;
  v_authorized boolean := true;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, 'AUTO_RUNNER', true
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The auto-runner session is not available.', false
    );
  end if;
  v_task := ratiflow_private.ratiflow_uuid_or_null(p_task_id);
  if v_task is null then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'The task ID is invalid.', false
    );
  end if;
  select * into t from public.ratiflow_agent_tasks x
  where x.workspace_id = c.workspace_id and x.id = v_task;
  if not found then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'NOT_FOUND', 'The requested agent task does not exist.', false
    );
  end if;
  select * into i from public.ratiflow_standing_instructions x
  where x.workspace_id = c.workspace_id;
  v_remaining := ratiflow_private.ratiflow_auto_remaining_actions(c.workspace_id);
  if not i.auto_pickup then
    v_authorized := false; v_reason := 'DISABLED';
  elsif (t.kind = 'MENTION' and not ('MENTIONS' = any(i.scopes)))
    or (t.kind = 'TASK' and not ('TASKS' = any(i.scopes))) then
    v_authorized := false; v_reason := 'OUT_OF_SCOPE';
  elsif ratiflow_private.ratiflow_has_live_browser(c.workspace_id) then
    v_authorized := false; v_reason := 'LIVE_SESSION_ACTIVE';
  elsif v_remaining <= 0 then
    v_authorized := false; v_reason := 'ACTION_BUDGET_EXCEEDED';
  end if;
  return jsonb_build_object(
    'ok', true,
    'data', jsonb_strip_nulls(jsonb_build_object(
      'authorized', v_authorized,
      'reason', v_reason,
      'remainingActions', v_remaining,
      'standingInstructions', ratiflow_private.ratiflow_standing_view(c.workspace_id)
    )),
    'cursor', ratiflow_private.ratiflow_activity_cursor(c.workspace_id)::text
  );
end
$$;

create or replace function public.ratiflow_agent_claim_task(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_claim_id text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  c record;
  t public.ratiflow_agent_tasks%rowtype;
  i public.ratiflow_standing_instructions%rowtype;
  v_task uuid;
  v_request uuid;
  v_context_claim uuid;
  v_new_claim uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The agent session is not open.', false
    );
  end if;
  if not ratiflow_private.ratiflow_exact_keys(p_input, array['taskId', 'requestId'])
    or not (p_input ?& array['taskId', 'requestId'])
    or jsonb_typeof(p_input->'taskId') <> 'string'
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'Task claim input is invalid.', false
    );
  end if;
  v_task := ratiflow_private.ratiflow_uuid_or_null(p_input->>'taskId');
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  v_context_claim := ratiflow_private.ratiflow_uuid_or_null(p_claim_id);
  if v_task is null or v_request is null or (p_claim_id is not null and v_context_claim is null) then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'Task claim input is invalid.', false
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'CLAIM_AGENT_TASK',
    'input', p_input,
    'pageSessionId', c.page_session_id,
    'caller', p_caller,
    'claimId', v_context_claim
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    c.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;

  select * into t from public.ratiflow_agent_tasks x
  where x.workspace_id = c.workspace_id and x.id = v_task
  for update;
  if not found then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'NOT_FOUND', 'The requested agent task does not exist.', false
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  if t.status = 'CLAIMED' and t.claim_expires_at <= now() then
    update public.ratiflow_agent_tasks x
    set status = 'OPEN', claim_id = null, claim_page_session_id = null,
        claim_caller = null, claim_expires_at = null, updated_at = now()
    where x.workspace_id = c.workspace_id and x.id = t.id;
    t.status := 'OPEN';
    t.claim_id := null;
    t.claim_page_session_id := null;
    t.claim_caller := null;
    t.claim_expires_at := null;
  end if;
  if t.status = 'CLAIMED' then
    if t.claim_page_session_id = c.page_session_id
      and t.claim_caller = p_caller
      and t.claim_id = v_context_claim then
      update public.ratiflow_agent_tasks x
      set claim_expires_at = now() + interval '90 seconds', updated_at = now()
      where x.workspace_id = c.workspace_id and x.id = t.id
      returning * into t;
      v_result := jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
          'task', ratiflow_private.ratiflow_task_view(t, c.page_session_id, p_caller)
        ),
        'cursor', ratiflow_private.ratiflow_activity_cursor(c.workspace_id)::text
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'TASK_ALREADY_CLAIMED',
      'Another agent session already owns this task claim.', true
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  if t.status <> 'OPEN' then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'CONFLICT', 'Only an open task can be claimed.', false
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;

  if p_caller = 'AUTO_RUNNER' then
    if ratiflow_private.ratiflow_has_live_browser(c.workspace_id) then
      v_result := ratiflow_private.ratiflow_coordination_error(
        c.workspace_id, 'LIVE_SESSION_ACTIVE',
        'A live browser agent session currently owns agent work.', true
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
    select * into i from public.ratiflow_standing_instructions x
    where x.workspace_id = c.workspace_id;
    if not i.auto_pickup
      or (t.kind = 'MENTION' and not ('MENTIONS' = any(i.scopes)))
      or (t.kind = 'TASK' and not ('TASKS' = any(i.scopes))) then
      v_result := ratiflow_private.ratiflow_coordination_error(
        c.workspace_id, 'UNAUTHORIZED',
        'Standing instructions do not authorize auto pickup for this task.', false
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
    if not ratiflow_private.ratiflow_consume_auto_action(c.workspace_id) then
      v_result := ratiflow_private.ratiflow_coordination_error(
        c.workspace_id, 'ACTION_BUDGET_EXCEEDED',
        'The hourly auto-runner action budget is exhausted.', true
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
  end if;

  v_new_claim := extensions.gen_random_uuid();
  update public.ratiflow_agent_tasks x
  set status = 'CLAIMED',
      claim_id = v_new_claim,
      claim_page_session_id = c.page_session_id,
      claim_caller = p_caller,
      claim_expires_at = now() + interval '90 seconds',
      updated_at = now()
  where x.workspace_id = c.workspace_id and x.id = t.id
  returning * into t;
  v_cursor := ratiflow_private.ratiflow_append_activity(
    c.workspace_id, c.member_id, c.display_name, 'Decision analyst', 'AGENT',
    case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
    'TASK_CLAIMED',
    jsonb_build_object('kind', t.target_kind, 'id', t.target_id),
    'Ratiflow Agent claimed an inbox task.',
    null,
    t.id
  );
  v_result := jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'task', ratiflow_private.ratiflow_task_view(t, c.page_session_id, p_caller)
    ),
    'cursor', v_cursor::text
  );
  return ratiflow_private.ratiflow_store_coordination_result(
    c.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

create or replace function public.ratiflow_agent_resolve_task(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_claim_id text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  c record;
  t public.ratiflow_agent_tasks%rowtype;
  v_task uuid;
  v_request uuid;
  v_claim uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The agent session is not open.', false
    );
  end if;
  if not ratiflow_private.ratiflow_exact_keys(
      p_input, array['taskId', 'requestId', 'outcome', 'resultLink']
    )
    or not (p_input ?& array['taskId', 'requestId', 'outcome'])
    or jsonb_typeof(p_input->'taskId') <> 'string'
    or jsonb_typeof(p_input->'requestId') <> 'string'
    or jsonb_typeof(p_input->'outcome') <> 'string'
    or coalesce(char_length(btrim(p_input->>'outcome')), 0) not between 1 and 600
    or (
      p_input ? 'resultLink' and (
        jsonb_typeof(p_input->'resultLink') <> 'string'
        or char_length(p_input->>'resultLink') not between 1 and 240
        or p_input->>'resultLink' not like '/%'
        or p_input->>'resultLink' like '//%'
      )
    ) then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'Task resolution input is invalid.', false
    );
  end if;
  v_task := ratiflow_private.ratiflow_uuid_or_null(p_input->>'taskId');
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  v_claim := ratiflow_private.ratiflow_uuid_or_null(p_claim_id);
  if v_task is null or v_request is null or v_claim is null then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'A current task claim is required.', false
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'RESOLVE_AGENT_TASK', 'input', p_input,
    'pageSessionId', c.page_session_id, 'caller', p_caller, 'claimId', v_claim
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    c.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;
  select * into t from public.ratiflow_agent_tasks x
  where x.workspace_id = c.workspace_id and x.id = v_task
  for update;
  if not found then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'NOT_FOUND', 'The requested agent task does not exist.', false
    );
  elsif t.status <> 'CLAIMED' or t.claim_expires_at <= now()
    or t.claim_id <> v_claim or t.claim_page_session_id <> c.page_session_id
    or t.claim_caller <> p_caller then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'CLAIM_LOST', 'The task claim expired or was superseded.', true
    );
  elsif p_caller = 'AUTO_RUNNER' and not exists (
    select 1 from public.ratiflow_standing_instructions i
    where i.workspace_id = c.workspace_id and i.auto_pickup
      and ((t.kind = 'MENTION' and 'MENTIONS' = any(i.scopes))
        or (t.kind = 'TASK' and 'TASKS' = any(i.scopes)))
  ) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'UNAUTHORIZED',
      'Standing instructions no longer authorize this auto-runner task.', false
    );
  elsif p_caller = 'AUTO_RUNNER' and ratiflow_private.ratiflow_has_live_browser(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'LIVE_SESSION_ACTIVE',
      'A live browser agent session currently owns agent work.', true
    );
  elsif p_caller = 'AUTO_RUNNER'
    and not ratiflow_private.ratiflow_consume_auto_action(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'ACTION_BUDGET_EXCEEDED',
      'The hourly auto-runner action budget is exhausted.', true
    );
  else
    update public.ratiflow_agent_tasks x
    set status = 'DONE',
        claim_id = null,
        claim_page_session_id = null,
        claim_caller = null,
        claim_expires_at = null,
        result_summary = btrim(p_input->>'outcome'),
        result_link = case when p_input ? 'resultLink' then p_input->>'resultLink' else null end,
        updated_at = now()
    where x.workspace_id = c.workspace_id and x.id = t.id
    returning * into t;
    v_cursor := ratiflow_private.ratiflow_append_activity(
      c.workspace_id, c.member_id, c.display_name, 'Decision analyst', 'AGENT',
      case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
      'TASK_RESOLVED',
      jsonb_build_object('kind', t.target_kind, 'id', t.target_id),
      btrim(p_input->>'outcome'),
      null,
      t.id
    );
    v_result := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'task', ratiflow_private.ratiflow_task_view(t, c.page_session_id, p_caller)
      ),
      'cursor', v_cursor::text
    );
  end if;
  return ratiflow_private.ratiflow_store_coordination_result(
    c.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

create or replace function public.ratiflow_agent_post_comment(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_claim_id text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  c record;
  t public.ratiflow_agent_tasks%rowtype;
  comment_row public.ratiflow_agent_comments%rowtype;
  v_request uuid;
  v_claim uuid;
  v_task uuid;
  v_reply uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The agent session is not open.', false
    );
  end if;
  if not ratiflow_private.ratiflow_exact_keys(
      p_input, array['target', 'body', 'replyTo', 'taskId', 'requestId']
    )
    or not (p_input ?& array['target', 'body', 'requestId'])
    or not ratiflow_private.ratiflow_valid_target(c.workspace_id, p_input->'target')
    or jsonb_typeof(p_input->'body') <> 'string'
    or coalesce(char_length(btrim(p_input->>'body')), 0) not between 1 and 1200
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'Comment input is invalid.', false
    );
  end if;
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  v_task := case when p_input ? 'taskId'
    then ratiflow_private.ratiflow_uuid_or_null(p_input->>'taskId') else null end;
  v_reply := case when p_input ? 'replyTo'
    then ratiflow_private.ratiflow_uuid_or_null(p_input->>'replyTo') else null end;
  v_claim := ratiflow_private.ratiflow_uuid_or_null(p_claim_id);
  if v_request is null
    or (p_input ? 'taskId' and v_task is null)
    or (p_input ? 'replyTo' and v_reply is null)
    or (v_task is not null and v_claim is null)
    or (p_caller = 'AUTO_RUNNER' and v_task is null) then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'Comment input or task claim is invalid.', false
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'POST_AGENT_COMMENT', 'input', p_input,
    'pageSessionId', c.page_session_id, 'caller', p_caller, 'claimId', v_claim
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    c.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;

  if v_reply is not null and not exists (
    select 1 from public.ratiflow_agent_comments x
    where x.workspace_id = c.workspace_id and x.id = v_reply
  ) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'NOT_FOUND', 'The reply target does not exist.', false
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  if v_task is not null then
    select * into t from public.ratiflow_agent_tasks x
    where x.workspace_id = c.workspace_id and x.id = v_task
    for update;
    if not found then
      v_result := ratiflow_private.ratiflow_coordination_error(
        c.workspace_id, 'NOT_FOUND', 'The linked task does not exist.', false
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
    if t.status <> 'CLAIMED' or t.claim_expires_at <= now()
      or t.claim_id <> v_claim or t.claim_page_session_id <> c.page_session_id
      or t.claim_caller <> p_caller then
      v_result := ratiflow_private.ratiflow_coordination_error(
        c.workspace_id, 'CLAIM_LOST', 'The linked task claim expired or was superseded.', true
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
  end if;
  if p_caller = 'AUTO_RUNNER' and not exists (
    select 1 from public.ratiflow_standing_instructions i
    where i.workspace_id = c.workspace_id and i.auto_pickup
      and ((t.kind = 'MENTION' and 'MENTIONS' = any(i.scopes))
        or (t.kind = 'TASK' and 'TASKS' = any(i.scopes)))
  ) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'UNAUTHORIZED',
      'Standing instructions no longer authorize this auto-runner task.', false
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  if p_caller = 'AUTO_RUNNER' and ratiflow_private.ratiflow_has_live_browser(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'LIVE_SESSION_ACTIVE',
      'A live browser agent session currently owns agent work.', true
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  if p_caller = 'AUTO_RUNNER'
    and not ratiflow_private.ratiflow_consume_auto_action(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'ACTION_BUDGET_EXCEEDED',
      'The hourly auto-runner action budget is exhausted.', true
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;

  insert into public.ratiflow_agent_comments(
    workspace_id, target_kind, target_id, body, reply_to,
    actor_member_id, via, task_id, created_at
  ) values (
    c.workspace_id, p_input->'target'->>'kind', p_input->'target'->>'id',
    btrim(p_input->>'body'), v_reply, c.member_id,
    case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
    v_task, now()
  ) returning * into comment_row;
  v_cursor := ratiflow_private.ratiflow_append_activity(
    c.workspace_id, c.member_id, c.display_name, 'Decision analyst', 'AGENT',
    case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
    'AGENT_COMMENTED', p_input->'target', left(btrim(p_input->>'body'), 600),
    null, v_task
  );
  v_result := jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'comment', ratiflow_private.ratiflow_comment_view(comment_row)
    ),
    'cursor', v_cursor::text
  );
  return ratiflow_private.ratiflow_store_coordination_result(
    c.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

create or replace function public.ratiflow_agent_request_human_input(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_claim_id text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  c record;
  t public.ratiflow_agent_tasks%rowtype;
  question_row public.ratiflow_human_input_requests%rowtype;
  v_request uuid;
  v_claim uuid;
  v_task uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, c.context_status, 'The agent session is not open.', false
    );
  end if;
  if not ratiflow_private.ratiflow_exact_keys(
      p_input, array['question', 'target', 'taskId', 'requestId']
    )
    or not (p_input ?& array['question', 'target', 'requestId'])
    or not ratiflow_private.ratiflow_valid_target(c.workspace_id, p_input->'target')
    or jsonb_typeof(p_input->'question') <> 'string'
    or coalesce(char_length(btrim(p_input->>'question')), 0) not between 1 and 600
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'Human-input request is invalid.', false
    );
  end if;
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  v_task := case when p_input ? 'taskId'
    then ratiflow_private.ratiflow_uuid_or_null(p_input->>'taskId') else null end;
  v_claim := ratiflow_private.ratiflow_uuid_or_null(p_claim_id);
  if v_request is null
    or (p_input ? 'taskId' and v_task is null)
    or (v_task is not null and v_claim is null)
    or (p_caller = 'AUTO_RUNNER' and v_task is null) then
    return ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'INVALID_INPUT', 'Human-input request or task claim is invalid.', false
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'REQUEST_HUMAN_INPUT', 'input', p_input,
    'pageSessionId', c.page_session_id, 'caller', p_caller, 'claimId', v_claim
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    c.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;

  if v_task is not null then
    select * into t from public.ratiflow_agent_tasks x
    where x.workspace_id = c.workspace_id and x.id = v_task
    for update;
    if not found then
      v_result := ratiflow_private.ratiflow_coordination_error(
        c.workspace_id, 'NOT_FOUND', 'The linked task does not exist.', false
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
    if t.status <> 'CLAIMED' or t.claim_expires_at <= now()
      or t.claim_id <> v_claim or t.claim_page_session_id <> c.page_session_id
      or t.claim_caller <> p_caller then
      v_result := ratiflow_private.ratiflow_coordination_error(
        c.workspace_id, 'CLAIM_LOST', 'The linked task claim expired or was superseded.', true
      );
      return ratiflow_private.ratiflow_store_coordination_result(
        c.workspace_id, v_request, v_fingerprint, v_result
      );
    end if;
  end if;
  if p_caller = 'AUTO_RUNNER' and not exists (
    select 1 from public.ratiflow_standing_instructions i
    where i.workspace_id = c.workspace_id and i.auto_pickup
      and ((t.kind = 'MENTION' and 'MENTIONS' = any(i.scopes))
        or (t.kind = 'TASK' and 'TASKS' = any(i.scopes)))
  ) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'UNAUTHORIZED',
      'Standing instructions no longer authorize this auto-runner task.', false
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  if p_caller = 'AUTO_RUNNER' and ratiflow_private.ratiflow_has_live_browser(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'LIVE_SESSION_ACTIVE',
      'A live browser agent session currently owns agent work.', true
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  if p_caller = 'AUTO_RUNNER'
    and not ratiflow_private.ratiflow_consume_auto_action(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_coordination_error(
      c.workspace_id, 'ACTION_BUDGET_EXCEEDED',
      'The hourly auto-runner action budget is exhausted.', true
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      c.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;

  insert into public.ratiflow_human_input_requests(
    workspace_id, target_kind, target_id, question, status,
    asked_by_member_id, asked_via, task_id, asked_at
  ) values (
    c.workspace_id, p_input->'target'->>'kind', p_input->'target'->>'id',
    btrim(p_input->>'question'), 'OPEN', c.member_id,
    case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
    v_task, now()
  ) returning * into question_row;
  v_cursor := ratiflow_private.ratiflow_append_activity(
    c.workspace_id, c.member_id, c.display_name, 'Decision analyst', 'AGENT',
    case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
    'HUMAN_INPUT_REQUESTED', p_input->'target', btrim(p_input->>'question'),
    null, v_task, question_row.id
  );
  if v_task is not null then
    update public.ratiflow_agent_tasks x
    set status = 'WAITING_HUMAN', claim_id = null, claim_page_session_id = null,
        claim_caller = null, claim_expires_at = null, updated_at = now()
    where x.workspace_id = c.workspace_id and x.id = v_task
    returning * into t;
    v_cursor := ratiflow_private.ratiflow_append_activity(
      c.workspace_id, c.member_id, c.display_name, 'Decision analyst', 'AGENT',
      case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'BROWSER_AGENT' end,
      'TASK_WAITING_HUMAN', p_input->'target',
      'The task is waiting for a human answer.', null, v_task, question_row.id
    );
  end if;
  v_result := jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'question', ratiflow_private.ratiflow_question_view(question_row)
    ) || case when v_task is null then '{}'::jsonb
      else jsonb_build_object(
        'task', ratiflow_private.ratiflow_task_view(t, c.page_session_id, p_caller)
      ) end,
    'cursor', v_cursor::text
  );
  return ratiflow_private.ratiflow_store_coordination_result(
    c.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

create or replace function public.ratiflow_human_create_agent_task(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  m record;
  t public.ratiflow_agent_tasks%rowtype;
  v_agent text;
  v_request uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found or m.actor_type <> 'HUMAN' then
    return jsonb_build_object(
      'ok', false, 'code', 'UNAUTHORIZED',
      'message', 'A valid human membership session is required.', 'retryable', false
    );
  end if;
  perform 1 from public.ratiflow_workspaces w where w.id = m.workspace_id for update;
  if not ratiflow_private.ratiflow_exact_keys(
      p_input, array['kind', 'body', 'target', 'requestId']
    )
    or not (p_input ?& array['kind', 'body', 'target', 'requestId'])
    or p_input->>'kind' not in ('MENTION', 'TASK')
    or jsonb_typeof(p_input->'body') <> 'string'
    or coalesce(char_length(btrim(p_input->>'body')), 0) not between 1 and 1200
    or not ratiflow_private.ratiflow_valid_target(m.workspace_id, p_input->'target')
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Agent task input is invalid.', false
    );
  end if;
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  if v_request is null then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Agent task input is invalid.', false
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'CREATE_AGENT_TASK', 'input', p_input, 'memberId', m.member_id
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    m.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;
  select x.member_id into v_agent
  from public.ratiflow_members x
  where x.workspace_id = m.workspace_id and x.actor_type = 'AGENT'
  order by x.member_id
  limit 1;
  if v_agent is null then
    v_result := ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'NOT_FOUND', 'This workspace has no agent participant.', false
    );
    return ratiflow_private.ratiflow_store_coordination_result(
      m.workspace_id, v_request, v_fingerprint, v_result
    );
  end if;
  insert into public.ratiflow_agent_tasks(
    workspace_id, kind, body, target_kind, target_id, status,
    created_by_member_id, assigned_agent_member_id, created_at, updated_at
  ) values (
    m.workspace_id, p_input->>'kind', btrim(p_input->>'body'),
    p_input->'target'->>'kind', p_input->'target'->>'id', 'OPEN',
    m.member_id, v_agent, now(), now()
  ) returning * into t;
  v_cursor := ratiflow_private.ratiflow_append_activity(
    m.workspace_id, m.member_id, m.display_name,
    case when m.member_role = 'PRODUCT_LEAD' then 'Product Lead' else 'Engineering Lead' end,
    'HUMAN', 'ORDINARY_UI', 'TASK_CREATED', p_input->'target',
    btrim(p_input->>'body'), null, t.id
  );
  v_result := jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'task', ratiflow_private.ratiflow_task_view(t)
    ),
    'cursor', v_cursor::text
  );
  return ratiflow_private.ratiflow_store_coordination_result(
    m.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

create or replace function public.ratiflow_human_answer_agent_question(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  m record;
  q public.ratiflow_human_input_requests%rowtype;
  t public.ratiflow_agent_tasks%rowtype;
  v_question uuid;
  v_request uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found or m.actor_type <> 'HUMAN' then
    return jsonb_build_object(
      'ok', false, 'code', 'UNAUTHORIZED',
      'message', 'A valid human membership session is required.', 'retryable', false
    );
  end if;
  perform 1 from public.ratiflow_workspaces w where w.id = m.workspace_id for update;
  if not ratiflow_private.ratiflow_exact_keys(
      p_input, array['questionId', 'answer', 'requestId']
    )
    or not (p_input ?& array['questionId', 'answer', 'requestId'])
    or jsonb_typeof(p_input->'questionId') <> 'string'
    or jsonb_typeof(p_input->'answer') <> 'string'
    or coalesce(char_length(btrim(p_input->>'answer')), 0) not between 1 and 600
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Question answer input is invalid.', false
    );
  end if;
  v_question := ratiflow_private.ratiflow_uuid_or_null(p_input->>'questionId');
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  if v_question is null or v_request is null then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Question answer input is invalid.', false
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'ANSWER_AGENT_QUESTION', 'input', p_input, 'memberId', m.member_id
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    m.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;
  select * into q from public.ratiflow_human_input_requests x
  where x.workspace_id = m.workspace_id and x.id = v_question
  for update;
  if not found then
    v_result := ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'NOT_FOUND', 'The requested human-input question does not exist.', false
    );
  elsif q.status <> 'OPEN' then
    v_result := ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'CONFLICT', 'This human-input question is already answered.', false
    );
  else
    if q.task_id is not null then
      select * into t from public.ratiflow_agent_tasks x
      where x.workspace_id = m.workspace_id and x.id = q.task_id
      for update;
    end if;
    update public.ratiflow_human_input_requests x
    set status = 'ANSWERED', answer = btrim(p_input->>'answer'),
        answered_by_member_id = m.member_id, answered_at = now()
    where x.workspace_id = m.workspace_id and x.id = q.id
    returning * into q;
    if q.task_id is not null and t.status = 'WAITING_HUMAN' then
      update public.ratiflow_agent_tasks x
      set status = 'OPEN', updated_at = now()
      where x.workspace_id = m.workspace_id and x.id = t.id
      returning * into t;
    end if;
    v_cursor := ratiflow_private.ratiflow_append_activity(
      m.workspace_id, m.member_id, m.display_name,
      case when m.member_role = 'PRODUCT_LEAD' then 'Product Lead' else 'Engineering Lead' end,
      'HUMAN', 'ORDINARY_UI', 'HUMAN_INPUT_ANSWERED',
      jsonb_build_object('kind', q.target_kind, 'id', q.target_id),
      btrim(p_input->>'answer'), null, q.task_id, q.id
    );
    v_result := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'question', ratiflow_private.ratiflow_question_view(q)
      ) || case when q.task_id is null then '{}'::jsonb
        else jsonb_build_object('task', ratiflow_private.ratiflow_task_view(t)) end,
      'cursor', v_cursor::text
    );
  end if;
  return ratiflow_private.ratiflow_store_coordination_result(
    m.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

create or replace function public.ratiflow_human_cancel_agent_task(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  m record;
  t public.ratiflow_agent_tasks%rowtype;
  v_task uuid;
  v_request uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found or m.actor_type <> 'HUMAN' then
    return jsonb_build_object(
      'ok', false, 'code', 'UNAUTHORIZED',
      'message', 'A valid human membership session is required.', 'retryable', false
    );
  end if;
  perform 1 from public.ratiflow_workspaces w where w.id = m.workspace_id for update;
  if not ratiflow_private.ratiflow_exact_keys(p_input, array['taskId', 'requestId'])
    or not (p_input ?& array['taskId', 'requestId'])
    or jsonb_typeof(p_input->'taskId') <> 'string'
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Task cancellation input is invalid.', false
    );
  end if;
  v_task := ratiflow_private.ratiflow_uuid_or_null(p_input->>'taskId');
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  if v_task is null or v_request is null then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Task cancellation input is invalid.', false
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'CANCEL_AGENT_TASK', 'input', p_input, 'memberId', m.member_id
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    m.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;
  select * into t from public.ratiflow_agent_tasks x
  where x.workspace_id = m.workspace_id and x.id = v_task
  for update;
  if not found then
    v_result := ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'NOT_FOUND', 'The requested agent task does not exist.', false
    );
  elsif t.status in ('DONE', 'CANCELLED') then
    v_result := ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'CONFLICT', 'This task is already terminal.', false
    );
  else
    update public.ratiflow_agent_tasks x
    set status = 'CANCELLED', claim_id = null, claim_page_session_id = null,
        claim_caller = null, claim_expires_at = null, updated_at = now()
    where x.workspace_id = m.workspace_id and x.id = t.id
    returning * into t;
    v_cursor := ratiflow_private.ratiflow_append_activity(
      m.workspace_id, m.member_id, m.display_name,
      case when m.member_role = 'PRODUCT_LEAD' then 'Product Lead' else 'Engineering Lead' end,
      'HUMAN', 'ORDINARY_UI', 'TASK_CANCELLED',
      jsonb_build_object('kind', t.target_kind, 'id', t.target_id),
      'A human cancelled the agent task.', null, t.id
    );
    v_result := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('task', ratiflow_private.ratiflow_task_view(t)),
      'cursor', v_cursor::text
    );
  end if;
  return ratiflow_private.ratiflow_store_coordination_result(
    m.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

create or replace function public.ratiflow_human_update_standing(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  m record;
  w public.ratiflow_workspaces%rowtype;
  v_request uuid;
  v_scopes text[];
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_cursor uuid;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found or m.actor_type <> 'HUMAN' then
    return jsonb_build_object(
      'ok', false, 'code', 'UNAUTHORIZED',
      'message', 'A valid human membership session is required.', 'retryable', false
    );
  end if;
  select * into w from public.ratiflow_workspaces x
  where x.id = m.workspace_id for update;
  if not ratiflow_private.ratiflow_exact_keys(
      p_input, array['autoPickup', 'scopes', 'maxActionsPerHour', 'requestId']
    )
    or not (p_input ?& array['autoPickup', 'scopes', 'maxActionsPerHour', 'requestId'])
    or jsonb_typeof(p_input->'autoPickup') <> 'boolean'
    or jsonb_typeof(p_input->'scopes') <> 'array'
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Standing instructions are invalid.', false
    );
  end if;
  if jsonb_array_length(p_input->'scopes') not between 1 and 2
    or exists (
      select 1 from jsonb_array_elements(p_input->'scopes') item
      where jsonb_typeof(item) <> 'string' or item #>> '{}' not in ('MENTIONS', 'TASKS')
    )
    or (
      select count(distinct item #>> '{}')
      from jsonb_array_elements(p_input->'scopes') item
    ) <> jsonb_array_length(p_input->'scopes')
    or not ratiflow_private.ratiflow_valid_nonnegative_integer(
      p_input->'maxActionsPerHour', 20
    ) then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Standing instructions are invalid.', false
    );
  end if;
  if (p_input->>'maxActionsPerHour')::integer < 1 then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Standing instructions are invalid.', false
    );
  end if;
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_input->>'requestId');
  if v_request is null then
    return ratiflow_private.ratiflow_coordination_error(
      m.workspace_id, 'INVALID_INPUT', 'Standing instructions are invalid.', false
    );
  end if;
  select array_agg(item #>> '{}' order by ordinality)
  into v_scopes
  from jsonb_array_elements(p_input->'scopes') with ordinality valueset(item, ordinality);
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'UPDATE_STANDING_INSTRUCTIONS', 'input', p_input, 'memberId', m.member_id
  )::text, 'sha256'), 'hex');
  v_replay := ratiflow_private.ratiflow_coordination_replay(
    m.workspace_id, v_request, v_fingerprint
  );
  if v_replay is not null then return v_replay; end if;
  update public.ratiflow_standing_instructions x
  set auto_pickup = (p_input->>'autoPickup')::boolean,
      scopes = v_scopes,
      max_actions_per_hour = (p_input->>'maxActionsPerHour')::integer,
      updated_at = now()
  where x.workspace_id = m.workspace_id;
  v_cursor := ratiflow_private.ratiflow_append_activity(
    m.workspace_id, m.member_id, m.display_name,
    case when m.member_role = 'PRODUCT_LEAD' then 'Product Lead' else 'Engineering Lead' end,
    'HUMAN', 'ORDINARY_UI', 'STANDING_INSTRUCTIONS_CHANGED',
    jsonb_build_object('kind', 'DECISION', 'id', w.decision_id),
    'A human updated the agent standing instructions.'
  );
  v_result := jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'standingInstructions', ratiflow_private.ratiflow_standing_view(m.workspace_id)
    ),
    'cursor', v_cursor::text
  );
  return ratiflow_private.ratiflow_store_coordination_result(
    m.workspace_id, v_request, v_fingerprint, v_result
  );
end
$$;

-- Every accepted decision mutation now appends its collaboration activity in the same
-- transaction as provenance, workspace revision, and the invalidation notice. The
-- agent wrapper sets transaction-local caller/task metadata; ordinary human callers
-- continue to use the explicit origin supplied by their existing RPC.
create or replace function ratiflow_private.ratiflow_commit(
  p_workspace_id text,
  p_member record,
  p_origin public.ratiflow_event_origin,
  p_tool text,
  p_rationale text,
  p_review public.ratiflow_review_status,
  p_changed jsonb,
  p_changes jsonb,
  p_selection jsonb,
  p_epoch integer
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  w public.ratiflow_workspaces%rowtype;
  v_resulting integer;
  v_event text;
  v_workspace jsonb;
  v_origin text;
  v_via text;
  v_task uuid;
begin
  select * into w from public.ratiflow_workspaces x
  where x.id = p_workspace_id for update;
  v_resulting := w.revision + 1;
  v_origin := nullif(current_setting('ratiflow.execution_origin', true), '');
  if v_origin is null or v_origin not in ('WEBMCP', 'AUTO_PICKUP') then
    v_origin := p_origin::text;
  end if;
  v_via := case v_origin
    when 'WEBMCP' then 'BROWSER_AGENT'
    when 'AUTO_PICKUP' then 'AUTO_PICKUP'
    when 'ORDINARY_UI' then 'ORDINARY_UI'
    else 'SYSTEM'
  end;
  v_task := ratiflow_private.ratiflow_uuid_or_null(
    nullif(current_setting('ratiflow.task_id', true), '')
  );
  v_event := case
    when v_origin = 'ORDINARY_UI'
      and p_member.member_id = 'usr_jordan_lee'
      and v_resulting = 8 then 'evt_0008_capacity_reduced'
    else format('evt_%s_%s', lpad(v_resulting::text, 4, '0'), coalesce(p_tool, 'ui'))
  end;
  update public.ratiflow_workspaces x
  set revision = v_resulting, updated_at = now()
  where x.id = p_workspace_id;
  insert into public.ratiflow_events(
    workspace_id, id, actor_member_id, actor_name, actor_role, actor_type,
    origin, tool_name, base_revision, resulting_revision, rationale,
    review_status, changed_entities, changes, created_at
  ) values (
    p_workspace_id,
    v_event,
    p_member.member_id,
    p_member.display_name,
    case
      when p_member.actor_type = 'AGENT' then 'Decision analyst'
      when p_member.member_role = 'PRODUCT_LEAD' then 'Product Lead'
      else 'Engineering Lead'
    end,
    p_member.actor_type,
    v_origin::public.ratiflow_event_origin,
    p_tool,
    w.revision,
    v_resulting,
    p_rationale,
    p_review,
    p_changed,
    p_changes,
    now()
  );
  insert into public.ratiflow_revision_notices(
    workspace_id, workspace_revision, event_id, created_at
  ) values (p_workspace_id, v_resulting, v_event, now());
  perform ratiflow_private.ratiflow_append_activity(
    p_workspace_id,
    p_member.member_id,
    p_member.display_name,
    case
      when p_member.actor_type = 'AGENT' then 'Decision analyst'
      when p_member.member_role = 'PRODUCT_LEAD' then 'Product Lead'
      else 'Engineering Lead'
    end,
    p_member.actor_type::text,
    v_via,
    'WORKSPACE_MUTATED',
    p_selection,
    p_rationale,
    v_resulting,
    v_task
  );
  v_workspace := ratiflow_private.ratiflow_workspace_view(p_workspace_id);
  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'eventId', v_event,
      'resultingRevision', v_resulting,
      'changedEntityIds', p_changed,
      'workspace', v_workspace
    ),
    'currentWorkspaceRevision', v_resulting,
    'contextEpoch', p_epoch,
    'currentCapabilities',
      ratiflow_private.ratiflow_capabilities(p_workspace_id, p_selection, p_epoch) - 'signature'
  );
end
$$;

create or replace function public.ratiflow_agent_mutate(
  p_handle text,
  p_page_session_id text,
  p_caller text,
  p_claim_id text,
  p_tool_name text,
  p_envelope jsonb,
  p_captured_selection jsonb,
  p_captured_context_epoch integer
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  c record;
  t public.ratiflow_agent_tasks%rowtype;
  w public.ratiflow_workspaces%rowtype;
  v_existing public.ratiflow_request_ledger%rowtype;
  v_claim uuid;
  v_request uuid;
  v_internal_request uuid := extensions.gen_random_uuid();
  v_fingerprint text;
  v_result jsonb;
  v_internal_envelope jsonb;
begin
  select * into c from ratiflow_private.ratiflow_touch_agent_session(
    p_handle, p_page_session_id, p_caller, false
  );
  if c.context_status <> 'OK' then
    return ratiflow_private.ratiflow_unauthorized(
      p_captured_selection, p_captured_context_epoch
    );
  end if;
  select * into w from public.ratiflow_workspaces x
  where x.id = c.workspace_id for update;
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object'
    or not (p_envelope ? 'requestId')
    or jsonb_typeof(p_envelope->'requestId') <> 'string' then
    return ratiflow_private.ratiflow_error(
      w.id, 'INVALID_INPUT', 'Mutation envelope is invalid.', false,
      p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0)
    );
  end if;
  v_request := ratiflow_private.ratiflow_uuid_or_null(p_envelope->>'requestId');
  v_claim := ratiflow_private.ratiflow_uuid_or_null(p_claim_id);
  if v_request is null or (p_claim_id is not null and v_claim is null) then
    return ratiflow_private.ratiflow_error(
      w.id, 'INVALID_INPUT', 'Mutation envelope or task claim is invalid.', false,
      p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0)
    );
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'AGENT_DECISION_MUTATION',
    'toolName', p_tool_name,
    'envelope', p_envelope,
    'selection', p_captured_selection,
    'contextEpoch', p_captured_context_epoch,
    'pageSessionId', c.page_session_id,
    'caller', p_caller,
    'claimId', v_claim
  )::text, 'sha256'), 'hex');
  select * into v_existing from public.ratiflow_request_ledger l
  where l.workspace_id = c.workspace_id and l.request_id = v_request;
  if found then
    if v_existing.fingerprint = v_fingerprint then return v_existing.result; end if;
    return ratiflow_private.ratiflow_error(
      w.id, 'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.', false,
      p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0)
    );
  end if;

  if p_caller = 'AUTO_RUNNER' and v_claim is null then
    v_result := ratiflow_private.ratiflow_error(
      w.id, 'CONFLICT', 'AUTO_RUNNER decision writes require a current task claim.', true,
      p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0),
      jsonb_build_object('nextAction', 'Claim the addressed task before retrying.')
    );
  elsif v_claim is not null then
    select * into t from public.ratiflow_agent_tasks x
    where x.workspace_id = c.workspace_id and x.claim_id = v_claim
    for update;
    if not found or t.status <> 'CLAIMED' or t.claim_expires_at <= now()
      or t.claim_page_session_id <> c.page_session_id or t.claim_caller <> p_caller then
      v_result := ratiflow_private.ratiflow_error(
        w.id, 'CONFLICT', 'The task claim expired or was superseded.', true,
        p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0),
        jsonb_build_object('nextAction', 'Catch up and acquire a fresh task claim.')
      );
    end if;
  end if;
  if v_result is null and p_caller = 'AUTO_RUNNER'
    and not exists (
      select 1 from public.ratiflow_standing_instructions i
      where i.workspace_id = c.workspace_id and i.auto_pickup
        and ((t.kind = 'MENTION' and 'MENTIONS' = any(i.scopes))
          or (t.kind = 'TASK' and 'TASKS' = any(i.scopes)))
    ) then
    v_result := ratiflow_private.ratiflow_error(
      w.id, 'UNAUTHORIZED',
      'Standing instructions no longer authorize this auto-runner task.', false,
      p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0)
    );
  end if;
  if v_result is null and p_caller = 'AUTO_RUNNER'
    and ratiflow_private.ratiflow_has_live_browser(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_error(
      w.id, 'CONFLICT', 'A live browser agent session currently owns agent work.', true,
      p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0),
      jsonb_build_object('nextAction', 'Wait for the browser live lease to end.')
    );
  end if;
  if v_result is null and p_caller = 'AUTO_RUNNER'
    and not ratiflow_private.ratiflow_consume_auto_action(c.workspace_id) then
    v_result := ratiflow_private.ratiflow_error(
      w.id, 'CONFLICT', 'The hourly auto-runner action budget is exhausted.', true,
      p_captured_selection, greatest(coalesce(p_captured_context_epoch, 0), 0),
      jsonb_build_object('nextAction', 'Wait for the next action-budget window.')
    );
  end if;
  if v_result is null then
    perform set_config(
      'ratiflow.execution_origin',
      case when p_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP' else 'WEBMCP' end,
      true
    );
    perform set_config('ratiflow.task_id', coalesce(t.id::text, ''), true);
    v_internal_envelope := jsonb_set(
      p_envelope, '{requestId}', to_jsonb(v_internal_request::text), false
    );
    v_result := public.ratiflow_mutate_webmcp(
      p_handle,
      p_tool_name,
      v_internal_envelope,
      p_captured_selection,
      p_captured_context_epoch
    );
  end if;
  insert into public.ratiflow_request_ledger(
    workspace_id, request_id, fingerprint, result, created_at
  ) values (c.workspace_id, v_request, v_fingerprint, v_result, now());
  return v_result;
end
$$;

drop function public.ratiflow_workspace_notice(text);
create function public.ratiflow_workspace_notice(p_handle text)
returns table (
  activity_cursor text,
  workspace_revision integer,
  event_id text
)
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select a.cursor::text, a.workspace_revision, a.id::text
  from ratiflow_private.ratiflow_member_for_handle(p_handle) m
  join public.ratiflow_activity a on a.workspace_id = m.workspace_id
  order by a.sequence desc
  limit 1
$$;

-- New tables are RPC-only and every new helper is private. Revoke the legacy direct
-- agent mutation grant: the session-aware wrapper is now the sole remote entry point.
revoke all on all functions in schema ratiflow_private from public, anon, authenticated;
revoke all on function public.ratiflow_mutate_webmcp(text, text, jsonb, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_join(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_catch_up(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_leave(text, text)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_state_brief(text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_thread(text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_inbox(text, text, text)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_claim_task(text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_resolve_task(text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_post_comment(text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_request_human_input(text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_authorize_auto(text, text, text)
  from public, anon, authenticated;
revoke all on function public.ratiflow_human_create_agent_task(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_human_answer_agent_question(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_human_cancel_agent_task(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_human_update_standing(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_agent_mutate(
  text, text, text, text, text, jsonb, jsonb, integer
) from public, anon, authenticated;
revoke all on function public.ratiflow_workspace_notice(text)
  from public, anon, authenticated;

grant execute on function public.ratiflow_agent_join(text, text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_catch_up(text, text, text, text)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_leave(text, text)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_state_brief(text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_thread(text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_inbox(text, text, text)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_claim_task(text, text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_resolve_task(text, text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_post_comment(text, text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_request_human_input(text, text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_authorize_auto(text, text, text)
  to anon, authenticated;
grant execute on function public.ratiflow_human_create_agent_task(text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_human_answer_agent_question(text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_human_cancel_agent_task(text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_human_update_standing(text, jsonb)
  to anon, authenticated;
grant execute on function public.ratiflow_agent_mutate(
  text, text, text, text, text, jsonb, jsonb, integer
) to anon, authenticated;
grant execute on function public.ratiflow_workspace_notice(text)
  to anon, authenticated;
