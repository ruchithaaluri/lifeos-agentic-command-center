// ============================================================
// MCPClient HTTP behaviour
// ============================================================
//
// Regression coverage for two real defects that made every agent → MCP tool
// call fail against a live server:
//
//   1. The client omitted the `Accept: application/json, text/event-stream`
//      header, so the Streamable HTTP server replied 406 Not Acceptable.
//   2. The client called response.json(), but that transport answers with an
//      SSE-framed body, so parsing threw even once the request was accepted.
//
// The official SDK client sets/handles both automatically, so the server-side
// integration tests did not cover this hand-rolled client.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MCPClient } from '../mcp-client.js';

const SECRET = 'test-secret-value-32-characters-long!!';

interface Received {
  accept: string | undefined;
  body: Record<string, unknown>;
}

/** Minimal MCP Streamable HTTP server: enforces Accept, replies with SSE. */
function startServer(
  respond: () => { payload: unknown } | null,
): Promise<{ server: Server; received: Received[]; url: string }> {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const parsed = (() => {
        try {
          return JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      received.push({ accept: req.headers.accept, body: parsed });

      const accept = req.headers.accept ?? '';
      if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
        res.writeHead(406, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Not Acceptable: Client must accept both' },
          }),
        );
        return;
      }

      const out = respond();
      if (!out) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Bad Request' } }));
        return;
      }
      // Default transport behaviour: SSE-framed response.
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, ...(out.payload as object) })}\n\n`,
      );
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, received, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('MCPClient.callTool', () => {
  let server: Server;
  let received: Received[];
  let url: string;

  beforeAll(async () => {
    const s = await startServer(() => ({
      payload: { result: { content: [{ type: 'text', text: JSON.stringify({ tasks: [] }) }] } },
    }));
    server = s.server;
    received = s.received;
    url = s.url;
  });

  afterAll(() => {
    server.close();
  });


describe('MCPClient.callTool error handling', () => {
  it('reports a JSON-RPC error as a failure', async () => {
    const s = await startServer(() => ({
      payload: { error: { code: -32602, message: 'Invalid arguments' } },
    }));
    const client = new MCPClient({ serverUrl: s.url, secret: SECRET });
    const result = await client.callTool({ tool: 'create_task', input: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid arguments');
    s.server.close();
  });

  it('reports an in-band tool error (isError) as a failure', async () => {
    const s = await startServer(() => ({
      payload: {
        result: {
          content: [{ type: 'text', text: 'Event end time must be after start time.' }],
          isError: true,
        },
      },
    }));
    const client = new MCPClient({ serverUrl: s.url, secret: SECRET });
    const result = await client.callTool({ tool: 'create_event', input: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('end time must be after start');
    s.server.close();
  });

  it('is not rejected with 406 when talking to a spec-compliant server', async () => {
    // The stub answers 406 whenever the Accept header is incomplete, exactly
    // as the MCP Streamable HTTP transport does.
    const s = await startServer(() => null);
    const client = new MCPClient({ serverUrl: s.url, secret: SECRET });
    const result = await client.callTool({ tool: 'get_tasks', input: {} });
    expect(result.error ?? '').not.toContain('406');
    s.server.close();
  });

  it('returns a failure when the server is unreachable', async () => {
    const client = new MCPClient({ serverUrl: 'http://127.0.0.1:19998', secret: SECRET });
    const result = await client.callTool({ tool: 'get_tasks', input: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

  it('advertises both acceptable content types', async () => {
    const client = new MCPClient({ serverUrl: url, secret: SECRET });
    await client.callTool({ tool: 'get_tasks', input: {} });
    expect(received.at(-1)?.accept).toContain('application/json');
    expect(received.at(-1)?.accept).toContain('text/event-stream');
  });

  it('parses an SSE-framed response', async () => {
    const client = new MCPClient({ serverUrl: url, secret: SECRET });
    const result = await client.callTool({ tool: 'get_tasks', input: { limit: 5 } });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ tasks: [] });
  });

  it('sends the tool name and arguments', async () => {
    const client = new MCPClient({ serverUrl: url, secret: SECRET });
    await client.callTool({ tool: 'create_task', input: { title: 'x' } });
    const params = received.at(-1)?.body['params'] as Record<string, unknown>;
    expect(params['name']).toBe('create_task');
    expect(params['arguments']).toEqual({ title: 'x' });
  });
});