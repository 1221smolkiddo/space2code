import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocialStore } from '../../store/socialStore';
import { PushPinDoodle } from '../../components/doodles/DoodleAccents';
import { ArrowRight, Download, RotateCcw } from 'lucide-react';
import { collaborationApi } from '../../api/collaboration';
import type { RecentSession } from '../../types';

export const RecentSessions: React.FC = () => {
  const { recentSessions, resumeSession, isLoading } = useSocialStore();
  const navigate = useNavigate();

  const handleResume = async (session: RecentSession) => {
    try {
      if (session.canReconnect) navigate(`/session/${session.sessionId}`);
      else if (session.canReopen) navigate(`/session/${await resumeSession(session.sessionId)}`);
    } catch { /* social store renders a safe error */ }
  };
  const handleExport=async(sessionId:string)=>{try{const{blob,filename}=await collaborationApi.export(sessionId);const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0)}catch(error){useSocialStore.setState({error:error instanceof Error?error.message:'Could not export this saved session.'})}};
  const lastActive=(value:string)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  const expiry=(value:string)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

  return (
    <div style={{ marginTop: '2.5rem' }}>
      {/* Section Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="hand-label" style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
            recent scribbles & boards
          </span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {recentSessions.length} saved sessions
        </span>
      </div>

      {/* Grid of Note Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {recentSessions.map((session) => {
          const isLive = session.status === 'live';
          return (
            <div
              key={session.sessionId}
              className="paper-note desk-card-interactive"
              style={{
                padding: '1.25rem',
                backgroundColor: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {/* Pushpin on top right */}
              <div style={{ position: 'absolute', top: '8px', right: '12px' }}>
                <PushPinDoodle 
                  size={18} 
                  color={isLive ? 'var(--warm-accent)' : 'var(--border-strong)'} 
                />
              </div>

              {/* Top Row: Partner & Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: isLive ? 'var(--sage)' : 'var(--bg-secondary)',
                    color: isLive ? '#1A2218' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    border: '1px solid var(--border-muted)',
                  }}
                >
                  {session.partner?.displayName ? session.partner.displayName.charAt(0) : 'P'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {session.partner?.displayName || 'Solo Scratchpad'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {session.sessionId}
                  </div>
                </div>
              </div>

              {/* Middle Row: Language & Active Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    padding: '0.2rem 0.5rem',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-muted)',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 600,
                  }}
                >
                  {session.language}
                </span>

                {isLive ? (
                  <span
                    style={{
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      color: 'var(--sage)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--sage)' }} />
                    LIVE BOARD
                  </span>
                ) : (
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    ENDED
                  </span>
                )}
              </div>

              {/* Footer: Action */}
              <div style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Last {lastActive(session.lastActiveAt)} · expires {expiry(session.expiresAt)}
                </span>

                <button onClick={()=>void handleExport(session.sessionId)} className="btn-ghost" style={{padding:'0.25rem'}} title="Export saved session"><Download size={12}/></button>
                {session.canReconnect ? (
                  <button
                    onClick={() => handleResume(session)}
                    className="btn btn-warm"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.775rem', borderRadius: 'var(--radius-sm)' }}
                  >
                    Reconnect <ArrowRight size={13} />
                  </button>
                ) : session.canReopen ? (
                  <button
                    onClick={() => handleResume(session)}
                    className="btn btn-outline"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.775rem', borderRadius: 'var(--radius-sm)' }}
                  >
                    <RotateCcw size={12} /> Resume as New
                  </button>
                ) : <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Expired</span>}
              </div>
            </div>
          );
        })}
      </div>
      {isLoading && <div role="status" className="hand-label" style={{ marginTop: '0.75rem' }}>refreshing saved boards…</div>}
    </div>
  );
};
