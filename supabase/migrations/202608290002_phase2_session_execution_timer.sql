begin;

create type public.session_timer_status as enum ('not_started', 'running', 'expired');
create type public.execution_run_status as enum ('running', 'completed', 'failed');

alter table public.coding_sessions
  add column last_active_at timestamptz not null default now(),
  add column question_a text,
  add column question_b text,
  add column timer_status public.session_timer_status not null default 'not_started',
  add column timer_duration_seconds integer,
  add column timer_started_at timestamptz,
  add column timer_ends_at timestamptz,
  add column timer_started_by uuid references auth.users(id),
  add column resumed_from_session_id uuid references public.coding_sessions(id) on delete set null,
  add column resume_partner_id uuid references auth.users(id);

alter table public.coding_sessions
  add constraint question_a_size check (question_a is null or octet_length(question_a) <= 8000),
  add constraint question_b_size check (question_b is null or octet_length(question_b) <= 8000),
  add constraint timer_duration_range check (
    timer_duration_seconds is null or timer_duration_seconds between 1 and 86400
  ),
  add constraint timer_fields_consistent check (
    (timer_status = 'not_started' and timer_duration_seconds is null and timer_started_at is null
      and timer_ends_at is null and timer_started_by is null)
    or
    (timer_status in ('running', 'expired') and timer_duration_seconds is not null
      and timer_started_at is not null and timer_ends_at is not null and timer_started_by is not null)
  );

create table public.session_resume_sources (
  session_id uuid not null references public.coding_sessions(id) on delete cascade,
  owner_slot public.participant_slot not null,
  source_document_name text not null,
  primary key (session_id, owner_slot)
);

create table public.execution_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coding_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.execution_run_status not null default 'running',
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index one_running_execution_per_user
  on public.execution_runs(user_id) where status = 'running';
create index execution_user_rate_idx on public.execution_runs(user_id, requested_at desc);
create index execution_room_rate_idx on public.execution_runs(session_id, requested_at desc);
create index recent_sessions_activity_idx on public.coding_sessions(last_active_at desc);

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
    'last_active_at', s.last_active_at,
    'started_at', s.started_at,
    'ended_at', s.ended_at,
    'expires_at', s.expires_at,
    'resumed_from_session_id', s.resumed_from_session_id,
    'resume_partner_id', s.resume_partner_id,
    'question_a', s.question_a,
    'question_b', s.question_b,
    'timer', jsonb_build_object(
      'status', case
        when s.timer_status = 'running' and s.timer_ends_at <= now() then 'expired'
        else s.timer_status::text
      end,
      'duration_seconds', s.timer_duration_seconds,
      'started_at', s.timer_started_at,
      'ends_at', s.timer_ends_at,
      'started_by', s.timer_started_by
    ),
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
    update public.session_participants set state = 'joined', left_at = null
      where session_id = v_session.id and user_id = p_user_id;
    update public.coding_sessions set last_active_at = now() where id = v_session.id;
    return public.space2code_room_json(v_session.id);
  end if;

  if v_session.resume_partner_id is not null and v_session.resume_partner_id <> p_user_id then
    raise exception 'FORBIDDEN: This resumed room is reserved for the previous partner';
  end if;
  if v_session.status <> 'waiting' or
    (select count(*) from public.session_participants where session_id = v_session.id) >= 2 then
    raise exception 'ROOM_FULL: Room already has two users';
  end if;

  insert into public.session_participants(session_id, user_id, slot)
  values (v_session.id, p_user_id, 'B');
  update public.coding_sessions
    set status = 'live', started_at = coalesce(started_at, now()), last_active_at = now()
    where id = v_session.id;
  return public.space2code_room_json(v_session.id);
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
    ended_reason = 'partner_left', ended_at = now(), last_active_at = now(),
    expires_at = now() + interval '24 hours'
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
  update public.coding_sessions set last_active_at = now()
    where id = p_session_id and status in ('waiting', 'live');
end;
$$;

create or replace function public.space2code_touch_session(p_session_id uuid, p_now timestamptz)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.coding_sessions set last_active_at = greatest(last_active_at, p_now)
  where id = p_session_id;
$$;

