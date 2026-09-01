import { describe, expect, it } from 'vitest'

import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService } from '../src/rooms/service.js'

const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const userC = '00000000-0000-4000-8000-000000000003'

describe('RoomService', () => {
  it('creates one A slot, admits exactly one B slot, and rejects a third user', async () => {
    const repository = new InMemoryRoomRepository()
    const service = new RoomService(repository)

    const waiting = await service.create(userA, ' TypeScript ')
    expect(waiting.status).toBe('waiting')
    expect(waiting.language).toBe('typescript')
    expect(waiting.participants).toMatchObject([{ userId: userA, slot: 'A' }])

    const live = await service.join(userB, waiting.roomCode)
    expect(live.status).toBe('live')
    expect(live.participants).toHaveLength(2)
    await expect(service.join(userC, waiting.roomCode)).rejects.toMatchObject({ code: 'ROOM_FULL' })
  })

  it('reserves a disconnected slot and permits the same user to reconnect', async () => {
    const repository = new InMemoryRoomRepository()
    const service = new RoomService(repository)
    const room = await service.create(userA, 'python')
    await service.join(userB, room.roomCode)

    await repository.setPresence(room.id, userB, false)
    const rejoined = await service.join(userB, room.roomCode)

    expect(rejoined.participants.find((participant) => participant.userId === userB)?.slot).toBe('B')
    await expect(service.join(userC, room.roomCode)).rejects.toMatchObject({ code: 'ROOM_FULL' })
  })

  it('ends the room when a participant explicitly leaves', async () => {
    const repository = new InMemoryRoomRepository()
    const service = new RoomService(repository)
    const room = await service.create(userA, 'rust')
    await service.join(userB, room.roomCode)

    const ended = await service.leave(userB, room.id)
    expect(ended).toMatchObject({ status: 'ended', endedBy: userB, endedReason: 'partner_left' })
    await expect(service.join(userB, room.roomCode)).rejects.toMatchObject({ code: 'ROOM_ENDED' })
  })

  it('grants only by the owner and consumes one-time access', async () => {
    const repository = new InMemoryRoomRepository()
    const service = new RoomService(repository)
    const room = await service.create(userA, 'go')
    await service.join(userB, room.roomCode)
    const request = await service.requestPermission(userB, room.id, userA)

    await expect(service.grantPermission(userB, room.id, request.id, 'once'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
    await service.grantPermission(userA, room.id, request.id, 'once')
    expect(await repository.hasWritePermission(room.id, userA, userB)).toBe(true)
    expect(await repository.consumeOncePermission(room.id, userA, userB)).toBe(true)
    expect(await repository.hasWritePermission(room.id, userA, userB)).toBe(false)
  })

  it('hydrates pending and active permission state and lets only the owner deny', async () => {
    const repository = new InMemoryRoomRepository()
    const events: Array<{ type: string }> = []
    const service = new RoomService(repository, undefined, { publish: async (_roomId, event) => { events.push(event) } })
    const room = await service.create(userA, 'python')
    await service.join(userB, room.roomCode)

    const request = await service.requestPermission(userB, room.id, userA)
    expect(await service.permissionState(userA, room.id)).toMatchObject({ requests: [{ id: request.id }], permissions: [] })
    await expect(service.denyPermission(userB, room.id, request.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await service.denyPermission(userA, room.id, request.id)
    expect(await service.permissionState(userB, room.id)).toEqual({ requests: [], permissions: [] })

    const next = await service.requestPermission(userB, room.id, userA)
    await service.grantPermission(userA, room.id, next.id, 'session')
    expect((await service.permissionState(userB, room.id)).permissions).toMatchObject([
      { editorOwnerId: userA, granteeId: userB, scope: 'session' },
    ])
    expect(events.map((event) => event.type)).toEqual([
      'permission.requested', 'permission.changed', 'permission.requested', 'permission.changed',
    ])
  })

  it('publishes typing as an ephemeral participant event without repository writes', async () => {
    const repository = new InMemoryRoomRepository()
    const events: Array<{ type: string; userId?: string; isTyping?: boolean }> = []
    const service = new RoomService(repository, undefined, { publish: async (_roomId, event) => { events.push(event) } })
    const room = await service.create(userA, 'python')
    await service.join(userB, room.roomCode)

    await service.setTyping(userB, room.id, true)
    await service.setTyping(userB, room.id, false)

    expect(events).toMatchObject([
      { type: 'participant.typing', userId: userB, isTyping: true },
      { type: 'participant.typing', userId: userB, isTyping: false },
    ])
    await expect(service.setTyping(userC, room.id, true)).rejects.toMatchObject({ code: 'NOT_A_PARTICIPANT' })
  })
})
