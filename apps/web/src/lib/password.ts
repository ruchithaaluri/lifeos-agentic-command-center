// ============================================================
// Password hashing
// ============================================================
// Uses Node's built-in scrypt — no third-party crypto dependency.
// Format: scrypt$<saltHex>$<hashHex>. Plaintext passwords are never
// stored, logged, or returned.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;

/** Hash a password with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verify a password against a stored hash.
 * Returns false for malformed/empty hashes rather than throwing, and
 * compares in constant time.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length !== KEYLEN) return false;

  const derived = await scrypt(password, salt, KEYLEN);
  return timingSafeEqual(derived, expected);
}