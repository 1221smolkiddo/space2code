import { randomUUID } from 'node:crypto'

import { RoomError } from './errors.js'
import type { CreateRoomInput, RoomRepository } from './repository.js'
import type {
  EditorPermission, Participant, PermissionRequest, PermissionScope, PermissionSnapshot, RecentSession, Room, SessionTimer, Slot,
} from './types.js'

const clone = <T>(value: T): T => structuredClone(value)

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, Room>()
  private readonly permissionRequests = new Map<string, PermissionRequest>()
  private readonly permissions = new Map<string, EditorPermission>()

  async create(input: CreateRoomInput): Promise<Room> {
    if ([...this.rooms.values()].some((room) => room.roomCode === input.roomCode)) {
      throw new RoomError('INVALID_ROOM_STATE', 'Room code already exists')
    }

    const now = new Date().toISOString()
    const room: Room = {
      id: randomUUID(), roomCode: input.roomCode, language: input.language,
      status: 'waiting', createdBy: input.userId, endedBy: null, endedReason: null,
      createdAt: now, lastActiveAt: now, startedAt: null, endedAt: null, expiresAt: input.expiresAt,
      resumedFromSessionId: null, resumePartnerId: null,
      questions: { A: null, B: null }, timer: this.emptyTimer(),
      participants: [this.participant(input.userId, 'A', now)],
    }
    this.rooms.set(room.id, room)
    return clone(room)
  }

  async join(roomCode: string, userId: string): Promise<Room> {
    const room = [...this.rooms.values()].find((candidate) => candidate.roomCode === roomCode)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Room not found')

    const existing = room.participants.find((participant) => participant.userId === userId)
    if (existing) {
      if (room.status === 'ended' || room.status === 'expired') {
        throw new RoomError('ROOM_ENDED', room.endedReason ?? 'Room has ended')
      }
      existing.state = 'joined'
      existing.leftAt = null
      return clone(room)
    }
    if (room.status === 'ended' || room.status === 'expired') {
      throw new RoomError('ROOM_ENDED', room.endedReason ?? 'Room has ended')
    }
    if (room.participants.length >= 2) throw new RoomError('ROOM_FULL', 'Room already has two users')
    if (room.resumePartnerId && room.resumePartnerId !== userId) {
      throw new RoomError('FORBIDDEN', 'This resumed room is reserved for the previous partner')
    }

    const now = new Date().toISOString()
    room.participants.push(this.participant(userId, 'B', now))
    room.status = 'live'
    room.startedAt = now
    room.lastActiveAt = now
    return clone(room)
  }

  async findForUser(roomId: string, userId: string): Promise<Room | null> {
    const room = this.rooms.get(roomId)
    if (!room?.participants.some((participant) => participant.userId === userId)) return null
    return clone(room)
  }

  async leave(roomId: string, userId: string): Promise<Room> {
    const room = this.requireRoom(roomId)
    const participant = this.requireParticipant(room, userId)
    const now = new Date().toISOString()
    participant.state = 'left'
    participant.leftAt = now
    room.status = 'ended'
    room.endedBy = userId
    room.endedReason = 'partner_left'
    room.endedAt = now
    room.lastActiveAt = now
    room.expiresAt = new Date(new Date(now).getTime() + 24 * 60 * 60 * 1_000).toISOString()
    for (const permission of this.permissions.values()) {
      if (permission.sessionId === roomId && !permission.revokedAt) permission.revokedAt = now
    }
    return clone(room)
  }

  async recent(userId: string): Promise<RecentSession[]> {
    const now = Date.now()
    return [...this.rooms.values()]
      .filter((room) => room.expiresAt > new Date(now).toISOString() &&
        room.participants.some((participant) => participant.userId === userId))
      .sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt))
      .map((room) => {
        const partnerId = room.participants.find((participant) => participant.userId !== userId)?.userId ??
          room.resumePartnerId
        return {
        sessionId: room.id,
        partnerId,
        partner: partnerId ? { userId: partnerId, displayName: null, avatarUrl: null } : null,
        language: room.language,
        status: room.status,
        createdAt: room.createdAt,
        lastActiveAt: room.lastActiveAt,
        endedAt: room.endedAt,
        endedBy: room.endedBy,
        endedReason: room.endedReason,
        expiresAt: room.expiresAt,
        canReconnect: room.status === 'live',
        canReopen: room.status === 'ended',
        resumedFromSessionId: room.resumedFromSessionId,
      }})
  }

  async resume(sourceRoomId: string, input: CreateRoomInput): Promise<Room> {
    const source = this.requireRoom(sourceRoomId)
    const sourceParticipant = this.requireParticipant(source, input.userId)
    if (source.status !== 'ended') {
      throw new RoomError('SESSION_NOT_REOPENABLE', 'Only ended sessions can be resumed')
    }
    const room = await this.create(input)
    const stored = this.requireRoom(room.id)
    stored.resumedFromSessionId = sourceRoomId
    stored.resumePartnerId = source.participants.find((participant) => participant.userId !== input.userId)?.userId ?? null
    stored.questions = sourceParticipant.slot === 'A'
      ? clone(source.questions)
      : { A: source.questions.B, B: source.questions.A }
    return clone(stored)
  }

  async updateQuestion(roomId: string, userId: string, question: string | null, now: string): Promise<Room> {
    const room = this.requireRoom(roomId)
    if (room.status !== 'waiting' && room.status !== 'live') {
      throw new RoomError('INVALID_ROOM_STATE', 'Questions can only change in an active room')
    }
    const participant = this.requireParticipant(room, userId)
    room.questions[participant.slot] = question
    room.lastActiveAt = now
    return clone(room)
  }

  async startTimer(
    roomId: string, userId: string, durationSeconds: number, startedAt: string, endsAt: string,
  ): Promise<SessionTimer> {
    const room = this.requireLiveRoom(roomId)
    this.requireParticipant(room, userId)
    if (room.timer.status !== 'not_started') {
      throw new RoomError('TIMER_ALREADY_STARTED', 'Timer duration is locked after it starts')
    }
    room.timer = { status: 'running', durationSeconds, startedAt, endsAt, startedBy: userId }
    room.lastActiveAt = startedAt
    return clone(room.timer)
  }

  async touchActivity(roomId: string, now: string): Promise<void> {
    const room = this.requireRoom(roomId)
    room.lastActiveAt = now
  }

  async setPresence(roomId: string, userId: string, connected: boolean): Promise<void> {
    const room = this.requireRoom(roomId)
    const participant = this.requireParticipant(room, userId)
    if (room.status === 'ended' || room.status === 'expired' || participant.state === 'left') return
    const now = new Date().toISOString()
    participant.state = connected ? 'connected' : 'disconnected'
    if (connected) participant.lastConnectedAt = now
    else participant.lastDisconnectedAt = now
    room.lastActiveAt = now
  }

  async getParticipantSlot(roomId: string, userId: string): Promise<Slot | null> {
    const room = this.rooms.get(roomId)
    return room?.participants.find((participant) => participant.userId === userId)?.slot ?? null
  }

  async requestPermission(roomId: string, requesterId: string, editorOwnerId: string): Promise<PermissionRequest> {
    const room = this.requireLiveRoom(roomId)
    this.requireParticipant(room, requesterId)
    this.requireParticipant(room, editorOwnerId)
    if (requesterId === editorOwnerId) {
      throw new RoomError('INVALID_PERMISSION_REQUEST', 'Cannot request permission for your own editor')
    }

    const duplicate = [...this.permissionRequests.values()].find((request) =>
      request.sessionId === roomId && request.requesterId === requesterId &&
      request.editorOwnerId === editorOwnerId && request.status === 'pending')
    if (duplicate) return clone(duplicate)

    const request: PermissionRequest = {
      id: randomUUID(), sessionId: roomId, requesterId, editorOwnerId,
      status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null,
    }
    this.permissionRequests.set(request.id, request)
    return clone(request)
  }

  async permissionState(roomId: string, userId: string): Promise<PermissionSnapshot> {
    const room = this.requireRoom(roomId)
    this.requireParticipant(room, userId)
    return {
      requests: [...this.permissionRequests.values()]
        .filter((request) => request.sessionId === roomId && request.status === 'pending')
        .map(clone),
      permissions: [...this.permissions.values()]
        .filter((permission) => permission.sessionId === roomId && !permission.revokedAt && !permission.consumedAt)
        .map(clone),
    }
  }

  async denyPermission(roomId: string, requestId: string, ownerId: string): Promise<PermissionRequest> {
    const room = this.requireLiveRoom(roomId)
    this.requireParticipant(room, ownerId)
    const request = this.permissionRequests.get(requestId)
    if (!request || request.sessionId !== roomId) {
      throw new RoomError('PERMISSION_REQUEST_NOT_FOUND', 'Permission request not found')
    }
    if (request.editorOwnerId !== ownerId || request.status !== 'pending') {
      throw new RoomError('FORBIDDEN', 'Only the editor owner can deny a pending request')
    }
    request.status = 'denied'
    request.resolvedAt = new Date().toISOString()
    return clone(request)
  }

  async grantPermission(
    roomId: string, requestId: string, ownerId: string, scope: PermissionScope,
  ): Promise<EditorPermission> {
    const room = this.requireLiveRoom(roomId)
    this.requireParticipant(room, ownerId)
    const request = this.permissionRequests.get(requestId)
    if (!request || request.sessionId !== roomId) {
      throw new RoomError('PERMISSION_REQUEST_NOT_FOUND', 'Permission request not found')
    }
    if (request.editorOwnerId !== ownerId || request.status !== 'pending') {
      throw new RoomError('FORBIDDEN', 'Only the editor owner can grant a pending request')
    }

    const now = new Date().toISOString()
    request.status = 'granted'
    request.resolvedAt = now
    const permission: EditorPermission = {
      sessionId: roomId, editorOwnerId: ownerId, granteeId: request.requesterId,
      scope, grantedAt: now, revokedAt: null, consumedAt: null,
    }
    this.permissions.set(this.permissionKey(roomId, ownerId, request.requesterId), permission)
    return clone(permission)
  }

  async revokePermission(roomId: string, ownerId: string, granteeId: string): Promise<void> {
    const room = this.requireRoom(roomId)
    this.requireParticipant(room, ownerId)
    this.requireParticipant(room, granteeId)
    const permission = this.permissions.get(this.permissionKey(roomId, ownerId, granteeId))
    if (permission) permission.revokedAt = new Date().toISOString()
  }

  async hasWritePermission(roomId: string, ownerId: string, granteeId: string): Promise<boolean> {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'live') return false
    const permission = this.permissions.get(this.permissionKey(roomId, ownerId, granteeId))
    return Boolean(permission && !permission.revokedAt && !permission.consumedAt)
  }

  async consumeOncePermission(roomId: string, ownerId: string, granteeId: string): Promise<boolean> {
    const permission = this.permissions.get(this.permissionKey(roomId, ownerId, granteeId))
    if (!permission || permission.scope !== 'once' || permission.revokedAt || permission.consumedAt) return false
    permission.consumedAt = new Date().toISOString()
    return true
  }

  private participant(userId: string, slot: Slot, now: string): Participant {
    return { userId, slot, state: 'joined', joinedAt: now, lastConnectedAt: null,
      lastDisconnectedAt: null, leftAt: null }
  }

  private emptyTimer(): SessionTimer {
    return { status: 'not_started', durationSeconds: null, startedAt: null, endsAt: null, startedBy: null }
  }

  private requireRoom(roomId: string): Room {
    const room = this.rooms.get(roomId)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Room not found')
    return room
  }

  private requireLiveRoom(roomId: string): Room {
    const room = this.requireRoom(roomId)
    if (room.status !== 'live') throw new RoomError('INVALID_ROOM_STATE', 'Room is not live')
    return room
  }

  private requireParticipant(room: Room, userId: string): Participant {
    const participant = room.participants.find((candidate) => candidate.userId === userId)
    if (!participant) throw new RoomError('NOT_A_PARTICIPANT', 'User is not a room participant')
    return participant
  }

  private permissionKey(roomId: string, ownerId: string, granteeId: string): string {
    return `${roomId}:${ownerId}:${granteeId}`
  }
}
