-- Protocol v4.1 comment-first collaboration. This migration is deliberately
-- additive: the applied v4 tables remain the storage authority while the public
-- RPC boundary gains an explicit, backwards-compatible response contract.

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
      'CONNECT_ISSUE_AGENT_V4', 'CREATE_ISSUE_MENTION_V4'
    )
  );

create table public.ratiflow_issue_agent_profiles_v4 (
  profile_id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  member_id uuid not null,
  name text not null check (
    char_length(ratiflow_document_private.trim_ecmascript_v4(name)) between 1 and 80
    and name = ratiflow_document_private.trim_ecmascript_v4(name)
    and position('@' in name) = 0
    and position(chr(10) in name) = 0
    and position(chr(13) in name) = 0
  ),
  identity_source text not null default 'SELF_DECLARED'
    check (identity_source = 'SELF_DECLARED'),
  -- Never projected through public JSON. It prevents X -> Y -> X ABA reuse.
  identity_generation bigint not null default 1
    check (identity_generation between 1 and 9007199254740991),
  first_seen_at timestamptz not null default clock_timestamp(),
  last_accessed_at timestamptz not null default clock_timestamp(),
  access_count bigint not null default 1
    check (access_count between 0 and 9007199254740991),
  unique (document_id, member_id),
  unique (document_id, profile_id),
  foreign key (document_id, member_id)
    references public.ratiflow_document_members(document_id, member_id)
    on delete cascade
);

create index ratiflow_issue_agent_profiles_document_idx
  on public.ratiflow_issue_agent_profiles_v4 (document_id, member_id);

create table ratiflow_document_private.issue_agent_page_connections_v4 (
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  member_id uuid not null,
  session_instance_id uuid not null,
  page_session_id uuid not null,
  profile_id uuid not null,
  identity_generation bigint not null
    check (identity_generation between 1 and 9007199254740991),
  connected_at timestamptz not null default clock_timestamp(),
  primary key (document_id, member_id, session_instance_id, page_session_id),
  foreign key (document_id, member_id)
    references public.ratiflow_document_members(document_id, member_id)
    on delete cascade,
  foreign key (document_id, profile_id)
    references public.ratiflow_issue_agent_profiles_v4(document_id, profile_id)
    on delete cascade
);

create index ratiflow_issue_agent_page_connections_profile_idx
  on ratiflow_document_private.issue_agent_page_connections_v4
    (document_id, profile_id, identity_generation);

create table ratiflow_document_private.issue_agent_wait_leases_v4 (
  document_id uuid not null references public.ratiflow_documents(id) on delete cascade,
  member_id uuid not null,
  session_instance_id uuid not null,
  page_session_id uuid not null,
  lease_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (document_id, member_id, session_instance_id, page_session_id),
  foreign key (document_id, member_id)
    references public.ratiflow_document_members(document_id, member_id)
    on delete cascade
);

create index ratiflow_issue_agent_wait_leases_expiry_idx
  on ratiflow_document_private.issue_agent_wait_leases_v4 (expires_at);

alter table public.ratiflow_issue_tasks_v4
  add column agent_profile_id uuid,
  add column context_snapshot jsonb;

alter table public.ratiflow_issue_tasks_v4
  add constraint ratiflow_issue_tasks_agent_profile_fk
    foreign key (document_id, agent_profile_id)
    references public.ratiflow_issue_agent_profiles_v4(document_id, profile_id),
  add constraint ratiflow_issue_tasks_context_shape_check check (
    (agent_profile_id is null and context_snapshot is null)
    or (agent_profile_id is not null
      and jsonb_typeof(context_snapshot) = 'object'
      and context_snapshot ?& array[
        'sourceRevision','sourceDigest','documentTitle','field','rangeStart','rangeEnd',
        'targetText','beforeText','afterText','priorContext'
      ]
      and (context_snapshot - array[
        'sourceRevision','sourceDigest','documentTitle','field','rangeStart','rangeEnd',
        'targetText','beforeText','afterText','priorContext'
      ]) = '{}'::jsonb
      and (context_snapshot->>'sourceRevision') ~ '^[1-9][0-9]*$'
      and (context_snapshot->>'sourceDigest') ~ '^sha256:[0-9a-f]{64}$'
      and char_length(context_snapshot->>'documentTitle') between 1 and 160
      and context_snapshot->>'field' in ('TITLE','BODY')
      and (context_snapshot->>'rangeStart') ~ '^[0-9]+$'
      and (context_snapshot->>'rangeEnd') ~ '^[0-9]+$'
      and (context_snapshot->>'rangeEnd')::bigint > (context_snapshot->>'rangeStart')::bigint
      and char_length(context_snapshot->>'targetText') between 1 and 50000
      and char_length(context_snapshot->>'beforeText') <= 600
      and char_length(context_snapshot->>'afterText') <= 600
      and jsonb_typeof(context_snapshot->'priorContext') = 'array'
      and jsonb_array_length(context_snapshot->'priorContext') <= 10)
  );

-- The applied identity trigger intentionally froze the original v4 fields. Replace
-- only its body so the two v4.1 authority fields become immutable too.
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
    or new.agent_profile_id is distinct from old.agent_profile_id
    or new.context_snapshot is distinct from old.context_snapshot
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

-- Backfill comment provenance from the first activity that actually references the
-- comment. The immutable thread creation revision is the only compatibility fallback.
alter table public.ratiflow_issue_comments_v4 add column created_revision bigint;
alter table public.ratiflow_issue_comments_v4
  disable trigger ratiflow_issue_comments_immutable_v4;

update public.ratiflow_issue_comments_v4 c
set created_revision = coalesce(
  (
    select a.revision
    from public.ratiflow_issue_activity_v4 a
    where a.document_id = c.document_id and a.comment_id = c.comment_id
    order by a.activity_version, a.activity_id
    limit 1
  ),
  (
    select t.created_revision
    from public.ratiflow_issue_threads_v4 t
    where t.document_id = c.document_id and t.thread_id = c.thread_id
      and not exists (
        select 1 from public.ratiflow_issue_activity_v4 a
        where a.document_id = c.document_id and a.comment_id = c.comment_id
      )
  )
);

do $$
begin
  if exists (
    select 1 from public.ratiflow_issue_comments_v4 where created_revision is null
  ) then
    raise exception 'comment created_revision backfill is incomplete';
  end if;
end;
$$;

alter table public.ratiflow_issue_comments_v4
  alter column created_revision set not null,
  add constraint ratiflow_issue_comments_created_revision_check
    check (created_revision between 1 and 9007199254740991);

alter table public.ratiflow_issue_comments_v4
  enable trigger ratiflow_issue_comments_immutable_v4;

create or replace function ratiflow_document_private.set_comment_created_revision_v41()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if new.created_revision is null then
    select d.revision into strict new.created_revision
    from public.ratiflow_documents d
    where d.id = new.document_id and d.protocol_version = 4;
  end if;
  return new;
end;
$$;

create trigger ratiflow_issue_comment_created_revision_v41
before insert on public.ratiflow_issue_comments_v4
for each row execute function ratiflow_document_private.set_comment_created_revision_v41();

alter table public.ratiflow_issue_agent_profiles_v4 enable row level security;
alter table public.ratiflow_issue_agent_profiles_v4 force row level security;
revoke all on public.ratiflow_issue_agent_profiles_v4 from public, anon, authenticated;
revoke all on ratiflow_document_private.issue_agent_page_connections_v4
  from public, anon, authenticated;
revoke all on ratiflow_document_private.issue_agent_wait_leases_v4
  from public, anon, authenticated;

create or replace function ratiflow_document_private.response_contract_v41(p_value text)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ select p_value in ('v4', 'v4.1') $$;

create or replace function ratiflow_document_private.profile_json_v41(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'profileId', p.profile_id,
    'member', ratiflow_document_private.member_json_v4(m.member_id, m.display_name),
    'name', p.name,
    'identitySource', p.identity_source,
    'firstSeenAt', p.first_seen_at,
    'lastAccessedAt', p.last_accessed_at,
    'accessCount', p.access_count
  )
  from public.ratiflow_issue_agent_profiles_v4 p
  join public.ratiflow_document_members m
    on m.document_id = p.document_id and m.member_id = p.member_id
  where p.profile_id = p_profile_id
$$;

create or replace function ratiflow_document_private.actor_json_v41(
  p_actor_type text,
  p_member_id uuid,
  p_member_display_name text,
  p_agent_label text default null,
  p_agent_profile_id uuid default null
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case when p_actor_type = 'AGENT' then jsonb_build_object(
    'actorType', p_actor_type,
    'displayName', p_agent_label,
    'member', ratiflow_document_private.member_json_v4(
      p_member_id, p_member_display_name
    ),
    'agentProfileId', p_agent_profile_id,
    'agentLabel', p_agent_label
  ) else jsonb_build_object(
    'actorType', p_actor_type,
    'displayName', p_member_display_name,
    'member', case when p_actor_type = 'SYSTEM' then null else
      ratiflow_document_private.member_json_v4(
        p_member_id, p_member_display_name
      ) end,
    'agentLabel', null
  ) end
$$;

create or replace function ratiflow_document_private.comment_json_v41(p_comment_id uuid)
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
    'author', ratiflow_document_private.actor_json_v41(
      c.author_actor_type, c.author_member_id, c.author_display_name,
      c.author_agent_label,
      case when c.author_actor_type = 'AGENT' then t.agent_profile_id end
    ),
    'origin', c.origin,
    'createdRevision', c.created_revision,
    'body', c.body,
    'evidenceRefs', to_jsonb(c.evidence_refs),
    'createdAt', c.created_at
  )
  from public.ratiflow_issue_comments_v4 c
  join public.ratiflow_issue_threads_v4 th
    on th.document_id = c.document_id and th.thread_id = c.thread_id
  left join public.ratiflow_issue_tasks_v4 t
    on t.document_id = th.document_id and t.task_id = th.task_id
  where c.comment_id = p_comment_id
$$;

create or replace function ratiflow_document_private.thread_json_v41(p_thread_id uuid)
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
      select jsonb_agg(ratiflow_document_private.comment_json_v41(c.comment_id)
        order by c.created_at, c.comment_id)
      from public.ratiflow_issue_comments_v4 c
      where c.document_id = t.document_id and c.thread_id = t.thread_id
    ), '[]'::jsonb)
  )
  from public.ratiflow_issue_threads_v4 t
  where t.thread_id = p_thread_id
$$;

create or replace function ratiflow_document_private.task_action_label_v41(
  p_document_id uuid,
  p_task_id uuid,
  p_kind text,
  p_fallback text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select coalesce((
    select a.actor_display_name
    from public.ratiflow_issue_activity_v4 a
    where a.document_id = p_document_id and a.task_id = p_task_id
      and a.kind = p_kind and a.actor_type = 'AGENT'
    order by a.activity_version desc
    limit 1
  ), p_fallback)
$$;

create or replace function ratiflow_document_private.task_json_v41(p_task_id uuid)
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
    'agentProfileId', t.agent_profile_id,
    'context', t.context_snapshot,
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
      'proposedBy', ratiflow_document_private.actor_json_v41(
        'AGENT', t.assignee_member_id, t.assignee_display_name,
        ratiflow_document_private.task_action_label_v41(
          t.document_id, t.task_id, 'TASK_PROPOSED', t.agent_label
        ), t.agent_profile_id
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
      'submittedBy', ratiflow_document_private.actor_json_v41(
        'AGENT', t.assignee_member_id, t.assignee_display_name,
        ratiflow_document_private.task_action_label_v41(
          t.document_id, t.task_id, 'TASK_COMPLETED', t.agent_label
        ), t.agent_profile_id
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

create or replace function ratiflow_document_private.revision_json_v41(
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
      'author', ratiflow_document_private.actor_json_v41(
        r.author_actor_type, r.author_member_id, r.author_display_name,
        r.author_agent_label, t.agent_profile_id
      ),
      'committer', ratiflow_document_private.actor_json_v41(
        r.committer_actor_type, r.committer_member_id, r.committer_display_name,
        r.committer_agent_label,
        case when r.committer_actor_type = 'AGENT' then t.agent_profile_id end
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
  left join public.ratiflow_issue_tasks_v4 t
    on t.document_id = r.document_id and t.task_id = r.task_id
  where r.document_id = p_document_id and r.revision = p_revision
$$;

create or replace function ratiflow_document_private.document_json_v41(p_document_id uuid)
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
      'author', ratiflow_document_private.actor_json_v41(
        r.author_actor_type, r.author_member_id, r.author_display_name,
        r.author_agent_label, t.agent_profile_id
      ),
      'authority', r.authority,
      'summary', r.change_summary
    )
  )
  from public.ratiflow_documents d
  join public.ratiflow_issue_revisions_v4 r
    on r.document_id = d.id and r.revision = d.revision
  left join public.ratiflow_issue_tasks_v4 t
    on t.document_id = r.document_id and t.task_id = r.task_id
  where d.id = p_document_id and d.protocol_version = 4
    and d.expires_at > clock_timestamp()
$$;

create or replace function ratiflow_document_private.surface_v41(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'document', ratiflow_document_private.document_json_v41(d.id),
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
        where p.document_id = d.id
          and p.last_seen_at > clock_timestamp() - interval '15 seconds'
        order by p.member_id, p.last_seen_at desc, p.session_instance_id
      ) recent
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(ratiflow_document_private.member_json_v4(m.member_id, m.display_name)
        order by m.display_name, m.member_id)
      from public.ratiflow_document_members m where m.document_id = d.id
    ), '[]'::jsonb),
    'agents', coalesce((
      select jsonb_agg(ratiflow_document_private.profile_json_v41(p.profile_id)
        order by p.name, p.member_id)
      from public.ratiflow_issue_agent_profiles_v4 p where p.document_id = d.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(ratiflow_document_private.task_json_v41(t.task_id)
        order by case when t.status in ('OPEN', 'PROPOSED') then 0 else 1 end,
          t.updated_at desc, t.task_id)
      from public.ratiflow_issue_tasks_v4 t where t.document_id = d.id
    ), '[]'::jsonb),
    'threads', coalesce((
      select jsonb_agg(ratiflow_document_private.thread_json_v41(t.thread_id)
        order by case when t.task_id is not null then 0 else 1 end,
          case when task.status in ('OPEN', 'PROPOSED') then 0 else 1 end,
          coalesce(task.updated_at, t.created_at) desc,
          coalesce(task.task_id, t.thread_id))
      from public.ratiflow_issue_threads_v4 t
      left join public.ratiflow_issue_tasks_v4 task
        on task.document_id = t.document_id and task.task_id = t.task_id
      where t.document_id = d.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(ratiflow_document_private.revision_json_v41(
          d.id, recent.revision, false
        ) order by recent.revision desc)
      from (
        select r.revision from public.ratiflow_issue_revisions_v4 r
        where r.document_id = d.id order by r.revision desc limit 20
      ) recent
    ), '[]'::jsonb),
    'hasMoreHistory', d.revision > 20
  )
  from public.ratiflow_documents d
  where d.id = p_document_id and d.protocol_version = 4
    and d.expires_at > clock_timestamp()
