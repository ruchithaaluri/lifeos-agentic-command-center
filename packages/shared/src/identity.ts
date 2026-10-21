// ============================================================
// Internal identity token (server-to-server only)
// ============================================================
// LifeOS propagates the authenticated web user's identity to the MCP server
// as a short-lived HMAC-signed token carried in a header.
//
// Design notes:
//  - The signing key is MCP_SECRET with domain separation, so an MCP bearer
//    token can never be replayed as an identity token (and vice versa).
//    Both services already share MCP_SECRET, so this needs no new secret.
//  - The token is only ever produced and consumed on the server. It is never
//    sent to the browser and the browser can never choose its contents.
//  - Demo mode bypasses this entirely (see apps/mcp-server/src/auth.ts).
//
// This module imports node:crypto and is published as the
// `@lifeos/shared/identity` subpath so it is NOT pulled into client bundles.

import { createHmac, timingSafeEqual } from 'crypto';

/** Header carrying the signed identity token to the MCP server. */
export const IDENTITY_HEADER = 'x-lifeos-identity';

/** Domain separator — keeps identity signatures distinct from bearer auth. */
const DOMAIN = 'lifeos:mcp-identity:v1';

/** Default lifetime. Long enough for one agent run, short enough to limit replay. */
export const IDENTITY_TTL_SECONDS = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`${DOMAIN}.${payload}`).digest('base64url');
}

/**
 * Create a signed identity token for `userId`.
 * Throws on an invalid user id so a caller cannot silently mint a bad token.
 */
export function signIdentityToken(
  userId: string,
  secret: string,
  ttlSeconds: number = IDENTITY_TTL_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (!isValidUserId(userId)) throw new Error('signIdentityToken: invalid user id');
  if (!secret) throw new Error('signIdentityToken: missing signing secret');
  const payload = base64UrlEncode(JSON.stringify({ sub: userId, exp: nowSeconds + ttlSeconds }));
  return `${payload}.${sign(payload, secret)}`;
}

export type IdentityVerification =
  | { ok: true; userId: string }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'invalid-subject' };

/**
 * Verify a signed identity token.
 * Never throws — every failure is reported as a discriminated result.
 */
export function verifyIdentityToken(
  token: string | undefined | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): IdentityVerification {
  if (!token || !secret) return { ok: false, reason: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [payload, signature] = parts as [string, string];

  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Different lengths can never match; avoid the throw from timingSafeEqual.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims !== 'object' || claims === null) return { ok: false, reason: 'malformed' };

  const { sub, exp } = claims as { sub?: unknown; exp?: unknown };
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return { ok: false, reason: 'malformed' };
  }
  if (exp <= nowSeconds) return { ok: false, reason: 'expired' };
  if (!isValidUserId(sub)) return { ok: false, reason: 'invalid-subject' };

  return { ok: true, userId: sub };
}