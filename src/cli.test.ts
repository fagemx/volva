import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDb, initSchema } from './db';
import { CardManager } from './cards/card-manager';
import { processInput, type CliState, type CliDeps } from './cli';
import type { Database } from 'bun:sqlite';
import type { LLMClient } from './llm/client';
import type { ThyraClient } from './thyra-client/client';
import type { TurnResult } from './conductor/turn-handler';

function createMockLlm(): LLMClient {
  return {
    generateStructured: vi.fn(),
    generateText: vi.fn(),
  } as unknown as LLMClient;
}

function createMockThyra(): ThyraClient {
  return {
    applyVillagePack: vi.fn().mockResolvedValue({
      village_id: 'v1',
      constitution_id: 'c1',
      chief_id: null,
      skills: [],
    }),
    createVillage: vi.fn(),
    createConstitution: vi.fn(),
    createChief: vi.fn(),
    createSkill: vi.fn(),
    getHealth: vi.fn(),
    getVillage: vi.fn(),
    getActiveConstitution: vi.fn(),
    getChiefs: vi.fn(),
    getSkills: vi.fn().mockResolvedValue([]),
  } as unknown as ThyraClient;
}

function defaultTurnResult(): TurnResult {
  return {
    reply: 'test reply',
    intent: { type: 'confirm', summary: 'ok' },
    phase: 'explore',
    phaseChanged: false,
    strategy: 'mirror',
    cardVersion: 1,
    nomodStreak: 0,
  };
}

