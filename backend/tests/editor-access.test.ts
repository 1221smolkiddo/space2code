import { describe,expect,it } from 'vitest'
import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService } from '../src/rooms/service.js'
import { resolveEditorAuthority } from '../src/realtime/editor-access.js'

const userA='00000000-0000-4000-8000-000000000001',userB='00000000-0000-4000-8000-000000000002'

describe('editor slot authority',()=>{
  it('keeps A and B ownership stable and grants only the requested opposite desk',async()=>{
    const repository=new InMemoryRoomRepository(),service=new RoomService(repository)
    const waiting=await service.create(userA,'python'),room=await service.join(userB,waiting.roomCode)
    await expect(resolveEditorAuthority(repository,room,'A',userA)).resolves.toMatchObject({ownerId:userA,ownerSlot:'A',isOwner:true,canWrite:true})
    await expect(resolveEditorAuthority(repository,room,'B',userB)).resolves.toMatchObject({ownerId:userB,ownerSlot:'B',isOwner:true,canWrite:true})
    await expect(resolveEditorAuthority(repository,room,'A',userB)).resolves.toMatchObject({ownerId:userA,isOwner:false,canWrite:false})
    await expect(resolveEditorAuthority(repository,room,'B',userA)).resolves.toMatchObject({ownerId:userB,isOwner:false,canWrite:false})

    const forB=await service.requestPermission(userA,room.id,userB);await service.grantPermission(userB,room.id,forB.id,'session')
    const forA=await service.requestPermission(userB,room.id,userA);await service.grantPermission(userA,room.id,forA.id,'session')
    await expect(resolveEditorAuthority(repository,room,'B',userA)).resolves.toMatchObject({ownerId:userB,isOwner:false,canWrite:true})
    await expect(resolveEditorAuthority(repository,room,'A',userB)).resolves.toMatchObject({ownerId:userA,isOwner:false,canWrite:true})

    await service.revokePermission(userB,room.id,userA)
    await expect(resolveEditorAuthority(repository,room,'B',userA)).resolves.toMatchObject({ownerId:userB,isOwner:false,canWrite:false})
  })
})
