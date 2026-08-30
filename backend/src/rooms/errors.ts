export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_ENDED'
  | 'NOT_A_PARTICIPANT'
  | 'INVALID_ROOM_STATE'
  | 'INVALID_PERMISSION_REQUEST'
  | 'PERMISSION_REQUEST_NOT_FOUND'
  | 'FORBIDDEN'
  | 'TIMER_ALREADY_STARTED'
  | 'INVALID_TIMER_DURATION'
  | 'SESSION_NOT_REOPENABLE'

export class RoomError extends Error {
  constructor(
    public readonly code: RoomErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RoomError'
  }
}
