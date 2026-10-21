// ============================================================
// Task Query Helpers
// All queries are scoped to userId — never cross-user leakage.
// ============================================================

import { prisma } from '../client.js';
import type { Prisma, Task, TaskStatus, TaskPriority } from '@prisma/client';

export interface GetTasksOptions {
  userId: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  includeCompleted?: boolean;
  limit?: number;
  offset?: number;
}

export async function getTasksForUser(opts: GetTasksOptions): Promise<Task[]> {
  const where: Prisma.TaskWhereInput = {
    userId: opts.userId,
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
    where.dueDate = {};
    if (opts.dueBefore) (where.dueDate as Prisma.DateTimeFilter).lt = opts.dueBefore;
    if (opts.dueAfter) (where.dueDate as Prisma.DateTimeFilter).gt = opts.dueAfter;
  }

  return prisma.task.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: opts.limit ?? 50,
    skip: opts.offset ?? 0,
  });
}

export async function getTaskById(id: string, userId: string): Promise<Task | null> {
  return prisma.task.findFirst({
    where: { id, userId, deletedAt: null },
  });
}

export async function countTasksForUser(
  userId: string,
  where?: Partial<Prisma.TaskWhereInput>,
): Promise<number> {
  return prisma.task.count({
    where: { userId, deletedAt: null, ...where },
  });
}
