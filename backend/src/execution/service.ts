import { ExecutionError } from './errors.js'
import type { ExecutionGuard } from './guard.js'
import type { LanguageRegistry } from './language-registry.js'
import type { ExecutionProvider, ExecutionResult, ExecutionStatus, ProviderStageResult } from './types.js'
import { sanitizeExecutionText } from './sanitize.js'
import { RoomError } from '../rooms/errors.js'
import type { Clock, RoomEventPublisher } from '../rooms/service.js'
import type { RoomRepository } from '../rooms/repository.js'

export interface ExecutionLimits {
  maxSourceBytes: number
  maxStdinBytes: number
  maxOutputBytes: number
  timeoutMs: number
}

export interface ExecuteInput {
  roomId: string
  userId: string
  language: string
  source: string
  stdin: string
  scope?: 'personal' | 'explain'
  targetSlot?: 'A' | 'B' | undefined
}

const systemClock: Clock = { now: () => new Date() }
const noEvents: RoomEventPublisher = { publish: async () => undefined }

export class ExecutionService {
  constructor(
    private readonly repository: RoomRepository,
    private readonly provider: ExecutionProvider,
    private readonly registry: LanguageRegistry,
    private readonly guard: ExecutionGuard,
    private readonly limits: ExecutionLimits,
    private readonly clock: Clock = systemClock,
    private readonly events: RoomEventPublisher = noEvents,
  ) {}

  async execute(input: ExecuteInput): Promise<ExecutionResult> {
    const scope = input.scope ?? 'personal'
    const room = await this.repository.findForUser(input.roomId, input.userId)
    if (!room) throw new RoomError('NOT_A_PARTICIPANT', 'Session membership is required for execution')
    if (room.status !== 'live') throw new RoomError('INVALID_ROOM_STATE', 'Execution requires a live session')

    const targetSlot=input.targetSlot??room.participants.find(p=>p.userId===input.userId)?.slot
    if(!targetSlot||!room.participants.some(p=>p.slot===targetSlot))throw new RoomError('FORBIDDEN','Execution desk is not occupied')
    const requestedLanguage = this.registry.resolve(input.language)
    const roomLanguage = this.registry.resolve(room.language)
    if (requestedLanguage.id !== roomLanguage.id) {
      throw new ExecutionError('ROOM_LANGUAGE_MISMATCH', 'Execution language must match the room language')
    }
    if (Buffer.byteLength(input.source, 'utf8') > this.limits.maxSourceBytes) {
      throw new ExecutionError('SOURCE_TOO_LARGE', 'Source code exceeds the configured limit')
    }
    if (Buffer.byteLength(input.stdin, 'utf8') > this.limits.maxStdinBytes) {
      throw new ExecutionError('STDIN_TOO_LARGE', 'Standard input exceeds the configured limit')
    }

    const started = this.clock.now()
    const lease = await this.guard.acquire(input.roomId, input.userId, started)
    await this.events.publish(input.roomId, {
      type: 'execution.started', occurredAt: started.toISOString(), executionId: lease.id, userId: input.userId,
      scope, targetSlot,
    })
    await this.repository.touchActivity(input.roomId, started.toISOString())

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.limits.timeoutMs)
    timeout.unref()
    let outcome: 'completed' | 'failed' = 'failed'
    try {
      const providerResult = await this.provider.execute({
        language: roomLanguage.providerLanguage,
        version: roomLanguage.version,
        filename: roomLanguage.filename,
        source: input.source,
        stdin: input.stdin,
        timeoutMs: this.limits.timeoutMs,
        signal: controller.signal,
      })
      const result = normalizeResult(lease.id, providerResult.language, providerResult.version,
        providerResult.compile, providerResult.run, this.limits.maxOutputBytes)
      outcome = 'completed'
      await this.events.publish(input.roomId, {
        type: 'execution.completed', occurredAt: this.clock.now().toISOString(),
        executionId: lease.id, userId: input.userId, status: result.status, scope, targetSlot,
        result,
      })
      return result
    } catch (error) {
      if (controller.signal.aborted) {
        await this.events.publish(input.roomId, {
          type: 'execution.completed', occurredAt: this.clock.now().toISOString(),
          executionId: lease.id, userId: input.userId, status: 'timed_out',
          scope, targetSlot,
        })
        throw new ExecutionError('EXECUTION_TIMED_OUT', 'Execution exceeded the backend timeout')
      }
      const status = error instanceof ExecutionError && error.code === 'EXECUTION_TIMED_OUT'
        ? 'timed_out'
        : 'provider_error'
      await this.events.publish(input.roomId, {
        type: 'execution.completed', occurredAt: this.clock.now().toISOString(),
        executionId: lease.id, userId: input.userId, status,
        scope, targetSlot,
      })
      if (error instanceof ExecutionError) throw error
      throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', 'Execution provider is unavailable')
    } finally {
      clearTimeout(timeout)
      await lease.release(outcome)
    }
  }
}

