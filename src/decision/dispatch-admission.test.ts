import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import type { AdmissionContext } from '../schemas/decision';
import {
  checkPermission,
  checkBudget,
  checkRateLimit,
  checkSkillReadiness,
  checkDispatchAdmission,
} from './dispatch-admission';

// ─── Helpers ───

function makeContext(overrides?: Partial<AdmissionContext>): AdmissionContext {
  return {
    sessionId: 'ds_test-session',
    userId: 'user-1',
    skillId: 'skill.test',
    skillName: 'test-skill',
    skillStatus: 'promoted',
    executionMode: 'active',
    externalSideEffects: false,
    timeoutMinutes: 10,
    ...overrides,
  };
}

function seedDecisionSession(db: Database, sessionId: string): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO decision_sessions (id, stage, status, created_at, updated_at)
     VALUES (?, 'routing', 'active', ?, ?)`,
    [sessionId, now, now],
  );
}

function seedSkillInstance(db: Database, skillId: string, instanceId: string): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO skill_instances (id, skill_id, name, status, current_stage, created_at, updated_at)
     VALUES (?, ?, 'test', 'promoted', 'execute', ?, ?)`,
    [instanceId, skillId, now, now],
  );
}

function seedSkillRun(db: Database, instanceId: string, costUsd: number, createdAt?: string): void {
  const id = `run_${crypto.randomUUID()}`;
  const now = createdAt ?? new Date().toISOString();
  db.run(
    `INSERT INTO skill_runs (id, skill_instance_id, outcome, cost_usd, created_at)
     VALUES (?, ?, 'success', ?, ?)`,
    [id, instanceId, costUsd, now],
  );
}

function seedForgeBuild(db: Database, sessionId: string, costUsd: number, createdAt?: string): void {
  const id = `fb_${crypto.randomUUID()}`;
  const now = createdAt ?? new Date().toISOString();
  db.run(
    `INSERT INTO forge_builds (id, session_id, regime, status, cost_usd, created_at)
     VALUES (?, ?, 'economic', 'success', ?, ?)`,
    [id, sessionId, costUsd, now],
  );
}

// ─── Tests ───

