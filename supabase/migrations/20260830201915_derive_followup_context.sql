-- Follow-up briefing context must describe the decision that was actually ratified,
-- rather than the canonical demo trajectory. Keep the historical golden copy when
-- Jordan's recorded capacity reduction and O2 are the underlying facts.
create or replace function ratiflow_private.ratiflow_followup_context(
  p_workspace_id text,
  p_option_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare
  v_workspace public.ratiflow_workspaces%rowtype;
  v_option public.ratiflow_options%rowtype;
  v_event record;
  v_change jsonb;
  v_capacity_context text;
  v_reason text;
begin
  select * into v_workspace from public.ratiflow_workspaces where id = p_workspace_id;
  select * into v_option
  from public.ratiflow_options
  where workspace_id = p_workspace_id and id = p_option_id;
  if not found then
    raise exception 'ratiflow_followup_option_not_found';
  end if;

  select e.rationale, change into v_event
  from public.ratiflow_events e
  cross join lateral jsonb_array_elements(e.changes) as change
  where e.workspace_id = p_workspace_id
    and change->>'field' = 'decision.launchCapacityEngineerDays'
    and jsonb_typeof(change->'before') = 'number'
    and jsonb_typeof(change->'after') = 'number'
    and change->>'after' = v_workspace.launch_capacity_engineer_days::text
  order by e.resulting_revision desc
  limit 1;

  if not found then
    v_capacity_context := format('Launch capacity is %s engineer-days', v_workspace.launch_capacity_engineer_days);
  else
    v_change := v_event.change;
    v_reason := lower(left(v_event.rationale, 1)) || substr(v_event.rationale, 2);
    v_capacity_context := format(
      'Capacity %s to %s engineer-days after %s%s',
      case
        when (v_change->>'after')::integer < (v_change->>'before')::integer then 'reduced'
        when (v_change->>'after')::integer > (v_change->>'before')::integer then 'increased'
        else 'updated'
      end,
      v_workspace.launch_capacity_engineer_days,
      case
        when v_reason ~* '^(a|an|the)[[:space:]]+' then ''
        when v_reason ~* '^[aeiou]' then 'an '
        else 'a '
      end,
      v_reason
    );
  end if;

  return jsonb_build_array(
    v_option.title || ' ' || to_char(v_option.launch_date, 'Mon FMDD, YYYY'),
    case
      when v_option.post_launch_engineer_days > 0 then 'GA ' || to_char(v_workspace.customer_usable_export_due_date, 'Mon FMDD, YYYY')
      else 'Usable CSV export by ' || to_char(v_workspace.customer_usable_export_due_date, 'Mon FMDD, YYYY')
    end,
    v_capacity_context
  );
end
$$;

revoke all on function ratiflow_private.ratiflow_followup_context(text, text) from public, anon, authenticated;

create or replace function public.ratiflow_ratify_human(p_handle text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
declare m record; w public.ratiflow_workspaces%rowtype; prepared public.ratiflow_prepared_decisions%rowtype; v_request uuid; v_fingerprint text; v_existing record; v_result jsonb; v_selection jsonb;
begin
  v_selection := jsonb_build_object('kind','DECISION','id','dec_csv_oct15');
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found then return ratiflow_private.ratiflow_unauthorized(v_selection, 0); end if;
  select * into w from public.ratiflow_workspaces where id=m.workspace_id for update;
  v_selection := jsonb_build_object('kind','DECISION','id',w.decision_id);
  if m.member_id <> 'usr_maya_chen' or m.actor_type <> 'HUMAN' then return ratiflow_private.ratiflow_error(w.id,'UNAUTHORIZED','Only Maya Chen can ratify through the ordinary UI.',false,v_selection,0); end if;
  if not ratiflow_private.ratiflow_exact_keys(p_input,array['expectedWorkspaceRevision','requestId','recommendation','customerMessage'])
    or not ratiflow_private.ratiflow_valid_nonnegative_integer(p_input->'expectedWorkspaceRevision', 2147483647)
    or jsonb_typeof(p_input->'requestId') <> 'string' or jsonb_typeof(p_input->'recommendation') <> 'string' or jsonb_typeof(p_input->'customerMessage') <> 'string'
    or coalesce(length(btrim(p_input->>'recommendation')),0) not between 1 and 600 or coalesce(length(btrim(p_input->>'customerMessage')),0) not between 1 and 800 then
    return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Ratification requires bounded recommendation and customer message text.',false,v_selection,0);
  end if;
  begin v_request := (p_input->>'requestId')::uuid; exception when others then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Ratification requires bounded recommendation and customer message text.',false,v_selection,0); end;
  v_fingerprint := encode(extensions.digest(jsonb_build_object('action','RATIFY_DECISION','input',p_input)::text,'sha256'),'hex');
  select * into v_existing from public.ratiflow_request_ledger where workspace_id=w.id and request_id=v_request;
  if found then if v_existing.fingerprint=v_fingerprint then return v_existing.result; end if; return ratiflow_private.ratiflow_error(w.id,'REQUEST_REPLAY_MISMATCH','This request ID was already used with different content.',false,v_selection,0); end if;
  if (p_input->>'expectedWorkspaceRevision')::integer <> w.revision then v_result := ratiflow_private.ratiflow_stale(w.id,(p_input->>'expectedWorkspaceRevision')::integer,v_selection,0);
  elsif w.decision_state <> 'REVIEW' then v_result := ratiflow_private.ratiflow_error(w.id,'NOT_AVAILABLE_IN_STATE','Ratification requires a prepared decision in REVIEW.',false,v_selection,0);
  else
    select * into prepared from public.ratiflow_prepared_decisions where workspace_id=w.id;
    update public.ratiflow_prepared_decisions set recommendation=p_input->>'recommendation',customer_message_draft=p_input->>'customerMessage',review_status='RATIFIED',ratified_by_member_id=m.member_id where workspace_id=w.id;
    update public.ratiflow_workspaces set decision_state='COMMITTED' where id=w.id;
    update public.ratiflow_followups set status='READY',inherited_context=ratiflow_private.ratiflow_followup_context(w.id,prepared.option_id) where workspace_id=w.id;
    v_result := ratiflow_private.ratiflow_commit(w.id,m,'ORDINARY_UI',null,p_input->>'recommendation','RATIFIED',jsonb_build_array(w.decision_id,prepared.id,'fu_customer_launch_brief'),jsonb_build_array(jsonb_build_object('field','decision.state','before','REVIEW','after','COMMITTED'),jsonb_build_object('field','preparedDecision.reviewStatus','before','PROPOSED','after','RATIFIED'),jsonb_build_object('field','followup.status','before','BLOCKED','after','READY')),v_selection,0);
  end if;
  insert into public.ratiflow_request_ledger values(w.id,v_request,v_fingerprint,v_result,now());
  return v_result;
end $$;
