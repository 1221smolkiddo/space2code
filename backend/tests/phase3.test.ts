import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { InMemoryCollaborationRepository } from '../src/collaboration/in-memory-repository.js'
import { CollaborationService } from '../src/collaboration/service.js'
import { InMemoryActionRateLimiter } from '../src/features/rate-limiter.js'
import { initialLanguageRegistry } from '../src/execution/language-registry.js'
import { SessionExportService } from '../src/export/service.js'
import { InMemoryDocumentStore } from '../src/realtime/document-store.js'
import { editorDocumentName } from '../src/realtime/document-name.js'
import { InMemoryUserEventHub } from '../src/realtime/user-events.js'
import { RoomError } from '../src/rooms/errors.js'
import { InMemoryRoomRepository } from '../src/rooms/in-memory-room-repository.js'
import { RoomService, type RoomEvent, type RoomEventPublisher } from '../src/rooms/service.js'
import { InMemorySocialRepository } from '../src/social/in-memory-repository.js'
import { FriendPresenceService } from '../src/social/presence.js'
import { SocialService } from '../src/social/service.js'

const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003'
function fixture(){
 let time=new Date('2030-01-01T00:00:00.000Z');const clock={now:()=>new Date(time),set:(v:string)=>{time=new Date(v)}}
 const rooms=new InMemoryRoomRepository(),roomEvents:RoomEvent[]=[];const publisher:RoomEventPublisher={publish:async(_id,event)=>{roomEvents.push(event)}}
 const roomService=new RoomService(rooms,clock,publisher),socialRepo=new InMemorySocialRepository();socialRepo.seedProfile(A,'Ada');socialRepo.seedProfile(B,'Ben');socialRepo.seedProfile(C,'Cy')
 const userEvents=new InMemoryUserEventHub(),limiter=new InMemoryActionRateLimiter(),presence=new FriendPresenceService(userEvents)
 const social=new SocialService(socialRepo,presence,userEvents,limiter,clock),collabRepo=new InMemoryCollaborationRepository(rooms,socialRepo)
 let priorities=[1,2];const collaboration=new CollaborationService(collabRepo,publisher,userEvents,limiter,clock,()=>priorities.shift()??0)
 return{clock,rooms,roomService,socialRepo,social,collabRepo,collaboration,roomEvents,limiter,setPriorities:(v:number[])=>{priorities=v}}
}
async function friends(f:ReturnType<typeof fixture>,a=A,b=B){const request=await f.social.sendRequest(a,b);await f.social.respond(request.id,b,'accepted')}
async function live(f:ReturnType<typeof fixture>){const room=await f.roomService.create(A,'python');await f.roomService.join(B,room.roomCode);return f.roomService.get(A,room.id)}

describe('Phase 3 friends and presence',()=>{
 it('prevents self and duplicate requests and safely canonicalizes crossed requests',async()=>{const f=fixture();await expect(f.social.sendRequest(A,A)).rejects.toMatchObject({code:'CANNOT_FRIEND_SELF'});await f.social.sendRequest(A,B);await expect(f.social.sendRequest(A,B)).rejects.toMatchObject({code:'FRIEND_REQUEST_DUPLICATE'});const crossed=await f.social.sendRequest(B,A);expect(crossed.status).toBe('accepted');expect((await f.social.list(A)).friends).toHaveLength(1)})
 it('supports decline, cancel, accept/remove, and rejects unauthorized mutations',async()=>{const f=fixture();let r=await f.social.sendRequest(A,B);await expect(f.social.respond(r.id,C,'accepted')).rejects.toMatchObject({code:'FORBIDDEN'});await f.social.respond(r.id,B,'declined');r=await f.social.sendRequest(A,B);await expect(f.social.cancel(r.id,B)).rejects.toMatchObject({code:'FORBIDDEN'});await f.social.cancel(r.id,A);r=await f.social.sendRequest(A,B);await f.social.respond(r.id,B,'accepted');await f.social.remove(A,B);expect((await f.social.list(A)).friends).toHaveLength(0)})
 it('shares ephemeral presence only with friends and expires to offline',async()=>{const f=fixture();await friends(f);await f.social.setPresence(B,'ONLINE');expect(await f.social.friendPresence(A)).toEqual({[B]:'ONLINE'});f.clock.set('2030-01-01T00:02:00.000Z');expect(await f.social.friendPresence(A)).toEqual({[B]:'OFFLINE'})})
})

describe('Phase 3 invitations',()=>{
 it('requires a room participant and intended invitee, and prevents duplicates',async()=>{const f=fixture();await friends(f);const room=await f.roomService.create(A,'python');await expect(f.collaboration.invite(room.id,C,B)).rejects.toBeInstanceOf(RoomError);const invite=await f.collaboration.invite(room.id,A,B);await expect(f.collaboration.invite(room.id,A,B)).rejects.toMatchObject({code:'INVITE_DUPLICATE'});await expect(f.collaboration.acceptInvite(invite.id,C)).rejects.toMatchObject({code:'FORBIDDEN'});const accepted=await f.collaboration.acceptInvite(invite.id,B);expect(accepted.room.participants).toHaveLength(2)})
 it('rejects stale invites and invitations to a full room',async()=>{const f=fixture();await friends(f);const room=await f.roomService.create(A,'python');const invite=await f.collaboration.invite(room.id,A,B);f.clock.set('2030-01-01T00:16:00.000Z');await expect(f.collaboration.acceptInvite(invite.id,B)).rejects.toMatchObject({code:'INVITE_STALE'});const g=fixture();await friends(g,A,C);const full=await live(g);await expect(g.collaboration.invite(full.id,A,C)).rejects.toMatchObject({code:'ROOM_FULL'})})
})

