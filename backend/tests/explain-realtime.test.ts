
import { describe, expect, it, vi } from 'vitest'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { createRealtimeServer } from '../src/realtime/server.js'
import { InMemoryDocumentStore } from '../src/realtime/document-store.js'
import { editorDocumentName } from '../src/realtime/document-name.js'
import { HocuspocusRoomEventPublisher } from '../src/realtime/events.js'
import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService } from '../src/rooms/service.js'
import { InMemoryCollaborationRepository } from '../src/collaboration/in-memory-repository.js'
import { CollaborationService } from '../src/collaboration/service.js'
import { InMemorySocialRepository } from '../src/social/in-memory-repository.js'
import { InMemoryUserEventHub } from '../src/realtime/user-events.js'
import { InMemoryActionRateLimiter } from '../src/features/rate-limiter.js'

const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002'
const origin='http://localhost:5173'
class BrowserSocket extends WebSocket {
  constructor(url:string){super(url,{origin})}
}
interface Client {
  doc:Y.Doc
  provider:HocuspocusProvider
  socket:HocuspocusProviderWebsocket
  destroy:()=>void
}

describe('two-user realtime after Explain Mode',()=>{
  for(const grantBefore of [false,true]){
    for(const targetSlot of ['A','B'] as const){
      it(`keeps both desks synchronized with grants ${grantBefore?'before':'after'} Explain on ${targetSlot}`,async()=>{
        const repository=new InMemoryRoomRepository(),events=new HocuspocusRoomEventPublisher()
        const rooms=new RoomService(repository,undefined,events)
        const waiting=await rooms.create(A,'python'),room=await rooms.join(B,waiting.roomCode)
        const collaboration=new CollaborationService(new InMemoryCollaborationRepository(repository,new InMemorySocialRepository()),events,new InMemoryUserEventHub(),new InMemoryActionRateLimiter())
        const realtime=createRealtimeServer({
          port:0,address:'127.0.0.1',roomRepository:repository,documentStore:new InMemoryDocumentStore(),
          authService:{verifyAccessToken:async(token)=>{if(token!==A&&token!==B)throw Error('invalid test token');return{id:token,email:null}}},
          disconnectGraceMs:100,eventPublisher:events,allowedOrigins:[origin],
        })
        const clients:Client[]=[]
        const received:string[]=[]
        const open=async(user:string,slot:'A'|'B')=>{
          const doc=new Y.Doc()
          const socket=new HocuspocusProviderWebsocket({url:`ws://127.0.0.1:${realtime.server.address.port}`,WebSocketPolyfill:BrowserSocket,initialDelay:0})
          const provider=new HocuspocusProvider({name:editorDocumentName(room.id,slot),document:doc,token:user,websocketProvider:socket,flushDelay:0,onStateless:({payload})=>received.push(payload)})
          let destroyed=false
          const client={doc,provider,socket,destroy:()=>{if(destroyed)return;destroyed=true;provider.destroy();socket.destroy();doc.destroy()}}
          clients.push(client)
          provider.attach()
          await vi.waitFor(()=>expect(provider.isSynced).toBe(true))
          return client
        }
        const text=(client:Client)=>client.doc.getText('code')
        const insert=async(writer:Client,reader:Client,value:string)=>{
          text(writer).insert(text(writer).length,value)
          await vi.waitFor(()=>expect(text(reader).toString()).toBe(text(writer).toString()))
          await vi.waitFor(()=>expect(writer.provider.hasUnsyncedChanges).toBe(false))
        }
        const grant=async(owner:string,grantee:string)=>{
          const request=await rooms.requestPermission(grantee,room.id,owner)
          await rooms.grantPermission(owner,room.id,request.id,'session')
        }
        const serverDoc=(slot:'A'|'B')=>realtime.server.hocuspocus.documents.get(editorDocumentName(room.id,slot))!
        const assertAuthority=(slot:'A'|'B',user:string,readOnly:boolean)=>{
          expect(serverDoc(slot).getConnections().find(connection=>connection.context.userId===user)?.readOnly).toBe(readOnly)
        }
        try{
          await realtime.listen()
          const aa=await open(A,'A'),ab=await open(A,'B'),ba=await open(B,'A'),bb=await open(B,'B')
          assertAuthority('A',A,false);assertAuthority('B',B,false)
          assertAuthority('A',B,true);assertAuthority('B',A,true)
          await insert(aa,ba,'owner A\n');await insert(bb,ab,'owner B\n')
          if(grantBefore){await grant(A,B);await grant(B,A)}
          await collaboration.activateExplain(room.id,A,targetSlot)
          await vi.waitFor(()=>expect(received.some(payload=>payload.includes('"active":true'))).toBe(true))
          await collaboration.deactivateExplain(room.id,A)
          await vi.waitFor(()=>expect(received.some(payload=>payload.includes('"active":false'))).toBe(true))
          expect((await rooms.get(A,room.id)).participants.map(p=>[p.slot,p.userId])).toEqual([['A',A],['B',B]])
          if(!grantBefore){await grant(A,B);await grant(B,A)}
          await insert(ba,aa,'B edits A after Explain\n')
          await insert(ab,bb,'A edits B after Explain\n')
          assertAuthority('A',B,false);assertAuthority('B',A,false)
          expect(realtime.server.hocuspocus.documents.size).toBe(2)
          expect(serverDoc('A').getConnectionsCount()).toBe(2)
          expect(serverDoc('B').getConnectionsCount()).toBe(2)

          // Reconnect an existing provider, then refresh that participant's Desk B.
          const originalDoc=ab.doc
          ab.socket.disconnect()
          await vi.waitFor(()=>expect(serverDoc('B').getConnectionsCount()).toBe(1))
          await ab.socket.connect()
          await vi.waitFor(()=>expect(serverDoc('B').getConnectionsCount()).toBe(2))
          expect(ab.doc).toBe(originalDoc)
          await insert(ab,bb,'after reconnect\n')
          ab.destroy()
          await vi.waitFor(()=>expect(serverDoc('B').getConnectionsCount()).toBe(1))
          const refreshed=await open(A,'B')
          expect(text(refreshed).toString()).toBe(text(bb).toString())
          await insert(refreshed,bb,'after refresh\n')

          await rooms.revokePermission(A,room.id,B)
          // The reverse grant remains usable after the first revoke.
          await insert(refreshed,bb,'independent reverse grant\n')
          await rooms.revokePermission(B,room.id,A)
          const beforeA=serverDoc('A').getText('code').toString(),beforeB=serverDoc('B').getText('code').toString()
          // Deliberately bypass the UI to prove the server rejects revoked writes.
          text(ba).insert(text(ba).length,'REJECTED B')
          text(refreshed).insert(text(refreshed).length,'REJECTED A')
          await vi.waitFor(()=>{assertAuthority('A',B,true);assertAuthority('B',A,true)})
          expect(serverDoc('A').getText('code').toString()).toBe(beforeA)
          expect(serverDoc('B').getText('code').toString()).toBe(beforeB)
          assertAuthority('A',A,false);assertAuthority('B',B,false)
        }finally{
          for(const client of clients)client.destroy()
          await realtime.destroy()
        }
      },15000)
    }
  }
})
