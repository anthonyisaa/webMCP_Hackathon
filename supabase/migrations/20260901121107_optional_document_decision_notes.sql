-- Human proposal decisions may omit an explanatory note. Keep the exact rationale
-- key at the RPC boundary, but preserve JSON null as SQL null in both the terminal
-- work order and its memory event.

alter table public.ratiflow_document_work_orders
  drop constraint ratiflow_document_work_decision_coherent;

alter table public.ratiflow_document_work_orders
  add constraint ratiflow_document_work_decision_coherent check (
    (
      status = 'COMPLETED' and decision_kind = 'ACCEPTED'
      and decided_by_member_id is not null
      and decided_by_display_name is not null and decided_at is not null
      and decision_revision is not null and result_revision = decision_revision + 1
      and resolved_at is not null
    ) or (
      status = 'REJECTED' and decision_kind = 'REJECTED'
      and decided_by_member_id is not null
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
  );

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
    or (
      jsonb_typeof(p_input->'rationale') is distinct from 'null'
      and not ratiflow_document_private.nonblank_text_v3(p_input->'rationale', 500)
    ) then
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

revoke all on function ratiflow_document_private.decide_document_proposal_v3(text, jsonb, boolean)
  from public, anon, authenticated;
