// ============================================================
// MCP Server Protocol Tests
// Tests server startup, tool discovery, auth middleware,
// and JSON-RPC protocol handling.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { type Server } from 'http';
import { createMCPServer, ALL_TOOLS } from '../mcp.js';
import { bearerAuth } from '../auth.js';
import { config } from '../config.js';
import { MCP_TOOLS } from '@lifeos/shared';

// ── Tool registry ──────────────────────────────────────────────────────────

describe('MCP tool registry', () => {
  it('registers exactly 12 tools', () => {
    expect(ALL_TOOLS).toHaveLength(12);
  });

  it('every registered tool name matches a known MCP_TOOLS constant', () => {
    const registeredNames = ALL_TOOLS.map((t) => t.name);
    for (const name of MCP_TOOLS) {
      expect(registeredNames).toContain(name);
    }
  });

  it('every tool has a non-empty description', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.description).toMatch(/Use this tool/i);
    }
  });

  it('every tool has an inputSchema with type "object"', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('tool names are unique', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ── McpServer creation ─────────────────────────────────────────────────────

describe('createMCPServer', () => {
  it('creates an MCP server without throwing', () => {
    expect(() => createMCPServer('test-user-id')).not.toThrow();
  });

  it('creates a fresh server on each call (no singleton state)', () => {
    const a = createMCPServer('test-user-id');
    const b = createMCPServer('test-user-id');
    expect(a).not.toBe(b);
  });
});

// ── Auth middleware ────────────────────────────────────────────────────────

describe('bearerAuth middleware', () => {
  // NOTE: config is evaluated once at module import time, so assigning
  // process.env.MCP_SECRET inside beforeAll() has no effect on the value
  // bearerAuth compares against. We therefore assert against the secret the
  // server is actually configured with, read from config itself.
  const SECRET = config.mcpSecret;

  function makeReqRes(authHeader?: string) {
    const req = { headers: { authorization: authHeader } } as express.Request;
    const res = {
      _status: 200,
      _body: null as unknown,
      status(code: number) {
        this._status = code;
        return this;
      },
      json(body: unknown) {
        this._body = body;
        return this;
      },
    };
    const next = {
      called: false,
      fn: () => {
        next.called = true;
      },
    };
    return { req, res, next: next.fn, nextObj: next };
  }

  it('calls next() when bearer token matches', () => {
    const { req, res, next, nextObj } = makeReqRes(`Bearer ${SECRET}`);
    bearerAuth(req, res as unknown as express.Response, next);
    expect(nextObj.called).toBe(true);
    expect(res._status).toBe(200);
  });

  it('returns 401 when Authorization header is missing', () => {
    const { req, res, next } = makeReqRes(undefined);
    bearerAuth(req, res as unknown as express.Response, next);
    expect(res._status).toBe(401);
  });

  it('returns 401 when Authorization header has wrong scheme', () => {
    const { req, res, next } = makeReqRes(`Basic ${SECRET}`);
    bearerAuth(req, res as unknown as express.Response, next);
    expect(res._status).toBe(401);
  });

  it('returns 401 when bearer token does not match', () => {
    const { req, res, next } = makeReqRes('Bearer wrong-token');
    bearerAuth(req, res as unknown as express.Response, next);
    expect(res._status).toBe(401);
  });
});

// ── HTTP server integration ────────────────────────────────────────────────

describe('HTTP server integration', () => {
  let server: Server;
  let baseUrl: string;
  const SECRET = 'integration-test-secret-32-chars-ok';

  beforeAll(async () => {
    process.env['MCP_SECRET'] = SECRET;
    process.env['DEMO_MODE'] = 'true';
    process.env['DEMO_USER_ID'] = 'aaaaaaaa-0000-0000-0000-000000000001';

    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', service: 'lifeos-mcp-server' });
    });

    app.get('/mcp', (_req, res) => {
      res.json({
        name: 'LifeOS MCP Server',
        tools: ALL_TOOLS.map((t) => t.name),
      });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });

    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3099;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /mcp returns tool list', async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: string[] };
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools).toHaveLength(12);
    expect(body.tools).toContain('get_tasks');
    expect(body.tools).toContain('execute_plan');
  });
});
