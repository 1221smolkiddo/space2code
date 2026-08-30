import { create } from 'zustand'
import { roomsApi } from '../api/rooms'
import { executionApi } from '../api/execution'
import { collaborationApi } from '../api/collaboration'
import { socialApi } from '../api/social'
import { ApiError } from '../api/client'
import { useAuthStore } from './authStore'
import type {
  ChatMessageDto, EditorPermission, ExplainAnnotation, ExplainMessage, ExplainState,
  PermissionRequest, PermissionScope, Room, RoomEventEnvelope, RoomResponse, SessionTimer, Slot,
} from '../types'

export interface EditorCardState {
  outputState: 'idle' | 'running' | 'success' | 'error' | 'compile_error'
  stdout: string
  stderr: string
  stdin: string
  isOutputOpen: boolean
  permission: 'none' | 'pending' | 'granted'
  permissionScope?: PermissionScope
}
export interface ChatMessage { id:string;senderId:string;senderName:string;text:string;timestamp:string;isSystem?:boolean }
type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'
interface TimerView extends SessionTimer { remainingSeconds:number }

interface SessionState {
  room: Room | null
  documents: RoomResponse['documents'] | null
  roomId: string
  roomCode: string
  language: string
  currentSlot: Slot | null
  partnerState: 'connected' | 'disconnected' | 'reconnecting'
  isPartnerOnline: boolean
  connectionState: ConnectionState
  serverTimeOffsetMs: number
  isLoading: boolean
  error: string | null
  timer: TimerView
  questionA: string
  questionB: string
  questionSaveState: 'idle' | 'saving' | 'saved' | 'error'
  isQuestionOpen: boolean
  editorA: EditorCardState
  editorB: EditorCardState
  permissionRequests: PermissionRequest[]
  permissions: EditorPermission[]
  isExplainMode: boolean
  explainPrimarySlot: Slot
  explainState: ExplainState | null
  annotations: ExplainAnnotation[]
  highlightedLines: number[]
  isChatOpen: boolean
  normalMessages: ChatMessage[]
  explainMessages: ChatMessage[]
  messages: ChatMessage[]
  createSession: (language:string) => Promise<RoomResponse>
  joinSession: (roomCode:string) => Promise<RoomResponse>
  hydrate: (roomId:string, signal?:AbortSignal) => Promise<void>
  setRealtimeConnection: (state:ConnectionState) => void
  handleRoomEvent: (envelope:RoomEventEnvelope) => void
  canWrite: (slot:Slot) => boolean
  setTimer: (minutes:number) => Promise<void>
  tickTimer: () => void
  toggleQuestionPanel: () => void
  setQuestion: (slot:Slot,text:string) => void
  toggleOutput: (slot:Slot) => void
  setStdin: (slot:Slot,stdin:string) => void
  runCode: (slot:Slot,source:string) => Promise<void>
  requestEditAccess: (slot:Slot) => Promise<void>
  resolvePermission: (decision:'grant_once'|'grant_session'|'deny') => Promise<void>
  revokePermission: (granteeId:string) => Promise<void>
  toggleExplainMode: (slot?:Slot) => Promise<void>
  addAnnotation: (slot:Slot,startLine:number,endLine:number,text:string|null) => Promise<void>
  removeAnnotation: (id:string) => Promise<void>
  toggleChat: () => void
  sendMessage: (text:string) => Promise<void>
  leaveSession: () => Promise<void>
  exportSession: () => Promise<void>
  clearError: () => void
}

const emptyTimer: TimerView = { status:'not_started',durationSeconds:null,startedAt:null,endsAt:null,startedBy:null,remainingSeconds:0 }
const emptyEditor = ():EditorCardState => ({ outputState:'idle',stdout:'',stderr:'',stdin:'',isOutputOpen:false,permission:'none' })
const safeError = (error:unknown) => error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong. Please try again.'
const remaining = (timer:SessionTimer,serverTimeOffsetMs=0) => timer.endsAt ? Math.max(0,Math.ceil((Date.parse(timer.endsAt)-(Date.now()+serverTimeOffsetMs))/1000)) : 0
const timerView = (timer:SessionTimer,serverTimeOffsetMs=0):TimerView => {
  const seconds=remaining(timer,serverTimeOffsetMs)
  return { ...timer, status:timer.status==='running'&&seconds<=0?'expired':timer.status, remainingSeconds:seconds }
}
const participantName = (id:string) => id===useAuthStore.getState().user?.id?'You':`Coder ${id.slice(0,6)}`
const chat = (message:ChatMessageDto):ChatMessage => ({id:message.id,senderId:message.senderId,senderName:participantName(message.senderId),text:message.content,timestamp:new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})})
const explainChat = (message:ExplainMessage):ChatMessage => ({id:message.id,senderId:message.senderId,senderName:participantName(message.senderId),text:message.content,timestamp:new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})})
const seenEvents = new Set<string>()
let questionTimer:ReturnType<typeof setTimeout>|null=null

