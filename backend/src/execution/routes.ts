import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { bearerToken, type AuthService, type AuthenticatedUser } from '../auth/auth-service.js'
import type { ExecutionService } from './service.js'

const roomParamsSchema = z.object({ roomId: z.string().uuid() })
const executeSchema = z.object({
  language: z.string().min(1),
  source: z.string(),
  stdin: z.string().optional().default(''),
  targetSlot: z.enum(['A', 'B']).optional(),
  scope: z.enum(['personal', 'explain']).optional().default('personal'),
})

export async function registerExecutionRoutes(
  app: FastifyInstance,
  options: { authService: AuthService; executionService: ExecutionService },
): Promise<void> {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedUser | null> => {
    try {
      return await options.authService.verifyAccessToken(bearerToken(request.headers.authorization))
    } catch {
      await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return null
    }
  }

  app.post('/v1/rooms/:roomId/execute', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return
    const { roomId } = roomParamsSchema.parse(request.params)
    const body = executeSchema.parse(request.body)
    return reply.send(await options.executionService.execute({ roomId, userId: user.id, ...body }))
  })
}
