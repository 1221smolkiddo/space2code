export type ExecutionErrorCode =
  | 'UNSUPPORTED_LANGUAGE'
  | 'ROOM_LANGUAGE_MISMATCH'
  | 'SOURCE_TOO_LARGE'
  | 'STDIN_TOO_LARGE'
  | 'EXECUTION_RATE_LIMITED'
  | 'EXECUTION_CONCURRENCY_LIMITED'
  | 'EXECUTION_PROVIDER_UNAVAILABLE'
  | 'EXECUTION_TIMED_OUT'

export class ExecutionError extends Error {
  constructor(
    public readonly code: ExecutionErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ExecutionError'
  }
}
