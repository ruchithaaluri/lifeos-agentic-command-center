// ============================================================
// MCP Server Authentication Middleware
// ============================================================
// Two independent server-to-server checks:
//
//   1. Authorization: Bearer <MCP_SECRET>
//      Proves the caller is the LifeOS web service. Unchanged, so existing
//      clients and tests keep working.
//
//   2. X-LifeOS-Identity: <signed token>
//      Proves WHICH user is acting. Issued by the web service from the
//      authenticated NextAuth session — never from browser input.
//
// Demo mode (DEMO_MODE=true) keeps resolving to the seeded demo user so the
// hackathon demo behaves exactly as before. With DEMO_MODE=false a valid
// signed identity is mandatory; there is no hardcoded fallback.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { verifyIdentityToken, IDENTITY_HEADER } from '@lifeos/shared/identity';

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  if (token !== config.mcpSecret) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid bearer token.',
      },
    });
    return;
  }

  next();
}

/**
 * Resolve the acting userId, or null when there is no trustworthy identity.
 *
 * Returns null (rather than a shared/default id) whenever identity cannot be
 * proven, so a missing or forged credential can never fall through to
 * another user's data.
 */
export function resolveUserId(req: Request): string | null {
  const raw = req.headers[IDENTITY_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;

  if (token) {
    const result = verifyIdentityToken(token, config.mcpSecret);
    if (!result.ok) {
      // Reason is logged server-side by the caller; the client gets a generic 401.
      return null;
    }
    return result.userId;
  }

  if (config.demoMode) {
    return config.demoUserId;
  }

  return null;
}
