import type { FriendLists, Profile, RecentSession, SessionInvite } from '../types'
import { apiRequest } from './client'
export const socialApi={
 profile:()=>apiRequest<{profile:Profile}>('/v1/profile'),updateProfile:(update:Partial<Pick<Profile,'displayName'|'avatarUrl'|'preferredTheme'|'editorFontSize'>>)=>apiRequest<{profile:Profile}>('/v1/profile',{method:'PATCH',body:update}),
 friends:()=>apiRequest<FriendLists>('/v1/friends'),presence:()=>apiRequest<{presence:Record<string,'ONLINE'|'IN_SESSION'|'OFFLINE'>}>('/v1/friends/presence'),
 sendRequest:(receiverId:string)=>apiRequest('/v1/friend-requests',{method:'POST',body:{receiverId}}),respondRequest:(id:string,action:'accept'|'decline')=>apiRequest(`/v1/friend-requests/${id}/${action}`,{method:'POST'}),cancelRequest:(id:string)=>apiRequest<void>(`/v1/friend-requests/${id}`,{method:'DELETE'}),removeFriend:(id:string)=>apiRequest<void>(`/v1/friends/${id}`,{method:'DELETE'}),
 setPresence:(state:'ONLINE'|'IN_SESSION')=>apiRequest<void>('/v1/presence',{method:'PUT',body:{state}}),offline:()=>apiRequest<void>('/v1/presence',{method:'DELETE'}),
 invites:()=>apiRequest<{invites:SessionInvite[]}>('/v1/invites'),invite:(sessionId:string,inviteeId:string)=>apiRequest<{invite:SessionInvite}>(`/v1/sessions/${sessionId}/invites`,{method:'POST',body:{inviteeId}}),respondInvite:(id:string,action:'accept'|'decline')=>apiRequest<{invite:SessionInvite;room?:unknown}>(`/v1/invites/${id}/${action}`,{method:'POST'}),
 recent:()=>apiRequest<{sessions:RecentSession[]}>('/v1/sessions/recent'),
}
