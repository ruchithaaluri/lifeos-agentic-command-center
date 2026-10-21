import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@lifeos/database';
import { getLocalDate, today } from '@lifeos/shared';
import { requireUserId, serverError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TYPES = ['meeting', 'focus', 'break', 'deadline', 'reminder', 'personal'] as const;

const CreateEventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  start: z.string().trim().min(1, 'Start time is required'),
  end: z.string().trim().min(1, 'End time is required'),
  type: z.enum(EVENT_TYPES).default('meeting'),
  location: z.string().trim().max(255).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  isAllDay: z.boolean().default(false),
});

const UpdateEventSchema = z.object({
  id: z.string().min(1, 'Event ID is required'),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  start: z.string().trim().optional(),
  end: z.string().trim().optional(),
  type: z.enum(EVENT_TYPES).optional(),
  location: z.string().trim().max(255).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  isAllDay: z.boolean().optional(),
});

function serializeEvent(e: {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: string;
  location: string | null;
  projectId: string | null;
}) {
  return {
    id: e.id,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    type: e.type,
    location: e.location,
    projectId: e.projectId,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  if (dateParam !== null && !ISO_DATE.test(dateParam)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'date must be YYYY-MM-DD.' } },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: guard.userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone ?? 'America/Los_Angeles';
    const date = dateParam ?? today(timezone);
    const dayStart = getLocalDate(date, '00:00:00', timezone);
    const dayEnd = getLocalDate(date, '23:59:59', timezone);

    const events = await prisma.calendarEvent.findMany({
      where: { userId: guard.userId, start: { gte: dayStart }, end: { lte: dayEnd } },
      orderBy: { start: 'asc' },
    });

    return NextResponse.json({
      events: events.map(serializeEvent),
      date,
      timezone,
    });
  } catch (err) {
    console.error('api/events GET failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Loading events');
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

  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid event data',
        },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const startDate = new Date(data.start);
  const endDate = new Date(data.end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid start or end date.' } },
      { status: 400 },
    );
  }

  if (endDate <= startDate) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Event end time must be after start time.' } },
      { status: 400 },
    );
  }

  try {
    const event = await prisma.calendarEvent.create({
      data: {
        userId: guard.userId,
        title: data.title,
        description: data.description ?? null,
        start: startDate,
        end: endDate,
        type: data.type,
        location: data.location ?? null,
        projectId: data.projectId ?? null,
        isAllDay: data.isAllDay,
      },
    });

    return NextResponse.json({ event: serializeEvent(event) }, { status: 201 });
  } catch (err) {
    console.error('api/events POST failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Creating event');
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

  const parsed = UpdateEventSchema.safeParse(body);
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
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: data.id, userId: guard.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData['title'] = data.title;
    if (data.description !== undefined) updateData['description'] = data.description;
    if (data.type !== undefined) updateData['type'] = data.type;
    if (data.location !== undefined) updateData['location'] = data.location;
    if (data.projectId !== undefined) updateData['projectId'] = data.projectId;
    if (data.isAllDay !== undefined) updateData['isAllDay'] = data.isAllDay;

    let newStart = existing.start;
    let newEnd = existing.end;

    if (data.start !== undefined) {
      const d = new Date(data.start);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Invalid start time.' } },
          { status: 400 },
        );
      }
      newStart = d;
      updateData['start'] = d;
    }

    if (data.end !== undefined) {
      const d = new Date(data.end);
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
        {
          error: { code: 'VALIDATION_ERROR', message: 'Event end time must be after start time.' },
        },
        { status: 400 },
      );
    }

    const updated = await prisma.calendarEvent.update({
      where: { id: data.id },
      data: updateData,
    });

    return NextResponse.json({ event: serializeEvent(updated) });
  } catch (err) {
    console.error('api/events PATCH failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Updating event');
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
      { error: { code: 'VALIDATION_ERROR', message: 'Event ID is required.' } },
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

    await prisma.calendarEvent.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Event deleted successfully.' });
  } catch (err) {
    console.error('api/events DELETE failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Deleting event');
  }
}
