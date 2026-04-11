import { Outlet, NavLink } from 'react-router-dom';
import UserMenu from '../components/UserMenu';

export default function Layout() {
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
    </>
  );
}
