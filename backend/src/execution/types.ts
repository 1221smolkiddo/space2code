export type ExecutionStatus =
  | 'completed'
  | 'compile_error'
  | 'runtime_error'
  | 'timed_out'
  | 'output_limited'
  | 'provider_error'

export interface RuntimeInformation {
  language: string
  version: string
  cpuTimeMs: number | null
  wallTimeMs: number | null
  memoryBytes: number | null
}

export interface ExecutionResult {
  executionId: string
  status: ExecutionStatus
  stdout: string
  stderr: string
  compileOutput: string
  exitCode: number | null
  signal: string | null
  runtime: RuntimeInformation
  outputTruncated: boolean
}

export interface ProviderExecutionRequest {
  language: string
  version: string
  filename: string
  source: string
  stdin: string
  timeoutMs: number
  signal: AbortSignal
}

export interface ProviderStageResult {
  stdout: string
  stderr: string
  code: number | null
  signal: string | null
  status: string | null
  message: string | null
  cpuTimeMs: number | null
  wallTimeMs: number | null
  memoryBytes: number | null
}

export interface ProviderExecutionResult {
  language: string
  version: string
  compile: ProviderStageResult | null
  run: ProviderStageResult | null
}

export interface ExecutionProvider {
  execute(request: ProviderExecutionRequest): Promise<ProviderExecutionResult>
}
