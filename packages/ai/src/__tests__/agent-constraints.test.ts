// ============================================================
// Constraint propagation (no AI provider configured)
// ============================================================
//
// Regression coverage: when no API key is configured the intent parser falls
// back to a static intent. A time budget stated in the request ("I only have
// 90 minutes tonight") must still reach generate_plan, otherwise the planner
// silently schedules a full workday against the user's stated constraint.

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator, extractGoalConstraints } from '../agent.js';
import type { AIProvider, CompletionResult } from '../provider.js';
import type { MCPToolCall, MCPToolResult } from '../agent.js';

/** Provider that always fails, simulating a missing/invalid AI_API_KEY. */
const deadProvider: AIProvider = {
  name: 'dead',
  complete(): Promise<CompletionResult> {
    return Promise.reject(new Error('no api key'));
  },
};

/** Runs the loop with a dead provider and returns the generate_plan input. */
async function generatePlanInputFor(goal: string): Promise<Record<string, unknown>> {
  const seen: MCPToolCall[] = [];
  const calls = (call: MCPToolCall): Promise<MCPToolResult> => {
    seen.push(call);
    const data: Record<string, unknown> =
      call.tool === 'generate_plan'
        ? {
            plan: {
              id: 'plan-1',
              goal,
              items: [],
              summary: '',
              generatedAt: new Date().toISOString(),
              validForDate: new Date().toISOString().slice(0, 10),
            },
            reasoning: '',
            changesRequired: [],
          }
        : {};
    return Promise.resolve({ tool: call.tool, success: true, data });
  };

  const orch = new AgentOrchestrator({ provider: deadProvider, callTool: calls });
  await orch.run(goal, '11111111-1111-1111-1111-111111111111', 'user-1');

  const gp = seen.find((c) => c.tool === 'generate_plan');
  expect(gp).toBeDefined();
  return gp?.input as Record<string, unknown>;
}

describe('extractGoalConstraints', () => {
  it('extracts a minute budget', () => {
    expect(extractGoalConstraints('I only have 90 minutes tonight')).toEqual([
      'only 90 minutes available',
    ]);
  });

  it('converts hour budgets to minutes', () => {
    expect(extractGoalConstraints('I have 2 hours to prepare')).toEqual([
      'only 120 minutes available',
    ]);
  });

  it('handles fractional hours', () => {
    expect(extractGoalConstraints('give me 1.5 hours')).toEqual(['only 90 minutes available']);
  });

  it('returns nothing when no budget is stated', () => {
    expect(extractGoalConstraints('Plan my day')).toEqual([]);
  });

  it('ignores a zero budget', () => {
    expect(extractGoalConstraints('I have 0 minutes')).toEqual([]);
  });

  it('extracts explicit target time and targeted_reschedule for move commands', () => {
    expect(extractGoalConstraints('Move my practice session to 8 PM.')).toEqual([
      'explicit time: 8 PM',
      'targeted_reschedule: true',
    ]);
  });
});

describe('AgentOrchestrator constraint propagation without an AI key', () => {
  it('passes a stated 90-minute budget through to generate_plan', async () => {
    const input = await generatePlanInputFor('I only have 90 minutes tonight. Replan it.');
    expect(input['constraints']).toEqual(['only 90 minutes available']);
  });

  it('passes a stated hour budget through to generate_plan', async () => {
    const input = await generatePlanInputFor('Replan with just 2 hours.');
    expect(input['constraints']).toEqual(['only 120 minutes available']);
  });

  it('sends an empty array when the request states no budget', async () => {
    const input = await generatePlanInputFor('Plan my day.');
    expect(input['constraints']).toEqual([]);
  });

  it('always sends constraints as an array so generate_plan validation passes', async () => {
    const input = await generatePlanInputFor('Plan my day.');
    expect(Array.isArray(input['constraints'])).toBe(true);
  });
});
