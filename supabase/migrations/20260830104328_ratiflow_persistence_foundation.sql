-- Ratiflow's authoritative state is append-only at the event boundary. Direct
-- Data API access is intentionally denied: application RPCs derive membership from an
-- opaque, high-entropy demo handle and assign actor/origin on the server.
create schema if not exists ratiflow_private;
create extension if not exists pgcrypto with schema extensions;

create type public.ratiflow_decision_state as enum ('OPTIONS', 'CONTESTED', 'READY', 'REVIEW', 'COMMITTED');
create type public.ratiflow_member_role as enum ('PRODUCT_LEAD', 'ENGINEERING_LEAD');
create type public.ratiflow_actor_type as enum ('HUMAN', 'AGENT', 'SYSTEM');
create type public.ratiflow_event_origin as enum ('ORDINARY_UI', 'WEBMCP', 'SYNTHETIC_DEMO', 'SYSTEM');
create type public.ratiflow_review_status as enum ('NOT_APPLICABLE', 'PROPOSED', 'EDITED', 'RATIFIED', 'REJECTED');
create type public.ratiflow_evidence_kind as enum ('CUSTOMER_DEADLINE', 'ENGINEERING_ESTIMATE', 'DELIVERY_RISK');
create type public.ratiflow_evidence_stance as enum ('SUPPORTS', 'CHALLENGES', 'CONTEXT');

create table public.ratiflow_workspaces (
  id text primary key check (char_length(id) between 1 and 80),
  name text not null check (char_length(name) between 1 and 160),
  revision integer not null default 0 check (revision >= 0),
  decision_id text not null check (char_length(decision_id) between 1 and 80),
  decision_question text not null check (char_length(decision_question) between 1 and 600),
  decision_state public.ratiflow_decision_state not null,
  selected_option_id text not null check (char_length(selected_option_id) between 1 and 80),
  launch_date date not null,
  launch_capacity_engineer_days integer not null check (launch_capacity_engineer_days between 0 and 90),
  core_reliability_engineer_days integer not null check (core_reliability_engineer_days between 0 and 90),
  customer_id text not null check (char_length(customer_id) between 1 and 80),
  customer_name text not null check (char_length(customer_name) between 1 and 160),
  customer_annual_renewal_usd integer not null check (customer_annual_renewal_usd between 0 and 10000000),
  customer_usable_export_due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ratiflow_members (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  member_id text not null check (char_length(member_id) between 1 and 80),
  display_name text not null check (char_length(display_name) between 1 and 120),
  member_role public.ratiflow_member_role not null,
  actor_type public.ratiflow_actor_type not null,
  primary key (workspace_id, member_id)
);

create table public.ratiflow_options (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  title text not null check (char_length(title) between 1 and 160),
  summary text not null check (char_length(summary) between 1 and 1200),
  launch_date date not null,
  export_engineer_days integer not null check (export_engineer_days between 0 and 90),
  total_engineer_days integer not null check (total_engineer_days between 0 and 90),
  post_launch_engineer_days integer not null check (post_launch_engineer_days between 0 and 90),
  primary key (workspace_id, id)
);

create table public.ratiflow_evidence (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  option_id text check (option_id is null or char_length(option_id) between 1 and 80),
  kind public.ratiflow_evidence_kind not null,
  stance public.ratiflow_evidence_stance not null,
  title text not null check (char_length(title) between 1 and 120),
  detail text not null check (char_length(detail) between 1 and 1200),
  source_label text not null check (char_length(source_label) between 1 and 120),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  actor_id text not null check (char_length(actor_id) between 1 and 80),
  created_at timestamptz not null default now(),
  created_revision integer not null check (created_revision >= 0),
  primary key (workspace_id, id),
  foreign key (workspace_id, option_id) references public.ratiflow_options(workspace_id, id)
);

create table public.ratiflow_challenges (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  option_id text not null check (char_length(option_id) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 600),
  severity text not null check (severity in ('BLOCKING', 'ADVISORY')),
  required_evidence_kind public.ratiflow_evidence_kind,
  resolved boolean not null default false,
  primary key (workspace_id, id),
  foreign key (workspace_id, option_id) references public.ratiflow_options(workspace_id, id)
);

create table public.ratiflow_prepared_decisions (
  workspace_id text primary key references public.ratiflow_workspaces(id) on delete cascade,
  id text not null unique check (char_length(id) between 1 and 80),
  option_id text not null check (char_length(option_id) between 1 and 80),
  recommendation text not null check (char_length(recommendation) between 1 and 600),
  risks jsonb not null default '[]'::jsonb check (jsonb_typeof(risks) = 'array' and jsonb_array_length(risks) <= 5),
  customer_message_draft text not null check (char_length(customer_message_draft) between 1 and 800),
  review_status public.ratiflow_review_status not null,
  prepared_by_member_id text not null check (char_length(prepared_by_member_id) between 1 and 80),
  ratified_by_member_id text check (ratified_by_member_id is null or char_length(ratified_by_member_id) between 1 and 80),
  created_revision integer not null check (created_revision >= 0),
  foreign key (workspace_id, option_id) references public.ratiflow_options(workspace_id, id)
);

create table public.ratiflow_followups (
  workspace_id text primary key references public.ratiflow_workspaces(id) on delete cascade,
  id text not null unique check (char_length(id) between 1 and 80),
  slug text not null check (slug = 'customer-launch-brief'),
  status text not null check (status in ('BLOCKED', 'READY')),
  owner_member_id text not null check (char_length(owner_member_id) between 1 and 80),
  due_date date not null,
  inherited_context jsonb not null default '[]'::jsonb check (jsonb_typeof(inherited_context) = 'array')
);

create table public.ratiflow_events (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  actor_member_id text not null check (char_length(actor_member_id) between 1 and 80),
  actor_name text not null check (char_length(actor_name) between 1 and 120),
  actor_role text not null check (char_length(actor_role) between 1 and 120),
  actor_type public.ratiflow_actor_type not null,
  origin public.ratiflow_event_origin not null,
  tool_name text check (tool_name is null or tool_name in ('inspect_decision', 'inspect_selected_option', 'recommend_option', 'challenge_option', 'add_evidence', 'compare_options', 'prepare_decision', 'trace_decision', 'inspect_followup', 'why_not')),
  base_revision integer not null check (base_revision >= 0),
  resulting_revision integer not null check (resulting_revision = base_revision + 1),
  rationale text not null check (char_length(btrim(rationale)) between 1 and 600),
  review_status public.ratiflow_review_status not null,
  changed_entities jsonb not null check (jsonb_typeof(changed_entities) = 'array'),
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, resulting_revision)
);

