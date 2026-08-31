-- Workspace inspection is a strict contract boundary. The original task serializer
-- stripped every JSON null, which also removed the required `claim: null` member from
-- open tasks. For a claim viewed outside its owning page, SQL NULL comparison could
-- likewise remove the required `ownedByCurrentSession: false` member. Keep required
-- members in the base object and strip nulls only from genuinely optional results.
create or replace function ratiflow_private.ratiflow_task_view(
  p_task public.ratiflow_agent_tasks,
  p_page_session_id uuid default null,
  p_caller text default null
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, ratiflow_private, public, extensions
as $$
  select jsonb_build_object(
    'id', p_task.id::text,
    'kind', p_task.kind,
    'body', p_task.body,
    'target', jsonb_build_object('kind', p_task.target_kind, 'id', p_task.target_id),
    'status', case
      when p_task.status = 'CLAIMED' and p_task.claim_expires_at <= now() then 'OPEN'
      else p_task.status
    end,
    'createdBy', ratiflow_private.ratiflow_actor_view(
      p_task.workspace_id, p_task.created_by_member_id
    ),
    'assignedAgent', ratiflow_private.ratiflow_actor_view(
      p_task.workspace_id, p_task.assigned_agent_member_id
    ),
    'claim', case
      when p_task.status <> 'CLAIMED' or p_task.claim_expires_at <= now() then null
      else jsonb_strip_nulls(jsonb_build_object(
        'claimId', case
          when p_task.claim_page_session_id = p_page_session_id
            and p_task.claim_caller = p_caller
            then p_task.claim_id::text
          else null
        end,
        'via', case
          when p_task.claim_caller = 'AUTO_RUNNER' then 'AUTO_PICKUP'
          else 'BROWSER_AGENT'
        end,
        'expiresAt', p_task.claim_expires_at,
        'ownedByCurrentSession', coalesce(
          p_task.claim_page_session_id = p_page_session_id
            and p_task.claim_caller = p_caller,
          false
        )
      ))
    end,
    'createdAt', p_task.created_at,
    'updatedAt', p_task.updated_at
  ) || jsonb_strip_nulls(jsonb_build_object(
    'resultSummary', p_task.result_summary,
    'resultLink', p_task.result_link
  ))
$$;
