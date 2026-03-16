import { describe, it, expect } from 'vitest';
import { ThyraClient } from './client';
import {
  ThyraApiError,
  ThyraNetworkError,
  ThyraHttpError,
  ThyraValidationError,
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
  it('createVillage → POST /api/villages', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: { id: '1', name: 'test', target_repo: 'repo' } });
      }),
    });
    await client.createVillage({ name: 'test', target_repo: 'repo' });
    expect(capturedUrl).toBe('http://localhost:3462/api/villages');
    expect(capturedMethod).toBe('POST');
  });

  it('createConstitution → POST /api/villages/:id/constitutions', async () => {
    let capturedUrl = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true, data: { id: '1', village_id: 'v1' } });
      }),
    });
    await client.createConstitution('v1', { rules: [] });
    expect(capturedUrl).toBe('http://localhost:3462/api/villages/v1/constitutions');
  });

  it('createChief → POST /api/villages/:id/chiefs', async () => {
    let capturedUrl = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true, data: { id: '1', village_id: 'v1', name: 'Chief' } });
      }),
    });
    await client.createChief('v1', { name: 'Chief', role: 'support' });
    expect(capturedUrl).toBe('http://localhost:3462/api/villages/v1/chiefs');
  });

  it('createSkill → POST /api/skills', async () => {
    let capturedUrl = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true, data: { id: '1', name: 'skill1' } });
      }),
    });
    await client.createSkill({ name: 'skill1', type: 'retrieval' });
    expect(capturedUrl).toBe('http://localhost:3462/api/skills');
  });

  it('getSkills → GET /api/skills', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: [{ id: '1', name: 'skill1', type: 'retrieval', description: 'A skill' }] });
      }),
    });
    await client.getSkills();
    expect(capturedUrl).toBe('http://localhost:3462/api/skills');
    expect(capturedMethod).toBe('GET');
  });

  it('getVillage → GET /api/villages/:id', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? 'GET';
        return jsonResponse({ ok: true, data: { id: 'v1', name: 'Test', target_repo: 'repo' } });
      }),
    });
    await client.getVillage('v1');
    expect(capturedUrl).toBe('http://localhost:3462/api/villages/v1');
    expect(capturedMethod).toBe('GET');
  });

  it('getActiveConstitution → GET /api/villages/:id/constitutions/active', async () => {
    let capturedUrl = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({
          ok: true,
          data: { id: 'c1', village_id: 'v1', rules: [] },
        });
      }),
    });
    await client.getActiveConstitution('v1');
    expect(capturedUrl).toBe('http://localhost:3462/api/villages/v1/constitutions/active');
  });

  it('getChiefs → GET /api/villages/:id/chiefs', async () => {
    let capturedUrl = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({
          ok: true,
          data: [{ id: 'ch1', village_id: 'v1', name: 'Chief' }],
        });
      }),
    });
    await client.getChiefs('v1');
    expect(capturedUrl).toBe('http://localhost:3462/api/villages/v1/chiefs');
  });

  it('applyVillagePack → POST /api/villages/pack/apply', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url, init) => {
        capturedUrl = url;
        capturedBody = init?.body as string;
        return jsonResponse({ ok: true, data: { village_id: 'v1', constitution_id: 'c1', chief_id: 'ch1', skills: [{ id: 's1', name: 'skill1' }], applied: true } });
      }),
    });
    await client.applyVillagePack('village:\n  name: test');
    expect(capturedUrl).toBe('http://localhost:3462/api/villages/pack/apply');
    expect(JSON.parse(capturedBody)).toEqual({ yaml: 'village:\n  name: test' });
  });

  it('getHealth → /api/health', async () => {
    let capturedUrl = '';
    const client = new ThyraClient({
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true });
      }),
    });
    await client.getHealth();
    expect(capturedUrl).toBe('http://localhost:3462/api/health');
  });

  it('custom baseUrl is used', async () => {
    let capturedUrl = '';
    const client = new ThyraClient({
      baseUrl: 'http://thyra:9999',
      fetchFn: mockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ ok: true, data: { id: '1', name: 'x', target_repo: 'r' } });
      }),
    });
    await client.createVillage({ name: 'x', target_repo: 'r' });
    expect(capturedUrl).toBe('http://thyra:9999/api/villages');
  });
});

// ─── Success Response Parsing ───

