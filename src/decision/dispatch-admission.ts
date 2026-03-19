import type { Database } from 'bun:sqlite';
import type { DispatchAdmissionResult, AdmissionContext } from '../schemas/decision';

// ─── Constants ───

const COST_PER_MINUTE = 0.05;
const DEFAULT_BUDGET_LIMIT = 50.0;
const MAX_DISPATCHES_PER_HOUR = 20;
const MAX_CONCURRENT_PER_SKILL = 3;
const CONCURRENT_WINDOW_MINUTES = 30;

// ─── Permission Check ───

export function checkPermission(ctx: AdmissionContext): DispatchAdmissionResult {
  if (ctx.executionMode === 'destructive' && !ctx.userConfirmedDestructive) {
    return {
      admitted: false,
      reason: 'Destructive execution mode requires explicit user confirmation',
    };
  }

  const warnings: string[] = [];
  if (ctx.externalSideEffects) {
    warnings.push('Skill has external side effects');
  }

  return {
    admitted: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ─── Budget Check ───

export function checkBudget(db: Database, ctx: AdmissionContext): DispatchAdmissionResult {
  const budgetLimit = ctx.budgetLimit ?? DEFAULT_BUDGET_LIMIT;
  const estimatedCost = ctx.timeoutMinutes * COST_PER_MINUTE;

  const skillRunSpend = db
    .query(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM skill_runs
       WHERE skill_instance_id IN (
         SELECT id FROM skill_instances WHERE skill_id = ?
       )`,
    )
    .get(ctx.skillId) as Record<string, unknown> | null;

  const forgeSpend = db
    .query(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM forge_builds
       WHERE session_id = ?`,
    )
    .get(ctx.sessionId) as Record<string, unknown> | null;

  const totalSpent =
    (Number(skillRunSpend?.total) || 0) + (Number(forgeSpend?.total) || 0);

  if (totalSpent + estimatedCost > budgetLimit) {
    return {
      admitted: false,
      reason: `Budget exceeded: spent $${totalSpent.toFixed(2)} + estimated $${estimatedCost.toFixed(2)} > limit $${budgetLimit.toFixed(2)}`,
    };
  }

  return { admitted: true };
}

// ─── Rate Limit Check ───

export function checkRateLimit(db: Database, ctx: AdmissionContext): DispatchAdmissionResult {
  // System-wide dispatch rate: count all dispatches in last 60 minutes
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const recentDispatches = db
    .query(
      `SELECT COUNT(*) as cnt FROM skill_runs
       WHERE created_at > ? AND skill_instance_id IN (
         SELECT id FROM skill_instances
       )`,
    )
    .get(oneHourAgo) as Record<string, unknown> | null;

  const recentForgeBuilds = db
    .query(
      `SELECT COUNT(*) as cnt FROM forge_builds
       WHERE created_at > ?`,
    )
    .get(oneHourAgo) as Record<string, unknown> | null;

  const totalRecent =
    (Number(recentDispatches?.cnt) || 0) + (Number(recentForgeBuilds?.cnt) || 0);

  if (totalRecent >= MAX_DISPATCHES_PER_HOUR) {
    return {
      admitted: false,
      reason: `Rate limit exceeded: ${totalRecent} dispatches in the last hour (limit: ${MAX_DISPATCHES_PER_HOUR})`,
    };
  }

  // Per-skill concurrent: count recent dispatches for this specific skill within window
  const windowAgo = new Date(Date.now() - CONCURRENT_WINDOW_MINUTES * 60 * 1000).toISOString();

  const concurrentSkill = db
    .query(
      `SELECT COUNT(*) as cnt FROM skill_runs
       WHERE created_at > ? AND skill_instance_id IN (
         SELECT id FROM skill_instances WHERE skill_id = ?
       )`,
    )
    .get(windowAgo, ctx.skillId) as Record<string, unknown> | null;

  const concurrentCount = Number(concurrentSkill?.cnt) || 0;

  if (concurrentCount >= MAX_CONCURRENT_PER_SKILL) {
    return {
      admitted: false,
      reason: `Concurrent dispatch limit exceeded for skill "${ctx.skillName}": ${concurrentCount} active (limit: ${MAX_CONCURRENT_PER_SKILL})`,
    };
  }

  return { admitted: true };
}

// ─── Skill Readiness Check ───

export function checkSkillReadiness(ctx: AdmissionContext): DispatchAdmissionResult {
  if (ctx.skillStatus === 'promoted' || ctx.skillStatus === 'core') {
    return { admitted: true };
  }

  if (ctx.skillStatus === 'deprecated' || ctx.skillStatus === 'superseded') {
    return {
      admitted: false,
      reason: `Skill is ${ctx.skillStatus} and cannot be dispatched`,
    };
  }

  return {
    admitted: false,
    reason: `Only promoted skills can dispatch to Karvi. Current status: ${ctx.skillStatus}`,
  };
}

// ─── Orchestrator ───

export function checkDispatchAdmission(
  db: Database,
  ctx: AdmissionContext,
): DispatchAdmissionResult {
  const allWarnings: string[] = [];

  // 1. Permission check
  const permResult = checkPermission(ctx);
  if (!permResult.admitted) {
    recordAdmissionEvent(db, ctx, permResult);
    return permResult;
  }
  if (permResult.warnings) allWarnings.push(...permResult.warnings);

  // 2. Skill readiness check
  const readinessResult = checkSkillReadiness(ctx);
  if (!readinessResult.admitted) {
    recordAdmissionEvent(db, ctx, readinessResult);
    return readinessResult;
  }

  // 3. Budget check
  const budgetResult = checkBudget(db, ctx);
  if (!budgetResult.admitted) {
    recordAdmissionEvent(db, ctx, budgetResult);
    return budgetResult;
  }

  // 4. Rate limit check
  const rateResult = checkRateLimit(db, ctx);
  if (!rateResult.admitted) {
    recordAdmissionEvent(db, ctx, rateResult);
    return rateResult;
  }

  const finalResult: DispatchAdmissionResult = {
    admitted: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };

  recordAdmissionEvent(db, ctx, finalResult);
  return finalResult;
}

// ─── Event Recording ───

function recordAdmissionEvent(
  db: Database,
  ctx: AdmissionContext,
  result: DispatchAdmissionResult,
): void {
  const id = `evt_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO decision_events
     (id, session_id, event_type, object_type, object_id, payload_json, created_at)
     VALUES (?, ?, 'admission_checked', 'admission', ?, ?, ?)`,
    [
      id,
      ctx.sessionId,
      ctx.skillId,
      JSON.stringify({
        admitted: result.admitted,
        reason: result.reason,
        warnings: result.warnings,
        skillName: ctx.skillName,
        executionMode: ctx.executionMode,
        skillStatus: ctx.skillStatus,
      }),
      now,
    ],
  );
}
