import type { ActionRateLimiter } from '../features/rate-limiter.js'
import { FeatureError } from '../features/errors.js'
import type { UserEventPublisher } from '../realtime/user-events.js'
import type { Clock } from '../rooms/service.js'
import type { FriendPresenceService } from './presence.js'
import type { ProfileUpdate, SocialRepository } from './repository.js'
import type { FriendLists, Profile, PublicProfile } from './types.js'

export class SocialService {
  constructor(private readonly repository: SocialRepository, private readonly presence: FriendPresenceService,
    private readonly events: UserEventPublisher, private readonly limiter: ActionRateLimiter,
    private readonly clock: Clock = { now: () => new Date() }) {}

  getOwn(userId: string): Promise<Profile> { return this.repository.getOwnProfile(userId) }
  updateOwn(userId: string, update: ProfileUpdate): Promise<Profile> { return this.repository.updateOwnProfile(userId, update, this.clock.now().toISOString()) }
  async getPublic(requesterId: string, userId: string): Promise<PublicProfile | null> {
    if (requesterId !== userId && !await this.repository.areFriends(requesterId, userId)) {
      throw new FeatureError('FORBIDDEN', 'Public profiles are available only for self or friends')
    }
    return this.repository.getPublicProfile(userId)
  }
  list(userId: string): Promise<FriendLists> { return this.repository.list(userId) }
  async sendRequest(senderId: string, receiverId: string) {
    this.limiter.check(`friend:${senderId}`, 10, 60_000, this.clock.now())
    const request = await this.repository.sendFriendRequest(senderId, receiverId, this.clock.now().toISOString())
    await this.events.publish(receiverId, { type: 'friend.requested', requestId: request.id, fromUserId: senderId })
    if (request.status === 'accepted') await this.friendshipChanged(senderId, receiverId, 'accepted')
    return request
  }
  async respond(requestId: string, receiverId: string, response: 'accepted' | 'declined') {
    const request = await this.repository.respondToFriendRequest(requestId, receiverId, response === 'accepted', this.clock.now().toISOString())
    if (response === 'accepted') await this.friendshipChanged(request.sender.id, request.receiver.id, 'accepted')
    return request
  }
  cancel(requestId: string, senderId: string) { return this.repository.cancelFriendRequest(requestId, senderId, this.clock.now().toISOString()) }
  async remove(userId: string, friendId: string): Promise<void> {
    await this.repository.removeFriend(userId, friendId); await this.friendshipChanged(userId, friendId, 'removed')
  }
  async setPresence(userId: string, state: 'ONLINE' | 'IN_SESSION'): Promise<void> {
    await this.presence.set(userId, state, this.clock.now()); await this.publishPresence(userId, state)
  }
  async setOffline(userId: string): Promise<void> { await this.presence.offline(userId); await this.publishPresence(userId, 'OFFLINE') }
  async friendPresence(userId: string) {
    const lists = await this.repository.list(userId)
    return this.presence.list(lists.friends.map((friend) => friend.id), this.clock.now())
  }
  private async publishPresence(userId: string, state: 'ONLINE' | 'IN_SESSION' | 'OFFLINE') {
    const lists = await this.repository.list(userId)
    await Promise.all(lists.friends.map((friend) => this.events.publish(friend.id, { type: 'friend.presence', userId, state })))
  }
  private async friendshipChanged(a: string, b: string, action: 'accepted' | 'removed') {
    await Promise.all([this.events.publish(a, { type: 'friend.changed', friendUserId: b, action }), this.events.publish(b, { type: 'friend.changed', friendUserId: a, action })])
  }
}
