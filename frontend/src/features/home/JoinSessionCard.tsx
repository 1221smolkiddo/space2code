import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';
import { WashiTape } from '../../components/doodles/WashiTape';
import { LogIn, ArrowRight } from 'lucide-react';

export const JoinSessionCard: React.FC = () => {
  const [roomCode, setRoomCode] = useState('');
  const navigate = useNavigate();
  const { joinSession, isLoading, error } = useSessionStore();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      try {
        const result = await joinSession(roomCode.trim());
        navigate(`/session/${result.room.id}`);
      } catch { /* store renders a safe error */ }
    }
  };

  return (
    <div
      className="desk-card desk-card-interactive"
      style={{
        padding: '1.75rem',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-muted)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <WashiTape position="top-right" variant="paper" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <span className="hand-label" style={{ fontSize: '1.15rem', color: 'var(--warm-accent)' }}>
            enter invite code
          </span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '2px', color: 'var(--text-primary)' }}>
            Join Session
          </h2>
        </div>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border-muted)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LogIn size={18} />
        </div>
      </div>

      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        Have a session code from your peer? Paste or type it below to step into their coding desk.
      </p>

      {/* Room Code Form */}
      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            DESK ROOM CODE
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. ABC234"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              required
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                backgroundColor: 'var(--surface)',
              }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!roomCode.trim() || isLoading}
          className="btn btn-outline"
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            fontSize: '0.925rem',
            fontWeight: 700,
            borderColor: roomCode.trim() ? 'var(--warm-accent)' : 'var(--border-muted)',
            color: roomCode.trim() ? 'var(--warm-accent)' : 'var(--text-secondary)',
          }}
        >
          {isLoading ? 'Joining Board…' : 'Step Onto Board'} <ArrowRight size={16} />
        </button>
        {error && <div role="alert" className="scratch-error">{error}</div>}
      </form>
    </div>
  );
};
