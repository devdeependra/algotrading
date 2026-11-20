import type { AuditLogRepository } from '../db/repositories/auditLog.js';
import { toPublicUser } from '../db/repositories/users.js';
import type { UserRepository } from '../db/repositories/users.js';

/**
 * Startup reconciliation for the superadmin binding. If the configured email
 * has registered, make sure it is superadmin and active, and that no other
 * account holds the superadmin role. Handles SUPERADMIN_EMAIL changing
 * between deployments. Does nothing if the email has not registered yet.
 */
export async function ensureSuperadmin(users: UserRepository, audit: AuditLogRepository, superadminEmail: string): Promise<void> {
  const all = await users.list();
  const designated = all.find((u) => u.email.toLowerCase() === superadminEmail);

  for (const u of all) {
    if (u.role === 'superadmin' && u.id !== designated?.id) {
      const after = await users.update(u.id, { role: 'admin' });
      await audit.append({ actorId: null, action: 'user.role_changed', entityType: 'user', entityId: u.id, before: toPublicUser(u), after: after ? toPublicUser(after) : null });
    }
  }

  if (designated && (designated.role !== 'superadmin' || designated.status !== 'active')) {
    const after = await users.update(designated.id, { role: 'superadmin', status: 'active', approvedAt: designated.approvedAt ?? new Date() });
    await audit.append({ actorId: null, action: 'user.superadmin_bound', entityType: 'user', entityId: designated.id, before: toPublicUser(designated), after: after ? toPublicUser(after) : null });
  }
}
