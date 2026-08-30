import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { WashiTape } from '../../components/doodles/WashiTape';
import { 
  CodeBracketDoodle, 
  SparkleDoodle, 
  PencilDoodle, 
  BracesDoodle, 
  CurvedArrowDoodle 
} from '../../components/doodles/DoodleAccents';
import { Mail } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const { loginWithGoogle, loginWithEmail, signupWithEmail, isLoading, error, clearError, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  useEffect(()=>{if(isAuthenticated)navigate('/home',{replace:true})},[isAuthenticated,navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      if (mode === 'login') await loginWithEmail(email, password);
      else await signupWithEmail(email, password, displayName);
      if (useAuthStore.getState().isAuthenticated) navigate('/home');
    } catch { /* the store exposes a safe user-facing message */ }
  };

  const handleGoogleAuth = () => { clearError(); void loginWithGoogle(); };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Hand-Drawn Accents */}
      <CodeBracketDoodle 
        size={38} 
        color="var(--warm-accent)" 
        style={{ position: 'absolute', top: '12%', left: '15%', transform: 'rotate(-10deg)' }} 
      />
      <BracesDoodle 
        size={46} 
        color="var(--paper)" 
        style={{ position: 'absolute', bottom: '15%', left: '18%', transform: 'rotate(8deg)' }} 
      />
      <PencilDoodle 
        size={40} 
        color="var(--sage)" 
        style={{ position: 'absolute', top: '15%', right: '16%', transform: 'rotate(25deg)' }} 
      />
      <SparkleDoodle 
        size={28} 
        color="var(--warm-accent)" 
        style={{ position: 'absolute', bottom: '20%', right: '20%' }} 
      />

      {/* Main Notebook Card */}
      <div
        className="desk-card"
        style={{
          width: '100%',
          maxWidth: '430px',
          padding: '2.5rem 2rem 2rem',
          position: 'relative',
          backgroundColor: 'var(--surface)',
        }}
      >
        <WashiTape position="top" variant="amber" />
        <WashiTape position="top-right" variant="paper" style={{ width: '45px', height: '14px' }} />

        {/* Card Title */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
            <span className="hand-label" style={{ fontSize: '1.25rem' }}>welcome to</span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Space2Code
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            a cozy shared desk to write & explain code
          </p>
        </div>

        {/* Google Login Action */}
        <button
          onClick={handleGoogleAuth}
          className="btn btn-outline"
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            boxShadow: 'var(--shadow-paper)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-muted)' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            or with email
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-muted)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {mode === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Your Name / Alias
              </label>
              <input
                type="text"
                placeholder="Alex Chen"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required={mode === 'signup'}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Email Address
            </label>
            <input
              type="email"
              placeholder="alex@space2code.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', fontSize: '0.9rem' }}
          >
            <Mail size={16} />
            {isLoading ? 'Opening desk…' : mode === 'login' ? 'Open Scratchpad' : 'Create Account'}
          </button>
        </form>

        {error && <div role="alert" className="scratch-error" style={{ marginTop: '0.8rem' }}>{error}</div>}

        {/* Toggle Mode */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {mode === 'login' ? "Don't have a desk yet? " : 'Already have a desk? '}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ fontWeight: 700, color: 'var(--warm-accent)', textDecoration: 'underline' }}
          >
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </div>

        {/* Tiny Doodle Micro Note */}
        <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <CurvedArrowDoodle size={24} color="var(--warm-accent)" direction="right" />
          <span className="hand-label" style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
            ready for two-person coding
          </span>
        </div>
      </div>
    </div>
  );
};
