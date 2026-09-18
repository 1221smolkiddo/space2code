begin;

-- RLS needs this helper's privileges to avoid recursive participant policies.
-- Move the existing function (preserving its OID and all policy dependencies)
-- out of the exposed public API; do not revoke the execution needed by RLS.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

alter function public.space2code_is_current_user_participant(uuid) set schema private;
alter function private.space2code_is_current_user_participant(uuid) set search_path = '';
revoke all on function private.space2code_is_current_user_participant(uuid) from public, anon, authenticated, service_role;
grant execute on function private.space2code_is_current_user_participant(uuid) to authenticated, service_role;

comment on function private.space2code_is_current_user_participant(uuid) is
  'Internal RLS membership predicate bound to auth.uid(). Keep private out of exposed API schemas.';

notify pgrst, 'reload schema';
commit;
