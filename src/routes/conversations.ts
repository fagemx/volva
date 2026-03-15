import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import type { ThyraClient } from '../thyra-client/client';
import { handleTurn } from '../conductor/turn-handler';
import { loadVillageState } from '../cards/village-loader';

export interface ConversationDeps {
  db: Database;
  llm: LLMClient;
  cardManager: CardManager;
  thyra?: ThyraClient;
}

export function conversationRoutes(deps: ConversationDeps): Hono {
  const app = new Hono();

  // POST /api/conversations
  app.post('/api/conversations', async (c) => {
    const body: Record<string, unknown> = await c.req.json();
    const mode = typeof body.mode === 'string' ? body.mode : 'world_design';
    const villageId = typeof body.village_id === 'string' ? body.village_id : undefined;

    if (!['world_design', 'workflow_design', 'task'].includes(mode)) {
      return error(c, 'INVALID_INPUT', `Invalid mode: ${mode}`, 400);
    }

    const id = crypto.randomUUID();
    let phase: 'explore' | 'focus' | 'settle' = 'explore';
    let preloaded = false;

    if (villageId && deps.thyra) {
      try {
        const [village, constitution, chiefs] = await Promise.all([
          deps.thyra.getVillage(villageId),
          deps.thyra.getActiveConstitution(villageId),
          deps.thyra.getChiefs(villageId),
        ]);

        const worldCard = loadVillageState(village, constitution, chiefs);

        // Determine starting phase based on loaded card content
        if (worldCard.confirmed.hard_rules.length > 0 && worldCard.confirmed.must_have.length >= 3) {
          phase = 'focus';
        }

        deps.db.run(
          'INSERT INTO conversations (id, mode, phase, village_id) VALUES (?, ?, ?, ?)',
          [id, mode, phase, villageId],
        );

        deps.cardManager.create(id, 'world', worldCard);
        preloaded = true;
      } catch (err) {
        console.error('[conversations] Failed to load village:', err);
        return error(
          c,
          'THYRA_UNAVAILABLE',
          err instanceof Error ? err.message : 'Failed to load village from Thyra',
          502,
        );
      }
    } else {
      deps.db.run(
        "INSERT INTO conversations (id, mode, phase, village_id) VALUES (?, ?, ?, ?)",
        [id, mode, phase, villageId ?? null],
      );
    }

    return ok(c, { id, mode, phase, village_id: villageId ?? null, preloaded }, 201);
  });

  // POST /api/conversations/:id/messages
  app.post('/api/conversations/:id/messages', async (c) => {
    const conversationId = c.req.param('id');
    const body: Record<string, unknown> = await c.req.json();
    const content = body.content;

    if (!content || typeof content !== 'string') {
      return error(c, 'INVALID_INPUT', 'content is required', 400);
    }

    const conv = deps.db
      .query('SELECT phase, mode FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown> | null;

    if (!conv) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }

    const phase = conv.phase as string;
    const mode = conv.mode as string;

    // Count existing messages to determine turn number
    const turnRow = deps.db
      .query(
        'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND role = ?',
      )
      .get(conversationId, 'user') as Record<string, unknown> | null;
    const count = turnRow ? (turnRow.count as number) : 0;
    const turn = count + 1;

    // Persist user message
    deps.db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'user', content, turn],
    );

    try {
      const result = await handleTurn(
        deps.llm,
        deps.cardManager,
        conversationId,
        content,
        phase as 'explore' | 'focus' | 'settle',
        mode as 'world_design' | 'workflow_design' | 'task',
      );

      // Persist assistant reply
      deps.db.run(
        'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), conversationId, 'assistant', result.reply, turn],
      );

      if (result.detectedMode) {
        deps.db.run(
          "UPDATE conversations SET mode = ?, updated_at = datetime('now') WHERE id = ?",
          [result.detectedMode, conversationId],
        );
      }

      if (result.phase !== phase) {
        deps.db.run(
          "UPDATE conversations SET phase = ?, updated_at = datetime('now') WHERE id = ?",
          [result.phase, conversationId],
        );
      }

      return ok(c, {
        reply: result.reply,
        phase: result.phase,
        strategy: result.strategy,
        cardVersion: result.cardVersion,
      });
    } catch (err) {
      return error(
        c,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Unknown error',
        500,
      );
    }
  });

  return app;
}
