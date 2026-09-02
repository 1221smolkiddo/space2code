import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room, Slot } from '../../types'

interface ProviderOptions {
  name: string
  document: { getText:(name:string)=>unknown }
  onStatus?: (payload:{status:string})=>void
  onDestroy?: ()=>void
  onAwarenessChange?: (payload:{states:Array<{clientId:number;user?:{id?:string;name?:string};typing?:boolean}>})=>void
}
interface ProviderRecord {
  options: ProviderOptions
  awareness: { setLocalStateField: ReturnType<typeof vi.fn> }
  destroy: ReturnType<typeof vi.fn>
}

const mocks=vi.hoisted(()=>({
  providers:[] as ProviderRecord[],bindings:[] as {destroy:ReturnType<typeof vi.fn>;text:unknown;model:unknown;editors:unknown}[],editors:[] as Array<{getModel:ReturnType<typeof vi.fn>;getValue:ReturnType<typeof vi.fn>;getSelection:ReturnType<typeof vi.fn>;deltaDecorations:ReturnType<typeof vi.fn>}>,
}))

vi.mock('@hocuspocus/provider',()=>({HocuspocusProvider:class{
  options:ProviderOptions
  awareness={setLocalStateField:vi.fn()}
  destroy=vi.fn(()=>this.options.onDestroy?.())
  constructor(options:ProviderOptions){this.options=options;mocks.providers.push(this)}
}}))
vi.mock('y-monaco',()=>({MonacoBinding:class{
  destroy=vi.fn()
  text:unknown;model:unknown;editors:unknown
  constructor(text:unknown,model:unknown,editors:unknown){this.text=text;this.model=model;this.editors=editors;mocks.bindings.push(this)}
}}))
vi.mock('@monaco-editor/react',async()=>{
  const React=await import('react')
  function MockMonacoEditor({onMount,options}:{onMount:(editor:(typeof mocks.editors)[number])=>void;options:{readOnly:boolean}}){
    const editor=React.useMemo(()=>{const model={id:`model-${mocks.editors.length}`};const value={getModel:vi.fn(()=>model),getValue:vi.fn(()=>''),getSelection:vi.fn(),deltaDecorations:vi.fn(()=>[])};mocks.editors.push(value);return value},[])
    React.useEffect(()=>{onMount(editor)},[editor,onMount])
    return React.createElement('div',{'data-testid':'monaco','data-readonly':String(options.readOnly)})
  }
  return {default:MockMonacoEditor}
})
vi.mock('../../config/env',()=>({env:{realtimeReady:true,hocuspocusUrl:'ws://realtime.test'}}))
vi.mock('../../api/client',()=>({getAccessToken:vi.fn(async()=> 'token')}))
vi.mock('./OutputDrawer',()=>({OutputDrawer:({title}:{title:string})=><div>{title}</div>}))
vi.mock('../../components/doodles/WashiTape',()=>({WashiTape:()=>null}))

import { useAuthStore } from '../../store/authStore'
import { useSessionStore } from '../../store/sessionStore'
import { editorDocumentName } from '../../realtime/editorDocument'
import { EditorPanel } from './EditorPanel'

const userA='00000000-0000-4000-8000-000000000001',userB='00000000-0000-4000-8000-000000000002'
const roomId='10000000-0000-4000-8000-000000000001'
const room:Room={id:roomId,roomCode:'ABC234',language:'python',status:'live',createdBy:userA,endedBy:null,endedReason:null,createdAt:'2026-08-30T10:00:00Z',lastActiveAt:'2026-08-30T10:00:00Z',startedAt:'2026-08-30T10:00:00Z',endedAt:null,expiresAt:'2026-08-31T10:00:00Z',resumedFromSessionId:null,resumePartnerId:null,questions:{A:null,B:null},timer:{status:'not_started',durationSeconds:null,startedAt:null,endsAt:null,startedBy:null},participants:[{userId:userA,slot:'A',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null},{userId:userB,slot:'B',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null}],partner:{userId:userB,displayName:'Grace',avatarUrl:null}}

beforeEach(()=>{
  vi.clearAllMocks();mocks.providers.length=0;mocks.bindings.length=0;mocks.editors.length=0
  useSessionStore.setState({isExplainMode:false,sharedTerminal:{...useSessionStore.getState().sharedTerminal,outputState:'idle'},editorA:{...useSessionStore.getState().editorA,isOutputOpen:false},editorB:{...useSessionStore.getState().editorB,isOutputOpen:false}})
})

const renderPartnerDesk=(slot:Slot)=>{
  const viewerId=slot==='A'?userB:userA,ownerId=slot==='A'?userA:userB,currentSlot=slot==='A'?'B':'A'
  useAuthStore.setState({user:{id:viewerId,email:'viewer@example.com',displayName:'Viewer',avatarUrl:null}})
  useSessionStore.setState({room,roomId,currentSlot,documents:{userA:'legacy-user-specific-a',userB:'legacy-user-specific-b'},permissions:[],permissionRequests:[],connectionState:'connected',editorA:{...useSessionStore.getState().editorA,permission:'none'},editorB:{...useSessionStore.getState().editorB,permission:'none'}})
  const rendered=render(<EditorPanel slot={slot} username="Owner" partnerName="Partner" isOwner={false} isPartnerOnline language="python" />)
  return {viewerId,ownerId,rendered}
}

