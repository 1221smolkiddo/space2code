import { describe, expect, it, vi } from 'vitest'
import { createSharedTerminalInput } from './sharedTerminalInput'

function client() {
  let stdin = '', listener = () => {}
  const send = vi.fn(), error = vi.fn(), unsubscribe = vi.fn()
  const edit = (value: string) => { stdin = value; listener() }
  const channel = createSharedTerminalInput({ roomId: 'room', send, read: () => stdin, apply: edit,
    subscribe: callback => { listener = callback; return unsubscribe }, onError: error })
  const sent = () => JSON.parse(send.mock.calls.at(-1)![0])
  const receive = (value: object) => channel.receive(JSON.stringify({ type: 'terminal.input', roomId: 'room', ...value }))
  return { channel, edit, read: () => stdin, send, sent, receive, error, unsubscribe }
}

describe('shared input channel', () => {
  it('synchronizes exact multiline input both ways, without echoing received changes', () => {
    const a = client(), b = client()
    a.channel.connect(); b.channel.connect()
    expect(a.sent()).toEqual({ type: 'terminal.input.sync' })
    a.edit('Alice\n21\n')
    const first = { ...a.sent(), revision: 1 }
    a.receive(first); b.receive(first)
    expect(a.read()).toBe('Alice\n21\n'); expect(b.read()).toBe(a.read())
    expect(b.send).toHaveBeenCalledTimes(1)
    b.edit('Grace\n22')
    const second = { ...b.sent(), revision: 2 }
    a.receive(second); b.receive(second)
    expect(a.read()).toBe(b.read())
    expect(a.send).toHaveBeenCalledTimes(2)
    a.receive(first)
    expect(a.read()).toBe('Grace\n22')
  })

  it('preserves rapid local typing across older echoes and converges after simultaneous edits', () => {
    const a = client(), b = client()
    a.channel.connect(); b.channel.connect()
    a.edit('A'); const first = a.sent()
    b.edit('B'); const other = b.sent()
    a.edit('Alice'); const latest = a.sent()
    for (const c of [a, b]) {
      c.receive({ ...first, revision: 1 })
      c.receive({ ...other, revision: 2 })
    }
    expect(a.read()).toBe('Alice')
    for (const c of [a, b]) c.receive({ ...latest, revision: 3 })
    expect(b.read()).toBe('Alice')
  })

  it('requests the latest input on reconnect and sends edits made while disconnected', () => {
    const a = client()
    a.channel.connect(); a.channel.disconnect()
    a.edit('offline\ninput')
    expect(a.send).toHaveBeenCalledTimes(1)
    a.channel.connect()
    expect(a.sent().stdin).toBe('offline\ninput')
    a.receive({ ...a.sent(), revision: 1 })
    a.channel.disconnect(); a.channel.connect()
    expect(a.sent().type).toBe('terminal.input.sync')
    a.receive({ stdin: 'partner latest', revision: 2, sequence: 1, clientId: 'partner' })
    expect(a.read()).toBe('partner latest')
    a.channel.destroy()
    expect(a.unsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores other rooms and malformed data and surfaces input-limit errors', () => {
    const a = client()
    a.channel.connect(); a.edit('input')
    const request = a.sent()
    a.receive({ roomId: 'other', stdin: 'wrong', revision: 10 })
    a.receive({ stdin: 42, revision: 12 })
    expect(a.read()).toBe('input')
    expect(a.channel.receive('invalid')).toBe(false)
    a.receive({ ...request, type: 'terminal.input.error', message: 'Too large' })
    expect(a.error).toHaveBeenCalledWith('Too large')
  })
})