export const useSessionStore=create<SessionState>((set,get)=>({
  room:null,documents:null,roomId:'',roomCode:'',language:'python',currentSlot:null,
  partnerState:'disconnected',isPartnerOnline:false,connectionState:'connecting',serverTimeOffsetMs:0,isLoading:false,error:null,
  timer:emptyTimer,questionA:'',questionB:'',questionSaveState:'idle',isQuestionOpen:false,
  editorA:emptyEditor(),editorB:emptyEditor(),permissionRequests:[],permissions:[],
  isExplainMode:false,explainPrimarySlot:'A',explainState:null,annotations:[],highlightedLines:[],
  isChatOpen:true,normalMessages:[],explainMessages:[],messages:[],
  createSession:async(language)=>{set({isLoading:true,error:null});try{const result=await roomsApi.create(language);set({isLoading:false,room:result.room,documents:result.documents,roomId:result.room.id,roomCode:result.room.roomCode,language:result.room.language});return result}catch(error){set({isLoading:false,error:safeError(error)});throw error}},
  joinSession:async(roomCode)=>{set({isLoading:true,error:null});try{const result=await roomsApi.join(roomCode);set({isLoading:false,room:result.room,documents:result.documents,roomId:result.room.id,roomCode:result.room.roomCode,language:result.room.language});return result}catch(error){set({isLoading:false,error:safeError(error)});throw error}},
  hydrate:async(roomId,signal)=>{
    set({isLoading:true,error:null,connectionState:'connecting'})
    try{
      const [result,permissionState,chatState,explain] = await Promise.all([
        roomsApi.getWithClock(roomId,signal), roomsApi.permissions(roomId), collaborationApi.chat(roomId), collaborationApi.explain(roomId),
      ])
      const roomResponse=result.data,serverTimeOffsetMs=result.meta.serverTimeOffsetMs??0
      const userId=useAuthStore.getState().user?.id
      const current=roomResponse.room.participants.find(p=>p.userId===userId)?.slot??null
      const partner=roomResponse.room.participants.find(p=>p.userId!==userId)
      const permissions=permissionState.permissions
      const requests=permissionState.requests
      const editor=(slot:Slot):EditorCardState=>{
        const owner=roomResponse.room.participants.find(p=>p.slot===slot)?.userId
        const permission=permissions.find(p=>p.editorOwnerId===owner&&p.granteeId===userId&&!p.revokedAt&&!p.consumedAt)
        const pending=requests.some(r=>r.requesterId===userId&&r.editorOwnerId===owner&&r.status==='pending')
        return {...emptyEditor(),permission:slot===current||permission?'granted':pending?'pending':'none',permissionScope:permission?.scope}
      }
      const normalMessages=chatState.messages.map(chat), explainMessages=explain.messages.map(explainChat)
      set({room:roomResponse.room,documents:roomResponse.documents,roomId:roomResponse.room.id,roomCode:roomResponse.room.roomCode,
        language:roomResponse.room.language,currentSlot:current,questionA:roomResponse.room.questions.A??'',questionB:roomResponse.room.questions.B??'',
        timer:timerView(roomResponse.room.timer,serverTimeOffsetMs),serverTimeOffsetMs,partnerState:partner?.state==='connected'?'connected':'disconnected',
        isPartnerOnline:partner?.state==='connected',permissions,permissionRequests:requests,editorA:editor('A'),editorB:editor('B'),
        explainState:explain.state,isExplainMode:explain.state.active,explainPrimarySlot:explain.state.targetSlot??current??'A',
        annotations:explain.annotations,highlightedLines:explain.annotations.filter(a=>a.type==='highlight').flatMap(a=>a.startLine?[a.startLine]:[]),
        normalMessages,explainMessages,messages:explain.state.active?explainMessages:normalMessages,isLoading:false})
      await socialApi.setPresence('IN_SESSION').catch(()=>undefined)
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;set({isLoading:false,error:safeError(error),connectionState:'offline'});throw error}
  },
  setRealtimeConnection:(connectionState)=>set({connectionState,partnerState:connectionState==='reconnecting'?'reconnecting':get().partnerState}),
  handleRoomEvent:(envelope)=>{
    if(envelope.roomId!==get().roomId)return
    const event=envelope.event,key=`${event.type}:${event.occurredAt}:${'message'in event&&event.message?.id||''}`
    if(seenEvents.has(key))return;seenEvents.add(key);if(seenEvents.size>500)seenEvents.clear()
    if(event.type==='participant.connected'||event.type==='participant.disconnected'){
      if(event.userId!==useAuthStore.getState().user?.id){set({partnerState:event.type==='participant.connected'?'connected':'disconnected',isPartnerOnline:event.type==='participant.connected'});if(event.type==='participant.connected'&&!get().room?.participants.some(p=>p.userId===event.userId))void get().hydrate(get().roomId).catch(()=>undefined)}
    }else if(event.type==='session.ended')set({partnerState:'disconnected',isPartnerOnline:false,error:'Your partner ended this live session. The saved board remains in Recent Sessions.'})
    else if(event.type==='question.updated')set({[event.slot==='A'?'questionA':'questionB']:event.question??''})
    else if(event.type==='timer.started'||event.type==='timer.expired')set({timer:timerView(event.timer,get().serverTimeOffsetMs)})
    else if(event.type==='chat.message'){const value=chat(event.message);if(!get().normalMessages.some(m=>m.id===value.id)){const normalMessages=[...get().normalMessages,value];set({normalMessages,messages:get().isExplainMode?get().messages:normalMessages})}}
    else if(event.type==='explain.message'){const value=explainChat(event.message);if(!get().explainMessages.some(m=>m.id===value.id)){const explainMessages=[...get().explainMessages,value];set({explainMessages,messages:get().isExplainMode?explainMessages:get().messages})}}
    else if(event.type==='explain.state'||event.type==='explain.arbitrated'){set({explainState:event.state,isExplainMode:event.state.active,explainPrimarySlot:event.state.targetSlot??get().explainPrimarySlot,messages:event.state.active?get().explainMessages:get().normalMessages})}
    else if(event.type==='explain.annotation'){if(!get().annotations.some(a=>a.id===event.annotation.id))set({annotations:[...get().annotations,event.annotation]})}
    else if(event.type==='permission.requested'){set({permissionRequests:[...get().permissionRequests.filter(r=>r.id!==event.request.id),event.request]})}
    else if(event.type==='permission.changed'){
      const permissions=get().permissions.filter(p=>!(p.editorOwnerId===event.ownerId&&p.granteeId===event.granteeId));if(event.permission)permissions.push(event.permission)
      const requests=get().permissionRequests.filter(r=>!(r.editorOwnerId===event.ownerId&&r.requesterId===event.granteeId))
      set({permissions,permissionRequests:requests});const current=get().currentSlot,userId=useAuthStore.getState().user?.id
      for(const slot of ['A','B'] as const){const owner=get().room?.participants.find(p=>p.slot===slot)?.userId;if(slot!==current&&owner===event.ownerId&&event.granteeId===userId)set({[slot==='A'?'editorA':'editorB']:{...get()[slot==='A'?'editorA':'editorB'],permission:event.permission?'granted':'none',permissionScope:event.permission?.scope}})}
    }
  },
  canWrite:(slot)=>{if(get().room?.status!=='waiting'&&get().room?.status!=='live')return false;if(slot===get().currentSlot)return true;const owner=get().room?.participants.find(p=>p.slot===slot)?.userId,user=useAuthStore.getState().user?.id;return get().permissions.some(p=>p.editorOwnerId===owner&&p.granteeId===user&&!p.revokedAt&&!p.consumedAt)},
  setTimer:async(minutes)=>{try{const{timer}=await roomsApi.startTimer(get().roomId,minutes*60);set({timer:timerView(timer,get().serverTimeOffsetMs)})}catch(error){set({error:safeError(error)})}},
  tickTimer:()=>set({timer:timerView(get().timer,get().serverTimeOffsetMs)}),
  toggleQuestionPanel:()=>set({isQuestionOpen:!get().isQuestionOpen}),
  setQuestion:(slot,text)=>{if(slot!==get().currentSlot||(get().room?.status!=='waiting'&&get().room?.status!=='live'))return;set({[slot==='A'?'questionA':'questionB']:text,questionSaveState:'saving'});if(questionTimer)clearTimeout(questionTimer);questionTimer=setTimeout(async()=>{try{const result=await roomsApi.question(get().roomId,text.trim()||null);set({room:result.room,questionSaveState:'saved'})}catch(error){set({questionSaveState:'error',error:safeError(error)})}},650)},
  toggleOutput:(slot)=>{const key=slot==='A'?'editorA':'editorB';set({[key]:{...get()[key],isOutputOpen:!get()[key].isOutputOpen}})},
  setStdin:(slot,stdin)=>{const key=slot==='A'?'editorA':'editorB';set({[key]:{...get()[key],stdin}})},
  runCode:async(slot,source)=>{const key=slot==='A'?'editorA':'editorB',editor=get()[key];if(editor.outputState==='running')return;set({[key]:{...editor,outputState:'running',isOutputOpen:true,stdout:'',stderr:''}});try{const result=await executionApi.run(get().roomId,{language:get().language,source,stdin:get()[key].stdin});const stderr=[result.compileOutput,result.stderr].filter(Boolean).join('\n')||(result.status==='completed'?'':`Execution ended with ${result.status.replaceAll('_',' ')}.`);set({[key]:{...get()[key],outputState:result.status==='completed'?'success':result.status==='compile_error'?'compile_error':'error',stdout:result.stdout,stderr}})}catch(error){set({[key]:{...get()[key],outputState:'error',stderr:safeError(error)},error:safeError(error)})}},
  requestEditAccess:async(slot)=>{const owner=get().room?.participants.find(p=>p.slot===slot)?.userId;if(!owner)return;try{const result=await roomsApi.requestPermission(get().roomId,owner) as {permissionRequest:PermissionRequest};set({permissionRequests:[...get().permissionRequests.filter(r=>r.id!==result.permissionRequest.id),result.permissionRequest],[slot==='A'?'editorA':'editorB']:{...get()[slot==='A'?'editorA':'editorB'],permission:'pending'}})}catch(error){set({error:safeError(error)})}},
  resolvePermission:async(decision)=>{const user=useAuthStore.getState().user?.id;const request=get().permissionRequests.find(r=>r.editorOwnerId===user&&r.status==='pending');if(!request)return;try{await roomsApi.resolvePermission(get().roomId,request.id,decision==='deny'?'deny':'grant',decision==='grant_once'?'once':decision==='grant_session'?'session':undefined);const state=await roomsApi.permissions(get().roomId);set({permissionRequests:state.requests,permissions:state.permissions})}catch(error){set({error:safeError(error)})}},
  revokePermission:async(granteeId)=>{try{await roomsApi.revokePermission(get().roomId,granteeId);set({permissions:get().permissions.filter(p=>p.granteeId!==granteeId)})}catch(error){set({error:safeError(error)})}},
  toggleExplainMode:async(slot)=>{try{if(get().isExplainMode){const{state}=await collaborationApi.deactivate(get().roomId);set({explainState:state,isExplainMode:false,messages:get().normalMessages})}else{const result=await collaborationApi.activate(get().roomId,slot??get().currentSlot??'A');set({explainState:result.state,isExplainMode:result.state.active,explainPrimarySlot:result.state.targetSlot??'A',messages:get().explainMessages,isChatOpen:true})}}catch(error){set({error:safeError(error)})}},
  addAnnotation:async(slot,startLine,endLine,text)=>{try{const result=await collaborationApi.annotate(get().roomId,{targetSlot:slot,startLine,endLine,type:text?'note':'highlight',text}) as {annotation:ExplainAnnotation};set({annotations:[...get().annotations,result.annotation]})}catch(error){set({error:safeError(error)})}},
  removeAnnotation:async(id)=>{try{await collaborationApi.removeAnnotation(get().roomId,id);set({annotations:get().annotations.filter(a=>a.id!==id)})}catch(error){set({error:safeError(error)})}},
  toggleChat:()=>set({isChatOpen:!get().isChatOpen}),
  sendMessage:async(text)=>{try{if(get().isExplainMode){const result=await collaborationApi.sendExplain(get().roomId,text) as {message:ExplainMessage};const value=explainChat(result.message);if(!get().explainMessages.some(m=>m.id===value.id))set({explainMessages:[...get().explainMessages,value],messages:[...get().messages,value]})}else{const{message}=await collaborationApi.sendChat(get().roomId,text);const value=chat(message);if(!get().normalMessages.some(m=>m.id===value.id))set({normalMessages:[...get().normalMessages,value],messages:[...get().messages,value]})}}catch(error){set({error:safeError(error)})}},
  leaveSession:async()=>{try{await roomsApi.leave(get().roomId);await socialApi.setPresence('ONLINE').catch(()=>undefined)}catch(error){set({error:safeError(error)});throw error}},
  exportSession:async()=>{try{const{blob,filename}=await collaborationApi.export(get().roomId);const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0)}catch(error){set({error:safeError(error)});throw error}},
  clearError:()=>set({error:null}),
}))
