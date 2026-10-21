// ============================================================
// OpenAI Provider
// ============================================================

import OpenAI from 'openai';
import type { AIProvider, ChatMessage, CompletionOptions, CompletionResult } from '../provider.js';
import { AIProviderError } from '@lifeos/shared';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, model = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = model;
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;
    const start = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        response_format:
          options.responseFormat === 'json_object' ? { type: 'json_object' } : { type: 'text' },
      });

      const choice = response.choices[0];
      if (!choice?.message.content) {
        throw new AIProviderError('OpenAI returned an empty response');
      }

      return {
        content: choice.message.content,
        model,
        provider: 'openai',
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : 'Unknown OpenAI error';
      throw new AIProviderError(`OpenAI request failed: ${message}`, { cause: err });
    }
  }
}
