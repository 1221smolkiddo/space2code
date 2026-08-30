import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'

import type { AuthService } from './auth/auth-service.js'
import { registerCollaborationRoutes } from './collaboration/routes.js'
import type { CollaborationService } from './collaboration/service.js'
import { parseOrigins } from './config/env.js'
import { ExecutionError } from './execution/errors.js'
import { registerExecutionRoutes } from './execution/routes.js'
import type { ExecutionService } from './execution/service.js'
import { registerExportRoutes } from './export/routes.js'
import type { SessionExportService } from './export/service.js'
import { FeatureError } from './features/errors.js'
import type { InMemoryUserEventHub } from './realtime/user-events.js'
import { RoomError } from './rooms/errors.js'
import { registerRoomRoutes } from './rooms/routes.js'
import type { RoomService } from './rooms/service.js'
import { registerSocialRoutes } from './social/routes.js'
import type { SocialService } from './social/service.js'

export interface BuildAppOptions {
  authService: AuthService
  roomService: RoomService
  executionService?: ExecutionService
  socialService?: SocialService
  collaborationService?: CollaborationService
  exportService?: SessionExportService
  userEvents?: InMemoryUserEventHub
  corsOrigin: string
  logger?: boolean | { level: string }
  readinessCheck?: () => Promise<void>
}

export const HTTP_BODY_LIMIT_BYTES = 262_144

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const loggerOption = options.logger ?? true
  const app = Fastify({
    logger: loggerOption,
    genReqId: () => randomUUID(),
    bodyLimit: HTTP_BODY_LIMIT_BYTES,
  })

  // ── Multi-origin CORS ──
  const origins = parseOrigins(options.corsOrigin)
  await app.register(cors, {
    origin: origins,
    credentials: true,
    exposedHeaders: ['date', 'x-request-id'],
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
    const origin = request.headers.origin
    if (origin && !origins.includes(origin)) {
      await reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } })
    }
  })

  // ── Security headers ──
  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'strict-origin-when-cross-origin')
    reply.header('x-frame-options', 'DENY')
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
  })

  // ── Request logging (structured) ──
  app.addHook('onResponse', (request, reply, done) => {
    const roomId = typeof (request.params as Record<string, unknown>)?.roomId === 'string'
      ? (request.params as Record<string, unknown>).roomId
      : undefined
    request.log.info({
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(reply.elapsedTime),
      ...(roomId ? { roomId } : {}),
    }, 'request completed')
    done()
  })

  // ── Health + readiness ──
  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/ready', async (_request, reply) => {
    try {
      await options.readinessCheck?.()
      return reply.send({ status: 'ok', timestamp: new Date().toISOString() })
    } catch (error) {
      app.log.warn({ error }, 'readiness check failed')
      return reply.code(503).send({ status: 'not_ready', timestamp: new Date().toISOString() })
    }
  })

  // ── Routes ──
  await registerRoomRoutes(app, options)
  if (options.executionService) {
    await registerExecutionRoutes(app, { authService: options.authService, executionService: options.executionService })
  }
  if (options.socialService && options.userEvents) await registerSocialRoutes(app, { authService: options.authService, socialService: options.socialService, userEvents: options.userEvents, allowedOrigins: origins })
  if (options.collaborationService) await registerCollaborationRoutes(app, { authService: options.authService, collaborationService: options.collaborationService })
  if (options.exportService) await registerExportRoutes(app, { authService: options.authService, exportService: options.exportService })

  // ── Error handler ──
  app.setErrorHandler((error, _request, reply) => {
    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 413) {
      return reply.code(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the application limit' } })
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Request validation failed', issues: error.issues },
      })
    }
    if (error instanceof RoomError) {
      const statuses: Record<RoomError['code'], number> = {
        ROOM_NOT_FOUND: 404, ROOM_FULL: 409, ROOM_ENDED: 410, NOT_A_PARTICIPANT: 403,
        INVALID_ROOM_STATE: 409, INVALID_PERMISSION_REQUEST: 400,
        PERMISSION_REQUEST_NOT_FOUND: 404, FORBIDDEN: 403,
        TIMER_ALREADY_STARTED: 409, INVALID_TIMER_DURATION: 400, SESSION_NOT_REOPENABLE: 409,
      }
      return reply.code(statuses[error.code]).send({ error: { code: error.code, message: error.message } })
    }
    if (error instanceof ExecutionError) {
      const statuses: Record<ExecutionError['code'], number> = {
        UNSUPPORTED_LANGUAGE: 400,
        ROOM_LANGUAGE_MISMATCH: 409,
        SOURCE_TOO_LARGE: 413,
        STDIN_TOO_LARGE: 413,
        EXECUTION_RATE_LIMITED: 429,
        EXECUTION_CONCURRENCY_LIMITED: 429,
        EXECUTION_PROVIDER_UNAVAILABLE: 503,
        EXECUTION_TIMED_OUT: 504,
      }
      const status = statuses[error.code]
      if (status === 429) reply.header('retry-after', String(error.retryAfterSeconds ?? 1))
      return reply.code(status).send({ error: { code: error.code, message: error.message } })
    }
    if (error instanceof FeatureError) {
      const status = error.code === 'RATE_LIMITED' ? 429 : error.code.endsWith('LIMIT_EXCEEDED') ? 413 :
        error.code.includes('NOT_FOUND') ? 404 : error.code === 'FORBIDDEN' ? 403 : 409
      if (status === 429) reply.header('retry-after', String(error.retryAfterSeconds ?? 1))
      return reply.code(status).send({ error: { code: error.code, message: error.message } })
    }
    app.log.error(error)
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  })

  return app
}
