import { randomInt, randomUUID } from 'node:crypto'

import type { ChatMessage, ExplainAnnotation, ExplainMessage, ExplainState } from '../collaboration/types.js'
import { RoomError } from './errors.js'
import type { RoomRepository } from './repository.js'
import type { ExecutionResult } from '../execution/types.js'
import type { PermissionScope, RecentSession, Room, SessionTimer } from './types.js'

const roomCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface Clock {
  now(): Date
}

const systemClock: Clock = { now: () => new Date() }

export interface RoomEventPublisher {
  publish(roomId: string, event: RoomEvent): Promise<void>
}

export type RoomEvent =
  | { type: 'participant.connected'; occurredAt: string; userId: string }
  | { type: 'participant.disconnected'; occurredAt: string; userId: string }
  | { type: 'participant.typing'; occurredAt: string; userId: string; isTyping: boolean }
  | { type: 'session.ended'; occurredAt: string; endedBy: string; reason: string }
  | { type: 'question.updated'; occurredAt: string; slot: 'A' | 'B'; question: string | null }
  | { type: 'timer.started'; occurredAt: string; timer: SessionTimer }
  | { type: 'timer.expired'; occurredAt: string; timer: SessionTimer }
  | { type: 'execution.started'; occurredAt: string; executionId: string; userId: string; scope: 'personal' | 'explain' }
  | { type: 'execution.completed'; occurredAt: string; executionId: string; userId: string; status: string; scope: 'personal' | 'explain'; result?: ExecutionResult }
  | { type: 'chat.message'; occurredAt: string; message: ChatMessage }
  | { type: 'explain.state'; occurredAt: string; state: ExplainState; winnerId: string }
  | { type: 'explain.arbitrated'; occurredAt: string; state: ExplainState; winnerId: string }
  | { type: 'explain.message'; occurredAt: string; message: ExplainMessage }
  | { type: 'explain.annotation'; occurredAt: string; annotation: ExplainAnnotation }
  | { type: 'permission.requested'; occurredAt: string; request: Awaited<ReturnType<RoomRepository['requestPermission']>> }
  | { type: 'permission.changed'; occurredAt: string; ownerId: string; granteeId: string; permission: Awaited<ReturnType<RoomRepository['grantPermission']>> | null }

const noEvents: RoomEventPublisher = { publish: async () => undefined }

export interface TimerScheduler {
  schedule(roomId: string, endsAt: Date, callback: () => Promise<void>): void
}

export class SystemTimerScheduler implements TimerScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  schedule(roomId: string, endsAt: Date, callback: () => Promise<void>): void {
    const existing = this.timers.get(roomId)
    if (existing) clearTimeout(existing)
    const delay = Math.max(0, endsAt.getTime() - Date.now())
    const timer = setTimeout(() => {
      this.timers.delete(roomId)
      void callback().catch(() => undefined)
    }, Math.min(delay, 2_147_483_647))
    timer.unref()
    this.timers.set(roomId, timer)
  }
}

export class RoomService {
  constructor(
    private readonly repository: RoomRepository,
    private readonly clock: Clock = systemClock,
    private readonly events: RoomEventPublisher = noEvents,
    private readonly timerLimits: { minSeconds: number; maxSeconds: number } = { minSeconds: 60, maxSeconds: 14_400 },
    private readonly timerScheduler: TimerScheduler = new SystemTimerScheduler(),
  ) {}

