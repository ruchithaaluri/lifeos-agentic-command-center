import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@lifeos/database';
import { requireUserId, serverError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const sessionIdParam = searchParams.get('sessionId');

  try {
    // Fetch user sessions, excluding internal "Execute plan ..." sub-sessions from the primary list
    const sessions = await prisma.agentSession.findMany({
      where: {
        userId: guard.userId,
        NOT: {
          goal: { startsWith: 'Execute plan ' },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        actions: {
          orderBy: { createdAt: 'asc' },
        },
      },
      take: 30,
    });

    // If a specific sessionId was requested, select that session; otherwise default to most recent
    let targetSession = sessionIdParam
      ? sessions.find((s) => s.id === sessionIdParam)
      : sessions[0];

    // If requested session wasn't in the filtered list (e.g. was direct ID), try finding it directly
    if (!targetSession && sessionIdParam) {
      targetSession =
        (await prisma.agentSession.findFirst({
          where: { id: sessionIdParam, userId: guard.userId },
          include: {
            actions: {
              orderBy: { createdAt: 'asc' },
            },
          },
        })) ?? undefined;
    }

    const actions = [...(targetSession?.actions ?? [])];

    // If the target session has an associated execute-plan session or execution results,
    // ensure those actions are also included if not already present
    if (targetSession) {
      const planObj =
        targetSession.plan && typeof targetSession.plan === 'object'
          ? (targetSession.plan as Record<string, unknown>)
          : null;
      const innerPlan = planObj?.['plan'] as Record<string, unknown> | undefined;
      const planId =
        (innerPlan?.['id'] as string | undefined) ?? (planObj?.['id'] as string | undefined);

      if (planId) {
        const executeSession = await prisma.agentSession.findFirst({
          where: { id: planId, userId: guard.userId },
          include: {
            actions: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (executeSession?.actions && executeSession.actions.length > 0) {
          const existingActionIds = new Set(actions.map((a) => a.id));
          const existingActionKeys = new Set(actions.map((a) => `${a.tool}:${a.message}`));
          for (const ea of executeSession.actions) {
            if (
              !existingActionIds.has(ea.id) &&
              !existingActionKeys.has(`${ea.tool}:${ea.message}`)
            ) {
              actions.push(ea);
            }
          }
        }
      }
    }

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        goal: s.goal,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        actionsCount: s.actions.length,
      })),
      currentSession: targetSession
        ? {
            id: targetSession.id,
            goal: targetSession.goal,
            status: targetSession.status,
            createdAt: targetSession.createdAt.toISOString(),
          }
        : null,
      actions: actions.map((a) => ({
        id: a.id,
        tool: a.tool,
        message: a.message,
        status: a.status,
        latencyMs: a.latencyMs ?? undefined,
        timestamp: a.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('api/activity failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Loading activity');
  }
}
