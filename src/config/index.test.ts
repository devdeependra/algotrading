import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './index.js';

const valid = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  MASTER_KEY: randomBytes(32).toString('base64'),
  SESSION_SECRET: randomBytes(48).toString('base64'),
  SESSION_TTL_SECONDS: '600',
  SUPERADMIN_EMAIL: 'Root@Example.com',
});

describe('loadConfig', () => {
  it('loads a valid environment', () => {
    const cfg = loadConfig(valid());
    expect(cfg.nodeEnv).toBe('test');
    expect(cfg.port).toBe(4000);
    expect(cfg.masterKey.length).toBe(32);
    expect(cfg.sessionSecret.length).toBe(48);
    expect(cfg.sessionTtlSeconds).toBe(600);
    expect(cfg.superadminEmail).toBe('root@example.com');
  });

  it('applies defaults', () => {
    const env = valid();
    delete env['PORT'];
    delete env['SESSION_TTL_SECONDS'];
    delete env['NODE_ENV'];
    const cfg = loadConfig(env);
    expect(cfg.port).toBe(3000);
    expect(cfg.sessionTtlSeconds).toBe(43200);
    expect(cfg.nodeEnv).toBe('development');
  });

  it('reports every problem at once, naming variables but not values', () => {
    const env = valid();
    env['MASTER_KEY'] = 'c2hvcnQ='; // "short"
    env['DATABASE_URL'] = 'mysql://nope';
    delete env['SESSION_SECRET'];
    env['PORT'] = '99999';
    let caught: unknown;
    try {
      loadConfig(env);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const { problems, message } = caught as ConfigError;
    expect(problems).toHaveLength(4);
    expect(message).toContain('MASTER_KEY');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('SESSION_SECRET');
    expect(message).toContain('PORT');
    expect(message).not.toContain('c2hvcnQ=');
    expect(message).not.toContain('mysql://nope');
  });

  it('requires a superadmin email', () => {
    const env = valid();
    env['SUPERADMIN_EMAIL'] = 'not-an-email';
    expect(() => loadConfig(env)).toThrow(/SUPERADMIN_EMAIL/);
    delete env['SUPERADMIN_EMAIL'];
    expect(() => loadConfig(env)).toThrow(/SUPERADMIN_EMAIL/);
  });

  it('rejects a master key that is not exactly 32 bytes', () => {
    const env = valid();
    env['MASTER_KEY'] = randomBytes(31).toString('base64');
    expect(() => loadConfig(env)).toThrow(ConfigError);
    env['MASTER_KEY'] = randomBytes(33).toString('base64');
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });
});
