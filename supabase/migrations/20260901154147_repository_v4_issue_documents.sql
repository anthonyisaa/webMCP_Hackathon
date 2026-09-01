-- Protocol-v4 issue documents. Protocol-v2/v3 objects remain intact; this migration
-- only widens shared constraints, adds the five checked v4 relations, and exposes the
-- narrow RPC catalog frozen in docs/contracts/repository-contract.md.

alter table public.ratiflow_documents
  drop constraint ratiflow_documents_protocol_version_check;

alter table public.ratiflow_documents
  add constraint ratiflow_documents_protocol_version_check
    check (protocol_version in (2, 3, 4)),
  add column issue_kind text,
  add constraint ratiflow_documents_issue_kind_check check (
    (protocol_version = 4 and issue_kind in ('POSTMORTEM', 'PRODUCT_DOCUMENT'))
    or (protocol_version <> 4 and issue_kind is null)
  );

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
      'SUBMIT_ISSUE_TASK_RESULT_V4', 'TOUCH_ISSUE_PRESENCE_V4'
    )
  );

create table public.ratiflow_issue_revisions_v4 (
  revision_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  revision bigint not null check (revision between 1 and 9007199254740991),
  parent_revision bigint check (parent_revision between 1 and 9007199254740991),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) <= 50000),
  content_digest text not null check (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  diffs jsonb not null check (jsonb_typeof(diffs) = 'array'),
  source_revision bigint not null check (source_revision between 0 and 9007199254740991),
  authority text not null check (authority in ('HUMAN', 'DIRECT', 'REVIEW', 'RESTORE')),
  origin text not null check (origin in ('ORDINARY_UI', 'WEBMCP')),
  author_origin text not null check (author_origin in ('ORDINARY_UI', 'WEBMCP')),
  task_id uuid,
  author_actor_type text not null check (author_actor_type in ('HUMAN', 'AGENT')),
  author_member_id uuid not null,
  author_display_name text not null check (char_length(btrim(author_display_name)) between 1 and 80),
  author_agent_label text check (author_agent_label is null or char_length(btrim(author_agent_label)) between 1 and 80),
  committer_actor_type text not null check (committer_actor_type in ('HUMAN', 'AGENT')),
  committer_member_id uuid not null,
  committer_display_name text not null check (char_length(btrim(committer_display_name)) between 1 and 80),
  committer_agent_label text check (committer_agent_label is null or char_length(btrim(committer_agent_label)) between 1 and 80),
  granted_by_member_id uuid,
  granted_by_display_name text,
  approved_by_member_id uuid,
  approved_by_display_name text,
  restored_revision bigint check (restored_revision between 1 and 9007199254740991),
  change_summary text not null check (char_length(btrim(change_summary)) between 1 and 240),
  evidence_refs text[] not null default '{}' check (cardinality(evidence_refs) <= 12),
  created_at timestamptz not null default clock_timestamp(),
  unique (document_id, revision),
  unique (document_id, revision_id),
  foreign key (document_id, author_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, committer_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, granted_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, approved_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  constraint ratiflow_issue_revision_parent_check check (
    (revision = 1 and parent_revision is null and source_revision = 0)
    or (revision > 1 and parent_revision = revision - 1 and source_revision >= 1)
  ),
  constraint ratiflow_issue_revision_actor_labels_check check (
    (author_actor_type = 'HUMAN' and author_agent_label is null
      or author_actor_type = 'AGENT' and author_agent_label is not null)
    and
    (committer_actor_type = 'HUMAN' and committer_agent_label is null
      or committer_actor_type = 'AGENT' and committer_agent_label is not null)
  ),
  constraint ratiflow_issue_revision_authority_check check (
    (authority = 'HUMAN' and origin = 'ORDINARY_UI' and author_origin = 'ORDINARY_UI'
      and task_id is null and author_actor_type = 'HUMAN'
      and committer_actor_type = 'HUMAN' and author_member_id = committer_member_id
      and granted_by_member_id is null and approved_by_member_id is null
      and restored_revision is null)
    or
    (authority = 'DIRECT' and origin = 'WEBMCP' and author_origin = 'WEBMCP'
      and task_id is not null and author_actor_type = 'AGENT'
      and committer_actor_type = 'AGENT' and author_member_id = committer_member_id
      and granted_by_member_id is not null and approved_by_member_id is null
      and restored_revision is null)
    or
    (authority = 'REVIEW' and origin = 'ORDINARY_UI' and author_origin = 'WEBMCP'
      and task_id is not null and author_actor_type = 'AGENT'
      and committer_actor_type = 'HUMAN' and granted_by_member_id is not null
      and approved_by_member_id = committer_member_id and restored_revision is null)
    or
    (authority = 'RESTORE' and origin = 'ORDINARY_UI' and author_origin = 'ORDINARY_UI'
      and task_id is null and author_actor_type = 'HUMAN'
      and committer_actor_type = 'HUMAN' and author_member_id = committer_member_id
      and granted_by_member_id is null and approved_by_member_id is null
      and restored_revision is not null)
  )
);

create table public.ratiflow_issue_tasks_v4 (
  task_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  task_key text not null check (char_length(btrim(task_key)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null check (category in ('DATA', 'LOGS', 'CODEBASE', 'RESEARCH', 'WRITING', 'GENERAL')),
  instruction text not null check (char_length(btrim(instruction)) between 1 and 1000),
  agent_label text not null check (char_length(btrim(agent_label)) between 1 and 80),
  mode text not null check (mode in ('COMMENT', 'REVIEW', 'DIRECT')),
  status text not null default 'OPEN' check (status in ('OPEN', 'PROPOSED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'STALE')),
  creator_member_id uuid not null,
  creator_display_name text not null check (char_length(btrim(creator_display_name)) between 1 and 80),
  assignee_member_id uuid not null,
  assignee_display_name text not null check (char_length(btrim(assignee_display_name)) between 1 and 80),
  thread_id uuid not null unique,
  creation_anchor jsonb not null check (jsonb_typeof(creation_anchor) = 'object'),
  anchor_scope text not null check (anchor_scope in ('DOCUMENT', 'SELECTION')),
  anchor_field text check (anchor_field is null or anchor_field in ('TITLE', 'BODY')),
  range_start bigint check (range_start between 0 and 9007199254740991),
  range_end bigint check (range_end between 0 and 9007199254740991),
  selected_text text check (selected_text is null or char_length(selected_text) between 1 and 50000),
  created_revision bigint not null check (created_revision between 1 and 9007199254740991),
  anchor_revision bigint not null check (anchor_revision between 1 and 9007199254740991),
  anchor_state text not null default 'ACTIVE' check (anchor_state in ('ACTIVE', 'STALE')),
  proposal_replacement_text text check (proposal_replacement_text is null or char_length(proposal_replacement_text) <= 50000),
  proposal_result_summary text check (proposal_result_summary is null or char_length(btrim(proposal_result_summary)) between 1 and 240),
  proposal_evidence_refs text[] check (proposal_evidence_refs is null or cardinality(proposal_evidence_refs) <= 12),
  proposal_source_revision bigint check (proposal_source_revision between 1 and 9007199254740991),
  proposal_live_anchor jsonb check (proposal_live_anchor is null or jsonb_typeof(proposal_live_anchor) = 'object'),
  proposed_at timestamptz,
  result_outcome text check (result_outcome is null or result_outcome in ('COMMENTED', 'COMMITTED')),
  result_summary text check (result_summary is null or char_length(btrim(result_summary)) between 1 and 240),
  result_evidence_refs text[] check (result_evidence_refs is null or cardinality(result_evidence_refs) <= 12),
  result_source_revision bigint check (result_source_revision between 1 and 9007199254740991),
  result_revision bigint check (result_revision between 1 and 9007199254740991),
  result_live_anchor jsonb check (result_live_anchor is null or jsonb_typeof(result_live_anchor) = 'object'),
  result_replacement_text text check (result_replacement_text is null or char_length(result_replacement_text) <= 50000),
  submitted_at timestamptz,
  decision_kind text check (decision_kind is null or decision_kind in ('ACCEPTED', 'REJECTED')),
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 240),
  decided_by_member_id uuid,
  decided_by_display_name text,
  decided_at timestamptz,
  decision_revision bigint check (decision_revision between 1 and 9007199254740991),
  decision_result_revision bigint check (decision_result_revision between 1 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique (document_id, task_id),
  unique (document_id, task_key),
  foreign key (document_id, creator_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, assignee_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, decided_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  constraint ratiflow_issue_task_anchor_check check (
    (anchor_scope = 'DOCUMENT' and anchor_field is null and range_start is null
      and range_end is null and selected_text is null and anchor_state = 'ACTIVE'
      and mode = 'COMMENT')
    or
    (anchor_scope = 'SELECTION' and anchor_field is not null and range_start is not null
      and range_end > range_start and selected_text is not null)
  ),
  constraint ratiflow_issue_task_resolution_check check (
    (status in ('OPEN', 'PROPOSED') and resolved_at is null)
    or (status in ('COMPLETED', 'REJECTED', 'CANCELLED', 'STALE') and resolved_at is not null)
  ),
  constraint ratiflow_issue_task_snapshot_check check (
    (creation_anchor->>'scope') is not distinct from anchor_scope
    and (creation_anchor->>'field') is not distinct from anchor_field
    and (creation_anchor->>'createdRevision')::bigint is not distinct from created_revision
    and (creation_anchor->>'anchorRevision')::bigint is not distinct from created_revision
    and (creation_anchor->>'anchorState') is not distinct from 'ACTIVE'
    and (
      (proposal_replacement_text is null and proposal_live_anchor is null)
      or (proposal_replacement_text is not null
        and (proposal_live_anchor->>'scope') is not distinct from 'SELECTION'
        and (proposal_live_anchor->>'field') is not distinct from anchor_field
        and (proposal_live_anchor->>'createdRevision')::bigint is not distinct from created_revision
        and (proposal_live_anchor->>'anchorState') is not distinct from 'ACTIVE')
    )
    and (
      (result_outcome is null and result_live_anchor is null
        and result_replacement_text is null)
      or (result_outcome = 'COMMENTED' and result_live_anchor is not null
        and (result_live_anchor->>'scope') is not distinct from anchor_scope
        and (result_live_anchor->>'field') is not distinct from anchor_field
        and (result_live_anchor->>'createdRevision')::bigint is not distinct from created_revision
        and (result_live_anchor->>'anchorState') is not distinct from 'ACTIVE'
        and result_replacement_text is null)
      or (result_outcome = 'COMMITTED'
        and (result_live_anchor->>'scope') is not distinct from 'SELECTION'
        and (result_live_anchor->>'field') is not distinct from anchor_field
        and (result_live_anchor->>'createdRevision')::bigint is not distinct from created_revision
        and (result_live_anchor->>'anchorState') is not distinct from 'ACTIVE'
        and result_replacement_text is not null)
    )
  ),
  constraint ratiflow_issue_task_payload_check check (
    (status = 'OPEN' and proposal_replacement_text is null and result_outcome is null and decision_kind is null)
    or (status = 'PROPOSED' and mode = 'REVIEW' and proposal_replacement_text is not null
      and proposal_result_summary is not null and proposal_evidence_refs is not null
      and proposal_source_revision is not null and proposed_at is not null
      and result_outcome is null and decision_kind is null)
    or (status = 'COMPLETED' and mode = 'COMMENT' and proposal_replacement_text is null
      and result_outcome = 'COMMENTED' and result_summary is not null
      and result_evidence_refs is not null and result_source_revision is not null
      and result_revision is not null and submitted_at is not null and decision_kind is null)
    or (status = 'COMPLETED' and mode = 'DIRECT' and proposal_replacement_text is null
      and result_outcome = 'COMMITTED' and result_summary is not null
      and result_evidence_refs is not null and result_source_revision is not null
      and result_revision is not null and submitted_at is not null and decision_kind is null)
    or (status = 'COMPLETED' and mode = 'REVIEW' and proposal_replacement_text is not null
      and result_outcome is null and decision_kind = 'ACCEPTED')
    or (status = 'REJECTED' and mode = 'REVIEW' and proposal_replacement_text is not null
      and result_outcome is null and decision_kind = 'REJECTED')
    or (status in ('CANCELLED', 'STALE') and result_outcome is null and decision_kind is null)
  )
);

create table public.ratiflow_issue_threads_v4 (
  thread_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  task_id uuid,
  creation_anchor jsonb not null check (jsonb_typeof(creation_anchor) = 'object'),
  anchor_scope text not null check (anchor_scope in ('DOCUMENT', 'SELECTION')),
  anchor_field text check (anchor_field is null or anchor_field in ('TITLE', 'BODY')),
  range_start bigint check (range_start between 0 and 9007199254740991),
  range_end bigint check (range_end between 0 and 9007199254740991),
  selected_text text check (selected_text is null or char_length(selected_text) between 1 and 50000),
  created_revision bigint not null check (created_revision between 1 and 9007199254740991),
  anchor_revision bigint not null check (anchor_revision between 1 and 9007199254740991),
  anchor_state text not null default 'ACTIVE' check (anchor_state in ('ACTIVE', 'STALE')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  created_by_member_id uuid not null,
  created_by_display_name text not null check (char_length(btrim(created_by_display_name)) between 1 and 80),
  created_at timestamptz not null default clock_timestamp(),
  resolved_by_member_id uuid,
  resolved_by_display_name text,
  resolved_at timestamptz,
  unique (document_id, thread_id),
  unique (document_id, task_id),
  foreign key (document_id, created_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, resolved_by_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  constraint ratiflow_issue_thread_anchor_check check (
    (anchor_scope = 'DOCUMENT' and anchor_field is null and range_start is null
      and range_end is null and selected_text is null and anchor_state = 'ACTIVE')
    or
    (anchor_scope = 'SELECTION' and anchor_field is not null and range_start is not null
      and range_end > range_start and selected_text is not null)
  ),
  constraint ratiflow_issue_thread_creation_anchor_check check (
    (creation_anchor->>'scope') is not distinct from anchor_scope
    and (creation_anchor->>'field') is not distinct from anchor_field
    and (creation_anchor->>'createdRevision')::bigint is not distinct from created_revision
    and (creation_anchor->>'anchorRevision')::bigint is not distinct from created_revision
    and (creation_anchor->>'anchorState') is not distinct from 'ACTIVE'
  ),
  constraint ratiflow_issue_thread_resolution_check check (
    (status = 'OPEN' and resolved_by_member_id is null and resolved_at is null)
    or (status = 'RESOLVED' and resolved_by_member_id is not null and resolved_at is not null)
  )
);

alter table public.ratiflow_issue_tasks_v4
  add constraint ratiflow_issue_tasks_thread_fk
  foreign key (document_id, thread_id)
  references public.ratiflow_issue_threads_v4(document_id, thread_id)
  deferrable initially deferred;

alter table public.ratiflow_issue_threads_v4
  add constraint ratiflow_issue_threads_task_fk
  foreign key (document_id, task_id)
  references public.ratiflow_issue_tasks_v4(document_id, task_id)
  deferrable initially deferred;

alter table public.ratiflow_issue_revisions_v4
  add constraint ratiflow_issue_revisions_task_fk
  foreign key (document_id, task_id)
  references public.ratiflow_issue_tasks_v4(document_id, task_id)
  deferrable initially deferred;

create table public.ratiflow_issue_comments_v4 (
  comment_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  thread_id uuid not null,
  reply_to_comment_id uuid,
  author_actor_type text not null check (author_actor_type in ('HUMAN', 'AGENT')),
  author_member_id uuid not null,
  author_display_name text not null check (char_length(btrim(author_display_name)) between 1 and 80),
  author_agent_label text check (author_agent_label is null or char_length(btrim(author_agent_label)) between 1 and 80),
  origin text not null check (origin in ('ORDINARY_UI', 'WEBMCP')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  evidence_refs text[] not null default '{}' check (cardinality(evidence_refs) <= 12),
  created_at timestamptz not null default clock_timestamp(),
  unique (document_id, comment_id),
  foreign key (document_id, thread_id)
    references public.ratiflow_issue_threads_v4(document_id, thread_id),
  foreign key (document_id, reply_to_comment_id)
    references public.ratiflow_issue_comments_v4(document_id, comment_id),
  foreign key (document_id, author_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  constraint ratiflow_issue_comment_actor_check check (
    (author_actor_type = 'HUMAN' and author_agent_label is null and origin = 'ORDINARY_UI')
    or (author_actor_type = 'AGENT' and author_agent_label is not null and origin = 'WEBMCP')
  )
);

create table public.ratiflow_issue_activity_v4 (
  activity_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  activity_version bigint not null check (activity_version between 1 and 9007199254740991),
  kind text not null check (kind in (
    'ISSUE_LAUNCHED', 'REVISION_SAVED', 'TASK_CREATED', 'THREAD_CREATED',
    'COMMENT_ADDED', 'THREAD_RESOLVED', 'TASK_CANCELLED', 'TASK_PROPOSED',
    'TASK_COMPLETED', 'TASK_REJECTED', 'REVISION_RESTORED'
  )),
  actor_type text not null check (actor_type in ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_member_id uuid,
  actor_display_name text not null check (char_length(btrim(actor_display_name)) between 1 and 80),
  origin text not null check (origin in ('ORDINARY_UI', 'WEBMCP', 'SYSTEM')),
  revision bigint not null check (revision between 1 and 9007199254740991),
  revision_id uuid,
  task_id uuid,
  thread_id uuid,
  comment_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique (document_id, activity_version),
  foreign key (document_id, actor_member_id)
    references public.ratiflow_document_members(document_id, member_id),
  foreign key (document_id, revision_id)
    references public.ratiflow_issue_revisions_v4(document_id, revision_id),
  foreign key (document_id, task_id)
    references public.ratiflow_issue_tasks_v4(document_id, task_id),
  foreign key (document_id, thread_id)
    references public.ratiflow_issue_threads_v4(document_id, thread_id),
  foreign key (document_id, comment_id)
    references public.ratiflow_issue_comments_v4(document_id, comment_id),
  constraint ratiflow_issue_activity_actor_check check (
    (actor_type = 'SYSTEM' and actor_member_id is null and origin = 'SYSTEM')
    or (actor_type = 'HUMAN' and actor_member_id is not null and origin = 'ORDINARY_UI')
    or (actor_type = 'AGENT' and actor_member_id is not null and origin = 'WEBMCP')
  )
);

create index ratiflow_issue_revisions_history_idx
  on public.ratiflow_issue_revisions_v4 (document_id, revision desc);
create index ratiflow_issue_tasks_active_idx
  on public.ratiflow_issue_tasks_v4 (document_id, updated_at desc, task_id)
  where status in ('OPEN', 'PROPOSED');
create index ratiflow_issue_tasks_assignee_idx
  on public.ratiflow_issue_tasks_v4 (document_id, assignee_member_id, status, updated_at desc, task_id);
create index ratiflow_issue_threads_standalone_idx
  on public.ratiflow_issue_threads_v4 (document_id, created_at desc, thread_id)
  where task_id is null;
create index ratiflow_issue_comments_thread_idx
  on public.ratiflow_issue_comments_v4 (document_id, thread_id, created_at, comment_id);
create index ratiflow_issue_activity_document_idx
  on public.ratiflow_issue_activity_v4 (document_id, activity_version desc);

alter table public.ratiflow_issue_revisions_v4 enable row level security;
alter table public.ratiflow_issue_tasks_v4 enable row level security;
alter table public.ratiflow_issue_threads_v4 enable row level security;
alter table public.ratiflow_issue_comments_v4 enable row level security;
alter table public.ratiflow_issue_activity_v4 enable row level security;

revoke all on public.ratiflow_issue_revisions_v4 from public, anon, authenticated;
revoke all on public.ratiflow_issue_tasks_v4 from public, anon, authenticated;
revoke all on public.ratiflow_issue_threads_v4 from public, anon, authenticated;
revoke all on public.ratiflow_issue_comments_v4 from public, anon, authenticated;
revoke all on public.ratiflow_issue_activity_v4 from public, anon, authenticated;

create or replace function ratiflow_document_private.trim_ecmascript_v4(p_value text)
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

create or replace function ratiflow_document_private.input_v4(
  p_value jsonb,
  p_required text[],
  p_optional text[] default '{}'
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select p_value is not null and jsonb_typeof(p_value) = 'object'
    and p_value ?& p_required
    and ratiflow_document_private.exact_keys(p_value, p_required || p_optional)
$$;

create or replace function ratiflow_document_private.counter_v4(
  p_value jsonb,
  p_minimum numeric default 0,
  p_maximum numeric default 9007199254740991
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'number' then false
    when (p_value #>> '{}') !~ '^(0|[1-9][0-9]*)$' then false
    else (p_value #>> '{}')::numeric between p_minimum and p_maximum
  end
$$;

create or replace function ratiflow_document_private.uuid_v4(p_value jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select p_value is not null and jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

create or replace function ratiflow_document_private.text_v4(
  p_value jsonb,
  p_maximum integer,
  p_allow_empty boolean default false
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'string' then false
    when p_maximum < 0 or char_length(p_value #>> '{}') > p_maximum then false
    when p_allow_empty then true
    else char_length(ratiflow_document_private.trim_ecmascript_v4(p_value #>> '{}')) >= 1
  end
$$;

create or replace function ratiflow_document_private.evidence_v4(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_entry jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array'
    or jsonb_array_length(p_value) > 12 then return false; end if;
  for v_entry in select value from jsonb_array_elements(p_value) loop
    if not ratiflow_document_private.text_v4(v_entry, 240, false) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function ratiflow_document_private.error_v4(
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

create or replace function ratiflow_document_private.invalid_v4(p_message text)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error_v4('INVALID_INPUT', p_message, false)
$$;

create or replace function ratiflow_document_private.unauthorized_v4(p_message text default 'A valid issue session is required.')
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error_v4('UNAUTHORIZED', p_message, false)
$$;

create or replace function ratiflow_document_private.member_for_handle_v4(p_handle text)
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
    and s.expires_at > clock_timestamp() and d.expires_at > clock_timestamp()
    and d.protocol_version = 4
$$;

create or replace function ratiflow_document_private.auth_failure_v4(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if exists (
    select 1
    from ratiflow_document_private.sessions s
    join public.ratiflow_documents d on d.id = s.document_id
    where p_handle is not null and char_length(p_handle) between 32 and 256
      and s.handle_hash = extensions.digest(p_handle, 'sha256')
      and s.expires_at > clock_timestamp() and d.expires_at > clock_timestamp()
      and d.protocol_version <> 4
  ) then
    return ratiflow_document_private.error_v4(
      'PROTOCOL_MISMATCH', 'This session belongs to another protocol version.', false
    );
  end if;
  return ratiflow_document_private.unauthorized_v4();
end;
$$;

create or replace function ratiflow_document_private.member_json_v4(
  p_member_id uuid,
  p_display_name text
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object('memberId', p_member_id, 'displayName', p_display_name)
$$;

create or replace function ratiflow_document_private.actor_json_v4(
  p_actor_type text,
  p_member_id uuid,
  p_member_display_name text,
  p_agent_label text default null
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'actorType', p_actor_type,
    'displayName', case when p_actor_type = 'AGENT' then p_agent_label else p_member_display_name end,
    'member', case when p_actor_type = 'SYSTEM' then null else
      ratiflow_document_private.member_json_v4(p_member_id, p_member_display_name) end,
    'agentLabel', case when p_actor_type = 'AGENT' then p_agent_label else null end
  )
$$;

create or replace function ratiflow_document_private.anchor_json_v4(
  p_scope text,
  p_field text,
  p_start bigint,
  p_end bigint,
  p_selected_text text,
  p_created_revision bigint,
  p_anchor_revision bigint,
  p_anchor_state text
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'scope', p_scope, 'field', p_field, 'rangeStart', p_start, 'rangeEnd', p_end,
    'selectedText', p_selected_text, 'createdRevision', p_created_revision,
    'anchorRevision', p_anchor_revision, 'anchorState', p_anchor_state
  )
$$;

create or replace function ratiflow_document_private.comment_json_v4(p_comment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'commentId', c.comment_id,
    'threadId', c.thread_id,
    'replyToCommentId', c.reply_to_comment_id,
    'author', ratiflow_document_private.actor_json_v4(
      c.author_actor_type, c.author_member_id, c.author_display_name, c.author_agent_label
    ),
    'origin', c.origin,
    'body', c.body,
    'evidenceRefs', to_jsonb(c.evidence_refs),
    'createdAt', c.created_at
  )
  from public.ratiflow_issue_comments_v4 c
  where c.comment_id = p_comment_id
$$;

create or replace function ratiflow_document_private.thread_json_v4(p_thread_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'threadId', t.thread_id,
    'taskId', t.task_id,
    'creationAnchor', t.creation_anchor,
    'anchor', ratiflow_document_private.anchor_json_v4(
      t.anchor_scope, t.anchor_field, t.range_start, t.range_end, t.selected_text,
      t.created_revision, t.anchor_revision, t.anchor_state
    ),
    'status', t.status,
    'createdBy', ratiflow_document_private.member_json_v4(
      t.created_by_member_id, t.created_by_display_name
    ),
    'createdAt', t.created_at,
    'resolvedBy', case when t.resolved_by_member_id is null then null else
      ratiflow_document_private.member_json_v4(t.resolved_by_member_id, t.resolved_by_display_name) end,
    'resolvedAt', t.resolved_at,
    'comments', coalesce((
      select jsonb_agg(ratiflow_document_private.comment_json_v4(c.comment_id)
        order by c.created_at, c.comment_id)
      from public.ratiflow_issue_comments_v4 c
      where c.document_id = t.document_id and c.thread_id = t.thread_id
    ), '[]'::jsonb)
  )
  from public.ratiflow_issue_threads_v4 t
  where t.thread_id = p_thread_id
$$;

create or replace function ratiflow_document_private.task_json_v4(p_task_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'taskId', t.task_id,
    'taskKey', t.task_key,
    'title', t.title,
    'category', t.category,
    'instruction', t.instruction,
    'agentLabel', t.agent_label,
    'mode', t.mode,
    'status', t.status,
    'creationAnchor', t.creation_anchor,
    'anchor', ratiflow_document_private.anchor_json_v4(
      t.anchor_scope, t.anchor_field, t.range_start, t.range_end, t.selected_text,
      t.created_revision, t.anchor_revision, t.anchor_state
    ),
    'creator', ratiflow_document_private.member_json_v4(
      t.creator_member_id, t.creator_display_name
    ),
    'assignee', ratiflow_document_private.member_json_v4(
      t.assignee_member_id, t.assignee_display_name
    ),
    'threadId', t.thread_id,
    'proposal', case when t.proposal_replacement_text is null then null else jsonb_build_object(
      'replacementText', t.proposal_replacement_text,
      'resultSummary', t.proposal_result_summary,
      'evidenceRefs', to_jsonb(t.proposal_evidence_refs),
      'sourceRevision', t.proposal_source_revision,
      'liveAnchor', t.proposal_live_anchor,
      'proposedBy', ratiflow_document_private.actor_json_v4(
        'AGENT', t.assignee_member_id, t.assignee_display_name, t.agent_label
      ),
      'proposedAt', t.proposed_at
    ) end,
    'result', case when t.result_outcome is null then null else jsonb_build_object(
      'outcome', t.result_outcome,
      'resultSummary', t.result_summary,
      'evidenceRefs', to_jsonb(t.result_evidence_refs),
      'sourceRevision', t.result_source_revision,
      'resultRevision', t.result_revision,
      'liveAnchor', t.result_live_anchor,
      'replacementText', t.result_replacement_text,
      'submittedBy', ratiflow_document_private.actor_json_v4(
        'AGENT', t.assignee_member_id, t.assignee_display_name, t.agent_label
      ),
      'submittedAt', t.submitted_at
    ) end,
    'decision', case when t.decision_kind is null then null else jsonb_build_object(
      'kind', t.decision_kind,
      'note', t.decision_note,
      'decidedBy', ratiflow_document_private.member_json_v4(
        t.decided_by_member_id, t.decided_by_display_name
      ),
      'decidedAt', t.decided_at,
      'decisionRevision', t.decision_revision,
      'resultRevision', t.decision_result_revision
    ) end,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at,
    'resolvedAt', t.resolved_at
  )
  from public.ratiflow_issue_tasks_v4 t
  where t.task_id = p_task_id
$$;

create or replace function ratiflow_document_private.revision_json_v4(
  p_document_id uuid,
  p_revision bigint,
  p_full boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'revisionId', r.revision_id,
    'revision', r.revision,
    'parentRevision', r.parent_revision,
    'contentDigest', r.content_digest,
    'diffs', r.diffs,
    'provenance', jsonb_build_object(
      'authority', r.authority,
      'origin', r.origin,
      'authorOrigin', r.author_origin,
      'taskId', r.task_id,
      'sourceRevision', r.source_revision,
      'author', ratiflow_document_private.actor_json_v4(
        r.author_actor_type, r.author_member_id, r.author_display_name, r.author_agent_label
      ),
      'committer', ratiflow_document_private.actor_json_v4(
        r.committer_actor_type, r.committer_member_id,
        r.committer_display_name, r.committer_agent_label
      ),
      'grantedBy', case when r.granted_by_member_id is null then null else
        ratiflow_document_private.member_json_v4(
          r.granted_by_member_id, r.granted_by_display_name
        ) end,
      'approvedBy', case when r.approved_by_member_id is null then null else
        ratiflow_document_private.member_json_v4(
          r.approved_by_member_id, r.approved_by_display_name
        ) end,
      'restoredRevision', r.restored_revision
    ),
    'changeSummary', r.change_summary,
    'evidenceRefs', to_jsonb(r.evidence_refs),
    'createdAt', r.created_at
  ) || case when p_full then jsonb_build_object('title', r.title, 'body', r.body)
    else '{}'::jsonb end
  from public.ratiflow_issue_revisions_v4 r
  where r.document_id = p_document_id and r.revision = p_revision
$$;

create or replace function ratiflow_document_private.document_json_v4(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'id', d.id,
    'protocolVersion', 4,
    'kind', d.issue_kind,
    'title', d.title,
    'body', d.body,
    'revision', d.revision,
    'activityVersion', d.activity_version,
    'updatedAt', d.updated_at,
    'lastRevision', jsonb_build_object(
      'revisionId', r.revision_id,
      'author', ratiflow_document_private.actor_json_v4(
        r.author_actor_type, r.author_member_id, r.author_display_name, r.author_agent_label
      ),
      'authority', r.authority,
      'summary', r.change_summary
    )
  )
  from public.ratiflow_documents d
  join public.ratiflow_issue_revisions_v4 r
    on r.document_id = d.id and r.revision = d.revision
  where d.id = p_document_id and d.protocol_version = 4 and d.expires_at > clock_timestamp()
$$;

create or replace function ratiflow_document_private.surface_v4(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'document', ratiflow_document_private.document_json_v4(d.id),
    'presence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', recent.member_id,
        'displayName', recent.display_name,
        'color', recent.color,
        'state', recent.state,
        'field', recent.field,
        'isTyping', recent.is_typing,
        'selectionStart', recent.selection_start,
        'selectionEnd', recent.selection_end,
        'observedRevision', recent.observed_revision,
        'lastSeenAt', recent.last_seen_at
      ) order by recent.display_name, recent.member_id)
      from (
        select distinct on (p.member_id) p.member_id, m.display_name, m.color,
          p.state::text state, p.field::text field, p.is_typing,
          p.selection_start, p.selection_end, p.observed_revision, p.last_seen_at
        from public.ratiflow_document_presence p
        join public.ratiflow_document_members m
          on m.document_id = p.document_id and m.member_id = p.member_id
        where p.document_id = d.id and p.last_seen_at > clock_timestamp() - interval '15 seconds'
        order by p.member_id, p.last_seen_at desc, p.session_instance_id
      ) recent
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(ratiflow_document_private.member_json_v4(m.member_id, m.display_name)
        order by m.display_name, m.member_id)
      from public.ratiflow_document_members m where m.document_id = d.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(ratiflow_document_private.task_json_v4(t.task_id)
        order by case when t.status in ('OPEN', 'PROPOSED') then 0 else 1 end,
          t.updated_at desc, t.task_id)
      from public.ratiflow_issue_tasks_v4 t where t.document_id = d.id
    ), '[]'::jsonb),
    'threads', coalesce((
      select jsonb_agg(ratiflow_document_private.thread_json_v4(t.thread_id)
        order by case when t.task_id is not null then 0 else 1 end,
          case when task.status in ('OPEN', 'PROPOSED') then 0 else 1 end,
          coalesce(task.updated_at, t.created_at) desc, coalesce(task.task_id, t.thread_id))
      from public.ratiflow_issue_threads_v4 t
      left join public.ratiflow_issue_tasks_v4 task
        on task.document_id = t.document_id and task.task_id = t.task_id
      where t.document_id = d.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(ratiflow_document_private.revision_json_v4(d.id, recent.revision, false)
        order by recent.revision desc)
      from (
        select r.revision from public.ratiflow_issue_revisions_v4 r
        where r.document_id = d.id order by r.revision desc limit 20
      ) recent
    ), '[]'::jsonb),
    'hasMoreHistory', d.revision > 20
  )
  from public.ratiflow_documents d
  where d.id = p_document_id and d.protocol_version = 4 and d.expires_at > clock_timestamp()
$$;

create or replace function ratiflow_document_private.session_bundle_v4(
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
    'protocolVersion', 4,
    'surface', ratiflow_document_private.surface_v4(p_document_id)
  )
$$;

create or replace function ratiflow_document_private.content_digest_v4(
  p_title text,
  p_body text
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select 'sha256:' || encode(extensions.digest(convert_to(
    '{"title":' || to_json(p_title)::text || ',"body":' || to_json(p_body)::text || '}',
    'UTF8'
  ), 'sha256'), 'hex')
$$;

create or replace function ratiflow_document_private.diff_v4(
  p_field text,
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
  v_after_length_splice integer;
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
  v_after_length_splice := v_after_length - v_prefix - v_suffix;
  return jsonb_build_object(
    'field', p_field,
    'rangeStart', v_prefix,
    'rangeEnd', v_end,
    'before', substring(p_before from v_prefix + 1 for v_end - v_prefix),
    'after', substring(p_after from v_prefix + 1 for v_after_length_splice)
  );
end;
$$;

create or replace function ratiflow_document_private.request_fingerprint_v4(
  p_operation text,
  p_member_id uuid,
  p_actor_type text,
  p_input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', p_operation,
    'memberId', p_member_id,
    'actorType', p_actor_type,
    'input', p_input
  )::text, 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function ratiflow_document_private.replay_v4(
  p_document_id uuid,
  p_request_id uuid,
  p_operation text,
  p_member_id uuid,
  p_actor_type text,
  p_input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_entry public.ratiflow_document_request_ledger%rowtype;
declare v_fingerprint text;
begin
  select * into v_entry from public.ratiflow_document_request_ledger
  where document_id = p_document_id and request_id = p_request_id;
  if not found then return null; end if;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v4(
    p_operation, p_member_id, p_actor_type, p_input
  );
  if v_entry.operation <> p_operation or v_entry.fingerprint <> v_fingerprint then
    return ratiflow_document_private.error_v4(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different input.',
      false
    );
  end if;
  return v_entry.result;
end;
$$;

create or replace function ratiflow_document_private.record_v4(
  p_document_id uuid,
  p_request_id uuid,
  p_operation text,
  p_member_id uuid,
  p_actor_type text,
  p_input jsonb,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  insert into public.ratiflow_document_request_ledger (
    document_id, request_id, operation, fingerprint, result
  ) values (
    p_document_id, p_request_id, p_operation,
    ratiflow_document_private.request_fingerprint_v4(
      p_operation, p_member_id, p_actor_type, p_input
    ),
    p_result
  );
  return p_result;
end;
$$;

-- Public wrappers pass every authenticated, authorized mutation result through this helper.
-- Successful mutations have already inserted their ledger row; ON CONFLICT makes
-- that pass a no-op. Terminal failures are inserted here so an ambiguous transport
-- retry returns the same failure without touching document counters or timestamps.
-- An authorization failure must never occupy the document-wide request namespace.
create or replace function ratiflow_document_private.finish_mutation_v4(
  p_operation text,
  p_handle text,
  p_actor_type text,
  p_input jsonb,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_session record;
  v_request_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId') then
    return p_result;
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type::text <> p_actor_type then
    return p_result;
  end if;
  if p_result->>'ok' = 'false' and p_result->>'code' = 'UNAUTHORIZED' then
    return p_result;
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  insert into public.ratiflow_document_request_ledger (
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_session.document_id, v_request_id, p_operation,
    ratiflow_document_private.request_fingerprint_v4(
      p_operation, v_session.member_id, p_actor_type, p_input
    ),
    p_result
  ) on conflict (document_id, request_id) do nothing;
  return p_result;
end;
$$;

create or replace function ratiflow_document_private.stale_document_v4(
  p_document_id uuid,
  p_expected_revision bigint
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error_v4(
    'STALE_DOCUMENT',
    format('The issue advanced from revision %s to %s.', p_expected_revision, d.revision),
    true,
    jsonb_build_object(
      'currentRevision', d.revision,
      'currentActivityVersion', d.activity_version,
      'nextAction', 'Inspect the latest revision and merge or retry.'
    )
  ) from public.ratiflow_documents d where d.id = p_document_id
$$;

create or replace function ratiflow_document_private.random_token_v4()
returns text
language sql
volatile
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select translate(replace(replace(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), E'\n', ''), E'\r', ''), '+/', '-_')
$$;

create or replace function ratiflow_document_private.rate_limit_v4(
  p_operation text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_count integer;
begin
  insert into ratiflow_document_private.rate_windows(operation, bucket, request_count)
  values (p_operation, date_trunc('minute', clock_timestamp()), 1)
  on conflict (operation, bucket) do update
    set request_count = ratiflow_document_private.rate_windows.request_count + 1
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

create or replace function ratiflow_document_private.rebase_selection_v4(
  p_old text,
  p_new text,
  p_start bigint,
  p_end bigint,
  p_selected text,
  p_next_revision bigint,
  p_restore boolean default false
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
  v_old_length integer := char_length(p_old);
  v_new_length integer := char_length(p_new);
  v_splice_end integer;
  v_delta integer;
  v_start bigint := p_start;
  v_end bigint := p_end;
begin
  if p_restore then
    if p_end <= v_new_length
      and substring(p_new from p_start::integer + 1 for (p_end - p_start)::integer) = p_selected then
      return jsonb_build_object('start', p_start, 'end', p_end, 'text', p_selected,
        'revision', p_next_revision, 'state', 'ACTIVE');
    end if;
    return jsonb_build_object('start', p_start, 'end', p_end, 'text', p_selected,
      'revision', p_next_revision - 1, 'state', 'STALE');
  end if;
  if p_old = p_new then
    return jsonb_build_object('start', p_start, 'end', p_end, 'text', p_selected,
      'revision', p_next_revision, 'state', 'ACTIVE');
  end if;
  while v_prefix < v_old_length and v_prefix < v_new_length
    and substring(p_old from v_prefix + 1 for 1)
      = substring(p_new from v_prefix + 1 for 1) loop
    v_prefix := v_prefix + 1;
  end loop;
  while v_suffix < v_old_length - v_prefix
    and v_suffix < v_new_length - v_prefix
    and substring(p_old from v_old_length - v_suffix for 1)
      = substring(p_new from v_new_length - v_suffix for 1) loop
    v_suffix := v_suffix + 1;
  end loop;
  v_splice_end := v_old_length - v_suffix;
  v_delta := (v_new_length - v_prefix - v_suffix) - (v_splice_end - v_prefix);
  if p_end <= v_prefix then
    null;
  elsif p_start >= v_splice_end then
    v_start := p_start + v_delta;
    v_end := p_end + v_delta;
  else
    return jsonb_build_object('start', p_start, 'end', p_end, 'text', p_selected,
      'revision', p_next_revision - 1, 'state', 'STALE');
  end if;
  if v_start < 0 or v_end > v_new_length
    or substring(p_new from v_start::integer + 1 for (v_end - v_start)::integer) <> p_selected then
    return jsonb_build_object('start', p_start, 'end', p_end, 'text', p_selected,
      'revision', p_next_revision - 1, 'state', 'STALE');
  end if;
  return jsonb_build_object('start', v_start, 'end', v_end, 'text', p_selected,
    'revision', p_next_revision, 'state', 'ACTIVE');
end;
$$;

create or replace function ratiflow_document_private.rebase_anchors_v4(
  p_document_id uuid,
  p_old_title text,
  p_new_title text,
  p_old_body text,
  p_new_body text,
  p_next_revision bigint,
  p_at timestamptz,
  p_own_task_id uuid default null,
  p_own_field text default null,
  p_own_replacement text default null,
  p_restore boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_task public.ratiflow_issue_tasks_v4%rowtype;
  v_thread public.ratiflow_issue_threads_v4%rowtype;
  v_rebased jsonb;
  v_old text;
  v_new text;
begin
  for v_task in
    select * from public.ratiflow_issue_tasks_v4
    where document_id = p_document_id
      and (p_own_task_id is null or task_id <> p_own_task_id)
    order by task_id for update
  loop
    if v_task.anchor_scope = 'DOCUMENT' then
      update public.ratiflow_issue_tasks_v4
      set anchor_revision = p_next_revision
      where task_id = v_task.task_id;
      update public.ratiflow_issue_threads_v4
      set anchor_revision = p_next_revision
      where thread_id = v_task.thread_id;
    elsif v_task.anchor_state = 'ACTIVE' then
      v_old := case when v_task.anchor_field = 'TITLE' then p_old_title else p_old_body end;
      v_new := case when v_task.anchor_field = 'TITLE' then p_new_title else p_new_body end;
      v_rebased := ratiflow_document_private.rebase_selection_v4(
        v_old, v_new, v_task.range_start, v_task.range_end, v_task.selected_text,
        p_next_revision, p_restore
      );
      if v_rebased->>'state' = 'STALE' then
        if v_task.status in ('OPEN', 'PROPOSED') then
          update public.ratiflow_issue_tasks_v4
          set anchor_state = 'STALE', status = 'STALE', updated_at = p_at,
            resolved_at = p_at
          where task_id = v_task.task_id;
          update public.ratiflow_issue_threads_v4
          set anchor_state = 'STALE', status = 'RESOLVED',
            resolved_by_member_id = v_task.creator_member_id,
            resolved_by_display_name = v_task.creator_display_name,
            resolved_at = p_at
          where thread_id = v_task.thread_id;
        else
          update public.ratiflow_issue_tasks_v4
          set anchor_state = 'STALE' where task_id = v_task.task_id;
          update public.ratiflow_issue_threads_v4
          set anchor_state = 'STALE' where thread_id = v_task.thread_id;
        end if;
      else
        update public.ratiflow_issue_tasks_v4
        set range_start = (v_rebased->>'start')::bigint,
          range_end = (v_rebased->>'end')::bigint,
          anchor_revision = p_next_revision
        where task_id = v_task.task_id;
        update public.ratiflow_issue_threads_v4
        set range_start = (v_rebased->>'start')::bigint,
          range_end = (v_rebased->>'end')::bigint,
          anchor_revision = p_next_revision
        where thread_id = v_task.thread_id;
      end if;
    end if;
  end loop;

  for v_thread in
    select * from public.ratiflow_issue_threads_v4
    where document_id = p_document_id and task_id is null
    order by thread_id for update
  loop
    if v_thread.anchor_scope = 'DOCUMENT' then
      update public.ratiflow_issue_threads_v4
      set anchor_revision = p_next_revision where thread_id = v_thread.thread_id;
    elsif v_thread.anchor_state = 'ACTIVE' then
      v_old := case when v_thread.anchor_field = 'TITLE' then p_old_title else p_old_body end;
      v_new := case when v_thread.anchor_field = 'TITLE' then p_new_title else p_new_body end;
      v_rebased := ratiflow_document_private.rebase_selection_v4(
        v_old, v_new, v_thread.range_start, v_thread.range_end, v_thread.selected_text,
        p_next_revision, p_restore
      );
      update public.ratiflow_issue_threads_v4
      set range_start = (v_rebased->>'start')::bigint,
        range_end = (v_rebased->>'end')::bigint,
        anchor_revision = (v_rebased->>'revision')::bigint,
        anchor_state = v_rebased->>'state'
      where thread_id = v_thread.thread_id;
    end if;
  end loop;

  if p_own_task_id is not null then
    if coalesce(p_own_replacement, '') = '' then
      update public.ratiflow_issue_tasks_v4 set anchor_state = 'STALE'
      where task_id = p_own_task_id;
      update public.ratiflow_issue_threads_v4 set anchor_state = 'STALE'
      where task_id = p_own_task_id;
    else
      update public.ratiflow_issue_tasks_v4
      set range_end = range_start + char_length(p_own_replacement),
        selected_text = p_own_replacement,
        anchor_revision = p_next_revision,
        anchor_state = 'ACTIVE'
      where task_id = p_own_task_id and anchor_field = p_own_field;
      update public.ratiflow_issue_threads_v4 t
      set range_end = task.range_end,
        selected_text = task.selected_text,
        anchor_revision = task.anchor_revision,
        anchor_state = task.anchor_state
      from public.ratiflow_issue_tasks_v4 task
      where task.task_id = p_own_task_id and t.task_id = task.task_id;
    end if;
  end if;
end;
$$;

create or replace function ratiflow_document_private.bump_activity_v4(
  p_document_id uuid,
  p_kind text,
  p_actor_type text,
  p_actor_member_id uuid,
  p_actor_display_name text,
  p_origin text,
  p_revision_id uuid default null,
  p_task_id uuid default null,
  p_thread_id uuid default null,
  p_comment_id uuid default null,
  p_at timestamptz default clock_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_activity bigint;
declare v_revision bigint;
begin
  update public.ratiflow_documents
  set activity_version = activity_version + 1, updated_at = p_at
  where id = p_document_id and protocol_version = 4
  returning activity_version, revision into v_activity, v_revision;
  insert into public.ratiflow_issue_activity_v4 (
    document_id, activity_version, kind, actor_type, actor_member_id,
    actor_display_name, origin, revision, revision_id, task_id, thread_id,
    comment_id, created_at
  ) values (
    p_document_id, v_activity, p_kind, p_actor_type, p_actor_member_id,
    p_actor_display_name, p_origin, v_revision, p_revision_id, p_task_id,
    p_thread_id, p_comment_id, p_at
  );
  return v_activity;
end;
$$;

create or replace function ratiflow_document_private.append_revision_v4(
  p_document_id uuid,
  p_title text,
  p_body text,
  p_source_revision bigint,
  p_authority text,
  p_task_id uuid,
  p_author_member_id uuid,
  p_author_display_name text,
  p_author_agent_label text,
  p_committer_member_id uuid,
  p_committer_display_name text,
  p_committer_agent_label text,
  p_granted_by_member_id uuid,
  p_granted_by_display_name text,
  p_approved_by_member_id uuid,
  p_approved_by_display_name text,
  p_restored_revision bigint,
  p_change_summary text,
  p_evidence_refs text[],
  p_activity_kind text,
  p_at timestamptz default clock_timestamp(),
  p_own_task_id uuid default null,
  p_own_field text default null,
  p_own_replacement text default null,
  p_restore boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_document public.ratiflow_documents%rowtype;
  v_own_task public.ratiflow_issue_tasks_v4%rowtype;
  v_revision_id uuid := extensions.gen_random_uuid();
  v_revision bigint;
  v_activity bigint;
  v_diffs jsonb := '[]'::jsonb;
  v_author_actor_type text := case when p_author_agent_label is null then 'HUMAN' else 'AGENT' end;
  v_committer_actor_type text := case when p_committer_agent_label is null then 'HUMAN' else 'AGENT' end;
  v_origin text := case when p_authority = 'DIRECT' then 'WEBMCP' else 'ORDINARY_UI' end;
  v_author_origin text := case when p_authority in ('DIRECT', 'REVIEW') then 'WEBMCP' else 'ORDINARY_UI' end;
  v_diff jsonb;
begin
  select * into strict v_document from public.ratiflow_documents
  where id = p_document_id and protocol_version = 4 for update;
  p_at := greatest(p_at, v_document.updated_at + interval '1 microsecond');
  if p_own_task_id is not null then
    select * into strict v_own_task from public.ratiflow_issue_tasks_v4
    where document_id = p_document_id and task_id = p_own_task_id;
  end if;
  v_revision := v_document.revision + 1;
  v_activity := v_document.activity_version + 1;
  v_diff := case
    when p_own_task_id is not null and p_own_field = 'TITLE'
      and v_document.title <> p_title then jsonb_build_object(
        'field', 'TITLE',
        'rangeStart', v_own_task.range_start,
        'rangeEnd', v_own_task.range_end,
        'before', v_own_task.selected_text,
        'after', p_own_replacement
      )
    else ratiflow_document_private.diff_v4('TITLE', v_document.title, p_title)
  end;
  if v_diff is not null then v_diffs := v_diffs || jsonb_build_array(v_diff); end if;
  v_diff := case
    when p_own_task_id is not null and p_own_field = 'BODY'
      and v_document.body <> p_body then jsonb_build_object(
        'field', 'BODY',
        'rangeStart', v_own_task.range_start,
        'rangeEnd', v_own_task.range_end,
        'before', v_own_task.selected_text,
        'after', p_own_replacement
      )
    else ratiflow_document_private.diff_v4('BODY', v_document.body, p_body)
  end;
  if v_diff is not null then v_diffs := v_diffs || jsonb_build_array(v_diff); end if;

  insert into public.ratiflow_issue_revisions_v4 (
    revision_id, document_id, revision, parent_revision, title, body,
    content_digest, diffs, source_revision, authority, origin, author_origin,
    task_id, author_actor_type, author_member_id, author_display_name,
    author_agent_label, committer_actor_type, committer_member_id,
    committer_display_name, committer_agent_label, granted_by_member_id,
    granted_by_display_name, approved_by_member_id, approved_by_display_name,
    restored_revision, change_summary, evidence_refs, created_at
  ) values (
    v_revision_id, p_document_id, v_revision, v_document.revision, p_title, p_body,
    ratiflow_document_private.content_digest_v4(p_title, p_body), v_diffs,
    p_source_revision, p_authority, v_origin, v_author_origin, p_task_id,
    v_author_actor_type, p_author_member_id, p_author_display_name,
    p_author_agent_label, v_committer_actor_type, p_committer_member_id,
    p_committer_display_name, p_committer_agent_label, p_granted_by_member_id,
    p_granted_by_display_name, p_approved_by_member_id,
    p_approved_by_display_name, p_restored_revision, p_change_summary,
    p_evidence_refs, p_at
  );

  perform ratiflow_document_private.rebase_anchors_v4(
    p_document_id, v_document.title, p_title, v_document.body, p_body,
    v_revision, p_at, p_own_task_id, p_own_field, p_own_replacement, p_restore
  );

  update public.ratiflow_documents
  set title = p_title, body = p_body, revision = v_revision,
    activity_version = v_activity, updated_at = p_at,
    last_editor_member_id = p_committer_member_id,
    last_editor_display_name = p_committer_display_name,
    last_editor_actor_type = v_committer_actor_type::public.ratiflow_document_actor_type,
    last_editor_origin = v_origin::public.ratiflow_document_origin,
    undo_agent_revision = null, undo_previous_title = null, undo_previous_body = null
  where id = p_document_id;

  insert into public.ratiflow_issue_activity_v4 (
    document_id, activity_version, kind, actor_type, actor_member_id,
    actor_display_name, origin, revision, revision_id, task_id, created_at
  ) values (
    p_document_id, v_activity, p_activity_kind, v_committer_actor_type,
    p_committer_member_id,
    case when v_committer_actor_type = 'AGENT' then p_committer_agent_label
      else p_committer_display_name end,
    v_origin, v_revision, v_revision_id, p_task_id, p_at
  );
  return ratiflow_document_private.revision_json_v4(p_document_id, v_revision, true);
end;
$$;

create or replace function ratiflow_document_private.issue_tokens_v4(
  p_document_id uuid,
  p_member_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_human text := ratiflow_document_private.random_token_v4();
  v_agent text := ratiflow_document_private.random_token_v4();
  v_session uuid := extensions.gen_random_uuid();
begin
  insert into ratiflow_document_private.sessions (
    handle_hash, document_id, member_id, actor_type, session_instance_id, expires_at
  ) values
    (extensions.digest(v_human, 'sha256'), p_document_id, p_member_id, 'HUMAN', v_session, p_expires_at),
    (extensions.digest(v_agent, 'sha256'), p_document_id, p_member_id, 'AGENT', v_session, p_expires_at);
  return jsonb_build_object(
    'humanToken', v_human, 'agentToken', v_agent, 'sessionInstanceId', v_session
  );
end;
$$;

create or replace function ratiflow_document_private.bootstrap_path_v4(
  p_share_token text,
  p_bundle jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select '/issue/' || p_share_token || '#ratiflow-bootstrap=' ||
    translate(replace(replace(rtrim(encode(convert_to(p_bundle::text, 'UTF8'), 'base64'), '='), E'\n', ''), E'\r', ''), '+/', '-_')
$$;

create or replace function ratiflow_document_private.seed_issue_v4(
  p_kind text,
  p_display_name text,
  p_hero_mode text default 'NONE'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_document_id uuid := extensions.gen_random_uuid();
  v_share_token text := ratiflow_document_private.random_token_v4();
  v_expires_at timestamptz := clock_timestamp() + interval '30 days';
  v_base timestamptz := clock_timestamp();
  v_priya uuid := extensions.gen_random_uuid();
  v_nadia uuid := extensions.gen_random_uuid();
  v_leo uuid := extensions.gen_random_uuid();
  v_sam uuid := extensions.gen_random_uuid();
  v_data_task uuid := extensions.gen_random_uuid();
  v_log_task uuid := extensions.gen_random_uuid();
  v_code_task uuid := extensions.gen_random_uuid();
  v_data_thread uuid := extensions.gen_random_uuid();
  v_log_thread uuid := extensions.gen_random_uuid();
  v_code_thread uuid := extensions.gen_random_uuid();
  v_human_comment uuid := extensions.gen_random_uuid();
  v_agent_comment uuid := extensions.gen_random_uuid();
  v_r1_revision uuid := extensions.gen_random_uuid();
  v_title text;
  v_body text;
  v_summary text;
  v_impact text := 'Between 09:43 and 10:21 UTC, 28,417 checkout attempts produced 6,742 failures across 311 merchants. No duplicate charges occurred.';
  v_timeline text := E'- 09:43 — Provider 429 responses began.\n- 09:47 — Retry traffic reached 5.8× baseline; the checkout queue grew from 420 to 18,240.\n- 10:17 — The team rolled back retry middleware commit 7d3c9e1.\n- 10:21 — Checkout success rate recovered.';
  v_root_cause text := 'Provider throttling triggered the incident. Retry middleware introduced in 7d3c9e1 ignored Retry-After and made up to five immediate retries, amplifying provider 429 responses into queue exhaustion. The retry regression—not provider latency alone—was the root cause of the sustained checkout failure.';
  v_r2_body text;
  v_r3_body text;
  v_r4_body text;
  v_priya_tokens jsonb;
  v_nadia_tokens jsonb;
  v_leo_tokens jsonb;
  v_sam_tokens jsonb;
begin
  if p_kind not in ('POSTMORTEM', 'PRODUCT_DOCUMENT')
    or p_hero_mode not in ('NONE', 'RESET', 'COMPLETED') then
    raise exception 'invalid v4 seed arguments' using errcode = '22023';
  end if;
  if p_hero_mode <> 'NONE' and p_kind <> 'POSTMORTEM' then
    raise exception 'hero seeds are postmortems' using errcode = '22023';
  end if;
  if p_hero_mode <> 'NONE' then
    v_title := 'INC-482 · Checkout outage postmortem';
    v_body := $hero$## Summary

Checkout requests failed for 38 minutes after a payment-provider throttling event. Service recovered after the team rolled back the retry middleware.

## Impact

Investigation in progress.

## Timeline

Investigation in progress.

## Root cause

Investigation in progress.

## Detection and response

The on-call engineer responded to the checkout error-rate alert and coordinated rollback.

## Contributing factors

The retry path had not been load-tested against provider throttling.

## Corrective actions

- [ ] Honor provider backoff headers — Payments Platform — September 5
- [ ] Add throttling load tests — Checkout — September 7
- [ ] Alert on retry amplification — Reliability — September 6

## Learnings

Separate external triggers from internal amplifiers when assigning root cause.$hero$;
    v_summary := 'Launch INC-482 postmortem.';
    p_display_name := 'Priya Shah';
  elsif p_kind = 'POSTMORTEM' then
    v_title := 'Untitled incident postmortem';
    v_body := $postmortem$## Summary

Describe what happened, when it started, and when service recovered.

## Impact

Quantify affected customers, failed operations, and data integrity.

## Timeline

List key events in UTC.

## Root cause

Distinguish the triggering event from the system condition that amplified it.

## Detection and response

Explain how the incident was detected and how responders acted.

## Contributing factors

List the conditions that increased likelihood or impact.

## Corrective actions

- [ ] Assign an owner and target date.

## Learnings

Record what should change in how the team designs, operates, or responds.$postmortem$;
    v_summary := 'Launch incident postmortem.';
  else
    v_title := 'Untitled product document';
    v_body := $product$## Problem

Describe the customer or business problem.

## Users and need

Name the users and the outcome they need.

## Goals

Define the outcomes this product should create.

## Non-goals

State what is deliberately outside this document.

## Requirements

List the behavior the product must support.

## Decisions

Record decisions and the context behind them.

## Risks

Describe material delivery, adoption, safety, or operational risks.

## Success metrics

Define how the team will know the product worked.

## Open questions

List unresolved questions and their owners.$product$;
    v_summary := 'Launch product document.';
  end if;

  insert into public.ratiflow_documents (
    id, share_token_hash, title, body, revision, activity_version,
    protocol_version, issue_kind, last_editor_member_id, last_editor_display_name,
    last_editor_actor_type, last_editor_origin, created_at, updated_at, expires_at
  ) values (
    v_document_id, extensions.digest(v_share_token, 'sha256'), v_title, v_body,
    1, 1, 4, p_kind, v_priya, p_display_name, 'HUMAN', 'ORDINARY_UI',
    v_base, v_base, v_expires_at
  );
  insert into public.ratiflow_document_members (
    document_id, member_id, display_name, color, created_at
  ) values (v_document_id, v_priya, p_display_name, '#2563EB', v_base);

  insert into public.ratiflow_issue_revisions_v4 (
    revision_id, document_id, revision, parent_revision, title, body,
    content_digest, diffs, source_revision, authority, origin, author_origin,
    author_actor_type, author_member_id, author_display_name,
    committer_actor_type, committer_member_id, committer_display_name,
    change_summary, evidence_refs, created_at
  ) values (
    v_r1_revision, v_document_id, 1, null, v_title, v_body,
    ratiflow_document_private.content_digest_v4(v_title, v_body),
    jsonb_build_array(
      jsonb_build_object('field', 'TITLE', 'rangeStart', 0, 'rangeEnd', 0,
        'before', '', 'after', v_title),
      jsonb_build_object('field', 'BODY', 'rangeStart', 0, 'rangeEnd', 0,
        'before', '', 'after', v_body)
    ),
    0, 'HUMAN', 'ORDINARY_UI', 'ORDINARY_UI', 'HUMAN', v_priya,
    p_display_name, 'HUMAN', v_priya, p_display_name, v_summary, '{}', v_base
  );
  insert into public.ratiflow_issue_activity_v4 (
    document_id, activity_version, kind, actor_type, actor_member_id,
    actor_display_name, origin, revision, revision_id, created_at
  ) values (
    v_document_id, 1, 'ISSUE_LAUNCHED', 'HUMAN', v_priya,
    p_display_name, 'ORDINARY_UI', 1, v_r1_revision, v_base
  );

  if p_hero_mode <> 'NONE' then
    insert into public.ratiflow_document_members (
      document_id, member_id, display_name, color, created_at
    ) values
      (v_document_id, v_nadia, 'Nadia Chen', '#7C3AED', v_base + interval '1 millisecond'),
      (v_document_id, v_leo, 'Leo Park', '#DB2777', v_base + interval '2 milliseconds'),
      (v_document_id, v_sam, 'Sam Rivera', '#0F766E', v_base + interval '3 milliseconds');

    insert into public.ratiflow_issue_tasks_v4 (
      task_id, document_id, task_key, title, category, instruction, agent_label,
      mode, status, creator_member_id, creator_display_name, assignee_member_id,
      assignee_display_name, thread_id, creation_anchor, anchor_scope, anchor_field, range_start,
      range_end, selected_text, created_revision, anchor_revision, anchor_state,
      created_at, updated_at
    ) values
      (v_data_task, v_document_id, 'DATA-17',
       'Add verified checkout impact and data-integrity figures.', 'DATA',
       'Use impact.csv to replace only the Impact placeholder with verified checkout attempts, failures, affected merchants, and duplicate-charge status.',
       'Data agent', 'DIRECT', 'OPEN', v_priya, 'Priya Shah', v_nadia, 'Nadia Chen',
       v_data_thread, ratiflow_document_private.anchor_json_v4(
         'SELECTION', 'BODY', 174, 200, 'Investigation in progress.', 1, 1, 'ACTIVE'
       ), 'SELECTION', 'BODY', 174, 200, 'Investigation in progress.',
       1, 1, 'ACTIVE', v_base + interval '1 second', v_base + interval '1 second'),
      (v_log_task, v_document_id, 'LOG-22',
       'Replace the timeline placeholder with the observed outage sequence.', 'LOGS',
       'Use checkout.log to replace only the Timeline placeholder with the observed UTC sequence from provider throttling through recovery.',
       'Logging agent', 'DIRECT', 'OPEN', v_priya, 'Priya Shah', v_leo, 'Leo Park',
       v_log_thread, ratiflow_document_private.anchor_json_v4(
         'SELECTION', 'BODY', 215, 241, 'Investigation in progress.', 1, 1, 'ACTIVE'
       ), 'SELECTION', 'BODY', 215, 241, 'Investigation in progress.',
       1, 1, 'ACTIVE', v_base + interval '2 seconds', v_base + interval '2 seconds'),
      (v_code_task, v_document_id, 'CODE-9',
       'Explain provider throttling as trigger and retry regression as root cause.', 'CODEBASE',
       'Use commit 7d3c9e1 and checkout.log to distinguish the external trigger from the internal condition that sustained the outage. Replace only the Root cause placeholder.',
       'Builder agent', 'REVIEW', 'OPEN', v_priya, 'Priya Shah', v_sam, 'Sam Rivera',
       v_code_thread, ratiflow_document_private.anchor_json_v4(
         'SELECTION', 'BODY', 258, 284, 'Investigation in progress.', 1, 1, 'ACTIVE'
       ), 'SELECTION', 'BODY', 258, 284, 'Investigation in progress.',
       1, 1, 'ACTIVE', v_base + interval '3 seconds', v_base + interval '3 seconds');

    insert into public.ratiflow_issue_threads_v4 (
      thread_id, document_id, task_id, creation_anchor, anchor_scope, anchor_field, range_start,
      range_end, selected_text, created_revision, anchor_revision, anchor_state,
      status, created_by_member_id, created_by_display_name, created_at
    )
    select t.thread_id, t.document_id, t.task_id, t.creation_anchor, t.anchor_scope, t.anchor_field,
      t.range_start, t.range_end, t.selected_text, t.created_revision,
      t.anchor_revision, t.anchor_state, 'OPEN', t.creator_member_id,
      t.creator_display_name, t.created_at
    from public.ratiflow_issue_tasks_v4 t
    where t.document_id = v_document_id;

    perform ratiflow_document_private.bump_activity_v4(
      v_document_id, 'TASK_CREATED', 'HUMAN', v_priya, 'Priya Shah',
      'ORDINARY_UI', null, v_data_task, v_data_thread, null, v_base + interval '1 second'
    );
    perform ratiflow_document_private.bump_activity_v4(
      v_document_id, 'TASK_CREATED', 'HUMAN', v_priya, 'Priya Shah',
      'ORDINARY_UI', null, v_log_task, v_log_thread, null, v_base + interval '2 seconds'
    );
    perform ratiflow_document_private.bump_activity_v4(
      v_document_id, 'TASK_CREATED', 'HUMAN', v_priya, 'Priya Shah',
      'ORDINARY_UI', null, v_code_task, v_code_thread, null, v_base + interval '3 seconds'
    );
  end if;

  if p_hero_mode = 'COMPLETED' then
    v_r2_body := substring(v_body from 1 for 174) || v_impact || substring(v_body from 201);
    update public.ratiflow_issue_tasks_v4 set status = 'COMPLETED',
      result_outcome = 'COMMITTED',
      result_summary = 'Added verified checkout impact and confirmed no duplicate charges.',
      result_evidence_refs = array['impact.csv'], result_source_revision = 1,
      result_revision = 2,
      result_live_anchor = ratiflow_document_private.anchor_json_v4(
        anchor_scope, anchor_field, range_start, range_end, selected_text,
        created_revision, anchor_revision, anchor_state
      ),
      result_replacement_text = v_impact,
      submitted_at = v_base + interval '4 seconds',
      updated_at = v_base + interval '4 seconds', resolved_at = v_base + interval '4 seconds'
    where task_id = v_data_task;
    perform ratiflow_document_private.append_revision_v4(
      p_document_id => v_document_id, p_title => v_title, p_body => v_r2_body,
      p_source_revision => 1, p_authority => 'DIRECT', p_task_id => v_data_task,
      p_author_member_id => v_nadia, p_author_display_name => 'Nadia Chen',
      p_author_agent_label => 'Data agent', p_committer_member_id => v_nadia,
      p_committer_display_name => 'Nadia Chen', p_committer_agent_label => 'Data agent',
      p_granted_by_member_id => v_priya, p_granted_by_display_name => 'Priya Shah',
      p_approved_by_member_id => null, p_approved_by_display_name => null,
      p_restored_revision => null,
      p_change_summary => 'Added verified checkout impact and confirmed no duplicate charges.',
      p_evidence_refs => array['impact.csv'], p_activity_kind => 'TASK_COMPLETED',
      p_at => v_base + interval '4 seconds', p_own_task_id => v_data_task,
      p_own_field => 'BODY', p_own_replacement => v_impact
    );
    update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
      resolved_by_member_id = v_nadia, resolved_by_display_name = 'Nadia Chen',
      resolved_at = v_base + interval '4 seconds' where thread_id = v_data_thread;

    v_r3_body := substring(v_r2_body from 1 for 319) || v_timeline || substring(v_r2_body from 346);
    update public.ratiflow_issue_tasks_v4 set status = 'COMPLETED',
      result_outcome = 'COMMITTED',
      result_summary = 'Added the observed outage timeline and recovery sequence.',
      result_evidence_refs = array['checkout.log'], result_source_revision = 1,
      result_revision = 3,
      result_live_anchor = ratiflow_document_private.anchor_json_v4(
        anchor_scope, anchor_field, range_start, range_end, selected_text,
        created_revision, anchor_revision, anchor_state
      ),
      result_replacement_text = v_timeline,
      submitted_at = v_base + interval '5 seconds',
      updated_at = v_base + interval '5 seconds', resolved_at = v_base + interval '5 seconds'
    where task_id = v_log_task;
    perform ratiflow_document_private.append_revision_v4(
      p_document_id => v_document_id, p_title => v_title, p_body => v_r3_body,
      p_source_revision => 1, p_authority => 'DIRECT', p_task_id => v_log_task,
      p_author_member_id => v_leo, p_author_display_name => 'Leo Park',
      p_author_agent_label => 'Logging agent', p_committer_member_id => v_leo,
      p_committer_display_name => 'Leo Park', p_committer_agent_label => 'Logging agent',
      p_granted_by_member_id => v_priya, p_granted_by_display_name => 'Priya Shah',
      p_approved_by_member_id => null, p_approved_by_display_name => null,
      p_restored_revision => null,
      p_change_summary => 'Added the observed outage timeline and recovery sequence.',
      p_evidence_refs => array['checkout.log'], p_activity_kind => 'TASK_COMPLETED',
      p_at => v_base + interval '5 seconds', p_own_task_id => v_log_task,
      p_own_field => 'BODY', p_own_replacement => v_timeline
    );
    update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
      resolved_by_member_id = v_leo, resolved_by_display_name = 'Leo Park',
      resolved_at = v_base + interval '5 seconds' where thread_id = v_log_thread;

    update public.ratiflow_issue_tasks_v4 set status = 'PROPOSED',
      proposal_replacement_text = v_root_cause,
      proposal_result_summary = 'Separated the provider trigger from the retry regression that sustained the outage.',
      proposal_evidence_refs = array['commit:7d3c9e1', 'checkout.log'],
      proposal_source_revision = 1,
      proposal_live_anchor = ratiflow_document_private.anchor_json_v4(
        anchor_scope, anchor_field, range_start, range_end, selected_text,
        created_revision, anchor_revision, anchor_state
      ),
      proposed_at = v_base + interval '6 seconds',
      updated_at = v_base + interval '6 seconds'
    where task_id = v_code_task;
    perform ratiflow_document_private.bump_activity_v4(
      v_document_id, 'TASK_PROPOSED', 'AGENT', v_sam, 'Builder agent', 'WEBMCP',
      null, v_code_task, v_code_thread, null, v_base + interval '6 seconds'
    );

    insert into public.ratiflow_issue_comments_v4 (
      comment_id, document_id, thread_id, author_actor_type, author_member_id,
      author_display_name, origin, body, evidence_refs, created_at
    ) values (
      v_human_comment, v_document_id, v_code_thread, 'HUMAN', v_priya,
      'Priya Shah', 'ORDINARY_UI',
      'Provider throttling happened first. Are we overclaiming our code as the root cause?',
      '{}', v_base + interval '7 seconds'
    );
    perform ratiflow_document_private.bump_activity_v4(
      v_document_id, 'COMMENT_ADDED', 'HUMAN', v_priya, 'Priya Shah',
      'ORDINARY_UI', null, v_code_task, v_code_thread, v_human_comment,
      v_base + interval '7 seconds'
    );
    insert into public.ratiflow_issue_comments_v4 (
      comment_id, document_id, thread_id, reply_to_comment_id, author_actor_type,
      author_member_id, author_display_name, author_agent_label, origin, body,
      evidence_refs, created_at
    ) values (
      v_agent_comment, v_document_id, v_code_thread, v_human_comment, 'AGENT',
      v_sam, 'Sam Rivera', 'Builder agent', 'WEBMCP',
      'The logs show 429s as the trigger, but commit 7d3c9e1 ignored Retry-After and issued up to five zero-delay retries. That raised retry traffic to 5.8× and the queue from 420 to 18,240, so the code regression explains why throttling became a 38-minute outage.',
      array['checkout.log', 'commit:7d3c9e1'], v_base + interval '8 seconds'
    );
    perform ratiflow_document_private.bump_activity_v4(
      v_document_id, 'COMMENT_ADDED', 'AGENT', v_sam, 'Builder agent', 'WEBMCP',
      null, v_code_task, v_code_thread, v_agent_comment, v_base + interval '8 seconds'
    );

    v_r4_body := substring(v_r3_body from 1 for 573) || v_root_cause || substring(v_r3_body from 600);
    update public.ratiflow_issue_tasks_v4 set status = 'COMPLETED',
      decision_kind = 'ACCEPTED',
      decision_note = 'Accepted after separating the external trigger from the internal retry amplifier.',
      decided_by_member_id = v_priya, decided_by_display_name = 'Priya Shah',
      decided_at = v_base + interval '9 seconds', decision_revision = 3,
      decision_result_revision = 4, updated_at = v_base + interval '9 seconds',
      resolved_at = v_base + interval '9 seconds'
    where task_id = v_code_task;
    perform ratiflow_document_private.append_revision_v4(
      p_document_id => v_document_id, p_title => v_title, p_body => v_r4_body,
      p_source_revision => 1, p_authority => 'REVIEW', p_task_id => v_code_task,
      p_author_member_id => v_sam, p_author_display_name => 'Sam Rivera',
      p_author_agent_label => 'Builder agent', p_committer_member_id => v_priya,
      p_committer_display_name => 'Priya Shah', p_committer_agent_label => null,
      p_granted_by_member_id => v_priya, p_granted_by_display_name => 'Priya Shah',
      p_approved_by_member_id => v_priya, p_approved_by_display_name => 'Priya Shah',
      p_restored_revision => null,
      p_change_summary => 'Separated the provider trigger from the retry regression that sustained the outage.',
      p_evidence_refs => array['commit:7d3c9e1', 'checkout.log'],
      p_activity_kind => 'TASK_COMPLETED', p_at => v_base + interval '9 seconds',
      p_own_task_id => v_code_task, p_own_field => 'BODY',
      p_own_replacement => v_root_cause
    );
    update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
      resolved_by_member_id = v_priya, resolved_by_display_name = 'Priya Shah',
      resolved_at = v_base + interval '9 seconds' where thread_id = v_code_thread;
  end if;

  v_priya_tokens := ratiflow_document_private.issue_tokens_v4(v_document_id, v_priya, v_expires_at);
  if p_hero_mode <> 'NONE' then
    v_nadia_tokens := ratiflow_document_private.issue_tokens_v4(v_document_id, v_nadia, v_expires_at);
    v_leo_tokens := ratiflow_document_private.issue_tokens_v4(v_document_id, v_leo, v_expires_at);
    v_sam_tokens := ratiflow_document_private.issue_tokens_v4(v_document_id, v_sam, v_expires_at);
  end if;
  return jsonb_build_object(
    'documentId', v_document_id, 'shareToken', v_share_token,
    'expiresAt', v_expires_at, 'priyaMemberId', v_priya,
    'priyaTokens', v_priya_tokens, 'nadiaMemberId', v_nadia,
    'nadiaTokens', v_nadia_tokens, 'leoMemberId', v_leo,
    'leoTokens', v_leo_tokens, 'samMemberId', v_sam, 'samTokens', v_sam_tokens
  );
end;
$$;

create or replace function public.ratiflow_launch_issue_v4(
  p_input jsonb default '{}'::jsonb,
  p_example boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_seed jsonb;
  v_name text;
  v_kind text;
  v_tokens jsonb;
begin
  if p_example then
    if not ratiflow_document_private.input_v4(p_input, '{}', '{}') then
      return ratiflow_document_private.invalid_v4('The example request must be empty.');
    end if;
    if not ratiflow_document_private.rate_limit_v4('LAUNCH', 60) then
      return ratiflow_document_private.error_v4('RATE_LIMITED', 'Launch rate limit reached.', true);
    end if;
    v_seed := ratiflow_document_private.seed_issue_v4('POSTMORTEM', 'Priya Shah', 'COMPLETED');
  else
    if not ratiflow_document_private.input_v4(p_input, array['kind'], array['displayName'])
      or p_input->>'kind' not in ('POSTMORTEM', 'PRODUCT_DOCUMENT')
      or (p_input ? 'displayName' and not ratiflow_document_private.text_v4(p_input->'displayName', 80, false)) then
      return ratiflow_document_private.invalid_v4('A valid issue kind and display name are required.');
    end if;
    if not ratiflow_document_private.rate_limit_v4('LAUNCH', 60) then
      return ratiflow_document_private.error_v4('RATE_LIMITED', 'Launch rate limit reached.', true);
    end if;
    v_kind := p_input->>'kind';
    v_name := coalesce(p_input->>'displayName', 'Collaborator 1');
    v_seed := ratiflow_document_private.seed_issue_v4(v_kind, v_name, 'NONE');
  end if;
  v_tokens := v_seed->'priyaTokens';
  return jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.session_bundle_v4(
      (v_seed->>'documentId')::uuid, v_seed->>'shareToken',
      v_tokens->>'humanToken', v_tokens->>'agentToken',
      (v_tokens->>'sessionInstanceId')::uuid, (v_seed->>'priyaMemberId')::uuid,
      (v_seed->>'expiresAt')::timestamptz
    )
  );
end;
$$;

create or replace function public.ratiflow_join_issue_v4(
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
  v_name text;
  v_tokens jsonb;
begin
  if p_share_token is null or p_share_token !~ '^[A-Za-z0-9_-]{32,128}$'
    or not ratiflow_document_private.input_v4(p_input, '{}', array['displayName'])
    or (p_input ? 'displayName' and not ratiflow_document_private.text_v4(p_input->'displayName', 80, false)) then
    return ratiflow_document_private.invalid_v4('A valid share token and display name are required.');
  end if;
  if not ratiflow_document_private.rate_limit_v4('JOIN', 240) then
    return ratiflow_document_private.error_v4('RATE_LIMITED', 'Join rate limit reached.', true);
  end if;
  select * into v_document from public.ratiflow_documents
  where share_token_hash = extensions.digest(p_share_token, 'sha256')
    and expires_at > clock_timestamp() for update;
  if not found then
    return ratiflow_document_private.error_v4('NOT_FOUND', 'The issue was not found.', false);
  end if;
  if v_document.protocol_version <> 4 then
    return ratiflow_document_private.error_v4('PROTOCOL_MISMATCH', 'This share belongs to another protocol version.', false);
  end if;
  v_name := coalesce(p_input->>'displayName', format('Collaborator %s',
    (select count(*) + 1 from public.ratiflow_document_members where document_id = v_document.id)));
  insert into public.ratiflow_document_members(document_id, member_id, display_name, color)
  values (
    v_document.id, v_member_id, v_name,
    (array['#2563EB','#7C3AED','#DB2777','#0F766E','#C2410C','#4F46E5'])[
      1 + ((select count(*) from public.ratiflow_document_members
        where document_id = v_document.id)::integer % 6)
    ]
  );
  v_tokens := ratiflow_document_private.issue_tokens_v4(v_document.id, v_member_id, v_document.expires_at);
  return jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.session_bundle_v4(
      v_document.id, p_share_token, v_tokens->>'humanToken', v_tokens->>'agentToken',
      (v_tokens->>'sessionInstanceId')::uuid, v_member_id, v_document.expires_at
    )
  );
end;
$$;

create or replace function public.ratiflow_inspect_issue_v4(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v4(p_handle); end if;
  return jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v4(v_session.document_id));
end;
$$;

create or replace function public.ratiflow_read_issue_history_v4(
  p_handle text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_session record;
  v_document public.ratiflow_documents%rowtype;
  v_before bigint;
  v_limit integer;
  v_rows jsonb;
  v_count integer;
  v_oldest bigint;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v4(p_handle); end if;
  if not ratiflow_document_private.input_v4(p_input, '{}', array['beforeRevision','limit'])
    or (p_input ? 'beforeRevision' and not ratiflow_document_private.counter_v4(p_input->'beforeRevision', 1))
    or (p_input ? 'limit' and not ratiflow_document_private.counter_v4(p_input->'limit', 1, 50)) then
    return ratiflow_document_private.invalid_v4('The history input is invalid.');
  end if;
  select * into strict v_document from public.ratiflow_documents where id = v_session.document_id;
  v_before := coalesce((p_input->>'beforeRevision')::bigint, v_document.revision + 1);
  v_limit := coalesce((p_input->>'limit')::integer, 20);
  select coalesce(jsonb_agg(
      ratiflow_document_private.revision_json_v4(v_document.id, selected.revision, false)
      order by selected.revision desc
    ), '[]'::jsonb), count(*), min(selected.revision)
  into v_rows, v_count, v_oldest
  from (
    select r.revision from public.ratiflow_issue_revisions_v4 r
    where r.document_id = v_document.id and r.revision < v_before
    order by r.revision desc limit v_limit
  ) selected;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'revisions', v_rows,
    'hasMoreOlder', v_oldest is not null and v_oldest > 1,
    'nextBeforeRevision', case when v_oldest is not null and v_oldest > 1 then v_oldest else null end,
    'currentRevision', v_document.revision,
    'currentActivityVersion', v_document.activity_version
  ));
end;
$$;

create or replace function public.ratiflow_read_issue_revision_v4(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_revision bigint;
declare v_result jsonb;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v4(p_handle); end if;
  if not ratiflow_document_private.input_v4(p_input, array['revision'], '{}')
    or not ratiflow_document_private.counter_v4(p_input->'revision', 1) then
    return ratiflow_document_private.invalid_v4('A positive revision is required.');
  end if;
  v_revision := (p_input->>'revision')::bigint;
  v_result := ratiflow_document_private.revision_json_v4(v_session.document_id, v_revision, true);
  if v_result is null then return ratiflow_document_private.error_v4('NOT_FOUND', 'The revision was not found.', false); end if;
  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create or replace function public.ratiflow_list_my_issue_tasks_v4(
  p_handle text,
  p_page_session_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_include boolean;
declare v_tasks jsonb;
begin
  if p_page_session_id is null then
    return ratiflow_document_private.error_v4('STALE_PAGE_CONTEXT', 'A valid page session is required.', false);
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized_v4('A valid delegated-agent session is required.');
  end if;
  if not ratiflow_document_private.input_v4(p_input, '{}', array['includeResolved'])
    or (p_input ? 'includeResolved' and jsonb_typeof(p_input->'includeResolved') <> 'boolean') then
    return ratiflow_document_private.invalid_v4('The task-list input is invalid.');
  end if;
  v_include := coalesce((p_input->>'includeResolved')::boolean, false);
  select * into strict v_document from public.ratiflow_documents where id = v_session.document_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'task', ratiflow_document_private.task_json_v4(t.task_id),
      'thread', ratiflow_document_private.thread_json_v4(t.thread_id)
    ) order by case when t.status in ('OPEN','PROPOSED') then 0 else 1 end,
      t.updated_at desc, t.task_id), '[]'::jsonb)
  into v_tasks
  from public.ratiflow_issue_tasks_v4 t
  where t.document_id = v_document.id and t.assignee_member_id = v_session.member_id
    and (v_include or t.status in ('OPEN', 'PROPOSED'));
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tasks', v_tasks, 'revision', v_document.revision,
    'activityVersion', v_document.activity_version
  ));
end;
$$;

create or replace function public.ratiflow_reset_postmortem_hero_v4()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_seed jsonb;
  v_document_id uuid;
  v_share text;
  v_expiry timestamptz;
  v_priya_bundle jsonb;
  v_nadia_bundle jsonb;
  v_leo_bundle jsonb;
  v_sam_bundle jsonb;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(824746584004::bigint) then
    return ratiflow_document_private.error_v4(
      'RATE_LIMITED', 'A fixture reset is already in progress.', true
    );
  end if;
  if not ratiflow_document_private.rate_limit_v4('LAUNCH', 60) then
    return ratiflow_document_private.error_v4('RATE_LIMITED', 'Reset rate limit reached.', true);
  end if;
  v_seed := ratiflow_document_private.seed_issue_v4('POSTMORTEM', 'Priya Shah', 'RESET');
  v_document_id := (v_seed->>'documentId')::uuid;
  v_share := v_seed->>'shareToken';
  v_expiry := (v_seed->>'expiresAt')::timestamptz;
  v_priya_bundle := ratiflow_document_private.session_bundle_v4(
    v_document_id, v_share, v_seed->'priyaTokens'->>'humanToken',
    v_seed->'priyaTokens'->>'agentToken',
    (v_seed->'priyaTokens'->>'sessionInstanceId')::uuid,
    (v_seed->>'priyaMemberId')::uuid, v_expiry);
  v_nadia_bundle := ratiflow_document_private.session_bundle_v4(
    v_document_id, v_share, v_seed->'nadiaTokens'->>'humanToken',
    v_seed->'nadiaTokens'->>'agentToken',
    (v_seed->'nadiaTokens'->>'sessionInstanceId')::uuid,
    (v_seed->>'nadiaMemberId')::uuid, v_expiry);
  v_leo_bundle := ratiflow_document_private.session_bundle_v4(
    v_document_id, v_share, v_seed->'leoTokens'->>'humanToken',
    v_seed->'leoTokens'->>'agentToken',
    (v_seed->'leoTokens'->>'sessionInstanceId')::uuid,
    (v_seed->>'leoMemberId')::uuid, v_expiry);
  v_sam_bundle := ratiflow_document_private.session_bundle_v4(
    v_document_id, v_share, v_seed->'samTokens'->>'humanToken',
    v_seed->'samTokens'->>'agentToken',
    (v_seed->'samTokens'->>'sessionInstanceId')::uuid,
    (v_seed->>'samMemberId')::uuid, v_expiry);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'fixtureVersion', 'repo-document-v4.postmortem.v1',
    'shareToken', v_share,
    'priyaBootstrapPath', ratiflow_document_private.bootstrap_path_v4(v_share, v_priya_bundle),
    'nadiaBootstrapPath', ratiflow_document_private.bootstrap_path_v4(v_share, v_nadia_bundle),
    'leoBootstrapPath', ratiflow_document_private.bootstrap_path_v4(v_share, v_leo_bundle),
    'samBootstrapPath', ratiflow_document_private.bootstrap_path_v4(v_share, v_sam_bundle),
    'expiresAt', v_expiry, 'revision', 1, 'activityVersion', 4
  ));
end;
$$;

create or replace function ratiflow_document_private.anchor_from_input_v4(
  p_document_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_document public.ratiflow_documents%rowtype;
declare v_value text;
declare v_start bigint;
declare v_end bigint;
begin
  select * into strict v_document from public.ratiflow_documents where id = p_document_id;
  if ratiflow_document_private.input_v4(p_input, array['scope'], '{}')
    and p_input->>'scope' = 'DOCUMENT' then
    return ratiflow_document_private.anchor_json_v4(
      'DOCUMENT', null, null, null, null, v_document.revision,
      v_document.revision, 'ACTIVE');
  end if;
  if not ratiflow_document_private.input_v4(
      p_input, array['scope','field','rangeStart','rangeEnd'], '{}')
    or p_input->>'scope' <> 'SELECTION'
    or p_input->>'field' not in ('TITLE','BODY')
    or not ratiflow_document_private.counter_v4(p_input->'rangeStart')
    or not ratiflow_document_private.counter_v4(p_input->'rangeEnd') then
    return null;
  end if;
  v_start := (p_input->>'rangeStart')::bigint;
  v_end := (p_input->>'rangeEnd')::bigint;
  v_value := case when p_input->>'field' = 'TITLE' then v_document.title else v_document.body end;
  if v_start >= v_end or v_end > char_length(v_value) then return null; end if;
  return ratiflow_document_private.anchor_json_v4(
    'SELECTION', p_input->>'field', v_start, v_end,
    substring(v_value from v_start::integer + 1 for (v_end - v_start)::integer),
    v_document.revision, v_document.revision, 'ACTIVE');
end;
$$;

create or replace function ratiflow_document_private.evidence_array_v4(p_value jsonb)
returns text[]
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select coalesce(array_agg(entry #>> '{}' order by ordinal), '{}')
  from jsonb_array_elements(coalesce(p_value, '[]'::jsonb)) with ordinality as values(entry, ordinal)
$$;

create or replace function ratiflow_document_private.human_mutation_v4(
  p_operation text,
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_session record;
  v_document public.ratiflow_documents%rowtype;
  v_request_id uuid;
  v_replay jsonb;
  v_result jsonb;
  v_anchor jsonb;
  v_task public.ratiflow_issue_tasks_v4%rowtype;
  v_thread public.ratiflow_issue_threads_v4%rowtype;
  v_revision public.ratiflow_issue_revisions_v4%rowtype;
  v_member public.ratiflow_document_members%rowtype;
  v_task_id uuid;
  v_thread_id uuid;
  v_comment_id uuid;
  v_reply_id uuid;
  v_expected bigint;
  v_at timestamptz;
  v_prefix text;
  v_selected text;
  v_next_value text;
  v_next_title text;
  v_next_body text;
  v_evidence text[];
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized_v4('A valid human session is required.');
  end if;
  -- All v4 mutations lock the document before any task, thread, comment, revision,
  -- presence, or ledger row. This prevents cross-operation counter inversions.
  select * into strict v_document from public.ratiflow_documents
  where id = v_session.document_id and protocol_version = 4
    and expires_at > clock_timestamp() for update;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId') then
    return ratiflow_document_private.invalid_v4('A UUID requestId is required.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  -- Task-scoped human operations establish creator authority before consulting the
  -- document-wide request ledger, so a foreign request ID cannot reveal another
  -- actor's replay result or replay mismatch.
  if p_operation in (
    'CANCEL_ISSUE_TASK_V4', 'ACCEPT_ISSUE_TASK_V4', 'REJECT_ISSUE_TASK_V4'
  ) then
    if not ratiflow_document_private.uuid_v4(p_input->'taskId') then
      return ratiflow_document_private.invalid_v4('A UUID taskId is required.');
    end if;
    select * into v_task from public.ratiflow_issue_tasks_v4
    where document_id = v_document.id
      and task_id = (p_input->>'taskId')::uuid
      and creator_member_id = v_session.member_id
    for update;
    if not found then
      return ratiflow_document_private.unauthorized_v4(
        'Only the task creator may perform this operation.'
      );
    end if;
  end if;
  v_replay := ratiflow_document_private.replay_v4(
    v_document.id, v_request_id, p_operation, v_session.member_id, 'HUMAN', p_input);
  if v_replay is not null then return v_replay; end if;

  if p_operation = 'SAVE_ISSUE_REVISION_V4' then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','expectedRevision','title','body','changeSummary'], '{}')
      or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
      or not ratiflow_document_private.text_v4(p_input->'title', 160, false)
      or not ratiflow_document_private.text_v4(p_input->'body', 50000, true)
      or not ratiflow_document_private.text_v4(p_input->'changeSummary', 240, false) then
      return ratiflow_document_private.invalid_v4('The revision input is invalid.');
    end if;
    v_expected := (p_input->>'expectedRevision')::bigint;
    if v_expected <> v_document.revision then
      return ratiflow_document_private.stale_document_v4(v_document.id, v_expected);
    end if;
    if p_input->>'title' <> v_document.title or p_input->>'body' <> v_document.body then
      perform ratiflow_document_private.append_revision_v4(
        p_document_id => v_document.id, p_title => p_input->>'title',
        p_body => p_input->>'body', p_source_revision => v_expected,
        p_authority => 'HUMAN', p_task_id => null,
        p_author_member_id => v_session.member_id,
        p_author_display_name => v_session.display_name, p_author_agent_label => null,
        p_committer_member_id => v_session.member_id,
        p_committer_display_name => v_session.display_name,
        p_committer_agent_label => null, p_granted_by_member_id => null,
        p_granted_by_display_name => null, p_approved_by_member_id => null,
        p_approved_by_display_name => null, p_restored_revision => null,
        p_change_summary => p_input->>'changeSummary', p_evidence_refs => '{}',
        p_activity_kind => 'REVISION_SAVED'
      );
    end if;

  elsif p_operation = 'CREATE_ISSUE_TASK_V4' then
    if not ratiflow_document_private.input_v4(p_input,
        array['requestId','expectedRevision','title','category','instruction','agentLabel','mode','assignedToMemberId','anchor'], '{}')
      or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
      or not ratiflow_document_private.text_v4(p_input->'title', 120, false)
      or p_input->>'category' not in ('DATA','LOGS','CODEBASE','RESEARCH','WRITING','GENERAL')
      or not ratiflow_document_private.text_v4(p_input->'instruction', 1000, false)
      or not ratiflow_document_private.text_v4(p_input->'agentLabel', 80, false)
      or p_input->>'mode' not in ('COMMENT','REVIEW','DIRECT')
      or not ratiflow_document_private.uuid_v4(p_input->'assignedToMemberId') then
      return ratiflow_document_private.invalid_v4('The task input is invalid.');
    end if;
    v_expected := (p_input->>'expectedRevision')::bigint;
    if v_expected <> v_document.revision then
      return ratiflow_document_private.stale_document_v4(v_document.id, v_expected);
    end if;
    select * into v_member from public.ratiflow_document_members
    where document_id = v_document.id and member_id = (p_input->>'assignedToMemberId')::uuid;
    if not found then return ratiflow_document_private.error_v4('NOT_FOUND', 'The assignee is not a member of this issue.', false); end if;
    if (select count(*) from public.ratiflow_issue_tasks_v4 where document_id = v_document.id) >= 500
      or (select count(*) from public.ratiflow_issue_tasks_v4 where document_id = v_document.id and status in ('OPEN','PROPOSED')) >= 100
      or (select count(*) from public.ratiflow_issue_tasks_v4 where document_id = v_document.id
          and assignee_member_id = v_member.member_id and status in ('OPEN','PROPOSED')) >= 50 then
      return ratiflow_document_private.error_v4('RATE_LIMITED', 'The task capacity has been reached.', false);
    end if;
    v_anchor := ratiflow_document_private.anchor_from_input_v4(v_document.id, p_input->'anchor');
    if v_anchor is null or (p_input->>'mode' in ('REVIEW','DIRECT') and v_anchor->>'scope' <> 'SELECTION') then
      return ratiflow_document_private.invalid_v4('This task mode requires a valid target selection.');
    end if;
    v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
    v_task_id := extensions.gen_random_uuid();
    v_thread_id := extensions.gen_random_uuid();
    v_prefix := case p_input->>'category' when 'DATA' then 'DATA' when 'LOGS' then 'LOG'
      when 'CODEBASE' then 'CODE' when 'RESEARCH' then 'RES'
      when 'WRITING' then 'WRITE' else 'TASK' end;
    insert into public.ratiflow_issue_tasks_v4 (
      task_id, document_id, task_key, title, category, instruction, agent_label,
      mode, creator_member_id, creator_display_name, assignee_member_id,
      assignee_display_name, thread_id, creation_anchor, anchor_scope, anchor_field, range_start,
      range_end, selected_text, created_revision, anchor_revision, anchor_state,
      created_at, updated_at
    ) values (
      v_task_id, v_document.id, v_prefix || '-' ||
        ((select count(*) + 1 from public.ratiflow_issue_tasks_v4 where document_id = v_document.id)::text),
      p_input->>'title', p_input->>'category', p_input->>'instruction', p_input->>'agentLabel',
      p_input->>'mode', v_session.member_id, v_session.display_name,
      v_member.member_id, v_member.display_name, v_thread_id, v_anchor, v_anchor->>'scope',
      v_anchor->>'field', (v_anchor->>'rangeStart')::bigint, (v_anchor->>'rangeEnd')::bigint,
      v_anchor->>'selectedText', v_document.revision, v_document.revision, 'ACTIVE', v_at, v_at
    );
    insert into public.ratiflow_issue_threads_v4 (
      thread_id, document_id, task_id, creation_anchor, anchor_scope, anchor_field, range_start,
      range_end, selected_text, created_revision, anchor_revision, anchor_state,
      created_by_member_id, created_by_display_name, created_at
    ) values (
      v_thread_id, v_document.id, v_task_id, v_anchor, v_anchor->>'scope', v_anchor->>'field',
      (v_anchor->>'rangeStart')::bigint, (v_anchor->>'rangeEnd')::bigint,
      v_anchor->>'selectedText', v_document.revision, v_document.revision, 'ACTIVE',
      v_session.member_id, v_session.display_name, v_at
    );
    perform ratiflow_document_private.bump_activity_v4(
      v_document.id, 'TASK_CREATED', 'HUMAN', v_session.member_id,
      v_session.display_name, 'ORDINARY_UI', null, v_task_id, v_thread_id, null, v_at);

  elsif p_operation = 'CREATE_ISSUE_THREAD_V4' then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','expectedRevision','body','anchor'], '{}')
      or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
      or not ratiflow_document_private.text_v4(p_input->'body', 2000, false) then
      return ratiflow_document_private.invalid_v4('The thread input is invalid.');
    end if;
    v_expected := (p_input->>'expectedRevision')::bigint;
    if v_expected <> v_document.revision then return ratiflow_document_private.stale_document_v4(v_document.id, v_expected); end if;
    if (select count(*) from public.ratiflow_issue_threads_v4 where document_id = v_document.id and task_id is null) >= 500 then
      return ratiflow_document_private.error_v4('RATE_LIMITED', 'The standalone thread capacity has been reached.', false);
    end if;
    v_anchor := ratiflow_document_private.anchor_from_input_v4(v_document.id, p_input->'anchor');
    if v_anchor is null then return ratiflow_document_private.invalid_v4('The thread target is invalid.'); end if;
    v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
    v_thread_id := extensions.gen_random_uuid(); v_comment_id := extensions.gen_random_uuid();
    insert into public.ratiflow_issue_threads_v4 (
      thread_id, document_id, creation_anchor, anchor_scope, anchor_field, range_start, range_end,
      selected_text, created_revision, anchor_revision, anchor_state,
      created_by_member_id, created_by_display_name, created_at
    ) values (
      v_thread_id, v_document.id, v_anchor, v_anchor->>'scope', v_anchor->>'field',
      (v_anchor->>'rangeStart')::bigint, (v_anchor->>'rangeEnd')::bigint,
      v_anchor->>'selectedText', v_document.revision, v_document.revision, 'ACTIVE',
      v_session.member_id, v_session.display_name, v_at);
    insert into public.ratiflow_issue_comments_v4 (
      comment_id, document_id, thread_id, author_actor_type, author_member_id,
      author_display_name, origin, body, created_at
    ) values (v_comment_id, v_document.id, v_thread_id, 'HUMAN', v_session.member_id,
      v_session.display_name, 'ORDINARY_UI', p_input->>'body', v_at);
    perform ratiflow_document_private.bump_activity_v4(
      v_document.id, 'THREAD_CREATED', 'HUMAN', v_session.member_id,
      v_session.display_name, 'ORDINARY_UI', null, null, v_thread_id, v_comment_id, v_at);

  elsif p_operation = 'ADD_ISSUE_COMMENT_V4' then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','threadId','body'], array['replyToCommentId','evidenceRefs'])
      or not ratiflow_document_private.uuid_v4(p_input->'threadId')
      or (p_input ? 'replyToCommentId' and not ratiflow_document_private.uuid_v4(p_input->'replyToCommentId'))
      or not ratiflow_document_private.text_v4(p_input->'body', 2000, false)
      or (p_input ? 'evidenceRefs' and not ratiflow_document_private.evidence_v4(p_input->'evidenceRefs')) then
      return ratiflow_document_private.invalid_v4('The comment input is invalid.');
    end if;
    select * into v_thread from public.ratiflow_issue_threads_v4
    where document_id = v_document.id and thread_id = (p_input->>'threadId')::uuid for update;
    if not found then return ratiflow_document_private.error_v4('NOT_FOUND', 'The thread was not found.', false); end if;
    v_reply_id := case when p_input ? 'replyToCommentId' then (p_input->>'replyToCommentId')::uuid else null end;
    if v_reply_id is not null and not exists (select 1 from public.ratiflow_issue_comments_v4
      where document_id = v_document.id and thread_id = v_thread.thread_id and comment_id = v_reply_id) then
      return ratiflow_document_private.invalid_v4('The reply target must belong to this thread.');
    end if;
    if (select count(*) from public.ratiflow_issue_comments_v4 where document_id = v_document.id and thread_id = v_thread.thread_id) >= 100 then
      return ratiflow_document_private.error_v4('RATE_LIMITED', 'The thread is full.', false);
    end if;
    v_evidence := ratiflow_document_private.evidence_array_v4(p_input->'evidenceRefs');
    v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
    v_comment_id := extensions.gen_random_uuid();
    insert into public.ratiflow_issue_comments_v4 (
      comment_id, document_id, thread_id, reply_to_comment_id, author_actor_type,
      author_member_id, author_display_name, origin, body, evidence_refs, created_at
    ) values (v_comment_id, v_document.id, v_thread.thread_id, v_reply_id, 'HUMAN',
      v_session.member_id, v_session.display_name, 'ORDINARY_UI', p_input->>'body', v_evidence, v_at);
    perform ratiflow_document_private.bump_activity_v4(
      v_document.id, 'COMMENT_ADDED', 'HUMAN', v_session.member_id,
      v_session.display_name, 'ORDINARY_UI', null, v_thread.task_id,
      v_thread.thread_id, v_comment_id, v_at);

  elsif p_operation = 'RESOLVE_ISSUE_THREAD_V4' then
    if not ratiflow_document_private.input_v4(p_input, array['requestId','threadId'], '{}')
      or not ratiflow_document_private.uuid_v4(p_input->'threadId') then
      return ratiflow_document_private.invalid_v4('The resolve input is invalid.');
    end if;
    select * into v_thread from public.ratiflow_issue_threads_v4
    where document_id = v_document.id and thread_id = (p_input->>'threadId')::uuid
      and task_id is null for update;
    if not found then return ratiflow_document_private.error_v4('NOT_FOUND', 'The standalone thread was not found.', false); end if;
    if v_thread.status = 'OPEN' then
      v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
      update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
        resolved_by_member_id = v_session.member_id,
        resolved_by_display_name = v_session.display_name, resolved_at = v_at
      where thread_id = v_thread.thread_id;
      perform ratiflow_document_private.bump_activity_v4(
        v_document.id, 'THREAD_RESOLVED', 'HUMAN', v_session.member_id,
        v_session.display_name, 'ORDINARY_UI', null, null, v_thread.thread_id, null, v_at);
    end if;

  elsif p_operation = 'CANCEL_ISSUE_TASK_V4' then
    if not ratiflow_document_private.input_v4(p_input, array['requestId','taskId'], '{}')
      or not ratiflow_document_private.uuid_v4(p_input->'taskId') then
      return ratiflow_document_private.invalid_v4('The cancel input is invalid.');
    end if;
    select * into v_task from public.ratiflow_issue_tasks_v4
    where document_id = v_document.id and task_id = (p_input->>'taskId')::uuid for update;
    if not found or v_task.creator_member_id <> v_session.member_id then
      return ratiflow_document_private.unauthorized_v4('Only the task creator may cancel this task.');
    end if;
    if v_task.status <> 'OPEN' then return ratiflow_document_private.error_v4(
      'TASK_MODE_VIOLATION', 'Only Open tasks may be cancelled.', false,
      jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))); end if;
    v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
    update public.ratiflow_issue_tasks_v4 set status = 'CANCELLED', updated_at = v_at,
      resolved_at = v_at where task_id = v_task.task_id;
    update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
      resolved_by_member_id = v_session.member_id,
      resolved_by_display_name = v_session.display_name, resolved_at = v_at
    where thread_id = v_task.thread_id;
    perform ratiflow_document_private.bump_activity_v4(
      v_document.id, 'TASK_CANCELLED', 'HUMAN', v_session.member_id,
      v_session.display_name, 'ORDINARY_UI', null, v_task.task_id, v_task.thread_id, null, v_at);

  elsif p_operation in ('ACCEPT_ISSUE_TASK_V4','REJECT_ISSUE_TASK_V4') then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','taskId','expectedRevision','note'], '{}')
      or not ratiflow_document_private.uuid_v4(p_input->'taskId')
      or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
      or (p_input->'note' <> 'null'::jsonb and not ratiflow_document_private.text_v4(p_input->'note', 240, false)) then
      return ratiflow_document_private.invalid_v4('The decision input is invalid.');
    end if;
    v_expected := (p_input->>'expectedRevision')::bigint;
    if v_expected <> v_document.revision then return ratiflow_document_private.stale_document_v4(v_document.id, v_expected); end if;
    select * into v_task from public.ratiflow_issue_tasks_v4
    where document_id = v_document.id and task_id = (p_input->>'taskId')::uuid for update;
    if not found or v_task.creator_member_id <> v_session.member_id then
      return ratiflow_document_private.unauthorized_v4('Only the task creator may decide this proposal.');
    end if;
    if v_task.status = 'STALE' then
      return ratiflow_document_private.error_v4(
        'STALE_TASK_CONTEXT', 'The proposal target is stale.', false,
        jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))
      );
    end if;
    if v_task.mode <> 'REVIEW' or v_task.status <> 'PROPOSED' then return ratiflow_document_private.error_v4(
      'TASK_MODE_VIOLATION', 'Only a proposed Review task can be decided.', false,
      jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))); end if;
    v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
    if p_operation = 'REJECT_ISSUE_TASK_V4' then
      update public.ratiflow_issue_tasks_v4 set status = 'REJECTED', decision_kind = 'REJECTED',
        decision_note = p_input->>'note', decided_by_member_id = v_session.member_id,
        decided_by_display_name = v_session.display_name, decided_at = v_at,
        decision_revision = v_document.revision, decision_result_revision = v_document.revision,
        updated_at = v_at, resolved_at = v_at where task_id = v_task.task_id;
      update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
        resolved_by_member_id = v_session.member_id,
        resolved_by_display_name = v_session.display_name, resolved_at = v_at
      where thread_id = v_task.thread_id;
      perform ratiflow_document_private.bump_activity_v4(
        v_document.id, 'TASK_REJECTED', 'HUMAN', v_session.member_id,
        v_session.display_name, 'ORDINARY_UI', null, v_task.task_id, v_task.thread_id, null, v_at);
    else
      if v_task.anchor_state <> 'ACTIVE' or v_task.anchor_scope <> 'SELECTION' then
        return ratiflow_document_private.error_v4('STALE_TASK_CONTEXT', 'The proposal target is stale.', false,
          jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))); end if;
      v_selected := substring(
        case when v_task.anchor_field = 'TITLE' then v_document.title else v_document.body end
        from v_task.range_start::integer + 1 for (v_task.range_end - v_task.range_start)::integer);
      if v_selected <> v_task.selected_text then return ratiflow_document_private.error_v4(
        'STALE_TASK_CONTEXT', 'The proposal target is stale.', false,
        jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))); end if;
      v_next_value := substring(
        case when v_task.anchor_field = 'TITLE' then v_document.title else v_document.body end
        from 1 for v_task.range_start::integer) || v_task.proposal_replacement_text || substring(
        case when v_task.anchor_field = 'TITLE' then v_document.title else v_document.body end
        from v_task.range_end::integer + 1);
      if char_length(v_next_value) > case when v_task.anchor_field = 'TITLE' then 160 else 50000 end
        or (v_task.anchor_field = 'TITLE' and char_length(ratiflow_document_private.trim_ecmascript_v4(v_next_value)) = 0) then
        return ratiflow_document_private.invalid_v4('The accepted replacement exceeds document bounds.');
      end if;
      v_next_title := case when v_task.anchor_field = 'TITLE' then v_next_value else v_document.title end;
      v_next_body := case when v_task.anchor_field = 'BODY' then v_next_value else v_document.body end;
      update public.ratiflow_issue_tasks_v4 set status = 'COMPLETED', decision_kind = 'ACCEPTED',
        decision_note = p_input->>'note', decided_by_member_id = v_session.member_id,
        decided_by_display_name = v_session.display_name, decided_at = v_at,
        decision_revision = v_document.revision, decision_result_revision = v_document.revision + 1,
        updated_at = v_at, resolved_at = v_at where task_id = v_task.task_id;
      perform ratiflow_document_private.append_revision_v4(
        p_document_id => v_document.id, p_title => v_next_title, p_body => v_next_body,
        p_source_revision => v_task.proposal_source_revision, p_authority => 'REVIEW',
        p_task_id => v_task.task_id, p_author_member_id => v_task.assignee_member_id,
        p_author_display_name => v_task.assignee_display_name,
        p_author_agent_label => v_task.agent_label,
        p_committer_member_id => v_session.member_id,
        p_committer_display_name => v_session.display_name, p_committer_agent_label => null,
        p_granted_by_member_id => v_task.creator_member_id,
        p_granted_by_display_name => v_task.creator_display_name,
        p_approved_by_member_id => v_session.member_id,
        p_approved_by_display_name => v_session.display_name,
        p_restored_revision => null, p_change_summary => v_task.proposal_result_summary,
        p_evidence_refs => v_task.proposal_evidence_refs, p_activity_kind => 'TASK_COMPLETED',
        p_at => v_at, p_own_task_id => v_task.task_id, p_own_field => v_task.anchor_field,
        p_own_replacement => v_task.proposal_replacement_text);
      update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
        resolved_by_member_id = v_session.member_id,
        resolved_by_display_name = v_session.display_name, resolved_at = v_at
      where thread_id = v_task.thread_id;
    end if;

  elsif p_operation = 'RESTORE_ISSUE_REVISION_V4' then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','expectedRevision','revision','changeSummary'], '{}')
      or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
      or not ratiflow_document_private.counter_v4(p_input->'revision', 1)
      or not ratiflow_document_private.text_v4(p_input->'changeSummary', 240, false) then
      return ratiflow_document_private.invalid_v4('The restore input is invalid.');
    end if;
    v_expected := (p_input->>'expectedRevision')::bigint;
    if v_expected <> v_document.revision then return ratiflow_document_private.stale_document_v4(v_document.id, v_expected); end if;
    select * into v_revision from public.ratiflow_issue_revisions_v4 where document_id = v_document.id
      and revision = (p_input->>'revision')::bigint;
    if not found then return ratiflow_document_private.error_v4('NOT_FOUND', 'The requested revision was not found.', false); end if;
    if v_revision.title = v_document.title and v_revision.body = v_document.body then
      return ratiflow_document_private.invalid_v4('The requested revision already matches the current document.'); end if;
    perform ratiflow_document_private.append_revision_v4(
      p_document_id => v_document.id, p_title => v_revision.title, p_body => v_revision.body,
      p_source_revision => v_revision.revision, p_authority => 'RESTORE', p_task_id => null,
      p_author_member_id => v_session.member_id, p_author_display_name => v_session.display_name,
      p_author_agent_label => null, p_committer_member_id => v_session.member_id,
      p_committer_display_name => v_session.display_name, p_committer_agent_label => null,
      p_granted_by_member_id => null, p_granted_by_display_name => null,
      p_approved_by_member_id => null, p_approved_by_display_name => null,
      p_restored_revision => v_revision.revision, p_change_summary => p_input->>'changeSummary',
      p_evidence_refs => '{}', p_activity_kind => 'REVISION_RESTORED', p_restore => true);

  elsif p_operation = 'TOUCH_ISSUE_PRESENCE_V4' then
    if not ratiflow_document_private.input_v4(p_input,
        array['requestId','state','field','isTyping','selectionStart','selectionEnd','observedRevision'], '{}')
      or p_input->>'state' not in ('VIEWING','EDITING','IDLE')
      or (p_input->'field' <> 'null'::jsonb and p_input->>'field' not in ('TITLE','BODY'))
      or jsonb_typeof(p_input->'isTyping') <> 'boolean'
      or not ratiflow_document_private.counter_v4(p_input->'observedRevision')
      or (p_input->>'observedRevision')::bigint > v_document.revision then
      return ratiflow_document_private.invalid_v4('The presence input is invalid.');
    end if;
    if p_input->'field' = 'null'::jsonb then
      if p_input->'selectionStart' <> 'null'::jsonb or p_input->'selectionEnd' <> 'null'::jsonb
        or (p_input->>'isTyping')::boolean then return ratiflow_document_private.invalid_v4('The presence selection is invalid.'); end if;
    else
      if not ratiflow_document_private.counter_v4(p_input->'selectionStart')
        or not ratiflow_document_private.counter_v4(p_input->'selectionEnd')
        or (p_input->>'selectionStart')::bigint > (p_input->>'selectionEnd')::bigint
        or (p_input->>'selectionEnd')::bigint > char_length(
          case when p_input->>'field' = 'TITLE' then v_document.title else v_document.body end) then
        return ratiflow_document_private.invalid_v4('The presence selection is invalid.'); end if;
    end if;
    insert into public.ratiflow_document_presence (
      document_id, session_instance_id, member_id, state, field, is_typing,
      selection_start, selection_end, observed_revision, last_seen_at
    ) values (
      v_document.id, v_session.session_instance_id, v_session.member_id,
      (p_input->>'state')::public.ratiflow_document_presence_state,
      case when p_input->'field' = 'null'::jsonb then null
        else (p_input->>'field')::public.ratiflow_document_field end,
      (p_input->>'isTyping')::boolean,
      case when p_input->'selectionStart' = 'null'::jsonb then null else (p_input->>'selectionStart')::integer end,
      case when p_input->'selectionEnd' = 'null'::jsonb then null else (p_input->>'selectionEnd')::integer end,
      (p_input->>'observedRevision')::bigint, clock_timestamp()
    ) on conflict (document_id, session_instance_id) do update set
      member_id = excluded.member_id, state = excluded.state, field = excluded.field,
      is_typing = excluded.is_typing, selection_start = excluded.selection_start,
      selection_end = excluded.selection_end, observed_revision = excluded.observed_revision,
      last_seen_at = excluded.last_seen_at;
  else
    return ratiflow_document_private.invalid_v4('Unknown mutation operation.');
  end if;

  v_result := jsonb_build_object('ok', true, 'data',
    ratiflow_document_private.surface_v4(v_document.id));
  return ratiflow_document_private.record_v4(
    v_document.id, v_request_id, p_operation, v_session.member_id,
    'HUMAN', p_input, v_result);
end;
$$;

create or replace function ratiflow_document_private.agent_mutation_v4(
  p_operation text,
  p_handle text,
  p_page_session_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_session record;
  v_document public.ratiflow_documents%rowtype;
  v_task public.ratiflow_issue_tasks_v4%rowtype;
  v_thread public.ratiflow_issue_threads_v4%rowtype;
  v_request_id uuid;
  v_reply_id uuid;
  v_comment_id uuid;
  v_at timestamptz;
  v_replay jsonb;
  v_result jsonb;
  v_evidence text[];
  v_selected text;
  v_replacement text;
  v_next_value text;
  v_next_title text;
  v_next_body text;
  v_revision jsonb;
  v_activity bigint;
begin
  if p_page_session_id is null then
    return ratiflow_document_private.error_v4('STALE_PAGE_CONTEXT', 'A valid page session is required.', false);
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized_v4('A valid delegated-agent session is required.');
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_session.document_id and protocol_version = 4
    and expires_at > clock_timestamp() for update;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId') then
    return ratiflow_document_private.invalid_v4('A UUID requestId is required.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  -- Task ownership is checked before replay for the same reason as creator
  -- authority above: the document-wide ledger is never an authority oracle.
  if p_operation in ('COMMENT_ON_ISSUE_TASK_V4', 'SUBMIT_ISSUE_TASK_RESULT_V4') then
    if not ratiflow_document_private.uuid_v4(p_input->'taskId') then
      return ratiflow_document_private.invalid_v4('A UUID taskId is required.');
    end if;
    select * into v_task from public.ratiflow_issue_tasks_v4
    where document_id = v_document.id
      and task_id = (p_input->>'taskId')::uuid
      and assignee_member_id = v_session.member_id
    for update;
    if not found then
      return ratiflow_document_private.unauthorized_v4(
        'This agent does not own the requested task.'
      );
    end if;
  end if;
  v_replay := ratiflow_document_private.replay_v4(
    v_document.id, v_request_id, p_operation, v_session.member_id, 'AGENT', p_input);
  if v_replay is not null then return v_replay; end if;

  if p_operation = 'COMMENT_ON_ISSUE_TASK_V4' then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','taskId','body'], array['replyToCommentId','evidenceRefs'])
      or not ratiflow_document_private.uuid_v4(p_input->'taskId')
      or (p_input ? 'replyToCommentId' and not ratiflow_document_private.uuid_v4(p_input->'replyToCommentId'))
      or not ratiflow_document_private.text_v4(p_input->'body', 2000, false)
      or (p_input ? 'evidenceRefs' and not ratiflow_document_private.evidence_v4(p_input->'evidenceRefs')) then
      return ratiflow_document_private.invalid_v4('The comment input is invalid.');
    end if;
    select * into v_task from public.ratiflow_issue_tasks_v4
    where document_id = v_document.id and task_id = (p_input->>'taskId')::uuid
      and assignee_member_id = v_session.member_id for update;
    if not found then return ratiflow_document_private.unauthorized_v4('This agent does not own the requested task.'); end if;
    select * into strict v_thread from public.ratiflow_issue_threads_v4
      where document_id = v_document.id and thread_id = v_task.thread_id for update;
    v_reply_id := case when p_input ? 'replyToCommentId' then (p_input->>'replyToCommentId')::uuid else null end;
    if v_reply_id is not null and not exists (select 1 from public.ratiflow_issue_comments_v4
      where document_id = v_document.id and thread_id = v_thread.thread_id and comment_id = v_reply_id) then
      return ratiflow_document_private.invalid_v4('The reply target must belong to this thread.'); end if;
    if (select count(*) from public.ratiflow_issue_comments_v4
      where document_id = v_document.id and thread_id = v_thread.thread_id) >= 100 then
      return ratiflow_document_private.error_v4('RATE_LIMITED', 'The task thread is full.', false); end if;
    v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
    v_comment_id := extensions.gen_random_uuid();
    v_evidence := ratiflow_document_private.evidence_array_v4(p_input->'evidenceRefs');
    insert into public.ratiflow_issue_comments_v4 (
      comment_id, document_id, thread_id, reply_to_comment_id, author_actor_type,
      author_member_id, author_display_name, author_agent_label, origin, body,
      evidence_refs, created_at
    ) values (v_comment_id, v_document.id, v_thread.thread_id, v_reply_id, 'AGENT',
      v_session.member_id, v_session.display_name, v_task.agent_label, 'WEBMCP',
      p_input->>'body', v_evidence, v_at);
    v_activity := ratiflow_document_private.bump_activity_v4(
      v_document.id, 'COMMENT_ADDED', 'AGENT', v_session.member_id,
      v_task.agent_label, 'WEBMCP', null, v_task.task_id, v_thread.thread_id,
      v_comment_id, v_at);
    v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'task', ratiflow_document_private.task_json_v4(v_task.task_id),
      'comment', ratiflow_document_private.comment_json_v4(v_comment_id),
      'activityVersion', v_activity));
  elsif p_operation = 'SUBMIT_ISSUE_TASK_RESULT_V4' then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','taskId','basedOnRevision','resultSummary'],
        array['replacementText','evidenceRefs'])
      or not ratiflow_document_private.uuid_v4(p_input->'taskId')
      or not ratiflow_document_private.counter_v4(p_input->'basedOnRevision', 1)
      or not ratiflow_document_private.text_v4(p_input->'resultSummary', 240, false)
      or (p_input ? 'replacementText' and not ratiflow_document_private.text_v4(p_input->'replacementText', 50000, true))
      or (p_input ? 'evidenceRefs' and not ratiflow_document_private.evidence_v4(p_input->'evidenceRefs')) then
      return ratiflow_document_private.invalid_v4('The task result input is invalid.');
    end if;
    select * into v_task from public.ratiflow_issue_tasks_v4
    where document_id = v_document.id and task_id = (p_input->>'taskId')::uuid
      and assignee_member_id = v_session.member_id for update;
    if not found then return ratiflow_document_private.unauthorized_v4('This agent does not own the requested task.'); end if;
    if v_task.status = 'STALE' then
      return ratiflow_document_private.error_v4(
        'STALE_TASK_CONTEXT', 'The task target is stale.', false,
        jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))
      );
    end if;
    if v_task.status <> 'OPEN' then return ratiflow_document_private.error_v4(
      'TASK_MODE_VIOLATION', 'Only Open tasks accept a result.', false,
      jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))); end if;
    if (p_input->>'basedOnRevision')::bigint < v_task.created_revision
      or (p_input->>'basedOnRevision')::bigint > v_document.revision then
      return ratiflow_document_private.invalid_v4('The source revision is outside this task valid range.'); end if;
    v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
    v_evidence := ratiflow_document_private.evidence_array_v4(p_input->'evidenceRefs');
    if v_task.mode = 'COMMENT' then
      if p_input ? 'replacementText' then
        return ratiflow_document_private.invalid_v4('Comment tasks cannot replace content.');
      end if;
      select * into strict v_thread from public.ratiflow_issue_threads_v4
        where document_id = v_document.id and thread_id = v_task.thread_id for update;
      if (select count(*) from public.ratiflow_issue_comments_v4
        where document_id = v_document.id and thread_id = v_thread.thread_id) >= 100 then
        return ratiflow_document_private.error_v4('RATE_LIMITED', 'The task thread is full.', false); end if;
      v_comment_id := extensions.gen_random_uuid();
      insert into public.ratiflow_issue_comments_v4 (
        comment_id, document_id, thread_id, author_actor_type, author_member_id,
        author_display_name, author_agent_label, origin, body, evidence_refs, created_at
      ) values (v_comment_id, v_document.id, v_task.thread_id, 'AGENT',
        v_session.member_id, v_session.display_name, v_task.agent_label, 'WEBMCP',
        p_input->>'resultSummary', v_evidence, v_at);
      update public.ratiflow_issue_tasks_v4 set status = 'COMPLETED',
        result_outcome = 'COMMENTED', result_summary = p_input->>'resultSummary',
        result_evidence_refs = v_evidence,
        result_source_revision = (p_input->>'basedOnRevision')::bigint,
        result_revision = v_document.revision,
        result_live_anchor = ratiflow_document_private.anchor_json_v4(
          anchor_scope, anchor_field, range_start, range_end, selected_text,
          created_revision, anchor_revision, anchor_state
        ),
        result_replacement_text = null, submitted_at = v_at,
        updated_at = v_at, resolved_at = v_at where task_id = v_task.task_id;
      update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
        resolved_by_member_id = v_session.member_id,
        resolved_by_display_name = v_session.display_name, resolved_at = v_at
      where thread_id = v_task.thread_id;
      v_activity := ratiflow_document_private.bump_activity_v4(
        v_document.id, 'TASK_COMPLETED', 'AGENT', v_session.member_id,
        v_task.agent_label, 'WEBMCP', null, v_task.task_id, v_task.thread_id,
        v_comment_id, v_at);
      v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
        'outcome', 'COMMENTED', 'task', ratiflow_document_private.task_json_v4(v_task.task_id),
        'revision', v_document.revision, 'activityVersion', v_activity));
    else
      if not (p_input ? 'replacementText') then return ratiflow_document_private.error_v4(
        'TASK_MODE_VIOLATION', 'This task requires a replacement.', false); end if;
      if v_task.anchor_scope <> 'SELECTION' or v_task.anchor_state <> 'ACTIVE' then
        return ratiflow_document_private.error_v4('STALE_TASK_CONTEXT', 'The task target is stale.', false,
          jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))); end if;
      v_selected := substring(
        case when v_task.anchor_field = 'TITLE' then v_document.title else v_document.body end
        from v_task.range_start::integer + 1 for (v_task.range_end - v_task.range_start)::integer);
      if v_selected <> v_task.selected_text then return ratiflow_document_private.error_v4(
        'STALE_TASK_CONTEXT', 'The task target is stale.', false,
        jsonb_build_object('currentTask', ratiflow_document_private.task_json_v4(v_task.task_id))); end if;
      v_replacement := p_input->>'replacementText';
      if v_replacement = v_selected then return ratiflow_document_private.invalid_v4('The replacement must change the target.'); end if;
      v_next_value := substring(
        case when v_task.anchor_field = 'TITLE' then v_document.title else v_document.body end
        from 1 for v_task.range_start::integer) || v_replacement || substring(
        case when v_task.anchor_field = 'TITLE' then v_document.title else v_document.body end
        from v_task.range_end::integer + 1);
      if char_length(v_next_value) > case when v_task.anchor_field = 'TITLE' then 160 else 50000 end
        or (v_task.anchor_field = 'TITLE' and char_length(ratiflow_document_private.trim_ecmascript_v4(v_next_value)) = 0) then
        return ratiflow_document_private.invalid_v4('The replacement exceeds document bounds.'); end if;
      if v_task.mode = 'REVIEW' then
        update public.ratiflow_issue_tasks_v4 set status = 'PROPOSED',
          proposal_replacement_text = v_replacement,
          proposal_result_summary = p_input->>'resultSummary',
          proposal_evidence_refs = v_evidence,
          proposal_source_revision = (p_input->>'basedOnRevision')::bigint,
          proposal_live_anchor = ratiflow_document_private.anchor_json_v4(
            anchor_scope, anchor_field, range_start, range_end, selected_text,
            created_revision, anchor_revision, anchor_state
          ),
          proposed_at = v_at, updated_at = v_at where task_id = v_task.task_id;
        v_activity := ratiflow_document_private.bump_activity_v4(
          v_document.id, 'TASK_PROPOSED', 'AGENT', v_session.member_id,
          v_task.agent_label, 'WEBMCP', null, v_task.task_id, v_task.thread_id, null, v_at);
        v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
          'outcome', 'PROPOSED', 'task', ratiflow_document_private.task_json_v4(v_task.task_id),
          'revision', v_document.revision, 'activityVersion', v_activity));
      else
        v_next_title := case when v_task.anchor_field = 'TITLE' then v_next_value else v_document.title end;
        v_next_body := case when v_task.anchor_field = 'BODY' then v_next_value else v_document.body end;
        update public.ratiflow_issue_tasks_v4 set status = 'COMPLETED',
          result_outcome = 'COMMITTED', result_summary = p_input->>'resultSummary',
          result_evidence_refs = v_evidence,
          result_source_revision = (p_input->>'basedOnRevision')::bigint,
          result_revision = v_document.revision + 1,
          result_live_anchor = ratiflow_document_private.anchor_json_v4(
            anchor_scope, anchor_field, range_start, range_end, selected_text,
            created_revision, anchor_revision, anchor_state
          ),
          result_replacement_text = v_replacement, submitted_at = v_at,
          updated_at = v_at, resolved_at = v_at where task_id = v_task.task_id;
        v_revision := ratiflow_document_private.append_revision_v4(
          p_document_id => v_document.id, p_title => v_next_title, p_body => v_next_body,
          p_source_revision => (p_input->>'basedOnRevision')::bigint,
          p_authority => 'DIRECT', p_task_id => v_task.task_id,
          p_author_member_id => v_session.member_id,
          p_author_display_name => v_session.display_name,
          p_author_agent_label => v_task.agent_label,
          p_committer_member_id => v_session.member_id,
          p_committer_display_name => v_session.display_name,
          p_committer_agent_label => v_task.agent_label,
          p_granted_by_member_id => v_task.creator_member_id,
          p_granted_by_display_name => v_task.creator_display_name,
          p_approved_by_member_id => null, p_approved_by_display_name => null,
          p_restored_revision => null, p_change_summary => p_input->>'resultSummary',
          p_evidence_refs => v_evidence, p_activity_kind => 'TASK_COMPLETED',
          p_at => v_at, p_own_task_id => v_task.task_id,
          p_own_field => v_task.anchor_field, p_own_replacement => v_replacement);
        update public.ratiflow_issue_threads_v4 set status = 'RESOLVED',
          resolved_by_member_id = v_session.member_id,
          resolved_by_display_name = v_session.display_name, resolved_at = v_at
        where thread_id = v_task.thread_id;
        v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
          'outcome', 'COMMITTED', 'task', ratiflow_document_private.task_json_v4(v_task.task_id),
          'revision', v_revision, 'activityVersion', v_document.activity_version + 1));
      end if;
    end if;
  else
    return ratiflow_document_private.invalid_v4('Unknown agent mutation operation.');
  end if;
  return ratiflow_document_private.record_v4(
    v_document.id, v_request_id, p_operation, v_session.member_id,
    'AGENT', p_input, v_result);
end;
$$;

create or replace function public.ratiflow_save_issue_revision_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'SAVE_ISSUE_REVISION_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('SAVE_ISSUE_REVISION_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_create_issue_task_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'CREATE_ISSUE_TASK_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('CREATE_ISSUE_TASK_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_create_issue_thread_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'CREATE_ISSUE_THREAD_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('CREATE_ISSUE_THREAD_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_add_issue_comment_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'ADD_ISSUE_COMMENT_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('ADD_ISSUE_COMMENT_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_resolve_issue_thread_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'RESOLVE_ISSUE_THREAD_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('RESOLVE_ISSUE_THREAD_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_cancel_issue_task_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'CANCEL_ISSUE_TASK_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('CANCEL_ISSUE_TASK_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_accept_issue_task_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'ACCEPT_ISSUE_TASK_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('ACCEPT_ISSUE_TASK_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_reject_issue_task_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'REJECT_ISSUE_TASK_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('REJECT_ISSUE_TASK_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_restore_issue_revision_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'RESTORE_ISSUE_REVISION_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('RESTORE_ISSUE_REVISION_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_touch_issue_presence_v4(p_handle text, p_input jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'TOUCH_ISSUE_PRESENCE_V4', p_handle, 'HUMAN', p_input,
  ratiflow_document_private.human_mutation_v4('TOUCH_ISSUE_PRESENCE_V4', p_handle, p_input)) $$;

create or replace function public.ratiflow_comment_on_issue_task_v4(
  p_handle text, p_page_session_id uuid, p_input jsonb
)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'COMMENT_ON_ISSUE_TASK_V4', p_handle, 'AGENT', p_input,
  ratiflow_document_private.agent_mutation_v4(
    'COMMENT_ON_ISSUE_TASK_V4', p_handle, p_page_session_id, p_input)) $$;

create or replace function public.ratiflow_submit_issue_task_result_v4(
  p_handle text, p_page_session_id uuid, p_input jsonb
)
returns jsonb language sql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select ratiflow_document_private.finish_mutation_v4(
  'SUBMIT_ISSUE_TASK_RESULT_V4', p_handle, 'AGENT', p_input,
  ratiflow_document_private.agent_mutation_v4(
    'SUBMIT_ISSUE_TASK_RESULT_V4', p_handle, p_page_session_id, p_input)) $$;

create or replace function ratiflow_document_private.immutable_revision_v4()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  raise exception 'issue revisions are immutable' using errcode = '23514';
end;
$$;

create or replace function ratiflow_document_private.immutable_comment_v4()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  raise exception 'issue comments are append-only' using errcode = '23514';
end;
$$;

create or replace function ratiflow_document_private.immutable_activity_v4()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  raise exception 'issue activity is immutable' using errcode = '23514';
end;
$$;

create or replace function ratiflow_document_private.immutable_task_identity_v4()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if new.task_id is distinct from old.task_id
    or new.document_id is distinct from old.document_id
    or new.task_key is distinct from old.task_key
    or new.title is distinct from old.title
    or new.category is distinct from old.category
    or new.instruction is distinct from old.instruction
    or new.agent_label is distinct from old.agent_label
    or new.mode is distinct from old.mode
    or new.creator_member_id is distinct from old.creator_member_id
    or new.creator_display_name is distinct from old.creator_display_name
    or new.assignee_member_id is distinct from old.assignee_member_id
    or new.assignee_display_name is distinct from old.assignee_display_name
    or new.thread_id is distinct from old.thread_id
    or new.creation_anchor is distinct from old.creation_anchor
    or old.proposal_live_anchor is not null
      and new.proposal_live_anchor is distinct from old.proposal_live_anchor
    or old.result_live_anchor is not null
      and new.result_live_anchor is distinct from old.result_live_anchor
    or old.result_replacement_text is not null
      and new.result_replacement_text is distinct from old.result_replacement_text
    or new.created_revision is distinct from old.created_revision
    or new.created_at is distinct from old.created_at then
    raise exception 'issue task authority and identity are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function ratiflow_document_private.immutable_thread_identity_v4()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if new.thread_id is distinct from old.thread_id
    or new.document_id is distinct from old.document_id
    or new.task_id is distinct from old.task_id
    or new.creation_anchor is distinct from old.creation_anchor
    or new.created_by_member_id is distinct from old.created_by_member_id
    or new.created_by_display_name is distinct from old.created_by_display_name
    or new.created_revision is distinct from old.created_revision
    or new.created_at is distinct from old.created_at then
    raise exception 'issue thread identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ratiflow_issue_revisions_immutable_v4
before update on public.ratiflow_issue_revisions_v4
for each row execute function ratiflow_document_private.immutable_revision_v4();
create trigger ratiflow_issue_comments_immutable_v4
before update on public.ratiflow_issue_comments_v4
for each row execute function ratiflow_document_private.immutable_comment_v4();
create trigger ratiflow_issue_activity_immutable_v4
before update on public.ratiflow_issue_activity_v4
for each row execute function ratiflow_document_private.immutable_activity_v4();
create trigger ratiflow_issue_task_identity_v4
before update on public.ratiflow_issue_tasks_v4
for each row execute function ratiflow_document_private.immutable_task_identity_v4();
create trigger ratiflow_issue_thread_identity_v4
before update on public.ratiflow_issue_threads_v4
for each row execute function ratiflow_document_private.immutable_thread_identity_v4();

revoke all on all functions in schema ratiflow_document_private
  from public, anon, authenticated;

revoke all on function public.ratiflow_launch_issue_v4(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.ratiflow_join_issue_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_inspect_issue_v4(text) from public, anon, authenticated;
revoke all on function public.ratiflow_save_issue_revision_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_create_issue_task_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_create_issue_thread_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_add_issue_comment_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_resolve_issue_thread_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_cancel_issue_task_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_accept_issue_task_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_reject_issue_task_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_restore_issue_revision_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_read_issue_history_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_read_issue_revision_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_list_my_issue_tasks_v4(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_comment_on_issue_task_v4(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_submit_issue_task_result_v4(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_touch_issue_presence_v4(text, jsonb) from public, anon, authenticated;
revoke all on function public.ratiflow_reset_postmortem_hero_v4() from public, anon, authenticated;

grant execute on function public.ratiflow_launch_issue_v4(jsonb, boolean),
  public.ratiflow_join_issue_v4(text, jsonb),
  public.ratiflow_inspect_issue_v4(text),
  public.ratiflow_save_issue_revision_v4(text, jsonb),
  public.ratiflow_create_issue_task_v4(text, jsonb),
  public.ratiflow_create_issue_thread_v4(text, jsonb),
  public.ratiflow_add_issue_comment_v4(text, jsonb),
  public.ratiflow_resolve_issue_thread_v4(text, jsonb),
  public.ratiflow_cancel_issue_task_v4(text, jsonb),
  public.ratiflow_accept_issue_task_v4(text, jsonb),
  public.ratiflow_reject_issue_task_v4(text, jsonb),
  public.ratiflow_restore_issue_revision_v4(text, jsonb),
  public.ratiflow_read_issue_history_v4(text, jsonb),
  public.ratiflow_read_issue_revision_v4(text, jsonb),
  public.ratiflow_list_my_issue_tasks_v4(text, uuid, jsonb),
  public.ratiflow_comment_on_issue_task_v4(text, uuid, jsonb),
  public.ratiflow_submit_issue_task_result_v4(text, uuid, jsonb),
  public.ratiflow_touch_issue_presence_v4(text, jsonb)
to anon, authenticated;

grant execute on function public.ratiflow_reset_postmortem_hero_v4() to service_role;
