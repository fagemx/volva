import type { Database } from 'bun:sqlite';
import type { CardType, AnyCard, CardDiff, CardEnvelope } from '../schemas/card';

// ─── Diff Logic ───

function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
): Map<string, unknown> {
  const result = new Map<string, unknown>();

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      result.set(path, `[length:${value.length}]`);
      for (let i = 0; i < value.length; i++) {
        const itemPath = `${path}[${i}]`;
        if (typeof value[i] === 'object' && value[i] !== null) {
          for (const [k, v] of flattenObject(
            value[i] as Record<string, unknown>,
            itemPath,
          )) {
            result.set(k, v);
          }
        } else {
          result.set(itemPath, value[i]);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of flattenObject(
        value as Record<string, unknown>,
        path,
      )) {
        result.set(k, v);
      }
    } else {
      result.set(path, value);
    }
  }
  return result;
}

export function computeDiff(
  oldContent: Record<string, unknown>,
  newContent: Record<string, unknown>,
): CardDiff {
  const oldFlat = flattenObject(oldContent);
  const newFlat = flattenObject(newContent);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of newFlat.keys()) {
    if (!oldFlat.has(key)) {
      added.push(key);
    } else if (
      JSON.stringify(oldFlat.get(key)) !== JSON.stringify(newFlat.get(key))
    ) {
      changed.push(key);
    }
  }

  for (const key of oldFlat.keys()) {
    if (!newFlat.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, changed };
}

// ─── CardManager ───

export class CardManager {
  constructor(private db: Database) {}

  create(
    conversationId: string,
    type: CardType,
    content: AnyCard,
  ): CardEnvelope {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const mergedContent = { ...content, version: 1 };

    this.db.run(
      'INSERT INTO cards (id, conversation_id, type, version, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, conversationId, type, 1, JSON.stringify(mergedContent), now, now],
    );

    return {
      id,
      conversationId,
      type,
      content: mergedContent,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  update(
    cardId: string,
    content: AnyCard,
  ): { card: CardEnvelope; diff: CardDiff } {
    const row = this.db
      .query('SELECT * FROM cards WHERE id = ?')
      .get(cardId) as Record<string, unknown> | null;

    if (!row) {
      throw new Error(`Card not found: ${cardId}`);
    }

    const existingContent = JSON.parse(row.content as string) as AnyCard;
    const conversationId = row.conversation_id as string;
    const type = row.type as CardType;
    const originalCreatedAt = row.created_at as string;
    const oldVersion = row.version as number;

    const newVersion = oldVersion + 1;
    const now = new Date().toISOString();
    const mergedContent = { ...content, version: newVersion };

    const diff = computeDiff(
      existingContent as unknown as Record<string, unknown>,
      mergedContent as unknown as Record<string, unknown>,
    );

    const newId = crypto.randomUUID();
    this.db.run(
      'INSERT INTO cards (id, conversation_id, type, version, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newId, conversationId, type, newVersion, JSON.stringify(mergedContent), originalCreatedAt, now],
    );

    const updatedCard: CardEnvelope = {
      id: newId,
      conversationId,
      type,
      content: mergedContent,
      version: newVersion,
      createdAt: originalCreatedAt,
      updatedAt: now,
    };

    return { card: updatedCard, diff };
  }

  getLatest(conversationId: string): CardEnvelope | null {
    const row = this.db
      .query('SELECT * FROM cards WHERE conversation_id = ? ORDER BY version DESC LIMIT 1')
      .get(conversationId) as Record<string, unknown> | null;

    if (!row) return null;

    return {
      id: row.id as string,
      conversationId: row.conversation_id as string,
      type: row.type as CardType,
      content: JSON.parse(row.content as string) as AnyCard,
      version: row.version as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  diff(oldContent: AnyCard, newContent: AnyCard): CardDiff {
    return computeDiff(
      oldContent as unknown as Record<string, unknown>,
      newContent as unknown as Record<string, unknown>,
    );
  }
}
