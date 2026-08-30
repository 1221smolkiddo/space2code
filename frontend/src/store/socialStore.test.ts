import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({friends:vi.fn(),presence:vi.fn(),invites:vi.fn(),recent:vi.fn(),invite:vi.fn(),respondInvite:vi.fn(),resume:vi.fn()}))
vi.mock('../api/social',()=>({socialApi:{friends:mocks.friends,presence:mocks.presence,invites:mocks.invites,recent:mocks.recent,invite:mocks.invite,respondInvite:mocks.respondInvite,sendRequest:vi.fn(),respondRequest:vi.fn(),cancelRequest:vi.fn(),removeFriend:vi.fn()}}))
vi.mock('../api/events',()=>({connectUserEvents:()=>()=>undefined}))
vi.mock('../api/rooms',()=>({roomsApi:{resume:mocks.resume}}))
import { useSocialStore } from './socialStore'

describe('home social integration',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.friends.mockResolvedValue({friends:[{id:'f1',displayName:'Friend',avatarUrl:null,friendsSince:'x'}],incoming:[],outgoing:[]});mocks.presence.mockResolvedValue({presence:{f1:'IN_SESSION'}});mocks.invites.mockResolvedValue({invites:[]});mocks.recent.mockResolvedValue({sessions:[]});useSocialStore.setState({friends:[],incoming:[],outgoing:[],invites:[],recentSessions:[],error:null})})
  it('maps backend friend presence into the existing home UI state',async()=>{await useSocialStore.getState().load();expect(useSocialStore.getState().friends[0]).toMatchObject({id:'f1',status:'in-session'})})
  it('sends real friend session invitations and refreshes data',async()=>{mocks.invite.mockResolvedValue({invite:{id:'i1'}});await useSocialStore.getState().inviteFriend('f1','s1');expect(mocks.invite).toHaveBeenCalledWith('s1','f1');expect(mocks.friends).toHaveBeenCalled()})
  it('uses the resume endpoint for ended sessions',async()=>{mocks.resume.mockResolvedValue({room:{id:'new-session'}});await expect(useSocialStore.getState().resumeSession('old-session')).resolves.toBe('new-session')})
})
