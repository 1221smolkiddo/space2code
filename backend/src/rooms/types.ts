export const sessionStatuses = ['waiting', 'live', 'ended', 'expired'] as const
export type SessionStatus = (typeof sessionStatuses)[number]

export const participantStates = ['joined', 'connected', 'disconnected', 'left'] as const
export type ParticipantState = (typeof participantStates)[number]

export type Slot = 'A' | 'B'
export type PermissionScope = 'once' | 'session'
export type TimerStatus = 'not_started' | 'running' | 'expired'

export interface SessionTimer {
  status: TimerStatus
  durationSeconds: number | null
  startedAt: string | null
  endsAt: string | null
  startedBy: string | null
}

export interface SessionQuestions {
  A: string | null
  B: string | null
}

export interface Participant {
  userId: string
  slot: Slot
  state: ParticipantState
  joinedAt: string
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  leftAt: string | null
}

export interface Room {
  id: string
  roomCode: string
  language: string
  status: SessionStatus
  createdBy: string
  endedBy: string | null
  endedReason: string | null
  createdAt: string
  lastActiveAt: string
  startedAt: string | null
  endedAt: string | null
  expiresAt: string
  resumedFromSessionId: string | null
  resumePartnerId: string | null
  questions: SessionQuestions
  timer: SessionTimer
  participants: Participant[]
  partner?: { userId: string; displayName: string | null; avatarUrl: string | null } | null
}

export interface RecentSession {
  sessionId: string
  partnerId: string | null
  partner: { userId: string; displayName: string | null; avatarUrl: string | null } | null
  language: string
  status: SessionStatus
  createdAt: string
  lastActiveAt: string
  endedAt: string | null
  endedBy: string | null
  endedReason: string | null
  expiresAt: string
  canReconnect: boolean
  canReopen: boolean
  resumedFromSessionId: string | null
}

export interface PermissionRequest {
  id: string
  sessionId: string
  requesterId: string
  editorOwnerId: string
  status: 'pending' | 'granted' | 'denied' | 'cancelled'
  createdAt: string
  resolvedAt: string | null
}

export interface EditorPermission {
  sessionId: string
  editorOwnerId: string
  granteeId: string
  scope: PermissionScope
  grantedAt: string
  revokedAt: string | null
  consumedAt: string | null
}

export interface PermissionSnapshot {
  requests: PermissionRequest[]
  permissions: EditorPermission[]
}
