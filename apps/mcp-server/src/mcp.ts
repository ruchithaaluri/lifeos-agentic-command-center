// ============================================================
// LifeOS MCP Server Definition
// SDK: @modelcontextprotocol/sdk v1.30.1
// MCP Specification: 2025-11-25 (LATEST_PROTOCOL_VERSION)
// Transport: Streamable HTTP — stateless mode
//
// Per-request architecture: each POST /mcp creates a fresh
// McpServer + transport, discards them after the request.
// userId is captured via closure — no transport monkey-patching.
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';
import { logger } from './logger.js';

// Tools
import { getTasksTool } from './tools/get-tasks.js';
import { createTaskTool } from './tools/create-task.js';
import { updateTaskTool } from './tools/update-task.js';
import { deleteTaskTool } from './tools/delete-task.js';
import { getScheduleTool } from './tools/get-schedule.js';
import { createEventTool } from './tools/create-event.js';
import { moveEventTool } from './tools/move-event.js';
import { getProjectsTool } from './tools/get-projects.js';
import { searchContextTool } from './tools/search-context.js';
import { analyzeDayTool } from './tools/analyze-day.js';
import { generatePlanTool } from './tools/generate-plan.js';
import { executePlanTool } from './tools/execute-plan.js';

// ── Tool type ─────────────────────────────────────────────────────────────

/**
 * Internal tool definition. Each tool:
 * - Declares a JSON-schema inputSchema for client discoverability
 * - Validates input with its own Zod schema internally in execute()
 * - Returns a JSON string that the SDK wraps in content[0].text
 */
export interface MCPTool {
  name: string;
  description: string;
  /**
   * Zod raw shape registered with the SDK.
   * This is what tools/list advertises as the tool's inputSchema, and it is
   * also used by the SDK to validate incoming arguments before execute() runs.
   */
  zodSchema: ZodRawShape;
  /** JSON Schema mirror, kept for documentation and client discoverability */
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute(input: unknown, userId: string): Promise<string>;
}

// ── Tool registry ─────────────────────────────────────────────────────────

export const ALL_TOOLS: MCPTool[] = [
  getTasksTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  getScheduleTool,
  createEventTool,
  moveEventTool,
  getProjectsTool,
  searchContextTool,
  analyzeDayTool,
  generatePlanTool,
  executePlanTool,
];

// ── Create MCP server instance ────────────────────────────────────────────

/**
 * Creates a fresh McpServer with all 12 tools registered.
 *
 * Each tool is registered with its real Zod shape so that:
 * 1. `tools/list` advertises the tool's true input schema (required fields,
 *    enums, descriptions) instead of a single opaque "input" record, and
 * 2. the SDK validates arguments and passes the parsed object through, so
 *    `execute()` receives the caller's actual arguments.
 *
 * The SDK's `registerTool` throws a tool-level error (isError: true) when
 * arguments fail validation, which is the behaviour our tool contract
 * documents, so each tool still re-validates defensively inside execute().
 */
export function createMCPServer(userId: string): McpServer {
  const server = new McpServer({
    name: 'lifeos-mcp-server',
    version: '0.1.0',
  });

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.zodSchema,
      },
      async (args) => {
        const start = Date.now();
        logger.tool(tool.name, 'start', { userId });

        try {
          const result = await tool.execute(args, userId);

          logger.tool(tool.name, 'success', {
            userId,
            latencyMs: Date.now() - start,
          });

          return {
            content: [{ type: 'text' as const, text: result }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Tool execution failed';
          logger.tool(tool.name, 'failed', {
            userId,
            error: message,
            latencyMs: Date.now() - start,
          });
          // MCP spec: isError:true signals a tool-level failure (not a protocol error)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
