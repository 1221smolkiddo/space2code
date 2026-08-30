export type FeatureErrorCode =
  | 'PROFILE_NOT_FOUND'
  | 'CANNOT_FRIEND_SELF'
  | 'FRIEND_REQUEST_DUPLICATE'
  | 'ALREADY_FRIENDS'
  | 'FRIEND_REQUEST_NOT_FOUND'
  | 'FRIENDSHIP_NOT_FOUND'
  | 'INVITE_NOT_FOUND'
  | 'INVITE_STALE'
  | 'INVITE_DUPLICATE'
  | 'CHAT_LIMIT_EXCEEDED'
  | 'EXPLAIN_LIMIT_EXCEEDED'
  | 'EXPLAIN_STATE_CONFLICT'
  | 'EXPORT_LIMIT_EXCEEDED'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'

export class FeatureError extends Error {
  constructor(
    public readonly code: FeatureErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'FeatureError'
  }
}
