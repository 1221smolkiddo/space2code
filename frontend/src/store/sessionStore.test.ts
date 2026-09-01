import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room, RoomResponse } from '../types'

const mocks = vi.hoisted(() => ({
  getWithClock:vi.fn(),create:vi.fn(),join:vi.fn(),permissions:vi.fn(),question:vi.fn(),startTimer:vi.fn(),leave:vi.fn(),typing:vi.fn(),
  run:vi.fn(),chat:vi.fn(),explain:vi.fn(),sendChat:vi.fn(),activate:vi.fn(),deactivate:vi.fn(),export:vi.fn(),
  setPresence:vi.fn(),recent:vi.fn(),
}))
vi.mock('../api/rooms',()=>({roomsApi:{getWithClock:mocks.getWithClock,create:mocks.create,join:mocks.join,permissions:mocks.permissions,question:mocks.question,startTimer:mocks.startTimer,leave:mocks.leave,typing:mocks.typing}}))
vi.mock('../api/execution',()=>({executionApi:{run:mocks.run}}))
vi.mock('../api/social',()=>({socialApi:{setPresence:mocks.setPresence,recent:mocks.recent}}))
vi.mock('../api/collaboration',()=>({collaborationApi:{chat:mocks.chat,explain:mocks.explain,sendChat:mocks.sendChat,sendExplain:vi.fn(),activate:mocks.activate,deactivate:mocks.deactivate,annotate:vi.fn(),removeAnnotation:vi.fn(),export:mocks.export}}))

import { useAuthStore } from './authStore'
import { useSessionStore } from './sessionStore'

const userA='00000000-0000-4000-8000-000000000001', userB='00000000-0000-4000-8000-000000000002'
const room:Room={id:'10000000-0000-4000-8000-000000000001',roomCode:'ABC234',language:'python',status:'live',createdBy:userA,endedBy:null,endedReason:null,createdAt:'2026-08-30T10:00:00Z',lastActiveAt:'2026-08-30T10:00:00Z',startedAt:'2026-08-30T10:00:00Z',endedAt:null,expiresAt:'2026-08-31T10:00:00Z',resumedFromSessionId:null,resumePartnerId:null,questions:{A:'mine',B:'partner'},timer:{status:'not_started',durationSeconds:null,startedAt:null,endsAt:null,startedBy:null},participants:[{userId:userA,slot:'A',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null},{userId:userB,slot:'B',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null}],partner:{userId:userB,displayName:'Grace Hopper',avatarUrl:null}}
const response:RoomResponse={room,documents:{userA:`room:${room.id}:userA:code`,userB:`room:${room.id}:userB:code`}}
const explainState={sessionId:room.id,active:false,targetSlot:null,controllerId:null,activatedAt:null,updatedAt:room.createdAt,revision:0}

beforeEach(()=>{
  vi.clearAllMocks()
  useAuthStore.setState({user:{id:userA,email:'a@example.com',displayName:'A',avatarUrl:null}})
  mocks.getWithClock.mockResolvedValue({data:response,meta:{serverTimeOffsetMs:0}});mocks.permissions.mockResolvedValue({requests:[],permissions:[]})
  mocks.chat.mockResolvedValue({messages:[]});mocks.explain.mockResolvedValue({state:explainState,messages:[],annotations:[]});mocks.setPresence.mockResolvedValue(undefined)
  mocks.typing.mockResolvedValue(undefined)
  useSessionStore.setState({isExplainMode:false,partnerHasLeft:false,partnerIsTyping:false,sharedTerminal:{outputState:'idle',stdout:'',stderr:'',stdin:'',isOutputOpen:false,permission:'none'}})
})

