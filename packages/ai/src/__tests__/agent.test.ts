// ============================================================
// Agent Orchestrator Tests
// Tests intent parsing, context gathering, and the full
// agentic loop using a mock MCP caller (no real server needed).
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../agent.js';
import type { MCPToolCall, MCPToolResult, StreamCallback } from '../agent.js';
import type { AgentStreamEvent } from '@lifeos/shared';

// ── Mock MCP caller ────────────────────────────────────────────────────────

function makeMockCaller(
  overrides: Record<string, Partial<MCPToolResult>> = {},
): (call: MCPToolCall) => Promise<MCPToolResult> {
  const defaults: Record<string, MCPToolResult> = {
    get_tasks: {
      tool: 'get_tasks',
      success: true,
      data: {
        tasks: [
          { id: 'task-1', title: 'Finish slides', priority: 'urgent', status: 'in_progress' },
        ],
        total: 1,
        hasMore: false,
      },
    },
    get_schedule: {
      tool: 'get_schedule',
      success: true,
      data: {
        events: [
          {
            id: 'evt-1',
            title: 'Product Demo',
            start: new Date(Date.now() + 86400000).toISOString(),
            end: new Date(Date.now() + 86400000 + 3600000).toISOString(),
            type: 'meeting',
          },
        ],
        totalEvents: 1,
        conflicts: [],
      },
    },
    get_projects: {
      tool: 'get_projects',
      success: true,
      data: { projects: [{ id: 'proj-1', name: 'Product Launch', color: '#3B82F6' }], total: 1 },
    },
    analyze_day: {
      tool: 'analyze_day',
      success: true,
      data: {
        date: new Date().toISOString().slice(0, 10),
        totalTasks: 1,
        urgentTasks: 1,
        overdueCount: 0,
        conflicts: [],
        recommendations: ['Start with slides'],
        focusScore: 72,
      },
    },
    generate_plan: {
      tool: 'generate_plan',
      success: true,
      data: {
        plan: {
          id: 'plan-001',
          goal: 'Prepare for demo',
          items: [
            {
              id: 'item-1',
              type: 'task',
              title: 'Finish slides',
              startTime: new Date().toISOString(),
              endTime: new Date(Date.now() + 5400000).toISOString(),
              durationMinutes: 90,
              priority: 'urgent',
              status: 'planned',
            },
          ],
          summary: 'Focus on slides then talking points.',
          generatedAt: new Date().toISOString(),
          validForDate: new Date().toISOString().slice(0, 10),
        },
        reasoning: 'Prioritised urgent tasks first.',
        changesRequired: [
          {
            type: 'update_task',
            description: 'Mark slides in_progress',
            payload: { id: 'task-1', status: 'in_progress' },
          },
        ],
      },
    },
    execute_plan: {
      tool: 'execute_plan',
      success: true,
      data: {
        sessionId: 'plan-001',
        actionsExecuted: 1,
        actionsSkipped: 0,
        actionsFailed: 0,
        results: [{ type: 'update_task', status: 'success', message: 'Updated task' }],
        summary: 'Executed 1 action.',
      },
    },
  };

  return (call: MCPToolCall): Promise<MCPToolResult> => {
    const override = overrides[call.tool];
    const base = defaults[call.tool] ?? { tool: call.tool, success: true, data: {} };
    return Promise.resolve({ ...base, ...override });
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AgentOrchestrator', () => {
  let events: AgentStreamEvent[];
  let onStream: StreamCallback;

  beforeEach(() => {
    events = [];
    onStream = (event) => {
      events.push(event);
    };
  });

  it('constructs without throwing', () => {
    expect(
      () =>
        new AgentOrchestrator({
          callTool: makeMockCaller(),
          onStream,
        }),
    ).not.toThrow();
  });

  it('emits action_start and action_complete events for tool calls', async () => {
    const orchestrator = new AgentOrchestrator({
      callTool: makeMockCaller(),
      onStream,
    });
    await orchestrator.run('Prepare for demo', 'session-test-1', 'user-1');

    const startEvents = events.filter((e) => e.type === 'action_start');
    const completeEvents = events.filter((e) => e.type === 'action_complete');

    expect(startEvents.length).toBeGreaterThan(0);
    expect(completeEvents.length).toBeGreaterThan(0);
  });

  it('emits plan_ready event with the plan', async () => {
    const orchestrator = new AgentOrchestrator({
      callTool: makeMockCaller(),
      onStream,
    });
    await orchestrator.run('Prepare for demo', 'session-test-2', 'user-1');

    const planEvent = events.find((e) => e.type === 'plan_ready');
    expect(planEvent).toBeDefined();
    if (planEvent?.type === 'plan_ready') {
      expect(planEvent.plan.id).toBe('plan-001');
      expect(planEvent.plan.goal).toBe('Prepare for demo');
    }
  });

  it('emits session_complete at the end', async () => {
    const orchestrator = new AgentOrchestrator({
      callTool: makeMockCaller(),
      onStream,
    });
    await orchestrator.run('Prepare for demo', 'session-test-3', 'user-1');

    const completeEvent = events.find((e) => e.type === 'session_complete');
    expect(completeEvent).toBeDefined();
    if (completeEvent?.type === 'session_complete') {
      expect(completeEvent.summary).toBeTruthy();
    }
  });

  it('calls get_tasks and get_schedule during context gathering', async () => {
    const calledTools: string[] = [];
    const trackingCaller = async (call: MCPToolCall): Promise<MCPToolResult> => {
      calledTools.push(call.tool);
      return makeMockCaller()(call);
    };

    const orchestrator = new AgentOrchestrator({
      callTool: trackingCaller,
      onStream,
    });
    await orchestrator.run('What should I do today?', 'session-test-4', 'user-1');

    expect(calledTools).toContain('get_tasks');
    expect(calledTools).toContain('get_schedule');
    expect(calledTools).toContain('analyze_day');
    expect(calledTools).toContain('generate_plan');
    expect(calledTools).toContain('execute_plan');
  });

  it('emits action_failed when a tool fails', async () => {
    const failingCaller = makeMockCaller({
      get_tasks: { tool: 'get_tasks', success: false, error: 'DB connection error' },
    });
    const orchestrator = new AgentOrchestrator({
      callTool: failingCaller,
      onStream,
    });
    await orchestrator.run('Check my tasks', 'session-test-5', 'user-1');

    const failedEvent = events.find((e) => e.type === 'action_failed' && e.tool === 'get_tasks');
    expect(failedEvent).toBeDefined();
  });

  it('throws ToolExecutionError when generate_plan fails', async () => {
    const failingCaller = makeMockCaller({
      generate_plan: { tool: 'generate_plan', success: false, error: 'LLM unavailable' },
    });
    const orchestrator = new AgentOrchestrator({ callTool: failingCaller, onStream });

    await expect(orchestrator.run('Plan my day', 'session-test-6', 'user-1')).rejects.toThrow();
  });

  it('handles empty changesRequired without calling execute_plan', async () => {
    const calledTools: string[] = [];
    const noActionsCaller = makeMockCaller({
      generate_plan: {
        tool: 'generate_plan',
        success: true,
        data: {
          plan: {
            id: 'plan-empty',
            goal: 'Nothing to do',
            items: [],
            summary: 'No changes needed.',
            generatedAt: new Date().toISOString(),
            validForDate: new Date().toISOString().slice(0, 10),
          },
          reasoning: 'All good.',
          changesRequired: [],
        },
      },
    });

    const trackingCaller = async (call: MCPToolCall): Promise<MCPToolResult> => {
      calledTools.push(call.tool);
      return noActionsCaller(call);
    };

    const orchestrator = new AgentOrchestrator({ callTool: trackingCaller, onStream });
    const result = await orchestrator.run('Nothing to do', 'session-test-7', 'user-1');

    expect(calledTools).not.toContain('execute_plan');
    expect(result.execution.actionsExecuted).toBe(0);
  });

  it('session ID propagates to all emitted events', async () => {
    const SESSION_ID = 'session-propagation-test';
    const orchestrator = new AgentOrchestrator({
      callTool: makeMockCaller(),
      onStream,
    });
    await orchestrator.run('Demo prep', SESSION_ID, 'user-1');

    const eventsWithWrongId = events.filter((e) => 'sessionId' in e && e.sessionId !== SESSION_ID);
    expect(eventsWithWrongId).toHaveLength(0);
  });
});

