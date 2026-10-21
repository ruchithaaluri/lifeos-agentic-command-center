import { z } from 'zod';
import { PROJECT_COLORS, PROJECT_STATUSES } from '../constants.js';

// ── Base Project Schema ─────────────────────────────────────────────────────

export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).nullable(),
  status: ProjectStatusSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProjectWithStatsSchema = ProjectSchema.extend({
  taskCount: z.number().int(),
  completedTaskCount: z.number().int(),
  urgentTaskCount: z.number().int(),
  progressPercent: z.number().min(0).max(100),
  nextDueDate: z.string().datetime().nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProjectWithStats = z.infer<typeof ProjectWithStatsSchema>;

// ── MCP Tool Input Schemas ──────────────────────────────────────────────────

export const GetProjectsInputSchema = z.object({
  status: ProjectStatusSchema.optional(),
  includeStats: z.boolean().default(true).optional(),
});
export type GetProjectsInput = z.infer<typeof GetProjectsInputSchema>;

// ── MCP Tool Output Schemas ─────────────────────────────────────────────────

export const GetProjectsOutputSchema = z.object({
  projects: z.array(ProjectWithStatsSchema),
  total: z.number().int(),
});
export type GetProjectsOutput = z.infer<typeof GetProjectsOutputSchema>;

export { PROJECT_COLORS };
