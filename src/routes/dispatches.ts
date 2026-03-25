import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import { KarviClient } from '../karvi-client/client';
import { KarviApiError, KarviNetworkError } from '../karvi-client/schemas';
import { processDispatchQueue } from './skill-dispatcher';

// ─── DI Interface ───

export interface DispatchRouteDeps {
  karvi: KarviClient;
  db: Database;
}

// ─── Input Schemas ───

const CancelDispatchInput = z.object({
  sessionId: z.string().optional(),
  reason: z.string().default('user_cancel'),
});

// ─── Route Factory ───

export function dispatchRoutes(deps: DispatchRouteDeps): Hono {
  const app = new Hono();

  // ─── POST /api/dispatches/:id/cancel ───
  // Cancel an in-progress dispatch or build on Karvi (0 LLM calls)
  app.post('/api/dispatches/:id/cancel', async (c) => {
    const id = c.req.param('id');
    const rawBody: unknown = await c.req.json().catch(() => ({}));
    const parsed = CancelDispatchInput.safeParse(rawBody);
    const sessionId = parsed.success ? (parsed.data.sessionId ?? null) : null;
    const reason = parsed.success ? parsed.data.reason : 'user_cancel';

    try {
      const result = await deps.karvi.cancelDispatch(id);

      // Record cancellation event if session context is provided
      if (sessionId) {
        try {
          const eventId = `evt_${crypto.randomUUID()}`;
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

  // ─── POST /api/dispatches/queue/process ───
  // Process pending dispatch queue items when Karvi reconnects (0 LLM calls)
  app.post('/api/dispatches/queue/process', async (c) => {
    const result = await processDispatchQueue(deps.karvi, deps.db);
    return ok(c, result);
  });

  // ─── GET /api/dispatches/:id/status ───
  // Get dispatch status from Karvi (0 LLM calls)
  app.get('/api/dispatches/:id/status', async (c) => {
    const id = c.req.param('id');
    try {
      const status = await deps.karvi.getDispatchStatus(id);
      return ok(c, status);
    } catch (err) {
      if (err instanceof KarviApiError) {
        const statusMap: Record<string, number> = { NOT_FOUND: 404 };
        return error(c, err.code, err.message, (statusMap[err.code] ?? 400) as 400 | 404);
      }
      if (err instanceof KarviNetworkError) {
        return error(c, 'KARVI_UNAVAILABLE', `Karvi unreachable: ${err.message}`, 503);
      }
      throw err;
    }
  });

  return app;
}
