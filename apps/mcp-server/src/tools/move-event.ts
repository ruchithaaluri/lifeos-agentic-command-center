import { prisma } from '@lifeos/database';
import { MoveEventInputSchema, NotFoundError } from '@lifeos/shared';
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
  };
}

export const moveEventTool = {
  name: 'move_event',
  description:
    'Use this tool to reschedule (move) an existing calendar event to a new time. If only newStart is provided, the original duration is preserved. Use this when the user says "move my X to Y time" or when the plan detects a conflict that requires rescheduling.',
  inputSchema: {
    type: 'object' as const,
    required: ['id', 'newStart'],
    properties: {
      id: { type: 'string', description: 'Calendar event UUID' },
      newStart: { type: 'string', description: 'New ISO 8601 start datetime' },
      newEnd: {
        type: 'string',
        description: 'New ISO 8601 end datetime — if omitted, original duration is preserved',
      },
      reason: { type: 'string', description: 'Human-readable reason for the move' },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: MoveEventInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = MoveEventInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const { id, newStart, newEnd, reason } = parsed.data;

    const existing = await prisma.calendarEvent.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundError('CalendarEvent', id);

    const newStartDate = new Date(newStart);
    let newEndDate: Date;

    if (newEnd) {
      newEndDate = new Date(newEnd);
    } else {
      // Preserve original duration
      const durationMs = existing.end.getTime() - existing.start.getTime();
      newEndDate = new Date(newStartDate.getTime() + durationMs);
    }

    if (newEndDate <= newStartDate) {
      throw new Error('New end time must be after new start time.');
    }

    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        start: newStartDate,
        end: newEndDate,
        ...(reason ? { description: reason } : {}),
      },
    });

    return JSON.stringify({
      event: serializeEvent(event),
      message: `"${event.title}" moved to ${newStartDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.${reason ? ` Reason: ${reason}` : ''}`,
    });
  },
};
