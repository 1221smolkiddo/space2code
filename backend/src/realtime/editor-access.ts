import type { RoomRepository } from '../rooms/repository.js'
import type { Room, Slot } from '../rooms/types.js'

export interface EditorAuthority {
  ownerId:string
  ownerSlot:Slot
  isOwner:boolean
  canWrite:boolean
}

export async function resolveEditorAuthority(
  repository:RoomRepository,
  room:Room,
  ownerSlot:Slot,
  userId:string,
):Promise<EditorAuthority>{
  const owner=room.participants.find(participant=>participant.slot===ownerSlot)
  if(!owner)throw new Error('Editor owner has not joined the room')
  const isOwner=owner.userId===userId
  const active=room.status==='waiting'||room.status==='live'
  const canWrite=active&&(isOwner||await repository.hasWritePermission(room.id,owner.userId,userId))
  return{ownerId:owner.userId,ownerSlot,isOwner,canWrite}
}
