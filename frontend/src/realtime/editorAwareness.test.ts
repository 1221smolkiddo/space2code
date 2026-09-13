import { describe,expect,it } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { editor as MonacoEditor } from 'monaco-editor'
import { participantColor,remoteCursorCss,trackEditorCursor } from './editorAwareness'

describe('document cursor presence',()=>{
  it('publishes only the focused writable document and clears on blur/dispose',()=>{
    const doc=new Y.Doc(),awareness=new Awareness(doc),text=doc.getText('code')
    text.insert(0,'hello')
    let focused=true,writable=true
    const callbacks=new Map<string,()=>void>()
    const listen=(name:string)=>(callback:()=>void)=>{callbacks.set(name,callback);return{dispose:()=>callbacks.delete(name)}}
    const editor={
      getModel:()=>({getOffsetAt:()=>2}),getSelection:()=>({getSelectionStart:()=>({}),getPosition:()=>({})}),
      hasTextFocus:()=>focused,
      onDidFocusEditorText:listen('focus'),onDidBlurEditorText:listen('blur'),
      onDidChangeCursorSelection:listen('cursor'),onDidDispose:listen('dispose'),
    } as unknown as MonacoEditor.IStandaloneCodeEditor
    const release=trackEditorCursor(editor,text,awareness,()=>writable)
    try{
      expect(Y.createAbsolutePositionFromRelativePosition(awareness.getLocalState()!.selection.head,doc)?.type).toBe(text)
      focused=false;callbacks.get('blur')!()
      expect(awareness.getLocalState()!.selection).toBeNull()
      callbacks.get('cursor')!()
      expect(awareness.getLocalState()!.selection).toBeNull()
      focused=true;callbacks.get('focus')!()
      expect(awareness.getLocalState()!.selection).not.toBeNull()
      writable=false;callbacks.get('cursor')!()
      expect(awareness.getLocalState()!.selection).toBeNull()
      writable=true;callbacks.get('focus')!();callbacks.get('dispose')!()
      expect(awareness.getLocalState()!.selection).toBeNull()
      release()
      expect(callbacks.size).toBe(0)
    }finally{release();awareness.destroy();doc.destroy()}
  })

  it('scopes identical client IDs to separate desks without name badges',()=>{
    const a=remoteCursorCss('A',42,'user-a'),b=remoteCursorCss('B',42,'user-b')
    expect(a).toContain('[data-awareness-desk="A"]')
    expect(b).toContain('[data-awareness-desk="B"]')
    for(const css of [a,b]){
      expect(css).toContain('.yRemoteSelection-42')
      expect(css).toContain('.yRemoteSelectionHead-42')
      expect(css).not.toMatch(/content:|::after|user-a|user-b/)
    }
    expect(participantColor('user-a')).toBe(participantColor('user-a'))
    expect(participantColor('user-a')).not.toBe(participantColor('user-b'))
  })
})
