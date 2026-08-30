begin;

alter table public.profiles add column preferred_theme text not null default 'system'
  check (preferred_theme in ('light','dark','system'));
alter table public.profiles add column editor_font_size integer not null default 14
  check (editor_font_size between 10 and 32);
drop policy if exists profiles_read on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using(id=auth.uid());
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;

create type public.friend_request_status as enum ('pending','accepted','declined','cancelled');
create type public.session_invite_status as enum ('pending','accepted','declined','expired');
create type public.explain_annotation_type as enum ('highlight','pointer','note');

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status public.friend_request_status not null default 'pending', created_at timestamptz not null default now(), resolved_at timestamptz,
  check(sender_id<>receiver_id), check((status='pending')=(resolved_at is null))
);
create unique index one_pending_friend_pair on public.friend_requests
  (least(sender_id,receiver_id),greatest(sender_id,receiver_id)) where status='pending';
create table public.friendships (
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_a_id,user_b_id), check(user_a_id<user_b_id)
);
create index friendships_b_idx on public.friendships(user_b_id);

create table public.session_invites (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.coding_sessions(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade, invitee_id uuid not null references public.profiles(id) on delete cascade,
  status public.session_invite_status not null default 'pending', created_at timestamptz not null default now(), expires_at timestamptz not null, resolved_at timestamptz,
  check(inviter_id<>invitee_id), check((status='pending')=(resolved_at is null))
);
create unique index one_active_session_invite on public.session_invites(session_id,invitee_id) where status='pending';
create index invite_inbox_idx on public.session_invites(invitee_id,status,expires_at);

create table public.session_chat_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.coding_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, content text not null check(octet_length(content) between 1 and 4000), created_at timestamptz not null default now()
);
create index session_chat_timeline_idx on public.session_chat_messages(session_id,created_at);
create table public.explain_mode_states (
  session_id uuid primary key references public.coding_sessions(id) on delete cascade, active boolean not null default false,
  target_slot public.participant_slot, controller_id uuid references public.profiles(id) on delete set null,
  activated_at timestamptz, updated_at timestamptz not null default now(), revision bigint not null default 0,
  arbitration_started_at timestamptz, check(active or (target_slot is null and controller_id is null))
);
create table public.explain_activation_attempts (
  session_id uuid not null references public.coding_sessions(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  target_slot public.participant_slot not null, priority double precision not null, created_at timestamptz not null, primary key(session_id,user_id)
);
create table public.explain_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.coding_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, content text not null check(octet_length(content) between 1 and 8000), created_at timestamptz not null default now()
);
create index explain_message_timeline_idx on public.explain_messages(session_id,created_at);
create table public.explain_annotations (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.coding_sessions(id) on delete cascade,
  target_slot public.participant_slot not null, start_line integer, end_line integer, annotation_type public.explain_annotation_type not null,
  annotation_text text check(annotation_text is null or octet_length(annotation_text)<=4000), author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), check(start_line is null or start_line>0), check(end_line is null or end_line>=coalesce(start_line,1))
);
create index explain_annotation_timeline_idx on public.explain_annotations(session_id,created_at);

create or replace function public.space2code_are_friends(p_user_a uuid,p_user_b uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.friendships where user_a_id=least(p_user_a,p_user_b) and user_b_id=greatest(p_user_a,p_user_b)); $$;
create or replace function public.space2code_friend_request_json(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'sender',jsonb_build_object('id',s.id,'display_name',s.display_name,'avatar_url',s.avatar_url),'receiver',jsonb_build_object('id',d.id,'display_name',d.display_name,'avatar_url',d.avatar_url),'status',r.status,'created_at',r.created_at,'resolved_at',r.resolved_at)
 from public.friend_requests r join public.profiles s on s.id=r.sender_id join public.profiles d on d.id=r.receiver_id where r.id=p_id; $$;
