import { prisma } from '@lifeos/database';
import { CreateEventInputSchema } from '@lifeos/shared';
import type { CalendarEvent } from '@lifeos/database';

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

export const createEventTool = {
  name: 'create_event',
  description:
    'Use this tool to create a new calendar event for the user. Use it when the plan requires blocking time on the calendar — for example, creating a "Demo Practice" focus block. Always validate start < end before calling. Use type "focus" for deep work blocks, "meeting" for collaborative events.',
  inputSchema: {
    type: 'object' as const,
    required: ['title', 'start', 'end'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      start: { type: 'string', description: 'ISO 8601 datetime' },
      end: { type: 'string', description: 'ISO 8601 datetime — must be after start' },
      type: {
        type: 'string',
        enum: ['meeting', 'focus', 'break', 'deadline', 'reminder', 'personal'],
        description: 'Event type (default: meeting)',
      },
      location: { type: 'string' },
      projectId: { type: 'string' },
      taskId: { type: 'string' },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: CreateEventInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = CreateEventInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const data = parsed.data;
    const start = new Date(data.start);
    const end = new Date(data.end);

    if (end <= start) {
      throw new Error('Event end time must be after start time.');
    }

    const event = await prisma.calendarEvent.create({
      data: {
        userId,
        title: data.title,
        description: data.description ?? null,
        start,
        end,
        type: data.type ?? 'meeting',
        location: data.location ?? null,
        projectId: data.projectId ?? null,
        taskId: data.taskId ?? null,
      },
    });

    return JSON.stringify({
      event: serializeEvent(event),
      message: `Event "${event.title}" created on ${start.toLocaleDateString()}.`,
    });
  },
};
