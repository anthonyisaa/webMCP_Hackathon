-- The function returns a column named workspace_id. PostgreSQL therefore treats an
-- unqualified ON CONFLICT (workspace_id) target inside its PL/pgSQL body as ambiguous.
-- Name the primary-key constraint explicitly so catch-up/read lease renewal works in
-- the deployed database without weakening variable-conflict checks globally.
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
  on conflict on constraint ratiflow_agent_status_pkey do update
    set agent_member_id = excluded.agent_member_id,
        last_seen_at = excluded.last_seen_at,
        explicitly_away = false;

  return query select 'OK'::text, m.workspace_id, m.member_id, m.display_name,
    m.member_role, m.actor_type, v_page;
end
$$;
