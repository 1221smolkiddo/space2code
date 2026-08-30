import type { PermissionSnapshot, RecentSession, RoomResponse, SessionTimer } from '../types'
import { apiRequest, apiRequestWithMeta } from './client'
export const roomsApi={
 create:(language:string,signal?:AbortSignal)=>apiRequest<RoomResponse>('/v1/rooms',{method:'POST',body:{language},signal}),
 join:(roomCode:string,signal?:AbortSignal)=>apiRequest<RoomResponse>('/v1/rooms/join',{method:'POST',body:{roomCode},signal}),
 get:(roomId:string,signal?:AbortSignal)=>apiRequest<RoomResponse>(`/v1/rooms/${roomId}`,{signal}),
 getWithClock:(roomId:string,signal?:AbortSignal)=>apiRequestWithMeta<RoomResponse>(`/v1/rooms/${roomId}`,{signal}),
 leave:(roomId:string)=>apiRequest<RoomResponse>(`/v1/rooms/${roomId}/leave`,{method:'POST'}),
 recent:(signal?:AbortSignal)=>apiRequest<{sessions:RecentSession[]}>('/v1/sessions/recent',{signal}),
 resume:(sessionId:string)=>apiRequest<RoomResponse>(`/v1/sessions/${sessionId}/resume`,{method:'POST'}),
 question:(roomId:string,question:string|null)=>apiRequest<RoomResponse>(`/v1/rooms/${roomId}/question`,{method:'PATCH',body:{question}}),
 timer:(roomId:string)=>apiRequest<{timer:SessionTimer}>(`/v1/rooms/${roomId}/timer`),
 startTimer:(roomId:string,durationSeconds:number)=>apiRequest<{timer:SessionTimer}>(`/v1/rooms/${roomId}/timer`,{method:'POST',body:{durationSeconds}}),
 permissions:(roomId:string)=>apiRequest<PermissionSnapshot>(`/v1/rooms/${roomId}/permissions`),
 requestPermission:(roomId:string,editorOwnerId:string)=>apiRequest<{permissionRequest:unknown}>(`/v1/rooms/${roomId}/permission-requests`,{method:'POST',body:{editorOwnerId}}),
 resolvePermission:(roomId:string,requestId:string,action:'grant'|'deny',scope?:'once'|'session')=>apiRequest<unknown>(`/v1/rooms/${roomId}/permission-requests/${requestId}/${action}`,{method:'POST',body:action==='grant'?{scope}:undefined}),
 revokePermission:(roomId:string,granteeId:string)=>apiRequest<void>(`/v1/rooms/${roomId}/permissions/${granteeId}`,{method:'DELETE'}),
}
