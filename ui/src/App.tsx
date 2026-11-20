import { useEffect, useState } from 'react';
import { api, isAdmin } from './api';
import type { Health, User } from './api';
import { Layout } from './components/Layout';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { navigate, usePath } from './router';

export function App() {
  const path = usePath();
  const [health, setHealth] = useState<Health | null>(null);
  const [me, setMe] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  async function signOut() {
    await api.logout();
    setMe(null);
    navigate('/');
  }

  if (me === undefined) {
    return (
      <Layout health={health} me={null} onSignOut={signOut}>
        <p className="muted">Loading…</p>
      </Layout>
    );
  }

  let page;
  if (!me) {
    page = <LoginPage onSignedIn={(u) => { setMe(u); navigate('/'); }} />;
  } else if (path === '/profile') {
    page = <ProfilePage me={me} />;
  } else if (path === '/admin/users') {
    page = isAdmin(me) && me.status === 'active' ? <AdminUsersPage me={me} /> : <HomePage me={me} />;
  } else {
    page = <HomePage me={me} />;
  }

  return (
    <Layout health={health} me={me} onSignOut={signOut}>
      {page}
    </Layout>
  );
}