create or replace function public.space2code_send_friend_request(p_sender_id uuid,p_receiver_id uuid,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.friend_requests%rowtype; begin
 if p_sender_id=p_receiver_id then raise exception 'CANNOT_FRIEND_SELF: Cannot friend self'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_sender_id,p_receiver_id)::text||greatest(p_sender_id,p_receiver_id)::text,0));
 if public.space2code_are_friends(p_sender_id,p_receiver_id) then raise exception 'ALREADY_FRIENDS: Already friends'; end if;
 select * into v from public.friend_requests where status='pending' and least(sender_id,receiver_id)=least(p_sender_id,p_receiver_id) and greatest(sender_id,receiver_id)=greatest(p_sender_id,p_receiver_id) for update;
 if found and v.sender_id=p_sender_id then raise exception 'FRIEND_REQUEST_DUPLICATE: Pending request exists'; end if;
 if found then update public.friend_requests set status='accepted',resolved_at=p_now where id=v.id; insert into public.friendships(user_a_id,user_b_id,created_at) values(least(p_sender_id,p_receiver_id),greatest(p_sender_id,p_receiver_id),p_now) on conflict do nothing; return public.space2code_friend_request_json(v.id); end if;
 insert into public.friend_requests(sender_id,receiver_id,created_at) values(p_sender_id,p_receiver_id,p_now) returning * into v; return public.space2code_friend_request_json(v.id); end $$;
create or replace function public.space2code_respond_friend_request(p_request_id uuid,p_receiver_id uuid,p_accept boolean,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.friend_requests%rowtype; begin select * into v from public.friend_requests where id=p_request_id for update; if not found then raise exception 'FRIEND_REQUEST_NOT_FOUND: Request not found'; end if; if v.receiver_id<>p_receiver_id or v.status<>'pending' then raise exception 'FORBIDDEN: Not request receiver'; end if;
 update public.friend_requests set status=case when p_accept then 'accepted'::public.friend_request_status else 'declined'::public.friend_request_status end,resolved_at=p_now where id=v.id;
 if p_accept then insert into public.friendships(user_a_id,user_b_id,created_at) values(least(v.sender_id,v.receiver_id),greatest(v.sender_id,v.receiver_id),p_now) on conflict do nothing; end if; return public.space2code_friend_request_json(v.id); end $$;
create or replace function public.space2code_cancel_friend_request(p_request_id uuid,p_sender_id uuid,p_now timestamptz) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin update public.friend_requests set status='cancelled',resolved_at=p_now where id=p_request_id and sender_id=p_sender_id and status='pending'; if not found then raise exception 'FORBIDDEN: Cannot cancel request'; end if; end $$;
create or replace function public.space2code_remove_friend(p_user_id uuid,p_friend_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin delete from public.friendships where user_a_id=least(p_user_id,p_friend_id) and user_b_id=greatest(p_user_id,p_friend_id); if not found then raise exception 'FRIENDSHIP_NOT_FOUND: Friendship not found'; end if; end $$;
create or replace function public.space2code_friend_lists(p_user_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'avatar_url',p.avatar_url,'friends_since',f.created_at)) from public.friendships f join public.profiles p on p.id=case when f.user_a_id=p_user_id then f.user_b_id else f.user_a_id end where p_user_id in(f.user_a_id,f.user_b_id)),'[]'::jsonb),
 'incoming',coalesce((select jsonb_agg(public.space2code_friend_request_json(r.id)) from public.friend_requests r where r.receiver_id=p_user_id and r.status='pending'),'[]'::jsonb),
 'outgoing',coalesce((select jsonb_agg(public.space2code_friend_request_json(r.id)) from public.friend_requests r where r.sender_id=p_user_id and r.status='pending'),'[]'::jsonb)); $$;

