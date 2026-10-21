// ============================================================
// MCP HTTP Client
// Calls the LifeOS MCP server over Streamable HTTP.
// Used by the agent orchestrator to execute tools.
// ============================================================

import type { MCPToolCall, MCPToolResult } from './agent.js';
import { signIdentityToken } from '@lifeos/shared/identity';

export interface MCPClientConfig {
  serverUrl: string;
  secret: string;
  /**
   * Supplies a fresh signed identity token for the acting user, called per
   * request so a long agent run never uses an expired token. Server-side
   * only — the browser never sees or influences this value.
   */
  getIdentityToken?: () => Promise<string | null | undefined>;
}

export class MCPClient {
  private serverUrl: string;
  private secret: string;
  private getIdentityToken: MCPClientConfig['getIdentityToken'];

  constructor(config: MCPClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.secret = config.secret;
    this.getIdentityToken = config.getIdentityToken;
  }

  async callTool(call: MCPToolCall): Promise<MCPToolResult> {
    const start = Date.now();
    const requestId = randomId();

    // Minted per request so long-running agent loops never reuse an expired token.
    let identityToken: string | null | undefined;
    if (this.getIdentityToken) {
      try {
        identityToken = await this.getIdentityToken();
      } catch {
        identityToken = null;
      }
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // The MCP Streamable HTTP transport requires the client to accept
        // both types; the server answers 406 Not Acceptable without this.
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${this.secret}`,
      };
      if (identityToken) {
        headers['X-LifeOS-Identity'] = identityToken;
      }

      const response = await fetch(`${this.serverUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'tools/call',
          params: {
            name: call.tool,
            arguments: call.input,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'no body');
        return {
          tool: call.tool,
          success: false,
          error: `MCP server responded with ${response.status} after ${Date.now() - start}ms: ${text}`,
        };
      }

      // The server may reply with plain JSON or an SSE-framed body, depending
      // on its transport configuration.
      const raw = await response.text();
      const body = parseRpcBody(raw, requestId);
      if (!body) {
        return {
          tool: call.tool,
          success: false,
          error: `Unparseable MCP response after ${Date.now() - start}ms: ${raw.slice(0, 200)}`,
        };
      }

      if ('error' in body && body.error) {
        return {
          tool: call.tool,
          success: false,
          error: body.error.message ?? 'MCP tool error',
        };
      }

      // MCP tools/call returns { content: [{ type: "text", text: "..." }] }
      const result = body.result as MCPToolCallResult | undefined;
      if (!result?.content?.[0]) {
        return { tool: call.tool, success: false, error: 'Empty MCP response' };
      }

      const textContent = result.content.find((c) => c.type === 'text');
      if (!textContent) {
        return { tool: call.tool, success: false, error: 'No text content in MCP response' };
      }

      // A tool-level failure is reported in-band (isError) rather than as a
      // JSON-RPC error, so it must not be reported to the agent as a success.
      if (result.isError) {
        return {
          tool: call.tool,
          success: false,
          error: textContent.text || 'MCP tool reported an error',
        };
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(textContent.text) as Record<string, unknown>;
      } catch {
        data = { raw: textContent.text };
      }

      return { tool: call.tool, success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      return {
        tool: call.tool,
        success: false,
        error: `Failed to reach MCP server after ${Date.now() - start}ms: ${message}`,
      };
    }
  }

  /** Check that the MCP server is up and responds to initialize */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`, {
        headers: { Authorization: `Bearer ${this.secret}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

interface MCPRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface MCPToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Parse a JSON-RPC response that may be plain JSON or SSE-framed.
 *
 * The Streamable HTTP transport answers with `text/event-stream` by default
 * (`event: message\ndata: {...}\n\n`), so a plain `response.json()` throws.
 * Where an SSE body carries several frames, the one matching our request id
 * is used.
 */
function parseRpcBody(raw: string, requestId: string): MCPRPCResponse | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as MCPRPCResponse;
    } catch {
      return null;
    }
  }

  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const parsed = JSON.parse(payload) as MCPRPCResponse;
      // Notifications and unrelated ids are skipped; a response without an id
      // is accepted as the only candidate.
      if (parsed.id === undefined || String(parsed.id) === String(requestId)) {
        return parsed;
      }
    } catch {
      // Not a JSON data frame — keep scanning.
    }
  }

  return null;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createMCPClient(opts?: { userId?: string }): MCPClient {
  const serverUrl = process.env['MCP_SERVER_URL'] ?? 'http://localhost:3001';
  const secret = process.env['MCP_SECRET'] ?? '';
  const userId = opts?.userId;

  return new MCPClient({
    serverUrl,
    secret,
    // Bound to the server-side session user — never to browser input.
    // Under exactOptionalPropertyTypes the key must be omitted, not undefined.
    ...(userId
      ? { getIdentityToken: () => Promise.resolve(signIdentityToken(userId, secret)) }
      : {}),
  });
}
