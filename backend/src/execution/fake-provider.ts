import type { ExecutionProvider, ProviderExecutionRequest, ProviderExecutionResult } from './types.js'

export class FakeExecutionProvider implements ExecutionProvider {
  readonly requests: ProviderExecutionRequest[] = []
  result: ProviderExecutionResult
  error: Error | null = null
  waitFor: Promise<void> | null = null

  constructor(result: ProviderExecutionResult = successfulProviderResult()) {
    this.result = result
  }

  async execute(request: ProviderExecutionRequest): Promise<ProviderExecutionResult> {
    this.requests.push(request)
    if (this.waitFor) await this.waitFor
    if (this.error) throw this.error
    return structuredClone(this.result)
  }
}

export function successfulProviderResult(stdout = 'ok\n'): ProviderExecutionResult {
  return {
    language: 'python',
    version: '3.12.0',
    compile: null,
    run: {
      stdout, stderr: '', code: 0, signal: null, status: null, message: null,
      cpuTimeMs: 4, wallTimeMs: 6, memoryBytes: 1_024,
    },
  }
}
