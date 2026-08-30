import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  HOCUSPOCUS_PORT: z.coerce.number().int().min(1).max(65_535).default(4_001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DISCONNECT_GRACE_MS: z.coerce.number().int().min(0).default(5_000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ALLOWED_WS_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PISTON_EXECUTE_URL: z.string().url(),
  PISTON_AUTHORIZATION: z.string().optional(),
  PISTON_PYTHON_VERSION: z.string().default('*'),
  PISTON_JAVA_VERSION: z.string().default('*'),
  PISTON_C_VERSION: z.string().default('*'),
  PISTON_CPP_VERSION: z.string().default('*'),
  PISTON_JAVASCRIPT_VERSION: z.string().default('*'),
  EXECUTION_MAX_SOURCE_BYTES: z.coerce.number().int().positive().default(65_536),
  EXECUTION_MAX_STDIN_BYTES: z.coerce.number().int().nonnegative().default(16_384),
  EXECUTION_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(65_536),
  EXECUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  EXECUTION_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  EXECUTION_USER_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  EXECUTION_ROOM_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  TIMER_MIN_SECONDS: z.coerce.number().int().positive().default(60),
  TIMER_MAX_SECONDS: z.coerce.number().int().positive().default(14_400),
})

export type AppConfig = z.infer<typeof envSchema>

/** Parse and normalize comma-separated browser origins. Paths, wildcards and credentials are rejected. */
export function parseOrigins(raw: string): string[] {
  const values = raw.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (values.length === 0) throw new Error('At least one allowed browser origin is required')
  const normalized = values.map((value) => {
    if (value === '*') throw new Error('Wildcard origins are not allowed')
    let url: URL
    try { url = new URL(value) }
    catch { throw new Error(`Invalid browser origin: ${value}`) }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`Invalid browser origin: ${value}`)
    }
    return url.origin
  })
  return [...new Set(normalized)]
}

/**
 * Return the combined set of allowed origins for WebSocket connections.
 * Falls back to CORS_ORIGIN origins if ALLOWED_WS_ORIGINS is not set.
 */
export function allowedWsOrigins(config: AppConfig): string[] {
  const raw = config.ALLOWED_WS_ORIGINS?.trim()
  return raw ? parseOrigins(raw) : parseOrigins(config.CORS_ORIGIN)
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = envSchema.parse(environment)
  parseOrigins(config.CORS_ORIGIN)
  allowedWsOrigins(config)
  validateProductionConfig(config)
  return config
}

const localhostPatterns = ['localhost', '127.0.0.1', '0.0.0.0']
function looksLocal(url: string): boolean {
  try { return localhostPatterns.some((pattern) => new URL(url).hostname.includes(pattern)) }
  catch { return false }
}

function validateProductionConfig(config: AppConfig): void {
  if (config.NODE_ENV !== 'production') return
  const errors: string[] = []
  if (looksLocal(config.SUPABASE_URL)) {
    errors.push('SUPABASE_URL points to localhost in production')
  }
  if (parseOrigins(config.CORS_ORIGIN).some(looksLocal)) {
    errors.push('CORS_ORIGIN contains a localhost origin in production')
  }
  if (allowedWsOrigins(config).some(looksLocal)) {
    errors.push('ALLOWED_WS_ORIGINS contains a localhost origin in production')
  }
  if (/^(replace-me|changeme|your-|test)/i.test(config.SUPABASE_SERVICE_ROLE_KEY)) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is an obvious placeholder in production')
  }
  if (errors.length > 0) {
    throw new Error(`Production configuration errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }
}
