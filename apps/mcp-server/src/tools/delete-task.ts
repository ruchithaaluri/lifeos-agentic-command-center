import { prisma } from '@lifeos/database';
import { DeleteTaskInputSchema, NotFoundError } from '@lifeos/shared';

export const deleteTaskTool = {
  name: 'delete_task',
  description:
    'Use this tool to soft-delete a task. IMPORTANT: Only call this when the user has explicitly confirmed they want to delete the task. The "confirm" field must be set to true — never set it automatically. Uses soft deletion so the record can be recovered.',
  inputSchema: {
    type: 'object' as const,
    required: ['id', 'confirm'],
    properties: {
      id: { type: 'string', description: 'Task UUID to delete' },
      confirm: {
        type: 'boolean',
        enum: [true],
        description: 'Must be explicitly true — guards against accidental deletion',
      },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: DeleteTaskInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = DeleteTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const { id } = parsed.data;

    const existing = await prisma.task.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Task', id);

    // Soft delete
    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'cancelled' },
    });

    return JSON.stringify({
      id,
      message: `Task "${existing.title}" deleted successfully.`,
    });
  },
};
