import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '@lifeos/database';
import { AgentOrchestrator, createMCPClient } from '@lifeos/ai';
import { resolveUserId } from '@/lib/server-auth';
import { ensureWorkspaceInitialized } from '@/lib/onboarding';
import { readJson, serverError } from '@/lib/api-guard';
import { sseEmitter } from '@/lib/sse-emitter';

const ChatRequestSchema = z.object({
  goal: z.string().min(1).max(1000),
  sessionId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } },
      { status: 401 },
    );
  }

  const parsed = await readJson(req, ChatRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { goal, sessionId: providedSessionId } = parsed.data;
  const sessionId = providedSessionId ?? randomUUID();

  // New accounts get a starter workspace before the agent gathers context.
  await ensureWorkspaceInitialized(userId).catch(() => 'skipped' as const);

  try {
    // userId comes from the server-side session, never from the request body.
    // The MCP client signs a short-lived identity token per tool call so the
    // MCP server scopes every query to this user.
    const mcpClient = createMCPClient({ userId });
    const orchestrator = new AgentOrchestrator({
      callTool: (call) => mcpClient.callTool(call),
      onStream: async (event) => {
        // Emit to SSE channel so the browser updates in real-time
        sseEmitter.emit(sessionId, event);

        // Best-effort action persistence: streaming must not fail if DB write errors
        try {
          if (event.type === 'action_start') {
            await prisma.agentAction.create({
              data: {
                id: event.actionId,
                sessionId,
                tool: event.tool,
                input: {},
                status: 'running',
                message: event.message,
                createdAt: new Date(event.timestamp),
              },
            });
          } else if (event.type === 'action_complete') {
            await prisma.agentAction.upsert({
              where: { id: event.actionId },
              update: {
                status: 'success',
                message: event.message,
                latencyMs: event.latencyMs,
              },
              create: {
                id: event.actionId,
                sessionId,
                tool: event.tool,
                input: {},
                status: 'success',
                message: event.message,
                latencyMs: event.latencyMs,
                createdAt: new Date(event.timestamp),
              },
            });
          } else if (event.type === 'action_failed') {
            await prisma.agentAction.upsert({
              where: { id: event.actionId },
              update: {
                status: 'failed',
                message: event.message,
              },
              create: {
                id: event.actionId,
                sessionId,
                tool: event.tool,
                input: {},
                status: 'failed',
                message: event.message,
                createdAt: new Date(event.timestamp),
              },
            });
          } else if (event.type === 'session_complete') {
            await prisma.agentSession
              .update({
                where: { id: sessionId },
                data: { status: 'completed' },
              })
              .catch(() => {});
          } else if (event.type === 'session_error') {
            await prisma.agentSession
              .update({
                where: { id: sessionId },
                data: { status: 'failed' },
              })
              .catch(() => {});
          }
        } catch {
          /* non-fatal */
        }
      },
    });

    // Persist the session so it can be authorized on the SSE stream and shown
    // in activity history. Best-effort: onboarding/history must never break the
    // agent run itself.
    try {
      await prisma.agentSession.create({ data: { id: sessionId, userId, goal } });
    } catch {
      /* non-fatal */
    }

    // Run agent in background — return sessionId immediately
    void orchestrator
      .run(goal, sessionId, userId)
      .then(async ({ plan, execution }) => {
        try {
          if (execution?.results && Array.isArray(execution.results)) {
            for (const r of execution.results) {
              await prisma.agentAction
                .create({
                  data: {
                    sessionId,
                    tool: r.type,
                    input: {},
                    output: { id: r.id, status: r.status },
                    status:
                      r.status === 'success'
                        ? 'success'
                        : r.status === 'failed'
                          ? 'failed'
                          : 'pending',
                    message: r.message,
                  },
                })
                .catch(() => {});
            }
          }

          await prisma.agentSession.update({
            where: { id: sessionId },
            data: {
              status: 'completed',
              plan: {
                ...((plan as unknown as object) || {}),
                execution: execution as unknown as object,
              },
            },
          });
        } catch {
          /* non-fatal */
        }
      })
      .catch(async (err) => {
        const message = err instanceof Error ? err.message : 'Agent execution failed';
        console.error('agent:run-failed', { sessionId, message });
        try {
          await prisma.agentSession.update({
            where: { id: sessionId },
            data: { status: 'failed' },
          });
        } catch {
          /* non-fatal */
        }
        sseEmitter.emit(sessionId, {
          type: 'session_error',
          sessionId,
          message,
          timestamp: new Date().toISOString(),
        });
      });

    console.info('agent:request-started', { sessionId, userId });

    return NextResponse.json({ sessionId, goal });
  } catch (err) {
    console.error('agent:request-failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Starting the agent');
  }
}
