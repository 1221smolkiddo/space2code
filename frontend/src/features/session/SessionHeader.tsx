import React, { useEffect } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { WashiTape } from '../../components/doodles/WashiTape';
import { SparkleDoodle } from '../../components/doodles/DoodleAccents';
import { 
  Presentation, 
  MicOff, 
  VideoOff, 
  Copy, 
  Check, 
  Clock, 
  ArrowLeft,
  FileText,
  Download,
  LogOut
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { confirmExplicitLeave } from './leaveConfirmation';

const LANGUAGES = [
  {value:'python',label:'Python'}, {value:'javascript',label:'JavaScript'},
  {value:'cpp',label:'C++'}, {value:'c',label:'C'}, {value:'java',label:'Java'},
];

export const SessionHeader: React.FC = () => {
  const { 
    roomCode, 
    language, 
    timer, 
    setTimer, 
    tickTimer, 
    isExplainMode, 
    explainPrimarySlot,
    toggleExplainMode,
    toggleQuestionPanel,
    leaveSession,
    exportSession,
    connectionState,
    error,
  } = useSessionStore();

  const [copied, setCopied] = React.useState(false);
  const navigate = useNavigate();

  // Timer ticker
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timer.status === 'running') {
      interval = setInterval(() => {
        tickTimer();
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer.status, tickTimer]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <header
      style={{
        height: '56px',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1rem',
        position: 'relative',
        zIndex: 30,
      }}
    >
      {/* Left: Back button + Language selector + Room Code + Question Sheet Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <button
          onClick={() => navigate('/home')}
          className="btn-ghost"
          style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
          title="Back to Desk"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Language Picker */}
        <select
          value={language}
          disabled
          style={{
            padding: '0.3rem 0.6rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-muted)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>

        {/* Session Code Chip */}
        <div
          onClick={handleCopyCode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.55rem',
            backgroundColor: 'var(--bg-main)',
            border: '1px dashed var(--border-muted)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: '0.775rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
          title="Click to copy invite code"
        >
          <span>{roomCode}</span>
          {copied ? <Check size={12} style={{ color: 'var(--sage)' }} /> : <Copy size={12} />}
        </div>

        {/* Question & Notes Button */}
        <button
          onClick={toggleQuestionPanel}
          className="btn btn-outline"
          style={{
            padding: '0.3rem 0.65rem',
            fontSize: '0.775rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            backgroundColor: 'var(--bg-secondary)',
          }}
          title="Open Question & Notes Sheet"
        >
          <FileText size={14} style={{ color: 'var(--warm-accent)' }} />
          <span>Question & Notes</span>
        </button>
      </div>

      {/* Center: Taped Timer Display */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <WashiTape position="top" variant="amber" style={{ width: '50px', height: '12px' }} />

        <div
          style={{
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border-muted)',
            borderRadius: 'var(--radius-md)',
            padding: '0.25rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
          }}
        >
          {timer.status === 'not_started' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.775rem' }}>
              <Clock size={13} style={{ color: 'var(--warm-accent)' }} />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Timer:</span>
              <button
                onClick={() => setTimer(15)}
                className="btn-ghost"
                style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', fontWeight: 600 }}
              >
                15m
              </button>
              <button
                onClick={() => setTimer(30)}
                className="btn-ghost"
                style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', fontWeight: 600 }}
              >
                30m
              </button>
              <button
                onClick={() => setTimer(45)}
                className="btn-ghost"
                style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', fontWeight: 600 }}
              >
                45m
              </button>
            </div>
          ) : timer.status === 'running' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: timer.remainingSeconds < 60 ? 'var(--error-color)' : 'var(--warm-accent)',
                  letterSpacing: '0.05em',
                }}
              >
                {formatSeconds(timer.remainingSeconds)}
              </span>
              <span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>locked</span>
            </div>
          ) : (
            /* Expired State - Playful, non-blocking */
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                className="hand-label"
                style={{
                  fontSize: '1.05rem',
                  color: 'var(--warm-accent)',
                  fontWeight: 700,
                }}
              >
                TIME'S UP!
              </span>
              <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>continue untimed</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Explain Mode Status, Toggle, Voice/Video */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {connectionState !== 'connected' && <span style={{fontSize:'0.7rem',color:'var(--warm-accent)'}}>{connectionState}…</span>}
        {/* Active Explain Mode Badge in Navbar (Non-overlapping) */}
        {isExplainMode && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.55rem',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--warm-accent)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--warm-accent)',
            }}
          >
            <SparkleDoodle size={14} color="var(--warm-accent)" />
            <span>Focus: Desk {explainPrimarySlot}</span>
          </div>
        )}

        <button
          disabled
          className="btn-ghost"
          style={{ padding: '0.35rem 0.5rem', opacity: 0.4, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
          title="Voice (Coming Soon in V2)"
        >
          <MicOff size={15} />
        </button>

        <button
          disabled
          className="btn-ghost"
          style={{ padding: '0.35rem 0.5rem', opacity: 0.4, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
          title="Video (Coming Soon in V2)"
        >
          <VideoOff size={15} />
        </button>

        <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-muted)', margin: '0 0.25rem' }} />

        {/* Explain Mode Toggle Button */}
        <button
          onClick={() => void toggleExplainMode()}
          className={`btn ${isExplainMode ? 'btn-warm' : 'btn-outline'}`}
          style={{
            padding: '0.35rem 0.75rem',
            fontSize: '0.8rem',
            fontWeight: 700,
          }}
        >
          <Presentation size={15} />
          {isExplainMode ? 'Exit Explain' : 'Explain Mode'}
        </button>
        <button onClick={() => void exportSession().catch(()=>undefined)} className="btn-ghost" title="Export retained session"><Download size={15}/></button>
        <button onClick={() => { if(confirmExplicitLeave()) void leaveSession().then(()=>navigate('/home')).catch(()=>undefined) }} className="btn-ghost" title="Exit session"><LogOut size={15}/></button>
      </div>
      {error && <div role="alert" className="session-error-strip">{error}</div>}
    </header>
  );
};