create or replace function public.space2code_update_question(
  p_session_id uuid, p_user_id uuid, p_question text, p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_slot public.participant_slot;
begin
  select p.slot into v_slot from public.session_participants p
    join public.coding_sessions s on s.id = p.session_id
    where p.session_id = p_session_id and p.user_id = p_user_id and s.status in ('waiting', 'live');
  if not found then raise exception 'NOT_A_PARTICIPANT: Active session membership is required'; end if;
  if p_question is not null and octet_length(p_question) > 8000 then
    raise exception 'INVALID_ROOM_STATE: Question exceeds 8000 bytes';
  end if;

  if v_slot = 'A' then
    update public.coding_sessions set question_a = p_question, last_active_at = p_now where id = p_session_id;
  else
    update public.coding_sessions set question_b = p_question, last_active_at = p_now where id = p_session_id;
  end if;
  return public.space2code_room_json(p_session_id);
end;
$$;

create or replace function public.space2code_start_timer(
  p_session_id uuid,
  p_user_id uuid,
  p_duration_seconds integer,
  p_started_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_session public.coding_sessions%rowtype;
begin
  select * into v_session from public.coding_sessions where id = p_session_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND: Room not found'; end if;
  if v_session.status <> 'live' or not public.space2code_is_participant(p_session_id, p_user_id) then
    raise exception 'NOT_A_PARTICIPANT: Live session membership is required';
  end if;
  if p_duration_seconds < 1 or p_duration_seconds > 86400 or
    p_ends_at <> p_started_at + make_interval(secs => p_duration_seconds) then
    raise exception 'INVALID_TIMER_DURATION: Invalid timer duration';
  end if;
  if v_session.timer_status <> 'not_started' then
    raise exception 'TIMER_ALREADY_STARTED: Timer duration is locked after it starts';
  end if;

  update public.coding_sessions set timer_status = 'running', timer_duration_seconds = p_duration_seconds,
    timer_started_at = p_started_at, timer_ends_at = p_ends_at, timer_started_by = p_user_id,
    last_active_at = p_started_at
    where id = p_session_id;
  return jsonb_build_object(
    'status', 'running', 'duration_seconds', p_duration_seconds,
    'started_at', p_started_at, 'ends_at', p_ends_at, 'started_by', p_user_id
  );
end;
$$;

create or replace function public.space2code_recent_sessions(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', s.id,
    'partner_id', coalesce((
      select p2.user_id from public.session_participants p2
      where p2.session_id = s.id and p2.user_id <> p_user_id limit 1
    ), s.resume_partner_id),
    'partner_display_name', partner_profile.display_name,
    'partner_avatar_url', partner_profile.avatar_url,
    'language', s.language,
    'status', s.status,
    'created_at', s.created_at,
    'last_active_at', s.last_active_at,
    'ended_at', s.ended_at,
    'ended_by', s.ended_by,
    'ended_reason', s.ended_reason,
    'can_reconnect', s.status = 'live',
    'can_reopen', s.status = 'ended',
    'resumed_from_session_id', s.resumed_from_session_id
  ) order by s.last_active_at desc), '[]'::jsonb)
  from public.coding_sessions s
  join public.session_participants p on p.session_id = s.id and p.user_id = p_user_id
  left join lateral (
    select profile.display_name, profile.avatar_url
    from public.profiles profile
    where profile.id = coalesce((
      select p2.user_id from public.session_participants p2
      where p2.session_id = s.id and p2.user_id <> p_user_id limit 1
    ), s.resume_partner_id)
  ) partner_profile on true
  where s.expires_at > now();
$$;

create or replace function public.space2code_resume_session(
  p_source_session_id uuid,
  p_room_code text,
  p_user_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_source public.coding_sessions%rowtype;
declare v_source_slot public.participant_slot;
declare v_partner_id uuid;
declare v_session_id uuid;
declare v_source_a text;
declare v_source_b text;
begin
  select * into v_source from public.coding_sessions where id = p_source_session_id for share;
  if not found then raise exception 'ROOM_NOT_FOUND: Session not found'; end if;
  select slot into v_source_slot from public.session_participants
    where session_id = p_source_session_id and user_id = p_user_id;
  if not found then raise exception 'NOT_A_PARTICIPANT: Session membership is required'; end if;
  if v_source.status <> 'ended' or v_source.expires_at <= now() then
    raise exception 'SESSION_NOT_REOPENABLE: Only retained ended sessions can be resumed';
  end if;
  select user_id into v_partner_id from public.session_participants
    where session_id = p_source_session_id and user_id <> p_user_id limit 1;

  if v_source_slot = 'A' then
    v_source_a := format('room:%s:userA:code', p_source_session_id);
    v_source_b := format('room:%s:userB:code', p_source_session_id);
  else
    v_source_a := format('room:%s:userB:code', p_source_session_id);
    v_source_b := format('room:%s:userA:code', p_source_session_id);
  end if;

  insert into public.coding_sessions(
    room_code, language, created_by, expires_at, resumed_from_session_id, resume_partner_id,
    question_a, question_b
  ) values (
    p_room_code, v_source.language, p_user_id, p_expires_at, p_source_session_id, v_partner_id,
    case when v_source_slot = 'A' then v_source.question_a else v_source.question_b end,
    case when v_source_slot = 'A' then v_source.question_b else v_source.question_a end
  ) returning id into v_session_id;
  insert into public.session_participants(session_id, user_id, slot) values (v_session_id, p_user_id, 'A');
  insert into public.session_resume_sources(session_id, owner_slot, source_document_name)
    values (v_session_id, 'A', v_source_a), (v_session_id, 'B', v_source_b);
  return public.space2code_room_json(v_session_id);
exception when unique_violation then
  raise exception 'INVALID_ROOM_STATE: Room code already exists';
end;
$$;

create or replace function public.space2code_load_document(p_document_name text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select d.y_state_base64 from public.session_documents d where d.document_name = p_document_name),
    (select source.y_state_base64
      from public.session_resume_sources link
      join public.session_documents source on source.document_name = link.source_document_name
      where link.session_id = (regexp_match(p_document_name,
          '^room:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):user([AB]):code$', 'i'))[1]::uuid
        and link.owner_slot = (regexp_match(p_document_name,
          '^room:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):user([AB]):code$', 'i'))[2]::public.participant_slot)
  );
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
  update public.coding_sessions set last_active_at = now() where id = v_session_id;
