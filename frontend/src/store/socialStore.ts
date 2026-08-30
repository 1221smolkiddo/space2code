import { create } from 'zustand'
import { socialApi } from '../api/social'
import { connectUserEvents } from '../api/events'
import { roomsApi } from '../api/rooms'
import { ApiError } from '../api/client'
import type { Friend, FriendRequest, RecentSession, SessionInvite } from '../types'

type Presence = 'ONLINE' | 'IN_SESSION' | 'OFFLINE'
interface SocialState {
  friends: Friend[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
  invites: SessionInvite[]
  recentSessions: RecentSession[]
  isLoading: boolean
  isEventsConnected: boolean
  error: string | null
  load: () => Promise<void>
  startEvents: () => () => void
  sendFriendRequest: (userId: string) => Promise<void>
  respondFriendRequest: (id: string, action: 'accept' | 'decline') => Promise<void>
  cancelFriendRequest: (id: string) => Promise<void>
  removeFriend: (userId: string) => Promise<void>
  inviteFriend: (friendId: string, sessionId: string) => Promise<void>
  respondInvite: (id: string, action: 'accept' | 'decline') => Promise<string | null>
  resumeSession: (id: string) => Promise<string>
  clearError: () => void
}

const errorMessage = (error: unknown) => error instanceof ApiError || error instanceof Error
  ? error.message : 'Could not refresh your shared desk.'
const withPresence = (friend: Friend, presence: Record<string, Presence>): Friend => ({
  ...friend,
  status: presence[friend.id] === 'ONLINE' ? 'online'
    : presence[friend.id] === 'IN_SESSION' ? 'in-session' : 'offline',
})

export const useSocialStore = create<SocialState>((set, get) => ({
  friends: [], incoming: [], outgoing: [], invites: [], recentSessions: [],
  isLoading: false, isEventsConnected: false, error: null,
  load: async () => {
    set({ isLoading: true, error: null })
    try {
      const [lists, presence, invites, recent] = await Promise.all([
        socialApi.friends(), socialApi.presence(), socialApi.invites(), socialApi.recent(),
      ])
      set({
        friends: lists.friends.map((friend) => withPresence(friend, presence.presence)),
        incoming: lists.incoming, outgoing: lists.outgoing, invites: invites.invites,
        recentSessions: recent.sessions, isLoading: false,
      })
    } catch (error) { set({ isLoading: false, error: errorMessage(error) }) }
  },
  startEvents: () => connectUserEvents(
    () => { void get().load() },
    (connected) => set({ isEventsConnected: connected }),
  ),
  sendFriendRequest: async (userId) => {
    try { await socialApi.sendRequest(userId.trim()); await get().load() }
    catch (error) { set({ error: errorMessage(error) }); throw error }
  },
  respondFriendRequest: async (id, action) => {
    try { await socialApi.respondRequest(id, action); await get().load() }
    catch (error) { set({ error: errorMessage(error) }); throw error }
  },
  cancelFriendRequest: async (id) => {
    try { await socialApi.cancelRequest(id); await get().load() }
    catch (error) { set({ error: errorMessage(error) }); throw error }
  },
  removeFriend: async (userId) => {
    try { await socialApi.removeFriend(userId); await get().load() }
    catch (error) { set({ error: errorMessage(error) }); throw error }
  },
  inviteFriend: async (friendId, sessionId) => {
    try { await socialApi.invite(sessionId, friendId); await get().load() }
    catch (error) { set({ error: errorMessage(error) }); throw error }
  },
  respondInvite: async (id, action) => {
    try {
      const result = await socialApi.respondInvite(id, action)
      await get().load()
      const room = result.room as { id?: string } | undefined
      return room?.id ?? null
    } catch (error) { set({ error: errorMessage(error) }); throw error }
  },
  resumeSession: async (id) => {
    try { return (await roomsApi.resume(id)).room.id }
    catch (error) { set({ error: errorMessage(error) }); throw error }
  },
  clearError: () => set({ error: null }),
}))
