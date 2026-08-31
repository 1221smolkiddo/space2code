-- Phase 6 live database hardening: least privilege, RLS initplans, and FK indexes.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- This function is invoked by its event trigger and requires no client or
-- service-role RPC access. The postgres owner retains its implicit privilege.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

-- Preserve the existing authorization rules while evaluating auth.uid() once
-- per statement instead of once per candidate row.
alter policy profiles_read_self
  on public.profiles
  using (id = (select auth.uid()));

alter policy profiles_update_self
  on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy friend_requests_parties_read
  on public.friend_requests
  using ((select auth.uid()) in (sender_id, receiver_id));

alter policy friendships_members_read
  on public.friendships
  using ((select auth.uid()) in (user_a_id, user_b_id));

alter policy invites_parties_read
  on public.session_invites
  using ((select auth.uid()) in (inviter_id, invitee_id));

-- PostgreSQL does not create indexes for the referencing side of foreign keys.
-- These columns participate in auth-user/session lifecycle checks and referential
-- actions, and none is covered by the leading columns of an existing index.
create index coding_sessions_created_by_idx
  on public.coding_sessions(created_by);
create index coding_sessions_ended_by_idx
  on public.coding_sessions(ended_by);
create index coding_sessions_resume_partner_id_idx
  on public.coding_sessions(resume_partner_id);
create index coding_sessions_resumed_from_session_id_idx
  on public.coding_sessions(resumed_from_session_id);
create index coding_sessions_timer_started_by_idx
  on public.coding_sessions(timer_started_by);

create index editor_permission_requests_editor_owner_id_idx
  on public.editor_permission_requests(editor_owner_id);
create index editor_permission_requests_requester_id_idx
  on public.editor_permission_requests(requester_id);
create index editor_permissions_editor_owner_id_idx
  on public.editor_permissions(editor_owner_id);
create index editor_permissions_grantee_id_idx
  on public.editor_permissions(grantee_id);

create index explain_activation_attempts_user_id_idx
  on public.explain_activation_attempts(user_id);
create index explain_annotations_author_id_idx
  on public.explain_annotations(author_id);
create index explain_messages_sender_id_idx
  on public.explain_messages(sender_id);
create index explain_mode_states_controller_id_idx
  on public.explain_mode_states(controller_id);

create index friend_requests_receiver_id_idx
  on public.friend_requests(receiver_id);
create index friend_requests_sender_id_idx
  on public.friend_requests(sender_id);
create index session_chat_messages_sender_id_idx
  on public.session_chat_messages(sender_id);
create index session_invites_inviter_id_idx
  on public.session_invites(inviter_id);

commit;
