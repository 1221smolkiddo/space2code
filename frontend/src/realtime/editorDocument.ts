import type { Slot } from '../types'

export const editorDocumentName = (roomId: string, slot: Slot): string =>
  `room:${roomId.toLowerCase()}:user${slot}:code`
