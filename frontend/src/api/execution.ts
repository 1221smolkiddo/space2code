import type { ExecutionResult } from '../types'
import { apiRequest } from './client'
export const executionApi={run:(roomId:string,input:{language:string;source:string;stdin:string;scope?:'personal'|'explain'},signal?:AbortSignal)=>apiRequest<ExecutionResult>(`/v1/rooms/${roomId}/execute`,{method:'POST',body:input,signal})}
