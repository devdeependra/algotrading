import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../config/index.js';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    databaseUrl: 'postgresql://unused',
    masterKey: randomBytes(32),
    sessionSecret: randomBytes(32),
    sessionTtlSeconds: 3600,
    ...overrides,
  };
}
