import { NextResponse } from 'next/server';

// Report live health at request time rather than a build-time snapshot.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'lifeos-web',
    timestamp: new Date().toISOString(),
  });
}
