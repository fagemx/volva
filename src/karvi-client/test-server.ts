import type { SkillDispatchRequest, SkillDispatchResult } from './schemas';

export interface MockKarviState {
  dispatches: Map<string, {
    request: SkillDispatchRequest;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    result: SkillDispatchResult | null;
    createdAt: string;
    updatedAt: string;
  }>;
  receivedRequests: SkillDispatchRequest[];
}

export interface MockKarviServer {
  url: string;
  state: MockKarviState;
  stop(): void;
  simulateProgress(dispatchId: string): void;
  simulateCompletion(dispatchId: string, result: SkillDispatchResult): void;
}

export function createMockKarviServer(): MockKarviServer {
  const state: MockKarviState = {
    dispatches: new Map(),
    receivedRequests: [],
  };

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/api/volva/dispatch-skill' && req.method === 'POST') {
        const body = await req.json() as SkillDispatchRequest;
        state.receivedRequests.push(body);

        const dispatchId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();

        state.dispatches.set(dispatchId, {
          request: body,
          status: 'pending',
          result: null,
          createdAt: now,
          updatedAt: now,
        });

        return Response.json({ ok: true, data: { dispatchId, status: 'pending' } });
      }

      const statusMatch = url.pathname.match(/^\/api\/volva\/status\/(.+)$/);
      if (statusMatch && req.method === 'GET') {
        const id = statusMatch[1];
        const dispatch = state.dispatches.get(id);

        if (!dispatch) {
          return Response.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Dispatch not found' } });
        }

        return Response.json({
          ok: true,
          data: {
            id,
            status: dispatch.status,
            type: 'skill',
            createdAt: dispatch.createdAt,
            updatedAt: dispatch.updatedAt,
            result: dispatch.result,
          },
        });
      }

      const cancelMatch = url.pathname.match(/^\/api\/volva\/cancel\/(.+)$/);
      if (cancelMatch && req.method === 'POST') {
        const id = cancelMatch[1];
        const dispatch = state.dispatches.get(id);

        if (!dispatch) {
          return Response.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Dispatch not found' } });
        }

        if (dispatch.status === 'completed' || dispatch.status === 'failed') {
          return Response.json({ ok: false, error: { code: 'ALREADY_COMPLETED', message: 'Already completed' } });
        }

        dispatch.status = 'cancelled';
        dispatch.updatedAt = new Date().toISOString();

        return Response.json({ ok: true, data: { id, cancelled: true } });
      }

      if (url.pathname === '/api/health' && req.method === 'GET') {
        return Response.json({ ok: true });
      }

      return Response.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    state,
    stop: () => { void server.stop(); },
    simulateProgress(id: string) {
      const dispatch = state.dispatches.get(id);
      if (dispatch && dispatch.status === 'pending') {
        dispatch.status = 'running';
        dispatch.updatedAt = new Date().toISOString();
      }
    },
    simulateCompletion(id: string, result: SkillDispatchResult) {
      const dispatch = state.dispatches.get(id);
      if (dispatch) {
        dispatch.status = result.status === 'success' ? 'completed' : 'failed';
        dispatch.result = result;
        dispatch.updatedAt = new Date().toISOString();
      }
    },
  };
}
