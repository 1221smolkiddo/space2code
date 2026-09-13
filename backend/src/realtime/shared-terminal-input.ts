import { z } from 'zod'

const request = z.discriminatedUnion('type', [
  z.object({ type: z.literal('terminal.input.sync') }),
  z.object({ type: z.literal('terminal.input'), stdin: z.string(), clientId: z.string().uuid(), sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
])
interface Snapshot { type: 'terminal.input'; roomId: string; stdin: string; revision: number; clientId: string | null; sequence: number }

// Session-local like execution output; never stored in a personal code document.
export class SharedTerminalInputs {
  private readonly rooms = new Map<string, Snapshot>()
  private readonly sequences = new WeakMap<object, number>()
  constructor(private readonly maxBytes = 16_384) {}

  handle(roomId: string, connection: object, payload: string, reply: (payload: string) => void, broadcast: (payload: string) => void): void {
    let value: unknown
    try { value = JSON.parse(payload) } catch { return }
    const parsed = request.safeParse(value)
    if (!parsed.success) return
    const input = parsed.data
    const current = this.rooms.get(roomId) ?? { type: 'terminal.input' as const, roomId, stdin: '', revision: 0, clientId: null, sequence: 0 }
    if (input.type === 'terminal.input.sync') { reply(JSON.stringify(current)); return }
    if (Buffer.byteLength(input.stdin, 'utf8') > this.maxBytes) {
      reply(JSON.stringify({ type: 'terminal.input.error', roomId, clientId: input.clientId, sequence: input.sequence, message: 'Shared input exceeds the execution input limit.' }))
      return
    }
    if (input.sequence <= (this.sequences.get(connection) ?? 0)) { reply(JSON.stringify(current)); return }
    this.sequences.set(connection, input.sequence)
    const next: Snapshot = { ...input, roomId, revision: current.revision + 1 }
    this.rooms.set(roomId, next)
    broadcast(JSON.stringify(next))
  }

  remove(roomId: string): void { this.rooms.delete(roomId) }
}
