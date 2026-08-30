import React, { useState } from 'react';
import { Terminal, X, Copy, Check, Play, Loader2 } from 'lucide-react';
import type { EditorCardState } from '../../store/sessionStore';
import { useSessionStore } from '../../store/sessionStore';

interface OutputDrawerProps {
  slot: 'A' | 'B';
  state: EditorCardState;
  onClose: () => void;
  onRun: () => void;
}

export const OutputDrawer: React.FC<OutputDrawerProps> = ({
  slot,
  state,
  onClose,
  onRun,
}) => {
  const setStdin = useSessionStore((store) => store.setStdin);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'stdout' | 'stdin'>('stdout');
  const [stdinValue, setStdinValue] = useState(state.stdin);

  const handleCopy = () => {
    navigator.clipboard.writeText(state.stdout || state.stderr || 'No output');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        height: '180px',
        backgroundColor: '#161513',
        borderTop: '1px solid var(--border-muted)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        color: '#E0DDD5',
      }}
    >
      {/* Console Top Bar */}
      <div
        style={{
          height: '32px',
          backgroundColor: '#1E1D19',
          borderBottom: '1px solid #2D2B26',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--warm-accent)', fontWeight: 700, fontSize: '0.75rem' }}>
            <Terminal size={13} />
            <span>CONSOLE {slot}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              onClick={() => setActiveTab('stdout')}
              style={{
                padding: '0.15rem 0.45rem',
                fontSize: '0.725rem',
                borderRadius: '3px',
                backgroundColor: activeTab === 'stdout' ? '#2B2924' : 'transparent',
                color: activeTab === 'stdout' ? '#EBE6D8' : '#8A8578',
              }}
            >
              Output
            </button>
            <button
              onClick={() => setActiveTab('stdin')}
              style={{
                padding: '0.15rem 0.45rem',
                fontSize: '0.725rem',
                borderRadius: '3px',
                backgroundColor: activeTab === 'stdin' ? '#2B2924' : 'transparent',
                color: activeTab === 'stdin' ? '#EBE6D8' : '#8A8578',
              }}
            >
              Interactive Stdin
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {state.stdout && (
            <button 
              onClick={handleCopy}
              className="btn-ghost" 
              style={{ padding: '0.15rem', color: '#8A8578' }} 
              title="Copy Output"
            >
              {copied ? <Check size={13} style={{ color: 'var(--sage)' }} /> : <Copy size={13} />}
            </button>
          )}

          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: '0.15rem', color: '#8A8578' }}
            title="Close Console"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Output Content Area */}
      <div style={{ flex: 1, padding: '0.65rem 0.85rem', overflowY: 'auto' }}>
        {state.outputState === 'running' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warm-accent)' }}>
            <Loader2 size={14} className="animate-spin" />
            <span>Compiling & executing code...</span>
          </div>
        ) : activeTab === 'stdin' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <span style={{ fontSize: '0.7rem', color: '#8A8578', marginBottom: '0.25rem' }}>
              Standard input passed to process:
            </span>
            <textarea
              value={stdinValue}
              onChange={(e) => { setStdinValue(e.target.value); setStdin(slot, e.target.value); }}
              placeholder="Enter standard input values here..."
              style={{
                flex: 1,
                backgroundColor: '#100F0E',
                border: '1px solid #2D2B26',
                color: '#EBE6D8',
                fontSize: '0.775rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.4rem',
                resize: 'none',
              }}
            />
          </div>
        ) : state.stdout || state.stderr ? (
          <pre
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.775rem',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: state.stderr ? 'var(--error-color)' : '#E0DDD5',
            }}
          >
            {state.stdout || state.stderr}
          </pre>
        ) : (
          <div style={{ color: '#6A655A', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>No execution output yet. Click 'Run' to execute.</span>
            <button
              onClick={onRun}
              className="btn btn-outline"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: '#3A3831', color: 'var(--sage)' }}
            >
              <Play size={11} /> Run Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
