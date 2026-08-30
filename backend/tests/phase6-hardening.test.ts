import { afterEach, describe, expect, it } from 'vitest'

import { buildApp, HTTP_BODY_LIMIT_BYTES } from '../src/app.js'
import type { AuthService } from '../src/auth/auth-service.js'
import { loadConfig, parseOrigins } from '../src/config/env.js'
import { FeatureError } from '../src/features/errors.js'
import { InMemoryActionRateLimiter } from '../src/features/rate-limiter.js'
import { assertAllowedWebSocketOrigin } from '../src/realtime/server.js'
import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService } from '../src/rooms/service.js'
import { isAllowedEventOrigin } from '../src/social/routes.js'

const authService:AuthService={verifyAccessToken:async()=>({id:'00000000-0000-4000-8000-000000000001',email:null})}
const apps:Awaited<ReturnType<typeof buildApp>>[]=[]
afterEach(async()=>Promise.all(apps.splice(0).map(app=>app.close())))

async function app(){const value=await buildApp({authService,roomService:new RoomService(new InMemoryRoomRepository()),corsOrigin:'https://app.example.com, https://preview.example.com',logger:false});apps.push(value);return value}

describe('Phase 6 environment and origin hardening',()=>{
  it('normalizes multiple explicit origins and rejects malformed or wildcard values',()=>{
    expect(parseOrigins(' https://app.example.com,https://preview.example.com/ ,https://app.example.com')).toEqual(['https://app.example.com','https://preview.example.com'])
    expect(()=>parseOrigins('*')).toThrow('Wildcard')
    expect(()=>parseOrigins('https://app.example.com/path')).toThrow('Invalid browser origin')
  })

  it('rejects obvious production localhost and placeholder configuration',()=>{
    expect(()=>loadConfig({NODE_ENV:'production',SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_SERVICE_ROLE_KEY:'replace-me',PISTON_EXECUTE_URL:'http://piston:2000/api/v2/execute',CORS_ORIGIN:'http://localhost:5173'})).toThrow('Production configuration errors')
    expect(loadConfig({NODE_ENV:'production',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'production-secret-value',PISTON_EXECUTE_URL:'http://piston:2000/api/v2/execute',CORS_ORIGIN:'https://app.example.com'}).NODE_ENV).toBe('production')
  })

  it('accepts configured HTTP origins and rejects unknown browser origins',async()=>{
    const instance=await app()
    const allowed=await instance.inject({method:'GET',url:'/health',headers:{origin:'https://preview.example.com'}})
    expect(allowed.statusCode).toBe(200);expect(allowed.headers['access-control-allow-origin']).toBe('https://preview.example.com')
    const rejected=await instance.inject({method:'GET',url:'/health',headers:{origin:'https://evil.example'}})
    expect(rejected.statusCode).toBe(403);expect(rejected.json()).toMatchObject({error:{code:'FORBIDDEN'}})
  })

  it('accepts/rejects SSE and WebSocket origins with the same exact-origin policy',()=>{
    const origins=['https://app.example.com']
    expect(isAllowedEventOrigin('https://app.example.com',origins)).toBe(true)
    expect(isAllowedEventOrigin('https://evil.example',origins)).toBe(false)
    expect(()=>assertAllowedWebSocketOrigin('https://app.example.com',origins)).not.toThrow()
    expect(()=>assertAllowedWebSocketOrigin('https://evil.example',origins)).toThrow('origin not allowed')
    expect(()=>assertAllowedWebSocketOrigin(null,origins)).toThrow('origin not allowed')
  })
})

describe('Phase 6 HTTP and limiter hardening',()=>{
  it('serves readiness and practical security headers',async()=>{
    const response=await (await app()).inject({method:'GET',url:'/ready'})
    expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({status:'ok'})
    expect(Date.parse(response.json().timestamp)).not.toBeNaN()
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['x-request-id']).toBeTruthy()
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000')
  })

  it('returns 503 when the injected dependency readiness probe fails',async()=>{
    const instance=await buildApp({authService,roomService:new RoomService(new InMemoryRoomRepository()),corsOrigin:'https://app.example.com',logger:false,readinessCheck:async()=>{throw new Error('database unavailable')}});apps.push(instance)
    const response=await instance.inject({method:'GET',url:'/ready'})
    expect(response.statusCode).toBe(503);expect(response.json()).toMatchObject({status:'not_ready'})
  })

  it('rejects bodies over the global defense-in-depth ceiling with a safe 413',async()=>{
    const response=await (await app()).inject({method:'POST',url:'/v1/rooms',headers:{authorization:'Bearer user'},payload:{language:'x'.repeat(HTTP_BODY_LIMIT_BYTES)}})
    expect(response.statusCode).toBe(413);expect(response.json()).toEqual({error:{code:'PAYLOAD_TOO_LARGE',message:'Request body exceeds the application limit'}})
  })

  it('returns an accurate Retry-After header for rate-limit errors',async()=>{
    const instance=await app();instance.get('/test-rate-limit',async()=>{throw new FeatureError('RATE_LIMITED','slow down',7)})
    const response=await instance.inject({method:'GET',url:'/test-rate-limit'})
    expect(response.statusCode).toBe(429);expect(response.headers['retry-after']).toBe('7')
  })

  it('expires attempts and opportunistically sweeps abandoned keys without a timer',()=>{
    const limiter=new InMemoryActionRateLimiter(),start=new Date('2030-01-01T00:00:00Z')
    for(let index=0;index<99;index+=1)limiter.check(`old:${index}`,1,1_000,start)
    expect(limiter.entryCount).toBe(99)
    limiter.check('fresh',1,1_000,new Date(start.getTime()+2_000))
    expect(limiter.entryCount).toBe(1)
    limiter.check('limited',1,5_000,start)
    expect(()=>limiter.check('limited',1,5_000,new Date(start.getTime()+100))).toThrow(expect.objectContaining({code:'RATE_LIMITED',retryAfterSeconds:5}))
  })
})
