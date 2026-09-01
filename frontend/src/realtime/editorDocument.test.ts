import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { editorDocumentName } from './editorDocument'

const connect = (documents:Map<string,Y.Doc[]>,name:string):Y.Doc => {
  const doc=new Y.Doc(),peers=documents.get(name)??[]
  for(const peer of peers)Y.applyUpdate(doc,Y.encodeStateAsUpdate(peer),'network')
  doc.on('update',(update,origin)=>{
    if(origin==='network')return
    for(const peer of documents.get(name)??[])if(peer!==doc)Y.applyUpdate(peer,update,'network')
  })
  documents.set(name,[...peers,doc])
  return doc
}

describe('shared editor documents',()=>{
  const roomId='10000000-0000-4000-8000-000000000001'

  it('uses one viewer-independent document identifier per room and desk',()=>{
    expect(editorDocumentName(roomId,'A')).toBe(`room:${roomId}:userA:code`)
    expect(editorDocumentName(roomId.toUpperCase(),'A')).toBe(editorDocumentName(roomId,'A'))
    expect(editorDocumentName(roomId,'B')).toBe(`room:${roomId}:userB:code`)
    expect(editorDocumentName(roomId,'A')).not.toBe(editorDocumentName(roomId,'B'))
  })

  for(const slot of ['A','B'] as const){
    it(`propagates owner and granted-partner edits bidirectionally on Desk ${slot}`,()=>{
      const documents=new Map<string,Y.Doc[]>(),name=editorDocumentName(roomId,slot)
      const owner=connect(documents,name),partner=connect(documents,name)
      owner.getText('code').insert(0,'owner')
      expect(partner.getText('code').toString()).toBe('owner')
      partner.getText('code').insert(5,' + partner')
      expect(owner.getText('code').toString()).toBe('owner + partner')
    })
  }

  it('converges simultaneous edits and keeps the two desks isolated',()=>{
    const deskAOwner=new Y.Doc(),deskAPartner=new Y.Doc()
    deskAOwner.getText('code').insert(0,'A')
    deskAPartner.getText('code').insert(0,'B')
    const ownerUpdate=Y.encodeStateAsUpdate(deskAOwner),partnerUpdate=Y.encodeStateAsUpdate(deskAPartner)
    Y.applyUpdate(deskAOwner,partnerUpdate);Y.applyUpdate(deskAPartner,ownerUpdate)
    expect(deskAOwner.getText('code').toString()).toBe(deskAPartner.getText('code').toString())
    expect(deskAOwner.getText('code').toString()).toContain('A')
    expect(deskAOwner.getText('code').toString()).toContain('B')

    const documents=new Map<string,Y.Doc[]>()
    const deskA=connect(documents,editorDocumentName(roomId,'A')),deskB=connect(documents,editorDocumentName(roomId,'B'))
    deskA.getText('code').insert(0,'only A')
    expect(deskB.getText('code').toString()).toBe('')
  })

  it('reattaches a reconnecting client to existing state without overwriting it',()=>{
    const name=editorDocumentName(roomId,'B'),documents=new Map<string,Y.Doc[]>()
    const owner=connect(documents,name)
    owner.getText('code').insert(0,'before reconnect')
    const reconnected=connect(documents,name)
    expect(reconnected.getText('code').toString()).toBe('before reconnect')
    reconnected.getText('code').insert(reconnected.getText('code').length,' + after')
    expect(owner.getText('code').toString()).toBe('before reconnect + after')
  })
})