  async create(userId: string, language: string): Promise<Room> {
    const normalizedLanguage = language.trim().toLowerCase()
    if (!normalizedLanguage || normalizedLanguage.length > 40) {
      throw new RoomError('INVALID_ROOM_STATE', 'Language must contain between 1 and 40 characters')
    }

    const expiresAt = new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1_000).toISOString()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return this.normalizeRoom(await this.repository.create({
          roomCode: this.generateRoomCode(),
          language: normalizedLanguage,
          userId,
          expiresAt,
        }))
      } catch (error) {
        if (!(error instanceof RoomError) || error.code !== 'INVALID_ROOM_STATE') throw error
      }
    }

    throw new RoomError('INVALID_ROOM_STATE', 'Could not allocate a unique room code')
  }

  async join(userId: string, roomCode: string): Promise<Room> {
    const normalizedCode = roomCode.trim().toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalizedCode)) {
      throw new RoomError('ROOM_NOT_FOUND', 'Room not found')
    }
    return this.normalizeRoom(await this.repository.join(normalizedCode, userId))
  }

  async get(userId: string, roomId: string): Promise<Room> {
    const room = await this.repository.findForUser(roomId, userId)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Room not found')
    return this.normalizeRoom(room)
  }

  async leave(userId: string, roomId: string): Promise<Room> {
    const room = this.normalizeRoom(await this.repository.leave(roomId, userId))
    await this.events.publish(roomId, {
      type: 'session.ended', occurredAt: room.endedAt ?? this.clock.now().toISOString(),
      endedBy: userId, reason: room.endedReason ?? 'partner_left',
    })
    return room
  }

  async setTyping(userId: string, roomId: string, isTyping: boolean): Promise<void> {
    const room = await this.repository.findForUser(roomId, userId)
    if (!room) throw new RoomError('NOT_A_PARTICIPANT', 'Session membership is required')
    if (room.status !== 'waiting' && room.status !== 'live') return
    await this.events.publish(roomId, {
      type: 'participant.typing', occurredAt: this.clock.now().toISOString(), userId, isTyping,
    })
  }

  async recent(userId: string): Promise<RecentSession[]> {
    return this.repository.recent(userId)
  }

  async removeRecent(userId:string,roomId:string):Promise<void>{
    await this.repository.removeRecent(roomId,userId)
  }

  async resume(userId: string, sourceRoomId: string): Promise<Room> {
    const source = await this.get(userId, sourceRoomId)
    if (source.status !== 'ended') {
      throw new RoomError('SESSION_NOT_REOPENABLE', 'Only ended sessions can be resumed as a new room')
    }
    const expiresAt = new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1_000).toISOString()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return this.normalizeRoom(await this.repository.resume(sourceRoomId, {
          roomCode: this.generateRoomCode(), language: source.language, userId, expiresAt,
        }))
      } catch (error) {
        if (!(error instanceof RoomError) || error.code !== 'INVALID_ROOM_STATE') throw error
      }
    }
    throw new RoomError('INVALID_ROOM_STATE', 'Could not allocate a unique room code')
  }

  async updateQuestion(userId: string, roomId: string, question: string | null): Promise<Room> {
    const normalized = question?.trim() || null
    if (normalized && Buffer.byteLength(normalized, 'utf8') > 8_000) {
      throw new RoomError('INVALID_ROOM_STATE', 'Question exceeds 8000 bytes')
    }
    const occurredAt = this.clock.now().toISOString()
    const room = this.normalizeRoom(await this.repository.updateQuestion(roomId, userId, normalized, occurredAt))
    const participant = room.participants.find((candidate) => candidate.userId === userId)
    if (!participant) throw new RoomError('NOT_A_PARTICIPANT', 'User is not a room participant')
    await this.events.publish(roomId, {
      type: 'question.updated', occurredAt, slot: participant.slot, question: normalized,
    })
    return room
  }

  async startTimer(userId: string, roomId: string, durationSeconds: number): Promise<SessionTimer> {
    if (!Number.isInteger(durationSeconds) || durationSeconds < this.timerLimits.minSeconds ||
      durationSeconds > this.timerLimits.maxSeconds) {
      throw new RoomError(
        'INVALID_TIMER_DURATION',
        `Timer duration must be between ${this.timerLimits.minSeconds} and ${this.timerLimits.maxSeconds} seconds`,
      )
    }
    const startedAt = this.clock.now()
    const endsAt = new Date(startedAt.getTime() + durationSeconds * 1_000)
    const timer = await this.repository.startTimer(
      roomId, userId, durationSeconds, startedAt.toISOString(), endsAt.toISOString(),
    )
    await this.events.publish(roomId, { type: 'timer.started', occurredAt: startedAt.toISOString(), timer })
    this.timerScheduler.schedule(roomId, endsAt, async () => {
      await this.events.publish(roomId, {
        type: 'timer.expired', occurredAt: endsAt.toISOString(), timer: { ...timer, status: 'expired' },
      })
    })
    return this.normalizeTimer(timer)
  }

  async timer(userId: string, roomId: string): Promise<SessionTimer> {
    return (await this.get(userId, roomId)).timer
  }

  async requestPermission(userId: string, roomId: string, editorOwnerId: string) {
    const request = await this.repository.requestPermission(roomId, userId, editorOwnerId)
    const occurredAt = this.clock.now().toISOString()
    await this.repository.touchActivity(roomId, occurredAt)
    await this.events.publish(roomId, { type: 'permission.requested', occurredAt, request })
    return request
  }

  async permissionState(userId: string, roomId: string) {
    return this.repository.permissionState(roomId, userId)
  }

  async denyPermission(userId: string, roomId: string, requestId: string) {
    const request = await this.repository.denyPermission(roomId, requestId, userId)
    const occurredAt = this.clock.now().toISOString()
    await this.repository.touchActivity(roomId, occurredAt)
    await this.events.publish(roomId, {
      type: 'permission.changed', occurredAt, ownerId: request.editorOwnerId,
      granteeId: request.requesterId, permission: null,
    })
    return request
  }

  async grantPermission(
    userId: string,
    roomId: string,
    requestId: string,
    scope: PermissionScope,
  ) {
    const permission = await this.repository.grantPermission(roomId, requestId, userId, scope)
    const occurredAt = this.clock.now().toISOString()
    await this.repository.touchActivity(roomId, occurredAt)
    await this.events.publish(roomId, {
      type: 'permission.changed', occurredAt, ownerId: permission.editorOwnerId,
      granteeId: permission.granteeId, permission,
    })
    return permission
  }

  async revokePermission(userId: string, roomId: string, granteeId: string): Promise<void> {
    await this.repository.revokePermission(roomId, userId, granteeId)
    const occurredAt = this.clock.now().toISOString()
    await this.repository.touchActivity(roomId, occurredAt)
    await this.events.publish(roomId, {
      type: 'permission.changed', occurredAt, ownerId: userId, granteeId, permission: null,
    })
  }

  private generateRoomCode(): string {
    return Array.from({ length: 6 }, () => roomCodeAlphabet[randomInt(roomCodeAlphabet.length)]).join('')
  }

  private normalizeRoom(room: Room): Room {
    return { ...room, timer: this.normalizeTimer(room.timer) }
  }

  private normalizeTimer(timer: SessionTimer): SessionTimer {
    if (timer.status === 'running' && timer.endsAt && new Date(timer.endsAt).getTime() <= this.clock.now().getTime()) {
      return { ...timer, status: 'expired' }
    }
    return timer
  }
}

export function newId(): string {
  return randomUUID()
}
