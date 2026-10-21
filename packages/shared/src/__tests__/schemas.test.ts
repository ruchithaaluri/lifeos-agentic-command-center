// ============================================================
// Shared Schema Tests
// Verifies Zod schemas accept valid inputs and reject invalid
// ones. No DB or network access needed.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  GetTasksInputSchema,
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  DeleteTaskInputSchema,
} from '../schemas/task.js';
import {
  CreateEventInputSchema,
  MoveEventInputSchema,
  GetScheduleInputSchema,
} from '../schemas/event.js';
import {
  GeneratePlanInputSchema,
  ExecutePlanInputSchema,
  SearchContextInputSchema,
} from '../schemas/agent.js';
import { TASK_STATUSES, TASK_PRIORITIES, EVENT_TYPES, MCP_TOOLS } from '../constants.js';
import { LifeOSError, ValidationError, NotFoundError, toUserFacingMessage } from '../errors.js';
import {
  today,
  tomorrow,
  addMinutes,
  durationMinutes,
  doIntervalsOverlap,
  truncate,
  groupBy,
} from '../utils.js';

// ── Constants ──────────────────────────────────────────────────────────────

describe('constants', () => {
  it('TASK_STATUSES contains expected values', () => {
    expect(TASK_STATUSES).toContain('todo');
    expect(TASK_STATUSES).toContain('in_progress');
    expect(TASK_STATUSES).toContain('completed');
    expect(TASK_STATUSES).toContain('cancelled');
  });

  it('TASK_PRIORITIES contains expected values', () => {
    expect(TASK_PRIORITIES).toContain('low');
    expect(TASK_PRIORITIES).toContain('medium');
    expect(TASK_PRIORITIES).toContain('high');
    expect(TASK_PRIORITIES).toContain('urgent');
  });

  it('MCP_TOOLS contains exactly 12 tools', () => {
    expect(MCP_TOOLS).toHaveLength(12);
  });

  it('MCP_TOOLS contains all required tool names', () => {
    expect(MCP_TOOLS).toContain('get_tasks');
    expect(MCP_TOOLS).toContain('create_task');
    expect(MCP_TOOLS).toContain('generate_plan');
    expect(MCP_TOOLS).toContain('execute_plan');
  });
});

// ── Task schemas ───────────────────────────────────────────────────────────