describe('success response parsing', () => {
  it('getVillage returns typed VillageData', async () => {
    const client = new ThyraClient({
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: true, data: { id: 'v1', name: 'Test', target_repo: 'repo' } })
      ),
    });
    const result = await client.getVillage('v1');
    expect(result).toEqual({ id: 'v1', name: 'Test', target_repo: 'repo' });
  });

  it('getActiveConstitution returns typed ActiveConstitutionData', async () => {
    const client = new ThyraClient({
      fetchFn: mockFetch(() =>
        jsonResponse({
          ok: true,
          data: {
            id: 'c1',
            village_id: 'v1',
            rules: [
              { description: 'No direct DB', enforcement: 'hard', scope: ['*'] },
            ],
            budget_limits: { max_cost_per_action: 0.5, max_cost_per_day: 10, max_cost_per_loop: 2 },
          },
        })
      ),
    });
    const result = await client.getActiveConstitution('v1');
    expect(result.id).toBe('c1');
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].enforcement).toBe('hard');
    expect(result.budget_limits?.max_cost_per_action).toBe(0.5);
  });

  it('getChiefs returns typed ChiefData array', async () => {
    const client = new ThyraClient({
      fetchFn: mockFetch(() =>
        jsonResponse({
          ok: true,
          data: [
            { id: 'ch1', village_id: 'v1', name: 'Chief', role: 'support', personality: 'kind' },
          ],
        })
      ),
    });
    const result = await client.getChiefs('v1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Chief');
    expect(result[0].role).toBe('support');
  });

  it('applyVillagePack returns typed PackApplyData with all fields', async () => {
    const client = new ThyraClient({
      fetchFn: mockFetch(() =>
        jsonResponse({
          ok: true,
          data: {
            village_id: 'v1',
            constitution_id: 'c1',
            chief_id: null,
            skills: [{ id: 's1', name: 'skill1' }],
            applied: true,
          },
        })
      ),
    });
    const result = await client.applyVillagePack('village:\n  name: test');
    expect(result.village_id).toBe('v1');
    expect(result.constitution_id).toBe('c1');
    expect(result.chief_id).toBeNull();
    expect(result.skills).toHaveLength(1);
    expect(result.applied).toBe(true);
  });

  it('getSkills returns typed SkillData array', async () => {
    const client = new ThyraClient({
      fetchFn: mockFetch(() =>
        jsonResponse({
          ok: true,
          data: [
            { id: 's1', name: 'code-review', type: 'analysis', description: 'Reviews code' },
            { id: 's2', name: 'deploy' },
          ],
        })
      ),
    });
    const result = await client.getSkills();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('code-review');
    expect(result[0].type).toBe('analysis');
    expect(result[0].description).toBe('Reviews code');
    expect(result[1].type).toBeUndefined();
    expect(result[1].description).toBeUndefined();
  });

  it('getSkills returns empty array', async () => {
    const client = new ThyraClient({
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: true, data: [] })
      ),
    });
    const result = await client.getSkills();
    expect(result).toEqual([]);
  });

  it('createVillage returns typed VillageData', async () => {
    const client = new ThyraClient({
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: true, data: { id: 'v1', name: 'Test', target_repo: 'repo' } })
      ),
    });
    const result = await client.createVillage({ name: 'Test', target_repo: 'repo' });
    expect(result).toEqual({ id: 'v1', name: 'Test', target_repo: 'repo' });
  });
});

// ─── Error Handling ───

describe('error handling', () => {
  it('throws ThyraApiError on { ok: false } response', async () => {
    const client = new ThyraClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Village not found' } })
      ),
    });
    await expect(client.createVillage({ name: 'x', target_repo: 'r' }))
      .rejects.toBeInstanceOf(ThyraApiError);
  });

  it('throws ThyraHttpError on 4xx', async () => {
    const client = new ThyraClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' })
      ),
    });
    await expect(client.createVillage({ name: 'x', target_repo: 'r' }))
      .rejects.toBeInstanceOf(ThyraHttpError);
  });

  it('throws ThyraValidationError on malformed response', async () => {
    const client = new ThyraClient({
      retries: 0,
      fetchFn: mockFetch(() =>
        jsonResponse({ unexpected: 'format' })
      ),
    });
    await expect(client.createVillage({ name: 'x', target_repo: 'r' }))
      .rejects.toBeInstanceOf(ThyraValidationError);
  });

  it('throws ThyraNetworkError on fetch failure', async () => {
    const client = new ThyraClient({
      retries: 0,
      fetchFn: mockFetch(() => { throw new TypeError('fetch failed'); }),
    });
    await expect(client.createVillage({ name: 'x', target_repo: 'r' }))
      .rejects.toBeInstanceOf(ThyraNetworkError);
  });

  it('getHealth returns { ok: false } on error (does not throw)', async () => {
    const client = new ThyraClient({
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
    const client = new ThyraClient({
      retries: 2,
      fetchFn: mockFetch(() => {
        attempts++;
        if (attempts < 3) return new Response('Error', { status: 503, statusText: 'Service Unavailable' });
        return jsonResponse({ ok: true, data: { id: '1', name: 'x', target_repo: 'r' } });
      }),
    });
    const result = await client.createVillage({ name: 'x', target_repo: 'r' });
    expect(attempts).toBe(3);
    expect(result.id).toBe('1');
  });

  it('does not retry on 4xx', async () => {
    let attempts = 0;
    const client = new ThyraClient({
      retries: 2,
      fetchFn: mockFetch(() => {
        attempts++;
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }),
    });
    await expect(client.createVillage({ name: 'x', target_repo: 'r' }))
      .rejects.toBeInstanceOf(ThyraHttpError);
    expect(attempts).toBe(1);
  });

  it('retries on network error', async () => {
    let attempts = 0;
    const client = new ThyraClient({
      retries: 1,
      fetchFn: mockFetch(() => {
        attempts++;
        if (attempts < 2) throw new TypeError('fetch failed');
        return jsonResponse({ ok: true, data: { id: '1', name: 'x', target_repo: 'r' } });
      }),
    });
    const result = await client.createVillage({ name: 'x', target_repo: 'r' });
    expect(attempts).toBe(2);
    expect(result.id).toBe('1');
  });
});
