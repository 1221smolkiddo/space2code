import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room } from '../../types'

vi.mock('react-router-dom',()=>({useParams:()=>({id:'10000000-0000-4000-8000-000000000001'})}))
vi.mock('./SessionHeader',()=>({SessionHeader:()=>null}))
vi.mock('./QuestionSheet',()=>({QuestionSheet:()=>null}))
vi.mock('./ChatDrawer',()=>({ChatDrawer:()=>null}))
vi.mock('./EditorPanel',()=>({EditorPanel:({slot,username,partnerName}:{slot:string;username:string;partnerName:string})=><div data-testid={`editor-${slot}`} data-partner-name={partnerName}>{username}</div>}))

import { useAuthStore } from '../../store/authStore'
import { useSessionStore } from '../../store/sessionStore'
import { SessionPage } from './SessionPage'

const userA='aaaaaa00-0000-4000-8000-000000000001',userB='bbbbbb00-0000-4000-8000-000000000002'
const baseRoom:Room={id:'10000000-0000-4000-8000-000000000001',roomCode:'ABC234',language:'python',status:'live',createdBy:userA,endedBy:null,endedReason:null,createdAt:'2026-08-30T10:00:00Z',lastActiveAt:'2026-08-30T10:00:00Z',startedAt:'2026-08-30T10:00:00Z',endedAt:null,expiresAt:'2026-08-31T10:00:00Z',resumedFromSessionId:null,resumePartnerId:null,questions:{A:null,B:null},timer:{status:'not_started',durationSeconds:null,startedAt:null,endsAt:null,startedBy:null},participants:[{userId:userA,slot:'A',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null},{userId:userB,slot:'B',state:'connected',joinedAt:'2026-08-30T10:00:00Z',lastConnectedAt:null,lastDisconnectedAt:null,leftAt:null}],partner:{userId:userB,displayName:'Grace Hopper',avatarUrl:null}}

beforeEach(()=>{
  useSessionStore.setState({hydrate:vi.fn().mockResolvedValue(undefined),room:baseRoom,language:'python',currentSlot:'A',isPartnerOnline:true,partnerState:'connected',partnerHasLeft:false,isExplainMode:false,isLoading:false,error:null})
  useAuthStore.setState({user:{id:userA,email:'ada@example.com',displayName:'Ada Lovelace',avatarUrl:null}})
})
afterEach(cleanup)

describe('session participant names',()=>{
  it('shows each real display name in the editor headers for user A',()=>{
    render(<SessionPage />)
    expect(screen.getByTestId('editor-A')).toHaveTextContent('You')
    expect(screen.getByTestId('editor-B')).toHaveTextContent('Grace Hopper')
    expect(screen.getByTestId('editor-A')).toHaveAttribute('data-partner-name','Grace Hopper')
  })

  it('shows each real display name in the editor headers for user B',()=>{
    useSessionStore.setState({room:{...baseRoom,partner:{userId:userA,displayName:'Ada Lovelace',avatarUrl:null}},currentSlot:'B'})
    useAuthStore.setState({user:{id:userB,email:'grace@example.com',displayName:'Grace Hopper',avatarUrl:null}})
    render(<SessionPage />)
    expect(screen.getByTestId('editor-A')).toHaveTextContent('Ada Lovelace')
    expect(screen.getByTestId('editor-B')).toHaveTextContent('You')
    expect(screen.getByTestId('editor-B')).toHaveAttribute('data-partner-name','Ada Lovelace')
  })

  it('keeps the safe ID fallback when the partner has no display name',()=>{
    useSessionStore.setState({room:{...baseRoom,partner:{userId:userB,displayName:null,avatarUrl:null}}})
    render(<SessionPage />)
    expect(screen.getByTestId('editor-B')).toHaveTextContent('Coder bbbbbb')
  })

  it('renders exactly one shared terminal in Explain Mode',()=>{
    useSessionStore.setState({isExplainMode:true,sharedTerminal:{...useSessionStore.getState().sharedTerminal,stdout:'shared output'}})
    render(<SessionPage />)
    expect(screen.getAllByText('Shared Terminal')).toHaveLength(1)
    expect(screen.getByText('shared output')).toBeInTheDocument()
  })

  it('distinguishes partner offline state from an explicit leave',()=>{
    useSessionStore.setState({partnerState:'disconnected',isPartnerOnline:false,partnerHasLeft:false})
    const {rerender}=render(<SessionPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Grace Hopper is offline')
    act(()=>useSessionStore.setState({partnerHasLeft:true}))
    rerender(<SessionPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Grace Hopper left the session')
  })
})
