import { Hono } from 'hono';
import { ok } from './response';
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
    const version = parseInt(c.req.param('version'), 10);
    const card = deps.cardManager.getVersion(conversationId, version);
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
