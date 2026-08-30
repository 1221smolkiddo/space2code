import { afterEach, describe, expect, it, vi } from 'vitest'

import { editorDocumentName, parseDocumentName } from '../src/realtime/document-name.js'
import { PresenceTracker } from '../src/realtime/presence-tracker.js'
import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService } from '../src/rooms/service.js'

afterEach(() => vi.useRealTimers())

describe('realtime document names', () => {
  it('keeps the two editors as distinct documents in one room', () => {
    const roomId = '00000000-0000-4000-8000-000000000001'
    expect(parseDocumentName(editorDocumentName(roomId, 'A'))).toEqual({ roomId, ownerSlot: 'A' })
    expect(parseDocumentName(editorDocumentName(roomId, 'B'))).toEqual({ roomId, ownerSlot: 'B' })
  })

  it('rejects documents outside the room naming contract', () => {
    expect(parseDocumentName('room:not-a-uuid:userA:code')).toBeNull()
    expect(parseDocumentName('room:00000000-0000-4000-8000-000000000001:userC:code')).toBeNull()
  })

  it('reference counts both editor connections before marking a user disconnected', async () => {
    vi.useFakeTimers()
    const repository = new InMemoryRoomRepository()
    const service = new RoomService(repository)
    const userA = '00000000-0000-4000-8000-000000000001'
    const userB = '00000000-0000-4000-8000-000000000002'
    const room = await service.create(userA, 'typescript')
    await service.join(userB, room.roomCode)
    const presence = new PresenceTracker(repository, 5_000)

    await presence.connect(room.id, userA)
    await presence.connect(room.id, userA)
    presence.disconnect(room.id, userA)
    await vi.advanceTimersByTimeAsync(5_001)
    expect((await service.get(userA, room.id)).participants[0]?.state).toBe('connected')

    presence.disconnect(room.id, userA)
    await vi.advanceTimersByTimeAsync(5_001)
    expect((await service.get(userA, room.id)).participants[0]?.state).toBe('disconnected')
    presence.destroy()
  })
})
