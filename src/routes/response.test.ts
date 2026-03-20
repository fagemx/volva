import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { ok, error } from './response';

// ─── Helpers ───

function createApp() {
  return new Hono();
}

// ─── ok() ───

describe('ok', () => {
  it('returns { ok: true, data } with status 200 by default', async () => {
    const app = createApp();
    app.get('/test', (c) => ok(c, { name: 'volva' }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { name: 'volva' } });
  });

  it('accepts a custom status code', async () => {
    const app = createApp();
    app.post('/test', (c) => ok(c, { id: '123' }, 201));

    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { id: '123' } });
  });

  it('works with a string data payload', async () => {
    const app = createApp();
    app.get('/test', (c) => ok(c, 'hello'));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: 'hello' });
  });

  it('works with a numeric data payload', async () => {
    const app = createApp();
    app.get('/test', (c) => ok(c, 42));

    const res = await app.request('/test');
    expect(await res.json()).toEqual({ ok: true, data: 42 });
  });

  it('works with an array data payload', async () => {
    const app = createApp();
    app.get('/test', (c) => ok(c, [1, 2, 3]));

    const res = await app.request('/test');
    expect(await res.json()).toEqual({ ok: true, data: [1, 2, 3] });
  });

  it('works with null data', async () => {
    const app = createApp();
    app.get('/test', (c) => ok(c, null));

    const res = await app.request('/test');
    expect(await res.json()).toEqual({ ok: true, data: null });
  });
});

// ─── error() ───

describe('error', () => {
  it('returns { ok: false, error: { code, message } } with status 400 by default', async () => {
    const app = createApp();
    app.get('/test', (c) => error(c, 'INVALID_INPUT', 'Missing field'));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Missing field' },
    });
  });

  it('accepts a custom status code', async () => {
    const app = createApp();
    app.get('/test', (c) => error(c, 'NOT_FOUND', 'Resource not found', 404));

    const res = await app.request('/test');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });

  it('works with 500 status code', async () => {
    const app = createApp();
    app.get('/test', (c) => error(c, 'INTERNAL_ERROR', 'Something went wrong', 500));

    const res = await app.request('/test');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
  });

  it('works with 422 status code', async () => {
    const app = createApp();
    app.get('/test', (c) => error(c, 'VALIDATION_ERROR', 'Invalid schema', 422));

    const res = await app.request('/test');
    expect(res.status).toBe(422);
  });
});
