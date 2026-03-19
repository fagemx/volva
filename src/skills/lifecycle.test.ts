import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { advanceStage } from './lifecycle';
import type { LifecycleStage } from '../schemas/skill-object';

describe('lifecycle DB tables', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('creates skill_instances table', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_instances'",
      )
      .get() as Record<string, unknown> | null;
    expect(row).not.toBeNull();
    expect(row!.name).toBe('skill_instances');
  });

  it('creates skill_runs table', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_runs'",
      )
      .get() as Record<string, unknown> | null;
    expect(row).not.toBeNull();
    expect(row!.name).toBe('skill_runs');
  });

  it('inserts and queries a skill_instance', () => {
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name) VALUES (?, ?, ?)`,
    ).run('si-1', 'sk-abc', 'test-skill');

    const row = db
      .prepare('SELECT * FROM skill_instances WHERE id = ?')
      .get('si-1') as Record<string, unknown> | null;

    expect(row).not.toBeNull();
    expect(row!.skill_id).toBe('sk-abc');
    expect(row!.name).toBe('test-skill');
    expect(row!.status).toBe('draft');
    expect(row!.current_stage).toBe('capture');
    expect(row!.run_count).toBe(0);
    expect(row!.success_count).toBe(0);
  });

  it('inserts a skill_run with FK to skill_instance', () => {
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name) VALUES (?, ?, ?)`,
    ).run('si-1', 'sk-abc', 'test-skill');

    db.prepare(
      `INSERT INTO skill_runs (id, skill_instance_id, conversation_id, outcome, duration_ms) VALUES (?, ?, ?, ?, ?)`,
    ).run('sr-1', 'si-1', 'conv-1', 'success', 1200);

    const row = db
      .prepare('SELECT * FROM skill_runs WHERE id = ?')
      .get('sr-1') as Record<string, unknown> | null;

    expect(row).not.toBeNull();
    expect(row!.skill_instance_id).toBe('si-1');
    expect(row!.outcome).toBe('success');
    expect(row!.duration_ms).toBe(1200);
  });

  it('rejects invalid status in skill_instances', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO skill_instances (id, skill_id, name, status) VALUES (?, ?, ?, ?)`,
      ).run('si-bad', 'sk-abc', 'bad', 'invalid_status');
    }).toThrow();
  });

  it('rejects invalid outcome in skill_runs', () => {
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name) VALUES (?, ?, ?)`,
    ).run('si-1', 'sk-abc', 'test-skill');

    expect(() => {
      db.prepare(
        `INSERT INTO skill_runs (id, skill_instance_id, outcome) VALUES (?, ?, ?)`,
      ).run('sr-bad', 'si-1', 'unknown');
    }).toThrow();
  });
});

describe('advanceStage', () => {
  const stages: LifecycleStage[] = [
    'capture',
    'crystallize',
    'package',
    'route',
    'execute',
    'verify',
    'learn',
    'govern',
  ];

  it('allows forward progression for each consecutive pair', () => {
    for (let i = 0; i < stages.length - 1; i++) {
      const result = advanceStage(stages[i], stages[i + 1]);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Advanced from');
    }
  });

  it('allows cyclic: learn -> execute', () => {
    const result = advanceStage('learn', 'execute');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Cyclic');
  });

  it('allows govern -> execute re-entry', () => {
    const result = advanceStage('govern', 'execute');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('governance');
  });

  it('allows full cyclic loop: execute -> verify -> learn -> execute', () => {
    const r1 = advanceStage('execute', 'verify');
    expect(r1.allowed).toBe(true);

    const r2 = advanceStage('verify', 'learn');
    expect(r2.allowed).toBe(true);

    const r3 = advanceStage('learn', 'execute');
    expect(r3.allowed).toBe(true);
  });

  it('rejects skipping stages: capture -> execute', () => {
    const result = advanceStage('capture', 'execute');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cannot transition');
  });

  it('rejects backward non-cyclic: verify -> capture', () => {
    const result = advanceStage('verify', 'capture');
    expect(result.allowed).toBe(false);
  });

  it('rejects same stage: execute -> execute', () => {
    const result = advanceStage('execute', 'execute');
    expect(result.allowed).toBe(false);
  });

  it('rejects backward: package -> crystallize', () => {
    const result = advanceStage('package', 'crystallize');
    expect(result.allowed).toBe(false);
  });

  it('rejects skipping from route to govern', () => {
    const result = advanceStage('route', 'govern');
    expect(result.allowed).toBe(false);
  });
});
