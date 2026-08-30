import React, { useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { FileText, X } from 'lucide-react';
import { WashiTape } from '../../components/doodles/WashiTape';

export const QuestionSheet: React.FC = () => {
  const { 
    isQuestionOpen, 
    toggleQuestionPanel, 
    questionA, 
    questionB, 
    setQuestion,
    currentSlot,
    questionSaveState,
  } = useSessionStore();

  const [activeTab, setActiveTab] = useState<'A' | 'B'>(currentSlot ?? 'A');

  if (!isQuestionOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(28, 27, 24, 0.45)',
        backdropFilter: 'blur(1px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: '68px 1.5rem 1.5rem',
      }}
      onClick={toggleQuestionPanel}
    >
      <div
        className="desk-card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '1.5rem',
          backgroundColor: 'var(--surface)',
          boxShadow: 'var(--shadow-lift)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <WashiTape position="top-left" variant="paper" style={{ width: '52px', height: '14px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <FileText size={17} style={{ color: 'var(--warm-accent)' }} />
            <h3 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
              Question & Scratchpad Notes
            </h3>
          </div>
          <button 
            onClick={toggleQuestionPanel} 
            className="btn-ghost" 
            style={{ padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Tabs: My Notes vs Partner Notes */}
        <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border-muted)', paddingBottom: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('A')}
            className={`btn ${activeTab === 'A' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.775rem', borderRadius: 'var(--radius-sm)' }}
          >
            {currentSlot === 'A' ? 'My' : 'Partner'} Board Notes (Desk A)
          </button>
          <button
            onClick={() => setActiveTab('B')}
            className={`btn ${activeTab === 'B' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.775rem', borderRadius: 'var(--radius-sm)' }}
          >
            {currentSlot === 'B' ? 'My' : 'Partner'} Board Notes (Desk B)
          </button>
        </div>

        {/* Textarea */}
        <textarea
          rows={6}
          value={activeTab === 'A' ? questionA : questionB}
          onChange={(e) => setQuestion(activeTab, e.target.value)}
          readOnly={activeTab !== currentSlot}
          placeholder="Paste problem description, edge cases, or shared notes here..."
          style={{
            width: '100%',
            fontSize: '0.85rem',
            lineHeight: 1.45,
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border-muted)',
            borderRadius: 'var(--radius-sm)',
            resize: 'vertical',
            fontFamily: 'var(--font-ui)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.25rem' }}>
          <span className="hand-label" style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
            {activeTab !== currentSlot ? 'partner notes are read-only' : questionSaveState === 'saving' ? 'saving…' : questionSaveState === 'error' ? 'save failed' : 'auto-saved to session'}
          </span>
          <button
            onClick={toggleQuestionPanel}
            className="btn btn-primary"
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
