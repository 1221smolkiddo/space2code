import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { bearerToken, type AuthService, type AuthenticatedUser } from '../auth/auth-service.js'
import type { RoomService } from './service.js'
import type { Room } from './types.js'

const createRoomSchema = z.object({ language: z.string() })
const joinRoomSchema = z.object({ roomCode: z.string() })
const roomParamsSchema = z.object({ roomId: z.string().uuid() })
const requestPermissionSchema = z.object({ editorOwnerId: z.string().uuid() })
const grantParamsSchema = roomParamsSchema.extend({ requestId: z.string().uuid() })
const grantPermissionSchema = z.object({ scope: z.enum(['once', 'session']) })
const revokeParamsSchema = roomParamsSchema.extend({ granteeId: z.string().uuid() })
const sessionParamsSchema = z.object({ sessionId: z.string().uuid() })
const questionSchema = z.object({ question: z.string().nullable() })
const timerSchema = z.object({ durationSeconds: z.number().int() })
const typingSchema = z.object({ isTyping: z.boolean() })

export interface RoomRoutesOptions {
  roomService: RoomService
  authService: AuthService
}

export async function registerRoomRoutes(app: FastifyInstance, options: RoomRoutesOptions): Promise<void> {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedUser | null> => {
    try {
      return await options.authService.verifyAccessToken(bearerToken(request.headers.authorization))
    } catch {
      await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return null
    }
  }

  app.post('/v1/rooms', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const body = createRoomSchema.parse(request.body)
    return reply.code(201).send(roomResponse(await options.roomService.create(user.id, body.language)))
  })

  app.post('/v1/rooms/join', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const body = joinRoomSchema.parse(request.body)
    return reply.send(roomResponse(await options.roomService.join(user.id, body.roomCode)))
  })

  app.get('/v1/rooms/:roomId', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    return reply.send(roomResponse(await options.roomService.get(user.id, roomId)))
  })

  app.get('/v1/sessions/recent', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    return reply.send({ sessions: await options.roomService.recent(user.id) })
  })

  app.delete('/v1/sessions/recent/:sessionId', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { sessionId } = sessionParamsSchema.parse(request.params)
    await options.roomService.removeRecent(user.id,sessionId)
    return reply.code(204).send()
  })

  app.get('/v1/sessions/:sessionId', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { sessionId } = sessionParamsSchema.parse(request.params)
    return reply.send(roomResponse(await options.roomService.get(user.id, sessionId)))
  })

  app.post('/v1/sessions/:sessionId/resume', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { sessionId } = sessionParamsSchema.parse(request.params)
    return reply.code(201).send(roomResponse(await options.roomService.resume(user.id, sessionId)))
  })

  app.post('/v1/rooms/:roomId/leave', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    return reply.send(roomResponse(await options.roomService.leave(user.id, roomId)))
  })

  app.put('/v1/rooms/:roomId/typing', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    const { isTyping } = typingSchema.parse(request.body)
    await options.roomService.setTyping(user.id, roomId, isTyping)
    return reply.code(204).send()
  })

  app.patch('/v1/rooms/:roomId/question', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    const { question } = questionSchema.parse(request.body)
    return reply.send(roomResponse(await options.roomService.updateQuestion(user.id, roomId, question)))
  })

  app.post('/v1/rooms/:roomId/timer', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    const { durationSeconds } = timerSchema.parse(request.body)
    return reply.code(201).send({ timer: await options.roomService.startTimer(user.id, roomId, durationSeconds) })
  })

  app.get('/v1/rooms/:roomId/timer', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    return reply.send({ timer: await options.roomService.timer(user.id, roomId) })
  })

  app.post('/v1/rooms/:roomId/permission-requests', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    const { editorOwnerId } = requestPermissionSchema.parse(request.body)
    const permissionRequest = await options.roomService.requestPermission(user.id, roomId, editorOwnerId)
    return reply.code(201).send({ permissionRequest })
  })

  app.get('/v1/rooms/:roomId/permissions', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    return reply.send(await options.roomService.permissionState(user.id, roomId))
  })

  app.post('/v1/rooms/:roomId/permission-requests/:requestId/deny', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId, requestId } = grantParamsSchema.parse(request.params)
    return reply.send({ permissionRequest: await options.roomService.denyPermission(user.id, roomId, requestId) })
  })

  app.post('/v1/rooms/:roomId/permission-requests/:requestId/grant', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId, requestId } = grantParamsSchema.parse(request.params)
    const { scope } = grantPermissionSchema.parse(request.body)
    const permission = await options.roomService.grantPermission(user.id, roomId, requestId, scope)
    return reply.send({
      permission,
      realtime: { reconnectRequired: false, editorOwnerId: user.id },
    })
  })

  app.delete('/v1/rooms/:roomId/permissions/:granteeId', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId, granteeId } = revokeParamsSchema.parse(request.params)
    await options.roomService.revokePermission(user.id, roomId, granteeId)
    return reply.code(204).send()
  })
}

function roomResponse(room: Room) {
  return {
    room,
    documents: {
      userA: `room:${room.id}:userA:code`,
      userB: `room:${room.id}:userB:code`,
    },
  }
}
