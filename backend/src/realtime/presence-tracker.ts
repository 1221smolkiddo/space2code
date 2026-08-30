import type { RoomRepository } from '../rooms/repository.js'
import type { RoomEventPublisher } from '../rooms/service.js'

export class PresenceTracker {
  private readonly counts = new Map<string, number>()
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly repository: RoomRepository,
    private readonly graceMs: number,
    private readonly events: RoomEventPublisher = { publish: async () => undefined },
  ) {}

  async connect(roomId: string, userId: string): Promise<void> {
    const key = this.key(roomId, userId)
    const timer = this.disconnectTimers.get(key)
    if (timer) clearTimeout(timer)
    this.disconnectTimers.delete(key)

    const count = this.counts.get(key) ?? 0
    this.counts.set(key, count + 1)
    if (count === 0) {
      await this.repository.setPresence(roomId, userId, true)
      await this.events.publish(roomId, {
        type: 'participant.connected', occurredAt: new Date().toISOString(), userId,
      })
    }
  }

  disconnect(roomId: string, userId: string): void {
    const key = this.key(roomId, userId)
    const nextCount = Math.max(0, (this.counts.get(key) ?? 1) - 1)
    if (nextCount > 0) {
      this.counts.set(key, nextCount)
      return
    }

    this.counts.delete(key)
    const existing = this.disconnectTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key)
      if (!this.counts.has(key)) {
        void this.repository.setPresence(roomId, userId, false)
          .then(() => this.events.publish(roomId, {
            type: 'participant.disconnected', occurredAt: new Date().toISOString(), userId,
          }))
          .catch(() => undefined)
      }
    }, this.graceMs)
    timer.unref()
    this.disconnectTimers.set(key, timer)
  }

  destroy(): void {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer)
    this.disconnectTimers.clear()
    this.counts.clear()
  }

  private key(roomId: string, userId: string): string {
    return `${roomId}:${userId}`
  }
}
