// ============================================================
// Project Query Helpers
// ============================================================

import { prisma } from '../client.js';
import type { Project, ProjectStatus } from '@prisma/client';

export interface ProjectWithStats extends Project {
  taskCount: number;
  completedTaskCount: number;
  urgentTaskCount: number;
  progressPercent: number;
  nextDueDate: Date | null;
}

export async function getProjectsWithStats(
  userId: string,
  status?: ProjectStatus,
): Promise<ProjectWithStats[]> {
  const projects = await prisma.project.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'asc' },
    include: {
      tasks: {
        where: { deletedAt: null },
        select: { status: true, priority: true, dueDate: true },
      },
    },
  });

  return projects.map((p) => {
    const tasks = p.tasks;
    const completedTaskCount = tasks.filter((t) => t.status === 'completed').length;
    const urgentTaskCount = tasks.filter(
      (t) => t.priority === 'urgent' && t.status !== 'completed',
    ).length;
    const progressPercent =
      tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0;

    const futureDueDates = tasks
      .filter((t) => t.dueDate && t.status !== 'completed')
      .map((t) => t.dueDate as Date)
      .sort((a, b) => a.getTime() - b.getTime());

    const { tasks: _omit, ...projectBase } = p;
    return {
      ...projectBase,
      taskCount: tasks.length,
      completedTaskCount,
      urgentTaskCount,
      progressPercent,
      nextDueDate: futureDueDates[0] ?? null,
    };
  });
}
