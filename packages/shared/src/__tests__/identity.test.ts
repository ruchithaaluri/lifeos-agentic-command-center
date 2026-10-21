// ============================================================
// Identity token — sign / verify
// ============================================================
// Covers the server-to-server credential that carries the authenticated
// web user's identity to the MCP server.

import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  signIdentityToken,
  verifyIdentityToken,
  isValidUserId,
  IDENTITY_TTL_SECONDS,
} from '../identity.js';

const SECRET = 'a-shared-server-secret-32-chars-minimum';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const T0 = 1_700_000_000;

describe('isValidUserId', () => {
  it('accepts a uuid', () => {
    expect(isValidUserId(USER_A)).toBe(true);
  });

  it('rejects non-uuids and non-strings', () => {
    expect(isValidUserId('demo-user')).toBe(false);
    expect(isValidUserId('')).toBe(false);
    expect(isValidUserId(42)).toBe(false);
    expect(isValidUserId(null)).toBe(false);
    expect(isValidUserId(undefined)).toBe(false);
  });
});

describe('signIdentityToken / verifyIdentityToken', () => {
  it('round-trips the subject', () => {
    const token = signIdentityToken(USER_A, SECRET, 300, T0);
    const result = verifyIdentityToken(token, SECRET, T0 + 1);
    expect(result).toEqual({ ok: true, userId: USER_A });
  });

  it('carries the requested user, not a default', () => {
    const token = signIdentityToken(USER_B, SECRET, 300, T0);
    const result = verifyIdentityToken(token, SECRET, T0);
    expect(result.ok && result.userId).toBe(USER_B);
  });

  it('refuses to sign an invalid user id', () => {
    expect(() => signIdentityToken('not-a-uuid', SECRET)).toThrow();
    expect(() => signIdentityToken('', SECRET)).toThrow();
  });

  it('refuses to sign without a secret', () => {
    expect(() => signIdentityToken(USER_A, '')).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signIdentityToken(USER_A, SECRET, 300, T0);
    const result = verifyIdentityToken(token, 'another-secret-entirely-32chars!!', T0);
    expect(result).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a tampered payload (user swapped to B)', () => {
    const token = signIdentityToken(USER_A, SECRET, 300, T0);
    const [payload, signature] = token.split('.') as [string, string];
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string;
      exp: number;
    };
    claims.sub = USER_B;
    const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');

    const result = verifyIdentityToken(`${forged}.${signature}`, SECRET, T0);
    expect(result).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects an expired token', () => {
    const token = signIdentityToken(USER_A, SECRET, 10, T0);
    expect(verifyIdentityToken(token, SECRET, T0 + 11)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('accepts a token just before expiry', () => {
    const token = signIdentityToken(USER_A, SECRET, 10, T0);
    expect(verifyIdentityToken(token, SECRET, T0 + 9).ok).toBe(true);
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of [undefined, null, '', 'nodot', 'a.b.c', '...']) {
      const result = verifyIdentityToken(bad, SECRET, T0);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a well-signed token whose subject is not a uuid', () => {
    // Simulates a payload signed with the right key but an invalid subject.
    const payload = Buffer.from(
      JSON.stringify({ sub: 'demo-user', exp: T0 + 100 }),
    ).toString('base64url');
    // Signature computed over the same domain separator the codec uses.
    const signature = createHmac('sha256', SECRET)
      .update(`lifeos:mcp-identity:v1.${payload}`)
      .digest('base64url');

    expect(verifyIdentityToken(`${payload}.${signature}`, SECRET, T0)).toEqual({
      ok: false,
      reason: 'invalid-subject',
    });
  });

  it('cannot be confused with an MCP bearer token', () => {
    // Domain separation: the raw secret must not verify as an identity token.
    expect(verifyIdentityToken(SECRET, SECRET, T0).ok).toBe(false);
  });

  it('uses a short default lifetime', () => {
    const token = signIdentityToken(USER_A, SECRET, IDENTITY_TTL_SECONDS, T0);
    const claims = JSON.parse(
      Buffer.from(token.split('.')[0] as string, 'base64url').toString('utf8'),
    ) as { exp: number };
    expect(claims.exp - T0).toBe(IDENTITY_TTL_SECONDS);
  });
});