import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';
import { WashiTape } from '../../components/doodles/WashiTape';
import { Plus, ArrowRight } from 'lucide-react';

const LANGUAGES = ['Python', 'JavaScript', 'C++', 'C', 'Java'];

export const StartSessionCard: React.FC = () => {
  const [selectedLang, setSelectedLang] = useState('Python');
  const navigate = useNavigate();
  const { createSession, isLoading, error } = useSessionStore();

  const handleStart = async () => {
    try {
      const result = await createSession(selectedLang.toLowerCase() === 'c++' ? 'cpp' : selectedLang.toLowerCase());
      navigate(`/session/${result.room.id}`);
    } catch { /* store renders a safe error */ }
  };

  return (
    <div
      className="desk-card desk-card-interactive"
      style={{
        padding: '1.75rem',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--sage-dark)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <WashiTape position="top-left" variant="sage" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <span className="hand-label-sage" style={{ fontSize: '1.15rem' }}>new coding board</span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '2px', color: 'var(--text-primary)' }}>
            Start Session
          </h2>
        </div>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--sage)',
            color: '#1A2218',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={20} strokeWidth={2.5} />
        </div>
      </div>

      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        Pick a language to open a 2-person shared coding desk. Question and timer can be added inside.
      </p>

      {/* Language Selector Chips */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          PRIMARY LANGUAGE
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLang === lang;
            return (
              <button
                key={lang}
                onClick={() => setSelectedLang(lang)}
                className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isSelected ? 'var(--sage)' : 'var(--bg-secondary)',
                  borderColor: isSelected ? 'var(--sage-dark)' : 'var(--border-muted)',
                }}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Button */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          onClick={handleStart}
          disabled={isLoading}
          className="btn btn-primary"
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            fontSize: '0.925rem',
            fontWeight: 700,
          }}
        >
          {isLoading ? 'Creating Board…' : 'Create Desk Board'} <ArrowRight size={16} />
        </button>
      </div>
      {error && <div role="alert" className="scratch-error" style={{ marginTop: '0.65rem' }}>{error}</div>}
    </div>
  );
};
