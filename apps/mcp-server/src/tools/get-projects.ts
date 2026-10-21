import { prisma } from '@lifeos/database';
import { GetProjectsInputSchema } from '@lifeos/shared';
import type { Prisma } from '@lifeos/database';

export const getProjectsTool = {
  name: 'get_projects',
  description:
    "Use this tool to retrieve the user's projects with task statistics. Call this when you need to understand what the user is working on, or to associate new tasks/events with a project. Returns each project with task counts, completion percentage, and next due date.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'on_hold', 'completed', 'archived'],
        description: 'Filter by project status (default: all)',
      },
      includeStats: {
        type: 'boolean',
        description: 'Include task count stats per project (default: true)',
      },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: GetProjectsInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = GetProjectsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const opts = parsed.data;
    const withStats = opts.includeStats !== false;

    const where: Prisma.ProjectWhereInput = { userId };
    if (opts.status) where.status = opts.status;

    if (withStats) {
      // Fetch projects with task stats included
      const projects = await prisma.project.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          tasks: {
            where: { deletedAt: null },
            select: { status: true, priority: true, dueDate: true },
          },
        },
      });

      const result = projects.map((p) => {
        const tasks = p.tasks;
        const completedTaskCount = tasks.filter((t) => t.status === 'completed').length;
        const urgentTaskCount = tasks.filter(
          (t) => t.priority === 'urgent' && t.status !== 'completed',
        ).length;
        const progressPercent =
          tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0;
        const nextDue = tasks
          .filter(
            (t): t is typeof t & { dueDate: Date } =>
              t.dueDate !== null && t.status !== 'completed',
          )
          .map((t) => t.dueDate)
          .sort((a, b) => a.getTime() - b.getTime())[0];

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          color: p.color,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          taskCount: tasks.length,
          completedTaskCount,
          urgentTaskCount,
          progressPercent,
          nextDueDate: nextDue?.toISOString() ?? null,
        };
      });

      return JSON.stringify({ projects: result, total: result.length });
    }

    // Stats not requested — lean query
    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const result = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      color: p.color,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      taskCount: 0,
      completedTaskCount: 0,
      urgentTaskCount: 0,
      progressPercent: 0,
      nextDueDate: null,
    }));

    return JSON.stringify({ projects: result, total: result.length });
  },
};
