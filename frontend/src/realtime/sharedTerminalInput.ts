// One ordered, session-local input channel, carried by the Desk A provider.
// Independent of Monaco models, awareness identities, and code write grants.
export function createSharedTerminalInput(options: {
  roomId: string;
  send: (payload: string) => void;
  read: () => string;
  apply: (stdin: string) => void;
  subscribe: (listener: () => void) => () => void;
  onError: (message: string) => void;
}) {
  const clientId = crypto.randomUUID();
  let sequence = 0, acknowledged = 0, revision = -1;
  let connected = false, applying = false, previous = options.read();
  const sendInput = () => options.send(JSON.stringify({ type: 'terminal.input', stdin: options.read(), clientId, sequence }));
  const unsubscribe = options.subscribe(() => {
    const next = options.read();
    if (next === previous) return;
    previous = next;
    if (applying) return;
    sequence++;
    if (connected) sendInput();
  });
  return {
    connect() {
      connected = true;
      revision = -1; // The server's session-local state may have been recreated.
      if (sequence > acknowledged) sendInput();
      else options.send(JSON.stringify({ type: 'terminal.input.sync' }));
    },
    disconnect() { connected = false; },
    receive(payload: string): boolean {
      let value;
      try { value = JSON.parse(payload); } catch { return false; }
      if (value?.type !== 'terminal.input' && value?.type !== 'terminal.input.error') return false;
      if (value.roomId !== options.roomId) return true;
      if (value.type === 'terminal.input.error') {
        if (value.clientId === clientId && value.sequence === sequence) {
          acknowledged = sequence;
          options.onError(String(value.message));
        }
        return true;
      }
      if (typeof value.stdin !== 'string' || !Number.isSafeInteger(value.revision) || value.revision <= revision) return true;
      revision = value.revision;
      if (value.clientId === clientId) acknowledged = Math.max(acknowledged, value.sequence);
      // Older echoes must not replace characters entered since that request.
      if (sequence > acknowledged) return true;
      applying = true;
      try { options.apply(value.stdin); } finally { applying = false; }
      return true;
    },
    destroy: unsubscribe,
  };
}
