import type { EditorPermission, PermissionRequest, Room, SessionTimer, Slot } from './rooms'
import type { FriendLists, Profile } from './social'

export interface RoomResponse { room: Room; documents: { userA: string; userB: string } }
export interface ExecutionResult { executionId:string;status:'completed'|'compile_error'|'runtime_error'|'timed_out'|'output_limited'|'provider_error';stdout:string;stderr:string;compileOutput:string;exitCode:number|null;signal:string|null;runtime:{language:string;version:string;cpuTimeMs:number|null;wallTimeMs:number|null;memoryBytes:number|null};outputTruncated:boolean }
export interface SessionInvite { id:string;roomId:string;inviterId:string;inviteeId:string;status:'pending'|'accepted'|'declined'|'expired';createdAt:string;expiresAt:string;resolvedAt:string|null }
export interface ChatMessageDto { id:string;sessionId:string;senderId:string;content:string;createdAt:string }
export interface ExplainState { sessionId:string;active:boolean;targetSlot:Slot|null;controllerId:string|null;activatedAt:string|null;updatedAt:string;revision:number }
export interface ExplainMessage { id:string;sessionId:string;senderId:string;content:string;createdAt:string }
export interface ExplainAnnotation { id:string;sessionId:string;targetSlot:Slot;startLine:number|null;endLine:number|null;type:'highlight'|'pointer'|'note';text:string|null;authorId:string;createdAt:string }
export interface ExplainSnapshot { state:ExplainState;messages:ExplainMessage[];annotations:ExplainAnnotation[] }
export interface PermissionSnapshot { requests: PermissionRequest[]; permissions: EditorPermission[] }
export type RoomEvent =
  | {type:'participant.connected'|'participant.disconnected';occurredAt:string;userId:string}
  | {type:'participant.typing';occurredAt:string;userId:string;isTyping:boolean}
  | {type:'session.ended';occurredAt:string;endedBy:string;reason:string}
  | {type:'question.updated';occurredAt:string;slot:Slot;question:string|null}
  | {type:'timer.started'|'timer.expired';occurredAt:string;timer:SessionTimer}
  | {type:'chat.message';occurredAt:string;message:ChatMessageDto}
  | {type:'explain.state'|'explain.arbitrated';occurredAt:string;state:ExplainState;winnerId:string}
  | {type:'explain.message';occurredAt:string;message:ExplainMessage}
  | {type:'explain.annotation';occurredAt:string;annotation:ExplainAnnotation}
  | {type:'permission.requested';occurredAt:string;request:PermissionRequest}
  | {type:'permission.changed';occurredAt:string;ownerId:string;granteeId:string;permission:EditorPermission|null}
  | {type:'execution.started';occurredAt:string;executionId:string;userId:string;targetSlot?:Slot;scope:'personal'|'explain'}
  | {type:'execution.completed';occurredAt:string;executionId:string;userId:string;status:string;targetSlot?:Slot;scope:'personal'|'explain';result?:ExecutionResult}
export interface RoomEventEnvelope { version:1;roomId:string;event:RoomEvent }
export type UserEvent = {type:string;[key:string]:unknown}
export interface UserEventEnvelope {id:string;occurredAt:string;event:UserEvent}
export type { FriendLists, Profile }
