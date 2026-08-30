import type {
  EditorPermission, PermissionRequest, PermissionScope, PermissionSnapshot, RecentSession, Room, SessionTimer, Slot,
} from './types.js'

export interface CreateRoomInput {
  roomCode: string
  language: string
  userId: string
  expiresAt: string
}

export interface RoomRepository {
  create(input: CreateRoomInput): Promise<Room>
  join(roomCode: string, userId: string): Promise<Room>
  findForUser(roomId: string, userId: string): Promise<Room | null>
  leave(roomId: string, userId: string): Promise<Room>
  recent(userId: string): Promise<RecentSession[]>
  resume(sourceRoomId: string, input: CreateRoomInput): Promise<Room>
  updateQuestion(roomId: string, userId: string, question: string | null, now: string): Promise<Room>
  startTimer(
    roomId: string,
    userId: string,
    durationSeconds: number,
    startedAt: string,
    endsAt: string,
  ): Promise<SessionTimer>
  touchActivity(roomId: string, now: string): Promise<void>
  setPresence(roomId: string, userId: string, connected: boolean): Promise<void>
  getParticipantSlot(roomId: string, userId: string): Promise<Slot | null>

  requestPermission(roomId: string, requesterId: string, editorOwnerId: string): Promise<PermissionRequest>
  permissionState(roomId: string, userId: string): Promise<PermissionSnapshot>
  denyPermission(roomId: string, requestId: string, ownerId: string): Promise<PermissionRequest>
  grantPermission(
    roomId: string,
    requestId: string,
    ownerId: string,
    scope: PermissionScope,
  ): Promise<EditorPermission>
  revokePermission(roomId: string, ownerId: string, granteeId: string): Promise<void>
  hasWritePermission(roomId: string, ownerId: string, granteeId: string): Promise<boolean>
  consumeOncePermission(roomId: string, ownerId: string, granteeId: string): Promise<boolean>
}
