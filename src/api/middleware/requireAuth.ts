import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../../config/index.js';
import type { UserRepository } from '../../db/repositories/users.js';
import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../session.js';

export interface AuthedRequest extends Request {
  userId: string;
}

export function requireAuth(config: AppConfig, users: UserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const userId = token ? verifySessionToken(token, config.sessionSecret) : null;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const user = await users.findById(userId);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    (req as AuthedRequest).userId = user.id;
    next();
  };
}
