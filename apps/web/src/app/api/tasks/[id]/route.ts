import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@lifeos/database';
import { requireUserId, serverError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  const id = params.id;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
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

    const updateData: Record<string, unknown> = {};
    if (typeof body['title'] === 'string') updateData['title'] = body['title'].trim();
    if (typeof body['description'] === 'string')
      updateData['description'] = body['description'].trim();
    if (typeof body['priority'] === 'string') updateData['priority'] = body['priority'];
    if (typeof body['estimatedMinutes'] === 'number')
      updateData['estimatedMinutes'] = body['estimatedMinutes'];
    if (typeof body['projectId'] === 'string' || body['projectId'] === null)
      updateData['projectId'] = body['projectId'];

    if (body['dueDate'] !== undefined) {
      if (body['dueDate'] === null || body['dueDate'] === '') {
        updateData['dueDate'] = null;
      } else {
        const d = new Date(body['dueDate'] as string);
        if (!isNaN(d.getTime())) updateData['dueDate'] = d;
      }
    }

    if (typeof body['status'] === 'string') {
      updateData['status'] = body['status'];
      if (body['status'] === 'completed' && existing.status !== 'completed') {
        updateData['completedAt'] = new Date();
      } else if (body['status'] !== 'completed' && existing.status === 'completed') {
        updateData['completedAt'] = null;
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      task: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        projectId: updated.projectId,
        dueDate: updated.dueDate?.toISOString() ?? null,
        estimatedMinutes: updated.estimatedMinutes,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('api/tasks/[id] PATCH failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Updating task');
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  const id = params.id;
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
    console.error('api/tasks/[id] DELETE failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Deleting task');
  }
}
