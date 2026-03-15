import { describe, it, expect } from 'vitest';
import { IntentSchema, IntentType } from './intent';

describe('IntentType', () => {
  it('accepts all 10 valid intent types', () => {
    const types = [
      'new_intent', 'add_info', 'set_boundary', 'add_constraint',
      'style_preference', 'confirm', 'modify', 'settle_signal',
      'question', 'off_topic',
    ];
    for (const t of types) {
      expect(IntentType.safeParse(t).success).toBe(true);
    }
  });

  it('rejects invalid intent type', () => {
    expect(IntentType.safeParse('invalid').success).toBe(false);
    expect(IntentType.safeParse('').success).toBe(false);
    expect(IntentType.safeParse(123).success).toBe(false);
  });
});

describe('IntentSchema', () => {
  it('accepts valid intent with all fields', () => {
    const result = IntentSchema.safeParse({
      type: 'new_intent',
      summary: '使用者想做自動化客服',
      entities: { domain: 'customer_service' },
      enforcement: 'hard',
      signals: ['automation'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal intent (type + summary only)', () => {
    const result = IntentSchema.safeParse({
      type: 'confirm',
      summary: '好',
    });
    expect(result.success).toBe(true);
  });

  it('accepts set_boundary with enforcement', () => {
    const result = IntentSchema.safeParse({
      type: 'set_boundary',
      summary: '退款必須轉人工',
      enforcement: 'hard',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enforcement).toBe('hard');
    }
  });

  it('accepts soft enforcement', () => {
    const result = IntentSchema.safeParse({
      type: 'add_constraint',
      summary: '庫存延遲最好不超過 5 分鐘',
      enforcement: 'soft',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = IntentSchema.safeParse({
      type: 'invalid_type',
      summary: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing summary', () => {
    const result = IntentSchema.safeParse({
      type: 'confirm',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid enforcement value', () => {
    const result = IntentSchema.safeParse({
      type: 'set_boundary',
      summary: 'test',
      enforcement: 'medium',
    });
    expect(result.success).toBe(false);
  });

  it('accepts entities as string record', () => {
    const result = IntentSchema.safeParse({
      type: 'add_info',
      summary: '補充功能',
      entities: { feature1: 'product_intro', feature2: 'inventory' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects entities with non-string values', () => {
    const result = IntentSchema.safeParse({
      type: 'add_info',
      summary: 'test',
      entities: { count: 42 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts detected_mode with valid value', () => {
    const result = IntentSchema.safeParse({
      type: 'new_intent',
      summary: '設定每週自動發文',
      detected_mode: 'workflow_design',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.detected_mode).toBe('workflow_design');
    }
  });

  it('accepts intent without detected_mode (optional)', () => {
    const result = IntentSchema.safeParse({
      type: 'new_intent',
      summary: 'test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.detected_mode).toBeUndefined();
    }
  });

  it('rejects invalid detected_mode value', () => {
    const result = IntentSchema.safeParse({
      type: 'new_intent',
      summary: 'test',
      detected_mode: 'invalid_mode',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all three valid detected_mode values', () => {
    for (const mode of ['world_design', 'workflow_design', 'task']) {
      const result = IntentSchema.safeParse({
        type: 'new_intent',
        summary: 'test',
        detected_mode: mode,
      });
      expect(result.success).toBe(true);
    }
  });
});
