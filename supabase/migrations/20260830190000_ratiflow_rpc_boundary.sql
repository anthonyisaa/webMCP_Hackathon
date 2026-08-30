-- RPC-only public boundary for isolated Ratiflow hero runs. Apply after
-- 20260830104328_ratiflow_persistence_foundation.sql.
--
-- No service-role credential is required by the application: callers possess a
-- short-lived opaque membership handle, which is hashed before it is stored.
-- `ratiflow_launch_demo` intentionally returns all three handles for *only the
-- newly-created isolated run*. That is the public one-click demo tradeoff; it is
-- not an account or cross-workspace sharing mechanism.

alter table public.ratiflow_prepared_decisions drop constraint if exists ratiflow_prepared_decisions_id_key;
alter table public.ratiflow_followups drop constraint if exists ratiflow_followups_id_key;

create or replace function ratiflow_private.ratiflow_actor(p_member_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select case p_member_id
    when 'system_seed' then jsonb_build_object('id', 'system_seed', 'name', 'Seed fixture', 'role', 'System')
    else jsonb_build_object('id', m.member_id, 'name', m.display_name,
                            'role', case when m.actor_type = 'AGENT' then 'Agent' when m.member_role = 'PRODUCT_LEAD' then 'Product Lead' else 'Engineering Lead' end)
  end
  from public.ratiflow_members m
  where m.member_id = p_member_id
  limit 1
$$;

create or replace function ratiflow_private.ratiflow_readiness(p_workspace_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'activeOptionCount', (select count(*)::integer from public.ratiflow_options o where o.workspace_id = w.id),
    'hasCurrentCapacityEvidence', exists (select 1 from public.ratiflow_evidence e where e.workspace_id = w.id and e.option_id is null and e.kind = 'ENGINEERING_ESTIMATE' and e.title = 'Launch capacity'),
    'hasNorthstarDeadlineEvidence', exists (select 1 from public.ratiflow_evidence e where e.workspace_id = w.id and e.option_id is null and e.kind = 'CUSTOMER_DEADLINE' and e.title = 'Northstar renewal requirement'),
    'selectedOptionId', w.selected_option_id,
    'selectedOptionEngineerDays', (select o.total_engineer_days from public.ratiflow_options o where o.workspace_id = w.id and o.id = w.selected_option_id),
    'launchCapacityEngineerDays', w.launch_capacity_engineer_days,
    'unresolvedBlockingChallengeCount', (select count(*)::integer from public.ratiflow_challenges c where c.workspace_id = w.id and c.option_id = w.selected_option_id and c.severity = 'BLOCKING' and not c.resolved)
  )
  from public.ratiflow_workspaces w where w.id = p_workspace_id
$$;

create or replace function ratiflow_private.ratiflow_derived_state(p_workspace_id text)
returns public.ratiflow_decision_state
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare v public.ratiflow_workspaces%rowtype; v_ready jsonb;
begin
  select * into v from public.ratiflow_workspaces where id = p_workspace_id;
  if v.decision_state = 'COMMITTED' then return 'COMMITTED'; end if;
  if exists (select 1 from public.ratiflow_prepared_decisions p where p.workspace_id = p_workspace_id) then return 'REVIEW'; end if;
  v_ready := ratiflow_private.ratiflow_readiness(p_workspace_id);
  if (v_ready->>'activeOptionCount')::integer >= 2 and (v_ready->>'hasCurrentCapacityEvidence')::boolean
     and (v_ready->>'hasNorthstarDeadlineEvidence')::boolean
     and (v_ready->>'selectedOptionEngineerDays')::integer <= (v_ready->>'launchCapacityEngineerDays')::integer
     and (v_ready->>'unresolvedBlockingChallengeCount')::integer = 0 then return 'READY'; end if;
  return 'CONTESTED';
end $$;

create or replace function ratiflow_private.ratiflow_capabilities(p_workspace_id text, p_selection jsonb, p_epoch integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare v public.ratiflow_workspaces%rowtype; r jsonb; v_tools text[]; v_unavailable jsonb := '[]'::jsonb; v_prepare text[] := array[]::text[];
begin
  select * into v from public.ratiflow_workspaces where id = p_workspace_id;
  r := ratiflow_private.ratiflow_readiness(p_workspace_id);
  v_tools := case v.decision_state
    when 'OPTIONS' then array['inspect_decision','recommend_option','add_evidence','why_not']
    when 'CONTESTED' then array['inspect_decision','recommend_option','add_evidence','compare_options','why_not']
    when 'READY' then array['inspect_decision','recommend_option','add_evidence','compare_options','prepare_decision','why_not']
    when 'REVIEW' then array['inspect_decision','trace_decision','why_not']
    else array['inspect_decision','trace_decision','why_not'] end;
  if p_selection->>'kind' = 'OPTION' and v.decision_state in ('OPTIONS','CONTESTED','READY') then
    v_tools := v_tools || array['inspect_selected_option','challenge_option'];
  elsif p_selection->>'kind' = 'FOLLOWUP' and p_selection->>'id' = 'fu_customer_launch_brief' and v.decision_state = 'COMMITTED' then
    v_tools := v_tools || array['inspect_followup'];
  end if;
  -- Canonical catalog order, never construction order.
  select array_agg(n order by ord) into v_tools from unnest(array['inspect_decision','inspect_selected_option','recommend_option','challenge_option','add_evidence','compare_options','prepare_decision','trace_decision','inspect_followup','why_not']) with ordinality q(n, ord) where n = any(v_tools);
  if v.decision_state in ('OPTIONS','CONTESTED') then
    if (r->>'activeOptionCount')::integer < 2 then v_prepare := v_prepare || 'at least two active options are required'; end if;
    if not (r->>'hasCurrentCapacityEvidence')::boolean then v_prepare := v_prepare || 'current launch-capacity evidence is required'; end if;
    if not (r->>'hasNorthstarDeadlineEvidence')::boolean then v_prepare := v_prepare || 'Northstar deadline evidence is required'; end if;
    if (r->>'selectedOptionEngineerDays')::integer > (r->>'launchCapacityEngineerDays')::integer then v_prepare := v_prepare || format('selected option requires %s engineer-days but launch capacity is %s', r->>'selectedOptionEngineerDays', r->>'launchCapacityEngineerDays'); end if;
    if (r->>'unresolvedBlockingChallengeCount')::integer > 0 then v_prepare := v_prepare || format('%s unresolved blocking challenge(s) against %s', r->>'unresolvedBlockingChallengeCount', r->>'selectedOptionId'); end if;
    v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('action','prepare_decision','unmetPredicates',to_jsonb(v_prepare)));
  elsif v.decision_state = 'REVIEW' then
    v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('action','prepare_decision','unmetPredicates',jsonb_build_array('decision already has a prepared review card')));
  elsif v.decision_state = 'COMMITTED' then
    v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('action','prepare_decision','unmetPredicates',jsonb_build_array('decision is already committed')));
  end if;
  v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('action','ratify_decision','unmetPredicates', case when v.decision_state = 'REVIEW' then jsonb_build_array('ratification is never available through WebMCP; Maya Chen must ratify in the ordinary UI') else jsonb_build_array('ratification is never available through WebMCP; Maya Chen must ratify in the ordinary UI','ratification requires a prepared decision in REVIEW') end));
  return jsonb_build_object('state',v.decision_state::text,'workspaceRevision',v.revision,'contextEpoch',p_epoch,'selection',p_selection,'availableTools',to_jsonb(v_tools),'unavailableActions',v_unavailable,'signature',md5(v.decision_state::text || ':' || v.revision || ':' || p_epoch || ':' || p_selection::text || ':' || array_to_string(v_tools, ',')));