describe('GetTasksInputSchema', () => {
  it('accepts empty input', () => {
    expect(GetTasksInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid status filter', () => {
    expect(GetTasksInputSchema.safeParse({ status: 'todo' }).success).toBe(true);
    expect(GetTasksInputSchema.safeParse({ status: 'completed' }).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(GetTasksInputSchema.safeParse({ status: 'done' }).success).toBe(false);
  });

  it('accepts valid priority filter', () => {
    for (const p of TASK_PRIORITIES) {
      expect(GetTasksInputSchema.safeParse({ priority: p }).success).toBe(true);
    }
  });

  it('rejects invalid priority', () => {
    expect(GetTasksInputSchema.safeParse({ priority: 'critical' }).success).toBe(false);
  });

  it('accepts limit within range', () => {
    expect(GetTasksInputSchema.safeParse({ limit: 50 }).success).toBe(true);
  });

  it('rejects limit over 100', () => {
    expect(GetTasksInputSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe('CreateTaskInputSchema', () => {
  it('accepts minimal valid input', () => {
    expect(CreateTaskInputSchema.safeParse({ title: 'My task' }).success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(CreateTaskInputSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects title over 255 chars', () => {
    expect(CreateTaskInputSchema.safeParse({ title: 'x'.repeat(256) }).success).toBe(false);
  });

  it('accepts all priority values', () => {
    for (const p of TASK_PRIORITIES) {
      expect(CreateTaskInputSchema.safeParse({ title: 'Task', priority: p }).success).toBe(true);
    }
  });

  it('rejects negative estimatedMinutes', () => {
    expect(CreateTaskInputSchema.safeParse({ title: 'Task', estimatedMinutes: -1 }).success).toBe(
      false,
    );
  });
});

describe('UpdateTaskInputSchema', () => {
  const VALID_UUID = '00000000-0000-0000-0000-000000000001';

  it('accepts id with no other fields', () => {
    expect(UpdateTaskInputSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    expect(UpdateTaskInputSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts status update', () => {
    expect(UpdateTaskInputSchema.safeParse({ id: VALID_UUID, status: 'completed' }).success).toBe(
      true,
    );
  });
});

describe('DeleteTaskInputSchema', () => {
  const VALID_UUID = '00000000-0000-0000-0000-000000000001';

  it('accepts valid delete with confirm: true', () => {
    expect(DeleteTaskInputSchema.safeParse({ id: VALID_UUID, confirm: true }).success).toBe(true);
  });

  it('rejects confirm: false', () => {
    expect(DeleteTaskInputSchema.safeParse({ id: VALID_UUID, confirm: false }).success).toBe(false);
  });

  it('rejects missing confirm', () => {
    expect(DeleteTaskInputSchema.safeParse({ id: VALID_UUID }).success).toBe(false);
  });
});

// ── Event schemas ──────────────────────────────────────────────────────────

describe('CreateEventInputSchema', () => {
  const validEvent = {
    title: 'Team Meeting',
    start: '2026-09-25T09:00:00.000Z',
    end: '2026-09-25T10:00:00.000Z',
  };

  it('accepts valid event', () => {
    expect(CreateEventInputSchema.safeParse(validEvent).success).toBe(true);
  });

  it('rejects missing title', () => {
    const { title: _title, ...rest } = validEvent;
    expect(CreateEventInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing start', () => {
    const { start: _start, ...rest } = validEvent;
    expect(CreateEventInputSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts all valid event types', () => {
    for (const t of EVENT_TYPES) {
      expect(CreateEventInputSchema.safeParse({ ...validEvent, type: t }).success).toBe(true);
    }
  });

  it('rejects invalid event type', () => {
    expect(CreateEventInputSchema.safeParse({ ...validEvent, type: 'party' }).success).toBe(false);
  });
});

describe('MoveEventInputSchema', () => {
  const VALID_UUID = '00000000-0000-0000-0000-000000000001';

  it('accepts id + newStart only', () => {
    expect(
      MoveEventInputSchema.safeParse({
        id: VALID_UUID,
        newStart: '2026-09-25T11:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects missing newStart', () => {
    expect(MoveEventInputSchema.safeParse({ id: VALID_UUID }).success).toBe(false);
  });
});

describe('GetScheduleInputSchema', () => {
  it('accepts empty input (defaults to today)', () => {
    expect(GetScheduleInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid date string', () => {
    expect(GetScheduleInputSchema.safeParse({ date: '2026-09-25' }).success).toBe(true);
  });

  it('rejects invalid date format', () => {
    expect(GetScheduleInputSchema.safeParse({ date: '25/09/2026' }).success).toBe(false);
  });
});

// ── Agent schemas ──────────────────────────────────────────────────────────

describe('GeneratePlanInputSchema', () => {
  it('accepts minimal goal', () => {
    expect(GeneratePlanInputSchema.safeParse({ goal: 'Prepare for demo' }).success).toBe(true);
  });

  it('rejects empty goal', () => {
    expect(GeneratePlanInputSchema.safeParse({ goal: '' }).success).toBe(false);
  });

  it('accepts goal with constraints', () => {
    expect(
      GeneratePlanInputSchema.safeParse({
        goal: 'Demo prep',
        constraints: ['90 minutes only'],
        date: '2026-09-25',
      }).success,
    ).toBe(true);
  });
});

describe('ExecutePlanInputSchema', () => {
  it('accepts valid execute plan input', () => {
    expect(
      ExecutePlanInputSchema.safeParse({
        planId: '00000000-0000-0000-0000-000000000001',
        actions: [{ type: 'create_task', payload: { title: 'My task' } }],
      }).success,
    ).toBe(true);
  });

  it('rejects invalid action type', () => {
    expect(
      ExecutePlanInputSchema.safeParse({
        planId: '00000000-0000-0000-0000-000000000001',
        actions: [{ type: 'delete_everything', payload: {} }],
      }).success,
    ).toBe(false);
  });
});

describe('SearchContextInputSchema', () => {
  it('accepts valid query', () => {
    expect(SearchContextInputSchema.safeParse({ query: 'product demo' }).success).toBe(true);
  });

  it('rejects empty query', () => {
    expect(SearchContextInputSchema.safeParse({ query: '' }).success).toBe(false);
  });
});

// ── Error classes ──────────────────────────────────────────────────────────

describe('LifeOSError hierarchy', () => {
  it('ValidationError has code VALIDATION_ERROR and statusCode 400', () => {
    const err = new ValidationError('Bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad input');
  });

  it('NotFoundError has code NOT_FOUND and statusCode 404', () => {
    const err = new NotFoundError('Task', 'abc-123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('abc-123');
  });

  it('toUserFacingMessage returns safe messages', () => {
    expect(toUserFacingMessage(new ValidationError('Bad field'))).toBe('Bad field');
    expect(toUserFacingMessage(new NotFoundError('Task', 'x'))).toContain('not found');
    expect(toUserFacingMessage(new LifeOSError('INTERNAL_ERROR', 'secret stack trace'))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('toJSON never exposes internal details', () => {
    const err = new ValidationError('Bad input', { internalField: 'secret' });
    const json = err.toJSON();
    expect(JSON.stringify(json)).not.toContain('internalField');
    expect(JSON.stringify(json)).not.toContain('secret');
  });
});

// ── Utility functions ──────────────────────────────────────────────────────

describe('utility functions', () => {
  it('today() returns YYYY-MM-DD format', () => {
    const t = today();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(t)).toBe(true);
  });

  it('tomorrow() is one day after today', () => {
    const t = new Date(today());
    const tm = new Date(tomorrow());
    const diff = tm.getTime() - t.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it('addMinutes adds correct number of minutes', () => {
    const base = '2026-09-25T09:00:00.000Z';
    const result = addMinutes(base, 90);
    const diff = new Date(result).getTime() - new Date(base).getTime();
    expect(diff).toBe(90 * 60 * 1000);
  });

  it('durationMinutes computes correct duration', () => {
    const start = '2026-09-25T09:00:00.000Z';
    const end = '2026-09-25T10:30:00.000Z';
    expect(durationMinutes(start, end)).toBe(90);
  });

  it('doIntervalsOverlap returns true for overlapping intervals', () => {
    expect(
      doIntervalsOverlap(
        { start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T10:00:00.000Z' },
        { start: '2026-09-25T09:30:00.000Z', end: '2026-09-25T10:30:00.000Z' },
      ),
    ).toBe(true);
  });

  it('doIntervalsOverlap returns false for non-overlapping intervals', () => {
    expect(
      doIntervalsOverlap(
        { start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T10:00:00.000Z' },
        { start: '2026-09-25T10:00:00.000Z', end: '2026-09-25T11:00:00.000Z' },
      ),
    ).toBe(false);
  });

  it('truncate truncates long strings correctly', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
    expect(truncate('short', 10)).toBe('short');
  });

  it('groupBy groups items by key', () => {
    const items = [
      { priority: 'urgent', title: 'A' },
      { priority: 'high', title: 'B' },
      { priority: 'urgent', title: 'C' },
    ];
    const grouped = groupBy(items, (i) => i.priority);
    expect(grouped['urgent']).toHaveLength(2);
    expect(grouped['high']).toHaveLength(1);
  });
});
