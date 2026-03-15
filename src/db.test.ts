import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initSchema } from './db';
import {
  ConversationMode,
  ConductorPhase,
  MessageRole,
  ConversationSchema,
  MessageSchema,
  CreateConversationInput,
} from './schemas/conversation';
import type { Database } from 'bun:sqlite';

// ─── DB Schema Tests ───

describe('DB Layer — initSchema', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('creates all 5 tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('conversations');
    expect(names).toContain('messages');
    expect(names).toContain('cards');
    expect(names).toContain('card_diffs');
    expect(names).toContain('settlements');
  });

  it('is idempotent (can call initSchema twice)', () => {
    expect(() => { initSchema(db); }).not.toThrow();
  });

  // ── conversations ──

  it('can insert and query a conversation', () => {
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES ('c1', 'world_design', 'explore')"
    );
    const row = db
      .prepare("SELECT * FROM conversations WHERE id = 'c1'")
      .get() as Record<string, unknown>;
    expect(row.mode).toBe('world_design');
    expect(row.phase).toBe('explore');
  });

  it('defaults phase to explore', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    const row = db
      .prepare("SELECT phase FROM conversations WHERE id = 'c1'")
      .get() as Record<string, unknown>;
    expect(row.phase).toBe('explore');
  });

  it('rejects invalid mode', () => {
    expect(() => {
      db.run(
        "INSERT INTO conversations (id, mode, phase) VALUES ('c2', 'invalid', 'explore')"
      );
    }).toThrow();
  });

  it('rejects invalid phase', () => {
    expect(() => {
      db.run(
        "INSERT INTO conversations (id, mode, phase) VALUES ('c3', 'task', 'invalid_phase')"
      );
    }).toThrow();
  });

  // ── messages ──

  it('can insert a message with FK', () => {
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES ('c1', 'task', 'explore')"
    );
    db.run(
      "INSERT INTO messages (id, conversation_id, role, content, turn) VALUES ('m1', 'c1', 'user', 'hello', 0)"
    );
    const msg = db
      .prepare("SELECT * FROM messages WHERE id = 'm1'")
      .get() as Record<string, unknown>;
    expect(msg.content).toBe('hello');
    expect(msg.turn).toBe(0);
  });

  it('rejects message with invalid conversation_id FK', () => {
    expect(() => {
      db.run(
        "INSERT INTO messages (id, conversation_id, role, content, turn) VALUES ('m1', 'nonexistent', 'user', 'hello', 0)"
      );
    }).toThrow();
  });

  it('rejects invalid message role', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    expect(() => {
      db.run(
        "INSERT INTO messages (id, conversation_id, role, content, turn) VALUES ('m1', 'c1', 'invalid_role', 'hello', 0)"
      );
    }).toThrow();
  });

  // ── cards ──

  it('can insert a card with JSON content', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    const content = JSON.stringify({ goal: 'test', version: 1 });
    db.run(
      "INSERT INTO cards (id, conversation_id, type, version, content) VALUES (?, ?, ?, ?, ?)",
      ['k1', 'c1', 'world', 1, content]
    );
    const card = db
      .prepare("SELECT * FROM cards WHERE id = 'k1'")
      .get() as Record<string, unknown>;
    expect(card.type).toBe('world');
    expect(JSON.parse(card.content as string)).toHaveProperty('goal', 'test');
  });

  it('rejects invalid card type', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    expect(() => {
      db.run(
        "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'invalid_type', '{}')"
      );
    }).toThrow();
  });

  // ── settlements ──

  it('can insert a settlement', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'world', '{}')"
    );
    db.run(
      "INSERT INTO settlements (id, conversation_id, card_id, target, payload) VALUES ('s1', 'c1', 'k1', 'village_pack', '{}')"
    );
    const row = db
      .prepare("SELECT * FROM settlements WHERE id = 's1'")
      .get() as Record<string, unknown>;
    expect(row.status).toBe('draft');
    expect(row.target).toBe('village_pack');
  });

  it('rejects settlement with invalid target', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'task', '{}')"
    );
    expect(() => {
      db.run(
        "INSERT INTO settlements (id, conversation_id, card_id, target, payload) VALUES ('s1', 'c1', 'k1', 'invalid_target', '{}')"
      );
    }).toThrow();
  });

  // ── card_diffs ──

  it('can insert a card_diff with FK', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'world', '{}')"
    );
    const diff = JSON.stringify({ added: ['goal'], removed: [], changed: [] });
    db.run(
      "INSERT INTO card_diffs (id, card_id, from_version, to_version, diff) VALUES ('d1', 'k1', 1, 2, ?)",
      [diff]
    );
    const row = db
      .prepare("SELECT * FROM card_diffs WHERE id = 'd1'")
      .get() as Record<string, unknown>;
    expect(row.card_id).toBe('k1');
    expect(row.from_version).toBe(1);
    expect(row.to_version).toBe(2);
    expect(JSON.parse(row.diff as string)).toHaveProperty('added');
  });

  it('rejects card_diff with invalid card_id FK', () => {
    expect(() => {
      db.run(
        "INSERT INTO card_diffs (id, card_id, from_version, to_version, diff) VALUES ('d1', 'nonexistent', 1, 2, '{}')"
      );
    }).toThrow();
  });

  it('rejects settlement with invalid status', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'task', '{}')"
    );
    expect(() => {
      db.run(
        "INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES ('s1', 'c1', 'k1', 'village_pack', '{}', 'invalid_status')"
      );
    }).toThrow();
  });
});