end $$;

create or replace function ratiflow_private.ratiflow_workspace_view(p_workspace_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'id', case when w.id like 'ws_northstar_csv_launch_%' then 'ws_northstar_csv_launch' else w.id end, 'name', w.name, 'revision', w.revision,
    'decision', jsonb_build_object('id',w.decision_id,'question',w.decision_question,'state',w.decision_state::text,'selectedOptionId',w.selected_option_id,'launchDate',w.launch_date::text,'launchCapacityEngineerDays',w.launch_capacity_engineer_days,'coreReliabilityEngineerDays',w.core_reliability_engineer_days),
    'customer', jsonb_build_object('id',w.customer_id,'name',w.customer_name,'annualRenewalUsd',w.customer_annual_renewal_usd,'usableExportDueDate',w.customer_usable_export_due_date::text),
    'options', coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'summary',o.summary,'launchDate',o.launch_date::text,'exportEngineerDays',o.export_engineer_days,'totalEngineerDays',o.total_engineer_days,'postLaunchEngineerDays',o.post_launch_engineer_days) order by case o.id when 'opt_csv_ga_oct15' then 1 when 'opt_csv_beta_oct15' then 2 when 'opt_csv_defer_nov1' then 3 else 4 end) from public.ratiflow_options o where o.workspace_id=w.id),'[]'::jsonb),
    'evidence', coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'optionId',e.option_id,'kind',e.kind::text,'stance',e.stance::text,'title',e.title,'detail',e.detail,'sourceLabel',e.source_label,'actor',coalesce(ratiflow_private.ratiflow_actor(e.actor_id),jsonb_build_object('id',e.actor_id,'name',e.actor_id,'role','System')),'createdAt',e.created_at) || case when e.metrics = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('metrics',e.metrics) end order by e.id) from public.ratiflow_evidence e where e.workspace_id=w.id),'[]'::jsonb),
    'challenges', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'optionId',c.option_id,'summary',c.summary,'severity',c.severity,'resolved',c.resolved) order by c.id) from public.ratiflow_challenges c where c.workspace_id=w.id),'[]'::jsonb),
    'preparedDecision', (select jsonb_build_object('id',p.id,'optionId',p.option_id,'recommendation',p.recommendation,'risks',p.risks,'customerMessageDraft',p.customer_message_draft,'reviewStatus',p.review_status::text,'preparedBy',ratiflow_private.ratiflow_actor(p.prepared_by_member_id)) || case when p.ratified_by_member_id is null then '{}'::jsonb else jsonb_build_object('ratifiedBy',ratiflow_private.ratiflow_actor(p.ratified_by_member_id)) end from public.ratiflow_prepared_decisions p where p.workspace_id=w.id),
    'followup', (select jsonb_build_object('id',f.id,'slug',f.slug,'status',f.status,'ownerId',f.owner_member_id,'dueDate',f.due_date::text,'inheritedContext',f.inherited_context) from public.ratiflow_followups f where f.workspace_id=w.id),
    'provenance', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'actor',jsonb_build_object('id',x.actor_member_id,'name',x.actor_name,'role',x.actor_role),'actorType',x.actor_type::text,'origin',x.origin::text,'baseRevision',x.base_revision,'resultingRevision',x.resulting_revision,'rationale',x.rationale,'reviewStatus',x.review_status::text,'changedEntities',x.changed_entities,'createdAt',x.created_at) || case when x.tool_name is null then '{}'::jsonb else jsonb_build_object('toolName',x.tool_name) end order by x.resulting_revision) from public.ratiflow_events x where x.workspace_id=w.id),'[]'::jsonb),
    'readiness', ratiflow_private.ratiflow_readiness(w.id)
  ) from public.ratiflow_workspaces w where w.id=p_workspace_id
