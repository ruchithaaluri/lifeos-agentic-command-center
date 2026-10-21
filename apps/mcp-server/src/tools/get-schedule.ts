import { prisma } from '@lifeos/database';
import { GetScheduleInputSchema, doIntervalsOverlap, getLocalDate, today } from '@lifeos/shared';
import type { CalendarEvent, Prisma } from '@lifeos/database';

function serializeEvent(e: CalendarEvent) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    type: e.type,
    location: e.location,
    projectId: e.projectId,
    taskId: e.taskId,
    isAllDay: e.isAllDay,
  };
}

export const getScheduleTool = {
  name: 'get_schedule',
  description:
    'Use this tool to retrieve the user\'s calendar events. Provide either a single "date" (YYYY-MM-DD) to get that day\'s events, or "startDate"/"endDate" for a range. Use this before scheduling new tasks to detect conflicts. Returns events sorted by start time, with detected overlaps.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'YYYY-MM-DD — get all events for this single day (default: today)',
      },
      startDate: { type: 'string', description: 'YYYY-MM-DD range start' },
      endDate: { type: 'string', description: 'YYYY-MM-DD range end' },
      type: {
        type: 'string',
        enum: ['meeting', 'focus', 'break', 'deadline', 'reminder', 'personal'],
      },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: GetScheduleInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = GetScheduleInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const opts = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone ?? 'America/Los_Angeles';

    let startDate: Date;
    let endDate: Date;
    let displayDate: string;

    if (opts.startDate && opts.endDate) {
      startDate = getLocalDate(opts.startDate, '00:00:00', timezone);
      endDate = getLocalDate(opts.endDate, '23:59:59', timezone);
      displayDate = `${opts.startDate} to ${opts.endDate}`;
    } else {
      const dateStr = opts.date ?? today(timezone);
      startDate = getLocalDate(dateStr, '00:00:00', timezone);
      endDate = getLocalDate(dateStr, '23:59:59', timezone);
      displayDate = dateStr;
    }

    const where: Prisma.CalendarEventWhereInput = {
      userId,
      start: { gte: startDate },
      end: { lte: endDate },
    };
    if (opts.type) where.type = opts.type;

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { start: 'asc' },
    });

    // Detect time conflicts
    const conflicts: Array<{ eventIds: string[]; description: string }> = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];
        if (!a || !b) continue;
        if (
          doIntervalsOverlap(
            { start: a.start.toISOString(), end: a.end.toISOString() },
            { start: b.start.toISOString(), end: b.end.toISOString() },
          )
        ) {
          conflicts.push({
            eventIds: [a.id, b.id],
            description: `"${a.title}" and "${b.title}" overlap`,
          });
        }
      }
    }

    return JSON.stringify({
      events: events.map(serializeEvent),
      date: displayDate,
      totalEvents: events.length,
      conflicts,
    });
  },
};
