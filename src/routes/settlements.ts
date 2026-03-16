import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { CardManager } from '../cards/card-manager';
import type { ThyraClient } from '../thyra-client/client';
import { classifySettlement } from '../settlement/router';
import { buildVillagePack } from '../settlement/village-pack-builder';
import { buildWorkflowSpec } from '../settlement/workflow-spec-builder';
import { buildTaskSpec } from '../settlement/task-spec-builder';
import { buildCommerceSpec } from '../settlement/commerce-spec-builder';
import { buildOrgHierarchy } from '../settlement/org-hierarchy-builder';
import type { WorldCard, WorkflowCard, TaskCard, CommerceCard, OrgCard } from '../schemas/card';

export interface SettlementDeps {
  db: Database;
  cardManager: CardManager;
  thyra: ThyraClient;
}

export function settlementRoutes(deps: SettlementDeps): Hono {
  const app = new Hono();

  // POST /api/conversations/:id/settle — creates a draft settlement record
  app.post('/api/conversations/:id/settle', (c) => {
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
      deps.db.run(
        'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
        [settlementId, conversationId, card.id, target, yaml, 'draft'],
      );
      return ok(c, { id: settlementId, target, payload: yaml, status: 'draft' });
    }

    if (target === 'workflow') {
      const yaml = buildWorkflowSpec(card.content as WorkflowCard);
      const settlementId = crypto.randomUUID();
      deps.db.run(
        'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
        [settlementId, conversationId, card.id, target, yaml, 'draft'],
      );
      return ok(c, { id: settlementId, target, payload: yaml, status: 'draft' });
    }

    if (target === 'market_init') {
      const json = buildCommerceSpec(card.content as CommerceCard);
      const settlementId = crypto.randomUUID();
      deps.db.run(
        'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
        [settlementId, conversationId, card.id, target, json, 'draft'],
      );
      return ok(c, { id: settlementId, target, payload: json, status: 'draft' });
    }

    if (target === 'org_hierarchy') {
      const yamlStr = buildOrgHierarchy(card.content as OrgCard);
      const settlementId = crypto.randomUUID();
      deps.db.run(
        'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
        [settlementId, conversationId, card.id, target, yamlStr, 'draft'],
      );
      return ok(c, { id: settlementId, target, payload: yamlStr, status: 'draft' });
    }

    // target === 'task'
    const json = buildTaskSpec(card.content as TaskCard);
    const settlementId = crypto.randomUUID();
    deps.db.run(
      'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
      [settlementId, conversationId, card.id, target, json, 'draft'],
    );
    return ok(c, { id: settlementId, target, payload: json, status: 'draft' });
  });

  // POST /api/conversations/:id/settle/confirm — confirms a draft settlement
  app.post('/api/conversations/:id/settle/confirm', async (c) => {
    const conversationId = c.req.param('id');

    const settlement = deps.db
      .query(
        'SELECT * FROM settlements WHERE conversation_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(conversationId, 'draft') as Record<string, unknown> | null;

    if (!settlement) {
      return error(c, 'NO_DRAFT', 'No draft settlement found', 404);
    }

    const settlementId = settlement.id as string;
    const payload = settlement.payload as string;

    // Transition: draft -> confirmed
    deps.db.run(
      'UPDATE settlements SET status = ? WHERE id = ?',
      ['confirmed', settlementId],
    );

    try {
      const result = await deps.thyra.applyVillagePack(payload);
      // Transition: confirmed -> applied
      deps.db.run(
        'UPDATE settlements SET status = ?, thyra_response = ? WHERE id = ?',
        ['applied', JSON.stringify(result), settlementId],
      );
      return ok(c, { id: settlementId, status: 'applied', thyra: result });
    } catch (err) {
      // Transition: confirmed -> failed
      deps.db.run(
        'UPDATE settlements SET status = ? WHERE id = ?',
        ['failed', settlementId],
      );
      return error(
        c,
        'UPSTREAM_ERROR',
        err instanceof Error ? err.message : 'Thyra API failed',
        502,
      );
    }
  });

  return app;
}
