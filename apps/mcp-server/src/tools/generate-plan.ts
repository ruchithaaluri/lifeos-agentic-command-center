import { randomUUID } from 'crypto';
import { prisma } from '@lifeos/database';
import { GeneratePlanInputSchema } from '@lifeos/shared';
import { getAIProvider } from '@lifeos/ai';
import { PLAN_GENERATION_PROMPT } from '@lifeos/ai';
import type { GeneratePlanOutput, Plan, PlanItem } from '@lifeos/shared';
import { today, getLocalDate, findAvailableSlots } from '@lifeos/shared';

export const generatePlanTool = {
  name: 'generate_plan',
  description:
    "Use this tool to generate a time-blocked daily plan for the user's goal. Call this AFTER you have retrieved tasks (get_tasks) and schedule (get_schedule). It uses AI to reason about priorities, deadlines, and available time. Returns a structured plan with time blocks and a list of required changes (create_task, create_event, etc.).",
  inputSchema: {
    type: 'object' as const,
    required: ['goal'],
    properties: {
      goal: { type: 'string', description: "The user's goal in natural language" },
      date: { type: 'string', description: 'YYYY-MM-DD target date (default: today)' },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional constraints e.g. ["only 90 minutes available tonight"]',
      },
      contextIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'UUIDs of already-relevant tasks or events',
      },
    },
  },

  // Zod shape registered with the MCP SDK so tools/list advertises the real
  // schema and arguments are validated by the SDK before execute().
  zodSchema: GeneratePlanInputSchema.shape,

  async execute(input: unknown, userId: string): Promise<string> {
    const parsed = GeneratePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const { goal, date = today(), constraints = [] } = parsed.data;

    // Fetch user for timezone
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone ?? 'America/Los_Angeles';

    // Fetch context using user's timezone boundaries
    const targetDateStart = getLocalDate(date, '00:00:00', timezone);
    const targetDateEnd = getLocalDate(date, '23:59:59', timezone);

    const [tasks, events] = await Promise.all([
      prisma.task.findMany({
        where: { userId, deletedAt: null, status: { not: 'completed' } },
        take: 30,
      }),
      prisma.calendarEvent.findMany({
        where: { userId, start: { gte: targetDateStart }, end: { lte: targetDateEnd } },
        orderBy: { start: 'asc' },
      }),
    ]);

    // 1. Check if this is a targeted reschedule / move request
    if (isTargetedMoveRequest(goal, constraints)) {
      const targetedPlan = await buildTargetedReschedulePlan({
        goal,
        date,
        timezone,
        userId,
        constraints,
        events,
        tasks,
      });
      return JSON.stringify(targetedPlan);
    }

    // Try AI-based plan generation if key is present
    let planOutput: GeneratePlanOutput | null = null;
    const aiKey = process.env['AI_API_KEY'];

    if (aiKey) {
      try {
        const ai = getAIProvider();
        const contextStr = JSON.stringify({
          date,
          timezone,
          constraints,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            estimatedMinutes: t.estimatedMinutes,
            dueDate: t.dueDate?.toISOString() ?? null,
          })),
          existingEvents: events.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start.toISOString(),
            end: e.end.toISOString(),
            type: e.type,
          })),
        });

        const result = await ai.complete(
          [{ role: 'user', content: PLAN_GENERATION_PROMPT(goal, contextStr) }],
          { responseFormat: 'json_object', temperature: 0.3 },
        );

        planOutput = JSON.parse(result.content) as GeneratePlanOutput;
      } catch {
        // Fall through to rule-based
      }
    }

    // Rule-based fallback plan
    if (!planOutput) {
      planOutput = buildRuleBasedPlan(goal, date, timezone, tasks, events, constraints);
    }

    return JSON.stringify(planOutput);
  },
};

// ── Rule-based plan builder (no AI required) ─────────────────────────────

