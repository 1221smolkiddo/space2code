import type { FriendLists, FriendRequest, Profile, PublicProfile, ThemePreference } from './types.js'

export interface ProfileUpdate {
  displayName?: string | null
  avatarUrl?: string | null
  preferredTheme?: ThemePreference
  editorFontSize?: number
}

export interface SocialRepository {
  getOwnProfile(userId: string): Promise<Profile>
  updateOwnProfile(userId: string, update: ProfileUpdate, now: string): Promise<Profile>
  getPublicProfile(userId: string): Promise<PublicProfile | null>
  getPublicProfiles(userIds: string[]): Promise<PublicProfile[]>
  sendFriendRequest(senderId: string, receiverId: string, now: string): Promise<FriendRequest>
  respondToFriendRequest(requestId: string, receiverId: string, accept: boolean, now: string): Promise<FriendRequest>
  cancelFriendRequest(requestId: string, senderId: string, now: string): Promise<void>
  removeFriend(userId: string, friendId: string): Promise<void>
  list(userId: string): Promise<FriendLists>
  areFriends(userA: string, userB: string): Promise<boolean>
}
