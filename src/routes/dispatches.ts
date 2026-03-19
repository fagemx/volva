import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import { KarviClient } from '../karvi-client/client';
import { KarviApiError, KarviNetworkError } from '../karvi-client/schemas';

// ─── DI Interface ───

export interface DispatchRouteDeps {
  karvi: KarviClient;
  db: Database;
}

// ─── Route Factory ───

export function dispatchRoutes(deps: DispatchRouteDeps): Hono {
  const app = new Hono();

  // ─── POST /api/dispatches/:id/cancel ───
  // Cancel an in-progress dispatch or build on Karvi (0 LLM calls)
  app.post('/api/dispatches/:id/cancel', async (c) => {
    const id = c.req.param('id');
    const body: Record<string, unknown> = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const reason = typeof body.reason === 'string' ? body.reason : 'user_cancel';

    try {
      const result = await deps.karvi.cancelDispatch(id);

      // Record cancellation event if session context is provided
      if (sessionId) {
        try {
          const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          deps.db.prepare(
            `INSERT INTO decision_events (id, session_id, event_type, object_type, object_id, payload_json)
             VALUES (?, ?, 'dispatch_cancelled', 'session', ?, ?)`,
          ).run(eventId, sessionId, id, JSON.stringify({ reason, cancelled: result.cancelled }));
        } catch (dbErr) {
          // Event logging is best-effort — do not fail the cancel response
          console.error('[dispatches] Failed to record cancel event:', dbErr);
        }
      }

      return ok(c, result);
    } catch (err) {
      if (err instanceof KarviApiError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          ALREADY_CANCELLED: 409,
        };
        const httpStatus = statusMap[err.code] ?? 400;
        return error(c, err.code, err.message, httpStatus as 400 | 404 | 409);
      }

      if (err instanceof KarviNetworkError) {
        console.error('[dispatches] Karvi unreachable on cancel:', err.message);
        return error(c, 'KARVI_UNAVAILABLE', `Karvi unreachable: ${err.message}`, 503);
      }

      throw err;
    }
  });

  return app;
}
