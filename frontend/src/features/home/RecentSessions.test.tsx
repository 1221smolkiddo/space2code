import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecentSession } from '../../types'

vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}))
vi.mock('../../api/collaboration',()=>({collaborationApi:{export:vi.fn()}}))
vi.mock('../../components/doodles/DoodleAccents',()=>({PushPinDoodle:()=>null}))

import { useSocialStore } from '../../store/socialStore'
import { RecentSessions } from './RecentSessions'

const session:RecentSession={sessionId:'10000000-0000-4000-8000-000000000001',partnerId:'00000000-0000-4000-8000-000000000002',partner:{userId:'00000000-0000-4000-8000-000000000002',displayName:'Grace Hopper',avatarUrl:null},language:'python',status:'ended',createdAt:'2026-08-30T10:00:00Z',lastActiveAt:'2026-08-30T11:00:00Z',endedAt:'2026-08-30T11:00:00Z',endedBy:null,endedReason:null,expiresAt:'2026-09-03T11:00:00Z',canReconnect:false,canReopen:true,resumedFromSessionId:null}

beforeEach(()=>useSocialStore.setState({recentSessions:[session],isLoading:false,removeRecentSession:vi.fn().mockImplementation(async(id:string)=>useSocialStore.setState({recentSessions:useSocialStore.getState().recentSessions.filter(value=>value.sessionId!==id)}))}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})

describe('RecentSessions removal',()=>{
  it('confirms removal, does not resume the card, and renders the empty state',async()=>{
    vi.spyOn(window,'confirm').mockReturnValue(true)
    render(<RecentSessions />)
    fireEvent.click(screen.getByRole('button',{name:/remove session with grace hopper/i}))
    await waitFor(()=>expect(useSocialStore.getState().removeRecentSession).toHaveBeenCalledWith(session.sessionId))
    expect(screen.getByText('No recent sessions yet.')).toBeInTheDocument()
  })

  it('keeps the entry when removal is cancelled',()=>{
    vi.spyOn(window,'confirm').mockReturnValue(false)
    render(<RecentSessions />)
    fireEvent.click(screen.getByRole('button',{name:/remove session with grace hopper/i}))
    expect(useSocialStore.getState().removeRecentSession).not.toHaveBeenCalled()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
  })
})
