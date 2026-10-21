// ============================================================
// Server-side user resolution
// ============================================================
// Resolves the acting user for API routes.
//
// Priority:
//   1. An authenticated NextAuth session  -> that user
//   2. Demo mode (DEMO_MODE=true)          -> the seeded demo user
//
// When neither applies the caller is unauthenticated and must be
// rejected. API routes use `requireUserId` so this stays explicit
// rather than silently returning the demo account.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export function isDemoMode(): boolean {
  return process.env['DEMO_MODE'] === 'true';
}

export function getDemoUserId(): string {
  return process.env['DEMO_USER_ID'] ?? '00000000-0000-0000-0000-000000000001';
}

/** Resolve the acting user id, or null when unauthenticated. */
export async function resolveUserId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    const id = session?.user?.id;
    if (typeof id === 'string' && id.length > 0) return id;
  } catch {
    // No secret configured / session unreadable — fall through.
  }
  if (isDemoMode()) return getDemoUserId();
  return null;
}
