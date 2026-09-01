import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { useAuthStore } from '../../store/authStore';
import { MessageSquare, Send, ChevronRight } from 'lucide-react';
import { participantName } from '../../utils/participantName';

export const ChatDrawer: React.FC = () => {
  const { isChatOpen, toggleChat, messages, sendMessage, isExplainMode, room, partnerIsTyping, setTyping } = useSessionStore();
  const { user } = useAuthStore();
  const [inputText, setInputText] = useState('');
  const idleTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const typingSent = useRef(false);
  const partnerId=room?.partner?.userId??room?.participants.find((participant)=>participant.userId!==user?.id)?.userId;
  const partnerDisplayName=partnerId?participantName(room,partnerId,user?.id):'Partner';

  const stopTyping=useCallback(()=>{
    if(idleTimer.current){clearTimeout(idleTimer.current);idleTimer.current=null;}
    if(typingSent.current){typingSent.current=false;void setTyping(false);}
  },[setTyping]);

  useEffect(()=>()=>stopTyping(),[stopTyping]);

  const handleInputChange=(value:string)=>{
    setInputText(value);
    if(!value.trim()){stopTyping();return;}
    if(!typingSent.current){typingSent.current=true;void setTyping(true);}
    if(idleTimer.current)clearTimeout(idleTimer.current);
    idleTimer.current=setTimeout(stopTyping,1200);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      stopTyping();
      void sendMessage(inputText);
      setInputText('');
    }
  };

  if (!isChatOpen) {
    return (
      <button
        onClick={toggleChat}
        className="btn btn-outline"
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 30,
          padding: '0.65rem 0.85rem',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--surface)',
          boxShadow: 'var(--shadow-lift)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          fontWeight: 700,
          fontSize: '0.85rem',
        }}
        title="Open Desk Chat"
      >
        <MessageSquare size={16} style={{ color: 'var(--warm-accent)' }} />
        <span>Chat</span>
      </button>
    );
  }

  return (
    <aside
      style={{
        width: isExplainMode ? '340px' : '280px',
        backgroundColor: 'var(--surface)',
        borderLeft: '1px solid var(--border-muted)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        zIndex: 15,
        transition: 'width 0.2s ease',
      }}
    >
      {/* Chat Header */}
      <div
        style={{
          height: '44px',
          padding: '0 0.85rem',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <MessageSquare size={15} style={{ color: 'var(--warm-accent)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{isExplainMode ? 'Explain Conversation' : 'Desk Chat'}</span>
          <span className="hand-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            (temporary)
          </span>
        </div>

        <button 
          onClick={toggleChat} 
          className="btn-ghost" 
          style={{ padding: '0.25rem' }} 
          title="Collapse Chat"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Message Stream */}
      <div
        style={{
          flex: 1,
          padding: '0.85rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
      >
        {messages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div
                key={msg.id}
                style={{
                  textAlign: 'center',
                  fontSize: '0.725rem',
                  color: 'var(--text-muted)',
                  padding: '0.2rem 0',
                  fontStyle: 'italic',
                }}
              >
                {msg.text}
              </div>
            );
          }

          const isMe = msg.senderName === 'You' || msg.senderId === user?.id;

          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.15rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {msg.senderName}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {msg.timestamp}
                </span>
              </div>

              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isMe ? 'var(--sage-dark)' : 'var(--bg-secondary)',
                  color: isMe ? '#F2F5F0' : 'var(--text-primary)',
                  fontSize: '0.825rem',
                  lineHeight: 1.35,
                  border: isMe ? '1px solid var(--sage)' : '1px solid var(--border-muted)',
                  borderTopRightRadius: isMe ? '2px' : 'var(--radius-md)',
                  borderTopLeftRadius: !isMe ? '2px' : 'var(--radius-md)',
                  boxShadow: 'var(--shadow-paper)',
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chat Input Bar */}
      {partnerIsTyping && (
        <div role="status" aria-live="polite" style={{padding:'0.35rem 0.75rem 0',fontSize:'0.72rem',color:'var(--text-muted)',fontStyle:'italic'}}>
          {partnerDisplayName} is typing…
        </div>
      )}
      <form
        onSubmit={handleSend}
        style={{
          padding: '0.75rem',
          borderTop: '1px solid var(--border-muted)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          gap: '0.4rem',
        }}
      >
        <input
          type="text"
          placeholder="Message partner..."
          value={inputText}
          onChange={(e) => handleInputChange(e.target.value)}
          style={{
            flex: 1,
            padding: '0.45rem 0.65rem',
            fontSize: '0.825rem',
            backgroundColor: 'var(--bg-main)',
          }}
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="btn btn-primary"
          style={{ padding: '0.45rem 0.65rem' }}
        >
          <Send size={14} />
        </button>
      </form>
    </aside>
  );
};
