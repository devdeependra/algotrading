import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

const fast = { N: 2 ** 10, r: 8, p: 1 };

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery', fast);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batter', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('stores parameters and a unique salt in the hash', async () => {
    const a = await hashPassword('same', fast);
    const b = await hashPassword('same', fast);
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$1024$8$1$')).toBe(true);
    expect(a).not.toContain('same');
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    for (const bad of ['', 'plain', 'bcrypt$x$y', 'scrypt$0$8$1$AAAA$BBBB', 'scrypt$1024$8$1$$']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });

  it('uses a slow default cost', async () => {
    const hash = await hashPassword('x');
    expect(hash.startsWith('scrypt$65536$8$1$')).toBe(true);
    expect(await verifyPassword('x', hash)).toBe(true);
  });
});
