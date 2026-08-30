import { randomUUID } from 'node:crypto'
import { FeatureError } from '../features/errors.js'
import { RoomError } from '../rooms/errors.js'
import type { RoomRepository } from '../rooms/repository.js'
import type { SocialRepository } from '../social/repository.js'
import type { CollaborationRepository } from './repository.js'
import type { AnnotationInput, ChatMessage, ExplainActivation, ExplainAnnotation, ExplainMessage, ExplainState, InviteAcceptance, SessionInvite } from './types.js'

const clone=<T>(value:T):T=>structuredClone(value)
export class InMemoryCollaborationRepository implements CollaborationRepository {
  private readonly invites=new Map<string,SessionInvite>(); private readonly chat:ChatMessage[]=[]; private readonly explainMessages:ExplainMessage[]=[]; private readonly annotations:ExplainAnnotation[]=[]
  private readonly states=new Map<string,ExplainState>(); private readonly attempts=new Map<string,{windowStarted:number; contenders:Map<string,{targetSlot:'A'|'B';priority:number}>}>()
  constructor(private readonly rooms:RoomRepository,private readonly social:SocialRepository){}
  async createInvite(roomId:string,inviterId:string,inviteeId:string,now:string,expiresAt:string){
    const room=await this.rooms.findForUser(roomId,inviterId); if(!room)throw new RoomError('NOT_A_PARTICIPANT','Only a participant can invite')
    if(room.status==='ended'||room.status==='expired')throw new FeatureError('INVITE_STALE','Room is no longer available')
    if(room.participants.length>=2)throw new RoomError('ROOM_FULL','Room already has two users')
    if(!await this.social.areFriends(inviterId,inviteeId))throw new FeatureError('FORBIDDEN','Only friends can be invited')
    if([...this.invites.values()].some(i=>i.roomId===roomId&&i.inviteeId===inviteeId&&i.status==='pending'&&i.expiresAt>now))throw new FeatureError('INVITE_DUPLICATE','An active invite already exists')
    const invite:SessionInvite={id:randomUUID(),roomId,inviterId,inviteeId,status:'pending',createdAt:now,expiresAt,resolvedAt:null};this.invites.set(invite.id,invite);return clone(invite)
  }
  async pendingInvites(inviteeId:string,now:string){for(const i of this.invites.values())if(i.status==='pending'&&i.expiresAt<=now){i.status='expired';i.resolvedAt=now}return clone([...this.invites.values()].filter(i=>i.inviteeId===inviteeId&&i.status==='pending'))}
  async acceptInvite(inviteId:string,inviteeId:string,now:string):Promise<InviteAcceptance>{const invite=this.requireInvite(inviteId);this.requireInvitee(invite,inviteeId);if(invite.expiresAt<=now){invite.status='expired';invite.resolvedAt=now;throw new FeatureError('INVITE_STALE','Invite has expired')}const room=await this.rooms.findForUser(invite.roomId,invite.inviterId);if(!room||room.status==='ended'||room.status==='expired')throw new FeatureError('INVITE_STALE','Room is no longer available');const joined=await this.rooms.join(room.roomCode,inviteeId);invite.status='accepted';invite.resolvedAt=now;return{invite:clone(invite),room:joined}}
  async declineInvite(inviteId:string,inviteeId:string,now:string){const i=this.requireInvite(inviteId);this.requireInvitee(i,inviteeId);i.status='declined';i.resolvedAt=now;return clone(i)}
  async sendChat(sessionId:string,senderId:string,content:string,now:string){await this.requireActive(sessionId,senderId);const m={id:randomUUID(),sessionId,senderId,content,createdAt:now};this.chat.push(m);return clone(m)}
  async listChat(sessionId:string,userId:string){await this.requireMember(sessionId,userId);return clone(this.chat.filter(m=>m.sessionId===sessionId))}
  async getExplainState(sessionId:string,userId:string,now:string){await this.requireMember(sessionId,userId);return clone(this.states.get(sessionId)??{sessionId,active:false,targetSlot:null,controllerId:null,activatedAt:null,updatedAt:now,revision:0})}
  async activateExplain(sessionId:string,userId:string,targetSlot:'A'|'B',now:string,priority:number,windowMs:number):Promise<ExplainActivation>{await this.requireActive(sessionId,userId);const t=new Date(now).getTime();let a=this.attempts.get(sessionId);if(!a||t-a.windowStarted>windowMs){a={windowStarted:t,contenders:new Map()};this.attempts.set(sessionId,a)}a.contenders.set(userId,{targetSlot,priority});const winner=[...a.contenders.entries()].sort((x,y)=>y[1].priority-x[1].priority||x[0].localeCompare(y[0]))[0]!;const old=this.states.get(sessionId);const state:ExplainState={sessionId,active:true,targetSlot:winner[1].targetSlot,controllerId:winner[0],activatedAt:old?.activatedAt??now,updatedAt:now,revision:(old?.revision??0)+1};this.states.set(sessionId,state);return{state:clone(state),winnerId:winner[0],contenderCount:a.contenders.size}}
  async deactivateExplain(sessionId:string,userId:string,now:string){await this.requireActive(sessionId,userId);const old=await this.getExplainState(sessionId,userId,now);const state={...old,active:false,targetSlot:null,controllerId:null,updatedAt:now,revision:old.revision+1};this.states.set(sessionId,state);this.attempts.delete(sessionId);return clone(state)}
  async sendExplainMessage(sessionId:string,senderId:string,content:string,now:string){await this.requireActive(sessionId,senderId);const m={id:randomUUID(),sessionId,senderId,content,createdAt:now};this.explainMessages.push(m);return clone(m)}
  async listExplainMessages(sessionId:string,userId:string){await this.requireMember(sessionId,userId);return clone(this.explainMessages.filter(m=>m.sessionId===sessionId))}
  async addAnnotation(sessionId:string,authorId:string,input:AnnotationInput,now:string){await this.requireActive(sessionId,authorId);const a={id:randomUUID(),sessionId,authorId,...input,createdAt:now};this.annotations.push(a);return clone(a)}
  async listAnnotations(sessionId:string,userId:string){await this.requireMember(sessionId,userId);return clone(this.annotations.filter(a=>a.sessionId===sessionId))}
  async removeAnnotation(sessionId:string,annotationId:string,userId:string){await this.requireMember(sessionId,userId);const index=this.annotations.findIndex(a=>a.sessionId===sessionId&&a.id===annotationId);if(index<0)throw new FeatureError('FORBIDDEN','Annotation not found');if(this.annotations[index]!.authorId!==userId)throw new FeatureError('FORBIDDEN','Only the author can remove an annotation');this.annotations.splice(index,1)}
  private requireInvite(id:string){const i=this.invites.get(id);if(!i)throw new FeatureError('INVITE_NOT_FOUND','Invite not found');return i}
  private requireInvitee(i:SessionInvite,u:string){if(i.inviteeId!==u||i.status!=='pending')throw new FeatureError('FORBIDDEN','Only the intended invitee can resolve this invite')}
  private async requireMember(s:string,u:string){const room=await this.rooms.findForUser(s,u);if(!room)throw new RoomError('NOT_A_PARTICIPANT','User is not a session participant');return room}
  private async requireActive(s:string,u:string){const room=await this.requireMember(s,u);if(room.status!=='waiting'&&room.status!=='live')throw new RoomError('INVALID_ROOM_STATE','Session is not active');return room}
}
