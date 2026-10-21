// ============================================================
// Password hashing
// ============================================================
// Covers the real auth primitive: passwords are stored only as salted
// scrypt digests and are verified in constant time.

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

describe('hashPassword', () => {
  it('produces a scrypt-prefixed digest', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash.split('$')).toHaveLength(3);
  });

  it('never contains the plaintext', async () => {
    const pw = 'correct-horse-battery-staple';
    const hash = await hashPassword(pw);
    expect(hash).not.toContain(pw);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects when no hash is stored (demo/OAuth account)', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    await expect(verifyPassword('anything', undefined)).resolves.toBe(false);
  });

  it('rejects a malformed hash instead of throwing', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$aa$bb')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$$')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$zz$zz')).resolves.toBe(false);
  });

  it('does not accept a hash of the wrong length', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    const short = hash.replace(/.$/, '');
    await expect(verifyPassword('correct-horse-battery-staple', short)).resolves.toBe(false);
  });
});
