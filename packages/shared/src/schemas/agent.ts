import { z } from 'zod';
import { AGENT_ACTION_STATUSES, AGENT_SESSION_STATUSES, PLAN_ITEM_TYPES } from '../constants.js';

// ── Agent Session ───────────────────────────────────────────────────────────

export const AgentActionStatusSchema = z.enum(AGENT_ACTION_STATUSES);
export const AgentSessionStatusSchema = z.enum(AGENT_SESSION_STATUSES);

export const AgentActionSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  tool: z.string(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  status: AgentActionStatusSchema,
  message: z.string(),
  latencyMs: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});

export const AgentSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  goal: z.string(),
  status: AgentSessionStatusSchema,
  plan: z.unknown().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AgentAction = z.infer<typeof AgentActionSchema>;
export type AgentSession = z.infer<typeof AgentSessionSchema>;
export type AgentActionStatus = z.infer<typeof AgentActionStatusSchema>;

// ── Plan Types ──────────────────────────────────────────────────────────────

export const PlanItemTypeSchema = z.enum(PLAN_ITEM_TYPES);

export const PlanItemSchema = z.object({
  id: z.string(),
  type: PlanItemTypeSchema,
  title: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  reason: z.string().optional(),
  taskId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  status: z.enum(['planned', 'in_progress', 'completed', 'skipped']).default('planned'),
});

export const PlanSchema = z.object({
  id: z.string().uuid(),
  goal: z.string(),
  items: z.array(PlanItemSchema),
  summary: z.string(),
  generatedAt: z.string().datetime(),
  validForDate: z.string().date(),
});

export type PlanItem = z.infer<typeof PlanItemSchema>;
export type Plan = z.infer<typeof PlanSchema>;

// ── MCP Tool Schemas ────────────────────────────────────────────────────────

export const SearchContextInputSchema = z.object({
  query: z.string().min(1).max(500),
  types: z
    .array(z.enum(['task', 'event', 'project']))
    .default(['task', 'event', 'project'])
    .optional(),
  limit: z.number().int().min(1).max(20).default(10).optional(),
});
export type SearchContextInput = z.infer<typeof SearchContextInputSchema>;

export const SearchContextOutputSchema = z.object({
  results: z.array(
    z.object({
      type: z.enum(['task', 'event', 'project']),
      id: z.string().uuid(),
      title: z.string(),
      relevance: z.number().min(0).max(1),
      snippet: z.string(),
    }),
  ),
  query: z.string(),
  total: z.number().int(),
});
export type SearchContextOutput = z.infer<typeof SearchContextOutputSchema>;

export const AnalyzeDayInputSchema = z.object({
  date: z
    .string()
    .date()
    .optional()
    .describe('YYYY-MM-DD — defaults to today. Analyzes tasks, events, and deadlines.'),
});
export type AnalyzeDayInput = z.infer<typeof AnalyzeDayInputSchema>;

export const AnalyzeDayOutputSchema = z.object({
  date: z.string(),
  summary: z.string(),
  totalTasks: z.number().int(),
  completedTasks: z.number().int(),
  urgentTasks: z.number().int(),
  overdueCount: z.number().int(),
  conflicts: z.array(
    z.object({
      type: z.enum(['time_conflict', 'deadline_risk', 'overload']),
      description: z.string(),
      affectedIds: z.array(z.string()),
    }),
  ),
  recommendations: z.array(z.string()),
  focusScore: z
    .number()
    .min(0)
    .max(100)
    .describe('0-100 score indicating how achievable the day looks'),
});
export type AnalyzeDayOutput = z.infer<typeof AnalyzeDayOutputSchema>;

export const GeneratePlanInputSchema = z.object({
  goal: z.string().min(1).max(1000).describe('The user goal to plan for'),
  date: z
    .string()
    .date()
    .optional()
    .describe('YYYY-MM-DD target date for the plan — defaults to today'),
  constraints: z
    .array(z.string())
    .optional()
    .describe('Optional constraints e.g. "only 90 minutes available tonight"'),
  contextIds: z
    .array(z.string().uuid())
    .optional()
    .describe('Task or event IDs already identified as relevant'),
});
export type GeneratePlanInput = z.infer<typeof GeneratePlanInputSchema>;

export const GeneratePlanOutputSchema = z.object({
  plan: PlanSchema,
  reasoning: z.string().describe('Brief explanation of planning decisions (non-internal)'),
  changesRequired: z.array(
    z.object({
      type: z.enum(['create_task', 'create_event', 'move_event', 'update_task']),
      description: z.string(),
      payload: z.record(z.unknown()),
    }),
  ),
});
export type GeneratePlanOutput = z.infer<typeof GeneratePlanOutputSchema>;

export const ExecutePlanInputSchema = z.object({
  planId: z.string().uuid(),
  actions: z.array(
    z.object({
      type: z.enum(['create_task', 'create_event', 'move_event', 'update_task']),
      payload: z.record(z.unknown()),
    }),
  ),
  dryRun: z
    .boolean()
    .default(false)
    .optional()
    .describe('If true, validates actions without committing them'),
});
export type ExecutePlanInput = z.infer<typeof ExecutePlanInputSchema>;

export const ExecutePlanOutputSchema = z.object({
  sessionId: z.string().uuid(),
  actionsExecuted: z.number().int(),
  actionsSkipped: z.number().int(),
  actionsFailed: z.number().int(),
  results: z.array(
    z.object({
      type: z.string(),
      status: z.enum(['success', 'failed', 'skipped']),
      id: z.string().optional(),
      message: z.string(),
    }),
  ),
  summary: z.string(),
});
export type ExecutePlanOutput = z.infer<typeof ExecutePlanOutputSchema>;

// ── Real-time SSE Event Types ───────────────────────────────────────────────

export const AgentStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action_start'),
    sessionId: z.string(),
    actionId: z.string(),
    tool: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('action_complete'),
    sessionId: z.string(),
    actionId: z.string(),
    tool: z.string(),
    message: z.string(),
    latencyMs: z.number(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('action_failed'),
    sessionId: z.string(),
    actionId: z.string(),
    tool: z.string(),
    message: z.string(),
    error: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('plan_ready'),
    sessionId: z.string(),
    plan: PlanSchema,
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('session_complete'),
    sessionId: z.string(),
    summary: z.string(),
    actionsCount: z.number(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('session_error'),
    sessionId: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
  }),
]);

export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;
