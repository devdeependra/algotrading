import type { Role, User, UserStatus } from '../db/repositories/users.js';

/**
 * Authorization rules for user management. Pure functions, unit tested.
 *
 * Hierarchy: superadmin > admin > member.
 * - superadmin: everything. Exactly one, bound to config. Untouchable.
 * - admin: approve / reject / suspend / reinstate members. Cannot change
 *   roles and cannot touch other admins.
 * - member: nothing administrative. `pending` members may log in and manage
 *   their own profile only.
 * - nobody can modify their own account through the admin API.
 */

export const ADMIN_ACTIONS = ['approve', 'reject', 'suspend', 'reinstate', 'set_role'] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type Decision = { ok: true } | { ok: false; reason: string };

const deny = (reason: string): Decision => ({ ok: false, reason });
const allow: Decision = { ok: true };

export function isAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === 'admin' || user.role === 'superadmin';
}

export function canLogIn(status: UserStatus): Decision {
  switch (status) {
    case 'pending':
    case 'active':
      return allow;
    case 'suspended':
      return deny('Account suspended');
    case 'rejected':
      return deny('Account not approved');
  }
}

/** Status transitions each action performs. */
export const TRANSITIONS: Record<Exclude<AdminAction, 'set_role'>, { from: UserStatus[]; to: UserStatus }> = {
  approve: { from: ['pending', 'rejected'], to: 'active' },
  reject: { from: ['pending'], to: 'rejected' },
  suspend: { from: ['active'], to: 'suspended' },
  reinstate: { from: ['suspended'], to: 'active' },
};

export function canManage(actor: User, target: User, action: AdminAction, newRole?: Role): Decision {
  if (actor.status !== 'active') return deny('Your account is not active');
  if (!isAdmin(actor)) return deny('Admin access required');
  if (actor.id === target.id) return deny('You cannot modify your own account');
  if (target.role === 'superadmin') return deny('The superadmin account cannot be modified');
  if (actor.role === 'admin' && target.role === 'admin') return deny('Admins cannot modify other admins');

  if (action === 'set_role') {
    if (actor.role !== 'superadmin') return deny('Only the superadmin can change roles');
    if (newRole !== 'admin' && newRole !== 'member') return deny('Role must be admin or member');
    if (newRole === target.role) return deny(`User is already ${newRole}`);
    if (target.status !== 'active') return deny('Only active users can have their role changed');
    return allow;
  }

  const { from } = TRANSITIONS[action];
  if (!from.includes(target.status)) {
    return deny(`Cannot ${action} a user whose status is ${target.status}`);
  }
  return allow;
}