// ─── Zod Schema Tests ───

describe('Zod Schemas — conversation.ts', () => {
  it('ConversationMode accepts valid values', () => {
    expect(ConversationMode.parse('world_design')).toBe('world_design');
    expect(ConversationMode.parse('workflow_design')).toBe('workflow_design');
    expect(ConversationMode.parse('task')).toBe('task');
  });

  it('ConversationMode rejects invalid value', () => {
    expect(() => ConversationMode.parse('invalid')).toThrow();
  });

  it('ConductorPhase accepts valid values', () => {
    expect(ConductorPhase.parse('explore')).toBe('explore');
    expect(ConductorPhase.parse('focus')).toBe('focus');
    expect(ConductorPhase.parse('settle')).toBe('settle');
  });

  it('ConductorPhase rejects invalid value', () => {
    expect(() => ConductorPhase.parse('invalid')).toThrow();
  });

  it('MessageRole accepts valid values', () => {
    expect(MessageRole.parse('user')).toBe('user');
    expect(MessageRole.parse('assistant')).toBe('assistant');
    expect(MessageRole.parse('system')).toBe('system');
  });

  it('MessageRole rejects invalid value', () => {
    expect(() => MessageRole.parse('invalid')).toThrow();
  });

  it('ConversationSchema parses valid input', () => {
    const result = ConversationSchema.safeParse({
      id: 'c1',
      mode: 'world_design',
      phase: 'explore',
      village_id: null,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('ConversationSchema rejects invalid mode', () => {
    const result = ConversationSchema.safeParse({
      id: 'c1',
      mode: 'bad_mode',
      phase: 'explore',
      village_id: null,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('MessageSchema parses valid input', () => {
    const result = MessageSchema.safeParse({
      id: 'm1',
      conversation_id: 'c1',
      role: 'user',
      content: 'hello',
      turn: 0,
      created_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('MessageSchema rejects negative turn', () => {
    const result = MessageSchema.safeParse({
      id: 'm1',
      conversation_id: 'c1',
      role: 'user',
      content: 'hello',
      turn: -1,
      created_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('MessageSchema rejects non-integer turn', () => {
    const result = MessageSchema.safeParse({
      id: 'm1',
      conversation_id: 'c1',
      role: 'user',
      content: 'hello',
      turn: 1.5,
      created_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('CreateConversationInput accepts mode only', () => {
    const result = CreateConversationInput.safeParse({ mode: 'task' });
    expect(result.success).toBe(true);
  });

  it('CreateConversationInput accepts mode + village_id', () => {
    const result = CreateConversationInput.safeParse({
      mode: 'world_design',
      village_id: 'v1',
    });
    expect(result.success).toBe(true);
  });

  it('CreateConversationInput rejects missing mode', () => {
    const result = CreateConversationInput.safeParse({});
    expect(result.success).toBe(false);
  });
});