// ── MCPClient unit tests ───────────────────────────────────────────────────

describe('MCPClient', () => {
  it('can be imported and constructed', async () => {
    const { MCPClient } = await import('../mcp-client.js');
    const client = new MCPClient({ serverUrl: 'http://localhost:3001', secret: 'test' });
    expect(client).toBeDefined();
  });

  it('ping returns false when server is not running', async () => {
    const { MCPClient } = await import('../mcp-client.js');
    const client = new MCPClient({ serverUrl: 'http://localhost:19999', secret: 'test' });
    const result = await client.ping();
    expect(result).toBe(false);
  });
});

// ── Provider factory ───────────────────────────────────────────────────────

describe('AI provider factory', () => {
  it('throws for unsupported provider', async () => {
    const { createAIProvider } = await import('../factory.js');
    expect(() => createAIProvider({ provider: 'gemini', apiKey: 'key' })).toThrow(
      /Unsupported AI provider/i,
    );
  });

  it('creates an OpenAI provider for "openai"', async () => {
    const { createAIProvider } = await import('../factory.js');
    const provider = createAIProvider({ provider: 'openai', apiKey: 'sk-test' });
    expect(provider.name).toBe('openai');
  });

  it('creates an Anthropic provider for "anthropic"', async () => {
    const { createAIProvider } = await import('../factory.js');
    const provider = createAIProvider({ provider: 'anthropic', apiKey: 'sk-test' });
    expect(provider.name).toBe('anthropic');
  });
});
