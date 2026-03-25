import type { Database } from 'bun:sqlite';
import type { Regime } from '../schemas/decision';

export interface RunRecord {
  skillInstanceId: string;
  conversationId?: string;
  outcome: 'success' | 'failure' | 'partial';
  durationMs?: number;
  tokensUsed?: number;
  costUsd?: number;
  runtime?: string;
  model?: string;
  notes?: string;
}

export interface ForgeRunRecord {
  sessionId: string;
  regime: Regime;
  status: 'success' | 'failure' | 'partial';
  durationMs?: number;
  artifactCount: number;
  tokensUsed?: number;
  costUsd?: number;
  runtime?: string;
  model?: string;
  failedSteps?: string[];
}

export interface SkillMetrics {
  runCount: number;
  successCount: number;
  lastUsedAt: string | null;
  recentOutcomes: Array<{ outcome: string; createdAt: string }>;
}

export function recordRun(db: Database, run: RunRecord): string {
  const id = `run_${crypto.randomUUID()}`;

  db.prepare(
    `INSERT INTO skill_runs (id, skill_instance_id, conversation_id, outcome, duration_ms, tokens_used, cost_usd, runtime, model, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    run.skillInstanceId,
    run.conversationId ?? null,
    run.outcome,
    run.durationMs ?? null,
    run.tokensUsed ?? null,
    run.costUsd ?? null,
    run.runtime ?? null,
    run.model ?? null,
    run.notes ?? null,
  );

  const successIncrement = run.outcome === 'success' ? 1 : 0;
  db.prepare(
    `UPDATE skill_instances SET
      run_count = run_count + 1,
      success_count = success_count + ?,
      last_used_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?`,
  ).run(successIncrement, run.skillInstanceId);

  return id;
}

export function recordForgeBuild(db: Database, record: ForgeRunRecord): string {
  const id = `forge_${crypto.randomUUID()}`;

  const failedStepsJson = record.failedSteps && record.failedSteps.length > 0
    ? JSON.stringify(record.failedSteps)
    : null;

  db.prepare(
    `INSERT INTO forge_builds (id, session_id, regime, status, duration_ms, artifact_count, tokens_used, cost_usd, runtime, model, failed_steps_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    record.sessionId,
    record.regime,
    record.status,
    record.durationMs ?? null,
    record.artifactCount,
    record.tokensUsed ?? null,
    record.costUsd ?? null,
    record.runtime ?? null,
    record.model ?? null,
    failedStepsJson,
  );

  return id;
}

export function getMetrics(
  db: Database,
  skillInstanceId: string,
): SkillMetrics | null {
  const row = db
    .prepare(
      `SELECT run_count, success_count, last_used_at FROM skill_instances WHERE id = ?`,
    )
    .get(skillInstanceId) as Record<string, unknown> | null;

  if (!row) return null;

  const recentRuns = db
    .prepare(
      `SELECT outcome, created_at FROM skill_runs
       WHERE skill_instance_id = ?
       ORDER BY rowid DESC
       LIMIT 10`,
    )
    .all(skillInstanceId) as Array<Record<string, unknown>>;

  return {
    runCount: row.run_count as number,
    successCount: row.success_count as number,
    lastUsedAt: row.last_used_at as string | null,
    recentOutcomes: recentRuns.map((r) => ({
      outcome: r.outcome as string,
      createdAt: r.created_at as string,
    })),
  };
}
