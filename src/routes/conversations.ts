import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import type { ThyraClient } from '../thyra-client/client';
import { handleTurn } from '../conductor/turn-handler';
import { handleManagementTurn } from '../conductor/management-handler';
import { loadVillageState } from '../cards/village-loader';
import type { SkillData } from '../thyra-client/schemas';
import { CreateConversationInput, type ConversationMode } from '../schemas/conversation';

// ─── Input Schemas ───

const SendMessageInput = z.object({
  content: z.string().min(1),
});

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
    const body: unknown = await c.req.json();
    const parsed = CreateConversationInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const mode = parsed.data.mode;
    const villageId = parsed.data.village_id;

    if (mode === 'world_management' && !villageId) {
      return error(c, 'INVALID_INPUT', 'village_id is required for world_management mode', 400);
    }

    if (mode === 'world_management' && !deps.thyra) {
      return error(c, 'INVALID_INPUT', 'Thyra client is required for world_management mode', 400);
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

    // Fetch available skills for workflow_design mode
    let skills: SkillData[] = [];
    if (mode === 'workflow_design' && deps.thyra) {
      try {
        skills = await deps.thyra.getSkills();
      } catch (err) {
        console.error('[conversations] Failed to fetch skills:', err);
        // Graceful degradation — continue without skills
      }
    }

    if (skills.length > 0) {
      deps.db.run(
        "UPDATE conversations SET skills_json = ? WHERE id = ?",
        [JSON.stringify(skills), id],
      );
    }

    return ok(c, { id, mode, phase, village_id: villageId ?? null, preloaded }, 201);
  });

  // POST /api/conversations/:id/messages
  app.post('/api/conversations/:id/messages', async (c) => {
    const conversationId = c.req.param('id');
    const body: unknown = await c.req.json();
    const msgParsed = SendMessageInput.safeParse(body);
    if (!msgParsed.success) {
      return error(c, 'INVALID_INPUT', 'content is required', 400);
    }

    const content = msgParsed.data.content;

    const conv = deps.db
      .query('SELECT phase, mode, nomod_streak, skills_json, village_id FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown> | null;

    if (!conv) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }

    const phase = conv.phase as string;
    const mode = conv.mode as string;
    const nomodStreak = conv.nomod_streak as number;
    const skillsJson = conv.skills_json as string | null;
    const skills: SkillData[] = skillsJson ? JSON.parse(skillsJson) as SkillData[] : [];

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
      // Management mode: query-only, no card creation, no phase transitions
      if (mode === 'world_management') {
        const villageId = conv.village_id as string;
        if (!deps.thyra) {
          return error(c, 'INVALID_INPUT', 'Thyra client is required for world_management mode', 400);
        }

        const mgmtResult = await handleManagementTurn(deps.llm, deps.thyra, villageId, content);

        deps.db.run(
          'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
          [crypto.randomUUID(), conversationId, 'assistant', mgmtResult.reply, turn],
        );

        deps.db.run(
          "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
          [conversationId],
        );

        return ok(c, {
          reply: mgmtResult.reply,
          phase,
          strategy: mgmtResult.strategy,
          action: mgmtResult.action,
        });
      }

      const result = await handleTurn(
        deps.llm,
        deps.cardManager,
        conversationId,
        content,
        phase as 'explore' | 'focus' | 'settle',
        mode as ConversationMode,
        nomodStreak,
        skills.length > 0 ? skills : undefined,
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

      deps.db.run(
        "UPDATE conversations SET phase = ?, nomod_streak = ?, updated_at = datetime('now') WHERE id = ?",
        [result.phase, result.nomodStreak, conversationId],
      );

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
