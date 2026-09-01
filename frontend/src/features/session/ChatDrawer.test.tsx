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
