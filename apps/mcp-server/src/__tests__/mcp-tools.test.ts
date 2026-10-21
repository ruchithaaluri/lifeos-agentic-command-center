// ============================================================
// MCP Tool Tests
// Tests every tool's input validation, happy path, and error
// handling. DB tests are skipped when no DATABASE_URL is set.
// ============================================================

import { describe, it, expect } from 'vitest';
import { prisma } from '@lifeos/database';
import { getTasksTool } from '../tools/get-tasks.js';
import { createTaskTool } from '../tools/create-task.js';
import { updateTaskTool } from '../tools/update-task.js';
import { deleteTaskTool } from '../tools/delete-task.js';
import { getScheduleTool } from '../tools/get-schedule.js';
import { createEventTool } from '../tools/create-event.js';
import { moveEventTool } from '../tools/move-event.js';
import { getProjectsTool } from '../tools/get-projects.js';
import { searchContextTool } from '../tools/search-context.js';
import { analyzeDayTool } from '../tools/analyze-day.js';
import { generatePlanTool } from '../tools/generate-plan.js';
import { executePlanTool } from '../tools/execute-plan.js';

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const DB_AVAILABLE = !!process.env['DATABASE_URL'];

// ── DB helpers ─────────────────────────────────────────────────────────────

async function ensureUser() {
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, email: 'test@lifeos.test', name: 'Test User', demoMode: true },
    update: {},
  });
}

// ── Tool: get_tasks ────────────────────────────────────────────────────────

