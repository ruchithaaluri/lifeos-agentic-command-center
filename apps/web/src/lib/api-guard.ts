// ============================================================
// API route guard
// ============================================================
// Single choke point for "who is calling this endpoint", so every
// route answers unauthenticated requests identically and no route
// can accidentally fall back to the demo user.

import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { resolveUserId } from '@/lib/server-auth';
import { ensureWorkspaceInitialized } from '@/lib/onboarding';

const UNAUTHORIZED = NextResponse.json(
  {
    error: {
      code: 'UNAUTHORIZED',
      message: 'Sign in to continue.',
    },
  },
  { status: 401 },
);

export type Guarded<T> = { userId: string; data: T } | { response: NextResponse };

/**
 * Require an authenticated caller.
 * Returns either the user id, or a ready-to-return 401 response.
 *
 * Also performs lazy first-login onboarding, so a brand-new account sees a
 * useful workspace on its very first data request. Failures are non-fatal.
 */
export async function requireUserId(): Promise<Guarded<never>> {
  const userId = await resolveUserId();
  if (!userId) return { response: UNAUTHORIZED };
  await ensureWorkspaceInitialized(userId).catch(() => 'skipped' as const);
  return { userId } as Guarded<never>;
}

/** Parse and validate a JSON body with a Zod schema. */
export async function readJson<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      ),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message ?? 'Invalid request',
          },
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Standard 500 that never leaks internals to the client. */
export function serverError(what: string): NextResponse {
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: `${what} failed. Please try again.` } },
    { status: 500 },
  );
}