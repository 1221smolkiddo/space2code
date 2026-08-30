begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create type public.session_status as enum ('waiting', 'live', 'ended', 'expired');
create type public.participant_slot as enum ('A', 'B');
create type public.participant_state as enum ('joined', 'connected', 'disconnected', 'left');
create type public.permission_request_status as enum ('pending', 'granted', 'denied', 'cancelled');
create type public.permission_scope as enum ('once', 'session');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coding_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  language text not null check (char_length(language) between 1 and 40),
  status public.session_status not null default 'waiting',
  created_by uuid not null references auth.users(id),
  ended_by uuid references auth.users(id),
  ended_reason text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null,
  check ((status in ('ended', 'expired')) = (ended_at is not null))
);

create table public.session_participants (
  session_id uuid not null references public.coding_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot public.participant_slot not null,
  state public.participant_state not null default 'joined',
  joined_at timestamptz not null default now(),
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  left_at timestamptz,
  primary key (session_id, user_id),
  unique (session_id, slot),
  check ((state = 'left') = (left_at is not null))
);

create table public.editor_permission_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coding_sessions(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  editor_owner_id uuid not null references auth.users(id) on delete cascade,
  status public.permission_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (requester_id <> editor_owner_id),
  check ((status = 'pending') = (resolved_at is null))
);

create unique index one_pending_editor_request
  on public.editor_permission_requests(session_id, requester_id, editor_owner_id)
  where status = 'pending';

create table public.editor_permissions (
  session_id uuid not null references public.coding_sessions(id) on delete cascade,
  editor_owner_id uuid not null references auth.users(id) on delete cascade,
  grantee_id uuid not null references auth.users(id) on delete cascade,
  scope public.permission_scope not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  consumed_at timestamptz,
  primary key (session_id, editor_owner_id, grantee_id),
  check (editor_owner_id <> grantee_id)
);

create table public.session_documents (
  document_name text primary key,
  session_id uuid not null references public.coding_sessions(id) on delete cascade,
  owner_slot public.participant_slot not null,
  y_state_base64 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, owner_slot)
);

create table public.session_document_versions (
  id bigint generated always as identity primary key,
  document_name text not null references public.session_documents(document_name) on delete cascade,
  y_state_base64 text not null,
  captured_at timestamptz not null default now()
);

create index coding_sessions_expiry_idx on public.coding_sessions(expires_at);
create index participant_user_idx on public.session_participants(user_id, session_id);
create index document_version_timeline_idx
  on public.session_document_versions(document_name, captured_at desc);

create or replace function public.space2code_room_json(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id,
    'room_code', s.room_code,
    'language', s.language,
    'status', s.status,
    'created_by', s.created_by,
    'ended_by', s.ended_by,
    'ended_reason', s.ended_reason,
    'created_at', s.created_at,
    'started_at', s.started_at,
    'ended_at', s.ended_at,
    'expires_at', s.expires_at,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'slot', p.slot,
        'state', p.state,
        'joined_at', p.joined_at,
        'last_connected_at', p.last_connected_at,
        'last_disconnected_at', p.last_disconnected_at,
        'left_at', p.left_at
      ) order by p.slot)
      from public.session_participants p
      where p.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.coding_sessions s
  where s.id = p_session_id;
$$;

create or replace function public.space2code_is_participant(p_session_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.session_participants
    where session_id = p_session_id and user_id = p_user_id
  );
$$;

create or replace function public.space2code_is_current_user_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.space2code_is_participant(p_session_id, auth.uid());
$$;

