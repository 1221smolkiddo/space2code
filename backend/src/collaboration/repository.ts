import type { AnnotationInput, ChatMessage, ExplainActivation, ExplainAnnotation, ExplainMessage, ExplainState, InviteAcceptance, SessionInvite } from './types.js'

export interface CollaborationRepository {
  createInvite(roomId: string, inviterId: string, inviteeId: string, now: string, expiresAt: string): Promise<SessionInvite>
  pendingInvites(inviteeId: string, now: string): Promise<SessionInvite[]>
  acceptInvite(inviteId: string, inviteeId: string, now: string): Promise<InviteAcceptance>
  declineInvite(inviteId: string, inviteeId: string, now: string): Promise<SessionInvite>
  sendChat(sessionId: string, senderId: string, content: string, now: string): Promise<ChatMessage>
  listChat(sessionId: string, userId: string): Promise<ChatMessage[]>
  getExplainState(sessionId: string, userId: string, now: string): Promise<ExplainState>
  activateExplain(sessionId: string, userId: string, targetSlot: 'A'|'B', now: string, priority: number, arbitrationWindowMs: number): Promise<ExplainActivation>
  deactivateExplain(sessionId: string, userId: string, now: string): Promise<ExplainState>
  sendExplainMessage(sessionId: string, senderId: string, content: string, now: string): Promise<ExplainMessage>
  listExplainMessages(sessionId: string, userId: string): Promise<ExplainMessage[]>
  addAnnotation(sessionId: string, authorId: string, input: AnnotationInput, now: string): Promise<ExplainAnnotation>
  listAnnotations(sessionId: string, userId: string): Promise<ExplainAnnotation[]>
  removeAnnotation(sessionId: string, annotationId: string, userId: string): Promise<void>
}
