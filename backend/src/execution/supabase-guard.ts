import type { SupabaseClient } from '@supabase/supabase-js'

import { ExecutionError } from './errors.js'
import type { ExecutionGuard, ExecutionGuardLimits, ExecutionLease } from './guard.js'

export class SupabaseExecutionGuard implements ExecutionGuard {
  constructor(
    private readonly client: SupabaseClient,
    private readonly limits: ExecutionGuardLimits,
  ) {}

  async acquire(roomId: string, userId: string, now: Date): Promise<ExecutionLease> {
    const windowStart = new Date(now.getTime() - this.limits.windowMs).toISOString()
    const { data, error } = await this.client.rpc('space2code_begin_execution', {
      p_session_id: roomId,
      p_user_id: userId,
      p_now: now.toISOString(),
      p_window_start: windowStart,
      p_user_limit: this.limits.userLimit,
      p_room_limit: this.limits.roomLimit,
    })
    if (error) {
      if (error.message.includes('EXECUTION_CONCURRENCY_LIMITED')) {
        throw new ExecutionError('EXECUTION_CONCURRENCY_LIMITED', 'Only one execution may run at a time', 1)
      }
      if (error.message.includes('EXECUTION_RATE_LIMITED')) {
        throw new ExecutionError('EXECUTION_RATE_LIMITED', 'Execution rate limit exceeded', Math.max(1, Math.ceil(this.limits.windowMs / 1_000)))
      }
      throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', 'Execution guard is unavailable')
    }
    if (typeof data !== 'string') {
      throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', 'Execution guard returned an invalid lease')
    }

    let released = false
    return {
      id: data,
      release: async (outcome) => {
        if (released) return
        released = true
        const { error: finishError } = await this.client.rpc('space2code_finish_execution', {
          p_execution_id: data,
          p_outcome: outcome,
        })
        if (finishError) {
          throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', 'Could not finalize the execution lease')
        }
      },
    }
  }
}
