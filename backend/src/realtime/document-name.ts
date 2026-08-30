import type { Slot } from '../rooms/types.js'

const documentPattern = /^room:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):user([AB]):code$/i

export interface ParsedDocumentName {
  roomId: string
  ownerSlot: Slot
}

export function parseDocumentName(name: string): ParsedDocumentName | null {
  const match = name.match(documentPattern)
  if (!match?.[1] || (match[2] !== 'A' && match[2] !== 'B')) return null
  return { roomId: match[1].toLowerCase(), ownerSlot: match[2] }
}

export function editorDocumentName(roomId: string, slot: Slot): string {
  return `room:${roomId}:user${slot}:code`
}
