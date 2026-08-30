import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Settings } from 'lucide-react';
import { SettingsModal } from '../ui/SettingsModal';

export const TopNav: React.FC = () => {
  const { user } = useAuthStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0.85rem 1.5rem',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* User chip */}
          <div
            onClick={() => setIsSettingsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 0.65rem',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border-muted)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-paper)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-muted)')}
            title="User Profile & Settings"
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: 'var(--sage)',
                color: '#1A2218',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {user?.displayName ? user.displayName.charAt(0) : 'U'}
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.displayName || 'Coder'}
            </span>
            <Settings size={15} style={{ color: 'var(--text-secondary)' }} />
          </div>
        </div>
      </header>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </>
  );
};
