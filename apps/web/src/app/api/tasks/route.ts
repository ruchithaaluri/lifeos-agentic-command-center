import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@lifeos/database';
import { requireUserId, serverError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

const STATUSES = ['todo', 'in_progress', 'completed', 'cancelled'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(PRIORITIES).default('medium'),
  status: z.enum(STATUSES).default('todo'),
  dueDate: z.string().trim().optional().nullable(),
  estimatedMinutes: z.number().int().positive().max(1440).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
});

const UpdateTaskSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  dueDate: z.string().trim().optional().nullable(),
  estimatedMinutes: z.number().int().positive().max(1440).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
});

function serializeTask(t: {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  dueDate: Date | null;
  estimatedMinutes: number | null;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    projectId: t.projectId,
    dueDate: t.dueDate?.toISOString() ?? null,
    estimatedMinutes: t.estimatedMinutes,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const includeCompletedParam = searchParams.get('includeCompleted');

  const where: Record<string, unknown> = {
    userId: guard.userId,
    deletedAt: null,
  };

  if (statusParam !== null) {
    if (!(STATUSES as readonly string[]).includes(statusParam)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Unknown status filter.' } },
        { status: 400 },
      );
    }
    where['status'] = statusParam;
  } else if (includeCompletedParam === 'false') {
    where['status'] = { not: 'completed' };
  }

  try {
    const rawTasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    // Sort by priority rank (urgent first), then due date
    const tasks = rawTasks.sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
      if (pDiff !== 0) return pDiff;
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    return NextResponse.json({
      tasks: tasks.map(serializeTask),
    });
  } catch (err) {
    console.error('api/tasks GET failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Loading tasks');
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

  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid task input',
        },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  let parsedDueDate: Date | null = null;
  if (data.dueDate) {
    const d = new Date(data.dueDate);
    if (!isNaN(d.getTime())) {
      parsedDueDate = d;
    }
  }

  try {
    const task = await prisma.task.create({
      data: {
        userId: guard.userId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        status: data.status,
        dueDate: parsedDueDate,
        estimatedMinutes: data.estimatedMinutes ?? null,
        projectId: data.projectId ?? null,
        completedAt: data.status === 'completed' ? new Date() : null,
      },
    });

    return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
  } catch (err) {
    console.error('api/tasks POST failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Creating task');
  }
}

export async function PATCH(req: NextRequest) {
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

  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid update data',
        },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const existing = await prisma.task.findFirst({
      where: { id: data.id, userId: guard.userId, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Task not found.' } },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData['title'] = data.title;
    if (data.description !== undefined) updateData['description'] = data.description;
    if (data.priority !== undefined) updateData['priority'] = data.priority;
    if (data.estimatedMinutes !== undefined) updateData['estimatedMinutes'] = data.estimatedMinutes;
    if (data.projectId !== undefined) updateData['projectId'] = data.projectId;

    if (data.dueDate !== undefined) {
      if (data.dueDate === null || data.dueDate === '') {
        updateData['dueDate'] = null;
      } else {
        const d = new Date(data.dueDate);
        if (!isNaN(d.getTime())) updateData['dueDate'] = d;
      }
    }

    if (data.status !== undefined) {
      updateData['status'] = data.status;
      if (data.status === 'completed' && existing.status !== 'completed') {
        updateData['completedAt'] = new Date();
      } else if (data.status !== 'completed' && existing.status === 'completed') {
        updateData['completedAt'] = null;
      }
    }

    const updated = await prisma.task.update({
      where: { id: data.id },
      data: updateData,
    });

    return NextResponse.json({ task: serializeTask(updated) });
  } catch (err) {
    console.error('api/tasks PATCH failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Updating task');
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  let id = searchParams.get('id');

  if (!id) {
    try {
      const body = (await req.json()) as { id?: string };
      id = body?.id ?? null;
    } catch {
      // ignore
    }
  }

  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Task ID is required for deletion.' } },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.task.findFirst({
      where: { id, userId: guard.userId, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Task not found.' } },
        { status: 404 },
      );
    }

    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true, message: 'Task deleted successfully.' });
  } catch (err) {
    console.error('api/tasks DELETE failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Deleting task');
  }
}