$$;

create or replace function ratiflow_document_private.session_bundle_v41(
  p_legacy_bundle jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select (p_legacy_bundle - 'surface') || jsonb_build_object(
    'surface', ratiflow_document_private.surface_v41(
      ((p_legacy_bundle->'surface'->'document'->>'id')::uuid)
    )
  )
$$;

create or replace function ratiflow_document_private.request_fingerprint_v41(
  p_operation text,
  p_member_id uuid,
  p_actor_type text,
  p_input jsonb,
  p_session_instance_id uuid default null,
  p_page_session_id uuid default null
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'responseContract', 'v4.1',
    'operation', p_operation,
    'memberId', p_member_id,
    'actorType', p_actor_type,
    'credentialSessionInstanceId', p_session_instance_id,
    'pageSessionId', p_page_session_id,
    'input', p_input
  )::text, 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function ratiflow_document_private.replay_v41(
  p_document_id uuid,
  p_request_id uuid,
  p_operation text,
  p_member_id uuid,
  p_actor_type text,
  p_input jsonb,
  p_session_instance_id uuid default null,
  p_page_session_id uuid default null
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
  v_fingerprint := ratiflow_document_private.request_fingerprint_v41(
    p_operation, p_member_id, p_actor_type, p_input,
    p_session_instance_id, p_page_session_id
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

create or replace function ratiflow_document_private.record_v41(
  p_document_id uuid,
  p_request_id uuid,
  p_operation text,
  p_member_id uuid,
  p_actor_type text,
  p_input jsonb,
  p_result jsonb,
  p_session_instance_id uuid default null,
  p_page_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if p_result->>'ok' = 'false' and p_result->>'code' in (
    'UNAUTHORIZED', 'AGENT_IDENTITY_REQUIRED', 'STALE_PAGE_CONTEXT'
  ) then
    return p_result;
  end if;
  insert into public.ratiflow_document_request_ledger (
    document_id, request_id, operation, fingerprint, result
  ) values (
    p_document_id, p_request_id, p_operation,
    ratiflow_document_private.request_fingerprint_v41(
      p_operation, p_member_id, p_actor_type, p_input,
      p_session_instance_id, p_page_session_id
    ),
    p_result
  );
  return p_result;
end;
$$;

create or replace function ratiflow_document_private.connected_agent_v41(
  p_handle text,
  p_page_session_id uuid
)
returns table (
  document_id uuid,
  member_id uuid,
  display_name text,
  session_instance_id uuid,
  profile_id uuid,
  agent_name text,
  identity_generation bigint
)
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select s.document_id, s.member_id, s.display_name, s.session_instance_id,
    p.profile_id, p.name, p.identity_generation
  from ratiflow_document_private.member_for_handle_v4(p_handle) s
  join public.ratiflow_issue_agent_profiles_v4 p
    on p.document_id = s.document_id and p.member_id = s.member_id
  join ratiflow_document_private.issue_agent_page_connections_v4 c
    on c.document_id = s.document_id and c.member_id = s.member_id
    and c.session_instance_id = s.session_instance_id
    and c.page_session_id = p_page_session_id
    and c.profile_id = p.profile_id
    and c.identity_generation = p.identity_generation
  where s.actor_type = 'AGENT' and p_page_session_id is not null
$$;

create or replace function ratiflow_document_private.agent_identity_failure_v41(
  p_handle text,
  p_page_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
begin
  if p_page_session_id is null then
    return ratiflow_document_private.error_v4(
      'STALE_PAGE_CONTEXT', 'A valid page session is required.', false
    );
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized_v4(
      'A valid delegated-agent session is required.'
    );
  end if;
  return ratiflow_document_private.error_v4(
    'AGENT_IDENTITY_REQUIRED',
    'Call connect_agent for this page before using another agent tool.',
    false
  );
end;
$$;

create or replace function ratiflow_document_private.activity_actor_json_v41(
  p_activity_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.actor_json_v41(
    a.actor_type,
    a.actor_member_id,
    case when a.actor_type = 'AGENT' then m.display_name else a.actor_display_name end,
    case when a.actor_type = 'AGENT' then a.actor_display_name end,
    case when a.actor_type = 'AGENT' then t.agent_profile_id end
  )
  from public.ratiflow_issue_activity_v4 a
  left join public.ratiflow_document_members m
    on m.document_id = a.document_id and m.member_id = a.actor_member_id
  left join public.ratiflow_issue_tasks_v4 t
    on t.document_id = a.document_id and t.task_id = a.task_id
  where a.activity_id = p_activity_id
$$;

create or replace function ratiflow_document_private.prior_context_v41(
  p_document_id uuid,
  p_before_activity_version bigint
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'activityVersion', selected.activity_version,
    'kind', selected.kind,
    'documentRevision', selected.revision,
    'revisionId', selected.revision_id,
    'taskId', selected.task_id,
    'threadId', selected.thread_id,
    'commentId', selected.comment_id,
    'actor', ratiflow_document_private.activity_actor_json_v41(selected.activity_id),
    'excerpt', left(coalesce(
      c.body,
      r.change_summary,
      task.instruction,
      root_comment.body,
      d.title
    ), 600)
  ) order by selected.activity_version desc), '[]'::jsonb)
  from (
    select a.*
    from public.ratiflow_issue_activity_v4 a
    where a.document_id = p_document_id
      and a.activity_version < p_before_activity_version
    order by a.activity_version desc
    limit 10
  ) selected
  join public.ratiflow_documents d on d.id = selected.document_id
  left join public.ratiflow_issue_comments_v4 c
    on c.document_id = selected.document_id and c.comment_id = selected.comment_id
  left join public.ratiflow_issue_revisions_v4 r
    on r.document_id = selected.document_id and r.revision_id = selected.revision_id
  left join public.ratiflow_issue_tasks_v4 task
    on task.document_id = selected.document_id and task.task_id = selected.task_id
  left join lateral (
    select first_comment.body
    from public.ratiflow_issue_comments_v4 first_comment
    where first_comment.document_id = selected.document_id
      and first_comment.thread_id = selected.thread_id
    order by first_comment.created_at, first_comment.comment_id
    limit 1
  ) root_comment on true
$$;

create or replace function public.ratiflow_connect_issue_agent_v4(
  p_handle text,
  p_page_session_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_profile public.ratiflow_issue_agent_profiles_v4%rowtype;
declare v_request_id uuid;
declare v_name text;
declare v_at timestamptz;
declare v_replay jsonb;
declare v_result jsonb;
begin
  if p_page_session_id is null then
    return ratiflow_document_private.error_v4(
      'STALE_PAGE_CONTEXT', 'A valid page session is required.', false
    );
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized_v4(
      'A valid delegated-agent session is required.'
    );
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_session.document_id and protocol_version = 4
    and expires_at > clock_timestamp()
  for update;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId') then
    return ratiflow_document_private.invalid_v4('A UUID requestId is required.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  v_replay := ratiflow_document_private.replay_v41(
    v_document.id, v_request_id, 'CONNECT_ISSUE_AGENT_V4',
    v_session.member_id, 'AGENT', p_input,
    v_session.session_instance_id, p_page_session_id
  );
  if v_replay is not null then return v_replay; end if;
  if not ratiflow_document_private.input_v4(
      p_input, array['requestId','name'], '{}')
    or not ratiflow_document_private.text_v4(p_input->'name', 80, false)
    or p_input->>'name' <> ratiflow_document_private.trim_ecmascript_v4(p_input->>'name')
    or position('@' in p_input->>'name') > 0
    or position(chr(10) in p_input->>'name') > 0
    or position(chr(13) in p_input->>'name') > 0 then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CONNECT_ISSUE_AGENT_V4',
      v_session.member_id, 'AGENT', p_input,
      ratiflow_document_private.invalid_v4(
        'A valid self-declared agent name is required.'
      ), v_session.session_instance_id, p_page_session_id
    );
  end if;
  v_name := p_input->>'name';

  select * into v_profile from public.ratiflow_issue_agent_profiles_v4
  where document_id = v_document.id and member_id = v_session.member_id
  for update;
  v_at := greatest(clock_timestamp(), coalesce(v_profile.last_accessed_at,
    v_document.updated_at) + interval '1 microsecond');
  if not found then
    insert into public.ratiflow_issue_agent_profiles_v4 (
      document_id, member_id, name, identity_generation,
      first_seen_at, last_accessed_at, access_count
    ) values (
      v_document.id, v_session.member_id, v_name, 1, v_at, v_at, 1
    ) returning * into v_profile;
  else
    update public.ratiflow_issue_agent_profiles_v4
    set name = v_name,
      identity_generation = case when name = v_name
        then identity_generation else identity_generation + 1 end,
      last_accessed_at = v_at,
      access_count = access_count + 1
    where profile_id = v_profile.profile_id
    returning * into v_profile;
  end if;

  insert into ratiflow_document_private.issue_agent_page_connections_v4 (
    document_id, member_id, session_instance_id, page_session_id,
    profile_id, identity_generation, connected_at
  ) values (
    v_document.id, v_session.member_id, v_session.session_instance_id,
    p_page_session_id, v_profile.profile_id, v_profile.identity_generation, v_at
  ) on conflict (document_id, member_id, session_instance_id, page_session_id)
  do update set profile_id = excluded.profile_id,
    identity_generation = excluded.identity_generation,
    connected_at = excluded.connected_at;

  v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'profile', ratiflow_document_private.profile_json_v41(v_profile.profile_id),
    'revision', v_document.revision,
    'activityVersion', v_document.activity_version
  ));
  return ratiflow_document_private.record_v41(
    v_document.id, v_request_id, 'CONNECT_ISSUE_AGENT_V4',
    v_session.member_id, 'AGENT', p_input, v_result,
    v_session.session_instance_id, p_page_session_id
  );
end;
$$;

create or replace function public.ratiflow_begin_issue_task_wait_v4(
  p_handle text,
  p_page_session_id uuid,
  p_lease_id uuid,
  p_deadline timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_agent record;
declare v_acquired uuid;
declare v_expires timestamptz;
begin
  select * into v_agent from ratiflow_document_private.connected_agent_v41(
    p_handle, p_page_session_id
  );
  if not found then
    return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    );
  end if;
  if p_lease_id is null or p_deadline is null
    or p_deadline < clock_timestamp()
    or p_deadline > clock_timestamp() + interval '20 seconds' then
    return ratiflow_document_private.invalid_v4('The wait lease input is invalid.');
  end if;
  v_expires := p_deadline + interval '5 seconds';
  insert into ratiflow_document_private.issue_agent_wait_leases_v4 (
    document_id, member_id, session_instance_id, page_session_id,
    lease_id, expires_at
  ) values (
    v_agent.document_id, v_agent.member_id, v_agent.session_instance_id,
    p_page_session_id, p_lease_id, v_expires
  ) on conflict (document_id, member_id, session_instance_id, page_session_id)
  do update set lease_id = excluded.lease_id,
    expires_at = excluded.expires_at,
    created_at = clock_timestamp()
  where ratiflow_document_private.issue_agent_wait_leases_v4.expires_at
    < clock_timestamp()
  returning lease_id into v_acquired;
  if v_acquired is null then
    return ratiflow_document_private.error_v4(
      'WAIT_ALREADY_ACTIVE', 'Only one task wait may be active for this page.', false
    );
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'leaseId', v_acquired, 'expiresAt', v_expires
  ));
end;
$$;

create or replace function public.ratiflow_end_issue_task_wait_v4(
  p_handle text,
  p_page_session_id uuid,
  p_lease_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
begin
  if p_page_session_id is null then
    return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    );
  end if;
  select * into v_session
  from ratiflow_document_private.member_for_handle_v4(p_handle)
  where actor_type = 'AGENT';
  if not found then
    return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    );
  end if;
  if p_lease_id is null then
    return ratiflow_document_private.invalid_v4('A wait lease UUID is required.');
  end if;
  delete from ratiflow_document_private.issue_agent_wait_leases_v4
  where document_id = v_session.document_id
    and member_id = v_session.member_id
    and session_instance_id = v_session.session_instance_id
    and page_session_id = p_page_session_id
    and lease_id = p_lease_id;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('released', true));
end;
$$;

