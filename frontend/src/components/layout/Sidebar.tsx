import React, { useState } from 'react';
import { useSocialStore } from '../../store/socialStore';
import { CodeBracketDoodle, CoffeeCupDoodle, PaperClipDoodle } from '../doodles/DoodleAccents';
import { Plus, Send, UserMinus } from 'lucide-react';
import type { Friend } from '../../types';

interface SidebarProps {
  onInviteFriend?: (friend: Friend) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onInviteFriend }) => {
  const { friends, incoming, outgoing, invites, sendFriendRequest, respondFriendRequest, cancelFriendRequest, removeFriend, respondInvite } = useSocialStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newFriendName.trim()) {
      try { await sendFriendRequest(newFriendName); setNewFriendName(''); setIsAdding(false); } catch { /* shown globally */ }
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online':
        return 'var(--sage)';
      case 'in-session':
        return 'var(--warm-accent)';
      case 'reconnecting':
        return 'var(--warm-accent)';
      case 'offline':
      default:
        return 'var(--border-strong)';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'online':
        return 'available';
      case 'in-session':
        return 'in code session';
      case 'reconnecting':
        return 'reconnecting...';
      case 'offline':
      default:
        return 'offline';
    }
  };

  return (
    <aside 
      style={{
        width: '260px',
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border-muted)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Brand Header */}
      <div 
        style={{
          padding: '1.25rem 1.25rem 1rem',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div 
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-muted)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            <CodeBracketDoodle size={22} color="var(--warm-accent)" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              Space2Code
            </div>
            <span className="hand-label" style={{ fontSize: '0.85rem' }}>shared desk</span>
          </div>
        </div>

        <PaperClipDoodle size={20} color="var(--border-strong)" style={{ transform: 'rotate(15deg)' }} />
      </div>

      {/* Friends Section */}
      <div style={{ flex: 1, padding: '1.25rem 1rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', padding: '0 0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
              FRIENDS & PEERS
            </span>
          </div>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="btn-ghost"
            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            title="Add Friend"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Quick Add Form */}
        {isAdding && (
          <form onSubmit={handleAddSubmit} style={{ marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input
                type="text"
                placeholder="Friend's user ID..."
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                autoFocus
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 0.6rem' }}>
                <Send size={12} />
              </button>
            </div>
          </form>
        )}

        {/* Friends List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {friends.map((friend) => {
            const isReconnecting = friend.status === 'reconnecting';
            return (
              <div
                key={friend.id}
                style={{
                  padding: '0.55rem 0.65rem',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.15s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {/* Avatar with Status Dot */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {friend.avatarUrl ? <img src={friend.avatarUrl} alt="" referrerPolicy="no-referrer" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/> : friend.displayName ? friend.displayName.charAt(0) : '?'}
                  </div>

                  {/* Presence Dot */}
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '-1px',
                      right: '-1px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(friend.status),
                      border: '2px solid var(--surface)',
                      boxShadow: isReconnecting ? '0 0 0 1px var(--warm-accent)' : 'none',
                      animation: isReconnecting ? 'pulse 1.8s infinite' : 'none',
                    }}
                  />
                </div>

                {/* Friend Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {friend.displayName}
                  </div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                    {getStatusLabel(friend.status)}
                  </div>
                </div>

                {/* Invite Action for Online Friends */}
                {friend.status === 'online' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onInviteFriend) onInviteFriend(friend);
                    }}
                    className="btn btn-outline"
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.7rem',
                      borderRadius: 'var(--radius-sm)',
                      borderColor: 'var(--sage)',
                      color: 'var(--sage)',
                    }}
                    title="Invite to code"
                  >
                    invite
                  </button>
                )}
                <button onClick={(event)=>{event.stopPropagation();if(window.confirm(`Remove ${friend.displayName??'this friend'}?`))void removeFriend(friend.id).catch(()=>undefined)}} className="btn-ghost" style={{padding:'0.2rem',color:'var(--text-muted)'}} title="Remove friend"><UserMinus size={12}/></button>
              </div>
            );
          })}
        </div>
        {(incoming.length > 0 || outgoing.length > 0 || invites.length > 0) && (
          <div style={{ marginTop: '1rem', borderTop: '1px dashed var(--border-muted)', paddingTop: '0.75rem', display: 'grid', gap: '0.45rem' }}>
            {incoming.map((request) => <div key={request.id} style={{ fontSize: '0.75rem' }}>
              <strong>{request.sender.displayName ?? 'A coder'}</strong> wants to connect{' '}
              <button className="btn-ghost" onClick={() => void respondFriendRequest(request.id, 'accept').catch(()=>undefined)}>accept</button>
              <button className="btn-ghost" onClick={() => void respondFriendRequest(request.id, 'decline').catch(()=>undefined)}>decline</button>
            </div>)}
            {outgoing.map((request) => <div key={request.id} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Request pending <button className="btn-ghost" onClick={() => void cancelFriendRequest(request.id).catch(()=>undefined)}>cancel</button>
            </div>)}
            {invites.map((invite) => <div key={invite.id} style={{ fontSize: '0.75rem' }}>
              Session invitation{' '}
              <button className="btn-ghost" onClick={() => void respondInvite(invite.id, 'accept').then((id) => id && location.assign(`/session/${id}`)).catch(()=>undefined)}>join</button>
              <button className="btn-ghost" onClick={() => void respondInvite(invite.id, 'decline').catch(()=>undefined)}>decline</button>
            </div>)}
          </div>
        )}
      </div>

      {/* Sidebar Footer Accents */}
      <div 
        style={{
          padding: '0.85rem 1.25rem',
          borderTop: '1px solid var(--border-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span className="hand-label" style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
          "ready when you are"
        </span>
        <CoffeeCupDoodle size={22} color="var(--warm-accent)" />
      </div>
    </aside>
  );
};
