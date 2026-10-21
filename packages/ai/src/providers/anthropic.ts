// ============================================================
// Anthropic Provider
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ChatMessage, CompletionOptions, CompletionResult } from '../provider.js';
import { AIProviderError } from '@lifeos/shared';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, model = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = model;
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;
    const start = Date.now();

    // Anthropic separates system messages from the conversation
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: conversationMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const block = response.content[0];
      if (!block || block.type !== 'text') {
        throw new AIProviderError('Anthropic returned an empty or unexpected response');
      }

      return {
        content: block.text,
        model,
        provider: 'anthropic',
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : 'Unknown Anthropic error';
      throw new AIProviderError(`Anthropic request failed: ${message}`, { cause: err });
    }
  }
}
