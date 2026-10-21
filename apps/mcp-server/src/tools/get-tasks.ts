import { prisma } from '@lifeos/database';
import { GetTasksInputSchema } from '@lifeos/shared';
import type { Task, Prisma } from '@lifeos/database';

function serializeTask(t: Task) {
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString() ?? null,
    estimatedMinutes: t.estimatedMinutes,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export const getTasksTool = {
  name: 'get_tasks',
  description:
    "Use this tool to retrieve the user's tasks. Filter by status (todo, in_progress, completed), priority (low, medium, high, urgent), project, or due date. Call this first when the user asks about what they need to do, what is pending, or what is due soon. Returns at most 100 tasks sorted by priority then due date.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'completed', 'cancelled'],
        description: 'Filter by task status',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Filter by priority level',
      },
      projectId: {
        type: 'string',
        description: 'Filter by project UUID',
      },
      dueBefore: {
        type: 'string',
        description: 'ISO 8601 datetime — return tasks due before this',
      },
      dueAfter: {
        type: 'string',
        description: 'ISO 8601 datetime — return tasks due after this',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        description: 'Max number of tasks to return (default 50)',
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed tasks (default false)',
      },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: GetTasksInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = GetTasksInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const opts = parsed.data;

    const where: Prisma.TaskWhereInput = {
      userId,
      deletedAt: null,
    };

    if (opts.status) {
      where.status = opts.status;
    } else if (!opts.includeCompleted) {
      where.status = { not: 'completed' };
    }

    if (opts.priority) where.priority = opts.priority;
    if (opts.projectId) where.projectId = opts.projectId;
    if (opts.dueBefore ?? opts.dueAfter) {
      const dueDateFilter: Prisma.DateTimeNullableFilter = {};
      if (opts.dueBefore) dueDateFilter.lt = new Date(opts.dueBefore);
      if (opts.dueAfter) dueDateFilter.gt = new Date(opts.dueAfter);
      where.dueDate = dueDateFilter;
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        take: opts.limit ?? 50,
      }),
      prisma.task.count({ where }),
    ]);

    return JSON.stringify({
      tasks: tasks.map(serializeTask),
      total,
      hasMore: total > (opts.limit ?? 50),
    });
  },
};
