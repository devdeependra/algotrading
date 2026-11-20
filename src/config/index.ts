export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  /** 32-byte key that wraps per-secret data keys. */
  masterKey: Buffer;
  /** Key for signing session cookies. */
  sessionSecret: Buffer;
  sessionTtlSeconds: number;
  /**
   * The one account that is created as superadmin + active on registration
   * and can never be demoted or suspended. Lower-cased.
   */
  superadminEmail: string;
}

/**
 * Thrown when the environment is incomplete or malformed. The message names
 * the offending variables but never includes their values.
 */
export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

function decodeBase64Key(name: string, raw: string | undefined, minBytes: number, exactBytes: boolean, problems: string[]): Buffer {
  if (raw === undefined || raw.trim() === '') {
    problems.push(`${name} is required (base64, generate with: npm run keygen)`);
    return Buffer.alloc(0);
  }
  const buf = Buffer.from(raw.trim(), 'base64');
  const ok = exactBytes ? buf.length === minBytes : buf.length >= minBytes;
  if (!ok) {
    problems.push(
      exactBytes
        ? `${name} must decode to exactly ${minBytes} bytes`
        : `${name} must decode to at least ${minBytes} bytes`,
    );
  }
  return buf;
}

function parseIntegerInRange(name: string, raw: string | undefined, fallback: number, min: number, max: number, problems: string[]): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    problems.push(`${name} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const nodeEnvRaw = env['NODE_ENV'] ?? 'development';
  const nodeEnv = (NODE_ENVS as readonly string[]).includes(nodeEnvRaw)
    ? (nodeEnvRaw as NodeEnv)
    : 'development';
  if (nodeEnv !== nodeEnvRaw) {
    problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const port = parseIntegerInRange('PORT', env['PORT'], 3000, 1, 65535, problems);

  const databaseUrl = env['DATABASE_URL'] ?? '';
  if (databaseUrl.trim() === '') {
    problems.push('DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must start with postgresql://');
  }

  const masterKey = decodeBase64Key('MASTER_KEY', env['MASTER_KEY'], 32, true, problems);
  const sessionSecret = decodeBase64Key('SESSION_SECRET', env['SESSION_SECRET'], 32, false, problems);

  const sessionTtlSeconds = parseIntegerInRange(
    'SESSION_TTL_SECONDS',
    env['SESSION_TTL_SECONDS'],
    12 * 60 * 60,
    60,
    30 * 24 * 60 * 60,
    problems,
  );

  const superadminEmail = (env['SUPERADMIN_EMAIL'] ?? '').trim().toLowerCase();
  if (superadminEmail === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(superadminEmail)) {
    problems.push('SUPERADMIN_EMAIL is required and must be an email address');
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return { nodeEnv, port, databaseUrl, masterKey, sessionSecret, sessionTtlSeconds, superadminEmail };
}
