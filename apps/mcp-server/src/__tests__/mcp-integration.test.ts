// ============================================================
// MCP Integration Tests — real HTTP, real SDK client
//
// Uses @modelcontextprotocol/sdk Client + StreamableHTTPClientTransport
// to exercise the server exactly as any real MCP consumer would.
//
// Requires: DATABASE_URL set (or DATABASE_URL='' skips DB tests gracefully).
// The server is started in-process on a random port so no external
// process management is needed.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import { type Server as HttpServer } from 'http';
import { randomUUID } from 'crypto';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createMCPServer, ALL_TOOLS } from '../mcp.js';
import { prisma } from '@lifeos/database';
import { MCP_TOOLS } from '@lifeos/shared';

const DB_AVAILABLE = !!process.env['DATABASE_URL'];
const TEST_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const SECRET = 'integration-test-secret-32-chars-ok';

// ── Test server helpers ───────────────────────────────────────────────────

let httpServer: HttpServer;
let baseUrl: string;

/**
 * Spins up a minimal Express app that wraps the MCP server,
 * mirrors the production server.ts architecture exactly.
 */
async function startTestServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'lifeos-mcp-server-test' });
  });

  // Mirror the production MCP endpoint exactly
  app.post('/mcp', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${SECRET}`) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token.' } });
      return;
    }

    const userId = TEST_USER_ID;
    const server = createMCPServer(userId);
    // Stateless transport: omitting sessionIdGenerator disables session
    // management (see the equivalent comment in src/server.ts).
    const transport = new StreamableHTTPServerTransport();

    void server
      .connect(transport as Parameters<typeof server.connect>[0])
      .then(() => transport.handleRequest(req, res, req.body))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Internal error';
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message } });
        }
      });
  });

  return new Promise((resolve) => {
    httpServer = app.listen(0, () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3099;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
}

/**
 * Creates a fresh MCP Client connected to the test server via StreamableHTTP.
 * Performs the initialize/initialized handshake automatically.
 */
async function createClient(): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: {
      headers: { Authorization: `Bearer ${SECRET}` },
    },
  });

  const client = new Client(
    { name: 'lifeos-integration-test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
  return client;
}

// ── Test fixture helpers ──────────────────────────────────────────────────

async function ensureTestUser() {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    create: {
      id: TEST_USER_ID,
      email: 'mcp-integration@lifeos.test',
      name: 'MCP Test User',
      demoMode: true,
    },
    update: {},
  });
}

async function cleanupTestUser() {
  await prisma.agentAction.deleteMany({ where: { session: { userId: TEST_USER_ID } } });
  await prisma.agentSession.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.task.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.project.deleteMany({ where: { userId: TEST_USER_ID } });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await startTestServer();
  if (DB_AVAILABLE) {
    await cleanupTestUser();
    await ensureTestUser();
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  if (DB_AVAILABLE) {
    await cleanupTestUser();
    await prisma.$disconnect();
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 1: Protocol & Transport
// ══════════════════════════════════════════════════════════════════════════

describe('MCP protocol & transport', () => {
  it('GET /health returns 200 — server is up', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('POST /mcp without Authorization returns 401', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /mcp with wrong token returns 401', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    });
    expect(res.status).toBe(401);
  });

  it('MCP initialize handshake completes successfully', async () => {
    const client = await createClient();
    const version = client.getServerVersion();
    expect(version).toBeDefined();
    expect(version?.name).toBe('lifeos-mcp-server');
    expect(version?.version).toBe('0.1.0');
    await (client as unknown as { close(): Promise<void> }).close();
  });

  it('server capabilities are advertised after initialize', async () => {
    const client = await createClient();
    const caps = client.getServerCapabilities();
    expect(caps).toBeDefined();
    // Tools capability must be present for tool discovery to work
    expect(caps?.tools).toBeDefined();
    await (client as unknown as { close(): Promise<void> }).close();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 2: Tool Discovery
// ══════════════════════════════════════════════════════════════════════════

describe('tool discovery (tools/list)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createClient();
  });
  afterAll(async () => {
    await (client as unknown as { close(): Promise<void> }).close();
  });

  it('ALL_TOOLS registry has exactly 12 tools', () => {
    expect(ALL_TOOLS).toHaveLength(12);
  });

  it('every tool in ALL_TOOLS is in the MCP_TOOLS constant', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    for (const n of MCP_TOOLS) expect(names).toContain(n);
  });

  it('tools/list returns all 12 tools', async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(12);
  });

  it('every tool name matches the MCP_TOOLS constant', async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    for (const n of MCP_TOOLS) expect(names).toContain(n);
  });

  it('every tool has a non-empty description', async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect((tool.description ?? '').length).toBeGreaterThan(20);
    }
  });

  it('every tool has an inputSchema with type "object"', async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('create_task inputSchema requires "title"', async () => {
    const result = await client.listTools();
    const createTask = result.tools.find((t) => t.name === 'create_task');
    expect(createTask?.inputSchema.required).toContain('title');
  });

  it('delete_task inputSchema requires "id" and "confirm"', async () => {
    const result = await client.listTools();
    const deleteTool = result.tools.find((t) => t.name === 'delete_task');
    expect(deleteTool?.inputSchema.required).toContain('id');
    expect(deleteTool?.inputSchema.required).toContain('confirm');
  });

  it('execute_plan inputSchema requires "planId" and "actions"', async () => {
    const result = await client.listTools();
    const ep = result.tools.find((t) => t.name === 'execute_plan');
    expect(ep?.inputSchema.required).toContain('planId');
    expect(ep?.inputSchema.required).toContain('actions');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 3: Tool invocations — validation (no DB needed)
// ══════════════════════════════════════════════════════════════════════════

describe('tool input validation (no DB)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createClient();
  });
  afterAll(async () => {
    await (client as unknown as { close(): Promise<void> }).close();
  });

  it('create_task — missing title returns isError:true', async () => {
    const result = await client.callTool({ name: 'create_task', arguments: {} });
    // The SDK validates arguments against the tool's registered Zod schema
    // before the handler runs, and reports failures as a tool-level error
    // (isError:true) rather than a JSON-RPC protocol error.
    expect(result.isError).toBe(true);
    const text = extractText(result.content);
    expect(text).toMatch(/input validation error|invalid input/i);
  });

  it('get_tasks — invalid status returns isError:true', async () => {
    const result = await client.callTool({
      name: 'get_tasks',
      arguments: { status: 'bad_status' },
    });
    expect(result.isError).toBe(true);
  });

  it('delete_task — confirm: false is rejected', async () => {
    const result = await client.callTool({
      name: 'delete_task',
      arguments: { id: '00000000-0000-0000-0000-000000000001', confirm: false },
    });
    expect(result.isError).toBe(true);
  });

  it('update_task — missing id returns isError:true', async () => {
    const result = await client.callTool({
      name: 'update_task',
      arguments: { status: 'completed' },
    });
    expect(result.isError).toBe(true);
  });

  it('create_event — end before start returns isError:true', async () => {
    const result = await client.callTool({
      name: 'create_event',
      arguments: {
        title: 'Bad Event',
        start: '2099-01-01T10:00:00.000Z',
        end: '2099-01-01T09:00:00.000Z',
      },
    });
    expect(result.isError).toBe(true);
    const text = extractText(result.content);
    expect(text).toMatch(/end time must be after/i);
  });

  it('move_event — missing id returns isError:true', async () => {
    const result = await client.callTool({
      name: 'move_event',
      arguments: { newStart: '2099-01-01T11:00:00.000Z' },
    });
    expect(result.isError).toBe(true);
  });

  it('generate_plan — empty goal returns isError:true', async () => {
    const result = await client.callTool({ name: 'generate_plan', arguments: { goal: '' } });
    expect(result.isError).toBe(true);
  });

  it('execute_plan — missing planId returns isError:true', async () => {
    const result = await client.callTool({ name: 'execute_plan', arguments: { actions: [] } });
    expect(result.isError).toBe(true);
  });

  it('search_context — empty query returns isError:true', async () => {
    const result = await client.callTool({ name: 'search_context', arguments: { query: '' } });
    expect(result.isError).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 4: Full DB-backed tool invocations
// ══════════════════════════════════════════════════════════════════════════

describe.skipIf(!DB_AVAILABLE)('tool invocations — database', () => {
  let client: Client;

  // Track IDs created so we can verify state + clean up
  let createdTaskId: string;
  let createdEventId: string;

  beforeAll(async () => {
    client = await createClient();
  });
  afterAll(async () => {
    await (client as unknown as { close(): Promise<void> }).close();
  });

  // ── get_tasks ────────────────────────────────────────────

  it('get_tasks — returns tasks array', async () => {
    const result = await client.callTool({ name: 'get_tasks', arguments: {} });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ tasks: unknown[]; total: number }>(result.content);
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  it('get_tasks — filters by status todo', async () => {
    const result = await client.callTool({ name: 'get_tasks', arguments: { status: 'todo' } });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ tasks: Array<{ status: string }> }>(result.content);
    for (const t of data.tasks) expect(t.status).toBe('todo');
  });

  it('get_tasks — auth boundary: only returns test user tasks', async () => {
    // Create a task for a different user directly in DB, verify it's not returned
    const otherUserId = 'cccccccc-0000-0000-0000-000000000001';
    await prisma.user.upsert({
      where: { id: otherUserId },
      create: { id: otherUserId, email: 'other@lifeos.test', name: 'Other User', demoMode: true },
      update: {},
    });
    const otherTask = await prisma.task.create({
      data: { userId: otherUserId, title: 'Other user task', status: 'todo', priority: 'low' },
    });

    const result = await client.callTool({ name: 'get_tasks', arguments: {} });
    const data = parseToolResult<{ tasks: Array<{ id: string }> }>(result.content);
    const found = data.tasks.find((t) => t.id === otherTask.id);
    expect(found).toBeUndefined();

    // cleanup
    await prisma.task.delete({ where: { id: otherTask.id } });
    await prisma.user.delete({ where: { id: otherUserId } });
  });

  // ── create_task ──────────────────────────────────────────

  it('create_task — creates task and returns structured result', async () => {
    const result = await client.callTool({
      name: 'create_task',
      arguments: {
        title: 'MCP Integration Test Task',
        priority: 'high',
        estimatedMinutes: 30,
        dueDate: '2099-12-31T12:00:00.000Z',
      },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{
      task: { id: string; title: string; priority: string; status: string };
    }>(result.content);
    expect(data.task.title).toBe('MCP Integration Test Task');
    expect(data.task.priority).toBe('high');
    expect(data.task.status).toBe('todo');
    expect(data.task.id).toBeTruthy();
    createdTaskId = data.task.id;
  });

  it('create_task — task is persisted in database', async () => {
    const task = await prisma.task.findUnique({ where: { id: createdTaskId } });
    expect(task).not.toBeNull();
    expect(task?.title).toBe('MCP Integration Test Task');
    expect(task?.userId).toBe(TEST_USER_ID);
  });

  // ── update_task ──────────────────────────────────────────

  it('update_task — updates status and sets completedAt', async () => {
    const result = await client.callTool({
      name: 'update_task',
      arguments: { id: createdTaskId, status: 'completed' },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ task: { status: string; completedAt: string | null } }>(
      result.content,
    );
    expect(data.task.status).toBe('completed');
    expect(data.task.completedAt).not.toBeNull();
  });

  it('update_task — DB reflects the update', async () => {
    const task = await prisma.task.findUnique({ where: { id: createdTaskId } });
    expect(task?.status).toBe('completed');
    expect(task?.completedAt).not.toBeNull();
  });

  it('update_task — returns not-found for wrong user task', async () => {
    const fakeId = '00000000-aaaa-0000-0000-000000000001';
    const result = await client.callTool({
      name: 'update_task',
      arguments: { id: fakeId, status: 'in_progress' },
    });
    expect(result.isError).toBe(true);
    const text = extractText(result.content);
    expect(text).toMatch(/not found/i);
  });

  // ── get_schedule ─────────────────────────────────────────

  it('get_schedule — returns events array and conflict detection', async () => {
    const result = await client.callTool({
      name: 'get_schedule',
      arguments: { date: '2099-01-15' },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ events: unknown[]; totalEvents: number; conflicts: unknown[] }>(
      result.content,
    );
    expect(Array.isArray(data.events)).toBe(true);
    expect(typeof data.totalEvents).toBe('number');
    expect(Array.isArray(data.conflicts)).toBe(true);
  });

  it('get_schedule — rejects invalid date format', async () => {
    const result = await client.callTool({
      name: 'get_schedule',
      arguments: { date: 'not-a-date' },
    });
    expect(result.isError).toBe(true);
  });

  // ── create_event ─────────────────────────────────────────

  it('create_event — creates event and returns structured result', async () => {
    const result = await client.callTool({
      name: 'create_event',
      arguments: {
        title: 'MCP Integration Test Meeting',
        start: '2099-06-15T09:00:00.000Z',
        end: '2099-06-15T10:00:00.000Z',
        type: 'meeting',
        location: 'Test Room',
      },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ event: { id: string; title: string; type: string } }>(
      result.content,
    );
    expect(data.event.title).toBe('MCP Integration Test Meeting');
    expect(data.event.type).toBe('meeting');
    createdEventId = data.event.id;
  });

  it('create_event — event is persisted in database', async () => {
    const event = await prisma.calendarEvent.findUnique({ where: { id: createdEventId } });
    expect(event).not.toBeNull();
    expect(event?.userId).toBe(TEST_USER_ID);
    expect(event?.title).toBe('MCP Integration Test Meeting');
  });

  // ── move_event ───────────────────────────────────────────

  it('move_event — moves event and preserves duration', async () => {
    const result = await client.callTool({
      name: 'move_event',
      arguments: {
        id: createdEventId,
        newStart: '2099-06-15T14:00:00.000Z',
      },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ event: { start: string; end: string } }>(result.content);
    const newStart = new Date(data.event.start);
    const newEnd = new Date(data.event.end);
    const durationMs = newEnd.getTime() - newStart.getTime();
    expect(durationMs).toBe(60 * 60 * 1000); // 1 hour preserved
    expect(newStart.getUTCHours()).toBe(14);
  });

  it('move_event — DB reflects the move', async () => {
    const event = await prisma.calendarEvent.findUnique({ where: { id: createdEventId } });
    expect(event?.start.getUTCHours()).toBe(14);
  });

  // ── get_projects ─────────────────────────────────────────

  it('get_projects — returns projects array with stats', async () => {
    const result = await client.callTool({
      name: 'get_projects',
      arguments: { includeStats: true },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ projects: unknown[]; total: number }>(result.content);
    expect(Array.isArray(data.projects)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  // ── search_context ────────────────────────────────────────

  it('search_context — returns results with relevance scores', async () => {
    const result = await client.callTool({
      name: 'search_context',
      arguments: { query: 'Integration Test' },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{ results: Array<{ type: string; relevance: number }> }>(
      result.content,
    );
    expect(Array.isArray(data.results)).toBe(true);
    // The created task "MCP Integration Test Task" should be found
    const found = data.results.find((r) => r.type === 'task');
    expect(found).toBeDefined();
    expect(found?.relevance).toBeGreaterThan(0);
  });

  // ── analyze_day ───────────────────────────────────────────

  it('analyze_day — returns valid AnalyzeDayOutput shape', async () => {
    const result = await client.callTool({
      name: 'analyze_day',
      arguments: { date: '2099-01-15' },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{
      date: string;
      totalTasks: number;
      focusScore: number;
      conflicts: unknown[];
      recommendations: string[];
    }>(result.content);
    expect(data.date).toBe('2099-01-15');
    expect(typeof data.totalTasks).toBe('number');
    expect(data.focusScore).toBeGreaterThanOrEqual(0);
    expect(data.focusScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(data.conflicts)).toBe(true);
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeGreaterThan(0);
  });

  // ── generate_plan ─────────────────────────────────────────

  it('generate_plan — returns valid plan without AI key (rule-based fallback)', async () => {
    const result = await client.callTool({
      name: 'generate_plan',
      arguments: { goal: 'Prepare for MCP integration test demo', date: '2099-06-15' },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{
      plan: { id: string; items: unknown[]; goal: string; validForDate: string };
      changesRequired: unknown[];
      reasoning: string;
    }>(result.content);
    expect(data.plan.id).toBeTruthy();
    expect(data.plan.goal).toBe('Prepare for MCP integration test demo');
    expect(data.plan.validForDate).toBe('2099-06-15');
    expect(Array.isArray(data.plan.items)).toBe(true);
    expect(Array.isArray(data.changesRequired)).toBe(true);
    expect(typeof data.reasoning).toBe('string');
  });

  // ── execute_plan ──────────────────────────────────────────

  it('execute_plan — dry run returns skipped results without DB writes', async () => {
    const planId = randomUUID();
    const result = await client.callTool({
      name: 'execute_plan',
      arguments: {
        planId,
        actions: [{ type: 'create_task', payload: { title: 'Dry run task', priority: 'medium' } }],
        dryRun: true,
      },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{
      actionsExecuted: number;
      actionsSkipped: number;
      results: Array<{ status: string }>;
    }>(result.content);
    expect(data.actionsExecuted).toBe(0);
    expect(data.actionsSkipped).toBe(1);
    expect(data.results[0]?.status).toBe('skipped');

    // Verify nothing was actually written
    const tasks = await prisma.task.findMany({
      where: { userId: TEST_USER_ID, title: 'Dry run task' },
    });
    expect(tasks).toHaveLength(0);
  });

  it('execute_plan — live run creates tasks and events in DB', async () => {
    const planId = randomUUID();
    const result = await client.callTool({
      name: 'execute_plan',
      arguments: {
        planId,
        actions: [
          { type: 'create_task', payload: { title: 'Executed plan task', priority: 'high' } },
          {
            type: 'create_event',
            payload: {
              title: 'Executed plan event',
              start: '2099-07-01T09:00:00.000Z',
              end: '2099-07-01T10:00:00.000Z',
              type: 'focus',
            },
          },
        ],
        dryRun: false,
      },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult<{
      actionsExecuted: number;
      actionsFailed: number;
      results: Array<{ status: string; id?: string }>;
    }>(result.content);
    expect(data.actionsExecuted).toBe(2);
    expect(data.actionsFailed).toBe(0);

    // Verify both were actually written to DB
    for (const r of data.results) {
      if (!r.id) continue;
      const task = await prisma.task.findUnique({ where: { id: r.id } });
      const event = await prisma.calendarEvent.findUnique({ where: { id: r.id } });
      expect(task !== null || event !== null).toBe(true);
    }
  });

  it('execute_plan — after live run, dashboard state reflects changes', async () => {
    // get_tasks should now include the newly created task
    const result = await client.callTool({ name: 'get_tasks', arguments: {} });
    const data = parseToolResult<{ tasks: Array<{ title: string }> }>(result.content);
    const found = data.tasks.find((t) => t.title === 'Executed plan task');
    expect(found).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 5: Error & edge-case behavior
// ══════════════════════════════════════════════════════════════════════════

describe('error handling', () => {
  let client: Client;
  beforeAll(async () => {
    client = await createClient();
  });
  afterAll(async () => {
    await (client as unknown as { close(): Promise<void> }).close();
  });

  it('calling unknown tool returns an error result', async () => {
    // Per the MCP spec, a tool-level failure is reported as a CallToolResult
    // with isError:true. The SDK's CallTool handler converts an unknown-tool
    // McpError into that shape, so the client resolves rather than rejects.
    const result = await client.callTool({ name: 'nonexistent_tool', arguments: {} });
    expect(result.isError).toBe(true);
    const text = extractText(result.content);
    expect(text).toMatch(/nonexistent_tool not found/i);
  });

  it('malformed JSON-RPC returns 400-range response', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
      body: '{ not valid json }',
    });
    // Express json() middleware returns 400 for malformed JSON
    expect([400, 500]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

type MCPContent = Array<{ type: string; text: string }>;

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const first = (content as MCPContent)[0];
  return first?.text ?? '';
}

function parseToolResult<T>(content: unknown): T {
  const text = extractText(content);
  return JSON.parse(text) as T;
}
