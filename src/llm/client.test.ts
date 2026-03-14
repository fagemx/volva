import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { extractJson } from './client';

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

describe('extractJson', () => {
  it('returns bare JSON object as-is', () => {
    const input = '{"type":"test"}';
    expect(extractJson(input)).toBe('{"type":"test"}');
  });

  it('strips ```json fences', () => {
    const input = '```json\n{"type":"test"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ type: 'test' });
  });

  it('strips bare ``` fences', () => {
    const input = '```\n{"type":"test"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ type: 'test' });
  });

  it('handles uppercase ```JSON', () => {
    const input = '```JSON\n{"type":"test"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ type: 'test' });
  });

  it('extracts JSON from surrounding text', () => {
    const input = 'Here is the result:\n{"type":"test"}\nDone.';
    expect(JSON.parse(extractJson(input))).toEqual({ type: 'test' });
  });

  it('handles JSON arrays', () => {
    const input = '[1,2,3]';
    expect(extractJson(input)).toBe('[1,2,3]');
  });

  it('passes through non-JSON unchanged', () => {
    const input = 'not json at all';
    expect(extractJson(input)).toBe('not json at all');
  });
});

describe('LLMClient', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe('generateText', () => {
    it('returns text from successful response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello world' }],
      });

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateText({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toBe('Hello world');
    });

    it('returns empty string for empty content', async () => {
      mockCreate.mockResolvedValueOnce({ content: [] });

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateText({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toBe('');
    });

    it('returns fallback string on API error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API timeout'));

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateText({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toBe('[系統暫時無法回應，請稍後再試]');
    });
  });

  describe('generateStructured', () => {
    const TestSchema = z.object({ type: z.string(), value: z.number() });

    it('returns parsed data for valid JSON response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"type":"test","value":42}' }],
      });

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateStructured({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        schema: TestSchema,
        schemaDescription: 'Test schema',
      });

      expect(result).toEqual({ ok: true, data: { type: 'test', value: 42 } });
    });

    it('handles markdown-fenced JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '```json\n{"type":"test","value":42}\n```' }],
      });

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateStructured({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        schema: TestSchema,
        schemaDescription: 'Test schema',
      });

      expect(result).toEqual({ ok: true, data: { type: 'test', value: 42 } });
    });

    it('returns error for invalid JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'not valid json' }],
      });

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateStructured({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        schema: TestSchema,
        schemaDescription: 'Test schema',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeDefined();
    });

    it('returns error for valid JSON that fails schema', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"type":"test","value":"not-a-number"}' }],
      });

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateStructured({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        schema: TestSchema,
        schemaDescription: 'Test schema',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Schema validation failed');
    });

    it('returns error for empty response', async () => {
      mockCreate.mockResolvedValueOnce({ content: [] });

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateStructured({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        schema: TestSchema,
        schemaDescription: 'Test schema',
      });

      expect(result).toEqual({ ok: false, error: 'Empty response from LLM' });
    });

    it('returns error on API failure', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Rate limited'));

      const { LLMClient } = await import('./client');
      const client = new LLMClient({ apiKey: 'test-key' });
      const result = await client.generateStructured({
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        schema: TestSchema,
        schemaDescription: 'Test schema',
      });

      expect(result).toEqual({ ok: false, error: 'Rate limited' });
    });
  });
});
