-- Run after the migration. Uses existing rows only, never prints user data,
-- and rolls back all test statements. Requires at least one participant.
begin;
create temporary table membership_fixture as
select session_id, user_id from public.session_participants limit 1;
create temporary table membership_expected (table_name text, row_count bigint);
do $$
declare t text; n bigint; s uuid;
begin
  select session_id into s from membership_fixture;
  if s is null then raise exception 'Test requires an existing session participant'; end if;
  foreach t in array array['coding_sessions','session_participants','editor_permission_requests','editor_permissions','session_chat_messages','explain_mode_states','explain_activation_attempts','explain_messages','explain_annotations'] loop
    execute format('select count(*) from public.%I where %I = $1',t,case when t='coding_sessions' then 'id' else 'session_id' end) into n using s;
    insert into membership_expected values(t,n);
  end loop;
  if to_regprocedure('public.space2code_is_current_user_participant(uuid)') is not null then raise exception 'Helper is still public'; end if;
  if has_function_privilege('anon','private.space2code_is_current_user_participant(uuid)','execute') then raise exception 'Anonymous execution allowed'; end if;
  if has_schema_privilege('authenticated','private','create') then raise exception 'Authenticated schema creation allowed'; end if;
  if not has_function_privilege('service_role','private.space2code_is_current_user_participant(uuid)','execute') then raise exception 'Service role access lost'; end if;
  if (select count(*) from pg_policies where qual like '%private.space2code_is_current_user_participant%') <> 9 then raise exception 'Policy dependencies lost'; end if;
  if exists(select 1 from pg_class c join membership_expected e on c.relname=e.table_name where c.relnamespace='public'::regnamespace and not c.relrowsecurity) then raise exception 'RLS disabled'; end if;
end $$;
grant select on membership_fixture,membership_expected to authenticated,anon;
select set_config('request.jwt.claim.sub',(select user_id::text from membership_fixture),true);
set local role authenticated;
do $$
declare e record; n bigint; s uuid;
begin
  select session_id into s from membership_fixture;
  if not private.space2code_is_current_user_participant(s) then raise exception 'Member denied'; end if;
  if private.space2code_is_current_user_participant(null) then raise exception 'Null session allowed'; end if;
  if private.space2code_is_current_user_participant('00000000-0000-0000-0000-000000000000') then raise exception 'Unknown session allowed'; end if;
  for e in select * from membership_expected loop
    execute format('select count(*) from public.%I where %I=$1',e.table_name,case when e.table_name='coding_sessions' then 'id' else 'session_id' end) into n using s;
    if n<>e.row_count then raise exception 'Member read mismatch: %',e.table_name; end if;
  end loop;
  -- Read access must not become authority to alter membership.
  update public.session_participants set state=state where session_id=s;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Member update allowed'; end if;
  delete from public.session_participants where session_id=s;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Member delete allowed'; end if;
  begin
    insert into public.session_participants(session_id,user_id,slot)
      select session_id,user_id,slot from public.session_participants where session_id=s limit 1;
    raise exception 'Member insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- A JWT subject with no memberships must see no session data.
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$
declare e record; n bigint;
begin
  if private.space2code_is_current_user_participant((select session_id from membership_fixture)) then raise exception 'Outsider accepted'; end if;
  for e in select * from membership_expected loop
    execute format('select count(*) from public.%I',e.table_name) into n;
    if n<>0 then raise exception 'Outsider data leak: %',e.table_name; end if;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
declare e record; n bigint;
begin
  for e in select * from membership_expected loop
    begin
      execute format('select count(*) from public.%I',e.table_name) into n;
      if n<>0 then raise exception 'Anonymous data leak: %',e.table_name; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;
rollback;
select 'PASS: member reads, outsider and anonymous isolation, membership write denial, RLS dependencies and privileges' as result;
