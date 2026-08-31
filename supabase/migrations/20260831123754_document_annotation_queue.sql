-- Additive v1.2 annotation queue. The deployed v1.1 RPCs remain available while the
-- application rolls forward; v1.2 uses versioned RPCs so the old strict surface is not
-- changed underneath an older deployment.

alter type public.ratiflow_document_action_source
  add value if not exists 'ANNOTATION_RAIL';
alter type public.ratiflow_document_action_source
  add value if not exists 'STAGE_TRANSITION';

create type public.ratiflow_document_annotation_kind as enum (
  'HUMAN_REQUEST',
  'STAGE_PREPARATION'
);

drop index if exists public.ratiflow_document_one_pending_action_idx;

alter table public.ratiflow_document_actions
  add column kind public.ratiflow_document_annotation_kind,
  add column created_revision integer,
  add column anchor_revision integer,
  add column resolved_at timestamptz,
  add column resolved_revision integer,
  add column transition_from_stage public.ratiflow_document_stage,
  add column transition_to_stage public.ratiflow_document_stage;

alter table public.ratiflow_document_actions
  drop constraint ratiflow_document_actions_preset_id_check,
  drop constraint ratiflow_document_actions_completed_revision_check,
  drop constraint ratiflow_document_actions_completion_coherent;

alter table public.ratiflow_document_request_ledger
  drop constraint ratiflow_document_request_ledger_operation_check;

update public.ratiflow_document_actions as action
set kind = 'HUMAN_REQUEST',
    created_revision = action.base_revision,
    anchor_revision = action.base_revision,
    resolved_at = case when action.status = 'PENDING' then null else action.created_at end,
    resolved_revision = case
      when action.status = 'PENDING' then null
      when action.completed_revision is not null then action.completed_revision
      else document.revision
    end
from public.ratiflow_documents as document
where document.id = action.document_id;

alter table public.ratiflow_document_actions
  alter column kind set not null,
  alter column kind set default 'HUMAN_REQUEST',
  alter column created_revision set not null,
  alter column anchor_revision set not null,
  add constraint ratiflow_document_actions_preset_id_check check (
    preset_id in (
      'continue_thought', 'turn_into_outline', 'identify_research_gaps',
      'turn_gaps_into_questions', 'rewrite_for_clarity', 'shorten',
      'proofread', 'final_polish', 'custom', 'prepare_for_researching',
      'prepare_for_refine', 'prepare_for_ready_to_ship'
    )
  ),
  add constraint ratiflow_document_actions_completed_revision_check check (
    completed_revision is null or completed_revision >= 0
  ),
  add constraint ratiflow_document_actions_created_revision_check check (
    created_revision >= 0
  ),
  add constraint ratiflow_document_actions_anchor_revision_check check (
    anchor_revision >= 0
  ),
  add constraint ratiflow_document_actions_resolved_revision_check check (
    resolved_revision is null or resolved_revision >= 0
  ),
  add constraint ratiflow_document_actions_lifecycle_coherent check (
    (
      status = 'PENDING'
      and resolved_at is null
      and resolved_revision is null
      and completed_revision is null
    ) or (
      status <> 'PENDING'
      and resolved_at is not null
      and resolved_revision is not null
      and (
        (status = 'COMPLETED' and completed_revision = resolved_revision)
        or (status <> 'COMPLETED' and completed_revision is null)
      )
    )
  ),
  add constraint ratiflow_document_actions_kind_coherent check (
    (
      kind = 'HUMAN_REQUEST'
      and preset_id in (
        'continue_thought', 'turn_into_outline', 'identify_research_gaps',
        'turn_gaps_into_questions', 'rewrite_for_clarity', 'shorten',
        'proofread', 'final_polish', 'custom'
      )
      and source::text in ('CONTEXT_MENU', 'ANNOTATION_RAIL', 'KEYBOARD')
      and transition_from_stage is null
      and transition_to_stage is null
    ) or (
      kind = 'STAGE_PREPARATION'
      and preset_id in (
        'prepare_for_researching', 'prepare_for_refine', 'prepare_for_ready_to_ship'
      )
      and source::text = 'STAGE_TRANSITION'
      and transition_from_stage is not null
      and transition_to_stage is not null
      and transition_to_stage <> 'BRAINSTORMING'
    )
  );

alter table public.ratiflow_document_request_ledger
  add constraint ratiflow_document_request_ledger_operation_check check (
    operation in (
      'SAVE_HUMAN', 'SET_STAGE', 'CREATE_ACTION', 'APPLY_AGENT_EDIT',
      'UNDO_AGENT_EDIT', 'CREATE_ANNOTATION', 'CANCEL_ANNOTATION',
      'APPLY_AGENT_ANNOTATION'
    )
  );

