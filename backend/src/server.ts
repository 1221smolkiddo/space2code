import { createSupabaseAdminClient } from './supabase/client.js'
import { SupabaseCollaborationRepository } from './collaboration/supabase-repository.js'
import { CollaborationService } from './collaboration/service.js'
import { SupabaseAuthService } from './auth/supabase-auth-service.js'
import { buildApp } from './app.js'
import { allowedWsOrigins, loadConfig, parseOrigins } from './config/env.js'
import { initialLanguageRegistry } from './execution/language-registry.js'
import { PistonExecutionProvider } from './execution/piston-provider.js'
import { ExecutionService } from './execution/service.js'
import { SessionExportService } from './export/service.js'
import { InMemoryActionRateLimiter } from './features/rate-limiter.js'
import { SupabaseExecutionGuard } from './execution/supabase-guard.js'
import { SupabaseDocumentStore } from './realtime/document-store.js'
import { HocuspocusRoomEventPublisher } from './realtime/events.js'
import { InMemoryUserEventHub } from './realtime/user-events.js'
import { createRealtimeServer } from './realtime/server.js'
import { RoomService } from './rooms/service.js'
import { SupabaseRoomRepository } from './rooms/supabase-room-repository.js'
import { FriendPresenceService } from './social/presence.js'
import { SocialService } from './social/service.js'
import { SupabaseSocialRepository } from './social/supabase-repository.js'

// ── Startup: parse and validate configuration ──
const config = loadConfig()
const supabase = createSupabaseAdminClient(config)
const authService = new SupabaseAuthService(supabase)
const roomRepository = new SupabaseRoomRepository(supabase)
const eventPublisher = new HocuspocusRoomEventPublisher()
const clock = { now: () => new Date() }
const roomService = new RoomService(
  roomRepository,
  clock,
  eventPublisher,
  { minSeconds: config.TIMER_MIN_SECONDS, maxSeconds: config.TIMER_MAX_SECONDS },
)
const documentStore = new SupabaseDocumentStore(supabase)
const userEvents = new InMemoryUserEventHub()
const featureLimiter = new InMemoryActionRateLimiter()
const socialRepository = new SupabaseSocialRepository(supabase)
const friendPresence = new FriendPresenceService(userEvents)
const socialService = new SocialService(socialRepository, friendPresence, userEvents, featureLimiter, clock)
const collaborationRepository = new SupabaseCollaborationRepository(supabase)
const collaborationService = new CollaborationService(collaborationRepository, eventPublisher, userEvents, featureLimiter, clock)
const languageRegistry = initialLanguageRegistry({
  python: config.PISTON_PYTHON_VERSION,
  java: config.PISTON_JAVA_VERSION,
  c: config.PISTON_C_VERSION,
  cpp: config.PISTON_CPP_VERSION,
  javascript: config.PISTON_JAVASCRIPT_VERSION,
})
const executionGuard = new SupabaseExecutionGuard(supabase, {
  windowMs: config.EXECUTION_RATE_WINDOW_MS,
  userLimit: config.EXECUTION_USER_RATE_LIMIT,
  roomLimit: config.EXECUTION_ROOM_RATE_LIMIT,
})
const executionProvider = new PistonExecutionProvider({
  executeUrl: config.PISTON_EXECUTE_URL,
  ...(config.PISTON_AUTHORIZATION ? { authorization: config.PISTON_AUTHORIZATION } : {}),
})
const executionService = new ExecutionService(
  roomRepository,
  executionProvider,
  languageRegistry,
  executionGuard,
  {
    maxSourceBytes: config.EXECUTION_MAX_SOURCE_BYTES,
    maxStdinBytes: config.EXECUTION_MAX_STDIN_BYTES,
    maxOutputBytes: config.EXECUTION_MAX_OUTPUT_BYTES,
    timeoutMs: config.EXECUTION_TIMEOUT_MS,
  },
  clock,
  eventPublisher,
)
const exportService = new SessionExportService(roomRepository, collaborationRepository, documentStore, languageRegistry, featureLimiter)

// ── Computed origin sets ──
const corsOrigins = parseOrigins(config.CORS_ORIGIN)
const wsOrigins = allowedWsOrigins(config)
const safeEndpoint = (raw: string) => {
  const endpoint = new URL(raw)
  endpoint.username = ''
  endpoint.password = ''
  endpoint.search = ''
  endpoint.hash = ''
  return endpoint.toString()
}

const app = await buildApp({
  authService,
  roomService,
  executionService,
  socialService,
  collaborationService,
  exportService,
  userEvents,
  corsOrigin: config.CORS_ORIGIN,
  logger: { level: config.LOG_LEVEL },
  readinessCheck: async () => {
    const { error } = await supabase.from('coding_sessions').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) throw new Error('Supabase readiness probe failed')
  },
})
const realtime = createRealtimeServer({
  port: config.HOCUSPOCUS_PORT,
  address: config.HOST,
  authService,
  roomRepository,
  documentStore,
  disconnectGraceMs: config.DISCONNECT_GRACE_MS,
  eventPublisher,
  allowedOrigins: wsOrigins,
})

await app.listen({ host: config.HOST, port: config.PORT })
await realtime.listen()

// ── Startup banner ──
app.log.info({
  env: config.NODE_ENV,
  httpPort: config.PORT,
  wsPort: config.HOCUSPOCUS_PORT,
  corsOrigins,
  wsOrigins,
  supabaseUrl: safeEndpoint(config.SUPABASE_URL),
  pistonUrl: safeEndpoint(config.PISTON_EXECUTE_URL),
}, 'Space2Code backend started')

// ── Graceful shutdown ──
let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'Shutting down Space2Code backend')

  // 1. Stop accepting new HTTP connections
  const httpClose = app.close().catch((error) => app.log.error(error, 'HTTP close error'))

  // 2. Close Hocuspocus / WebSocket (completes pending Yjs persistence)
  const realtimeClose = realtime.destroy().catch((error) => app.log.error(error, 'Realtime close error'))

  await Promise.allSettled([httpClose, realtimeClose])
  app.log.info('Space2Code backend shutdown complete')
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutdown(signal))
}

// ── Uncaught error handlers ──
process.on('uncaughtException', (error) => {
  app.log.fatal(error, 'Uncaught exception')
  void shutdown('uncaughtException').then(() => process.exit(1))
})

process.on('unhandledRejection', (reason) => {
  app.log.fatal({ reason }, 'Unhandled rejection')
  void shutdown('unhandledRejection').then(() => process.exit(1))
})