create table public.ratiflow_request_ledger (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  request_id uuid not null,
  fingerprint text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);

-- Server-authorized subscriptions receive only this invalidation notice, then refetch
-- the authoritative workspace. It deliberately is not exposed through the Data API:
-- opaque membership handles are not a Supabase Auth identity and therefore cannot be
-- safely expressed as a Postgres Changes RLS policy.
create table public.ratiflow_revision_notices (
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  workspace_revision integer not null check (workspace_revision >= 0),
  event_id text not null check (char_length(event_id) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (workspace_id, workspace_revision)
);

create table ratiflow_private.demo_sessions (
  handle_hash bytea primary key,
  workspace_id text not null references public.ratiflow_workspaces(id) on delete cascade,
  member_id text not null check (char_length(member_id) between 1 and 80),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index ratiflow_events_workspace_revision_idx on public.ratiflow_events (workspace_id, resulting_revision);
create index ratiflow_revision_notices_workspace_idx on public.ratiflow_revision_notices (workspace_id, workspace_revision);
create index ratiflow_sessions_workspace_member_idx on ratiflow_private.demo_sessions (workspace_id, member_id);

alter table public.ratiflow_workspaces enable row level security;
alter table public.ratiflow_members enable row level security;
alter table public.ratiflow_options enable row level security;
alter table public.ratiflow_evidence enable row level security;
alter table public.ratiflow_challenges enable row level security;
alter table public.ratiflow_prepared_decisions enable row level security;
alter table public.ratiflow_followups enable row level security;
alter table public.ratiflow_events enable row level security;
alter table public.ratiflow_request_ledger enable row level security;
alter table public.ratiflow_revision_notices enable row level security;
alter table ratiflow_private.demo_sessions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema ratiflow_private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Security-definer RPCs are intentionally tiny. They authenticate the opaque handle
-- and expose only a revision notice; writes are performed by server routes/RPCs that
-- lock the workspace row, compare its revision, append one event, and insert this row
-- in the same transaction. No client supplies actor, role, workspace, or origin.
create function ratiflow_private.member_for_handle(p_handle text)
returns table (workspace_id text, member_id text)
language sql
security definer
set search_path = ratiflow_private, public, extensions, pg_temp
as $$
  select session.workspace_id, session.member_id
  from ratiflow_private.demo_sessions as session
  where session.handle_hash = extensions.digest(p_handle, 'sha256')
    and session.expires_at > now()
    and session.consumed_at is null
$$;

create function public.ratiflow_workspace_notice(p_handle text)
returns table (workspace_revision integer, event_id text)
language sql
security definer
set search_path = ratiflow_private, public, extensions, pg_temp
as $$
  select notice.workspace_revision, notice.event_id
  from ratiflow_private.member_for_handle(p_handle) as member
  join public.ratiflow_revision_notices as notice on notice.workspace_id = member.workspace_id
  order by notice.workspace_revision desc
  limit 1
$$;

revoke all on function ratiflow_private.member_for_handle(text) from public, anon, authenticated;
revoke all on function public.ratiflow_workspace_notice(text) from public;
grant execute on function public.ratiflow_workspace_notice(text) to anon, authenticated;

-- The Next.js `/api/workspace/realtime` bridge authorizes the opaque handle before it
-- opens an SSE stream. It emits only (workspaceRevision, eventId); clients refetch.
