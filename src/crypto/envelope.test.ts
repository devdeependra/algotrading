import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, EnvelopeError, generateKeyBase64 } from './envelope.js';

const key = randomBytes(32);

describe('envelope encryption', () => {
  it('round-trips text, including unicode and empty strings', () => {
    for (const plaintext of ['hello', '', 'टोटप-सीक्रेट 🔐', 'x'.repeat(10_000)]) {
      expect(decryptSecret(encryptSecret(plaintext, key), key)).toBe(plaintext);
    }
  });

  it('never embeds the plaintext and differs on every call', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const b = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(a.split('.')).toHaveLength(7);
  });

  it('fails with the wrong master key', () => {
    const envelope = encryptSecret('secret', key);
    expect(() => decryptSecret(envelope, randomBytes(32))).toThrow(EnvelopeError);
  });

  it('binds to the context when one is given', () => {
    const envelope = encryptSecret('secret', key, 'broker_accounts.credentials');
    expect(decryptSecret(envelope, key, 'broker_accounts.credentials')).toBe('secret');
    expect(() => decryptSecret(envelope, key, 'broker_sessions.token')).toThrow(EnvelopeError);
    expect(() => decryptSecret(envelope, key)).toThrow(EnvelopeError);
  });

  it('detects tampering in any part', () => {
    const envelope = encryptSecret('secret', key);
    const parts = envelope.split('.');
    for (let i = 1; i < parts.length; i++) {
      const tampered = [...parts];
      const buf = Buffer.from(tampered[i] as string, 'base64url');
      buf[0] = (buf[0] as number) ^ 0xff;
      tampered[i] = buf.toString('base64url');
      expect(() => decryptSecret(tampered.join('.'), key)).toThrow(EnvelopeError);
    }
  });

  it('rejects malformed input and bad key sizes', () => {
    expect(() => decryptSecret('garbage', key)).toThrow(EnvelopeError);
    expect(() => decryptSecret('v2.a.b.c.d.e.f', key)).toThrow(EnvelopeError);
    expect(() => encryptSecret('x', randomBytes(16))).toThrow(EnvelopeError);
    expect(() => decryptSecret(encryptSecret('x', key), randomBytes(16))).toThrow(EnvelopeError);
  });

  it('error messages never contain plaintext or key material', () => {
    const envelope = encryptSecret('hunter2-secret', key);
    try {
      decryptSecret(envelope, randomBytes(32));
      expect.fail('should throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain('hunter2');
      expect(msg).not.toContain(key.toString('base64'));
      expect(msg).not.toContain(envelope.slice(3, 20));
    }
  });

  it('generates 32-byte keys', () => {
    expect(Buffer.from(generateKeyBase64(), 'base64').length).toBe(32);
    expect(generateKeyBase64()).not.toBe(generateKeyBase64());
  });
});