describe('CLI processInput', () => {
  let db: Database;
  let cardManager: CardManager;
  let llm: LLMClient;
  let thyra: ThyraClient;
  let conversationId: string;
  let state: CliState;
  let deps: CliDeps;
  let mockHandleTurn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    llm = createMockLlm();
    thyra = createMockThyra();
    cardManager = new CardManager(db);

    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'explore')",
      [conversationId],
    );

    state = {
      phase: 'explore',
      mode: 'world_design',
      turn: 0,
      nomodStreak: 0,
      awaitingSettleConfirm: false,
      pendingSettlementId: null,
    };

    mockHandleTurn = vi.fn().mockResolvedValue(defaultTurnResult());

    deps = {
      db, llm, cardManager, thyra, conversationId,
      handleTurn: mockHandleTurn,
      classifySettlement: vi.fn().mockReturnValue('village_pack'),
      buildVillagePack: vi.fn().mockReturnValue('name: test-village\n'),
    };
  });

  // ─── Quit / Skip ───

  it('returns quit for "q"', async () => {
    const result = await processInput('q', state, deps);
    expect(result).toEqual({ action: 'quit' });
  });

  it('returns quit for "exit"', async () => {
    const result = await processInput('exit', state, deps);
    expect(result).toEqual({ action: 'quit' });
  });

  it('returns skip for empty input', async () => {
    const result = await processInput('', state, deps);
    expect(result).toEqual({ action: 'skip' });
  });

  it('returns skip for whitespace-only input', async () => {
    const result = await processInput('   ', state, deps);
    expect(result).toEqual({ action: 'skip' });
  });

  // ─── Normal Turn ───

  it('dispatches normal input to handleTurn and returns updated state', async () => {
    const result = await processInput('I want a fantasy world', state, deps);

    expect(result.action).toBe('continue');
    if (result.action !== 'continue') return;

    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('explore');
    expect(result.output).toContain('test reply');

    expect(mockHandleTurn).toHaveBeenCalledWith(
      llm, cardManager, conversationId,
      'I want a fantasy world', 'explore', 'world_design', 0,
    );
  });

  it('persists user and assistant messages to DB', async () => {
    await processInput('hello', state, deps);

    const messages = db
      .prepare('SELECT role, content, turn FROM messages WHERE conversation_id = ? ORDER BY created_at')
      .all(conversationId) as Record<string, unknown>[];

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'hello', turn: 1 });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'test reply', turn: 1 });
  });

  it('updates conversation phase in DB after turn', async () => {
    mockHandleTurn.mockResolvedValueOnce({
      ...defaultTurnResult(),
      reply: 'focusing now',
      phase: 'focus',
      phaseChanged: true,
      cardVersion: 2,
    });

    const result = await processInput('confirmed rules', state, deps);
    if (result.action !== 'continue') return;

    expect(result.state.phase).toBe('focus');

    const conv = db
      .prepare('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown>;
    expect(conv.phase).toBe('focus');
  });

  it('updates conversation mode when detectedMode is returned', async () => {
    mockHandleTurn.mockResolvedValueOnce({
      ...defaultTurnResult(),
      reply: 'workflow mode',
      detectedMode: 'workflow_design',
    });

    const result = await processInput('define a CI pipeline', state, deps);
    if (result.action !== 'continue') return;

    expect(result.state.mode).toBe('workflow_design');

    const conv = db
      .prepare('SELECT mode FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown>;
    expect(conv.mode).toBe('workflow_design');
  });

  it('increments turn across multiple inputs', async () => {
    const r1 = await processInput('msg 1', state, deps);
    if (r1.action !== 'continue') return;

    const r2 = await processInput('msg 2', r1.state, deps);
    if (r2.action !== 'continue') return;

    expect(r2.state.turn).toBe(2);

    const messages = db
      .prepare("SELECT DISTINCT turn FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY turn")
      .all(conversationId) as Record<string, unknown>[];
    expect(messages.map(r => r.turn)).toEqual([1, 2]);
  });

  // ─── Settlement Confirmation ───

  it('cancels settlement when user says "n"', async () => {
    const settlementId = crypto.randomUUID();
    const cardId = crypto.randomUUID();

    db.run(
      'INSERT INTO cards (id, conversation_id, type, version, content) VALUES (?, ?, ?, ?, ?)',
      [cardId, conversationId, 'world', 1, '{}'],
    );
    db.run(
      'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
      [settlementId, conversationId, cardId, 'village_pack', 'name: test\n', 'draft'],
    );

    const settleState: CliState = {
      ...state,
      awaitingSettleConfirm: true,
      pendingSettlementId: settlementId,
    };

    const result = await processInput('n', settleState, deps);
    if (result.action !== 'continue') return;

    expect(result.output).toBe('Settlement cancelled.');
    expect(result.state.awaitingSettleConfirm).toBe(false);
    expect(result.state.pendingSettlementId).toBeNull();
  });

  it('applies settlement when user says "y"', async () => {
    const settlementId = crypto.randomUUID();
    const cardId = crypto.randomUUID();

    db.run(
      'INSERT INTO cards (id, conversation_id, type, version, content) VALUES (?, ?, ?, ?, ?)',
      [cardId, conversationId, 'world', 1, '{}'],
    );
    db.run(
      'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
      [settlementId, conversationId, cardId, 'village_pack', 'name: test\n', 'draft'],
    );

    const settleState: CliState = {
      ...state,
      awaitingSettleConfirm: true,
      pendingSettlementId: settlementId,
    };

    const result = await processInput('y', settleState, deps);
    if (result.action !== 'continue') return;

    expect(result.output).toContain('Village Pack applied');
    expect(result.state.awaitingSettleConfirm).toBe(false);

    const settlement = db
      .prepare('SELECT status FROM settlements WHERE id = ?')
      .get(settlementId) as Record<string, unknown>;
    expect(settlement.status).toBe('applied');
  });

  it('handles thyra failure during settlement apply', async () => {
    const settlementId = crypto.randomUUID();
    const cardId = crypto.randomUUID();

    db.run(
      'INSERT INTO cards (id, conversation_id, type, version, content) VALUES (?, ?, ?, ?, ?)',
      [cardId, conversationId, 'world', 1, '{}'],
    );
    db.run(
      'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
      [settlementId, conversationId, cardId, 'village_pack', 'name: test\n', 'draft'],
    );

    (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Thyra offline'),
    );

    const settleState: CliState = {
      ...state,
      awaitingSettleConfirm: true,
      pendingSettlementId: settlementId,
    };

    const result = await processInput('y', settleState, deps);
    if (result.action !== 'continue') return;

    expect(result.output).toContain('Failed to apply Village Pack');

    const settlement = db
      .prepare('SELECT status FROM settlements WHERE id = ?')
      .get(settlementId) as Record<string, unknown>;
    expect(settlement.status).toBe('failed');
  });

  it('persists settlement confirmation messages in DB', async () => {
    const settlementId = crypto.randomUUID();
    const cardId = crypto.randomUUID();

    db.run(
      'INSERT INTO cards (id, conversation_id, type, version, content) VALUES (?, ?, ?, ?, ?)',
      [cardId, conversationId, 'world', 1, '{}'],
    );
    db.run(
      'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
      [settlementId, conversationId, cardId, 'village_pack', 'name: test\n', 'draft'],
    );

    const settleState: CliState = {
      ...state,
      awaitingSettleConfirm: true,
      pendingSettlementId: settlementId,
    };

    await processInput('n', settleState, deps);

    const messages = db
      .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at')
      .all(conversationId) as Record<string, unknown>[];

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'n' });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'Settlement cancelled.' });
  });
});
