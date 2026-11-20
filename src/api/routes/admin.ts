import { Router } from 'express';
import type { AppConfig } from '../../config/index.js';
import type { AuditLogRepository } from '../../db/repositories/auditLog.js';
import { toPublicUser, USER_STATUSES } from '../../db/repositories/users.js';
import type { Role, User, UserPatch, UserRepository, UserStatus } from '../../db/repositories/users.js';
import { canManage, TRANSITIONS } from '../authz.js';
import type { AdminAction } from '../authz.js';
import { currentUser, requireActive, requireAuth, requireRole } from '../middleware/requireAuth.js';

export interface AdminDeps {
  config: AppConfig;
  users: UserRepository;
  audit: AuditLogRepository;
}

const AUDIT_ACTION: Record<AdminAction, string> = {
  approve: 'user.approved',
  reject: 'user.rejected',
  suspend: 'user.suspended',
  reinstate: 'user.reinstated',
  set_role: 'user.role_changed',
};

/** `/api/admin/*`. Admin or superadmin, active, with per-target rules in authz. */
export function adminRouter({ config, users, audit }: AdminDeps): Router {
  const router = Router();
  router.use('/admin', requireAuth(config, users), requireActive(), requireRole('admin'));

  router.get('/admin/users', async (req, res) => {
    const status = req.query['status'];
    if (status !== undefined && !(USER_STATUSES as readonly unknown[]).includes(status)) {
      res.status(400).json({ error: `status must be one of ${USER_STATUSES.join(', ')}` });
      return;
    }
    const list = await users.list(status === undefined ? {} : { status: status as UserStatus });
    res.json(list.map(toPublicUser));
  });

  async function apply(actor: User, targetId: string, action: AdminAction, patch: UserPatch, newRole?: Role) {
    const target = await users.findById(targetId);
    if (!target) return { status: 404, body: { error: 'User not found' } };
    const decision = canManage(actor, target, action, newRole);
    if (!decision.ok) return { status: 403, body: { error: decision.reason } };
    const updated = (await users.update(target.id, patch)) as User;
    await audit.append({
      actorId: actor.id,
      action: AUDIT_ACTION[action],
      entityType: 'user',
      entityId: target.id,
      before: toPublicUser(target),
      after: toPublicUser(updated),
    });
    return { status: 200, body: toPublicUser(updated) };
  }

  for (const action of ['approve', 'reject', 'suspend', 'reinstate'] as const) {
    router.post(`/admin/users/:id/${action}`, async (req, res) => {
      const actor = currentUser(req);
      const to = TRANSITIONS[action].to;
      const patch: UserPatch =
        to === 'active' && action === 'approve'
          ? { status: to, approvedBy: actor.id, approvedAt: new Date() }
          : { status: to };
      const result = await apply(actor, req.params['id'] as string, action, patch);
      res.status(result.status).json(result.body);
    });
  }

  router.patch('/admin/users/:id/role', async (req, res) => {
    const actor = currentUser(req);
    const role = (typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>)['role'] : undefined) as Role | undefined;
    const result = await apply(actor, req.params['id'] as string, 'set_role', role === undefined ? {} : { role }, role);
    res.status(result.status).json(result.body);
  });

  return router;
}
