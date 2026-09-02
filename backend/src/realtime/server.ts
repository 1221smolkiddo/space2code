import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'

import type { AuthService } from '../auth/auth-service.js'
import type { RoomRepository } from '../rooms/repository.js'
import type { Slot } from '../rooms/types.js'
import { parseDocumentName } from './document-name.js'
import type { DocumentStore } from './document-store.js'
import { PresenceTracker } from './presence-tracker.js'
import type { HocuspocusRoomEventPublisher } from './events.js'
import { resolveEditorAuthority } from './editor-access.js'

interface RealtimeContext {
  userId: string
  roomId: string
  ownerId: string
  ownerSlot: Slot
  isOwner: boolean
}

export interface RealtimeServerOptions {
  port: number
  address: string
  authService: AuthService
  roomRepository: RoomRepository
  documentStore: DocumentStore
  disconnectGraceMs: number
  eventPublisher?: HocuspocusRoomEventPublisher
  allowedOrigins: string[]
}

export function assertAllowedWebSocketOrigin(origin: string | null, allowedOrigins: readonly string[]): void {
  if (!origin || !allowedOrigins.includes(origin)) throw new Error('Connection origin not allowed')
}

export function createRealtimeServer(options: RealtimeServerOptions) {
  const presence = new PresenceTracker(options.roomRepository, options.disconnectGraceMs, options.eventPublisher)
  const documentConnections = new Map<string, number>()
  const allowedOrigins = options.allowedOrigins

  const server = new Server<RealtimeContext>({
    port: options.port,
    address: options.address,
    async onAuthenticate({ token, documentName, connectionConfig, requestHeaders }) {
      // ── Origin validation ──
      assertAllowedWebSocketOrigin(requestHeaders?.get('origin') ?? null, allowedOrigins)

      const parsed = parseDocumentName(documentName)
      if (!parsed) throw new Error('Invalid editor document name')
      const user = await options.authService.verifyAccessToken(token)
      const room = await options.roomRepository.findForUser(parsed.roomId, user.id)
      if (!room) throw new Error('Not a room participant')
      if (room.status === 'expired') throw new Error('Room has expired')

      const authority=await resolveEditorAuthority(options.roomRepository,room,parsed.ownerSlot,user.id)
      connectionConfig.readOnly = !authority.canWrite
      return { userId: user.id, roomId: parsed.roomId, ownerId: authority.ownerId, ownerSlot: parsed.ownerSlot, isOwner:authority.isOwner }
    },
    async connected({ context }) {
      await presence.connect(context.roomId, context.userId)
      const key = connectionKey(context)
      documentConnections.set(key, (documentConnections.get(key) ?? 0) + 1)
    },
    async beforeHandleMessage({ context, connection }) {
      const room = await options.roomRepository.findForUser(context.roomId, context.userId)
      connection.readOnly = !room || !(await resolveEditorAuthority(
        options.roomRepository,room,context.ownerSlot,context.userId,
      )).canWrite
    },
    async onLoadDocument({ documentName, document }) {
      const state = await options.documentStore.load(documentName)
      if (state) Y.applyUpdate(document, state)
      return document
    },
    async onStoreDocument({ documentName, document }) {
      await options.documentStore.store(documentName, Y.encodeStateAsUpdate(document))
    },
    async onDisconnect({ context }) {
      presence.disconnect(context.roomId, context.userId)
      const key = connectionKey(context)
      const remaining = Math.max(0, (documentConnections.get(key) ?? 1) - 1)
      if (remaining > 0) documentConnections.set(key, remaining)
      else {
        documentConnections.delete(key)
        if (!context.isOwner) {
          await options.roomRepository.consumeOncePermission(context.roomId, context.ownerId, context.userId)
        }
      }
    },
  })
  options.eventPublisher?.attach(server.hocuspocus)

  return {
    server,
    listen: () => server.listen(options.port),
    async destroy() {
      presence.destroy()
      await server.destroy()
    },
  }
}

function connectionKey(context: RealtimeContext): string {
  return `${context.roomId}:${context.userId}:${context.ownerId}`
}
