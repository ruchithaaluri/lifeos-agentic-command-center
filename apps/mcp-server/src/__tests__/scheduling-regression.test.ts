// ============================================================
// LifeOS Scheduling Regression Tests
// ============================================================
// Validates:
// 1. "Tonight" stays within current calendar day (no 12:00 AM next day).
// 2. 90-minute replan respects duration bound and reuses previous blocks.
// 3. Duplicate execution prevention (idempotency).
// 4. Explicit after-midnight request ("12:30 AM tomorrow") is allowed.
// 5. Existing evening events are preserved without overlap.

import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@lifeos/database';
import { generatePlanTool } from '../tools/generate-plan.js';
import { executePlanTool } from '../tools/execute-plan.js';
import { getScheduleTool } from '../tools/get-schedule.js';
import { getLocalDate } from '@lifeos/shared';

const TEST_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const TIMEZONE = 'Asia/Kolkata'; // Positive UTC offset +05:30 to rigorously test UTC vs local time
const TARGET_DATE = '2026-10-04';

describe('Scheduling Regression Tests', () => {
  beforeEach(async () => {
    // Clean up test user and records
    await prisma.calendarEvent.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.task.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.agentSession.deleteMany({ where: { userId: TEST_USER_ID } });

    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      create: {
        id: TEST_USER_ID,
        email: 'scheduling-test@lifeos.test',
        name: 'Scheduling Tester',
        timezone: TIMEZONE,
        demoMode: true,
      },
      update: {
        timezone: TIMEZONE,
      },
    });

    // Create standard baseline events:
    // 9:00 AM–9:30 AM — Welcome to LifeOS
    // 2:00 PM–3:00 PM — Focus block
    // 5:00 PM–5:30 PM — Daily review
    const start9am = getLocalDate(TARGET_DATE, '09:00:00', TIMEZONE);
    const end930am = getLocalDate(TARGET_DATE, '09:30:00', TIMEZONE);
    const start2pm = getLocalDate(TARGET_DATE, '14:00:00', TIMEZONE);
    const end3pm = getLocalDate(TARGET_DATE, '15:00:00', TIMEZONE);
    const start5pm = getLocalDate(TARGET_DATE, '17:00:00', TIMEZONE);
    const end530pm = getLocalDate(TARGET_DATE, '17:30:00', TIMEZONE);

    await prisma.calendarEvent.createMany({
      data: [
        {
          userId: TEST_USER_ID,
          title: 'Welcome to LifeOS',
          start: start9am,
          end: end930am,
          type: 'focus',
        },
        {
          userId: TEST_USER_ID,
          title: 'Focus block',
          start: start2pm,
          end: end3pm,
          type: 'focus',
        },
        {
          userId: TEST_USER_ID,
          title: 'Daily review',
          start: start5pm,
          end: end530pm,
          type: 'focus',
        },
      ],
    });

    // Create a demo preparation task
    await prisma.task.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Review demo slides & flow',
        priority: 'high',
        estimatedMinutes: 30,
        status: 'todo',
      },
    });
  });

  it('1. "Schedule 1 hour tonight" stays on today date, no 12:00 AM next day, exactly 60m new work', async () => {
    const goal = 'I have a product demo tomorrow. Schedule 1 hour tonight to prepare for it.';
    const planRaw = await generatePlanTool.execute(
      {
        goal,
        date: TARGET_DATE,
        constraints: ['only 60 minutes available', 'time window: tonight'],
      },
      TEST_USER_ID,
    );
    const planOutput = JSON.parse(planRaw) as {
      plan: { id: string; items: Array<{ durationMinutes: number; reason?: string; title: string }> };
      changesRequired: Array<{ type: string; payload: Record<string, unknown> }>;
    };

    // Changes required should include Demo Practice event and/or prep task
    expect(planOutput.changesRequired.length).toBeGreaterThan(0);

    // Execute plan
    const execRaw = await executePlanTool.execute(
      {
        planId: planOutput.plan.id,
        actions: planOutput.changesRequired,
      },
      TEST_USER_ID,
    );
    const execOutput = JSON.parse(execRaw) as { actionsFailed: number };
    expect(execOutput.actionsFailed).toBe(0);

    // Verify persisted database events
    const allEvents = await prisma.calendarEvent.findMany({
      where: { userId: TEST_USER_ID },
      orderBy: { start: 'asc' },
    });

    const demoEvents = allEvents.filter((e) => e.title.includes('Demo Practice'));
    expect(demoEvents.length).toBe(1);
    const demoEvent = demoEvents[0];
    expect(demoEvent).toBeDefined();
    if (!demoEvent) throw new Error('demoEvent not found');

    const demoStartStr = demoEvent.start.toLocaleTimeString('en-US', { timeZone: TIMEZONE, hour12: false });
    const demoEndStr = demoEvent.end.toLocaleTimeString('en-US', { timeZone: TIMEZONE, hour12: false });

    // Ensure it falls within evening window (18:00 - 22:30) and NOT 00:00 (12:00 AM)
    expect(demoEvent.start.getTime()).toBeLessThan(getLocalDate(TARGET_DATE, '23:59:59', TIMEZONE).getTime());
    expect(demoEvent.start.getTime()).toBeGreaterThanOrEqual(getLocalDate(TARGET_DATE, '18:00:00', TIMEZONE).getTime());
    expect(demoStartStr).not.toBe('00:00:00');
    expect(demoEndStr).not.toBe('00:00:00');

    // Total new work planned: Demo practice event (30m) + Task (30m) = 60m
    const planDuration = planOutput.plan.items
      .filter((i) => i.reason?.includes('priority') || i.title.includes('Demo Practice'))
      .reduce((sum, i) => sum + i.durationMinutes, 0);
    expect(planDuration).toBe(60);
  });

  it('2. "I only have 90 minutes tonight. Replan..." preserves existing events and does not duplicate Demo Practice', async () => {
    // Initial schedule: 1 hour
    const plan1Raw = await generatePlanTool.execute(
      {
        goal: 'I have a product demo tomorrow. Schedule 1 hour tonight to prepare for it.',
        date: TARGET_DATE,
        constraints: ['only 60 minutes available', 'time window: tonight'],
      },
      TEST_USER_ID,
    );
    const plan1 = JSON.parse(plan1Raw) as {
      plan: { id: string };
      changesRequired: Array<{ type: string; payload: Record<string, unknown> }>;
    };
    await executePlanTool.execute({ planId: plan1.plan.id, actions: plan1.changesRequired }, TEST_USER_ID);

    // Verify 1 Demo Practice event exists
    const eventsBefore = await prisma.calendarEvent.findMany({ where: { userId: TEST_USER_ID } });
    expect(eventsBefore.filter((e) => e.title.includes('Demo Practice')).length).toBe(1);

    // Now user requests replan: "I only have 90 minutes tonight. Replan my preparation for tomorrow's product demo."
    const replanRaw = await generatePlanTool.execute(
      {
        goal: "I only have 90 minutes tonight. Replan my preparation for tomorrow's product demo.",
        date: TARGET_DATE,
        constraints: ['only 90 minutes available', 'time window: tonight', 'replan: true'],
      },
      TEST_USER_ID,
    );
    const replan = JSON.parse(replanRaw) as {
      plan: { id: string; items: Array<{ type: string; durationMinutes: number; title: string }> };
      changesRequired: Array<{ type: string; payload: { title?: string } }>;
    };

    // Should NOT create another create_event for Demo Practice
    const newDemoEventActions = replan.changesRequired.filter(
      (c) => c.type === 'create_event' && c.payload.title?.includes('Demo Practice'),
    );
    expect(newDemoEventActions.length).toBe(0);

    // Execute replan
    await executePlanTool.execute({ planId: replan.plan.id, actions: replan.changesRequired }, TEST_USER_ID);

    // Verify database state: exactly 1 Demo Practice event, no duplicate
    const eventsAfter = await prisma.calendarEvent.findMany({ where: { userId: TEST_USER_ID } });
    const demoEventsAfter = eventsAfter.filter((e) => e.title.includes('Demo Practice'));
    expect(demoEventsAfter.length).toBe(1);

    // Unrelated baseline events (Welcome, Focus block, Daily review) remain intact
    expect(eventsAfter.filter((e) => e.title === 'Welcome to LifeOS').length).toBe(1);
    expect(eventsAfter.filter((e) => e.title === 'Focus block').length).toBe(1);
    expect(eventsAfter.filter((e) => e.title === 'Daily review').length).toBe(1);

    // Total planned work <= 90 minutes
    const plannedWorkMinutes = replan.plan.items
      .filter((i) => i.type === 'task' || i.title.includes('Demo Practice'))
      .reduce((sum, i) => sum + i.durationMinutes, 0);
    expect(plannedWorkMinutes).toBeLessThanOrEqual(90);
  });

  it('3. Duplicate execution of identical plan is idempotent', async () => {
    const planRaw = await generatePlanTool.execute(
      {
        goal: 'Schedule 1 hour tonight for demo practice',
        date: TARGET_DATE,
        constraints: ['only 60 minutes available', 'time window: tonight'],
      },
      TEST_USER_ID,
    );
    const plan = JSON.parse(planRaw) as {
      plan: { id: string };
      changesRequired: Array<{ type: string; payload: Record<string, unknown> }>;
    };

    // First execution
    await executePlanTool.execute({ planId: plan.plan.id, actions: plan.changesRequired }, TEST_USER_ID);
    const countAfterFirst = await prisma.calendarEvent.count({ where: { userId: TEST_USER_ID } });

    // Second execution with identical payload
    const exec2 = await executePlanTool.execute(
      { planId: plan.plan.id, actions: plan.changesRequired },
      TEST_USER_ID,
    );
    const countAfterSecond = await prisma.calendarEvent.count({ where: { userId: TEST_USER_ID } });
    expect(countAfterSecond).toBe(countAfterFirst);

    const exec2Output = JSON.parse(exec2) as { actionsFailed: number };
    expect(exec2Output.actionsFailed).toBe(0);
  });

  it('4. Explicit after-midnight request ("Schedule 30 minutes at 12:30 AM tomorrow") is allowed', async () => {
    const goal = 'Schedule 30 minutes at 12:30 AM tomorrow.';
    const planRaw = await generatePlanTool.execute(
      {
        goal,
        date: '2026-10-05',
        constraints: ['only 30 minutes available', 'explicit time: 00:30'],
      },
      TEST_USER_ID,
    );
    const plan = JSON.parse(planRaw) as {
      changesRequired: Array<{ type: string; payload: { start: string } }>;
    };

    const eventAction = plan.changesRequired.find((c) => c.type === 'create_event');
    expect(eventAction).toBeDefined();
    const payload = eventAction?.payload;
    if (!payload) throw new Error('payload not found');

    const startTime = new Date(payload.start);
    const timeInZone = startTime.toLocaleTimeString('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(timeInZone).toBe('00:30');
  });

  it('5. Planner avoids overlapping existing evening events', async () => {
    // Create an evening dinner from 18:00 to 19:00
    const dinnerStart = getLocalDate(TARGET_DATE, '18:00:00', TIMEZONE);
    const dinnerEnd = getLocalDate(TARGET_DATE, '19:00:00', TIMEZONE);
    await prisma.calendarEvent.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Team Dinner',
        start: dinnerStart,
        end: dinnerEnd,
        type: 'personal',
      },
    });

    const planRaw = await generatePlanTool.execute(
      {
        goal: 'Schedule 1 hour tonight to prepare for demo',
        date: TARGET_DATE,
        constraints: ['only 60 minutes available', 'time window: tonight'],
      },
      TEST_USER_ID,
    );
    const plan = JSON.parse(planRaw) as {
      changesRequired: Array<{ type: string; payload: { start: string } }>;
    };

    // Check newly created event starts AFTER dinner (>= 19:00)
    const eventAction = plan.changesRequired.find((c) => c.type === 'create_event');
    expect(eventAction).toBeDefined();
    const payload = eventAction?.payload;
    if (!payload) throw new Error('payload not found');

    const newStart = new Date(payload.start);
    expect(newStart.getTime()).toBeGreaterThanOrEqual(dinnerEnd.getTime());
  });

  it('6. get_schedule retrieves evening events on local calendar day across timezones', async () => {
    const LA_USER_ID = 'cccccccc-0000-0000-0000-000000000003';
    const LA_TIMEZONE = 'America/Los_Angeles';
    const LA_DATE = '2026-10-19';

    await prisma.calendarEvent.deleteMany({ where: { userId: LA_USER_ID } });
    await prisma.user.upsert({
      where: { id: LA_USER_ID },
      create: {
        id: LA_USER_ID,
        email: 'la-user@lifeos.test',
        name: 'LA User',
        timezone: LA_TIMEZONE,
        demoMode: true,
      },
      update: { timezone: LA_TIMEZONE },
    });

    // Create 6:00 PM - 7:00 PM event on 2026-10-19 in America/Los_Angeles
    // UTC representation: 2026-10-20T01:00:00Z to 2026-10-20T02:00:00Z
    const start6pm = getLocalDate(LA_DATE, '18:00:00', LA_TIMEZONE);
    const end7pm = getLocalDate(LA_DATE, '19:00:00', LA_TIMEZONE);

    await prisma.calendarEvent.create({
      data: {
        userId: LA_USER_ID,
        title: 'Demo Practice',
        start: start6pm,
        end: end7pm,
        type: 'focus',
      },
    });

    // get_schedule for 2026-10-19 must retrieve this event, not 0 events
    const raw = await getScheduleTool.execute({ date: LA_DATE }, LA_USER_ID);
    const result = JSON.parse(raw) as {
      events: Array<{ id: string; title: string; start: string; end: string }>;
      totalEvents: number;
    };

    expect(result.totalEvents).toBe(1);
    expect(result.events[0]?.title).toBe('Demo Practice');
    expect(result.events[0]?.start).toBe(start6pm.toISOString());

    // Cleanup
    await prisma.calendarEvent.deleteMany({ where: { userId: LA_USER_ID } });
    await prisma.user.delete({ where: { id: LA_USER_ID } });
  });

  it('7. 90-minute replan request evaluates constraints, fills remaining budget, and states evaluation in summary', async () => {
    // Seed existing 60-minute Demo Practice event (18:00 - 19:00)
    const start6pm = getLocalDate(TARGET_DATE, '18:00:00', TIMEZONE);
    const end7pm = getLocalDate(TARGET_DATE, '19:00:00', TIMEZONE);

    await prisma.calendarEvent.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Demo Practice',
        start: start6pm,
        end: end7pm,
        type: 'focus',
      },
    });

    // Add multiple candidate tasks, including a short (<15m) task and demo prep tasks
    await prisma.task.createMany({
      data: [
        {
          userId: TEST_USER_ID,
          title: 'Quick 10m credential sync',
          priority: 'medium',
          estimatedMinutes: 10,
          status: 'todo',
        },
        {
          userId: TEST_USER_ID,
          title: 'Practice product demo flow',
          priority: 'high',
          estimatedMinutes: 30,
          status: 'todo',
        },
        {
          userId: TEST_USER_ID,
          title: 'Polish demo slide talking points',
          priority: 'urgent',
          estimatedMinutes: 45,
          status: 'todo',
        },
      ],
    });

    const replanRaw = await generatePlanTool.execute(
      {
        goal: "I only have 90 minutes tonight. Rebuild my plan for tomorrow's product demo.",
        date: TARGET_DATE,
        constraints: ['only 90 minutes available', 'time window: tonight'],
      },
      TEST_USER_ID,
    );

    const replanOutput = JSON.parse(replanRaw) as {
      plan: {
        id: string;
        summary: string;
        items: Array<{ title: string; durationMinutes: number; type: string }>;
      };
      reasoning: string;
      changesRequired: Array<{ type: string; payload: Record<string, unknown> }>;
    };

    // Demonstrates scheduling constraints were evaluated
    expect(replanOutput.plan.summary).toContain('90-minute budget evaluated');
    expect(replanOutput.reasoning).toContain('budget: 90 min');

    // Existing 60m Demo Practice preserved without duplicate creation
    const newDemoEvents = replanOutput.changesRequired.filter(
      (c) => c.type === 'create_event' && (c.payload['title'] as string)?.includes('Demo Practice'),
    );
    expect(newDemoEvents.length).toBe(0);

    // Remaining 30 minutes allocated to demo prep task (total planned prep work: 60 + 30 = 90 min)
    const totalPlannedMinutes = replanOutput.plan.items
      .filter((i) => i.type === 'task' || i.title.includes('Demo Practice'))
      .reduce((sum, item) => sum + item.durationMinutes, 0);
    expect(totalPlannedMinutes).toBe(90);

    // Task status change queued for scheduled task
    expect(replanOutput.changesRequired.some((c) => c.type === 'update_task')).toBe(true);

    // Execute plan and verify zero failures
    const execRaw = await executePlanTool.execute(
      { planId: replanOutput.plan.id, actions: replanOutput.changesRequired },
      TEST_USER_ID,
    );
    const execOutput = JSON.parse(execRaw) as { actionsFailed: number };
    expect(execOutput.actionsFailed).toBe(0);
  });

  it('7. "Move my practice session to 8 PM" moves Demo Practice to 8 PM and preserves open tasks without rescheduling them', async () => {
    // Baseline: Create a Demo Practice event at 6:00 AM
    const start6am = getLocalDate(TARGET_DATE, '06:00:00', TIMEZONE);
    const end630am = getLocalDate(TARGET_DATE, '06:30:00', TIMEZONE);
    const demoEvent = await prisma.calendarEvent.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Demo Practice',
        start: start6am,
        end: end630am,
        type: 'focus',
      },
    });

    // Create 3 open tasks
    await prisma.task.createMany({
      data: [
        { userId: TEST_USER_ID, title: 'Practice product demo', priority: 'high', status: 'todo' },
        { userId: TEST_USER_ID, title: 'Finish presentation slides', priority: 'medium', status: 'todo' },
        { userId: TEST_USER_ID, title: 'Draft talking points', priority: 'low', status: 'todo' },
      ],
    });

    const goal = 'Move my practice session to 8 PM.';
    const planRaw = await generatePlanTool.execute(
      {
        goal,
        date: TARGET_DATE,
        constraints: ['explicit time: 8 PM', 'targeted_reschedule: true'],
      },
      TEST_USER_ID,
    );

    const planOutput = JSON.parse(planRaw) as {
      plan: { id: string; items: Array<{ title: string; type: string; startTime: string }> };
      changesRequired: Array<{ type: string; payload: { id?: string; newStart?: string } }>;
    };

    // 1. Must ONLY contain move_event action
    expect(planOutput.changesRequired.length).toBe(1);
    expect(planOutput.changesRequired[0]?.type).toBe('move_event');
    expect(planOutput.changesRequired[0]?.payload.id).toBe(demoEvent.id);

    // 2. Start time must strictly be 8:00 PM (20:00) in user's timezone
    const newStartStr = planOutput.changesRequired[0]?.payload.newStart;
    expect(newStartStr).toBeDefined();
    if (!newStartStr) throw new Error('newStartStr is required');
    const newStartDate = new Date(newStartStr);
    const timeFormatted = newStartDate.toLocaleTimeString('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(timeFormatted).toBe('20:00');

    // 3. ZERO tasks in changesRequired (no update_task or create_task)
    const taskChanges = planOutput.changesRequired.filter((c) => c.type === 'update_task' || c.type === 'create_task');
    expect(taskChanges.length).toBe(0);

    // 4. Execute the targeted move
    const execRaw = await executePlanTool.execute(
      { planId: planOutput.plan.id, actions: planOutput.changesRequired },
      TEST_USER_ID,
    );
    const execOutput = JSON.parse(execRaw) as { actionsExecuted: number; actionsFailed: number };
    expect(execOutput.actionsExecuted).toBe(1);
    expect(execOutput.actionsFailed).toBe(0);

    // 5. Verify database: Demo Practice is at 20:00, all tasks still 'todo'
    const updatedEvent = await prisma.calendarEvent.findUnique({ where: { id: demoEvent.id } });
    expect(updatedEvent).toBeDefined();
    if (!updatedEvent) throw new Error('updatedEvent is required');
    expect(
      updatedEvent.start.toLocaleTimeString('en-US', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }),
    ).toBe('20:00');

    const tasksAfter = await prisma.task.findMany({ where: { userId: TEST_USER_ID } });
    for (const t of tasksAfter) {
      expect(t.status).toBe('todo'); // Untouched!
    }
  });

  it('8. Targeted move detects time conflicts honestly and does not silently substitute another time', async () => {
    // Create Demo Practice event
    const start6am = getLocalDate(TARGET_DATE, '06:00:00', TIMEZONE);
    const end630am = getLocalDate(TARGET_DATE, '06:30:00', TIMEZONE);
    await prisma.calendarEvent.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Demo Practice',
        start: start6am,
        end: end630am,
        type: 'focus',
      },
    });

    // Create an existing meeting at 8:00 PM - 9:00 PM (conflict slot)
    const start8pm = getLocalDate(TARGET_DATE, '20:00:00', TIMEZONE);
    const end9pm = getLocalDate(TARGET_DATE, '21:00:00', TIMEZONE);
    await prisma.calendarEvent.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Client Sync',
        start: start8pm,
        end: end9pm,
        type: 'meeting',
      },
    });

    const goal = 'Move my practice session to 8 PM.';
    const planRaw = await generatePlanTool.execute(
      {
        goal,
        date: TARGET_DATE,
        constraints: ['explicit time: 8 PM', 'targeted_reschedule: true'],
      },
      TEST_USER_ID,
    );

    const planOutput = JSON.parse(planRaw) as {
      plan: { summary: string };
      changesRequired: Array<unknown>;
    };

    // Must report conflict and queue 0 changes
    expect(planOutput.changesRequired.length).toBe(0);
    expect(planOutput.plan.summary).toContain('conflicts with existing event "Client Sync"');
  });

  it('9. Targeted move reports target not found without modifying database when session does not exist', async () => {
    const goal = 'Move my yoga session to 8 PM.';
    const planRaw = await generatePlanTool.execute(
      {
        goal,
        date: TARGET_DATE,
        constraints: ['explicit time: 8 PM', 'targeted_reschedule: true'],
      },
      TEST_USER_ID,
    );

    const planOutput = JSON.parse(planRaw) as {
      plan: { summary: string };
      changesRequired: Array<unknown>;
    };

    expect(planOutput.changesRequired.length).toBe(0);
    expect(planOutput.plan.summary).toContain('No calendar event matching');
  });
});
