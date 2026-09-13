import React, { useId, useState } from 'react';
import { Terminal, X, Copy, Check, Play, Loader2 } from 'lucide-react';
import type { EditorCardState } from '../../store/sessionStore';

interface OutputDrawerProps {
  title: string;
  state: EditorCardState;
  onClose?: () => void;
  onRun?: () => void;
  onStdinChange: (value: string) => void;
}

export const OutputDrawer: React.FC<OutputDrawerProps> = ({ title, state, onClose, onRun, onStdinChange }) => {
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const handleCopy = async () => {
    await navigator.clipboard.writeText([state.stdout, state.stderr].filter(Boolean).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <section aria-label={title} style={{ height: '220px', flexShrink: 0, backgroundColor: '#161513', borderTop: '1px solid var(--border-muted)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-mono)', fontSize: '0.775rem', color: '#E0DDD5' }}>
      <div style={{ minHeight: '32px', backgroundColor: '#1E1D19', borderBottom: '1px solid #2D2B26', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0 0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--warm-accent)', fontWeight: 700 }}><Terminal size={13} />{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {(state.stdout || state.stderr) && <button onClick={() => void handleCopy().catch(() => setCopied(false))} className="btn-ghost" title="Copy Output" aria-label="Copy Output">{copied ? <Check size={13} /> : <Copy size={13} />}</button>}
          {onClose && <button onClick={onClose} className="btn-ghost" title="Close Console" aria-label="Close Console"><X size={14} /></button>}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0.5rem 0.85rem' }}>
        <label htmlFor={inputId} style={{ display: 'block', color: '#A49E90', fontSize: '0.7rem', marginBottom: '0.2rem' }}>Input for next run</label>
        <textarea id={inputId} value={state.stdin} onChange={event => onStdinChange(event.target.value)} rows={2} spellCheck={false}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.ctrlKey && event.key === 'Enter' && onRun) {
              event.preventDefault();
              if (state.outputState !== 'running') onRun();
            }
          }}
          placeholder="Enter input before Run…"
          style={{ display: 'block', boxSizing: 'border-box', width: '100%', minHeight: '44px', background: 'transparent', border: 'none', borderLeft: '2px solid var(--sage)', borderRadius: 0, padding: '0.25rem 0.5rem', color: '#EBE6D8', font: 'inherit', lineHeight: 1.45, resize: 'none', overscrollBehavior: 'contain' }} />
        <div style={{ borderTop: '1px solid #2D2B26', marginTop: '0.45rem', paddingTop: '0.4rem' }}>
          <span style={{ color: '#A49E90', fontSize: '0.7rem' }}>Output</span>
          {state.outputState === 'running' && <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warm-accent)', marginTop: '0.25rem' }}><Loader2 size={14} className="animate-spin" />Compiling &amp; executing code...</div>}
          {(state.stdout || state.stderr) ? <pre style={{ margin: '0.25rem 0 0', font: 'inherit', lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{state.stdout}{state.stdout && state.stderr ? '\n' : ''}<span style={{ color: 'var(--error-color)' }}>{state.stderr}</span></pre> : state.outputState !== 'running' && (
            <div style={{ color: '#8A8578', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span>No execution output yet. Click 'Run' to execute.</span>
              {onRun && <button onClick={onRun} className="btn-ghost" style={{ whiteSpace: 'nowrap', color: 'var(--sage)' }}><Play size={11} /> Run Now</button>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
