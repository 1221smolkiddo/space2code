import React, { useEffect } from 'react';
import { Sidebar } from '../../components/layout/Sidebar';
import { TopNav } from '../../components/layout/TopNav';
import { StartSessionCard } from './StartSessionCard';
import { JoinSessionCard } from './JoinSessionCard';
import { RecentSessions } from './RecentSessions';
import { 
  CodeBracketDoodle, 
  SparkleDoodle, 
  BracesDoodle, 
  PencilDoodle, 
  CurvedArrowDoodle 
} from '../../components/doodles/DoodleAccents';
import { useSessionStore } from '../../store/sessionStore';
import { useSocialStore } from '../../store/socialStore';
import { useNavigate } from 'react-router-dom';
import type { Friend } from '../../types';
import { socialApi } from '../../api/social';

export const HomePage: React.FC = () => {
  const { createSession } = useSessionStore();
  const { load, startEvents, error } = useSocialStore();
  const navigate = useNavigate();

  useEffect(() => {
    void load();
    void socialApi.setPresence('ONLINE').catch(()=>undefined);
    const stop = startEvents();
    return stop;
  }, [load, startEvents]);

  const handleInviteFriend = async (friend: Friend) => {
    try {
      const room = await createSession('python');
      await useSocialStore.getState().inviteFriend(friend.id, room.room.id);
      navigate(`/session/${room.room.id}`);
    } catch { /* the relevant store renders a safe error */ }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-main)',
      }}
    >
      {/* Left Sidebar */}
      <Sidebar onInviteFriend={handleInviteFriend} />

      {/* Main Coding Desk Workspace */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Subtle Decorative Desk Doodles */}
        <CodeBracketDoodle 
          size={32} 
          color="var(--warm-accent)" 
          style={{ position: 'absolute', top: '24px', left: '48px', opacity: 0.7 }} 
        />
        <SparkleDoodle 
          size={24} 
          color="var(--warm-accent)" 
          style={{ position: 'absolute', top: '75px', right: '120px', opacity: 0.75 }} 
        />
        <BracesDoodle 
          size={42} 
          color="var(--paper)" 
          style={{ position: 'absolute', bottom: '60px', right: '48px', opacity: 0.6 }} 
        />
        <PencilDoodle 
          size={36} 
          color="var(--sage)" 
          style={{ position: 'absolute', bottom: '40px', left: '60px', opacity: 0.65, transform: 'rotate(-20deg)' }} 
        />

        {/* Minimal Top Navigation */}
        <TopNav />

        {/* Center Workspace Content */}
        <main
          style={{
            flex: 1,
            width: '100%',
            maxWidth: '1080px',
            margin: '0 auto',
            padding: '1rem 2rem 3rem',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {/* Desk Header (Personal & Focused, No Giant Generic Slogan) */}
          <div style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <span className="hand-label" style={{ fontSize: '1.25rem', color: 'var(--warm-accent)' }}>
                your workspace
              </span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginTop: '2px', color: 'var(--text-primary)' }}>
                Coding Desk
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CurvedArrowDoodle size={26} color="var(--sage)" direction="right" />
              <span className="hand-label-sage" style={{ fontSize: '1.05rem' }}>
                two editors · live scratchpad
              </span>
            </div>
          </div>

          {/* Primary Action Cards Grid (Start & Join) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.5rem',
            }}
          >
          {error && <div role="alert" className="scratch-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <StartSessionCard />
            <JoinSessionCard />
          </div>

          {/* Recent Sessions List */}
          <RecentSessions />
        </main>
      </div>
    </div>
  );
};
