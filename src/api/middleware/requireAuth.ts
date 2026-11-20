import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../../config/index.js';
import type { Role, User, UserRepository } from '../../db/repositories/users.js';
import { isAdmin } from '../authz.js';
import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../session.js';

export interface AuthedRequest extends Request {
  user: User;
}

export function currentUser(req: Request): User {
  const user = (req as AuthedRequest).user;
  if (!user) throw new Error('requireAuth must run before this handler');
  return user;
}

/** Any logged-in user, including pending ones. Blocks suspended and rejected. */
export function requireAuth(config: AppConfig, users: UserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const userId = token ? verifySessionToken(token, config.sessionSecret) : null;
    const user = userId ? await users.findById(userId) : null;
    if (!user || user.status === 'suspended' || user.status === 'rejected') {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    (req as AuthedRequest).user = user;
    next();
  };
}

/** Only approved accounts. Pending users get a 403 that says why. */
export function requireActive() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(req);
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account pending approval', status: user.status });
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(req);
    const ok = roles.includes(user.role) || (roles.includes('admin') && isAdmin(user));
    if (!ok) {
      res.status(403).json({ error: 'Insufficient role' });
      return;
    }
    next();
  };
}
