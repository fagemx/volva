import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateStructured = vi.fn();
vi.mock('./client', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    generateStructured: mockGenerateStructured,
  })),
}));

import { parseIntent } from './intent-parser';
import type { LLMClient } from './client';

describe('parseIntent', () => {
  const mockLlm = { generateStructured: mockGenerateStructured } as unknown as LLMClient;
  const cardSnapshot = '{"goal":"test","version":1}';

  beforeEach(() => {
    mockGenerateStructured.mockReset();
  });

  it('returns parsed intent on success', async () => {
    const intent = {
      type: 'new_intent' as const,
      summary: '使用者想做自動化客服',
      entities: { domain: 'customer_service' },
    };
    mockGenerateStructured.mockResolvedValueOnce({ ok: true, data: intent });

    const result = await parseIntent(mockLlm, '我想做一個客服', cardSnapshot);
    expect(result).toEqual(intent);
  });

  it('falls back to off_topic on schema validation failure', async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      ok: false,
      error: 'Schema validation failed',
    });

    const result = await parseIntent(mockLlm, '亂七八糟的話', cardSnapshot);
    expect(result.type).toBe('off_topic');
    expect(result.summary).toBe('亂七八糟的話');
  });

  it('falls back to off_topic on LLM error', async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      ok: false,
      error: 'API timeout',
    });

    const result = await parseIntent(mockLlm, 'hello', cardSnapshot);
    expect(result.type).toBe('off_topic');
    expect(result.summary).toBe('hello');
  });

  it('passes card snapshot and user message to LLM', async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      ok: true,
      data: { type: 'confirm', summary: '好' },
    });

    await parseIntent(mockLlm, '好', '{"goal":"客服"}');

    expect(mockGenerateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('客服'),
          }),
        ],
      }),
    );
  });
});
