import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { CardManager } from '../cards/card-manager';

export interface CardDeps {
  db: Database;
  cardManager: CardManager;
}

function conversationExists(db: Database, id: string): boolean {
  const row = db
    .query('SELECT 1 FROM conversations WHERE id = ?')
    .get(id) as Record<string, unknown> | null;
  return row !== null;
}

export function cardRoutes(deps: CardDeps): Hono {
  const app = new Hono();

  // GET /api/conversations/:id/card
  app.get('/api/conversations/:id/card', (c) => {
    const conversationId = c.req.param('id');
    if (!conversationExists(deps.db, conversationId)) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }
    const card = deps.cardManager.getLatest(conversationId);
    if (!card) {
      return error(c, 'NOT_FOUND', 'Card not found', 404);
    }
    return ok(c, card);
  });

  // GET /api/conversations/:id/card/history
  app.get('/api/conversations/:id/card/history', (c) => {
    const conversationId = c.req.param('id');
    if (!conversationExists(deps.db, conversationId)) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }
    const history = deps.cardManager.getVersionHistory(conversationId);
    return ok(c, history);
  });

  // GET /api/conversations/:id/card/version/:version
  app.get('/api/conversations/:id/card/version/:version', (c) => {
    const conversationId = c.req.param('id');
    const versionStr = c.req.param('version');
    const version = parseInt(versionStr, 10);
    if (!Number.isInteger(version) || version < 1) {
      return error(c, 'INVALID_INPUT', 'version must be a positive integer', 400);
    }
    if (!conversationExists(deps.db, conversationId)) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }
    const card = deps.cardManager.getVersion(conversationId, version);
    if (!card) {
      return error(c, 'NOT_FOUND', 'Card version not found', 404);
    }
    return ok(c, card);
  });

  // GET /api/conversations/:id/card/diffs
  app.get('/api/conversations/:id/card/diffs', (c) => {
    const conversationId = c.req.param('id');
    if (!conversationExists(deps.db, conversationId)) {
      return error(c, 'NOT_FOUND', 'Conversation not found', 404);
    }
    const diffs = deps.cardManager.getDiffHistory(conversationId);
    return ok(c, diffs);
  });

  return app;
}
