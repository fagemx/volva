import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyIntentToCard,
  applyIntentToWorkflowCard,
  applyIntentToTaskCard,
  createEmptyWorldCard,
  createEmptyWorkflowCard,
  createEmptyTaskCard,
  handleTurn,
  isDiffEmpty,
} from './turn-handler';
import { CardManager } from '../cards/card-manager';
import { createDb, initSchema } from '../db';
import type { LLMClient } from '../llm/client';

// ─── applyIntentToCard (WorldCard) Tests ───

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
    expect(result.confirmed.hard_rules).toContainEqual({ description: '退款必須人工', scope: ['*'] });
  });

  it('set_boundary with enforcement=soft adds to soft_rules', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'set_boundary',
      summary: '最好友善',
      enforcement: 'soft',
    });
    expect(result.confirmed.soft_rules).toContainEqual({ description: '最好友善', scope: ['*'] });
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

  it('confirm does not change card content', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'confirm',
      summary: '好',
    });
    expect(result.goal).toBeNull();
    expect(result.version).toBe(card.version);
  });

  it('add_info with llm_preset entity sets llm_preset and not must_have', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'add_info',
      summary: '選擇 balanced',
      entities: { llm_preset: 'balanced' },
    });
    expect(result.llm_preset).toBe('balanced');
    expect(result.confirmed.must_have).toHaveLength(0);
  });

  it('add_info with llm_preset and other entities handles both correctly', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'add_info',
      summary: '設定',
      entities: { llm_preset: 'economy', feature: 'auto-reply' },
    });
    expect(result.llm_preset).toBe('economy');
    expect(result.confirmed.must_have).toEqual(['auto-reply']);
  });

  it('add_info with invalid llm_preset treats it as must_have', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'add_info',
      summary: '無效 preset',
      entities: { llm_preset: 'turbo' },
    });
    expect(result.llm_preset).toBeNull();
    expect(result.confirmed.must_have).toEqual(['turbo']);
  });

  it('add_evaluator_rule pushes to evaluator_rules', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'add_evaluator_rule',
      summary: 'price cap rule',
      entities: {
        name: 'price-cap',
        trigger: 'price_adjustment',
        condition: 'adjustment <= 20%',
        risk: 'high',
        action: 'reject',
      },
    });
    expect(result.confirmed.evaluator_rules).toHaveLength(1);
    expect(result.confirmed.evaluator_rules[0]).toMatchObject({
      name: 'price-cap',
      trigger: 'price_adjustment',
      condition: 'adjustment <= 20%',
      on_fail: { risk: 'high', action: 'reject' },
    });
  });

  it('add_evaluator_rule without entities does not add rule', () => {
    const card = createEmptyWorldCard();
    const result = applyIntentToCard(card, {
      type: 'add_evaluator_rule',
      summary: 'some rule',
    });
    expect(result.confirmed.evaluator_rules).toHaveLength(0);
  });

  it('modify intent can update evaluator rule by name', () => {
    const card = createEmptyWorldCard();
    card.confirmed.evaluator_rules.push({
      name: 'price-cap',
      trigger: 'price_adjustment',
      condition: 'adjustment <= 20%',
      on_fail: { risk: 'high', action: 'reject' },
    });
    const result = applyIntentToCard(card, {
      type: 'modify',
      summary: 'updated price cap to 30%',
      entities: { target_rule: 'price-cap' },
    });
    expect(result.confirmed.evaluator_rules[0].name).toBe('[changed] updated price cap to 30%');
  });

  it('does not increment version (CardManager owns versioning)', () => {
    const card = createEmptyWorldCard();
    expect(card.version).toBe(1);
    const result = applyIntentToCard(card, {
      type: 'new_intent',
      summary: '測試',
    });
    expect(result.version).toBe(1);
  });
});

// ─── applyIntentToWorkflowCard Tests ───

