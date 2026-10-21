// ============================================================
// LifeOS AI Provider Interface
// Provider-agnostic abstraction over LLM APIs.
// Configured entirely via environment variables.
// ============================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** JSON schema for structured output (used with json_object / structured outputs) */
  responseFormat?: 'text' | 'json_object';
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
}

// ── Provider type guard ───────────────────────────────────────────────────

export type SupportedProvider = 'openai' | 'anthropic';

export function isSupportedProvider(v: string): v is SupportedProvider {
  return v === 'openai' || v === 'anthropic';
}
