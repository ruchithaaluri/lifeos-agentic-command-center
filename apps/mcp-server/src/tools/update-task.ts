import { prisma } from '@lifeos/database';
import { UpdateTaskInputSchema } from '@lifeos/shared';
import { NotFoundError } from '@lifeos/shared';
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

export const updateTaskTool = {
  name: 'update_task',
  description:
    "Use this tool to update an existing task's fields. Use it when rescheduling due dates, changing priority, marking a task in_progress, or updating status. Requires the task id. Only provide the fields that should change.",
  inputSchema: {
    type: 'object' as const,
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'Task UUID (required)' },
      title: { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'cancelled'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      dueDate: { type: 'string', description: 'ISO 8601 datetime or null to clear' },
      estimatedMinutes: { type: 'number' },
      projectId: { type: 'string', description: 'Project UUID or null to unassign' },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: UpdateTaskInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = UpdateTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const { id, dueDate, ...rest } = parsed.data;

    // Ensure task belongs to this user
    const existing = await prisma.task.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Task', id);

    // Build update payload
    const updateData: Record<string, unknown> = { ...rest };
    if (dueDate !== undefined) {
      updateData['dueDate'] = dueDate ? new Date(dueDate) : null;
    }
    if (rest.status === 'completed' && !existing.completedAt) {
      updateData['completedAt'] = new Date();
    }
    if (rest.status && rest.status !== 'completed') {
      updateData['completedAt'] = null;
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return JSON.stringify({
      task: serializeTask(task),
      message: `Task "${task.title}" updated successfully.`,
    });
  },
};
