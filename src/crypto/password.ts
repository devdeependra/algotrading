import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** 64 MiB of memory per hash. Lower only in tests. */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 16, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 32;

function maxmemFor({ N, r }: ScryptParams): number {
  return 128 * N * r * 2;
}

/** Produces `scrypt$N$r$p$<salt b64>$<hash b64>`. */
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, { ...params, maxmem: maxmemFor(params) });
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time check of `password` against a hash from {@link hashPassword}. Malformed hashes return false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;
  const params = { N, r, p };
  const actual = await scrypt(password, salt, KEY_BYTES, { ...params, maxmem: maxmemFor(params) });
  return timingSafeEqual(actual, expected);
}
