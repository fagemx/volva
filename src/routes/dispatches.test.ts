import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchRoutes } from './dispatches';
import type { DispatchRouteDeps } from './dispatches';
import { KarviClient } from '../karvi-client/client';
import { KarviApiError, KarviNetworkError } from '../karvi-client/schemas';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';

// ─── Fixtures ───

function makeMockKarviClient(): KarviClient & {
  cancelDispatch: ReturnType<typeof vi.fn>;
  getHealth: ReturnType<typeof vi.fn>;
  dispatchSkill: ReturnType<typeof vi.fn>;
  getDispatchStatus: ReturnType<typeof vi.fn>;
} {
  const client = {
    cancelDispatch: vi.fn(),
    dispatchSkill: vi.fn(),
    forgeBuild: vi.fn(),
    getDispatchStatus: vi.fn(),
    getHealth: vi.fn(),
    registerPipeline: vi.fn(),
    listPipelines: vi.fn(),
    deletePipeline: vi.fn(),
  } as unknown as KarviClient & {
    cancelDispatch: ReturnType<typeof vi.fn>;
    getHealth: ReturnType<typeof vi.fn>;
    dispatchSkill: ReturnType<typeof vi.fn>;
    getDispatchStatus: ReturnType<typeof vi.fn>;
  };
  return client;
}

// ─── Tests ───

