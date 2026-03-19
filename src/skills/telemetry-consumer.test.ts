import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import type { SkillDispatchResult, ForgeBuildResult } from '../karvi-client/schemas';
import { consumeSkillResult, consumeForgeResult } from './telemetry-consumer';
import { getMetrics } from './telemetry';

function makeSkillResult(
  overrides: Partial<SkillDispatchResult> = {},
): SkillDispatchResult {
  return {
    skillId: 'skill.test',
    status: 'success',
    durationMs: 1500,
    steps: [
      { stepId: 'step-1', type: 'execute', status: 'success', artifacts: [] },
    ],
    outputs: { result: 'done' },
    verification: { smokeChecksPassed: true, failedChecks: [] },
    telemetry: {
      tokensUsed: 8000,
      costUsd: 0.024,
      runtime: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      stepsExecuted: 1,
    },
    ...overrides,
  };
}

function makeForgeResult(
  overrides: Partial<ForgeBuildResult> = {},
): ForgeBuildResult {
  return {
    sessionId: 'sess-1',
    status: 'success',
    durationMs: 5000,
    artifacts: [
      { type: 'file', path: '/src/main.ts', description: 'Main entry' },
      { type: 'pr', path: '#42', description: 'Pull request' },
    ],
    steps: [
      { stepId: 'step-1', type: 'build', status: 'success', artifacts: ['/src/main.ts'] },
    ],
    telemetry: {
      tokensUsed: 20000,
      costUsd: 0.08,
      runtime: 'karvi-worker',
      model: 'claude-sonnet-4-20250514',
      stepsExecuted: 1,
    },
    ...overrides,
  };
}

