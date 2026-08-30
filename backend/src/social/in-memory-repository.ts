import { randomUUID } from 'node:crypto'

import { FeatureError } from '../features/errors.js'
import type { ProfileUpdate, SocialRepository } from './repository.js'
import type { FriendLists, FriendRequest, Profile, PublicProfile } from './types.js'

const clone = <T>(value: T): T => structuredClone(value)

export class InMemorySocialRepository implements SocialRepository {
  private readonly profiles = new Map<string, Profile>()
  private readonly requests = new Map<string, { id: string; senderId: string; receiverId: string; status: FriendRequest['status']; createdAt: string; resolvedAt: string | null }>()
  private readonly friendships = new Map<string, { userAId: string; userBId: string; createdAt: string }>()

  seedProfile(userId: string, displayName: string | null = null): Profile {
    const now = new Date().toISOString()
    const profile: Profile = { id: userId, displayName, avatarUrl: null, preferredTheme: 'system', editorFontSize: 14,
      createdAt: now, updatedAt: now }
    this.profiles.set(userId, profile)
    return clone(profile)
  }

  async getOwnProfile(userId: string): Promise<Profile> { return clone(this.ensureProfile(userId)) }
  async updateOwnProfile(userId: string, update: ProfileUpdate, now: string): Promise<Profile> {
    const profile = this.ensureProfile(userId)
    Object.assign(profile, update, { updatedAt: now })
    return clone(profile)
  }
  async getPublicProfile(userId: string): Promise<PublicProfile | null> {
    const profile = this.profiles.get(userId)
    return profile ? this.public(profile) : null
  }
  async getPublicProfiles(userIds: string[]): Promise<PublicProfile[]> {
    return userIds.map((id) => this.profiles.get(id)).filter((value): value is Profile => Boolean(value)).map((p) => this.public(p))
  }

  async sendFriendRequest(senderId: string, receiverId: string, now: string): Promise<FriendRequest> {
    if (senderId === receiverId) throw new FeatureError('CANNOT_FRIEND_SELF', 'Cannot send a friend request to yourself')
    this.ensureProfile(senderId); this.ensureProfile(receiverId)
    const key = this.friendKey(senderId, receiverId)
    if (this.friendships.has(key)) throw new FeatureError('ALREADY_FRIENDS', 'Users are already friends')
    const pending = [...this.requests.values()].find((r) => r.status === 'pending' && this.friendKey(r.senderId, r.receiverId) === key)
    if (pending) {
      if (pending.senderId === senderId) throw new FeatureError('FRIEND_REQUEST_DUPLICATE', 'A pending request already exists')
      pending.status = 'accepted'; pending.resolvedAt = now
      this.friendships.set(key, { userAId: [senderId, receiverId].sort()[0]!, userBId: [senderId, receiverId].sort()[1]!, createdAt: now })
      return this.requestView(pending)
    }
    const request = { id: randomUUID(), senderId, receiverId, status: 'pending' as const, createdAt: now, resolvedAt: null }
    this.requests.set(request.id, request)
    return this.requestView(request)
  }

  async respondToFriendRequest(requestId: string, receiverId: string, accept: boolean, now: string): Promise<FriendRequest> {
    const request = this.requests.get(requestId)
    if (!request) throw new FeatureError('FRIEND_REQUEST_NOT_FOUND', 'Friend request not found')
    if (request.receiverId !== receiverId || request.status !== 'pending') throw new FeatureError('FORBIDDEN', 'Only the intended receiver can resolve this request')
    request.status = accept ? 'accepted' : 'declined'; request.resolvedAt = now
    if (accept) {
      const ids = [request.senderId, request.receiverId].sort()
      this.friendships.set(this.friendKey(...ids as [string, string]), { userAId: ids[0]!, userBId: ids[1]!, createdAt: now })
    }
    return this.requestView(request)
  }

  async cancelFriendRequest(requestId: string, senderId: string, now: string): Promise<void> {
    const request = this.requests.get(requestId)
    if (!request) throw new FeatureError('FRIEND_REQUEST_NOT_FOUND', 'Friend request not found')
    if (request.senderId !== senderId || request.status !== 'pending') throw new FeatureError('FORBIDDEN', 'Only the sender can cancel this request')
    request.status = 'cancelled'; request.resolvedAt = now
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    if (!this.friendships.delete(this.friendKey(userId, friendId))) throw new FeatureError('FRIENDSHIP_NOT_FOUND', 'Friendship not found')
  }
  async list(userId: string): Promise<FriendLists> {
    const friendIds = [...this.friendships.values()].flatMap((f) => f.userAId === userId ? [f.userBId] : f.userBId === userId ? [f.userAId] : [])
    const incoming = [...this.requests.values()].filter((r) => r.receiverId === userId && r.status === 'pending')
    const outgoing = [...this.requests.values()].filter((r) => r.senderId === userId && r.status === 'pending')
    const profiles = await this.getPublicProfiles(friendIds)
    return {
      friends: profiles.map((profile) => ({ ...profile, friendsSince: this.friendships.get(this.friendKey(userId, profile.id))!.createdAt })),
      incoming: incoming.map((request) => this.requestView(request)),
      outgoing: outgoing.map((request) => this.requestView(request)),
    }
  }
  async areFriends(userId: string, otherId: string): Promise<boolean> { return this.friendships.has(this.friendKey(userId, otherId)) }

  private ensureProfile(userId: string): Profile { return this.profiles.get(userId) ?? this.seedProfile(userId) }
  private friendKey(a: string, b: string): string { return [a, b].sort().join(':') }
  private public(profile: Profile): PublicProfile { return { id: profile.id, displayName: profile.displayName, avatarUrl: profile.avatarUrl } }
  private requestView(request: { id: string; senderId: string; receiverId: string; status: FriendRequest['status']; createdAt: string; resolvedAt: string | null }): FriendRequest {
    return { id: request.id, sender: this.public(this.ensureProfile(request.senderId)), receiver: this.public(this.ensureProfile(request.receiverId)), status: request.status, createdAt: request.createdAt, resolvedAt: request.resolvedAt }
  }
}