describe('applyIntentToWorkflowCard', () => {
  it('new_intent sets name and purpose', () => {
    const card = createEmptyWorkflowCard();
    const result = applyIntentToWorkflowCard(card, {
      type: 'new_intent',
      summary: '客服自動回覆流程',
    });
    expect(result.name).toBe('客服自動回覆流程');
    expect(result.purpose).toBe('客服自動回覆流程');
  });

  it('add_info pushes steps', () => {
    const card = createEmptyWorkflowCard();
    const result = applyIntentToWorkflowCard(card, {
      type: 'add_info',
      summary: '新增步驟',
      entities: { s1: '接收訊息', s2: '分類意圖' },
    });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({ description: '接收訊息', order: 0 });
    expect(result.steps[1]).toMatchObject({ description: '分類意圖', order: 1 });
  });

  it('set_boundary hard pushes to triggers', () => {
    const card = createEmptyWorkflowCard();
    const result = applyIntentToWorkflowCard(card, {
      type: 'set_boundary',
      summary: '收到新訊息時啟動',
      enforcement: 'hard',
    });
    expect(result.confirmed.triggers).toContain('收到新訊息時啟動');
  });

  it('set_boundary soft pushes to exit_conditions', () => {
    const card = createEmptyWorkflowCard();
    const result = applyIntentToWorkflowCard(card, {
      type: 'set_boundary',
      summary: '超過 30 秒就中止',
      enforcement: 'soft',
    });
    expect(result.confirmed.exit_conditions).toContain('超過 30 秒就中止');
  });

  it('add_constraint pushes to failure_handling', () => {
    const card = createEmptyWorkflowCard();
    const result = applyIntentToWorkflowCard(card, {
      type: 'add_constraint',
      summary: '失敗時通知管理員',
    });
    expect(result.confirmed.failure_handling).toContain('失敗時通知管理員');
  });

  it('confirm only bumps nothing (version unchanged)', () => {
    const card = createEmptyWorkflowCard();
    const result = applyIntentToWorkflowCard(card, {
      type: 'confirm',
      summary: '好',
    });
    expect(result.version).toBe(1);
    expect(result.steps).toHaveLength(0);
  });
});

// ─── applyIntentToTaskCard Tests ───

