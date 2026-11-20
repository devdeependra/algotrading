import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api';
import type { User } from '../api';

export function ProfilePage({ me }: { me: User }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setMsg({ kind: 'ok', text: 'Password changed.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Profile</h2>
        <dl className="facts">
          <dt>Email</dt><dd>{me.email}</dd>
          <dt>Role</dt><dd>{me.role}</dd>
          <dt>Status</dt><dd><span className={`tag tag-${me.status}`}>{me.status}</span></dd>
          <dt>Member since</dt><dd>{new Date(me.createdAt).toLocaleDateString()}</dd>
          {me.approvedAt && (<><dt>Approved</dt><dd>{new Date(me.approvedAt).toLocaleDateString()}</dd></>)}
        </dl>
      </section>
      <section className="card">
        <h2>Change password</h2>
        <form onSubmit={submit}>
          <label>
            Current password
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          </label>
          <label>
            New password
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} autoComplete="new-password" />
          </label>
          {msg && <p className={msg.kind === 'ok' ? 'muted' : 'error'}>{msg.text}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Working…' : 'Change password'}</button>
        </form>
      </section>
    </>
  );
}