function normalizeResult(
  executionId: string,
  language: string,
  version: string,
  compile: ProviderStageResult | null,
  run: ProviderStageResult | null,
  outputLimit: number,
): ExecutionResult {
  const compileText = compile ? [compile.stdout, compile.stderr, compile.message].filter(Boolean).join('\n') : ''
  const stderrText = run ? [run.stderr, run.message].filter(Boolean).join('\n') : ''
  const capped = capOutput([run?.stdout ?? '', stderrText, compileText], outputLimit)
  const compileFailed = Boolean(compile && (compile.code !== 0 || compile.signal || compile.status))
  const activeStage = compileFailed || !run ? compile : run
  return {
    executionId,
    status: executionStatus(compile, run, capped.truncated),
    stdout: capped.values[0] ?? '', stderr: capped.values[1] ?? '', compileOutput: capped.values[2] ?? '',
    exitCode: activeStage?.code ?? null, signal: activeStage?.signal ?? null,
    runtime: {
      language, version, cpuTimeMs: activeStage?.cpuTimeMs ?? null,
      wallTimeMs: activeStage?.wallTimeMs ?? null, memoryBytes: activeStage?.memoryBytes ?? null,
    },
    outputTruncated: capped.truncated,
  }
}

function executionStatus(
  compile: ProviderStageResult | null,
  run: ProviderStageResult | null,
  truncated: boolean,
): ExecutionStatus {
  if (truncated || compile?.status === 'OL' || compile?.status === 'EL' || run?.status === 'OL' || run?.status === 'EL') {
    return 'output_limited'
  }
  if (compile?.status === 'TO' || run?.status === 'TO') return 'timed_out'
  if (compile && (compile.code !== 0 || compile.signal || compile.status || !run)) return 'compile_error'
  if (run?.code === 0 && !run.signal && !run.status) return 'completed'
  if (!run) return 'provider_error'
  return 'runtime_error'
}

function capOutput(values: string[], maxBytes: number): { values: string[]; truncated: boolean } {
  let remaining = maxBytes
  let truncated = false
  const capped = values.map((value) => {
    const bytes = Buffer.from(sanitizeExecutionText(value), 'utf8')
    if (bytes.length <= remaining) {
      remaining -= bytes.length
      return bytes.toString('utf8')
    }
    truncated = true
    const output = truncateUtf8(bytes, remaining)
    remaining = 0
    return output
  })
  return { values: capped, truncated }
}

function truncateUtf8(bytes: Buffer, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (let end = Math.min(bytes.length, maxBytes); end >= Math.max(0, maxBytes - 3); end -= 1) {
    try {
      return decoder.decode(bytes.subarray(0, end))
    } catch {
      // A UTF-8 character may straddle the byte boundary; retry before that character.
    }
  }
  return ''
}