describe('applyIntentToTaskCard', () => {
  it('new_intent sets intent', () => {
    const card = createEmptyTaskCard();
    const result = applyIntentToTaskCard(card, {
      type: 'new_intent',
      summary: '部署到 production',
    });
    expect(result.intent).toBe('部署到 production');
  });

  it('add_info merges inputs', () => {
    const card = createEmptyTaskCard();
    card.inputs = { env: 'staging' };
    const result = applyIntentToTaskCard(card, {
      type: 'add_info',
      summary: '補充參數',
      entities: { branch: 'main', env: 'production' },
    });
    expect(result.inputs.branch).toBe('main');
    expect(result.inputs.env).toBe('production');
  });

  it('set_boundary pushes to constraints', () => {
    const card = createEmptyTaskCard();
    const result = applyIntentToTaskCard(card, {
      type: 'set_boundary',
      summary: '不能影響線上服務',
      enforcement: 'hard',
    });
    expect(result.constraints).toContain('不能影響線上服務');
  });

  it('add_constraint pushes to constraints', () => {
    const card = createEmptyTaskCard();
    const result = applyIntentToTaskCard(card, {
      type: 'add_constraint',
      summary: '限制 5 分鐘內完成',
    });
    expect(result.constraints).toContain('限制 5 分鐘內完成');
  });

  it('confirm only bumps nothing (version unchanged)', () => {
    const card = createEmptyTaskCard();
    const result = applyIntentToTaskCard(card, {
      type: 'confirm',
      summary: '好',
    });
    expect(result.version).toBe(1);
    expect(result.constraints).toHaveLength(0);
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

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
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

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    await handleTurn(mockLlm, mgr, 'conv1', 'test', 'explore');

    // generateStructured (intent) + generateText (reply) = 2 calls
    expect(mockParseIntent).toHaveBeenCalledTimes(1);
    expect(mockGenerateReply).toHaveBeenCalledTimes(1);
  });

  it('workflow_design mode creates WorkflowCard on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '自動回覆流程' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，讓我們設計這個流程');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'workflow_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '自動回覆流程', 'explore', 'workflow_design');

    expect(result.phase).toBe('explore');
    expect(result.cardVersion).toBeGreaterThanOrEqual(1);

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('workflow');
  });

  it('task mode creates TaskCard on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '部署到 prod' },
    });
    mockGenerateReply.mockResolvedValueOnce('了解，準備部署');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'task', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '部署到 prod', 'explore', 'task');

    expect(result.phase).toBe('explore');
    expect(result.cardVersion).toBeGreaterThanOrEqual(1);

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('task');
  });

  it('commerce_design mode creates CommerceCard on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '設計商品方案' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，讓我們設計商業模式');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'commerce_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '設計商品方案', 'explore', 'commerce_design');

    expect(result.phase).toBe('explore');
    expect(result.cardVersion).toBeGreaterThanOrEqual(1);

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('commerce');
  });

  it('org_design mode creates OrgCard on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '組織架構設計' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，讓我們設計組織架構');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'org_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '組織架構設計', 'explore', 'org_design');

    expect(result.phase).toBe('explore');
    expect(result.cardVersion).toBeGreaterThanOrEqual(1);

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('org');
  });

  it('pipeline_design mode creates PipelineCard on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '內容產製流水線' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，讓我們設計流水線');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'pipeline_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '內容產製流水線', 'explore', 'pipeline_design');

    expect(result.phase).toBe('explore');
    expect(result.cardVersion).toBeGreaterThanOrEqual(1);

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('pipeline');
  });

  it('adapter_config mode creates AdapterCard on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: 'discord telegram' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，讓我們配置平台');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'adapter_config', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', 'discord telegram', 'explore', 'adapter_config');

    // adapter transitions to focus immediately when platforms.length >= 1
    expect(result.phase).toBe('focus');
    expect(result.cardVersion).toBeGreaterThanOrEqual(1);

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('adapter');
  });

  it('auto-detects workflow_design mode on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '每週自動發文', detected_mode: 'workflow_design' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，讓我們設計流程');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '設定每週自動發文流程', 'explore', 'world_design');

    expect(result.detectedMode).toBe('workflow_design');

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('workflow');
  });

  it('auto-detects task mode on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '查上週資料', detected_mode: 'task' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的，讓我幫你查');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '幫我查上週的資料', 'explore', 'world_design');

    expect(result.detectedMode).toBe('task');

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('task');
  });

  it('does not return detectedMode on second turn', async () => {
    // First turn
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '做客服' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    await handleTurn(mockLlm, mgr, 'conv1', '做客服', 'explore');

    // Second turn - even if LLM returns detected_mode, it should be ignored
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'add_info', summary: '加功能', detected_mode: 'task' },
    });
    mockGenerateReply.mockResolvedValueOnce('了解');

    const result = await handleTurn(mockLlm, mgr, 'conv1', '加功能', 'explore');
    expect(result.detectedMode).toBeUndefined();
  });

  it('defaults to world_design when no detected_mode on first turn', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '做客服' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '做客服', 'explore');

    expect(result.detectedMode).toBeUndefined();

    const card = mgr.getLatest('conv1');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('world');
  });

  it('returns fallback when parseIntent throws (LLM-02)', async () => {
    mockParseIntent.mockRejectedValueOnce(new Error('LLM network error'));
    mockGenerateReply.mockResolvedValueOnce('抱歉，請再說一次');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '你好', 'explore');

    expect(result.intent.type).toBe('off_topic');
    expect(result.intent.summary).toBe('你好');
    expect(result.reply).toBe('抱歉，請再說一次');
    expect(result.phase).toBe('explore');
  });

  it('returns fallback reply when generateReply throws (LLM-02)', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '做客服' },
    });
    mockGenerateReply.mockRejectedValueOnce(new Error('LLM timeout'));

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    const result = await handleTurn(mockLlm, mgr, 'conv1', '做客服', 'explore');

    expect(result.intent.type).toBe('new_intent');
    expect(result.reply).toContain('System error');
    expect(result.phase).toBe('explore');
  });

  it('falls back to off_topic when parseIntent LLM fails, card state and phase unchanged', async () => {
    // First turn: create a card with real content
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '做客服' },
    });
    mockGenerateReply.mockResolvedValueOnce('好的');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
    const mgr = new CardManager(db);
    await handleTurn(mockLlm, mgr, 'conv1', '做客服', 'explore');

    const cardBefore = mgr.getLatest('conv1');
    expect(cardBefore).not.toBeNull();
    const versionBefore = cardBefore!.version;
    const contentBefore = JSON.stringify(cardBefore!.content);

    // Second turn: generateStructured returns {ok: false} (LLM timeout)
    mockParseIntent.mockResolvedValueOnce({
      ok: false,
      error: 'timeout',
    });
    mockGenerateReply.mockResolvedValueOnce('抱歉，我不太理解，可以再說一次嗎？');

    const result = await handleTurn(mockLlm, mgr, 'conv1', '隨便講講', 'explore');

    // Should still return a reply (via off_topic fallback)
    expect(result.reply).toBe('抱歉，我不太理解，可以再說一次嗎？');

    // Intent should be off_topic fallback
    expect(result.intent.type).toBe('off_topic');
    expect(result.intent.summary).toBe('隨便講講');

    // Phase should remain unchanged
    expect(result.phase).toBe('explore');
    expect(result.phaseChanged).toBe(false);

    // Card content should be unchanged (off_topic does not modify card)
    const cardAfter = mgr.getLatest('conv1');
    expect(cardAfter).not.toBeNull();
    // version increments because CardManager.update always bumps version,
    // but the meaningful content should be the same
    expect(cardAfter!.version).toBe(versionBefore + 1);
    // Strip version from comparison to verify content is unchanged
    const before = JSON.parse(contentBefore);
    const after = JSON.parse(JSON.stringify(cardAfter!.content));
    delete before.version;
    delete after.version;
    expect(after).toEqual(before);
  });
});