$$;

create or replace function ratiflow_private.ratiflow_error(p_workspace_id text, p_code text, p_message text, p_retryable boolean, p_selection jsonb, p_epoch integer, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
  select jsonb_build_object('ok',false,'code',p_code,'message',p_message,'retryable',p_retryable,'currentWorkspaceRevision',w.revision,'contextEpoch',p_epoch,'currentCapabilities',ratiflow_private.ratiflow_capabilities(w.id,p_selection,p_epoch) - 'signature') || p_extra from public.ratiflow_workspaces w where w.id=p_workspace_id
$$;

create or replace function ratiflow_private.ratiflow_stale(p_workspace_id text, p_expected integer, p_selection jsonb, p_epoch integer)
returns jsonb language sql stable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
  select ratiflow_private.ratiflow_error(p_workspace_id,'STALE_WORK_STATE',format('Workspace advanced from revision %s to %s.',p_expected,w.revision),true,p_selection,p_epoch,
    jsonb_build_object('expectedWorkspaceRevision',p_expected,'actualWorkspaceRevision',w.revision,
      'changes',coalesce((select jsonb_agg(jsonb_build_object('eventId',e.id,'actor',jsonb_build_object('id',e.actor_member_id,'name',e.actor_name,'role',e.actor_role),'origin',e.origin::text,'reason',e.rationale,'resultingRevision',e.resulting_revision,'changes',e.changes) order by e.resulting_revision) from public.ratiflow_events e where e.workspace_id=w.id and e.resulting_revision>p_expected),'[]'::jsonb),
      'nextAction',format('Call inspect_decision, refresh WebMCP tools, then retry against workspace revision %s.',w.revision)))
  from public.ratiflow_workspaces w where w.id=p_workspace_id
$$;

create or replace function ratiflow_private.ratiflow_member_for_handle(p_handle text)
returns table (workspace_id text, member_id text, display_name text, member_role public.ratiflow_member_role, actor_type public.ratiflow_actor_type)
language sql stable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
  select s.workspace_id,s.member_id,m.display_name,m.member_role,m.actor_type
  from ratiflow_private.demo_sessions s join public.ratiflow_members m on m.workspace_id=s.workspace_id and m.member_id=s.member_id
  where s.handle_hash=extensions.digest(p_handle,'sha256') and s.expires_at>now() and s.consumed_at is null
$$;

-- These small validators keep malformed JSON on the INVALID_INPUT path before any
-- lifecycle check or cast. PostgreSQL does not guarantee short-circuit evaluation
-- of arbitrary boolean expressions, so each potentially unsafe conversion is guarded.
create or replace function ratiflow_private.ratiflow_exact_keys(p_value jsonb, p_allowed text[])
returns boolean language plpgsql immutable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then return false; end if;
  return not exists (select 1 from jsonb_object_keys(p_value) key where key <> all(p_allowed));
end $$;

create or replace function ratiflow_private.ratiflow_valid_nonnegative_integer(p_value jsonb, p_max integer)
returns boolean language plpgsql immutable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
declare v_text text; v_number integer;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then return false; end if;
  v_text := p_value #>> '{}';
  if v_text !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  begin v_number := v_text::integer; exception when numeric_value_out_of_range then return false; end;
  return v_number between 0 and p_max;
end $$;

create or replace function ratiflow_private.ratiflow_valid_evidence_metrics(p_value jsonb)
returns boolean language plpgsql immutable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
declare v_date text;
begin
  if p_value is null then return true; end if;
  if not ratiflow_private.ratiflow_exact_keys(p_value, array['engineerDays','annualValueUsd','date']) then return false; end if;
  if p_value ? 'engineerDays' and not ratiflow_private.ratiflow_valid_nonnegative_integer(p_value->'engineerDays', 90) then return false; end if;
  if p_value ? 'annualValueUsd' and not ratiflow_private.ratiflow_valid_nonnegative_integer(p_value->'annualValueUsd', 10000000) then return false; end if;
  if p_value ? 'date' then
    v_date := p_value->>'date';
    if jsonb_typeof(p_value->'date') <> 'string' then return false; end if;
    if v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
    if to_char(to_date(v_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> v_date then return false; end if;
  end if;
  return true;
end $$;

create or replace function ratiflow_private.ratiflow_valid_risks(p_value jsonb)
returns boolean language plpgsql immutable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' then return false; end if;
  if jsonb_array_length(p_value) > 5 then return false; end if;
  return not exists (select 1 from jsonb_array_elements(p_value) risk where jsonb_typeof(risk) <> 'string' or char_length(btrim(risk #>> '{}')) not between 1 and 240);
end $$;

create or replace function ratiflow_private.ratiflow_unauthorized(p_selection jsonb, p_epoch integer)
returns jsonb language sql stable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
  select jsonb_build_object(
    'ok',false,'code','UNAUTHORIZED','message','A valid demo membership session is required.','retryable',false,
    'currentWorkspaceRevision',0,'contextEpoch',greatest(coalesce(p_epoch,0),0),
    'currentCapabilities',jsonb_build_object(
      'state','OPTIONS','workspaceRevision',0,'contextEpoch',greatest(coalesce(p_epoch,0),0),
      'selection',case when p_selection is not null and jsonb_typeof(p_selection)='object' and p_selection ?& array['kind','id'] then p_selection else jsonb_build_object('kind','DECISION','id','dec_csv_oct15') end,
      'availableTools','[]'::jsonb,'unavailableActions','[]'::jsonb))
$$;

-- A deliberately modest global launch budget prevents an anonymous public demo from
-- becoming a fixture-cloning endpoint. It is account-free by design; expired runs are
-- removed before each launch, and a single minute may create at most 24 fresh runs.
create table ratiflow_private.demo_launch_rate_windows (
  bucket timestamptz primary key,
  launch_count integer not null check (launch_count >= 0),
  created_at timestamptz not null default now()
);
alter table ratiflow_private.demo_launch_rate_windows enable row level security;
revoke all on ratiflow_private.demo_launch_rate_windows from public, anon, authenticated;

create or replace function public.ratiflow_launch_demo(p_ttl_seconds integer default 28800)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
declare v_workspace text := 'ws_northstar_csv_launch_' || replace(gen_random_uuid()::text,'-',''); v_expires timestamptz; v_maya text; v_jordan text; v_agent text; v_bucket timestamptz; v_launch_count integer;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 86400 then raise exception 'ratiflow_invalid_ttl'; end if;
  delete from public.ratiflow_workspaces w where w.id like 'ws_northstar_csv_launch_%' and w.created_at < now() - interval '1 hour' and not exists (select 1 from ratiflow_private.demo_sessions s where s.workspace_id=w.id and s.expires_at > now());
  delete from ratiflow_private.demo_launch_rate_windows where bucket < date_trunc('minute', now()) - interval '10 minutes';
  v_bucket := date_trunc('minute', now());
  insert into ratiflow_private.demo_launch_rate_windows(bucket,launch_count) values(v_bucket,1) on conflict (bucket) do update set launch_count=ratiflow_private.demo_launch_rate_windows.launch_count+1 returning launch_count into v_launch_count;
  if v_launch_count > 24 then raise exception 'ratiflow_demo_rate_limited'; end if;
  v_expires := now() + make_interval(secs => p_ttl_seconds);
  v_maya := encode(extensions.gen_random_bytes(32),'hex'); v_jordan := encode(extensions.gen_random_bytes(32),'hex'); v_agent := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.ratiflow_workspaces values (v_workspace,'Northstar CSV launch scope',7,'dec_csv_oct15','Should CSV export belong in the Oct 15, 2026 launch?','READY','opt_csv_ga_oct15','2026-10-15',18,10,'cust_northstar_health','Northstar Health',180000,'2026-11-01',now(),now());
  insert into public.ratiflow_members values (v_workspace,'usr_maya_chen','Maya Chen','PRODUCT_LEAD','HUMAN'),(v_workspace,'usr_jordan_lee','Jordan Lee','ENGINEERING_LEAD','HUMAN'),(v_workspace,'agent_ratiflow_demo','Ratiflow demo agent','PRODUCT_LEAD','AGENT');
  insert into public.ratiflow_options values (v_workspace,'opt_csv_ga_oct15','Full CSV export','Full CSV export, GA Oct 15, 2026','2026-10-15',8,18,0),(v_workspace,'opt_csv_beta_oct15','Northstar beta','Invite-only, single-tenant Northstar beta Oct 15, 2026; GA Nov 1, 2026','2026-10-15',4,14,4),(v_workspace,'opt_csv_defer_nov1','Defer export','Defer all export to GA Nov 1, 2026','2026-11-01',0,10,8);
  insert into public.ratiflow_evidence values
   (v_workspace,'ev_capacity_r7',null,'ENGINEERING_ESTIMATE','CONTEXT','Launch capacity','18 engineer-days are available for the Oct 15 launch.','Jordan planning note','{"engineerDays":18}','system_seed',now(),7),
   (v_workspace,'ev_core_reliability',null,'ENGINEERING_ESTIMATE','CONTEXT','Core reliability','Launch reliability work requires 10 engineer-days.','Engineering plan','{"engineerDays":10}','system_seed',now(),7),
   (v_workspace,'ev_o1_ga_effort','opt_csv_ga_oct15','ENGINEERING_ESTIMATE','SUPPORTS','Full GA export effort','Full GA export requires 8 launch engineer-days.','Export estimate','{"engineerDays":8}','system_seed',now(),7),
   (v_workspace,'ev_o2_beta_effort','opt_csv_beta_oct15','ENGINEERING_ESTIMATE','SUPPORTS','Northstar beta effort','A single-tenant beta requires 4 launch engineer-days; the remaining 4 complete GA after launch.','Export estimate','{"engineerDays":4}','system_seed',now(),7),
   (v_workspace,'ev_o3_deferred_effort','opt_csv_defer_nov1','DELIVERY_RISK','CONTEXT','Deferred export effort','O3 uses 0 export days before Oct 15 and all 8 after launch, leaving no buffer before Nov 1.','Export estimate','{"engineerDays":0}','system_seed',now(),7),
   (v_workspace,'ev_northstar_deadline',null,'CUSTOMER_DEADLINE','CONTEXT','Northstar renewal requirement','The $180,000 renewal needs usable CSV export by Nov 1, not general availability on Oct 15.','Renewal brief','{"annualValueUsd":180000,"date":"2026-11-01"}','system_seed',now(),7);
  insert into public.ratiflow_followups values (v_workspace,'fu_customer_launch_brief','customer-launch-brief','BLOCKED','usr_maya_chen','2026-10-16','[]');
  insert into ratiflow_private.demo_sessions(handle_hash,workspace_id,member_id,expires_at) values (extensions.digest(v_maya,'sha256'),v_workspace,'usr_maya_chen',v_expires),(extensions.digest(v_jordan,'sha256'),v_workspace,'usr_jordan_lee',v_expires),(extensions.digest(v_agent,'sha256'),v_workspace,'agent_ratiflow_demo',v_expires);
  return jsonb_build_object('workspace',ratiflow_private.ratiflow_workspace_view(v_workspace),'mayaSessionToken',v_maya,'jordanSessionToken',v_jordan,'agentSessionToken',v_agent,'expiresAt',v_expires);
end $$;

create or replace function public.ratiflow_inspect(p_handle text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
declare m record; begin select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle); if not found then return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if; return jsonb_build_object('ok',true,'workspace',ratiflow_private.ratiflow_workspace_view(m.workspace_id)); end $$;

create or replace function ratiflow_private.ratiflow_commit(p_workspace_id text,p_member record,p_origin public.ratiflow_event_origin,p_tool text,p_rationale text,p_review public.ratiflow_review_status,p_changed jsonb,p_changes jsonb,p_selection jsonb,p_epoch integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
declare w public.ratiflow_workspaces%rowtype; v_resulting integer; v_event text; v_workspace jsonb;
begin
  select * into w from public.ratiflow_workspaces where id=p_workspace_id for update;
  v_resulting := w.revision + 1;
  v_event := case when p_origin='ORDINARY_UI' and p_member.member_id='usr_jordan_lee' and v_resulting=8 then 'evt_0008_capacity_reduced' else format('evt_%s_%s',lpad(v_resulting::text,4,'0'),coalesce(p_tool,'ui')) end;
  update public.ratiflow_workspaces set revision=v_resulting,updated_at=now() where id=p_workspace_id;
  insert into public.ratiflow_events values(p_workspace_id,v_event,p_member.member_id,p_member.display_name,case when p_member.actor_type = 'AGENT' then 'Agent' when p_member.member_role = 'PRODUCT_LEAD' then 'Product Lead' else 'Engineering Lead' end,p_member.actor_type,p_origin,p_tool,w.revision,v_resulting,p_rationale,p_review,p_changed,p_changes,now());
  insert into public.ratiflow_revision_notices values(p_workspace_id,v_resulting,v_event,now());
  v_workspace := ratiflow_private.ratiflow_workspace_view(p_workspace_id);
  return jsonb_build_object('ok',true,'data',jsonb_build_object('eventId',v_event,'resultingRevision',v_resulting,'changedEntityIds',p_changed,'workspace',v_workspace),'currentWorkspaceRevision',v_resulting,'contextEpoch',p_epoch,'currentCapabilities',ratiflow_private.ratiflow_capabilities(p_workspace_id,p_selection,p_epoch) - 'signature');
end $$;

create or replace function public.ratiflow_mutate_webmcp(p_handle text,p_tool_name text,p_envelope jsonb,p_captured_selection jsonb,p_captured_context_epoch integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
declare m record; w public.ratiflow_workspaces%rowtype; p jsonb; v_request uuid; v_fingerprint text; v_existing record; v_result jsonb; v_id text; v_before text; v_before_state text;
begin
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle); if not found then return ratiflow_private.ratiflow_unauthorized(p_captured_selection,p_captured_context_epoch); end if;
  select * into w from public.ratiflow_workspaces where id=m.workspace_id for update;
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Mutation envelope or captured page context is invalid.',false,jsonb_build_object('kind','DECISION','id',w.decision_id),greatest(coalesce(p_captured_context_epoch,0),0)); end if;
  if p_captured_selection is null or jsonb_typeof(p_captured_selection) <> 'object' or p_captured_context_epoch is null or p_captured_context_epoch < 0 then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Mutation envelope or captured page context is invalid.',false,jsonb_build_object('kind','DECISION','id',w.decision_id),greatest(coalesce(p_captured_context_epoch,0),0)); end if;
  if not ratiflow_private.ratiflow_exact_keys(p_captured_selection,array['kind','id']) or coalesce(p_captured_selection->>'kind','') not in ('DECISION','OPTION','FOLLOWUP') or coalesce(length(p_captured_selection->>'id'),0) not between 1 and 80 then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Mutation envelope or captured page context is invalid.',false,p_captured_selection,p_captured_context_epoch); end if;
  if not (p_envelope ? 'requestId') or not (p_envelope ? 'expectedWorkspaceRevision') or not (p_envelope ? 'contextEpoch') or not (p_envelope ? 'rationale') or not (p_envelope ? 'payload') or jsonb_typeof(p_envelope->'payload') <> 'object' or not ratiflow_private.ratiflow_valid_nonnegative_integer(p_envelope->'expectedWorkspaceRevision', 2147483647) or not ratiflow_private.ratiflow_valid_nonnegative_integer(p_envelope->'contextEpoch', 2147483647) or jsonb_typeof(p_envelope->'rationale') <> 'string' or coalesce(length(btrim(p_envelope->>'rationale')),0) not between 1 and 600 or exists(select 1 from jsonb_object_keys(p_envelope) k where k not in ('expectedWorkspaceRevision','contextEpoch','requestId','rationale','payload')) then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Mutation envelope is invalid.',false,p_captured_selection,p_captured_context_epoch); end if;
  begin v_request := (p_envelope->>'requestId')::uuid; exception when others then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Mutation envelope is invalid.',false,p_captured_selection,p_captured_context_epoch); end;
  if (p_envelope->>'contextEpoch')::integer <> p_captured_context_epoch or p_captured_selection->>'kind' not in ('DECISION','OPTION','FOLLOWUP') or (p_captured_selection->>'kind'='DECISION' and p_captured_selection->>'id' <> w.decision_id) or (p_captured_selection->>'kind'='OPTION' and not exists(select 1 from public.ratiflow_options o where o.workspace_id=w.id and o.id=p_captured_selection->>'id')) or (p_captured_selection->>'kind'='FOLLOWUP' and p_captured_selection->>'id' <> 'fu_customer_launch_brief') then return ratiflow_private.ratiflow_error(w.id,'STALE_PAGE_CONTEXT','The page selection changed; refresh tools and try again.',true,p_captured_selection,p_captured_context_epoch,jsonb_build_object('expectedContextEpoch',p_envelope->>'contextEpoch','actualContextEpoch',p_captured_context_epoch)); end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object('toolName',p_tool_name,'origin','WEBMCP','envelope',p_envelope)::text,'sha256'),'hex'); select * into v_existing from public.ratiflow_request_ledger where workspace_id=w.id and request_id=v_request; if found then if v_existing.fingerprint=v_fingerprint then return v_existing.result; end if; return ratiflow_private.ratiflow_error(w.id,'REQUEST_REPLAY_MISMATCH','This request ID was already used with different content.',false,p_captured_selection,p_captured_context_epoch); end if;
  if (p_envelope->>'expectedWorkspaceRevision')::integer <> w.revision then v_result := ratiflow_private.ratiflow_stale(w.id,(p_envelope->>'expectedWorkspaceRevision')::integer,p_captured_selection,p_captured_context_epoch); insert into public.ratiflow_request_ledger values(w.id,v_request,v_fingerprint,v_result,now()); return v_result; end if;
  p := p_envelope->'payload';
  if p_tool_name is null or char_length(btrim(p_tool_name)) = 0 or p_tool_name not in ('recommend_option','add_evidence','challenge_option','prepare_decision')
    or (p_tool_name='recommend_option' and (not ratiflow_private.ratiflow_exact_keys(p,array['optionId']) or coalesce(length(p->>'optionId'),0) not between 1 and 80))
    or (p_tool_name='add_evidence' and (not ratiflow_private.ratiflow_exact_keys(p,array['optionId','kind','stance','title','detail','sourceLabel','metrics']) or not (p ?& array['optionId','kind','stance','title','detail','sourceLabel']) or coalesce(length(p->>'optionId'),0) not between 1 and 80 or p->>'kind' not in ('CUSTOMER_DEADLINE','ENGINEERING_ESTIMATE','DELIVERY_RISK') or p->>'stance' not in ('SUPPORTS','CHALLENGES','CONTEXT') or coalesce(length(btrim(p->>'title')),0) not between 1 and 120 or coalesce(length(btrim(p->>'detail')),0) not between 1 and 1200 or coalesce(length(btrim(p->>'sourceLabel')),0) not between 1 and 120 or not ratiflow_private.ratiflow_valid_evidence_metrics(p->'metrics')))
    or (p_tool_name='challenge_option' and (not ratiflow_private.ratiflow_exact_keys(p,array['summary','severity','requiredEvidenceKind']) or not (p ?& array['summary','severity']) or coalesce(length(btrim(p->>'summary')),0) not between 1 and 600 or p->>'severity' not in ('BLOCKING','ADVISORY') or (p ? 'requiredEvidenceKind' and p->>'requiredEvidenceKind' not in ('CUSTOMER_DEADLINE','ENGINEERING_ESTIMATE','DELIVERY_RISK'))))
    or (p_tool_name='prepare_decision' and (not ratiflow_private.ratiflow_exact_keys(p,array['optionId','recommendation','risks','customerMessageDraft']) or not (p ?& array['optionId','recommendation','risks','customerMessageDraft']) or coalesce(length(p->>'optionId'),0) not between 1 and 80 or coalesce(length(btrim(p->>'recommendation')),0) not between 1 and 600 or coalesce(length(btrim(p->>'customerMessageDraft')),0) not between 1 and 800 or not ratiflow_private.ratiflow_valid_risks(p->'risks'))) then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Mutation payload is invalid.',false,p_captured_selection,p_captured_context_epoch); end if;
  if p_tool_name='recommend_option' and (select count(*) from jsonb_object_keys(p))=1 and p ? 'optionId' and exists(select 1 from public.ratiflow_options o where o.workspace_id=w.id and o.id=p->>'optionId') and w.decision_state not in ('REVIEW','COMMITTED') then v_before:=w.selected_option_id; update public.ratiflow_workspaces set selected_option_id=p->>'optionId' where id=w.id; update public.ratiflow_workspaces set decision_state=ratiflow_private.ratiflow_derived_state(w.id) where id=w.id; v_result:=ratiflow_private.ratiflow_commit(w.id,m,'WEBMCP','recommend_option',p_envelope->>'rationale','NOT_APPLICABLE',jsonb_build_array(w.decision_id,p->>'optionId'),jsonb_build_array(jsonb_build_object('field','decision.selectedOptionId','before',v_before,'after',p->>'optionId'),jsonb_build_object('field','decision.state','before',w.decision_state::text,'after',(select decision_state::text from public.ratiflow_workspaces where id=w.id))),p_captured_selection,p_captured_context_epoch);
  elsif p_tool_name='add_evidence' and p ?& array['optionId','kind','stance','title','detail','sourceLabel'] and coalesce(length(btrim(p->>'title')),0) between 1 and 120 and coalesce(length(btrim(p->>'detail')),0) between 1 and 1200 and coalesce(length(btrim(p->>'sourceLabel')),0) between 1 and 120 and exists(select 1 from public.ratiflow_options o where o.workspace_id=w.id and o.id=p->>'optionId') and p->>'kind' in ('CUSTOMER_DEADLINE','ENGINEERING_ESTIMATE','DELIVERY_RISK') and p->>'stance' in ('SUPPORTS','CHALLENGES','CONTEXT') and w.decision_state in ('OPTIONS','CONTESTED','READY') then v_id:=format('ev_%s_%s',w.revision+1,(select count(*)+1 from public.ratiflow_evidence where workspace_id=w.id)); insert into public.ratiflow_evidence values(w.id,v_id,p->>'optionId',(p->>'kind')::public.ratiflow_evidence_kind,(p->>'stance')::public.ratiflow_evidence_stance,p->>'title',p->>'detail',p->>'sourceLabel',coalesce(p->'metrics','{}'),m.member_id,now(),w.revision+1); update public.ratiflow_workspaces set decision_state=ratiflow_private.ratiflow_derived_state(w.id) where id=w.id; v_result:=ratiflow_private.ratiflow_commit(w.id,m,'WEBMCP','add_evidence',p_envelope->>'rationale','NOT_APPLICABLE',jsonb_build_array(v_id,p->>'optionId'),jsonb_build_array(jsonb_build_object('field','evidence.count','before',(select count(*)-1 from public.ratiflow_evidence where workspace_id=w.id),'after',(select count(*) from public.ratiflow_evidence where workspace_id=w.id))),p_captured_selection,p_captured_context_epoch);
  elsif p_tool_name='challenge_option' and p_captured_selection->>'kind'='OPTION' and p ?& array['summary','severity'] and coalesce(length(btrim(p->>'summary')),0) between 1 and 600 and p->>'severity' in ('BLOCKING','ADVISORY') and w.decision_state in ('OPTIONS','CONTESTED','READY') then v_id:=format('ch_%s_%s',w.revision+1,(select count(*)+1 from public.ratiflow_challenges where workspace_id=w.id)); v_before_state:=w.decision_state::text; insert into public.ratiflow_challenges values(w.id,v_id,p_captured_selection->>'id',p->>'summary',p->>'severity',null,false); update public.ratiflow_workspaces set decision_state=ratiflow_private.ratiflow_derived_state(w.id) where id=w.id; v_result:=ratiflow_private.ratiflow_commit(w.id,m,'WEBMCP','challenge_option',p_envelope->>'rationale','NOT_APPLICABLE',jsonb_build_array(v_id,p_captured_selection->>'id'),jsonb_build_array(jsonb_build_object('field','challenge.count','before',(select count(*)-1 from public.ratiflow_challenges where workspace_id=w.id),'after',(select count(*) from public.ratiflow_challenges where workspace_id=w.id)),jsonb_build_object('field','decision.state','before',v_before_state,'after',(select decision_state::text from public.ratiflow_workspaces where id=w.id))),p_captured_selection,p_captured_context_epoch);
  elsif p_tool_name='prepare_decision' and p ?& array['optionId','recommendation','risks','customerMessageDraft'] and p->>'optionId'=w.selected_option_id and w.decision_state='READY' and coalesce(length(btrim(p->>'recommendation')),0) between 1 and 600 and coalesce(length(btrim(p->>'customerMessageDraft')),0) between 1 and 800 and jsonb_typeof(p->'risks')='array' and jsonb_array_length(p->'risks')<=5 then v_id:=format('pd_%s',w.revision+1); insert into public.ratiflow_prepared_decisions values(w.id,v_id,p->>'optionId',p->>'recommendation',p->'risks',p->>'customerMessageDraft','PROPOSED',m.member_id,null,w.revision+1); update public.ratiflow_workspaces set decision_state='REVIEW' where id=w.id; v_result:=ratiflow_private.ratiflow_commit(w.id,m,'WEBMCP','prepare_decision',p_envelope->>'rationale','PROPOSED',jsonb_build_array(v_id,w.decision_id,p->>'optionId'),jsonb_build_array(jsonb_build_object('field','decision.state','before','READY','after','REVIEW'),jsonb_build_object('field','preparedDecision.reviewStatus','before','NOT_APPLICABLE','after','PROPOSED')),p_captured_selection,p_captured_context_epoch);
  else v_result:=ratiflow_private.ratiflow_error(w.id,'NOT_AVAILABLE_IN_STATE','This tool is not available in the current decision state.',true,p_captured_selection,p_captured_context_epoch); end if;
  insert into public.ratiflow_request_ledger values(w.id,v_request,v_fingerprint,v_result,now()); return v_result;
end $$;

create or replace function public.ratiflow_workspace_notice(p_handle text)
returns table (workspace_revision integer, event_id text)
language sql stable security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
  select n.workspace_revision,n.event_id from ratiflow_private.ratiflow_member_for_handle(p_handle) m join public.ratiflow_revision_notices n on n.workspace_id=m.workspace_id order by n.workspace_revision desc limit 1
$$;

-- Re-declare the two human UI mutations in readable form so their validation order
-- remains auditable: shape validation, request-id parsing, replay lookup, CAS, write.
create or replace function public.ratiflow_set_launch_capacity(p_handle text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, ratiflow_private, public, extensions as $$
declare m record; w public.ratiflow_workspaces%rowtype; p jsonb; v_request uuid; v_fingerprint text; v_existing record; v_result jsonb; v_before integer; v_state text; v_selection jsonb;
begin
  v_selection := jsonb_build_object('kind','DECISION','id','dec_csv_oct15');
  select * into m from ratiflow_private.ratiflow_member_for_handle(p_handle);
  if not found then return ratiflow_private.ratiflow_unauthorized(v_selection, 0); end if;
  select * into w from public.ratiflow_workspaces where id=m.workspace_id for update;
  v_selection := jsonb_build_object('kind','DECISION','id',w.decision_id);
  if m.member_id <> 'usr_jordan_lee' or m.actor_type <> 'HUMAN' then return ratiflow_private.ratiflow_error(w.id,'UNAUTHORIZED','Only Jordan Lee may update launch capacity in this demo.',false,v_selection,0); end if;
  p := p_input->'payload';
  if not ratiflow_private.ratiflow_exact_keys(p_input,array['expectedWorkspaceRevision','requestId','payload']) then
    return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Capacity updates must use bounded valid input.',false,v_selection,0);
  end if;
  if not ratiflow_private.ratiflow_valid_nonnegative_integer(p_input->'expectedWorkspaceRevision', 2147483647)
    or not ratiflow_private.ratiflow_exact_keys(p,array['launchCapacityEngineerDays','reason'])
    or not ratiflow_private.ratiflow_valid_nonnegative_integer(p->'launchCapacityEngineerDays', 90)
    or jsonb_typeof(p->'reason') <> 'string' or coalesce(length(btrim(p->>'reason')),0) not between 1 and 240 then
    return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Capacity updates must use bounded valid input.',false,v_selection,0);
  end if;
  begin v_request := (p_input->>'requestId')::uuid; exception when others then return ratiflow_private.ratiflow_error(w.id,'INVALID_INPUT','Capacity updates must use bounded valid input.',false,v_selection,0); end;
  v_fingerprint := encode(extensions.digest(jsonb_build_object('action','SET_LAUNCH_CAPACITY','input',p_input)::text,'sha256'),'hex');
  select * into v_existing from public.ratiflow_request_ledger where workspace_id=w.id and request_id=v_request;
  if found then if v_existing.fingerprint=v_fingerprint then return v_existing.result; end if; return ratiflow_private.ratiflow_error(w.id,'REQUEST_REPLAY_MISMATCH','This request ID was already used with different content.',false,v_selection,0); end if;
  if (p_input->>'expectedWorkspaceRevision')::integer <> w.revision then v_result := ratiflow_private.ratiflow_stale(w.id,(p_input->>'expectedWorkspaceRevision')::integer,v_selection,0);
  elsif w.decision_state = 'COMMITTED' then v_result := ratiflow_private.ratiflow_error(w.id,'NOT_AVAILABLE_IN_STATE','The committed decision cannot be changed.',false,v_selection,0);
  else
    v_before := w.launch_capacity_engineer_days; v_state := w.decision_state::text;
    update public.ratiflow_workspaces set launch_capacity_engineer_days=(p->>'launchCapacityEngineerDays')::integer where id=w.id;
    update public.ratiflow_workspaces set decision_state=ratiflow_private.ratiflow_derived_state(w.id) where id=w.id;
    v_result := ratiflow_private.ratiflow_commit(w.id,m,'ORDINARY_UI',null,p->>'reason','NOT_APPLICABLE',jsonb_build_array(w.decision_id),jsonb_build_array(jsonb_build_object('field','decision.launchCapacityEngineerDays','before',v_before,'after',(p->>'launchCapacityEngineerDays')::integer),jsonb_build_object('field','decision.state','before',v_state,'after',(select decision_state::text from public.ratiflow_workspaces where id=w.id)),jsonb_build_object('field','capabilities.prepare_decision','before',v_state='READY','after',(select decision_state='READY' from public.ratiflow_workspaces where id=w.id))),v_selection,0);
  end if;
  insert into public.ratiflow_request_ledger values(w.id,v_request,v_fingerprint,v_result,now());
  return v_result;
end $$;

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
    update public.ratiflow_followups set status='READY',inherited_context=jsonb_build_array('Northstar beta Oct 15, 2026','GA Nov 1, 2026','Capacity reduced to 14 engineer-days after a four-day incident rotation') where workspace_id=w.id;
    v_result := ratiflow_private.ratiflow_commit(w.id,m,'ORDINARY_UI',null,p_input->>'recommendation','RATIFIED',jsonb_build_array(w.decision_id,prepared.id,'fu_customer_launch_brief'),jsonb_build_array(jsonb_build_object('field','decision.state','before','REVIEW','after','COMMITTED'),jsonb_build_object('field','preparedDecision.reviewStatus','before','PROPOSED','after','RATIFIED'),jsonb_build_object('field','followup.status','before','BLOCKED','after','READY')),v_selection,0);
  end if;
  insert into public.ratiflow_request_ledger values(w.id,v_request,v_fingerprint,v_result,now());
  return v_result;
end $$;

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema ratiflow_private from public, anon, authenticated;
grant execute on function public.ratiflow_launch_demo(integer), public.ratiflow_inspect(text), public.ratiflow_mutate_webmcp(text,text,jsonb,jsonb,integer), public.ratiflow_set_launch_capacity(text,jsonb), public.ratiflow_ratify_human(text,jsonb), public.ratiflow_workspace_notice(text) to anon, authenticated;
