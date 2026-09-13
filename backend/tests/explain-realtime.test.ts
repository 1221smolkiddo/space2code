import {ExecutionService} from '../src/execution/service.js'
import {FakeExecutionProvider} from '../src/execution/fake-provider.js'
import {InMemoryExecutionGuard} from '../src/execution/guard.js'
import {initialLanguageRegistry} from '../src/execution/language-registry.js'
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
  messages:string[]
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
          const doc=new Y.Doc(),messages:string[]=[]
          const socket=new HocuspocusProviderWebsocket({url:`ws://127.0.0.1:${realtime.server.address.port}`,WebSocketPolyfill:BrowserSocket,initialDelay:0})
          const provider=new HocuspocusProvider({name:editorDocumentName(room.id,slot),document:doc,token:user,websocketProvider:socket,flushDelay:0,onStateless:({payload})=>{received.push(payload);messages.push(payload)}})
          let destroyed=false
          const client={doc,provider,socket,messages,destroy:()=>{if(destroyed)return;destroyed=true;provider.destroy();socket.destroy();doc.destroy()}}
          clients.push(client)
          provider.awareness?.setLocalStateField('user',{id:user,name:user===A?'Ada':'Grace'})
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
          const assertCursor=async(writer:Client,reader:Client,otherDesk:Client,user:string)=>{
            const selection={anchor:Y.createRelativePositionFromTypeIndex(text(writer),0),head:Y.createRelativePositionFromTypeIndex(text(writer),text(writer).length)}
            writer.provider.awareness!.setLocalStateField('selection',selection)
            await vi.waitFor(()=>{
              const remote=reader.provider.awareness!.getStates().get(writer.doc.clientID)
              expect(remote?.user).toEqual({id:user,name:user===A?'Ada':'Grace'})
              expect(remote?.selection).toEqual(selection)
              expect(Y.createAbsolutePositionFromRelativePosition(remote!.selection.head,reader.doc)?.type).toBe(text(reader))
            })
            expect(otherDesk.provider.awareness!.getStates().has(writer.doc.clientID)).toBe(false)
            writer.provider.awareness!.setLocalStateField('selection',null)
            await vi.waitFor(()=>expect(reader.provider.awareness!.getStates().get(writer.doc.clientID)?.selection).toBeNull())
          }
          await assertCursor(aa,ba,bb,A)
          await assertCursor(bb,ab,aa,B)
          if(grantBefore){await grant(A,B);await grant(B,A)}
          await collaboration.activateExplain(room.id,A,targetSlot)
          await vi.waitFor(()=>expect(received.some(payload=>payload.includes('"active":true'))).toBe(true))
          // Shared stdin uses Desk A's authenticated stateless channel even when
          // B has no code write grant and the focused editor is Desk B.
          const inputMessages=(client:Client)=>client.messages.map(payload=>JSON.parse(payload)).filter(value=>value.type==='terminal.input')
          aa.provider.sendStateless(JSON.stringify({type:'terminal.input',clientId:A,sequence:1,stdin:'Alice\n21\n'}))
          await vi.waitFor(()=>expect(inputMessages(ba).at(-1)?.stdin).toBe('Alice\n21\n'))
          ba.provider.sendStateless(JSON.stringify({type:'terminal.input',clientId:B,sequence:1,stdin:'Grace\n22'}))
          await vi.waitFor(()=>expect(inputMessages(aa).at(-1)?.stdin).toBe('Grace\n22'))
          expect(inputMessages(ab)).toHaveLength(0)
          expect(inputMessages(bb)).toHaveLength(0)
          expect(text(aa).toString()).toBe('owner A\n')
          expect(text(bb).toString()).toBe('owner B\n')
          const refreshedInput=await open(B,'A')
          refreshedInput.provider.sendStateless(JSON.stringify({type:'terminal.input.sync'}))
          await vi.waitFor(()=>expect(inputMessages(refreshedInput).at(-1)?.stdin).toBe('Grace\n22'))
          refreshedInput.destroy()
          await vi.waitFor(()=>expect(serverDoc('A').getConnectionsCount()).toBe(2))
          aa.provider.sendStateless(JSON.stringify({type:'terminal.input',clientId:A,sequence:2,stdin:'rapid 1'}))
          aa.provider.sendStateless(JSON.stringify({type:'terminal.input',clientId:A,sequence:3,stdin:'rapid 2'}))
          await vi.waitFor(()=>expect(inputMessages(ba).at(-1)?.stdin).toBe('rapid 2'))
          expect(inputMessages(ba).filter(value=>value.revision===4)).toHaveLength(1)
          await collaboration.deactivateExplain(room.id,A)
          await vi.waitFor(()=>expect(received.some(payload=>payload.includes('"active":false'))).toBe(true))
          expect((await rooms.get(A,room.id)).participants.map(p=>[p.slot,p.userId])).toEqual([['A',A],['B',B]])
          if(!grantBefore){await grant(A,B);await grant(B,A)}
          const execution=new ExecutionService(repository,new FakeExecutionProvider(),initialLanguageRegistry({python:'*',java:'*',c:'*',cpp:'*',javascript:'*'}),new InMemoryExecutionGuard({windowMs:60000,userLimit:10,roomLimit:20}),{maxSourceBytes:1000,maxStdinBytes:1000,maxOutputBytes:1000,timeoutMs:1000},undefined,events)
          for(const [user,target,scope] of [[A,'A','personal'],[B,'B','personal'],[A,'B','personal'],[B,'A','explain']] as const){
            const result=await execution.execute({roomId:room.id,userId:user,targetSlot:target,scope,language:'python',source:'print(input())',stdin:'Alice\n'})
            for(const client of [aa,ab,ba,bb]){
              await vi.waitFor(()=>expect(client.messages.map(payload=>JSON.parse(payload).event).filter(event=>event?.type==='execution.completed'&&event.executionId===result.executionId)).toEqual([expect.objectContaining({targetSlot:target,scope,result})]))
            }
          }
          await insert(ba,aa,'B edits A after Explain\n')
          await insert(ab,bb,'A edits B after Explain\n')
          await assertCursor(ba,aa,ab,B)
          await assertCursor(ab,bb,ba,A)
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