// ─── isDiffEmpty Tests ───

describe('isDiffEmpty', () => {
  it('returns true when diff has no changes except version', () => {
    expect(isDiffEmpty({ added: [], removed: [], changed: ['version'] })).toBe(true);
  });

  it('returns true when diff is completely empty', () => {
    expect(isDiffEmpty({ added: [], removed: [], changed: [] })).toBe(true);
  });

  it('returns false when diff has added fields', () => {
    expect(isDiffEmpty({ added: ['goal'], removed: [], changed: [] })).toBe(false);
  });

  it('returns false when diff has removed fields', () => {
    expect(isDiffEmpty({ added: [], removed: ['goal'], changed: [] })).toBe(false);
  });

  it('returns false when diff has changed fields besides version', () => {
    expect(isDiffEmpty({ added: [], removed: [], changed: ['version', 'goal'] })).toBe(false);
  });
});

// ─── nomodStreak tracking in handleTurn ───

describe('handleTurn nomodStreak', () => {
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

  it('increments nomodStreak when diff is empty (confirm intent)', async () => {
    // First turn to create card
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: 'test goal' },
    });
    mockGenerateReply.mockResolvedValueOnce('OK');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'focus')");
    const mgr = new CardManager(db);

    // Turn 1: create card with content
    await handleTurn(mockLlm, mgr, 'conv1', 'test goal', 'focus', 'world_design', 0);

    // Turn 2: confirm (no content change) -> nomodStreak should be 1
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'confirm', summary: 'OK' },
    });
    mockGenerateReply.mockResolvedValueOnce('confirmed');

    const result2 = await handleTurn(mockLlm, mgr, 'conv1', 'OK', 'focus', 'world_design', 0);
    expect(result2.nomodStreak).toBe(1);
  });

  it('resets nomodStreak to 0 when diff has changes', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: 'initial goal' },
    });
    mockGenerateReply.mockResolvedValueOnce('OK');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'focus')");
    const mgr = new CardManager(db);

    // Turn 1: create card
    await handleTurn(mockLlm, mgr, 'conv1', 'initial goal', 'focus', 'world_design', 0);

    // Turn 2: add_info (content changes) with nomodStreak=3 -> should reset to 0
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'add_info', summary: 'more', entities: { f1: 'feature1' } },
    });
    mockGenerateReply.mockResolvedValueOnce('got it');

    const result2 = await handleTurn(mockLlm, mgr, 'conv1', 'add feature', 'focus', 'world_design', 3);
    expect(result2.nomodStreak).toBe(0);
  });

  it('transitions to settle after 2 consecutive no-mod turns', async () => {
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: 'goal' },
    });
    mockGenerateReply.mockResolvedValueOnce('OK');

    const db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'focus')");
    const mgr = new CardManager(db);

    // Turn 1: create card
    await handleTurn(mockLlm, mgr, 'conv1', 'goal', 'focus', 'world_design', 0);

    // Turn 2: confirm with nomodStreak=1 -> diff empty -> streak becomes 2 -> settle
    mockParseIntent.mockResolvedValueOnce({
      ok: true,
      data: { type: 'question', summary: 'hmm' },
    });
    mockGenerateReply.mockResolvedValueOnce('settled');

    const result = await handleTurn(mockLlm, mgr, 'conv1', 'hmm', 'focus', 'world_design', 1);
    expect(result.nomodStreak).toBe(2);
    expect(result.phase).toBe('settle');
    expect(result.phaseChanged).toBe(true);
  });
});