describe('POST /api/dispatches/:id/cancel', () => {
  let db: Database;
  let karvi: KarviClient & { cancelDispatch: ReturnType<typeof vi.fn>; getHealth: ReturnType<typeof vi.fn>; dispatchSkill: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    karvi = makeMockKarviClient();
  });

  function makeApp(deps?: Partial<DispatchRouteDeps>) {
    return dispatchRoutes({ karvi, db, ...deps });
  }

  async function cancelRequest(
    app: ReturnType<typeof makeApp>,
    id: string,
    body?: Record<string, unknown>,
  ) {
    const req = new Request(`http://localhost/api/dispatches/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    return app.fetch(req);
  }

  it('returns cancel result on success', async () => {
    karvi.cancelDispatch.mockResolvedValueOnce({
      id: 'disp-001',
      cancelled: true,
      status: 'cancelled',
      stepsCompleted: 1,
      stepsAborted: 2,
    });

    const app = makeApp();
    const res = await cancelRequest(app, 'disp-001');
    expect(res.status).toBe(200);

    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.id).toBe('disp-001');
    expect(data.cancelled).toBe(true);
    expect(data.stepsCompleted).toBe(1);
    expect(data.stepsAborted).toBe(2);
  });

  it('returns 404 on NOT_FOUND', async () => {
    karvi.cancelDispatch.mockRejectedValueOnce(
      new KarviApiError('NOT_FOUND', 'Dispatch not found'),
    );

    const app = makeApp();
    const res = await cancelRequest(app, 'nonexistent');
    expect(res.status).toBe(404);

    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(false);
    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns 409 on ALREADY_CANCELLED', async () => {
    karvi.cancelDispatch.mockRejectedValueOnce(
      new KarviApiError('ALREADY_CANCELLED', 'Already cancelled'),
    );

    const app = makeApp();
    const res = await cancelRequest(app, 'disp-done');
    expect(res.status).toBe(409);

    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(false);
    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('ALREADY_CANCELLED');
  });

  it('returns 503 when Karvi is unreachable', async () => {
    karvi.cancelDispatch.mockRejectedValueOnce(
      new KarviNetworkError('Connection refused'),
    );

    const app = makeApp();
    const res = await cancelRequest(app, 'disp-002');
    expect(res.status).toBe(503);

    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(false);
    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('KARVI_UNAVAILABLE');
  });

  it('records decision event when sessionId is provided', async () => {
    // Create a decision session for the FK constraint
    db.prepare(
      `INSERT INTO decision_sessions (id, stage, status) VALUES (?, 'routing', 'active')`,
    ).run('session-001');

    karvi.cancelDispatch.mockResolvedValueOnce({
      id: 'disp-003',
      cancelled: true,
    });

    const app = makeApp();
    const res = await cancelRequest(app, 'disp-003', {
      sessionId: 'session-001',
      reason: 'user_timeout',
    });
    expect(res.status).toBe(200);

    // Verify event was recorded
    const events = db.prepare(
      'SELECT * FROM decision_events WHERE session_id = ? AND event_type = ?',
    ).all('session-001', 'dispatch_cancelled') as Array<Record<string, unknown>>;

    expect(events).toHaveLength(1);
    expect(events[0].object_id).toBe('disp-003');
    const payload = JSON.parse(events[0].payload_json as string) as Record<string, unknown>;
    expect(payload.reason).toBe('user_timeout');
    expect(payload.cancelled).toBe(true);
  });

  it('succeeds even without sessionId (no event recorded)', async () => {
    karvi.cancelDispatch.mockResolvedValueOnce({
      id: 'disp-004',
      cancelled: true,
    });

    const app = makeApp();
    const res = await cancelRequest(app, 'disp-004');
    expect(res.status).toBe(200);

    // Verify no events recorded
    const events = db.prepare(
      'SELECT * FROM decision_events WHERE event_type = ?',
    ).all('dispatch_cancelled') as Array<Record<string, unknown>>;
    expect(events).toHaveLength(0);
  });
});

// ─── POST /api/dispatches/queue/process ───

describe('POST /api/dispatches/queue/process', () => {
  let db: Database;
  let karvi: KarviClient & { cancelDispatch: ReturnType<typeof vi.fn>; getHealth: ReturnType<typeof vi.fn>; dispatchSkill: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    karvi = makeMockKarviClient();
  });

  function makeApp(deps?: Partial<DispatchRouteDeps>) {
    return dispatchRoutes({ karvi, db, ...deps });
  }

  async function processQueueRequest(app: ReturnType<typeof makeApp>) {
    const req = new Request('http://localhost/api/dispatches/queue/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return app.fetch(req);
  }

  it('returns zero counts when Karvi is unhealthy', async () => {
    karvi.getHealth.mockResolvedValueOnce({ ok: false });

    const app = makeApp();
    const res = await processQueueRequest(app);
    expect(res.status).toBe(200);

    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(true);
    const data = json.data as Record<string, unknown>;
    expect(data.processed).toBe(0);
  });

  it('processes pending items when healthy', async () => {
    // Insert pending item
    const requestJson = JSON.stringify({
      skillId: 'skill.test',
      skillName: 'test',
      skillVersion: '1.0',
      skillContent: '',
      environment: {
        toolsRequired: [], toolsOptional: [],
        permissions: { filesystem: { read: false, write: false }, network: { read: false, write: false }, process: { spawn: false }, secrets: { read: [] } },
        externalSideEffects: false, executionMode: 'advisory',
      },
      dispatch: {
        targetSelection: { repoPolicy: 'explicit', runtimeOptions: [] },
        workerClass: [], handoff: { inputArtifacts: [], outputArtifacts: [] },
        executionPolicy: { sync: false, retries: 0, timeoutMinutes: 1, escalationOnFailure: false },
        approval: { requireHumanBeforeDispatch: false, requireHumanBeforeMerge: false },
      },
      verification: { smokeChecks: [], assertions: [], humanCheckpoints: [], outcomeSignals: [] },
      context: { userMessage: 'test', inputs: {} },
    });
    db.prepare(
      `INSERT INTO dispatch_queue (id, skill_id, request_json, fallback_reason)
       VALUES (?, ?, ?, ?)`,
    ).run('dq_route_1', 'skill.test', requestJson, 'health check failed');

    karvi.getHealth.mockResolvedValueOnce({ ok: true });
    karvi.dispatchSkill.mockResolvedValueOnce({ dispatchId: 'disp-new', status: 'pending' });

    const app = makeApp();
    const res = await processQueueRequest(app);
    expect(res.status).toBe(200);

    const json = await res.json() as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect(data.processed).toBe(1);
    expect(data.succeeded).toBe(1);
    expect(data.failed).toBe(0);
  });
});