create or replace function public.space2code_create_session_invite(p_session_id uuid,p_inviter_id uuid,p_invitee_id uuid,p_now timestamptz,p_expires_at timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.session_invites%rowtype; v_room public.coding_sessions%rowtype; begin select * into v_room from public.coding_sessions where id=p_session_id for update; if not exists(select 1 from public.session_participants where session_id=p_session_id and user_id=p_inviter_id) then raise exception 'NOT_A_PARTICIPANT: Membership required'; end if; if v_room.status not in('waiting','live') or v_room.expires_at<=p_now then raise exception 'INVITE_STALE: Room unavailable'; end if; if(select count(*) from public.session_participants where session_id=p_session_id)>=2 then raise exception 'ROOM_FULL: Room full'; end if; if not public.space2code_are_friends(p_inviter_id,p_invitee_id) then raise exception 'FORBIDDEN: Only friends can be invited'; end if;
 update public.session_invites set status='expired',resolved_at=p_now where session_id=p_session_id and status='pending' and expires_at<=p_now;
 if exists(select 1 from public.session_invites where session_id=p_session_id and invitee_id=p_invitee_id and status='pending') then raise exception 'INVITE_DUPLICATE: Active invite exists'; end if;
 insert into public.session_invites(session_id,inviter_id,invitee_id,created_at,expires_at) values(p_session_id,p_inviter_id,p_invitee_id,p_now,p_expires_at) returning * into v; return to_jsonb(v); end $$;
create or replace function public.space2code_pending_invites(p_invitee_id uuid,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin update public.session_invites set status='expired',resolved_at=p_now where invitee_id=p_invitee_id and status='pending' and expires_at<=p_now; return coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.session_invites i where invitee_id=p_invitee_id and status='pending'),'[]'::jsonb); end $$;
create or replace function public.space2code_accept_session_invite(p_invite_id uuid,p_invitee_id uuid,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.session_invites%rowtype; s public.coding_sessions%rowtype; begin select * into v from public.session_invites where id=p_invite_id for update; if not found then raise exception 'INVITE_NOT_FOUND: Invite not found'; end if; if v.invitee_id<>p_invitee_id or v.status<>'pending' then raise exception 'FORBIDDEN: Not intended invitee'; end if; if v.expires_at<=p_now then update public.session_invites set status='expired',resolved_at=p_now where id=v.id; raise exception 'INVITE_STALE: Invite expired'; end if; select * into s from public.coding_sessions where id=v.session_id for update; if s.status not in('waiting','live') or s.expires_at<=p_now then raise exception 'INVITE_STALE: Room unavailable'; end if; if(select count(*) from public.session_participants where session_id=s.id)>=2 then raise exception 'ROOM_FULL: Room full'; end if;
 insert into public.session_participants(session_id,user_id,slot) values(s.id,p_invitee_id,'B'); update public.coding_sessions set status='live',started_at=coalesce(started_at,p_now),last_active_at=p_now where id=s.id; update public.session_invites set status='accepted',resolved_at=p_now where id=v.id; return jsonb_build_object('invite',to_jsonb(v)||jsonb_build_object('status','accepted','resolved_at',p_now),'room',public.space2code_room_json(s.id)); end $$;
create or replace function public.space2code_decline_session_invite(p_invite_id uuid,p_invitee_id uuid,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v public.session_invites%rowtype; begin update public.session_invites set status='declined',resolved_at=p_now where id=p_invite_id and invitee_id=p_invitee_id and status='pending' returning * into v; if not found then raise exception 'FORBIDDEN: Cannot decline invite'; end if; return to_jsonb(v); end $$;

create or replace function public.space2code_require_member(p_session_id uuid,p_user_id uuid,p_active boolean default false) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$ declare s public.coding_sessions%rowtype; begin select * into s from public.coding_sessions where id=p_session_id; if not exists(select 1 from public.session_participants where session_id=p_session_id and user_id=p_user_id) then raise exception 'NOT_A_PARTICIPANT: Membership required'; end if; if s.expires_at<=now() then raise exception 'ROOM_ENDED: Retention expired'; end if; if p_active and s.status not in('waiting','live') then raise exception 'INVALID_ROOM_STATE: Active session required'; end if; end $$;
create or replace function public.space2code_send_chat(p_session_id uuid,p_user_id uuid,p_content text,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v public.session_chat_messages%rowtype; begin perform public.space2code_require_member(p_session_id,p_user_id,true); insert into public.session_chat_messages(session_id,sender_id,content,created_at) values(p_session_id,p_user_id,p_content,p_now) returning * into v; return to_jsonb(v); end $$;
create or replace function public.space2code_list_chat(p_session_id uuid,p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin perform public.space2code_require_member(p_session_id,p_user_id,false); return coalesce((select jsonb_agg(to_jsonb(m) order by created_at) from public.session_chat_messages m where session_id=p_session_id),'[]'::jsonb); end $$;
create or replace function public.space2code_get_explain_state(p_session_id uuid,p_user_id uuid,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v public.explain_mode_states%rowtype; begin perform public.space2code_require_member(p_session_id,p_user_id,false); insert into public.explain_mode_states(session_id,updated_at) values(p_session_id,p_now) on conflict do nothing; select * into v from public.explain_mode_states where session_id=p_session_id; return to_jsonb(v); end $$;
create or replace function public.space2code_activate_explain(p_session_id uuid,p_user_id uuid,p_target_slot public.participant_slot,p_now timestamptz,p_window_ms integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.explain_mode_states%rowtype; winner public.explain_activation_attempts%rowtype; n integer; begin perform public.space2code_require_member(p_session_id,p_user_id,true); insert into public.explain_mode_states(session_id,updated_at) values(p_session_id,p_now) on conflict do nothing; select * into v from public.explain_mode_states where session_id=p_session_id for update;
 if v.arbitration_started_at is null or p_now-v.arbitration_started_at>make_interval(secs=>p_window_ms/1000.0) then delete from public.explain_activation_attempts where session_id=p_session_id; update public.explain_mode_states set arbitration_started_at=p_now where session_id=p_session_id; end if;
 insert into public.explain_activation_attempts(session_id,user_id,target_slot,priority,created_at) values(p_session_id,p_user_id,p_target_slot,random(),p_now) on conflict(session_id,user_id) do update set target_slot=excluded.target_slot,priority=excluded.priority,created_at=excluded.created_at;
 select * into winner from public.explain_activation_attempts where session_id=p_session_id order by priority desc,user_id limit 1; select count(*) into n from public.explain_activation_attempts where session_id=p_session_id;
 update public.explain_mode_states set active=true,target_slot=winner.target_slot,controller_id=winner.user_id,activated_at=coalesce(activated_at,p_now),updated_at=p_now,revision=revision+1 where session_id=p_session_id returning * into v;
 return jsonb_build_object('state',to_jsonb(v),'winner_id',winner.user_id,'contender_count',n); end $$;
create or replace function public.space2code_deactivate_explain(p_session_id uuid,p_user_id uuid,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v public.explain_mode_states%rowtype; begin perform public.space2code_require_member(p_session_id,p_user_id,true); insert into public.explain_mode_states(session_id,updated_at) values(p_session_id,p_now) on conflict do nothing; update public.explain_mode_states set active=false,target_slot=null,controller_id=null,updated_at=p_now,revision=revision+1,arbitration_started_at=null where session_id=p_session_id returning * into v; delete from public.explain_activation_attempts where session_id=p_session_id; return to_jsonb(v); end $$;
create or replace function public.space2code_send_explain_message(p_session_id uuid,p_user_id uuid,p_content text,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v public.explain_messages%rowtype; begin perform public.space2code_require_member(p_session_id,p_user_id,true); insert into public.explain_messages(session_id,sender_id,content,created_at) values(p_session_id,p_user_id,p_content,p_now) returning * into v; return to_jsonb(v); end $$;
create or replace function public.space2code_list_explain_messages(p_session_id uuid,p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin perform public.space2code_require_member(p_session_id,p_user_id,false); return coalesce((select jsonb_agg(to_jsonb(m) order by created_at) from public.explain_messages m where session_id=p_session_id),'[]'::jsonb); end $$;
create or replace function public.space2code_add_explain_annotation(p_session_id uuid,p_user_id uuid,p_target_slot public.participant_slot,p_start_line integer,p_end_line integer,p_type public.explain_annotation_type,p_text text,p_now timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v public.explain_annotations%rowtype; begin perform public.space2code_require_member(p_session_id,p_user_id,true); insert into public.explain_annotations(session_id,target_slot,start_line,end_line,annotation_type,annotation_text,author_id,created_at) values(p_session_id,p_target_slot,p_start_line,p_end_line,p_type,p_text,p_user_id,p_now) returning * into v; return to_jsonb(v)||jsonb_build_object('type',v.annotation_type,'text',v.annotation_text); end $$;
create or replace function public.space2code_list_explain_annotations(p_session_id uuid,p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin perform public.space2code_require_member(p_session_id,p_user_id,false); return coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('type',a.annotation_type,'text',a.annotation_text) order by created_at) from public.explain_annotations a where session_id=p_session_id),'[]'::jsonb); end $$;
create or replace function public.space2code_remove_explain_annotation(p_session_id uuid,p_annotation_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.space2code_require_member(p_session_id,p_user_id,false); delete from public.explain_annotations where id=p_annotation_id and session_id=p_session_id and author_id=p_user_id; if not found then raise exception 'FORBIDDEN: Only author can remove annotation'; end if; end $$;
create or replace function public.space2code_document_history(p_document_name text,p_limit integer) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(jsonb_agg(to_jsonb(v) order by v.captured_at),'[]'::jsonb) from (select captured_at,y_state_base64 from public.session_document_versions where document_name=p_document_name order by captured_at desc limit least(greatest(p_limit,1),200)) v; $$;

create or replace function public.space2code_recent_sessions(p_user_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('session_id',s.id,'partner_id',partner.id,'partner_display_name',partner.display_name,'partner_avatar_url',partner.avatar_url,'language',s.language,'status',s.status,'created_at',s.created_at,'last_active_at',s.last_active_at,'ended_at',s.ended_at,'ended_by',s.ended_by,'ended_reason',s.ended_reason,'expires_at',s.expires_at,'can_reconnect',s.status='live','can_reopen',s.status='ended','resumed_from_session_id',s.resumed_from_session_id) order by s.last_active_at desc),'[]'::jsonb)
 from public.coding_sessions s join public.session_participants me on me.session_id=s.id and me.user_id=p_user_id left join lateral(select p.* from public.profiles p where p.id=coalesce((select x.user_id from public.session_participants x where x.session_id=s.id and x.user_id<>p_user_id limit 1),s.resume_partner_id)) partner on true where s.expires_at>now(); $$;

alter table public.friend_requests enable row level security; alter table public.friendships enable row level security; alter table public.session_invites enable row level security; alter table public.session_chat_messages enable row level security; alter table public.explain_mode_states enable row level security; alter table public.explain_activation_attempts enable row level security; alter table public.explain_messages enable row level security; alter table public.explain_annotations enable row level security;
create policy friend_requests_parties_read on public.friend_requests for select to authenticated using(auth.uid() in(sender_id,receiver_id));
create policy friendships_members_read on public.friendships for select to authenticated using(auth.uid() in(user_a_id,user_b_id));
create policy invites_parties_read on public.session_invites for select to authenticated using(auth.uid() in(inviter_id,invitee_id));
create policy chat_members_read on public.session_chat_messages for select to authenticated using(public.space2code_is_current_user_participant(session_id));
create policy explain_state_members_read on public.explain_mode_states for select to authenticated using(public.space2code_is_current_user_participant(session_id));
create policy explain_attempt_members_read on public.explain_activation_attempts for select to authenticated using(public.space2code_is_current_user_participant(session_id));
create policy explain_messages_members_read on public.explain_messages for select to authenticated using(public.space2code_is_current_user_participant(session_id));
create policy explain_annotations_members_read on public.explain_annotations for select to authenticated using(public.space2code_is_current_user_participant(session_id));

revoke all on public.friend_requests,public.friendships,public.session_invites,public.session_chat_messages,public.explain_mode_states,public.explain_activation_attempts,public.explain_messages,public.explain_annotations from anon,authenticated;
grant select on public.friend_requests,public.friendships,public.session_invites,public.session_chat_messages,public.explain_mode_states,public.explain_activation_attempts,public.explain_messages,public.explain_annotations to authenticated;
do $$ declare f record; begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'space2code_%' and p.proname in ('space2code_are_friends','space2code_friend_request_json','space2code_send_friend_request','space2code_respond_friend_request','space2code_cancel_friend_request','space2code_remove_friend','space2code_friend_lists','space2code_create_session_invite','space2code_pending_invites','space2code_accept_session_invite','space2code_decline_session_invite','space2code_require_member','space2code_send_chat','space2code_list_chat','space2code_get_explain_state','space2code_activate_explain','space2code_deactivate_explain','space2code_send_explain_message','space2code_list_explain_messages','space2code_add_explain_annotation','space2code_list_explain_annotations','space2code_remove_explain_annotation','space2code_document_history') loop execute format('revoke execute on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature); end loop; end $$;

commit;
