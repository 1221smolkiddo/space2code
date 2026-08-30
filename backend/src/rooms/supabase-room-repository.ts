import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { RoomError, type RoomErrorCode } from './errors.js'
import type { CreateRoomInput, RoomRepository } from './repository.js'
import type {
  EditorPermission, PermissionRequest, PermissionScope, PermissionSnapshot, RecentSession, Room, SessionTimer, Slot,
} from './types.js'

type JsonRecord = Record<string, unknown>

export class SupabaseRoomRepository implements RoomRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateRoomInput): Promise<Room> {
    const data = await this.rpc('space2code_create_room', {
      p_room_code: input.roomCode, p_language: input.language,
      p_user_id: input.userId, p_expires_at: input.expiresAt,
    })
    return mapRoom(data)
  }

  async join(roomCode: string, userId: string): Promise<Room> {
    return mapRoom(await this.rpc('space2code_join_room', { p_room_code: roomCode, p_user_id: userId }))
  }

  async findForUser(roomId: string, userId: string): Promise<Room | null> {
    const data = await this.rpc('space2code_get_room', { p_session_id: roomId, p_user_id: userId })
    return data === null ? null : mapRoom(data)
  }

  async leave(roomId: string, userId: string): Promise<Room> {
    return mapRoom(await this.rpc('space2code_leave_room', { p_session_id: roomId, p_user_id: userId }))
  }

  async recent(userId: string): Promise<RecentSession[]> {
    const data = await this.rpc('space2code_recent_sessions', { p_user_id: userId })
    if (!Array.isArray(data)) return []
    return data.map(mapRecentSession)
  }

  async resume(sourceRoomId: string, input: CreateRoomInput): Promise<Room> {
    return mapRoom(await this.rpc('space2code_resume_session', {
      p_source_session_id: sourceRoomId, p_room_code: input.roomCode,
      p_user_id: input.userId, p_expires_at: input.expiresAt,
    }))
  }

  async updateQuestion(roomId: string, userId: string, question: string | null, now: string): Promise<Room> {
    return mapRoom(await this.rpc('space2code_update_question', {
      p_session_id: roomId, p_user_id: userId, p_question: question, p_now: now,
    }))
  }

  async startTimer(
    roomId: string, userId: string, durationSeconds: number, startedAt: string, endsAt: string,
  ): Promise<SessionTimer> {
    return mapTimer(await this.rpc('space2code_start_timer', {
      p_session_id: roomId, p_user_id: userId, p_duration_seconds: durationSeconds,
      p_started_at: startedAt, p_ends_at: endsAt,
    }))
  }

  async touchActivity(roomId: string, now: string): Promise<void> {
    await this.rpc('space2code_touch_session', { p_session_id: roomId, p_now: now })
  }

  async setPresence(roomId: string, userId: string, connected: boolean): Promise<void> {
    await this.rpc('space2code_set_presence', {
      p_session_id: roomId, p_user_id: userId, p_connected: connected,
    })
  }

  async getParticipantSlot(roomId: string, userId: string): Promise<Slot | null> {
    const data = await this.rpc('space2code_participant_slot', { p_session_id: roomId, p_user_id: userId })
    return data === 'A' || data === 'B' ? data : null
  }

  async requestPermission(roomId: string, requesterId: string, editorOwnerId: string): Promise<PermissionRequest> {
    return mapPermissionRequest(await this.rpc('space2code_request_permission', {
      p_session_id: roomId, p_requester_id: requesterId, p_editor_owner_id: editorOwnerId,
    }))
  }

  async permissionState(roomId: string, userId: string): Promise<PermissionSnapshot> {
    const row = record(await this.rpc('space2code_permission_state', {
      p_session_id: roomId, p_user_id: userId,
    }))
    return {
      requests: (Array.isArray(row.requests) ? row.requests : []).map(mapPermissionRequest),
      permissions: (Array.isArray(row.permissions) ? row.permissions : []).map(mapPermission),
    }
  }

  async denyPermission(roomId: string, requestId: string, ownerId: string): Promise<PermissionRequest> {
    return mapPermissionRequest(await this.rpc('space2code_deny_permission', {
      p_session_id: roomId, p_request_id: requestId, p_owner_id: ownerId,
    }))
  }

  async grantPermission(
    roomId: string, requestId: string, ownerId: string, scope: PermissionScope,
  ): Promise<EditorPermission> {
    return mapPermission(await this.rpc('space2code_grant_permission', {
      p_session_id: roomId, p_request_id: requestId, p_owner_id: ownerId, p_scope: scope,
    }))
  }

  async revokePermission(roomId: string, ownerId: string, granteeId: string): Promise<void> {
    await this.rpc('space2code_revoke_permission', {
      p_session_id: roomId, p_owner_id: ownerId, p_grantee_id: granteeId,
    })
  }

  async hasWritePermission(roomId: string, ownerId: string, granteeId: string): Promise<boolean> {
    return Boolean(await this.rpc('space2code_can_write', {
      p_session_id: roomId, p_owner_id: ownerId, p_grantee_id: granteeId,
    }))
  }

  async consumeOncePermission(roomId: string, ownerId: string, granteeId: string): Promise<boolean> {
    return Boolean(await this.rpc('space2code_consume_once_permission', {
      p_session_id: roomId, p_owner_id: ownerId, p_grantee_id: granteeId,
    }))
  }

  private async rpc(name: string, parameters: JsonRecord): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, parameters)
    if (error) throw mapDatabaseError(error)
    return data
  }
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RoomError('INVALID_ROOM_STATE', 'Database returned an invalid room payload')
  }
  return value as JsonRecord
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new RoomError('INVALID_ROOM_STATE', 'Database returned invalid text')
  return value
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value)
}