describe('EditorPanel realtime lifecycle',()=>{
  it('carries ephemeral partner typing over authenticated Desk A awareness',()=>{
    useAuthStore.setState({user:{id:userA,email:'ada@example.com',displayName:'Ada',avatarUrl:null}})
    useSessionStore.setState({room,roomId,currentSlot:'A',partnerIsTyping:false,permissions:[],permissionRequests:[]})
    const rendered=render(<EditorPanel slot="A" username="You" partnerName="Grace" isOwner isPartnerOnline language="python" />)
    const provider=mocks.providers[0]!
    act(()=>provider.options.onAwarenessChange?.({states:[{clientId:2,user:{id:userB,name:'Grace'},typing:true}]}))
    expect(useSessionStore.getState().partnerIsTyping).toBe(true)
    act(()=>provider.options.onAwarenessChange?.({states:[]}))
    expect(useSessionStore.getState().partnerIsTyping).toBe(false)
    void useSessionStore.getState().setTyping(true)
    expect(provider.awareness.setLocalStateField).toHaveBeenCalledWith('typing',true)
    rendered.unmount()
  })

  it('labels personal terminals by viewer identity and never shows an owner badge',()=>{
    useAuthStore.setState({user:{id:userA,email:'ada@example.com',displayName:'Ada',avatarUrl:null}})
    useSessionStore.setState({room,roomId,currentSlot:'A',isExplainMode:false,editorA:{...useSessionStore.getState().editorA,isOutputOpen:true},editorB:{...useSessionStore.getState().editorB,isOutputOpen:true},permissions:[],permissionRequests:[]})
    const {rerender}=render(<EditorPanel slot="A" username="You" partnerName="Grace" isOwner isPartnerOnline language="python" />)
    expect(screen.getByText('Your Terminal')).toBeInTheDocument()
    expect(screen.queryByText('owner',{exact:true})).not.toBeInTheDocument()
    rerender(<EditorPanel slot="B" username="Grace" partnerName="Grace" isOwner={false} isPartnerOnline language="python" />)
    expect(screen.getByText("Grace's Terminal")).toBeInTheDocument()
    expect(screen.queryByText('owner',{exact:true})).not.toBeInTheDocument()
  })

  for(const slot of ['A','B'] as const){
    it(`keeps Desk ${slot} on one provider through grant, revoke, hydration, and reconnect`,()=>{
      const {viewerId,ownerId,rendered}=renderPartnerDesk(slot)
      expect(mocks.providers).toHaveLength(1)
      const provider=mocks.providers[0]!,doc=provider.options.document,binding=mocks.bindings[0]!
      expect(provider.options.name).toBe(editorDocumentName(roomId,slot))
      expect(screen.getByTestId('monaco')).toHaveAttribute('data-readonly','true')

      act(()=>useSessionStore.setState({documents:{userA:'changed-response-a',userB:'changed-response-b'}}))
      expect(mocks.providers).toHaveLength(1)
      expect(provider.destroy).not.toHaveBeenCalled()

      const permission={sessionId:roomId,editorOwnerId:ownerId,granteeId:viewerId,scope:'session' as const,grantedAt:room.createdAt,revokedAt:null,consumedAt:null}
      act(()=>useSessionStore.setState({permissions:[permission]}))
      expect(screen.getByTestId('monaco')).toHaveAttribute('data-readonly','false')
      expect(mocks.providers).toHaveLength(1)
      expect(mocks.bindings).toHaveLength(1)
      expect(mocks.providers[0]!.options.document).toBe(doc)

      act(()=>provider.options.onStatus?.({status:'reconnecting'}))
      act(()=>provider.options.onStatus?.({status:'connected'}))
      expect(mocks.providers).toHaveLength(1)
      expect(mocks.providers[0]!.options.document).toBe(doc)

      act(()=>useSessionStore.setState({isExplainMode:true,explainPrimarySlot:slot==='A'?'B':'A'}))
      expect(mocks.bindings).toHaveLength(1)
      expect(binding.destroy).toHaveBeenCalledTimes(1)
      expect(provider.destroy).not.toHaveBeenCalled()
      act(()=>useSessionStore.setState({isExplainMode:false}))
      expect(screen.getByTestId('monaco')).toHaveAttribute('data-readonly','false')
      expect(mocks.bindings).toHaveLength(2)
      expect(mocks.bindings[1]!.text).toBe(mocks.bindings[0]!.text)

      act(()=>useSessionStore.setState({permissions:[]}))
      expect(screen.getByTestId('monaco')).toHaveAttribute('data-readonly','true')
      expect(mocks.providers).toHaveLength(1)
      expect(provider.destroy).not.toHaveBeenCalled()
      expect(mocks.bindings[1]!.destroy).not.toHaveBeenCalled()

      act(()=>useSessionStore.setState({isExplainMode:true,explainPrimarySlot:slot==='A'?'B':'A'}))
      expect(screen.queryByTestId('monaco')).not.toBeInTheDocument()
      expect(mocks.bindings[1]!.destroy).toHaveBeenCalledTimes(1)
      expect(provider.destroy).not.toHaveBeenCalled()
      expect(useSessionStore.getState().currentSlot).toBe(slot==='A'?'B':'A')

      act(()=>useSessionStore.setState({isExplainMode:false}))
      expect(screen.getByTestId('monaco')).toHaveAttribute('data-readonly','true')
      expect(mocks.providers).toHaveLength(1)
      expect(mocks.providers[0]!.options.document).toBe(doc)
      expect(mocks.bindings).toHaveLength(3)
      expect(mocks.bindings[2]!.text).toBe(mocks.bindings[0]!.text)

      rendered.unmount()
      expect(provider.destroy).toHaveBeenCalledTimes(1)
      expect(mocks.bindings[2]!.destroy).toHaveBeenCalledTimes(1)
    })
  }
})
