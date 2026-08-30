import { zipSync, strToU8 } from 'fflate'
import * as Y from 'yjs'
import type { CollaborationRepository } from '../collaboration/repository.js'
import { FeatureError } from '../features/errors.js'
import type { ActionRateLimiter } from '../features/rate-limiter.js'
import type { LanguageRegistry } from '../execution/language-registry.js'
import { editorDocumentName } from '../realtime/document-name.js'
import type { DocumentRevision, DocumentStore } from '../realtime/document-store.js'
import type { RoomRepository } from '../rooms/repository.js'
import type { Clock } from '../rooms/service.js'
import type { Slot } from '../rooms/types.js'

export interface ExportLimits { maxInputBytes:number; maxZipBytes:number; maxRevisions:number }
export class SessionExportService {
  constructor(private readonly rooms:RoomRepository,private readonly collaboration:CollaborationRepository,private readonly documents:DocumentStore,private readonly languages:LanguageRegistry,private readonly limiter:ActionRateLimiter,private readonly limits:ExportLimits={maxInputBytes:10*1024*1024,maxZipBytes:10*1024*1024,maxRevisions:200},private readonly clock:Clock={now:()=>new Date()}){}
  async generate(sessionId:string,userId:string):Promise<{filename:string;bytes:Uint8Array}>{
    this.limiter.check(`export:${userId}`,5,60_000,this.clock.now())
    const room=await this.rooms.findForUser(sessionId,userId);if(!room)throw new FeatureError('FORBIDDEN','Only session participants can export')
    if(new Date(room.expiresAt).getTime()<=this.clock.now().getTime())throw new FeatureError('FORBIDDEN','Session retention has expired')
    const definition=this.languages.resolve(room.language)
    const [a,b,state,messages,annotations]=await Promise.all([this.editor(room.id,'A'),this.editor(room.id,'B'),this.collaboration.getExplainState(room.id,userId,this.clock.now().toISOString()),this.collaboration.listExplainMessages(room.id,userId),this.collaboration.listAnnotations(room.id,userId)])
    const inputBytes=[...a.raw,...b.raw].reduce((n,x)=>n+x.state.byteLength,0);if(inputBytes>this.limits.maxInputBytes)throw new FeatureError('EXPORT_LIMIT_EXCEEDED','Document history exceeds export input limit')
    const json=(value:unknown)=>strToU8(JSON.stringify(value,null,2));const text=(value:string|null)=>strToU8(value??'')
    const files:Record<string,Uint8Array>={
      'session/metadata.json':json({language:room.language,status:room.status,createdAt:room.createdAt,startedAt:room.startedAt,endedAt:room.endedAt,lastActiveAt:room.lastActiveAt,expiresAt:room.expiresAt}),
      [`session/user-a/${definition.filename}`]:strToU8(a.final), 'session/user-a/history.json':json(a.history),'session/user-a/question.txt':text(room.questions.A),
      [`session/user-b/${definition.filename}`]:strToU8(b.final), 'session/user-b/history.json':json(b.history),'session/user-b/question.txt':text(room.questions.B),
      'session/explain/state.json':json(state),'session/explain/messages.json':json(messages),'session/explain/annotations.json':json(annotations),
    }
    const bytes=zipSync(files,{level:6});if(bytes.byteLength>this.limits.maxZipBytes)throw new FeatureError('EXPORT_LIMIT_EXCEEDED','Generated ZIP exceeds export limit')
    return{filename:`space2code-${room.roomCode}.zip`,bytes}
  }
  private async editor(roomId:string,slot:Slot){const name=editorDocumentName(roomId,slot);let revisions=await this.documents.history(name,this.limits.maxRevisions);const latest=await this.documents.load(name);if(latest&&(!revisions.length||!this.same(revisions.at(-1)!.state,latest)))revisions=[...revisions,{capturedAt:this.clock.now().toISOString(),state:latest}];const history=revisions.map(r=>({capturedAt:r.capturedAt,code:this.code(r)}));return{raw:revisions,history,final:history.at(-1)?.code??''}}
  private code(revision:DocumentRevision){const doc=new Y.Doc();Y.applyUpdate(doc,revision.state);const direct=doc.getText('code').toString();if(direct)return direct;for(const value of doc.share.values())if(value instanceof Y.Text)return value.toString();return''}
  private same(a:Uint8Array,b:Uint8Array){return a.byteLength===b.byteLength&&a.every((value,index)=>value===b[index])}
}