create or replace function public.ratiflow_create_issue_mention_v4(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_profile public.ratiflow_issue_agent_profiles_v4%rowtype;
declare v_member public.ratiflow_document_members%rowtype;
declare v_anchor jsonb;
declare v_context jsonb;
declare v_request_id uuid;
declare v_expected bigint;
declare v_comment text;
declare v_name text;
declare v_instruction text;
declare v_title text;
declare v_source text;
declare v_task_id uuid := extensions.gen_random_uuid();
declare v_thread_id uuid := extensions.gen_random_uuid();
declare v_comment_id uuid := extensions.gen_random_uuid();
declare v_at timestamptz;
declare v_replay jsonb;
declare v_result jsonb;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized_v4('A valid human session is required.');
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_session.document_id and protocol_version = 4
    and expires_at > clock_timestamp()
  for update;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId') then
    return ratiflow_document_private.invalid_v4('A UUID requestId is required.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  v_replay := ratiflow_document_private.replay_v41(
    v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
    v_session.member_id, 'HUMAN', p_input
  );
  if v_replay is not null then return v_replay; end if;
  if not ratiflow_document_private.input_v4(p_input, array[
      'requestId','expectedRevision','comment','mentionedAgentName',
      'assignedToMemberId','anchor'
    ], '{}')
    or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
    or not ratiflow_document_private.text_v4(p_input->'comment', 2000, false)
    or not ratiflow_document_private.text_v4(p_input->'mentionedAgentName', 80, false)
    or not ratiflow_document_private.uuid_v4(p_input->'assignedToMemberId') then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.invalid_v4('The @ mention input is invalid.')
    );
  end if;
  v_expected := (p_input->>'expectedRevision')::bigint;
  v_comment := p_input->>'comment';
  v_name := p_input->>'mentionedAgentName';
  if v_expected <> v_document.revision then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.stale_document_v4(v_document.id, v_expected)
    );
  end if;

  select p.* into v_profile
  from public.ratiflow_issue_agent_profiles_v4 p
  join public.ratiflow_document_members m
    on m.document_id = p.document_id and m.member_id = p.member_id
  where p.document_id = v_document.id
    and p.member_id = (p_input->>'assignedToMemberId')::uuid
  for share of p, m;
  if not found or v_profile.name <> v_name then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.error_v4(
        'STALE_AGENT_PROFILE',
        'The selected agent profile changed. Choose the agent again.',
        false
      )
    );
  end if;
  select m.* into strict v_member
  from public.ratiflow_document_members m
  where m.document_id = v_profile.document_id
    and m.member_id = v_profile.member_id;

  if left(v_comment, char_length(v_name) + 1) <> ('@' || v_name)
    or char_length(v_comment) <= char_length(v_name) + 1
    or substring(v_comment from char_length(v_name) + 2 for 1)
      not in (' ', chr(9), chr(10), chr(13)) then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.invalid_v4(
        'The comment must begin with the selected @ agent and an instruction.'
      )
    );
  end if;
  v_instruction := btrim(
    substring(v_comment from char_length(v_name) + 2), E' \t\r\n'
  );
  if char_length(v_instruction) = 0 or char_length(v_instruction) > 1000 then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.invalid_v4('The compiled @ instruction is invalid.')
    );
  end if;
  v_title := left(regexp_replace(v_instruction, E'[ \t\r\n]+', ' ', 'g'), 120);
  v_anchor := ratiflow_document_private.anchor_from_input_v4(v_document.id, p_input->'anchor');
  if v_anchor is null or v_anchor->>'scope' <> 'SELECTION'
    or v_anchor->>'anchorState' <> 'ACTIVE' then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.invalid_v4('An active non-empty selection is required.')
    );
  end if;
  if (select count(*) from public.ratiflow_issue_tasks_v4
      where document_id = v_document.id) >= 500
    or (select count(*) from public.ratiflow_issue_tasks_v4
      where document_id = v_document.id and status in ('OPEN','PROPOSED')) >= 100
    or (select count(*) from public.ratiflow_issue_tasks_v4
      where document_id = v_document.id and assignee_member_id = v_member.member_id
        and status in ('OPEN','PROPOSED')) >= 50 then
    return ratiflow_document_private.record_v41(
      v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.error_v4(
        'RATE_LIMITED', 'The task capacity has been reached.', false
      )
    );
  end if;

  v_source := case when v_anchor->>'field' = 'TITLE'
    then v_document.title else v_document.body end;
  v_context := jsonb_build_object(
    'sourceRevision', v_document.revision,
    'sourceDigest', ratiflow_document_private.content_digest_v4(
      v_document.title, v_document.body
    ),
    'documentTitle', v_document.title,
    'field', v_anchor->>'field',
    'rangeStart', (v_anchor->>'rangeStart')::bigint,
    'rangeEnd', (v_anchor->>'rangeEnd')::bigint,
    'targetText', v_anchor->>'selectedText',
    'beforeText', right(left(v_source, (v_anchor->>'rangeStart')::integer), 600),
    'afterText', left(substring(
      v_source from (v_anchor->>'rangeEnd')::integer + 1
    ), 600),
    'priorContext', ratiflow_document_private.prior_context_v41(
      v_document.id, v_document.activity_version + 1
    )
  );
  v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
  insert into public.ratiflow_issue_tasks_v4 (
    task_id, document_id, task_key, title, category, instruction, agent_label,
    agent_profile_id, context_snapshot, mode, creator_member_id,
    creator_display_name, assignee_member_id, assignee_display_name, thread_id,
    creation_anchor, anchor_scope, anchor_field, range_start, range_end,
    selected_text, created_revision, anchor_revision, anchor_state,
    created_at, updated_at
  ) values (
    v_task_id, v_document.id,
    'TASK-' || ((select count(*) + 1 from public.ratiflow_issue_tasks_v4
      where document_id = v_document.id)::text),
    v_title, 'GENERAL', v_instruction, v_profile.name,
    v_profile.profile_id, v_context, 'DIRECT', v_session.member_id,
    v_session.display_name, v_member.member_id, v_member.display_name, v_thread_id,
    v_anchor, 'SELECTION', v_anchor->>'field',
    (v_anchor->>'rangeStart')::bigint, (v_anchor->>'rangeEnd')::bigint,
    v_anchor->>'selectedText', v_document.revision, v_document.revision, 'ACTIVE',
    v_at, v_at
  );
  insert into public.ratiflow_issue_threads_v4 (
    thread_id, document_id, task_id, creation_anchor, anchor_scope, anchor_field,
    range_start, range_end, selected_text, created_revision, anchor_revision,
    anchor_state, created_by_member_id, created_by_display_name, created_at
  ) values (
    v_thread_id, v_document.id, v_task_id, v_anchor, 'SELECTION',
    v_anchor->>'field', (v_anchor->>'rangeStart')::bigint,
    (v_anchor->>'rangeEnd')::bigint, v_anchor->>'selectedText',
    v_document.revision, v_document.revision, 'ACTIVE', v_session.member_id,
    v_session.display_name, v_at
  );
  insert into public.ratiflow_issue_comments_v4 (
    comment_id, document_id, thread_id, author_actor_type, author_member_id,
    author_display_name, origin, created_revision, body, created_at
  ) values (
    v_comment_id, v_document.id, v_thread_id, 'HUMAN', v_session.member_id,
    v_session.display_name, 'ORDINARY_UI', v_document.revision, v_comment, v_at
  );
  perform ratiflow_document_private.bump_activity_v4(
    v_document.id, 'TASK_CREATED', 'HUMAN', v_session.member_id,
    v_session.display_name, 'ORDINARY_UI', null, v_task_id, v_thread_id,
    v_comment_id, v_at
  );
  v_result := jsonb_build_object(
    'ok', true, 'data', ratiflow_document_private.surface_v41(v_document.id)
  );
  return ratiflow_document_private.record_v41(
    v_document.id, v_request_id, 'CREATE_ISSUE_MENTION_V4',
    v_session.member_id, 'HUMAN', p_input, v_result
  );
end;
$$;

create or replace function public.ratiflow_read_issue_collaboration_context_v4(
  p_handle text,
  p_page_session_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_agent record;
declare v_document public.ratiflow_documents%rowtype;
declare v_before bigint;
declare v_limit integer;
declare v_rows jsonb;
declare v_oldest bigint;
begin
  select * into v_agent from ratiflow_document_private.connected_agent_v41(
    p_handle, p_page_session_id
  );
  if not found then
    return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    );
  end if;
  if not ratiflow_document_private.input_v4(
      p_input, '{}', array['beforeActivityVersion','limit'])
    or (p_input ? 'beforeActivityVersion' and not
      ratiflow_document_private.counter_v4(p_input->'beforeActivityVersion', 1))
    or (p_input ? 'limit' and not
      ratiflow_document_private.counter_v4(p_input->'limit', 1, 50)) then
    return ratiflow_document_private.invalid_v4('The collaboration-context input is invalid.');
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_agent.document_id and protocol_version = 4
    and expires_at > clock_timestamp();
  v_before := coalesce(
    (p_input->>'beforeActivityVersion')::bigint,
    v_document.activity_version + 1
  );
  v_limit := coalesce((p_input->>'limit')::integer, 20);
  select coalesce(jsonb_agg(jsonb_build_object(
      'activityId', selected.activity_id,
      'activityVersion', selected.activity_version,
      'kind', selected.kind,
      'documentRevision', selected.revision,
      'actor', ratiflow_document_private.activity_actor_json_v41(selected.activity_id),
      'createdAt', selected.created_at,
      'revision', case when selected.revision_id is null then null else
        ratiflow_document_private.revision_json_v41(
          selected.document_id, selected.revision, false
        ) end,
      'task', case when selected.task_id is null then null else
        ratiflow_document_private.task_json_v41(selected.task_id) end,
      'thread', case when selected.thread_id is null then null else
        ratiflow_document_private.thread_json_v41(selected.thread_id) end,
      'comment', case when selected.comment_id is null then null else
        ratiflow_document_private.comment_json_v41(selected.comment_id) end
    ) order by selected.activity_version desc), '[]'::jsonb),
    min(selected.activity_version)
  into v_rows, v_oldest
  from (
    select a.*
    from public.ratiflow_issue_activity_v4 a
    where a.document_id = v_document.id and a.activity_version < v_before
    order by a.activity_version desc
    limit v_limit
  ) selected;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'agents', coalesce((
      select jsonb_agg(ratiflow_document_private.profile_json_v41(p.profile_id)
        order by p.name, p.member_id)
      from public.ratiflow_issue_agent_profiles_v4 p
      where p.document_id = v_document.id
    ), '[]'::jsonb),
    'events', v_rows,
    'hasMoreOlder', v_oldest is not null and v_oldest > 1,
    'nextBeforeActivityVersion', case when v_oldest is not null and v_oldest > 1
      then v_oldest else null end,
    'currentRevision', v_document.revision,
    'currentActivityVersion', v_document.activity_version
  ));
end;
$$;

-- Move the applied v4 RPC implementations behind the private boundary, then expose
-- one non-overloaded public signature for each name. The default branch calls these
-- implementations byte-for-byte; v4.1 gets the expanded projection and authority.
alter function public.ratiflow_launch_issue_v4(jsonb, boolean)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_launch_issue_v4(jsonb, boolean)
  rename to legacy_launch_issue_v4;
alter function public.ratiflow_join_issue_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_join_issue_v4(text, jsonb)
  rename to legacy_join_issue_v4;
alter function public.ratiflow_inspect_issue_v4(text)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_inspect_issue_v4(text)
  rename to legacy_inspect_issue_v4;
alter function public.ratiflow_save_issue_revision_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_save_issue_revision_v4(text, jsonb)
  rename to legacy_save_issue_revision_v4;
alter function public.ratiflow_create_issue_task_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_create_issue_task_v4(text, jsonb)
  rename to legacy_create_issue_task_v4;
alter function public.ratiflow_create_issue_thread_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_create_issue_thread_v4(text, jsonb)
  rename to legacy_create_issue_thread_v4;
alter function public.ratiflow_add_issue_comment_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_add_issue_comment_v4(text, jsonb)
  rename to legacy_add_issue_comment_v4;
alter function public.ratiflow_resolve_issue_thread_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_resolve_issue_thread_v4(text, jsonb)
  rename to legacy_resolve_issue_thread_v4;
alter function public.ratiflow_cancel_issue_task_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_cancel_issue_task_v4(text, jsonb)
  rename to legacy_cancel_issue_task_v4;
alter function public.ratiflow_accept_issue_task_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_accept_issue_task_v4(text, jsonb)
  rename to legacy_accept_issue_task_v4;
alter function public.ratiflow_reject_issue_task_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_reject_issue_task_v4(text, jsonb)
  rename to legacy_reject_issue_task_v4;
alter function public.ratiflow_restore_issue_revision_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_restore_issue_revision_v4(text, jsonb)
  rename to legacy_restore_issue_revision_v4;
alter function public.ratiflow_read_issue_history_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_read_issue_history_v4(text, jsonb)
  rename to legacy_read_issue_history_v4;
alter function public.ratiflow_read_issue_revision_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_read_issue_revision_v4(text, jsonb)
  rename to legacy_read_issue_revision_v4;