describe('authoritative session integration',()=>{
  it('uses authoritative create and join responses instead of local room IDs',async()=>{
    mocks.create.mockResolvedValue(response);mocks.join.mockResolvedValue(response)
    await expect(useSessionStore.getState().createSession('python')).resolves.toEqual(response)
    await expect(useSessionStore.getState().joinSession('abc234')).resolves.toEqual(response)
    expect(mocks.create).toHaveBeenCalledWith('python');expect(mocks.join).toHaveBeenCalledWith('abc234')
  })
  it('hydrates room state while keeping the owner writable and partner read-only',async()=>{
    await useSessionStore.getState().hydrate(room.id)
    expect(useSessionStore.getState()).toMatchObject({roomId:room.id,currentSlot:'A',questionA:'mine',questionB:'partner',partnerState:'connected'})
    expect(useSessionStore.getState().canWrite('A')).toBe(true)
    expect(useSessionStore.getState().canWrite('B')).toBe(false)
    expect(mocks.recent).not.toHaveBeenCalled()
  })

  it('uses real partner names for chat and explain messages from both user perspectives',async()=>{
    const messages=(senderId:string)=>[{id:`chat-${senderId}`,sessionId:room.id,senderId,content:'hello',createdAt:room.createdAt}]
    const explainMessages=(senderId:string)=>[{id:`explain-${senderId}`,sessionId:room.id,senderId,content:'look here',createdAt:room.createdAt}]

    mocks.chat.mockResolvedValue({messages:messages(userB)})
    mocks.explain.mockResolvedValue({state:explainState,messages:explainMessages(userB),annotations:[]})
    await useSessionStore.getState().hydrate(room.id)
    expect(useSessionStore.getState().normalMessages[0]?.senderName).toBe('Grace Hopper')
    expect(useSessionStore.getState().explainMessages[0]?.senderName).toBe('Grace Hopper')

    const roomForB={...room,partner:{userId:userA,displayName:'Ada Lovelace',avatarUrl:null}}
    useAuthStore.setState({user:{id:userB,email:'b@example.com',displayName:'Grace Hopper',avatarUrl:null}})
    mocks.getWithClock.mockResolvedValue({data:{...response,room:roomForB},meta:{serverTimeOffsetMs:0}})
    mocks.chat.mockResolvedValue({messages:messages(userA)})
    mocks.explain.mockResolvedValue({state:explainState,messages:explainMessages(userA),annotations:[]})
    await useSessionStore.getState().hydrate(room.id)
    expect(useSessionStore.getState().normalMessages[0]?.senderName).toBe('Ada Lovelace')
    expect(useSessionStore.getState().explainMessages[0]?.senderName).toBe('Ada Lovelace')
  })

  it('applies authoritative grants and revocations without removing owner access',async()=>{
    await useSessionStore.getState().hydrate(room.id)
    const permission={sessionId:room.id,editorOwnerId:userB,granteeId:userA,scope:'session' as const,grantedAt:room.createdAt,revokedAt:null,consumedAt:null}
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'permission.changed',occurredAt:'2026-08-30T10:01:00Z',ownerId:userB,granteeId:userA,permission}})
    expect(useSessionStore.getState().canWrite('B')).toBe(true)
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'permission.changed',occurredAt:'2026-08-30T10:02:00Z',ownerId:userB,granteeId:userA,permission:null}})
    expect(useSessionStore.getState().canWrite('B')).toBe(false)
    expect(useSessionStore.getState().canWrite('A')).toBe(true)
  })

  it('derives countdown from server timestamps and transitions to untimed expiry',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-08-30T10:00:00Z'))
    const timed={...room,timer:{status:'running' as const,durationSeconds:60,startedAt:'2026-08-30T10:00:00Z',endsAt:'2026-08-30T10:01:00Z',startedBy:userA}}
    mocks.getWithClock.mockResolvedValue({data:{...response,room:timed},meta:{serverTimeOffsetMs:0}})
    await useSessionStore.getState().hydrate(room.id)
    expect(useSessionStore.getState().timer.remainingSeconds).toBe(60)
    vi.setSystemTime(new Date('2026-08-30T10:01:01Z'));useSessionStore.getState().tickTimer()
    expect(useSessionStore.getState().timer).toMatchObject({status:'expired',remainingSeconds:0})
    vi.useRealTimers()
  })

  it('corrects countdown using the server Date offset captured during hydration',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-08-30T09:55:00Z'))
    const timed={...room,timer:{status:'running' as const,durationSeconds:60,startedAt:'2026-08-30T10:00:00Z',endsAt:'2026-08-30T10:01:00Z',startedBy:userA}}
    mocks.getWithClock.mockResolvedValue({data:{...response,room:timed},meta:{serverTimeOffsetMs:5*60_000}})
    await useSessionStore.getState().hydrate(room.id)
    expect(useSessionStore.getState().timer.remainingSeconds).toBe(60)
    vi.setSystemTime(new Date('2026-08-30T09:56:01Z'));useSessionStore.getState().tickTimer()
    expect(useSessionStore.getState().timer).toMatchObject({status:'expired',remainingSeconds:0})
    vi.useRealTimers()
  })

  it('normalizes execution failures and suppresses duplicate incoming chat events',async()=>{
    await useSessionStore.getState().hydrate(room.id)
    mocks.run.mockResolvedValue({status:'compile_error',stdout:'',stderr:'syntax error',compileOutput:'line 1',exitCode:1,executionId:'e',signal:null,runtime:{language:'python',version:'3',cpuTimeMs:null,wallTimeMs:null,memoryBytes:null},outputTruncated:false})
    await useSessionStore.getState().runCode('A','bad source')
    expect(useSessionStore.getState().editorA).toMatchObject({outputState:'compile_error',stderr:'line 1\nsyntax error'})
    const message={id:'m1',sessionId:room.id,senderId:userB,content:'hello',createdAt:room.createdAt}
    const envelope={version:1 as const,roomId:room.id,event:{type:'chat.message' as const,occurredAt:'2026-08-30T10:03:00Z',message}}
    useSessionStore.getState().handleRoomEvent(envelope);useSessionStore.getState().handleRoomEvent(envelope)
    expect(useSessionStore.getState().normalMessages).toHaveLength(1)
  })

  it('respects the backend Explain arbitration winner and explicit exit lifecycle',async()=>{
    await useSessionStore.getState().hydrate(room.id)
    const winning={...explainState,active:true,targetSlot:'B' as const,controllerId:userB,revision:1}
    mocks.activate.mockResolvedValue({state:winning,winnerId:userB,contenderCount:2});mocks.leave.mockResolvedValue(response)
    await useSessionStore.getState().toggleExplainMode('A')
    expect(useSessionStore.getState()).toMatchObject({isExplainMode:true,explainPrimarySlot:'B'})
    await useSessionStore.getState().leaveSession();expect(mocks.leave).toHaveBeenCalledWith(room.id)
  })

  it('keeps personal terminal state while Explain Mode uses one realtime shared result',async()=>{
    await useSessionStore.getState().hydrate(room.id)
    useSessionStore.setState({
      editorA:{...useSessionStore.getState().editorA,stdout:'personal A',stdin:'a'},
      editorB:{...useSessionStore.getState().editorB,stdout:'personal B',stdin:'b'},
      isExplainMode:true,
    })
    const result={status:'completed' as const,stdout:'shared result',stderr:'',compileOutput:'',exitCode:0,executionId:'shared-1',signal:null,runtime:{language:'python',version:'3',cpuTimeMs:null,wallTimeMs:null,memoryBytes:null},outputTruncated:false}
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'execution.completed',occurredAt:'2026-08-30T10:04:00Z',executionId:'shared-1',userId:userB,status:'completed',scope:'explain',result}})
    expect(useSessionStore.getState().sharedTerminal).toMatchObject({stdout:'shared result',outputState:'success'})
    useAuthStore.setState({user:{id:userB,email:'b@example.com',displayName:'Grace Hopper',avatarUrl:null}})
    useSessionStore.setState({room:{...room,partner:{userId:userA,displayName:'Ada Lovelace',avatarUrl:null}},sharedTerminal:{...useSessionStore.getState().sharedTerminal,stdout:'',outputState:'idle'}})
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'execution.completed',occurredAt:'2026-08-30T10:04:01Z',executionId:'shared-1',userId:userB,status:'completed',scope:'explain',result}})
    expect(useSessionStore.getState().sharedTerminal).toMatchObject({stdout:'shared result',outputState:'success'})
    useSessionStore.setState({isExplainMode:false})
    expect(useSessionStore.getState().editorA).toMatchObject({stdout:'personal A',stdin:'a'})
    expect(useSessionStore.getState().editorB).toMatchObject({stdout:'personal B',stdin:'b'})
  })

  it('clears ephemeral partner typing on stop, inactivity, disconnect, and reconnect',async()=>{
    vi.useFakeTimers()
    await useSessionStore.getState().hydrate(room.id)
    const typing=(occurredAt:string,isTyping:boolean)=>useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'participant.typing',occurredAt,userId:userB,isTyping}})
    typing('2026-08-30T10:05:00Z',true)
    expect(useSessionStore.getState().partnerIsTyping).toBe(true)
    vi.advanceTimersByTime(3001)
    expect(useSessionStore.getState().partnerIsTyping).toBe(false)
    typing('2026-08-30T10:05:04Z',true);typing('2026-08-30T10:05:05Z',false)
    expect(useSessionStore.getState().partnerIsTyping).toBe(false)
    typing('2026-08-30T10:05:06Z',true)
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'participant.disconnected',occurredAt:'2026-08-30T10:05:07Z',userId:userB}})
    expect(useSessionStore.getState()).toMatchObject({partnerState:'disconnected',partnerIsTyping:false,partnerHasLeft:false})
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'participant.connected',occurredAt:'2026-08-30T10:05:08Z',userId:userB}})
    expect(useSessionStore.getState()).toMatchObject({partnerState:'connected',partnerIsTyping:false,partnerHasLeft:false})
    vi.useRealTimers()
  })

  it('distinguishes a grace-period disconnect from an explicit permanent leave',async()=>{
    await useSessionStore.getState().hydrate(room.id)
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'participant.disconnected',occurredAt:'2026-08-30T10:06:00Z',userId:userB}})
    expect(useSessionStore.getState()).toMatchObject({partnerState:'disconnected',partnerHasLeft:false})
    useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:'session.ended',occurredAt:'2026-08-30T10:06:01Z',endedBy:userB,reason:'partner_left'}})
    expect(useSessionStore.getState()).toMatchObject({partnerState:'disconnected',partnerHasLeft:true})
  })

  it('downloads the backend-generated export and surfaces export failures',async()=>{
    await useSessionStore.getState().hydrate(room.id)
    const createObjectURL=vi.fn(()=> 'blob:session'),revokeObjectURL=vi.fn(),click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined)
    Object.defineProperty(URL,'createObjectURL',{value:createObjectURL,configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:revokeObjectURL,configurable:true})
    mocks.export.mockResolvedValue({blob:new Blob(['zip']),filename:'session.zip'})
    await useSessionStore.getState().exportSession()
    expect(createObjectURL).toHaveBeenCalled();expect(click).toHaveBeenCalled()
    mocks.export.mockRejectedValue(new Error('Session expired'))
    await expect(useSessionStore.getState().exportSession()).rejects.toThrow('Session expired')
    expect(useSessionStore.getState().error).toBe('Session expired')
  })
})
