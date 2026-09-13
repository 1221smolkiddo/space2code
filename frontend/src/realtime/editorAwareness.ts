import type { editor as MonacoEditor } from 'monaco-editor'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { Slot } from '../types'

export function participantColor(userId:string):string {
  let hash=0
  for(const char of userId)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0
  return ['#8ca47e','#e3aa5f','#79b8db','#c49bdd','#df8fa3','#78c7ba'][hash%6]!
}

export function remoteCursorCss(slot:Slot,clientId:number,userId:string):string {
  const scope=`[data-awareness-desk="${slot}"]`
  const color=participantColor(userId)
  return `${scope} .yRemoteSelection-${clientId}{background:${color}33}
${scope} .yRemoteSelectionHead-${clientId}{border-color:${color}}`
}

// y-monaco publishes selection changes even in unfocused editors. Its listener
// runs first; this listener clears those updates and publishes again on focus.
export function trackEditorCursor(editor:MonacoEditor.IStandaloneCodeEditor,text:Y.Text,awareness:Awareness,canWrite:()=>boolean):()=>void {
  const clear=()=>awareness.setLocalStateField('selection',null)
  const publish=()=>{
    const model=editor.getModel(),selection=editor.getSelection()
    if(!model||!selection||!editor.hasTextFocus()||!canWrite()){clear();return}
    awareness.setLocalStateField('selection',{
      anchor:Y.createRelativePositionFromTypeIndex(text,model.getOffsetAt(selection.getSelectionStart())),
      head:Y.createRelativePositionFromTypeIndex(text,model.getOffsetAt(selection.getPosition())),
    })
  }
  const listeners=[editor.onDidFocusEditorText(publish),editor.onDidBlurEditorText(clear),editor.onDidChangeCursorSelection(publish),editor.onDidDispose(clear)]
  publish()
  return ()=>{listeners.forEach(listener=>listener.dispose());clear()}
}
