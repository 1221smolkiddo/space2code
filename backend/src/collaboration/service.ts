import { randomInt } from 'node:crypto'
import { FeatureError } from '../features/errors.js'
import type { ActionRateLimiter } from '../features/rate-limiter.js'
import type { UserEventPublisher } from '../realtime/user-events.js'
import type { Clock, RoomEventPublisher } from '../rooms/service.js'
import type { CollaborationRepository } from './repository.js'
import type { AnnotationInput } from './types.js'

export class CollaborationService {
  constructor(private readonly repository:CollaborationRepository,private readonly roomEvents:RoomEventPublisher,private readonly userEvents:UserEventPublisher,private readonly limiter:ActionRateLimiter,private readonly clock:Clock={now:()=>new Date()},private readonly randomPriority:()=>number=()=>randomInt(0,2**30)){}
  async invite(roomId:string,inviterId:string,inviteeId:string){this.limiter.check(`invite:${inviterId}`,10,60_000,this.clock.now());const now=this.clock.now();const i=await this.repository.createInvite(roomId,inviterId,inviteeId,now.toISOString(),new Date(now.getTime()+15*60_000).toISOString());await this.userEvents.publish(inviteeId,{type:'session.invited',inviteId:i.id,roomId,fromUserId:inviterId});return i}
  pendingInvites(userId:string){return this.repository.pendingInvites(userId,this.clock.now().toISOString())}
  async acceptInvite(id:string,userId:string){const result=await this.repository.acceptInvite(id,userId,this.clock.now().toISOString());await this.userEvents.publish(result.invite.inviterId,{type:'session.invite_changed',inviteId:id,status:'accepted'});return result}
  async declineInvite(id:string,userId:string){const i=await this.repository.declineInvite(id,userId,this.clock.now().toISOString());await this.userEvents.publish(i.inviterId,{type:'session.invite_changed',inviteId:id,status:'declined'});return i}
  async sendChat(sessionId:string,userId:string,content:string){this.text(content,4000,'CHAT_LIMIT_EXCEEDED');this.limiter.check(`chat:${sessionId}:${userId}`,30,60_000,this.clock.now());const m=await this.repository.sendChat(sessionId,userId,content,this.clock.now().toISOString());await this.roomEvents.publish(sessionId,{type:'chat.message',occurredAt:m.createdAt,message:m});return m}
  listChat(sessionId:string,userId:string){return this.repository.listChat(sessionId,userId)}
  getExplainState(s:string,u:string){return this.repository.getExplainState(s,u,this.clock.now().toISOString())}
  async activateExplain(s:string,u:string,slot:'A'|'B'){const a=await this.repository.activateExplain(s,u,slot,this.clock.now().toISOString(),this.randomPriority(),250);await this.roomEvents.publish(s,{type:a.contenderCount>1?'explain.arbitrated':'explain.state',occurredAt:this.clock.now().toISOString(),state:a.state,winnerId:a.winnerId});return a}
  async deactivateExplain(s:string,u:string){const state=await this.repository.deactivateExplain(s,u,this.clock.now().toISOString());await this.roomEvents.publish(s,{type:'explain.state',occurredAt:state.updatedAt,state,winnerId:u});return state}
  async sendExplainMessage(s:string,u:string,content:string){this.text(content,8000,'EXPLAIN_LIMIT_EXCEEDED');this.limiter.check(`explain:${s}:${u}`,30,60_000,this.clock.now());const m=await this.repository.sendExplainMessage(s,u,content,this.clock.now().toISOString());await this.roomEvents.publish(s,{type:'explain.message',occurredAt:m.createdAt,message:m});return m}
  listExplainMessages(s:string,u:string){return this.repository.listExplainMessages(s,u)}
  async addAnnotation(s:string,u:string,input:AnnotationInput){if(input.startLine!==null&&input.endLine!==null&&input.endLine<input.startLine)throw new FeatureError('EXPLAIN_LIMIT_EXCEEDED','Invalid line range');if(input.text)this.text(input.text,4000,'EXPLAIN_LIMIT_EXCEEDED');this.limiter.check(`annotation:${s}:${u}`,30,60_000,this.clock.now());const a=await this.repository.addAnnotation(s,u,input,this.clock.now().toISOString());await this.roomEvents.publish(s,{type:'explain.annotation',occurredAt:a.createdAt,annotation:a});return a}
  listAnnotations(s:string,u:string){return this.repository.listAnnotations(s,u)}
  removeAnnotation(s:string,id:string,u:string){return this.repository.removeAnnotation(s,id,u)}
  private text(value:string,max:number,code:'CHAT_LIMIT_EXCEEDED'|'EXPLAIN_LIMIT_EXCEEDED'){if(!value.trim()||Buffer.byteLength(value,'utf8')>max)throw new FeatureError(code,`Text must contain 1 to ${max} UTF-8 bytes`)}
}