create or replace function public.space2code_create_room(
  p_room_code text, p_language text, p_user_id uuid, p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_session_id uuid;
begin
  insert into public.coding_sessions(room_code, language, created_by, expires_at)
  values (p_room_code, lower(trim(p_language)), p_user_id, p_expires_at)
  returning id into v_session_id;

  insert into public.session_participants(session_id, user_id, slot)
  values (v_session_id, p_user_id, 'A');

  return public.space2code_room_json(v_session_id);
exception when unique_violation then
  raise exception 'INVALID_ROOM_STATE: Room code already exists';
end;
$$;

create or replace function public.space2code_join_room(p_room_code text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_session public.coding_sessions%rowtype;
begin
  select * into v_session from public.coding_sessions
  where room_code = upper(trim(p_room_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND: Room not found'; end if;
  if v_session.status in ('ended', 'expired') then
    raise exception 'ROOM_ENDED: %', coalesce(v_session.ended_reason, 'Room has ended');
  end if;

  if exists (select 1 from public.session_participants where session_id = v_session.id and user_id = p_user_id) then
    update public.session_participants
      set state = 'joined', left_at = null
      where session_id = v_session.id and user_id = p_user_id;
    return public.space2code_room_json(v_session.id);
  end if;

  if v_session.status <> 'waiting' or
    (select count(*) from public.session_participants where session_id = v_session.id) >= 2 then
    raise exception 'ROOM_FULL: Room already has two users';
  end if;

  insert into public.session_participants(session_id, user_id, slot)
  values (v_session.id, p_user_id, 'B');
  update public.coding_sessions
    set status = 'live', started_at = coalesce(started_at, now())
    where id = v_session.id;
  return public.space2code_room_json(v_session.id);
end;
$$;

create or replace function public.space2code_get_room(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.space2code_is_participant(p_session_id, p_user_id) then return null; end if;
  return public.space2code_room_json(p_session_id);
end;
$$;

create or replace function public.space2code_leave_room(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status public.session_status;
begin
  select status into v_status from public.coding_sessions where id = p_session_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND: Room not found'; end if;
  if not public.space2code_is_participant(p_session_id, p_user_id) then
    raise exception 'NOT_A_PARTICIPANT: User is not a room participant';
  end if;
  if v_status in ('ended', 'expired') then return public.space2code_room_json(p_session_id); end if;

  update public.session_participants set state = 'left', left_at = now()
    where session_id = p_session_id and user_id = p_user_id;
  update public.coding_sessions set status = 'ended', ended_by = p_user_id,
    ended_reason = 'partner_left', ended_at = now(), expires_at = now() + interval '24 hours'
    where id = p_session_id;
  update public.editor_permissions set revoked_at = coalesce(revoked_at, now())
    where session_id = p_session_id;
  return public.space2code_room_json(p_session_id);
end;
$$;

create or replace function public.space2code_set_presence(
  p_session_id uuid, p_user_id uuid, p_connected boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.space2code_is_participant(p_session_id, p_user_id) then
    raise exception 'NOT_A_PARTICIPANT: User is not a room participant';
  end if;
  if p_connected then
    update public.session_participants set state = 'connected', last_connected_at = now()
      where session_id = p_session_id and user_id = p_user_id and state <> 'left';
  else
    update public.session_participants set state = 'disconnected', last_disconnected_at = now()
      where session_id = p_session_id and user_id = p_user_id and state <> 'left';
  end if;
end;
$$;

create or replace function public.space2code_participant_slot(p_session_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select slot::text from public.session_participants
  where session_id = p_session_id and user_id = p_user_id;
$$;

create or replace function public.space2code_request_permission(
  p_session_id uuid, p_requester_id uuid, p_editor_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_request public.editor_permission_requests%rowtype;
begin
  if p_requester_id = p_editor_owner_id then
    raise exception 'INVALID_PERMISSION_REQUEST: Cannot request your own editor';
  end if;
  if not public.space2code_is_participant(p_session_id, p_requester_id) or
     not public.space2code_is_participant(p_session_id, p_editor_owner_id) then
    raise exception 'NOT_A_PARTICIPANT: Both users must be room participants';
  end if;
  if not exists (select 1 from public.coding_sessions where id = p_session_id and status = 'live') then
    raise exception 'INVALID_ROOM_STATE: Room is not live';
  end if;

  select * into v_request from public.editor_permission_requests
    where session_id = p_session_id and requester_id = p_requester_id
      and editor_owner_id = p_editor_owner_id and status = 'pending';
  if not found then
    insert into public.editor_permission_requests(session_id, requester_id, editor_owner_id)
      values (p_session_id, p_requester_id, p_editor_owner_id) returning * into v_request;
  end if;
  return to_jsonb(v_request);
end;
$$;

create or replace function public.space2code_grant_permission(
  p_session_id uuid, p_request_id uuid, p_owner_id uuid, p_scope public.permission_scope
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_request public.editor_permission_requests%rowtype;
declare v_permission public.editor_permissions%rowtype;
begin
  select * into v_request from public.editor_permission_requests
    where id = p_request_id and session_id = p_session_id for update;
  if not found then raise exception 'PERMISSION_REQUEST_NOT_FOUND: Permission request not found'; end if;
  if v_request.editor_owner_id <> p_owner_id or v_request.status <> 'pending' then
    raise exception 'FORBIDDEN: Only the editor owner can grant a pending request';
  end if;
  if not exists (select 1 from public.coding_sessions where id = p_session_id and status = 'live') then
    raise exception 'INVALID_ROOM_STATE: Room is not live';
  end if;

  update public.editor_permission_requests set status = 'granted', resolved_at = now()
    where id = p_request_id;
  insert into public.editor_permissions(session_id, editor_owner_id, grantee_id, scope)
    values (p_session_id, p_owner_id, v_request.requester_id, p_scope)
    on conflict (session_id, editor_owner_id, grantee_id) do update
      set scope = excluded.scope, granted_at = now(), revoked_at = null, consumed_at = null
    returning * into v_permission;
  return to_jsonb(v_permission);
end;
$$;

create or replace function public.space2code_revoke_permission(
  p_session_id uuid, p_owner_id uuid, p_grantee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.space2code_is_participant(p_session_id, p_owner_id) then
    raise exception 'NOT_A_PARTICIPANT: User is not a room participant';
  end if;
  update public.editor_permissions set revoked_at = coalesce(revoked_at, now())
    where session_id = p_session_id and editor_owner_id = p_owner_id and grantee_id = p_grantee_id;
end;
$$;

create or replace function public.space2code_can_write(
  p_session_id uuid, p_owner_id uuid, p_grantee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.editor_permissions ep
    join public.coding_sessions s on s.id = ep.session_id and s.status = 'live'
    where ep.session_id = p_session_id and ep.editor_owner_id = p_owner_id
      and ep.grantee_id = p_grantee_id and ep.revoked_at is null and ep.consumed_at is null
  );
$$;

create or replace function public.space2code_consume_once_permission(
  p_session_id uuid, p_owner_id uuid, p_grantee_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.editor_permissions set consumed_at = now()
    where session_id = p_session_id and editor_owner_id = p_owner_id and grantee_id = p_grantee_id
      and scope = 'once' and revoked_at is null and consumed_at is null;
  return found;
end;
$$;

create or replace function public.space2code_load_document(p_document_name text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select y_state_base64 from public.session_documents where document_name = p_document_name;
$$;

create or replace function public.space2code_store_document(p_document_name text, p_state_base64 text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_match text[];
declare v_session_id uuid;
declare v_slot public.participant_slot;
begin
  v_match := regexp_match(p_document_name,
    '^room:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):user([AB]):code$', 'i');
  if v_match is null then raise exception 'INVALID_ROOM_STATE: Invalid document name'; end if;
  v_session_id := v_match[1]::uuid;
  v_slot := v_match[2]::public.participant_slot;
  if not exists (select 1 from public.coding_sessions where id = v_session_id) then
    raise exception 'ROOM_NOT_FOUND: Room not found';
  end if;

  insert into public.session_documents(document_name, session_id, owner_slot, y_state_base64)
    values (p_document_name, v_session_id, v_slot, p_state_base64)
    on conflict (document_name) do update set y_state_base64 = excluded.y_state_base64, updated_at = now();
  insert into public.session_document_versions(document_name, y_state_base64)
    values (p_document_name, p_state_base64);
end;
$$;

create or replace function public.space2code_cleanup_expired_sessions()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count bigint;
begin
  delete from public.coding_sessions where expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.coding_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.editor_permission_requests enable row level security;
alter table public.editor_permissions enable row level security;
alter table public.session_documents enable row level security;
alter table public.session_document_versions enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy sessions_read_member on public.coding_sessions for select to authenticated
  using (public.space2code_is_current_user_participant(id));
create policy participants_read_member on public.session_participants for select to authenticated
  using (public.space2code_is_current_user_participant(session_id));
create policy permission_requests_read_member on public.editor_permission_requests for select to authenticated
  using (public.space2code_is_current_user_participant(session_id));
create policy permissions_read_member on public.editor_permissions for select to authenticated
  using (public.space2code_is_current_user_participant(session_id));

revoke execute on function public.space2code_room_json(uuid) from public, anon, authenticated;
revoke execute on function public.space2code_is_participant(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_is_current_user_participant(uuid) from public, anon, authenticated;
revoke execute on function public.space2code_create_room(text, text, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.space2code_join_room(text, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_get_room(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_leave_room(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_set_presence(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.space2code_participant_slot(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_request_permission(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_grant_permission(uuid, uuid, uuid, public.permission_scope) from public, anon, authenticated;
revoke execute on function public.space2code_revoke_permission(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_can_write(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_consume_once_permission(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.space2code_load_document(text) from public, anon, authenticated;
revoke execute on function public.space2code_store_document(text, text) from public, anon, authenticated;
revoke execute on function public.space2code_cleanup_expired_sessions() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.space2code_is_current_user_participant(uuid) to authenticated, service_role;
grant execute on function public.space2code_is_participant(uuid, uuid) to service_role;
grant execute on function public.space2code_create_room(text, text, uuid, timestamptz) to service_role;
grant execute on function public.space2code_join_room(text, uuid) to service_role;
grant execute on function public.space2code_get_room(uuid, uuid) to service_role;
grant execute on function public.space2code_leave_room(uuid, uuid) to service_role;
grant execute on function public.space2code_set_presence(uuid, uuid, boolean) to service_role;
grant execute on function public.space2code_participant_slot(uuid, uuid) to service_role;
grant execute on function public.space2code_request_permission(uuid, uuid, uuid) to service_role;
grant execute on function public.space2code_grant_permission(uuid, uuid, uuid, public.permission_scope) to service_role;
grant execute on function public.space2code_revoke_permission(uuid, uuid, uuid) to service_role;
grant execute on function public.space2code_can_write(uuid, uuid, uuid) to service_role;
grant execute on function public.space2code_consume_once_permission(uuid, uuid, uuid) to service_role;
grant execute on function public.space2code_load_document(text) to service_role;
grant execute on function public.space2code_store_document(text, text) to service_role;
grant execute on function public.space2code_cleanup_expired_sessions() to service_role;

select cron.schedule(
  'space2code-expired-session-cleanup',
  '*/15 * * * *',
  $$select public.space2code_cleanup_expired_sessions()$$
);

commit;
