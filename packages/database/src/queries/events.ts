// ============================================================
// Calendar Event Query Helpers
// ============================================================

import { prisma } from '../client.js';
import type { Prisma, CalendarEvent, EventType } from '@prisma/client';

export interface GetEventsOptions {
  userId: string;
  startDate: Date;
  endDate: Date;
  type?: EventType;
}

export async function getEventsForUser(opts: GetEventsOptions): Promise<CalendarEvent[]> {
  const where: Prisma.CalendarEventWhereInput = {
    userId: opts.userId,
    start: { gte: opts.startDate },
    end: { lte: opts.endDate },
  };
  if (opts.type) where.type = opts.type;

  return prisma.calendarEvent.findMany({
    where,
    orderBy: { start: 'asc' },
  });
}

export async function getEventById(id: string, userId: string): Promise<CalendarEvent | null> {
  return prisma.calendarEvent.findFirst({ where: { id, userId } });
}
