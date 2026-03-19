import { Hono } from 'hono';
import { ok, error } from './response';
import type { CardManager } from '../cards/card-manager';

export interface CardDeps {
  cardManager: CardManager;
}

export function cardRoutes(deps: CardDeps): Hono {
  const app = new Hono();

  // GET /api/conversations/:id/card
  app.get('/api/conversations/:id/card', (c) => {
    const conversationId = c.req.param('id');
    const card = deps.cardManager.getLatest(conversationId);
    if (!card) {
      return error(c, 'NOT_FOUND', 'No card found for this conversation', 404);
    }
    return ok(c, card);
  });

  // GET /api/conversations/:id/card/history
  app.get('/api/conversations/:id/card/history', (c) => {
    const conversationId = c.req.param('id');
    const history = deps.cardManager.getVersionHistory(conversationId);
    return ok(c, history);
  });

  // GET /api/conversations/:id/card/version/:version
  app.get('/api/conversations/:id/card/version/:version', (c) => {
    const conversationId = c.req.param('id');
    const versionStr = c.req.param('version');
    const version = parseInt(versionStr, 10);
    if (!Number.isFinite(version) || version < 1) {
      return error(c, 'INVALID_INPUT', `Invalid version: ${versionStr}`, 400);
    }
    const card = deps.cardManager.getVersion(conversationId, version);
    if (!card) {
      return error(c, 'NOT_FOUND', `Card version ${version} not found`, 404);
    }
    return ok(c, card);
  });

  // GET /api/conversations/:id/card/diffs
  app.get('/api/conversations/:id/card/diffs', (c) => {
    const conversationId = c.req.param('id');
    const diffs = deps.cardManager.getDiffHistory(conversationId);
    return ok(c, diffs);
  });

  return app;
}
