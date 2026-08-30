import { env } from '../config/env'
import { supabase } from './supabase'

interface ApiErrorBody { error?: { code?: string; message?: string; issues?: unknown } }
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message); this.name = 'ApiError'; this.status=status; this.code=code; this.details=details
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> { body?: unknown; auth?: boolean }
export interface ApiResponseMeta { serverTimeOffsetMs: number | null }
export interface ApiResponse<T> { data:T;meta:ApiResponseMeta }

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRequestWithMeta<T>(path,options)).data
}

export async function apiRequestWithMeta<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers); headers.set('accept', 'application/json')
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.auth !== false) {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.')
    headers.set('authorization', `Bearer ${data.session.access_token}`)
  }
  let response: Response
  const requestStartedAt=Date.now()
  try { response = await fetch(`${env.apiBaseUrl}${path}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }) }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new ApiError(0, 'BACKEND_UNAVAILABLE', 'Space2Code cannot reach the backend right now.') }
  if (!response.ok) {
    let body: ApiErrorBody = {}; try { body = await response.json() as ApiErrorBody } catch { /* response was not JSON */ }
    throw new ApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', friendlyMessage(body.error?.code, body.error?.message), body.error?.issues)
  }
  const receivedAt=Date.now(),serverDate=response.headers.get('date'),parsedServerDate=serverDate?Date.parse(serverDate):Number.NaN
  const meta:ApiResponseMeta={serverTimeOffsetMs:Number.isFinite(parsedServerDate)?parsedServerDate-((requestStartedAt+receivedAt)/2):null}
  if (response.status === 204) return {data:undefined as T,meta}
  return {data:await response.json() as T,meta}
}

export async function apiBlob(path: string, signal?: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  const { data } = await supabase.auth.getSession(); const token = data.session?.access_token
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.')
  const response = await fetch(`${env.apiBaseUrl}${path}`, { headers: { authorization: `Bearer ${token}` }, signal })
  if (!response.ok) { let body: ApiErrorBody={};try{body=await response.json() as ApiErrorBody}catch{/* non-JSON */}throw new ApiError(response.status,body.error?.code??'EXPORT_FAILED',friendlyMessage(body.error?.code,body.error?.message)) }
  const disposition=response.headers.get('content-disposition')??'';const filename=disposition.match(/filename="?([^";]+)"?/i)?.[1]??'space2code-session.zip'
  return { blob: await response.blob(), filename }
}

export const getAccessToken = async (): Promise<string> => (await supabase.auth.getSession()).data.session?.access_token ?? ''
export function friendlyMessage(code?: string, fallback?: string): string {
  const messages: Record<string,string>={ROOM_FULL:'This coding desk already has two people.',ROOM_ENDED:'This live session has ended.',ROOM_NOT_FOUND:'That room code could not be found.',INVITE_STALE:'That invitation has expired.',RATE_LIMITED:'You are doing that too quickly. Please pause and try again.',EXECUTION_RATE_LIMITED:'Run limit reached. Please wait a moment.',EXECUTION_PROVIDER_UNAVAILABLE:'The code runner is temporarily unavailable.',FORBIDDEN:'You do not have permission for that action.',UNAUTHORIZED:'Please sign in again.',EXPORT_LIMIT_EXCEEDED:'This session is too large to export.'}
  return messages[code??''] ?? fallback ?? 'Something went wrong. Please try again.'
}
