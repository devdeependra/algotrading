import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from './api';
import type { Health, Me } from './api';

type Mode = 'login' | 'register';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      setMe({ ...user, createdAt: new Date().toISOString() });
      setPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    setMe(null);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <h1>Algotrading</h1>
        <span className={`pill ${health?.status === 'ok' ? 'pill-ok' : 'pill-bad'}`}>
          {health ? `API ${health.status} · DB ${health.db} · v${health.version}` : 'API unreachable'}
        </span>
      </header>

      {me === undefined ? (
        <p className="muted">Loading…</p>
      ) : me ? (
        <section className="card">
          <p>
            Signed in as <strong>{me.email}</strong>
          </p>
          <p className="muted">Phase 1 complete. Broker setup arrives in Phase 2.</p>
          <button onClick={logout}>Sign out</button>
        </section>
      ) : (
        <section className="card">
          <div className="tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Sign in
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
              Create account
            </button>
          </div>
          <form onSubmit={submit}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
