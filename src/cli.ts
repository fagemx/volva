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
  const cardManager = new CardManager();
  const thyra = new ThyraClient();

  const conversationId = crypto.randomUUID();
  db.run(
    "INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'explore')",
    [conversationId],
  );

  let phase: Phase = 'explore';
  let awaitingSettleConfirm = false;
  let pendingYaml: string | null = null;

  console.log('Volva CLI — type your thoughts, q to quit\n');

  for await (const line of console) {
    const input = line.trim();
    if (input === 'q' || input === 'exit') break;
    if (!input) continue;

    // Handle settlement confirmation
    if (awaitingSettleConfirm) {
      if (input === 'y' || input === 'yes') {
        if (pendingYaml) {
          try {
            const result = await thyra.applyVillagePack(pendingYaml);
            console.log('\nVillage Pack applied successfully.', result);
          } catch (err) {
            console.error('\nFailed to apply Village Pack:', err);
          }
        }
      } else {
        console.log('\nSettlement cancelled.');
      }
      awaitingSettleConfirm = false;
      pendingYaml = null;
      continue;
    }

    const result = await handleTurn(
      llm,
      cardManager,
      conversationId,
      input,
      phase,
    );
    phase = result.phase;

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
