import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateText = vi.fn();
vi.mock('./client', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    generateText: mockGenerateText,
  })),
}));

import { generateReply } from './response-gen';
import type { Strategy } from './prompts';
import type { LLMClient } from './client';

describe('generateReply', () => {
  const mockLlm = { generateText: mockGenerateText } as unknown as LLMClient;
  const cardSnapshot = '{"goal":"test","version":1}';

  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it('returns LLM-generated text', async () => {
    mockGenerateText.mockResolvedValueOnce('好的，自動化客服。你的客戶主要會問什麼類型的問題？');

    const result = await generateReply(mockLlm, 'probe', cardSnapshot, '我想做客服');
    expect(result).toBe('好的，自動化客服。你的客戶主要會問什麼類型的問題？');
  });

  it('passes strategy to system prompt', async () => {
    mockGenerateText.mockResolvedValueOnce('reply');

    await generateReply(mockLlm, 'mirror', cardSnapshot, 'test');

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('mirror'),
      }),
    );
  });

  it('passes card snapshot to system prompt', async () => {
    mockGenerateText.mockResolvedValueOnce('reply');

    await generateReply(mockLlm, 'propose', '{"goal":"客服系統"}', 'test');

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('客服系統'),
      }),
    );
  });

  it('accepts all 6 strategy types', async () => {
    const strategies: Strategy[] = ['mirror', 'probe', 'propose', 'confirm', 'settle', 'redirect'];

    for (const strategy of strategies) {
      mockGenerateText.mockResolvedValueOnce('reply');
      const result = await generateReply(mockLlm, strategy, cardSnapshot, 'test');
      expect(result).toBe('reply');
    }
  });

  it('returns fallback string on LLM failure', async () => {
    mockGenerateText.mockResolvedValueOnce('[系統暫時無法回應，請稍後再試]');

    const result = await generateReply(mockLlm, 'probe', cardSnapshot, 'test');
    expect(result).toBe('[系統暫時無法回應，請稍後再試]');
  });
});
