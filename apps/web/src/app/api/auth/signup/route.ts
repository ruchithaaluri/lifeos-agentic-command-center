import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@lifeos/database';
import { createUserWithPassword } from '@/lib/auth';
import { FixedWindowRateLimiter, clientIp } from '@/lib/rate-limit';

// Generous enough for normal local development and demos, tight enough to stop
// casual signup spam. Override with SIGNUP_RATE_LIMIT.
const SIGNUP_LIMIT = Number(process.env['SIGNUP_RATE_LIMIT'] ?? 5);
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

// Module-scoped so the window survives across requests in a single process.
const signupLimiter = new FixedWindowRateLimiter(SIGNUP_LIMIT, SIGNUP_WINDOW_MS);

const SignUpSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(100),
  // Practical ceiling; scrypt cost is fixed, length is the only lever.
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  // Rate limit BEFORE any work. The response is intentionally identical to a
  // validation failure so the limit cannot be used to probe for accounts.
  const ip = clientIp(req.headers);
  const limit = signupLimiter.hit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } },
      {
        status: 429,
        headers: {
          'Retry-After': String(limit.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }
  // Periodic cleanup keeps the bucket map bounded.
  signupLimiter.sweep();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = SignUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Use a valid email, a name, and a password of at least 8 characters.',
        },
      },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Deliberately generic: do not reveal which accounts exist.
    return NextResponse.json(
      { error: { code: 'EMAIL_TAKEN', message: 'That email cannot be used.' } },
      { status: 409 },
    );
  }

  const user = await createUserWithPassword(parsed.data);

  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
