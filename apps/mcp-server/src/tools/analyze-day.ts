import { prisma } from '@lifeos/database';
import { AnalyzeDayInputSchema, doIntervalsOverlap, getLocalDate, today } from '@lifeos/shared';
import { getAIProvider } from '@lifeos/ai';
import { ANALYZE_DAY_PROMPT } from '@lifeos/ai';
import type { AnalyzeDayOutput } from '@lifeos/shared';

export const analyzeDayTool = {
  name: 'analyze_day',
  description:
    'Use this tool to get a comprehensive analysis of a specific day: task load, calendar conflicts, overdue items, deadline risks, and a focus score (0-100). Call this early in the planning process to understand the current situation before generating a plan. Defaults to today.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'YYYY-MM-DD to analyze (default: today)',
      },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: AnalyzeDayInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = AnalyzeDayInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone ?? 'America/Los_Angeles';

    const dateStr = parsed.data.date ?? today(timezone);
    const dayStart = getLocalDate(dateStr, '00:00:00', timezone);
    const dayEnd = getLocalDate(dateStr, '23:59:59', timezone);
    const now = new Date();

    // Fetch tasks and events in parallel
    const [tasks, events] = await Promise.all([
      prisma.task.findMany({
        where: { userId, deletedAt: null, status: { not: 'completed' } },
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      }),
      prisma.calendarEvent.findMany({
        where: { userId, start: { gte: dayStart }, end: { lte: dayEnd } },
        orderBy: { start: 'asc' },
      }),
    ]);

    const urgentTasks = tasks.filter((t) => t.priority === 'urgent');
    const overdueCount = tasks.filter(
      (t) => t.dueDate && t.dueDate < now && t.status !== 'completed',
    ).length;
    const dueTodayCount = tasks.filter(
      (t) => t.dueDate && t.dueDate >= dayStart && t.dueDate <= dayEnd,
    ).length;

    // Detect calendar conflicts
    const conflicts: AnalyzeDayOutput['conflicts'] = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];
        if (!a || !b) continue;
        if (
          doIntervalsOverlap(
            { start: a.start.toISOString(), end: a.end.toISOString() },
            { start: b.start.toISOString(), end: b.end.toISOString() },
          )
        ) {
          conflicts.push({
            type: 'time_conflict',
            description: `"${a.title}" and "${b.title}" overlap`,
            affectedIds: [a.id, b.id],
          });
        }
      }
    }

    // Deadline risk: urgent tasks due today or tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    for (const task of urgentTasks) {
      if (task.dueDate && task.dueDate <= tomorrow) {
        conflicts.push({
          type: 'deadline_risk',
          description: `Urgent task "${task.title}" is due ${task.dueDate.toLocaleDateString()}`,
          affectedIds: [task.id],
        });
      }
    }

    // Calculate total committed time from events
    const committedMinutes = events.reduce((sum, e) => {
      return sum + (e.end.getTime() - e.start.getTime()) / 60_000;
    }, 0);
    const availableWorkMinutes = 8 * 60; // 8-hour workday
    const freeMinutes = Math.max(availableWorkMinutes - committedMinutes, 0);
    const taskLoadMinutes = tasks
      .filter((t) => t.estimatedMinutes)
      .reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);

    // Focus score: penalise overload, conflicts, overdue
    let focusScore = 100;
    focusScore -= overdueCount * 15;
    focusScore -= conflicts.filter((c) => c.type === 'time_conflict').length * 10;
    focusScore -= urgentTasks.length * 8;
    if (taskLoadMinutes > freeMinutes) {
      focusScore -= Math.min(30, Math.round(((taskLoadMinutes - freeMinutes) / freeMinutes) * 30));
    }
    focusScore = Math.max(0, Math.min(100, focusScore));

    // Use AI for richer recommendations if API key configured
    let recommendations: string[] = [];
    const aiKey = process.env['AI_API_KEY'];
    if (aiKey) {
      try {
        const ai = getAIProvider();
        const prompt = ANALYZE_DAY_PROMPT(
          dateStr,
          JSON.stringify(
            tasks.slice(0, 10).map((t) => ({
              title: t.title,
              priority: t.priority,
              dueDate: t.dueDate?.toISOString() ?? null,
              status: t.status,
            })),
          ),
          JSON.stringify(
            events.map((e) => ({
              title: e.title,
              start: e.start.toISOString(),
              end: e.end.toISOString(),
              type: e.type,
            })),
          ),
        );
        const result = await ai.complete([{ role: 'user', content: prompt }], {
          responseFormat: 'json_object',
          temperature: 0.2,
        });
        const parsed = JSON.parse(result.content) as { recommendations?: string[] };
        recommendations = parsed.recommendations ?? [];
      } catch {
        // Fallback to rule-based
      }
    }

    if (!recommendations.length) {
      if (urgentTasks.length > 0) {
        recommendations.push(`Start with "${urgentTasks[0]?.title}" — it's marked urgent.`);
      }
      if (overdueCount > 0) {
        recommendations.push(
          `You have ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} — address these first.`,
        );
      }
      if (conflicts.filter((c) => c.type === 'time_conflict').length > 0) {
        recommendations.push('Resolve calendar conflicts before scheduling new work blocks.');
      }
      if (dueTodayCount > 0 && recommendations.length < 3) {
        recommendations.push(
          `${dueTodayCount} task${dueTodayCount > 1 ? 's' : ''} due today — block time to complete them.`,
        );
      }
      if (!recommendations.length) {
        recommendations.push('Day looks manageable — prioritise deep work in the morning.');
      }
    }

    const output: AnalyzeDayOutput = {
      date: dateStr,
      summary: `${tasks.length} open tasks, ${events.length} events, ${overdueCount} overdue, ${urgentTasks.length} urgent`,
      totalTasks: tasks.length,
      completedTasks: 0,
      urgentTasks: urgentTasks.length,
      overdueCount,
      conflicts,
      recommendations: recommendations.slice(0, 3),
      focusScore,
    };

    return JSON.stringify(output);
  },
};
