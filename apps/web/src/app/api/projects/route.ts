import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@lifeos/database';
import { requireUserId, serverError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'] as const;

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color')
    .default('#3B82F6'),
  status: z.enum(PROJECT_STATUSES).default('active'),
});

export async function GET() {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  try {
    const projects = await prisma.project.findMany({
      where: { userId: guard.userId },
      orderBy: { createdAt: 'asc' },
      include: {
        tasks: {
          where: { deletedAt: null },
          select: { status: true, priority: true, dueDate: true },
        },
      },
    });

    return NextResponse.json({
      projects: projects.map((p) => {
        const tasks = p.tasks;
        const completedTaskCount = tasks.filter((t) => t.status === 'completed').length;
        const urgentTaskCount = tasks.filter(
          (t) => t.priority === 'urgent' && t.status !== 'completed',
        ).length;
        const progressPercent =
          tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0;
        const nextDue = tasks
          .filter((t) => t.dueDate && t.status !== 'completed')
          .map((t) => t.dueDate as Date)
          .sort((a, b) => a.getTime() - b.getTime())[0];

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          color: p.color,
          taskCount: tasks.length,
          completedTaskCount,
          urgentTaskCount,
          progressPercent,
          nextDueDate: nextDue?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) {
    console.error('api/projects GET failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Loading projects');
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid project data',
        },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const project = await prisma.project.create({
      data: {
        userId: guard.userId,
        name: data.name,
        description: data.description ?? null,
        color: data.color,
        status: data.status,
      },
    });

    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          color: project.color,
          taskCount: 0,
          completedTaskCount: 0,
          urgentTaskCount: 0,
          progressPercent: 0,
          nextDueDate: null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('api/projects POST failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Creating project');
  }
}
