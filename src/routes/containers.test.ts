import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { containerRoutes } from './containers';
import type { SkillLookup, SkillMatch } from '../skills/types';

// ─── Helpers ───

function createMockSkillLookup(matches: SkillMatch[] = []): SkillLookup {
  return {
    findMatching: () => matches,
  };
}

function createTestApp(skillLookup?: SkillLookup) {
  const app = new Hono();
  app.route('/', containerRoutes({ skillLookup: skillLookup ?? createMockSkillLookup() }));
  return app;
}

async function jsonPost(app: Hono, path: string, body: Record<string, unknown> = {}) {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tests ───

describe('containerRoutes', () => {
  describe('POST /api/containers/select', () => {
    it('requires userMessage', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/select', {});
      expect(res.status).toBe(400);
    });

    it('returns container selection for world keyword', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/select', {
        userMessage: 'Set up my workspace for the project',
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      const selection = data.selection as Record<string, unknown>;
      expect(selection.primary).toBe('world');
      expect(selection.confidence).toBe('high');
    });

    it('returns shape for exploratory messages', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/select', {
        userMessage: 'I want to explore some ideas about my business',
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      const selection = data.selection as Record<string, unknown>;
      expect(selection.primary).toBe('shape');
    });

    it('returns skill when matching skill found', async () => {
      const lookup = createMockSkillLookup([
        { skillId: 'skill.deploy', confidence: 'high', matchedTriggers: ['deploy'] },
      ]);
      const app = createTestApp(lookup);
      const res = await jsonPost(app, '/api/containers/select', {
        userMessage: 'deploy my service now',
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      const selection = data.selection as Record<string, unknown>;
      expect(selection.primary).toBe('skill');
      expect(selection.skillId).toBe('skill.deploy');
    });

    it('includes behavior in response', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/select', {
        userMessage: 'Set up my workspace',
      });
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      expect(data.behavior).toBeDefined();
    });

    it('accepts optional routing context fields', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/select', {
        userMessage: 'do some work',
        hasActiveWorld: true,
        conversationHistory: ['previous message'],
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      const selection = data.selection as Record<string, unknown>;
      // hasActiveWorld should route to world
      expect(selection.primary).toBe('world');
    });
  });

  describe('POST /api/containers/transition', () => {
    it('requires current, proposed, and reason', async () => {
      const app = createTestApp();

      let res = await jsonPost(app, '/api/containers/transition', { proposed: 'task', reason: 'test' });
      expect(res.status).toBe(400);

      res = await jsonPost(app, '/api/containers/transition', { current: 'shape', reason: 'test' });
      expect(res.status).toBe(400);

      res = await jsonPost(app, '/api/containers/transition', { current: 'shape', proposed: 'task' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid container names', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/transition', {
        current: 'invalid',
        proposed: 'task',
        reason: 'test',
      });
      expect(res.status).toBe(400);
    });

    it('allows valid transition shape → task', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/transition', {
        current: 'shape',
        proposed: 'task',
        reason: 'User wants bounded work',
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      expect(data.allowed).toBe(true);
      expect(data.newContainer).toBe('task');
    });

    it('rejects invalid transition task → world', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/transition', {
        current: 'task',
        proposed: 'world',
        reason: 'test',
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      expect(data.allowed).toBe(false);
      expect(data.newContainer).toBe('task');
    });

    it('allows same-container no-op transition', async () => {
      const app = createTestApp();
      const res = await jsonPost(app, '/api/containers/transition', {
        current: 'task',
        proposed: 'task',
        reason: 'No change needed',
      });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      expect(data.allowed).toBe(true);
    });
  });
});
