import { createDb, initSchema } from './db';
import { LLMClient } from './llm/client';
import { CardManager } from './cards/card-manager';
import { handleTurn } from './conductor/turn-handler';
import { classifySettlement } from './settlement/router';
import { buildVillagePack } from './settlement/village-pack-builder';
import { ThyraClient } from './thyra-client/client';
import type { Phase } from './conductor/state-machine';
import type { ConversationMode } from './schemas/conversation';
import type { WorldCard } from './schemas/card';

async function runCli() {
  const db = createDb();
  initSchema(db);
  const llm = new LLMClient();
  const cardManager = new CardManager(db);
  const thyra = new ThyraClient();

  const conversationId = crypto.randomUUID();
  db.run(
    "INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'explore')",
    [conversationId],
  );

  let phase: Phase = 'explore';
  let mode: ConversationMode = 'world_design';
  let turn = 0;
  let nomodStreak = 0;
  let awaitingSettleConfirm = false;
  let pendingSettlementId: string | null = null;

  console.log('Volva CLI — type your thoughts, q to quit\n');

  for await (const line of console) {
    const input = line.trim();
    if (input === 'q' || input === 'exit') break;
    if (!input) continue;

    // Handle settlement confirmation
    if (awaitingSettleConfirm && pendingSettlementId) {
      turn += 1;
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), conversationId, 'user', input, turn],
      );

      let settleReply: string;
      if (input === 'y' || input === 'yes') {
        const settlement = db
          .query('SELECT * FROM settlements WHERE id = ? AND status = ?')
          .get(pendingSettlementId, 'draft') as Record<string, unknown> | null;

        if (settlement) {
          // Transition: draft -> confirmed
          db.run(
            'UPDATE settlements SET status = ? WHERE id = ?',
            ['confirmed', pendingSettlementId],
          );
          try {
            const result = await thyra.applyVillagePack(settlement.payload as string);
            // Transition: confirmed -> applied
            db.run(
              'UPDATE settlements SET status = ?, thyra_response = ? WHERE id = ?',
              ['applied', JSON.stringify(result), pendingSettlementId],
            );
            settleReply = `Village Pack applied: village=${result.village_id}, constitution=${result.constitution_id}, chief=${result.chief_id ?? 'none'}, skills=${result.skills.length}`;
            console.log('\n' + settleReply);
          } catch (err) {
            // Transition: confirmed -> failed
            db.run(
              'UPDATE settlements SET status = ? WHERE id = ?',
              ['failed', pendingSettlementId],
            );
            settleReply = 'Failed to apply Village Pack: ' + String(err);
            console.error('\n' + settleReply);
          }
        } else {
          settleReply = 'No draft settlement found.';
          console.log('\n' + settleReply);
        }
      } else {
        settleReply = 'Settlement cancelled.';
        console.log('\n' + settleReply);
      }

      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), conversationId, 'assistant', settleReply, turn],
      );

      awaitingSettleConfirm = false;
      pendingSettlementId = null;
      continue;
    }

    turn += 1;
    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'user', input, turn],
    );

    const result = await handleTurn(
      llm,
      cardManager,
      conversationId,
      input,
      phase,
      mode,
      nomodStreak,
    );
    phase = result.phase;
    nomodStreak = result.nomodStreak;

    if (result.detectedMode) {
      mode = result.detectedMode;
      db.run(
        "UPDATE conversations SET mode = ?, updated_at = datetime('now') WHERE id = ?",
        [mode, conversationId],
      );
    }

    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'assistant', result.reply, turn],
    );

    db.run(
      "UPDATE conversations SET phase = ?, nomod_streak = ?, updated_at = datetime('now') WHERE id = ?",
      [result.phase, result.nomodStreak, conversationId],
    );

    console.log(`\n[${result.strategy}] ${result.reply}\n`);

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
          console.log('\n--- Village Pack YAML ---\n');
          console.log(yaml);
          console.log('\nApply to Thyra? (y/n)');
          awaitingSettleConfirm = true;
          pendingSettlementId = settlementId;
        }
      }
    }
  }

  db.close();
}

runCli().catch(console.error);
