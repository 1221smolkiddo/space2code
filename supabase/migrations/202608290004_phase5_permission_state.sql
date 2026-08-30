-- Phase 5 integration: reconnect-safe permission hydration and explicit denial.
begin;

create or replace function public.space2code_permission_state(
  p_session_id uuid, p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.space2code_is_participant(p_session_id, p_user_id) then
    raise exception 'NOT_A_PARTICIPANT: User is not a room participant';
  end if;
  return jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.editor_permission_requests r
      where r.session_id = p_session_id and r.status = 'pending'
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.granted_at)
      from public.editor_permissions p
      where p.session_id = p_session_id and p.revoked_at is null and p.consumed_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.space2code_deny_permission(
  p_session_id uuid, p_request_id uuid, p_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_request public.editor_permission_requests%rowtype;
begin
  select * into v_request from public.editor_permission_requests
    where id = p_request_id and session_id = p_session_id for update;
  if not found then
    raise exception 'PERMISSION_REQUEST_NOT_FOUND: Permission request not found';
  end if;
  if v_request.editor_owner_id <> p_owner_id or v_request.status <> 'pending' then
    raise exception 'FORBIDDEN: Only the editor owner can deny a pending request';
  end if;
  if not exists (select 1 from public.coding_sessions where id = p_session_id and status = 'live') then
    raise exception 'INVALID_ROOM_STATE: Room is not live';
  end if;
  update public.editor_permission_requests
    set status = 'denied', resolved_at = now()
    where id = p_request_id
    returning * into v_request;
  return to_jsonb(v_request);
end;
$$;

revoke execute on function public.space2code_permission_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_deny_permission(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.space2code_permission_state(uuid, uuid) to service_role;
grant execute on function public.space2code_deny_permission(uuid, uuid, uuid) to service_role;

commit;
