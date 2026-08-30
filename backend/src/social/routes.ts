import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { bearerToken, type AuthService, type AuthenticatedUser } from '../auth/auth-service.js'
import type { InMemoryUserEventHub } from '../realtime/user-events.js'
import type { ProfileUpdate } from './repository.js'
import type { SocialService } from './service.js'

const id = z.string().uuid()

export interface SocialRoutesOptions {
  authService: AuthService
  socialService: SocialService
  userEvents: InMemoryUserEventHub
  allowedOrigins: string[]
}

export function isAllowedEventOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return Boolean(origin && allowedOrigins.includes(origin))
}

export async function registerSocialRoutes(app: FastifyInstance, options: SocialRoutesOptions) {
  const auth = async (request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedUser | null> => {
    try { return await options.authService.verifyAccessToken(bearerToken(request.headers.authorization)) }
    catch { await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }); return null }
  }
  const allowedOrigins = options.allowedOrigins

  app.get('/v1/profile', async (r, p) => { const u = await auth(r,p); if (u) return p.send({ profile: await options.socialService.getOwn(u.id) }) })
  app.patch('/v1/profile', async (r,p) => { const u=await auth(r,p); if(!u)return; const b=z.object({displayName:z.string().trim().max(80).nullable().optional(),avatarUrl:z.string().url().max(2048).nullable().optional(),preferredTheme:z.enum(['light','dark','system']).optional(),editorFontSize:z.number().int().min(10).max(32).optional()}).parse(r.body); const update:ProfileUpdate={};if(b.displayName!==undefined)update.displayName=b.displayName;if(b.avatarUrl!==undefined)update.avatarUrl=b.avatarUrl;if(b.preferredTheme!==undefined)update.preferredTheme=b.preferredTheme;if(b.editorFontSize!==undefined)update.editorFontSize=b.editorFontSize;return p.send({profile:await options.socialService.updateOwn(u.id,update)}) })
  app.get('/v1/profiles/:userId', async(r,p)=>{const u=await auth(r,p);if(!u)return;const {userId}=z.object({userId:id}).parse(r.params);return p.send({profile:await options.socialService.getPublic(u.id,userId)})})
  app.get('/v1/friends',async(r,p)=>{const u=await auth(r,p);if(u)return p.send(await options.socialService.list(u.id))})
  app.post('/v1/friend-requests',async(r,p)=>{const u=await auth(r,p);if(!u)return;const {receiverId}=z.object({receiverId:id}).parse(r.body);return p.code(201).send({request:await options.socialService.sendRequest(u.id,receiverId)})})
  app.post('/v1/friend-requests/:requestId/:action',async(r,p)=>{const u=await auth(r,p);if(!u)return;const x=z.object({requestId:id,action:z.enum(['accept','decline'])}).parse(r.params);return p.send({request:await options.socialService.respond(x.requestId,u.id,x.action==='accept'?'accepted':'declined')})})
  app.delete('/v1/friend-requests/:requestId',async(r,p)=>{const u=await auth(r,p);if(!u)return;const {requestId}=z.object({requestId:id}).parse(r.params);await options.socialService.cancel(requestId,u.id);return p.code(204).send()})
  app.delete('/v1/friends/:friendId',async(r,p)=>{const u=await auth(r,p);if(!u)return;const {friendId}=z.object({friendId:id}).parse(r.params);await options.socialService.remove(u.id,friendId);return p.code(204).send()})
  app.put('/v1/presence',async(r,p)=>{const u=await auth(r,p);if(!u)return;const {state}=z.object({state:z.enum(['ONLINE','IN_SESSION'])}).parse(r.body);await options.socialService.setPresence(u.id,state);return p.code(204).send()})
  app.delete('/v1/presence',async(r,p)=>{const u=await auth(r,p);if(!u)return;await options.socialService.setOffline(u.id);return p.code(204).send()})
  app.get('/v1/friends/presence',async(r,p)=>{const u=await auth(r,p);if(u)return p.send({presence:await options.socialService.friendPresence(u.id)})})
  app.get('/v1/events',async(r,p)=>{const u=await auth(r,p);if(!u)return;const {after}=z.object({after:z.string().optional()}).parse(r.query);return p.send({events:options.userEvents.list(u.id,after)})})

  app.get('/v1/events/stream',async(r,p)=>{
    // ── Origin validation for SSE (hijacked, bypasses Fastify CORS) ──
    if (!isAllowedEventOrigin(r.headers.origin, allowedOrigins)) {
      return p.code(403).send({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } })
    }
    const u=await auth(r,p);if(!u)return
    p.hijack()
    p.raw.writeHead(200,{
      'content-type':'text/event-stream',
      'cache-control':'no-cache, no-transform',
      'connection':'keep-alive',
      'x-content-type-options': 'nosniff',
    })
    const {after}=z.object({after:z.string().optional()}).parse(r.query)
    const write=(event:unknown)=>p.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    for(const event of options.userEvents.list(u.id,after))write(event)
    const unsubscribe=options.userEvents.subscribe(u.id,write)
    const heartbeat=setInterval(()=>p.raw.write(': heartbeat\n\n'),25_000)
    heartbeat.unref()
    r.raw.once('close',()=>{clearInterval(heartbeat);unsubscribe()})
    return p
  })
}
