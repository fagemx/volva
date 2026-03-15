import { Database } from 'bun:sqlite';

export function createDb(path: string = ':memory:'): Database {
  const db = new Database(path);
  db.run('PRAGMA foreign_keys = ON');
  return db;
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
