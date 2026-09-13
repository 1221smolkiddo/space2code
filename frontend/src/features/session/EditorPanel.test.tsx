import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room, Slot } from '../../types'

interface MockModel {
  id:string
  isDisposed:()=>boolean
  dispose:()=>void
  onWillDispose:(listener:()=>void)=>{dispose:()=>void}
}

function createMockModel(id:string):MockModel {
  let disposed=false
  const listeners=new Set<()=>void>()
  return {
    id,
    isDisposed:()=>disposed,
    onWillDispose:(listener)=>{
      listeners.add(listener)
      return {dispose:()=>{listeners.delete(listener)}}
    },
    dispose:()=>{
      if(disposed)return
      for(const listener of [...listeners])listener()
      disposed=true
    },
  }
}
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
  disposeListener?:{dispose:()=>void}
  destroy=vi.fn(()=>this.disposeListener?.dispose())
  text:unknown;model:unknown;editors:unknown
  constructor(text:unknown,model:MockModel,editors:unknown){
    this.text=text;this.model=model;this.editors=editors;mocks.bindings.push(this)
    // y-monaco destroys its own binding when Monaco disposes the model.
    this.disposeListener=model.onWillDispose(()=>this.destroy())
  }
}}))
vi.mock('@monaco-editor/react',async()=>{
  const React=await import('react')
  function MockMonacoEditor({onMount,options}:{onMount:(editor:(typeof mocks.editors)[number])=>void;options:{readOnly:boolean}}){
    const editor=React.useMemo(()=>{
      const model=createMockModel(`model-${mocks.editors.length}`)
      const value={hasTextFocus:vi.fn(()=>false),onDidFocusEditorText:vi.fn(()=>({dispose:vi.fn()})),onDidBlurEditorText:vi.fn(()=>({dispose:vi.fn()})),onDidChangeCursorSelection:vi.fn(()=>({dispose:vi.fn()})),onDidDispose:vi.fn(()=>({dispose:vi.fn()})),getModel:vi.fn(()=>model),getValue:vi.fn(()=>''),getSelection:vi.fn(),deltaDecorations:vi.fn(()=>[])}
      mocks.editors.push(value)
      return value
    },[])
    React.useEffect(()=>{onMount(editor)},[editor,onMount])
    React.useEffect(()=>()=>editor.getModel().dispose(),[editor])
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

describe('both viewers after Explain Mode',()=>{
  for(const viewerSlot of ['A','B'] as const){
    it(`keeps viewer ${viewerSlot} desk names, terminal labels and authority through both Explain layouts`,()=>{
      const viewerId=viewerSlot==='A'?userA:userB
      const partnerId=viewerSlot==='A'?userB:userA
      const partnerSlot=viewerSlot==='A'?'B':'A'
      const partnerName=viewerSlot==='A'?'Grace Hopper':'Ada Lovelace'
      useAuthStore.setState({user:{id:viewerId,email:'viewer@example.com',displayName:'Viewer',avatarUrl:null}})
      useSessionStore.setState({room:{...room,partner:{userId:partnerId,displayName:partnerName,avatarUrl:null}},roomId,currentSlot:viewerSlot,permissions:[],permissionRequests:[],annotations:[],editorA:{...useSessionStore.getState().editorA,isOutputOpen:true},editorB:{...useSessionStore.getState().editorB,isOutputOpen:true}})
      const view=render(<>{(['A','B'] as const).map(slot=><EditorPanel key={slot} slot={slot} username={slot===viewerSlot?'You':partnerName} partnerName={partnerName} isOwner={slot===viewerSlot} isPartnerOnline language="python"/>)}</>)
      const assertNormal=(partnerWritable:boolean)=>{
        expect(screen.getByText('You')).toBeInTheDocument()
        expect(screen.getByText(partnerName)).toBeInTheDocument()
        expect(screen.getByText('Your Terminal')).toBeInTheDocument()
        expect(screen.getByText(`${partnerName}'s Terminal`)).toBeInTheDocument()
        expect(screen.queryByText(/^owner$/i)).not.toBeInTheDocument()
        const editors=screen.getAllByTestId('monaco')
        expect(editors[viewerSlot==='A'?0:1]).toHaveAttribute('data-readonly','false')
        expect(editors[partnerSlot==='A'?0:1]).toHaveAttribute('data-readonly',String(!partnerWritable))
        expect(useSessionStore.getState().currentSlot).toBe(viewerSlot)
        expect(mocks.providers).toHaveLength(2)
        expect(mocks.providers.map(p=>p.options.name)).toEqual([editorDocumentName(roomId,'A'),editorDocumentName(roomId,'B')])
        for(const provider of mocks.providers)expect(provider.destroy).not.toHaveBeenCalled()
      }
      assertNormal(false)
      const originalDocs=mocks.providers.map(p=>p.options.document)
      for(const primary of ['A','B'] as const){
        act(()=>useSessionStore.setState({isExplainMode:true,explainPrimarySlot:primary}))
        expect(screen.getAllByTestId('monaco')).toHaveLength(1)
        expect(screen.queryByText('Your Terminal')).not.toBeInTheDocument()
        act(()=>useSessionStore.setState({isExplainMode:false}))
        assertNormal(false)
      }
      const grant={sessionId:roomId,editorOwnerId:partnerId,granteeId:viewerId,scope:'session' as const,grantedAt:room.createdAt,revokedAt:null,consumedAt:null}
      act(()=>useSessionStore.setState({permissions:[grant]}))
      assertNormal(true)
      act(()=>useSessionStore.setState({isExplainMode:true,explainPrimarySlot:viewerSlot}))
      act(()=>useSessionStore.setState({isExplainMode:false}))
      assertNormal(true)
      for(const provider of mocks.providers){
        act(()=>provider.options.onStatus?.({status:'reconnecting'}))
        act(()=>provider.options.onStatus?.({status:'connected'}))
      }
      assertNormal(true)
      expect(mocks.providers.map(p=>p.options.document)).toEqual(originalDocs)
      act(()=>useSessionStore.setState({permissions:[]}))
      assertNormal(false)
      view.unmount()
      for(const provider of mocks.providers)expect(provider.destroy).toHaveBeenCalledTimes(1)
      for(const binding of mocks.bindings)expect(binding.destroy).toHaveBeenCalledTimes(1)
    })
  }
})

describe('awareness identity on both desks',()=>{
  for(const viewer of ['A','B'] as const){
    it(`advertises logged-in user ${viewer} on both providers through grants and Explain remounts`,()=>{
      const id=viewer==='A'?userA:userB,remoteId=viewer==='A'?userB:userA
      useAuthStore.setState({user:{id,email:'local@example.com',displayName:'Local User',avatarUrl:null}})
      useSessionStore.setState({room,roomId,currentSlot:viewer,permissions:[],permissionRequests:[],annotations:[]})
      const view=render(<>{(['A','B'] as const).map(slot=><EditorPanel key={slot} slot={slot} username="Desk label" partnerName="Partner profile" isOwner={slot===viewer} isPartnerOnline language="python"/>)}</>)
      const assertIdentity=()=>{
        expect(mocks.providers).toHaveLength(2)
        for(const provider of mocks.providers){
          const calls=provider.awareness.setLocalStateField.mock.calls.filter(([field])=>field==='user')
          expect(calls.length).toBeGreaterThan(0)
          for(const [,identity] of calls)expect(identity).toMatchObject({id,name:'Local User'})
        }
        const identities=mocks.providers.map(p=>p.awareness.setLocalStateField.mock.calls.find(([field])=>field==='user')![1])
        expect(identities[0]).toEqual(identities[1])
      }
      assertIdentity()
      act(()=>useSessionStore.setState({permissions:[{sessionId:roomId,editorOwnerId:remoteId,granteeId:id,scope:'session',grantedAt:room.createdAt,revokedAt:null,consumedAt:null}]}))
      assertIdentity()
      for(const [index,slot] of (['A','B'] as const).entries()){
        act(()=>mocks.providers[index]!.options.onAwarenessChange?.({states:[{clientId:42,user:{id:remoteId,name:'Remote Name'}}]}))
        const rules=[...document.head.querySelectorAll('style')].map(style=>style.textContent).join('\n')
        expect(rules).toContain(`[data-awareness-desk="${slot}"] .yRemoteSelectionHead-42`)
        expect(rules).not.toContain('Remote Name')
        expect(rules).not.toContain('content:')
      }
      act(()=>mocks.providers[0]!.options.onAwarenessChange?.({states:[]}))
      expect([...document.head.querySelectorAll('style')].some(style=>style.textContent?.includes('[data-awareness-desk="A"] .yRemote'))).toBe(false)
      expect([...document.head.querySelectorAll('style')].some(style=>style.textContent?.includes('[data-awareness-desk="B"] .yRemote'))).toBe(true)
      act(()=>useSessionStore.setState({isExplainMode:true,explainPrimarySlot:'A'}))
      expect(mocks.providers[1]!.awareness.setLocalStateField).toHaveBeenCalledWith('selection',null)
      act(()=>useSessionStore.setState({isExplainMode:false,permissions:[]}))
      assertIdentity()
      view.unmount()
      expect([...document.head.querySelectorAll('style')].some(style=>style.textContent?.includes('.yRemoteSelectionHead-42'))).toBe(false)
    })
  }
})
