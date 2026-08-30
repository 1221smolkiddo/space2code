import type { Room, Slot } from '../rooms/types.js'

export interface SessionInvite { id: string; roomId: string; inviterId: string; inviteeId: string; status: 'pending'|'accepted'|'declined'|'expired'; createdAt: string; expiresAt: string; resolvedAt: string|null }
export interface ChatMessage { id: string; sessionId: string; senderId: string; content: string; createdAt: string }
export interface ExplainState { sessionId: string; active: boolean; targetSlot: Slot|null; controllerId: string|null; activatedAt: string|null; updatedAt: string; revision: number }
export interface ExplainActivation { state: ExplainState; winnerId: string; contenderCount: number }
export interface ExplainMessage { id: string; sessionId: string; senderId: string; content: string; createdAt: string }
export type AnnotationType = 'highlight'|'pointer'|'note'
export interface ExplainAnnotation { id: string; sessionId: string; targetSlot: Slot; startLine: number|null; endLine: number|null; type: AnnotationType; text: string|null; authorId: string; createdAt: string }
export interface AnnotationInput { targetSlot: Slot; startLine: number|null; endLine: number|null; type: AnnotationType; text: string|null }
export interface InviteAcceptance { invite: SessionInvite; room: Room }
