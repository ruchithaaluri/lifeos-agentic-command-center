import { z } from 'zod';
import { EVENT_TYPES } from '../constants.js';

// ── Base Event Schema ───────────────────────────────────────────────────────

export const EventTypeSchema = z.enum(EVENT_TYPES);

export const CalendarEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  type: EventTypeSchema,
  location: z.string().max(255).nullable(),
  projectId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  isAllDay: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;

// ── MCP Tool Input Schemas ──────────────────────────────────────────────────

export const GetScheduleInputSchema = z.object({
  date: z.string().date().optional().describe('YYYY-MM-DD — defaults to today'),
  startDate: z
    .string()
    .date()
    .optional()
    .describe('YYYY-MM-DD — start of range (use with endDate)'),
  endDate: z.string().date().optional().describe('YYYY-MM-DD — end of range (use with startDate)'),
  type: EventTypeSchema.optional(),
  includeCompleted: z.boolean().default(false).optional(),
});
export type GetScheduleInput = z.infer<typeof GetScheduleInputSchema>;

export const CreateEventInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  start: z.string().datetime().describe('ISO 8601 datetime'),
  end: z.string().datetime().describe('ISO 8601 datetime'),
  type: EventTypeSchema.default('meeting'),
  location: z.string().max(255).optional(),
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
});
export type CreateEventInput = z.infer<typeof CreateEventInputSchema>;

export const MoveEventInputSchema = z.object({
  id: z.string().uuid(),
  newStart: z.string().datetime().describe('New ISO 8601 start datetime'),
  newEnd: z
    .string()
    .datetime()
    .optional()
    .describe('New ISO 8601 end datetime — if omitted, duration is preserved from original event'),
  reason: z.string().max(500).optional().describe('Human-readable reason for the move'),
});
export type MoveEventInput = z.infer<typeof MoveEventInputSchema>;

// ── MCP Tool Output Schemas ─────────────────────────────────────────────────

export const GetScheduleOutputSchema = z.object({
  events: z.array(CalendarEventSchema),
  date: z.string(),
  totalEvents: z.number().int(),
  conflicts: z
    .array(
      z.object({
        eventIds: z.array(z.string().uuid()),
        description: z.string(),
      }),
    )
    .optional(),
});
export type GetScheduleOutput = z.infer<typeof GetScheduleOutputSchema>;

export const EventMutationOutputSchema = z.object({
  event: CalendarEventSchema,
  message: z.string(),
});
export type EventMutationOutput = z.infer<typeof EventMutationOutputSchema>;
