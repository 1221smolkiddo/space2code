import { randomUUID } from 'node:crypto'

import { ExecutionError } from './errors.js'

export interface ExecutionLease {
  id: string
  release(outcome: 'completed' | 'failed'): Promise<void>
}

export interface ExecutionGuard {
  acquire(roomId: string, userId: string, now: Date): Promise<ExecutionLease>
}

export interface ExecutionGuardLimits {
  windowMs: number
  userLimit: number
  roomLimit: number
}

export class InMemoryExecutionGuard implements ExecutionGuard {
  private readonly attempts: { roomId: string; userId: string; at: number }[] = []
  private readonly runningUsers = new Set<string>()

  constructor(private readonly limits: ExecutionGuardLimits) {}

  async acquire(roomId: string, userId: string, now: Date): Promise<ExecutionLease> {
    const cutoff = now.getTime() - this.limits.windowMs
    while (this.attempts[0] && this.attempts[0].at <= cutoff) this.attempts.shift()
    if (this.runningUsers.has(userId)) {
      throw new ExecutionError('EXECUTION_CONCURRENCY_LIMITED', 'Only one execution may run at a time', 1)
    }
    if (this.attempts.filter((attempt) => attempt.userId === userId).length >= this.limits.userLimit ||
      this.attempts.filter((attempt) => attempt.roomId === roomId).length >= this.limits.roomLimit) {
      const relevant = this.attempts.filter((attempt) => attempt.userId === userId || attempt.roomId === roomId)
      const retryAfterMs = Math.max(1, (relevant[0]?.at ?? now.getTime()) + this.limits.windowMs - now.getTime())
      throw new ExecutionError('EXECUTION_RATE_LIMITED', 'Execution rate limit exceeded', Math.max(1, Math.ceil(retryAfterMs / 1_000)))
    }

    this.attempts.push({ roomId, userId, at: now.getTime() })
    this.runningUsers.add(userId)
    const id = randomUUID()
    let released = false
    return {
      id,
      release: async () => {
        if (released) return
        released = true
        this.runningUsers.delete(userId)
      },
    }
  }
}
