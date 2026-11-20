import { Router } from 'express';
import type { AppConfig } from '../../config/index.js';
import { hashPassword, verifyPassword } from '../../crypto/password.js';
import type { ScryptParams } from '../../crypto/password.js';
import { DuplicateEmailError } from '../../db/repositories/users.js';
import type { UserRepository } from '../../db/repositories/users.js';
import { requireAuth } from '../middleware/requireAuth.js';
import type { AuthedRequest } from '../middleware/requireAuth.js';
import { clearSessionCookie, createSessionToken, sessionCookie } from '../session.js';

export interface AuthDeps {
  config: AppConfig;
  users: UserRepository;
  /** Override only in tests, to keep hashing fast. */
  scryptParams?: ScryptParams;
}

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Credentials {
  email: string;
  password: string;
}

function readCredentials(body: unknown): { ok: true; value: Credentials } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Expected a JSON body' };
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return { ok: false, error: 'A valid email is required' };
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` };
  }
  return { ok: true, value: { email: email.trim().toLowerCase(), password } };
}

export function authRouter({ config, users, scryptParams }: AuthDeps): Router {
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
    try {
      const user = await users.create(email, passwordHash);
      res.setHeader('Set-Cookie', issueSession(user.id));
      res.status(201).json({ id: user.id, email: user.email });
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
    res.setHeader('Set-Cookie', issueSession(user.id));
    res.json({ id: user.id, email: user.email });
  });

  router.post('/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie(secure));
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth(config, users), async (req, res) => {
    const user = await users.findById((req as AuthedRequest).userId);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ id: user.id, email: user.email, createdAt: user.createdAt.toISOString() });
  });

  return router;
}
