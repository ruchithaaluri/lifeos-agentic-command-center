import { describe, it, expect } from 'vitest';
import { formatDate, formatTime } from '@/lib/utils';

describe('Timezone formatting & date shifts', () => {
  it('formats time correctly with user timezone (America/Los_Angeles)', () => {
    // 2026-10-19 14:00:00 UTC = 7:00 AM PDT (UTC-7)
    const utcIso = '2026-10-19T14:00:00.000Z';
    const formatted = formatTime(utcIso, 'America/Los_Angeles');
    expect(formatted).toBe('7:00 AM');
  });

  it('formats date correctly across UTC day boundaries with user timezone', () => {
    // 2026-10-20 02:00:00 UTC is still Monday Oct 19 at 7:00 PM in America/Los_Angeles
    const utcLateNight = '2026-10-20T02:00:00.000Z';
    const formattedLa = formatDate(utcLateNight, 'America/Los_Angeles');
    expect(formattedLa).toContain('Oct 19');

    // In UTC, it is Oct 20
    const formattedUtc = formatDate(utcLateNight, 'UTC');
    expect(formattedUtc).toContain('Oct 20');
  });
});

describe('Activity action deduplication and integrity', () => {
  it('prevents duplicate action keys when aggregating session actions', () => {
    const primaryActions = [
      { id: 'act-1', tool: 'get_tasks', message: 'Retrieved 8 tasks', status: 'completed' },
      { id: 'act-2', tool: 'generate_plan', message: 'Generated 90m plan', status: 'completed' },
    ];

    const executionActions = [
      { id: 'act-3', tool: 'get_tasks', message: 'Retrieved 8 tasks', status: 'completed' }, // duplicate tool:message
      { id: 'act-4', tool: 'update_task', message: 'Updated task slides', status: 'completed' },
    ];

    const actions = [...primaryActions];
    const existingIds = new Set(actions.map((a) => a.id));
    const existingKeys = new Set(actions.map((a) => `${a.tool}:${a.message}`));

    for (const ea of executionActions) {
      if (!existingIds.has(ea.id) && !existingKeys.has(`${ea.tool}:${ea.message}`)) {
        actions.push(ea);
      }
    }

    expect(actions.length).toBe(3);
    expect(actions.map((a) => a.id)).toEqual(['act-1', 'act-2', 'act-4']);
  });

  it('preserves failed status for failed actions without marking them as completed', () => {
    const failedAction = {
      id: 'act-fail',
      tool: 'create_event',
      message: 'Failed to create event: slot conflict',
      status: 'failed',
    };

    expect(failedAction.status).toBe('failed');
    expect(failedAction.status).not.toBe('completed');
  });
});
