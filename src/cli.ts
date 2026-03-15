import { createDb, initSchema } from './db';
import { LLMClient } from './llm/client';
import { CardManager } from './cards/card-manager';
import { handleTurn } from './conductor/turn-handler';
import { classifySettlement } from './settlement/router';
import { buildVillagePack } from './settlement/village-pack-builder';
import { ThyraClient } from './thyra-client/client';
import type { Phase } from './conductor/state-machine';
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
  let turn = 0;
  let awaitingSettleConfirm = false;
  let pendingYaml: string | null = null;

  console.log('Volva CLI — type your thoughts, q to quit\n');

  for await (const line of console) {
    const input = line.trim();
    if (input === 'q' || input === 'exit') break;
    if (!input) continue;

    // Handle settlement confirmation
    if (awaitingSettleConfirm) {
      turn += 1;
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), conversationId, 'user', input, turn],
      );

      let settleReply: string;
      if (input === 'y' || input === 'yes') {
        if (pendingYaml) {
          try {
            const result = await thyra.applyVillagePack(pendingYaml);
            settleReply = 'Village Pack applied successfully. ' + JSON.stringify(result);
            console.log('\n' + settleReply);
          } catch (err) {
            settleReply = 'Failed to apply Village Pack: ' + String(err);
            console.error('\n' + settleReply);
          }
        } else {
          settleReply = 'No pending YAML to apply.';
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
      pendingYaml = null;
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
      'world_design',
    );
    phase = result.phase;

    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'assistant', result.reply, turn],
    );

    if (result.phaseChanged) {
      db.run(
        "UPDATE conversations SET phase = ?, updated_at = datetime('now') WHERE id = ?",
        [result.phase, conversationId],
      );
    }

    console.log(`\n[${result.strategy}] ${result.reply}\n`);

    // Check for settlement trigger
    if (result.phase === 'settle' && result.intent.type === 'settle_signal') {
      const card = cardManager.getLatest(conversationId);
      if (card) {
        const target = classifySettlement(card.type, card.content);
        if (target === 'village_pack') {
          const yaml = buildVillagePack(card.content as WorldCard);
          console.log('\n--- Village Pack YAML ---\n');
          console.log(yaml);
          console.log('\nApply to Thyra? (y/n)');
          awaitingSettleConfirm = true;
          pendingYaml = yaml;
        }
      }
    }
  }

  db.close();
}

runCli().catch(console.error);
