import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyIntentToCard, createEmptyWorldCard, handleTurn } from './turn-handler';
import { CardManager } from '../cards/card-manager';
import type { LLMClient } from '../llm/client';

// ─── applyIntentToCard Tests ───

describe('applyIntentToCard', () => {
  it('new_intent sets goal', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'new_intent',
      summary: '我想做客服',
    });
    expect(result.goal).toBe('我想做客服');
  });

  it('add_info pushes to must_have (no duplicates)', () => {
    const card = createEmptyWorldCard();
    card.confirmed.must_have = ['existing'];
    const result = applyIntentToCard(card, {
      type: 'add_info',
      summary: '補充功能',
      entities: { f1: 'existing', f2: 'new_feature' },
    });
    expect(result.confirmed.must_have).toEqual(['existing', 'new_feature']);
  });

  it('set_boundary with enforcement=hard adds to hard_rules', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'set_boundary',
      summary: '退款必須人工',
      enforcement: 'hard',
    });
    expect(result.confirmed.hard_rules).toContain('退款必須人工');
  });

  it('set_boundary with enforcement=soft adds to soft_rules', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'set_boundary',
      summary: '最好友善',
      enforcement: 'soft',
    });
    expect(result.confirmed.soft_rules).toContain('最好友善');
  });

  it('style_preference initializes chief_draft and sets style', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'style_preference',
      summary: '親切但不隨便',
    });
    expect(result.chief_draft).not.toBeNull();
    expect(result.chief_draft!.style).toBe('親切但不隨便');
  });

  it('confirm does not change card content (except version)', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'confirm',
      summary: '好',
    });
    expect(result.goal).toBeNull();
    expect(result.version).toBe(card.version + 1);
  });

  it('increments version', () => {
    const card = createEmptyWorldCard();
    expect(card.version).toBe(1);
    const result = applyIntentToCard(card, {
      type: 'confirm',
      summary: '好',
    });
    expect(result.version).toBe(2);
  });
});

// ─── handleTurn Tests ───

describe('handleTurn', () => {
  const mockParseIntent = vi.fn();
  const mockGenerateReply = vi.fn();

  const mockLlm = {
    generateStructured: mockParseIntent,
    generateText: mockGenerateReply,
  } as unknown as LLMClient;

  beforeEach(() => {
    mockParseIntent.mockReset();
    mockGenerateReply.mockReset();
  });

  it('first turn creates card and stays explore', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '我想做客服' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，你想做什麼樣的客服呢？');

    const mgr = new CardManager();
    const result = await handleTurn(mockLlm, mgr, 'conv1', '我想做客服', 'explore');

    expect(result.phase).toBe('explore');
    expect(result.reply).toBe('好的，你想做什麼樣的客服呢？');
    expect(result.cardVersion).toBeGreaterThanOrEqual(1);
  });

  it('max 2 LLM calls per turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'add_info', summary: '產品介紹' },
    });
    mockGenerateReply.mockResolvedValueOnce('了解');

    const mgr = new CardManager();
    await handleTurn(mockLlm, mgr, 'conv1', 'test', 'explore');

    // generateStructured (intent) + generateText (reply) = 2 calls
    expect(mockParseIntent).toHaveBeenCalledTimes(1);
    expect(mockGenerateReply).toHaveBeenCalledTimes(1);
  });
});
