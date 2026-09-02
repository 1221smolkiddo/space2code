import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import type { AuthService } from '../src/auth/auth-service.js'
import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService } from '../src/rooms/service.js'

const authService: AuthService = {
  async verifyAccessToken(token) {
    if (!token.startsWith('user:')) throw new Error('bad token')
    return { id: token.slice(5), email: null }
  },
}

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => Promise.all(openApps.splice(0).map((app) => app.close())))

describe('room HTTP API', () => {
  it('requires a bearer token', async () => {
    const app = await testApp()
    const response = await app.inject({ method: 'POST', url: '/v1/rooms', payload: { language: 'ts' } })
    expect(response.statusCode).toBe(401)
  })

  it('creates and joins a room through authenticated APIs', async () => {
    const app = await testApp()
    const userA = '00000000-0000-4000-8000-000000000001'
    const userB = '00000000-0000-4000-8000-000000000002'
    const created = await app.inject({
      method: 'POST', url: '/v1/rooms', headers: auth(userA), payload: { language: 'Python' },
    })
    expect(created.statusCode).toBe(201)
    const createdBody = created.json()
    expect(createdBody.documents.userA).toBe(`room:${createdBody.room.id}:userA:code`)

    const joined = await app.inject({
      method: 'POST', url: '/v1/rooms/join', headers: auth(userB),
      payload: { roomCode: createdBody.room.roomCode },
    })
    expect(joined.statusCode).toBe(200)
    expect(joined.json().room).toMatchObject({ status: 'live', language: 'python' })
  })

  it('exposes Phase 2 question, timer, recent, and resume routes', async () => {
    const app = await testApp()
    const userA = '00000000-0000-4000-8000-000000000001'
    const userB = '00000000-0000-4000-8000-000000000002'
    const created = await app.inject({
      method: 'POST', url: '/v1/rooms', headers: auth(userA), payload: { language: 'python' },
    })
    const original = created.json().room
    await app.inject({
      method: 'POST', url: '/v1/rooms/join', headers: auth(userB), payload: { roomCode: original.roomCode },
    })

    await app.inject({
      method: 'PATCH', url: `/v1/rooms/${original.id}/question`, headers: auth(userA),
      payload: { question: 'Question A' },
    })
    const questionB = await app.inject({
      method: 'PATCH', url: `/v1/rooms/${original.id}/question`, headers: auth(userB),
      payload: { question: 'Question B' },
    })
    expect(questionB.json().room.questions).toEqual({ A: 'Question A', B: 'Question B' })

    const timer = await app.inject({
      method: 'POST', url: `/v1/rooms/${original.id}/timer`, headers: auth(userB),
      payload: { durationSeconds: 300 },
    })
    expect(timer.statusCode).toBe(201)
    expect(timer.json().timer).toMatchObject({ status: 'running', startedBy: userB })
    const timerChange = await app.inject({
      method: 'POST', url: `/v1/rooms/${original.id}/timer`, headers: auth(userA),
      payload: { durationSeconds: 600 },
    })
    expect(timerChange.statusCode).toBe(409)

    await app.inject({ method: 'POST', url: `/v1/rooms/${original.id}/leave`, headers: auth(userA) })
    const recent = await app.inject({ method: 'GET', url: '/v1/sessions/recent', headers: auth(userB) })
    expect(recent.json().sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: original.id, canReopen: true, canReconnect: false }),
    ]))
    const removed = await app.inject({
      method: 'DELETE', url: `/v1/sessions/recent/${original.id}`, headers: auth(userA),
    })
    expect(removed.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/v1/sessions/recent', headers: auth(userA) })).json().sessions).toEqual([])
    expect((await app.inject({ method: 'GET', url: '/v1/sessions/recent', headers: auth(userB) })).json().sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: original.id }),
    ]))
    const resumed = await app.inject({
      method: 'POST', url: `/v1/sessions/${original.id}/resume`, headers: auth(userB),
    })
    expect(resumed.statusCode).toBe(201)
    expect(resumed.json().room).toMatchObject({ status: 'waiting', resumedFromSessionId: original.id })
  })
})

async function testApp() {
  const app = await buildApp({
    authService,
    roomService: new RoomService(new InMemoryRoomRepository()),
    corsOrigin: 'http://localhost:5173',
    logger: false,
  })
  openApps.push(app)
  return app
}

function auth(userId: string) {
  return { authorization: `Bearer user:${userId}` }
}
