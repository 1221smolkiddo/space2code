import type { Hocuspocus } from '@hocuspocus/server'

import { editorDocumentName } from './document-name.js'
import type { RoomEvent, RoomEventPublisher } from '../rooms/service.js'

export interface RealtimeEventEnvelope {
  version: 1
  roomId: string
  event: RoomEvent
}

export class HocuspocusRoomEventPublisher implements RoomEventPublisher {
  private hocuspocus: Hocuspocus | null = null

  attach(hocuspocus: Hocuspocus): void {
    this.hocuspocus = hocuspocus
  }

  async publish(roomId: string, event: RoomEvent): Promise<void> {
    if (!this.hocuspocus) return
    const payload = JSON.stringify({ version: 1, roomId, event } satisfies RealtimeEventEnvelope)
    for (const slot of ['A', 'B'] as const) {
      this.hocuspocus.documents.get(editorDocumentName(roomId, slot))?.broadcastStateless(payload)
    }
  }
}
