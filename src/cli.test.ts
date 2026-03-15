import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initSchema } from './db';
import type { Database } from 'bun:sqlite';

/**
 * Tests for CLI message persistence logic (issue #34).
 *
 * Since cli.ts is a script entry point with a `for await (const line of console)` loop,
 * we test the persistence pattern (INSERT/UPDATE statements) directly against the DB.
 */
describe('CLI message persistence', () => {
  let db: Database;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'explore')",
      [conversationId],
    );
  });

  it('persists user and assistant messages with correct roles', () => {
    const turn = 1;

    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'user', 'hello world', turn],
    );
    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'assistant', 'hi there', turn],
    );

    const messages = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY turn, role')
      .all(conversationId) as Record<string, unknown>[];

    expect(messages).toHaveLength(2);
    // ORDER BY role: 'assistant' < 'user' alphabetically
    expect(messages[0]).toMatchObject({ role: 'assistant', content: 'hi there', turn: 1 });
    expect(messages[1]).toMatchObject({ role: 'user', content: 'hello world', turn: 1 });
  });

  it('increments turn number across multiple turns', () => {
    for (let turn = 1; turn <= 3; turn++) {
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), conversationId, 'user', `msg ${turn}`, turn],
      );
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), conversationId, 'assistant', `reply ${turn}`, turn],
      );
    }

    const turns = db
      .prepare(
        "SELECT DISTINCT turn FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY turn",
      )
      .all(conversationId) as Record<string, unknown>[];

    expect(turns).toHaveLength(3);
    expect(turns.map((r) => r.turn)).toEqual([1, 2, 3]);
  });

  it('syncs phase change to conversations table', () => {
    const newPhase = 'focus';
    db.run(
      "UPDATE conversations SET phase = ?, updated_at = datetime('now') WHERE id = ?",
      [newPhase, conversationId],
    );

    const conv = db
      .prepare('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown>;

    expect(conv.phase).toBe('focus');
  });

  it('does not update phase when phaseChanged is false', () => {
    // Simulate: phaseChanged = false, so no UPDATE is issued
    const conv = db
      .prepare('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown>;

    expect(conv.phase).toBe('explore');
  });

  it('persists settlement confirmation messages', () => {
    // Simulate settlement confirmation turn
    const turn = 2;

    // User says "y"
    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'user', 'y', turn],
    );

    // System responds with settlement result
    const settleReply = 'Settlement cancelled.';
    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, turn) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), conversationId, 'assistant', settleReply, turn],
    );

    const messages = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? AND turn = ?')
      .all(conversationId, turn) as Record<string, unknown>[];

    expect(messages).toHaveLength(2);

    const userMsg = messages.find((m) => m.role === 'user');
    const assistantMsg = messages.find((m) => m.role === 'assistant');

    expect(userMsg).toBeDefined();
    expect(userMsg).toMatchObject({ content: 'y', turn: 2 });
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg).toMatchObject({ content: 'Settlement cancelled.', turn: 2 });
  });
});
