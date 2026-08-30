import { ExecutionError } from './errors.js'
import { sanitizeExecutionText } from './sanitize.js'
import type {
  ExecutionProvider, ProviderExecutionRequest, ProviderExecutionResult, ProviderStageResult,
} from './types.js'

type JsonRecord = Record<string, unknown>

export interface PistonProviderOptions {
  executeUrl: string
  authorization?: string
}

export class PistonExecutionProvider implements ExecutionProvider {
  constructor(private readonly options: PistonProviderOptions) {}

  async execute(request: ProviderExecutionRequest): Promise<ProviderExecutionResult> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.options.authorization) headers.authorization = this.options.authorization

    const response = await fetch(this.options.executeUrl, {
      method: 'POST',
      headers,
      signal: request.signal,
      body: JSON.stringify({
        language: request.language,
        version: request.version,
        files: [{ name: request.filename, content: request.source, encoding: 'utf8' }],
        stdin: request.stdin,
        args: [],
        compile_timeout: request.timeoutMs,
        run_timeout: request.timeoutMs,
        compile_cpu_time: request.timeoutMs,
        run_cpu_time: request.timeoutMs,
      }),
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', 'Execution provider returned an invalid response')
    }
    if (!response.ok) {
      throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', safeMessage(record(payload).message))
    }

    const result = record(payload)
    return {
      language: text(result.language, request.language),
      version: text(result.version, request.version),
      compile: result.compile ? stage(result.compile) : null,
      run: result.run ? stage(result.run) : null,
    }
  }
}

function stage(value: unknown): ProviderStageResult {
  const row = record(value)
  return {
    stdout: text(row.stdout), stderr: text(row.stderr), code: numberOrNull(row.code),
    signal: nullableText(row.signal), status: nullableText(row.status), message: nullableText(row.message),
    cpuTimeMs: numberOrNull(row.cpu_time), wallTimeMs: numberOrNull(row.wall_time),
    memoryBytes: numberOrNull(row.memory),
  }
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', 'Execution provider returned an invalid response')
  }
  return value as JsonRecord
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function safeMessage(value: unknown): string {
  const message = typeof value === 'string' ? value : 'Execution provider rejected the request'
  return sanitizeExecutionText(message).slice(0, 500)
}