end;
$$;

create or replace function public.space2code_begin_execution(
  p_session_id uuid,
  p_user_id uuid,
  p_now timestamptz,
  p_window_start timestamptz,
  p_user_limit integer,
  p_room_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_execution_id uuid;
begin
  if not exists (
    select 1 from public.session_participants p
    join public.coding_sessions s on s.id = p.session_id and s.status = 'live'
    where p.session_id = p_session_id and p.user_id = p_user_id
  ) then raise exception 'NOT_A_PARTICIPANT: Live session membership is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('room:' || p_session_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('user:' || p_user_id::text, 0));
  update public.execution_runs set status = 'failed', completed_at = p_now
    where status = 'running' and requested_at < p_window_start;

  if exists (select 1 from public.execution_runs where user_id = p_user_id and status = 'running') then
    raise exception 'EXECUTION_CONCURRENCY_LIMITED: Only one execution may run at a time';
  end if;
  if (select count(*) from public.execution_runs where user_id = p_user_id and requested_at >= p_window_start)
      >= p_user_limit or
    (select count(*) from public.execution_runs where session_id = p_session_id and requested_at >= p_window_start)
      >= p_room_limit then
    raise exception 'EXECUTION_RATE_LIMITED: Execution rate limit exceeded';
  end if;

  insert into public.execution_runs(session_id, user_id, requested_at)
    values (p_session_id, p_user_id, p_now) returning id into v_execution_id;
  update public.coding_sessions set last_active_at = greatest(last_active_at, p_now) where id = p_session_id;
  return v_execution_id;
end;
$$;

create or replace function public.space2code_finish_execution(
  p_execution_id uuid, p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_outcome not in ('completed', 'failed') then
    raise exception 'INVALID_ROOM_STATE: Invalid execution outcome';
  end if;
  update public.execution_runs
    set status = p_outcome::public.execution_run_status, completed_at = now()
    where id = p_execution_id and status = 'running';
end;
$$;

create or replace function public.space2code_reconcile_timers()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count bigint;
begin
  update public.coding_sessions set timer_status = 'expired'
    where timer_status = 'running' and timer_ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.session_resume_sources enable row level security;
alter table public.execution_runs enable row level security;

revoke execute on function public.space2code_touch_session(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.space2code_update_question(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.space2code_start_timer(uuid, uuid, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.space2code_recent_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.space2code_resume_session(uuid, text, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.space2code_begin_execution(uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
revoke execute on function public.space2code_finish_execution(uuid, text) from public, anon, authenticated;
revoke execute on function public.space2code_reconcile_timers() from public, anon, authenticated;

grant execute on function public.space2code_touch_session(uuid, timestamptz) to service_role;
grant execute on function public.space2code_update_question(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.space2code_start_timer(uuid, uuid, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.space2code_recent_sessions(uuid) to service_role;
grant execute on function public.space2code_resume_session(uuid, text, uuid, timestamptz) to service_role;
grant execute on function public.space2code_begin_execution(uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;
grant execute on function public.space2code_finish_execution(uuid, text) to service_role;
grant execute on function public.space2code_reconcile_timers() to service_role;

select cron.schedule(
  'space2code-timer-reconciliation',
  '* * * * *',
  $$select public.space2code_reconcile_timers()$$
);

commit;
