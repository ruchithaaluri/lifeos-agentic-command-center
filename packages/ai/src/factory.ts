// ============================================================
// AI Provider Factory
// Reads AI_PROVIDER, AI_MODEL, AI_API_KEY from env and returns
// the correct provider implementation.
// ============================================================

import type { AIProvider } from './provider.js';
import { isSupportedProvider } from './provider.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';

export interface AIConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
}

export function createAIProvider(config?: AIConfig): AIProvider {
  const provider = config?.provider ?? process.env['AI_PROVIDER'] ?? 'openai';
  const model = config?.model ?? process.env['AI_MODEL'];
  const apiKey = config?.apiKey ?? process.env['AI_API_KEY'] ?? '';

  if (!isSupportedProvider(provider)) {
    throw new Error(
      `Unsupported AI provider: "${provider}". Set AI_PROVIDER to "openai" or "anthropic".`,
    );
  }

  switch (provider) {
    case 'openai':
      return new OpenAIProvider(apiKey, model ?? 'gpt-4o');
    case 'anthropic':
      return new AnthropicProvider(apiKey, model ?? 'claude-3-5-sonnet-20241022');
  }
}

// Singleton for server-side usage (created once per process)
let _singleton: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  if (!_singleton) {
    _singleton = createAIProvider();
  }
  return _singleton;
}
