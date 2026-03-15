import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { CardManager } from '../cards/card-manager';
import type { ThyraClient } from '../thyra-client/client';
import { classifySettlement } from '../settlement/router';
import { buildVillagePack } from '../settlement/village-pack-builder';
import type { WorldCard } from '../schemas/card';

export interface SettlementDeps {
  db: Database;
  cardManager: CardManager;
  thyra: ThyraClient;
}

export function settlementRoutes(deps: SettlementDeps): Hono {
  const app = new Hono();

  // POST /api/conversations/:id/settle
  app.post('/api/conversations/:id/settle', async (c) => {
    const conversationId = c.req.param('id');

    const conv = deps.db
      .query('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown> | null;

    if (!conv) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }

    if (conv.phase !== 'settle') {
      return error(
        c,
        'INVALID_STATE',
        'Conversation is not in settle phase',
        400,
      );
    }

    const card = deps.cardManager.getLatest(conversationId);
    if (!card) {
      return error(c, 'NO_CARD', 'No card found for conversation', 400);
    }

    const target = classifySettlement(card.type, card.content);
    if (!target) {
      return ok(c, { target: null, status: 'no_settlement_target' });
    }

    if (target === 'village_pack') {
      const yaml = buildVillagePack(card.content as WorldCard);
      const settlementId = crypto.randomUUID();
      try {
        const result = await deps.thyra.applyVillagePack(yaml);
        deps.db.run(
          'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status, thyra_response) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [settlementId, conversationId, card.id, target, yaml, 'applied', JSON.stringify(result)],
        );
        return ok(c, { target, yaml, status: 'applied', thyra: result });
      } catch (err) {
        deps.db.run(
          'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
          [settlementId, conversationId, card.id, target, yaml, 'failed'],
        );
        return error(
          c,
          'UPSTREAM_ERROR',
          err instanceof Error ? err.message : 'Thyra API failed',
          502,
        );
      }
    }

    return ok(c, { target, status: 'unsupported' });
  });

  return app;
}
