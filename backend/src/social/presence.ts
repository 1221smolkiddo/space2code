import type { PresenceState, UserEventPublisher } from '../realtime/user-events.js'

export class FriendPresenceService {
  private readonly states = new Map<string, { state: PresenceState; expiresAt: number }>()

  constructor(
    private readonly events: UserEventPublisher,
    private readonly ttlMs = 90_000,
  ) {}

  async set(userId: string, state: Exclude<PresenceState, 'OFFLINE'>, now = new Date()): Promise<void> {
    this.states.set(userId, { state, expiresAt: now.getTime() + this.ttlMs })
    await this.events.publish(userId, { type: 'friend.presence', userId, state })
  }

  async offline(userId: string): Promise<void> {
    this.states.delete(userId)
    await this.events.publish(userId, { type: 'friend.presence', userId, state: 'OFFLINE' })
  }

  get(userId: string, now = new Date()): PresenceState {
    const presence = this.states.get(userId)
    if (!presence || presence.expiresAt <= now.getTime()) {
      this.states.delete(userId)
      return 'OFFLINE'
    }
    return presence.state
  }

  list(userIds: string[], now = new Date()): Record<string, PresenceState> {
    return Object.fromEntries(userIds.map((userId) => [userId, this.get(userId, now)]))
  }
}