alter function public.ratiflow_list_my_issue_tasks_v4(text, uuid, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_list_my_issue_tasks_v4(text, uuid, jsonb)
  rename to legacy_list_my_issue_tasks_v4;
alter function public.ratiflow_comment_on_issue_task_v4(text, uuid, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_comment_on_issue_task_v4(text, uuid, jsonb)
  rename to legacy_comment_on_issue_task_v4;
alter function public.ratiflow_submit_issue_task_result_v4(text, uuid, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_submit_issue_task_result_v4(text, uuid, jsonb)
  rename to legacy_submit_issue_task_result_v4;
alter function public.ratiflow_touch_issue_presence_v4(text, jsonb)
  set schema ratiflow_document_private;
alter function ratiflow_document_private.ratiflow_touch_issue_presence_v4(text, jsonb)
  rename to legacy_touch_issue_presence_v4;

create or replace function ratiflow_document_private.human_mutation_v41(
  p_operation text,
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_task public.ratiflow_issue_tasks_v4%rowtype;
declare v_request_id uuid;
declare v_internal_request_id uuid;
declare v_internal jsonb;
declare v_summary text;
declare v_replay jsonb;
declare v_result jsonb;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized_v4('A valid human session is required.');
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_session.document_id and protocol_version = 4
    and expires_at > clock_timestamp()
  for update;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId') then
    return ratiflow_document_private.invalid_v4('A UUID requestId is required.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
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
  v_replay := ratiflow_document_private.replay_v41(
    v_document.id, v_request_id, p_operation,
    v_session.member_id, 'HUMAN', p_input
  );
  if v_replay is not null then return v_replay; end if;
  v_internal_request_id := extensions.gen_random_uuid();
  v_internal := jsonb_set(
    p_input, '{requestId}', to_jsonb(v_internal_request_id), false
  );
  if p_operation = 'SAVE_ISSUE_REVISION_V4' then
    if not ratiflow_document_private.input_v4(
        p_input, array['requestId','expectedRevision','title','body'], '{}')
      or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
      or not ratiflow_document_private.text_v4(p_input->'title', 160, false)
      or not ratiflow_document_private.text_v4(p_input->'body', 50000, true) then
      v_result := ratiflow_document_private.invalid_v4('The revision input is invalid.');
      return ratiflow_document_private.record_v41(
        v_document.id, v_request_id, p_operation, v_session.member_id,
        'HUMAN', p_input, v_result
      );
    end if;
    v_summary := case
      when p_input->>'title' <> v_document.title
        and p_input->>'body' <> v_document.body
        then 'Edited the document title and body.'
      when p_input->>'title' <> v_document.title
        then 'Edited the document title.'
      else 'Edited the document.'
    end;
    v_internal := v_internal || jsonb_build_object('changeSummary', v_summary);
  end if;
  v_result := ratiflow_document_private.human_mutation_v4(
    p_operation, p_handle, v_internal
  );
  delete from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_internal_request_id;
  if v_result->>'ok' = 'true' then
    v_result := jsonb_build_object(
      'ok', true, 'data', ratiflow_document_private.surface_v41(v_document.id)
    );
  end if;
  return ratiflow_document_private.record_v41(
    v_document.id, v_request_id, p_operation, v_session.member_id,
    'HUMAN', p_input, v_result
  );
end;
$$;

create or replace function ratiflow_document_private.legacy_agent_task_allowed_v41(
  p_handle text,
  p_input jsonb
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case
    when not ratiflow_document_private.uuid_v4(p_input->'taskId') then true
    else not exists (
      select 1
      from ratiflow_document_private.member_for_handle_v4(p_handle) s
      join public.ratiflow_issue_tasks_v4 t
        on t.document_id = s.document_id and t.assignee_member_id = s.member_id
      where s.actor_type = 'AGENT'
        and t.task_id = (p_input->>'taskId')::uuid
        and t.agent_profile_id is not null
    )
  end
$$;

-- The applied mutation engine correctly enforces the task grant but writes the
-- immutable assignment label. A transaction-local, server-derived action name lets
-- its append-only inserts capture the connected profile's current name without ever
-- rewriting the historical task snapshot or trusting model input.
create or replace function ratiflow_document_private.capture_comment_agent_name_v41()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_name text := nullif(
  current_setting('ratiflow_document_private.agent_action_name_v41', true), ''
);
begin
  if new.author_actor_type = 'AGENT' and v_name is not null then
    new.author_agent_label := v_name;
  end if;
  return new;
end;
$$;

create or replace function ratiflow_document_private.capture_revision_agent_name_v41()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_name text := nullif(
  current_setting('ratiflow_document_private.agent_action_name_v41', true), ''
);
begin
  if new.author_actor_type = 'AGENT' and v_name is not null then
    new.author_agent_label := v_name;
  end if;
  if new.committer_actor_type = 'AGENT' and v_name is not null then
    new.committer_agent_label := v_name;
  end if;
  return new;
end;
$$;

create or replace function ratiflow_document_private.capture_activity_agent_name_v41()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_name text := nullif(
  current_setting('ratiflow_document_private.agent_action_name_v41', true), ''
);
begin
  if new.actor_type = 'AGENT' and v_name is not null then
    new.actor_display_name := v_name;
  end if;
  return new;
end;
$$;

create trigger ratiflow_issue_comment_agent_name_v41
before insert on public.ratiflow_issue_comments_v4
for each row execute function
  ratiflow_document_private.capture_comment_agent_name_v41();
create trigger ratiflow_issue_revision_agent_name_v41
before insert on public.ratiflow_issue_revisions_v4
for each row execute function
  ratiflow_document_private.capture_revision_agent_name_v41();
create trigger ratiflow_issue_activity_agent_name_v41
before insert on public.ratiflow_issue_activity_v4
for each row execute function
  ratiflow_document_private.capture_activity_agent_name_v41();

create or replace function ratiflow_document_private.agent_mutation_v41(
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
declare v_agent record;
declare v_document public.ratiflow_documents%rowtype;
declare v_task public.ratiflow_issue_tasks_v4%rowtype;
declare v_request_id uuid;
declare v_internal_request_id uuid;
declare v_internal jsonb;
declare v_replay jsonb;
declare v_result jsonb;
declare v_comment_id uuid;
declare v_revision bigint;
declare v_at timestamptz;
begin
  select * into v_agent from ratiflow_document_private.connected_agent_v41(
    p_handle, p_page_session_id
  );
  if not found then
    return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    );
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_agent.document_id and protocol_version = 4
    and expires_at > clock_timestamp()
  for update;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId')
    or not ratiflow_document_private.uuid_v4(p_input->'taskId') then
    return ratiflow_document_private.invalid_v4('A UUID requestId and taskId are required.');
  end if;
  select * into v_task from public.ratiflow_issue_tasks_v4
  where document_id = v_document.id
    and task_id = (p_input->>'taskId')::uuid
    and assignee_member_id = v_agent.member_id
  for update;
  if not found or v_task.agent_profile_id is not null
      and v_task.agent_profile_id <> v_agent.profile_id then
    return ratiflow_document_private.unauthorized_v4(
      'This task is not assigned to the connected agent profile.'
    );
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  v_replay := ratiflow_document_private.replay_v41(
    v_document.id, v_request_id, p_operation, v_agent.member_id,
    'AGENT', p_input, v_agent.session_instance_id, p_page_session_id
  );
  if v_replay is not null then return v_replay; end if;
  v_internal_request_id := extensions.gen_random_uuid();
  v_internal := jsonb_set(
    p_input, '{requestId}', to_jsonb(v_internal_request_id), false
  );
  perform pg_catalog.set_config(
    'ratiflow_document_private.agent_action_name_v41', v_agent.agent_name, true
  );
  v_result := ratiflow_document_private.agent_mutation_v4(
    p_operation, p_handle, p_page_session_id, v_internal
  );
  delete from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_internal_request_id;
  if v_result->>'ok' = 'true' then
    v_at := greatest(clock_timestamp(), (
      select last_accessed_at from public.ratiflow_issue_agent_profiles_v4
      where profile_id = v_agent.profile_id
    ) + interval '1 microsecond');
    update public.ratiflow_issue_agent_profiles_v4
    set last_accessed_at = v_at, access_count = access_count + 1
    where profile_id = v_agent.profile_id;
    if p_operation = 'COMMENT_ON_ISSUE_TASK_V4' then
      v_comment_id := (v_result->'data'->'comment'->>'commentId')::uuid;
      v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
        'task', ratiflow_document_private.task_json_v41(v_task.task_id),
        'comment', ratiflow_document_private.comment_json_v41(v_comment_id),
        'activityVersion', (select activity_version from public.ratiflow_documents
          where id = v_document.id)
      ));
    else
      select result_revision into v_revision from public.ratiflow_issue_tasks_v4
      where task_id = v_task.task_id;
      v_result := jsonb_build_object('ok', true, 'data', jsonb_build_object(
        'outcome', v_result->'data'->>'outcome',
        'task', ratiflow_document_private.task_json_v41(v_task.task_id),
        'revision', case when v_result->'data'->>'outcome' = 'COMMITTED'
          then ratiflow_document_private.revision_json_v41(
            v_document.id, v_revision, true
          ) else to_jsonb(v_document.revision) end,
        'activityVersion', (select activity_version from public.ratiflow_documents
          where id = v_document.id)
      ));
    end if;
  end if;
  return ratiflow_document_private.record_v41(
    v_document.id, v_request_id, p_operation, v_agent.member_id,
    'AGENT', p_input, v_result, v_agent.session_instance_id, p_page_session_id
  );
end;
$$;

create or replace function public.ratiflow_launch_issue_v4(
  p_input jsonb default '{}'::jsonb,
  p_example boolean default false,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_result jsonb;
declare v_joined jsonb;
begin
  if not ratiflow_document_private.response_contract_v41(p_response_contract) then
    return ratiflow_document_private.invalid_v4('The response contract is invalid.');
  end if;
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_launch_issue_v4(p_input, p_example);
  end if;
  if not ratiflow_document_private.input_v4(
      p_input, array['kind','displayName'], '{}')
    or p_input->>'kind' not in ('POSTMORTEM','PRODUCT_DOCUMENT')
    or not ratiflow_document_private.text_v4(p_input->'displayName', 80, false) then
    return ratiflow_document_private.invalid_v4(
      'A valid issue kind and display name are required.'
    );
  end if;
  if not p_example then
    v_result := ratiflow_document_private.legacy_launch_issue_v4(p_input, false);
  elsif p_input->>'kind' = 'POSTMORTEM' then
    if not ratiflow_document_private.rate_limit_v4('LAUNCH', 60) then
      return ratiflow_document_private.error_v4(
        'RATE_LIMITED', 'Launch rate limit reached.', true
      );
    end if;
    v_result := ratiflow_document_private.build_postmortem_example_v41(
      p_input->>'displayName'
    );
  else
    if not ratiflow_document_private.rate_limit_v4('LAUNCH', 60) then
      return ratiflow_document_private.error_v4(
        'RATE_LIMITED', 'Launch rate limit reached.', true
      );
    end if;
    v_result := ratiflow_document_private.build_product_example_v41(
      p_input->>'displayName'
    );
  end if;
  if v_result->>'ok' = 'true' then
    return jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.session_bundle_v41(v_result->'data')
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.ratiflow_join_issue_v4(
  p_share_token text,
  p_input jsonb default '{}'::jsonb,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_result jsonb;
begin
  if not ratiflow_document_private.response_contract_v41(p_response_contract) then
    return ratiflow_document_private.invalid_v4('The response contract is invalid.');
  end if;
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_join_issue_v4(p_share_token, p_input);
  end if;
  if not ratiflow_document_private.input_v4(p_input, array['displayName'], '{}')
    or not ratiflow_document_private.text_v4(p_input->'displayName', 80, false) then
    return ratiflow_document_private.invalid_v4('A display name is required.');
  end if;
  v_result := ratiflow_document_private.legacy_join_issue_v4(p_share_token, p_input);
  if v_result->>'ok' = 'true' then
    return jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.session_bundle_v41(v_result->'data')
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.ratiflow_inspect_issue_v4(
  p_handle text,
  p_page_session_id uuid default null,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_agent record;
begin
  if not ratiflow_document_private.response_contract_v41(p_response_contract) then
    return ratiflow_document_private.invalid_v4('The response contract is invalid.');
  end if;
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_inspect_issue_v4(p_handle);
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v4(p_handle); end if;
  if v_session.actor_type = 'AGENT' then
    select * into v_agent from ratiflow_document_private.connected_agent_v41(
      p_handle, p_page_session_id
    );
    if not found then
      return ratiflow_document_private.agent_identity_failure_v41(
        p_handle, p_page_session_id
      );
    end if;
  end if;
  return jsonb_build_object(
    'ok', true, 'data', ratiflow_document_private.surface_v41(v_session.document_id)
  );
end;
$$;

create or replace function public.ratiflow_read_issue_history_v4(
  p_handle text,
  p_input jsonb default '{}'::jsonb,
  p_page_session_id uuid default null,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_agent record;
declare v_document public.ratiflow_documents%rowtype;
declare v_before bigint;
declare v_limit integer;
declare v_rows jsonb;
declare v_oldest bigint;
begin
  if not ratiflow_document_private.response_contract_v41(p_response_contract) then
    return ratiflow_document_private.invalid_v4('The response contract is invalid.');
  end if;
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_read_issue_history_v4(p_handle, p_input);
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v4(p_handle); end if;
  if v_session.actor_type = 'AGENT' then
    select * into v_agent from ratiflow_document_private.connected_agent_v41(
      p_handle, p_page_session_id
    );
    if not found then return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    ); end if;
  end if;
  if not ratiflow_document_private.input_v4(
      p_input, '{}', array['beforeRevision','limit'])
    or (p_input ? 'beforeRevision' and not
      ratiflow_document_private.counter_v4(p_input->'beforeRevision', 1))
    or (p_input ? 'limit' and not
      ratiflow_document_private.counter_v4(p_input->'limit', 1, 50)) then
    return ratiflow_document_private.invalid_v4('The history input is invalid.');
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_session.document_id;
  v_before := coalesce((p_input->>'beforeRevision')::bigint, v_document.revision + 1);
  v_limit := coalesce((p_input->>'limit')::integer, 20);
  select coalesce(jsonb_agg(
      ratiflow_document_private.revision_json_v41(
        v_document.id, selected.revision, false
      ) order by selected.revision desc
    ), '[]'::jsonb), min(selected.revision)
  into v_rows, v_oldest
  from (
    select r.revision from public.ratiflow_issue_revisions_v4 r
    where r.document_id = v_document.id and r.revision < v_before
    order by r.revision desc limit v_limit
  ) selected;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'revisions', v_rows,
    'hasMoreOlder', v_oldest is not null and v_oldest > 1,
    'nextBeforeRevision', case when v_oldest is not null and v_oldest > 1
      then v_oldest else null end,
    'currentRevision', v_document.revision,
    'currentActivityVersion', v_document.activity_version
  ));
end;
$$;

create or replace function public.ratiflow_read_issue_revision_v4(
  p_handle text,
  p_input jsonb,
  p_page_session_id uuid default null,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_agent record;
declare v_revision bigint;
declare v_result jsonb;
begin
  if not ratiflow_document_private.response_contract_v41(p_response_contract) then
    return ratiflow_document_private.invalid_v4('The response contract is invalid.');
  end if;
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_read_issue_revision_v4(p_handle, p_input);
  end if;
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found then return ratiflow_document_private.auth_failure_v4(p_handle); end if;
  if v_session.actor_type = 'AGENT' then
    select * into v_agent from ratiflow_document_private.connected_agent_v41(
      p_handle, p_page_session_id
    );
    if not found then return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    ); end if;
  end if;
  if not ratiflow_document_private.input_v4(p_input, array['revision'], '{}')
    or not ratiflow_document_private.counter_v4(p_input->'revision', 1) then
    return ratiflow_document_private.invalid_v4('A positive revision is required.');
  end if;
  v_revision := (p_input->>'revision')::bigint;
  v_result := ratiflow_document_private.revision_json_v41(
    v_session.document_id, v_revision, true
  );
  if v_result is null then
    return ratiflow_document_private.error_v4(
      'NOT_FOUND', 'The revision was not found.', false
    );
  end if;
  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create or replace function ratiflow_document_private.legacy_save_compat_v41(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_document public.ratiflow_documents%rowtype;
declare v_request_id uuid;
declare v_internal_request_id uuid;
declare v_replay jsonb;
declare v_internal jsonb;
declare v_summary text;
declare v_result jsonb;
begin
  select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
  if not found or v_session.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized_v4('A valid human session is required.');
  end if;
  select * into strict v_document from public.ratiflow_documents
  where id = v_session.document_id and protocol_version = 4
    and expires_at > clock_timestamp()
  for update;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or not ratiflow_document_private.uuid_v4(p_input->'requestId') then
    return ratiflow_document_private.invalid_v4('A UUID requestId is required.');
  end if;
  v_request_id := (p_input->>'requestId')::uuid;
  v_replay := ratiflow_document_private.replay_v4(
    v_document.id, v_request_id, 'SAVE_ISSUE_REVISION_V4',
    v_session.member_id, 'HUMAN', p_input
  );
  if v_replay is not null then return v_replay; end if;
  if not ratiflow_document_private.input_v4(
      p_input, array['requestId','expectedRevision','title','body'], array['changeSummary'])
    or not ratiflow_document_private.counter_v4(p_input->'expectedRevision')
    or not ratiflow_document_private.text_v4(p_input->'title', 160, false)
    or not ratiflow_document_private.text_v4(p_input->'body', 50000, true)
    or (p_input ? 'changeSummary' and not
      ratiflow_document_private.text_v4(p_input->'changeSummary', 240, false)) then
    return ratiflow_document_private.record_v4(
      v_document.id, v_request_id, 'SAVE_ISSUE_REVISION_V4',
      v_session.member_id, 'HUMAN', p_input,
      ratiflow_document_private.invalid_v4('The revision input is invalid.')
    );
  end if;
  v_summary := case
    when p_input->>'title' <> v_document.title and p_input->>'body' <> v_document.body
      then 'Edited the document title and body.'
    when p_input->>'title' <> v_document.title then 'Edited the document title.'
    else 'Edited the document.'
  end;
  v_internal_request_id := extensions.gen_random_uuid();
  v_internal := (p_input - 'changeSummary') || jsonb_build_object(
    'requestId', v_internal_request_id, 'changeSummary', v_summary
  );
  v_result := ratiflow_document_private.human_mutation_v4(
    'SAVE_ISSUE_REVISION_V4', p_handle, v_internal
  );
  delete from public.ratiflow_document_request_ledger
  where document_id = v_document.id and request_id = v_internal_request_id;
  if v_result->>'ok' = 'false' and v_result->>'code' = 'UNAUTHORIZED' then
    return v_result;
  end if;
  return ratiflow_document_private.record_v4(
    v_document.id, v_request_id, 'SAVE_ISSUE_REVISION_V4',
    v_session.member_id, 'HUMAN', p_input, v_result
  );
end;
$$;

create or replace function public.ratiflow_save_issue_revision_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if not ratiflow_document_private.response_contract_v41(p_response_contract) then
    return ratiflow_document_private.invalid_v4('The response contract is invalid.');
  end if;
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_save_compat_v41(p_handle, p_input);
  end if;
  return ratiflow_document_private.human_mutation_v41(
    'SAVE_ISSUE_REVISION_V4', p_handle, p_input
  );
end; $$;

create or replace function public.ratiflow_create_issue_task_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_create_issue_task_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'CREATE_ISSUE_TASK_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_create_issue_thread_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_create_issue_thread_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'CREATE_ISSUE_THREAD_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_add_issue_comment_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_add_issue_comment_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'ADD_ISSUE_COMMENT_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_resolve_issue_thread_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_resolve_issue_thread_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'RESOLVE_ISSUE_THREAD_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_cancel_issue_task_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_cancel_issue_task_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'CANCEL_ISSUE_TASK_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_accept_issue_task_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_accept_issue_task_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'ACCEPT_ISSUE_TASK_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_reject_issue_task_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_reject_issue_task_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'REJECT_ISSUE_TASK_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_restore_issue_revision_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_restore_issue_revision_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'RESTORE_ISSUE_REVISION_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_touch_issue_presence_v4(
  p_handle text, p_input jsonb, p_response_contract text default 'v4'
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$ begin
  if p_response_contract = 'v4' then
    return ratiflow_document_private.legacy_touch_issue_presence_v4(p_handle, p_input);
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.human_mutation_v41(
      'TOUCH_ISSUE_PRESENCE_V4', p_handle, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end; $$;

create or replace function public.ratiflow_list_my_issue_tasks_v4(
  p_handle text,
  p_page_session_id uuid,
  p_input jsonb default '{}'::jsonb,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_session record;
declare v_agent record;
declare v_document public.ratiflow_documents%rowtype;
declare v_include boolean;
declare v_tasks jsonb;
begin
  if not ratiflow_document_private.response_contract_v41(p_response_contract) then
    return ratiflow_document_private.invalid_v4('The response contract is invalid.');
  end if;
  if p_response_contract = 'v4' then
    if p_page_session_id is null then
      return ratiflow_document_private.error_v4(
        'STALE_PAGE_CONTEXT', 'A valid page session is required.', false
      );
    end if;
    select * into v_session from ratiflow_document_private.member_for_handle_v4(p_handle);
    if not found or v_session.actor_type <> 'AGENT' then
      return ratiflow_document_private.unauthorized_v4(
        'A valid delegated-agent session is required.'
      );
    end if;
    if not ratiflow_document_private.input_v4(p_input, '{}', array['includeResolved'])
      or (p_input ? 'includeResolved'
        and jsonb_typeof(p_input->'includeResolved') <> 'boolean') then
      return ratiflow_document_private.invalid_v4('The task-list input is invalid.');
    end if;
    v_include := coalesce((p_input->>'includeResolved')::boolean, false);
    select * into strict v_document from public.ratiflow_documents
    where id = v_session.document_id;
    select coalesce(jsonb_agg(jsonb_build_object(
        'task', ratiflow_document_private.task_json_v4(t.task_id),
        'thread', ratiflow_document_private.thread_json_v4(t.thread_id)
      ) order by case when t.status in ('OPEN','PROPOSED') then 0 else 1 end,
        t.updated_at desc, t.task_id), '[]'::jsonb)
    into v_tasks
    from public.ratiflow_issue_tasks_v4 t
    where t.document_id = v_document.id
      and t.assignee_member_id = v_session.member_id
      and t.agent_profile_id is null
      and (v_include or t.status in ('OPEN','PROPOSED'));
  else
    select * into v_agent from ratiflow_document_private.connected_agent_v41(
      p_handle, p_page_session_id
    );
    if not found then return ratiflow_document_private.agent_identity_failure_v41(
      p_handle, p_page_session_id
    ); end if;
    if not ratiflow_document_private.input_v4(p_input, '{}', array['includeResolved'])
      or (p_input ? 'includeResolved'
        and jsonb_typeof(p_input->'includeResolved') <> 'boolean') then
      return ratiflow_document_private.invalid_v4('The task-list input is invalid.');
    end if;
    v_include := coalesce((p_input->>'includeResolved')::boolean, false);
    select * into strict v_document from public.ratiflow_documents
    where id = v_agent.document_id;
    select coalesce(jsonb_agg(jsonb_build_object(
        'task', ratiflow_document_private.task_json_v41(t.task_id),
        'thread', ratiflow_document_private.thread_json_v41(t.thread_id)
      ) order by case when t.status in ('OPEN','PROPOSED') then 0 else 1 end,
        t.updated_at desc, t.task_id), '[]'::jsonb)
    into v_tasks
    from public.ratiflow_issue_tasks_v4 t
    where t.document_id = v_document.id
      and t.assignee_member_id = v_agent.member_id
      and (t.agent_profile_id is null or t.agent_profile_id = v_agent.profile_id)
      and (v_include or t.status in ('OPEN','PROPOSED'));
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tasks', v_tasks,
    'revision', v_document.revision,
    'activityVersion', v_document.activity_version
  ));
end;
$$;

create or replace function public.ratiflow_comment_on_issue_task_v4(
  p_handle text,
  p_page_session_id uuid,
  p_input jsonb,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if p_response_contract = 'v4' then
    if p_page_session_id is null then
      return ratiflow_document_private.legacy_comment_on_issue_task_v4(
        p_handle, p_page_session_id, p_input
      );
    end if;
    if not ratiflow_document_private.legacy_agent_task_allowed_v41(p_handle, p_input) then
      return ratiflow_document_private.unauthorized_v4(
        'This task is not available to the compatibility agent.'
      );
    end if;
    return ratiflow_document_private.legacy_comment_on_issue_task_v4(
      p_handle, p_page_session_id, p_input
    );
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.agent_mutation_v41(
      'COMMENT_ON_ISSUE_TASK_V4', p_handle, p_page_session_id, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end;
$$;

create or replace function public.ratiflow_submit_issue_task_result_v4(
  p_handle text,
  p_page_session_id uuid,
  p_input jsonb,
  p_response_contract text default 'v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
begin
  if p_response_contract = 'v4' then
    if p_page_session_id is null then
      return ratiflow_document_private.legacy_submit_issue_task_result_v4(
        p_handle, p_page_session_id, p_input
      );
    end if;
    if not ratiflow_document_private.legacy_agent_task_allowed_v41(p_handle, p_input) then
      return ratiflow_document_private.unauthorized_v4(
        'This task is not available to the compatibility agent.'
      );
    end if;
    return ratiflow_document_private.legacy_submit_issue_task_result_v4(
      p_handle, p_page_session_id, p_input
    );
  elsif p_response_contract = 'v4.1' then
    return ratiflow_document_private.agent_mutation_v41(
      'SUBMIT_ISSUE_TASK_RESULT_V4', p_handle, p_page_session_id, p_input
    );
  end if;
  return ratiflow_document_private.invalid_v4('The response contract is invalid.');
end;
$$;

-- Shared SQL-owned r1/av4 materializer. It returns credentials only to the two
-- security-definer callers below; no public RPC exposes this helper.
create or replace function ratiflow_document_private.seed_postmortem_start_v41()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_seed jsonb;
declare v_document_id uuid;
declare v_share text;
declare v_expiry timestamptz;
declare v_priya uuid;
declare v_members uuid[];
declare v_profiles uuid[] := array[
  extensions.gen_random_uuid(), extensions.gen_random_uuid(),
  extensions.gen_random_uuid()
];
declare v_names text[] := array['Databot', 'Logbot', 'Builder'];
declare v_prompts text[] := array[
  $p1$@Databot Use impact.csv to replace this placeholder with verified checkout attempts, succeeded and failed counts, affected merchants, duplicate-charge status, a GFM outcome table, and a bar chart.$p1$,
  $p2$@Logbot Use checkout.log to replace this placeholder with the exact UTC incident timeline from provider throttling through recovery.$p2$,
  $p3$@Builder Use commit 7d3c9e1 and checkout.log to explain the external trigger, the internal amplifier, and why the outage persisted.$p3$
];
declare v_starts integer[] := array[169, 210, 253];
declare v_ends integer[] := array[195, 236, 279];
declare v_befores text[] := array[
  E'## Impact\n\n', E'## Timeline\n\n', E'## Root cause\n\n'
];
declare v_afters text[] := array[
  E'\n\n## Timeline\n\nInvestigation in progress.',
  E'\n\n## Root cause\n\nInvestigation in progress.',
  E'\n\n## Detection and response'
];
declare v_title text := 'INC-482 · Checkout outage postmortem';
declare v_body text := $reset$## Summary

Checkout requests failed for 38 minutes after a payment-provider throttling event. Service recovered after the retry middleware was rolled back.

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

- [ ] Honor `Retry-After` — Payments Platform — September 5
- [ ] Add provider-throttling load tests — Checkout — September 7
- [ ] Alert on retry amplification — Reliability — September 6

## Learnings

Separate external triggers from internal amplifiers when assigning root cause.$reset$;
declare v_revision_id uuid := extensions.gen_random_uuid();
declare v_task_id uuid;
declare v_thread_id uuid;
declare v_comment_id uuid;
declare v_anchor jsonb;
declare v_context jsonb;
declare v_instruction text;
declare v_base timestamptz := clock_timestamp();
declare i integer;
begin
  v_seed := ratiflow_document_private.seed_issue_v4(
    'POSTMORTEM', 'Priya Shah', 'RESET'
  );
  v_document_id := (v_seed->>'documentId')::uuid;
  v_share := v_seed->>'shareToken';
  v_expiry := (v_seed->>'expiresAt')::timestamptz;
  v_priya := (v_seed->>'priyaMemberId')::uuid;
  v_members := array[
    (v_seed->>'nadiaMemberId')::uuid,
    (v_seed->>'leoMemberId')::uuid,
    (v_seed->>'samMemberId')::uuid
  ];

  delete from public.ratiflow_document_request_ledger
    where document_id = v_document_id;
  delete from public.ratiflow_issue_activity_v4
    where document_id = v_document_id;
  delete from public.ratiflow_issue_comments_v4
    where document_id = v_document_id;
  delete from public.ratiflow_issue_revisions_v4
    where document_id = v_document_id;
  delete from public.ratiflow_issue_threads_v4
    where document_id = v_document_id;
  delete from public.ratiflow_issue_tasks_v4
    where document_id = v_document_id;
  delete from public.ratiflow_issue_agent_profiles_v4
    where document_id = v_document_id;

  update public.ratiflow_documents
  set issue_kind = 'POSTMORTEM', title = v_title, body = v_body,
    revision = 1, activity_version = 4, updated_at = v_base + interval '3 microseconds',
    last_editor_member_id = v_priya, last_editor_display_name = 'Priya Shah',
    last_editor_actor_type = 'HUMAN', last_editor_origin = 'ORDINARY_UI',
    undo_agent_revision = null, undo_previous_title = null, undo_previous_body = null
  where id = v_document_id;

  insert into public.ratiflow_issue_revisions_v4 (
    revision_id, document_id, revision, parent_revision, title, body,
    content_digest, diffs, source_revision, authority, origin, author_origin,
    task_id, author_actor_type, author_member_id, author_display_name,
    author_agent_label, committer_actor_type, committer_member_id,
    committer_display_name, committer_agent_label, granted_by_member_id,
    granted_by_display_name, approved_by_member_id, approved_by_display_name,
    restored_revision, change_summary, evidence_refs, created_at
  ) values (
    v_revision_id, v_document_id, 1, null, v_title, v_body,
    ratiflow_document_private.content_digest_v4(v_title, v_body),
    jsonb_build_array(
      jsonb_build_object(
        'field', 'TITLE', 'rangeStart', 0, 'rangeEnd', 0,
        'before', '', 'after', v_title
      ),
      jsonb_build_object(
        'field', 'BODY', 'rangeStart', 0, 'rangeEnd', 0,
        'before', '', 'after', v_body
      )
    ),
    0, 'HUMAN', 'ORDINARY_UI', 'ORDINARY_UI', null,
    'HUMAN', v_priya, 'Priya Shah', null,
    'HUMAN', v_priya, 'Priya Shah', null,
    null, null, null, null, null,
    'Created the checkout outage postmortem.', '{}'::text[], v_base
  );
  insert into public.ratiflow_issue_activity_v4 (
    document_id, activity_version, kind, actor_type, actor_member_id,
    actor_display_name, origin, revision, revision_id, created_at
  ) values (
    v_document_id, 1, 'ISSUE_LAUNCHED', 'HUMAN', v_priya,
    'Priya Shah', 'ORDINARY_UI', 1, v_revision_id, v_base
  );

  for i in 1..3 loop
    insert into public.ratiflow_issue_agent_profiles_v4 (
      profile_id, document_id, member_id, name, identity_generation,
      first_seen_at, last_accessed_at, access_count
    ) values (
      v_profiles[i], v_document_id, v_members[i], v_names[i], 1,
      v_base, v_base, 0
    );
  end loop;

  for i in 1..3 loop
    v_task_id := extensions.gen_random_uuid();
    v_thread_id := extensions.gen_random_uuid();
    v_comment_id := extensions.gen_random_uuid();
    v_instruction := substring(v_prompts[i] from char_length(v_names[i]) + 3);
    v_anchor := ratiflow_document_private.anchor_json_v4(
      'SELECTION', 'BODY', v_starts[i], v_ends[i],
      'Investigation in progress.', 1, 1, 'ACTIVE'
    );
    v_context := jsonb_build_object(
      'sourceRevision', 1,
      'sourceDigest', ratiflow_document_private.content_digest_v4(v_title, v_body),
      'documentTitle', v_title,
      'field', 'BODY',
      'rangeStart', v_starts[i],
      'rangeEnd', v_ends[i],
      'targetText', 'Investigation in progress.',
      'beforeText', v_befores[i],
      'afterText', v_afters[i],
      'priorContext', ratiflow_document_private.prior_context_v41(
        v_document_id, i + 1
      )
    );
    insert into public.ratiflow_issue_tasks_v4 (
      task_id, document_id, task_key, title, category, instruction, agent_label,
      agent_profile_id, context_snapshot, mode, creator_member_id,
      creator_display_name, assignee_member_id, assignee_display_name, thread_id,
      creation_anchor, anchor_scope, anchor_field, range_start, range_end,
      selected_text, created_revision, anchor_revision, anchor_state,
      created_at, updated_at
    ) values (
      v_task_id, v_document_id, 'TASK-' || i,
      left(regexp_replace(v_instruction, E'[ \t\r\n]+', ' ', 'g'), 120),
      'GENERAL', v_instruction, v_names[i], v_profiles[i], v_context, 'DIRECT',
      v_priya, 'Priya Shah', v_members[i],
      case i when 1 then 'Nadia Chen' when 2 then 'Leo Park' else 'Sam Rivera' end,
      v_thread_id, v_anchor, 'SELECTION', 'BODY', v_starts[i], v_ends[i],
      'Investigation in progress.', 1, 1, 'ACTIVE',
      v_base + i * interval '1 microsecond',
      v_base + i * interval '1 microsecond'
    );
    insert into public.ratiflow_issue_threads_v4 (
      thread_id, document_id, task_id, creation_anchor, anchor_scope,
      anchor_field, range_start, range_end, selected_text, created_revision,
      anchor_revision, anchor_state, created_by_member_id,
      created_by_display_name, created_at
    ) values (
      v_thread_id, v_document_id, v_task_id, v_anchor, 'SELECTION', 'BODY',
      v_starts[i], v_ends[i], 'Investigation in progress.', 1, 1, 'ACTIVE',
      v_priya, 'Priya Shah', v_base + i * interval '1 microsecond'
    );
    insert into public.ratiflow_issue_comments_v4 (
      comment_id, document_id, thread_id, author_actor_type,
      author_member_id, author_display_name, origin, created_revision,
      body, evidence_refs, created_at
    ) values (
      v_comment_id, v_document_id, v_thread_id, 'HUMAN', v_priya,
      'Priya Shah', 'ORDINARY_UI', 1, v_prompts[i], '{}'::text[],
      v_base + i * interval '1 microsecond'
    );
    insert into public.ratiflow_issue_activity_v4 (
      document_id, activity_version, kind, actor_type, actor_member_id,
      actor_display_name, origin, revision, task_id, thread_id, comment_id,
      created_at
    ) values (
      v_document_id, i + 1, 'TASK_CREATED', 'HUMAN', v_priya,
      'Priya Shah', 'ORDINARY_UI', 1, v_task_id, v_thread_id, v_comment_id,
      v_base + i * interval '1 microsecond'
    );
  end loop;

  return v_seed;
end;
$$;

create or replace function ratiflow_document_private.seed_mention_v41(
  p_document_id uuid,
  p_creator_member_id uuid,
  p_assignee_member_id uuid,
  p_prompt text,
  p_start bigint,
  p_end bigint,
  p_before text,
  p_after text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_document public.ratiflow_documents%rowtype;
declare v_creator public.ratiflow_document_members%rowtype;
declare v_assignee public.ratiflow_document_members%rowtype;
declare v_profile public.ratiflow_issue_agent_profiles_v4%rowtype;
declare v_task_id uuid := extensions.gen_random_uuid();
declare v_thread_id uuid := extensions.gen_random_uuid();
declare v_comment_id uuid := extensions.gen_random_uuid();
declare v_instruction text;
declare v_anchor jsonb;
declare v_context jsonb;
declare v_at timestamptz;
begin
  select * into strict v_document from public.ratiflow_documents
  where id = p_document_id and protocol_version = 4 for update;
  select * into strict v_creator from public.ratiflow_document_members
  where document_id = p_document_id and member_id = p_creator_member_id;
  select * into strict v_assignee from public.ratiflow_document_members
  where document_id = p_document_id and member_id = p_assignee_member_id;
  select * into strict v_profile from public.ratiflow_issue_agent_profiles_v4
  where document_id = p_document_id and member_id = p_assignee_member_id;
  if left(p_prompt, char_length(v_profile.name) + 2)
      <> ('@' || v_profile.name || ' ')
    or (
      substring(v_document.body from p_start::integer + 1
        for (p_end - p_start)::integer) <> 'Investigation in progress.'
      and substring(v_document.body from p_start::integer + 1
        for (p_end - p_start)::integer) <> 'Analysis in progress.'
      and substring(v_document.body from p_start::integer + 1
        for (p_end - p_start)::integer) <> 'Synthesis pending.'
      and substring(v_document.body from p_start::integer + 1
        for (p_end - p_start)::integer)
        <> 'Provider 429 throttling triggered the incident. Retry middleware introduced in commit `7d3c9e1` ignored `Retry-After` and made up to five zero-delay retries. That behavior amplified provider errors and sustained checkout failures until rollback.'
    ) then
    raise exception 'invalid deterministic mention seed' using errcode = '22023';
  end if;
  v_instruction := substring(p_prompt from char_length(v_profile.name) + 3);
  v_anchor := ratiflow_document_private.anchor_json_v4(
    'SELECTION', 'BODY', p_start, p_end,
    substring(v_document.body from p_start::integer + 1
      for (p_end - p_start)::integer),
    v_document.revision, v_document.revision, 'ACTIVE'
  );
  v_context := jsonb_build_object(
    'sourceRevision', v_document.revision,
    'sourceDigest', ratiflow_document_private.content_digest_v4(
      v_document.title, v_document.body
    ),
    'documentTitle', v_document.title,
    'field', 'BODY',
    'rangeStart', p_start,
    'rangeEnd', p_end,
    'targetText', v_anchor->>'selectedText',
    'beforeText', p_before,
    'afterText', p_after,
    'priorContext', ratiflow_document_private.prior_context_v41(
      p_document_id, v_document.activity_version + 1
    )
  );
  v_at := greatest(clock_timestamp(), v_document.updated_at + interval '1 microsecond');
  insert into public.ratiflow_issue_tasks_v4 (
    task_id, document_id, task_key, title, category, instruction, agent_label,
    agent_profile_id, context_snapshot, mode, creator_member_id,
    creator_display_name, assignee_member_id, assignee_display_name, thread_id,
    creation_anchor, anchor_scope, anchor_field, range_start, range_end,
    selected_text, created_revision, anchor_revision, anchor_state,
    created_at, updated_at
  ) values (
    v_task_id, p_document_id,
    'TASK-' || ((select count(*) + 1 from public.ratiflow_issue_tasks_v4
      where document_id = p_document_id)::text),
    left(regexp_replace(v_instruction, E'[ \t\r\n]+', ' ', 'g'), 120),
    'GENERAL', v_instruction, v_profile.name, v_profile.profile_id,
    v_context, 'DIRECT', v_creator.member_id, v_creator.display_name,
    v_assignee.member_id, v_assignee.display_name, v_thread_id, v_anchor,
    'SELECTION', 'BODY', p_start, p_end, v_anchor->>'selectedText',
    v_document.revision, v_document.revision, 'ACTIVE', v_at, v_at
  );
  insert into public.ratiflow_issue_threads_v4 (
    thread_id, document_id, task_id, creation_anchor, anchor_scope,
    anchor_field, range_start, range_end, selected_text, created_revision,
    anchor_revision, anchor_state, created_by_member_id,
    created_by_display_name, created_at
  ) values (
    v_thread_id, p_document_id, v_task_id, v_anchor, 'SELECTION', 'BODY',
    p_start, p_end, v_anchor->>'selectedText', v_document.revision,
    v_document.revision, 'ACTIVE', v_creator.member_id,
    v_creator.display_name, v_at
  );
  insert into public.ratiflow_issue_comments_v4 (
    comment_id, document_id, thread_id, author_actor_type, author_member_id,
    author_display_name, origin, created_revision, body, evidence_refs, created_at
  ) values (
    v_comment_id, p_document_id, v_thread_id, 'HUMAN', v_creator.member_id,
    v_creator.display_name, 'ORDINARY_UI', v_document.revision, p_prompt,
    '{}'::text[], v_at
  );
  perform ratiflow_document_private.bump_activity_v4(
    p_document_id, 'TASK_CREATED', 'HUMAN', v_creator.member_id,
    v_creator.display_name, 'ORDINARY_UI', null, v_task_id, v_thread_id,
    v_comment_id, v_at
  );
  return v_task_id;
end;
$$;

create or replace function ratiflow_document_private.build_postmortem_example_v41(
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_seed jsonb;
declare v_document_id uuid;
declare v_priya uuid;
declare v_nadia uuid;
declare v_leo uuid;
declare v_sam uuid;
declare v_priya_handle text;
declare v_pages uuid[] := array[
  extensions.gen_random_uuid(), extensions.gen_random_uuid(),
  extensions.gen_random_uuid()
];
declare v_task uuid;
declare v_discussion uuid;
declare v_result jsonb;
begin
  v_seed := ratiflow_document_private.seed_postmortem_start_v41();
  v_document_id := (v_seed->>'documentId')::uuid;
  v_priya := (v_seed->>'priyaMemberId')::uuid;
  v_nadia := (v_seed->>'nadiaMemberId')::uuid;
  v_leo := (v_seed->>'leoMemberId')::uuid;
  v_sam := (v_seed->>'samMemberId')::uuid;
  v_priya_handle := v_seed->'priyaTokens'->>'humanToken';

  v_result := public.ratiflow_connect_issue_agent_v4(
    v_seed->'nadiaTokens'->>'agentToken', v_pages[1],
    jsonb_build_object('requestId', extensions.gen_random_uuid(), 'name', 'Databot')
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  v_result := public.ratiflow_connect_issue_agent_v4(
    v_seed->'leoTokens'->>'agentToken', v_pages[2],
    jsonb_build_object('requestId', extensions.gen_random_uuid(), 'name', 'Logbot')
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  v_result := public.ratiflow_connect_issue_agent_v4(
    v_seed->'samTokens'->>'agentToken', v_pages[3],
    jsonb_build_object('requestId', extensions.gen_random_uuid(), 'name', 'Builder')
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  select task_id into strict v_task from public.ratiflow_issue_tasks_v4
  where document_id = v_document_id and task_key = 'TASK-1';
  v_result := public.ratiflow_submit_issue_task_result_v4(
    v_seed->'nadiaTokens'->>'agentToken', v_pages[1], jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'taskId', v_task,
      'basedOnRevision', 1,
      'resultSummary', $s1$Added verified impact totals, the derived success count, a GFM outcome table, and a revisioned checkout-outcome chart; confirmed zero duplicate charges.$s1$,
      'replacementText', $r1$Between 09:43 and 10:21 UTC, 28,417 checkout attempts produced 21,675 successes and 6,742 failures across 311 merchants. No duplicate charges occurred.

| Outcome | Count |
|---|---:|
| Attempted | 28,417 |
| Succeeded | 21,675 |
| Failed | 6,742 |
| Merchants affected | 311 |
| Duplicate charges | 0 |

```chart
{
  "version": 1,
  "type": "bar",
  "title": "Checkout outcomes during INC-482",
  "description": "Attempted, succeeded, and failed checkout counts from 09:43 to 10:21 UTC.",
  "labels": ["Attempted", "Succeeded", "Failed"],
  "series": [
    {"name": "Checkouts", "values": [28417, 21675, 6742]}
  ],
  "xLabel": "Outcome",
  "yLabel": "Checkout attempts"
}
```$r1$,
      'evidenceRefs', jsonb_build_array('impact.csv')
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  select task_id into strict v_task from public.ratiflow_issue_tasks_v4
  where document_id = v_document_id and task_key = 'TASK-2';
  v_result := public.ratiflow_submit_issue_task_result_v4(
    v_seed->'leoTokens'->>'agentToken', v_pages[2], jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'taskId', v_task,
      'basedOnRevision', 1,
      'resultSummary', $s2$Added the observed 09:43–10:21 UTC sequence, retry amplification, queue growth, rollback, and recovery from checkout.log.$s2$,
      'replacementText', $r2$- **09:43 UTC** — Provider HTTP 429 responses began.
- **09:47 UTC** — Retry traffic reached 5.8× baseline and queue depth grew from 420 to 18,240.
- **10:17 UTC** — The team rolled back retry middleware commit `7d3c9e1`.
- **10:21 UTC** — Checkout success rate recovered.$r2$,
      'evidenceRefs', jsonb_build_array('checkout.log')
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  select task_id into strict v_task from public.ratiflow_issue_tasks_v4
  where document_id = v_document_id and task_key = 'TASK-3';
  v_result := public.ratiflow_submit_issue_task_result_v4(
    v_seed->'samTokens'->>'agentToken', v_pages[3], jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'taskId', v_task,
      'basedOnRevision', 1,
      'resultSummary', $s3$Separated the provider 429 trigger from the retry regression that amplified and sustained the failure.$s3$,
      'replacementText', $r3$Provider 429 throttling triggered the incident. Retry middleware introduced in commit `7d3c9e1` ignored `Retry-After` and made up to five zero-delay retries. That behavior amplified provider errors and sustained checkout failures until rollback.$r3$,
      'evidenceRefs', jsonb_build_array('checkout.log', 'commit:7d3c9e1')
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  v_result := public.ratiflow_create_issue_thread_v4(
    v_priya_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'expectedRevision', 4,
      'body', $discussion$Provider throttling happened first. Are we overclaiming our code as the root cause?$discussion$,
      'anchor', jsonb_build_object(
        'scope', 'SELECTION', 'field', 'BODY',
        'rangeStart', 1150, 'rangeEnd', 1395
      )
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  select thread_id into strict v_discussion from public.ratiflow_issue_threads_v4
  where document_id = v_document_id and task_id is null
  order by created_at desc, thread_id desc limit 1;

  v_task := ratiflow_document_private.seed_mention_v41(
    v_document_id, v_priya, v_sam,
    $p4$@Builder Clarify this section using the earlier discussion: state that provider 429 throttling was the external trigger, quantify the retry amplification and queue growth, and explain why the retry regression—not provider latency alone—was the root cause of the sustained failure.$p4$,
    1150, 1395, E'## Root cause\n\n', E'\n\n## Detection and response'
  );
  v_result := public.ratiflow_submit_issue_task_result_v4(
    v_seed->'samTokens'->>'agentToken', v_pages[3], jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'taskId', v_task,
      'basedOnRevision', 4,
      'resultSummary', $s4$Clarified trigger versus root cause using Priya's question; quantified the 5.8× retry traffic and 420→18,240 queue growth, and ruled out provider latency alone.$s4$,
      'replacementText', $r4$Provider 429 throttling at 09:43 UTC was the external trigger. It would not, by itself, explain the sustained 38-minute checkout failure. Retry middleware introduced in commit `7d3c9e1` ignored `Retry-After` and made up to five zero-delay retries, driving retry traffic to 5.8× baseline and queue depth from 420 to 18,240. The retry regression was therefore the internal amplifier and root cause of the sustained failure; provider latency alone was not.$r4$,
      'evidenceRefs', jsonb_build_array(
        'checkout.log', 'commit:7d3c9e1', 'thread:PM-HUMAN-DISCUSSION-1'
      )
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  v_result := public.ratiflow_resolve_issue_thread_v4(
    v_priya_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'threadId', v_discussion
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  return ratiflow_document_private.legacy_join_issue_v4(
    v_seed->>'shareToken', jsonb_build_object('displayName', p_display_name)
  );
end;
$$;

create or replace function ratiflow_document_private.seed_product_start_v41()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_seed jsonb;
declare v_document_id uuid;
declare v_jordan uuid;
declare v_revision_id uuid := extensions.gen_random_uuid();
declare v_title text := 'Northstar · CSV export launch decision';
declare v_body text := $product$## Decision summary

Synthesis pending.

## Customer and business context

Northstar's **$180,000 renewal** requires production-ready CSV export by **November 1**. The customer needs reliable exports for finance reconciliation, not a one-off internal download.

## Capacity and constraints

- Engineering capacity before October 15: **18 days**.
- Reliability work: **10 engineering days**.
- Invite-only beta export: **4 engineering days**.
- Full GA export: **8 engineering days total**.

## Options and trade-offs

Analysis in progress.

## Milestones

- **October 15** — Candidate invite-only beta checkpoint.
- **November 1** — Contractual production-ready CSV deadline.

## Scope

In scope: CSV download for approved Northstar datasets, audit metadata, export correctness monitoring, and a support runbook.

Out of scope: scheduled delivery, custom schemas, and exports for the full customer base before GA.

## Success measures

- Reliability work completes before beta.
- Design partners can export correct CSV files on October 15.
- Full GA support and the renewal-critical commitment are ready by November 1.

## Risks and guardrails

The beta must remain invite-only until correctness and support signals are reviewed. No milestone label may imply general availability before November 1.$product$;
declare v_base timestamptz := clock_timestamp();
declare v_morgan jsonb;
declare v_avery jsonb;
declare v_elena jsonb;
begin
  v_seed := ratiflow_document_private.seed_issue_v4(
    'PRODUCT_DOCUMENT', 'Jordan Lee', 'NONE'
  );
  v_document_id := (v_seed->>'documentId')::uuid;
  v_jordan := (v_seed->>'priyaMemberId')::uuid;
  delete from public.ratiflow_issue_activity_v4 where document_id = v_document_id;
  delete from public.ratiflow_issue_revisions_v4 where document_id = v_document_id;
  update public.ratiflow_documents
  set issue_kind = 'PRODUCT_DOCUMENT', title = v_title, body = v_body,
    revision = 1, activity_version = 1, updated_at = v_base,
    last_editor_member_id = v_jordan, last_editor_display_name = 'Jordan Lee',
    last_editor_actor_type = 'HUMAN', last_editor_origin = 'ORDINARY_UI',
    undo_agent_revision = null, undo_previous_title = null, undo_previous_body = null
  where id = v_document_id;
  insert into public.ratiflow_issue_revisions_v4 (
    revision_id, document_id, revision, parent_revision, title, body,
    content_digest, diffs, source_revision, authority, origin, author_origin,
    task_id, author_actor_type, author_member_id, author_display_name,
    author_agent_label, committer_actor_type, committer_member_id,
    committer_display_name, committer_agent_label, granted_by_member_id,
    granted_by_display_name, approved_by_member_id, approved_by_display_name,
    restored_revision, change_summary, evidence_refs, created_at
  ) values (
    v_revision_id, v_document_id, 1, null, v_title, v_body,
    ratiflow_document_private.content_digest_v4(v_title, v_body),
    jsonb_build_array(
      jsonb_build_object(
        'field', 'TITLE', 'rangeStart', 0, 'rangeEnd', 0,
        'before', '', 'after', v_title
      ),
      jsonb_build_object(
        'field', 'BODY', 'rangeStart', 0, 'rangeEnd', 0,
        'before', '', 'after', v_body
      )
    ),
    0, 'HUMAN', 'ORDINARY_UI', 'ORDINARY_UI', null,
    'HUMAN', v_jordan, 'Jordan Lee', null,
    'HUMAN', v_jordan, 'Jordan Lee', null,
    null, null, null, null, null,
    'Created the Northstar CSV launch decision.', '{}'::text[], v_base
  );
  insert into public.ratiflow_issue_activity_v4 (
    document_id, activity_version, kind, actor_type, actor_member_id,
    actor_display_name, origin, revision, revision_id, created_at
  ) values (
    v_document_id, 1, 'ISSUE_LAUNCHED', 'HUMAN', v_jordan,
    'Jordan Lee', 'ORDINARY_UI', 1, v_revision_id, v_base
  );
  v_morgan := ratiflow_document_private.legacy_join_issue_v4(
    v_seed->>'shareToken', jsonb_build_object('displayName', 'Morgan Chen')
  );
  v_avery := ratiflow_document_private.legacy_join_issue_v4(
    v_seed->>'shareToken', jsonb_build_object('displayName', 'Avery Singh')
  );
  v_elena := ratiflow_document_private.legacy_join_issue_v4(
    v_seed->>'shareToken', jsonb_build_object('displayName', 'Elena Ruiz')
  );
  if v_morgan->>'ok' <> 'true' then return v_morgan; end if;
  if v_avery->>'ok' <> 'true' then return v_avery; end if;
  if v_elena->>'ok' <> 'true' then return v_elena; end if;
  return v_seed || jsonb_build_object(
    'morganBundle', v_morgan->'data',
    'averyBundle', v_avery->'data',
    'elenaBundle', v_elena->'data'
  );
end;
$$;

create or replace function ratiflow_document_private.build_product_example_v41(
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_seed jsonb;
declare v_document_id uuid;
declare v_jordan uuid;
declare v_morgan uuid;
declare v_avery uuid;
declare v_jordan_handle text;
declare v_morgan_agent text;
declare v_avery_agent text;
declare v_elena_handle text;
declare v_morgan_page uuid := extensions.gen_random_uuid();
declare v_avery_page uuid := extensions.gen_random_uuid();
declare v_task uuid;
declare v_discussion uuid;
declare v_root_comment uuid;
declare v_result jsonb;
declare v_body text;
declare v_synthesis text := $synthesis$Ship the reliability work and an **invite-only CSV beta to designated Northstar design partners on October 15**. Use that beta to validate export correctness, audit metadata, monitoring, and the support runbook; it is not GA and is not customer-ready for the full account base.

Complete the remaining four export days after the beta checkpoint and launch **full GA on November 1**. The $180,000 renewal depends on production-ready CSV by that date. Do not broaden access before correctness and support signals pass their guardrails, and do not trade away the 10 reliability days to pull GA forward.$synthesis$;
begin
  v_seed := ratiflow_document_private.seed_product_start_v41();
  if v_seed->>'ok' = 'false' then return v_seed; end if;
  v_document_id := (v_seed->>'documentId')::uuid;
  v_jordan := (v_seed->>'priyaMemberId')::uuid;
  v_morgan := (v_seed->'morganBundle'->>'selfMemberId')::uuid;
  v_avery := (v_seed->'averyBundle'->>'selfMemberId')::uuid;
  v_jordan_handle := v_seed->'priyaTokens'->>'humanToken';
  v_morgan_agent := v_seed->'morganBundle'->>'agentSessionToken';
  v_avery_agent := v_seed->'averyBundle'->>'agentSessionToken';
  v_elena_handle := v_seed->'elenaBundle'->>'humanSessionToken';

  v_result := public.ratiflow_connect_issue_agent_v4(
    v_morgan_agent, v_morgan_page,
    jsonb_build_object('requestId', extensions.gen_random_uuid(), 'name', 'Databot')
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  v_result := public.ratiflow_connect_issue_agent_v4(
    v_avery_agent, v_avery_page,
    jsonb_build_object('requestId', extensions.gen_random_uuid(), 'name', 'ChatGPT')
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  select replace(body,
    '- Engineering capacity before October 15: **18 days**.',
    '- Engineering capacity before October 15: **14 days after reserving 4 days for incident rotation**.'
  ) into strict v_body from public.ratiflow_documents where id = v_document_id;
  v_result := public.ratiflow_save_issue_revision_v4(
    v_jordan_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'expectedRevision', 1,
      'title', 'Northstar · CSV export launch decision', 'body', v_body
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  v_task := ratiflow_document_private.seed_mention_v41(
    v_document_id, v_jordan, v_morgan,
    $pd1$@Databot Compare the reliability-only, staged beta, and full-export-now options using the corrected 14-day pre-beta capacity. Add the arithmetic, a GFM table, and a bar chart, then recommend a sequence that protects the $180,000 renewal and November 1 CSV commitment.$pd1$,
    563, 584, E'## Options and trade-offs\n\n', E'\n\n## Milestones'
  );
  v_result := public.ratiflow_submit_issue_task_result_v4(
    v_morgan_agent, v_morgan_page, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'taskId', v_task,
      'basedOnRevision', 2,
      'resultSummary', $pds1$Compared all three options against corrected capacity, showed that 10 + 4 = 14 fits while 10 + 8 = 18 is four days over, and recommended an October 15 staged beta followed by November 1 GA.$pds1$,
      'replacementText', $pdr1$The corrected pre-beta window is **14 engineering days**. Reliability-only uses 10 days and fits, but it does not deliver CSV. A staged beta uses 10 reliability days + 4 beta-export days = 14 days and exactly fits. Building all 8 export days before beta would require 10 + 8 = 18 days, exceeding capacity by 4.

| Option | Reliability | CSV work before Oct 15 | Total days | Fits 14 days? | Customer outcome |
|---|---:|---:|---:|---|---|
| Reliability only | 10 | 0 | 10 | Yes | No CSV; renewal commitment remains at risk |
| Staged invite-only beta | 10 | 4 | 14 | Yes, exactly | Design-partner beta Oct 15; 4 export days remain |
| Full export before beta | 10 | 8 | 18 | No, 4 over | GA scope too early and reliability competes for capacity |

```chart
{
  "version": 1,
  "type": "bar",
  "title": "Pre-beta engineering-day options",
  "description": "Required engineering days for each October 15 option compared with 14 days of corrected capacity.",
  "labels": ["Reliability only", "Staged beta", "Full export now"],
  "series": [
    {"name": "Required days", "values": [10, 14, 18]},
    {"name": "Available days", "values": [14, 14, 14]}
  ],
  "xLabel": "Option",
  "yLabel": "Engineering days"
}
```

**Recommendation:** complete reliability plus the four-day invite-only beta slice by October 15, then use beta feedback while finishing the remaining four export days for full GA on November 1. This is the only option that fits corrected pre-beta capacity and preserves the $180,000 renewal commitment.$pdr1$,
      'evidenceRefs', jsonb_build_array(
        'northstar-renewal.md', 'capacity-plan.md',
        'export-estimate.md', 'revision:r2'
      )
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  v_task := ratiflow_document_private.seed_mention_v41(
    v_document_id, v_jordan, v_avery,
    $pd2$@ChatGPT Synthesize the decision using the corrected capacity and Databot analysis. State the October 15 audience, November 1 GA commitment, renewal consequence, scope, and guardrails without describing the beta as customer-ready GA.$pd2$,
    21, 39, E'## Decision summary\n\n', E'\n\n## Customer and business context'
  );
  v_result := public.ratiflow_submit_issue_task_result_v4(
    v_avery_agent, v_avery_page, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'taskId', v_task,
      'basedOnRevision', 3,
      'resultSummary', $pds2$Synthesized the staged decision with an explicit design-partner-only October 15 beta, November 1 GA, $180,000 renewal consequence, and reliability/correctness guardrails.$pds2$,
      'replacementText', v_synthesis,
      'evidenceRefs', jsonb_build_array(
        'task:TASK-1', 'revision:r2', 'revision:r3', 'northstar-renewal.md'
      )
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  v_result := public.ratiflow_create_issue_thread_v4(
    v_elena_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'expectedRevision', 4,
      'body', $pdq$Does “invite-only beta” make the October 15 build sound customer-ready? The renewal depends on full GA by November 1.$pdq$,
      'anchor', jsonb_build_object(
        'scope', 'SELECTION', 'field', 'BODY',
        'rangeStart', 21, 'rangeEnd', 620
      )
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  select thread_id into strict v_discussion from public.ratiflow_issue_threads_v4
  where document_id = v_document_id and task_id is null
  order by created_at desc, thread_id desc limit 1;
  select comment_id into strict v_root_comment from public.ratiflow_issue_comments_v4
  where document_id = v_document_id and thread_id = v_discussion
  order by created_at, comment_id limit 1;
  v_result := public.ratiflow_add_issue_comment_v4(
    v_jordan_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'threadId', v_discussion,
      'replyToCommentId', v_root_comment,
      'body', $pda$October 15 is limited to designated design partners. Production support and full-account availability start only at November 1 GA; the decision wording keeps that boundary explicit.$pda$,
      'evidenceRefs', jsonb_build_array('revision:r4')
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  v_result := public.ratiflow_resolve_issue_thread_v4(
    v_elena_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'threadId', v_discussion
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  select replace(body, v_synthesis,
    'Ship CSV to every customer on October 15 and treat that date as general availability. Finish reliability and support follow-up after launch; the November 1 renewal date remains unchanged.'
  ) into strict v_body from public.ratiflow_documents where id = v_document_id;
  v_result := public.ratiflow_save_issue_revision_v4(
    v_elena_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'expectedRevision', 4,
      'title', 'Northstar · CSV export launch decision', 'body', v_body
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  v_result := public.ratiflow_restore_issue_revision_v4(
    v_jordan_handle, jsonb_build_object(
      'requestId', extensions.gen_random_uuid(), 'expectedRevision', 5,
      'revision', 4,
      'changeSummary', 'Restored the staged design-partner beta and November 1 GA decision.'
    ), 'v4.1'
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  return ratiflow_document_private.legacy_join_issue_v4(
    v_seed->>'shareToken', jsonb_build_object('displayName', p_display_name)
  );
end;
$$;

-- Protected deterministic rehearsal start: r1/av4 with three open comment-first
-- mentions, named historical profiles at access count zero, and no page binding.
create or replace function public.ratiflow_reset_postmortem_hero_v4()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare v_seed jsonb;
declare v_document_id uuid;
declare v_share text;
declare v_expiry timestamptz;
declare v_priya_bundle jsonb;
declare v_nadia_bundle jsonb;
declare v_leo_bundle jsonb;
declare v_sam_bundle jsonb;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(824746584004::bigint) then
    return ratiflow_document_private.error_v4(
      'RATE_LIMITED', 'A fixture reset is already in progress.', true
    );
  end if;
  if not ratiflow_document_private.rate_limit_v4('LAUNCH', 60) then
    return ratiflow_document_private.error_v4(
      'RATE_LIMITED', 'Reset rate limit reached.', true
    );
  end if;
  v_seed := ratiflow_document_private.seed_postmortem_start_v41();
  v_document_id := (v_seed->>'documentId')::uuid;
  v_share := v_seed->>'shareToken';
  v_expiry := (v_seed->>'expiresAt')::timestamptz;
  v_priya_bundle := ratiflow_document_private.session_bundle_v41(
    ratiflow_document_private.session_bundle_v4(
      v_document_id, v_share, v_seed->'priyaTokens'->>'humanToken',
      v_seed->'priyaTokens'->>'agentToken',
      (v_seed->'priyaTokens'->>'sessionInstanceId')::uuid,
      (v_seed->>'priyaMemberId')::uuid, v_expiry
    )
  );
  v_nadia_bundle := ratiflow_document_private.session_bundle_v41(
    ratiflow_document_private.session_bundle_v4(
      v_document_id, v_share, v_seed->'nadiaTokens'->>'humanToken',
      v_seed->'nadiaTokens'->>'agentToken',
      (v_seed->'nadiaTokens'->>'sessionInstanceId')::uuid,
      (v_seed->>'nadiaMemberId')::uuid, v_expiry
    )
  );
  v_leo_bundle := ratiflow_document_private.session_bundle_v41(
    ratiflow_document_private.session_bundle_v4(
      v_document_id, v_share, v_seed->'leoTokens'->>'humanToken',
      v_seed->'leoTokens'->>'agentToken',
      (v_seed->'leoTokens'->>'sessionInstanceId')::uuid,
      (v_seed->>'leoMemberId')::uuid, v_expiry
    )
  );
  v_sam_bundle := ratiflow_document_private.session_bundle_v41(
    ratiflow_document_private.session_bundle_v4(
      v_document_id, v_share, v_seed->'samTokens'->>'humanToken',
      v_seed->'samTokens'->>'agentToken',
      (v_seed->'samTokens'->>'sessionInstanceId')::uuid,
      (v_seed->>'samMemberId')::uuid, v_expiry
    )
  );
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'fixtureVersion', 'repo-document-v4.postmortem.v1',
    'shareToken', v_share,
    'priyaBootstrapPath', ratiflow_document_private.bootstrap_path_v4(
      v_share, v_priya_bundle
    ),
    'nadiaBootstrapPath', ratiflow_document_private.bootstrap_path_v4(
      v_share, v_nadia_bundle
    ),
    'leoBootstrapPath', ratiflow_document_private.bootstrap_path_v4(
      v_share, v_leo_bundle
    ),
    'samBootstrapPath', ratiflow_document_private.bootstrap_path_v4(
      v_share, v_sam_bundle
    ),
    'expiresAt', v_expiry, 'revision', 1, 'activityVersion', 4
  ));
end;
$$;

-- Moving the applied functions preserves their former ACLs, and every freshly
-- created function otherwise receives EXECUTE for PUBLIC by default. Reset both
-- surfaces explicitly before granting only the Data API entry points.
revoke all on all functions in schema ratiflow_document_private
  from public, anon, authenticated;

revoke all on function public.ratiflow_launch_issue_v4(jsonb, boolean, text),
  public.ratiflow_join_issue_v4(text, jsonb, text),
  public.ratiflow_inspect_issue_v4(text, uuid, text),
  public.ratiflow_save_issue_revision_v4(text, jsonb, text),
  public.ratiflow_create_issue_task_v4(text, jsonb, text),
  public.ratiflow_create_issue_mention_v4(text, jsonb),
  public.ratiflow_create_issue_thread_v4(text, jsonb, text),
  public.ratiflow_add_issue_comment_v4(text, jsonb, text),
  public.ratiflow_resolve_issue_thread_v4(text, jsonb, text),
  public.ratiflow_cancel_issue_task_v4(text, jsonb, text),
  public.ratiflow_accept_issue_task_v4(text, jsonb, text),
  public.ratiflow_reject_issue_task_v4(text, jsonb, text),
  public.ratiflow_restore_issue_revision_v4(text, jsonb, text),
  public.ratiflow_read_issue_history_v4(text, jsonb, uuid, text),
  public.ratiflow_read_issue_revision_v4(text, jsonb, uuid, text),
  public.ratiflow_connect_issue_agent_v4(text, uuid, jsonb),
  public.ratiflow_read_issue_collaboration_context_v4(text, uuid, jsonb),
  public.ratiflow_list_my_issue_tasks_v4(text, uuid, jsonb, text),
  public.ratiflow_begin_issue_task_wait_v4(text, uuid, uuid, timestamptz),
  public.ratiflow_end_issue_task_wait_v4(text, uuid, uuid),
  public.ratiflow_comment_on_issue_task_v4(text, uuid, jsonb, text),
  public.ratiflow_submit_issue_task_result_v4(text, uuid, jsonb, text),
  public.ratiflow_touch_issue_presence_v4(text, jsonb, text),
  public.ratiflow_reset_postmortem_hero_v4()
  from public, anon, authenticated;

grant execute on function public.ratiflow_launch_issue_v4(jsonb, boolean, text),
  public.ratiflow_join_issue_v4(text, jsonb, text),
  public.ratiflow_inspect_issue_v4(text, uuid, text),
  public.ratiflow_save_issue_revision_v4(text, jsonb, text),
  public.ratiflow_create_issue_task_v4(text, jsonb, text),
  public.ratiflow_create_issue_mention_v4(text, jsonb),
  public.ratiflow_create_issue_thread_v4(text, jsonb, text),
  public.ratiflow_add_issue_comment_v4(text, jsonb, text),
  public.ratiflow_resolve_issue_thread_v4(text, jsonb, text),
  public.ratiflow_cancel_issue_task_v4(text, jsonb, text),
  public.ratiflow_accept_issue_task_v4(text, jsonb, text),
  public.ratiflow_reject_issue_task_v4(text, jsonb, text),
  public.ratiflow_restore_issue_revision_v4(text, jsonb, text),
  public.ratiflow_read_issue_history_v4(text, jsonb, uuid, text),
  public.ratiflow_read_issue_revision_v4(text, jsonb, uuid, text),
  public.ratiflow_connect_issue_agent_v4(text, uuid, jsonb),
  public.ratiflow_read_issue_collaboration_context_v4(text, uuid, jsonb),
  public.ratiflow_list_my_issue_tasks_v4(text, uuid, jsonb, text),
  public.ratiflow_begin_issue_task_wait_v4(text, uuid, uuid, timestamptz),
  public.ratiflow_end_issue_task_wait_v4(text, uuid, uuid),
  public.ratiflow_comment_on_issue_task_v4(text, uuid, jsonb, text),
  public.ratiflow_submit_issue_task_result_v4(text, uuid, jsonb, text),
  public.ratiflow_touch_issue_presence_v4(text, jsonb, text)
  to anon, authenticated;

grant execute on function public.ratiflow_reset_postmortem_hero_v4()
  to service_role;
