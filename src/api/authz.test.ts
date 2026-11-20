import { describe, expect, it } from 'vitest';
import type { Role, User, UserStatus } from '../db/repositories/users.js';
import { canLogIn, canManage } from './authz.js';
import type { Decision } from './authz.js';

const reason = (d: Decision): string => (d.ok ? '' : d.reason);

let n = 0;
function user(role: Role, status: UserStatus = 'active'): User {
  n += 1;
  const now = new Date();
  return { id: `u${n}`, email: `${role}${n}@x.io`, passwordHash: 'h', role, status, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now };
}

const superadmin = user('superadmin');
const admin = user('admin');
const admin2 = user('admin');
const member = user('member', 'pending');

describe('canLogIn', () => {
  it('lets pending and active in, keeps suspended and rejected out', () => {
    expect(canLogIn('pending').ok).toBe(true);
    expect(canLogIn('active').ok).toBe(true);
    expect(canLogIn('suspended')).toEqual({ ok: false, reason: 'Account suspended' });
    expect(canLogIn('rejected')).toEqual({ ok: false, reason: 'Account not approved' });
  });
});

describe('canManage', () => {
  it('members and inactive actors cannot manage anyone', () => {
    expect(canManage(user('member'), member, 'approve').ok).toBe(false);
    expect(canManage(user('admin', 'pending'), member, 'approve').ok).toBe(false);
    expect(canManage(user('admin', 'suspended'), member, 'approve').ok).toBe(false);
  });

  it('nobody touches themselves or the superadmin', () => {
    expect(reason(canManage(admin, admin, 'suspend'))).toMatch(/own account/);
    expect(reason(canManage(superadmin, superadmin, 'suspend'))).toMatch(/own account/);
    expect(reason(canManage(admin, superadmin, 'suspend'))).toMatch(/superadmin/);
  });

  it('admins manage members but not other admins; superadmin manages admins', () => {
    expect(canManage(admin, member, 'approve').ok).toBe(true);
    expect(reason(canManage(admin, admin2, 'suspend'))).toMatch(/other admins/);
    expect(canManage(superadmin, admin2, 'suspend').ok).toBe(true);
  });

  it('enforces the status machine', () => {
    expect(canManage(admin, user('member', 'pending'), 'approve').ok).toBe(true);
    expect(canManage(admin, user('member', 'rejected'), 'approve').ok).toBe(true);
    expect(canManage(admin, user('member', 'active'), 'approve').ok).toBe(false);
    expect(canManage(admin, user('member', 'pending'), 'reject').ok).toBe(true);
    expect(canManage(admin, user('member', 'active'), 'reject').ok).toBe(false);
    expect(canManage(admin, user('member', 'active'), 'suspend').ok).toBe(true);
    expect(canManage(admin, user('member', 'pending'), 'suspend').ok).toBe(false);
    expect(canManage(admin, user('member', 'suspended'), 'reinstate').ok).toBe(true);
    expect(canManage(admin, user('member', 'active'), 'reinstate').ok).toBe(false);
  });

  it('only the superadmin changes roles, never to superadmin, only for active users', () => {
    const active = user('member', 'active');
    expect(reason(canManage(admin, active, 'set_role', 'admin'))).toMatch(/Only the superadmin/);
    expect(canManage(superadmin, active, 'set_role', 'admin').ok).toBe(true);
    expect(canManage(superadmin, active, 'set_role', 'superadmin').ok).toBe(false);
    expect(reason(canManage(superadmin, active, 'set_role', 'member'))).toMatch(/already member/);
    expect(canManage(superadmin, user('member', 'pending'), 'set_role', 'admin').ok).toBe(false);
    expect(canManage(superadmin, admin2, 'set_role', 'member').ok).toBe(true);
  });
});
