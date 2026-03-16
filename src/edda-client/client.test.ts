import { describe, it, expect } from 'vitest';
import { EddaClient } from './client';
import {
  EddaApiError,
  EddaNetworkError,
  EddaHttpError,
  EddaValidationError,
} from './schemas';

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return handler as unknown as typeof fetch;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── URL Construction ───

describe('URL construction', () => {
  it('queryDecisions → GET /api/decisions?village_id=...', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new EddaClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: [] });
      }),
    });
    await client.queryDecisions({ village_id: 'v1' });
    expect(capturedUrl).toBe('http://localhost:3463/api/decisions?village_id=v1');
    expect(capturedMethod).toBe('GET');
  });

  it('queryDecisions includes type and limit params', async () => {
    let capturedUrl = '';
    const client = new EddaClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true, data: [] });
      }),
    });
    await client.queryDecisions({ village_id: 'v1', type: 'architecture', limit: 5 });
    expect(capturedUrl).toBe('http://localhost:3463/api/decisions?village_id=v1&type=architecture&limit=5');
  });

  it('getDecisionOutcomes → GET /api/decisions/:id/outcomes', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new EddaClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: [] });
      }),
    });
    await client.getDecisionOutcomes('d1');
    expect(capturedUrl).toBe('http://localhost:3463/api/decisions/d1/outcomes');
    expect(capturedMethod).toBe('GET');
  });

  it('getHealth → /api/health', async () => {
    let capturedUrl = '';
    const client = new EddaClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true });
      }),
    });
    await client.getHealth();
    expect(capturedUrl).toBe('http://localhost:3463/api/health');
  });

  it('custom baseUrl is used', async () => {
    let capturedUrl = '';
    const client = new EddaClient({
      baseUrl: 'http://edda:8888',
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true, data: [] });
      }),
    });
    await client.queryDecisions({ village_id: 'v1' });
    expect(capturedUrl).toBe('http://edda:8888/api/decisions?village_id=v1');
  });
});

// ─── Success Response Parsing ───

describe('success response parsing', () => {
  it('queryDecisions returns typed DecisionData array', async () => {
    const client = new EddaClient({
      fetchFn: mockFetch(() =>
        jsonResponse({
          ok: true,
          data: [
            { id: 'd1', village_id: 'v1', type: 'architecture', summary: 'Use microservices', created_at: '2026-01-01T00:00:00Z' },
            { id: 'd2', village_id: 'v1', type: 'naming', summary: 'Use camelCase', context: 'JS project', created_at: '2026-01-02T00:00:00Z' },
          ],
        })
      ),
    });
    const result = await client.queryDecisions({ village_id: 'v1' });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('d1');
    expect(result[0].type).toBe('architecture');
    expect(result[1].context).toBe('JS project');
  });

  it('queryDecisions returns empty array', async () => {
    const client = new EddaClient({
      fetchFn: mockFetch(() => jsonResponse({ ok: true, data: [] })),
    });
    const result = await client.queryDecisions({ village_id: 'v1' });
    expect(result).toEqual([]);
  });

  it('getDecisionOutcomes returns typed DecisionOutcomeData array', async () => {
    const client = new EddaClient({
      fetchFn: mockFetch(() =>
        jsonResponse({
          ok: true,
          data: [
            { id: 'o1', decision_id: 'd1', outcome: 'success', detail: 'Worked well', created_at: '2026-01-03T00:00:00Z' },
            { id: 'o2', decision_id: 'd1', outcome: 'failure', created_at: '2026-01-04T00:00:00Z' },
          ],
        })
      ),
    });
    const result = await client.getDecisionOutcomes('d1');
    expect(result).toHaveLength(2);
    expect(result[0].outcome).toBe('success');
    expect(result[0].detail).toBe('Worked well');
    expect(result[1].outcome).toBe('failure');
    expect(result[1].detail).toBeUndefined();
  });
});

// ─── Error Handling ───

describe('error handling', () => {
  it('throws EddaApiError on { ok: false } response', async () => {
    const client = new EddaClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Decision not found' } })
      ),
    });
    await expect(client.queryDecisions({ village_id: 'v1' }))
      .rejects.toBeInstanceOf(EddaApiError);
  });

  it('throws EddaHttpError on 4xx', async () => {
    const client = new EddaClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' })
      ),
    });
    await expect(client.queryDecisions({ village_id: 'v1' }))
      .rejects.toBeInstanceOf(EddaHttpError);
  });

  it('throws EddaValidationError on malformed response', async () => {
    const client = new EddaClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        jsonResponse({ unexpected: 'format' })
      ),
    });
    await expect(client.queryDecisions({ village_id: 'v1' }))
      .rejects.toBeInstanceOf(EddaValidationError);
  });

  it('throws EddaNetworkError on fetch failure', async () => {
    const client = new EddaClient({
      retries: 0,
      fetchFn: mockFetch(() => { throw new TypeError('fetch failed'); }),
    });
    await expect(client.queryDecisions({ village_id: 'v1' }))
      .rejects.toBeInstanceOf(EddaNetworkError);
  });

  it('getHealth returns { ok: false } on error (does not throw)', async () => {
    const client = new EddaClient({
      fetchFn: mockFetch(() => { throw new TypeError('connection refused'); }),
    });
    const result = await client.getHealth();
    expect(result).toEqual({ ok: false });
  });
});

// ─── Retry Behavior ───

describe('retry behavior', () => {
  it('retries on 5xx up to max retries', async () => {
    let attempts = 0;
    const client = new EddaClient({
      retries: 2,
      fetchFn: mockFetch(() => {
        attempts++;
        if (attempts < 3) return new Response('Error', { status: 503, statusText: 'Service Unavailable' });
        return jsonResponse({ ok: true, data: [] });
      }),
    });
    const result = await client.queryDecisions({ village_id: 'v1' });
    expect(attempts).toBe(3);
    expect(result).toEqual([]);
  });

  it('does not retry on 4xx', async () => {
    let attempts = 0;
    const client = new EddaClient({
      retries: 2,
      fetchFn: mockFetch(() => {
        attempts++;
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }),
    });
    await expect(client.queryDecisions({ village_id: 'v1' }))
      .rejects.toBeInstanceOf(EddaHttpError);
    expect(attempts).toBe(1);
  });

  it('retries on network error', async () => {
    let attempts = 0;
    const client = new EddaClient({
      retries: 1,
      fetchFn: mockFetch(() => {
        attempts++;
        if (attempts < 2) throw new TypeError('fetch failed');
        return jsonResponse({ ok: true, data: [] });
      }),
    });
    const result = await client.queryDecisions({ village_id: 'v1' });
    expect(attempts).toBe(2);
    expect(result).toEqual([]);
  });
});
