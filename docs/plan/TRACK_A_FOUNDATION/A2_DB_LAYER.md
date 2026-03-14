# A2: DB Layer + Base Schemas

> **Layer**: L0
> **Dependencies**: A1（Project Skeleton）
> **Blocks**: B1（LLM Client）, C1（Card Schemas）, C2（Card Manager）
> **Output**: `src/db.ts` — createDb, initSchema; `src/schemas/conversation.ts` — ConversationSchema, MessageSchema

---

## Bootstrap Instructions

```bash
cat docs/plan/CONTRACT.md
cat docs/VOLVA/01_ARCHITECTURE.md   # 資料模型章節
bun run build                        # 確認 A1 baseline
```

---

## Final Result

- `src/db.ts`: createDb() + initSchema() — 建立 4 張 SQLite 表
- `src/schemas/conversation.ts`: ConversationSchema, MessageSchema (Zod)
- `src/db.test.ts`: schema 建立測試
- `bun run build` zero errors
- `bun test src/db.test.ts` pass

## Implementation Steps

### Step 1: src/db.ts

```typescript
import { Database } from 'bun:sqlite';

export function createDb(path: string = ':memory:'): Database {
  return new Database(path);
}

export function initSchema(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK(mode IN ('world_design','workflow_design','task')),
    phase TEXT NOT NULL DEFAULT 'explore' CHECK(phase IN ('explore','focus','settle')),
    village_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    turn INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    type TEXT NOT NULL CHECK(type IN ('world','workflow','task')),
    version INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    card_id TEXT NOT NULL REFERENCES cards(id),
    target TEXT NOT NULL CHECK(target IN ('village_pack','workflow','task')),
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','applied','failed')),
    thyra_response TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}
```

### Step 2: src/schemas/conversation.ts

```typescript
import { z } from 'zod';

export const ConversationMode = z.enum(['world_design', 'workflow_design', 'task']);
export type ConversationMode = z.infer<typeof ConversationMode>;

export const ConductorPhase = z.enum(['explore', 'focus', 'settle']);
export type ConductorPhase = z.infer<typeof ConductorPhase>;

export const MessageRole = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRole>;

export const ConversationSchema = z.object({
  id: z.string(),
  mode: ConversationMode,
  phase: ConductorPhase,
  village_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  role: MessageRole,
  content: z.string(),
  turn: z.number().int().min(0),
  created_at: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const CreateConversationInput = z.object({
  mode: ConversationMode,
  village_id: z.string().optional(),
});
```

### Step 3: src/db.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initSchema } from './db';
import type { Database } from 'bun:sqlite';

describe('DB Layer', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('creates all 4 tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('conversations');
    expect(names).toContain('messages');
    expect(names).toContain('cards');
    expect(names).toContain('settlements');
  });

  it('can insert and query conversation', () => {
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('c1', 'world_design', 'explore')");
    const row = db.prepare("SELECT * FROM conversations WHERE id = 'c1'").get() as Record<string, unknown>;
    expect(row.mode).toBe('world_design');
    expect(row.phase).toBe('explore');
  });

  it('rejects invalid mode', () => {
    expect(() => {
      db.run("INSERT INTO conversations (id, mode, phase) VALUES ('c2', 'invalid', 'explore')");
    }).toThrow();
  });

  it('can insert message with FK', () => {
    db.run("INSERT INTO conversations (id, mode, phase) VALUES ('c1', 'task', 'explore')");
    db.run("INSERT INTO messages (id, conversation_id, role, content, turn) VALUES ('m1', 'c1', 'user', 'hello', 0)");
    const msg = db.prepare("SELECT * FROM messages WHERE id = 'm1'").get() as Record<string, unknown>;
    expect(msg.content).toBe('hello');
    expect(msg.turn).toBe(0);
  });
});
```

## Acceptance Criteria

```bash
# 1. Build
bun run build

# 2. Tests
bun test src/db.test.ts

# 3. Schema check
bun -e "import { createDb, initSchema } from './src/db'; const db = createDb(); initSchema(db); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"
```

## Git Commit

```
feat(db): add SQLite schema for conversations, messages, cards, settlements
```
