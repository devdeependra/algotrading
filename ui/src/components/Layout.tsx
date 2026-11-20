import type { ReactNode } from 'react';
import { isAdmin } from '../api';
import type { Health, User } from '../api';
import { navigate, usePath } from '../router';

interface Props {
  health: Health | null;
  me: User | null;
  onSignOut: () => void;
  children: ReactNode;
}

export function Layout({ health, me, onSignOut, children }: Props) {
  const path = usePath();
  const link = (to: string, label: string) => (
    <a href={to} className={path === to ? 'active' : ''} onClick={(e) => { e.preventDefault(); navigate(to); }}>
      {label}
    </a>
  );
  return (
    <main className="shell">
      <header className="topbar">
        <h1>Algotrading</h1>
        <span className={`pill ${health?.status === 'ok' ? 'pill-ok' : 'pill-bad'}`}>
          {health ? `API ${health.status} · DB ${health.db} · v${health.version}` : 'API unreachable'}
        </span>
      </header>
      {me && (
        <nav className="nav">
          {link('/', 'Home')}
          {link('/profile', 'Profile')}
          {isAdmin(me) && me.status === 'active' && link('/admin/users', 'Users')}
          <span className="spacer" />
          <span className="muted">{me.email}</span>
          <button className="link" onClick={onSignOut}>Sign out</button>
        </nav>
      )}
      {children}
    </main>
  );
}
