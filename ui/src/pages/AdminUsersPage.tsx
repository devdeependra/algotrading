import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { User } from '../api';

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate';

export function AdminUsersPage({ me }: { me: User }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin.users().then(setUsers).catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, []);
  useEffect(load, [load]);

  async function run(id: string, fn: () => Promise<User>) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await fn();
      setUsers((list) => (list ?? []).map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  const act = (u: User, action: Action) => run(u.id, () => api.admin.act(u.id, action));
  const setRole = (u: User, role: 'admin' | 'member') => run(u.id, () => api.admin.setRole(u.id, role));

  const canTouch = (u: User) => u.id !== me.id && u.role !== 'superadmin' && !(me.role === 'admin' && u.role === 'admin');

  function actions(u: User) {
    if (!canTouch(u)) return <span className="muted">—</span>;
    const disabled = busyId === u.id;
    const btn = (label: string, onClick: () => void, danger = false) => (
      <button key={label} className={`small ${danger ? 'danger' : ''}`} disabled={disabled} onClick={onClick}>{label}</button>
    );
    const out = [];
    if (u.status === 'pending') out.push(btn('Approve', () => act(u, 'approve')), btn('Reject', () => act(u, 'reject'), true));
    if (u.status === 'rejected') out.push(btn('Approve', () => act(u, 'approve')));
    if (u.status === 'active') out.push(btn('Suspend', () => act(u, 'suspend'), true));
    if (u.status === 'suspended') out.push(btn('Reinstate', () => act(u, 'reinstate')));
    if (me.role === 'superadmin' && u.status === 'active') {
      out.push(u.role === 'member' ? btn('Make admin', () => setRole(u, 'admin')) : btn('Make member', () => setRole(u, 'member')));
    }
    return <div className="actions">{out}</div>;
  }

  if (!users) return <p className="muted">{error ?? 'Loading…'}</p>;

  const pending = users.filter((u) => u.status === 'pending');
  const others = users.filter((u) => u.status !== 'pending');

  const table = (rows: User[]) => (
    <table className="users">
      <thead>
        <tr><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>{u.email}{u.id === me.id && <span className="muted"> (you)</span>}</td>
            <td>{u.role}</td>
            <td><span className={`tag tag-${u.status}`}>{u.status}</span></td>
            <td>{new Date(u.createdAt).toLocaleDateString()}</td>
            <td>{actions(u)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {error && <p className="error">{error}</p>}
      <section className="card">
        <h2>Pending approval {pending.length > 0 && <span className="count">{pending.length}</span>}</h2>
        {pending.length === 0 ? <p className="muted">Nobody is waiting.</p> : table(pending)}
      </section>
      <section className="card">
        <h2>All users</h2>
        {table(others)}
      </section>
    </>
  );
}
