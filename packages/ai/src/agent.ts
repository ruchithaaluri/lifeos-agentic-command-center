// ============================================================
// LifeOS Agent Orchestrator
// Drives the agentic loop: parse intent → retrieve context →
// plan → execute → stream action events.
// ============================================================

import { randomUUID } from 'crypto';
import type { AIProvider } from './provider.js';
import { getAIProvider } from './factory.js';
import { AGENT_SYSTEM_PROMPT, INTENT_PARSE_PROMPT } from './prompts.js';
import type { AgentStreamEvent, GeneratePlanOutput, ExecutePlanOutput } from '@lifeos/shared';
import { ToolExecutionError } from '@lifeos/shared';

// ── MCP Tool Caller ───────────────────────────────────────────────────────

export interface MCPToolCall {
  tool: string;
  input: Record<string, unknown>;
}

export interface MCPToolResult {
  tool: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export type MCPCaller = (call: MCPToolCall) => Promise<MCPToolResult>;

// ── Stream Callback ───────────────────────────────────────────────────────

export type StreamCallback = (event: AgentStreamEvent) => void | Promise<void>;

// ── Intent Types ──────────────────────────────────────────────────────────

interface ParsedIntent {
  primary_intent: 'plan' | 'reschedule' | 'remind' | 'analyze' | 'status';
  /** Known scopes are enumerated in INTENT_PARSE_PROMPT, but the model may
   *  return any string (e.g. "next friday"), so this stays a plain string. */
  time_scope: string | null;
  key_entities: string[];
  constraints: string[];
  urgency: 'urgent' | 'normal' | 'low';
}

// ── Constraint Extraction (no-provider fallback) ─────────────────────────────

/**
 * Pull explicit time budgets out of the raw goal text.
 *
 * The planner (`generate_plan`) reads a budget such as "90 minutes" from the
 * `constraints` array and uses it to bound the schedule. When the AI provider
 * is unavailable the intent parser falls back to a static intent, and without
 * this the user's stated budget would be silently dropped: "I only have 90
 * minutes tonight" would be planned as a full workday.
 *
 * Emitted in the same phrasing the planner parses, so the constraint is
 * honoured by the rule-based planner exactly as it would be if the model had
 * returned it.
 */
export function extractGoalConstraints(goal: string): string[] {
  const constraints: string[] = [];

  // "90 minutes", "1.5 hours", "2 hrs", "45 min"
  const duration = goal.match(
    /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i,
  );
  if (duration?.[1] && duration[2]) {
    const amount = Number(duration[1]);
    const isHours = /^h/i.test(duration[2]);
    const minutes = isHours ? Math.round(amount * 60) : Math.round(amount);
    // Guard against "0 minutes" / "0 hours", which would produce an empty plan.
    if (minutes > 0) {
      constraints.push(`only ${minutes} minutes available`);
    }
  }

  // Explicit time constraint: e.g. "to 8 PM", "at 8:00 PM", "to 8pm", "for 3 PM"
  const timeMatch = goal.match(
    /\b(?:to|at|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
  );
  if (timeMatch?.[1]) {
    constraints.push(`explicit time: ${timeMatch[1].trim()}`);
  }

  // Targeted move / reschedule intent
  if (
    /\b(?:move|reschedule|shift|push)\b/i.test(goal) &&
    !/\b(?:replan|rebuild)\b/i.test(goal)
  ) {
    constraints.push('targeted_reschedule: true');
  }

  return constraints;
}

// ── Agent Orchestrator ────────────────────────────────────────────────────

export class AgentOrchestrator {
  private provider: AIProvider;
  private callTool: MCPCaller;
  private onStream: StreamCallback | undefined;

  constructor(opts: { provider?: AIProvider; callTool: MCPCaller; onStream?: StreamCallback }) {
    this.provider = opts.provider ?? getAIProvider();
    this.callTool = opts.callTool;
    this.onStream = opts.onStream;
  }

  // ── Main entry point ──────────────────────────────────────

  async run(
    goal: string,
    sessionId: string,
    userId: string,
  ): Promise<{ plan: GeneratePlanOutput; execution: ExecutePlanOutput }> {
    const parseActionId = randomUUID();
    const parseStart = Date.now();
    await this.emit({
      type: 'action_start',
      sessionId,
      actionId: parseActionId,
      tool: 'parse_intent',
      message: 'Understanding your request…',
      timestamp: new Date().toISOString(),
    });

    // Step 1: Parse intent
    const intent = await this.parseIntent(goal);
    await this.emit({
      type: 'action_complete',
      sessionId,
      actionId: parseActionId,
      tool: 'parse_intent',
      message: `Intent: ${intent.primary_intent} (${intent.time_scope})`,
      latencyMs: Date.now() - parseStart,
      timestamp: new Date().toISOString(),
    });

    // Step 2: Retrieve context in parallel
    const context = await this.gatherContext(intent, sessionId, userId);

    // Step 3: Generate plan
    const plan = await this.generatePlan(goal, intent, context, sessionId, userId);

    // Step 4: Execute plan
    const execution = await this.executePlan(plan, sessionId, userId);

    await this.emit({
      type: 'session_complete',
      sessionId,
      summary: execution.summary,
      actionsCount: execution.actionsExecuted,
      timestamp: new Date().toISOString(),
    });

    return { plan, execution };
  }

  // ── Parse Intent ──────────────────────────────────────────

  private async parseIntent(goal: string): Promise<ParsedIntent> {
    try {
      const result = await this.provider.complete(
        [
          { role: 'system', content: AGENT_SYSTEM_PROMPT },
          { role: 'user', content: INTENT_PARSE_PROMPT(goal) },
        ],
        { responseFormat: 'json_object', temperature: 0.1 },
      );
      const parsed = JSON.parse(result.content) as Partial<ParsedIntent>;
      const isMove =
        /\b(?:move|reschedule|shift|push)\b/i.test(goal) &&
        !/\b(?:replan|rebuild)\b/i.test(goal);

      return {
        primary_intent: isMove ? 'reschedule' : (parsed.primary_intent ?? 'plan'),
        time_scope: parsed.time_scope ?? 'today',
        key_entities: parsed.key_entities ?? [],
        // A model can return a malformed value here; generate_plan validates
        // `constraints` as string[] and would reject the whole call.
        constraints: Array.isArray(parsed.constraints) && parsed.constraints.length > 0
          ? Array.from(new Set([...parsed.constraints.filter((c: unknown): c is string => typeof c === 'string'), ...extractGoalConstraints(goal)]))
          : extractGoalConstraints(goal),
        urgency: parsed.urgency ?? 'normal',
      };
    } catch {
      // Fallback intent if parsing fails (no API key, provider error, or bad
      // JSON). Explicit time budgets and move intents stated by the user are still honoured —
      // see extractGoalConstraints for why this matters.
      const isMove =
        /\b(?:move|reschedule|shift|push)\b/i.test(goal) &&
        !/\b(?:replan|rebuild)\b/i.test(goal);

      return {
        primary_intent: isMove ? 'reschedule' : 'plan',
        time_scope: 'today',
        key_entities: [],
        constraints: extractGoalConstraints(goal),
        urgency: 'normal',
      };
    }
  }

  // ── Gather Context ────────────────────────────────────────

  private async gatherContext(
    intent: ParsedIntent,
    sessionId: string,
    _userId: string,
  ): Promise<Record<string, unknown>> {
    const context: Record<string, unknown> = {};

    const targetDate = this.resolveDate(intent.time_scope);

    // Retrieve tasks and schedule in parallel
    const actionId1 = randomUUID();
    const actionId2 = randomUUID();

    await Promise.all([
      this.emit({
        type: 'action_start',
        sessionId,
        actionId: actionId1,
        tool: 'get_tasks',
        message: 'Retrieving your tasks…',
        timestamp: new Date().toISOString(),
      }),
      this.emit({
        type: 'action_start',
        sessionId,
        actionId: actionId2,
        tool: 'get_schedule',
        message: 'Checking your calendar…',
        timestamp: new Date().toISOString(),
      }),
    ]);

    const tasksStart = Date.now();
    let tasksLatency = 0;
    const tasksPromise = this.callTool({
      tool: 'get_tasks',
      input: { limit: 30, includeCompleted: false },
    }).then((res) => {
      tasksLatency = Date.now() - tasksStart;
      return res;
    });

    const scheduleStart = Date.now();
    let scheduleLatency = 0;
    const schedulePromise = this.callTool({
      tool: 'get_schedule',
      input: { date: targetDate },
    }).then((res) => {
      scheduleLatency = Date.now() - scheduleStart;
      return res;
    });

    const [tasksResult, scheduleResult] = await Promise.all([tasksPromise, schedulePromise]);

    if (tasksResult.success) {
      context['tasks'] = tasksResult.data;
      const total = (tasksResult.data?.['total'] as number | undefined) ?? 0;
      await this.emit({
        type: 'action_complete',
        sessionId,
        actionId: actionId1,
        tool: 'get_tasks',
        message: `Found ${total} open tasks`,
        latencyMs: tasksLatency,
        timestamp: new Date().toISOString(),
      });
    } else {
      await this.emit({
        type: 'action_failed',
        sessionId,
        actionId: actionId1,
        tool: 'get_tasks',
        message: "Couldn't retrieve tasks",
        error: tasksResult.error ?? 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }

    if (scheduleResult.success) {
      context['schedule'] = scheduleResult.data;
      const totalEvents = (scheduleResult.data?.['totalEvents'] as number | undefined) ?? 0;
      await this.emit({
        type: 'action_complete',
        sessionId,
        actionId: actionId2,
        tool: 'get_schedule',
        message: `Found ${totalEvents} calendar events`,
        latencyMs: scheduleLatency,
        timestamp: new Date().toISOString(),
      });
    } else {
      await this.emit({
        type: 'action_failed',
        sessionId,
        actionId: actionId2,
        tool: 'get_schedule',
        message: "Couldn't retrieve schedule",
        error: scheduleResult.error ?? 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }

    // Analyze the day
    const analyzeId = randomUUID();
    await this.emit({
      type: 'action_start',
      sessionId,
      actionId: analyzeId,
      tool: 'analyze_day',
      message: `Analyzing ${targetDate}…`,
      timestamp: new Date().toISOString(),
    });

    const analyzeStart = Date.now();
    const analyzeResult = await this.callTool({
      tool: 'analyze_day',
      input: { date: targetDate },
    });

    if (analyzeResult.success) {
      context['analysis'] = analyzeResult.data;
      const urgentTasks = (analyzeResult.data?.['urgentTasks'] as number | undefined) ?? 0;
      const conflicts = (analyzeResult.data?.['conflicts'] as unknown[])?.length ?? 0;
      await this.emit({
        type: 'action_complete',
        sessionId,
        actionId: analyzeId,
        tool: 'analyze_day',
        message: `${urgentTasks} urgent tasks${conflicts > 0 ? `, ${conflicts} conflict${conflicts > 1 ? 's' : ''} detected` : ''}`,
        latencyMs: Date.now() - analyzeStart,
        timestamp: new Date().toISOString(),
      });
    } else {
      await this.emit({
        type: 'action_failed',
        sessionId,
        actionId: analyzeId,
        tool: 'analyze_day',
        message: "Couldn't analyze day",
        error: analyzeResult.error ?? 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }

    // Get projects
    const projectsResult = await this.callTool({
      tool: 'get_projects',
      input: { includeStats: true },
    });
    if (projectsResult.success) {
      context['projects'] = projectsResult.data;
    }

    return context;
  }

  // ── Generate Plan ─────────────────────────────────────────

  private async generatePlan(
    goal: string,
    intent: ParsedIntent,
    context: Record<string, unknown>,
    sessionId: string,
    _userId: string,
  ): Promise<GeneratePlanOutput> {
    const actionId = randomUUID();
    await this.emit({
      type: 'action_start',
      sessionId,
      actionId,
      tool: 'generate_plan',
      message: 'Generating your plan…',
      timestamp: new Date().toISOString(),
    });

    const start = Date.now();
    const result = await this.callTool({
      tool: 'generate_plan',
      input: {
        goal,
        date: this.resolveDate(intent.time_scope),
        constraints: intent.constraints,
      },
    });

    if (!result.success) {
      await this.emit({
        type: 'action_failed',
        sessionId,
        actionId,
        tool: 'generate_plan',
        message: "Couldn't generate plan",
        error: result.error ?? 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      throw new ToolExecutionError('generate_plan', result.error ?? 'Plan generation failed');
    }

    const plan = result.data as unknown as GeneratePlanOutput;

    await this.emit({
      type: 'action_complete',
      sessionId,
      actionId,
      tool: 'generate_plan',
      message: `Plan ready — ${plan.plan?.items?.length ?? 0} blocks scheduled`,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });

    await this.emit({
      type: 'plan_ready',
      sessionId,
      plan: plan.plan,
      timestamp: new Date().toISOString(),
    });

    return plan;
  }

  // ── Execute Plan ──────────────────────────────────────────

  private async executePlan(
    plan: GeneratePlanOutput,
    sessionId: string,
    _userId: string,
  ): Promise<ExecutePlanOutput> {
    if (!plan.changesRequired?.length) {
      const summaryText =
        plan.plan?.summary && plan.reasoning
          ? `${plan.plan.summary} (${plan.reasoning})`
          : (plan.plan?.summary ??
            plan.reasoning ??
            'No changes needed — your existing schedule handles this.');
      return {
        sessionId,
        actionsExecuted: 0,
        actionsSkipped: 0,
        actionsFailed: 0,
        results: [],
        summary: summaryText,
      };
    }

    const actionId = randomUUID();
    await this.emit({
      type: 'action_start',
      sessionId,
      actionId,
      tool: 'execute_plan',
      message: `Executing ${plan.changesRequired.length} action${plan.changesRequired.length !== 1 ? 's' : ''}…`,
      timestamp: new Date().toISOString(),
    });

    const start = Date.now();
    const result = await this.callTool({
      tool: 'execute_plan',
      input: {
        planId: plan.plan.id,
        actions: plan.changesRequired,
        dryRun: false,
      },
    });

    if (!result.success) {
      await this.emit({
        type: 'action_failed',
        sessionId,
        actionId,
        tool: 'execute_plan',
        message: "Couldn't execute all plan actions",
        error: result.error ?? 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      throw new ToolExecutionError('execute_plan', result.error ?? 'Plan execution failed');
    }

    const execution = result.data as unknown as ExecutePlanOutput;

    await this.emit({
      type: 'action_complete',
      sessionId,
      actionId,
      tool: 'execute_plan',
      message: execution.summary,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });

    return execution;
  }

  // ── Helpers ───────────────────────────────────────────────

  private resolveDate(scope: string | null): string {
    const d = new Date();
    if (scope === 'tomorrow') {
      d.setDate(d.getDate() + 1);
    } else if (scope === 'this_week') {
      // Return today — the schedule tool will handle the range
    }
    return d.toISOString().slice(0, 10);
  }

  private async emit(event: AgentStreamEvent): Promise<void> {
    if (this.onStream) {
      await this.onStream(event);
    }
  }
}
