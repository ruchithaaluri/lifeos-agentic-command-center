import type { NextRequest } from 'next/server';
import { prisma } from '@lifeos/database';
import { sseEmitter } from '@/lib/sse-emitter';
import { resolveUserId, isDemoMode } from '@/lib/server-auth';
import type { AgentStreamEvent } from '@lifeos/shared';

export const dynamic = 'force-dynamic';

// A session id is a bearer-like secret: without this check any caller who
// guessed or observed one could read another user's agent transcript.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { sessionId: string } }) {
  const userId = await resolveUserId();
  if (!userId) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const { sessionId } = params;
  if (!UUID.test(sessionId)) {
    return new Response('Bad Request', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // A session id is not an authorization token: confirm the session actually
  // belongs to the caller so one user cannot read another's agent transcript.
  // Demo mode keeps the previous in-memory behaviour (no session rows).
  if (!isDemoMode()) {
    try {
      const session = await prisma.agentSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true },
      });
      if (!session) {
        return new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch {
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      const handler = (event: AgentStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

          // Close stream when session completes or errors
          if (event.type === 'session_complete' || event.type === 'session_error') {
            sseEmitter.off(sessionId, handler);
            controller.close();
          }
        } catch {
          // Client disconnected
          sseEmitter.off(sessionId, handler);
        }
      };

      sseEmitter.on(sessionId, handler);

      // Auto-close after 5 minutes max
      const timeout = setTimeout(
        () => {
          sseEmitter.off(sessionId, handler);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        5 * 60 * 1000,
      );

      // Clean up timeout if client disconnects
      return () => {
        clearTimeout(timeout);
        sseEmitter.off(sessionId, handler);
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
