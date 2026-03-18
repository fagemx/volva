import { describe, it, expect } from 'vitest';
import { KarviClient } from './client';
import {
  KarviApiError,
  KarviNetworkError,
  KarviHttpError,
  KarviValidationError,
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

const sampleStep = { order: 1, type: 'skill', label: 'Review', skill_name: 'code-review', instruction: null };
const samplePipeline = { name: 'deploy-pipe', steps: [sampleStep] };

// ─── URL Construction ───

describe('URL construction', () => {
  it('registerPipeline -> POST /api/pipelines', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new KarviClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: samplePipeline });
      }),
    });
    await client.registerPipeline({ name: 'deploy-pipe', steps: [sampleStep] });
    expect(capturedUrl).toBe('http://localhost:3463/api/pipelines');
    expect(capturedMethod).toBe('POST');
  });

  it('listPipelines -> GET /api/pipelines', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new KarviClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: [samplePipeline] });
      }),
    });
    await client.listPipelines();
    expect(capturedUrl).toBe('http://localhost:3463/api/pipelines');
    expect(capturedMethod).toBe('GET');
  });

  it('deletePipeline -> DELETE /api/pipelines/:name', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new KarviClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: { deleted: true } });
      }),
    });
    await client.deletePipeline('my-pipe');
    expect(capturedUrl).toBe('http://localhost:3463/api/pipelines/my-pipe');
    expect(capturedMethod).toBe('DELETE');
  });

  it('getHealth -> GET /api/health', async () => {
    let capturedUrl = '';
    const client = new KarviClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true });
      }),
    });
    await client.getHealth();
    expect(capturedUrl).toBe('http://localhost:3463/api/health');
  });

  it('custom baseUrl is respected', async () => {
    let capturedUrl = '';
    const client = new KarviClient({
      baseUrl: 'http://karvi:8080',
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true, data: [samplePipeline] });
      }),
    });
    await client.listPipelines();
    expect(capturedUrl).toBe('http://karvi:8080/api/pipelines');
  });
});

// ─── Success Response Parsing ───

describe('success response parsing', () => {
  it('registerPipeline returns typed PipelineData', async () => {
    const client = new KarviClient({
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: true, data: samplePipeline })
      ),
    });
    const result = await client.registerPipeline({ name: 'deploy-pipe', steps: [sampleStep] });
    expect(result.name).toBe('deploy-pipe');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('skill');
    expect(result.steps[0].skill_name).toBe('code-review');
    expect(result.steps[0].instruction).toBeNull();
  });

  it('listPipelines returns typed PipelineData[]', async () => {
    const client = new KarviClient({
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: true, data: [samplePipeline, { name: 'other', steps: [] }] })
      ),
    });
    const result = await client.listPipelines();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('deploy-pipe');
    expect(result[1].steps).toEqual([]);
  });

  it('listPipelines returns empty array', async () => {
    const client = new KarviClient({
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: true, data: [] })
      ),
    });
    const result = await client.listPipelines();
    expect(result).toEqual([]);
  });

  it('deletePipeline returns typed DeletePipelineData', async () => {
    const client = new KarviClient({
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: true, data: { deleted: true } })
      ),
    });
    const result = await client.deletePipeline('my-pipe');
    expect(result.deleted).toBe(true);
  });
});

// ─── Error Handling ───

describe('error handling', () => {
  it('throws KarviApiError on { ok: false } response', async () => {
    const client = new KarviClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } })
      ),
    });
    await expect(client.listPipelines())
      .rejects.toBeInstanceOf(KarviApiError);
  });

  it('throws KarviHttpError on 4xx', async () => {
    const client = new KarviClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' })
      ),
    });
    await expect(client.registerPipeline({ name: 'x', steps: [] }))
      .rejects.toBeInstanceOf(KarviHttpError);
  });

  it('throws KarviValidationError on malformed response', async () => {
    const client = new KarviClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        jsonResponse({ unexpected: 'format' })
      ),
    });
    await expect(client.listPipelines())
      .rejects.toBeInstanceOf(KarviValidationError);
  });

  it('throws KarviNetworkError on fetch failure', async () => {
    const client = new KarviClient({
      retries: 0,
      fetchFn: mockFetch(() => { throw new TypeError('fetch failed'); }),
    });
    await expect(client.listPipelines())
      .rejects.toBeInstanceOf(KarviNetworkError);
  });

  it('getHealth returns { ok: false } on error (never throws)', async () => {
    const client = new KarviClient({
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
    const client = new KarviClient({
      retries: 2,
      fetchFn: mockFetch(() => {
        attempts++;
        if (attempts < 3) return new Response('Error', { status: 503, statusText: 'Service Unavailable' });
        return jsonResponse({ ok: true, data: [samplePipeline] });
      }),
    });
    const result = await client.listPipelines();
    expect(attempts).toBe(3);
    expect(result).toHaveLength(1);
  });

  it('does not retry on 4xx', async () => {
    let attempts = 0;
    const client = new KarviClient({
      retries: 2,
      fetchFn: mockFetch(() => {
        attempts++;
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }),
    });
    await expect(client.listPipelines())
      .rejects.toBeInstanceOf(KarviHttpError);
    expect(attempts).toBe(1);
  });

  it('retries on network error', async () => {
    let attempts = 0;
    const client = new KarviClient({
      retries: 1,
      fetchFn: mockFetch(() => {
        attempts++;
        if (attempts < 2) throw new TypeError('fetch failed');
        return jsonResponse({ ok: true, data: [samplePipeline] });
      }),
    });
    const result = await client.listPipelines();
    expect(attempts).toBe(2);
    expect(result).toHaveLength(1);
  });
});
