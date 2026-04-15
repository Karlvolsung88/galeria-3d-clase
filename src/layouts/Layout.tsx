import { useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import UserMenu from '../components/UserMenu';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { onAuthStateChange, getCurrentUser, type AuthUser } from '../lib/api';

export default function Layout() {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser());

  // Suscripción global a cambios de auth — cuando un usuario se loguea con
  // must_change_password=true (Plan C flow), este Layout detecta el flag y
  // monta el modal forzado sobre cualquier ruta activa.
  useEffect(() => {
    const unsubscribe = onAuthStateChange((u) => setUser(u));
    return unsubscribe;
  }, []);

  const mustChange = user?.must_change_password === true;

  return (
    <>
      <div id="top-bar">
        <NavLink to="/" className="topbar-brand">
          <span className="topbar-brand-dot">✦</span>
          <span>Galería 3D</span>
        </NavLink>
        <nav className="topbar-nav">
          <NavLink to="/" className="topbar-nav-link" end>Galería</NavLink>
          <NavLink to="/estudiantes" className="topbar-nav-link">Estudiantes</NavLink>
        </nav>
        <div className="topbar-right">
          <UserMenu />
        </div>
      </div>
      <Outlet />

      {mustChange && user && (
        <ChangePasswordModal
          userLabel={user.full_name}
          onSuccess={() => {
            // El modal llama clearMustChangePassword() internamente,
            // onAuthStateChange nos trae el user con flag=false → modal desmonta.
          }}
        />
      )}
    </>
  );
}
