import { randomUUID } from 'node:crypto'

export type UserEvent =
  | { type: 'friend.requested'; requestId: string; fromUserId: string }
  | { type: 'friend.changed'; friendUserId: string; action: 'accepted' | 'removed' }
  | { type: 'friend.presence'; userId: string; state: PresenceState }
  | { type: 'session.invited'; inviteId: string; roomId: string; fromUserId: string }
  | { type: 'session.invite_changed'; inviteId: string; status: 'accepted' | 'declined' | 'expired' }

export type PresenceState = 'ONLINE' | 'IN_SESSION' | 'OFFLINE'

export interface UserEventEnvelope {
  id: string
  occurredAt: string
  event: UserEvent
}

export interface UserEventPublisher {
  publish(userId: string, event: UserEvent): Promise<void>
}

export class InMemoryUserEventHub implements UserEventPublisher {
  private readonly events = new Map<string, UserEventEnvelope[]>()
  private readonly subscribers = new Map<string, Set<(event: UserEventEnvelope) => void>>()

  async publish(userId: string, event: UserEvent): Promise<void> {
    const entries = this.events.get(userId) ?? []
    const envelope = { id: randomUUID(), occurredAt: new Date().toISOString(), event }
    entries.push(envelope)
    if (entries.length > 100) entries.splice(0, entries.length - 100)
    this.events.set(userId, entries)
    for (const subscriber of this.subscribers.get(userId) ?? []) subscriber(structuredClone(envelope))
  }

  list(userId: string, afterId?: string): UserEventEnvelope[] {
    const entries = this.events.get(userId) ?? []
    if (!afterId) return structuredClone(entries)
    const index = entries.findIndex((entry) => entry.id === afterId)
    return structuredClone(index >= 0 ? entries.slice(index + 1) : entries)
  }

  subscribe(userId: string, listener: (event: UserEventEnvelope) => void): () => void {
    const listeners = this.subscribers.get(userId) ?? new Set()
    listeners.add(listener)
    this.subscribers.set(userId, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.subscribers.delete(userId)
    }
  }
}
