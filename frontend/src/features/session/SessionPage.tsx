import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';
import { useAuthStore } from '../../store/authStore';
import { SessionHeader } from './SessionHeader';
import { EditorPanel } from './EditorPanel';
import { QuestionSheet } from './QuestionSheet';
import { ChatDrawer } from './ChatDrawer';

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { 
    hydrate,
    language, 
    isPartnerOnline,
    currentSlot,
    room,
    isLoading,
    error,
  } = useSessionStore();

  const { user } = useAuthStore();

  useEffect(() => {
    if (id) {
      const controller=new AbortController();
      void hydrate(id,controller.signal).catch(()=>undefined);
      return()=>controller.abort();
    }
  }, [id, hydrate]);

  const partner=room?.participants.find((participant)=>participant.userId!==user?.id);
  const partnerName=partner?`Coder ${partner.userId.slice(0,6)}`:'Waiting for partner';

  if(isLoading)return <div className="app-loading" role="status">Restoring the shared coding desk…</div>;
  if(error&&!room)return <div className="app-loading" role="alert">{error}</div>;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-main)',
      }}
    >
      {/* Top Bar (Contains Language, Timer, Question Sheet trigger, and Explain Controls) */}
      <SessionHeader />

      {/* Main Coding Area Container */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          height: 'calc(100vh - 56px)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Modal / Popover Question Sheet (Drops down on demand with backdrop, never covers code permanently) */}
        <QuestionSheet />

        {/* Main Editors Row */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            height: '100%',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* User A Editor Card (Owner) */}
          <EditorPanel
            slot="A"
            username={currentSlot === 'A' ? user?.displayName || 'You' : partnerName}
            isOwner={currentSlot === 'A'}
            isPartnerOnline={currentSlot === 'A' ? true : isPartnerOnline}
            language={language}
          />

          {/* User B Editor Card (Partner) */}
          <EditorPanel
            slot="B"
            username={currentSlot === 'B' ? user?.displayName || 'You' : partnerName}
            isOwner={currentSlot === 'B'}
            isPartnerOnline={currentSlot === 'B' ? true : isPartnerOnline}
            language={language}
          />
        </div>

        {/* Far-Right Chat Drawer (Dedicated flex child, zero overlap) */}
        <ChatDrawer />
      </div>
    </div>
  );
};
