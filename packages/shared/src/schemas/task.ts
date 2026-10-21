import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '../constants.js';

// ── Base Task Schema ────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  dueDate: z.string().datetime().nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// ── MCP Tool Input Schemas ──────────────────────────────────────────────────

export const GetTasksInputSchema = z.object({
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  projectId: z.string().uuid().optional(),
  dueBefore: z
    .string()
    .datetime()
    .optional()
    .describe('ISO 8601 datetime — return tasks due before this time'),
  dueAfter: z
    .string()
    .datetime()
    .optional()
    .describe('ISO 8601 datetime — return tasks due after this time'),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  includeCompleted: z.boolean().default(false).optional(),
});
export type GetTasksInput = z.infer<typeof GetTasksInputSchema>;

export const CreateTaskInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  priority: TaskPrioritySchema.default('medium'),
  projectId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const DeleteTaskInputSchema = z.object({
  id: z.string().uuid(),
  confirm: z.literal(true).describe('Must be explicitly set to true to confirm deletion'),
});
export type DeleteTaskInput = z.infer<typeof DeleteTaskInputSchema>;

// ── MCP Tool Output Schemas ─────────────────────────────────────────────────

export const GetTasksOutputSchema = z.object({
  tasks: z.array(TaskSchema),
  total: z.number().int(),
  hasMore: z.boolean(),
});
export type GetTasksOutput = z.infer<typeof GetTasksOutputSchema>;

export const TaskMutationOutputSchema = z.object({
  task: TaskSchema,
  message: z.string(),
});
export type TaskMutationOutput = z.infer<typeof TaskMutationOutputSchema>;

export const DeleteTaskOutputSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
});
export type DeleteTaskOutput = z.infer<typeof DeleteTaskOutputSchema>;