create index ratiflow_document_actions_pending_queue_idx
  on public.ratiflow_document_actions (document_id, created_at, action_id)
  where status = 'PENDING';
create index ratiflow_document_actions_owner_pending_queue_idx
  on public.ratiflow_document_actions (
    document_id, created_by_member_id, created_at, action_id
  )
  where status = 'PENDING';
create index ratiflow_document_actions_resolved_history_idx
  on public.ratiflow_document_actions (document_id, resolved_at desc, action_id desc)
  where status <> 'PENDING';

create or replace function ratiflow_document_private.normalize_annotation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_document_revision integer;
begin
  new.kind := coalesce(new.kind, 'HUMAN_REQUEST');
  new.created_revision := coalesce(new.created_revision, new.base_revision);
  new.anchor_revision := coalesce(new.anchor_revision, new.base_revision);

  if new.status = 'PENDING' then
    new.resolved_at := null;
    new.resolved_revision := null;
    new.completed_revision := null;
  else
    if new.resolved_revision is null then
      select revision into v_document_revision
      from public.ratiflow_documents
      where id = new.document_id;
      new.resolved_revision := coalesce(new.completed_revision, v_document_revision, 0);
    end if;
    new.resolved_at := coalesce(new.resolved_at, now());
    if new.status = 'COMPLETED' then
      new.completed_revision := new.resolved_revision;
    else
      new.completed_revision := null;
    end if;
  end if;
  return new;
end
$$;

create trigger ratiflow_document_actions_lifecycle_trigger
before insert or update of status, completed_revision, resolved_at, resolved_revision,
  created_revision, anchor_revision
on public.ratiflow_document_actions
for each row execute function ratiflow_document_private.normalize_annotation_lifecycle();

create or replace function ratiflow_document_private.annotation_json(p_action_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select jsonb_build_object(
    'annotationId', a.action_id,
    'kind', a.kind::text,
    'presetId', a.preset_id,
    'label', a.label,
    'instruction', a.instruction,
    'stageAtCreation', a.stage::text,
    'source', case
      when a.source::text = 'CONTEXT_MENU' then 'ANNOTATION_RAIL'
      else a.source::text
    end,
    'targetField', a.target_field::text,
    'targetKind', a.target_kind::text,
    'rangeStart', a.range_start,
    'rangeEnd', a.range_end,
    'selectedText', a.selected_text,
    'createdRevision', a.created_revision,
    'anchorRevision', a.anchor_revision,
    'status', a.status::text,
    'createdBy', jsonb_build_object(
      'memberId', a.created_by_member_id,
      'displayName', m.display_name
    ),
    'createdAt', a.created_at,
    'transition', case
      when a.kind = 'STAGE_PREPARATION' then jsonb_build_object(
        'fromStage', a.transition_from_stage::text,
        'toStage', a.transition_to_stage::text
      )
      else null
    end
  ) || case
    when a.status = 'PENDING' then '{}'::jsonb
    else jsonb_build_object(
      'resolvedAt', a.resolved_at,
      'resolvedRevision', a.resolved_revision
    )
  end
  from public.ratiflow_document_actions as a
  join public.ratiflow_document_members as m
    on m.document_id = a.document_id and m.member_id = a.created_by_member_id
  where a.action_id = p_action_id
$$;

create or replace function ratiflow_document_private.surface_v2(p_document_id uuid)
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
        ) order by p.last_seen_at desc, p.member_id
      )
      from public.ratiflow_document_presence as p
      join public.ratiflow_document_members as m
        on m.document_id = p.document_id and m.member_id = p.member_id
      where p.document_id = d.id
        and p.last_seen_at > now() - interval '15 seconds'
    ), '[]'::jsonb),
    'annotations', coalesce((
      select jsonb_agg(
        ratiflow_document_private.annotation_json(selected.action_id)
        order by selected.created_at, selected.action_id
      )
      from (
        select a.action_id, a.created_at
        from public.ratiflow_document_actions as a
        where a.document_id = d.id and a.status = 'PENDING'
        union all
        select recent.action_id, recent.created_at
        from (
          select a.action_id, a.created_at
          from public.ratiflow_document_actions as a
          where a.document_id = d.id and a.status <> 'PENDING'
          order by a.resolved_at desc, a.action_id desc
          limit 20
        ) as recent
      ) as selected
    ), '[]'::jsonb),
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

create or replace function ratiflow_document_private.stale_v2(
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
      'currentSurface', ratiflow_document_private.surface_v2(d.id),
      'expectedRevision', p_expected_revision,
      'actualRevision', d.revision,
      'nextAction', format('Read the current note and retry against revision %s.', d.revision)
    )
  )
  from public.ratiflow_documents as d
  where d.id = p_document_id
$$;

