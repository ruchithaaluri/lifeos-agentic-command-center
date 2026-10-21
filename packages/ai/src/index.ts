// ============================================================
// @lifeos/ai — Public API
// ============================================================

// Provider abstraction
export type {
  AIProvider,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  SupportedProvider,
} from './provider.js';

// Factory
export { createAIProvider, getAIProvider } from './factory.js';
export type { AIConfig } from './factory.js';

// Agent orchestrator
export { AgentOrchestrator } from './agent.js';
export type { MCPToolCall, MCPToolResult, MCPCaller, StreamCallback } from './agent.js';

// MCP client
export { MCPClient, createMCPClient } from './mcp-client.js';
export type { MCPClientConfig } from './mcp-client.js';

// Prompts (for direct use in MCP tools)
export {
  AGENT_SYSTEM_PROMPT,
  PLAN_GENERATION_PROMPT,
  ANALYZE_DAY_PROMPT,
  INTENT_PARSE_PROMPT,
} from './prompts.js';
