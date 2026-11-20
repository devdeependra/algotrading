import { Router } from 'express';
import type { AppConfig } from '../../config/index.js';
import { hashPassword, verifyPassword } from '../../crypto/password.js';
import type { ScryptParams } from '../../crypto/password.js';
import type { AuditLogRepository } from '../../db/repositories/auditLog.js';
import { DuplicateEmailError, toPublicUser } from '../../db/repositories/users.js';
import type { NewUser, UserRepository } from '../../db/repositories/users.js';
import { canLogIn } from '../authz.js';
import { currentUser, requireAuth } from '../middleware/requireAuth.js';
import { clearSessionCookie, createSessionToken, sessionCookie } from '../session.js';

export interface AuthDeps {
  config: AppConfig;
  users: UserRepository;
  audit: AuditLogRepository;
  /** Override only in tests, to keep hashing fast. */
  scryptParams?: ScryptParams;
}

export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function readPassword(value: unknown, label = 'Password'): Parsed<string> {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `${label} must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `${label} must be at most ${MAX_PASSWORD_LENGTH} characters` };
  }
  return { ok: true, value };
}

function readCredentials(body: unknown): Parsed<{ email: string; password: string }> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Expected a JSON body' };
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return { ok: false, error: 'A valid email is required' };
  }
  const pw = readPassword(password);
  if (!pw.ok) return pw;
  return { ok: true, value: { email: email.trim().toLowerCase(), password: pw.value } };
}

export function authRouter({ config, users, audit, scryptParams }: AuthDeps): Router {
  const router = Router();
  const secure = config.nodeEnv === 'production';

  const issueSession = (userId: string): string =>
    sessionCookie(createSessionToken(userId, config.sessionSecret, config.sessionTtlSeconds), {
      secure,
      maxAgeSeconds: config.sessionTtlSeconds,
    });

  router.post('/auth/register', async (req, res) => {
    const parsed = readCredentials(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { email, password } = parsed.value;
    const passwordHash = await hashPassword(password, scryptParams);
    const isSuperadmin = email === config.superadminEmail;
    const newUser: NewUser = isSuperadmin
      ? { email, passwordHash, role: 'superadmin', status: 'active' }
      : { email, passwordHash, role: 'member', status: 'pending' };
    try {
      const user = await users.create(newUser);
      await audit.append({ actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id, after: toPublicUser(user) });
      res.setHeader('Set-Cookie', issueSession(user.id));
      res.status(201).json(toPublicUser(user));
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/auth/login', async (req, res) => {
    const parsed = readCredentials(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { email, password } = parsed.value;
    const user = await users.findByEmail(email);
    // Same response and similar timing whether or not the email exists.
    const ok = user !== null && (await verifyPassword(password, user.passwordHash));
    if (!ok || user === null) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const access = canLogIn(user.status);
    if (!access.ok) {
      res.status(403).json({ error: access.reason });
      return;
    }
    res.setHeader('Set-Cookie', issueSession(user.id));
    res.json(toPublicUser(user));
  });

  router.post('/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie(secure));
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth(config, users), (req, res) => {
    res.json(toPublicUser(currentUser(req)));
  });

  router.post('/auth/password', requireAuth(config, users), async (req, res) => {
    const user = currentUser(req);
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const next = readPassword(body['newPassword'], 'New password');
    if (!next.ok) {
      res.status(400).json({ error: next.error });
      return;
    }
    const current = body['currentPassword'];
    if (typeof current !== 'string' || !(await verifyPassword(current, user.passwordHash))) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
    await users.update(user.id, { passwordHash: await hashPassword(next.value, scryptParams) });
    await audit.append({ actorId: user.id, action: 'user.password_changed', entityType: 'user', entityId: user.id });
    res.status(204).end();
  });

  return router;
}
