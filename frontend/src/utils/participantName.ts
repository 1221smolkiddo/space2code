import type { Room } from '../types'

export const fallbackParticipantName = (userId: string): string => `Coder ${userId.slice(0, 6)}`

export const participantName = (
  room: Room | null,
  userId: string,
  currentUserId: string | null | undefined,
): string => {
  if (userId === currentUserId) return 'You'

  const displayName = room?.partner?.userId === userId ? room.partner.displayName?.trim() : null
  return displayName || fallbackParticipantName(userId)
}
