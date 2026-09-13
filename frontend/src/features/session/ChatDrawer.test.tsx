import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room } from '../../types'

import { useAuthStore } from '../../store/authStore'
import { useSessionStore } from '../../store/sessionStore'
import { ChatDrawer } from './ChatDrawer'

const userA='00000000-0000-4000-8000-000000000001',userB='00000000-0000-4000-8000-000000000002'
const room:Room={id:'10000000-0000-4000-8000-000000000001',roomCode:'ABC234',language:'python',status:'live',createdBy:userA,endedBy:null,endedReason:null,createdAt:'2026-08-30T10:00:00Z',lastActiveAt:'2026-08-30T10:00:00Z',startedAt:'2026-08-30T10:00:00Z',endedAt:null,expiresAt:'2026-08-31T10:00:00Z',resumedFromSessionId:null,resumePartnerId:null,questions:{A:null,B:null},timer:{status:'not_started',durationSeconds:null,startedAt:null,endsAt:null,startedBy:null},participants:[{userId:userA,slot:'A',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null},{userId:userB,slot:'B',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null}],partner:{userId:userB,displayName:'Grace Hopper',avatarUrl:null}}

beforeEach(()=>{
  vi.useFakeTimers()
  useAuthStore.setState({user:{id:userA,email:'ada@example.com',displayName:'Ada',avatarUrl:null}})
  useSessionStore.setState({room,isChatOpen:true,isExplainMode:false,messages:[],partnerIsTyping:false,setTyping:vi.fn().mockResolvedValue(undefined),sendMessage:vi.fn().mockResolvedValue(undefined)})
})
afterEach(()=>{cleanup();vi.useRealTimers()})

describe('ChatDrawer typing presence',()=>{
  it('shows only the partner name and clears when the realtime state stops',()=>{
    render(<ChatDrawer />)
    act(()=>useSessionStore.setState({partnerIsTyping:true}))
    expect(screen.getByRole('status')).toHaveTextContent('Grace Hopper is typing…')
    expect(screen.queryByText(/You is typing/)).not.toBeInTheDocument()
    act(()=>useSessionStore.setState({partnerIsTyping:false}))
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument()
  })

  it('throttles typing starts and clears after inactivity and send',()=>{
    render(<ChatDrawer />)
    const input=screen.getByPlaceholderText('Message partner...')
    fireEvent.change(input,{target:{value:'h'}})
    fireEvent.change(input,{target:{value:'he'}})
    expect(useSessionStore.getState().setTyping).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().setTyping).toHaveBeenCalledWith(true)
    act(()=>vi.advanceTimersByTime(1201))
    expect(useSessionStore.getState().setTyping).toHaveBeenLastCalledWith(false)

    fireEvent.change(input,{target:{value:'hello'}})
    fireEvent.submit(input.closest('form')!)
    expect(useSessionStore.getState().setTyping).toHaveBeenLastCalledWith(false)
    expect(useSessionStore.getState().sendMessage).toHaveBeenCalledWith('hello')
  })
})

describe('ChatDrawer message scrolling',()=>{
  const message=(id:string,senderId=userB)=>({id,senderId,senderName:senderId===userA?'You':'Grace Hopper',text:`message ${id}`,timestamp:'10:00'})
  const stream=()=>screen.getByRole('log')
  const measure=(element:HTMLElement)=>{
    Object.defineProperty(element,'scrollHeight',{configurable:true,get:()=>element.children.length*100})
    element.scrollTop=5
  }

  beforeEach(()=>useSessionStore.setState({messages:[message('initial')]}))

  for(const explain of [false,true]){
    it(`scrolls incoming and rapid messages in ${explain?'Explain':'normal'} mode`,()=>{
      useSessionStore.setState({roomId:room.id,isExplainMode:explain,normalMessages:[message('initial')],explainMessages:[message('initial')]})
      render(<ChatDrawer />)
      const container=stream();measure(container)
      const receive=(id:string)=>useSessionStore.getState().handleRoomEvent({version:1,roomId:room.id,event:{type:explain?'explain.message':'chat.message',occurredAt:id,message:{id,sessionId:room.id,senderId:userB,content:id,createdAt:room.createdAt}}})
      act(()=>receive(`${explain}-incoming`))
      expect(container.scrollTop).toBe(container.scrollHeight)
      container.scrollTop=5
      act(()=>{receive(`${explain}-rapid-1`);receive(`${explain}-rapid-2`)})
      expect(container.scrollTop).toBe(container.scrollHeight)
      expect(container.lastElementChild).toHaveTextContent(`${explain}-rapid-2`)
    })
  }

  it('scrolls after an own message is sent and added to the store',()=>{
    useSessionStore.setState({sendMessage:vi.fn(async()=>{useSessionStore.setState({messages:[message('initial'),message('own',userA)]})})})
    render(<ChatDrawer />)
    const container=stream();measure(container)
    const input=screen.getByPlaceholderText('Message partner...')
    fireEvent.change(input,{target:{value:'hello'}})
    fireEvent.submit(input.closest('form')!)
    expect(container.scrollTop).toBe(container.scrollHeight)
    expect(container.lastElementChild).toHaveTextContent('message own')
  })

  it('preserves manual position on typing and unrelated store updates',()=>{
    render(<ChatDrawer />)
    const container=stream();measure(container)
    act(()=>useSessionStore.setState({partnerIsTyping:true}))
    fireEvent.change(screen.getByPlaceholderText('Message partner...'),{target:{value:'typing'}})
    act(()=>useSessionStore.setState({partnerIsTyping:false,connectionState:'connected'}))
    expect(container.scrollTop).toBe(5)
  })

  it('scrolls restored history on layout changes, reopening, and remount',()=>{
    const height=vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(1200)
    try{
      const view=render(<ChatDrawer />)
      expect(stream().scrollTop).toBe(1200)
      stream().scrollTop=5
      act(()=>useSessionStore.setState({isExplainMode:true}))
      expect(stream().scrollTop).toBe(1200)
      act(()=>useSessionStore.setState({isChatOpen:false}))
      act(()=>useSessionStore.setState({isChatOpen:true,isExplainMode:false}))
      expect(stream().scrollTop).toBe(1200)
      view.unmount()
      render(<ChatDrawer />)
      expect(stream().scrollTop).toBe(1200)
    }finally{height.mockRestore()}
  })
})


describe('ChatDrawer resizing',()=>{
  it('keeps the bottom visible during layout changes and preserves a reader in history',()=>{
    let resized=()=>{}
    const disconnect=vi.fn()
    vi.stubGlobal('ResizeObserver',class {
      constructor(callback:()=>void){resized=callback}
      observe(){}
      disconnect=disconnect
    })
    try{
      const view=render(<ChatDrawer />)
      const container=screen.getByRole('log')
      let height=400,scrollHeight=1000
      Object.defineProperties(container,{clientHeight:{get:()=>height},scrollHeight:{get:()=>scrollHeight}})
      act(()=>useSessionStore.setState({messages:[{id:'resize',senderId:userB,senderName:'Grace',text:'long message',timestamp:'10:00'}]}))
      container.scrollTop=600
      height=350;scrollHeight=1200
      act(()=>resized())
      expect(container.scrollTop).toBe(1200)
      container.scrollTop=100
      height=300
      act(()=>resized())
      expect(container.scrollTop).toBe(100)
      view.unmount()
      expect(disconnect).toHaveBeenCalled()
    }finally{vi.unstubAllGlobals()}
  })
})
