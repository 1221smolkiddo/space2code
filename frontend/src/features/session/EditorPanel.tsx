import React, { useCallback, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { MonacoBinding } from 'y-monaco';
import * as Y from 'yjs';
import { useSessionStore } from '../../store/sessionStore';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { env } from '../../config/env';
import { getAccessToken } from '../../api/client';
import type { RoomEventEnvelope } from '../../types';
import { participantColor, remoteCursorCss, trackEditorCursor } from '../../realtime/editorAwareness';
import { createSharedTerminalInput } from '../../realtime/sharedTerminalInput';
import { editorDocumentName } from '../../realtime/editorDocument';
import { clearRoomTypingObservation, observeRoomTyping, registerRoomTypingSender } from '../../realtime/roomAwareness';
import { OutputDrawer } from './OutputDrawer';
import { WashiTape } from '../../components/doodles/WashiTape';
import { 
  Play, 
  Terminal, 
  Lock, 
  Unlock, 
  Loader2 
} from 'lucide-react';

interface EditorPanelProps {
  slot: 'A' | 'B';
  username: string;
  partnerName: string;
  isOwner: boolean;
  isPartnerOnline: boolean;
  language: string;
}

interface RealtimeBinding {
  documentName: string;
  provider: HocuspocusProvider;
  doc: Y.Doc;
  binding: MonacoBinding | null;
  editor: MonacoEditor.IStandaloneCodeEditor | null;
  model: MonacoEditor.ITextModel | null;
  awarenessStyles: Set<HTMLStyleElement>;
  releaseCursor: () => void;
  unregisterTyping: () => void;
  releaseSharedInput: () => void;
  clearTypingObservation: () => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  slot,
  username,
  partnerName,
  isOwner,
  isPartnerOnline,
  language,
}) => {
  const { 
    editorA, 
    editorB, 
    toggleOutput, 
    setStdin,
    runCode, 
    requestEditAccess, 
    resolvePermission,
    isExplainMode,
    sharedTerminal,
    explainPrimarySlot,
    toggleExplainMode,
    roomId,
    handleRoomEvent,
    setRealtimeConnection,
    canWrite,
    permissionRequests,
    permissions,
    room,
    annotations,
    addAnnotation
  } = useSessionStore();

  const { fontSize } = useThemeStore();
  const { user } = useAuthStore();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const realtimeRef = useRef<RealtimeBinding | null>(null);

  const state = slot === 'A' ? editorA : editorB;
  const isWritable = canWrite(slot);
  const isMinimizedInExplain = isExplainMode && explainPrimarySlot !== slot;
  const ownerId = room?.participants.find((participant) => participant.slot === slot)?.userId;
  const pendingForOwner = permissionRequests.find((request) => request.editorOwnerId === user?.id && request.status === 'pending');
  const activeGrant = permissions.find((permission) => permission.editorOwnerId === user?.id && !permission.revokedAt && !permission.consumedAt);

  const destroyRealtime = useCallback(() => {
    const realtime=realtimeRef.current;
    if(!realtime)return;
    realtimeRef.current=null;
    realtime.awarenessStyles.forEach(style=>style.remove());
    realtime.awarenessStyles.clear();
    realtime.releaseCursor();
    realtime.unregisterTyping();
    realtime.releaseSharedInput();
    realtime.clearTypingObservation();
    if(!realtime.model?.isDisposed())realtime.binding?.destroy();
    realtime.provider.destroy();
    realtime.doc.destroy();
  },[]);

  const releaseEditorBinding = useCallback(() => {
    const realtime=realtimeRef.current;
    realtime?.releaseCursor();
    // y-monaco already destroys the binding when Monaco disposes its model.
    if(realtime&&!realtime.model?.isDisposed())realtime.binding?.destroy();
    if(realtime){realtime.binding=null;realtime.editor=null;realtime.model=null}
    editorRef.current=null;
  },[]);

  const attachRealtime = useCallback((editor?:MonacoEditor.IStandaloneCodeEditor) => {
    if(!env.realtimeReady){setRealtimeConnection('offline');return}
    if(!roomId||!ownerId)return;
    const name=editorDocumentName(roomId,slot);
    let realtime=realtimeRef.current;
    if(realtime?.documentName!==name){
      destroyRealtime();
      const doc=new Y.Doc(),awarenessStyles=new Set<HTMLStyleElement>();
      let sharedInput: ReturnType<typeof createSharedTerminalInput> | undefined;
      const provider=new HocuspocusProvider({
        url:env.hocuspocusUrl,name,document:doc,token:getAccessToken,flushDelay:80,
        onStatus:({status})=>{if(status!=='connected')sharedInput?.disconnect();setRealtimeConnection(status==='connected'?'connected':status==='connecting'?'connecting':'reconnecting')},
        onSynced:({state})=>{if(state)sharedInput?.connect()},
        onAuthenticationFailed:()=>setRealtimeConnection('offline'),
        onStateless:({payload})=>{if(sharedInput?.receive(payload))return;try{handleRoomEvent(JSON.parse(payload) as RoomEventEnvelope)}catch{/* ignore malformed non-application payloads */}},
        onAwarenessChange:({states})=>{
          awarenessStyles.forEach(style=>style.remove());awarenessStyles.clear();
          for(const state of states){
            const remote=state.user as {id?:string;name?:string}|undefined;
            if(!remote?.id||remote.id===useAuthStore.getState().user?.id||!Number.isSafeInteger(state.clientId))continue;
            const style=document.createElement('style');
            style.textContent=remoteCursorCss(slot,state.clientId,remote.id);
            document.head.append(style);awarenessStyles.add(style);
          }
          const remoteStates=states.filter(state=>(state.user as {id?:string}|undefined)?.id!==useAuthStore.getState().user?.id);
          const remoteId=(remoteStates.find(state=>state.typing===true)?.user as {id?:string}|undefined)?.id??null;
          const presence=observeRoomTyping(roomId,slot,{userId:remoteId,isTyping:Boolean(remoteId)});
          useSessionStore.getState().receiveTypingPresence(presence.userId,presence.isTyping);
        },
        onDestroy:()=>{awarenessStyles.forEach(style=>style.remove());awarenessStyles.clear()},
      });
      if(slot==='A')sharedInput=createSharedTerminalInput({
        roomId,send:payload=>provider.sendStateless(payload),
        read:()=>useSessionStore.getState().sharedTerminal.stdin,
        apply:stdin=>{if(useSessionStore.getState().roomId===roomId)useSessionStore.getState().setSharedStdin(stdin)},
        subscribe:listener=>useSessionStore.subscribe(state=>{if(state.roomId===roomId)listener()}),
        onError:error=>{if(useSessionStore.getState().roomId===roomId)useSessionStore.setState({error})},
      });
      const unregisterTyping=registerRoomTypingSender(roomId,slot,(isTyping)=>provider.awareness?.setLocalStateField('typing',isTyping));
      const clearTypingObservation=()=>{const presence=clearRoomTypingObservation(roomId,slot);useSessionStore.getState().receiveTypingPresence(presence.userId,presence.isTyping)};
      realtime={documentName:name,provider,doc,binding:null,editor:null,model:null,awarenessStyles,unregisterTyping,clearTypingObservation,releaseSharedInput:()=>sharedInput?.destroy(),releaseCursor:()=>{}};
      realtimeRef.current=realtime;
      provider.awareness?.setLocalStateField('user',{id:user?.id,name:user?.displayName??'Coder',color:participantColor(user?.id??'')});
    }
    const model=editor?.getModel();
    if(!editor||!model||!realtime)return;
    if(realtime.binding&&realtime.editor===editor&&realtime.model===model)return;
    if(!realtime.model?.isDisposed())realtime.binding?.destroy();
    realtime.releaseCursor();
    const binding=new MonacoBinding(realtime.doc.getText('code'),model,new Set([editor]),realtime.provider.awareness);
    const releaseCursor=realtime.provider.awareness
      ?trackEditorCursor(editor,realtime.doc.getText('code'),realtime.provider.awareness,()=>useSessionStore.getState().canWrite(slot))
      :()=>{};
    realtimeRef.current={...realtime,binding,editor,model,releaseCursor};
  },[destroyRealtime,handleRoomEvent,ownerId,roomId,setRealtimeConnection,slot,user?.displayName,user?.id]);

  const mountEditor = useCallback((editor:MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current=editor;
    attachRealtime(editor);
  },[attachRealtime]);

  useEffect(()=>{attachRealtime(editorRef.current??undefined)},[attachRealtime]);

  useEffect(()=>{
    realtimeRef.current?.provider.awareness?.setLocalStateField('user',{id:user?.id,name:user?.displayName??'Coder',color:participantColor(user?.id??'')});
  },[user?.displayName,user?.id]);

  useEffect(()=>()=>{destroyRealtime();editorRef.current=null},[destroyRealtime]);

  useEffect(()=>{if(isMinimizedInExplain)releaseEditorBinding()},[isMinimizedInExplain,releaseEditorBinding]);

  useEffect(()=>{
    const editor=editorRef.current;if(!editor)return;
    const decorations=annotations.filter(annotation=>annotation.targetSlot===slot&&annotation.startLine).map(annotation=>({
      range:{startLineNumber:annotation.startLine!,startColumn:1,endLineNumber:annotation.endLine??annotation.startLine!,endColumn:1},
      options:{isWholeLine:true,className:'explain-line-highlight',hoverMessage:annotation.text?{value:annotation.text}:undefined},
    }));
    const ids=editor.deltaDecorations([],decorations);
    return()=>{editor.deltaDecorations(ids,[])};
  },[annotations,slot]);

  useEffect(()=>{
    if(!isWritable)realtimeRef.current?.provider.awareness?.setLocalStateField('selection',null);
  },[isWritable]);

  const handleRun=()=>void runCode(slot,editorRef.current?.getValue()??'');
  const handleAnnotate=()=>{const selection=editorRef.current?.getSelection();if(selection)void addAnnotation(slot,selection.startLineNumber,selection.endLineNumber,null)};
  const handleNote=()=>{const selection=editorRef.current?.getSelection(),note=window.prompt('Note for the selected code lines');if(selection&&note?.trim())void addAnnotation(slot,selection.startLineNumber,selection.endLineNumber,note.trim())};

  if (isMinimizedInExplain) {
    return (
      <div
        onClick={() => toggleExplainMode(slot)}
        style={{
          width: '56px',
          backgroundColor: 'var(--surface)',
          borderRight: '1px solid var(--border-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '1.25rem 0',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          position: 'relative',
        }}
        title={`Click to focus on ${username}'s board`}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
        >
          {username.charAt(0)}
        </div>

        <div
          style={{
            transform: 'rotate(-90deg)',
            whiteSpace: 'nowrap',
            marginTop: '3.5rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: '0.05em',
          }}
        >
          {username}'s Board
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#1C1B18',
        borderRight: '1px solid var(--border-muted)',
        position: 'relative',
        minWidth: 0,
      }}
    >
      {/* Tape accent */}
      <WashiTape position="top-left" variant={slot === 'A' ? 'sage' : 'amber'} style={{ width: '48px', height: '12px' }} />

      {/* Editor Header Bar */}
      <div
        style={{
          height: '44px',
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0.85rem',
          position: 'relative',
          zIndex: 5,
        }}
      >
        {/* User Identity & Slot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: isOwner ? 'var(--sage)' : 'var(--warm-accent)',
                color: '#1A2218',
                fontWeight: 700,
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {username.charAt(0)}
            </div>
            {/* Status dot */}
            <span
              style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isPartnerOnline ? 'var(--sage)' : 'var(--text-muted)',
                border: '1.5px solid var(--surface)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {username}
            </span>
            <span
              style={{
                fontSize: '0.675rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--bg-main)',
                padding: '0.1rem 0.35rem',
                borderRadius: '3px',
                border: '1px solid var(--border-muted)',
                color: 'var(--text-secondary)',
              }}
            >
              Desk {slot}
            </span>
          </div>

          {/* Write Permission Badge */}
          {isWritable ? (
            <span style={{ fontSize: '0.7rem', color: 'var(--sage)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Unlock size={12} /> editable
            </span>
          ) : (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Lock size={12} /> read-only
            </span>
          )}
        </div>

        {/* Permission Prompt / Controls */}
        {!isOwner && state.permission === 'none' && (
          <button
            onClick={() => void requestEditAccess(slot)}
            className="btn btn-outline"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.725rem', borderColor: 'var(--warm-accent)', color: 'var(--warm-accent)' }}
          >
            Request Edit Access
          </button>
        )}

        {/* Partner Permission Request Dialog for Owner */}
        {isOwner && pendingForOwner && pendingForOwner.editorOwnerId === ownerId && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--warm-accent)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.2rem 0.45rem',
              fontSize: '0.725rem',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--warm-accent)' }}>{partnerName} requests edit:</span>
            <button
              onClick={() => void resolvePermission('grant_once')}
              className="btn btn-primary"
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
            >
              Once
            </button>
            <button
              onClick={() => void resolvePermission('grant_session')}
              className="btn btn-primary"
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
            >
              Session
            </button>
            <button
              onClick={() => void resolvePermission('deny')}
              className="btn-ghost"
              style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem' }}
            >
              Deny
            </button>
          </div>
        )}

        {/* Right Header Actions (Run & Terminal Toggle) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {isOwner && activeGrant && activeGrant.editorOwnerId === ownerId && (
            <button onClick={() => void useSessionStore.getState().revokePermission(activeGrant.granteeId)} className="btn-ghost" style={{fontSize:'0.7rem'}}>Revoke {partnerName}'s edit</button>
          )}
          {isExplainMode && (
            <><button onClick={handleAnnotate} className="btn-ghost" style={{fontSize:'0.7rem'}} title="Highlight selected lines">Highlight</button><button onClick={handleNote} className="btn-ghost" style={{fontSize:'0.7rem'}} title="Annotate selected lines">Note</button></>
          )}
          <button
            onClick={handleRun}
            disabled={(isExplainMode ? sharedTerminal.outputState : state.outputState) === 'running'}
            className="btn btn-outline"
            style={{
              padding: '0.25rem 0.65rem',
              fontSize: '0.775rem',
              fontWeight: 700,
              backgroundColor: 'var(--surface)',
              color: 'var(--sage)',
              borderColor: 'var(--sage-dark)',
            }}
            title="Run Code (Executes on your desk)"
          >
            {(isExplainMode ? sharedTerminal.outputState : state.outputState) === 'running' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={13} fill="currentColor" />
            )}
            Run
          </button>

          {!isExplainMode && (
            <button
              onClick={() => toggleOutput(slot)}
              className={`btn ${state.isOutputOpen ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                borderRadius: 'var(--radius-sm)',
              }}
              title="Toggle Console Output"
            >
              <Terminal size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div data-awareness-desk={slot} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Editor
          height="100%"
          language={language.toLowerCase() === 'c++' ? 'cpp' : language.toLowerCase()}
          theme="vs-dark"
          defaultValue=""
          onMount={mountEditor}
          options={{
            readOnly: !isWritable,
            minimap: { enabled: false },
            fontSize: fontSize,
            fontFamily: 'var(--font-mono)',
            padding: { top: 12, bottom: 12 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
          }}
        />
      </div>

      {/* Output Console Drawer */}
      {!isExplainMode && state.isOutputOpen && (
        <OutputDrawer
          title={isOwner ? 'Your Terminal' : `${username}'s Terminal`}
          state={state}
          onClose={() => toggleOutput(slot)}
          onRun={handleRun}
          onStdinChange={(value) => setStdin(slot,value)}
        />
      )}
    </div>
  );
};
