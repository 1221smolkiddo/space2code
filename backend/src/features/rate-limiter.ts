import { FeatureError } from './errors.js'

export interface ActionRateLimiter {
  check(key: string, limit: number, windowMs: number, now: Date): void
}

export class InMemoryActionRateLimiter implements ActionRateLimiter {
  private readonly attempts = new Map<string, { timestamps: number[]; windowMs: number }>()
  private sweepCounter = 0

  get entryCount(): number { return this.attempts.size }

  check(key: string, limit: number, windowMs: number, now: Date): void {
    const cutoff = now.getTime() - windowMs
    const active = (this.attempts.get(key)?.timestamps ?? []).filter((attempt) => attempt > cutoff)
    if (active.length >= limit) {
      const retryAfterMs = Math.max(1, (active[0] ?? now.getTime()) + windowMs - now.getTime())
      throw new FeatureError('RATE_LIMITED', 'Action rate limit exceeded', Math.max(1, Math.ceil(retryAfterMs / 1_000)))
    }
    active.push(now.getTime())
    this.attempts.set(key, { timestamps: active, windowMs })

    // Periodic sweep: every 100 checks, remove keys with no active entries
    this.sweepCounter += 1
    if (this.sweepCounter >= 100) {
      this.sweepCounter = 0
      for (const [sweepKey, entry] of this.attempts) {
        const last = entry.timestamps.at(-1)
        if (last === undefined || last <= now.getTime() - entry.windowMs) {
          this.attempts.delete(sweepKey)
        }
      }
    }
  }
}
