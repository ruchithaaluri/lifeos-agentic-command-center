import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { FixedWindowRateLimiter, clientIp } from '@/lib/rate-limit';

// NextAuth's exported handler is loosely typed internally; the cast keeps the
// rest of the codebase fully typed at this boundary.
const handler = NextAuth(authOptions) as unknown as (
  req: Request,
  ctx: { params: Record<string, string[]> },
) => Promise<Response>;

// ── Credential-stuffing protection ─────────────────────────────────────────
// Same abuse class as signup spam, on the sign-in path. Two independent
// buckets, both of which must be under their limit:
//
//   per-IP     — stops one host spraying many accounts
//   per-email  — stops a distributed attack hammering a single victim account
//
// Keying on email as well as IP is what prevents an attacker from locking a
// legitimate user out of their own account by flooding their address from one
// IP. Both limits are deliberately generous so shared/NAT addresses and typos
// do not lock real people out.
//
// LIMITATION: in-memory, so per-instance and reset on restart. Behind a
// multi-instance deployment put a shared limiter in front of this route.

const LOGIN_LIMIT_IP = Number(process.env['LOGIN_RATE_LIMIT_IP'] ?? 10);
const LOGIN_LIMIT_EMAIL = Number(process.env['LOGIN_RATE_LIMIT_EMAIL'] ?? 5);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const loginIpLimiter = new FixedWindowRateLimiter(LOGIN_LIMIT_IP, LOGIN_WINDOW_MS);
const loginEmailLimiter = new FixedWindowRateLimiter(LOGIN_LIMIT_EMAIL, LOGIN_WINDOW_MS);

const tooMany = (retryAfter: number) =>
  NextResponse.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many sign-in attempts. Please try again later.',
      },
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter), 'X-RateLimit-Remaining': '0' },
    },
  );

export async function GET(req: Request, ctx: { params: Record<string, string[]> }) {
  return handler(req, ctx);
}

export async function POST(req: Request, ctx: { params: Record<string, string[]> }) {
  // Only the credentials callback is a guessable-secret attempt. CSRF token
  // fetches and sign-out must never be throttled.
  //
  // For /api/auth/callback/credentials the catch-all segment is
  // ['callback', 'credentials'], so match on membership, not the first element.
  const segments = ctx.params['nextauth'] ?? [];
  if (segments.includes('credentials')) {
    let email = '';
    try {
      // Read from a CLONE: consuming the body here would leave NextAuth's
      // handler with an already-read stream and it would fail with a 500.
      const form = await req.clone().formData();
      const raw = form.get('email');
      if (typeof raw === 'string') email = raw.trim().toLowerCase();
    } catch {
      // Unparseable body: fall through to NextAuth, which will reject it.
    }

    const ip = clientIp(req.headers);
    const byIp = loginIpLimiter.hit(`ip:${ip}`);
    // Only consume an email bucket when an email was actually supplied, so
    // junk requests cannot pollute real accounts' buckets.
    const byEmail = email ? loginEmailLimiter.hit(`email:${email}`) : null;

    if (!byIp.allowed) return tooMany(byIp.retryAfterSeconds);
    if (byEmail && !byEmail.allowed) return tooMany(byEmail.retryAfterSeconds);

    loginIpLimiter.sweep();
    loginEmailLimiter.sweep();
  }

  return handler(req, ctx);
}
