import { createDb, initSchema } from './db';
import { LLMClient } from './llm/client';
import { CardManager } from './cards/card-manager';
import { handleTurn as defaultHandleTurn, type TurnResult } from './conductor/turn-handler';
import { classifySettlement as defaultClassifySettlement } from './settlement/router';
import { buildVillagePack as defaultBuildVillagePack } from './settlement/village-pack-builder';
import { ThyraClient } from './thyra-client/client';
import type { Database } from 'bun:sqlite';
import type { Phase } from './conductor/state-machine';
import type { ConversationMode } from './schemas/conversation';
import type { AnyCard, CardType, WorldCard } from './schemas/card';

// ─── Exported Types ───

export interface CliState {
  phase: Phase;
  mode: ConversationMode;
  turn: number;
  nomodStreak: number;
  awaitingSettleConfirm: boolean;
  pendingSettlementId: string | null;
}

export interface CliDeps {
  db: Database;
  llm: LLMClient;
  cardManager: CardManager;
  thyra: ThyraClient;
  conversationId: string;
  handleTurn?: (
    llm: LLMClient, cardManager: CardManager, conversationId: string,
    userMessage: string, currentPhase: Phase, mode: ConversationMode, nomodStreak: number,
  ) => Promise<TurnResult>;
  classifySettlement?: (cardType: CardType, card: AnyCard) => string | null;
  buildVillagePack?: (card: WorldCard) => string;
}

export type InputResult =
  | { action: 'quit' }
  | { action: 'skip' }
  | { action: 'continue'; state: CliState; output: string };

// ─── Core Logic ───

export async function processInput(
  input: string,
  state: CliState,
  deps: CliDeps,
): Promise<InputResult> {
  const trimmed = input.trim();
  if (trimmed === 'q' || trimmed === 'exit') return { action: 'quit' };
  if (!trimmed) return { action: 'skip' };

  const { db, llm, cardManager, thyra, conversationId } = deps;
  const handleTurn = deps.handleTurn ?? defaultHandleTurn;
  const classifySettlement = deps.classifySettlement ?? defaultClassifySettlement;
  const buildVillagePack = deps.buildVillagePack ?? defaultBuildVillagePack;
  const next = { ...state };

  // Handle settlement confirmation
  if (state.awaitingSettleConfirm && state.pendingSettlementId) {
    next.turn += 1;
    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'user', trimmed, next.turn],
    );

    let settleReply: string;
    if (trimmed === 'y' || trimmed === 'yes') {
      const settlement = db
        .query('SELECT * FROM settlements WHERE id = ? AND status = ?')
        .get(state.pendingSettlementId, 'draft') as Record<string, unknown> | null;

      if (settlement) {
        db.run(
          'UPDATE settlements SET status = ? WHERE id = ?',
          ['confirmed', state.pendingSettlementId],
        );
        try {
          const result = await thyra.applyVillagePack(settlement.payload as string);
          db.run(
            'UPDATE settlements SET status = ?, thyra_response = ? WHERE id = ?',
            ['applied', JSON.stringify(result), state.pendingSettlementId],
          );
          settleReply = `Village Pack applied: village=${result.village_id}, constitution=${result.constitution_id}, chief=${result.chief_id ?? 'none'}, skills=${result.skills.length}`;
        } catch (err) {
          db.run(
            'UPDATE settlements SET status = ? WHERE id = ?',
            ['failed', state.pendingSettlementId],
          );
          settleReply = 'Failed to apply Village Pack: ' + String(err);
        }
      } else {
        settleReply = 'No draft settlement found.';
      }
    } else {
      settleReply = 'Settlement cancelled.';
    }

    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'assistant', settleReply, next.turn],
    );

    next.awaitingSettleConfirm = false;
    next.pendingSettlementId = null;
    return { action: 'continue', state: next, output: settleReply };
  }

  // Normal turn
  next.turn += 1;
  db.run(
    'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), conversationId, 'user', trimmed, next.turn],
  );

  const result = await handleTurn(
    llm,
    cardManager,
    conversationId,
    trimmed,
    state.phase,
    state.mode,
    state.nomodStreak,
  );
  next.phase = result.phase;
  next.nomodStreak = result.nomodStreak;

  if (result.detectedMode) {
    next.mode = result.detectedMode;
    db.run(
      "UPDATE conversations SET mode = ?, updated_at = datetime('now') WHERE id = ?",
      [next.mode, conversationId],
    );
  }

  db.run(
    'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), conversationId, 'assistant', result.reply, next.turn],
  );

  db.run(
    "UPDATE conversations SET phase = ?, nomod_streak = ?, updated_at = datetime('now') WHERE id = ?",
    [result.phase, result.nomodStreak, conversationId],
  );

  const output = `[${result.strategy}] ${result.reply}`;

  // Check for settlement trigger
  if (result.phase === 'settle' && result.intent.type === 'settle_signal') {
    const card = cardManager.getLatest(conversationId);
    if (card) {
      const target = classifySettlement(card.type, card.content);
      if (target === 'village_pack') {
        const yaml = buildVillagePack(card.content as WorldCard);
        const settlementId = crypto.randomUUID();
        db.run(
          'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
          [settlementId, conversationId, card.id, target, yaml, 'draft'],
        );
        next.awaitingSettleConfirm = true;
        next.pendingSettlementId = settlementId;
      }
    }
  }

  return { action: 'continue', state: next, output };
}

// ─── CLI Entry Point ───

async function runCli() {
  const dbPath = process.env.VOLVA_DB_PATH || ':memory:';
  const db = createDb(dbPath);
  initSchema(db);
  const llm = new LLMClient();
  const cardManager = new CardManager(db);
  const thyra = new ThyraClient();

  const conversationId = crypto.randomUUID();
  db.run(
    "INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'explore')",
    [conversationId],
  );

  let state: CliState = {
    phase: 'explore',
    mode: 'world_design',
    turn: 0,
    nomodStreak: 0,
    awaitingSettleConfirm: false,
    pendingSettlementId: null,
  };

  const deps: CliDeps = { db, llm, cardManager, thyra, conversationId };

  console.log('Volva CLI — type your thoughts, q to quit\n');

  for await (const line of console) {
    const result = await processInput(line, state, deps);
    if (result.action === 'quit') break;
    if (result.action === 'skip') continue;
    console.log('\n' + result.output + '\n');
    state = result.state;
  }

  db.close();
}

runCli().catch(console.error);
