import { randomUUID } from 'crypto';
import { prisma } from '@lifeos/database';
import { ExecutePlanInputSchema } from '@lifeos/shared';
import type { ExecutePlanOutput } from '@lifeos/shared';

export const executePlanTool = {
  name: 'execute_plan',
  description:
    'Use this tool to execute a generated plan — it processes the list of required actions (create_task, create_event, move_event, update_task) and commits them to the database. Call this after generate_plan once the user has confirmed the plan. Supports dryRun=true for preview without committing.',
  inputSchema: {
    type: 'object' as const,
    required: ['planId', 'actions'],
    properties: {
      planId: { type: 'string', description: 'Plan UUID from generate_plan output' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'payload'],
          properties: {
            type: {
              type: 'string',
              enum: ['create_task', 'create_event', 'move_event', 'update_task'],
            },
            payload: { type: 'object' },
          },
        },
        description: 'The changesRequired array from generate_plan output',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true, validate without committing (default: false)',
      },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: ExecutePlanInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = ExecutePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const { planId, actions, dryRun = false } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const userTimezone = user?.timezone || 'America/Los_Angeles';

    const results: ExecutePlanOutput['results'] = [];
    let actionsExecuted = 0;
    let actionsFailed = 0;
    let actionsSkipped = 0;

    for (const action of actions) {
      if (dryRun) {
        results.push({
          type: action.type,
          status: 'skipped',
          message: `[dry run] Would execute ${action.type}`,
        });
        actionsSkipped++;
        continue;
      }

      try {
        switch (action.type) {
          case 'create_task': {
            const payload = action.payload as {
              title?: string;
              priority?: string;
              dueDate?: string;
              estimatedMinutes?: number;
              projectId?: string;
              description?: string;
            };
            if (!payload.title) throw new Error('create_task requires title');
            const task = await prisma.task.create({
              data: {
                userId,
                title: payload.title,
                description: payload.description ?? null,
                priority: (payload.priority as 'low' | 'medium' | 'high' | 'urgent') ?? 'medium',
                dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
                estimatedMinutes: payload.estimatedMinutes ?? null,
                projectId: payload.projectId ?? null,
                status: 'todo',
              },
            });
            results.push({
              type: 'create_task',
              status: 'success',
              id: task.id,
              message: `Created task "${task.title}"`,
            });
            actionsExecuted++;
            break;
          }

          case 'create_event': {
            const payload = action.payload as {
              title?: string;
              start?: string;
              end?: string;
              type?: string;
              location?: string;
              projectId?: string;
            };
            if (!payload.title || !payload.start || !payload.end) {
              throw new Error('create_event requires title, start, and end');
            }
            const existing = await prisma.calendarEvent.findFirst({
              where: {
                userId,
                title: payload.title,
                start: new Date(payload.start),
              },
            });
            if (existing) {
              results.push({
                type: 'create_event',
                status: 'skipped',
                id: existing.id,
                message: `Event "${existing.title}" already exists at this time`,
              });
              actionsSkipped++;
              break;
            }
            const event = await prisma.calendarEvent.create({
              data: {
                userId,
                title: payload.title,
                start: new Date(payload.start),
                end: new Date(payload.end),
                type:
                  (payload.type as
                    'meeting' | 'focus' | 'break' | 'deadline' | 'reminder' | 'personal') ??
                  'focus',
                location: payload.location ?? null,
                projectId: payload.projectId ?? null,
              },
            });
            results.push({
              type: 'create_event',
              status: 'success',
              id: event.id,
              message: `Created event "${event.title}"`,
            });
            actionsExecuted++;
            break;
          }

          case 'move_event': {
            const payload = action.payload as { id?: string; newStart?: string; newEnd?: string };
            if (!payload.id || !payload.newStart) {
              throw new Error('move_event requires id and newStart');
            }
            const existing = await prisma.calendarEvent.findFirst({
              where: { id: payload.id, userId },
            });
            if (!existing) throw new Error(`Event ${payload.id} not found`);

            const newStart = new Date(payload.newStart);
            const durationMs = existing.end.getTime() - existing.start.getTime();
            const newEnd = payload.newEnd
              ? new Date(payload.newEnd)
              : new Date(newStart.getTime() + durationMs);

            await prisma.calendarEvent.update({
              where: { id: payload.id },
              data: { start: newStart, end: newEnd },
            });
            results.push({
              type: 'move_event',
              status: 'success',
              id: payload.id,
              message: `Moved "${existing.title}" to ${newStart.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: userTimezone,
              })}`,
            });
            actionsExecuted++;
            break;
          }

          case 'update_task': {
            const payload = action.payload as {
              id?: string;
              status?: string;
              priority?: string;
              dueDate?: string;
            };
            if (!payload.id) throw new Error('update_task requires id');
            const existing = await prisma.task.findFirst({
              where: { id: payload.id, userId, deletedAt: null },
            });
            if (!existing) throw new Error(`Task ${payload.id} not found`);

            const updateData: Record<string, unknown> = {};
            if (payload.status) updateData['status'] = payload.status;
            if (payload.priority) updateData['priority'] = payload.priority;
            if (payload.dueDate !== undefined) {
              updateData['dueDate'] = payload.dueDate ? new Date(payload.dueDate) : null;
            }
            if (payload.status === 'completed') updateData['completedAt'] = new Date();

            await prisma.task.update({ where: { id: payload.id }, data: updateData });
            results.push({
              type: 'update_task',
              status: 'success',
              id: payload.id,
              message: `Updated task "${existing.title}"`,
            });
            actionsExecuted++;
            break;
          }

          default: {
            // Defensive branch: ExecutePlanInputSchema restricts `action.type`
            // to the four kinds handled above, so this is unreachable for
            // schema-valid input. An unrecognised action is reported as
            // skipped rather than silently dropped.
            const unknownType: string = action.type;
            results.push({
              type: unknownType,
              status: 'skipped',
              message: `Unknown action type: ${unknownType}`,
            });
            actionsSkipped++;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ type: action.type, status: 'failed', message });
        actionsFailed++;
      }
    }

    // Store session record
    const executeSessionId = planId ?? randomUUID();
    await prisma.agentSession
      .upsert({
        where: { id: executeSessionId },
        update: {
          status: actionsFailed === 0 ? 'completed' : 'failed',
          plan: { planId, results },
        },
        create: {
          id: executeSessionId,
          userId,
          goal: `Execute plan ${planId}`,
          status: actionsFailed === 0 ? 'completed' : 'failed',
          plan: { planId, results },
        },
      })
      .catch(() => {
        // Non-fatal — session logging shouldn't block execution
      });

    if (results.length > 0) {
      await prisma.agentAction
        .createMany({
          data: results.map((r) => ({
            sessionId: executeSessionId,
            tool: r.type,
            input: {},
            output: { id: r.id, status: r.status },
            status:
              r.status === 'success' ? 'success' : r.status === 'failed' ? 'failed' : 'pending',
            message: r.message,
          })),
        })
        .catch(() => {
          // Non-fatal
        });
    }

    let summary: string;
    if (dryRun) {
      summary = `Dry run complete. ${actions.length} action(s) would be executed.`;
    } else if (results.length === 0) {
      summary = 'No actions executed.';
    } else if (results.length === 1 && results[0]) {
      const r = results[0];
      if (r.status === 'success') {
        summary = r.message;
      } else if (r.status === 'failed') {
        summary = `Failed to execute action: ${r.message}`;
      } else {
        summary = `Action skipped: ${r.message}`;
      }
    } else {
      const successfulMessages = results
        .filter((r) => r.status === 'success')
        .map((r) => r.message);
      const failedMessages = results.filter((r) => r.status === 'failed').map((r) => r.message);

      if (actionsFailed === 0) {
        summary = `Executed ${actionsExecuted} actions: ${successfulMessages.join('; ')}.`;
      } else {
        summary = `Executed ${actionsExecuted} of ${actions.length} action(s)${failedMessages.length > 0 ? ` (${failedMessages.length} failed: ${failedMessages.join('; ')})` : ''}.`;
      }
    }

    const output: ExecutePlanOutput = {
      sessionId: planId ?? randomUUID(),
      actionsExecuted,
      actionsSkipped,
      actionsFailed,
      results,
      summary,
    };

    return JSON.stringify(output);
  },
};
