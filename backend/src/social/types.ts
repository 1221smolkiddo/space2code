export type ThemePreference = 'light' | 'dark' | 'system'

export interface PublicProfile {
  id: string
  displayName: string | null
  avatarUrl: string | null
}

export interface Profile extends PublicProfile {
  preferredTheme: ThemePreference
  editorFontSize: number
  createdAt: string
  updatedAt: string
}

export interface FriendRequest {
  id: string
  sender: PublicProfile
  receiver: PublicProfile
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  createdAt: string
  resolvedAt: string | null
}

export interface Friend extends PublicProfile {
  friendsSince: string
}

export interface FriendLists {
  friends: Friend[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
}