create or replace function ratiflow_document_private.rate_limited_v2(
  p_document_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select ratiflow_document_private.error(
    'RATE_LIMITED',
    'The pending annotation limit has been reached.',
    false,
    jsonb_build_object(
      'currentSurface', ratiflow_document_private.surface_v2(p_document_id),
      'nextAction', 'Complete or cancel an annotation before adding another.'
    )
  )
$$;

create or replace function ratiflow_document_private.request_fingerprint_v2(
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
  select encode(
    extensions.digest(
      jsonb_build_object(
        'operation', p_operation,
        'memberId', p_member_id,
        'actorType', p_actor_type::text,
        'input', p_input
      )::text,
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function ratiflow_document_private.stage_preparation(
  p_stage public.ratiflow_document_stage
)
returns table (preset_id text, label text, instruction text)
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select preparation.preset_id, preparation.label, preparation.instruction
  from (values
    (
      'RESEARCHING'::public.ratiflow_document_stage,
      'prepare_for_researching',
      'Prepare for research',
      'Organize the document into a clear research brief. Preserve ideas, group related points, and surface questions, assumptions, and evidence gaps. Do not invent research or citations.'
    ),
    (
      'REFINE'::public.ratiflow_document_stage,
      'prepare_for_refine',
      'Prepare to refine',
      'Shape the document into a coherent draft using only its existing content. Preserve factual qualifications and make unresolved gaps explicit. Do not invent evidence or citations.'
    ),
    (
      'READY_TO_SHIP'::public.ratiflow_document_stage,
      'prepare_for_ready_to_ship',
      'Prepare to ship',
      'Polish the document for publication by improving clarity, flow, consistency, grammar, and formatting without adding unsupported claims.'
    )
  ) as preparation(stage, preset_id, label, instruction)
  where preparation.stage = p_stage
$$;

create or replace function ratiflow_document_private.stage_rank(
  p_stage public.ratiflow_document_stage
)
returns integer
language sql
immutable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  select case p_stage
    when 'BRAINSTORMING' then 0
    when 'RESEARCHING' then 1
    when 'REFINE' then 2
    when 'READY_TO_SHIP' then 3
  end
$$;

create or replace function ratiflow_document_private.rebase_annotations(
  p_document_id uuid,
  p_field public.ratiflow_document_field,
  p_old_content text,
  p_new_content text,
  p_next_revision integer,
  p_excluded_action_id uuid default null
)
returns void
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
  v_action public.ratiflow_document_actions%rowtype;
  v_start integer;
  v_end integer;
begin
  -- PostgreSQL char_length/substring operate on characters rather than UTF-8 bytes,
  -- matching the contract's Unicode code-point offsets.
  if p_old_content = p_new_content then
    update public.ratiflow_document_actions
    set base_revision = p_next_revision,
        anchor_revision = p_next_revision,
        range_start = case when target_kind = 'DOCUMENT' then 0 else range_start end,
        range_end = case
          when target_kind = 'DOCUMENT' then v_new_length
          else range_end
        end,
        selected_text = case
          when target_kind = 'DOCUMENT' then p_new_content
          else substring(p_new_content from range_start + 1 for range_end - range_start)
        end
    where document_id = p_document_id
      and status = 'PENDING'
      and target_field = p_field
      and (p_excluded_action_id is null or action_id <> p_excluded_action_id);
    return;
  end if;

  while v_prefix < least(v_old_length, v_new_length)
    and substring(p_old_content from v_prefix + 1 for 1)
      = substring(p_new_content from v_prefix + 1 for 1)
  loop
    v_prefix := v_prefix + 1;
  end loop;

  while v_suffix < least(v_old_length - v_prefix, v_new_length - v_prefix)
    and substring(p_old_content from v_old_length - v_suffix for 1)
      = substring(p_new_content from v_new_length - v_suffix for 1)
  loop
    v_suffix := v_suffix + 1;
  end loop;

  v_splice_end := v_old_length - v_suffix;
  v_replacement_length := v_new_length - v_prefix - v_suffix;
  v_delta := v_replacement_length - (v_splice_end - v_prefix);

  for v_action in
    select *
    from public.ratiflow_document_actions
    where document_id = p_document_id
      and status = 'PENDING'
      and target_field = p_field
      and (p_excluded_action_id is null or action_id <> p_excluded_action_id)
    order by action_id
    for update
  loop
    if v_action.target_kind = 'DOCUMENT' then
      update public.ratiflow_document_actions
      set range_start = 0,
          range_end = v_new_length,
          selected_text = p_new_content,
          base_revision = p_next_revision,
          anchor_revision = p_next_revision
      where action_id = v_action.action_id;
    elsif v_action.range_end <= v_prefix then
      update public.ratiflow_document_actions
      set selected_text = substring(
            p_new_content
            from v_action.range_start + 1
            for v_action.range_end - v_action.range_start
          ),
          base_revision = p_next_revision,
          anchor_revision = p_next_revision
      where action_id = v_action.action_id;
    elsif v_action.range_start >= v_splice_end then
      v_start := v_action.range_start + v_delta;
      v_end := v_action.range_end + v_delta;
      update public.ratiflow_document_actions
      set range_start = v_start,
          range_end = v_end,
          selected_text = substring(
            p_new_content from v_start + 1 for v_end - v_start
          ),
          base_revision = p_next_revision,
          anchor_revision = p_next_revision
      where action_id = v_action.action_id;
    else
      update public.ratiflow_document_actions
      set status = 'STALE',
          resolved_at = now(),
          resolved_revision = p_next_revision,
          completed_revision = null
      where action_id = v_action.action_id;
    end if;
  end loop;
end
$$;

create or replace function ratiflow_document_private.advance_pending_anchors(
  p_document_id uuid,
  p_next_revision integer
)
returns void
language sql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
  update public.ratiflow_document_actions
  set base_revision = p_next_revision,
      anchor_revision = p_next_revision
  where document_id = p_document_id and status = 'PENDING'
$$;

create or replace function public.ratiflow_document_launch_v2(
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_result jsonb;
  v_member record;
begin
  v_result := public.ratiflow_document_launch(p_input);
  if v_result->>'ok' = 'true' then
    select * into v_member
    from ratiflow_document_private.member_for_handle(
      v_result#>>'{data,humanSessionToken}'
    );
    if found then
      v_result := jsonb_set(
        v_result,
        '{data,surface}',
        ratiflow_document_private.surface_v2(v_member.document_id),
        false
      );
    end if;
  end if;
  return v_result;
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
declare
  v_result jsonb;
  v_member record;
begin
  v_result := public.ratiflow_document_join(p_share_token, p_input);
  if v_result->>'ok' = 'true' then
    select * into v_member
    from ratiflow_document_private.member_for_handle(
      v_result#>>'{data,humanSessionToken}'
    );
    if found then
      v_result := jsonb_set(
        v_result,
        '{data,surface}',
        ratiflow_document_private.surface_v2(v_member.document_id),
        false
      );
    end if;
  end if;
  return v_result;
end
$$;

create or replace function public.ratiflow_document_inspect_v2(p_handle text)
returns jsonb
language plpgsql
stable
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
    'data', ratiflow_document_private.surface_v2(v_member.document_id)
  );
end
$$;

create or replace function public.ratiflow_document_list_agent_annotations_v2(
  p_handle text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_member record;
  v_annotations jsonb;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized();
  end if;

  select coalesce(
    jsonb_agg(
      ratiflow_document_private.annotation_json(a.action_id)
      order by a.created_at, a.action_id
    ),
    '[]'::jsonb
  ) into v_annotations
  from public.ratiflow_document_actions as a
  where a.document_id = v_member.document_id
    and a.created_by_member_id = v_member.member_id
    and a.status = 'PENDING';

  return jsonb_build_object('ok', true, 'data', v_annotations);
end
$$;

create or replace function public.ratiflow_document_save_human_v2(
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
  v_fingerprint := ratiflow_document_private.request_fingerprint_v2(
    'SAVE_HUMAN', v_member.member_id, v_member.actor_type, p_input
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
    if v_existing.operation = 'SAVE_HUMAN' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale_v2(
      v_document.id, v_expected_revision
    );
  elsif v_document.title = p_input->>'title'
    and v_document.body = p_input->>'body' then
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface_v2(v_document.id)
    );
  else
    v_next_revision := v_document.revision + 1;
    perform ratiflow_document_private.rebase_annotations(
      v_document.id,
      'TITLE',
      v_document.title,
      p_input->>'title',
      v_next_revision
    );
    perform ratiflow_document_private.rebase_annotations(
      v_document.id,
      'BODY',
      v_document.body,
      p_input->>'body',
      v_next_revision
    );
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
      'data', ratiflow_document_private.surface_v2(v_document.id)
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

create or replace function public.ratiflow_document_set_stage_v2(
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
  v_is_forward boolean;
  v_document_pending integer;
  v_member_pending integer;
  v_preparation record;
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
  v_fingerprint := ratiflow_document_private.request_fingerprint_v2(
    'SET_STAGE', v_member.member_id, v_member.actor_type, p_input
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
    if v_existing.operation = 'SET_STAGE' and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale_v2(
      v_document.id, v_expected_revision
    );
  elsif v_stage = v_document.stage then
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface_v2(v_document.id)
    );
  else
    v_is_forward := ratiflow_document_private.stage_rank(v_stage)
      > ratiflow_document_private.stage_rank(v_document.stage);
    if v_is_forward then
      select count(*) into v_document_pending
      from public.ratiflow_document_actions
      where document_id = v_document.id and status = 'PENDING';
      select count(*) into v_member_pending
      from public.ratiflow_document_actions
      where document_id = v_document.id
        and created_by_member_id = v_member.member_id
        and status = 'PENDING';
      if v_document_pending >= 100 or v_member_pending >= 50 then
        v_result := ratiflow_document_private.rate_limited_v2(v_document.id);
      end if;
    end if;

    if v_result is null then
      v_next_revision := v_document.revision + 1;
      perform ratiflow_document_private.advance_pending_anchors(
        v_document.id, v_next_revision
      );
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

      if v_is_forward then
        select * into v_preparation
        from ratiflow_document_private.stage_preparation(v_stage);
        insert into public.ratiflow_document_actions(
          document_id, kind, preset_id, label, instruction, stage, source,
          target_field, target_kind, range_start, range_end, selected_text,
          base_revision, created_revision, anchor_revision, status,
          created_by_member_id, transition_from_stage, transition_to_stage
        ) values (
          v_document.id,
          'STAGE_PREPARATION',
          v_preparation.preset_id,
          v_preparation.label,
          v_preparation.instruction,
          v_stage,
          'STAGE_TRANSITION',
          'BODY',
          'DOCUMENT',
          0,
          char_length(v_document.body),
          v_document.body,
          v_next_revision,
          v_next_revision,
          v_next_revision,
          'PENDING',
          v_member.member_id,
          v_document.stage,
          v_stage
        );
      end if;

      v_result := jsonb_build_object(
        'ok', true,
        'data', ratiflow_document_private.surface_v2(v_document.id)
      );
    end if;
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'SET_STAGE', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_create_annotation_v2(
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
  v_document_pending integer;
  v_member_pending integer;
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
    or p_input->>'source' not in ('ANNOTATION_RAIL', 'KEYBOARD')
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
  v_fingerprint := ratiflow_document_private.request_fingerprint_v2(
    'CREATE_ANNOTATION', v_member.member_id, v_member.actor_type, p_input
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
    if v_existing.operation = 'CREATE_ANNOTATION'
      and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale_v2(
      v_document.id, v_expected_revision
    );
  else
    select count(*) into v_document_pending
    from public.ratiflow_document_actions
    where document_id = v_document.id and status = 'PENDING';
    select count(*) into v_member_pending
    from public.ratiflow_document_actions
    where document_id = v_document.id
      and created_by_member_id = v_member.member_id
      and status = 'PENDING';
    if v_document_pending >= 100 or v_member_pending >= 50 then
      v_result := ratiflow_document_private.rate_limited_v2(v_document.id);
    end if;

    if v_result is null then
      if p_input->>'presetId' = 'custom' then
        v_label := 'Ask agent…';
        v_instruction := v_normalized_input->>'customInstruction';
      else
        select * into v_preset
        from ratiflow_document_private.preset(
          v_document.stage, p_input->>'presetId'
        );
        if not found then
          v_result := ratiflow_document_private.input_error();
        else
          v_label := v_preset.label;
          v_instruction := v_preset.instruction;
        end if;
      end if;
    end if;

    if v_result is null then
      v_content := case
        when p_input->>'targetField' = 'TITLE' then v_document.title
        else v_document.body
      end;
      if v_range_end > char_length(v_content) then
        v_result := ratiflow_document_private.input_error();
      elsif p_input->>'targetKind' = 'SELECTION'
        and v_range_start = v_range_end then
        v_result := ratiflow_document_private.input_error();
      elsif p_input->>'targetKind' = 'CARET' and (
        v_range_start <> v_range_end
        or p_input->>'targetField' <> 'BODY'
        or p_input->>'presetId' <> 'continue_thought'
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
      insert into public.ratiflow_document_actions(
        action_id, document_id, kind, preset_id, label, instruction, stage,
        source, target_field, target_kind, range_start, range_end, selected_text,
        base_revision, created_revision, anchor_revision, status,
        created_by_member_id
      ) values (
        v_action_id,
        v_document.id,
        'HUMAN_REQUEST',
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
        v_document.revision,
        v_document.revision,
        'PENDING',
        v_member.member_id
      );
      v_result := jsonb_build_object(
        'ok', true,
        'data', ratiflow_document_private.surface_v2(v_document.id)
      );
    end if;
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'CREATE_ANNOTATION', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_cancel_annotation_v2(
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
  v_annotation_id uuid;
  v_request_id uuid;
  v_annotation public.ratiflow_document_actions%rowtype;
  v_fingerprint text;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_result jsonb;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'HUMAN' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input, array['annotationId', 'requestId']
    )
    or not (p_input ?& array['annotationId', 'requestId'])
    or jsonb_typeof(p_input->'annotationId') <> 'string'
    or jsonb_typeof(p_input->'requestId') <> 'string' then
    return ratiflow_document_private.input_error();
  end if;
  begin
    v_annotation_id := (p_input->>'annotationId')::uuid;
    v_request_id := (p_input->>'requestId')::uuid;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v2(
    'CANCEL_ANNOTATION', v_member.member_id, v_member.actor_type, p_input
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
    if v_existing.operation = 'CANCEL_ANNOTATION'
      and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  select * into v_annotation
  from public.ratiflow_document_actions
  where action_id = v_annotation_id and document_id = v_document.id
  for update;
  if not found or v_annotation.created_by_member_id <> v_member.member_id then
    v_result := ratiflow_document_private.unauthorized();
  elsif v_annotation.status <> 'PENDING' then
    v_result := ratiflow_document_private.error(
      'STALE_ANNOTATION_CONTEXT',
      'That annotation is no longer pending.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Choose a pending annotation from the current queue.'
      )
    );
  else
    update public.ratiflow_document_actions
    set status = 'CANCELLED',
        resolved_at = now(),
        resolved_revision = v_document.revision,
        completed_revision = null
    where action_id = v_annotation.action_id;
    v_result := jsonb_build_object(
      'ok', true,
      'data', ratiflow_document_private.surface_v2(v_document.id)
    );
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id, v_request_id, 'CANCEL_ANNOTATION', v_fingerprint, v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_apply_agent_annotation_v2(
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
  v_annotation public.ratiflow_document_actions%rowtype;
  v_annotation_id uuid;
  v_request_id uuid;
  v_expected_revision integer;
  v_fingerprint text;
  v_existing public.ratiflow_document_request_ledger%rowtype;
  v_result jsonb;
  v_content text;
  v_current_target text;
  v_new_content text;
  v_next_revision integer;
  v_is_noop boolean;
begin
  select * into v_member
  from ratiflow_document_private.member_for_handle(p_handle);
  if not found or v_member.actor_type <> 'AGENT' then
    return ratiflow_document_private.unauthorized();
  end if;
  if not ratiflow_document_private.exact_keys(
      p_input,
      array[
        'annotationId', 'expectedRevision', 'requestId',
        'replacementText', 'changeSummary'
      ]
    )
    or not (p_input ?& array[
      'annotationId', 'expectedRevision', 'requestId',
      'replacementText', 'changeSummary'
    ])
    or not ratiflow_document_private.valid_nonnegative_integer(
      p_input->'expectedRevision', 2147483647
    )
    or jsonb_typeof(p_input->'annotationId') <> 'string'
    or jsonb_typeof(p_input->'requestId') <> 'string'
    or jsonb_typeof(p_input->'replacementText') <> 'string'
    or jsonb_typeof(p_input->'changeSummary') <> 'string'
    or char_length(p_input->>'replacementText') > 50000
    or char_length(p_input->>'changeSummary') > 240
    or char_length(btrim(p_input->>'changeSummary')) < 1 then
    return ratiflow_document_private.input_error();
  end if;
  begin
    v_annotation_id := (p_input->>'annotationId')::uuid;
    v_request_id := (p_input->>'requestId')::uuid;
  exception when invalid_text_representation then
    return ratiflow_document_private.input_error();
  end;
  v_expected_revision := (p_input->>'expectedRevision')::integer;
  v_fingerprint := ratiflow_document_private.request_fingerprint_v2(
    'APPLY_AGENT_ANNOTATION', v_member.member_id, v_member.actor_type, p_input
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
    if v_existing.operation = 'APPLY_AGENT_ANNOTATION'
      and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  select * into v_annotation
  from public.ratiflow_document_actions
  where action_id = v_annotation_id and document_id = v_document.id
  for update;
  if not found or v_annotation.created_by_member_id <> v_member.member_id then
    v_result := ratiflow_document_private.unauthorized();
  elsif v_annotation.status <> 'PENDING' then
    v_result := ratiflow_document_private.error(
      'STALE_ANNOTATION_CONTEXT',
      'That annotation is no longer pending.',
      true,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Re-inspect the queue and choose a pending annotation.'
      )
    );
  elsif v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale_v2(
      v_document.id, v_expected_revision
    );
  elsif v_annotation.anchor_revision <> v_expected_revision then
    update public.ratiflow_document_actions
    set status = 'STALE',
        resolved_at = now(),
        resolved_revision = v_document.revision,
        completed_revision = null
    where action_id = v_annotation.action_id and status = 'PENDING';
    v_result := ratiflow_document_private.error(
      'STALE_ANNOTATION_CONTEXT',
      'The annotation is no longer anchored to this revision.',
      true,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Re-inspect the queue and choose a pending annotation.'
      )
    );
  else
    v_content := case
      when v_annotation.target_field = 'TITLE' then v_document.title
      else v_document.body
    end;
    if v_annotation.range_start < 0
      or v_annotation.range_end < v_annotation.range_start
      or v_annotation.range_end > char_length(v_content) then
      update public.ratiflow_document_actions
      set status = 'STALE',
          resolved_at = now(),
          resolved_revision = v_document.revision,
          completed_revision = null
      where action_id = v_annotation.action_id and status = 'PENDING';
      v_result := ratiflow_document_private.error(
        'STALE_ANNOTATION_CONTEXT',
        'The annotation target no longer matches the document.',
        true,
        jsonb_build_object(
          'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
          'nextAction', 'Re-inspect the queue and choose a pending annotation.'
        )
      );
    else
      v_current_target := substring(
        v_content
        from v_annotation.range_start + 1
        for v_annotation.range_end - v_annotation.range_start
      );
      if v_current_target <> v_annotation.selected_text then
        update public.ratiflow_document_actions
        set status = 'STALE',
            resolved_at = now(),
            resolved_revision = v_document.revision,
            completed_revision = null
        where action_id = v_annotation.action_id and status = 'PENDING';
        v_result := ratiflow_document_private.error(
          'STALE_ANNOTATION_CONTEXT',
          'The annotation target no longer matches the document.',
          true,
          jsonb_build_object(
            'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
            'nextAction', 'Re-inspect the queue and choose a pending annotation.'
          )
        );
      end if;
    end if;

    if v_result is null then
      v_is_noop := p_input->>'replacementText' = v_current_target;
      if v_is_noop then
        update public.ratiflow_document_actions
        set status = 'COMPLETED',
            resolved_at = now(),
            resolved_revision = v_document.revision,
            completed_revision = v_document.revision
        where action_id = v_annotation.action_id;
        v_result := jsonb_build_object(
          'ok', true,
          'data', jsonb_build_object(
            'surface', ratiflow_document_private.surface_v2(v_document.id),
            'annotation', ratiflow_document_private.annotation_json(
              v_annotation.action_id
            ),
            'change', jsonb_build_object(
              'summary', p_input->>'changeSummary',
              'fromRevision', v_document.revision,
              'toRevision', v_document.revision,
              'annotationId', v_annotation.action_id
            ),
            'undoAvailable', false
          )
        );
      else
        v_new_content := left(v_content, v_annotation.range_start)
          || (p_input->>'replacementText')
          || substring(v_content from v_annotation.range_end + 1);
        if (
          v_annotation.target_field = 'TITLE'
          and char_length(v_new_content) > 160
        ) or (
          v_annotation.target_field = 'BODY'
          and char_length(v_new_content) > 50000
        ) then
          v_result := ratiflow_document_private.input_error();
        else
          v_next_revision := v_document.revision + 1;
          update public.ratiflow_document_actions
          set status = 'COMPLETED',
              resolved_at = now(),
              resolved_revision = v_next_revision,
              completed_revision = v_next_revision
          where action_id = v_annotation.action_id;
          perform ratiflow_document_private.rebase_annotations(
            v_document.id,
            v_annotation.target_field,
            v_content,
            v_new_content,
            v_next_revision,
            v_annotation.action_id
          );
          perform ratiflow_document_private.rebase_annotations(
            v_document.id,
            (
              case
                when v_annotation.target_field = 'TITLE' then 'BODY'
                else 'TITLE'
              end
            )::public.ratiflow_document_field,
            case
              when v_annotation.target_field = 'TITLE' then v_document.body
              else v_document.title
            end,
            case
              when v_annotation.target_field = 'TITLE' then v_document.body
              else v_document.title
            end,
            v_next_revision,
            v_annotation.action_id
          );
          update public.ratiflow_documents
          set title = case
                when v_annotation.target_field = 'TITLE' then v_new_content
                else title
              end,
              body = case
                when v_annotation.target_field = 'BODY' then v_new_content
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
            'data', jsonb_build_object(
              'surface', ratiflow_document_private.surface_v2(v_document.id),
              'annotation', ratiflow_document_private.annotation_json(
                v_annotation.action_id
              ),
              'change', jsonb_build_object(
                'summary', p_input->>'changeSummary',
                'fromRevision', v_document.revision,
                'toRevision', v_next_revision,
                'annotationId', v_annotation.action_id
              ),
              'undoAvailable', true
            )
          );
        end if;
      end if;
    end if;
  end if;

  insert into public.ratiflow_document_request_ledger(
    document_id, request_id, operation, fingerprint, result
  ) values (
    v_document.id,
    v_request_id,
    'APPLY_AGENT_ANNOTATION',
    v_fingerprint,
    v_result
  );
  return v_result;
end
$$;

create or replace function public.ratiflow_document_undo_agent_edit_v2(
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
  v_fingerprint := ratiflow_document_private.request_fingerprint_v2(
    'UNDO_AGENT_EDIT', v_member.member_id, v_member.actor_type, p_input
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
    if v_existing.operation = 'UNDO_AGENT_EDIT'
      and v_existing.fingerprint = v_fingerprint then
      return v_existing.result;
    end if;
    return ratiflow_document_private.error(
      'REQUEST_REPLAY_MISMATCH',
      'This request ID was already used with different content.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Retry with a new request ID.'
      )
    );
  end if;

  if v_expected_revision <> v_document.revision then
    v_result := ratiflow_document_private.stale_v2(
      v_document.id, v_expected_revision
    );
  elsif v_document.undo_agent_revision is null
    or v_document.undo_agent_revision <> v_agent_revision then
    v_result := ratiflow_document_private.error(
      'STALE_ANNOTATION_CONTEXT',
      'That agent edit can no longer be undone.',
      false,
      jsonb_build_object(
        'currentSurface', ratiflow_document_private.surface_v2(v_document.id),
        'nextAction', 'Keep the current note or edit it directly.'
      )
    );
  else
    v_next_revision := v_document.revision + 1;
    perform ratiflow_document_private.rebase_annotations(
      v_document.id,
      'TITLE',
      v_document.title,
      v_document.undo_previous_title,
      v_next_revision
    );
    perform ratiflow_document_private.rebase_annotations(
      v_document.id,
      'BODY',
      v_document.body,
      v_document.undo_previous_body,
      v_next_revision
    );
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
      'data', ratiflow_document_private.surface_v2(v_document.id)
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

create or replace function public.ratiflow_document_touch_presence_v2(
  p_handle text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ratiflow_document_private, extensions
as $$
declare
  v_result jsonb;
  v_member record;
begin
  v_result := public.ratiflow_document_touch_presence(p_handle, p_input);
  if v_result->>'ok' = 'true' then
    select * into v_member
    from ratiflow_document_private.member_for_handle(p_handle);
    if found then
      v_result := jsonb_set(
        v_result,
        '{data}',
        ratiflow_document_private.surface_v2(v_member.document_id),
        false
      );
    end if;
  end if;
  return v_result;
end
$$;

-- Defense in depth for exposed-schema objects: tables remain unreachable and all
-- privileged behavior is mediated by the exact, token-derived RPC boundary.
alter table public.ratiflow_documents enable row level security;
alter table public.ratiflow_document_members enable row level security;
alter table public.ratiflow_document_presence enable row level security;
alter table public.ratiflow_document_actions enable row level security;
alter table public.ratiflow_document_request_ledger enable row level security;

revoke all on public.ratiflow_documents from public, anon, authenticated;
revoke all on public.ratiflow_document_members from public, anon, authenticated;
revoke all on public.ratiflow_document_presence from public, anon, authenticated;
revoke all on public.ratiflow_document_actions from public, anon, authenticated;
revoke all on public.ratiflow_document_request_ledger from public, anon, authenticated;
revoke all on all functions in schema ratiflow_document_private
  from public, anon, authenticated;

-- Mixed-version rollout fence (intentional brief write downtime):
-- 1. Reconcile remote migration history, then apply this migration.
-- 2. Until the v1.2 application is deployed, existing v1.1 tabs may still launch,
--    join, and inspect, but every legacy mutation fails visibly at the RPC boundary.
--    This is safer than letting v1.1 save/stage/create/undo globally stale a v1.2 queue.
-- 3. Deploy the v1.2 application immediately after the migration and require open tabs
--    to reload before writing. Do not re-grant these legacy mutations.
revoke execute on function public.ratiflow_document_save_human(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ratiflow_document_set_stage(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ratiflow_document_create_action(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ratiflow_document_cancel_action(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ratiflow_document_apply_agent_edit(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ratiflow_document_undo_agent_edit(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ratiflow_document_touch_presence(text, jsonb)
  from public, anon, authenticated;

revoke all on function public.ratiflow_document_launch_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_join_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_inspect_v2(text)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_list_agent_annotations_v2(text)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_save_human_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_set_stage_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_create_annotation_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_cancel_annotation_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_apply_agent_annotation_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_undo_agent_edit_v2(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ratiflow_document_touch_presence_v2(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.ratiflow_document_launch_v2(jsonb),
  public.ratiflow_document_join_v2(text, jsonb),
  public.ratiflow_document_inspect_v2(text),
  public.ratiflow_document_list_agent_annotations_v2(text),
  public.ratiflow_document_save_human_v2(text, jsonb),
  public.ratiflow_document_set_stage_v2(text, jsonb),
  public.ratiflow_document_create_annotation_v2(text, jsonb),
  public.ratiflow_document_cancel_annotation_v2(text, jsonb),
  public.ratiflow_document_apply_agent_annotation_v2(text, jsonb),
  public.ratiflow_document_undo_agent_edit_v2(text, jsonb),
  public.ratiflow_document_touch_presence_v2(text, jsonb)
to anon, authenticated;
