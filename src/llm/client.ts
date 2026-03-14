import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export interface LLMClientConfig {
  apiKey?: string;
  model?: string;
}

export interface LLMCallOptions {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
}

export interface LLMStructuredOptions<T extends z.ZodType> extends LLMCallOptions {
  schema: T;
  schemaDescription: string;
}

/**
 * Extract JSON from LLM response text.
 * Handles: bare JSON, markdown-fenced JSON, JSON with surrounding text.
 */
export function extractJson(raw: string): string {
  let str = raw.trim();

  // Strip markdown code fences (case-insensitive)
  const fenceMatch = str.match(/^```\s*(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Already looks like JSON
  if (str.startsWith('{') || str.startsWith('[')) {
    return str;
  }

  // Last resort: extract first JSON object
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return str.substring(firstBrace, lastBrace + 1);
  }

  return str;
}

export class LLMClient {
  private client: Anthropic;
  private model: string;

  constructor(config?: LLMClientConfig) {
    this.client = new Anthropic({
      apiKey: config?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = config?.model ?? process.env.VOLVA_MODEL ?? 'claude-sonnet-4-20250514';
  }

  async generateText(options: LLMCallOptions): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        system: options.system,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 2000,
      });
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      );
      return textBlock?.text ?? '';
    } catch (error) {
      console.error('[LLMClient] generateText failed:', error);
      return '[系統暫時無法回應，請稍後再試]';
    }
  }

  async generateStructured<T extends z.ZodType>(
    options: LLMStructuredOptions<T>
  ): Promise<{ ok: true; data: z.infer<T> } | { ok: false; error: string }> {
    try {
      const systemWithSchema = `${options.system}\n\nYou MUST respond with valid JSON matching this description: ${options.schemaDescription}\nRespond ONLY with JSON, no other text.`;

      const response = await this.client.messages.create({
        model: this.model,
        system: systemWithSchema,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 2000,
      });

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      );
      if (!textBlock?.text) {
        return { ok: false, error: 'Empty response from LLM' };
      }

      const jsonStr = extractJson(textBlock.text);
      const parsed = JSON.parse(jsonStr);
      const validated = options.schema.safeParse(parsed);

      if (!validated.success) {
        return {
          ok: false,
          error: `Schema validation failed: ${validated.error.message}`,
        };
      }

      return { ok: true, data: validated.data };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LLMClient] generateStructured failed:', msg);
      return { ok: false, error: msg };
    }
  }
}
