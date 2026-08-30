import type { SupabaseClient } from '@supabase/supabase-js'
import { mapFeatureDatabaseError } from '../features/database-error.js'
import type { ProfileUpdate, SocialRepository } from './repository.js'
import type { FriendLists, FriendRequest, Profile, PublicProfile } from './types.js'

type Json=Record<string,unknown>
export class SupabaseSocialRepository implements SocialRepository{
 constructor(private readonly client:SupabaseClient){}
 async getOwnProfile(userId:string){const{data,error}=await this.client.from('profiles').select('*').eq('id',userId).single();if(error)throw error;return profile(data)}
 async updateOwnProfile(userId:string,u:ProfileUpdate,now:string){const values:Json={updated_at:now};if('displayName'in u)values.display_name=u.displayName;if('avatarUrl'in u)values.avatar_url=u.avatarUrl;if('preferredTheme'in u)values.preferred_theme=u.preferredTheme;if('editorFontSize'in u)values.editor_font_size=u.editorFontSize;const{data,error}=await this.client.from('profiles').update(values).eq('id',userId).select('*').single();if(error)throw error;return profile(data)}
 async getPublicProfile(userId:string){const{data,error}=await this.client.from('profiles').select('id,display_name,avatar_url').eq('id',userId).maybeSingle();if(error)throw error;return data?pub(data):null}
 async getPublicProfiles(ids:string[]){if(!ids.length)return[];const{data,error}=await this.client.from('profiles').select('id,display_name,avatar_url').in('id',ids);if(error)throw error;return(data??[]).map(pub)}
 async sendFriendRequest(senderId:string,receiverId:string,now:string){return request(await this.rpc('space2code_send_friend_request',{p_sender_id:senderId,p_receiver_id:receiverId,p_now:now}))}
 async respondToFriendRequest(id:string,receiverId:string,accept:boolean,now:string){return request(await this.rpc('space2code_respond_friend_request',{p_request_id:id,p_receiver_id:receiverId,p_accept:accept,p_now:now}))}
 async cancelFriendRequest(id:string,senderId:string,now:string){await this.rpc('space2code_cancel_friend_request',{p_request_id:id,p_sender_id:senderId,p_now:now})}
 async removeFriend(userId:string,friendId:string){await this.rpc('space2code_remove_friend',{p_user_id:userId,p_friend_id:friendId})}
 async list(userId:string):Promise<FriendLists>{const v=await this.rpc('space2code_friend_lists',{p_user_id:userId}) as Json;return{friends:Array.isArray(v.friends)?v.friends.map(x=>({...pub(x),friendsSince:String((x as Json).friends_since)})):[],incoming:Array.isArray(v.incoming)?v.incoming.map(request):[],outgoing:Array.isArray(v.outgoing)?v.outgoing.map(request):[]}}
 async areFriends(a:string,b:string){return Boolean(await this.rpc('space2code_are_friends',{p_user_a:a,p_user_b:b}))}
  private async rpc(name:string,args:Json){const{data,error}=await this.client.rpc(name,args);if(error)throw mapFeatureDatabaseError(error);return data}
}
const row=(v:unknown)=>v as Json
const pub=(v:unknown):PublicProfile=>{const r=row(v);return{id:String(r.id),displayName:r.display_name===null?null:String(r.display_name),avatarUrl:r.avatar_url===null?null:String(r.avatar_url)}}
const profile=(v:unknown):Profile=>{const r=row(v);return{...pub(r),preferredTheme:String(r.preferred_theme) as Profile['preferredTheme'],editorFontSize:Number(r.editor_font_size),createdAt:String(r.created_at),updatedAt:String(r.updated_at)}}
const request=(v:unknown):FriendRequest=>{const r=row(v);return{id:String(r.id),sender:pub(r.sender),receiver:pub(r.receiver),status:String(r.status) as FriendRequest['status'],createdAt:String(r.created_at),resolvedAt:r.resolved_at===null?null:String(r.resolved_at)}}
