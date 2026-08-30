import { describe, expect, it } from 'vitest'

import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import {
  RoomService, type Clock, type RoomEvent, type RoomEventPublisher, type TimerScheduler,
} from '../src/rooms/service.js'

const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const userC = '00000000-0000-4000-8000-000000000003'

class MutableClock implements Clock {
  constructor(public current: Date) {}
  now(): Date { return new Date(this.current) }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms) }
}

class CapturingEvents implements RoomEventPublisher {
  readonly events: RoomEvent[] = []
  async publish(_roomId: string, event: RoomEvent): Promise<void> { this.events.push(event) }
}

class CapturingScheduler implements TimerScheduler {
  callback: (() => Promise<void>) | null = null
  schedule(_roomId: string, _endsAt: Date, callback: () => Promise<void>): void { this.callback = callback }
}

describe('persisted session state', () => {
  it('keeps ended work in recent sessions but blocks active reconnect', async () => {
    const { repository, service, room } = await liveRoom()
    await repository.setPresence(room.id, userB, false)
    expect((await service.join(userB, room.roomCode)).participants.find((p) => p.userId === userB)?.slot).toBe('B')
    await service.leave(userA, room.id)

    await expect(service.join(userB, room.roomCode)).rejects.toMatchObject({ code: 'ROOM_ENDED' })
    expect(await service.recent(userB)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: room.id, status: 'ended', canReconnect: false, canReopen: true }),
    ]))
  })

  it('creates a new reserved room from ended work instead of reviving the old room', async () => {
    const { service, room } = await liveRoom()
    await service.updateQuestion(userA, room.id, 'A question')
    await service.updateQuestion(userB, room.id, 'B question')
    await service.leave(userA, room.id)

    const resumed = await service.resume(userB, room.id)
    expect(resumed).toMatchObject({
      status: 'waiting', resumedFromSessionId: room.id, resumePartnerId: userA,
      questions: { A: 'B question', B: 'A question' },
    })
    await expect(service.join(userC, resumed.roomCode)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await service.join(userA, resumed.roomCode)).status).toBe('live')
  })

  it('lets each participant update only their own question slot', async () => {
    const { service, room } = await liveRoom()
    await service.updateQuestion(userA, room.id, 'Alpha')
    const viewedByB = await service.get(userB, room.id)
    expect(viewedByB.questions).toEqual({ A: 'Alpha', B: null })

    await service.updateQuestion(userB, room.id, 'Beta')
    expect((await service.get(userA, room.id)).questions).toEqual({ A: 'Alpha', B: 'Beta' })
  })
})

describe('shared timer', () => {
  it('allows either participant to start once and rejects partner modification', async () => {
    const clock = new MutableClock(new Date('2026-08-29T10:00:00.000Z'))
    const events = new CapturingEvents()
    const scheduler = new CapturingScheduler()
    const { repository, room } = await baseLiveRoom(clock)
    const service = new RoomService(repository, clock, events, { minSeconds: 60, maxSeconds: 600 }, scheduler)

    const timer = await service.startTimer(userB, room.id, 120)
    expect(timer).toMatchObject({ status: 'running', durationSeconds: 120, startedBy: userB })
    await expect(service.startTimer(userA, room.id, 180)).rejects.toMatchObject({ code: 'TIMER_ALREADY_STARTED' })
  })

  it('survives service reload and expires without ending or locking the session', async () => {
    const clock = new MutableClock(new Date('2026-08-29T10:00:00.000Z'))
    const events = new CapturingEvents()
    const scheduler = new CapturingScheduler()
    const { repository, room } = await baseLiveRoom(clock)
    const service = new RoomService(repository, clock, events, { minSeconds: 60, maxSeconds: 600 }, scheduler)
    const permissionRequest = await service.requestPermission(userB, room.id, userA)
    await service.grantPermission(userA, room.id, permissionRequest.id, 'session')
    await service.startTimer(userA, room.id, 60)
    clock.advance(61_000)

    const reloaded = new RoomService(repository, clock, events, { minSeconds: 60, maxSeconds: 600 }, scheduler)
    const state = await reloaded.get(userB, room.id)
    expect(state.timer.status).toBe('expired')
    expect(state.status).toBe('live')
    expect(await repository.hasWritePermission(room.id, userA, userB)).toBe(true)
    expect(scheduler.callback).not.toBeNull()
    await scheduler.callback?.()
    expect(events.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'timer.expired' })]))
  })

  it('validates timer duration without waiting', async () => {
    const clock = new MutableClock(new Date())
    const { repository, room } = await baseLiveRoom(clock)
    const service = new RoomService(repository, clock, undefined, { minSeconds: 60, maxSeconds: 600 })
    await expect(service.startTimer(userA, room.id, 59)).rejects.toMatchObject({ code: 'INVALID_TIMER_DURATION' })
    await expect(service.startTimer(userA, room.id, 601)).rejects.toMatchObject({ code: 'INVALID_TIMER_DURATION' })
  })
})

async function liveRoom() {
  const clock = new MutableClock(new Date())
  const { repository, room } = await baseLiveRoom(clock)
  return { repository, service: new RoomService(repository, clock), room }
}

async function baseLiveRoom(clock: Clock) {
  const repository = new InMemoryRoomRepository()
  const service = new RoomService(repository, clock)
  const room = await service.create(userA, 'python')
  await service.join(userB, room.roomCode)
  return { repository, room }
}
