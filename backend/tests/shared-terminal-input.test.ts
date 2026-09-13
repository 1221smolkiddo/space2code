import { describe, expect, it, vi } from 'vitest'
import { SharedTerminalInputs } from '../src/realtime/shared-terminal-input.js'

const clientId = '00000000-0000-4000-8000-000000000001'
describe('shared terminal input protocol', () => {
  it('orders accepted edits, ignores duplicates, and isolates rooms', () => {
    const inputs = new SharedTerminalInputs(), connection = {}, reply = vi.fn(), broadcast = vi.fn()
    const edit = (sequence: number, stdin: string) => inputs.handle('room-a', connection, JSON.stringify({ type: 'terminal.input', sequence, stdin, clientId }), reply, broadcast)
    edit(2, 'Alice\n21\n'); edit(1, 'stale'); edit(2, 'duplicate')
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(JSON.parse(broadcast.mock.calls[0]![0])).toMatchObject({ stdin: 'Alice\n21\n', revision: 1 })
    inputs.handle('room-b', {}, JSON.stringify({ type: 'terminal.input.sync' }), reply, broadcast)
    expect(JSON.parse(reply.mock.calls.at(-1)![0]).stdin).toBe('')
    inputs.remove('room-a')
    inputs.handle('room-a', {}, JSON.stringify({ type: 'terminal.input.sync' }), reply, broadcast)
    expect(JSON.parse(reply.mock.calls.at(-1)![0]).stdin).toBe('')
  })

  it('rejects malformed messages and enforces the execution byte limit without replacing shared input', () => {
    const inputs = new SharedTerminalInputs(4), reply = vi.fn(), broadcast = vi.fn()
    for (const payload of ['bad', '{}', JSON.stringify({ type: 'terminal.input', stdin: 'x', clientId, sequence: -1 })]) inputs.handle('room', {}, payload, reply, broadcast)
    expect(reply).not.toHaveBeenCalled()
    inputs.handle('room', {}, JSON.stringify({ type: 'terminal.input', stdin: 'ééé', clientId, sequence: 1 }), reply, broadcast)
    expect(JSON.parse(reply.mock.calls[0]![0]).type).toBe('terminal.input.error')
    expect(broadcast).not.toHaveBeenCalled()
  })
})
