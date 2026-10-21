import { prisma } from '@lifeos/database';
import { CreateTaskInputSchema } from '@lifeos/shared';
import type { Task } from '@lifeos/database';

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

export const createTaskTool = {
  name: 'create_task',
  description:
    'Use this tool to create a new task for the user. Call this when the agent\'s plan requires a new action item to be tracked — for example, creating a "Prepare talking points" task as part of a demo preparation plan. Always set a meaningful title, appropriate priority, and due date when known.',
  inputSchema: {
    type: 'object' as const,
    required: ['title'],
    properties: {
      title: { type: 'string', description: 'Task title (required, max 255 chars)' },
      description: { type: 'string', description: 'Optional detailed description' },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Task priority (default: medium)',
      },
      projectId: { type: 'string', description: 'Optional project UUID to associate with' },
      dueDate: { type: 'string', description: 'Optional ISO 8601 due date' },
      estimatedMinutes: { type: 'number', description: 'Optional time estimate in minutes' },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: CreateTaskInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = CreateTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const data = parsed.data;

    const task = await prisma.task.create({
      data: {
        userId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority ?? 'medium',
        projectId: data.projectId ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        estimatedMinutes: data.estimatedMinutes ?? null,
        status: 'todo',
      },
    });

    return JSON.stringify({
      task: serializeTask(task),
      message: `Task "${task.title}" created successfully.`,
    });
  },
};
