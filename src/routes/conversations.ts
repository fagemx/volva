import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import { handleTurn } from '../conductor/turn-handler';

export interface ConversationDeps {
  db: Database;
  llm: LLMClient;
  cardManager: CardManager;
}

export function conversationRoutes(deps: ConversationDeps): Hono {
  const app = new Hono();

  // POST /api/conversations
  app.post('/api/conversations', async (c) => {
    const body: Record<string, unknown> = await c.req.json();
    const mode = typeof body.mode === 'string' ? body.mode : 'world_design';

    if (!['world_design', 'workflow_design', 'task'].includes(mode)) {
      return error(c, 'INVALID_INPUT', `Invalid mode: ${mode}`, 400);
    }

    const id = crypto.randomUUID();
    deps.db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, ?, 'explore')",
      [id, mode],
    );
    return ok(c, { id, mode, phase: 'explore' }, 201);
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
      .query('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown> | null;

    if (!conv) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }

    const phase = conv.phase as string;

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
      );

      // Persist assistant reply
      deps.db.run(
        'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), conversationId, 'assistant', result.reply, turn],
      );

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