describe('Phase 3 chat and Explain Mode',()=>{
 it('restores participant chat, rejects outsiders, and enforces content/rate limits',async()=>{const f=fixture(),room=await live(f);await f.collaboration.sendChat(room.id,A,'hello');expect(await f.collaboration.listChat(room.id,B)).toMatchObject([{content:'hello'}]);await expect(f.collaboration.listChat(room.id,C)).rejects.toBeInstanceOf(RoomError);await expect(f.collaboration.sendChat(room.id,A,'x'.repeat(4001))).rejects.toMatchObject({code:'CHAT_LIMIT_EXCEEDED'});for(let i=0;i<29;i++)await f.collaboration.sendChat(room.id,A,`m${i}`);await expect(f.collaboration.sendChat(room.id,A,'overflow')).rejects.toMatchObject({code:'RATE_LIMITED'})})
 it('allows either participant, rejects outsiders, and does not bypass editor permissions',async()=>{const f=fixture(),room=await live(f);await f.collaboration.activateExplain(room.id,A,'A');await f.collaboration.activateExplain(room.id,B,'B');await expect(f.collaboration.activateExplain(room.id,C,'A')).rejects.toBeInstanceOf(RoomError);expect(await f.rooms.hasWritePermission(room.id,A,B)).toBe(false)})
 it('atomically selects one deterministic winner and synchronizes the final state',async()=>{const f=fixture(),room=await live(f);f.setPriorities([10,20]);await f.collaboration.activateExplain(room.id,A,'A');const result=await f.collaboration.activateExplain(room.id,B,'B');expect(result).toMatchObject({winnerId:B,contenderCount:2,state:{controllerId:B,targetSlot:'B'}});expect(await f.collaboration.getExplainState(room.id,A)).toEqual(await f.collaboration.getExplainState(room.id,B));expect(f.roomEvents.at(-1)?.type).toBe('explain.arbitrated')})
 it('shares explain messages and persists code-oriented annotations with author-only removal',async()=>{const f=fixture(),room=await live(f);await f.collaboration.activateExplain(room.id,A,'A');await f.collaboration.sendExplainMessage(room.id,A,'because O(n)');expect(await f.collaboration.listExplainMessages(room.id,B)).toMatchObject([{content:'because O(n)'}]);const annotation=await f.collaboration.addAnnotation(room.id,B,{targetSlot:'A',startLine:2,endLine:4,type:'highlight',text:'loop'});expect(await f.collaboration.listAnnotations(room.id,A)).toContainEqual(annotation);await expect(f.collaboration.removeAnnotation(room.id,annotation.id,A)).rejects.toMatchObject({code:'FORBIDDEN'});await f.collaboration.removeAnnotation(room.id,annotation.id,B)})
})

describe('Phase 3 ZIP export and recent sessions',()=>{
 it('exports both final sources, checkpoint history, questions and explain data but never normal chat',async()=>{const f=fixture(),room=await live(f);await f.roomService.updateQuestion(A,room.id,'Find the sum');await f.roomService.updateQuestion(B,room.id,'Explain complexity');await f.collaboration.activateExplain(room.id,A,'A');await f.collaboration.sendExplainMessage(room.id,B,'linear');await f.collaboration.addAnnotation(room.id,A,{targetSlot:'A',startLine:1,endLine:1,type:'note',text:'entry'});await f.collaboration.sendChat(room.id,A,'SECRET NORMAL CHAT');const docs=new InMemoryDocumentStore();for(const[slot,values]of [['A',['old','print(42)']],['B',['x = 1','print(x)']]]as const)for(const value of values){const d=new Y.Doc();d.getText('code').insert(0,value);await docs.store(editorDocumentName(room.id,slot),Y.encodeStateAsUpdate(d))}const service=new SessionExportService(f.rooms,f.collabRepo,docs,initialLanguageRegistry({python:'*',java:'*',c:'*',cpp:'*',javascript:'*'}),f.limiter);const result=await service.generate(room.id,A);const zip=unzipSync(result.bytes),names=Object.keys(zip);expect(names).toContain('session/user-a/main.py');expect(strFromU8(zip['session/user-a/main.py']!)).toBe('print(42)');expect(JSON.parse(strFromU8(zip['session/user-a/history.json']!))).toHaveLength(2);expect(strFromU8(zip['session/user-a/question.txt']!)).toBe('Find the sum');expect(strFromU8(zip['session/explain/messages.json']!)).toContain('linear');expect(strFromU8(result.bytes)).not.toContain('SECRET NORMAL CHAT')})
 it('rejects outsider exports and bounded-resource failures',async()=>{const f=fixture(),room=await live(f),docs=new InMemoryDocumentStore();const d=new Y.Doc();d.getText('code').insert(0,'large');await docs.store(editorDocumentName(room.id,'A'),Y.encodeStateAsUpdate(d));const language=initialLanguageRegistry({python:'*',java:'*',c:'*',cpp:'*',javascript:'*'});const normal=new SessionExportService(f.rooms,f.collabRepo,docs,language,f.limiter);await expect(normal.generate(room.id,C)).rejects.toMatchObject({code:'FORBIDDEN'});const bounded=new SessionExportService(f.rooms,f.collabRepo,docs,language,new InMemoryActionRateLimiter(),{maxInputBytes:1,maxZipBytes:1000,maxRevisions:10});await expect(bounded.generate(room.id,A)).rejects.toMatchObject({code:'EXPORT_LIMIT_EXCEEDED'})})
 it('preserves recent-session partner safety and expiry metadata',async()=>{const f=fixture(),room=await live(f);const recent=await f.roomService.recent(A);expect(recent[0]).toMatchObject({sessionId:room.id,partner:{userId:B,displayName:null,avatarUrl:null},expiresAt:room.expiresAt})})
})
