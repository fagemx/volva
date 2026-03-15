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
  private cards = new Map<string, CardEnvelope>();
  private conversationIndex = new Map<string, string>();

  create(
    conversationId: string,
    type: CardType,
    content: AnyCard,
  ): CardEnvelope {
    const now = new Date().toISOString();
    const card: CardEnvelope = {
      id: crypto.randomUUID(),
      conversationId,
      type,
      content: { ...content, version: 1 },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.cards.set(card.id, card);
    this.conversationIndex.set(conversationId, card.id);
    return card;
  }

  update(
    cardId: string,
    content: AnyCard,
  ): { card: CardEnvelope; diff: CardDiff } {
    const existing = this.cards.get(cardId);
    if (!existing) {
      throw new Error(`Card not found: ${cardId}`);
    }

    const newVersion = existing.version + 1;
    const now = new Date().toISOString();

    const mergedContent = { ...content, version: newVersion };

    const diff = computeDiff(
      existing.content as unknown as Record<string, unknown>,
      mergedContent as unknown as Record<string, unknown>,
    );

    const updatedCard: CardEnvelope = {
      ...existing,
      content: mergedContent,
      version: newVersion,
      updatedAt: now,
    };

    this.cards.set(cardId, updatedCard);
    return { card: updatedCard, diff };
  }

  getLatest(conversationId: string): CardEnvelope | null {
    const cardId = this.conversationIndex.get(conversationId);
    if (!cardId) return null;
    return this.cards.get(cardId) ?? null;
  }

  diff(oldContent: AnyCard, newContent: AnyCard): CardDiff {
    return computeDiff(
      oldContent as unknown as Record<string, unknown>,
      newContent as unknown as Record<string, unknown>,
    );
  }
}