describe('telemetry-consumer', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name) VALUES (?, ?, ?)`,
    ).run('si-1', 'sk-abc', 'test-skill');
    db.prepare(
      `INSERT INTO decision_sessions (id, stage) VALUES (?, ?)`,
    ).run('sess-1', 'routing');
  });

  describe('consumeSkillResult', () => {
    it('records a successful skill run', () => {
      const result = consumeSkillResult(db, 'si-1', makeSkillResult());

      expect(result.runId).toMatch(/^run_/);
      expect(result.outcome).toBe('success');
      expect(result.escalate).toBe(false);
    });

    it('updates skill_instances counters', () => {
      consumeSkillResult(db, 'si-1', makeSkillResult());

      const metrics = getMetrics(db, 'si-1');
      expect(metrics!.runCount).toBe(1);
      expect(metrics!.successCount).toBe(1);
      expect(metrics!.lastUsedAt).not.toBeNull();
    });

    it('stores token and cost data in skill_runs', () => {
      const { runId } = consumeSkillResult(db, 'si-1', makeSkillResult());

      const row = db
        .prepare('SELECT tokens_used, cost_usd, runtime, model FROM skill_runs WHERE id = ?')
        .get(runId) as Record<string, unknown>;

      expect(row.tokens_used).toBe(8000);
      expect(row.cost_usd).toBe(0.024);
      expect(row.runtime).toBe('claude-code');
      expect(row.model).toBe('claude-sonnet-4-20250514');
    });

    it('maps cancelled status to failure', () => {
      const result = consumeSkillResult(
        db,
        'si-1',
        makeSkillResult({ status: 'cancelled' }),
      );

      expect(result.outcome).toBe('failure');

      const metrics = getMetrics(db, 'si-1');
      expect(metrics!.runCount).toBe(1);
      expect(metrics!.successCount).toBe(0);
    });

    it('returns escalate true when failure + escalationOnFailure', () => {
      const result = consumeSkillResult(
        db,
        'si-1',
        makeSkillResult({ status: 'failure' }),
        { escalationOnFailure: true },
      );

      expect(result.outcome).toBe('failure');
      expect(result.escalate).toBe(true);
    });

    it('returns escalate true when partial + escalationOnFailure', () => {
      const result = consumeSkillResult(
        db,
        'si-1',
        makeSkillResult({ status: 'partial' }),
        { escalationOnFailure: true },
      );

      expect(result.outcome).toBe('partial');
      expect(result.escalate).toBe(true);
    });

    it('returns escalate false when success + escalationOnFailure', () => {
      const result = consumeSkillResult(
        db,
        'si-1',
        makeSkillResult({ status: 'success' }),
        { escalationOnFailure: true },
      );

      expect(result.outcome).toBe('success');
      expect(result.escalate).toBe(false);
    });

    it('records notes with failed steps on partial', () => {
      const result = consumeSkillResult(
        db,
        'si-1',
        makeSkillResult({
          status: 'partial',
          steps: [
            { stepId: 'step-1', type: 'build', status: 'success', artifacts: [] },
            { stepId: 'step-2', type: 'deploy', status: 'failure', artifacts: [] },
            { stepId: 'step-3', type: 'verify', status: 'failure', artifacts: [] },
          ],
        }),
      );

      const row = db
        .prepare('SELECT notes FROM skill_runs WHERE id = ?')
        .get(result.runId) as Record<string, unknown>;

      expect(row.notes).toBe('Failed steps: step-2: deploy, step-3: verify');
    });

    it('passes conversationId through to the run record', () => {
      const { runId } = consumeSkillResult(
        db,
        'si-1',
        makeSkillResult(),
        { conversationId: 'conv-42' },
      );

      const row = db
        .prepare('SELECT conversation_id FROM skill_runs WHERE id = ?')
        .get(runId) as Record<string, unknown>;

      expect(row.conversation_id).toBe('conv-42');
    });

    it('accumulates counters across multiple consumes', () => {
      consumeSkillResult(db, 'si-1', makeSkillResult({ status: 'success' }));
      consumeSkillResult(db, 'si-1', makeSkillResult({ status: 'failure' }));
      consumeSkillResult(db, 'si-1', makeSkillResult({ status: 'success' }));

      const metrics = getMetrics(db, 'si-1');
      expect(metrics!.runCount).toBe(3);
      expect(metrics!.successCount).toBe(2);
    });
  });

  describe('consumeForgeResult', () => {
    it('records a successful forge build', () => {
      const result = consumeForgeResult(db, makeForgeResult(), 'economic');

      expect(result.buildId).toMatch(/^forge_/);
      expect(result.outcome).toBe('success');
    });

    it('stores telemetry data in forge_builds', () => {
      const { buildId } = consumeForgeResult(db, makeForgeResult(), 'economic');

      const row = db
        .prepare('SELECT * FROM forge_builds WHERE id = ?')
        .get(buildId) as Record<string, unknown>;

      expect(row.session_id).toBe('sess-1');
      expect(row.regime).toBe('economic');
      expect(row.status).toBe('success');
      expect(row.duration_ms).toBe(5000);
      expect(row.artifact_count).toBe(2);
      expect(row.tokens_used).toBe(20000);
      expect(row.cost_usd).toBe(0.08);
      expect(row.runtime).toBe('karvi-worker');
      expect(row.model).toBe('claude-sonnet-4-20250514');
    });

    it('records failed steps on failure', () => {
      const { buildId } = consumeForgeResult(
        db,
        makeForgeResult({
          status: 'failure',
          steps: [
            { stepId: 'step-1', type: 'build', status: 'success', artifacts: [] },
            { stepId: 'step-2', type: 'deploy', status: 'failure', artifacts: [] },
          ],
        }),
        'governance',
      );

      const row = db
        .prepare('SELECT failed_steps_json, status FROM forge_builds WHERE id = ?')
        .get(buildId) as Record<string, unknown>;

      expect(row.status).toBe('failure');
      expect(JSON.parse(row.failed_steps_json as string)).toEqual(['step-2: deploy']);
    });

    it('records partial builds with artifact count', () => {
      const { buildId, outcome } = consumeForgeResult(
        db,
        makeForgeResult({
          status: 'partial',
          artifacts: [
            { type: 'file', path: '/src/a.ts', description: 'File A' },
          ],
        }),
        'capability',
      );

      expect(outcome).toBe('partial');

      const row = db
        .prepare('SELECT artifact_count FROM forge_builds WHERE id = ?')
        .get(buildId) as Record<string, unknown>;

      expect(row.artifact_count).toBe(1);
    });

    it('links to decision session via session_id', () => {
      const { buildId } = consumeForgeResult(db, makeForgeResult(), 'economic');

      const row = db
        .prepare('SELECT session_id FROM forge_builds WHERE id = ?')
        .get(buildId) as Record<string, unknown>;

      expect(row.session_id).toBe('sess-1');

      // Verify the session exists
      const session = db
        .prepare('SELECT id FROM decision_sessions WHERE id = ?')
        .get(row.session_id as string) as Record<string, unknown> | null;

      expect(session).not.toBeNull();
    });
  });
});