function buildRuleBasedPlan(
  goal: string,
  date: string,
  timezone: string,
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    estimatedMinutes: number | null;
    dueDate: Date | null;
    status: string;
  }>,
  events: Array<{ id: string; title: string; start: Date; end: Date }>,
  constraints: string[],
): GeneratePlanOutput {
  if (isTargetedMoveRequest(goal, constraints)) {
    return buildTargetedReschedulePlanSync(goal, date, timezone, tasks, events, constraints);
  }

  const planId = randomUUID();
  const items: PlanItem[] = [];
  const changesRequired: GeneratePlanOutput['changesRequired'] = [];

  const allConstraintsText = `${goal} ${constraints.join(' ')}`;

  // 1. Determine time budget (maxMinutes)
  let maxMinutes = 8 * 60; // default full workday
  const durationMatch = allConstraintsText.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)/i);
  if (durationMatch?.[1] && durationMatch[2]) {
    const num = parseFloat(durationMatch[1]);
    const isHours = /^h/i.test(durationMatch[2]);
    maxMinutes = isHours ? Math.round(num * 60) : Math.round(num);
  }

  // 2. Determine scheduling window
  let windowStart: Date;
  let windowEnd: Date;

  const explicitTimeMatch = allConstraintsText.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (explicitTimeMatch?.[1]) {
    let hour = parseInt(explicitTimeMatch[1], 10);
    const min = explicitTimeMatch[2] ? parseInt(explicitTimeMatch[2], 10) : 0;
    const ampm = explicitTimeMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`;
    windowStart = getLocalDate(date, timeStr, timezone);
    windowEnd = new Date(windowStart.getTime() + Math.max(maxMinutes, 60) * 60_000);
  } else if (/\b(tonight|this evening|evening)\b/i.test(allConstraintsText)) {
    // Evening window: 18:00 to 22:30 local time (stays strictly before midnight on `date`)
    windowStart = getLocalDate(date, '18:00:00', timezone);
    windowEnd = getLocalDate(date, '22:30:00', timezone);
  } else if (/\bmorning\b/i.test(allConstraintsText)) {
    windowStart = getLocalDate(date, '09:00:00', timezone);
    windowEnd = getLocalDate(date, '12:00:00', timezone);
  } else if (/\bafternoon\b/i.test(allConstraintsText)) {
    windowStart = getLocalDate(date, '13:00:00', timezone);
    windowEnd = getLocalDate(date, '17:30:00', timezone);
  } else {
    // Workday default: 09:00 to 18:00
    windowStart = getLocalDate(date, '09:00:00', timezone);
    windowEnd = getLocalDate(date, '18:00:00', timezone);
  }

  // 3. Add all existing calendar events to plan items
  const existingDemoEvent = events.find((e) => e.title.toLowerCase().includes('demo practice'));

  for (const e of events) {
    items.push({
      id: randomUUID(),
      type: 'event',
      title: e.title,
      startTime: e.start.toISOString(),
      endTime: e.end.toISOString(),
      durationMinutes: Math.round((e.end.getTime() - e.start.getTime()) / 60_000),
      eventId: e.id,
      status: 'planned',
      reason:
        e.id === existingDemoEvent?.id ? 'Scheduled demo practice' : 'Existing calendar event',
    });
  }

  // 4. Find free non-overlapping slots
  const availableSlots = findAvailableSlots(windowStart, windowEnd, events);

  let remainingBudget = maxMinutes;
  let scheduledNewMinutes = 0;

  // 5. Handle Demo Practice / Scheduled Focus Block
  const isDemo = /demo/i.test(goal);
  const isExplicitSchedule = /schedule|block|prepare|preparation|practice/i.test(goal);

  if (isDemo || isExplicitSchedule) {
    const eventTitle = isDemo ? 'Demo Practice' : 'Focus Block';
    const existingMatchingEvent = events.find((e) =>
      e.title.toLowerCase().includes(eventTitle.toLowerCase()),
    );

    if (existingMatchingEvent) {
      // Replan case: event already exists in DB, reuse it!
      const existingDuration = Math.round(
        (existingMatchingEvent.end.getTime() - existingMatchingEvent.start.getTime()) / 60_000,
      );
      // Count existing event towards the session budget if it falls in the window
      if (existingMatchingEvent.start >= windowStart && existingMatchingEvent.end <= windowEnd) {
        remainingBudget = Math.max(0, remainingBudget - existingDuration);
        scheduledNewMinutes += existingDuration;
      }
    } else {
      // Create new event in the first available slot
      const defaultDuration = Math.min(maxMinutes, 60);
      const prepDuration = Math.min(defaultDuration, remainingBudget);

      if (prepDuration >= 15 && availableSlots.length > 0) {
        const slot = availableSlots[0];
        if (slot) {
          const slotDuration = Math.round((slot.end.getTime() - slot.start.getTime()) / 60_000);
          if (slotDuration >= prepDuration) {
            const prepStart = slot.start;
            const prepEnd = new Date(prepStart.getTime() + prepDuration * 60_000);

            items.push({
              id: randomUUID(),
              type: 'event',
              title: eventTitle,
              startTime: prepStart.toISOString(),
              endTime: prepEnd.toISOString(),
              durationMinutes: prepDuration,
              priority: 'high',
              status: 'planned',
              reason: isDemo
                ? 'Run through demo flow before tomorrow'
                : `Scheduled time for: ${goal}`,
            });

            changesRequired.push({
              type: 'create_event',
              description: `Block time for ${eventTitle.toLowerCase()}`,
              payload: {
                title: eventTitle,
                start: prepStart.toISOString(),
                end: prepEnd.toISOString(),
                type: 'focus',
                description: `LifeOS Planned Block: ${eventTitle}`,
              },
            });

            remainingBudget -= prepDuration;
            scheduledNewMinutes += prepDuration;

            // Advance the slot start for subsequent tasks
            slot.start = new Date(prepEnd.getTime() + 5 * 60_000);
          }
        }
      }
    }
  }

  // 6. Schedule prioritized tasks in remaining free slots
  const PRIORITY_RANK: Record<string, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const goalLower = goal.toLowerCase();
  const isGoalRelevant = (t: { title: string }) => {
    const titleLower = t.title.toLowerCase();
    if (/demo/i.test(goalLower) && /demo|slide|present|talk|prep/i.test(titleLower)) return true;
    return false;
  };

  const candidateTasks = tasks.filter((t) => t.status !== 'completed');
  candidateTasks.sort((a, b) => {
    const aRel = isGoalRelevant(a) ? 1 : 0;
    const bRel = isGoalRelevant(b) ? 1 : 0;
    if (aRel !== bRel) return bRel - aRel;
    const aPrio = PRIORITY_RANK[a.priority] ?? 2;
    const bPrio = PRIORITY_RANK[b.priority] ?? 2;
    if (aPrio !== bPrio) return bPrio - aPrio;
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  for (const task of candidateTasks) {
    if (remainingBudget < 15) break;

    const taskEst = task.estimatedMinutes ?? 30;
    const taskDuration = Math.min(taskEst, remainingBudget);
    if (taskDuration < 15) {
      if (taskDuration < 10) continue;
    }

    // Find an available slot that can fit this task
    let placed = false;
    for (const slot of availableSlots) {
      const slotMinutes = Math.round((slot.end.getTime() - slot.start.getTime()) / 60_000);
      if (slotMinutes >= taskDuration) {
        const taskStart = slot.start;
        const taskEnd = new Date(taskStart.getTime() + taskDuration * 60_000);

        items.push({
          id: randomUUID(),
          type: 'task',
          title: task.title,
          startTime: taskStart.toISOString(),
          endTime: taskEnd.toISOString(),
          durationMinutes: taskDuration,
          priority: task.priority as PlanItem['priority'],
          taskId: task.id,
          status: 'planned',
          reason: `${task.priority} priority task`,
        });

        changesRequired.push({
          type: 'update_task',
          description: `Mark "${task.title}" as in_progress`,
          payload: { id: task.id, status: 'in_progress' },
        });

        remainingBudget -= taskDuration;
        scheduledNewMinutes += taskDuration;

        // Advance slot
        slot.start = new Date(taskEnd.getTime() + 5 * 60_000);
        placed = true;
        break;
      }
    }

    if (!placed && remainingBudget <= 0) break;
  }

  // 7. Sort all items chronologically
  items.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const scheduledTasksCount = changesRequired.filter(
    (c) => c.type === 'update_task' || c.type === 'create_task',
  ).length;
  const createdEventsCount = changesRequired.filter((c) => c.type === 'create_event').length;
  const existingEventsCount = items.filter(
    (i) => i.type === 'event' && i.reason?.includes('Existing'),
  ).length;

  const budgetNotice =
    maxMinutes < 480 ? `${maxMinutes}-minute budget evaluated` : 'workday schedule evaluated';

  const plan: Plan = {
    id: planId,
    goal,
    items,
    summary: `Plan for: "${goal}". Scheduled ${scheduledTasksCount} task(s)${createdEventsCount > 0 ? ` and ${createdEventsCount} event(s)` : ''} (${scheduledNewMinutes} min planned work${existingEventsCount > 0 ? `, preserving ${existingEventsCount} existing calendar event(s)` : ''}). Constraints evaluated: ${budgetNotice}.`,
    generatedAt: new Date().toISOString(),
    validForDate: date,
  };

  return {
    plan,
    reasoning: `Allocated ${scheduledNewMinutes} minutes of focused preparation work (budget: ${maxMinutes} min). Evaluated scheduling constraints and preserved ${events.length} existing event(s) without time conflicts.`,
    changesRequired,
  };
}

// ── Targeted Rescheduling Helpers & Handler ─────────────────────────────

export function isTargetedMoveRequest(goal: string, constraints: string[] = []): boolean {
  const text = `${goal} ${constraints.join(' ')}`;
  const hasMoveVerb = /\b(?:move|reschedule|shift|push|change\s+the\s+time\s+of)\b/i.test(text);
  const isFullReplan =
    /\b(?:rebuild\s+my\s+plan|replan\s+my\s+day|plan\s+my\s+day|replan\s+tomorrow|plan\s+tomorrow|full\s+day)\b/i.test(
      text,
    );
  const hasTargetTime =
    /\b(?:to|at|for)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(text) ||
    constraints.some((c) => c.startsWith('explicit time:'));
  return hasMoveVerb && !isFullReplan && hasTargetTime;
}

interface ParsedTargetTime {
  hour: number;
  minute: number;
  label: string;
}

function parseTargetTime(goal: string, constraints: string[] = []): ParsedTargetTime | null {
  const combined = `${goal} ${constraints.join(' ')}`;
  const match = combined.match(
    /\b(?:to|at|for|explicit time:)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  );
  if (!match || !match[1]) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();

  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMin = minute > 0 ? `:${minute.toString().padStart(2, '0')}` : '';
  const label = `${displayHour}${displayMin} ${period}`;

  return { hour, minute, label };
}

function extractTargetEntityQuery(goal: string): string {
  return goal
    .replace(/\b(?:move|reschedule|shift|push|change the time of)\b/gi, '')
    .replace(/\b(?:to|at|for)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
    .replace(/\b(?:please|my|the|our|this|a|an)\b/gi, '')
    .replace(/[.?!,]/g, '')
    .trim();
}

function formatTime12h(date: Date, timeZone: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

export async function buildTargetedReschedulePlan(opts: {
  goal: string;
  date: string;
  timezone: string;
  userId: string;
  constraints: string[];
  events: Array<{ id: string; title: string; start: Date; end: Date }>;
  tasks: Array<{ id: string; title: string; status: string }>;
}): Promise<GeneratePlanOutput> {
  const planId = randomUUID();
  const { goal, date, timezone, userId, constraints, events } = opts;

  const targetTime = parseTargetTime(goal, constraints);
  if (!targetTime) {
    return {
      plan: {
        id: planId,
        goal,
        items: [],
        summary: `Please specify what time you would like to move this session to (e.g. "Move my practice session to 8 PM").`,
        generatedAt: new Date().toISOString(),
        validForDate: date,
      },
      reasoning: 'Missing target time for targeted rescheduling.',
      changesRequired: [],
    };
  }

  const queryRaw = extractTargetEntityQuery(goal);
  const genericWords = new Set(['session', 'meeting', 'event', 'block', 'time', 'slot']);
  const tokens = queryRaw
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !genericWords.has(w));

  // 1. Search candidate calendar events
  const matchedEvents = events.filter((e) => {
    const titleLower = e.title.toLowerCase();
    if (queryRaw && titleLower.includes(queryRaw.toLowerCase())) return true;
    return tokens.length > 0 && tokens.some((t) => titleLower.includes(t));
  });

  let targetEvent: { id: string; title: string; start: Date; end: Date } | null = null;
  if (matchedEvents.length === 1) {
    targetEvent = matchedEvents[0] ?? null;
  } else if (matchedEvents.length === 0) {
    // If not on target date, search all events for this user in database
    const allUserEvents = await prisma.calendarEvent.findMany({
      where: { userId },
      orderBy: { start: 'desc' },
    });
    const matchesInAll = allUserEvents.filter((e) => {
      const titleLower = e.title.toLowerCase();
      if (queryRaw && titleLower.includes(queryRaw.toLowerCase())) return true;
      return tokens.length > 0 && tokens.some((t) => titleLower.includes(t));
    });

    if (matchesInAll.length === 1) {
      targetEvent = matchesInAll[0] ?? null;
    } else if (matchesInAll.length > 1) {
      const exact = matchesInAll.find(
        (e) => queryRaw && e.title.toLowerCase() === queryRaw.toLowerCase(),
      );
      if (exact) {
        targetEvent = exact;
      } else {
        return {
          plan: {
            id: planId,
            goal,
            items: [],
            summary: `Multiple events match "${queryRaw}": ${matchesInAll.map((m) => `"${m.title}"`).join(', ')}. Please specify which one to move.`,
            generatedAt: new Date().toISOString(),
            validForDate: date,
          },
          reasoning: `Ambiguous target for move request. Found ${matchesInAll.length} candidate events.`,
          changesRequired: [],
        };
      }
    }
  } else {
    const exact = matchedEvents.find(
      (e) => queryRaw && e.title.toLowerCase() === queryRaw.toLowerCase(),
    );
    if (exact) {
      targetEvent = exact;
    } else {
      return {
        plan: {
          id: planId,
          goal,
          items: [],
          summary: `Multiple events on this date match "${queryRaw}": ${matchedEvents.map((m) => `"${m.title}"`).join(', ')}. Please specify which one to move.`,
          generatedAt: new Date().toISOString(),
          validForDate: date,
        },
        reasoning: `Ambiguous target for move request. Found ${matchedEvents.length} candidate events on target date.`,
        changesRequired: [],
      };
    }
  }

  // If no calendar event matched:
  if (!targetEvent) {
    return {
      plan: {
        id: planId,
        goal,
        items: [],
        summary: `No calendar event matching "${queryRaw || goal}" was found on your schedule to move.`,
        generatedAt: new Date().toISOString(),
        validForDate: date,
      },
      reasoning: `Target calendar event not found. Open tasks are preserved and were not converted into calendar moves.`,
      changesRequired: [],
    };
  }

  // 2. Compute exact requested start and end times in user's timezone
  const timeStr = `${targetTime.hour.toString().padStart(2, '0')}:${targetTime.minute.toString().padStart(2, '0')}:00`;
  const targetStart = getLocalDate(date, timeStr, timezone);
  const originalDurationMs = Math.max(
    15 * 60_000,
    targetEvent.end.getTime() - targetEvent.start.getTime(),
  );
  const targetEnd = new Date(targetStart.getTime() + originalDurationMs);
  const durationMinutes = Math.round(originalDurationMs / 60_000);

  // 3. Conflict checking
  const dayStart = getLocalDate(date, '00:00:00', timezone);
  const dayEnd = getLocalDate(date, '23:59:59', timezone);
  const dayEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      start: { gte: dayStart },
      end: { lte: dayEnd },
    },
    orderBy: { start: 'asc' },
  });

  const conflict = dayEvents.find(
    (e) =>
      e.id !== targetEvent?.id &&
      e.start.getTime() < targetEnd.getTime() &&
      e.end.getTime() > targetStart.getTime(),
  );

  if (conflict) {
    const conflictStart = formatTime12h(conflict.start, timezone);
    const conflictEnd = formatTime12h(conflict.end, timezone);
    return {
      plan: {
        id: planId,
        goal,
        items: [],
        summary: `Cannot move "${targetEvent.title}" to ${targetTime.label}: conflicts with existing event "${conflict.title}" (${conflictStart}–${conflictEnd}).`,
        generatedAt: new Date().toISOString(),
        validForDate: date,
      },
      reasoning: `Conflict detected at ${targetTime.label} with "${conflict.title}". The event was not moved and no other tasks were modified.`,
      changesRequired: [],
    };
  }

  // 4. Build successful plan: ONLY move_event action, ZERO task modifications
  const changesRequired: GeneratePlanOutput['changesRequired'] = [
    {
      type: 'move_event',
      description: `Move "${targetEvent.title}" to ${targetTime.label}`,
      payload: {
        id: targetEvent.id,
        newStart: targetStart.toISOString(),
        newEnd: targetEnd.toISOString(),
        reason: `Moved to ${targetTime.label} as requested by user`,
      },
    },
  ];

  const items: PlanItem[] = [];
  let targetIncluded = false;
  for (const e of dayEvents) {
    if (e.id === targetEvent.id) {
      items.push({
        id: randomUUID(),
        type: 'event',
        title: e.title,
        startTime: targetStart.toISOString(),
        endTime: targetEnd.toISOString(),
        durationMinutes,
        eventId: e.id,
        status: 'planned',
        reason: `Moved to ${targetTime.label}`,
      });
      targetIncluded = true;
    } else {
      items.push({
        id: randomUUID(),
        type: 'event',
        title: e.title,
        startTime: e.start.toISOString(),
        endTime: e.end.toISOString(),
        durationMinutes: Math.round((e.end.getTime() - e.start.getTime()) / 60_000),
        eventId: e.id,
        status: 'planned',
        reason: 'Existing calendar event',
      });
    }
  }

  if (!targetIncluded) {
    items.push({
      id: randomUUID(),
      type: 'event',
      title: targetEvent.title,
      startTime: targetStart.toISOString(),
      endTime: targetEnd.toISOString(),
      durationMinutes,
      eventId: targetEvent.id,
      status: 'planned',
      reason: `Moved to ${targetTime.label}`,
    });
  }

  items.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const plan: Plan = {
    id: planId,
    goal,
    items,
    summary: `Plan for: "${goal}". Moved "${targetEvent.title}" to ${targetTime.label} (${durationMinutes} min), preserving existing schedule and tasks.`,
    generatedAt: new Date().toISOString(),
    validForDate: date,
  };

  return {
    plan,
    reasoning: `Targeted rescheduling: moved "${targetEvent.title}" to ${targetTime.label} (${durationMinutes} min). Verified zero time conflicts, preserved all other calendar events, and made no unexpected changes to open tasks.`,
    changesRequired,
  };
}

export function buildTargetedReschedulePlanSync(
  goal: string,
  date: string,
  timezone: string,
  _tasks: Array<{ id: string; title: string; status: string }>,
  events: Array<{ id: string; title: string; start: Date; end: Date }>,
  constraints: string[],
): GeneratePlanOutput {
  const planId = randomUUID();
  const targetTime = parseTargetTime(goal, constraints);
  if (!targetTime) {
    return {
      plan: {
        id: planId,
        goal,
        items: [],
        summary: `Please specify what time you would like to move this session to.`,
        generatedAt: new Date().toISOString(),
        validForDate: date,
      },
      reasoning: 'Missing target time for targeted rescheduling.',
      changesRequired: [],
    };
  }

  const queryRaw = extractTargetEntityQuery(goal);
  const genericWords = new Set(['session', 'meeting', 'event', 'block', 'time', 'slot']);
  const tokens = queryRaw
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !genericWords.has(w));

  const matchedEvents = events.filter((e) => {
    const titleLower = e.title.toLowerCase();
    if (queryRaw && titleLower.includes(queryRaw.toLowerCase())) return true;
    return tokens.length > 0 && tokens.some((t) => titleLower.includes(t));
  });

  if (matchedEvents.length === 0) {
    return {
      plan: {
        id: planId,
        goal,
        items: [],
        summary: `No calendar event matching "${queryRaw || goal}" was found on your schedule to move.`,
        generatedAt: new Date().toISOString(),
        validForDate: date,
      },
      reasoning: `Target calendar event not found. Open tasks are preserved and were not converted into calendar moves.`,
      changesRequired: [],
    };
  }

  if (matchedEvents.length > 1) {
    const exact = matchedEvents.find(
      (e) => queryRaw && e.title.toLowerCase() === queryRaw.toLowerCase(),
    );
    if (!exact) {
      return {
        plan: {
          id: planId,
          goal,
          items: [],
          summary: `Multiple events match "${queryRaw}": ${matchedEvents.map((m) => `"${m.title}"`).join(', ')}. Please specify which one to move.`,
          generatedAt: new Date().toISOString(),
          validForDate: date,
        },
        reasoning: `Ambiguous target for move request. Found ${matchedEvents.length} candidate events.`,
        changesRequired: [],
      };
    }
  }

  const targetEvent = matchedEvents[0];
  if (!targetEvent) throw new Error('Target event unexpectedly undefined');

  const timeStr = `${targetTime.hour.toString().padStart(2, '0')}:${targetTime.minute.toString().padStart(2, '0')}:00`;
  const targetStart = getLocalDate(date, timeStr, timezone);
  const originalDurationMs = Math.max(
    15 * 60_000,
    targetEvent.end.getTime() - targetEvent.start.getTime(),
  );
  const targetEnd = new Date(targetStart.getTime() + originalDurationMs);
  const durationMinutes = Math.round(originalDurationMs / 60_000);

  const conflict = events.find(
    (e) =>
      e.id !== targetEvent.id &&
      e.start.getTime() < targetEnd.getTime() &&
      e.end.getTime() > targetStart.getTime(),
  );

  if (conflict) {
    const conflictStart = formatTime12h(conflict.start, timezone);
    const conflictEnd = formatTime12h(conflict.end, timezone);
    return {
      plan: {
        id: planId,
        goal,
        items: [],
        summary: `Cannot move "${targetEvent.title}" to ${targetTime.label}: conflicts with existing event "${conflict.title}" (${conflictStart}–${conflictEnd}).`,
        generatedAt: new Date().toISOString(),
        validForDate: date,
      },
      reasoning: `Conflict detected at ${targetTime.label} with "${conflict.title}". The event was not moved and no other tasks were modified.`,
      changesRequired: [],
    };
  }

  const changesRequired: GeneratePlanOutput['changesRequired'] = [
    {
      type: 'move_event',
      description: `Move "${targetEvent.title}" to ${targetTime.label}`,
      payload: {
        id: targetEvent.id,
        newStart: targetStart.toISOString(),
        newEnd: targetEnd.toISOString(),
        reason: `Moved to ${targetTime.label} as requested by user`,
      },
    },
  ];

  const items: PlanItem[] = events.map((e) => {
    if (e.id === targetEvent.id) {
      return {
        id: randomUUID(),
        type: 'event',
        title: e.title,
        startTime: targetStart.toISOString(),
        endTime: targetEnd.toISOString(),
        durationMinutes,
        eventId: e.id,
        status: 'planned',
        reason: `Moved to ${targetTime.label}`,
      };
    }
    return {
      id: randomUUID(),
      type: 'event',
      title: e.title,
      startTime: e.start.toISOString(),
      endTime: e.end.toISOString(),
      durationMinutes: Math.round((e.end.getTime() - e.start.getTime()) / 60_000),
      eventId: e.id,
      status: 'planned',
      reason: 'Existing calendar event',
    };
  });

  items.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const plan: Plan = {
    id: planId,
    goal,
    items,
    summary: `Plan for: "${goal}". Moved "${targetEvent.title}" to ${targetTime.label} (${durationMinutes} min), preserving existing schedule and tasks.`,
    generatedAt: new Date().toISOString(),
    validForDate: date,
  };

  return {
    plan,
    reasoning: `Targeted rescheduling: moved "${targetEvent.title}" to ${targetTime.label} (${durationMinutes} min). Verified zero time conflicts, preserved all other calendar events, and made no unexpected changes to open tasks.`,
    changesRequired,
  };
}
