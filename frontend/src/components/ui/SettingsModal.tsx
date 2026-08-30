import React, { useState } from 'react';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { X, Moon, Sun, Monitor, LogOut, Type } from 'lucide-react';
import { WashiTape } from '../doodles/WashiTape';
import { SparkleDoodle } from '../doodles/DoodleAccents';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { theme, setTheme, fontSize, setFontSize } = useThemeStore();
  const { user, logout, updateProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(28, 27, 24, 0.7)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div 
        className="desk-card"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '1.75rem',
          position: 'relative',
          backgroundColor: 'var(--surface)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <WashiTape position="top" variant="sage" />
        <SparkleDoodle style={{ position: 'absolute', top: '16px', right: '48px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <span className="hand-label">preferences & desk</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '2px' }}>Settings</h2>
          </div>
          <button 
            onClick={onClose} 
            className="btn-ghost" 
            style={{ padding: '0.4rem', borderRadius: 'var(--radius-md)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile Details */}
        <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '50%', 
              backgroundColor: 'var(--sage)', 
              color: '#1A2218',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem'
            }}>
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/> : user?.displayName ? user.displayName.charAt(0) : 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{user?.displayName || 'User'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || 'coder@space2code.io'}
              </div>
            </div>
          </div>
          <input aria-label="Display name" value={displayName} onChange={(event)=>setDisplayName(event.target.value)} onBlur={()=>{if(displayName.trim()&&displayName.trim()!==user?.displayName)void updateProfile({displayName:displayName.trim()}).catch(()=>undefined)}} style={{width:'100%',marginTop:'0.65rem',fontSize:'0.82rem'}} />
        </div>

        {/* Theme Preference */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            APPEARANCE (COZY PALETTE)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => { setTheme(mode); void updateProfile({preferredTheme:mode}).catch(()=>undefined); }}
                className={`btn ${theme === mode ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.5rem', fontSize: '0.8rem', textTransform: 'capitalize' }}
              >
                {mode === 'dark' && <Moon size={14} />}
                {mode === 'light' && <Sun size={14} />}
                {mode === 'system' && <Monitor size={14} />}
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Editor Font Size */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Type size={14} /> EDITOR FONT SIZE
            </label>
            <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fontSize}px</span>
          </div>
          <input 
            type="range" 
            min="12" 
            max="20" 
            step="1"
            value={fontSize} 
            onChange={(e) => setFontSize(Number(e.target.value))}
            onPointerUp={() => void updateProfile({editorFontSize:fontSize}).catch(()=>undefined)}
            onKeyUp={() => void updateProfile({editorFontSize:fontSize}).catch(()=>undefined)}
            style={{ width: '100%', accentColor: 'var(--sage)', padding: 0 }}
          />
        </div>

        {/* Logout */}
        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={() => {
              void logout().then(onClose);
            }}
            className="btn btn-outline"
            style={{ color: 'var(--error-color)', borderColor: 'var(--border-muted)', fontSize: '0.85rem' }}
          >
            <LogOut size={15} /> Sign Out
          </button>

          <button 
            onClick={onClose}
            className="btn btn-primary"
            style={{ fontSize: '0.85rem' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
