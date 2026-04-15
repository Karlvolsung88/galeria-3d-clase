import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { initAuth, onAuthStateChange, signOut, getMe, isAdmin, type Profile } from '../lib/api';
import AuthModal from './AuthModal';

export default function UserMenu() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initAuth().then(({ profile: p }) => setProfile(p));
    const unsub = onAuthStateChange(async (user) => {
      if (user) {
        const p = await getMe();
        setProfile(p);
      } else {
        setProfile(null);
      }
    });
    return unsub;
  }, []);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = useNavigate();

  const handleLogout = () => {
    signOut();
    setOpen(false);
    navigate('/');
  };

  const initials = (name: string) => {
    const parts = name.trim().split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  };

  if (!profile) {
    return (
      <>
        <button className="usermenu-login-btn" onClick={() => setShowAuth(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Login
        </button>
        {showAuth && (
          <AuthModal
            onSuccess={() => setShowAuth(false)}
            onClose={() => setShowAuth(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="usermenu" ref={ref}>
      <button className="usermenu-badge" onClick={() => setOpen((o) => !o)}>
        <span className="usermenu-avatar">{initials(profile.full_name)}</span>
        <span className="usermenu-name">{profile.full_name.split(' ')[0]}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="usermenu-dropdown">
          <div className="usermenu-dropdown-header">
            <span className="usermenu-dropdown-name">{profile.full_name}</span>
            <span className="usermenu-dropdown-role">
              {(profile.roles ?? [profile.role])
                .map((r) => r === 'admin' ? 'Admin' : r === 'teacher' ? 'Profesor' : 'Estudiante')
                .join(' · ')}
            </span>
          </div>
          <div className="usermenu-dropdown-divider" />
          {isAdmin(profile) && (
            <Link to="/admin" className="usermenu-dropdown-item"
              onClick={() => setOpen(false)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Panel Admin
            </Link>
          )}
          <Link to="/perfil" className="usermenu-dropdown-item"
            onClick={() => setOpen(false)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Ver Perfil
          </Link>
          <Link to="/perfil?edit=1" className="usermenu-dropdown-item"
            onClick={() => setOpen(false)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar Perfil
          </Link>
          <div className="usermenu-dropdown-divider" />
          <button className="usermenu-dropdown-item usermenu-logout" onClick={handleLogout}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
