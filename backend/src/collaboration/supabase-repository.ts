import type {SupabaseClient}from'@supabase/supabase-js'
import {mapFeatureDatabaseError}from'../features/database-error.js'
import {mapRoom}from'../rooms/supabase-room-repository.js'
import type{CollaborationRepository}from'./repository.js'
import type{AnnotationInput,ChatMessage,ExplainActivation,ExplainAnnotation,ExplainMessage,ExplainState,InviteAcceptance,SessionInvite}from'./types.js'
type J=Record<string,unknown>;const r=(v:unknown)=>v as J
export class SupabaseCollaborationRepository implements CollaborationRepository{
 constructor(private readonly client:SupabaseClient){}private async rpc(n:string,a:J){const{data,error}=await this.client.rpc(n,a);if(error)throw mapFeatureDatabaseError(error);return data}
 async createInvite(roomId:string,inviterId:string,inviteeId:string,now:string,expiresAt:string){return inv(await this.rpc('space2code_create_session_invite',{p_session_id:roomId,p_inviter_id:inviterId,p_invitee_id:inviteeId,p_now:now,p_expires_at:expiresAt}))}
 async pendingInvites(inviteeId:string,now:string){const v=await this.rpc('space2code_pending_invites',{p_invitee_id:inviteeId,p_now:now});return Array.isArray(v)?v.map(inv):[]}
 async acceptInvite(id:string,userId:string,now:string):Promise<InviteAcceptance>{const v=r(await this.rpc('space2code_accept_session_invite',{p_invite_id:id,p_invitee_id:userId,p_now:now}));return{invite:inv(v.invite),room:mapRoom(v.room)}}
 async declineInvite(id:string,userId:string,now:string){return inv(await this.rpc('space2code_decline_session_invite',{p_invite_id:id,p_invitee_id:userId,p_now:now}))}
 async sendChat(s:string,u:string,c:string,n:string){return chat(await this.rpc('space2code_send_chat',{p_session_id:s,p_user_id:u,p_content:c,p_now:n}))}
 async listChat(s:string,u:string){const v=await this.rpc('space2code_list_chat',{p_session_id:s,p_user_id:u});return Array.isArray(v)?v.map(chat):[]}
 async getExplainState(s:string,u:string,n:string){return state(await this.rpc('space2code_get_explain_state',{p_session_id:s,p_user_id:u,p_now:n}))}
 async activateExplain(s:string,u:string,t:'A'|'B',n:string,_p:number,w:number):Promise<ExplainActivation>{const v=r(await this.rpc('space2code_activate_explain',{p_session_id:s,p_user_id:u,p_target_slot:t,p_now:n,p_window_ms:w}));return{state:state(v.state),winnerId:String(v.winner_id),contenderCount:Number(v.contender_count)}}
 async deactivateExplain(s:string,u:string,n:string){return state(await this.rpc('space2code_deactivate_explain',{p_session_id:s,p_user_id:u,p_now:n}))}
 async sendExplainMessage(s:string,u:string,c:string,n:string){return explainMessage(await this.rpc('space2code_send_explain_message',{p_session_id:s,p_user_id:u,p_content:c,p_now:n}))}
 async listExplainMessages(s:string,u:string){const v=await this.rpc('space2code_list_explain_messages',{p_session_id:s,p_user_id:u});return Array.isArray(v)?v.map(explainMessage):[]}
 async addAnnotation(s:string,u:string,i:AnnotationInput,n:string){return annotation(await this.rpc('space2code_add_explain_annotation',{p_session_id:s,p_user_id:u,p_target_slot:i.targetSlot,p_start_line:i.startLine,p_end_line:i.endLine,p_type:i.type,p_text:i.text,p_now:n}))}
 async listAnnotations(s:string,u:string){const v=await this.rpc('space2code_list_explain_annotations',{p_session_id:s,p_user_id:u});return Array.isArray(v)?v.map(annotation):[]}
 async removeAnnotation(s:string,a:string,u:string){await this.rpc('space2code_remove_explain_annotation',{p_session_id:s,p_annotation_id:a,p_user_id:u})}
}
const inv=(v:unknown):SessionInvite=>{const x=r(v);return{id:String(x.id),roomId:String(x.session_id),inviterId:String(x.inviter_id),inviteeId:String(x.invitee_id),status:String(x.status)as SessionInvite['status'],createdAt:String(x.created_at),expiresAt:String(x.expires_at),resolvedAt:x.resolved_at===null?null:String(x.resolved_at)}}
const chat=(v:unknown):ChatMessage=>{const x=r(v);return{id:String(x.id),sessionId:String(x.session_id),senderId:String(x.sender_id),content:String(x.content),createdAt:String(x.created_at)}}
const state=(v:unknown):ExplainState=>{const x=r(v);return{sessionId:String(x.session_id),active:Boolean(x.active),targetSlot:x.target_slot===null?null:String(x.target_slot)as'A'|'B',controllerId:x.controller_id===null?null:String(x.controller_id),activatedAt:x.activated_at===null?null:String(x.activated_at),updatedAt:String(x.updated_at),revision:Number(x.revision)}}
const explainMessage=(v:unknown):ExplainMessage=>{const x=r(v);return{id:String(x.id),sessionId:String(x.session_id),senderId:String(x.sender_id),content:String(x.content),createdAt:String(x.created_at)}}
const annotation=(v:unknown):ExplainAnnotation=>{const x=r(v);return{id:String(x.id),sessionId:String(x.session_id),targetSlot:String(x.target_slot)as'A'|'B',startLine:x.start_line===null?null:Number(x.start_line),endLine:x.end_line===null?null:Number(x.end_line),type:String(x.type)as ExplainAnnotation['type'],text:x.text===null?null:String(x.text),authorId:String(x.author_id),createdAt:String(x.created_at)}}
