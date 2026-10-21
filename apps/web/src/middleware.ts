// ============================================================
// Route protection
// ============================================================
// Unauthenticated visitors are redirected to /signin for product routes.
// Demo mode keeps the whole app reachable so the hackathon demo still works
// with no account setup.
//
// Each request only reads the JWT cookie to decide a redirect; the real
// authorization check happens in the API routes (see lib/api-guard.ts).

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PROTECTED = [
  '/dashboard',
  '/today',
  '/tasks',
  '/projects',
  '/activity',
  '/settings',
  '/alexa',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (process.env['DEMO_MODE'] === 'true') return NextResponse.next();

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  let token: { userId?: string } | null = null;
  try {
    token = await getToken({ req, secret: process.env['NEXTAUTH_SECRET'] });
  } catch {
    token = null;
  }
  if (token?.userId) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/signin';
  url.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*', '/today/:path*', '/tasks/:path*', '/projects/:path*', '/activity/:path*', '/settings/:path*', '/alexa/:path*'],
};