import { describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import type { AuthService } from '../src/auth/auth-service.js'
import { ExecutionError } from '../src/execution/errors.js'
import { FakeExecutionProvider, successfulProviderResult } from '../src/execution/fake-provider.js'
import { InMemoryExecutionGuard } from '../src/execution/guard.js'
import { initialLanguageRegistry } from '../src/execution/language-registry.js'
import { ExecutionService } from '../src/execution/service.js'
import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService, type Clock, type RoomEvent } from '../src/rooms/service.js'

const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const userC = '00000000-0000-4000-8000-000000000003'
const versions = { python: '*', java: '*', c: '*', cpp: '*', javascript: '*' }
const clock: Clock = { now: () => new Date('2026-08-29T10:00:00.000Z') }

describe('ExecutionService', () => {
  it('rejects unauthenticated execution at the HTTP boundary', async () => {
    const setup = await liveExecution()
    const authService: AuthService = { verifyAccessToken: async () => { throw new Error('unauthorized') } }
    const app = await buildApp({
      authService,
      roomService: setup.rooms,
      executionService: setup.service,
      corsOrigin: 'http://localhost:5173',
      logger: false,
    })
    const response = await app.inject({
      method: 'POST', url: `/v1/rooms/${setup.roomId}/execute`,
      payload: { language: 'python', source: 'print(1)' },
    })
    await app.close()
    expect(response.statusCode).toBe(401)
  })

  it('rejects a non-member before calling the provider', async () => {
    const setup = await liveExecution()
    await expect(setup.service.execute(request(setup.roomId, userC))).rejects.toMatchObject({
      code: 'NOT_A_PARTICIPANT',
    })
    expect(setup.provider.requests).toHaveLength(0)
  })

  it('rejects a language different from the shared room language', async () => {
    const setup = await liveExecution()
    await expect(setup.service.execute({ ...request(setup.roomId, userA), language: 'java' }))
      .rejects.toMatchObject({ code: 'ROOM_LANGUAGE_MISMATCH' })
  })

  it('rejects unsupported languages', async () => {
    const setup = await liveExecution()
    await expect(setup.service.execute({ ...request(setup.roomId, userA), language: 'ruby' }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' })
  })

  it('enforces source and stdin byte limits', async () => {
    const setup = await liveExecution({ maxSourceBytes: 4, maxStdinBytes: 3 })
    await expect(setup.service.execute({ ...request(setup.roomId, userA), source: '12345' }))
      .rejects.toMatchObject({ code: 'SOURCE_TOO_LARGE' })
    await expect(setup.service.execute({ ...request(setup.roomId, userA), source: '1', stdin: '1234' }))
      .rejects.toMatchObject({ code: 'STDIN_TOO_LARGE' })
  })

  it('returns a normalized successful result', async () => {
    const setup = await liveExecution()
    const result = await setup.service.execute(request(setup.roomId, userA))
    expect(result).toMatchObject({
      status: 'completed', stdout: 'ok\n', stderr: '', compileOutput: '', outputTruncated: false,
      runtime: { language: 'python', version: '3.12.0' },
    })
    expect(setup.provider.requests[0]).toMatchObject({ language: 'python', filename: 'main.py' })
  })

  it('broadcasts complete output only for the room-scoped Explain terminal', async () => {
    const setup = await liveExecution()
    await setup.service.execute({ ...request(setup.roomId, userA), scope: 'explain' })
    const sharedCompleted=setup.events.find((event)=>event.type==='execution.completed')
    expect(sharedCompleted).toMatchObject({type:'execution.completed',scope:'explain',result:{stdout:'ok\n',status:'completed'}})

    setup.events.length=0
    await setup.service.execute({ ...request(setup.roomId, userA), scope: 'personal' })
    const personalCompleted=setup.events.find((event)=>event.type==='execution.completed')
    expect(personalCompleted).toMatchObject({type:'execution.completed',scope:'personal'})
    expect(personalCompleted).not.toHaveProperty('result')
  })

  it('caps total captured output', async () => {
    const setup = await liveExecution({ maxOutputBytes: 4 })
    setup.provider.result = successfulProviderResult('abcdef')
    expect(await setup.service.execute(request(setup.roomId, userA))).toMatchObject({
      status: 'output_limited', stdout: 'abcd', outputTruncated: true,
    })
  })

  it('turns provider failures into a controlled error', async () => {
    const setup = await liveExecution()
    setup.provider.error = new Error('private upstream details')
    await expect(setup.service.execute(request(setup.roomId, userA))).rejects.toMatchObject({
      code: 'EXECUTION_PROVIDER_UNAVAILABLE', message: 'Execution provider is unavailable',
    })
  })

  it('enforces per-user concurrency while an execution is pending', async () => {
    const setup = await liveExecution()
    let releaseProvider!: () => void
    setup.provider.waitFor = new Promise<void>((resolve) => { releaseProvider = resolve })
    const first = setup.service.execute(request(setup.roomId, userA))
    await until(() => setup.provider.requests.length === 1)

    await expect(setup.service.execute(request(setup.roomId, userA))).rejects.toMatchObject({
      code: 'EXECUTION_CONCURRENCY_LIMITED',
    })
    releaseProvider()
    await first
  })

  it('enforces independent per-user and per-room rate limits', async () => {
    const userLimited = await liveExecution({}, { userLimit: 1, roomLimit: 10 })
    await userLimited.service.execute(request(userLimited.roomId, userA))
    await expect(userLimited.service.execute(request(userLimited.roomId, userA))).rejects.toMatchObject({
      code: 'EXECUTION_RATE_LIMITED',
    })

    const roomLimited = await liveExecution({}, { userLimit: 10, roomLimit: 1 })
    await roomLimited.service.execute(request(roomLimited.roomId, userA))
    await expect(roomLimited.service.execute(request(roomLimited.roomId, userB))).rejects.toMatchObject({
      code: 'EXECUTION_RATE_LIMITED',
    })
  })
})

async function liveExecution(
  limitOverrides: Partial<{ maxSourceBytes: number; maxStdinBytes: number; maxOutputBytes: number; timeoutMs: number }> = {},
  guardOverrides: Partial<{ userLimit: number; roomLimit: number }> = {},
) {
  const repository = new InMemoryRoomRepository()
  const rooms = new RoomService(repository, clock)
  const room = await rooms.create(userA, 'python')
  await rooms.join(userB, room.roomCode)
  const provider = new FakeExecutionProvider()
  const guard = new InMemoryExecutionGuard({
    windowMs: 60_000, userLimit: guardOverrides.userLimit ?? 10, roomLimit: guardOverrides.roomLimit ?? 30,
  })
  const events:RoomEvent[]=[]
  const service = new ExecutionService(
    repository, provider, initialLanguageRegistry(versions), guard,
    {
      maxSourceBytes: limitOverrides.maxSourceBytes ?? 64,
      maxStdinBytes: limitOverrides.maxStdinBytes ?? 64,
      maxOutputBytes: limitOverrides.maxOutputBytes ?? 64,
      timeoutMs: limitOverrides.timeoutMs ?? 1_000,
    },
    clock,
    {publish:async(_roomId,event)=>{events.push(event)}},
  )
  return { roomId: room.id, provider, service, rooms, events }
}

function request(roomId: string, userId: string) {
  return { roomId, userId, language: 'python', source: 'print(1)', stdin: '' }
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new ExecutionError('EXECUTION_PROVIDER_UNAVAILABLE', 'Test provider did not start')
}
