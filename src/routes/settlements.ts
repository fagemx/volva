import { Hono } from 'hono';
import yaml from 'js-yaml';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { CardManager } from '../cards/card-manager';
import type { ThyraClient } from '../thyra-client/client';
import type { KarviClient } from '../karvi-client/client';
import { classifySettlement } from '../settlement/router';
import { buildVillagePack } from '../settlement/village-pack-builder';
import { buildWorkflowSpec } from '../settlement/workflow-spec-builder';
import { buildTaskSpec } from '../settlement/task-spec-builder';
import { buildCommerceSpec } from '../settlement/commerce-spec-builder';
import { buildOrgHierarchy } from '../settlement/org-hierarchy-builder';
import { buildPipelineSpec } from '../settlement/pipeline-spec-builder';
import { buildAdapterConfig } from '../settlement/adapter-config-builder';
import type { AnyCard, WorldCard, WorkflowCard, TaskCard, PipelineCard, AdapterCard, CommerceCard, OrgCard } from '../schemas/card';
import type { SettlementTarget } from '../schemas/settlement';

const builderMap: Record<SettlementTarget, (content: AnyCard) => string> = {
  village_pack: (c) => buildVillagePack(c as WorldCard),
  workflow: (c) => buildWorkflowSpec(c as WorkflowCard),
  market_init: (c) => buildCommerceSpec(c as CommerceCard),
  org_hierarchy: (c) => buildOrgHierarchy(c as OrgCard),
  pipeline: (c) => buildPipelineSpec(c as PipelineCard),
  adapter_config: (c) => buildAdapterConfig(c as AdapterCard),
  task: (c) => buildTaskSpec(c as TaskCard),
};

function persistDraft(
  db: Database,
  conversationId: string,
  cardId: string,
  target: SettlementTarget,
  payload: string,
): { id: string; target: SettlementTarget; payload: string; status: 'draft' } {
  const id = crypto.randomUUID();
  db.run(
    'INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
    [id, conversationId, cardId, target, payload, 'draft'],
  );
  return { id, target, payload, status: 'draft' };
}

export interface SettlementDeps {
  db: Database;
  cardManager: CardManager;
  thyra: ThyraClient;
  karvi: KarviClient;
}

async function confirmVillagePack(deps: SettlementDeps, payload: string): Promise<unknown> {
  return deps.thyra.applyVillagePack(payload);
}

async function confirmPipeline(deps: SettlementDeps, payload: string): Promise<unknown> {
  const spec = yaml.load(payload) as {
    pipeline: { name: string };
    steps: Array<{
      order: number;
      type: string;
      label: string;
      skill_name: string | null;
      instruction: string | null;
    }>;
    proposed_skills?: Array<{
      name: string;
      type: string;
      description: string;
    }>;
  };

  // Register proposed skills via Thyra (graceful degradation per skill)
  const skillResults: Array<{ name: string; ok: boolean; error?: string }> = [];
  if (spec.proposed_skills && spec.proposed_skills.length > 0) {
    for (const skill of spec.proposed_skills) {
      try {
        await deps.thyra.createSkill({
          name: skill.name,
          type: skill.type,
          description: skill.description,
        });
        skillResults.push({ name: skill.name, ok: true });
      } catch (err) {
        console.error(`[settlement] createSkill failed for ${skill.name}:`, err);
        skillResults.push({
          name: skill.name,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }

  const pipelineResult = await deps.karvi.registerPipeline({
    name: spec.pipeline.name,
    steps: spec.steps.map((s) => ({
      order: s.order,
      type: s.type,
      label: s.label,
      skill_name: s.skill_name,
      instruction: s.instruction,
    })),
  });
  return { ...pipelineResult as Record<string, unknown>, skill_registrations: skillResults };
}

function stubResult(target: string, payload: string): unknown {
  return { applied: true, target, payload_size: payload.length };
}

const confirmMap: Record<SettlementTarget, (deps: SettlementDeps, payload: string) => Promise<unknown>> = {
  village_pack: confirmVillagePack,
  pipeline: confirmPipeline,
  workflow: (_d, p) => Promise.resolve(stubResult('workflow', p)),
  task: (_d, p) => Promise.resolve(stubResult('task', p)),
  adapter_config: (_d, p) => Promise.resolve(stubResult('adapter_config', p)),
  market_init: (_d, p) => Promise.resolve(stubResult('market_init', p)),
  org_hierarchy: (_d, p) => Promise.resolve(stubResult('org_hierarchy', p)),
};

async function confirmSettlement(deps: SettlementDeps, target: string, payload: string): Promise<unknown> {
  const handler = confirmMap[target as SettlementTarget];
  return handler(deps, payload);
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

    const build = builderMap[target];
    const payload = build(card.content);
    return ok(c, persistDraft(deps.db, conversationId, card.id, target, payload));
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

    const target = settlement.target as string;

    // Transition: draft -> confirmed
    deps.db.run(
      'UPDATE settlements SET status = ? WHERE id = ?',
      ['confirmed', settlementId],
    );

    try {
      const result = await confirmSettlement(deps, target, payload);

      // Transition: confirmed -> applied
      deps.db.run(
        'UPDATE settlements SET status = ?, thyra_response = ? WHERE id = ?',
        ['applied', JSON.stringify(result), settlementId],
      );
      return ok(c, { id: settlementId, status: 'applied', result });
    } catch (err) {
      // Transition: confirmed -> failed
      deps.db.run(
        'UPDATE settlements SET status = ? WHERE id = ?',
        ['failed', settlementId],
      );
      return error(
        c,
        'UPSTREAM_ERROR',
        err instanceof Error ? err.message : 'Upstream API failed',
        502,
      );
    }
  });

  return app;
}
