// ============================================================
// LifeOS MCP Server — Express HTTP entry point
// Transport: Streamable HTTP (POST /mcp)
// Auth: Bearer token on all routes
// ============================================================

import 'dotenv/config';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { config } from './config.js';
import { bearerAuth, resolveUserId } from './auth.js';
import { logger } from './logger.js';
import { createMCPServer } from './mcp.js';
import { prisma } from '@lifeos/database';

const app: Express = express();

// ── Security middleware ───────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: false, // MCP server — not serving HTML
  }),
);

app.use(
  cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down.' } },
});
app.use('/mcp', limiter);

app.use(express.json({ limit: '1mb' }));

// ── Request ID middleware ─────────────────────────────────────────────────

app.use((req, _res, next) => {
  (req as express.Request & { requestId: string }).requestId = randomUUID();
  next();
});

// ── Health check (no auth) ────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'lifeos-mcp-server',
    version: '0.1.0',
    mcpSpec: '2025-11-25',
    timestamp: new Date().toISOString(),
  });
});

// ── MCP endpoint (Streamable HTTP transport) ──────────────────────────────

app.post('/mcp', bearerAuth, (req, res, next) => {
  void (async () => {
    const requestId = (req as express.Request & { requestId: string }).requestId;
    const userId = resolveUserId(req);

    // No trustworthy identity (outside demo mode): refuse rather than fall
    // back to a shared account, which would leak another user's data.
    if (!userId) {
      logger.warn('mcp:identity-rejected', { requestId, demoMode: config.demoMode });
      if (!res.headersSent) {
        res.status(401).json({
          jsonrpc: '2.0',
          id: (req.body as { id?: unknown } | undefined)?.id ?? null,
          error: { code: -32001, message: 'Unauthorized' },
        });
      }
      return;
    }

    const body = req.body as { method?: unknown } | undefined;
    logger.info('mcp:request', { requestId, userId, method: body?.method });

    try {
      // userId is passed directly into the server so every tool call
      // uses the correct user — no transport monkey-patching needed.
      const server = createMCPServer(userId);

      // STATELESS mode.
      // We create a new McpServer + transport per request, so there is no
      // persistent session to track. Stateful mode (with a sessionIdGenerator)
      // requires the same transport instance to handle follow-up requests that
      // include the Mcp-Session-Id header — that cannot work when the transport
      // is discarded after each request.
      //
      // `sessionIdGenerator` is an optional property on the SDK options type, so
      // under `exactOptionalPropertyTypes` we must omit the key entirely rather
      // than passing an explicit `undefined`. Omitting it is exactly what the
      // SDK documents for stateless mode: `validateSession()` disables session
      // checking when `this.sessionIdGenerator === undefined`.
      const transport = new StreamableHTTPServerTransport();

      // Cast needed: StreamableHTTPServerTransport uses setter/getter for onclose
      // (type: (() => void) | undefined) but the Transport interface declares it
      // as an optional property ((): void). Under exactOptionalPropertyTypes the
      // two are not directly assignable. Runtime behaviour is correct.
      await server.connect(transport as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      logger.error('mcp:error', { requestId, error: message });

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: (req.body as { id?: unknown }).id ?? null,
          error: { code: -32603, message: 'Internal server error' },
        });
      }
    }
  })().catch(next);
});

// ── MCP GET — server info (no auth for discoverability) ──────────────────

app.get('/mcp', (_req, res) => {
  res.json({
    name: 'LifeOS MCP Server',
    version: '0.1.0',
    spec: '2025-11-25',
    transport: 'streamable-http',
    endpoint: '/mcp',
    auth: 'Bearer token required',
    tools: [
      'get_tasks',
      'create_task',
      'update_task',
      'delete_task',
      'get_schedule',
      'create_event',
      'move_event',
      'get_projects',
      'search_context',
      'analyze_day',
      'generate_plan',
      'execute_plan',
    ],
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info(`Received ${signal} — shutting down gracefully`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  logger.info('mcp-server:started', {
    port: config.port,
    env: config.nodeEnv,
    demoMode: config.demoMode,
    mcpEndpoint: `http://localhost:${config.port}/mcp`,
  });
  console.info(`\n🚀 LifeOS MCP Server running on http://localhost:${config.port}`);
  console.info(`   POST /mcp — Streamable HTTP (MCP spec 2025-11-25)`);
  console.info(`   GET  /health — Health check\n`);
});

export { app };
