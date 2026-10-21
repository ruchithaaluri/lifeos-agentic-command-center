// ============================================================
// Zustand Store Tests
// Verifies agent and dashboard store state transitions.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from '../store/agent';
import { useDashboardStore } from '../store/dashboard';
import type { Plan } from '@lifeos/shared';

// ── Agent Store ────────────────────────────────────────────────────────────

describe('useAgentStore', () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it('starts in idle state', () => {
    const state = useAgentStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.sessionId).toBeNull();
    expect(state.actions).toHaveLength(0);
    expect(state.currentPlan).toBeNull();
  });

  it('startSession sets running state', () => {
    useAgentStore.getState().startSession('session-001', 'Prepare for demo');
    const state = useAgentStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.sessionId).toBe('session-001');
    expect(state.goal).toBe('Prepare for demo');
    expect(state.actions).toHaveLength(0);
  });

  it('addAction appends to actions array', () => {
    useAgentStore.getState().startSession('s1', 'goal');
    useAgentStore.getState().addAction({
      id: 'action-1',
      tool: 'get_tasks',
      message: 'Retrieving tasks',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
    expect(useAgentStore.getState().actions).toHaveLength(1);
    expect(useAgentStore.getState().actions[0]?.tool).toBe('get_tasks');
  });

  it('updateAction updates matching action by id', () => {
    useAgentStore.getState().startSession('s1', 'goal');
    useAgentStore.getState().addAction({
      id: 'action-1',
      tool: 'get_tasks',
      message: 'Running…',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
    useAgentStore
      .getState()
      .updateAction('action-1', { status: 'success', message: 'Done', latencyMs: 142 });

    const action = useAgentStore.getState().actions[0];
    expect(action?.status).toBe('success');
    expect(action?.latencyMs).toBe(142);
  });

  it('updateAction does nothing for unknown id', () => {
    useAgentStore.getState().startSession('s1', 'goal');
    useAgentStore.getState().addAction({
      id: 'real-action',
      tool: 'get_tasks',
      message: 'ok',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
    useAgentStore.getState().updateAction('nonexistent', { status: 'failed' });
    // Original action untouched
    expect(useAgentStore.getState().actions[0]?.status).toBe('running');
  });

  it('setPlan stores the plan', () => {
    const mockPlan: Plan = {
      id: 'plan-001',
      goal: 'Demo prep',
      items: [],
      summary: 'Focus on slides',
      generatedAt: new Date().toISOString(),
      validForDate: '2026-09-25',
    };
    useAgentStore.getState().setPlan(mockPlan);
    expect(useAgentStore.getState().currentPlan?.id).toBe('plan-001');
  });

  it('completeSession sets isRunning=false and lastSummary', () => {
    useAgentStore.getState().startSession('s1', 'goal');
    useAgentStore.getState().completeSession('Executed 3 actions successfully.');
    const state = useAgentStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.lastSummary).toBe('Executed 3 actions successfully.');
  });

  it('failSession sets isRunning=false and error', () => {
    useAgentStore.getState().startSession('s1', 'goal');
    useAgentStore.getState().failSession('Connection lost.');
    const state = useAgentStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.error).toBe('Connection lost.');
  });

  it('reset clears all state', () => {
    useAgentStore.getState().startSession('s1', 'goal');
    useAgentStore
      .getState()
      .addAction({ id: 'a1', tool: 't', message: 'm', status: 'running', timestamp: '' });
    useAgentStore.getState().reset();
    const state = useAgentStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.isRunning).toBe(false);
    expect(state.actions).toHaveLength(0);
    expect(state.goal).toBeNull();
    expect(state.error).toBeNull();
  });
});

// ── Dashboard Store ────────────────────────────────────────────────────────

describe('useDashboardStore', () => {
  beforeEach(() => {
    const store = useDashboardStore.getState();
    store.setTasks([]);
    store.setEvents([]);
    store.setProjects([]);
    store.setLoading(false);
  });

  it('setTasks replaces the tasks array', () => {
    useDashboardStore.getState().setTasks([
      {
        id: 't1',
        title: 'Task 1',
        status: 'todo',
        priority: 'high',
        projectId: null,
        dueDate: null,
        estimatedMinutes: null,
        updatedAt: '',
      },
    ]);
    expect(useDashboardStore.getState().tasks).toHaveLength(1);
    expect(useDashboardStore.getState().tasks[0]?.title).toBe('Task 1');
  });

  it('setEvents replaces the events array', () => {
    useDashboardStore.getState().setEvents([
      {
        id: 'e1',
        title: 'Standup',
        start: '',
        end: '',
        type: 'meeting',
        location: null,
        projectId: null,
      },
    ]);
    expect(useDashboardStore.getState().events).toHaveLength(1);
  });

  it('setLoading toggles loading state', () => {
    useDashboardStore.getState().setLoading(true);
    expect(useDashboardStore.getState().isLoading).toBe(true);
    useDashboardStore.getState().setLoading(false);
    expect(useDashboardStore.getState().isLoading).toBe(false);
  });

  it('markRefreshed sets lastRefreshed to a recent timestamp', () => {
    const before = Date.now();
    useDashboardStore.getState().markRefreshed();
    const ts = useDashboardStore.getState().lastRefreshed;
    expect(ts).not.toBeNull();
    const after = Date.now();
    const tsMs = ts ? new Date(ts).getTime() : 0;
    expect(tsMs).toBeGreaterThanOrEqual(before);
    expect(tsMs).toBeLessThanOrEqual(after);
  });
});
