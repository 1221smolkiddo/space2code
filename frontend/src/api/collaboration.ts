import type { ChatMessageDto, ExplainAnnotation, ExplainSnapshot, ExplainState, Slot } from '../types'
import { apiBlob, apiRequest } from './client'
export const collaborationApi={
 chat:(id:string)=>apiRequest<{messages:ChatMessageDto[]}>(`/v1/sessions/${id}/chat`),sendChat:(id:string,content:string)=>apiRequest<{message:ChatMessageDto}>(`/v1/sessions/${id}/chat`,{method:'POST',body:{content}}),
 explain:(id:string)=>apiRequest<ExplainSnapshot>(`/v1/sessions/${id}/explain`),activate:(id:string,targetSlot:Slot)=>apiRequest<{state:ExplainState;winnerId:string;contenderCount:number}>(`/v1/sessions/${id}/explain/activate`,{method:'POST',body:{targetSlot}}),deactivate:(id:string)=>apiRequest<{state:ExplainState}>(`/v1/sessions/${id}/explain/deactivate`,{method:'POST'}),
 sendExplain:(id:string,content:string)=>apiRequest(`/v1/sessions/${id}/explain/messages`,{method:'POST',body:{content}}),annotate:(id:string,input:Pick<ExplainAnnotation,'targetSlot'|'startLine'|'endLine'|'type'|'text'>)=>apiRequest(`/v1/sessions/${id}/explain/annotations`,{method:'POST',body:input}),removeAnnotation:(id:string,annotationId:string)=>apiRequest<void>(`/v1/sessions/${id}/explain/annotations/${annotationId}`,{method:'DELETE'}),
 export:(id:string,signal?:AbortSignal)=>apiBlob(`/v1/sessions/${id}/export`,signal),
}
