import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@lifeos/database';
import { requireUserId, serverError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, userId: guard.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (typeof body['title'] === 'string') updateData['title'] = body['title'].trim();
    if (typeof body['description'] === 'string') updateData['description'] = body['description'].trim();
    if (typeof body['type'] === 'string') updateData['type'] = body['type'];
    if (typeof body['location'] === 'string' || body['location'] === null) updateData['location'] = body['location'];

    let newStart = existing.start;
    let newEnd = existing.end;

    if (typeof body['start'] === 'string') {
      const d = new Date(body['start']);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Invalid start time.' } },
          { status: 400 },
        );
      }
      newStart = d;
      updateData['start'] = d;
    }

    if (typeof body['end'] === 'string') {
      const d = new Date(body['end']);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Invalid end time.' } },
          { status: 400 },
        );
      }
      newEnd = d;
      updateData['end'] = d;
    }

    if (newEnd <= newStart) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Event end time must be after start time.' } },
        { status: 400 },
      );
    }

    const updated = await prisma.calendarEvent.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      event: {
        id: updated.id,
        title: updated.title,
        start: updated.start.toISOString(),
        end: updated.end.toISOString(),
        type: updated.type,
        location: updated.location,
        projectId: updated.projectId,
      },
    });
  } catch (err) {
    console.error('api/events/[id] PATCH failed', { message: err instanceof Error ? err.message : 'unknown' });
    return serverError('Updating event');
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  const id = params.id;
  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, userId: guard.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 },
      );
    }

    await prisma.calendarEvent.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Event deleted successfully.' });
  } catch (err) {
    console.error('api/events/[id] DELETE failed', { message: err instanceof Error ? err.message : 'unknown' });
    return serverError('Deleting event');
  }
}