export function mapRoom(value: unknown): Room {
  const row = record(value)
  const participants = Array.isArray(row.participants) ? row.participants : []
  return {
    id: string(row.id), roomCode: string(row.room_code), language: string(row.language),
    status: string(row.status) as Room['status'], createdBy: string(row.created_by),
    endedBy: nullableString(row.ended_by), endedReason: nullableString(row.ended_reason),
    createdAt: string(row.created_at), lastActiveAt: string(row.last_active_at),
    startedAt: nullableString(row.started_at),
    endedAt: nullableString(row.ended_at), expiresAt: string(row.expires_at),
    resumedFromSessionId: nullableString(row.resumed_from_session_id),
    resumePartnerId: nullableString(row.resume_partner_id),
    questions: {
      A: nullableString(row.question_a),
      B: nullableString(row.question_b),
    },
    timer: mapTimer(row.timer),
    participants: participants.map((value) => {
      const participant = record(value)
      return {
        userId: string(participant.user_id), slot: string(participant.slot) as Slot,
        state: string(participant.state) as Room['participants'][number]['state'],
        joinedAt: string(participant.joined_at),
        lastConnectedAt: nullableString(participant.last_connected_at),
        lastDisconnectedAt: nullableString(participant.last_disconnected_at),
        leftAt: nullableString(participant.left_at),
      }
    }),
  }
}

function mapTimer(value: unknown): SessionTimer {
  const row = record(value)
  const duration = row.duration_seconds
  return {
    status: string(row.status) as SessionTimer['status'],
    durationSeconds: duration === null || duration === undefined ? null : Number(duration),
    startedAt: nullableString(row.started_at), endsAt: nullableString(row.ends_at),
    startedBy: nullableString(row.started_by),
  }
}

function mapRecentSession(value: unknown): RecentSession {
  const row = record(value)
  const partnerId = nullableString(row.partner_id)
  return {
    sessionId: string(row.session_id), partnerId,
    partner: partnerId ? {
      userId: partnerId,
      displayName: nullableString(row.partner_display_name),
      avatarUrl: nullableString(row.partner_avatar_url),
    } : null,
    language: string(row.language), status: string(row.status) as Room['status'],
    createdAt: string(row.created_at), lastActiveAt: string(row.last_active_at),
    endedAt: nullableString(row.ended_at), endedBy: nullableString(row.ended_by),
    endedReason: nullableString(row.ended_reason), expiresAt: string(row.expires_at),
    canReconnect: Boolean(row.can_reconnect),
    canReopen: Boolean(row.can_reopen), resumedFromSessionId: nullableString(row.resumed_from_session_id),
  }
}

function mapPermissionRequest(value: unknown): PermissionRequest {
  const row = record(value)
  return {
    id: string(row.id), sessionId: string(row.session_id), requesterId: string(row.requester_id),
    editorOwnerId: string(row.editor_owner_id), status: string(row.status) as PermissionRequest['status'],
    createdAt: string(row.created_at), resolvedAt: nullableString(row.resolved_at),
  }
}

function mapPermission(value: unknown): EditorPermission {
  const row = record(value)
  return {
    sessionId: string(row.session_id), editorOwnerId: string(row.editor_owner_id),
    granteeId: string(row.grantee_id), scope: string(row.scope) as PermissionScope,
    grantedAt: string(row.granted_at), revokedAt: nullableString(row.revoked_at),
    consumedAt: nullableString(row.consumed_at),
  }
}

function mapDatabaseError(error: PostgrestError): RoomError {
  const knownCodes: RoomErrorCode[] = [
    'ROOM_NOT_FOUND', 'ROOM_FULL', 'ROOM_ENDED', 'NOT_A_PARTICIPANT',
    'INVALID_ROOM_STATE', 'INVALID_PERMISSION_REQUEST', 'PERMISSION_REQUEST_NOT_FOUND', 'FORBIDDEN',
    'TIMER_ALREADY_STARTED', 'INVALID_TIMER_DURATION', 'SESSION_NOT_REOPENABLE',
  ]
  const code = knownCodes.find((candidate) => error.message.includes(candidate)) ?? 'INVALID_ROOM_STATE'
  return new RoomError(code, error.message.replace(`${code}: `, ''))
}
