import type { User } from '../api';

export function HomePage({ me }: { me: User }) {
  if (me.status === 'pending') {
    return (
      <section className="card">
        <h2>Waiting for approval</h2>
        <p>
          Your account was created and is waiting for an admin to approve it. Until then you can sign in and
          manage your profile, but nothing else.
        </p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Dashboard</h2>
      <p className="muted">
        Signed in as {me.role}. Broker setup and signals arrive in later phases.
      </p>
    </section>
  );
}
