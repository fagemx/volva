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

  return app;
}
