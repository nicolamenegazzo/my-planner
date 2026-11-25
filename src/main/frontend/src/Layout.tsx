import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';
import { Avatar } from './components';
import { useData } from './data';
import { applyThemePreference, loadThemePreference, type ThemePreference } from './theme';

const NAV = [
  { to: '/board', label: 'Board', icon: '▦' },
  { to: '/kanban', label: 'Sprint attivo', icon: '▥' },
  { to: '/calendario', label: 'Calendario', icon: '◷' },
  { to: '/sprint', label: 'Sprint', icon: '↻' },
  { to: '/progetti', label: 'Progetti', icon: '◆' },
  { to: '/documenti', label: 'Documenti', icon: '▤' },
];

const ADMIN_NAV = [
  { to: '/utenti', label: 'Utenti', icon: '☺' },
  { to: '/impostazioni', label: 'Impostazioni', icon: '⚙' },
  { to: '/import', label: 'Import monday', icon: '⇩' },
];

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { activeSprint, loaded } = useData();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dots">
            <i style={{ background: '#ff3d57' }} />
            <i style={{ background: '#ffcb00' }} />
            <i style={{ background: '#00d647' }} />
          </span>
          My Monday
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="nav-item">
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
          {isAdmin && <div className="nav-section">Amministrazione</div>}
          {isAdmin &&
            ADMIN_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="nav-item">
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
        </nav>
        {activeSprint && (
          <div className="sidebar-sprint">
            <small>Sprint attivo</small>
            <strong>{activeSprint.name}</strong>
          </div>
        )}
        <ThemeSwitch />
        <div className="sidebar-user">
          <NavLink to="/profilo" className="sidebar-user-link">
            <Avatar user={user} size={30} />
            <span>{user?.displayName}</span>
          </NavLink>
          <button className="link-btn" onClick={logout}>
            Esci
          </button>
        </div>
      </aside>
      <main className="content">{loaded ? <Outlet /> : <div className="center-screen">Caricamento…</div>}</main>
    </div>
  );
}

const THEME_OPTIONS: { value: ThemePreference; icon: string; label: string }[] = [
  { value: 'light', icon: '☀', label: 'Tema chiaro' },
  { value: 'system', icon: '🖥', label: 'Tema del sistema operativo' },
  { value: 'dark', icon: '☾', label: 'Tema scuro' },
];

function ThemeSwitch() {
  const [preference, setPreference] = useState<ThemePreference>(loadThemePreference);
  const choose = (value: ThemePreference) => {
    applyThemePreference(value);
    setPreference(value);
  };
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Tema">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={preference === o.value}
          className={preference === o.value ? 'active' : ''}
          title={o.label}
          onClick={() => choose(o.value)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