describe('dispatch-admission', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    seedDecisionSession(db, 'ds_test-session');
  });

  // ─── Permission Checks ───

  describe('checkPermission', () => {
    it('rejects destructive mode without user confirmation', () => {
      const result = checkPermission(makeContext({
        executionMode: 'destructive',
        userConfirmedDestructive: false,
      }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Destructive execution mode');
    });

    it('admits destructive mode with user confirmation', () => {
      const result = checkPermission(makeContext({
        executionMode: 'destructive',
        userConfirmedDestructive: true,
      }));
      expect(result.admitted).toBe(true);
    });

    it('admits active mode without issues', () => {
      const result = checkPermission(makeContext({ executionMode: 'active' }));
      expect(result.admitted).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('admits with warning when external side effects present', () => {
      const result = checkPermission(makeContext({ externalSideEffects: true }));
      expect(result.admitted).toBe(true);
      expect(result.warnings).toContain('Skill has external side effects');
    });

    it('admits advisory mode', () => {
      const result = checkPermission(makeContext({ executionMode: 'advisory' }));
      expect(result.admitted).toBe(true);
    });
  });

  // ─── Budget Checks ───

  describe('checkBudget', () => {
    it('admits when under budget', () => {
      const result = checkBudget(db, makeContext({ timeoutMinutes: 10 }));
      expect(result.admitted).toBe(true);
    });

    it('rejects when over budget', () => {
      seedSkillInstance(db, 'skill.test', 'inst-1');
      // Seed $48 of spend, with 10 min * $0.05 = $0.50 estimated, total $48.50 under $50
      seedSkillRun(db, 'inst-1', 48.0);

      // Now add more spend to push over
      seedSkillRun(db, 'inst-1', 2.0);

      // With $50 spent and $0.50 estimated = $50.50 > $50 limit
      const result = checkBudget(db, makeContext({ timeoutMinutes: 10 }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Budget exceeded');
    });

    it('admits with zero spend', () => {
      const result = checkBudget(db, makeContext());
      expect(result.admitted).toBe(true);
    });

    it('considers forge build spend', () => {
      seedForgeBuild(db, 'ds_test-session', 49.0);

      // $49 spent + $0.50 estimated = $49.50 < $50 → still under
      const result = checkBudget(db, makeContext({ timeoutMinutes: 10 }));
      expect(result.admitted).toBe(true);

      // Add more to go over
      seedForgeBuild(db, 'ds_test-session', 1.0);

      // $50 spent + $0.50 estimated = $50.50 > $50
      const result2 = checkBudget(db, makeContext({ timeoutMinutes: 10 }));
      expect(result2.admitted).toBe(false);
    });

    it('respects custom budget limit', () => {
      seedSkillInstance(db, 'skill.test', 'inst-1');
      seedSkillRun(db, 'inst-1', 8.0);

      // $8 spent + $0.50 estimated = $8.50 < $10
      const result = checkBudget(db, makeContext({ budgetLimit: 10, timeoutMinutes: 10 }));
      expect(result.admitted).toBe(true);

      seedSkillRun(db, 'inst-1', 2.0);

      // $10 spent + $0.50 estimated = $10.50 > $10
      const result2 = checkBudget(db, makeContext({ budgetLimit: 10, timeoutMinutes: 10 }));
      expect(result2.admitted).toBe(false);
    });
  });

  // ─── Rate Limit Checks ───

  describe('checkRateLimit', () => {
    it('admits when under rate limit', () => {
      const result = checkRateLimit(db, makeContext());
      expect(result.admitted).toBe(true);
    });

    it('rejects when per-user rate limit exceeded', () => {
      seedSkillInstance(db, 'skill.other', 'inst-other');
      for (let i = 0; i < 20; i++) {
        seedSkillRun(db, 'inst-other', 0.1);
      }

      const result = checkRateLimit(db, makeContext());
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('rejects when per-skill concurrent limit exceeded', () => {
      seedSkillInstance(db, 'skill.test', 'inst-1');
      for (let i = 0; i < 3; i++) {
        seedSkillRun(db, 'inst-1', 0.1);
      }

      const result = checkRateLimit(db, makeContext());
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Concurrent dispatch limit exceeded');
    });

    it('ignores old dispatches outside the hour window', () => {
      seedSkillInstance(db, 'skill.other', 'inst-other');
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      for (let i = 0; i < 25; i++) {
        seedSkillRun(db, 'inst-other', 0.1, twoHoursAgo);
      }

      const result = checkRateLimit(db, makeContext());
      expect(result.admitted).toBe(true);
    });
  });

  // ─── Skill Readiness Checks ───

  describe('checkSkillReadiness', () => {
    it('admits promoted skills', () => {
      const result = checkSkillReadiness(makeContext({ skillStatus: 'promoted' }));
      expect(result.admitted).toBe(true);
    });

    it('admits core skills', () => {
      const result = checkSkillReadiness(makeContext({ skillStatus: 'core' }));
      expect(result.admitted).toBe(true);
    });

    it('rejects draft skills', () => {
      const result = checkSkillReadiness(makeContext({ skillStatus: 'draft' }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Only promoted skills');
    });

    it('rejects sandbox skills', () => {
      const result = checkSkillReadiness(makeContext({ skillStatus: 'sandbox' }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Only promoted skills');
    });

    it('rejects deprecated skills', () => {
      const result = checkSkillReadiness(makeContext({ skillStatus: 'deprecated' }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('deprecated');
    });

    it('rejects superseded skills', () => {
      const result = checkSkillReadiness(makeContext({ skillStatus: 'superseded' }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('superseded');
    });
  });

  // ─── Orchestrator ───

  describe('checkDispatchAdmission', () => {
    it('admits when all checks pass', () => {
      const result = checkDispatchAdmission(db, makeContext());
      expect(result.admitted).toBe(true);
    });

    it('rejects on permission failure (destructive without confirmation)', () => {
      const result = checkDispatchAdmission(db, makeContext({
        executionMode: 'destructive',
      }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Destructive');
    });

    it('rejects on skill readiness failure', () => {
      const result = checkDispatchAdmission(db, makeContext({ skillStatus: 'draft' }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Only promoted skills');
    });

    it('rejects on budget failure', () => {
      seedSkillInstance(db, 'skill.test', 'inst-1');
      seedSkillRun(db, 'inst-1', 50.0);

      const result = checkDispatchAdmission(db, makeContext({ timeoutMinutes: 10 }));
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Budget exceeded');
    });

    it('rejects on rate limit failure', () => {
      seedSkillInstance(db, 'skill.other', 'inst-other');
      for (let i = 0; i < 20; i++) {
        seedSkillRun(db, 'inst-other', 0.1);
      }

      const result = checkDispatchAdmission(db, makeContext());
      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('aggregates warnings from all checks', () => {
      const result = checkDispatchAdmission(db, makeContext({
        externalSideEffects: true,
      }));
      expect(result.admitted).toBe(true);
      expect(result.warnings).toContain('Skill has external side effects');
    });

    it('records admission event to decision_events', () => {
      checkDispatchAdmission(db, makeContext());

      const events = db
        .query("SELECT * FROM decision_events WHERE event_type = 'admission_checked'")
        .all() as Record<string, unknown>[];
      expect(events.length).toBe(1);

      const payload = JSON.parse(events[0].payload_json as string) as Record<string, unknown>;
      expect(payload.admitted).toBe(true);
      expect(payload.skillName).toBe('test-skill');
    });

    it('records rejection event with reason', () => {
      checkDispatchAdmission(db, makeContext({ skillStatus: 'draft' }));

      const events = db
        .query("SELECT * FROM decision_events WHERE event_type = 'admission_checked'")
        .all() as Record<string, unknown>[];
      expect(events.length).toBe(1);

      const payload = JSON.parse(events[0].payload_json as string) as Record<string, unknown>;
      expect(payload.admitted).toBe(false);
      expect(payload.reason).toContain('Only promoted skills');
    });
  });

  describe('schema indexes', () => {
    it('creates indexes on skill_runs.created_at and forge_builds.created_at', () => {
      const indexes = db
        .query(
          `SELECT name, tbl_name FROM sqlite_master
           WHERE type = 'index' AND name IN ('idx_skill_runs_created', 'idx_forge_builds_created')
           ORDER BY name`,
        )
        .all() as Record<string, unknown>[];

      expect(indexes).toHaveLength(2);
      expect(indexes[0].name).toBe('idx_forge_builds_created');
      expect(indexes[0].tbl_name).toBe('forge_builds');
      expect(indexes[1].name).toBe('idx_skill_runs_created');
      expect(indexes[1].tbl_name).toBe('skill_runs');
    });
  });
});
