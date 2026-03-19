import type { Database } from 'bun:sqlite';

export interface RunRecord {
  skillInstanceId: string;
  conversationId?: string;
  outcome: 'success' | 'failure' | 'partial';
  durationMs?: number;
  notes?: string;
}

export interface SkillMetrics {
  runCount: number;
  successCount: number;
  lastUsedAt: string | null;
  recentOutcomes: Array<{ outcome: string; createdAt: string }>;
}

export function recordRun(db: Database, run: RunRecord): string {
  const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(
    `INSERT INTO skill_runs (id, skill_instance_id, conversation_id, outcome, duration_ms, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    run.skillInstanceId,
    run.conversationId ?? null,
    run.outcome,
    run.durationMs ?? null,
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
