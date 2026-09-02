begin;

create table public.recent_session_removals (
  session_id uuid not null references public.coding_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index recent_session_removals_user_idx
  on public.recent_session_removals(user_id, session_id);

alter table public.recent_session_removals enable row level security;
revoke all on public.recent_session_removals from public, anon, authenticated;

create or replace function public.space2code_get_room(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner jsonb;
begin
  if not public.space2code_is_participant(p_session_id, p_user_id) then
    return null;
  end if;

  select jsonb_build_object(
    'user_id', profile.id,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url
  )
  into v_partner
  from public.profiles profile
  where profile.id = coalesce(
    (
      select participant.user_id
      from public.session_participants participant
      where participant.session_id = p_session_id
        and participant.user_id <> p_user_id
      limit 1
    ),
    (select session.resume_partner_id from public.coding_sessions session where session.id = p_session_id)
  );

  return public.space2code_room_json(p_session_id)
    || jsonb_build_object('partner', v_partner);
end;
$$;

create or replace function public.space2code_recent_sessions(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'session_id', session.id,
        'partner_id', partner.id,
        'partner_display_name', partner.display_name,
        'partner_avatar_url', partner.avatar_url,
        'language', session.language,
        'status', session.status,
        'created_at', session.created_at,
        'last_active_at', session.last_active_at,
        'ended_at', session.ended_at,
        'ended_by', session.ended_by,
        'ended_reason', session.ended_reason,
        'expires_at', session.expires_at,
        'can_reconnect', session.status = 'live',
        'can_reopen', session.status = 'ended',
        'resumed_from_session_id', session.resumed_from_session_id
      )
      order by session.last_active_at desc
    ),
    '[]'::jsonb
  )
  from public.coding_sessions session
  join public.session_participants viewer
    on viewer.session_id = session.id
   and viewer.user_id = p_user_id
  left join lateral (
    select profile.*
    from public.profiles profile
    where profile.id = coalesce(
      (
        select participant.user_id
        from public.session_participants participant
        where participant.session_id = session.id
          and participant.user_id <> p_user_id
        limit 1
      ),
      session.resume_partner_id
    )
  ) partner on true
  where session.expires_at > now()
    and not exists (
      select 1
      from public.recent_session_removals removal
      where removal.session_id = session.id
        and removal.user_id = p_user_id
    );
$$;

create or replace function public.space2code_remove_recent_session(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.space2code_is_participant(p_session_id, p_user_id) then
    raise exception 'NOT_A_PARTICIPANT: Membership required';
  end if;

  insert into public.recent_session_removals(session_id, user_id)
  values (p_session_id, p_user_id)
  on conflict (session_id, user_id) do nothing;
end;
$$;

revoke execute on function public.space2code_remove_recent_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.space2code_remove_recent_session(uuid, uuid)
  to service_role;

commit;
