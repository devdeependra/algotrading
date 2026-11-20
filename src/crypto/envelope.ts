import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for stored credentials (spec §8.1).
 *
 * Each secret gets its own random 256-bit data key. The secret is encrypted
 * with that data key under AES-256-GCM, and the data key is itself encrypted
 * ("wrapped") with the master key, also under AES-256-GCM. Only the wrapped
 * key is stored, so compromise of a single row never exposes the master key,
 * and the master key can be rotated by re-wrapping data keys without touching
 * the secrets themselves.
 *
 * Serialised form (all parts base64url, joined with "."):
 *
 *   v1.<wrapIv>.<wrappedKey>.<wrapTag>.<iv>.<ciphertext>.<tag>
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

interface GcmResult {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

function gcmEncrypt(key: Buffer, plaintext: Buffer, aad?: Buffer): GcmResult {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, tag: cipher.getAuthTag() };
}

function gcmDecrypt(key: Buffer, { iv, ciphertext, tag }: GcmResult, aad?: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Deliberately generic: never echo key material or ciphertext.
    throw new EnvelopeError('Decryption failed: wrong key, wrong context, or tampered data');
  }
}

function assertMasterKey(masterKey: Buffer): void {
  if (masterKey.length !== KEY_BYTES) {
    throw new EnvelopeError(`Master key must be ${KEY_BYTES} bytes`);
  }
}

/**
 * Encrypts `plaintext` and returns the serialised envelope.
 *
 * `context` is optional additional authenticated data. Pass a stable string
 * naming where the secret lives (for example `broker_accounts.credentials`)
 * so an envelope copied from one column to another fails to decrypt.
 */
export function encryptSecret(plaintext: string, masterKey: Buffer, context?: string): string {
  assertMasterKey(masterKey);
  const aad = context === undefined ? undefined : Buffer.from(context, 'utf8');
  const dataKey = randomBytes(KEY_BYTES);
  try {
    const data = gcmEncrypt(dataKey, Buffer.from(plaintext, 'utf8'), aad);
    const wrap = gcmEncrypt(masterKey, dataKey, aad);
    return [
      VERSION,
      wrap.iv,
      wrap.ciphertext,
      wrap.tag,
      data.iv,
      data.ciphertext,
      data.tag,
    ]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  } finally {
    dataKey.fill(0);
  }
}

/** Reverses {@link encryptSecret}. Throws {@link EnvelopeError} on any failure. */
export function decryptSecret(envelope: string, masterKey: Buffer, context?: string): string {
  assertMasterKey(masterKey);
  const parts = envelope.split('.');
  if (parts.length !== 7 || parts[0] !== VERSION) {
    throw new EnvelopeError('Malformed envelope');
  }
  const [, wrapIv, wrappedKey, wrapTag, iv, ciphertext, tag] = parts.map((p) =>
    Buffer.from(p, 'base64url'),
  ) as [Buffer, Buffer, Buffer, Buffer, Buffer, Buffer, Buffer];
  if (
    wrapIv.length !== IV_BYTES ||
    wrappedKey.length !== KEY_BYTES ||
    wrapTag.length !== TAG_BYTES ||
    iv.length !== IV_BYTES ||
    tag.length !== TAG_BYTES
  ) {
    throw new EnvelopeError('Malformed envelope');
  }
  const aad = context === undefined ? undefined : Buffer.from(context, 'utf8');
  const dataKey = gcmDecrypt(masterKey, { iv: wrapIv, ciphertext: wrappedKey, tag: wrapTag }, aad);
  try {
    return gcmDecrypt(dataKey, { iv, ciphertext, tag }, aad).toString('utf8');
  } finally {
    dataKey.fill(0);
  }
}

/** Returns a fresh 32-byte key as base64, suitable for MASTER_KEY or SESSION_SECRET. */
export function generateKeyBase64(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
