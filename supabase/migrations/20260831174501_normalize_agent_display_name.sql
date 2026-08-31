-- Keep the server-derived teammate identity consistent across the participant strip,
-- activity feed, inbox, and native tool results. The original demo-launch RPC still
-- inserts the historical display name, so normalize future inserts at the table
-- boundary and repair already-live isolated workspaces.
create or replace function ratiflow_private.ratiflow_normalize_agent_display_name()
returns trigger
language plpgsql
set search_path = pg_catalog, ratiflow_private, public
as $$
begin
  if new.member_id = 'agent_ratiflow_demo' and new.actor_type = 'AGENT' then
    new.display_name := 'Ratiflow Agent';
  end if;
  return new;
end
$$;

drop trigger if exists ratiflow_normalize_agent_display_name_before_write
  on public.ratiflow_members;
create trigger ratiflow_normalize_agent_display_name_before_write
before insert or update of display_name on public.ratiflow_members
for each row execute function ratiflow_private.ratiflow_normalize_agent_display_name();

update public.ratiflow_members
set display_name = 'Ratiflow Agent'
where member_id = 'agent_ratiflow_demo'
  and actor_type = 'AGENT'
  and display_name is distinct from 'Ratiflow Agent';

revoke all on function ratiflow_private.ratiflow_normalize_agent_display_name()
from public, anon, authenticated;