describe('get_tasks', () => {
  it('has correct name and description', () => {
    expect(getTasksTool.name).toBe('get_tasks');
    expect(getTasksTool.description).toContain('Use this tool');
    expect(getTasksTool.description.length).toBeGreaterThan(20);
  });

  it('defines an inputSchema with expected property types', () => {
    const schema = getTasksTool.inputSchema;
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(schema.properties?.status).toBeDefined();
    expect(schema.properties?.priority).toBeDefined();
  });

  it.skipIf(!DB_AVAILABLE)('returns empty task list for new user', async () => {
    await ensureUser();
    const result = JSON.parse(await getTasksTool.execute({}, USER_ID)) as {
      tasks: unknown[];
      total: number;
    };
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('rejects invalid status value', async () => {
    await expect(getTasksTool.execute({ status: 'invalid_status' }, USER_ID)).rejects.toThrow();
  });

  it('rejects invalid priority value', async () => {
    await expect(getTasksTool.execute({ priority: 'critical' }, USER_ID)).rejects.toThrow();
  });
});

// ── Tool: create_task ──────────────────────────────────────────────────────

describe('create_task', () => {
  it('has correct name', () => {
    expect(createTaskTool.name).toBe('create_task');
  });

  it('requires title in inputSchema', () => {
    expect(createTaskTool.inputSchema.required).toContain('title');
  });

  it('rejects empty input (missing title)', async () => {
    await expect(createTaskTool.execute({}, USER_ID)).rejects.toThrow();
  });

  it('rejects empty title', async () => {
    await expect(createTaskTool.execute({ title: '' }, USER_ID)).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('creates a task and returns it', async () => {
    await ensureUser();
    const raw = await createTaskTool.execute(
      { title: 'Test task from vitest', priority: 'high', estimatedMinutes: 30 },
      USER_ID,
    );
    const result = JSON.parse(raw) as { task: { id: string; title: string; priority: string } };
    expect(result.task.title).toBe('Test task from vitest');
    expect(result.task.priority).toBe('high');
    expect(result.task.id).toBeTruthy();
    // Cleanup
    await prisma.task.delete({ where: { id: result.task.id } });
  });
});

// ── Tool: update_task ──────────────────────────────────────────────────────

describe('update_task', () => {
  it('has correct name', () => {
    expect(updateTaskTool.name).toBe('update_task');
  });

  it('requires id in inputSchema', () => {
    expect(updateTaskTool.inputSchema.required).toContain('id');
  });

  it('rejects missing id', async () => {
    await expect(updateTaskTool.execute({ status: 'completed' }, USER_ID)).rejects.toThrow();
  });

  it('rejects non-UUID id', async () => {
    await expect(
      updateTaskTool.execute({ id: 'not-a-uuid', status: 'completed' }, USER_ID),
    ).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('updates task status and sets completedAt', async () => {
    await ensureUser();
    const created = await prisma.task.create({
      data: { userId: USER_ID, title: 'Update me', status: 'todo', priority: 'medium' },
    });
    const raw = await updateTaskTool.execute({ id: created.id, status: 'completed' }, USER_ID);
    const result = JSON.parse(raw) as { task: { status: string; completedAt: string | null } };
    expect(result.task.status).toBe('completed');
    expect(result.task.completedAt).not.toBeNull();
    await prisma.task.delete({ where: { id: created.id } });
  });

  it.skipIf(!DB_AVAILABLE)('returns not-found for wrong user', async () => {
    await ensureUser();
    const created = await prisma.task.create({
      data: { userId: USER_ID, title: 'Private task', status: 'todo', priority: 'low' },
    });
    await expect(
      updateTaskTool.execute({ id: created.id, status: 'in_progress' }, 'wrong-user-000'),
    ).rejects.toThrow();
    await prisma.task.delete({ where: { id: created.id } });
  });
});

// ── Tool: delete_task ──────────────────────────────────────────────────────

describe('delete_task', () => {
  it('has correct name', () => {
    expect(deleteTaskTool.name).toBe('delete_task');
  });

  it('rejects delete without confirm: true', async () => {
    await expect(
      deleteTaskTool.execute(
        { id: '00000000-0000-0000-0000-000000000001', confirm: false },
        USER_ID,
      ),
    ).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('soft-deletes a task (sets deletedAt)', async () => {
    await ensureUser();
    const created = await prisma.task.create({
      data: { userId: USER_ID, title: 'Delete me', status: 'todo', priority: 'low' },
    });
    const raw = await deleteTaskTool.execute({ id: created.id, confirm: true }, USER_ID);
    const result = JSON.parse(raw) as { id: string; message: string };
    expect(result.id).toBe(created.id);
    // Verify soft-deleted (deletedAt set, still in DB)
    const deleted = await prisma.task.findUnique({ where: { id: created.id } });
    expect(deleted?.deletedAt).not.toBeNull();
    // Hard cleanup
    await prisma.task.delete({ where: { id: created.id } });
  });
});

// ── Tool: get_schedule ─────────────────────────────────────────────────────

describe('get_schedule', () => {
  it('has correct name', () => {
    expect(getScheduleTool.name).toBe('get_schedule');
  });

  it('rejects invalid date format', async () => {
    // Zod validates 'date' must be a string.date() format
    await expect(getScheduleTool.execute({ date: 'not-a-date' }, USER_ID)).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('returns empty list for date with no events', async () => {
    await ensureUser();
    const raw = await getScheduleTool.execute({ date: '2099-01-01' }, USER_ID);
    const result = JSON.parse(raw) as { events: unknown[]; totalEvents: number };
    expect(result.events).toHaveLength(0);
    expect(result.totalEvents).toBe(0);
  });
});

// ── Tool: create_event ─────────────────────────────────────────────────────

describe('create_event', () => {
  it('has correct name', () => {
    expect(createEventTool.name).toBe('create_event');
  });

  it('requires title, start, end', () => {
    const required = createEventTool.inputSchema.required ?? [];
    expect(required).toContain('title');
    expect(required).toContain('start');
    expect(required).toContain('end');
  });

  it('rejects end before start', async () => {
    await expect(
      createEventTool.execute(
        {
          title: 'Bad event',
          start: '2026-09-25T10:00:00.000Z',
          end: '2026-09-25T09:00:00.000Z',
        },
        USER_ID,
      ),
    ).rejects.toThrow(/end time must be after/i);
  });

  it.skipIf(!DB_AVAILABLE)('creates an event and returns it', async () => {
    await ensureUser();
    const raw = await createEventTool.execute(
      {
        title: 'CI Test Meeting',
        start: '2099-01-15T09:00:00.000Z',
        end: '2099-01-15T10:00:00.000Z',
        type: 'meeting',
      },
      USER_ID,
    );
    const result = JSON.parse(raw) as { event: { id: string; title: string } };
    expect(result.event.title).toBe('CI Test Meeting');
    await prisma.calendarEvent.delete({ where: { id: result.event.id } });
  });
});

// ── Tool: move_event ───────────────────────────────────────────────────────

describe('move_event', () => {
  it('has correct name', () => {
    expect(moveEventTool.name).toBe('move_event');
  });

  it('requires id and newStart', () => {
    const required = moveEventTool.inputSchema.required ?? [];
    expect(required).toContain('id');
    expect(required).toContain('newStart');
  });

  it('rejects missing id', async () => {
    await expect(
      moveEventTool.execute({ newStart: '2099-01-15T11:00:00.000Z' }, USER_ID),
    ).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('moves event and preserves duration', async () => {
    await ensureUser();
    const event = await prisma.calendarEvent.create({
      data: {
        userId: USER_ID,
        title: 'Move me',
        start: new Date('2099-01-15T09:00:00.000Z'),
        end: new Date('2099-01-15T10:00:00.000Z'), // 60 min
        type: 'meeting',
      },
    });
    const raw = await moveEventTool.execute(
      { id: event.id, newStart: '2099-01-15T11:00:00.000Z' },
      USER_ID,
    );
    const result = JSON.parse(raw) as { event: { start: string; end: string } };
    const newStart = new Date(result.event.start);
    const newEnd = new Date(result.event.end);
    const durationMs = newEnd.getTime() - newStart.getTime();
    expect(durationMs).toBe(60 * 60 * 1000); // duration preserved
    expect(newStart.getUTCHours()).toBe(11);
    await prisma.calendarEvent.delete({ where: { id: event.id } });
  });
});

// ── Tool: get_projects ─────────────────────────────────────────────────────

describe('get_projects', () => {
  it('has correct name', () => {
    expect(getProjectsTool.name).toBe('get_projects');
  });

  it.skipIf(!DB_AVAILABLE)('returns projects with stats', async () => {
    await ensureUser();
    const raw = await getProjectsTool.execute({ includeStats: true }, USER_ID);
    const result = JSON.parse(raw) as { projects: unknown[]; total: number };
    expect(Array.isArray(result.projects)).toBe(true);
    expect(typeof result.total).toBe('number');
  });
});

// ── Tool: search_context ───────────────────────────────────────────────────

describe('search_context', () => {
  it('has correct name', () => {
    expect(searchContextTool.name).toBe('search_context');
  });

  it('requires query', () => {
    expect(searchContextTool.inputSchema.required).toContain('query');
  });

  it('rejects empty query', async () => {
    await expect(searchContextTool.execute({ query: '' }, USER_ID)).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('returns results array even with no matches', async () => {
    await ensureUser();
    const raw = await searchContextTool.execute({ query: 'xyzzy-nonexistent-term-99999' }, USER_ID);
    const result = JSON.parse(raw) as { results: unknown[]; total: number };
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.total).toBe(0);
  });
});

// ── Tool: analyze_day ─────────────────────────────────────────────────────

describe('analyze_day', () => {
  it('has correct name', () => {
    expect(analyzeDayTool.name).toBe('analyze_day');
  });

  it.skipIf(!DB_AVAILABLE)('returns valid AnalyzeDayOutput shape', async () => {
    await ensureUser();
    const raw = await analyzeDayTool.execute({ date: '2099-01-01' }, USER_ID);
    const result = JSON.parse(raw) as {
      date: string;
      totalTasks: number;
      focusScore: number;
      conflicts: unknown[];
      recommendations: string[];
    };
    expect(result.date).toBe('2099-01-01');
    expect(typeof result.totalTasks).toBe('number');
    expect(result.focusScore).toBeGreaterThanOrEqual(0);
    expect(result.focusScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.conflicts)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });
});

// ── Tool: generate_plan ────────────────────────────────────────────────────

describe('generate_plan', () => {
  it('has correct name', () => {
    expect(generatePlanTool.name).toBe('generate_plan');
  });

  it('requires goal', () => {
    expect(generatePlanTool.inputSchema.required).toContain('goal');
  });

  it('rejects empty goal', async () => {
    await expect(generatePlanTool.execute({ goal: '' }, USER_ID)).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('returns a valid plan structure without AI key', async () => {
    await ensureUser();
    const raw = await generatePlanTool.execute(
      { goal: 'Prepare for product demo', date: '2099-01-15' },
      USER_ID,
    );
    const result = JSON.parse(raw) as {
      plan: { id: string; items: unknown[]; goal: string };
      changesRequired: unknown[];
      reasoning: string;
    };
    expect(result.plan).toBeDefined();
    expect(result.plan.id).toBeTruthy();
    expect(Array.isArray(result.plan.items)).toBe(true);
    expect(result.plan.goal).toBe('Prepare for product demo');
    expect(Array.isArray(result.changesRequired)).toBe(true);
    expect(typeof result.reasoning).toBe('string');
  });
});

// ── Tool: execute_plan ─────────────────────────────────────────────────────

describe('execute_plan', () => {
  it('has correct name', () => {
    expect(executePlanTool.name).toBe('execute_plan');
  });

  it('requires planId and actions', () => {
    const required = executePlanTool.inputSchema.required ?? [];
    expect(required).toContain('planId');
    expect(required).toContain('actions');
  });

  it('rejects missing planId', async () => {
    await expect(executePlanTool.execute({ actions: [] }, USER_ID)).rejects.toThrow();
  });

  it.skipIf(!DB_AVAILABLE)('dry run returns skipped results without DB writes', async () => {
    await ensureUser();
    const planId = '00000000-0000-0000-9999-000000000001';
    const raw = await executePlanTool.execute(
      {
        planId,
        actions: [{ type: 'create_task', payload: { title: 'Dry run task', priority: 'medium' } }],
        dryRun: true,
      },
      USER_ID,
    );
    const result = JSON.parse(raw) as {
      actionsExecuted: number;
      actionsSkipped: number;
      results: Array<{ status: string }>;
    };
    expect(result.actionsExecuted).toBe(0);
    expect(result.actionsSkipped).toBe(1);
    expect(result.results[0]?.status).toBe('skipped');
    // Ensure nothing was written
    const tasks = await prisma.task.findMany({
      where: { userId: USER_ID, title: 'Dry run task' },
    });
    expect(tasks).toHaveLength(0);
  });

  it.skipIf(!DB_AVAILABLE)('creates tasks and events from plan actions', async () => {
    await ensureUser();
    const planId = '00000000-0000-0000-9999-000000000002';
    const raw = await executePlanTool.execute(
      {
        planId,
        actions: [
          { type: 'create_task', payload: { title: 'Execute plan task', priority: 'high' } },
          {
            type: 'create_event',
            payload: {
              title: 'Execute plan event',
              start: '2099-02-01T09:00:00.000Z',
              end: '2099-02-01T10:00:00.000Z',
              type: 'focus',
            },
          },
        ],
        dryRun: false,
      },
      USER_ID,
    );
    const result = JSON.parse(raw) as {
      actionsExecuted: number;
      actionsFailed: number;
      results: Array<{ status: string; id?: string }>;
    };
    expect(result.actionsExecuted).toBe(2);
    expect(result.actionsFailed).toBe(0);
    // Cleanup
    for (const r of result.results) {
      if (r.id) {
        await prisma.task.deleteMany({ where: { id: r.id } }).catch(() => null);
        await prisma.calendarEvent.deleteMany({ where: { id: r.id } }).catch(() => null);
      }
    }
  });
});

// ── Auth boundary ──────────────────────────────────────────────────────────

describe('auth boundary', () => {
  it.skipIf(!DB_AVAILABLE)("get_tasks never returns another user's tasks", async () => {
    await ensureUser();
    // Create a task for our test user
    const task = await prisma.task.create({
      data: { userId: USER_ID, title: 'Private to test user', status: 'todo', priority: 'low' },
    });
    // Query as a different user
    const raw = await getTasksTool.execute({}, 'different-user-id-000');
    const result = JSON.parse(raw) as { tasks: Array<{ id: string }> };
    const found = result.tasks.find((t) => t.id === task.id);
    expect(found).toBeUndefined();
    await prisma.task.delete({ where: { id: task.id } });
  });
});
