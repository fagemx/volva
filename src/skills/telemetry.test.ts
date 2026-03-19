import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { recordRun, getMetrics } from './telemetry';

describe('telemetry', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name) VALUES (?, ?, ?)`,
    ).run('si-1', 'sk-abc', 'test-skill');
  });

  describe('recordRun', () => {
    it('increments run_count on success', () => {
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'success' });

      const row = db
        .prepare('SELECT run_count, success_count FROM skill_instances WHERE id = ?')
        .get('si-1') as Record<string, unknown>;

      expect(row.run_count).toBe(1);
      expect(row.success_count).toBe(1);
    });

    it('increments only run_count on failure', () => {
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'failure' });

      const row = db
        .prepare('SELECT run_count, success_count FROM skill_instances WHERE id = ?')
        .get('si-1') as Record<string, unknown>;

      expect(row.run_count).toBe(1);
      expect(row.success_count).toBe(0);
    });

    it('increments only run_count on partial', () => {
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'partial' });

      const row = db
        .prepare('SELECT run_count, success_count FROM skill_instances WHERE id = ?')
        .get('si-1') as Record<string, unknown>;

      expect(row.run_count).toBe(1);
      expect(row.success_count).toBe(0);
    });

    it('updates last_used_at on every run', () => {
      const beforeRow = db
        .prepare('SELECT last_used_at FROM skill_instances WHERE id = ?')
        .get('si-1') as Record<string, unknown>;
      expect(beforeRow.last_used_at).toBeNull();

      recordRun(db, { skillInstanceId: 'si-1', outcome: 'failure' });

      const afterRow = db
        .prepare('SELECT last_used_at FROM skill_instances WHERE id = ?')
        .get('si-1') as Record<string, unknown>;
      expect(afterRow.last_used_at).not.toBeNull();
    });

    it('accumulates counters across multiple runs', () => {
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'success' });
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'failure' });
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'success' });

      const row = db
        .prepare('SELECT run_count, success_count FROM skill_instances WHERE id = ?')
        .get('si-1') as Record<string, unknown>;

      expect(row.run_count).toBe(3);
      expect(row.success_count).toBe(2);
    });

    it('inserts a row into skill_runs', () => {
      const id = recordRun(db, {
        skillInstanceId: 'si-1',
        conversationId: 'conv-1',
        outcome: 'success',
        durationMs: 500,
        notes: 'test note',
      });

      const row = db
        .prepare('SELECT * FROM skill_runs WHERE id = ?')
        .get(id) as Record<string, unknown>;

      expect(row.skill_instance_id).toBe('si-1');
      expect(row.conversation_id).toBe('conv-1');
      expect(row.outcome).toBe('success');
      expect(row.duration_ms).toBe(500);
      expect(row.notes).toBe('test note');
    });

    it('returns a run id starting with run_', () => {
      const id = recordRun(db, { skillInstanceId: 'si-1', outcome: 'success' });
      expect(id).toMatch(/^run_/);
    });
  });

  describe('getMetrics', () => {
    it('returns null for non-existing instance', () => {
      const metrics = getMetrics(db, 'non-existing');
      expect(metrics).toBeNull();
    });

    it('returns zero counters for fresh instance', () => {
      const metrics = getMetrics(db, 'si-1');
      expect(metrics).not.toBeNull();
      expect(metrics!.runCount).toBe(0);
      expect(metrics!.successCount).toBe(0);
      expect(metrics!.lastUsedAt).toBeNull();
      expect(metrics!.recentOutcomes).toEqual([]);
    });

    it('returns correct counters after runs', () => {
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'success' });
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'failure' });

      const metrics = getMetrics(db, 'si-1');
      expect(metrics!.runCount).toBe(2);
      expect(metrics!.successCount).toBe(1);
      expect(metrics!.lastUsedAt).not.toBeNull();
    });

    it('returns recent outcomes in descending order', () => {
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'success' });
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'failure' });
      recordRun(db, { skillInstanceId: 'si-1', outcome: 'partial' });

      const metrics = getMetrics(db, 'si-1');
      expect(metrics!.recentOutcomes).toHaveLength(3);
      // Most recent first
      expect(metrics!.recentOutcomes[0].outcome).toBe('partial');
      expect(metrics!.recentOutcomes[1].outcome).toBe('failure');
      expect(metrics!.recentOutcomes[2].outcome).toBe('success');
    });

    it('returns at most 10 recent outcomes', () => {
      for (let i = 0; i < 15; i++) {
        recordRun(db, { skillInstanceId: 'si-1', outcome: 'success' });
      }

      const metrics = getMetrics(db, 'si-1');
      expect(metrics!.runCount).toBe(15);
      expect(metrics!.recentOutcomes).toHaveLength(10);
    });
  });
});
